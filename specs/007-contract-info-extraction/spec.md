# Feature Specification: 契約書振り分け時の契約情報抽出・テキスト出力

**Feature Branch**: `007-contract-info-extraction`

**Created**: 2026-05-31

**Status**: Draft

**Input**: PreDesign.md 分割案 第7回 — 契約書振り分け時の契約情報抽出・テキスト出力

## User Scenarios & Testing *(mandatory)*

### User Story 1 - 契約書として振り分けられたファイルから契約情報が自動抽出される (Priority: P1) 🎯 MVP

オペレーターが監視フォルダに契約書ファイルを置くと、システムが自動的に分類・振り分けを行い、カテゴリが「契約書」と判定されたファイルに対してさらに「契約対象」と「規約期間」を抽出して `.meta.json` に出力する。

**Why this priority**: 本機能の核心。振り分け後に契約情報が自動で構造化されることで、後工程の契約管理・台帳作成への連携が可能になる。

**Independent Test**: 契約書テキストを含むファイルを監視フォルダに配置し、処理完了後の `.meta.json` に `contractSubject`（契約対象）と `contractPeriod`（規約期間）フィールドが存在することを確認する。

**Acceptance Scenarios**:

1. **Given** 契約対象と期間が明記された契約書ファイルが監視フォルダにある、**When** AI 分類でカテゴリが「契約書」と判定される、**Then** 契約情報抽出が実行され `.meta.json` に `contractSubject` と `contractPeriod` が記録される
2. **Given** 契約書カテゴリのファイルで、日本語表記の期間（例：「2025年4月1日から2026年3月31日」）が含まれる、**When** 契約情報抽出が実行される、**Then** `contractPeriod.start` と `contractPeriod.end` がそれぞれ取得される
3. **Given** 契約書カテゴリのファイルで、取引先名と商品名が本文に含まれる、**When** 契約情報抽出が実行される、**Then** `contractSubject` に取引先名またはサービス名が設定される
4. **Given** カテゴリが「契約書」以外（例：「請求書」）のファイルが振り分けられる、**When** 振り分け処理が完了する、**Then** 契約情報抽出は実行されず `.meta.json` に `contractSubject`・`contractPeriod` フィールドは追加されない

---

### User Story 2 - 契約情報が読み取れない場合でもパイプラインが継続する (Priority: P1)

契約書として分類されたファイルであっても、本文から契約対象や規約期間が読み取れない場合（書式が特殊・情報が欠落など）、システムは処理を止めずに `null` としてログに記録し、次のファイルの処理に進む。

**Why this priority**: 情報が抽出できない場合でもパイプラインが止まることは許容できない。抽出失敗は `null` として記録するだけで十分で、ファイルの振り分け結果には影響を与えない。

**Independent Test**: 契約情報の記載がない最小テキストを含むファイルを契約書として分類させ、処理完了後に `.meta.json` の `contractSubject` と `contractPeriod` が `null` になっていること・監査ログに `event: 'completed'` が記録されていることを確認する。

**Acceptance Scenarios**:

1. **Given** 契約書カテゴリのファイルで本文に期間の記載がない、**When** 契約情報抽出が実行される、**Then** `contractPeriod` が `null` で記録され、処理は正常に完了する
2. **Given** 契約書カテゴリのファイルで本文に契約対象が特定できない、**When** 契約情報抽出が実行される、**Then** `contractSubject` が `null` で記録され、処理は正常に完了する
3. **Given** 契約情報抽出の AI 呼び出しがエラーになった、**When** エラーが発生する、**Then** `.meta.json` への記録はスキップされ、監査ログに `contractExtractionError` が記録され、ファイルの振り分け結果には影響しない

---

### User Story 3 - 抽出された契約情報が監査ログにも記録される (Priority: P2)

契約情報の抽出結果は `.meta.json` だけでなく、既存の監査ログ（`AuditLogEntry`）にも `contractSubject` と `contractPeriod` フィールドとして追記され、後から処理内容を追跡できる。

**Why this priority**: 監査証跡としての完全性を保つ。`.meta.json` が削除されても、監査ログから契約情報が確認できる必要がある。

**Independent Test**: 契約書ファイルを処理後、監査ログの当該エントリに `contractSubject` と `contractPeriod` が含まれることを確認する。

