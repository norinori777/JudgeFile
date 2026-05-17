---
description: "Task list for 001-txt-md-pipeline"
---

# Tasks: txt / md 監視・抽出・ロギング基盤

**Input**: Design documents from `/specs/001-txt-md-pipeline/`

**Prerequisites**: plan.md ✅ | spec.md ✅ | research.md ✅ | data-model.md ✅ | contracts/ ✅

**Tech Stack**: Node.js 20 LTS + TypeScript 5.x | chokidar ^3 | p-queue ^8 | zod ^3 | vitest ^2

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 並列実行可能（異なるファイル、未完了タスクへの依存なし）
- **[Story]**: 対応するユーザーストーリー（US1 / US2 / US3）
- ファイルパスはすべて明示する

---

## Phase 1: セットアップ（プロジェクト初期化）

**Purpose**: Node.js + TypeScript プロジェクトの骨格を作成し、依存パッケージを導入する

- [X] T001 package.json を初期化し `name`, `version`, `main`, `scripts`（build / start / dev / lint / test）を設定する
- [X] T002 tsconfig.json を作成する（`target: ES2022`, `module: Node16`, `outDir: dist`, `strict: true`）
- [X] T003 [P] vitest.config.ts を作成する（`environment: 'node'`, `include: 'tests/**/*.test.ts'`）
- [X] T004 依存パッケージをインストールする（`chokidar`, `p-queue`, `zod`）と devDependencies（`typescript`, `vitest`, `tmp`, `@types/node`, `ts-node`）を `npm install` で導入する
- [X] T005 [P] ソースディレクトリ構造を作成する（`src/config/`, `src/watcher/`, `src/queue/`, `src/extractor/`, `src/logger/`, `src/types/`, `tests/unit/`, `tests/integration/`）

**Checkpoint**: `npm run build` がエラーなく完了すること

---

## Phase 2: 基盤実装（全ストーリー共通）

**Purpose**: 全ユーザーストーリーが依存するコアモジュール（型定義・Config・Logger）を実装する

**⚠️ CRITICAL**: このフェーズが完了するまで各ユーザーストーリーの実装を開始してはならない

- [X] T006 共有型定義を `src/types/index.ts` に実装する（`JobStatus`, `Job`, `ExtractedText`, `AuditEvent`, `AuditResult`, `AuditLogEntry` の TypeScript 型・インターフェース）
- [X] T007 [P] Config Zod スキーマを `src/config/schema.ts` に実装する（`watchDir`, `maxConcurrency`, `maxQueueSize`, `logFile`, `maxChars` のスキーマと `Config` 型エクスポート）
- [X] T008 Config ローダーを `src/config/loader.ts` に実装する（`config.json` 読み込み・Zod 検証・`watchDir` 存在確認・`logFile` 親ディレクトリ自動作成・検証失敗時のプロセス終了）
- [X] T009 [P] JSON Lines 監査ロガーを `src/logger/index.ts` に実装する（`appendFileSync` で `AuditLogEntry` を 1 行 JSON として追記する `writeLog(entry: AuditLogEntry): void` 関数）

**Checkpoint**: `src/types/index.ts`, `src/config/schema.ts`, `src/config/loader.ts`, `src/logger/index.ts` がコンパイルエラーなく通ること

---

## Phase 3: ユーザーストーリー 1 — txt / md ファイルを置くと自動検知・抽出・記録される（Priority: P1）🎯 MVP

**Goal**: 監視フォルダに .txt / .md ファイルを置くと 5 秒以内に処理が開始され、監査ログに完了が記録される最小動作パイプラインを実現する

**Independent Test**: 監視フォルダに `sample.txt`（任意の内容）を置き、処理完了後にログファイルを確認する。ログにファイルパス・抽出文字数・完了時刻が含まれていれば合格

### 実装

