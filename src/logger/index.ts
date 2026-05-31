import { appendFileSync, chmodSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { AuditLogEntry } from '../types/index.js';
import { computeEntryCurrHash } from './integrity.js';
import { getActiveLogBaseName, resolveRotatedPath } from './rotation.js';

let logFilePath: string = '';
let _sensitiveFields: string[] = [];
let _hmacSecret: string = '';
let _maxLogSizeBytes: number = 10 * 1024 * 1024; // デフォルト 10MB
let _logDir: string = '';

/**
 * 現在のログファイルの最終エントリの currHash を読み取る。
 * ファイルが空・存在しない・最終エントリに currHash がない場合は 'genesis' を返す。
 */
function readLastCurrHash(filePath: string): string {
  try {
    const content = readFileSync(filePath, 'utf-8').trimEnd();
    if (!content) return 'genesis';
    const lines = content.split('\n');
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i]?.trim();
      if (!line) continue;
      const parsed = JSON.parse(line) as Partial<AuditLogEntry>;
      if (parsed.currHash) return parsed.currHash;
    }
    return 'genesis';
  } catch {
    return 'genesis';
  }
}

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
 * rotation.ts によるファイル名決定を行い、ログファイル作成後にパーミッションを 0o600 に設定する（FR-007）。
 * Windows では fs.chmodSync は無視される（OS レベルの ACL で対応）。
 */
export function initLogger(
  filePath: string,
  sensitiveFields: string[] = [],
  hmacSecret: string = '',
  maxLogSizeMB: number = 10,
): void {
  _logDir = dirname(filePath);
  _sensitiveFields = sensitiveFields;
  _hmacSecret = hmacSecret;
  _maxLogSizeBytes = maxLogSizeMB * 1024 * 1024;

  // rotation: 日付ベースのアクティブなログファイルパスを決定する (FR-003, FR-008)
  const baseName = getActiveLogBaseName();
  logFilePath = resolveRotatedPath(_logDir, baseName, _maxLogSizeBytes);

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
 * AUDIT_HMAC_SECRET が設定されている場合は prevHash / currHash を付与する（FR-001）。
 */
export function writeLog(entry: AuditLogEntry): void {
  if (!logFilePath) {
    throw new Error('[JudgeFile] logger が初期化されていません。initLogger() を先に呼び出してください。');
  }
  const masked = maskSensitiveFields(entry, _sensitiveFields);

  // HMAC チェーン付与（AUDIT_HMAC_SECRET が設定されている場合のみ）
  let finalEntry: AuditLogEntry = masked;
  if (_hmacSecret) {
    const prevHash = readLastCurrHash(logFilePath);
    const { currHash: _skip, prevHash: _skip2, ...entryBody } = masked;
    const currHash = computeEntryCurrHash({ ...entryBody }, prevHash, _hmacSecret);
    finalEntry = { ...masked, prevHash, currHash };
  }

  const line = JSON.stringify(finalEntry) + '\n';
  appendFileSync(logFilePath, line, 'utf-8');
}

/** 現在のアクティブなログファイルパスを返す（テスト・CLI 用） */
export function getLogFilePath(): string {
  return logFilePath;
}

/** 現在のログディレクトリを返す（テスト・CLI 用） */
export function getLogDir(): string {
  return _logDir;
}
