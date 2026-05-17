import PQueue from 'p-queue';
import { randomUUID } from 'node:crypto';
import type { Config } from '../config/schema.js';
import type { AuditLogEntry } from '../types/index.js';
import { extract } from '../extractor/index.js';
import { writeLog } from '../logger/index.js';

export class Queue {
  private readonly pQueue: PQueue;
  private readonly config: Config;

  constructor(config: Config) {
    this.config = config;
    this.pQueue = new PQueue({ concurrency: config.maxConcurrency });
  }

  /** キューに積まれている未処理件数 */
  get size(): number {
    return this.pQueue.size;
  }

  /** キューが空になったときに解決される Promise */
  onEmpty(): Promise<void> {
    return this.pQueue.onEmpty();
  }

  /** すべての処理が完了したときに解決される Promise */
  onIdle(): Promise<void> {
    return this.pQueue.onIdle();
  }

  /**
   * ファイルパスをキューに追加する。
   * 各ジョブは started → extract() → completed/failed のフローで監査ログを記録する。
   * 例外はすべてキャッチして failed ログを記録し、飲み込む（US3 / T018）。
   */
  enqueue(filePath: string): void {
    void this.pQueue.add(async () => {
      const startedAt = new Date().toISOString();

      const startedEntry: AuditLogEntry = {
        id: randomUUID(),
        event: 'started',
        timestamp: startedAt,
        filePath,
      };
      writeLog(startedEntry);

      const startMs = Date.now();

      try {
        const result = await extract(filePath, this.config);

        const completedEntry: AuditLogEntry = {
          id: randomUUID(),
          event: 'completed',
          timestamp: new Date().toISOString(),
          filePath,
          durationMs: Date.now() - startMs,
          charCount: result.charCount,
          // truncationWarning があれば error フィールドにコピーする（FR-011: text は記録しない）
          ...(result.truncationWarning ? { error: result.truncationWarning } : {}),
        };
        writeLog(completedEntry);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        const failedEntry: AuditLogEntry = {
          id: randomUUID(),
          event: 'failed',
          timestamp: new Date().toISOString(),
          filePath,
          durationMs: Date.now() - startMs,
          error: errorMessage,
        };
        writeLog(failedEntry);
        // 例外を飲み込んで次のジョブを継続する（US3 / T018）
      }
    });
  }
}
