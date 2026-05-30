import { z } from 'zod';
import OpenAI from 'openai';
import { promises as fs } from 'node:fs';
import type { Config } from '../config/schema.js';

// ── ContractInfoSchema（Zod）──

export const ContractInfoSchema = z.object({
  contractSubject: z.string().nullable(),
  contractPeriod: z.object({
    start: z.string().nullable(),
    end: z.string().nullable(),
    note: z.string().nullable(),
  }),
});

export type ContractInfo = z.infer<typeof ContractInfoSchema>;

// ── プロンプト生成 ──

export function buildContractPrompt(): string {
  return `あなたは契約書の内容を解析するアシスタントです。
与えられたテキストを読み、以下の JSON 形式のみで回答してください。他の文章は一切含めないでください。

{
  "contractSubject": "<契約の主たる対象（商品名・サービス名・取引先名など最主要の1件）。読み取れない場合は null>",
  "contractPeriod": {
    "start": "<契約開始日。読み取れない場合は null>",
    "end": "<契約終了日。読み取れない場合は null>",
    "note": "<「自動更新」など start/end で表せない備考。start/end が取得できた場合は null>"
  }
}

ルール:
- contractSubject は最も主要な契約対象を 1 件のみ文字列で返す（配列にしない）
- 日付は文書に記載された表記をそのまま使用する（変換しない）
- 読み取れない項目は null とする
- JSON 以外の出力を一切含めない`;
}

// ── 契約情報抽出 ──

/**
 * 分類済みテキストから契約対象・規約期間を抽出する。
 * classify() と同パターンで OpenAI SDK を使用し、JSON mode で応答を受け取る。
 * タイムアウト・429・JSON パース失敗・スキーマ不一致はすべて例外としてスローする（呼び出し側で catch する）。
 */
export async function extractContractInfo(text: string, config: Config): Promise<ContractInfo> {
  const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    timeout: config.apiTimeoutMs,
  });

  const systemPrompt = buildContractPrompt();

  let raw: string;
  try {
    const response = await client.chat.completions.create({
      model: config.model,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: text },
      ],
    });
    raw = response.choices[0]?.message?.content ?? '';
  } catch (err) {
    if (err instanceof OpenAI.APIConnectionTimeoutError) {
      throw new Error(`契約情報抽出タイムアウト: ${config.apiTimeoutMs}ms を超過しました`);
    }
    if (err instanceof OpenAI.RateLimitError) {
      throw new Error(`契約情報抽出失敗: レートリミット (429)`);
    }
    if (err instanceof OpenAI.APIError) {
      throw new Error(`契約情報抽出失敗: ${err.message} (status=${err.status})`);
    }
    throw new Error(`契約情報抽出失敗: ${err instanceof Error ? err.message : String(err)}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`契約情報抽出結果の JSON パース失敗: ${raw.slice(0, 200)}`);
  }

  const result = ContractInfoSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(`契約情報抽出結果のスキーマ検証失敗: ${result.error.message}`);
  }

  return result.data;
}

// ── .meta.json 更新 ──

/**
 * 振り分け先の .meta.json に contractSubject・contractPeriod フィールドを追記する。
 * destDir はファイルパス（decision.destDir）であり、`.meta.json` は `destDir + '.meta.json'` として解決する。
 * .meta.json が存在しない場合は警告を出力してスキップする（FR-005）。
 */
export async function updateMetaJson(destDir: string, contractInfo: ContractInfo): Promise<void> {
  const metaPath = destDir + '.meta.json';

  let existing: Record<string, unknown>;
  try {
    const raw = await fs.readFile(metaPath, 'utf-8');
    existing = JSON.parse(raw) as Record<string, unknown>;
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') {
      console.warn(`[contract] .meta.json が存在しないためスキップします: ${metaPath}`);
      return;
    }
    throw err;
  }

  const updated = {
    ...existing,
    contractSubject: contractInfo.contractSubject,
    contractPeriod: contractInfo.contractPeriod,
  };

  await fs.writeFile(metaPath, JSON.stringify(updated, null, 2) + '\n', 'utf-8');
}
