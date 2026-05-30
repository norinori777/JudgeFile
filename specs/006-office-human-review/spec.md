# Feature Specification: Office 文書対応と人間確認フロー

**Feature Branch**: `006-office-human-review`

**Created**: 2026-05-30

**Status**: Draft

**Input**: PreDesign.md 分割案 第6回 — Office 文書対応と人間確認フロー

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Office ファイルを置くと抽出 → 分類 → 振り分けされる (Priority: P1) 🎯 MVP

利用者が監視フォルダに Office 文書（`.docx` / `.xlsx` / `.pptx`）を置くと、システムが自動的にテキストを抽出し、既存の AI 分類・信頼度による振り分け・監査ログ記録のパイプラインをそのまま通る。

**Why this priority**: 今回の第一目標。txt / md / pdf / 画像に続き、Office 文書も同一パイプラインで処理できるようになることでサポートファイル種別が完結する。

**Independent Test**: テキストを含む `.docx` ファイルを監視フォルダに配置し、処理完了後に `routes` または `reviewDir` へ移動していること・監査ログに `event: 'completed'`・`category`・`moveType` が記録されていることを確認する。

**Acceptance Scenarios**:

1. **Given** テキストが含まれる `.docx` ファイルが監視フォルダにある、**When** 監視デーモンがファイルを検知する、**Then** テキストが抽出され classify → route パイプラインが実行されてファイルが振り分けられる
2. **Given** 複数シートを持つ `.xlsx` ファイルが置かれる、**When** テキスト抽出が実行される、**Then** すべてのシートのセルテキストが結合されて classify に渡される
3. **Given** スライドノートを含む `.pptx` ファイルが置かれる、**When** テキスト抽出が実行される、**Then** スライド本文とノートが結合されて classify に渡される
4. **Given** 抽出テキストが `maxChars` を超える、**When** 抽出が実行される、**Then** `maxChars` の上限で切り捨てられ `truncationWarning` が設定されて処理は継続する

---

### User Story 2 - 人間レビュアーが review フォルダのファイルを CLI で確認・修正・承認できる (Priority: P1)

review フォルダに積まれたファイルに対して、オペレーターが CLI コマンドを実行すると、AI が出力した分類候補（カテゴリ・タグ・振り分け先）を確認し、必要に応じて修正して最終的に承認できる。承認後はファイルが正しい振り分け先に移動される。

**Why this priority**: 低信頼度で review フォルダに止まったファイルが永遠に滞留しないための唯一の解消手段。レビュー機能なしに review フォルダは「捨て場」になってしまう。

**Independent Test**: review フォルダにファイルと対応するメタデータが存在する状態で `review` CLI コマンドを実行し、AI 分類候補が表示されること・カテゴリを修正して承認すると修正後の振り分け先にファイルが移動されること・修正記録が保存されることを確認する。

**Acceptance Scenarios**:

1. **Given** review フォルダにファイルと AI 分類メタデータが存在する、**When** オペレーターが review CLI を起動する、**Then** ファイル一覧と各ファイルの AI 分類候補（カテゴリ・タグ・信頼度・推奨振り分け先）がターミナルに表示される
2. **Given** AI のカテゴリ候補が誤っている、**When** オペレーターが正しいカテゴリと振り分け先を入力して承認する、**Then** 修正内容でファイルが正しい振り分け先に移動され、修正記録が保存される
3. **Given** AI のカテゴリ候補が正しい、**When** オペレーターがそのまま承認する、**Then** AI 推奨の振り分け先にファイルが移動され、承認記録が保存される
4. **Given** review フォルダが空、**When** オペレーターが review CLI を起動する、**Then** 「review 待ちのファイルはありません」と表示され正常終了する

---

### User Story 3 - 修正履歴が保存され後から参照できる (Priority: P2)

レビュアーが行ったすべての修正・承認操作が構造化されたログに保存され、後から「どのファイルをどのように修正したか」を追跡できる。

**Why this priority**: 修正履歴はタグ体系の改善やルール調整のための根拠データになる。また監査証跡としても機能する。

**Independent Test**: 複数ファイルをレビュー後、修正履歴ファイルを開いて各エントリに元の AI 分類・修正後の分類・タイムスタンプが含まれることを確認する。

**Acceptance Scenarios**:

1. **Given** オペレーターが分類を修正して承認した、**When** 承認操作が完了する、**Then** 修正履歴ファイルに元の AI 分類・修正後の分類・ファイル名・タイムスタンプが追記される
2. **Given** オペレーターが AI 分類をそのまま承認した（修正なし）、**When** 承認操作が完了する、**Then** 修正履歴ファイルに「承認のみ」として元の AI 分類とタイムスタンプが追記される
3. **Given** 修正履歴ファイルが複数のエントリを持つ、**When** ファイルを開く、**Then** 各エントリが独立して読み取れる構造化形式（例：1行1JSONオブジェクト）になっている

