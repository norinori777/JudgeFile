# Tasks: Office 文書対応と人間確認フロー

**Input**: Design documents from `/specs/006-office-human-review/`

**Prerequisites**: [plan.md](plan.md) | [spec.md](spec.md) | [research.md](research.md) | [data-model.md](data-model.md) | [contracts/](contracts/)

**Implementation Strategy**: US1（Office 抽出）を最初に完成させて MVP とする。US2+US3（review CLI と corrections.jsonl）は Foundational の meta.json 保存が完了してから着手する。US4（退行確認）は最後に実施する。

---

## Phase 1: Setup（共有インフラ）

**Purpose**: 新規 npm パッケージのインストール

- [X] T001 npm install mammoth exceljs jszip を実行し package.json / package-lock.json を更新する（research.md §1〜§3 参照）

---

## Phase 2: Foundational（ブロッキング前提条件）

**Purpose**: US1〜US3 すべてが依存するデータ型と .meta.json 保存処理の確立

**⚠️ CRITICAL**: この Phase が完了するまで US2・US3 の着手は不可

- [X] T002 [P] src/types/index.ts に ReviewItem / ReviewDecision / CorrectionRecord 型を追加する（data-model.md §新規エンティティ 参照）
- [X] T003 src/queue/index.ts の enqueue() 内で `decision.moveType === 'review'` の場合に `<reviewDir>/<元ファイル名>.meta.json` を生成する処理を追加する（FR-009a、contracts/meta-json-schema.md 参照。テキスト本文は含めない — FR-015）

**Checkpoint**: 型定義と meta.json 保存が完了 → US1 は T001 完了後から、US2/US3 は T003 完了後から着手可能

---

## Phase 3: User Story 1 - Office ファイル抽出 → 分類 → 振り分け（Priority: P1）🎯 MVP

**Goal**: `.docx` / `.xlsx` / `.pptx` を監視フォルダに置くと既存パイプライン（classify → route → log）で自動処理される

**Independent Test**: テキストを含む `.docx` ファイルを `watchDir` に配置し、監査ログに `event: 'completed'`・`category`・`moveType` が記録されファイルが振り分け先に移動することを確認する

### US1 実装

- [X] T004 [US1] src/extractor/office.ts を新規作成し `extractDocx()` を実装する（mammoth の `extractRawText()` で段落・表テキストを取得、3 行超連続改行を 2 行に正規化、`maxChars` 超過時は先頭で切り捨て `truncationWarning` を設定、`ExtractedText` 型で返す）
- [X] T005 [US1] src/extractor/office.ts に `extractXlsx()` を実装する（exceljs で全シートの行・セルを反復、数値は `String(cell.value)`・数式は `String(cell.model.result ?? '')` で文字列化、空セルはスキップ、`maxChars` 切り捨て、`ExtractedText` 型で返す）
- [X] T006 [US1] src/extractor/office.ts に `extractPptx()` を実装する（jszip で ZIP 展開、`ppt/presentation.xml` の `<p:sldIdLst>` でスライド順序を確定、`ppt/slides/slide{n}.xml` 本文と `ppt/notesSlides/notesSlide{n}.xml` ノートから `<a:t>` タグのテキストを結合、スライドマスター・レイアウトは除外、`maxChars` 切り捨て、`ExtractedText` 型で返す）
- [X] T007 [US1] src/extractor/index.ts の `extract()` switch 文に `.docx` / `.xlsx` / `.pptx` の case を追加し `office.ts` の各関数に委譲する（FR-001、FR-009）

**Checkpoint**: この時点で US1 が独立してテスト可能 — `.docx` / `.xlsx` / `.pptx` が既存パイプラインを通る

---

## Phase 4: User Story 2 - review CLI（Priority: P1）

**Goal**: review フォルダのファイルを 1 件ずつ確認・修正・承認し振り分け先に移動できる

**Independent Test**: `reviewDir` に `.docx` ファイルと対応する `.meta.json` が存在する状態で review CLI を起動し、承認後にファイルが `config.routes` の振り分け先に移動することを確認する

**依存**: T002（型）・T003（meta.json 保存）が完了していること

### US2 実装

