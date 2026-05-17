import { extname } from 'node:path';
import type { Config } from '../config/schema.js';
import type { ExtractedText } from '../types/index.js';
import { extractTxt } from './txt.js';
import { extractMd } from './md.js';

/**
 * ファイルの拡張子に基づいて適切な抽出器に処理を委譲する。
 *
 * ENOENT / EACCES などの fs エラーはここでキャッチせず Queue 層へ伝播させる（T020）。
 * これにより Queue 層の try/catch が failed ログを記録する。
 */
export async function extract(filePath: string, config: Config): Promise<ExtractedText> {
  const ext = extname(filePath).toLowerCase();

  switch (ext) {
    case '.txt':
      return extractTxt(filePath, config);
    case '.md':
      return extractMd(filePath, config);
    default:
      throw new Error(`サポートされていない拡張子です: ${ext}`);
  }
}
