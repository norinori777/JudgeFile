# Feature Specification: 画像 OCR テキスト抽出対応

**Feature Branch**: `005-image-ocr-extractor`

**Created**: 2026-05-30

**Status**: Clarified

**Input**: PreDesign.md 分割案 第5回 — 画像 OCR 対応

## User Scenarios & Testing *(mandatory)*

### User Story 1 - 画像ファイルを置くと OCR → 分類 → 振り分けされる (Priority: P1) 🎯 MVP

利用者が監視フォルダに画像ファイル（`.png` / `.jpg` / `.jpeg`）を置くと、システムが自動的に OCR でテキストを抽出し、既存の AI 分類・信頼度による振り分け・監査ログ記録のパイプラインをそのまま通る。

**Why this priority**: 今回の最終目標そのもの。これが動けば画像 OCR 対応のコア価値が実現し、テキスト・PDF に加えて画像も同一ワークフローで処理できるようになる。

**Independent Test**: テキストを含む画像ファイル（例：スキャン文書の PNG）を監視フォルダに配置し、処理完了後に `routes` または `reviewDir` へ移動していること・監査ログに `event: 'completed'`・`category`・`moveType` が記録されていることを確認する。

**Acceptance Scenarios**:

1. **Given** テキストが印刷された画像ファイルが監視フォルダにある、**When** 監視デーモンがファイルを検知する、**Then** テキストが OCR で抽出され、classify → route パイプラインが実行されてファイルが振り分けられる
2. **Given** OCR 抽出テキストが `maxChars` を超える、**When** 抽出が実行される、**Then** `maxChars` の上限で切り捨てられ、`truncationWarning` が設定され処理は継続する
3. **Given** 日本語テキストを含む画像ファイルが置かれる、**When** OCR が実行される、**Then** 日本語テキストが正しく抽出されて分類パイプラインへ渡される

---

### User Story 2 - テキストを読み取れない画像でも処理が止まらない (Priority: P2)

写真・イラスト・白紙など、OCR でテキストを抽出できない画像ファイルが来ても、エラーは当該ジョブに閉じ、他のファイルの処理が継続される。

**Why this priority**: 運用上、文書以外の画像（写真・アイコン等）が監視フォルダに混入することは確実。パイプラインが止まらないことが安定稼働に必要。

**Independent Test**: テキストを含まない写真画像を監視フォルダに置き、`event: 'skipped'` ログが記録され、その後に置いた別の画像または txt ファイルが正常に処理されることを確認する。

**Acceptance Scenarios**:

1. **Given** テキストを含まない写真画像が置かれる、**When** OCR が実行される、**Then** 空テキストとして扱われ `event: 'skipped'` がログに記録され、AI は呼び出されない
2. **Given** 真っ白な（または空の）画像ファイルが置かれる、**When** OCR が実行される、**Then** 空テキストとして扱われ `event: 'skipped'` がログに記録される
3. **Given** 極めて低解像度で文字が判読不能な画像が置かれる、**When** OCR が実行される、**Then** 抽出結果が空またはノイズのみと判定され `event: 'skipped'` または `event: 'failed'` としてログに記録される

---

### User Story 3 - 破損・未対応フォーマットの画像でも処理が止まらない (Priority: P2)

壊れた画像ファイルやサポート外フォーマットが来ても、エラーは当該ジョブに閉じて `reviewDir` へ移動し、他のファイルの処理が継続される。

**Why this priority**: 監視フォルダには予期しないファイルが混入しうる。エラー時の安全な回収（reviewDir 移動）とパイプライン継続はシステムの信頼性に直結する。

**Independent Test**: 壊れた（バイナリが不正な）画像ファイルを監視フォルダに置き、`event: 'failed'` ログが記録され、ファイルが `reviewDir` に移動し、その後別のファイルが正常処理されることを確認する。

**Acceptance Scenarios**:

