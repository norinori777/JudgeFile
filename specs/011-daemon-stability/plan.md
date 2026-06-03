# Implementation Plan: デーモン安定性・信頼性強化

**Branch**: `010-audit-compliance` | **Date**: 2026-06-01 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/011-daemon-stability/spec.md`

## Summary

長時間稼働デーモンの安定性を向上させる 6 つの改善を実装する。具体的には：(1) `seenKeys` の LRU 上限（デフォルト 10,000 件、ES6 Set 挿入順エビクション）、(2) SIGTERM/SIGINT グレースフル停止（30 秒タイムアウト後に残存ジョブを `reviewDir` へ移動）、(3) `resolveDestination` の TOCTOU 対策（UUID サフィックス）、(4) `seen-keys.jsonl` による処理済みキー永続化（プレーンテキスト、1 行 1 キー）、(5) オプション HTTP ヘルスチェックサーバー（`node:http`、ポート競合時は起動失敗）、(6) `corrections.jsonl` の HMAC 保護（既存 `computeEntryCurrHash` を再利用）。新規 npm 依存はゼロ。

## Technical Context

**Language/Version**: Node.js 20, TypeScript 5.x, ESM (`"type": "module"`)

**Primary Dependencies**: chokidar 3.x（watcher）, p-queue 8.x（concurrency）, zod 3.x（config validation）, openai（AI分類）, node:crypto（UUID/HMAC）, node:http（health check）

**Storage**: ファイルシステム — `seen-keys.jsonl`（プレーンテキスト、1 行 1 キー）, `corrections.jsonl`（JSONL + HMAC チェーン）

**Testing**: vitest v2.1.9

**Target Platform**: Windows / Linux サーバー（ローカルデーモン）

**Project Type**: CLI デーモン

**Performance Goals**: 10,000 件以上のファイル処理後もメモリ増加 < 200MB；`GET /health` レスポンス < 100ms

**Constraints**: `seenKeys` 上限 10,000 件（設定変更可）；グレースフル停止タイムアウト 30 秒；新規 npm 依存追加なし

**Scale/Scope**: 単一デーモン、最大同時実行 `maxConcurrency`（デフォルト 2）

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

*For this repository, the plan must satisfy the constitution below before research begins:*

- **I. 決定的処理優先** ✅ — `seenKeys` のキー生成（`filename:size:mtimeMs`）と LRU エビクションは決定的。UUID サフィックスは衝突回避のための補助であり AI 判断には依存しない。
- **II. 構造化AI出力と検証** ✅ — 本フィーチャーでは AI 出力の変更なし。`corrections.jsonl` は既存 `CorrectionRecord` スキーマに準拠。
- **III. 低信頼度は自動実行しない** ✅ — タイムアウト超過ジョブは自動移動先決定を避け `reviewDir`（人間確認キュー）へ送る。
- **IV. 抽出・分類・振り分けを分離し監査可能にする** ✅ — `AuditEvent` に `'stopped'` を追加し、タイムアウト中断を監査証跡に記録する。`corrections.jsonl` の HMAC 保護で修正ログの完全性を強化。
- **V. 小さく始めて拡張する** ✅ — 各 US（LRU cap / graceful shutdown / TOCTOU / persistence / health check / corrections HMAC）は独立した additive な変更であり既存機能を破壊しない。

**Constitution Check Result**: PASS（違反なし）

## Project Structure

### Documentation (this feature)

```text
specs/011-daemon-stability/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
│   ├── config-schema.md
│   └── seen-keys-format.md
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
src/
├── index.ts               # [変更] main() に setupGracefulShutdown() と HealthCheckServer 追加
├── types/
│   └── index.ts           # [変更] AuditEvent に 'stopped' 追加
├── config/
│   └── schema.ts          # [変更] seenKeysMaxSize / gracefulShutdownTimeoutMs / healthCheck.port / correctionsFile 追加
├── watcher/
│   └── index.ts           # [変更] seenKeys を SeenKeyStore へ委譲、SeenKeyStore import
├── queue/
│   └── index.ts           # [変更] activeFiles Set 追加、getActiveFiles() 公開
├── router/
│   └── index.ts           # [変更] resolveDestination の suffix を Date.now() → randomUUID()
├── reviewer/
│   └── index.ts           # [変更] corrections.jsonl HMAC チェーン書き込み追加
└── [新規]
    ├── seen-key-store.ts  # SeenKeyStore クラス（LRU cap + 永続化）
    ├── health-server.ts   # HealthCheckServer（node:http）
    └── shutdown.ts        # setupGracefulShutdown()

