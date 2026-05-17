import { readFile } from 'node:fs/promises';
import type { Config } from '../config/schema.js';
import type { ExtractedText } from '../types/index.js';

/**
 * .txt ファイルを UTF-8 で読み込み、テキストを抽出する。
 * maxChars を超える場合は先頭 maxChars 文字に切り捨て truncationWarning を付与する。
 * UTF-8 デコードエラーは TypeError として throw し、Queue 層でキャッチさせる。
 */
export async function extractTxt(filePath: string, config: Config): Promise<ExtractedText> {
  const buffer = await readFile(filePath);

  // fatal: true で不正なバイト列があれば TypeError を throw する（T019 で利用）
  const decoder = new TextDecoder('utf-8', { fatal: true });
  const decoded = decoder.decode(buffer);

  const trimmed = decoded.trim().replace(/\n{3,}/g, '\n\n');

  if (trimmed.length <= config.maxChars) {
    return {
      filePath,
      text: trimmed,
      charCount: trimmed.length,
    };
  }

  const truncated = trimmed.slice(0, config.maxChars);
  return {
    filePath,
    text: truncated,
    charCount: config.maxChars,
    truncationWarning: `テキストが maxChars (${config.maxChars}) を超えたため切り捨てました（元の文字数: ${trimmed.length}）`,
  };
}
