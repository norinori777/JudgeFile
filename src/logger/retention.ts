import { readdirSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';

/** audit-YYYY-MM-DD.jsonl または audit-YYYY-MM-DD-N.jsonl にマッチする正規表現 */
const LOG_FILE_PATTERN = /^audit-(\d{4}-\d{2}-\d{2})(-\d+)?\.jsonl$/;

/**
 * ファイル名から日付文字列 (YYYY-MM-DD) を抽出する。
 * パターン外のファイルは null を返す。
 */
export function extractDateFromLogName(fileName: string): string | null {
  const m = LOG_FILE_PATTERN.exec(fileName);
  return m ? (m[1] ?? null) : null;
}

/**
 * logDir 内の保持期間超過ログファイルを削除して、削除されたファイルパスの配列を返す (FR-004)
 *
 * @param logDir       ログディレクトリの絶対パス
 * @param retentionDays 保持日数。0 の場合は何も削除しない
 * @param now          現在日時（テスト用注入可能）
 */
export function runRetentionCleanup(
  logDir: string,
  retentionDays: number,
  now: Date = new Date(),
): string[] {
  if (retentionDays === 0) return [];

  let files: string[];
  try {
    files = readdirSync(logDir);
  } catch {
    return [];
  }

  const deleted: string[] = [];
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - retentionDays);
  const cutoffStr = formatDate(cutoff); // YYYY-MM-DD

  for (const fileName of files) {
    const dateStr = extractDateFromLogName(fileName);
    if (!dateStr) continue;
    if (dateStr < cutoffStr) {
      const filePath = resolve(logDir, fileName);
      try {
        unlinkSync(filePath);
        deleted.push(filePath);
      } catch {
        // 削除失敗は無視して続行
      }
    }
  }

  return deleted;
}

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
