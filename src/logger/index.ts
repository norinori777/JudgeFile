import { appendFileSync, chmodSync } from 'node:fs';
import type { AuditLogEntry } from '../types/index.js';

let logFilePath: string = '';
let _sensitiveFields: string[] = [];

/**
 * 監査ログエントリの機密フィールドをマスクして新しいオブジェクトを返す（FR-006）。
 * 元のエントリは変更しない。
 */
export function maskSensitiveFields(entry: AuditLogEntry, sensitiveFields: string[]): AuditLogEntry {
  if (sensitiveFields.length === 0) return entry;
  const result = { ...entry };
  for (const field of sensitiveFields) {
    if (field in result && (result as Record<string, unknown>)[field] !== undefined) {
      (result as Record<string, unknown>)[field] = '[REDACTED]';
    }
  }
  return result;
}

/**
 * ロガーを初期化する（ログファイルパスと機密フィールドリストを設定する）。
 * ログファイル作成後にパーミッションを 0o600 に設定する（FR-007）。
 * Windows では fs.chmodSync は無視される（OS レベルの ACL で対応）。
 */
export function initLogger(filePath: string, sensitiveFields: string[] = []): void {
  logFilePath = filePath;
  _sensitiveFields = sensitiveFields;
  // ファイルが存在しない場合は空で作成してからパーミッションを設定する
  try {
    appendFileSync(logFilePath, '', 'utf-8');
    // POSIX環境のみ効果あり。Windowsでは chmodSync は無視される
    chmodSync(logFilePath, 0o600);
  } catch {
    // chmod 失敗は致命的ではないため無視する
  }
}

/**
 * AuditLogEntry を JSON Lines 形式でログファイルに追記する（FR-006）。
 * text フィールドは含まれていないことを型定義で保証している（ExtractedText は渡さない）。
 * 書き込み前に機密フィールドをマスクする（FR-006）。
 */
export function writeLog(entry: AuditLogEntry): void {
  if (!logFilePath) {
    throw new Error('[JudgeFile] logger が初期化されていません。initLogger() を先に呼び出してください。');
  }
  const masked = maskSensitiveFields(entry, _sensitiveFields);
  const line = JSON.stringify(masked) + '\n';
  appendFileSync(logFilePath, line, 'utf-8');
}

