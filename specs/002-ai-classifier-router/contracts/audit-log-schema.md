---
description: "Audit log schema contract (Round 1 + Round 2 extensions)"
---

# コントラクト: 監査ログ（JSONL）スキーマ

**Feature**: `002-ai-classifier-router`（Round 1 ログ形式を継承・拡張）
**Date**: 2026-05-17

---

## ログフォーマット

各行が 1 件の JSON オブジェクト（JSON Lines 形式）。

---

## 共通フィールド（全イベント）

| フィールド | 型 | 説明 |
|---|---|---|
| `id` | `string` (UUID v4) | `crypto.randomUUID()` で生成 |
| `event` | `"started" \| "completed" \| "failed" \| "skipped"` | 処理イベント種別 |
| `timestamp` | `string` (ISO 8601) | イベント発生時刻（UTC） |
| `filePath` | `string` | 処理ファイルの絶対パス |

---

## `started` イベント

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "event": "started",
  "timestamp": "2026-05-17T10:00:00.000Z",
  "filePath": "/data/inbox/invoice-2026.txt"
}
```

---

## `completed` イベント（Round 2 フィールド追加）

| フィールド | 型 | 説明 |
|---|---|---|
| `durationMs` | `number` | 処理時間（ms） |
| `charCount` | `number` | 抽出文字数 |
| `category` | `string` | AI 判定カテゴリ |
| `confidence` | `number` 0〜1 | AI 信頼度スコア |
| `tags` | `string[]` | AI 付与タグ |
| `confidentiality` | `"low" \| "medium" \| "high"` | 機密度 |
| `destination` | `string` (絶対パス) | 実際の移動先ファイルパス |
| `moveType` | `"auto" \| "review"` | 振り分け種別 |

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440001",
  "event": "completed",
  "timestamp": "2026-05-17T10:00:08.500Z",
  "filePath": "/data/inbox/invoice-2026.txt",
  "durationMs": 3200,
  "charCount": 1450,
  "category": "請求書",
  "confidence": 0.95,
  "tags": ["会計", "2026年度"],
  "confidentiality": "medium",
  "destination": "/data/invoices/invoice-2026.txt",
  "moveType": "auto"
}
```

### review フォルダへ移動した場合（moveType: "review"）

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440002",
  "event": "completed",
  "timestamp": "2026-05-17T10:00:07.200Z",
  "filePath": "/data/inbox/unknown-doc.txt",
  "durationMs": 2800,
  "charCount": 820,
  "category": "不明資料",
  "confidence": 0.55,
  "tags": [],
  "confidentiality": "low",
  "destination": "/data/review/unknown-doc.txt",
  "moveType": "review"
}
```

---

## `failed` イベント（Round 2 フィールド追加）

| フィールド | 型 | 説明 |
|---|---|---|
| `error` | `string` | エラーメッセージ |
| `durationMs` | `number` | 処理時間（ms） |
| `destination` | `string` (絶対パス)（任意） | エラー後の review フォルダ移動先（移動できた場合） |
| `moveType` | `"error"` | 固定値 |

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440003",
  "event": "failed",
  "timestamp": "2026-05-17T10:00:32.100Z",
  "filePath": "/data/inbox/corrupt-doc.txt",
  "durationMs": 30100,
  "error": "APIConnectionTimeoutError: Request timed out after 30000ms",
  "destination": "/data/review/corrupt-doc.txt",
  "moveType": "error"
}
```

---

## `skipped` イベント

空テキスト（FR-015）の場合。Round 1 と形式は同じ（Round 2 拡張フィールドなし）。

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440004",
  "event": "skipped",
  "timestamp": "2026-05-17T10:00:01.000Z",
  "filePath": "/data/inbox/empty.txt",
  "error": "empty text"
}
```

---

## 変更履歴

| バージョン | 変更内容 |
|---|---|
| Round 1 | `started`, `completed`（durationMs, charCount）, `failed`（error）, `skipped`（error）を定義 |
| Round 2 | `completed` に `category`, `confidence`, `tags`, `confidentiality`, `destination`, `moveType` を追加。`failed` に `destination`, `moveType` を追加 |
