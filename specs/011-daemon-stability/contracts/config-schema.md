# Config Schema Contract: Feature 011 追加フィールド

**Feature**: 011-daemon-stability  
**Date**: 2026-06-01  
**Schema Version**: 011  
**Validator**: `src/config/schema.ts` (Zod)

---

## 追加フィールド定義

既存の `config.json` スキーマに以下のフィールドを追加する。すべてオプション（デフォルト値あり）。

### seenKeysMaxSize

| 項目 | 値 |
|------|---|
| 型 | `integer` |
| デフォルト | `10000` |
| 最小 | `1` |
| 最大 | `1000000` |
| 必須 | いいえ |
| 説明 | 処理済みファイルキーの最大保持数。上限超過時は最古エントリをエビクション（LRU） |

### gracefulShutdownTimeoutMs

| 項目 | 値 |
|------|---|
| 型 | `integer` |
| デフォルト | `30000` |
| 最小 | `1000` |
| 最大 | `300000` |
| 必須 | いいえ |
| 説明 | SIGTERM/SIGINT 受信後にキュー完了を待機する最大時間（ミリ秒） |

### healthCheck

| 項目 | 値 |
|------|---|
| 型 | `object` または `undefined` |
| デフォルト | `undefined`（未設定時はサーバーを起動しない） |
| 必須 | いいえ |

**サブフィールド**:

| フィールド | 型 | 必須 | 最小 | 最大 | 説明 |
|-----------|---|------|------|------|------|
| `port` | `integer` | はい | `1024` | `65535` | HTTP ヘルスチェックサーバーのリッスンポート |

### correctionsFile

| 項目 | 値 |
|------|---|
| 型 | `string`（絶対パス）または `undefined` |
| デフォルト | `undefined`（未設定時は `dirname(logFile) + '/corrections.jsonl'`） |
| 必須 | いいえ |
| 説明 | `corrections.jsonl` の出力パス |

---

## 完全なスキーマ例（Feature 011 追加分のみ）

```json
{
  "seenKeysMaxSize": 10000,
  "gracefulShutdownTimeoutMs": 30000,
  "healthCheck": {
    "port": 8080
  },
  "correctionsFile": "/var/log/judgefile/corrections.jsonl"
}
```

---

## バリデーションエラー例

| 条件 | エラーメッセージ例 |
|------|-----------------|
| `seenKeysMaxSize` が 0 以下 | `"seenKeysMaxSize: Number must be greater than or equal to 1"` |
| `healthCheck.port` が 80（特権ポート） | `"healthCheck.port: Number must be greater than or equal to 1024"` |
| `gracefulShutdownTimeoutMs` が 500（最小値未満） | `"gracefulShutdownTimeoutMs: Number must be greater than or equal to 1000"` |

---

## 後方互換性

- すべての新規フィールドはオプションでデフォルト値を持つため、既存の `config.json` は変更なしで動作する。
- `correctionsFile` 未設定時は従来と同じディレクトリ（`dirname(logFile)`）に `corrections.jsonl` が作成される。
