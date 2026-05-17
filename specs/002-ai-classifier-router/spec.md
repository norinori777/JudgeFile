---
description: "Feature spec for 002-ai-classifier-router"
---

# Feature Specification: AI 分類・スキーマ検証・振り分け

**Feature Branch**: `002-ai-classifier-router`

**Created**: 2026-05-17

**Status**: Draft

**Round**: 2 of 5

**Depends On**: `001-txt-md-pipeline`（監視・抽出・ロギング基盤）

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 — txt / md ファイルを置くと分類されて自動振り分けされる (Priority: P1)

ユーザーが監視フォルダに `.txt` または `.md` ファイルを置くと、Round 1 のパイプラインがテキストを抽出し、AI がカテゴリを判定して、信頼度が閾値以上であれば対応するフォルダに自動で移動される。

**Why this priority**: Round 2 の核心機能。これがなければ AI 分類の価値を示せない。

**Independent Test**: 監視フォルダに `invoice.txt`（「請求書テスト内容」等）を配置し、処理完了後に対応するカテゴリフォルダへ移動していることとログ記録を確認する。

**Acceptance Scenarios**:

1. **Given** 監視フォルダに `sample.md` が置かれた、**When** AI が `confidence: 0.9`・`category: "契約書"` と判定した、**Then** ファイルが `契約書` 用フォルダに移動し、ログにカテゴリ・信頼度・振り分け先が記録される。
2. **Given** 同一ファイルが 2 回検知された（Round 1 の重複検知あり）、**When** Round 1 の `skipped` ログが記録された、**Then** AI 分類は実行されない。
3. **Given** AI が `confidence: 0.95`・`category: "その他"` を返した、**When** routes に `その他` のマッピングが定義されていない、**Then** ファイルは review フォルダに移動し `moveType: "review"` がログに記録される。

---

### User Story 2 — 信頼度が低いファイルは review フォルダに分岐される (Priority: P2)

AI の判定信頼度が設定閾値未満のファイルは自動振り分けせず、人間の確認用 review フォルダに移動される。なぜ review になったかをログから追跡できる。

**Why this priority**: 誤分類による不可逆な移動を防ぐ安全機構。運用上の信頼性を確保する。

**Independent Test**: AI が `confidence: 0.5` を返すように実装をモックして確認フォルダへの移動とログ内容を検証する。

**Acceptance Scenarios**:

1. **Given** AI が `confidence: 0.5`・閾値 `0.8` を返した、**When** 振り分け処理が実行された、**Then** ファイルが review フォルダに移動し、ログに `moveType: "review"` と `confidence: 0.5` が記録される。
2. **Given** `confidenceThreshold` が `0.6` に設定されている、**When** AI が `confidence: 0.65` を返した、**Then** ファイルは自動振り分けされる（閾値以上）。
3. **Given** AI が `confidence: 0.6` を返し、閾値が `0.8` である、**Then** review フォルダに移動し、ログに理由が残る。

---

### User Story 3 — AI エラー・無効レスポンスが発生しても他のファイルの処理が止まらない (Priority: P3)

OpenAI API のタイムアウト・ネットワークエラー・スキーマ不適合が発生したファイルのみ review フォルダに移動し、残りの処理は継続される。

**Why this priority**: Round 1 のエラー隔離（US3）と同等の保証を AI 連携フェーズにも適用する。

**Independent Test**: API をモックしてエラーを注入し、他のファイルが正常に処理されることを確認する。

**Acceptance Scenarios**:

1. **Given** 5 件のファイルが積まれており 3 件目で API タイムアウトが発生した、**When** 処理が完了した、**Then** 3 件目は review フォルダに移動し残り 4 件は正常に振り分けられ、ログに 5 件全件が記録される。
2. **Given** AI が JSON でない文字列を返した、**When** Zod 検証を実行した、**Then** ファイルは review フォルダに移動し `event: "failed"` ログが記録される。
3. **Given** Zod バリデーション失敗が発生した、**Then** `error` フィールドにバリデーション失敗の詳細がログに残る。

---

### Edge Cases

- AI が `confidence` を `0` や `1` の境界値で返した場合の閾値判定（`>=` vs `>`）
- 振り分け先フォルダとソースが同一の場合（移動先 = 元の場所）のエラーハンドリング
- review フォルダへの移動先に同名ファイルが既存する場合の衝突解決（上書き / タイムスタンプ付与）
- OpenAI API の Rate Limit (429) エラー時の挙動
- テキストが空文字列の場合の AI 呼び出し（空文字でも分類するか、スキップするか）
- 抽出テキストが maxChars で切り捨てられていた場合の分類精度への影響

---

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: システムは Round 1 の `ExtractedText` を受け取り、OpenAI SDK で分類リクエストを実行する `classifier` モジュールを実装すること
- **FR-002**: AI へ渡すテキストは Round 1 の `maxChars` 制限を遵守すること（`ExtractedText.text` をそのまま利用し、再度切り捨ては行わない）
- **FR-003**: OpenAI SDK には `response_format: { type: "json_object" }` を指定し、以下の固定スキーマで出力させること。カテゴリ名は制約リストを持たず AI が自由に判定する（open-ended）
  - `category`: string（カテゴリ名）
  - `tags`: string[]（複数タグ）
  - `summary`: string（1〜3 文の要約）
  - `confidentiality`: `"low"` | `"medium"` | `"high"`（機密度）
  - `confidence`: number（0.0〜1.0 の信頼度スコア）
  - `destination`: string（振り分け先候補、カテゴリ名と一致させる）
