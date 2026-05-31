import { createHmac, createHash } from 'node:crypto';
import type { AuditLogEntry, VerificationResult, VerificationViolation } from '../types/index.js';

/**
 * HMAC-SHA256 を計算して hex 文字列を返す (FR-001)
 * @param payload - ハッシュ対象の文字列
 * @param secret  - AUDIT_HMAC_SECRET
 */
export function computeHmac(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload, 'utf8').digest('hex');
}

/**
 * SHA-256 の一方向ハッシュを返す (FR-009)
 * @param value - ハッシュ対象の文字列
 */
export function computeSha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

/**
 * エントリの currHash を計算する。
 * payload = JSON.stringify({ ...entry, prevHash }) から currHash フィールドを除いた内容
 */
export function computeEntryCurrHash(
  entry: Omit<AuditLogEntry, 'currHash'>,
  prevHash: string,
  secret: string,
): string {
  const payload = JSON.stringify({ ...entry, prevHash });
  return computeHmac(payload, secret);
}

/**
 * JSON Lines 形式のエントリ配列を受け取り、チェーンの完全性を検証する (FR-002)
 * - prevHash/currHash を持たないエントリは「レガシーエントリ」として警告に含め、パスとして扱う
 * - event='redaction' のエントリはチェーンリセット点とする
 */
export function verifyChain(
  entries: AuditLogEntry[],
  secret: string,
): VerificationResult {
  const violations: VerificationViolation[] = [];
  let expectedPrevHash = 'genesis';
  let redactionSegments = 0;
  let legacyCount = 0;

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]!;

    // レガシーエントリ（integrity フィールドなし）はスキップ
    if (entry.prevHash === undefined || entry.currHash === undefined) {
      legacyCount++;
      continue;
    }

    // prevHash の連鎖確認
    if (entry.prevHash !== expectedPrevHash) {
      violations.push({
        entryIndex: i,
        timestamp: entry.timestamp,
        reason: 'unexpected_chain_break',
      });
    }

    // currHash の再計算と照合
    const { currHash: _currHash, ...entryWithoutCurrHash } = entry;
    const expected = computeEntryCurrHash(entryWithoutCurrHash, entry.prevHash, secret);
    if (expected !== entry.currHash) {
      violations.push({
        entryIndex: i,
        timestamp: entry.timestamp,
        reason: 'hash_mismatch',
      });
    }

    // redaction マーカーはチェーンリセット点
    if (entry.event === 'redaction') {
      redactionSegments++;
      expectedPrevHash = entry.currHash;
    } else {
      expectedPrevHash = entry.currHash;
    }
  }

  if (legacyCount > 0) {
    // レガシーエントリの警告は標準エラーへ（テスト環境でも確認可能）
    process.stderr.write(
      `[verify-log] 警告: ${legacyCount} 件のレガシーエントリ（完全性フィールドなし）をスキップしました\n`,
    );
  }

  return {
    filePath: '',
    totalEntries: entries.length,
    passed: violations.length === 0,
    violations,
    redactionSegments,
  };
}
