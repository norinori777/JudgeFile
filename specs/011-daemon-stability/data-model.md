# Data Model: デーモン安定性・信頼性強化

**Feature**: 011-daemon-stability  
**Date**: 2026-06-01

---

## 新規エンティティ

### SeenKeyStore

処理済みファイルの識別キーを管理する。メモリ上の `Set<string>` とディスク上の `seen-keys.jsonl` を同期する。

| フィールド | 型 | 説明 |
|-----------|---|------|
| `store` | `Set<string>` | 処理済みキーの集合（挿入順序を保持） |
| `maxSize` | `number` | エントリ上限（デフォルト: 10,000） |
| `persistPath` | `string` | `seen-keys.jsonl` の絶対パス |

**キー形式**: `"${basename(filePath)}:${size}:${mtimeMs}"`  
例: `"report.pdf:204800:1748736000000"`

**LRU エビクション**: エントリ数が `maxSize` に達した場合、`Set.values().next().value`（最古エントリ）を削除してから新しいエントリを追加する。

**メソッド**:

| メソッド | 戻り値 | 説明 |
|---------|--------|------|
| `has(key)` | `boolean` | キーが存在するか確認 |
| `add(key)` | `void` | キーを追加（上限超過時はエビクション → `appendFileSync`） |
| `flush()` | `void` | 全エントリを `writeFileSync` で再書き込み（シャットダウン時） |

**バリデーションルール**:
- `maxSize` は 1 以上の整数
- ファイルが存在しない・読み取り失敗・空ファイルの場合は空 Set で起動（FR-006）

**状態遷移**:
```
起動時: ファイル読み込み → Set 初期化
       ↓
稼働中: completed イベント → add(key) → appendFileSync
       ↓
エビクション: store.size >= maxSize → oldest 削除 → add(key) → appendFileSync
       ↓
シャットダウン: flush() → writeFileSync（全エントリ再書き込み）
```

---

### GracefulShutdown（ロジックモデル）

SIGTERM/SIGINT 受信から `process.exit(0)` までのシーケンスを管理する。クラスではなく `setupGracefulShutdown()` 関数として実装する。

**シャットダウンシーケンス**:

```
SIGTERM / SIGINT 受信
  │
  ├─► watcher.close()           — 新規ファイルイベント停止
  │
  ├─► Promise.race([
  │     queue.onIdle(),          — 全ジョブ完了を待機
  │     sleep(timeoutMs),        — タイムアウト（デフォルト 30,000ms）
  │   ])
  │
  ├─► [タイムアウト時のみ]
  │     for (filePath of queue.getActiveFiles())
  │       ├─► resolveDestination(filePath, reviewDir)
  │       ├─► moveFile(filePath, dest)
  │       └─► writeLog({ event: 'stopped', filePath: dest, reason: 'graceful-shutdown-timeout' })
  │
  ├─► seenKeyStore.flush()       — seen-keys.jsonl 再書き込み
  ├─► healthServer?.close()      — HTTP サーバー停止
  └─► process.exit(0)
```

---

### HealthCheckServer

`node:http` で実装するオプション HTTP サーバー。`config.healthCheck.port` が設定されている場合のみ起動する。

**エンドポイント**: `GET /health`

**レスポンス形式**:

```typescript
interface HealthResponse {
  status: 'ok' | 'shutting_down';
  queueSize: number;   // 現在のキュー未処理件数
  uptime: number;      // 起動からの経過秒数（整数）
}
```

**HTTP ステータス**:
- 正常稼働: `200 OK`
- シャットダウン中: `503 Service Unavailable`

**ポート競合時**: `EADDRINUSE` エラー → エラーログ出力 → `process.exit(1)`（FR-007）

---

## 既存エンティティの変更

### AuditEvent（`src/types/index.ts`）

```typescript
// 変更前
export type AuditEvent = 'started' | 'completed' | 'failed' | 'skipped' | 'rejected' | 'redaction';

// 変更後
export type AuditEvent = 'started' | 'completed' | 'failed' | 'skipped' | 'rejected' | 'redaction' | 'stopped';
```

