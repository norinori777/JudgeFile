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

  // ── Round 4: 画像 OCR ──

  /** 画像ファイルの最大サイズ（MB 単位、デフォルト: 10）。超過時は event: 'failed' で reviewDir へ移動 */
  maxImageSizeMB: z.number().int().min(1).max(1000).default(10),

  // ── Round 7: 契約情報抽出 ──

  /** 契約書カテゴリの正規ラベル（デフォルト: '契約書'）。大文字小文字を区別しない比較で使用する */
  contractCategoryLabel: z.string().default('契約書'),

  // ── Round 9: OWASPセキュリティ強化 ──

  /** 監査ログでマスクするフィールド名のリスト（デフォルト: ["contractSubject", "contractPeriod"]） */
  sensitiveFields: z.array(z.string()).default(['contractSubject', 'contractPeriod']),

  /** ファイルタイプ別の最大サイズ（MB）。キー "default" が必須フォールバック。省略時は { default: 50 } */
  maxFileSizeMB: z.object({ default: z.number().int().min(1).max(1000).default(50) })
    .catchall(z.number().int().min(1).max(1000))
    .default({ default: 50 }),

  // ── Round 10: 監査・コンプライアンス強化 ──

  /** ログ保持・ローテーション設定 (FR-003, FR-004, FR-008) */
  logRetention: z.object({
    /** ログファイル保持日数。0 = 削除しない（デフォルト: 365） */
    retentionDays: z.number().int().min(0).default(365),
    /** ファイルサイズ上限（MB）。超過でローテーション（デフォルト: 10） */
    maxLogSizeMB: z.number().int().min(1).max(1000).default(10),
  }).default({ retentionDays: 365, maxLogSizeMB: 10 }),
});

/** ConfigSchema から推論した型 */
export type Config = z.infer<typeof ConfigSchema>;
