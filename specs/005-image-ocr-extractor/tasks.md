# Tasks: 画像 OCR テキスト抽出対応

**Input**: Design documents from `/specs/005-image-ocr-extractor/`

**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/ ✅

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: 他タスクと並行実行可能（異なるファイル、未完了タスクへの依存なし）
- **[Story]**: 対応するユーザーストーリー番号（US1〜US4）
- 各タスクに実際のファイルパスを明記

---

## Phase 1: Setup（ブランチ確認・依存確認）

**Purpose**: feature ブランチと依存ライブラリを確認する（新規 npm パッケージは不要）

- [X] T001 feature ブランチ `005-image-ocr-extractor` を作成・チェックアウトし、`package.json` の依存（openai ^6.38）が揃っていることを確認する

---

## Phase 2: Foundational（型定義・設定スキーマ変更）

**Purpose**: 全ユーザーストーリーが依存する型定義と設定スキーマを更新する

**⚠️ CRITICAL**: T002・T003 が完了するまでいずれの US 実装も開始できない

- [X] T002 [P] `src/types/index.ts` の `ExtractedText` インターフェースに `ocrEngine?: string` を追加し、`AuditLogEntry` インターフェースにも `ocrEngine?: string` を追加する（data-model.md / FR-011）
- [X] T003 [P] `src/config/schema.ts` の `ConfigSchema` に `maxImageSizeMB: z.number().int().min(1).max(1000).default(10)` を追加する（config-schema.md / FR-006）

**Checkpoint**: 型定義・設定スキーマ更新完了 — US 実装を並行開始可能

---

## Phase 3: User Story 1 - 画像ファイルを置くと OCR → 分類 → 振り分けされる (Priority: P1) 🎯 MVP

**Goal**: `.png` / `.jpg` / `.jpeg` ファイルが監視フォルダに置かれると OCR でテキストを抽出し、既存の classify → route パイプラインを通じて振り分けられ、監査ログに `ocrEngine: "openai-vision"` が記録される

**Independent Test**: テキストを含む PNG を監視フォルダに置き、`event: 'completed'`・`ocrEngine: "openai-vision"`・`moveType` が監査ログに記録され、ファイルが対応するルートフォルダに移動していることを確認する

### Implementation for User Story 1

- [X] T004 [US1] `src/extractor/image.ts` を新規作成する — `extractImage(filePath, config)` 関数を実装: ①`fs.stat()` でサイズチェック（`maxImageSizeMB` 超過時は `Error` を throw）、②`fs.readFile()` で読み込み base64 変換、③OpenAI Vision API 呼び出し（`model`・`apiTimeoutMs` を config から取得）、④レスポンステキストを `trim().replace(/\n{3,}/g, '\n\n')` で正規化、⑤`maxChars` 切り捨てと `truncationWarning` 付与、⑥`ocrEngine: 'openai-vision'` を付与して `ExtractedText` を返す（FR-002/003/006/008/009 / research.md）
- [X] T005 [US1] `src/extractor/index.ts` の `extract()` switch 文に `.png` / `.jpg` / `.jpeg` の case を追加し `extractImage(filePath, config)` に委譲する（FR-001/010）
- [X] T006 [US1] `src/queue/index.ts` の `completedEntry` オブジェクトに `...(result.ocrEngine ? { ocrEngine: result.ocrEngine } : {})` を追記する（FR-011 / data-model.md）
- [X] T007 [US1] `tests/image-ocr.test.ts` を新規作成する — Vision API をモックして以下のテストケースを追加: ①テキスト含む画像の正常 OCR・`ocrEngine` フィールド確認、②`maxChars` 超過時の切り捨てと `truncationWarning` 確認、③日本語テキスト含む画像が正常に処理されること、④`yarn test` で全テストが通ることを確認（SC-001/002）

**Checkpoint**: US1 完了 — テキスト含む画像の OCR → 分類 → 振り分けが動作し、`ocrEngine` フィールドが監査ログに記録される

---

## Phase 4: User Story 2 - テキストを読み取れない画像でも処理が止まらない (Priority: P2)

**Goal**: Vision API が空文字を返す画像（写真・白紙等）が来ても `event: 'skipped'` として処理が完結し、他のジョブが継続される

**Independent Test**: テキストを含まない写真画像でテストを実行し、`event: 'skipped'` ログが記録され、AI 分類が呼び出されないことを確認する

### Implementation for User Story 2