---

### User Story 4 - 既存の txt / md / pdf / 画像処理への影響がない (Priority: P3)

Office 対応と人間確認フローの追加後も、これまで実装した txt / md / pdf / 画像のテキスト抽出・分類・振り分け・ログ記録が従来どおり動作する。

**Why this priority**: 拡張による退行を防ぎ、既存利用者への影響をゼロに保つ。

**Independent Test**: Office 対応・review CLI 追加後に既存の txt / md / pdf / 画像ファイルを監視フォルダに置き、従来と同じ結果が得られることを確認する。

**Acceptance Scenarios**:

1. **Given** 機能追加後に `.txt` ファイルが置かれる、**When** 処理が実行される、**Then** 従来と同一のフローで処理される
2. **Given** 機能追加後に `.pdf` ファイルが置かれる、**When** 処理が実行される、**Then** 従来と同一のフローで処理される
3. **Given** 機能追加後に `.png` 画像が置かれる、**When** 処理が実行される、**Then** 従来と同一の OCR フローで処理される

---

### Edge Cases

- パスワード保護された Office ファイルが来た場合は `event: 'failed'` として `reviewDir` に移動する（テキスト抽出不可のため）
- テキストを含まない（図・画像のみの）`.docx` が来た場合は空テキストとして扱い `event: 'skipped'` とする
- 数式のみで文字セルを持たない `.xlsx` が来た場合は空テキストとして扱い `event: 'skipped'` とする
- 破損した Office ファイルが来た場合は `event: 'failed'` として `reviewDir` に移動する
- レガシー形式（`.doc` / `.xls` / `.ppt`）は v1 では非対応とし、`watchedExtensions` に追加しない限り無視する
- review CLI 実行中にファイルのメタデータが見つからない場合は当該ファイルをスキップして次に進む
- review フォルダへの移動後に元ファイルが別プロセスに削除された場合はエラーログを記録して次に進む
- review CLI が中断（Ctrl+C 等）された場合、未処理のファイルは review フォルダにそのまま残し、次回 CLI 起動時に残りファイルから再処理できる。中断時にファイルの移動・削除は行わない

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: `config.json` の `watchedExtensions` に `.docx`・`.xlsx`・`.pptx` のいずれかを追加することで対応 Office ファイルが監視対象になる。既存 `config.json` を更新しない限り Office ファイルは処理されない（意図しないアクティベーションを防ぐ）
- **FR-002**: システムは `.docx` ファイルから段落・表のテキストを抽出し、3 行以上の連続改行を 2 行に正規化した上で 1 つの文字列として返さなければならない
- **FR-003**: システムは `.xlsx` ファイルから全シートのセルテキストをシート順に結合し、1 つの文字列として返さなければならない。数値セルは `toString()`（例：`1234567`）で文字列化し、数式セルは計算済み値を使用する（数式文字列は含めない）
- **FR-004**: システムは `.pptx` ファイルから各スライドの本文テキストとノートテキストをスライド順に結合し、1 つの文字列として返さなければならない
- **FR-005**: 抽出テキストは既存の `maxChars` 上限・切り捨てルールを適用しなければならない（`ExtractedText` 型の再利用）
- **FR-006**: Office テキスト抽出結果を既存の classify → route パイプラインにそのまま渡さなければならない（classifier・router・logger への変更なし）
- **FR-007**: テキスト抽出結果が空文字（`trim() === ''`）の場合は `event: 'skipped'` としてログに記録し、AI 分類を呼び出してはならない
- **FR-008**: パスワード保護または破損により抽出が失敗した場合は `event: 'failed'` としてログに記録し、ファイルを `reviewDir` へ移動しなければならない
- **FR-009**: 抽出モジュール（`src/extractor/`）の拡張子ディスパッチャに Office 用処理を追加するだけで、classifier・logger・watcher・queue への変更は不要とする。ただし router は review フォルダ移動時に AI 分類メタデータを `.meta.json` として保存する処理を今回追加しなければならない
- **FR-009a**: router が review フォルダへファイルを移動する際、同一フォルダ内に `<元ファイル名>.meta.json` を生成しなければならない。このファイルにはカテゴリ・タグ・信頼度・推奨振り分け先・reviewDir 移動日時（ISO 8601）を含む
- **FR-010**: システムは review フォルダのファイルを逐次処理する CLI コマンドを提供しなければならない。起動時に対象ファイル数を表示し、1 件ずつ AI 分類候補（カテゴリ・タグ・信頼度・推奨振り分け先）をターミナルに提示する
- **FR-011**: review CLI はオペレーターが各ファイルについてカテゴリ・タグ・振り分け先を修正するか、そのまま承認するかを 1 件ずつ対話的に選択できなければならない。1 件の処理が完了してから次のファイルに進む
- **FR-012**: review CLI で承認されたファイルは指定の振り分け先フォルダへ移動されなければならない
- **FR-013**: review CLI でのすべての操作（承認・修正承認）の結果は修正履歴ファイルに追記されなければならない。各エントリには元のファイル名・AI 分類・最終分類（修正があれば修正後）・操作種別（承認 or 修正）・タイムスタンプを含む
- **FR-014**: 修正履歴ファイルは 1 行 1 JSON オブジェクト（JSONL 形式）で `config.json` の `logsDir` に `corrections.jsonl` として保存し、既存の監査ログ（`audit.log`）とは別ファイルとして管理しなければならない
- **FR-015**: 抽出したテキスト本文はいかなる修正履歴・監査ログにも書き出してはならない（既存の FR-014 準拠）

