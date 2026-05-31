# Contract: 監査ログスキーマ変更仕様（Feature 008）

**Feature**: 008-prompt-injection-guard  
**Date**: 2026-05-31  
**対象ファイル**: `logFile` パスの JSONL ファイル（既存）

---

## 概要

Feature 008 で `AuditLogEntry` に 2 フィールドを追加する。既存フィールドの削除・型変更はない。

---

## 追加フィールド

### `truncationWarning?: string`

| 項目 | 値 |
|---|---|
| フィールド名 | `truncationWarning` |
| 型 | `string`（省略可） |
| 記録タイミング | システム上限（50,000 文字）で切り捨てが発生した `completed` イベント |
| 固定文言 | `"システム上限（50,000 文字）で切り捨てました"` |
| 既存 `error` フィールドとの関係 | 独立フィールド。既存の `error`（review 理由・API エラー）との重複を解消 |

### `moderationCategories?: string[]`

| 項目 | 値 |
|---|---|
| フィールド名 | `moderationCategories` |
| 型 | `string[]`（省略可） |
| 記録タイミング | Moderation API がフラグを立てた `failed` イベント |
| 値の例 | `["violence", "hate"]` |
| スコアの記録 | なし（プライバシー・ログ肥大化防止） |

---

## 監査ログエントリ例

### 正常系（`<document>` タグラップ・システム上限切り捨てあり）

```jsonl
{
  "id": "abc123",
  "event": "completed",
  "timestamp": "2026-05-31T10:00:00.000Z",
  "filePath": "/watch/請求書.txt",
  "durationMs": 1200,
  "charCount": 50000,
  "truncationWarning": "システム上限（50,000 文字）で切り捨てました",
  "category": "請求書",
  "confidence": 0.95,
  "tags": ["請求", "取引先A"],
  "confidentiality": "medium",
  "destination": "/sorted/請求書/請求書_20260531.txt",
  "moveType": "auto"
}
```

### Moderation ブロック（failed）

```jsonl
{
  "id": "def456",
  "event": "failed",
  "timestamp": "2026-05-31T10:01:00.000Z",
  "filePath": "/watch/suspicious.txt",
  "durationMs": 800,
  "error": "moderation_blocked",
  "moderationCategories": ["violence", "hate/threatening"],
  "moveType": "error",
  "destination": "/review/suspicious_20260531.txt"
}
```

### Moderation タイムアウト（fail-secure）

```jsonl
{
  "id": "ghi789",
  "event": "failed",
  "timestamp": "2026-05-31T10:02:00.000Z",
  "filePath": "/watch/unknown.txt",
  "durationMs": 10050,
  "error": "moderation_error: Moderation API タイムアウト（10000ms）",
  "moveType": "error",
  "destination": "/review/unknown_20260531.txt"
}
```

---

## 後方互換性

- 既存フィールドの削除・型変更なし
- 新フィールドはいずれもオプション（省略可）
- JSONL パーサーは未知フィールドを無視するため、Feature 008 前後のログを同一ファイルに混在可能
