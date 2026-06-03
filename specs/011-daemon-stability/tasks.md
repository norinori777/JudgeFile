# Tasks: デーモン安定性・信頼性強化

**Feature**: 011-daemon-stability  
**Branch**: `010-audit-compliance`  
**Input**: `specs/011-daemon-stability/`

**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/ ✅

---

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 並列実行可能（異なるファイル、依存なし）
- **[US#]**: 対応ユーザーストーリー番号
- ファイルパスはすべて実際のパスを記載

---

## Phase 1: Setup（共有インフラ）

**Purpose**: 新規ファイル作成とテストファイルの骨格を用意する

- [X] T001 `src/seen-key-store.ts` を新規作成（空ファイル + モジュール宣言）
- [X] T002 [P] `src/health-server.ts` を新規作成（空ファイル + モジュール宣言）
- [X] T003 [P] `src/shutdown.ts` を新規作成（空ファイル + モジュール宣言）
- [X] T004 [P] `tests/daemon-stability.test.ts` を新規作成（vitest 骨格のみ）

**Checkpoint**: 新規ファイル 4 件が存在し、`yarn build` がエラーなく通る

---

## Phase 2: Foundational（ブロッキング前提条件）

**Purpose**: 全ユーザーストーリーが依存する型・設定スキーマ変更を先行して完了する

**⚠️ CRITICAL**: Phase 2 完了前はいずれのユーザーストーリーも実装できない

- [X] T005 `src/types/index.ts` の `AuditEvent` 型に `'stopped'` を追加する（FR-011）
- [X] T006 [P] `src/types/index.ts` の `AuditLogEntry` に `reason?: string` フィールドを追加する（stopped イベント用）
- [X] T007 `src/config/schema.ts` に `seenKeysMaxSize`（デフォルト 10000）を追加する（contracts/config-schema.md 参照）
- [X] T008 [P] `src/config/schema.ts` に `gracefulShutdownTimeoutMs`（デフォルト 30000）を追加する
- [X] T009 [P] `src/config/schema.ts` に `healthCheck: z.object({ port }).optional()` を追加する
- [X] T010 [P] `src/config/schema.ts` に `correctionsFile: z.string().optional()` を追加する
- [X] T011 `src/types/index.ts` の `CorrectionRecord` に `prevHash?: string` と `currHash?: string` を追加する（US6 HMAC 用）

**Checkpoint**: `yarn build` が通り、既存テスト 106 件がすべてパスする

---

## Phase 3: User Story 1 — seenKeys LRU 上限（Priority: P1）🎯 MVP

**Goal**: 長時間稼働時のメモリ増加を防ぐため、処理済みキーの保持数を最大 10,000 件に制限し、超過時は最古エントリをエビクションする

**Independent Test**: `tests/daemon-stability.test.ts` で `SeenKeyStore` に 10,001 件追加したとき、`store.size` が 10,000 を超えないことを確認できる

- [X] T012 [US1] `src/seen-key-store.ts` に `SeenKeyStore` クラスを実装する（`has()` / `add()` / `flush()` メソッド、LRU エビクション、`appendFileSync` による追記）（data-model.md の SeenKeyStore 節参照）
- [X] T013 [US1] `src/watcher/index.ts` の `const seenKeys = new Set<string>()` を `SeenKeyStore` に置き換える（`config.seenKeysMaxSize` と `seen-keys.jsonl` パスを渡す）。watcher は `has()` のみ使用し、`add()` は T022 で queue の completed イベント後に呼ぶ（FR-005: completed 後のみ永続化）
- [X] T014 [US1] `src/seen-key-store.ts` の `load()` メソッドを実装する（起動時に `seen-keys.jsonl` を読み込み、失敗時は空 Set で継続）（FR-006）
- [X] T015 [US1] `tests/daemon-stability.test.ts` に US1 テストを追加する（エントリ上限・エビクション順序・ファイル読み込み失敗時の空 Set 起動を検証）

**Checkpoint**: US1 テストが全パス。`seenKeys` の `size` が `seenKeysMaxSize` を超えない

---

## Phase 4: User Story 2 — グレースフル停止（Priority: P1）

**Goal**: SIGTERM/SIGINT 受信時に処理中ファイルをすべて安全に完了または `reviewDir` に移動してからプロセスを終了する

**Independent Test**: SIGTERM 送信後にプロセスが終了し、監査ログに `completed` または `stopped` イベントが記録されることをテストで確認できる

- [X] T016 [US2] `src/queue/index.ts` に `activeFiles: Set<string>` を追加し、ジョブ開始時に `add`・完了時に `delete` し、`getActiveFiles()` を公開する（data-model.md の Queue 変更節参照）
- [X] T017 [US2] `src/shutdown.ts` に `setupGracefulShutdown()` を実装する（watcher.close → onIdle/タイムアウト race → 残存ジョブ reviewDir 移動 → stopped ログ → seenKeyStore.flush → healthServer?.close → process.exit(0)）（plan.md の US2 節参照）
- [X] T018 [US2] `src/index.ts` の `main()` に `setupGracefulShutdown()` 呼び出しを追加し、`seenKeyStore` と `queue` を渡す
- [X] T019 [US2] `tests/daemon-stability.test.ts` に US2 テストを追加する（タイムアウト時の reviewDir 移動・stopped ログ記録・SIGINT 同一フローを検証）

**Checkpoint**: US2 テストが全パス。タイムアウト後に残存ジョブが `reviewDir` に存在し `stopped` ログが記録されている

---

## Phase 5: User Story 3 — TOCTOU 対策（Priority: P2）

**Goal**: 移動先に同名ファイルが存在する場合に UUID サフィックスを使って衝突しない一意なパスを返し、どちらのファイルも失わない

**Independent Test**: `resolveDestination` に同名ファイルが存在するディレクトリを渡したとき、返却パスが元のパスと異なり UUID 文字列を含むことをテストで確認できる

- [X] T020 [US3] `src/router/index.ts` の `resolveDestination` で衝突時のサフィックスを `${Date.now()}` から `randomUUID()` に変更する（`node:crypto` の `randomUUID` を import 済みのため 1 行変更）（FR-004）
- [X] T021 [US3] `tests/daemon-stability.test.ts` に US3 テストを追加する（同名ファイル存在時に UUID サフィックスが付与され 2 件とも保存されることを検証）

**Checkpoint**: US3 テストが全パス。同名ファイル 2 件が別パスに保存される

---

## Phase 6: User Story 4 — 処理済みキー永続化（Priority: P2）

**Goal**: デーモン再起動後に処理済みファイルが再処理されないよう、識別キーを `seen-keys.jsonl` に永続化し起動時に読み込む

**Independent Test**: `SeenKeyStore` を一度作成してキーを追加し、同じパスで新たに `SeenKeyStore` を生成したとき、`has(key)` が `true` を返すことをテストで確認できる

- [X] T022 [US4] `src/queue/index.ts` の `completed` イベント記録後に `seenKeyStore.add(fileKey)` を呼び出すよう変更する（FR-005: completed のみ永続化、failed は記録しない）
- [X] T023 [US4] `src/index.ts` で `SeenKeyStore` を初期化し（`config.seenKeysMaxSize`, `seen-keys.jsonl` パス）`startWatcher` と `queue` に渡す
- [X] T024 [US4] `src/shutdown.ts` の停止シーケンス末尾に `seenKeyStore.flush()` を追加する（全エントリを `writeFileSync` で再書き込み）
- [X] T025 [US4] `tests/daemon-stability.test.ts` に US4 テストを追加する（永続化 → 再ロードで同一キーが存在する・ファイル破損時に空 Set で起動する・`failed` キーは記録されないことを検証）

**Checkpoint**: US4 テストが全パス。`seen-keys.jsonl` が生成され、再起動後に重複処理が発生しない

---

## Phase 7: User Story 5 — HTTP ヘルスチェック（Priority: P3）

**Goal**: `config.healthCheck.port` が設定された場合に `GET /health` を提供し、稼働中は 200・停止中は 503 を返す。ポート競合時は起動失敗とする

**Independent Test**: `startHealthServer()` を呼んで `GET /health` を実行したとき `{"status":"ok","queueSize":0,"uptime":<n>}` が返ることをテストで確認できる

- [X] T026 [US5] `src/health-server.ts` に `startHealthServer()` を実装する（`node:http` の `createServer`・`/health` のみ 200/503・他 URL は 404・`EADDRINUSE` は `process.exit(1)`）（plan.md の US5 節・research.md 参照）
- [X] T027 [US5] `src/index.ts` の `main()` に `config.healthCheck?.port` の存在確認を追加し、存在する場合 `startHealthServer()` を呼び出す
- [X] T028 [US5] `src/shutdown.ts` の停止シーケンスに `healthServer?.close()` を追加する（isShuttingDown フラグを立てて 503 を返す）
- [X] T029 [US5] `tests/daemon-stability.test.ts` に US5 テストを追加する（200 レスポンス・queueSize/uptime フィールド・shutting_down 時の 503 を検証）

**Checkpoint**: US5 テストが全パス。`curl http://localhost:<port>/health` が正しいレスポンスを返す

---

## Phase 8: User Story 6 — corrections.jsonl HMAC 保護（Priority: P3）

**Goal**: `AUDIT_HMAC_SECRET` が設定されている場合に `corrections.jsonl` の各エントリに HMAC チェーン（`prevHash`/`currHash`）を付与し、`verify-log.ts --file` で改ざんを検知できるようにする

**Independent Test**: レビュー CLI で承認操作後に `corrections.jsonl` を手動で改ざんし `verify-log.ts --file corrections.jsonl` を実行したとき、改ざんが違反として報告されることをテストで確認できる

- [X] T030 [US6] `src/reviewer/index.ts` の `correctionsPath` 決定ロジックを `config.correctionsFile ?? join(dirname(config.logFile), 'corrections.jsonl')` に変更する（FR-010）
- [X] T031 [US6] `src/reviewer/index.ts` に `readLastCurrHash()` と同等のロジックを追加し、`corrections.jsonl` の末尾 `currHash` を読み取る（`src/logger/integrity.ts` の `computeEntryCurrHash` を import）
- [X] T032 [US6] `src/reviewer/index.ts` の `CorrectionRecord` 書き込み処理に `prevHash`/`currHash` を付与するよう変更する（`AUDIT_HMAC_SECRET` 設定時のみ・未設定時は警告を stderr に出力）（FR-009）
- [X] T033 [US6] `tests/daemon-stability.test.ts` に US6 テストを追加する（HMAC 付与・改ざん検知・HMAC 未設定時の警告を検証）

**Checkpoint**: US6 テストが全パス。`verify-log.ts --file corrections.jsonl` で改ざんが 100% 検知される

---

## Phase 9: Polish & Cross-Cutting

**Purpose**: 品質確認・ドキュメント整合・エラーハンドリング補完

- [X] T034 [P] `src/seen-key-store.ts` の `persistPath` が書き込み不可の場合の挙動を実装する（警告ログ出力 + インメモリ運用継続）（Edge Cases: 書き込み権限なし）
- [X] T035 [P] `src/health-server.ts` の `/health` 以外のリクエストに 404 を返すことを確認し、`X-Content-Type-Options: nosniff` ヘッダーを追加する（OWASP 対策）
- [X] T036 全テスト（`yarn test`）を実行して 106 件 + 新規追加分がすべてパスすることを確認する
- [X] T037 `specs/011-daemon-stability/quickstart.md` の起動ログ例が実際の出力と一致することを確認する
- [X] T038 `specs/011-daemon-stability/spec.md` の Status を `Draft` から `Complete（実装完了 2026-06-03）` に更新する

**Checkpoint**: 全テストパス、spec.md 更新完了

---

## Dependencies & Execution Order

### フェーズ依存関係

```
Phase 1 (Setup)
  └─► Phase 2 (Foundational) ─── すべての US をブロック
        ├─► Phase 3 (US1: seenKeys LRU) ─ [P] Phase 4 と並列実行可
        ├─► Phase 4 (US2: Graceful Stop) ─ [P] Phase 3 と並列実行可
        ├─► Phase 5 (US3: TOCTOU)        ─ [P] 独立実行可
        ├─► Phase 6 (US4: Persistence)   ─ Phase 3 完了後推奨（SeenKeyStore 依存）
        ├─► Phase 7 (US5: Health Check)  ─ [P] 独立実行可
        └─► Phase 8 (US6: HMAC)         ─ [P] 独立実行可
              └─► Phase 9 (Polish)
```

### ユーザーストーリー依存関係

| ストーリー | 前提 | 並列実行 |
|-----------|------|---------|
| US1 (seenKeys LRU) | Phase 2 完了 | US2, US3, US5, US6 と並列可 |
| US2 (Graceful Stop) | Phase 2 完了, US1 の SeenKeyStore 型定義 | US1 と並列可 |
| US3 (TOCTOU) | Phase 2 完了 | すべての US と並列可 |
| US4 (Persistence) | US1 の `SeenKeyStore` 実装完了 | US3, US5, US6 と並列可 |
| US5 (Health Check) | Phase 2 完了 | すべての US と並列可 |
| US6 (HMAC) | Phase 2 完了（`CorrectionRecord` 型変更） | US3, US5 と並列可 |

### 並列実行例

```
[担当者 A] T005→T007→T012→T013→T014→T016→T017→T018
[担当者 B] T006→T008→T009→T010→T011→T020→T026→T027→T030
[担当者 C] T001→T002→T003→T004→T015→T021→T029→T033
```

---

## Implementation Strategy

**MVP スコープ**: Phase 1 + Phase 2 + Phase 3（US1: seenKeys LRU）+ Phase 4（US2: Graceful Stop）

US1 と US2 は P1 優先度であり、OOM とファイルロストという最も高リスクな問題を解消する。US3–US6 は US1/US2 完了後に独立して追加できる。

**推奨実装順序**:

1. T001–T011（Setup + Foundational）— すべての前提
2. T012–T015（US1）と T016–T019（US2）— P1 優先度、並列実行推奨
3. T022–T025（US4）— US1 の `SeenKeyStore` 完了後すぐ
4. T020–T021（US3）— 最小変更（1 行）なので任意のタイミング
5. T026–T029（US5）— オプション機能、独立実装
6. T030–T033（US6）— セキュリティ強化、独立実装
7. T034–T038（Polish）— 最終確認

---

## タスクサマリー

| フェーズ | タスク数 | 対象 |
|---------|---------|------|
| Phase 1: Setup | 4 | 新規ファイル骨格 |
| Phase 2: Foundational | 7 | 型・設定スキーマ変更 |
| Phase 3: US1 seenKeys LRU | 4 | `SeenKeyStore` 実装 |
| Phase 4: US2 Graceful Stop | 4 | `shutdown.ts` 実装 |
| Phase 5: US3 TOCTOU | 2 | `resolveDestination` 1 行変更 |
| Phase 6: US4 Persistence | 4 | `seen-keys.jsonl` 永続化 |
| Phase 7: US5 Health Check | 4 | `health-server.ts` 実装 |
| Phase 8: US6 HMAC | 4 | `reviewer/index.ts` HMAC 追加 |
| Phase 9: Polish | 5 | 品質確認・ドキュメント |
| **合計** | **38** | |
