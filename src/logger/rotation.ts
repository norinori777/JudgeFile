import { statSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * ローカル日時から audit-YYYY-MM-DD.jsonl 形式のベースファイル名を生成する (FR-003, FR-008)
 */
export function getActiveLogBaseName(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `audit-${y}-${m}-${d}.jsonl`;
}

/**
 * ログディレクトリと日付ベースのファイル名、サイズ上限（バイト）を受け取り、
 * 実際に書き込むべきファイルの絶対パスを返す。
 * サイズ上限を超える場合は連番サフィックス（-1, -2, ...）を付与する (FR-003)
 *
 * @param logDir   ログディレクトリの絶対パス
 * @param baseName `audit-YYYY-MM-DD.jsonl` 形式のファイル名
 * @param maxBytes サイズ上限（バイト）
 */
export function resolveRotatedPath(logDir: string, baseName: string, maxBytes: number): string {
  const primary = resolve(logDir, baseName);
  if (!existsSync(primary)) return primary;

  try {
    const size = statSync(primary).size;
    if (size < maxBytes) return primary;
  } catch {
    return primary;
  }

  // サイズ超過: 連番サフィックスを試す
  const stem = baseName.replace(/\.jsonl$/, '');
  for (let n = 1; n <= 999; n++) {
    const candidate = resolve(logDir, `${stem}-${n}.jsonl`);
    if (!existsSync(candidate)) return candidate;
    try {
      const size = statSync(candidate).size;
      if (size < maxBytes) return candidate;
    } catch {
      return candidate;
    }
  }

  // フォールバック（通常到達しない）
  return primary;
}
