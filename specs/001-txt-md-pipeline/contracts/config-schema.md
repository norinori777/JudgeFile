# 設定ファイルスキーマ: txt / md 監視・抽出・ロギング基盤

**Feature**: `001-txt-md-pipeline`
**Date**: 2026-05-17

## 概要

システムはプロジェクトルートの `config.json` を起動時に読み込み、Zod スキーマで検証する。
検証に失敗した場合はエラーメッセージを出力してプロセスを終了する。

---

## スキーマ定義

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "JudgeFile Config",
  "type": "object",
  "required": ["watchDir", "logFile"],
  "additionalProperties": false,
  "properties": {
    "watchDir": {
      "type": "string",
      "minLength": 1,
      "description": "監視フォルダの絶対パス。起動時に存在しない場合はエラー終了する。"
    },
    "maxConcurrency": {
      "type": "integer",
      "minimum": 1,
      "maximum": 32,
      "default": 2,
      "description": "最大同時実行数（ジョブキューの同時処理数上限）。"
    },
    "maxQueueSize": {
      "type": "integer",
      "minimum": 1,
      "default": 100,
      "description": "キューに積める最大ジョブ数。上限到達時はファイル検知を一時停止する。"
    },
    "logFile": {
      "type": "string",
      "minLength": 1,
      "description": "監査ログファイルの絶対パス。親ディレクトリが存在しない場合は起動時に作成する。"
    },
    "maxChars": {
      "type": "integer",
      "minimum": 1,
      "default": 100000,
      "description": "1 ファイルあたりの最大読み込み文字数。超過分は切り捨てて警告をログに記録する。"
    }
  }
}
```

---

## 設定例

```json
{
  "watchDir": "/data/incoming",
  "maxConcurrency": 2,
  "maxQueueSize": 100,
  "logFile": "/var/log/judgefile/audit.log",
  "maxChars": 100000
}
```

---

## 各項目の詳細

| フィールド | 型 | 必須 | デフォルト | 説明 |
|---|---|---|---|---|
| `watchDir` | string | ✅ | なし | 監視フォルダの絶対パス |
| `maxConcurrency` | integer | ❌ | 2 | 最大同時実行数（1〜32） |
| `maxQueueSize` | integer | ❌ | 100 | キュー最大サイズ（1 以上） |
| `logFile` | string | ✅ | なし | 監査ログファイルの絶対パス |
| `maxChars` | integer | ❌ | 100000 | 最大読み込み文字数（1 以上） |

---

## バリデーションエラー例

```
Error: Config validation failed
  - watchDir: Required
  - maxConcurrency: Number must be less than or equal to 32
```

---

## 変更管理

設定スキーマの変更（フィールド追加・型変更・必須化）は、影響する `data-model.md` および `spec.md` の対応 FR と同時に更新する。