**Acceptance Scenarios**:

1. **Given** 契約情報が正常に抽出された、**When** `event: 'completed'` の監査ログが記録される、**Then** ログエントリに `contractSubject` と `contractPeriod` が含まれる
2. **Given** 契約情報が抽出できず `null` だった、**When** `event: 'completed'` の監査ログが記録される、**Then** ログエントリに `contractSubject: null`・`contractPeriod: null` が含まれる

---

### User Story 4 - 既存の分類・振り分けフローへの影響がない (Priority: P3)

契約情報抽出機能の追加後も、契約書以外のすべてのカテゴリファイルの分類・振り分け・ログ記録が従来どおり動作する。また契約書カテゴリであっても、ファイルの移動先と監査ログの基本構造は変わらない。

**Why this priority**: 拡張による退行を防ぐ。契約情報抽出はパイプラインへの「追加」であり、既存の振る舞いを変えてはならない。

**Independent Test**: 機能追加後に txt / pdf / 画像など既存ファイルを監視フォルダに置き、従来と同一の振り分け・ログ結果が得られることを確認する。

**Acceptance Scenarios**:

1. **Given** 機能追加後に「請求書」カテゴリのファイルが処理される、**When** 振り分けが完了する、**Then** `.meta.json` に `contractSubject`・`contractPeriod` フィールドは存在しない
2. **Given** 機能追加後に `.txt` ファイルが置かれる、**When** 処理が実行される、**Then** 従来と同一のフローで処理される

---

### Edge Cases

- 契約書ファイルであっても規約期間が「自動更新」「期間の定めなし」などの場合は、その旨をテキストとして `contractPeriod.note` に記録し、`start`・`end` は `null` とする
- 複数の契約対象が存在する場合は、AI が最も主要な対象を 1 件選択して単一文字列として返す（配列は使用しない）
- AI による契約情報抽出のトークンコスト増加は許容する（分類用テキストと同一テキストを再利用し、追加の全文送信はしない）
- 契約情報抽出エラーが発生しても、ファイルの振り分け先（routeDir / reviewDir）への移動はすでに完了しているため、移動をやり直さない
- `category` が設定により「契約書」のラベル名が異なる場合（例：`contract`・`Contract`）を想定し、判定は大文字小文字を区別しない

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: システムは振り分け処理（route）が完了したファイルのうち、分類カテゴリが「契約書」（大文字小文字問わず）と判定されたもののみに対して契約情報抽出を実行しなければならない
- **FR-002**: 契約情報抽出は `extractContractInfo()` として独立した関数に実装し、OpenAI SDK を使って既存の分類テキスト（`extract()` が返したテキスト）を入力とする 2 回目の API 呼び出しとして実行しなければならない。`classify()` 関数の実装を変更してはならない
- **FR-003**: 抽出する情報は「契約対象（`contractSubject`: 商品名・サービス名・取引先名など）」と「規約期間（`contractPeriod`: 開始日・終了日・または期間の備考）」の 2 項目とし、JSON 形式で返させなければならない
- **FR-004**: 抽出できない項目は `null` とし、`null` でも処理を継続しなければならない。抽出結果に応じてファイルの移動や振り分け先の変更を行ってはならない
- **FR-005**: 抽出結果は振り分け先（`routeDir` または `reviewDir`）に書き込まれた `.meta.json` を読み込み、`contractSubject` と `contractPeriod` フィールドを追加して上書き保存しなければならない。`moveType: 'review'` の場合は `reviewDir` の `.meta.json` を対象とする。`.meta.json` が存在しない場合は追記をスキップして警告ログのみ記録する
- **FR-006**: 抽出結果は監査ログの `event: 'completed'` エントリに `contractSubject`（`string | null`）と `contractPeriod`（`{ start: string|null, end: string|null, note: string|null }` のネスト JSON オブジェクト）フィールドとして含めなければならない。ただし、本文テキストそのものをログに含めてはならない（既存の FR-014 を踏襲）
- **FR-007**: 契約情報抽出の AI 呼び出しがエラーになった場合は、`.meta.json` への追記・監査ログへのフィールド追加はスキップし、監査ログエントリの `contractExtractionError` フィールドにエラーメッセージを記録して処理を継続しなければならない
- **FR-008**: 契約情報抽出は既存の `classify()` → `route()` → `moveFile()` のフロー完了後に実行しなければならない。抽出失敗がメインパイプラインの `event: 'failed'` を引き起こしてはならない
- **FR-009**: `category` の判定は `"契約書"` を正規ラベルとして文字列比較（大文字小文字区別なし）で合致する場合に抽出を実行する。`config.json` の `contractCategoryLabel` フィールドを設定することで正規ラベルを上書き可能とする

