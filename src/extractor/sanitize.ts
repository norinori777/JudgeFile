import type OpenAI from 'openai';

/** AI に渡すテキストのシステム上限（文字数）。config.maxChars より優先される */
export const SYSTEM_HARD_LIMIT = 50_000;

/** Moderation API 呼び出しのタイムアウト（ミリ秒） */
const MODERATION_TIMEOUT_MS = 10_000;

/**
 * システム上限（50,000 文字）を適用する。
 * config.maxChars がこの値より大きい場合でも、この上限が優先される。
 * カット発生時は warning フィールドを返す（監査ログの truncationWarning に転記する）。
 */
export function applySystemHardLimit(
  text: string,
): { text: string; warning?: string } {
  if (text.length <= SYSTEM_HARD_LIMIT) return { text };
  return {
    text: text.slice(0, SYSTEM_HARD_LIMIT),
    warning: `システム上限（${SYSTEM_HARD_LIMIT.toLocaleString()} 文字）で切り捨てました`,
  };
}

/**
 * テキスト内の </document> をエスケープし、<document> タグで囲む。
 * classify() に渡す直前にのみ使用する。
 * extractContractInfo() には rawText（エスケープ前）を渡すこと。
 */
export function wrapWithDocumentTag(text: string): string {
  const escaped = text.replaceAll('</document>', '&lt;/document&gt;');
  return `<document>\n${escaped}\n</document>`;
}

/**
 * OpenAI Moderation API でテキストを検査する。
 * - タイムアウト: 10 秒
 * - 例外（タイムアウト・429 等）はそのまま再スローする。
 *   呼び出し側（queue/index.ts）が fail-secure を実装する。
 */
export async function moderateText(
  client: OpenAI,
  text: string,
): Promise<{ flagged: boolean; categories: string[] }> {
  const result = await client.moderations.create(
    { input: text },
    { timeout: MODERATION_TIMEOUT_MS },
  );
  const r = result.results[0];
  if (!r) throw new Error('Moderation API: 結果が空でした');
  const flaggedCategories = Object.entries(r.categories)
    .filter(([, v]) => v)
    .map(([k]) => k);
  return { flagged: r.flagged, categories: flaggedCategories };
}
