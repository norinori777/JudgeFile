import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import type { AuditLogEntry } from '../types/index.js';
import { computeSha256, computeEntryCurrHash } from './integrity.js';

/** redactEntries の結果サマリ */
export interface RedactionSummary {
  /** 処理したファイルパス */
  filePath: string;
  /** 匿名化されたエントリ数 */
  redactedCount: number;
  /** 匿名化対象識別子の SHA-256 ハッシュ */
  redactedIdentifierHash: string;
  /** ドライランモードかどうか */
  dryRun: boolean;
}

/**
 * 指定ファイル内のすべてのエントリを走査し、
 * filePath フィールドが identifier に一致するエントリを匿名化する (FR-009)
 *
 * - 一致したエントリの filePath を '[REDACTED]' に置換
 * - 匿名化後にチェーンリセット用の event='redaction' マーカーエントリを末尾に追加
 * - dryRun=true の場合はファイルを書き換えず、影響件数のみ返す
 * - AUDIT_HMAC_SECRET が設定されている場合は redaction マーカーに HMAC フィールドを付与する
 *
 * @param logFile    対象の .jsonl ファイルパス
 * @param identifier 匿名化対象のファイルパス文字列（filePath と完全一致）
 * @param secret     AUDIT_HMAC_SECRET（空文字列の場合は HMAC 付与なし）
 * @param dryRun     true の場合はファイルを変更しない
 */
export function redactEntries(
  logFile: string,
  identifier: string,
  secret: string,
  dryRun: boolean = false,
): RedactionSummary {
  if (!existsSync(logFile)) {
    return {
      filePath: logFile,
      redactedCount: 0,
      redactedIdentifierHash: computeSha256(identifier),
      dryRun,
    };
  }

  const raw = readFileSync(logFile, 'utf-8');
  const lines = raw.trim().split('\n').filter((l) => l.trim() !== '');
  const identifierHash = computeSha256(identifier);

  let redactedCount = 0;
  const newLines: string[] = [];

  for (const line of lines) {
    let entry: AuditLogEntry;
    try {
      entry = JSON.parse(line) as AuditLogEntry;
    } catch {
      // パース不能行はそのまま保持
      newLines.push(line);
      continue;
    }

    if (entry.filePath === identifier) {
      entry = { ...entry, filePath: '[REDACTED]' };
      redactedCount++;
    }
    newLines.push(JSON.stringify(entry));
  }

  if (redactedCount === 0) {
    return {
      filePath: logFile,
      redactedCount: 0,
      redactedIdentifierHash: identifierHash,
      dryRun,
    };
  }

  // チェーンリセット用の redaction マーカーエントリを追加する
  const now = new Date().toISOString();
  let marker: AuditLogEntry = {
    id: crypto.randomUUID(),
    event: 'redaction',
    timestamp: now,
    filePath: '[REDACTED]',
    redactedIdentifierHash: identifierHash,
    redactedCount,
    redactedAt: now,
  };

  // HMAC 付与（secret が設定されている場合）
  if (secret) {
    // 直前の最後のエントリの currHash を取得してチェーンを繋ぐ
    let prevHash = 'genesis';
    for (let i = newLines.length - 1; i >= 0; i--) {
      const line = newLines[i];
      if (!line) continue;
      try {
        const parsed = JSON.parse(line) as Partial<AuditLogEntry>;
        if (parsed.currHash) {
          prevHash = parsed.currHash;
          break;
        }
      } catch {
        // ignore
      }
    }
    const { currHash: _skip, prevHash: _skip2, ...markerBody } = marker;
    const currHash = computeEntryCurrHash({ ...markerBody }, prevHash, secret);
    marker = { ...marker, prevHash, currHash };
  }

  newLines.push(JSON.stringify(marker));

  if (!dryRun) {
    writeFileSync(logFile, newLines.join('\n') + '\n', 'utf-8');
  }

  return {
    filePath: logFile,
    redactedCount,
    redactedIdentifierHash: identifierHash,
    dryRun,
  };
}
