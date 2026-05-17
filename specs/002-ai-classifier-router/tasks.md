---
description: "Task list for 002-ai-classifier-router"
---

# Tasks: AI 分類・スキーマ検証・振り分けルーター

**Input**: Design documents from `/specs/002-ai-classifier-router/`

**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/ ✅

---

## Phase 1: Setup（プロジェクト初期化）

**Purpose**: Round 2 専用パッケージのインストール

- [X] T001 `openai` パッケージをインストールし package.json の dependencies に追加する（`npm install openai`）

---

## Phase 2: Foundational（全ユーザーストーリーを BLOCK する基盤）

**Purpose**: 全ストーリーが依存する型定義・設定スキーマ・Zod スキーマを整備する

**⚠️ CRITICAL**: このフェーズが完了するまでユーザーストーリーの実装を開始してはならない

- [X] T002 `src/types/index.ts` に `ClassificationResult`・`RouteDecision`・`MoveType` 型を追加し `AuditLogEntry` に Round 2 フィールド（`category`, `confidence`, `tags`, `confidentiality`, `destination`, `moveType`）を追記する
- [X] T003 [P] `src/config/schema.ts` の `ConfigSchema` に `reviewDir`（必須）・`routes`・`confidenceThreshold`・`model`・`apiTimeoutMs` フィールドを追加する（data-model.md 参照）
- [X] T004 [P] `src/classifier/schema.ts` を新規作成し `ClassificationResultSchema`（Zod）と `SYSTEM_PROMPT` 定数を定義する（research.md §3 / §6 参照）

**Checkpoint**: 型定義・設定スキーマ・Zod スキーマが揃った状態。ユーザーストーリー実装を開始できる

---

## Phase 3: User Story 1 — txt / md を置くと分類されて自動振り分けされる（Priority: P1）🎯 MVP

**Goal**: 監視フォルダへのファイル配置から AI 分類・フォルダ移動・ログ記録までのパイプライン全体を稼働させる

**Independent Test**: 監視フォルダに `invoice.txt`（任意のテキスト内容）を配置し、処理完了後に対応する routes フォルダへ移動していること・監査ログに `category`・`confidence`・`destination`・`moveType: "auto"` が記録されていることを確認する

### Implementation for User Story 1

- [X] T005 [US1] `src/classifier/index.ts` を新規作成し `classify(text: string, config: Config): Promise<ClassificationResult>` を実装する（`new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: config.apiTimeoutMs })`・`response_format: { type: 'json_object' }`・`JSON.parse`・`ClassificationResultSchema.safeParse` によるZod 検証・検証失敗時は `Error` を throw）
- [X] T006 [P] [US1] `src/router/index.ts` を新規作成し `moveFile(src, dest): Promise<void>`（`fs.promises.rename` + EXDEV 時 `copyFile`+`unlink` フォールバック）と `resolveDestination(filePath, destDir): Promise<string>`（`access` で衝突確認・衝突時 `{stem}-{Date.now()}{ext}` サフィックス）ヘルパーを実装する（research.md §4・§5 参照）
- [X] T007 [US1] `src/router/index.ts` に `route(filePath: string, result: ClassificationResult, config: Config): Promise<RouteDecision>` を実装する（`confidence >= config.confidenceThreshold`（`>`ではなく`>=`、境界値 `0.0`・`1.0` を含む）AND `routes[category]` 存在 → `moveType: 'auto'`・それ以外 → `moveType: 'review'`（reason は T010 で追加、本タスクでは moveType のみ設定）・実行時 mkdir（実際の移動先フォルダが存在しない場合のみ作成）・`resolveDestination`・`moveFile` を呼び出す。`src === dest` の場合はスキップして warn ログを記録する）（T002, T006 依存）
- [X] T008 [US1] `src/queue/index.ts` を更新し、`ExtractedText` 取得後に `ExtractedText.text.trim() === ''` の場合は `classify` を呼び出さず `event: 'skipped'`・`error: 'empty text'` をログに記録して次ジョブへ進む（FR-015）。空テキストでない場合は `classify` → `route` の連鎖を呼び出し、`completed` ログエントリに `category`・`confidence`・`tags`・`confidentiality`・`destination`・`moveType` を追記する。`ExtractedText.text` 本文はいかなるログフィールドにも含めないこと（FR-014）。（T005・T007 依存）
- [X] T009 [US1] `src/index.ts` を更新し起動時に `process.env.OPENAI_API_KEY` 未設定エラーチェックと `config.reviewDir` および `config.routes` の全値パスに対して `mkdir -p` を実行する（起動時保証：T007 の実行時 mkdir とは別責務）（T003 依存）

**Checkpoint**: US1 完了。ファイルを監視フォルダに置くと AI 分類・振り分け・ログ記録が動作することを手動確認できる

---

## Phase 4: User Story 2 — 信頼度が低いファイルは review フォルダに分岐される（Priority: P2）

**Goal**: `confidence < confidenceThreshold` または `routes` 未定義カテゴリのファイルが `reviewDir` へ移動し、判定理由がログから追跡できる状態にする

**Independent Test**: `classify` をモックして `confidence: 0.5`（閾値 0.8）を返すように設定し、ファイルが `reviewDir` へ移動すること・ログに `moveType: "review"` と判定理由（`error` フィールド）が記録されていることを確認する

### Implementation for User Story 2

