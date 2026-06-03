import { promises as fs } from 'node:fs';
import { basename, extname, join, parse } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Config } from '../config/schema.js';
import type { ClassificationResult, RouteDecision } from '../types/index.js';

/** 不一致時のフォールバック先カテゴリキー（FR-003） */
const FALLBACK_ROUTE_KEY = 'その他';

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
    // ファイルが存在する → UUID サフィックス付き名前を使う（TOCTOU 対策、FR-004）
    return join(destDir, `${stem}-${randomUUID()}${ext}`);
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
  const isHighConfidence = confidence >= config.confidenceThreshold;
  const exactDir = config.routes[category];
  const fallbackDir = config.routes[FALLBACK_ROUTE_KEY];

  // 優先度 1: 完全一致 — 設定済みカテゴリへ自動振り分け（FR-007）
  // 優先度 2: 「その他」フォールバック — 不一致 + 「その他」存在 + 信頼スコア十分（FR-003）
  // 優先度 3: review — 低信頼度 または「その他」未設定（FR-004/005）
  let destDir: string;
  let moveType: 'auto' | 'review';
  let reviewReason: string | undefined;

  if (isHighConfidence && exactDir !== undefined) {
    destDir = exactDir;
    moveType = 'auto';
  } else if (isHighConfidence && category !== FALLBACK_ROUTE_KEY && fallbackDir !== undefined) {
    destDir = fallbackDir;
    moveType = 'auto';
    reviewReason = `routes に category "${category}" の設定がないため「${FALLBACK_ROUTE_KEY}」へ振り分け`;
  } else {
    destDir = config.reviewDir;
    moveType = 'review';
    if (!isHighConfidence) {
      reviewReason = `信頼スコア不足 (confidence=${confidence} < threshold=${config.confidenceThreshold})`;
    } else {
      reviewReason = `routes に category "${category}" の設定がなく「${FALLBACK_ROUTE_KEY}」も未設定`;
    }
  }

  // 移動先ディレクトリを作成（存在しなければ）
  await fs.mkdir(destDir, { recursive: true });

  const dest = await resolveDestination(filePath, destDir);

  // 移動元と移動先が同じ場合はスキップ
  if (filePath === dest) {
    console.warn(`[Router] 移動元と移動先が同一のためスキップ: ${filePath}`);
    return {
      moveType,
      destDir,
      ...(reviewReason ? { reason: reviewReason } : {}),
    };
  }

  await moveFile(filePath, dest);

  return {
    moveType,
    destDir: dest,
    ...(reviewReason ? { reason: reviewReason } : {}),
  };
}