### Key Entities

- **OfficeExtractedText**: Office 文書からの抽出結果を表す。既存の `ExtractedText` 型と互換（`filePath`・`text`・`charCount`・`truncationWarning?`）
- **ReviewItem**: review フォルダ内の 1 ファイルを表す。`filePath`・`aiClassification`（カテゴリ・タグ・信頼度・推奨振り分け先）・`queuedAt`（reviewDir 移動日時）を持つ
- **ReviewDecision**: オペレーターの判断結果を表す。`reviewedAt`・`action`（`approved` / `corrected`）・`finalClassification`（最終的なカテゴリ・タグ・振り分け先）を持つ
- **CorrectionRecord**: 修正履歴ファイルの 1 エントリ。`fileName`・`aiClassification`・`finalClassification`・`action`・`timestamp` を含む JSONL 1 行分

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: テキストを含む Office ファイルを監視フォルダに置いてから振り分け完了（監査ログ記録）まで、30 秒以内に完了する
- **SC-002**: review CLI を使って 1 ファイルの確認・修正・承認を 2 分以内に完了できる
- **SC-003**: レビュアーが行ったすべての承認・修正操作が 100% 修正履歴ファイルに記録される
- **SC-004**: パスワード保護・破損・テキストなしの Office ファイルが来た場合、他のファイルの処理を停止させることなく `skipped` または `failed` として処理が完結する
- **SC-005**: Office 対応・review CLI 追加後、既存の txt / md / pdf / 画像に対するすべてのテストが引き続き通過する（退行ゼロ）
- **SC-006**: `config.json` の `watchedExtensions` に Office 拡張子を追加するだけで機能が有効になる（コードを触らずに対応フォーマットを制御できる）

## Assumptions

- サポートする Office 形式は v1 では `.docx`・`.xlsx`・`.pptx` の 3 種のみとする（レガシー形式 `.doc`・`.xls`・`.ppt` は非対応）
- 人間確認フローのインターフェースは CLI（コマンドライン対話）とする（Web UI は将来拡張）
- 修正履歴は `logsDir` 配下の `corrections.jsonl` として保存する（既存の監査ログ（`audit.log`）と同ディレクトリ・JSONL 形式で一貫性を持たせる）
- review CLI は監視フォルダのデーモンとは独立した on-demand コマンドとして実行する（常時監視型ではない）
- AI 分類メタデータは review フォルダへのファイル移動時に router が同名の `.meta.json` ファイルとして保存する。この処理は今回のスコープで router に追加実装する
- 修正履歴はタグ定義やルール改善のための参照データとして保存するのみとし、自動的な AI ファインチューニングやルール自動調整は v1 スコープ外とする
- xlsx のセル値はテキスト・数値とも文字列化して結合する。数値は `toString()` で変換し（カンマ区切りなどの書式整形はしない）、数式の結果値（計算済み値）を使用し、数式文字列は含めない
- `.pptx` のスライドマスターやレイアウトのテキストは抽出対象外とし、スライド本文とノートのみを対象とする

## Clarifications

### Session 2026-05-30

- Q: review CLI はファイルをどのような順序で処理するか → A: 逐次処理（1件ずつ順番に提示し、承認後に次のファイルへ進む）
- Q: `.meta.json`（AI 分類メタデータ）はいつ誰が作成するか → A: 今回スコープで router を拡張し、review フォルダ移動時に生成する
- Q: 修正履歴ファイルの保存先はどこか → A: `logsDir` に `corrections.jsonl`（既存監査ログと同ディレクトリ）
- Q: review CLI 中断時の未処理ファイルの扱いはどうするか → A: review フォルダにそのまま残し、次回 CLI 起動時に再処理する
- Q: `.xlsx` の数値セルのテキスト変換書式はどうするか → A: `toString()` で文字列化（例：`1234567`）、カンマ区切り等の書式整形なし
