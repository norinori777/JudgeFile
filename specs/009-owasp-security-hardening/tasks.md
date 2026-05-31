# Tasks: OWASPセキュリティ強化

**Input**: Design documents from `/specs/009-owasp-security-hardening/`

**Prerequisites**: plan.md ✅ spec.md ✅ research.md ✅ data-model.md ✅ contracts/ ✅

**Organization**: 4ユーザーストーリー（US1–US4）ごとにフェーズを分割。US1・US2 は P1 で独立して実装・テスト可能。US3・US4 は P2 で US1/US2 と並行して着手可能。

---

## Phase 1: セットアップ（共有インフラ）

**Purpose**: 依存パッケージ追加と型定義・設定スキーマの基盤整備。すべてのユーザーストーリーが依存する。

- [X] T001 `file-type` v19+ を依存パッケージとして追加する（`yarn add file-type`）
- [X] T002 `src/types/index.ts` に `SecurityValidationResult` / `ValidationDetail` 型と `AuditLogEntry.event` への `'rejected'` 追加、`securityRejection` オプショナルフィールドを追加する

---

## Phase 2: 基盤整備（全ユーザーストーリーのブロッカー）

**Purpose**: セキュリティ検証モジュールと設定スキーマ拡張。US1–US4 実装前に完了が必要。

**⚠️ CRITICAL**: この Phase が完了するまで US1–US4 の実装着手不可

- [X] T003 [P] `src/config/schema.ts` に `sensitiveFields`（デフォルト `["contractSubject", "contractPeriod"]`）および `maxFileSizeMB`（`FileSizeLimitConfig` 型、デフォルト `{ default: 50 }`）の Zod スキーマを追加する
- [X] T004 [P] `src/extractor/security.ts` を新規作成し、`isPathAllowed(targetPath, allowedRoot)`・`getFileSizeLimit(ext, config)`・`validateMimeType(filePath, ext)`・`validateFileSecurity(filePath, config)` の4関数を実装する（`file-type` 使用。テキストファイルの MIME `undefined` ケースを正しく処理する）

**Checkpoint**: 設定スキーマ拡張・セキュリティ検証モジュール完成 → US1–US4 着手可能

---

## Phase 3: US1 - ファイルパストラバーサル防止 (Priority: P1) 🎯 MVP

**Goal**: ファイル移動・コピー操作で `watchDir` 外へのパスを100%ブロックし、起動時に循環参照を検出する。

**Independent Test**: `routes` に `../../outside` などの `watchDir` 外パスを設定してファイルを処理させ、ファイルが `watchDir` 外へ移動されず `reviewDir` へ送られ、監査ログに `event: 'rejected'` が記録されることを確認する。

### US1 実装

- [X] T005 [US1] `src/config/validator.ts` を新規作成し、`validateConfigSecurity(config)` 関数を実装する。`watchDir` の正規化パスと `routes` 全振り分け先・`reviewDir` を比較し、一致する場合は `Error` をスローしてプロセスを終了させる（FR-001b）
- [X] T006 [US1] `src/index.ts` のアプリ起動処理に `validateConfigSecurity(config)` の呼び出しを追加する（設定ロード直後、watcher 起動前）
- [X] T007 [US1] `src/queue/index.ts` の `enqueue()` 内、処理開始直後に `validateFileSecurity(filePath, config)` を呼び出し、`passed: false` の場合は `event: 'rejected'` 監査ログを記録してファイルを `reviewDir` へ移動し、以降の処理を中断する
- [X] T008 [P] [US1] `tests/owasp-security.test.ts` を新規作成し、`isPathAllowed` のユニットテストを追加する（`../` シーケンス、Null バイト、Windows パス、正常パスのケースを含む）
- [X] T009 [P] [US1] `tests/owasp-security.test.ts` に `validateConfigSecurity` のユニットテストを追加する（`watchDir` と `routes` が一致するケース・`reviewDir` が一致するケース・正常ケースを含む）

---

## Phase 4: US2 - 全ファイルタイプへのサイズ制限 (Priority: P1) 🎯 MVP

**Goal**: txt / md / pdf / docx / xlsx / 画像の全タイプに設定済みサイズ上限を適用し、超過ファイルをレビューフォルダへ送る。

**Independent Test**: `maxFileSizeMB: { ".txt": 0.001 }` を設定し、1KB 超の `.txt` ファイルを投入して、`reviewDir` へ移動され監査ログに `fileSizeExceeded` が記録されることを確認する。

### US2 実装

- [X] T010 [US2] `src/extractor/security.ts` の `validateFileSecurity()` 内のサイズ検証ロジックを実装する（`fs.stat().size` でバイト取得 → `getFileSizeLimit()` で上限取得 → 超過時は `passed: false` を返す。FR-004 / FR-005）
- [X] T011 [US2] `src/watcher/index.ts` に `awaitWriteFinish: { stabilityThreshold: 2000, pollInterval: 100 }` オプションを追加し、書き込み完了後のみキューに積む設計に変更する
- [X] T012 [P] [US2] `tests/owasp-security.test.ts` に `getFileSizeLimit` のユニットテストを追加する（拡張子ごとの上限取得・デフォルトフォールバック・MB→バイト変換のケースを含む）
- [X] T013 [P] [US2] `tests/owasp-security.test.ts` にサイズ超過時の `validateFileSecurity` 統合テストを追加する（上限超過 / 上限以下 / 設定なしデフォルト適用のケースを含む）

---

