# Feature Specification: 設定済みルートへのベストマッチ振り分けとフォールバック

**Feature Branch**: `004-route-best-match-fallback`

**Created**: 2026-05-29

**Status**: Draft

**Input**: User description: "config.jsonに設定済みのroutesに合いそうなものに振り分ける動作にしてください。ただし、対象がない場合は、その他で振り分ける。"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - 設定済みカテゴリへの正確な振り分け (Priority: P1)

ユーザーがファイルを監視フォルダに置くと、AI が `config.json` の `routes` に定義されたカテゴリの中から最も適切なものを選び、対応するフォルダへ自動移動する。

**Why this priority**: 振り分けの精度が本機能の中核であり、これが機能しないと後続のフォールバック処理も意味を持たない。

**Independent Test**: `routes` に「スケジュール」「日記」「その他」が設定された状態で、スケジュールに関する内容のファイルを置き、`schedule` フォルダへ移動されることを確認する。

**Acceptance Scenarios**:

1. **Given** `routes` に「スケジュール」が設定されている、**When** スケジュールに関するテキストファイルを監視フォルダに置く、**Then** ファイルが `routes["スケジュール"]` のフォルダへ移動し、監査ログに `moveType: "auto"` が記録される
2. **Given** `routes` に「日記」が設定されている、**When** 日記形式の PDF を置く、**Then** ファイルが `routes["日記"]` のフォルダへ移動する

---

### User Story 2 - マッチしない場合の「その他」フォールバック (Priority: P1)

AI が分類したカテゴリが `routes` のいずれのキーとも一致しない場合、「その他」ルートが設定されていれば自動的にそこへ振り分ける。

**Why this priority**: ユーザーが「その他」ルートを設定している目的はまさにこのフォールバックであり、現状 `reviewDir` へ送られてしまう問題を解決する。

**Independent Test**: `routes` に「その他」のみ設定した状態で、他カテゴリに分類されるファイルを置き、「その他」フォルダへ移動されることを確認する。

**Acceptance Scenarios**:

1. **Given** AI が `routes` にないカテゴリ（例: 「法令」）を返し、`routes` に「その他」が設定されている、**When** ファイルが処理される、**Then** ファイルが `routes["その他"]` へ移動し、監査ログに `moveType: "auto"` が記録される
2. **Given** AI が `routes` にないカテゴリを返し、`routes` に「その他」も設定されていない、**When** ファイルが処理される、**Then** 既存の動作通りファイルが `reviewDir` へ移動し、`moveType: "review"` が記録される

---

### User Story 3 - AI が設定済みカテゴリを優先して選択する (Priority: P2)

システムプロンプトに設定済みの `routes` キー一覧を含めることで、AI が可能な限り設定済みカテゴリの中から選択するよう誘導する。

**Why this priority**: フォールバックに頼る頻度を減らし、より正確な振り分けを実現するための補完的な改善。

**Independent Test**: `routes` キー一覧をプロンプトに埋め込み、AI レスポンスの `category` が設定済みキーと一致する割合が向上することを確認する（手動評価）。

**Acceptance Scenarios**:

1. **Given** `routes` に「スケジュール」「日記」「アイデア」「その他」が設定されている、**When** 日記内容のファイルを処理する、**Then** AI の返す `category` が「日記」となる
2. **Given** プロンプトに `routes` キー一覧が含まれている、**When** いずれのカテゴリにも明確に当てはまらないファイルを処理する、**Then** AI が「その他」を選択するか、フォールバックにより「その他」ルートへ振り分けられる

---

### Edge Cases

- `routes` に「その他」キーが存在しない場合は既存の `reviewDir` 振り分けを維持する
- `routes` が空（`{}`）の場合はすべて `reviewDir` へ送る（現状維持）
- AI が `routes` にないカテゴリを返した場合でも、`confidenceThreshold` 以上であれば「その他」へ自動振り分けする（低信頼度は引き続き `reviewDir`）
- 「その他」キーの表記ゆれ（「その他」固定、設定ファイルのキー文字列に依存）

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: システムは、AI へ送るシステムプロンプトに `config.json` の `routes` キー一覧を動的に組み込まなければならない
- **FR-002**: AI は、提供されたカテゴリ一覧の中から最も適切なカテゴリを選択しなければならない
- **FR-003**: 分類結果の `category` が `routes` に存在しない場合、システムは `routes` に「その他」キーが存在するかを確認し、存在すれば「その他」へ自動振り分けしなければならない
- **FR-004**: 「その他」キーも存在しない場合、システムは既存の `reviewDir` フォールバック動作を維持しなければならない
- **FR-005**: 信頼スコアが `confidenceThreshold` 未満の場合は、フォールバックロジックを適用せず既存の `reviewDir` 振り分けを維持しなければならない
- **FR-006**: フォールバックにより「その他」へ振り分けた場合、監査ログの `moveType` は `"auto"` とし、`error` フィールドにフォールバック理由を記録しなければならない
- **FR-007**: 既存の完全一致ルーティングの動作を変更してはならない

### Key Entities

- **RouteFallbackResult**: フォールバック処理の結果を表す情報（使用されたルートキー、フォールバック理由）
- **RouteDecision**: 既存の振り分け判定結果（`destDir`, `moveType`, `reason` を含む）

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: `routes` に設定されたカテゴリのファイルは、既存と同じく 100% 正しいフォルダへ振り分けられる
- **SC-002**: `routes` にないカテゴリに分類され、かつ「その他」が設定されているファイルは、`reviewDir` ではなく「その他」フォルダへ振り分けられる
- **SC-003**: 「その他」フォールバックが適用された件数が監査ログから集計可能である
- **SC-004**: AI プロンプトに `routes` カテゴリ一覧を加えることで、設定済みカテゴリへの一致率が改善される（目標: 手動テスト 5 件中 4 件以上が設定済みカテゴリを選択）

## Assumptions

- 「その他」フォールバックのキー名は `config.json` の `routes` のキー文字列に依存する（ハードコードではなく設定値として扱う）
- フォールバックキーは将来的に設定可能にする可能性があるが、本フィーチャーではデフォルト値「その他」を固定として扱う
- 信頼スコアによるフィルタリング（`confidenceThreshold`）は変更しない
