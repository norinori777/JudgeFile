---
description: "Quickstart guide for 002-ai-classifier-router"
---

# クイックスタート: AI 分類・振り分けパイプライン（Round 2）

**Feature**: `002-ai-classifier-router`
**Date**: 2026-05-17
**前提**: Round 1（`001-txt-md-pipeline`）が動作している環境

---

## 事前要件

| 要件 | バージョン |
|---|---|
| Node.js | 20 LTS 以上 |
| npm | 10 以上 |
| OpenAI API キー | — |

---

## 1. パッケージのインストール

```bash
npm install
npm install openai
```

---

## 2. 環境変数の設定

```bash
# Windows PowerShell
$env:OPENAI_API_KEY = "sk-..."

# macOS / Linux
export OPENAI_API_KEY="sk-..."
```

`OPENAI_API_KEY` が未設定の場合、起動時にエラーが発生します。

---

## 3. ディレクトリ構成（例）

```
/data/
  inbox/        ← watchDir: 監視フォルダ（.txt / .md を配置）
  review/        ← reviewDir: 低信頼度・エラー時の振り分け先
  invoices/      ← routes["請求書"]
  contracts/     ← routes["契約書"]
  minutes/       ← routes["議事録"]
  logs/
    audit.jsonl  ← logFile: 監査ログ
```

フォルダは起動時に自動作成されます（`mkdir -p` 相当）。

---

## 4. config.json の設定（Round 2 完全例）

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

### 最小構成（Round 2 — reviewDir のみ追加）

```json
{
  "watchDir": "/data/inbox",
  "logFile": "/data/logs/audit.jsonl",
  "reviewDir": "/data/review"
}
```

`routes` が空の場合、すべての文書は review フォルダへ移動されます。

---

## 5. 実行

```bash
# 開発環境（TypeScript 直接実行）
npm run dev -- --config ./config.json

# ビルドして実行
npm run build
node dist/index.js --config ./config.json
```

---

## 6. 動作確認

1. `/data/inbox/` に `.txt` または `.md` ファイルをコピーします。
2. ファイルが自動検出され、AI 分類が実行されます。
3. 信頼度 ≥ `confidenceThreshold` かつ `routes` にカテゴリが定義されている場合は自動振り分けされます。
4. その他は `/data/review/` に移動されます。
5. `/data/logs/audit.jsonl` で全履歴を確認できます。

### ログ出力例（自動振り分け成功）

```json
{"id":"550e8400-...","event":"started","timestamp":"2026-05-17T10:00:00.000Z","filePath":"/data/inbox/invoice-2026.txt"}
{"id":"550e8400-...","event":"completed","timestamp":"2026-05-17T10:00:08.500Z","filePath":"/data/inbox/invoice-2026.txt","durationMs":3200,"charCount":1450,"category":"請求書","confidence":0.95,"tags":["会計","2026年度"],"confidentiality":"medium","destination":"/data/invoices/invoice-2026.txt","moveType":"auto"}
```

### ログ出力例（低信頼度 → review）

```json
{"id":"550e8400-...","event":"completed","timestamp":"2026-05-17T10:00:07.200Z","filePath":"/data/inbox/unknown-doc.txt","durationMs":2800,"charCount":820,"category":"不明資料","confidence":0.55,"tags":[],"confidentiality":"low","destination":"/data/review/unknown-doc.txt","moveType":"review"}
```

---

## 7. トラブルシューティング

| 症状 | 原因 | 対処 |
|---|---|---|
| 起動時 `OPENAI_API_KEY が設定されていません` | 環境変数未設定 | `export OPENAI_API_KEY=sk-...` を設定 |
| すべてのファイルが review へ送られる | `routes` が空または `confidenceThreshold` が高い | config.json の `routes` と閾値を確認 |
| `APIConnectionTimeoutError` | ネットワーク障害またはタイムアウト短すぎ | `apiTimeoutMs` を増やすか（最大 120000）ネットワーク確認 |
| `RateLimitError` | OpenAI API の利用制限 | API プランを確認（Rate Limit 到達時はリトライなし — FR-010） |
| ファイル名に `-{数字}` が付く | 同名ファイルが既に移動先に存在 | 正常動作（衝突回避のタイムスタンプサフィックス） |
