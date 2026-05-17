# Feature Specification: PDF テキスト抽出対応

**Feature Branch**: `003-pdf-extractor`

**Created**: 2026-05-17

**Status**: Clarified

**Input**: PreDesign.md 分割案 第3回 — PDF 対応

## User Scenarios & Testing *(mandatory)*

### User Story 1 - PDF を置くと分類・振り分けされる (Priority: P1) 🎯 MVP

利用者が監視フォルダに PDF ファイルを置くと、システムがテキストを自動抽出し、第2回で実装した AI 分類・信頼度による振り分け・監査ログ記録のパイプラインをそのまま通る。

**Why this priority**: 今回の最終目標そのもの。これが動けば PDF 対応のコア価値が実現する。

**Independent Test**: テキスト埋め込み済みの PDF を監視フォルダに配置し、処理完了後に routes または reviewDir へ移動していること・監査ログに `event: 'completed'`・`category`・`moveType` が記録されていることを確認する。

**Acceptance Scenarios**:

1. **Given** テキスト埋め込み済みの PDF が監視フォルダにある、**When** 監視デーモンがファイルを検知する、**Then** テキストが抽出され、classify → route パイプラインが実行されてファイルが振り分けられる
2. **Given** PDF 内テキストが `maxChars` を超える、**When** 抽出が実行される、**Then** `maxChars` の上限で切り捨てられ、`truncationWarning` が設定され処理は継続する
3. **Given** 複数ページの PDF が置かれる、**When** 抽出が実行される、**Then** 全ページのテキストが結合されて 1 件のジョブとして処理される

---

### User Story 2 - テキスト抽出できない PDF でも処理が止まらない (Priority: P2)

スキャン画像 PDF やパスワード保護 PDF など、テキスト抽出ができないファイルが来ても、エラーは当該ジョブに閉じ、他のファイルの処理が継続される。

**Why this priority**: 運用上、OCR 非対応の PDF が混入することは確実。パイプラインが止まらないことが安定稼働に必要。

**Independent Test**: スキャン画像のみで構成された PDF を監視フォルダに置き、`event: 'skipped'` または `event: 'failed'` ログが記録され、その後に置いた別の PDF が正常に処理されることを確認する。

**Acceptance Scenarios**:

1. **Given** テキストを含まないスキャン PDF が置かれる、**When** テキスト抽出が実行される、**Then** 空テキストとして扱われ `event: 'skipped'` がログに記録され、AI は呼び出されない（FR-015 準拠）
2. **Given** パスワード保護された PDF が置かれる、**When** 抽出が実行される、**Then** `event: 'failed'` がログに記録され、ファイルは reviewDir へ移動し、他のジョブは継続する
3. **Given** 壊れた PDF（破損ファイル）が置かれる、**When** 抽出が実行される、**Then** `event: 'failed'` がログに記録され、ファイルは reviewDir へ移動し、他のジョブは継続する

---

### User Story 3 - 既存の txt/md 処理への影響がない (Priority: P3)

PDF 対応を追加した後も、第1・2回で実装した txt/md のテキスト抽出・分類・振り分け・ログ記録が従来どおり動作する。

**Why this priority**: 拡張による退行を防ぐことで、既存利用者への影響をゼロに保つ。

**Independent Test**: PDF 対応追加後に既存の txt/md ファイルを監視フォルダに置き、第2回と同じ結果が得られることを確認する。

**Acceptance Scenarios**:

1. **Given** PDF 対応後に `.txt` ファイルが置かれる、**When** 処理が実行される、**Then** 従来と同一のフローで処理される
2. **Given** PDF 対応後に `.md` ファイルが置かれる、**When** 処理が実行される、**Then** 従来と同一のフローで処理される

---

### Edge Cases

