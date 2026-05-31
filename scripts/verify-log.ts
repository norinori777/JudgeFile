#!/usr/bin/env tsx
/**
 * verify-log.ts — 監査ログ完全性検証 CLI (FR-002)
 *
 * Usage:
 *   npx tsx scripts/verify-log.ts                  # config.json の logFile ディレクトリを対象
 *   npx tsx scripts/verify-log.ts <file>            # 特定ファイルを検証
 *   npx tsx scripts/verify-log.ts --all <dir>       # 指定ディレクトリの全 audit-*.jsonl を検証
 */
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname, basename } from 'node:path';
import { verifyChain } from '../src/logger/integrity.js';
import type { AuditLogEntry, VerificationResult } from '../src/types/index.js';

const AUDIT_LOG_PATTERN = /^audit(-\d{4}-\d{2}-\d{2}(-\d+)?)?\.jsonl$/;

function parseJsonLines(content: string): AuditLogEntry[] {
  return content
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as AuditLogEntry);
}

function verifyFile(filePath: string, secret: string): VerificationResult {
  let content: string;
  try {
    content = readFileSync(filePath, 'utf-8');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[ERRO] ${basename(filePath)}: ファイル読み込み失敗 — ${msg}`);
    process.exit(1);
  }

  const entries = parseJsonLines(content);
  const result = verifyChain(entries, secret);
  result.filePath = filePath;
  return result;
}

function printResult(result: VerificationResult): void {
  const name = basename(result.filePath);
  if (result.passed) {
    const seg = result.redactionSegments > 0 ? `（redactionセグメント: ${result.redactionSegments}）` : '';
    console.log(`[PASS] ${name}: 全${result.totalEntries}エントリ整合性OK${seg}`);
  } else {
    for (const v of result.violations) {
      const reason =
        v.reason === 'hash_mismatch'
          ? '改ざんを検知'
          : v.reason === 'unexpected_chain_break'
            ? 'チェーン断絶を検知'
            : 'ハッシュフィールド欠落';
      console.log(`[FAIL] ${name}: エントリ${v.entryIndex}（${v.timestamp}）に${reason}`);
    }
  }
}

function getTargetFiles(args: string[]): { files: string[]; secret: string } {
  const secret = process.env.AUDIT_HMAC_SECRET ?? '';
  if (secret.length < 32) {
    console.error('[ERRO] 環境変数 AUDIT_HMAC_SECRET が未設定または32文字未満です。');
    process.exit(1);
  }

  if (args[0] === '--all' && args[1]) {
    const dir = resolve(args[1]);
    const files = readdirSync(dir)
      .filter((f) => AUDIT_LOG_PATTERN.test(f))
      .sort()
      .map((f) => resolve(dir, f));
    return { files, secret };
  }

  if (args[0] && !args[0].startsWith('--')) {
    return { files: [resolve(args[0])], secret };
  }

  // 引数なし: config.json の logFile ディレクトリを対象
  let configPath: string;
  try {
    configPath = resolve(process.cwd(), 'config.json');
    const config = JSON.parse(readFileSync(configPath, 'utf-8')) as { logFile?: string };
    if (!config.logFile) throw new Error('logFile が未設定');
    const logDir = dirname(resolve(config.logFile));
    const files = readdirSync(logDir)
      .filter((f) => AUDIT_LOG_PATTERN.test(f))
      .sort()
      .map((f) => resolve(logDir, f));
    return { files, secret };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[ERRO] config.json の読み込みに失敗しました: ${msg}`);
    process.exit(1);
  }
}

function main(): void {
  const args = process.argv.slice(2);
  const { files, secret } = getTargetFiles(args);

  if (files.length === 0) {
    console.log('[INFO] 対象ファイルが見つかりませんでした。');
    process.exit(0);
  }

  let hasFailure = false;
  for (const file of files) {
    const result = verifyFile(file, secret);
    printResult(result);
    if (!result.passed) hasFailure = true;
  }

  process.exit(hasFailure ? 1 : 0);
}

main();
