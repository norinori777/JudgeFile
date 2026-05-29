# Tasks: 設定済みルートへのベストマッチ振り分けとフォールバック

**Input**: Design documents from `/specs/004-route-best-match-fallback/`

**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/ ✅, quickstart.md ✅

**Branch**: `004-route-best-match-fallback`

---

## Phase 1: セットアップ（ベースライン確認）

**Purpose**: 既存テストがすべて通ることを確認し、変更前の回帰ベースラインを記録する

- [ ] T001 `yarn test` を実行し、既存のすべてのテストが通過することを確認する（回帰ベースライン）

**Checkpoint**: 既存テスト全通過 — ユーザーストーリー実装を開始できる

---

## Phase 2: 基盤（Foundational）

**Purpose**: なし — US1/US2（router）と US3（classifier）は互いに独立して開始できる

_ブロッカーなし。Phase 3 と Phase 4 を同時に着手可能。_

---

## Phase 3: User Story 1 + User Story 2 — Router フォールバック実装 (Priority: P1) 🎯 MVP

**Goal**: `routes` への完全一致を維持しつつ、不一致時に `routes["その他"]` へフォールバックする 3 分岐ロジックを `src/router/index.ts` に実装する

**Independent Test**:
- US1: 完全一致するカテゴリのファイルが既存フォルダへ `moveType: "auto"` で移動する
- US2: `routes` にないカテゴリが `routes["その他"]` へ `moveType: "auto"` で移動し、監査ログに理由が記録される

### 実装

- [X] T002 [P] [US2] `src/router/index.ts` の先頭に `const FALLBACK_ROUTE_KEY = 'その他'` 定数を追加する（research.md §2 参照）
- [X] T003 [US2] `src/router/index.ts` の `route()` 関数を 3 分岐ロジック（完全一致 / 「その他」フォールバック / review）に書き換える（research.md §2 の実装パターン参照、FR-003/004/005/006）

### テスト

- [X] T004 [US1] `tests/route-fallback.test.ts` を新規作成し、以下 4 ケースのユニットテストを実装する（`vi.mock('node:fs/promises')` でファイル移動をモック化）
  1. 完全一致: `routes[category]` が存在 → そのフォルダへ `moveType: "auto"`（US1 回帰）
  2. フォールバック: `routes[category]` 不在 + `routes["その他"]` 存在 → 「その他」フォルダへ `moveType: "auto"` + `reason` 設定
  3. 低信頼スコア: `confidence < threshold` → `reviewDir` へ `moveType: "review"`
  4. 「その他」未設定: 不一致 + 「その他」なし → `reviewDir` へ `moveType: "review"`

---

## Phase 4: User Story 3 — Classifier プロンプト動的化 (Priority: P2)

**Goal**: `classify()` が呼ばれるたびに `config.routes` のキー一覧を SYSTEM_PROMPT へ動的注入し、AI が設定済みカテゴリを優先選択するよう誘導する

**Independent Test**: `routes` に「スケジュール」「日記」が設定された状態で `buildSystemPrompt(['スケジュール', '日記'])` を呼び出し、返されたプロンプト文字列に両カテゴリ名が含まれることを確認する

### 実装

- [X] T005 [P] [US3] `src/classifier/schema.ts` の `export const SYSTEM_PROMPT` を `export function buildSystemPrompt(routeCategories: string[]): string` に書き換える（research.md §1 の実装パターン参照、FR-001）
  - `routeCategories` が空配列のときはカテゴリ一覧セクションを省略し既存相当のプロンプトを返す
- [X] T006 [US3] `src/classifier/index.ts` の `classify()` を更新し、`SYSTEM_PROMPT` を `buildSystemPrompt(Object.keys(config.routes))` に置き換える（FR-002）
  - `messages[0].content` を `systemPrompt` 変数経由に変更する

---

## Phase 5: ポリッシュ & クロスカッティング

**Purpose**: ビルド確認・全回帰テスト・型チェック

- [X] T007 [P] `tsc --noEmit`（`yarn lint`）を実行し、TypeScript 型エラーがないことを確認する
- [X] T008 `yarn test` を実行し、新規テスト（T004）を含む全テストが通過することを確認する

---

## 依存関係グラフ

```
T001（ベースライン確認）
    ↓
T002 [P] ────────────────────────── T005 [P]
（FALLBACK_ROUTE_KEY 定数）         （buildSystemPrompt 関数化）
    ↓                                   ↓
T003                                T006
（route() 3分岐ロジック）           （classify() 更新）
    ↓
T004
（route-fallback.test.ts）
    ↓─────────────────────────────────────↓
                    T007 [P]
                 （tsc --noEmit）
                    ↓
                   T008
              （yarn test 全実行）
```

**並列実行の機会**:
- T002（router 定数）と T005（classifier 関数化）は異なるファイルで並列実行可能
- T007（lint）と T004 完了後の確認作業は並列実行可能

---

## 実装戦略

**MVP スコープ（推奨着手順）**:
1. T001 → T002 → T003 → T004（US1 + US2 完成）= 最小実用製品
2. T005 → T006（US3 追加）= AI 分類精度の向上
3. T007 → T008（品質確認）= リリース準備

**US2（フォールバック）が US3（プロンプト動的化）より前でよい理由**:
- フォールバックは config.json の設定変更だけで即座に効果を発揮する
- プロンプト動的化は AI の精度を向上させるが、フォールバックが先にあれば誤分類も救済される

---

## 変更ファイル一覧

| ファイル | 変更種別 | 対象タスク |
|---------|---------|-----------|
| `src/router/index.ts` | 変更 | T002, T003 |
| `src/classifier/schema.ts` | 変更 | T005 |
| `src/classifier/index.ts` | 変更 | T006 |
| `tests/route-fallback.test.ts` | 新規作成 | T004 |
