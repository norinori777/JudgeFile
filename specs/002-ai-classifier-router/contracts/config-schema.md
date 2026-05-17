---
description: "Config schema contract (Round 1 + Round 2 extensions)"
---

# コントラクト: config.json スキーマ

**Feature**: `002-ai-classifier-router`（Round 1 スキーマを継承・拡張）
**Date**: 2026-05-17

---

## スキーマ定義

| フィールド | 型 | 必須 | デフォルト | 説明 |
|---|---|:---:|---|---|
| `watchDir` | `string` (絶対パス) | ✅ | — | 監視ディレクトリ |
| `maxConcurrency` | `integer` 1〜10 | | `2` | 最大同時処理数 |
| `maxQueueSize` | `integer` 1〜1000 | | `100` | キュー最大積み件数 |
| `logFile` | `string` (絶対パス) | ✅ | — | 監査ログファイルパス（JSONL） |
| `maxChars` | `integer` 1000〜1000000 | | `100000` | テキスト最大文字数 |
| `reviewDir` | `string` (絶対パス) | ✅ | — | 低信頼度・エラー時の review フォルダ |
| `routes` | `Record<string, string>` | | `{}` | カテゴリ名 → 絶対パス マッピング |
| `confidenceThreshold` | `number` 0〜1 | | `0.8` | 自動振り分け信頼度閾値（以上で auto） |
| `model` | `string` | | `"gpt-4o-mini"` | 使用する OpenAI モデル名 |
| `apiTimeoutMs` | `integer` 5000〜120000 | | `30000` | OpenAI API タイムアウト（ms） |

---

## サンプル config.json（Round 2 完全例）

```json
{
  "watchDir": "/data/inbox",
  "maxConcurrency": 2,
  "maxQueueSize": 100,
  "logFile": "/data/logs/audit.jsonl",
  "maxChars": 100000,
  "reviewDir": "/data/review",
  "routes": {
    "請求書":  "/data/invoices",
    "契約書":  "/data/contracts",
    "議事録":  "/data/minutes",
    "マニュアル": "/data/manuals"
  },
  "confidenceThreshold": 0.8,
  "model": "gpt-4o-mini",
  "apiTimeoutMs": 30000
}
```

---

## バリデーション規則

1. `watchDir`, `logFile`, `reviewDir` は必須。Zod が解析時にエラーを返す。
2. `routes` の値はすべて文字列（絶対パスを推奨）。パス存在確認は起動時に行い、なければ `mkdir -p` で作成する。
3. `confidenceThreshold` の境界値は **以上（>=）** として扱う（FR-005）。
4. `apiTimeoutMs` は整数のみ（5000ms 未満および 120000ms 超は起動時エラー）。

---

## 変更履歴

| バージョン | 変更内容 |
|---|---|
| Round 1 | `watchDir`, `maxConcurrency`, `maxQueueSize`, `logFile`, `maxChars` を定義 |
| Round 2 | `reviewDir`, `routes`, `confidenceThreshold`, `model`, `apiTimeoutMs` を追加 |
