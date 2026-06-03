# Research: デーモン安定性・信頼性強化

**Feature**: 011-daemon-stability  
**Date**: 2026-06-01  
**Status**: Complete

---

## 1. LRU 上限付き `seenKeys` の実装方式

### Decision
ES6 `Set<string>` の挿入順序（insertion-order）を利用した手動エビクションを採用する。外部パッケージは導入しない。

### Rationale
ES6 `Set` は `values()` イテレータが挿入順序を保証するため、先頭要素（最古エントリ）を `O(1)` で取得できる。エントリ数 10,000 の場合のメモリは約 1–2MB（キー文字列あたり平均 50–80 バイト）であり、実用上十分。

```typescript
function addSeenKey(seenKeys: Set<string>, key: string, maxSize: number): void {
  if (seenKeys.size >= maxSize) {
    const oldest = seenKeys.values().next().value as string;
    seenKeys.delete(oldest);
  }
  seenKeys.add(key);
}
```

### Alternatives Considered
- **lru-cache npm パッケージ**: O(1) LRU だが新規依存追加が必要。スペック要件には挿入順（追加順）削除で十分。
- **配列 + Set**: Array で順序管理 + Set で存在チェックは冗長。Set 単体で代替可能。

---

## 2. グレースフル停止（SIGTERM/SIGINT）

### Decision
`src/index.ts` に `setupGracefulShutdown()` を追加し、SIGTERM/SIGINT 受信時に以下のシーケンスを実行する：
1. `watcher.close()` — 新規ファイルイベント停止
2. `queue.onIdle()` を `Promise.race(timeout)` で待機（デフォルト 30 秒）
3. タイムアウト時は Queue が追跡している処理中ファイルを `reviewDir` に移動し `event: 'stopped'` を監査ログに記録
4. ヘルスチェックサーバーがあれば停止
5. `process.exit(0)`

### In-flight ファイル追跡
Queue クラスに `activeFiles: Set<string>` を追加し、ジョブ開始時に `add`、完了（completed/failed/stopped）時に `delete` する。タイムアウト時は `activeFiles` を走査して `reviewDir` に移動する。

### Rationale
`p-queue` の `onIdle()` は Promise を返すため `Promise.race` で自然にタイムアウト実装できる。`watcher.close()` は同期的に新規イベントをブロックするため SIGTERM 受信後の追加ジョブ投入を防ぐ。

### Alternatives Considered
- **タイムアウトなし無限待機**: 停止不能プロセスになるリスクがある。
- **即時強制終了**: ファイルが中途半端な状態で残る可能性があり不採用。

---

## 3. TOCTOU 対策: `resolveDestination` の UUID サフィックス

### Decision
現行の `${stem}-${Date.now()}${ext}` をサブミリ秒競合が起き得るため `${stem}-${randomUUID()}${ext}` に変更する。

### Rationale
`Date.now()` は同一ミリ秒内に複数ジョブが同じ値を生成し得る。`randomUUID()` は 122 ビットのランダム性（RFC 4122 v4）を持ち、実用上衝突ゼロ。`node:crypto` はすでに import 済みで追加コストなし。

### Alternatives Considered
- **ナノ秒タイムスタンプ**: `process.hrtime.bigint()` — Node.js 固有で移植性が低い。
- **連番カウンタ**: グローバル状態管理が必要で再起動後のリセットが問題。

---

## 4. `seen-keys.jsonl` 永続化

### Decision
- **ファイル形式**: 1 行 1 キー文字列（`filename:size:mtimeMs`）のプレーンテキスト
- **パス**: `config.json` の `logFile` と同じディレクトリに `seen-keys.jsonl` として保存
- **書き込み**: `completed` イベント記録後に `appendFileSync(path, key + '\n')` で追記
- **読み込み**: 起動時に `readFileSync` で全行を読み取り `Set` に投入
- **上限超過時の再書き込み**: LRU エビクションが発生した場合、`seen-keys.jsonl` の先頭エントリを削除する必要があるが、追記方式では対応できないため、**定期的（起動時 + シャットダウン時）** に全 Set 内容を一括書き直す方式を採用する

### Startup Behavior
ファイルが存在しない・読み取り失敗・パース失敗の場合は警告ログを出力し空 Set で起動する（FR-006）。

