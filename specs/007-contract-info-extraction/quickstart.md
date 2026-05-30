# Quickstart: 契約書振り分け時の契約情報抽出・テキスト出力

**Date**: 2026-05-31

## 概要

本機能を実装すると、監視フォルダに置かれたファイルが「契約書」カテゴリに分類されたとき、自動的に契約対象（`contractSubject`）と規約期間（`contractPeriod`）が抽出されて `.meta.json` と監査ログに記録されます。

## 動作前提

- 第1〜6回の実装（watcher / extractor / classifier / router / reviewer）が完了していること
- `OPENAI_API_KEY` 環境変数が設定済みであること
- `config.json` に以下の設定が含まれること

## 設定ファイル（config.json）

```json
{
  "watchDir": "/watch",
  "reviewDir": "/review",
  "logFile": "/logs/audit.jsonl",
  "routes": {
    "契約書": "/routes/contracts",
    "請求書": "/routes/invoices"
  },
  "confidenceThreshold": 0.8,
  "model": "gpt-4o-mini",
  "contractCategoryLabel": "契約書"
}
```

`contractCategoryLabel` を省略した場合はデフォルト値 `"契約書"` が使用されます。

## 動作確認手順

### 1. 動作確認用テキストファイルを作成

```
業務委託契約書

委託者: 株式会社サンプル（以下「甲」）
受託者: テスト合同会社（以下「乙」）

第1条（委託内容）
甲は乙に対し、Webシステム開発業務を委託する。

第2条（契約期間）
本契約の有効期間は2025年4月1日から2026年3月31日までとする。
```

### 2. ファイルを監視フォルダに配置

```
copy 契約書_test.txt /watch/契約書_test.txt
```

### 3. 処理完了を確認

```
# 監査ログで event: 'completed' を確認
Get-Content /logs/audit.jsonl | ConvertFrom-Json | Where-Object { $_.event -eq 'completed' } | Select-Object -Last 1
```

期待される出力（抜粋）：

```json
{
  "event": "completed",
  "category": "契約書",
  "moveType": "auto",
  "contractSubject": "株式会社サンプル Webシステム開発業務委託",
  "contractPeriod": {
    "start": "2025年4月1日",
    "end": "2026年3月31日",
    "note": null
  }
}
```

### 4. .meta.json を確認

```
Get-Content /routes/contracts/契約書_test.txt.meta.json | ConvertFrom-Json
```

`contractSubject` と `contractPeriod` フィールドが含まれていれば成功です。

## 抽出できない場合の挙動

契約情報が読み取れない場合（書式が特殊・情報不足など）は `null` が記録されます。

```json
{
  "contractSubject": null,
  "contractPeriod": {
    "start": null,
    "end": null,
    "note": null
  }
}
```

この場合もファイルの振り分けは正常に完了しており、処理は継続されます。

## テスト実行

```
yarn test contract-info
```

## トラブルシューティング

| 症状 | 確認箇所 |
|------|---------|
| `contractSubject` フィールドが監査ログにない | カテゴリが `contractCategoryLabel` と一致しているか確認 |
| `contractExtractionError` が記録される | OPENAI_API_KEY の有効性・apiTimeoutMs の設定を確認 |
| `.meta.json` が更新されない | `.meta.json` が振り分け先に存在するか確認（moveType が 'error' の場合は抽出されない） |
