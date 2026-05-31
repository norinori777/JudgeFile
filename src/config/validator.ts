/**
 * src/config/validator.ts
 *
 * 設定読み込み後の追加バリデーション（Round 9: OWASPセキュリティ強化）。
 * 起動時に一回だけ実行する。
 *
 * validateConfigSecurity: watchDir と全振り分け先・reviewDir の循環参照チェック（FR-001b）
 */

import { resolve } from 'node:path';
import type { Config } from './schema.js';

/**
 * 設定のセキュリティバリデーションを実行する（FR-001b）。
 *
 * watchDir の正規化パスと routes の全振り分け先・reviewDir を比較し、
 * 一致する場合は Error をスローしてプロセスを即時終了させる。
 *
 * @throws Error  循環参照が検出された場合
 */
export function validateConfigSecurity(config: Config): void {
  const normalizedWatchDir = resolve(config.watchDir);

  // reviewDir チェック
  const normalizedReviewDir = resolve(config.reviewDir);
  if (normalizedReviewDir === normalizedWatchDir) {
    throw new Error(
      `[JudgeFile] 設定エラー: reviewDir が watchDir と同じパスです。` +
      ` watchDir=${config.watchDir}, reviewDir=${config.reviewDir}`,
    );
  }

  // routes の全振り分け先チェック
  for (const [category, destDir] of Object.entries(config.routes)) {
    const normalizedDest = resolve(destDir);
    if (normalizedDest === normalizedWatchDir) {
      throw new Error(
        `[JudgeFile] 設定エラー: routes["${category}"] が watchDir と同じパスです。` +
        ` watchDir=${config.watchDir}, routes["${category}"]=${destDir}`,
      );
    }
  }
}