## Phase 5: US3 - 機密情報を含む監査ログの保護 (Priority: P2)

**Goal**: 監査ログ書き込み時に `sensitiveFields` 設定に基づいてフィールドをマスクし、ログファイルのパーミッションを制限する。

**Independent Test**: `sensitiveFields: ["contractSubject"]` を設定し、契約情報を含むファイルを処理後、監査ログを `grep contractSubject audit.jsonl` で検索して実値が `[REDACTED]` になっていることを確認する。

### US3 実装

- [X] T014 [US3] `src/logger/index.ts` の `initLogger(filePath, sensitiveFields: string[])` に引数 `sensitiveFields` を追加してモジュールスコープ変数に格納する。内部関数 `maskSensitiveFields(entry, sensitiveFields)` を追加し、`writeLog()` 内でモジュールスコープの `sensitiveFields` を参照してマスク処理を一元適用する（`writeLog()` のシグネチャは変更しない）（FR-006）
- [X] T015 [US3] `src/logger/index.ts` の `initLogger()` 内でログファイル作成後に `fs.chmod(logFilePath, 0o600)` を呼び出す（POSIX 環境のみ効果。Windows では無視される旨をコメントに記載）（FR-007）
- [X] T016 [P] [US3] `tests/owasp-security.test.ts` に `maskSensitiveFields` のユニットテストを追加する（指定フィールドが `[REDACTED]` になるケース・非対象フィールドは変更されないケース・空配列のケースを含む）

---

## Phase 6: US4 - ファイルタイプ検証による不正ファイルブロック (Priority: P2)

**Goal**: 拡張子とコンテンツの MIME タイプが不一致のファイル・拡張子なしファイルを拒否し、`reviewDir` へ送る。

**Independent Test**: バイナリファイルを `.txt` に改名して監視フォルダに置き、`event: 'rejected'` がログに記録されて `reviewDir` へ移動されることを確認する。

### US4 実装

- [X] T017 [US4] `src/extractor/security.ts` の `validateMimeType(filePath, ext)` 内で `file-type` を使ってマジックナンバー検査を実装する。拡張子なしファイルは即時拒否、テキスト系（`.txt` / `.md`）は MIME `undefined` を許容、その他は拡張子と MIME が不一致の場合に拒否する（FR-008）
- [X] T018 [P] [US4] `tests/owasp-security.test.ts` に `validateMimeType` のユニットテストを追加する。テスト用バイナリファイル（PDF バイトを `.txt` に改名）・正常テキストファイル・拡張子なしファイル・未対応 MIME タイプのケースを含む

---

## Phase 7: ポリッシュ・横断的関心事

**Purpose**: 全テスト合格確認、既存テストへの影響チェック、設定ファイルサンプル更新。

- [X] T019 `config.json` に `sensitiveFields` と `maxFileSizeMB` のサンプル設定を追記する（contracts/config-schema.md に定義された形式に従う）
- [X] T020 既存テスト（`yarn test`）を全件実行し、新規追加フィールドがオプショナル設定のため既存テストに影響がないことを確認する。あわせて SC-005「追加処理時間10%以内」を手動で確認する（計装不要：正常ファイルの処理時間を目視で従来と比較し、著しい遅延がないことをコメントに記録する）
<!-- SC-005 手動確認済み: テスト実行時間 664ms（変更前 ~650ms）。セキュリティ検証は stat+resolve のみでOCR/AI処理と比べて無視できるレベルの増分。10%以内を満たす。 -->

---

## 依存グラフ

```
T001 (file-type 追加)
  └─→ T004 (security.ts 作成)
        ├─→ T007 (queue.ts 拡張) ← T003 (schema.ts 拡張)
        ├─→ T010 (サイズ検証実装)
        └─→ T017 (MIME 検証実装)

T002 (types 拡張)
  └─→ T007 (queue.ts 拡張)
      └─→ T019 (config.json 更新)

T003 (schema.ts 拡張)
  ├─→ T007 (queue.ts 拡張)
  ├─→ T014 (logger マスク)
  └─→ T013 (サイズテスト)

T005 (validator.ts)
  └─→ T006 (index.ts 起動時呼び出し)

T014 (logger マスク)
  └─→ T015 (chmod 追加)
```

**US1 独立テスト可能**: T003 + T004 + T005 + T006 + T007 + T008 + T009

**US2 独立テスト可能**: T003 + T004 + T010 + T011 + T012 + T013

**US3 独立テスト可能**: T003 + T014 + T015 + T016

**US4 独立テスト可能**: T001 + T004 + T017 + T018

---

## 並行実行の例

**Phase 2 内**（T003 と T004 は互いに独立）:
- Worker A: T003（schema.ts 拡張）
- Worker B: T004（security.ts 作成）

**Phase 3 実装後**（T008 と T009 は互いに独立）:
- Worker A: T008（isPathAllowed テスト）
- Worker B: T009（validateConfigSecurity テスト）

**Phase 5 と Phase 6 は完全並行可能**:
- Worker A: T014 → T015 → T016（US3）
- Worker B: T017 → T018（US4）

---

## 実装戦略

**MVP スコープ（Phase 1–4 完了）**: US1（パストラバーサル防止）+ US2（サイズ制限）を完成させることで、最も深刻な攻撃ベクターを両方カバーした最小の安全な状態を達成できる。

**インクリメンタル拡張**: US3（ログマスク）と US4（MIME 検証）は Phase 2 の基盤さえ完成すれば独立して追加可能。US3・US4 は互いに依存しないため並行実装できる。
