import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import type { FSWatcher } from 'chokidar';
import type { Config } from './config/schema.js';
import type { AuditLogEntry } from './types/index.js';
import { writeLog } from './logger/index.js';
import { moveFile, resolveDestination } from './router/index.js';
import type { Queue } from './queue/index.js';
import type { SeenKeyStore } from './seen-key-store.js';
import type { HealthCheckServer } from './health-server.js';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * SIGTERM / SIGINT を受けたときのグレースフル停止シーケンスを設定する（FR-002, FR-003, FR-011）。
 *
 * シーケンス:
 * 1. watcher.close() — 新規ファイルの検知を停止する
 * 2. queue.onIdle() と timeout の race — 処理中ジョブの完了を待つ
 * 3. タイムアウト時: アクティブファイルを reviewDir に移動し 'stopped' 監査ログを記録する（FR-003）
 * 4. seenKeyStore.flush() — 処理済みキーを永続化する
 * 5. healthServer?.close() — ヘルスチェックサーバーを停止する
 * 6. process.exit(0)
 */
export function setupGracefulShutdown(
  watcher: FSWatcher,
  queue: Queue,
  config: Config,
  seenKeyStore: SeenKeyStore,
  healthServer?: HealthCheckServer,
): void {
  let handling = false;

  const handler = async (): Promise<void> => {
    // 二重実行防止（SIGTERM + SIGINT の両方が短時間に来た場合）
    if (handling) return;
    handling = true;

    console.log('\n[JudgeFile] グレースフル停止を開始します...');

    // Step 1: 監視を停止して新規ジョブを受け付けない
    await watcher.close();

    // Step 2: タイムアウト付きでキュー完了を待つ
    const timeoutMs = config.gracefulShutdownTimeoutMs ?? 30_000;
    const timedOut = await Promise.race([
      queue.onIdle().then(() => false),
      sleep(timeoutMs).then(() => true),
    ]);

    // Step 3: タイムアウト時は残存ジョブを reviewDir に移動して stopped ログを記録する
    if (timedOut) {
      console.warn(
        `[JudgeFile] タイムアウト (${timeoutMs}ms)。残存ジョブを reviewDir に移動します。`,
      );
      for (const filePath of queue.getActiveFiles()) {
        try {
          await fs.mkdir(config.reviewDir, { recursive: true });
          const dest = await resolveDestination(filePath, config.reviewDir);
          if (filePath !== dest) {
            await moveFile(filePath, dest);
          }
          const stoppedEntry: AuditLogEntry = {
            id: randomUUID(),
            event: 'stopped',
            timestamp: new Date().toISOString(),
            filePath: dest,
            reason: 'graceful-shutdown-timeout',
          };
          writeLog(stoppedEntry);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`[JudgeFile] 残存ジョブの移動失敗: ${filePath} — ${msg}`);
        }
      }
    }

    // Step 4: 処理済みキーを永続化する
    seenKeyStore.flush();

    // Step 5: ヘルスチェックサーバーを停止する
    healthServer?.close();

    console.log('[JudgeFile] 停止しました。');
    process.exit(0);
  };

  process.once('SIGTERM', () => {
    void handler();
  });
  process.once('SIGINT', () => {
    void handler();
  });
}
