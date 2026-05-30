/**
 * Office 文書テキスト抽出モジュール（Round 6）
 *
 * - .docx: mammoth.extractRawText()
 * - .xlsx: exceljs でシート・セルを反復
 * - .pptx: jszip + XML 解析で <a:t> タグからテキスト取得
 *
 * FR-015: 抽出テキストは返却値のみに存在し、ログ・ファイルに書き出さない
 */

import { promises as fs } from 'node:fs';
import mammoth from 'mammoth';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import type { Config } from '../config/schema.js';
import type { ExtractedText } from '../types/index.js';

// pptx スライド XML から <a:t> タグのテキストを抽出する正規表現
const A_T_REGEX = /<a:t[^>]*>([^<]*)<\/a:t>/g;

/**
 * 3行超の連続改行を 2行に正規化する
 */
function normalizeNewlines(text: string): string {
  return text.replace(/\n{3,}/g, '\n\n');
}

/**
 * maxChars を超える場合は先頭で切り捨て truncationWarning を返す
 */
function applyMaxChars(
  text: string,
  maxChars: number,
): { text: string; truncationWarning?: string } {
  if (text.length <= maxChars) {
    return { text };
  }
  return {
    text: text.slice(0, maxChars),
    truncationWarning: `テキストが maxChars(${maxChars}) を超えたため先頭 ${maxChars} 文字に切り捨てました`,
  };
}

// ──────────────────────────────────────────────
// extractDocx
// ──────────────────────────────────────────────

/**
 * .docx ファイルからテキストを抽出する。
 * mammoth.extractRawText() で段落・表のプレーンテキストを取得する。
 */
export async function extractDocx(filePath: string, config: Config): Promise<ExtractedText> {
  const result = await mammoth.extractRawText({ path: filePath });
  const normalized = normalizeNewlines(result.value);
  const { text, truncationWarning } = applyMaxChars(normalized, config.maxChars);

  return {
    filePath,
    text,
    charCount: text.length,
    ...(truncationWarning ? { truncationWarning } : {}),
  };
}

// ──────────────────────────────────────────────
// extractXlsx
// ──────────────────────────────────────────────

/**
 * .xlsx ファイルからテキストを抽出する。
 * 全シートの全行・全セルを反復し、テキスト化して結合する。
 * - 数値: String(cell.value)
 * - 数式: String(cell.model.result ?? '')
 * - 空セル: スキップ
 */
export async function extractXlsx(filePath: string, config: Config): Promise<ExtractedText> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);

  const parts: string[] = [];

  workbook.eachSheet((sheet) => {
    sheet.eachRow((row) => {
      const cells: string[] = [];
      row.eachCell({ includeEmpty: false }, (cell) => {
        let value = '';
        if (cell.type === ExcelJS.ValueType.Formula) {
          value = String((cell.model as { result?: unknown }).result ?? '');
        } else {
          value = String(cell.value ?? '');
        }
        if (value.trim() !== '') {
          cells.push(value);
        }
      });
      if (cells.length > 0) {
        parts.push(cells.join('\t'));
      }
    });
  });

  const raw = parts.join('\n');
  const { text, truncationWarning } = applyMaxChars(raw, config.maxChars);

  return {
    filePath,
    text,
    charCount: text.length,
    ...(truncationWarning ? { truncationWarning } : {}),
  };
}

// ──────────────────────────────────────────────
// extractPptx
// ──────────────────────────────────────────────

/**
 * pptx の presentation.xml から <p:sldIdLst> を解析してスライド順序を取得する
 */
function parseSlideOrder(presentationXml: string): number[] {
  const ids: number[] = [];
  // <p:sldId id="..." r:id="rId..."/> の r:id 順番をスライド番号として使う
  // より単純に: ppt/slides/slide{n}.xml が存在する番号を 1 から順に列挙
  // ここでは presentation.xml 内の r:id="rId{N}" の N を順序として使う
  const rIdRegex = /r:id="rId(\d+)"/g;
  let match: RegExpExecArray | null;
  while ((match = rIdRegex.exec(presentationXml)) !== null) {
    ids.push(Number(match[1]));
  }
  return ids;
}

/**
 * ZIP 内の XML ファイルからテキストを抽出する（<a:t> タグ）
 */
async function extractTextFromXml(file: JSZip.JSZipObject): Promise<string> {
  const xml = await file.async('text');
  const parts: string[] = [];
  let m: RegExpExecArray | null;
  const re = new RegExp(A_T_REGEX.source, 'g');
  while ((m = re.exec(xml)) !== null) {
    const t = m[1].trim();
    if (t) {
      parts.push(t);
    }
  }
  return parts.join(' ');
}

/**
 * .pptx ファイルからテキストを抽出する。
 * ppt/presentation.xml でスライド順序を確定し、
 * 各スライド本文 (ppt/slides/slide{n}.xml) と
 * ノート (ppt/notesSlides/notesSlide{n}.xml) からテキストを取得する。
 * スライドマスター・レイアウトは除外する。
 */
export async function extractPptx(filePath: string, config: Config): Promise<ExtractedText> {
  const buffer = await fs.readFile(filePath);
  const zip = await JSZip.loadAsync(buffer);

  // スライド番号を昇順で列挙（presentation.xml の順序に依存せず単純に番号順）
  const slideFiles = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((a, b) => {
      const na = Number(a.match(/(\d+)/)?.[1] ?? 0);
      const nb = Number(b.match(/(\d+)/)?.[1] ?? 0);
      return na - nb;
    });

  const parts: string[] = [];

  for (const slideName of slideFiles) {
    const slideFile = zip.file(slideName);
    if (!slideFile) continue;

    const slideText = await extractTextFromXml(slideFile);
    if (slideText) {
      parts.push(slideText);
    }

    // ノートスライド（存在する場合のみ）
    const noteNum = slideName.match(/(\d+)/)?.[1];
    if (noteNum) {
      const noteName = `ppt/notesSlides/notesSlide${noteNum}.xml`;
      const noteFile = zip.file(noteName);
      if (noteFile) {
        const noteText = await extractTextFromXml(noteFile);
        if (noteText) {
          parts.push(noteText);
        }
      }
    }
  }

  const raw = parts.join('\n');
  const { text, truncationWarning } = applyMaxChars(raw, config.maxChars);

  return {
    filePath,
    text,
    charCount: text.length,
    ...(truncationWarning ? { truncationWarning } : {}),
  };
}
