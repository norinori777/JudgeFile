import { z } from 'zod';

/** config.json の Zod スキーマ定義 */
export const ConfigSchema = z.object({
  /** 監視対象ディレクトリ（絶対パス、必須） */
  watchDir: z.string().min(1),

  /** 最大同時実行数（デフォルト: 2） */
  maxConcurrency: z.number().int().min(1).max(10).default(2),

  /** キューの最大サイズ（デフォルト: 100） */
  maxQueueSize: z.number().int().min(1).max(1000).default(100),

  /** 監査ログファイルのパス（絶対パス、必須） */
  logFile: z.string().min(1),

  /** 抽出テキストの最大文字数（デフォルト: 100_000） */
  maxChars: z.number().int().min(1000).max(1_000_000).default(100_000),

  // ── Round 2: AI 分類・ルーティング ──

  /** レビュー用ディレクトリ（絶対パス、必須） */
  reviewDir: z.string().min(1),

  /** カテゴリ → 移動先ディレクトリのマッピング */
  routes: z.record(z.string(), z.string()).default({}),

  /** 自動振り分けに必要な最低信頼スコア（0.0–1.0、デフォルト: 0.8） */
  confidenceThreshold: z.number().min(0).max(1).default(0.8),

  /** 使用する OpenAI モデル名（デフォルト: gpt-4o-mini） */
  model: z.string().min(1).default('gpt-4o-mini'),

  /** API タイムアウト（ミリ秒、5000–120000、デフォルト: 30000） */
  apiTimeoutMs: z.number().int().min(5_000).max(120_000).default(30_000),

  // ── Round 3: PDF 拡張 ──

  /** 監視対象とするファイル拡張子のリスト（デフォルト: ['.txt', '.md']） */
  watchedExtensions: z.array(z.string().min(1)).default(['.txt', '.md']),
});

/** ConfigSchema から推論した型 */
export type Config = z.infer<typeof ConfigSchema>;
