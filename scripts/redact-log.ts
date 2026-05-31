#!/usr/bin/env tsx
/**
 * redact-log.ts — GDPR 対応 ファイルパス匿名化 CLI (FR-009)
 *
 * Usage:
 *   npx tsx scripts/redact-log.ts --identifier <path>           # config.json の logFile ディレクトリを対象
 *   npx tsx scripts/redact-log.ts --identifier <path> --dry-run # ドライラン（変更なし、件数のみ表示）
 *   npx tsx scripts/redact-log.ts --identifier <path> --dir <dir> # 指定ディレクトリを対象
 */
import { readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { redactEntries } from '../src/logger/redaction.js';

const AUDIT_LOG_PATTERN = /^audit(-\d{4}-\d{2}-\d{2}(-\d+)?)?\.jsonl$/;

function parseArgs(): { identifier: string; logDir: string | null; dryRun: boolean } {
  const args = process.argv.slice(2);
  let identifier = '';
  let logDir: string | null = null;
  let dryRun = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--identifier' && args[i + 1]) {
      identifier = args[i + 1]!;
      i++;
    } else if (args[i] === '--dir' && args[i + 1]) {
      logDir = args[i + 1]!;
      i++;
    } else if (args[i] === '--dry-run') {
      dryRun = true;
    }
  }

  return { identifier, logDir, dryRun };
}

async function main(): Promise<void> {
  // AUDIT_HMAC_SECRET バリデーション
  const secret = process.env.AUDIT_HMAC_SECRET ?? '';
  if (secret.length < 32) {
    console.error('[redact-log] エラー: 環境変数 AUDIT_HMAC_SECRET が未設定または32文字未満です。');
    process.exit(1);
  }

  const { identifier, logDir: rawLogDir, dryRun } = parseArgs();

  if (!identifier) {
    console.error('[redact-log] エラー: --identifier <path> が必要です。');
    console.error('Usage: npx tsx scripts/redact-log.ts --identifier <path> [--dry-run] [--dir <dir>]');
    process.exit(1);
  }

  // ログディレクトリ解決: --dir 指定 → config.json の logFile ディレクトリ
  let logDir: string;
  if (rawLogDir) {
    logDir = resolve(rawLogDir);
  } else {
    try {
      const { readFileSync } = await import('node:fs');
      const cfg = JSON.parse(readFileSync('config.json', 'utf-8')) as { logFile?: string };
      if (!cfg.logFile) throw new Error('logFile フィールドがありません');
      logDir = resolve(dirname(cfg.logFile));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[redact-log] エラー: config.json 読み込み失敗 — ${msg}`);
      process.exit(1);
    }
  }

  // 対象ファイルを列挙
  let files: string[];
  try {
    files = readdirSync(logDir)
      .filter((f) => AUDIT_LOG_PATTERN.test(f))
      .map((f) => resolve(logDir, f));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[redact-log] エラー: ディレクトリ読み込み失敗 — ${msg}`);
    process.exit(1);
  }

  if (files.length === 0) {
    console.log('[redact-log] 対象ファイルが見つかりません。');
    process.exit(0);
  }

  let totalRedacted = 0;

  for (const filePath of files) {
    const summary = redactEntries(filePath, identifier, secret, dryRun);
    if (summary.redactedCount > 0) {
      const mode = dryRun ? '[DRY-RUN]' : '[REDACTED]';
      console.log(`${mode} ${filePath}: ${summary.redactedCount} エントリを匿名化`);
      console.log(`  identifierHash(SHA-256): ${summary.redactedIdentifierHash}`);
      totalRedacted += summary.redactedCount;
    }
  }

  if (totalRedacted === 0) {
    console.log(`[redact-log] 識別子に一致するエントリが見つかりませんでした: ${identifier}`);
  } else {
    const mode = dryRun ? '（ドライランのため変更なし）' : '';
    console.log(`\n[redact-log] 完了: 合計 ${totalRedacted} エントリを匿名化しました${mode}`);
  }
}

main().catch((err) => {
  console.error('[redact-log] 予期しないエラー:', err);
  process.exit(1);
});
