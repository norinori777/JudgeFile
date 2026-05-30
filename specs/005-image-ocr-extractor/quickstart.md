# Quickstart: 画像 OCR テキスト抽出対応

**Feature**: 005-image-ocr-extractor | **Date**: 2026-05-30

---

## 概要

`.png` / `.jpg` / `.jpeg` ファイルを監視フォルダに置くと、OpenAI Vision API で OCR テキストを抽出し、既存の分類 → 振り分け → 監査ログ記録のパイプラインをそのまま通します。

**必要な変更**: `config.json` の `watchedExtensions` に画像拡張子を追加するだけ（コード変更不要）。

---

## 前提条件

- JudgeFile が既に動作していること（Round 1 〜 3 のセットアップ完了）
- `OPENAI_API_KEY` が設定されていること
- 使用する OpenAI モデル（`model` フィールド）が Vision 入力をサポートしていること（`gpt-4o-mini` / `gpt-4o` いずれも対応）

---

## セットアップ手順

### 1. config.json を更新する

`watchedExtensions` に画像拡張子を追加します。

```json
{
  "watchDir": "/data/inbox",
  "logFile": "/data/audit.jsonl",
  "reviewDir": "/data/review",
  "routes": {
    "請求書": "/data/invoices",
    "契約書": "/data/contracts"
  },
  "watchedExtensions": [".txt", ".md", ".pdf", ".png", ".jpg", ".jpeg"],
  "maxImageSizeMB": 10
}
```

**`maxImageSizeMB`**: 省略時はデフォルト `10`（MB）が適用されます。大きなスキャン画像を扱う場合は適宜増やしてください。

### 2. デーモンを起動する

```bash
yarn dev
# または
yarn start
```

### 3. 画像ファイルを置いて確認する

監視フォルダに `.png` / `.jpg` / `.jpeg` ファイルをコピーします。

```bash
cp /path/to/scan-document.png /data/inbox/
```

---

## 処理結果の確認

### 監査ログ（audit.jsonl）で確認

```bash
# 最新のログを確認
tail -f /data/audit.jsonl | jq .

# 画像 OCR 処理のみを抽出
grep '"ocrEngine"' /data/audit.jsonl | jq .
```

成功時のログ例:

```json
{
  "id": "...",
  "event": "completed",
  "timestamp": "2026-05-30T10:00:15.200Z",
  "filePath": "/data/inbox/scan-invoice.png",
  "durationMs": 8400,
  "charCount": 720,
  "category": "請求書",
  "confidence": 0.92,
  "destination": "/data/invoices/scan-invoice.png",
  "moveType": "auto",
  "ocrEngine": "openai-vision"
}
```

---

## 処理ケースと結果

| ケース | event | 移動先 | 備考 |
|--------|-------|--------|------|
| テキスト抽出成功 + 高信頼度 | `completed` | `routes[category]` | `ocrEngine: "openai-vision"` 付与 |
| テキスト抽出成功 + 低信頼度 | `completed` | `reviewDir` | `moveType: "review"` |
| OCR 結果が空文字（写真等） | `skipped` | 移動なし | AI 分類呼び出しなし |
| ファイルサイズ > `maxImageSizeMB` | `failed` | `reviewDir` | 他のジョブは継続 |
| 破損画像 / API エラー | `failed` | `reviewDir` | 他のジョブは継続 |
| `watchedExtensions` に拡張子なし | （無視） | 移動なし | ログ記録なし |

---

## トラブルシューティング

### 画像ファイルが無視される

`config.json` の `watchedExtensions` を確認してください。`.png` / `.jpg` / `.jpeg` が含まれていない場合、画像ファイルは処理されません。

### OCR の精度が低い

- 画像解像度が低すぎる場合は精度が落ちます（SC-002: 読み取り可能な品質が前提）
- `model` を `gpt-4o` に変更すると精度が向上する場合があります

### ファイルが reviewDir に移動される

- `confidence` が `confidenceThreshold`（デフォルト 0.8）未満の場合は `reviewDir` に振り分けられます
- `routes` に対応するカテゴリが設定されていない場合も同様です

### タイムアウトエラー

- 大きな画像は処理時間が長くなります。`apiTimeoutMs` を増やすか（最大 120000）、`maxImageSizeMB` を下げてください

---

## 対応拡張子（v1 保証範囲）

| 拡張子 | サポート状況 |
|--------|------------|
| `.png` | ✅ v1 保証 |
| `.jpg` | ✅ v1 保証 |
| `.jpeg` | ✅ v1 保証 |
| `.gif`, `.webp`, `.bmp`, `.tiff` | ⚠️ `watchedExtensions` に追加すれば利用者責任で使用可能（サポート対象外） |
