import { appendFileSync } from 'node:fs';
import type { AuditLogEntry } from '../types/index.js';

let logFilePath: string = '';

/** ロガーを初期化する（ログファイルパスを設定する） */
export function initLogger(filePath: string): void {
  logFilePath = filePath;
}

/**
 * AuditLogEntry を JSON Lines 形式でログファイルに追記する（FR-006）。
 * text フィールドは含まれていないことを型定義で保証している（ExtractedText は渡さない）。
 */
export function writeLog(entry: AuditLogEntry): void {
  if (!logFilePath) {
    throw new Error('[JudgeFile] logger が初期化されていません。initLogger() を先に呼び出してください。');
  }
  const line = JSON.stringify(entry) + '\n';
  appendFileSync(logFilePath, line, 'utf-8');
}