tests/
├── daemon-stability.test.ts  # [新規] US1–US6 の vitest テスト
```

**Structure Decision**: 単一プロジェクト構成（Option 1）を継続。新規ファイルは `src/` 直下に配置し既存モジュール分離方針を維持する。
## Implementation Notes

### US1 — seenKeys LRU 上限（FR-001）

**新規ファイル**: `src/seen-key-store.ts`

```typescript
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';

export class SeenKeyStore {
  private readonly store: Set<string>;
  private readonly maxSize: number;
  private readonly persistPath: string;

  constructor(maxSize: number, persistPath: string) {
    this.maxSize = maxSize;
    this.persistPath = persistPath;
    this.store = this.load();
  }

  has(key: string): boolean { return this.store.has(key); }

  add(key: string): void {
    if (this.store.has(key)) return;
    if (this.store.size >= this.maxSize) {
      const oldest = this.store.values().next().value as string;
      this.store.delete(oldest);
    }
    this.store.add(key);
    appendFileSync(this.persistPath, key + '\n', 'utf-8');
  }

  private load(): Set<string> {
    try {
      const lines = readFileSync(this.persistPath, 'utf-8')
        .split('\n').filter(Boolean);
      return new Set(lines.slice(-this.maxSize));
    } catch {
      return new Set();
    }
  }

  /** シャットダウン時などに全エントリを再書き込みする（エビクション後の不整合解消） */
  flush(): void {
    writeFileSync(this.persistPath, [...this.store].join('\n') + '\n', 'utf-8');
  }
}
```

### US2 — グレースフル停止（FR-002, FR-003, FR-011）

**新規ファイル**: `src/shutdown.ts`

```typescript
export function setupGracefulShutdown(
  watcher: FSWatcher,
  queue: Queue,
  config: Config,
  healthServer?: Server,
): void {
  const handler = async () => {
    await watcher.close();
    const timedOut = await Promise.race([
      queue.onIdle().then(() => false),
      sleep(config.gracefulShutdownTimeoutMs ?? 30_000).then(() => true),
    ]);
    if (timedOut) {
      for (const filePath of queue.getActiveFiles()) {
        // reviewDir に移動 + 'stopped' 監査ログ記録
        const dest = await safeMoveTo(filePath, config.reviewDir);
        writeLog({ id: randomUUID(), event: 'stopped', timestamp: new Date().toISOString(), filePath: dest, reason: 'graceful-shutdown-timeout' });
      }
    }
    healthServer?.close();
    process.exit(0);
  };
  process.once('SIGTERM', () => void handler());
  process.once('SIGINT', () => void handler());
}
```

### US3 — TOCTOU 対策（FR-004）

**変更ファイル**: `src/router/index.ts`（1 行変更）

```typescript
// Before:
return join(destDir, `${stem}-${Date.now()}${ext}`);
// After:
return join(destDir, `${stem}-${randomUUID()}${ext}`);
```

### US4 — 処理済みキー永続化（FR-005, FR-006）

`src/seen-key-store.ts` の `SeenKeyStore` を `src/watcher/index.ts` で使用する。

```typescript
// watcher/index.ts
const seenKeyStore = new SeenKeyStore(
  config.seenKeysMaxSize ?? 10_000,
  join(dirname(config.logFile), 'seen-keys.jsonl'),
);
```

`completed` イベント記録後に `seenKeyStore.add(fileKey)` を呼ぶ（`src/queue/index.ts` 内）。

### US5 — ヘルスチェックサーバー（FR-007, FR-008）

**新規ファイル**: `src/health-server.ts`（詳細は research.md 参照）

`src/index.ts` で `config.healthCheck?.port` が存在する場合のみ起動する。

### US6 — corrections.jsonl HMAC 保護（FR-009, FR-010）

**変更ファイル**: `src/reviewer/index.ts`

- 既存の `computeEntryCurrHash` を `src/logger/integrity.ts` から import する
- `corrections.jsonl` のパスを `config.correctionsFile` から取得する（後方互換: 未設定時は現行の `join(dirname(config.logFile), 'corrections.jsonl')`）
- `AUDIT_HMAC_SECRET` が設定されている場合は HMAC チェーン書き込みを行う

## Exported Functions / Classes

| モジュール | 公開 API | 用途 |
|-----------|---------|------|
| `src/seen-key-store.ts` | `SeenKeyStore` | watcher で使用 |
| `src/health-server.ts` | `startHealthServer()` | index.ts で使用 |
| `src/shutdown.ts` | `setupGracefulShutdown()` | index.ts で使用 |
| `src/queue/index.ts` | `getActiveFiles()` | shutdown.ts で使用 |
| `src/config/schema.ts` | `ConfigSchema` (更新) | config loader で使用 |
| `src/types/index.ts` | `AuditEvent` (更新) | logger/queue で使用 |

## Complexity Tracking

*違反なし — Constitution Check PASS*