1. **Given** 破損した画像ファイルが置かれる、**When** OCR 処理が実行される、**Then** `event: 'failed'` がログに記録され、ファイルは `reviewDir` へ移動し、他のジョブは継続する
2. **Given** 拡張子が `.png` だが内容が別形式のファイルが置かれる、**When** OCR 処理が実行される、**Then** `event: 'failed'` がログに記録され、ファイルは `reviewDir` へ移動し、他のジョブは継続する

---

### User Story 4 - 既存の txt / md / pdf 処理への影響がない (Priority: P3)

画像 OCR 対応を追加した後も、これまで実装した txt / md / pdf のテキスト抽出・分類・振り分け・ログ記録が従来どおり動作する。

**Why this priority**: 拡張による退行を防ぎ、既存利用者への影響をゼロに保つ。

**Independent Test**: 画像 OCR 対応追加後に既存の txt / md / pdf ファイルを監視フォルダに置き、従来と同じ結果が得られることを確認する。

**Acceptance Scenarios**:

1. **Given** 画像 OCR 対応後に `.txt` ファイルが置かれる、**When** 処理が実行される、**Then** 従来と同一のフローで処理される
2. **Given** 画像 OCR 対応後に `.md` ファイルが置かれる、**When** 処理が実行される、**Then** 従来と同一のフローで処理される
3. **Given** 画像 OCR 対応後にテキスト埋め込みの `.pdf` が置かれる、**When** 処理が実行される、**Then** 従来と同一のフローで処理される

---

### Edge Cases

- OCR 抽出結果が空文字（`trim() === ''`）になった場合は既存の空テキストスキップルール（FR-015 準拠）を適用する
- OCR 抽出テキストが `maxChars` を超える場合は先頭で切り捨て `truncationWarning` を付与して処理を継続する
- 同一画像ファイルが短時間に複数回検知された場合は既存の重複検知（name + size + mtime キー）で二重処理を防ぐ
- 監視フォルダに画像と他形式ファイルが同時に置かれた場合、キューで独立して処理される
- `watchedExtensions` に画像拡張子が追加されていない場合は画像ファイルを無視する（意図しないアクティベーションを防ぐ）
- 非常に大きな画像ファイル（`maxImageSizeMB` 超過）は `event: 'failed'` として扱い reviewDir へ移動する

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: `config.json` の `watchedExtensions` に `.png`・`.jpg`・`.jpeg` のいずれかを追加することで画像ファイルが監視対象になる。既存 `config.json` を更新しない限り画像は処理されない（意図しないアクティベーションを防ぐ）。v1 で保証する拡張子は `.png`・`.jpg`・`.jpeg` の 3 種のみ
- **FR-002**: システムは画像ファイルから OCR でテキストを抽出し、3 行以上の連続改行を 2 行に正規化した上で（txt / md 抽出と同一の前処理）、1 つの文字列として返さなければならない
- **FR-003**: OCR 抽出テキストは既存の `maxChars` 上限・切り捨てルールを適用しなければならない（`ExtractedText` 型の再利用）
- **FR-004**: OCR 抽出テキストを既存の classify → route パイプラインにそのまま渡さなければならない（classifier・router・logger への変更なし）
- **FR-005**: テキスト抽出結果が空文字（`trim() === ''`）の場合は `event: 'skipped'` としてログに記録し、AI 分類を呼び出してはならない（FR-015 準拠）
- **FR-006**: 画像ファイルのファイルサイズが `maxImageSizeMB` を超える場合は `event: 'failed'` としてログに記録し、ファイルを `reviewDir` へ移動しなければならない
- **FR-007**: テキスト抽出中に例外が発生した場合は `event: 'failed'` としてログに記録し、ファイルを `reviewDir` へ移動しなければならない（Round 2 エラーハンドリングの統一）
- **FR-008**: 抽出したテキスト本文はいかなるログフィールド・ファイルにも書き出してはならない（FR-014 準拠）
- **FR-009**: 日本語テキストを含む画像を OCR 処理できなければならない
- **FR-010**: 抽出モジュール（`src/extractor/`）の拡張子ディスパッチャに画像用処理を追加するだけで、他のモジュール（classifier・ router・ logger・ watcher・ queue）への変更は最小限に留めなければならない
- **FR-011**: OCR 処理を経たファイルの監査ログエントリには `ocrEngine: "openai-vision"` フィールドを含めなければならない（OCR 処理の識別とトレーサビリティのため）

