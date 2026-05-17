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
});

/** ConfigSchema から推論した型 */
export type Config = z.infer<typeof ConfigSchema>;
