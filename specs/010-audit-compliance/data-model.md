# Data Model: 監査・コンプライアンス強化

**Phase 1 完了日**: 2026-06-01
**Feature**: 010-audit-compliance

---

## 1. AuditLogEntry（拡張）

既存の `AuditLogEntry` 型（`src/types/index.ts`）に完全性保証フィールドを追加する。

```typescript
/** 既存フィールド（'skipped' を追加、'redaction' を新規追加） */
export type AuditEvent =
  | 'started' | 'completed' | 'failed' | 'skipped' | 'rejected'
  | 'redaction';          // NEW: 匿名化マーカーエントリ

export interface AuditLogEntry {
  // ── 既存フィールド ──
  id: string;              // crypto.randomUUID()
  event: AuditEvent;
  filePath: string;
  timestamp: string;       // ISO 8601
  durationMs?: number;     // completed / failed 時に設定
  charCount?: number;      // completed 時に設定
  error?: string;          // failed / review 時に設定
  category?: string;
  tags?: string[];
  confidence?: number;
  confidentiality?: 'low' | 'medium' | 'high';
  destination?: string;
  moveType?: string;
  ocrEngine?: string;
  truncationWarning?: string;
  moderationCategories?: string[];
  contractSubject?: string | null;
  contractPeriod?: ContractPeriod | null;
  contractExtractionError?: string;
  securityRejection?: { reason: string; validationType: string };

  // ── NEW: 完全性保証フィールド（FR-001）──
  // オプショナル: Feature 010 以前のログ（レガシー）には存在しない
  prevHash?: string;       // 前エントリの currHash、最初のエントリは 'genesis'
  currHash?: string;       // HMAC-SHA256( JSON.stringify({...entry, prevHash}), AUDIT_HMAC_SECRET )

  // ── NEW: redaction マーカー専用フィールド（FR-006 / Q4）──
  redactedIdentifierHash?: string; // SHA-256(匿名化対象の識別子) — event='redaction' 時のみ
  redactedCount?: number;          // 匿名化したエントリ数 — event='redaction' 時のみ
  redactedAt?: string;             // 匿名化実施日時（ISO 8601）— event='redaction' 時のみ
}
```

### バリデーションルール
- `prevHash`: Feature 010 以降のエントリでは必須。最初のエントリは固定値 `'genesis'`
- `currHash`: Feature 010 以降のエントリでは必須。`HMAC-SHA256` で計算。長さ 64 文字（hex 文字列）
- `event = 'redaction'` の場合: `redactedIdentifierHash`・`redactedCount`・`redactedAt` が必須
- `id`: `crypto.randomUUID()` による UUIDv4。Feature 010 以降の全エントリに必須

### 後方互換性
- 既存ログファイル（`prevHash`/`currHash` なし）は検証スキップ対象とし、エラーにしない
- 検証 CLI は integrity フィールドが欠落したエントリを「レガシーエントリ」として警告表示する

---

## 2. LogRetentionConfig

`src/config/schema.ts` の `ConfigSchema` に追加する Zod スキーマ。

```typescript
// config.json への追加フィールド
logRetention: z.object({
  retentionDays: z.number().int().min(0).default(365),
  maxLogSizeMB: z.number().int().min(1).max(1000).default(10),
}).default({ retentionDays: 365, maxLogSizeMB: 10 })
```

### フィールド定義
| フィールド | 型 | デフォルト | 説明 |
|-----------|-----|-----------|------|
| `retentionDays` | `number`（整数、≥0） | `365` | ログ保持日数。`0` の場合は削除しない |
| `maxLogSizeMB` | `number`（整数、1–1000） | `10` | ファイルローテーション上限（MB） |

---

## 3. VerificationResult（完全性検証結果）

```typescript
/** 完全性検証 CLI（verify-log.ts）の返却型 */
export interface VerificationResult {
  filePath: string;
  totalEntries: number;
  passed: boolean;
  violations: VerificationViolation[];
  redactionSegments: number;  // チェーンリセット点の数（redaction マーカー数）
}

export interface VerificationViolation {
  entryIndex: number;           // 0-based
  timestamp: string;            // 対象エントリの timestamp
  reason: 'hash_mismatch' | 'missing_hash' | 'unexpected_chain_break';
}
```

---

## 4. RedactionRecord（匿名化操作記録）

これは `AuditLogEntry`（`event: 'redaction'`）として保存されるため、独立した型は不要。
ただし匿名化 CLI の内部ワーキング型として以下を定義する。

```typescript
/** redact-log.ts / redactEntries() の返却型（src/logger/redaction.ts） */
export interface RedactionSummary {
  /** 処理したログファイルパス */
  filePath: string;
  /** このファイルで匿名化されたエントリ数 */
  redactedCount: number;
  /** 匿名化対象識別子の SHA-256 ハッシュ（hex 64文字） */
  redactedIdentifierHash: string;
  /** ドライランモードかどうか（true = ファイルを実際には変更しない） */
  dryRun: boolean;
}
```

> **注意**: `redactEntries()` はファイル単位で `RedactionSummary` を返す。CLI (`redact-log.ts`) は複数ファイルを走査し、`redactedCount` を合算して集計を標準出力に表示する。

---

## 5. ファイル命名規則

| 種別 | 命名パターン | 例 |
|------|------------|-----|
| アクティブログ | `audit-YYYY-MM-DD.jsonl` | `audit-2026-06-01.jsonl` |
| 同日サイズ超過分 | `audit-YYYY-MM-DD-{N}.jsonl` | `audit-2026-06-01-1.jsonl` |
| レガシーログ（フィーチャ以前） | `audit.jsonl`（固定名） | — |

### ディレクトリ構成
`config.json` の `logFile` フィールドが指すパス（例: `/data/logs/audit.jsonl`）の **親ディレクトリ** をログディレクトリとして使用する。ローテーション後ファイルも同ディレクトリに配置する。

---

## 6. 状態遷移（ログファイルのライフサイクル）

```
[書き込み中（アクティブ）]
       │
       ├─ ファイルサイズ >= maxLogSizeMB ──→ [ローテーション] ──→ [保持中]
       │
       └─ 深夜0時（日付変更）──→ [ローテーション] ──→ [保持中]
                                                         │
                                              起動時クリーンアップ
                                                         │
                                   経過日数 > retentionDays ──→ [削除済]
```