### Key Entities

- **ImageExtractedText**: OCR 処理後のテキストを表す。既存の `ExtractedText` 型と互換（`filePath`・`text`・`charCount`・`truncationWarning?`）
- **maxImageSizeMB**: `config.json` に追加する新規設定フィールド。画像ファイルの最大サイズ（MB 単位）。デフォルト: 10。超過時は `event: 'failed'` として reviewDir へ移動
- **対応画像フォーマット**: v1 の保証対象は `.png`・`.jpg`・`.jpeg` の 3 種のみ。それ以外のフォーマット（`.gif`・`.webp`・`.bmp`・`.tiff`）は `watchedExtensions` に追加すれば利用者の責任で追加可能（サポート対象外）
- **ocrEngine**: 監査ログ `AuditLogEntry` に追加する新規フィールド。OCR 処理を経たファイルにのみ付与（値: `"openai-vision"`）。txt / md / pdf 処理時は付与しない

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: テキストを含む画像ファイルを監視フォルダに置いてから振り分け完了（監査ログ記録）まで、30 秒以内に完了する
- **SC-002**: OCR で 80% 以上の文字認識精度（読み取り可能な品質の画像スキャン文書を対象）により、AI 分類が意味のある結果を返す
- **SC-003**: テキストを含まない画像・破損画像・未対応フォーマット画像が来た場合、他のファイルの処理を停止させることなく `skipped` または `failed` として処理が完結する
- **SC-004**: 画像 OCR 対応追加後、既存の txt / md / pdf に対するすべてのテストが引き続き通過する（退行ゼロ）
- **SC-005**: `config.json` の `watchedExtensions` に画像拡張子を追加するだけで機能が有効になる（コードを触らずに対応フォーマットを制御できる）

## Clarifications

### Session 2026-05-30

- Q: OCR の実装アプローチ（外部サービス禁止の範囲定義を含む） → A: 既存の OpenAI API を Vision 入力として利用（追加サービス登録不要）
- Q: 対応する画像拡張子の範囲 → A: `.png` / `.jpg` / `.jpeg` の 3 種のみ（v1 保証範囲）
- Q: 最大画像ファイルサイズの制限 → A: `config.json` に `maxImageSizeMB` フィールドを追加（デフォルト 10MB）。超過時は `event: 'failed'` として reviewDir へ移動
- Q: OCR テキストの前処理・ノイズフィルタリング方針 → A: 最小正規化のみ（3 行以上の連続改行を 2 行に正規化、txt / md 抽出と同一処理）
- Q: 監査ログに OCR 固有フィールドを追加するか → A: `ocrEngine: "openai-vision"` フィールドを `AuditLogEntry` に追加（OCR 処理のトレーサビリティ向上）

## Assumptions

- 監視フォルダに置かれる画像ファイルは主にスキャン文書・スクリーンショット等のテキストを含む用途を想定する（写真・イラストが来ても安全に処理されることは必須）
- OCR の処理速度・精度はファイルサイズ・解像度・フォント品質に依存するため、精度保証の対象は「読み取り可能な品質」の画像に限定する
- 画像の向き補正（回転補正）は自動で行うことが望ましいが、必須要件ではない（v1 スコープ外）
- マルチページ形式（TIFF マルチフレーム等）の対応は v1 スコープ外とし、単一フレーム画像のみ対象とする
- OCR は既存の OpenAI API（Vision 入力）を利用する。すでに同プロバイダを分類に統合済みのため追加サービス登録は不要。Google Vision / AWS Textract 等の専用 OCR SaaS は利用しない
- 既存の `maxConcurrency` 設定により OCR の同時処理数が制御される（OCR 専用のスロットリングは不要）