### Rationale
追記方式はクラッシュ安全（書き込み途中でもファイルが壊れない）。ただしエビクション済みキーが残るため起動時に `Set` に読み込んだ後に `maxSeenKeys` を超えていれば古いものから削除し再書き込みする。

### Alternatives Considered
- **JSON 配列ファイル**: 全書き直しが必要でクラッシュ時データロスリスクがある。
- **SQLite**: 依存追加が必要。このユースケースには過剰。

---

## 5. HTTP ヘルスチェックサーバー

### Decision
`node:http` の `createServer` を使用する。新規 npm 依存は不要。

```typescript
import { createServer, type Server } from 'node:http';

export function startHealthServer(
  port: number,
  getStatus: () => { queueSize: number; isShuttingDown: boolean; uptimeSeconds: number }
): Server {
  const server = createServer((req, res) => {
    if (req.url !== '/health' || req.method !== 'GET') {
      res.writeHead(404).end();
      return;
    }
    const { queueSize, isShuttingDown, uptimeSeconds } = getStatus();
    const body = JSON.stringify({
      status: isShuttingDown ? 'shutting_down' : 'ok',
      queueSize,
      uptime: uptimeSeconds,
    });
    res.writeHead(isShuttingDown ? 503 : 200, {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
    });
    res.end(body);
  });

  server.listen(port);
  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`[JudgeFile] ヘルスチェックポート ${port} が使用中です。プロセスを終了します。`);
      process.exit(1);
    }
    throw err;
  });
  return server;
}
```

### Rationale
`server.listen` のエラーイベントで `EADDRINUSE` を捕捉しプロセス終了（FR-007: ポート競合 → 起動失敗）。`/health` 以外の URL は 404 を返しセキュリティ的に余分なエンドポイントを露出しない。

### Alternatives Considered
- **express / fastify**: 重量級フレームワーク。ヘルスチェック 1 エンドポイントには過剰。
- **hono**: 軽量だが新規依存。node:http で十分。

---

## 6. `corrections.jsonl` HMAC 保護

### Decision
`src/logger/integrity.ts` の `computeEntryCurrHash` を再利用する。`reviewer/index.ts` に HMAC チェーン書き込みを追加し、`verify-log.ts` の既存 `--file` オプションで検証する。

### 実装方針
1. `corrections.jsonl` のパスを `config.json` の `correctionsFile` キーで設定可能にする（既存の `logFile` ディレクトリからの相対パスではなく絶対パスを推奨）
2. 起動時（またはレビュー CLI 起動時）に `corrections.jsonl` の最終 `currHash` を読み取り、以降のエントリに `prevHash` として連鎖させる
3. `AUDIT_HMAC_SECRET` が未設定の場合は HMAC なしで記録し、標準エラーに警告出力

### Rationale
既存の `computeEntryCurrHash` は `{ ...entry, prevHash }` を JSON 文字列化して HMAC-SHA256 を計算するため、`CorrectionRecord` 型のエントリをそのまま渡せる。`verify-log.ts --file corrections.jsonl` で検証コマンドが統一される。

### Alternatives Considered
- **独立した corrections 検証ツール**: 監査ログと別のツール管理が発生。共通ツール (`verify-log.ts`) で統一する方がシンプル。
- **ファイルレベルハッシュ（SHA256 サムファイル）**: 改ざん箇所の特定ができないため不採用。

---

## 解決済み NEEDS CLARIFICATION サマリー

| 項目 | 決定 |
|------|------|
| LRU 実装 | ES6 Set 挿入順エビクション（依存追加なし） |
| グレースフル停止タイムアウト | 30 秒後に `reviewDir` 移動 + `stopped` ログ |
| TOCTOU 対策 | `randomUUID()` サフィックスに変更 |
| seen-keys.jsonl 形式 | 1 行 1 キー文字列（プレーンテキスト） |
| seen-keys.jsonl 書き込みタイミング | `completed` 後に `appendFileSync` |
| seen-keys.jsonl 起動時読み込み | `readFileSync` → Set、失敗時は空で起動 |
| ヘルスチェックサーバー | `node:http` の `createServer`（新規依存なし） |
| ポート競合時 | `EADDRINUSE` → エラーログ + `process.exit(1)` |
| corrections.jsonl パス | `config.json` の `correctionsFile` キー |
| corrections.jsonl HMAC | `computeEntryCurrHash` 再利用 |
