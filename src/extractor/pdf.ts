import { readFile } from 'node:fs/promises';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import type { Config } from '../config/schema.js';
import type { ExtractedText } from '../types/index.js';

// Node.js ではウェブワーカー不要のため無効化する（research.md §1）
GlobalWorkerOptions.workerSrc = '';

/**
 * PDF ファイルのテキスト層を全ページ抽出し、ページ間を \n\n で結合して返す。
 *
 * 成果物要件（T004）:
 *   - try/catch なし: 例外（PasswordException 等）は Queue 層に伝播させる（FR-006）
 *   - getMetadata() 不使用: メタデータを抽出テキストに混入させない（FR-008）
 *   - コンソール/ファイルへのテキスト出力なし（FR-007）
 */
export async function extractPdf(filePath: string, config: Config): Promise<ExtractedText> {
  const data = new Uint8Array(await readFile(filePath));

  const loadingTask = getDocument({
    data,
    useWorkerFetch: false,
    useSystemFonts: true,
  });
  const pdfDoc = await loadingTask.promise;

  const pageTexts: string[] = [];
  for (let i = 1; i <= pdfDoc.numPages; i++) {
    const page = await pdfDoc.getPage(i);
    const textContent = await page.getTextContent();

    // TextItem と TextMarkedContent の混在に対して型ガードで TextItem のみを処理する（research.md §7）
    const pageText = (textContent.items as unknown[])
      .filter((item): item is { str: string } => typeof item === 'object' && item !== null && 'str' in item)
      .map(item => item.str)
      .join(' ')
      .trim();

    pageTexts.push(pageText);
  }

  // 全ページを \n\n で結合する（FR-002）
  const fullText = pageTexts.join('\n\n').trim();

  // maxChars 切り捨て（FR-003、extractTxt と同一パターン）
  if (fullText.length <= config.maxChars) {
    return { filePath, text: fullText, charCount: fullText.length };
  }

  return {
    filePath,
    text: fullText.slice(0, config.maxChars),
    charCount: config.maxChars,
    truncationWarning: `テキストが maxChars (${config.maxChars}) を超えたため切り捨てました（元の文字数: ${fullText.length}）`,
  };
}
