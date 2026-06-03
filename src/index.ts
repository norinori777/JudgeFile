import 'dotenv/config';
import { resolve, dirname, join } from 'node:path';
import { promises as fs } from 'node:fs';
import { loadConfig } from './config/loader.js';
import { initLogger, writeLog, getLogDir } from './logger/index.js';
import { runRetentionCleanup } from './logger/retention.js';
import { validateConfigSecurity } from './config/validator.js';
import { Queue } from './queue/index.js';
import { startWatcher } from './watcher/index.js';
import { SeenKeyStore } from './seen-key-store.js';
import { startHealthServer } from './health-server.js';
import { setupGracefulShutdown } from './shutdown.js';

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

  // US1/US4: SeenKeyStore — LRU 上限付き処理済みキー管理（FR-001, FR-005）
  const seenKeysPath = join(dirname(config.logFile), 'seen-keys.jsonl');
  const seenKeyStore = new SeenKeyStore(config.seenKeysMaxSize, seenKeysPath);

  const queue = new Queue(config, seenKeyStore);
  const watcher = startWatcher(config, queue, seenKeyStore);

  // US5: ヘルスチェックサーバー（省略可）（FR-007）
  const healthServer = config.healthCheck?.port
    ? startHealthServer(config.healthCheck.port, () => ({ queueSize: queue.size }))
    : undefined;

  console.log(`[JudgeFile] 起動しました。監視ディレクトリ: ${config.watchDir}`);

  // US2: グレースフル停止（FR-002, FR-003, FR-011）
  setupGracefulShutdown(watcher, queue, config, seenKeyStore, healthServer);
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`[JudgeFile] 起動エラー: ${message}`);
  process.exit(1);
});

