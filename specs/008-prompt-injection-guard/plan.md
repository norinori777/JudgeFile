# Implementation Plan: プロンプトインジェクション対策

**Branch**: `008-prompt-injection-guard` | **Date**: 2026-05-31 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/008-prompt-injection-guard/spec.md`

## Summary

AI 分類パイプラインにプロンプトインジェクション防御を追加する。
(1) 抽出テキストを `<document>` タグで分離し、タグブレイク攻撃を封じる。
(2) OpenAI Moderation API でポリシー違反コンテンツを classify() 到達前にブロックする。
(3) `config.json` の `maxChars` に関わらずシステム上限 50,000 文字を強制適用する。
いずれも既存の抽出・分類・振り分けパイプラインに影響を与えない。

## Technical Context

**Language/Version**: Node.js 20 LTS / TypeScript 5.x (ESM `"type": "module"`)

**Primary Dependencies**: openai ^6.38（`client.moderations.create` 利用）、zod ^3.23、p-queue ^8.0。追加パッケージなし

**Storage**: JSONL 監査ログ（既存 `logFile` パス）

**Testing**: vitest ^2（`yarn run test` = `vitest run`）

**Target Platform**: Node.js 20 CLI デーモン（Windows / Linux）

**Project Type**: CLI daemon

**Performance Goals**: Moderation API 追加レイテンシ P95 3 秒以内

**Constraints**: Moderation API タイムアウト 10 秒、システム上限 50,000 文字はハードコード（設定非公開）

**Scale/Scope**: 既存監視ディレクトリ単体。並列処理数は既存 `maxConcurrency` に準拠

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

*For this repository, the plan must satisfy the constitution below before research begins:*

- Documentation produced by this workflow is written in Japanese unless a file explicitly requires otherwise.
- Deterministic file handling takes priority over AI-assisted decisions.
- Any AI output used by the feature is structured and schema-validated before use.
- Low-confidence outcomes are routed to review or human confirmation instead of automatic action.
- Extraction, classification, routing, and audit logging remain separate responsibilities.
- The feature starts with the smallest supported scope and expands incrementally without adding unnecessary abstraction.

### 評価結果（Phase 0 前）

| 原則 | 評価 | 根拠 |
|------|------|------|
| I. 決定的処理優先 | ✅ | タグエスケープ・文字数カットは完全決定的。Moderation API は「AI 補助ブロック判定」であり最終振り分けは決定的な reviewDir 移動 |
| II. 構造化AI出力と検証 | ✅ | Moderation API レスポンスは openai SDK の型定義で検証済み。classify() 出力は既存 Zod スキーマで検証 |
| III. 低信頼度は自動実行しない | ✅ | Moderation フラグ時・タイムアウト時は classify() を呼ばず reviewDir へ移動（fail-secure） |
| IV. 抽出・分類・振り分けを分離し監査可能にする | ✅ | サニタイズはテキスト前処理として独立。Moderation は queue 層で classify() 前に挿入。新規フィールドで監査可能 |
| V. 小さく始めて拡張する | ✅ | 既存モジュールへの最小変更のみ。新抽象（クラス等）は導入しない |

**ゲート評価: PASS（違反なし）**

## Project Structure

### Documentation (this feature)

```text
specs/008-prompt-injection-guard/
├── plan.md              # このファイル
├── research.md          # Phase 0 出力
├── data-model.md        # Phase 1 出力
├── quickstart.md        # Phase 1 出力
├── contracts/
│   └── audit-log-schema.md  # Phase 1 出力（監査ログスキーマ変更仕様）
└── tasks.md             # /speckit.tasks コマンドで生成
```

### Source Code (repository root)

```text
src/
├── extractor/
│   ├── index.ts         # extract() 変更なし（サニタイズは queue 層に委譲）
│   └── sanitize.ts      # 新規: applySystemHardLimit() / sanitizeForAI() / wrapWithDocumentTag()
├── classifier/
│   ├── schema.ts        # buildSystemPrompt() に防御指示を追加
│   └── index.ts         # classify() に SanitizedText（ラップ済み）を渡すよう変更
└── queue/
    └── index.ts         # Moderation API 呼び出しを extract() 後・classify() 前に挿入

src/types/
└── index.ts             # AuditLogEntry に moderationCategories / truncationWarning 追加

tests/
├── prompt-injection-guard.test.ts  # 新規テスト（FR-001〜FR-010）
└── （既存テスト全件 — 非リグレッション）
```

**Structure Decision**: 既存の単一プロジェクト構成を維持。`src/extractor/sanitize.ts` を新設してサニタイズロジックを集約する。

## Complexity Tracking

違反なし。Complexity Tracking は不要。