- [X] T010 [P] [US1] .txt テキスト抽出処理を `src/extractor/txt.ts` に実装する（UTF-8 で読み込み・`trim()` と余分な改行除去・`maxChars` 超過時は先頭 `maxChars` 文字に切り捨てて `truncationWarning` メッセージを付けた `ExtractedText` を返す。警告メッセージは Queue 層が `AuditLogEntry.error` にコピーする）
- [X] T011 [P] [US1] .md テキスト抽出処理を `src/extractor/md.ts` に実装する（UTF-8 で読み込み・`trim()` と余分な改行除去・`maxChars` 超過時は先頭 `maxChars` 文字に切り捨てて `truncationWarning` メッセージを付けた `ExtractedText` を返す。警告メッセージは Queue 層が `AuditLogEntry.error` にコピーする）
- [X] T012 [US1] 抽出ディスパッチャーを `src/extractor/index.ts` に実装する（拡張子が `.txt` なら `txt.ts`、`.md` なら `md.ts` を呼び出す `extract(filePath: string, config: Config): Promise<ExtractedText>` 関数）
- [X] T013 [US1] ジョブキューを `src/queue/index.ts` に実装する（p-queue で `concurrency: config.maxConcurrency` に設定・各ジョブで `started` ログ → `extract()` 呼び出し → `completed` ログを記録する `enqueue(filePath: string): void` 関数）
- [X] T014 [US1] ファイルウォッチャー基本実装を `src/watcher/index.ts` に実装する（chokidar で `watchDir` を `depth: 0`・`ignoreInitial: true` で監視し、`.txt` / `.md` の `add` イベントで `queue.enqueue()` を呼び出す `startWatcher(config: Config, queue: Queue): FSWatcher` 関数）
- [X] T015 [US1] エントリーポイントを `src/index.ts` に実装する（`loadConfig()` → `Logger` 初期化 → `Queue` 生成 → `startWatcher()` 起動の順で連携し、SIGINT / SIGTERM で watcher を停止してプロセスを終了する）

**Checkpoint**: `node dist/index.js` 起動後に監視フォルダへ `sample.txt` を置くと 5 秒以内に `completed` ログが記録される（SC-001 / SC-004 確認）

---

## Phase 4: ユーザーストーリー 2 — 複数ファイルを同時に投入しても安全に処理される（Priority: P2）

**Goal**: 複数ファイルを一括投入しても重複なく・欠落なく全件処理され、同時実行数が設定値を超えない

**Independent Test**: 10 件の .txt ファイルを一括コピーし、処理完了後のログを確認する。全 10 件が重複なく記録されており、同時処理数が `maxConcurrency` 以下であれば合格

### 実装

- [X] T016 [US2] バックプレッシャー制御を `src/watcher/index.ts` に追加する（`queue.size >= config.maxQueueSize` のとき chokidar の `watcher.pause()` を呼び出し、`queue.onEmpty()` コールバックまたは `await queue.onIdle()` で空きを検知して `watcher.resume()` を呼び出す。p-queue ^8 は EventEmitter イベントを持たないため `onEmpty` / `onIdle` Promise API を使用する）
- [X] T017 [US2] 重複検知を `src/watcher/index.ts` に追加する（ファイル検知時に `fs.stat()` でファイル名・サイズ・mtime を取得してキー文字列を生成し `Set<string>` で既処理を管理する。重複時は `skipped` ログを記録してキューに積まない）

**Checkpoint**: 10 件を同時投入したとき全件ログが記録され（SC-002）、`maxConcurrency` を超える同時処理が発生しないこと

---

## Phase 5: ユーザーストーリー 3 — 1 件が失敗しても他のファイルの処理が止まらない（Priority: P3）

**Goal**: 読み取り権限なし・UTF-8 エラー・ファイル消失などの異常が発生しても失敗ジョブのみ `failed` ログを記録し、残りのジョブを継続処理する

**Independent Test**: 読み取り不可ファイル 1 件を含む 5 件を投入する。失敗ファイルのエラーログがあり、その他の 4 件に完了ログがあれば合格

### 実装

- [X] T018 [US3] `src/queue/index.ts` の各ジョブ実行を `try/catch` で包み失敗隔離を実装する（`extract()` / ファイルアクセスで例外が発生した場合に `failed` ログ（`error: err.message`）を記録し、例外を飲み込んで次のジョブを継続処理する）
- [X] T019 [US3] `src/extractor/txt.ts` と `src/extractor/md.ts` に UTF-8 デコードエラー検出を追加する（`TextDecoder` の `fatal: true` オプションで読み込み、`TypeError` をキャッチして `throw` し、Queue 層の `catch` で `failed` ログを記録させる）
- [X] T020 [US3] `src/extractor/index.ts` に `ENOENT` / `EACCES` エラー時の再 `throw` を実装する（Node.js の `fs/promises.readFile` が返す `SystemError` をキャッチせず Queue 層へ伝播させる。コメントで意図を明示する）

