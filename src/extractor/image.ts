import { readFile, stat } from 'node:fs/promises';
import { extname } from 'node:path';
import OpenAI from 'openai';
import type { Config } from '../config/schema.js';
import type { ExtractedText } from '../types/index.js';

/** 拡張子 → MIME タイプのマッピング（v1 保証対象: .png / .jpg / .jpeg） */
const MIME_MAP: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
};

/** OCR テキスト抽出専用プロンプト（分類プロンプトとは分離 — 憲法 IV 準拠） */
const OCR_PROMPT =
  'この画像に含まれるすべてのテキストを抽出してください。テキストのみを返し、説明・補足は不要です。';

/**
 * 画像ファイルから OpenAI Vision API を使ってテキストを OCR 抽出する。
 *
 * @throws {Error} maxImageSizeMB 超過・fs エラー・API エラー — すべて Queue 層へ伝播させる（FR-007）
 */
export async function extractImage(filePath: string, config: Config): Promise<ExtractedText> {
  // ① ファイルサイズチェック（FR-006）
  const stats = await stat(filePath);
  const sizeMB = stats.size / (1024 * 1024);
  if (sizeMB > config.maxImageSizeMB) {
    throw new Error(
      `画像ファイルサイズ (${sizeMB.toFixed(2)} MB) が maxImageSizeMB (${config.maxImageSizeMB} MB) を超えています: ${filePath}`,
    );
  }

  // ② ファイル読み込み → base64 変換
  const buffer = await readFile(filePath);
  const base64 = buffer.toString('base64');
  const mime = MIME_MAP[extname(filePath).toLowerCase()] ?? 'image/png';
  const dataUrl = `data:${mime};base64,${base64}`;

  // ③ OpenAI Vision API 呼び出し
  const client = new OpenAI({ apiKey: process.env['OPENAI_API_KEY'] });
  const response = await client.chat.completions.create(
    {
      model: config.model,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: dataUrl } },
            { type: 'text', text: OCR_PROMPT },
          ],
        },
      ],
      max_tokens: 4096,
    },
    { timeout: config.apiTimeoutMs },
  );

  // ④ レスポンステキスト取得 + 正規化（FR-002 / Q4）
  const raw = response.choices[0]?.message?.content ?? '';
  // FR-008: raw テキストはこの関数外でログに書き出してはならない
  const normalized = raw.trim().replace(/\n{3,}/g, '\n\n');

  // ⑤ maxChars 切り捨て（FR-003）
  if (normalized.length <= config.maxChars) {
    return {
      filePath,
      text: normalized,
      charCount: normalized.length,
      ocrEngine: 'openai-vision', // FR-011
    };
  }

  const truncated = normalized.slice(0, config.maxChars);
  return {
    filePath,
    text: truncated,
    charCount: truncated.length,
    truncationWarning: `テキストが maxChars (${config.maxChars}) を超えたため切り捨てました。`,
    ocrEngine: 'openai-vision', // FR-011
  };
}