- **FR-004**: AI のレスポンスを Zod スキーマで検証すること。検証失敗は `failed` イベントとして処理する
- **FR-005**: `confidence >= config.confidenceThreshold`（デフォルト `0.8`）かつ `config.routes[category]` が存在する場合、ファイルを該当フォルダへ移動すること
- **FR-006**: `confidence < config.confidenceThreshold` または `config.routes[category]` が未定義の場合、ファイルを `config.reviewDir` へ移動すること
- **FR-007**: 移動先フォルダが存在しない場合は自動作成すること（`mkdir -p` 相当）
- **FR-008**: 同名ファイルが移動先に存在する場合、タイムスタンプサフィックスを付与してリネームすること（上書き禁止）
- **FR-009**: 全振り分け結果を監査ログに追記すること。ログエントリには以下を含めること
  - `category`, `confidence`, `tags`, `confidentiality`（AI 分類結果）
  - `destination`（実際の移動先パス）
  - `moveType`: `"auto"` | `"review"` | `"error"`
- **FR-010**: OpenAI API エラー（タイムアウト・ネットワーク障害・Rate Limit (429) を含む全エラー）は retry せず、ファイルを review フォルダに移動し `failed` ログを記録して次のジョブを継続すること。429 に対する特別な wait / retry 処理は行わない
- **FR-010a**: OpenAI API 呼び出しのタイムアウトは `config.json` の `apiTimeoutMs` フィールドで設定可能にすること（デフォルト `30000` ms、範囲 `5000`〞`120000` ms）
- **FR-011**: 振り分け先カテゴリと物理フォルダのマッピングは `config.json` の `routes` フィールドに `{ "カテゴリ名": "/絶対パス" }` 形式で明示定義すること。`routes` に存在しないカテゴリは `reviewDir` へ移動する
- **FR-012**: 使用する OpenAI モデルは `config.json` の `model` フィールドで指定すること（デフォルト `gpt-4o-mini`）
- **FR-013**: 信頼度閾値は `config.json` の `confidenceThreshold` フィールドで設定可能であること（デフォルト `0.8`、範囲 `0.0`〜`1.0`）
- **FR-014**: 抽出テキスト本文は監査ログに一切書き出さないこと（Round 1 FR-011 の継承）
- **FR-015**: `ExtractedText.text` が trim 後に空文字列（0 文字）の場合、classifier への API 呼び出しを行わず `event: "skipped"`・`error: "empty text"` をログに記録して次のジョブへ進むこと（ファイルは移動せず元の場所に残る）

### Key Entities

- **ClassificationResult**: AI が返す分類結果（`category`, `tags`, `summary`, `confidentiality`, `confidence`, `destination`）。Zod スキーマで検証済みの型安全なオブジェクト
- **RouteDecision**: 振り分け判定結果（`moveType`, `destination`, 判定理由）。`confidence` と `routes` マッピングを突き合わせて生成
- **AuditLogEntry（拡張）**: Round 1 の `AuditLogEntry` を拡張し、分類フィールドを追加したもの

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 監視フォルダに txt / md を置いてから 10 秒以内に振り分けが完了し、ファイルが宛先フォルダに存在すること
- **SC-002**: 高信頼度ファイル（`confidence >= 0.8`）の 100% が設定フォルダに移動し、元の場所に残らないこと
- **SC-003**: 低信頼度ファイルの 100% が review フォルダに移動し、ログに `moveType: "review"` が記録されること
- **SC-004**: API エラーが発生したファイルが 1 件含まれる 5 件一括投入で、残り 4 件が正常に処理完了すること（エラー隔離）
- **SC-005**: 全処理結果（自動振り分け・review・エラー）が監査ログに記録されており、`category`・`confidence`・`destination`・`moveType` が含まれること

---

## Clarifications

### Session 2026-05-17

- Q: routes の設定方式（FR-011） → A: `config.json` の `routes` フィールドに `{ "カテゴリ名": "/絶対パス" }` 形式で明示定義する（Option A）
- Q: AI カテゴリ分類の方式 → A: open-ended（カテゴリを制約せず AI が自由に判定する。`routes` にないカテゴリは review フォルダへ）（Option B）
- Q: OpenAI API タイムアウト値 → A: `config.json` の `apiTimeoutMs` フィールドで設定可能にする（デフォルト 30 秒）（Option D）
- Q: Rate Limit (429) の扱い → A: 他の API エラーと同じ扱い（retry なし・ review 移動 + `failed` ログ）（Option A）
- Q: 抽出テキストが空文字列の場合の挙動 → A: `event: "skipped"`・`error: "empty text"` をログに記録して次のジョブへ進む（Option B）

---

## Assumptions *(optional)*

1. **ファイルは移動（元ファイル削除）する**: コピーではなく `rename`/`mv` で元の場所から削除する
2. **空テキストはスキップする**: `ExtractedText.text` が trim 後に 0 文字の場合、AI 呼び出しなし。`event: "skipped"`・`error: "empty text"` をログに記録。ファイルは元の場所に残る
3. **OpenAI API キーは環境変数 `OPENAI_API_KEY` で管理する**: `config.json` には含めない
4. **リトライは行わない**: API エラーは即 review フォルダへ移動し、再処理は人間が行う
5. **同名ファイル衝突時はタイムスタンプサフィックス付与**: `{name}-{timestamp}{ext}` 形式
6. **AI へのシステムプロンプトはコード内の定数として管理する**: カテゴリ制約リストは含めず open-ended で分類させる。設定ファイルでの動的変更は Round 2 のスコープ外
7. **PII マスキングは Round 2 のスコープ外とする**: 文書分類の目的上、抽出テキストはマスキングせず OpenAI API へ送信する。`confidentiality: "high"` 判定 + `reviewDir` へのルーティングを機密情報対応の補完機構とする。沿革的な PII 除外実装は Round 3 以降に実施する
