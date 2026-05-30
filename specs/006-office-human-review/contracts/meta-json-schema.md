# Contract: .meta.json スキーマ

**Feature**: 006-office-human-review | **Date**: 2026-05-30

---

## 概要

`.meta.json` は、ファイルが review フォルダへ移動された時点で `queue.ts` が生成する JSON ファイル。review CLI がこのファイルを読み込んで AI 分類候補をオペレーターに提示するために使用する。

**保存パス**: `<reviewDir>/<元ファイル名>.meta.json`

例: `/data/review/invoice.docx` → `/data/review/invoice.docx.meta.json`

---

## スキーマ定義

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "ReviewMetadata",
  "type": "object",
  "required": ["filePath", "originalName", "category", "tags", "confidence", "confidentiality", "destination", "queuedAt"],
  "additionalProperties": false,
  "properties": {
    "filePath": {
      "type": "string",
      "description": "review フォルダ内のファイル絶対パス"
    },
    "originalName": {
      "type": "string",
      "description": "元ファイル名（basename）。表示用"
    },
    "category": {
      "type": "string",
      "description": "AI が出力したカテゴリ名"
    },
    "tags": {
      "type": "array",
      "items": { "type": "string" },
      "description": "AI が出力したタグ配列"
    },
    "confidence": {
      "type": "number",
      "minimum": 0,
      "maximum": 1,
      "description": "AI 信頼スコア（0.0–1.0）"
    },
    "confidentiality": {
      "type": "string",
      "enum": ["low", "medium", "high"],
      "description": "AI が判定した機密度"
    },
    "destination": {
      "type": "string",
      "description": "AI が推奨する振り分け先（config.routes のキー）"
    },
    "queuedAt": {
      "type": "string",
      "format": "date-time",
      "description": "review フォルダへの移動日時（ISO 8601）"
    }
  }
}
```

---

## フィールド定義

| フィールド | 型 | 必須 | 説明 |
|-----------|-----|------|------|
| `filePath` | string | ✅ | review フォルダ内のファイル絶対パス |
| `originalName` | string | ✅ | 元ファイル名（basename）。表示・保存用 |
| `category` | string | ✅ | AI が出力したカテゴリ |
| `tags` | string[] | ✅ | AI が出力したタグ配列（空配列可） |
| `confidence` | number | ✅ | AI 信頼スコア（0.0–1.0） |
| `confidentiality` | string | ✅ | `'low'` / `'medium'` / `'high'` |
| `destination` | string | ✅ | AI 推奨振り分け先（routes キー） |
| `queuedAt` | string | ✅ | review フォルダ移動日時（ISO 8601） |

**禁止フィールド**:
- 抽出テキスト本文（FR-015）
- パスワード、個人情報

---

## 具体例

```json
{
  "filePath": "/data/review/invoice-2026-05.docx",
  "originalName": "invoice-2026-05.docx",
  "category": "請求書",
  "tags": ["請求", "2026年", "5月"],
  "confidence": 0.62,
  "confidentiality": "low",
  "destination": "請求書",
  "queuedAt": "2026-05-30T10:00:00.000Z"
}
```

---

## 保存・読み込みルール

| 操作 | タイミング | モジュール |
|------|-----------|-----------|
| 生成（書き込み） | route() で `moveType === 'review'` と判定された直後 | `queue.ts` |
| 読み込み | review CLI 起動時に reviewDir をスキャン | `reviewer/index.ts` |
| 削除 | review CLI でオペレーターが承認・修正した後（対象ファイルと同時に移動先へ移動するか、reviewDir から削除） | `reviewer/index.ts` |

**エラーハンドリング**:
- `.meta.json` が存在しない場合: 対応するファイルを CLI がスキップし、警告を表示する
- `.meta.json` の JSON が不正の場合: パースエラーとして警告を表示し、スキップする
- `.meta.json` の書き込みが失敗した場合: `queue.ts` がエラーログを記録するが、ファイルの review フォルダ移動は完了済みとして扱う（ファイルを失わない）
