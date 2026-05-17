/** ジョブのライフサイクル状態 */
export type JobStatus = 'waiting' | 'processing' | 'done' | 'failed';

/** キューに積まれる処理単位 */
export interface Job {
  filePath: string;
  status: JobStatus;
  enqueuedAt: string; // ISO 8601
  startedAt?: string;
  completedAt?: string;
  errorMessage?: string;
}

/**
 * ファイルから抽出されたテキスト（メモリ内のみ — FR-011 により永続化禁止）
 * text フィールドは一切ログ・ファイルに書き出してはならない
 */
export interface ExtractedText {
  filePath: string;
  text: string;
  charCount: number;
  truncationWarning?: string; // maxChars で切り捨てた場合に設定
}

/** AI 分類結果 */
export interface ClassificationResult {
  category: string;
  tags: string[];
  summary: string;
  confidentiality: 'low' | 'medium' | 'high';
  confidence: number;
  destination: string;
}

/** ファイル移動種別 */
export type MoveType = 'auto' | 'review' | 'error';

/** ルーティング決定 */
export interface RouteDecision {
  moveType: MoveType;
  destDir: string;
  reason?: string;
}

/** 監査ログに記録するイベント種別 */
export type AuditEvent = 'started' | 'completed' | 'failed' | 'skipped';

/** イベントに対応する結果分類 */
export type AuditResult = 'ok' | 'error' | 'skip';

/** JSON Lines 監査ログの 1 エントリ（FR-006） */
export interface AuditLogEntry {
  id: string;          // crypto.randomUUID()
  event: AuditEvent;
  timestamp: string;   // ISO 8601
  filePath: string;
  durationMs?: number; // completed / failed 時に設定
  charCount?: number;  // completed 時に設定
  error?: string;      // failed / review 時に設定（truncationWarning のコピーも含む）
  // Round 2: AI 分類・ルーティング結果
  category?: string;
  confidence?: number;
  tags?: string[];
  confidentiality?: 'low' | 'medium' | 'high';
  destination?: string;
  moveType?: MoveType;
}
