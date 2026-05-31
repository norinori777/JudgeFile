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
  ocrEngine?: string;         // OCR 処理を経た場合に設定（例: 'openai-vision'）
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

// ── Round 6: Office 文書対応と人間確認フロー ──

/** review フォルダ内の 1 ファイル + AI 分類メタデータ（インメモリ） */
export interface ReviewItem {
  /** review フォルダ内のファイルパス（絶対パス） */
  filePath: string;
  /** 元ファイル名（表示用） */
  originalName: string;
  /** AI 分類候補 */
  aiClassification: {
    category: string;
    tags: string[];
    confidence: number;
    confidentiality: 'low' | 'medium' | 'high';
    /** AI 推奨振り分け先（routes のキー） */
    destination: string;
  };
  /** review フォルダへの移動日時（ISO 8601） */
  queuedAt: string;
}

/** オペレーターの確認結果 */
export interface ReviewDecision {
  /** 判断した日時（ISO 8601） */
  reviewedAt: string;
  /** 操作種別 */
  action: 'approved' | 'corrected';
  /** 最終的な分類 */
  finalClassification: {
    category: string;
    tags: string[];
    /** 振り分け先フォルダパス（絶対パス） */
    destDir: string;
  };
}

/** corrections.jsonl の 1 エントリ（JSONL 形式で永続化） */
export interface CorrectionRecord {
  /** 元ファイル名（review フォルダ内の名前） */
  fileName: string;
  /** 絶対パス（振り分け後） */
  destFilePath: string;
  /** AI 分類候補のスナップショット */
  aiClassification: {
    category: string;
    tags: string[];
    confidence: number;
    confidentiality: 'low' | 'medium' | 'high';
    destination: string;
  };
  /** 最終的な分類（承認時は AI 候補と同一、修正時は修正後の値） */
  finalClassification: {
    category: string;
    tags: string[];
    /** 最終振り分け先フォルダの絶対パス */
    destDir: string;
  };
  /** approved: AI 分類をそのまま承認 / corrected: 分類を修正して承認 */
  action: 'approved' | 'corrected';
  /** オペレーターが承認した日時（ISO 8601） */
  timestamp: string;
}

/** 監査ログに記録するイベント種別 */
export type AuditEvent = 'started' | 'completed' | 'failed' | 'skipped' | 'rejected' | 'redaction';

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
  ocrEngine?: string;          // OCR 処理を経たファイルにのみ付与（FR-011）
  truncationWarning?: string;  // システム上限（50,000 文字）カット時の警告（FR-008）
  moderationCategories?: string[]; // Moderation ブロック時のフラグカテゴリ名（FR-005）
  // Round 7: 契約情報抽出
  contractSubject?: string | null;
  contractPeriod?: ContractPeriod | null;
  contractExtractionError?: string;
  // Round 9: OWASPセキュリティ強化
  securityRejection?: {
    /** 拒否理由の短い識別子 */
    reason: string;
    /** 検証種別: 'path' | 'size' | 'mime' | 'circular' */
    validationType: string;
  };
  // Round 10: 監査・コンプライアンス強化
  /** 前エントリの currHash。最初のエントリは 'genesis' (FR-001) */
  prevHash?: string;
  /** HMAC-SHA256(JSON.stringify({...entry, prevHash}), AUDIT_HMAC_SECRET) (FR-001) */
  currHash?: string;
  /** SHA-256(匿名化対象識別子) — event='redaction' 時のみ (FR-009) */
  redactedIdentifierHash?: string;
  /** 匿名化したエントリ数 — event='redaction' 時のみ */
  redactedCount?: number;
  /** 匿名化実施日時 ISO 8601 — event='redaction' 時のみ */
  redactedAt?: string;
}

// ── Round 7: 契約情報抽出 ──

/** 契約の規約期間 */
export interface ContractPeriod {
  start: string | null;
  end: string | null;
  note: string | null;
}

/** 契約書から抽出した契約情報 */
export interface ContractInfo {
  contractSubject: string | null;
  contractPeriod: ContractPeriod;
}

// ── Round 9: OWASPセキュリティ強化 ──

/** セキュリティ検証の個別ステップ結果 */
export interface ValidationDetail {
  /** 検証種別 */
  type: 'path' | 'size' | 'mime' | 'circular';
  /** この検証が合格したか */
  passed: boolean;
  /** 失敗時の詳細メッセージ */
  detail?: string;
}

/** パイプライン最前段のセキュリティ検証結果 */
export interface SecurityValidationResult {
  /** 全検証が合格した場合 true */
  passed: boolean;
  /** 拒否理由（passed: false の場合のみ設定） */
  rejectionReason?: string;
  /** 検査時のファイルサイズ（バイト） */
  fileSizeBytes: number;
  /** file-type が検出した MIME タイプ（テキスト系は undefined） */
  detectedMimeType?: string;
  /** 各検証ステップの詳細 */
  validations: ValidationDetail[];
}

// ── Round 10: 監査・コンプライアンス強化 ──

/** 完全性検証の個別違反情報 (FR-002) */
export interface VerificationViolation {
  /** 0-based インデックス */
  entryIndex: number;
  /** 対象エントリの timestamp */
  timestamp: string;
  /** 違反種別 */
  reason: 'hash_mismatch' | 'missing_hash' | 'unexpected_chain_break';
}

/** 完全性検証 CLI の返却型 (FR-002) */
export interface VerificationResult {
  filePath: string;
  totalEntries: number;
  passed: boolean;
  violations: VerificationViolation[];
  /** チェーンリセット点の数（redaction マーカー数） */
  redactionSegments: number;
}
