import PQueue from 'p-queue';
import { randomUUID } from 'node:crypto';
import { basename } from 'node:path';
import OpenAI from 'openai';
import type { Config } from '../config/schema.js';
import type { AuditLogEntry } from '../types/index.js';
import { extract } from '../extractor/index.js';
import { writeLog } from '../logger/index.js';
import { classify } from '../classifier/index.js';
import { route, moveFile, resolveDestination } from '../router/index.js';
import { extractContractInfo, updateMetaJson } from '../extractor/contract.js';
import { applySystemHardLimit, wrapWithDocumentTag, moderateText } from '../extractor/sanitize.js';
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
      // OpenAI クライアントを enqueue スコープで生成し moderateText / classify 両方で共用する
      const client = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
        timeout: this.config.apiTimeoutMs,
      });

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

        // FR-007: システム上限（50,000 文字）を適用する（config.maxChars より優先）
        const hardLimited = applySystemHardLimit(result.text);
        const rawText = hardLimited.text;
        const systemLimitWarning = hardLimited.warning;

        // FR-004: Moderation API でポリシー違反チェック（生テキスト・タグエスケープ前）
        let moderationCategories: string[] | undefined;
        try {
          const modResult = await moderateText(client, rawText);
          if (modResult.flagged) {
            // FR-005: フラグあり → fail-secure。classify() を呼ばず reviewDir へ移動
            moderationCategories = modResult.categories;
            let moderationDest: string | undefined;
            try {
              await fs.mkdir(this.config.reviewDir, { recursive: true });
              moderationDest = await resolveDestination(filePath, this.config.reviewDir);
              if (filePath !== moderationDest) {
                await moveFile(filePath, moderationDest);
              }
            } catch {
              // reviewDir への移動失敗は無視して failed ログのみ記録する
            }
            const blockedEntry: AuditLogEntry = {
              id: randomUUID(),
              event: 'failed',
              timestamp: new Date().toISOString(),
              filePath,
              durationMs: Date.now() - startMs,
              error: 'moderation_blocked',
              moderationCategories,
              moveType: 'error',
              ...(moderationDest ? { destination: moderationDest } : {}),
            };
            writeLog(blockedEntry);
            return;
          }
        } catch (moderationErr) {
          // FR-006: Moderation 例外（タイムアウト含む） → fail-secure
          const moderationErrMsg = moderationErr instanceof Error ? moderationErr.message : String(moderationErr);
          let moderationDest: string | undefined;
          try {
            await fs.mkdir(this.config.reviewDir, { recursive: true });
            moderationDest = await resolveDestination(filePath, this.config.reviewDir);
            if (filePath !== moderationDest) {
              await moveFile(filePath, moderationDest);
            }
          } catch {
            // reviewDir への移動失敗は無視
          }
          const moderationErrorEntry: AuditLogEntry = {
            id: randomUUID(),
            event: 'failed',
            timestamp: new Date().toISOString(),
            filePath,
            durationMs: Date.now() - startMs,
            error: `moderation_error: ${moderationErrMsg}`,
            moveType: 'error',
            ...(moderationDest ? { destination: moderationDest } : {}),
          };
          writeLog(moderationErrorEntry);
          return;
        }

        // FR-001・FR-002: タグエスケープ + <document> ラップ（classify 用）
        const wrappedText = wrapWithDocumentTag(rawText);

        // 分類 → ルーティング
        const classification = await classify(wrappedText, this.config);
        const decision = await route(filePath, classification, this.config);

        // FR-009a: review 移動時に .meta.json を保存する（テキスト本文は含めない）
        if (decision.moveType === 'review') {
          const metaPath = decision.destDir + '.meta.json';
          const meta = {
            filePath: decision.destDir,
            originalName: basename(decision.destDir),
            category: classification.category,
            tags: classification.tags,
            confidence: classification.confidence,
            confidentiality: classification.confidentiality,
            destination: classification.destination,
            queuedAt: new Date().toISOString(),
          };
          try {
            await fs.writeFile(metaPath, JSON.stringify(meta, null, 2) + '\n', 'utf-8');
          } catch {
            // meta.json の書き込み失敗はメイン処理を止めない
            console.warn(`[Queue] meta.json 保存失敗: ${metaPath}`);
          }
        }

        // Round 7: 契約情報抽出（FR-001・FR-008・FR-009）
        // moveFile() 完了後、契約書カテゴリかつエラー移動でない場合のみ実行する
        let contractSubject: string | null | undefined;
        let contractPeriod: { start: string | null; end: string | null; note: string | null } | null | undefined;
        let contractExtractionError: string | undefined;

        const contractLabel = (this.config.contractCategoryLabel ?? '契約書').toLowerCase();
        if (
          classification.category.toLowerCase() === contractLabel &&
          decision.moveType !== 'error'
        ) {
          try {
            // FR-009: contractInfo には rawText（タグラップ前の生テキスト）を使用する
            const contractInfo = await extractContractInfo(rawText, this.config);
            contractSubject = contractInfo.contractSubject;
            contractPeriod = contractInfo.contractPeriod;
            // FR-005: .meta.json に contractSubject・contractPeriod を追記する
            await updateMetaJson(decision.destDir, contractInfo);
          } catch (err) {
            // FR-007: 抽出失敗はパイプラインを止めない
            contractExtractionError = err instanceof Error ? err.message : String(err);
          }
        }

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
          // FR-008: システム上限カット時の truncationWarning を独立フィールドに記録する
          ...(systemLimitWarning ? { truncationWarning: systemLimitWarning } : {}),
          // FR-011: OCR 処理を経たファイルにのみ ocrEngine を転記する
          ...(result.ocrEngine ? { ocrEngine: result.ocrEngine } : {}),
          // FR-006: 契約情報（null 含む）を監査ログに記録する
          ...(contractSubject !== undefined ? { contractSubject } : {}),
          ...(contractPeriod !== undefined ? { contractPeriod } : {}),
          // FR-007: 抽出エラー時のみ contractExtractionError を記録する
          ...(contractExtractionError ? { contractExtractionError } : {}),
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
