import { resolve } from 'node:path';
import { loadConfig } from './config/loader.js';
import { initLogger } from './logger/index.js';
import { Queue } from './queue/index.js';
import { startWatcher } from './watcher/index.js';

async function main(): Promise<void> {
  const configPath = resolve(process.cwd(), 'config.json');
  const config = await loadConfig(configPath);

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
