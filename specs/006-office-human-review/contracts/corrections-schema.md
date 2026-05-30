# Contract: corrections.jsonl スキーマ

**Feature**: 006-office-human-review | **Date**: 2026-05-30

---

## 概要

`corrections.jsonl` は、review CLI でオペレーターが承認または修正した操作をすべて記録する JSONL（JSON Lines）ファイル。1 行 = 1 エントリ。追記のみで既存行を変更しない。

**保存パス**: `path.dirname(config.logFile) + '/corrections.jsonl'`

例: `config.logFile = '/data/logs/audit.jsonl'` の場合 → `/data/logs/corrections.jsonl`

---

## レコードスキーマ

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "CorrectionRecord",
  "type": "object",
  "required": ["fileName", "destFilePath", "aiClassification", "finalClassification", "action", "timestamp"],
  "additionalProperties": false,
  "properties": {
    "fileName": {
      "type": "string",
      "description": "review フォルダ内の元ファイル名（basename）"
    },
    "destFilePath": {
      "type": "string",
      "description": "承認・修正後にファイルが移動された絶対パス"
    },
    "aiClassification": {
      "type": "object",
      "description": "AI が出力した分類候補のスナップショット",
      "required": ["category", "tags", "confidence", "confidentiality", "destination"],
      "properties": {
        "category": { "type": "string" },
        "tags": { "type": "array", "items": { "type": "string" } },
        "confidence": { "type": "number", "minimum": 0, "maximum": 1 },
        "confidentiality": { "type": "string", "enum": ["low", "medium", "high"] },
        "destination": { "type": "string" }
      }
    },
    "finalClassification": {
      "type": "object",
      "description": "最終的な分類（承認時は AI 候補と同一、修正時は修正後の値）",
      "required": ["category", "tags", "destDir"],
      "properties": {
        "category": { "type": "string" },
        "tags": { "type": "array", "items": { "type": "string" } },
        "destDir": { "type": "string", "description": "最終振り分け先フォルダの絶対パス" }
      }
    },
    "action": {
      "type": "string",
      "enum": ["approved", "corrected"],
      "description": "approved: AI 分類をそのまま承認 / corrected: 分類を修正して承認"
    },
    "timestamp": {
      "type": "string",
      "format": "date-time",
      "description": "オペレーターが承認した日時（ISO 8601）"
    }
  }
}
```

---

## フィールド定義

| フィールド | 型 | 必須 | 説明 |
|-----------|-----|------|------|
| `fileName` | string | ✅ | review フォルダ内の元ファイル名（`basename`） |
| `destFilePath` | string | ✅ | 移動後のファイル絶対パス（重複回避でタイムスタンプ付きになる場合あり） |
| `aiClassification` | object | ✅ | AI 分類候補のスナップショット（`.meta.json` から読み込んだ値） |
| `aiClassification.category` | string | ✅ | AI カテゴリ |
| `aiClassification.tags` | string[] | ✅ | AI タグ |
| `aiClassification.confidence` | number | ✅ | AI 信頼スコア |
| `aiClassification.confidentiality` | string | ✅ | AI 機密度 |
| `aiClassification.destination` | string | ✅ | AI 推奨振り分け先（routes キー） |
| `finalClassification` | object | ✅ | 最終決定分類 |
| `finalClassification.category` | string | ✅ | 最終カテゴリ（承認時は AI と同一） |
| `finalClassification.tags` | string[] | ✅ | 最終タグ（承認時は AI と同一） |
| `finalClassification.destDir` | string | ✅ | 最終振り分け先フォルダの絶対パス |
| `action` | string | ✅ | `'approved'` または `'corrected'` |
| `timestamp` | string | ✅ | 承認日時（ISO 8601） |

**禁止フィールド**:
- 抽出テキスト本文（FR-015）

---

## 具体例（2 エントリ）

```jsonl
{"fileName":"invoice-2026-05.docx","destFilePath":"/data/invoices/invoice-2026-05.docx","aiClassification":{"category":"請求書","tags":["請求","2026年"],"confidence":0.62,"confidentiality":"low","destination":"請求書"},"finalClassification":{"category":"請求書","tags":["請求","2026年"],"destDir":"/data/invoices"},"action":"approved","timestamp":"2026-05-30T10:05:00.000Z"}
{"fileName":"meeting-notes.xlsx","destFilePath":"/data/others/meeting-notes.xlsx","aiClassification":{"category":"請求書","tags":["請求"],"confidence":0.55,"confidentiality":"low","destination":"請求書"},"finalClassification":{"category":"議事録","tags":["会議","5月"],"destDir":"/data/others"},"action":"corrected","timestamp":"2026-05-30T10:07:30.000Z"}
```

---

## 書き込みルール

| 規則 | 内容 |
|------|------|
| モード | 追記（append）のみ。既存行を変更・削除しない |
| エンコード | UTF-8 |
| 改行 | LF（`\n`）、各行末尾 |
| 空行 | 含めない |
| タイミング | ファイル移動が完了した直後に追記する |
| 失敗時 | 追記エラーをコンソールに表示し、次のファイルに進む（ファイル移動済みのため review フォルダには戻さない） |

---

## audit.log との違い

| 項目 | `audit.jsonl`（既存） | `corrections.jsonl`（新規） |
|------|----------------------|---------------------------|
| 記録タイミング | 自動処理（watcher → queue） | 人間確認（review CLI） |
| 書き込みモジュール | `logger/index.ts` | `reviewer/index.ts` |
| 記録内容 | すべてのファイル処理イベント | review フォルダの承認・修正のみ |
| テキスト本文 | 含めない | 含めない |
