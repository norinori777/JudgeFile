# データモデル: txt / md 監視・抽出・ロギング基盤

**Feature**: `001-txt-md-pipeline`
**Date**: 2026-05-17

## エンティティ一覧

| エンティティ | 永続化 | ライフタイム |
|---|---|---|
| `Config` | ✅ config.json（起動時読み込み） | プロセス全体 |
| `Job` | ❌ メモリ内のみ | キュー投入〜処理完了 |
| `ExtractedText` | ❌ メモリ内のみ | 抽出処理中のみ |
| `AuditLogEntry` | ✅ JSON Lines ファイル | 永続（追記） |

---

## Config

設定ファイル（`config.json`）から起動時に 1 回読み込む。Zod スキーマで検証する。

```typescript
import { z } from 'zod';

export const ConfigSchema = z.object({
  watchDir:       z.string().min(1),                              // 監視フォルダの絶対パス
  maxConcurrency: z.number().int().min(1).max(32).default(2),     // 最大同時実行数
  maxQueueSize:   z.number().int().min(1).default(100),           // キュー最大サイズ
  logFile:        z.string().min(1),                              // 監査ログファイルの絶対パス
  maxChars:       z.number().int().min(1).default(100_000),       // 最大読み込み文字数
});

export type Config = z.infer<typeof ConfigSchema>;
```

**バリデーションルール**:
- `watchDir` が存在しないパスの場合、起動時にエラーを出力してプロセスを終了する
- `maxConcurrency` は 1〜32 の整数
- `maxQueueSize` は 1 以上の整数
- `logFile` の親ディレクトリが存在しない場合、起動時に作成を試みる

---

## Job

ジョブキュー（p-queue）で管理されるファイル処理単位。メモリ内のみで保持する。

```typescript
export type JobStatus = 'waiting' | 'processing' | 'done' | 'failed';

export interface Job {
  jobId:       string;     // UUID v4 (crypto.randomUUID())
  filePath:    string;     // 対象ファイルの絶対パス
  status:      JobStatus;  // ジョブの状態
  enqueuedAt:  string;     // ISO 8601 — キュー投入時刻
  startedAt?:  string;     // ISO 8601 — 処理開始時刻
  completedAt?: string;    // ISO 8601 — 処理完了時刻
}
```

**状態遷移**:

```
waiting → processing → done
                    └→ failed
```

**補足**:
- `done` / `failed` に到達したジョブオブジェクトは監査ログ書き込み後に GC に委ねる
- 同一ファイルの重複投入は Watcher 層で検知し、Job を生成しない（`skipped` ログを記録）

---

## ExtractedText

抽出処理中のみメモリ内で保持する。Logger へ `chars` を渡した後、オブジェクトへの参照を破棄する。**本文（`text`）は一切永続化しない（FR-011）**。

```typescript
export interface ExtractedText {
  filePath:           string;   // 元ファイルの絶対パス
  text:               string;   // 整形済みテキスト（trim + 余分な改行除去）— 永続化禁止
  chars:              number;   // 文字数（trim 後）
  extractedAt:        string;   // ISO 8601
  truncationWarning?: string;   // maxChars 超過時の警告メッセージ。Queue 層が AuditLogEntry.error にコピーする
}
```

**バリデーションルール**:
- `text` フィールドは監査ログ・一時ファイル・その他永続ストレージに書き出さない
- `chars` のみ `AuditLogEntry.chars` に記録する
- 空ファイル（`chars === 0`）は正常処理として `done` に遷移し、`chars: 0` でログ記録する
- `maxChars` を超える場合は先頭 `maxChars` 文字のみ使用し、`truncationWarning` にメッセージを設定する。Queue 層が `AuditLogEntry.error` にコピーする

---

## AuditLogEntry

JSON Lines ファイルに追記する監査ログエントリ。1 行 = 1 JSON オブジェクト。

```typescript
export type AuditEvent  = 'started' | 'completed' | 'failed' | 'skipped';
export type AuditResult = 'ok' | 'error';

export interface AuditLogEntry {
  job_id:      string;       // UUID v4
  event:       AuditEvent;   // started | completed | failed | skipped
  path:        string;       // ファイルパス
  timestamp:   string;       // ISO 8601
  result:      AuditResult;  // ok | error
  duration_ms: number;       // 処理時間（ミリ秒）。started / skipped イベントは 0
  chars?:      number;       // 抽出文字数（completed イベントのみ）
  error?:      string;       // エラーメッセージ（failed / 切り捨て警告のみ）
}
```

**出力例（JSON Lines 形式）**:

```jsonl
{"job_id":"550e8400-e29b-41d4-a716-446655440000","event":"started","path":"/watch/sample.txt","timestamp":"2026-05-17T10:00:00.000Z","result":"ok","duration_ms":0}
{"job_id":"550e8400-e29b-41d4-a716-446655440000","event":"completed","path":"/watch/sample.txt","timestamp":"2026-05-17T10:00:00.012Z","result":"ok","duration_ms":12,"chars":1024}
```

**スキップ例**:

```jsonl
{"job_id":"661f9511-f3ac-52e5-b827-557766551111","event":"skipped","path":"/watch/duplicate.txt","timestamp":"2026-05-17T10:00:01.000Z","result":"ok","duration_ms":0}
```

**失敗例（UTF-8 エラー）**:

```jsonl
{"job_id":"772a0622-a4bd-63f6-c938-668877662222","event":"failed","path":"/watch/corrupt.txt","timestamp":"2026-05-17T10:00:02.000Z","result":"error","duration_ms":3,"error":"The encoded data was not valid for encoding utf-8"}
```

**失敗例（読み取り権限なし）**:

```jsonl
{"job_id":"883b1733-b5ce-74g7-d049-779988773333","event":"failed","path":"/watch/noperm.txt","timestamp":"2026-05-17T10:00:03.000Z","result":"error","duration_ms":1,"error":"EACCES: permission denied, open '/watch/noperm.txt'"}
```

---

## エンティティ間の関係

```
Config（起動時に 1 回読み込み）
   │
   ├─ Watcher（watchDir を監視）
   │      │ add イベント → 重複チェック
   │      │ 重複あり → skipped ログを記録
   │      │ 重複なし ↓
   │      ▼
   │    Job（jobId 生成、キューへ投入）
   │      │ processing へ遷移
   │      ▼
   │    ExtractedText（メモリ内のみ）
   │      │ chars を渡して参照を破棄
   │      ▼
   └─ AuditLogEntry（logFile へ追記）
```

---

## バリデーションルール一覧

| ルール | 対象層 | 処理 |
|---|---|---|
| 拡張子が .txt / .md 以外 | Watcher | 無視（ログなし） |
| サブフォルダ内のファイル | Watcher | 無視（ログなし） |
| 重複ファイル（名前+サイズ+mtime の組み合わせ） | Watcher | `skipped` ログを記録 |
| 監視フォルダが存在しない | Config/Watcher | 起動時エラー出力、プロセス終了 |
| 空ファイル（chars === 0） | Extractor | 正常処理（`chars: 0` でログ記録） |
| UTF-8 デコードエラー | Extractor | `failed` ログを記録、他のジョブは継続 |
| 最大文字数超過（maxChars） | Extractor | 超過分を切り捨て、`error` フィールドに警告を記録 |
| ファイルが処理中に消える | Extractor | `failed` ログを記録（ENOENT エラー） |
| キュー上限到達（maxQueueSize） | Queue | chokidar を `pause()`、空きができたら `resume()` |
| 起動時に既存ファイルが存在する | Watcher | 処理しない（起動後の新規追加のみ対象） |
