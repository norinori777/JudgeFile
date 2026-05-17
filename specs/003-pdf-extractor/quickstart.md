# Quickstart: PDF テキスト抽出対応

**Feature**: 003-pdf-extractor | **Date**: 2026-05-17

---

## 前提条件

- Round 1（監視・抽出・ロギング基盤）および Round 2（AI 分類・振り分けルーター）が実装済みであること
- `OPENAI_API_KEY` 環境変数が設定済みであること
- Node.js 20 LTS 以上

---

## セットアップ手順

### 1. pdfjs-dist をインストールする

```bash
npm install pdfjs-dist
```

### 2. config.json に watchedExtensions を追加する

既存の `config.json` を開き、`watchedExtensions` フィールドを追加します。

```json
{
  "watchDir": "/path/to/inbox",
  "logFile": "/path/to/audit.jsonl",
  "reviewDir": "/path/to/review",
  "routes": {
    "invoice": "/path/to/invoices"
  },
  "watchedExtensions": [".txt", ".md", ".pdf"]
}
```

> **注意**: `watchedExtensions` を省略すると `.txt` と `.md` のみが監視対象となります（Round 1 互換）。PDF を処理するには明示的に `".pdf"` を追加してください。

### 3. ビルドして起動する

```bash
npm run build
node dist/index.js --config ./config.json
```

---

## 動作確認

1. テキスト埋め込み済みの PDF を `watchDir` に配置する
2. 監査ログ（`logFile`）で `event: 'completed'` と `category`, `moveType` を確認する
3. ファイルが `routes[category]` または `reviewDir` に移動していることを確認する

```bash
# ログの最終行を確認する例
tail -1 /path/to/audit.jsonl | jq '{event, category, moveType, confidence}'
```

---

## テキスト抽出できない PDF の挙動

| ケース | 結果 |
|--------|------|
| スキャン画像のみの PDF | `event: 'skipped'` — AI は呼び出されない |
| パスワード保護 PDF | `event: 'failed'` — reviewDir に移動 |
| 破損 PDF | `event: 'failed'` — reviewDir に移動 |

---

## トラブルシューティング

**PDF が処理されない（watchDir に置いても反応しない）**  
→ `config.json` の `watchedExtensions` に `".pdf"` が含まれているか確認してください。

**`event: 'failed'` が記録され続ける**  
→ ログの `error` フィールドを確認してください。パスワード保護 PDF の場合は「PasswordException」が含まれます。

**テキストが切り捨てられる（`truncationWarning` が記録される）**  
→ `config.json` の `maxChars` を大きくすることで対応できます（最大 1,000,000）。
