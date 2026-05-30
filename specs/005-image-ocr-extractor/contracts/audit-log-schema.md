# Contract: 監査ログ（JSONL）スキーマ（Round 4 更新版）

**Feature**: 005-image-ocr-extractor | **Date**: 2026-05-30  
**Replaces**: specs/002-ai-classifier-router/contracts/audit-log-schema.md（Round 2 版を継承・拡張）

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
  "timestamp": "2026-05-30T10:00:00.000Z",
  "filePath": "/data/inbox/scan-document.png"
}
```

---

## `completed` イベント（Round 4: ocrEngine 追加）

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
| `ocrEngine` | `string`（任意）| OCR 処理を経た場合のみ付与。値: `"openai-vision"`（FR-011）**NEW** |

### 画像ファイルの `completed` 例（ocrEngine 付き）

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440010",
  "event": "completed",
  "timestamp": "2026-05-30T10:00:15.200Z",
  "filePath": "/data/inbox/scan-invoice.png",
  "durationMs": 8400,
  "charCount": 720,
  "category": "請求書",
  "confidence": 0.92,
  "tags": ["会計", "2026年度"],
  "confidentiality": "medium",
  "destination": "/data/invoices/scan-invoice.png",
  "moveType": "auto",
  "ocrEngine": "openai-vision"
}
```

### テキストファイルの `completed` 例（ocrEngine なし — 従来どおり）

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440011",
  "event": "completed",
  "timestamp": "2026-05-30T10:00:08.500Z",
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

---

## `skipped` イベント（OCR 結果が空テキストの場合）

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440020",
  "event": "skipped",
  "timestamp": "2026-05-30T10:00:05.100Z",
  "filePath": "/data/inbox/photo.jpg",
  "durationMs": 4800
}
```

*注意*: `skipped` イベントには `ocrEngine` フィールドを付与しない。

---

## `failed` イベント（画像処理失敗の場合）

| フィールド | 型 | 説明 |
|---|---|---|
| `error` | `string` | エラーメッセージ |
| `durationMs` | `number` | 処理時間（ms） |
| `destination` | `string`（任意） | reviewDir への移動先（移動できた場合） |
| `moveType` | `"error"` | 固定値 |

### maxImageSizeMB 超過の場合

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440030",
  "event": "failed",
  "timestamp": "2026-05-30T10:00:01.000Z",
  "filePath": "/data/inbox/large-scan.png",
  "durationMs": 20,
  "error": "画像ファイルサイズ (25.4MB) が maxImageSizeMB (10MB) を超えています",
  "destination": "/data/review/large-scan.png",
  "moveType": "error"
}
```

### OpenAI API エラー / 破損画像の場合

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440031",
  "event": "failed",
  "timestamp": "2026-05-30T10:00:12.000Z",
  "filePath": "/data/inbox/corrupt.png",
  "durationMs": 1200,
  "error": "Invalid image data",
  "destination": "/data/review/corrupt.png",
  "moveType": "error"
}
```

---

## 変更なしのフィールド

Round 1 / Round 2 で定義されたすべてのフィールドの型・意味・存在条件は変更なし。`ocrEngine` は OCR 処理を経た `completed` イベントにのみ追加される任意フィールドであり、既存ログパーサーとの後方互換を維持する。
