import { readFile, access, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { ConfigSchema, type Config } from './schema.js';

/**
 * config.json を読み込み、Zod スキーマで検証して返す。
 * watchDir が存在しない場合、または検証エラーがある場合はプロセスを終了する。
 */
export async function loadConfig(configPath: string): Promise<Config> {
  let raw: string;
  try {
    raw = await readFile(configPath, 'utf-8');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[JudgeFile] config.json を読み込めません: ${message}`);
    process.exit(1);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    console.error('[JudgeFile] config.json が有効な JSON ではありません');
    process.exit(1);
  }

  const result = ConfigSchema.safeParse(parsed);
  if (!result.success) {
    console.error('[JudgeFile] config.json のバリデーションエラー:');
    console.error(result.error.format());
    process.exit(1);
  }

  const config = result.data;

  // watchDir の存在確認
  try {
    await access(config.watchDir);
  } catch {
    console.error(`[JudgeFile] watchDir が存在しません: ${config.watchDir}`);
    process.exit(1);
  }

  // logFile の親ディレクトリを作成（存在しない場合）
  await mkdir(dirname(config.logFile), { recursive: true });

  return config;
}