- PDF にテキスト層がなく抽出結果が空文字になった場合は FR-015（空テキストスキップ）を適用する
- PDF 内のテキストが `maxChars` を大幅に超える場合は切り捨てて処理を継続する
- パスワード保護 PDF は抽出ライブラリがエラーを throw するため、`event: 'failed'` として扱う
- ゼロバイト PDF（空ファイル）は抽出後の空テキストとして FR-015 を適用する
- 監視フォルダに PDF と txt が同時に置かれた場合、キューで独立して処理される

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: `config.json` の `watchedExtensions` はオプショナルフィールドであり、省略時のデフォルト値は `[".txt", ".md"]`（Round 1 互換）。watcher はこのリストに含まれる拡張子のファイルのみを監視対象としなければならない
- **FR-001a**: 本フィーチャーでは `watchedExtensions` に `.pdf` を追加することで PDF を監視対象とする。既存 `config.json` を更新しない限り PDF は処理されない（意図しないアクティベーションを防ぐ）
- **FR-002**: システムは PDF ファイルの全ページからテキストを抽出し、ページ間を二重改行 `\n\n` で結合して 1 つの文字列として返さなければならない
- **FR-003**: 抽出したテキストは Round 1 / Round 2 と同じ `maxChars` 上限・切り捨てルールを適用しなければならない（`ExtractedText` 型の再利用）
- **FR-004**: 抽出したテキストを既存の classify → route パイプラインにそのまま渡さなければならない（classifier・router・logger への変更なし）
- **FR-005**: テキスト抽出結果が空文字（`trim() === ''`）の場合は `event: 'skipped'` としてログに記録し、AI 分類を呼び出してはならない（FR-015 準拠）
- **FR-006**: テキスト抽出中に例外が発生した場合は `event: 'failed'` としてログに記録し、ファイルを `reviewDir` へ移動しなければならない（FR-016 — Round 2 エラーハンドリングの統一）
- **FR-007**: 抽出したテキスト本文はいかなるログフィールド・ファイルにも書き出してはならない（FR-014 準拠）
- **FR-008**: PDF の著者・タイトル等のメタデータは抽出テキストに混入させてはならない
- **FR-009**: 既存の txt/md 抽出ロジックは変更されてはならない（後方互換）
- **FR-010**: `extractor` モジュールは拡張子を判定して処理を分岐しなければならない（`.pdf` を新規追加、既存拡張子はそのまま）

### Key Entities

- **PDFExtractInput**: 抽出前の情報（`filePath: string`）— 既存 `ExtractedText` 型を出力として再利用するため入力は filePath のみ
- **ExtractedText**（既存）: `{ filePath, text, charCount, truncationWarning? }` — PDF 抽出でも同型を返す

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: テキスト埋め込み済みの PDF を監視フォルダに置いてから分類・振り分け完了まで、既存の txt/md と同等の時間（抽出オーバーヘッド除く）で完了する。測定基準: **1 MB 未満の PDF において txt と比べた追加遅延が 5 秒以内**（T009 E2E 手動確認で検証）
- **SC-002**: テキスト抽出可能な PDF の処理成功率が 95% 以上である（Round 3 では T009 E2E 手動検証・テスト用 PDF ≥ 5 件で代替確認。20 件以上の自動化検証は Round 4 以降のスコープ）
- **SC-003**: テキスト抽出不可の PDF が混入しても、その後のジョブへの影響がゼロである（後続ファイルが正常に処理される）
- **SC-004**: PDF 対応追加後も既存の txt/md テストが全件グリーンを維持する

## Clarifications

### Session 2026-05-17

- Q: 使用する PDF 抽出ライブラリ → A: `pdfjs-dist` (PDF.js)
- Q: `.pdf` 拡張子の監視制御方式 → A: `config.json` の `watchedExtensions` フィールドで設定可能にする
- Q: 複数ページの結合方式 → A: 二重改行 `\n\n` でページを結合する
- Q: `watchedExtensions` のデフォルト動作 → A: オプション・デフォルト `[".txt", ".md"]`（Round 1 互換、PDF は config に明示追加して初めて有効）
- Q: PDF ファイルサイズ上限 → A: 上限なし（`maxChars` のみで制御、大容量対応は将来の Round のスコープ）

## Assumptions

- Round 1（監視・抽出・ロギング基盤）と Round 2（AI 分類・振り分けルーター）が実装済みであることを前提とする
- PDF テキスト抽出には `pdfjs-dist` (PDF.js) を使用する（ESM ネイティブ対応・Mozilla メンテナンス）（OCR は Round 4 のスコープ）
- スキャン画像のみの PDF は本フィーチャーでは OCR 対応しない。空テキストとして FR-015 を適用する
- パスワード保護 PDF の解除は対応しない。抽出失敗として扱う
- PDF から抽出するのはテキスト層のみ。埋め込み画像・フォーム・注釈は対象外とする
- PDF ファイルサイズの上限は設けない。`maxChars` によるテキスト切り捨てが安全網として機能する。大容量 PDF のメモリ対策は将来の Round のスコープ。
- 監視対象拡張子は `config.json` の `watchedExtensions` 配列で管理し、watcher はこのリストのみを監視する。デフォルト値は `[".txt", ".md"]`（Round 1 互換）、本フィーチャーで `.pdf` を追加する
