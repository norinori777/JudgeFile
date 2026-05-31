import chokidar, { type FSWatcher } from 'chokidar';
import { stat } from 'node:fs/promises';
import { basename, extname } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Config } from '../config/schema.js';
import type { AuditLogEntry } from '../types/index.js';
import { writeLog } from '../logger/index.js';
import { Queue } from '../queue/index.js';

/**
 * 監視フォルダの変更を検知し、.txt / .md ファイルを Queue に追加する。
 *
 * - depth: 0 でトップレベルのみ監視（サブディレクトリは対象外）
 * - ignoreInitial: true で起動時の既存ファイルは無視する（FR-013）
 * - バックプレッシャー: キューが maxQueueSize に達したとき watcher を一時停止する（US2 / T016）
 * - 重複検知: ファイル名 + サイズ + mtime の組み合わせで Set 管理し重複をスキップする（US2 / T017）
 */
export function startWatcher(config: Config, queue: Queue): FSWatcher {
  // 重複検知用 Set（name + size + mtime のキーで管理）
  const seenKeys = new Set<string>();
  const supportedExtensions = new Set(config.watchedExtensions);

  const watcher = chokidar.watch(config.watchDir, {
    depth: 0,
    ignoreInitial: true,
    persistent: true,
    // FR-009 (US2): 書き込み完了後のみキューに積む設計（書き込み途中ファイルはサイズ検証が不正確になるため）
    awaitWriteFinish: {
      stabilityThreshold: 2000,
      pollInterval: 100,
    },
  });

  watcher.on('add', async (filePath: string) => {
    const ext = extname(filePath).toLowerCase();
    if (!supportedExtensions.has(ext)) {
      return;
    }

    // ファイルのメタデータを取得して重複キーを生成する（T017）
    let fileKey: string;
    try {
      const s = await stat(filePath);
      fileKey = `${basename(filePath)}:${s.size}:${s.mtimeMs}`;
    } catch {
      // stat 失敗（消失など）は Queue 層でエラーになるため、そのまま続行する
      fileKey = `${basename(filePath)}:unknown`;
    }

    if (seenKeys.has(fileKey)) {
      // 重複: skipped ログを記録してキューに積まない（T017）
      const skippedEntry: AuditLogEntry = {
        id: randomUUID(),
        event: 'skipped',
        timestamp: new Date().toISOString(),
        filePath,
      };
      writeLog(skippedEntry);
      return;
    }
    seenKeys.add(fileKey);

    // バックプレッシャー: キューが満杯の場合は watcher を一時停止する（T016）
    if (queue.size >= config.maxQueueSize) {
      watcher.unwatch(config.watchDir);
      await queue.onEmpty();
      watcher.add(config.watchDir);
    }

    queue.enqueue(filePath);
  });

  watcher.on('error', (err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[JudgeFile] watcher エラー: ${message}`);
  });

  return watcher;
}