*追加実装なし — 空テキスト時の `skipped` 処理は既存 `src/queue/index.ts` の `if (result.text.trim() === '')` 分岐で対応済み（FR-005）*

- [X] T008 [US2] `tests/image-ocr.test.ts` に US2 テストケースを追加する — Vision API が空文字 `""` を返す場合に queue が `event: 'skipped'` を記録し、`classify()` が呼び出されないことをモックで確認する（FR-005 / SC-003）

**Checkpoint**: US2 完了 — テキストなし画像が `skipped` として安全に処理される

---

## Phase 5: User Story 3 - 破損・未対応フォーマットの画像でも処理が止まらない (Priority: P2)

**Goal**: 破損画像・`maxImageSizeMB` 超過画像が来ても `event: 'failed'` として `reviewDir` に移動し、他のジョブが継続される

**Independent Test**: 壊れた PNG ファイルでテストを実行し、`event: 'failed'` ログが記録され、ファイルが `reviewDir` に移動し、後続ジョブが正常に処理されることを確認する

### Implementation for User Story 3

*追加実装なし — エラー時の `failed` 処理と `reviewDir` 移動は既存 `src/queue/index.ts` の catch ブロックで対応済み（FR-007）。T004 の `maxImageSizeMB` チェックが `Error` を throw することで catch ブロックが動作する*

- [X] T009 [US3] `tests/image-ocr.test.ts` に US3 テストケースを追加する — ①`maxImageSizeMB` 超過時に `extractImage()` が `Error` を throw すること、②`fs.readFile()` が例外を throw した場合（破損ファイル）に queue が `event: 'failed'` を記録して `reviewDir` に移動することをモックで確認する（FR-006/007 / SC-003）

**Checkpoint**: US3 完了 — 破損画像・サイズ超過画像が `failed` として安全に処理される

---

## Phase 6: User Story 4 - 既存の txt / md / pdf 処理への影響がない (Priority: P3)

**Goal**: 画像 OCR 対応追加後も既存のすべてのテストが退行なしで通過する

**Independent Test**: `yarn test` を実行して全テストスイートが通過することを確認する

### Implementation for User Story 4

*追加実装なし — `ExtractedText.ocrEngine?` と `AuditLogEntry.ocrEngine?` はオプショナルフィールドのため既存処理に影響なし。`extract()` の default case は変更なし（SC-004）*

- [X] T010 [US4] `yarn test` を実行して既存の txt / md / pdf に関するすべてのテストが引き続き通過することを確認する（退行ゼロ / SC-004）

**Checkpoint**: US4 完了 — 全ユーザーストーリーが独立して動作し、既存機能の退行がゼロ

---

## Final Phase: Polish & クロスカット関心事

- [X] T011 `yarn tsc --noEmit` を実行して型エラーがゼロであることを確認する
- [X] T012 [P] `docs/Design.md` の extractor セクションに `src/extractor/image.ts` モジュール（役割・OCR フロー・`ocrEngine` フィールド）の説明を追記する

---

## Dependencies（ユーザーストーリー完了順序）

```
T001
  └─ T002 [P]  ─┐
  └─ T003 [P]  ─┤
                 ├─ T004 ─ T005 ─ T006 ─ T007  (US1 完了)
                 │                        └─ T008  (US2 完了)
                 │                        └─ T009  (US3 完了)
                 └─────────────────────────── T010  (US4 完了)
                                              └─ T011 ─ T012
```

**Parallel execution examples**:
- T002 と T003 は同時実行可能（`src/types/index.ts` と `src/config/schema.ts` は独立）
- T012 は T011 通過後に T010 と並行実行可能

---

## Implementation Strategy（MVP 優先）

**MVP Scope (US1 のみ)**: T001 → T002 + T003（並行）→ T004 → T005 → T006 → T007  
US1 完了時点でコア価値（画像ファイルの OCR → 分類 → 振り分け）が実現する。

**Full scope**: MVP + T008（US2）+ T009（US3）+ T010（US4）+ T011 + T012

---

## Task Count Summary

| Phase | タスク数 | US |
|-------|---------|-----|
| Phase 1: Setup | 1 | — |
| Phase 2: Foundational | 2 | — |
| Phase 3: US1 (P1 MVP) | 4 | US1 |
| Phase 4: US2 (P2) | 1 | US2 |
| Phase 5: US3 (P2) | 1 | US3 |
| Phase 6: US4 (P3) | 1 | US4 |
| Final: Polish | 2 | — |
| **合計** | **12** | |