### Key Entities

- **ContractInfo**: 契約情報抽出の結果を表す。`contractSubject`（`string | null`、複数対象が存在する場合でも AI が最主要対象を 1 件選んだ単一文字列）・`contractPeriod`（`{ start: string|null, end: string|null, note: string|null }`）を持つ
- **AuditLogEntry（拡張）**: 既存の監査ログエントリに `contractSubject`・`contractPeriod`・`contractExtractionError` フィールドを任意追加する
- **MetaJson（拡張）**: 既存の `.meta.json` オブジェクトに `contractSubject`・`contractPeriod` フィールドを任意追加する

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001** *(post-launch 観察指標 — 実装タスク不要)*: 契約対象と規約期間が明記された契約書ファイルを処理したとき、90% 以上のケースで `contractSubject`・`contractPeriod.start`・`contractPeriod.end` のいずれかが `null` 以外の値で取得される。本基準はサンプルデータセットを用いた本番投入後のモニタリングで評価する
- **SC-002** *(post-launch 観察指標 — 実装タスク不要)*: 契約情報抽出の追加によって、既存のファイル処理完了までの時間が 2 倍を超えない（1 件あたりの追加待機時間が許容範囲内に収まる）。本基準は本番環境の実測ログで評価し、実装フェーズの自動テストには含めない
- **SC-003**: 契約情報抽出が失敗しても、当該ファイルの振り分け完了率に変化がない（抽出失敗率に関わらず 100% 振り分けが完了する）
- **SC-004**: 契約書以外のカテゴリファイルの処理において、契約情報抽出が実行されるケースがゼロである

## Clarifications

### Session 2026-05-31

- Q: 複数の契約対象が存在する場合のデータ型は？ → A: 単一文字列（AI が最も主要な契約対象を 1 件選ぶ）
- Q: 契約書カテゴリの判定に使う正規ラベル文字列は？ → A: `"契約書"`（日本語）を正規ラベルとし、`config.json` の `contractCategoryLabel` で上書き可能
- Q: 契約情報抽出の AI 呼び出し方式は？ → A: 独立した 2 回目の呼び出し（`extractContractInfo()` 関数として分類後に実行）
- Q: `moveType: 'review'` のファイルへの契約情報追記先は？ → A: `reviewDir` に書き込まれた既存の `.meta.json` を上書き追記する
- Q: 監査ログへの `contractPeriod` 埋め込み形式は？ → A: ネストされた JSON オブジェクトとしてそのまま埋め込む（例: `"contractPeriod": { "start": "2025-04-01", "end": "2026-03-31", "note": null }`）

## Assumptions

- 第1〜6回の実装が完了しており、`extract()`・`classify()`・`route()`・`moveFile()` が利用可能な状態を前提とする
- 「契約書」カテゴリの判定は AI 分類結果（`classification.category`）を使用し、新たなカテゴリ定義を追加しない
- 契約情報抽出に使用するテキストは `extract()` が返した同一テキストを再利用し、追加のファイル I/O は行わない
- `.meta.json` は第6回（Office 人間確認フロー）で定義されたスキーマを継承し、フィールドを追加する形で拡張する
- 規約期間の日付フォーマット統一（ISO 8601 等）は AI が返す文字列をそのまま使用し、フォーマット変換は行わない
- 本機能は自動振り分け（`moveType: 'auto'`）・レビュー待ち（`moveType: 'review'`）いずれの場合にも適用する。`moveType: 'review'` の場合、契約情報は `reviewDir` の `.meta.json` に追記されるため、レビュアーが CLI で確認する際に参照できる
- 英語・日本語混在文書に対応するが、対応言語の精度は OpenAI モデルの能力に依存する
