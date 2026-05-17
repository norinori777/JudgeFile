---
description: "Task list for 003-pdf-extractor implementation"
---

# Tasks: PDF テキスト抽出対応

**Feature**: `003-pdf-extractor` | **Branch**: `003-pdf-extractor` | **Date**: 2026-05-17

**Input**: `specs/003-pdf-extractor/` — plan.md, spec.md, data-model.md, contracts/config-schema.md, research.md, quickstart.md

**Organization**: タスクはユーザーストーリーごとにまとめてあり、各ストーリーを独立して実装・検証できる

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: 異なるファイルへの変更かつ未完了タスクへの依存なし → 並行実行可能
- **[Story]**: 対応ユーザーストーリー (US1, US2, US3)

---

## Phase 1: Setup（pdfjs-dist 導入）

**Purpose**: PDF 抽出ライブラリを依存関係に追加する

- [X] T001 `npm install pdfjs-dist` を実行して `package.json` / `package-lock.json` に pdfjs-dist を追加する

---

## Phase 2: Foundational（全ユーザーストーリーの前提条件）

**Purpose**: `watchedExtensions` 設定対応 — US1〜US3 すべてがこのフェーズの完了に依存する

⚠️ **CRITICAL**: このフェーズが完了するまで US1〜US3 の実装を開始してはならない

- [X] T002 `src/config/schema.ts` の Zod スキーマに `watchedExtensions: z.array(z.string().min(1)).default(['.txt', '.md'])` を追加する（contracts/config-schema.md §watchedExtensions フィールド仕様・data-model.md §1 Zod スキーマ追加 準拠）
- [X] T003 `src/watcher/index.ts` の `SUPPORTED_EXTENSIONS = new Set(['.txt', '.md'])` ハードコードを削除し `new Set(config.watchedExtensions)` に置き換える（data-model.md §4 変更ファイルサマリー準拠）

**Checkpoint**: Config 拡張と Watcher 設定化が完了 — ユーザーストーリー実装を開始できる

---

## Phase 3: User Story 1 - PDF を置くと分類・振り分けされる (Priority: P1) 🎯 MVP

**Goal**: テキスト埋め込み済み PDF を watchDir に置いた際に、テキスト抽出 → AI 分類 → 振り分け → 監査ログのパイプラインが Round 2 と同一ルートで動作する

**Independent Test**: テキスト埋め込み済みの PDF を監視フォルダに配置し、処理完了後に `routes` または `reviewDir` へ移動し、`audit.jsonl` に `event: 'completed'`・`category`・`moveType` が記録されることを確認する

### Implementation for User Story 1

- [X] T004 [P] [US1] `src/extractor/pdf.ts` を新規作成する — `extractPdf(filePath: string, config: Config): Promise<ExtractedText>` を実装（research.md §1 API パターン準拠: `GlobalWorkerOptions.workerSrc = ''`・全ページを `\n\n` で結合・maxChars 切り捨て・TextItem 型ガード `'str' in item`）。**成果物要件**: ① `try/catch` ブロックを含めないこと（例外は Queue 層に伝播— FR-006） ② `getMetadata()` を呼び出さないこと（FR-008） ③ コンソール・ファイルへのテキスト出力がないこと（FR-007）
- [X] T005 [US1] `src/extractor/index.ts` の switch 文に `case '.pdf': return extractPdf(filePath, config)` を追加し、必要な import を追加する（data-model.md §3 関数シグネチャ準拠）

**Checkpoint**: この時点で US1（PDF 投入 → pipeline 通過）が独立して検証可能

---

## Phase 4: User Story 2 - テキスト抽出できない PDF でも処理が止まらない (Priority: P2)

**Goal**: スキャン画像 PDF・パスワード保護 PDF・破損 PDF が来ても当該ジョブのみ失敗し、後続ジョブが継続される

**Independent Test**: スキャン画像のみの PDF を watchDir に置き、`event: 'skipped'` または `event: 'failed'` がログに記録され、その後に投入した別の PDF が正常に処理されることを確認する

### Implementation for User Story 2

- [ ] T006 [US2] パスワード保護 PDF を watchDir に投入し、`audit.jsonl` に `event: 'failed'` が記録され、ファイルが `reviewDir` へ移動し、その後に投入した正常 PDF が `event: 'completed'` で処理されることを手動検証する（FR-006 エラー伝播・後続ジョブ継続確認）

**Checkpoint**: この時点で US1 + US2 が独立して検証可能（スキャン PDF → skipped、パスワード PDF → failed）

