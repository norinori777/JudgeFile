import { z } from 'zod';

/** AI 分類結果の Zod スキーマ（response_format: json_object の出力検証用） */
export const ClassificationResultSchema = z.object({
  /** 書類カテゴリ（任意の文字列、制約なし） */
  category: z.string().min(1),
  /** 関連タグ */
  tags: z.array(z.string()),
  /** 内容の要約 */
  summary: z.string(),
  /** 機密レベル */
  confidentiality: z.enum(['low', 'medium', 'high']),
  /** 分類の確信度 0.0–1.0 */
  confidence: z.number().min(0).max(1),
  /** 推奨する振り分け先カテゴリ名 */
  destination: z.string().min(1),
});

/**
 * AI へ送るシステムプロンプト。
 * カテゴリの候補リストは設けず、内容に基づいて自由に分類する。
 */
export const SYSTEM_PROMPT = `あなたはファイル内容を分析して分類するアシスタントです。
与えられたテキストを読み、以下の JSON 形式のみで回答してください。他の文章は一切含めないでください。

{
  "category": "<書類の主カテゴリ（例: 契約書、請求書、技術仕様書、メモなど）>",
  "tags": ["<関連タグ1>", "<関連タグ2>"],
  "summary": "<内容の簡潔な要約（100文字以内）>",
  "confidentiality": "<機密レベル: low / medium / high のいずれか>",
  "confidence": <分類の確信度 0.0〜1.0 の数値>,
  "destination": "<推奨する振り分け先カテゴリ名（英数字とアンダースコアのみ）>"
}

分類に際してカテゴリの制約はありません。内容を最もよく表すカテゴリを自由に設定してください。`;
