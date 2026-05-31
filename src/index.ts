import 'dotenv/config';
import { resolve, dirname } from 'node:path';
import { promises as fs } from 'node:fs';
import { loadConfig } from './config/loader.js';
import { initLogger, writeLog, getLogDir } from './logger/index.js';
import { runRetentionCleanup } from './logger/retention.js';
import { validateConfigSecurity } from './config/validator.js';
import { Queue } from './queue/index.js';
import { startWatcher } from './watcher/index.js';

async function main(): Promise<void> {
  // AUDIT_HMAC_SECRET バリデーション（FR-007）: 未設定または32文字未満の場合は起動拒否
  const auditHmacSecret = process.env.AUDIT_HMAC_SECRET ?? '';
  if (auditHmacSecret.length < 32) {
    console.error('[JudgeFile] エラー: 環境変数 AUDIT_HMAC_SECRET が未設定または32文字未満です。監査ログの完全性保証のため、32文字以上のシークレットを設定してください。');
    process.exit(1);
  }

  const apiKey = process.env.OPENAI_API_KEY ?? process.env.OPENAPI_API_KEY;

  if (apiKey) {
    process.env.OPENAI_API_KEY = apiKey;
  }

  // API キーの存在確認（未設定の場合は起動不可）
  if (!apiKey) {
    console.error('[JudgeFile] エラー: 環境変数 OPENAI_API_KEY または OPENAPI_API_KEY が設定されていません。');
    process.exit(1);
  }

  const configPath = resolve(process.cwd(), 'config.json');
  const config = await loadConfig(configPath);

  // reviewDir・routes の移動先・ログファイルの親ディレクトリを起動時に一括作成
  const dirsToCreate = [config.reviewDir, ...Object.values(config.routes), dirname(config.logFile)];
  for (const dir of dirsToCreate) {
    await fs.mkdir(dir, { recursive: true });
  }

  initLogger(config.logFile, config.sensitiveFields, auditHmacSecret, config.logRetention.maxLogSizeMB);

  // 起動時クリーンアップ: 保持期限超過ログを削除し削除事実をログに記録する (FR-004, FR-005)
  const logDir = getLogDir();
  const deletedFiles = runRetentionCleanup(logDir, config.logRetention.retentionDays);
  for (const deletedPath of deletedFiles) {
    writeLog({
      id: crypto.randomUUID(),
      event: 'completed',
      timestamp: new Date().toISOString(),
      filePath: deletedPath,
      error: `保持期間超過により削除 (retentionDays=${config.logRetention.retentionDays})`,
    });
  }

  // 起動時設定バリデーション: 循環参照チェック（FR-001b）
  validateConfigSecurity(config);

  const queue = new Queue(config);
  const watcher = startWatcher(config, queue);

  console.log(`[JudgeFile] 起動しました。監視ディレクトリ: ${config.watchDir}`);

  const shutdown = async (): Promise<void> => {
    console.log('\n[JudgeFile] シャットダウンしています...');
    await watcher.close();
    await queue.onIdle();
    console.log('[JudgeFile] 停止しました。');
    process.exit(0);
  };

  process.on('SIGINT', () => { void shutdown(); });
  process.on('SIGTERM', () => { void shutdown(); });
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`[JudgeFile] 起動エラー: ${message}`);
  process.exit(1);
});