**Checkpoint**: 読み取り不可ファイル 1 件を含む 5 件を投入したとき、失敗 1 件・完了 4 件のログが記録される（SC-003 確認）

---

## Phase 6: 仕上げ・クロスカッティング

**Purpose**: 設定変更の動作確認・起動時バリデーション・scripts 整備

- [X] T021 [P] `package.json` の `scripts` を完成させる（`build: tsc`, `start: node dist/index.js`, `dev: ts-node src/index.ts`, `test: vitest run`, `test:coverage: vitest run --coverage`, `lint: tsc --noEmit`）
- [X] T022 `config.json` の `maxConcurrency` を変更して再起動し設定が反映されることを手動確認する（SC-005 検証）
- [X] T023 `quickstart.md` の手順をすべて実行し、記載内容と実際の動作が一致することを確認して必要に応じて更新する

**Checkpoint**: `npm run build && node dist/index.js` で全ユーザーストーリーの Independent Test が通ること

---

## 依存関係と実行順序

### フェーズ依存

- **Phase 1 (Setup)**: 依存なし — 即座に開始可能
- **Phase 2 (Foundational)**: Phase 1 完了後 — Phase 3〜5 すべてをブロック
- **Phase 3 (US1)**: Phase 2 完了後 — MVP デリバリー
- **Phase 4 (US2)**: Phase 3 完了後（US1 の watcher / queue モジュールを拡張する）
- **Phase 5 (US3)**: Phase 3 完了後（US1 の queue / extractor モジュールを拡張する）。Phase 4 と並列実施可能
- **Phase 6 (Polish)**: Phase 3〜5 完了後

### ユーザーストーリー依存

```
Phase 1 (T001-T005)
    ↓
Phase 2 (T006-T009)
    ↓
Phase 3 / US1 (T010-T015) ← MVP
    ↓
Phase 4 / US2 (T016-T017) ─┐
                             ├─ Phase 6 (T021-T023)
Phase 5 / US3 (T018-T020) ─┘
```

### 各フェーズ内の並列機会

| フェーズ | 並列実行可能なタスク |
|---|---|
| Phase 1 | T003 と T005 を T001・T004 と並列実行可能 |
| Phase 2 | T007 と T009 を T006 完了後に並列実行可能 |
| Phase 3 | T010 と T011（txt.ts と md.ts）を並列実行可能 |
| Phase 4〜5 | Phase 3 完了後、US2（T016-T017）と US3（T018-T020）を並列実施可能 |
| Phase 6 | T021 は Phase 5 と並列実行可能 |

---

## 実装戦略

### MVP スコープ（最小動作確認）

**Phase 1 + Phase 2 + Phase 3（T001〜T015）のみで US1 の Independent Test が通る**。
これだけで「監視フォルダに .txt を置くと監査ログに記録される」というコアバリューが確認できる。

### 段階的デリバリー

1. **MVP**: T001〜T015 — 単一ファイルの検知・抽出・ロギング
2. **安全な並行処理**: T016〜T017（US2）— バックプレッシャー・重複検知追加
3. **耐障害性**: T018〜T020（US3）— エラー隔離追加
4. **仕上げ**: T021〜T023 — scripts・手動確認

### 拡張ポイント（後続フェーズへの橋渡し）

- `src/extractor/index.ts` の `extract()` は `ExtractedText` を返すインターフェースを保つ。次フェーズで `src/classifier/index.ts` がこの戻り値を受け取る形で拡張する
- `src/queue/index.ts` の `enqueue()` は将来的に `jobType` パラメータを追加して AI 分類ジョブを受け付けられるよう設計する（このフェーズでは実装しない）
- `AuditLogEntry` に `classifier` / `confidence` フィールドを追加する余地を `error?` の隣に確保済み
