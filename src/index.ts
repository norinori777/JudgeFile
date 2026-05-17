import { resolve } from 'node:path';
import { promises as fs } from 'node:fs';
import { loadConfig } from './config/loader.js';
import { initLogger } from './logger/index.js';
import { Queue } from './queue/index.js';
import { startWatcher } from './watcher/index.js';

async function main(): Promise<void> {
  // OPENAI_API_KEY の存在確認（未設定の場合は起動不可）
  if (!process.env.OPENAI_API_KEY) {
    console.error('[JudgeFile] エラー: 環境変数 OPENAI_API_KEY が設定されていません。');
    process.exit(1);
  }

  const configPath = resolve(process.cwd(), 'config.json');
  const config = await loadConfig(configPath);

  // reviewDir と routes の移動先ディレクトリを起動時に一括作成
  const dirsToCreate = [config.reviewDir, ...Object.values(config.routes)];
  for (const dir of dirsToCreate) {
    await fs.mkdir(dir, { recursive: true });
  }

  initLogger(config.logFile);

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