- [X] T010 [US2] T007 で設定した review 分岐（moveType のみ）に `reason` フィールドを追加する（信頼度不足: `信頼度 ${confidence} < 閾値 ${confidenceThreshold}`・routes 未定義: `routes にカテゴリ未定義: ${category}`）。`src/queue/index.ts` の review ケース（`moveType: 'review'`）で `AuditLogEntry.error` に `reason` を記録するよう更新する（T007 依存）

**Checkpoint**: US2 完了。低信頼度・未定義カテゴリのファイルが review フォルダに移動し、ログで原因を確認できる

---

## Phase 5: User Story 3 — AI エラー・無効レスポンスが発生しても他のファイルの処理が止まらない（Priority: P3）

**Goal**: OpenAI API のタイムアウト・エラー・Zod 検証失敗が 1 件のジョブにのみ影響し、他のジョブは継続処理される

**Independent Test**: `classify` をモックして `APIConnectionTimeoutError` を throw するように設定し、5 件並行投入のうち該当ファイルのみが `reviewDir` へ移動・`failed` ログ（`moveType: "error"`）が記録され・残り 4 件が正常に処理されることを確認する

### Implementation for User Story 3

- [X] T011 [US3] `src/classifier/index.ts` に `APIError`（タイムアウト・429 含む全 OpenAI エラー）・`JSON.parse` 失敗・Zod `safeParse` 失敗のエラーハンドリングを追加し、エラー種別を含む説明的なメッセージで `Error` を再スローする（リトライは行わない）
- [X] T012 [US3] `src/queue/index.ts` の `classify` → `route` 連鎖呼び出しを `try/catch` で囲み、エラー時に `reviewDir` へのファイル移動（`moveFile`）・`failed` ログエントリ（`event: 'failed'`・`moveType: 'error'`・`destination`・`error` フィールド）の記録・次ジョブへの継続（`p-queue` の他タスクは止めない）を実装する（T011 依存）

**Checkpoint**: US3 完了。全 3 ユーザーストーリーが独立して動作することを確認できる

---

## Phase 6: Polish & 横断的関心事

**Purpose**: ビルド確認と実行時検証

- [X] T013 `tsconfig.json` の `include` が `src/classifier/` と `src/router/` を解決することを確認し必要なら修正する。`npm run build` を実行して `dist/` が生成されエラーがないことを確認する

---

## Dependencies & Execution Order

### Phase 依存関係

- **Setup (Phase 1)**: 依存なし — 即時開始可能
- **Foundational (Phase 2)**: Phase 1 完了後 — 全ユーザーストーリーを BLOCK
- **US1 (Phase 3)**: Phase 2 完了後に開始可能
- **US2 (Phase 4)**: Phase 3 完了後（T007 の route() が存在することが前提）
- **US3 (Phase 5)**: Phase 3 完了後（T005・T008 が存在することが前提）
- **Polish (Phase 6)**: 全ユーザーストーリー完了後

### ユーザーストーリー依存関係

- **US1 (P1)**: Foundational 完了後に開始可能。他ストーリーへの依存なし
- **US2 (P2)**: US1 の T007 (route()) 完了後に開始可能
- **US3 (P3)**: US1 の T005 (classify()) と T008 (queue 連鎖) 完了後に開始可能

### タスクレベル依存関係

| タスク | 依存 |
|---|---|
| T002 | T001 |
| T003, T004 | T001（T002 と並列実行可） |
| T005 | T002, T004 |
| T006 | T002（T005 と並列実行可） |
| T007 | T002, T006 |
| T008 | T005, T007 |
| T009 | T003 |
| T010 | T007, T008 |
| T011 | T005 |
| T012 | T008, T011 |
| T013 | T012 |

---

## Parallel Example: User Story 1

```text
# Phase 2 の並列実行（T001 完了後）:
T003: src/config/schema.ts に Round 2 フィールドを追加する
T004: src/classifier/schema.ts を新規作成する
# → T002 と並列（同一ファイルを触らない）

# Phase 3 の並列実行（T002・T003・T004 完了後）:
T005: src/classifier/index.ts を新規作成する
T006: src/router/index.ts の moveFile/resolveDestination を実装する
# → 別ファイル、依存なし
```

---

## Implementation Strategy

### MVP First（User Story 1 のみ）

1. Phase 1 (T001) を完了する: openai インストール
2. Phase 2 (T002-T004) を完了する: 型・設定・Zod スキーマ（CRITICAL）
3. Phase 3 (T005-T009) を完了する: 自動分類・振り分けパイプライン
4. **停止してバリデート**: `invoice.txt` などを監視フォルダに置いて US1 を手動確認
5. 動作確認が取れたら US2/US3 に進む

### Incremental Delivery

1. Setup + Foundational → 基盤完成
2. US1 → 手動確認 → デモ可能（MVP）
3. US2 → 低信頼度ルーティング確認
4. US3 → エラー隔離確認
5. Polish → ビルド確認

---

## Notes

- `[P]` タスク = 異なるファイル・依存なし（並列実行可）
- `[USn]` ラベル = 対応するユーザーストーリーへのトレーサビリティ
- テキスト本文（`ExtractedText.text`）を監査ログに書かないこと（FR-014 / Assumption 3）
- `OPENAI_API_KEY` は環境変数で管理。`config.json` には含めない（Assumption 3）
- API エラー時のリトライは行わない（FR-010 / Assumption 4）
- 信頼度比較は `>=`（以上）で評価する（FR-005）
