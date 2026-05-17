# 監査ログスキーマ: txt / md 監視・抽出・ロギング基盤

**Feature**: `001-txt-md-pipeline`
**Date**: 2026-05-17

## 概要

監査ログは **JSON Lines（NDJSON）形式**で出力する。1 行に 1 つの JSON オブジェクトを書き込む。
ログファイルは設定ファイルの `logFile` に指定したパスに追記される。

---

## エントリスキーマ

```typescript
// 全イベント共通フィールド
interface AuditLogEntryBase {
  job_id:      string;       // UUID v4 形式
  event:       AuditEvent;   // "started" | "completed" | "failed" | "skipped"
  path:        string;       // ファイルの絶対パス
  timestamp:   string;       // ISO 8601 (UTC, ミリ秒精度) 例: "2026-05-17T10:00:00.000Z"
  result:      AuditResult;  // "ok" | "error"
  duration_ms: number;       // 処理時間（ミリ秒）。非負整数
}

// completed イベント追加フィールド
interface AuditLogEntryCompleted extends AuditLogEntryBase {
  event:  'completed';
  result: 'ok';
  chars:  number;      // 抽出文字数（0 以上の整数）
}

// failed イベント追加フィールド
interface AuditLogEntryFailed extends AuditLogEntryBase {
  event:  'failed';
  result: 'error';
  error:  string;      // エラーメッセージ（空文字列不可）
}
```

---

## イベント種別

| `event` | `result` | 説明 | `chars` | `error` |
|---|---|---|---|---|
| `started` | `ok` | ジョブ処理開始 | なし | なし |
| `completed` | `ok` | 処理成功・抽出完了 | あり | なし |
| `failed` | `error` | 処理失敗（読み取りエラー等） | なし | あり |
| `skipped` | `ok` | 重複検知によりスキップ | なし | なし |

---

## 出力例

### 正常処理（started → completed）

```jsonl
{"job_id":"550e8400-e29b-41d4-a716-446655440000","event":"started","path":"/data/incoming/sample.txt","timestamp":"2026-05-17T10:00:00.000Z","result":"ok","duration_ms":0}
{"job_id":"550e8400-e29b-41d4-a716-446655440000","event":"completed","path":"/data/incoming/sample.txt","timestamp":"2026-05-17T10:00:00.012Z","result":"ok","duration_ms":12,"chars":1024}
```

### 空ファイル（chars: 0）

```jsonl
{"job_id":"661a1511-a3bc-52e5-b827-557766551111","event":"started","path":"/data/incoming/empty.txt","timestamp":"2026-05-17T10:01:00.000Z","result":"ok","duration_ms":0}
{"job_id":"661a1511-a3bc-52e5-b827-557766551111","event":"completed","path":"/data/incoming/empty.txt","timestamp":"2026-05-17T10:01:00.003Z","result":"ok","duration_ms":3,"chars":0}
```

### 重複スキップ

```jsonl
{"job_id":"772b2622-b4cd-63f6-c938-668877662222","event":"skipped","path":"/data/incoming/duplicate.txt","timestamp":"2026-05-17T10:02:00.000Z","result":"ok","duration_ms":0}
```

### UTF-8 エラー

```jsonl
{"job_id":"883c3733-c5de-74g7-d049-779988773333","event":"started","path":"/data/incoming/corrupt.bin","timestamp":"2026-05-17T10:03:00.000Z","result":"ok","duration_ms":0}
{"job_id":"883c3733-c5de-74g7-d049-779988773333","event":"failed","path":"/data/incoming/corrupt.bin","timestamp":"2026-05-17T10:03:00.005Z","result":"error","duration_ms":5,"error":"The encoded data was not valid for encoding utf-8"}
```

### 読み取り権限エラー

```jsonl
{"job_id":"994d4844-d6ef-85h8-e150-880099884444","event":"started","path":"/data/incoming/noperm.txt","timestamp":"2026-05-17T10:04:00.000Z","result":"ok","duration_ms":0}
{"job_id":"994d4844-d6ef-85h8-e150-880099884444","event":"failed","path":"/data/incoming/noperm.txt","timestamp":"2026-05-17T10:04:00.002Z","result":"error","duration_ms":2,"error":"EACCES: permission denied, open '/data/incoming/noperm.txt'"}
```

### 文字数超過（maxChars 切り捨て）

```jsonl
{"job_id":"aa5e5955-e7fg-96i9-f261-991100995555","event":"started","path":"/data/incoming/large.txt","timestamp":"2026-05-17T10:05:00.000Z","result":"ok","duration_ms":0}
{"job_id":"aa5e5955-e7fg-96i9-f261-991100995555","event":"completed","path":"/data/incoming/large.txt","timestamp":"2026-05-17T10:05:00.050Z","result":"ok","duration_ms":50,"chars":100000,"error":"Content truncated: file exceeded maxChars (100000). Original size was larger."}
```

---

## 不変条件

1. **テキスト本文は含まない**: `text`、`content`、`body` 等のフィールドは絶対に出力しない（FR-011）
2. **1 ファイル 1 job_id**: 同一ファイルの重複は `skipped` イベントで記録し、新しい `job_id` を発行しない
3. **順序**: 同一 `job_id` の `started` は必ず `completed` / `failed` より前に出力される
4. **timestamp**: すべて UTC・ISO 8601・ミリ秒精度で記録する

---

## ログ解析クエリ例

```bash
# 全完了ジョブの抽出文字数合計
cat audit.log | jq -s '[.[] | select(.event=="completed") | .chars] | add'

# 失敗ジョブのファイルパス一覧
cat audit.log | jq -r 'select(.event=="failed") | .path'

# 処理時間が 1000ms 以上のジョブ
cat audit.log | jq 'select(.event=="completed" and .duration_ms >= 1000)'
```

---

## 変更管理

監査ログスキーマの変更（フィールド追加・型変更）は、`data-model.md` の `AuditLogEntry` 型定義と同時に更新する。
後続フェーズ（AI 分類）でフィールドを追加する場合は、既存フィールドを削除・名前変更しない。