---

## Phase 5: User Story 3 - 既存 txt/md 処理への影響なし (Priority: P3)

**Goal**: PDF 対応追加後も txt/md の抽出・分類・振り分けが Round 2 と同一動作を維持する

**Independent Test**: PDF 対応追加後に `.txt` / `.md` ファイルを watchDir に置き、Round 2 と同一の処理フロー（`event: 'completed'`・正しい `category`・正しい移動先）が得られることを確認する

### Implementation for User Story 3

- [ ] T007 [US3] `src/config/schema.ts` の `watchedExtensions` デフォルト値が `['.txt', '.md']` であることを確認し、既存 config.json に `watchedExtensions` フィールドを追加しなくても txt/md が処理されることを手動検証する（FR-001 後方互換・contracts/config-schema.md §後方互換 準拠）
- [X] T008 [US3] `npm run build` を実行してビルドエラーがゼロであることを確認する（TypeScript コンパイル検証。T004〜T007 完了後に実行）

**Checkpoint**: 全ユーザーストーリー（US1 / US2 / US3）が独立して検証可能

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: E2E 検証・最終ビルド確認

- [ ] T009 [P] `specs/003-pdf-extractor/quickstart.md` の手順（セットアップ・動作確認・トラブルシューティング）に沿って PDF 処理のエンドツーエンド検証を実施する
- [X] T010 `npm run build && npx vitest run` を実行してビルドと既存テストがすべてグリーンであることを確認する（SC-004 回帰テスト）

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: 依存なし — 即時開始可能
- **Foundational (Phase 2)**: Phase 1 完了後 — US1〜US3 をブロック
- **User Stories (Phase 3〜5)**: Phase 2 完了後に開始（US1 → US2 → US3 の順、または US1 完了後は US2 / US3 を並行可）
- **Polish (Phase 6)**: 全ユーザーストーリー完了後

### User Story Dependencies

| ストーリー | 開始条件 | 依存タスク |
|-----------|---------|-----------|
| US1 (P1) | Phase 2 完了後 | T002, T003 |
| US2 (P2) | Phase 2 完了後 + T005 | T004, T005（pdf.ts 実装 + dispatch 追加後） |
| US3 (P3) | Phase 2 完了後 | T002 (デフォルト値確認) |

### Within Each User Story

- Phase 2: T002 → T003（schema の型変更後に watcher を修正）
- Phase 3: T004（pdf.ts 新規作成）→ T005（extractor/index.ts dispatch 追加）
- Phase 4: T006 は T005 完了後に手動テスト（パスワード PDF 投入 + 後続検証）
- Phase 5: T007 は T002 完了後に検証、T008 は T004〜T007 完了後に実行

### Parallel Opportunities

```
T001 (install)
  └─> T002 (schema) ─> T003 (watcher)
                           └─> T004 [P] (pdf.ts new) ─> T005 (extractor index)
                           └─> T007 [P] (US3 backward compat)
                                                          └─> T006 (US2 error path test)
                                                          └─> T008 (build check)
                                                          └─> T009 [P] (quickstart E2E)
                                                          └─> T010 (final build + vitest)
```

---

## Implementation Strategy

**MVP**: Phase 1〜3 完了 = US1（PDF 投入 → pipeline 通過）が動作する最小完成形

**Incremental Delivery**:

1. **Phase 1**: `npm install pdfjs-dist`（1 タスク、即時完了）
2. **Phase 2**: Config 拡張 + Watcher 設定化（2 タスク、既存ファイル小変更）
3. **Phase 3**: PDF extractor 本体実装（最重要、2 タスク）
4. **Phase 4 + 5**: エラーパス検証・後方互換確認（コード確認・手動検証）
5. **Phase 6**: E2E 検証・最終ビルド確認

**変更ファイルまとめ**（data-model.md §4 準拠）:

| ファイル | 変更種別 | 担当タスク |
|---------|---------|-----------|
| `src/config/schema.ts` | 追加（1 フィールド） | T002 |
| `src/watcher/index.ts` | 修正（1 行置換） | T003 |
| `src/extractor/pdf.ts` | 新規作成 | T004 |
| `src/extractor/index.ts` | 修正（1 case 追加） | T005 |
| その他すべて | 変更なし | — |

**Key Risk**: `pdfjs-dist` ESM インポートの TypeScript 型解決。`research.md §1` の TextItem 型ガード（`'str' in item`）と `GlobalWorkerOptions.workerSrc = ''` を厳守すること。
