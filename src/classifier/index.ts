import OpenAI from 'openai';
import type { Config } from '../config/schema.js';
import type { ClassificationResult } from '../types/index.js';
import { ClassificationResultSchema, SYSTEM_PROMPT } from './schema.js';

/**
 * テキストを AI で分類して結果を返す。
 * エラー（タイムアウト・429・JSON パース失敗・スキーマ不一致）はすべて例外として再スローする。
 * リトライは行わない（T011）。
 */
export async function classify(text: string, config: Config): Promise<ClassificationResult> {
  const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    timeout: config.apiTimeoutMs,
  });

  let raw: string;
  try {
    const response = await client.chat.completions.create({
      model: config.model,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: text },
      ],
    });
    raw = response.choices[0]?.message?.content ?? '';
  } catch (err) {
    if (err instanceof OpenAI.APIConnectionTimeoutError) {
      throw new Error(`AI 分類タイムアウト: ${config.apiTimeoutMs}ms を超過しました`);
    }
    if (err instanceof OpenAI.RateLimitError) {
      throw new Error(`AI 分類失敗: レートリミット (429)`);
    }
    if (err instanceof OpenAI.APIError) {
      throw new Error(`AI 分類失敗: ${err.message} (status=${err.status})`);
    }
    throw new Error(`AI 分類失敗: ${err instanceof Error ? err.message : String(err)}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`AI 分類結果の JSON パース失敗: ${raw.slice(0, 200)}`);
  }

  const result = ClassificationResultSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(`AI 分類結果のスキーマ検証失敗: ${result.error.message}`);
  }

  return result.data;
}