`'stopped'` イベント: グレースフル停止タイムアウト時に、処理中断されたジョブに対して記録する。

**追加フィールド（AuditLogEntry の `reason` 任意フィールド）**:

```typescript
export interface AuditLogEntry {
  id: string;
  event: AuditEvent;
  timestamp: string;
  filePath: string;
  // ... 既存フィールド ...
  reason?: string;  // 'stopped' イベント時に中断理由を記録（例: 'graceful-shutdown-timeout'）
}
```

---

### Config（`src/config/schema.ts`）

追加するフィールド:

| フィールド | 型 | デフォルト | 説明 |
|-----------|---|-----------|------|
| `seenKeysMaxSize` | `number` | `10000` | seenKeys の最大エントリ数（FR-001） |
| `gracefulShutdownTimeoutMs` | `number` | `30000` | グレースフル停止タイムアウト（ミリ秒）（FR-002） |
| `healthCheck` | `object \| undefined` | `undefined` | ヘルスチェックサーバー設定（FR-007） |
| `healthCheck.port` | `number` | — | リッスンポート（1024–65535） |
| `correctionsFile` | `string \| undefined` | `undefined` | corrections.jsonl の絶対パス（未設定時は `logFile` と同ディレクトリ） |

**Zod スキーマ追加分**:

```typescript
seenKeysMaxSize: z.number().int().min(1).max(1_000_000).default(10_000),
gracefulShutdownTimeoutMs: z.number().int().min(1_000).max(300_000).default(30_000),
healthCheck: z.object({
  port: z.number().int().min(1024).max(65535),
}).optional(),
correctionsFile: z.string().min(1).optional(),
```

---

### Queue（`src/queue/index.ts`）

追加するメンバー:

| メンバー | 型 | 説明 |
|---------|---|------|
| `activeFiles` | `Set<string>` | 現在処理中のファイルパス集合 |
| `getActiveFiles()` | `() => ReadonlySet<string>` | 処理中ファイル一覧を返す（shutdown.ts で使用） |

ライフサイクル:
- ジョブ開始時（`started` ログ記録後）: `activeFiles.add(filePath)`
- ジョブ完了時（`completed` / `failed` ログ記録後）: `activeFiles.delete(filePath)`

---

### CorrectionRecord（`src/types/index.ts`）

HMAC フィールドを追加する（`AUDIT_HMAC_SECRET` 設定時のみ付与）:

```typescript
export interface CorrectionRecord {
  // ... 既存フィールド ...
  /** HMAC チェーン: 前エントリの currHash（先頭エントリは 'genesis'）*/
  prevHash?: string;
  /** HMAC チェーン: このエントリの currHash */
  currHash?: string;
}
```

---

## seen-keys.jsonl ファイル形式

```text
report.pdf:204800:1748736000000
contract.docx:51200:1748736001000
image.png:1048576:1748736002000
```

- エンコーディング: UTF-8
- 行末: `\n`
- 空行: 無視
- 1 行 = 1 処理済みキー
- 最大行数: `seenKeysMaxSize`（LRU エビクションにより超過しない）

---

## データフロー図

```
[監視フォルダ]
     │ add イベント
     ▼
[watcher/index.ts]
  stat() でキー生成
  SeenKeyStore.has(key)?
  ├─ Yes → skipped ログ → 終了
  └─ No → queue.enqueue(filePath)
            SeenKeyStore.add(key) は queue 完了後に実行
     │
     ▼
[queue/index.ts]
  activeFiles.add(filePath)
  started ログ
  extract() → classify() → route() → moveFile()
  completed/failed ログ
  activeFiles.delete(filePath)
  SeenKeyStore.add(key)  ← completed 時のみ
  appendFileSync(seen-keys.jsonl, key + '\n')
     │
     ▼（シャットダウン時）
[shutdown.ts]
  queue.getActiveFiles() → reviewDir に移動 → stopped ログ
  SeenKeyStore.flush() → seen-keys.jsonl 再書き込み
```
