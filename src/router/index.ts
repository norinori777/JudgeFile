import { promises as fs } from 'node:fs';
import { basename, extname, join, parse } from 'node:path';
import type { Config } from '../config/schema.js';
import type { ClassificationResult, RouteDecision } from '../types/index.js';

/**
 * ファイルを src から dest へ移動する。
 * クロスデバイス移動（EXDEV）の場合はコピー＋削除にフォールバックする。
 */
export async function moveFile(src: string, dest: string): Promise<void> {
  try {
    await fs.rename(src, dest);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'EXDEV') {
      await fs.copyFile(src, dest);
      await fs.unlink(src);
    } else {
      throw err;
    }
  }
}

/**
 * destDir にファイルを移動する際の最終パスを解決する。
 * 同名ファイルが既に存在する場合は "{stem}-{Date.now()}{ext}" を使う。
 */
export async function resolveDestination(filePath: string, destDir: string): Promise<string> {
  const { name: stem, ext } = parse(basename(filePath));
  const candidate = join(destDir, basename(filePath));
  try {
    await fs.access(candidate);
    // ファイルが存在する → タイムスタンプ付き名前を使う
    return join(destDir, `${stem}-${Date.now()}${ext}`);
  } catch {
    // access が失敗 = ファイルが存在しない → そのまま使う
    return candidate;
  }
}

/**
 * 分類結果に基づいてファイルをルーティングする。
 * - confidence >= threshold かつ routes[category] が存在 → auto（自動振り分け）
 * - それ以外 → review（reviewDir へ）
 * src と dest が同一の場合は移動をスキップする（warn ログ用に reason を設定）。
 * T010 で reason フィールドが追加される。
 */
export async function route(
  filePath: string,
  classification: ClassificationResult,
  config: Config,
): Promise<RouteDecision> {
  const { category, confidence } = classification;
  const autoDir = config.routes[category];
  const isAuto = confidence >= config.confidenceThreshold && autoDir !== undefined;

  const destDir = isAuto ? autoDir : config.reviewDir;

  // review になった理由を記録
  let reviewReason: string | undefined;
  if (!isAuto) {
    if (confidence < config.confidenceThreshold) {
      reviewReason = `信頼スコア不足 (confidence=${confidence} < threshold=${config.confidenceThreshold})`;
    } else {
      reviewReason = `routes に category "${category}" の設定がありません`;
    }
  }

  // 移動先ディレクトリを作成（存在しなければ）
  await fs.mkdir(destDir, { recursive: true });

  const dest = await resolveDestination(filePath, destDir);

  // 移動元と移動先が同じ場合はスキップ
  if (filePath === dest) {
    console.warn(`[Router] 移動元と移動先が同一のためスキップ: ${filePath}`);
    return {
      moveType: isAuto ? 'auto' : 'review',
      destDir,
      ...(reviewReason ? { reason: reviewReason } : {}),
    };
  }

  await moveFile(filePath, dest);

  return {
    moveType: isAuto ? 'auto' : 'review',
    destDir: dest,
    ...(reviewReason ? { reason: reviewReason } : {}),
  };
}