- [X] T008 [US2] src/reviewer/index.ts を新規作成する（CLI エントリポイント。`--config` 引数から config.json を読み込み Zod で検証、`reviewDir` 内の `*.meta.json` ファイルを列挙してファイル件数を表示、0 件の場合は「review 待ちのファイルはありません」と表示して正常終了、FR-010）
- [X] T009 [US2] src/reviewer/index.ts に 1 件分の ReviewItem 整形表示を実装する（ファイル名・AI カテゴリ・タグ・信頼スコア・機密度・推奨振り分け先を読みやすく整形してターミナルに出力、`.meta.json` が読み込めないファイルは警告を表示してスキップ、FR-010）
- [X] T010 [US2] src/reviewer/index.ts に `appendCorrectionRecord()` ユーティリティを実装する（`path.dirname(config.logFile)/corrections.jsonl` へ CorrectionRecord を JSONL 形式で追記、`fs.appendFile` で 1 行 1 JSON + LF、追記失敗時はコンソール表示して次に進む、テキスト本文を含めない — FR-015、contracts/corrections-schema.md 参照）
- [X] T011 [US2] src/reviewer/index.ts に承認フロー（`y` 入力）を実装する（AI 推奨 `destination` を `config.routes` で解決して `moveFile()`、対応する `.meta.json` を削除、`action: 'approved'` の CorrectionRecord を `appendCorrectionRecord()` で追記、FR-012・FR-013）
- [X] T012 [US2] src/reviewer/index.ts に修正フロー（`n` 入力）を実装する（readline で新カテゴリ・新タグ・振り分け先番号をそれぞれ順次入力、入力値が `config.routes` に存在することを検証してループ、`moveFile()`、`.meta.json` 削除、`action: 'corrected'` の CorrectionRecord を `appendCorrectionRecord()` で追記、FR-011・FR-012・FR-013）
- [X] T013 [US2] src/reviewer/index.ts にスキップ（`s` 入力）と SIGINT ハンドリングを実装する（`s` 入力時は当該ファイルを reviewDir に残して次に進む、Ctrl+C 時は未処理ファイルを reviewDir に残してクリーンアップ終了、Edge Cases 参照）

**Checkpoint**: この時点で US2 が独立してテスト可能 — review CLI で承認・修正・スキップが動作する

---

## Phase 5: User Story 3 - 修正履歴永続化（Priority: P2）

**Goal**: 承認・修正操作がすべて `corrections.jsonl` に記録され後から参照できる

**Independent Test**: 承認 1 件・修正 1 件のレビュー後に `corrections.jsonl` を開き、各エントリに `aiClassification`・`finalClassification`・`action`・`timestamp` が含まれる JSONL 形式になっていることを確認する

**依存**: T010（`appendCorrectionRecord()`）・T011・T012 が完了していること

### US3 実装

- [X] T014 [US3] src/reviewer/index.ts の `appendCorrectionRecord()` に `destFilePath` フィールド（`moveFile()` 後の実際の移動先パス）が正しく記録されることを確認し、`corrections.jsonl` が存在しない場合でも自動作成されることを検証する（contracts/corrections-schema.md §書き込みルール 参照）

**Checkpoint**: この時点で US3 が独立してテスト可能 — corrections.jsonl が正しいスキーマで追記される

---

## Phase 6: User Story 4 - 既存処理への退行ゼロ確認（Priority: P3）

**Goal**: Office 対応・review CLI 追加後も txt / md / pdf / 画像の既存パイプラインが正常に動作する

**Independent Test**: `npm test` を実行して既存テスト（config-schema.test.ts・image-ocr.test.ts・route-fallback.test.ts）がすべて PASS することを確認する

### US4 確認

- [X] T015 [US4] npm test を実行し既存テスト（tests/config-schema.test.ts・tests/image-ocr.test.ts・tests/route-fallback.test.ts）が全件 PASS することを確認する（SC-005）
- [X] T016 [US4] src/extractor/index.ts の `.txt` / `.md` / `.pdf` / `.png` / `.jpg` / `.jpeg` の既存 case が T007 の変更後も正しく動作することを手動検証する（既存ファイルを watchDir に置いて監査ログを確認）

**Checkpoint**: 全既存テスト PASS — 退行なし確認完了

---

## Phase 7: Polish（仕上げ）

- [X] T017 package.json の `scripts` に reviewer CLI の起動エントリを追加する（例: `"review": "tsx src/reviewer/index.ts --config ./config.json"`）
- [X] T018 [P] config.json のサンプル（quickstart.md §Step 2 参照）に Office 拡張子追加例が記載されていることを確認し、不足があれば更新する

---

## Dependencies（ストーリー完了順序）

```
T001（npm install）
  │
  ├─ T002（型定義）──────────────────────────────────────────────────┐
  │                                                                   │
  └─ T003（meta.json 保存）                                           │
       │                                                              │
       ├─ T004 → T005 → T006 → T007   [US1 完了]                     │
       │                                                              │
       └─ T008 → T009 → T010 → T011 → T012 → T013  [US2 完了] ←────┘
                            │
                            └─ T014  [US3 完了]
                                │
                                └─ T015 → T016  [US4 完了]
                                      │
                                      └─ T017 → T018  [Polish]
```

**並列実行の機会**:
- T001 完了後: T002（型）と T003（meta.json）は独立して着手可能
- US1（T004〜T007）と US2（T008〜T013）は T003 完了後に独立して進められる

---

## Implementation Strategy

**MVP スコープ**: US1（T001〜T007）— Office ファイルが既存パイプラインを通るだけで最低限の価値を提供できる

**推奨実装順序**:
1. T001 → T002 → T003（基盤）
2. T004 → T005 → T006 → T007（US1 MVP）
3. T008 → T009 → T010 → T011 → T012 → T013（US2）
4. T014（US3）
5. T015 → T016（US4 退行確認）
6. T017 → T018（Polish）
