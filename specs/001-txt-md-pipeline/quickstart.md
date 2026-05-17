# クイックスタート: txt / md 監視・抽出・ロギング基盤

**Feature**: `001-txt-md-pipeline`
**Date**: 2026-05-17

## 前提条件

- Node.js 20 LTS 以上
- npm 10 以上

## セットアップ

```bash
# リポジトリをクローン後、依存パッケージをインストール
npm install

# TypeScript のビルド
npm run build
```

## 設定ファイルの準備

プロジェクトルートに `config.json` を作成する（`logFile` の親ディレクトリは自動作成される）。

```json
{
  "watchDir": "/path/to/incoming",
  "maxConcurrency": 2,
  "maxQueueSize": 100,
  "logFile": "/path/to/logs/audit.log",
  "maxChars": 100000
}
```

| 項目 | デフォルト | 説明 |
|---|---|---|
| `watchDir` | なし（必須） | 監視フォルダの絶対パス |
| `maxConcurrency` | 2 | 最大同時実行数（1【10） |
| `maxQueueSize` | 100 | キュー最大サイズ |
| `logFile` | なし（必須） | 監査ログファイルの絶対パス |
| `maxChars` | 100000 | 1 ファイルあたりの最大読み込み文字数 |

## 起動

```bash
# ビルド後
node dist/index.js

# 開発時（ts-node + ESM）
npm run dev
```

起動時に `config.json` を読み込んで検証する。エラーがある場合はメッセージを出力してプロセスを終了する。

## ファイルの投入

```bash
# 監視フォルダに txt / md ファイルを配置する
cp sample.txt /path/to/incoming/

# 複数ファイルを一括投入する場合
cp *.txt /path/to/incoming/
```

5 秒以内に処理が開始され、完了後にログファイルへ結果が記録される。

**.txt / .md 以外の拡張子は無視される**（ログにも記録されない）。

## ログの確認

```bash
# jq がある場合（整形表示）
cat /path/to/logs/audit.log | jq .

# jq なしで全エントリ確認
cat /path/to/logs/audit.log

# 完了ジョブのみ
cat /path/to/logs/audit.log | jq 'select(.event=="completed")'

# 失敗ジョブのファイルパス一覧
cat /path/to/logs/audit.log | jq -r 'select(.event=="failed") | .filePath'
```

## テスト実行

```bash
# 全テスト
npm test

# カバレッジ付き
npm run test:coverage

# ウォッチモード（開発時）
npm run test:watch
```

## よくある問題

| 症状 | 原因 | 対処 |
|---|---|---|
| 起動時 `watchDir does not exist` エラー | `config.json` の `watchDir` が存在しない | フォルダを作成するか `watchDir` のパスを修正する |
| ファイルを置いても検知されない | 拡張子が `.txt` / `.md` 以外 | ファイル名の拡張子を確認する |
| ファイルを置いても検知されない（その2） | サブフォルダに配置している | `watchDir` 直下に配置する（サブフォルダは対象外） |
| ログに `encoding` エラーが記録される | UTF-8 以外のエンコーディング | ファイルを UTF-8 で保存し直す |
| キューが止まる | `maxQueueSize` の上限に達した | ファイルの処理完了を待つ（自動的に再開する） |
