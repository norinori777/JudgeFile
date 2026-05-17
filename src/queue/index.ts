import PQueue from 'p-queue';
import { randomUUID } from 'node:crypto';
import type { Config } from '../config/schema.js';
import type { AuditLogEntry } from '../types/index.js';
import { extract } from '../extractor/index.js';
import { writeLog } from '../logger/index.js';
import { classify } from '../classifier/index.js';
import { route, moveFile, resolveDestination } from '../router/index.js';
import { promises as fs } from 'node:fs';

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

        // FR-015: 空テキストの場合は分類せずスキップ
        if (result.text.trim() === '') {
          const skippedEntry: AuditLogEntry = {
            id: randomUUID(),
            event: 'skipped',
            timestamp: new Date().toISOString(),
            filePath,
            durationMs: Date.now() - startMs,
          };
          writeLog(skippedEntry);
          return;
        }

        // 分類 → ルーティング
        const classification = await classify(result.text, this.config);
        const decision = await route(filePath, classification, this.config);

        const completedEntry: AuditLogEntry = {
          id: randomUUID(),
          event: 'completed',
          timestamp: new Date().toISOString(),
          filePath,
          durationMs: Date.now() - startMs,
          charCount: result.charCount,
          // FR-014: text フィールドは絶対にログに含めない
          category: classification.category,
          confidence: classification.confidence,
          tags: classification.tags,
          confidentiality: classification.confidentiality,
          destination: decision.destDir,
          moveType: decision.moveType,
          // review になった場合は reason を error フィールドに記録（T010）
          ...(decision.reason ? { error: decision.reason } : {}),
          ...(result.truncationWarning && !decision.reason ? { error: result.truncationWarning } : {}),
        };
        writeLog(completedEntry);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);

        // エラー時はファイルを reviewDir へ移動する（T012）
        let errorDest: string | undefined;
        try {
          await fs.mkdir(this.config.reviewDir, { recursive: true });
          errorDest = await resolveDestination(filePath, this.config.reviewDir);
          if (filePath !== errorDest) {
            await moveFile(filePath, errorDest);
          }
        } catch {
          // reviewDir への移動も失敗した場合は無視して failed ログのみ記録する
        }

        const failedEntry: AuditLogEntry = {
          id: randomUUID(),
          event: 'failed',
          timestamp: new Date().toISOString(),
          filePath,
          durationMs: Date.now() - startMs,
          error: errorMessage,
          moveType: 'error',
          ...(errorDest ? { destination: errorDest } : {}),
        };
        writeLog(failedEntry);
        // 例外を飲み込んで次のジョブを継続する（US3 / T012）
      }
    });
  }
}
