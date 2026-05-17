# Implementation Plan: AI 分類・スキーマ検証・振り分けルーター

**Branch**: `002-ai-classifier-router` | **Date**: 2026-05-17 | **Spec**: [specs/002-ai-classifier-router/spec.md](spec.md)

**Input**: Feature specification from `/specs/002-ai-classifier-router/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/plan-template.md` for the execution workflow.

## Summary

Round 1 の監視・テキスト抽出・JSONL ロギング基盤（`001-txt-md-pipeline`）に、OpenAI SDK による AI 分類（`classifier` モジュール）・Zod スキーマ検証・信頼度ベースの振り分けルーター（`router` モジュール）を追加する。
信頼度が閾値以上かつ `routes` にカテゴリが存在する場合のみファイルを自動移動し、それ以外は `reviewDir` へ送ることでリスクを最小化する。

## Technical Context

**Language/Version**: Node.js 20 LTS + TypeScript 5.x（Round 1 から継続）

**Primary Dependencies**: chokidar ^3, p-queue ^8, zod ^3, vitest ^2, ts-node（Round 1 既存）+ openai ^4（Round 2 新規）

**Storage**: JSON Lines 監査ログ（Round 1 から継続。Round 2 で分類フィールドを拡張）

**Testing**: vitest ^2（Round 1 から継続）

**Target Platform**: Node.js 20 LTS（Windows / macOS / Linux）

**Project Type**: CLI daemon（`node dist/index.js --config ./config.json`）

**Performance Goals**: SC-001: ファイル配置から 10 秒以内に振り分け完了（OpenAI API レイテンシ含む）

**Constraints**: テキスト本文を監査ログに記録しない（FR-014）; API エラー時のリトライなし（FR-010）; `apiTimeoutMs` は 5000〜120000 ms（設定可能）

**Scale/Scope**: ローカルファイルシステム規模（Round 1 と同等）

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

*For this repository, the plan must satisfy the constitution below before research begins:*

| 原則 | Phase 0 | Phase 1 (再評価) | 根拠 |
|---|:---:|:---:|---|
| 文書言語（日本語） | ✅ PASS | ✅ PASS | 全設計ドキュメントを日本語で記述 |
| 決定的ファイル処理優先 | ✅ PASS | ✅ PASS | AI は分類のみ。移動・mkdir・衝突解決はすべて決定的 |
| AI 出力の構造化・検証 | ✅ PASS | ✅ PASS | `response_format: json_object` + `ClassificationResultSchema`（Zod）で必ず検証 |
| 低信頼度は review / 人間確認 | ✅ PASS | ✅ PASS | 閾値未満・routes 未定義・API エラーはすべて `reviewDir` へ |
| 責務の分離（抽出/分類/振り分け/ログ） | ✅ PASS | ✅ PASS | `extractor`/`classifier`/`router`/`logger` を独立モジュールとして維持 |
| 小さく始める（過剰抽象なし） | ✅ PASS | ✅ PASS | txt/md のみ、LangChain なし、RAG なし。Round 1 モジュールを変更せず最小拡張 |

## Project Structure

### Documentation (this feature)

```text
specs/002-ai-classifier-router/
├── plan.md              # This file (/speckit.plan command output)
├── spec.md              # Feature specification (input)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
│   ├── config-schema.md
│   └── audit-log-schema.md
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
src/
├── types/
│   └── index.ts            # Round 1 基底型 + Round 2 ClassificationResult / RouteDecision / 拡張 AuditLogEntry
├── config/
│   ├── schema.ts           # Round 2 フィールド追加（reviewDir, routes, confidenceThreshold, model, apiTimeoutMs）
│   └── loader.ts           # 変更なし
├── logger/
│   └── index.ts            # 変更なし
├── extractor/
│   ├── txt.ts              # 変更なし
│   ├── md.ts               # 変更なし
│   └── index.ts            # 変更なし
├── classifier/             # Round 2 新規
│   ├── index.ts            # classify(text, config) → ClassificationResult
│   └── schema.ts           # ClassificationResultSchema（Zod）
├── router/                 # Round 2 新規
│   └── index.ts            # route(filePath, result, config) → RouteDecision + ファイル移動
├── queue/
│   └── index.ts            # extractor → classifier → router の連鎖呼び出しを追加
└── index.ts                # エントリポイント（変更なし or 最小変更）

tests/
├── unit/
│   ├── classifier.test.ts  # 任意（tasks.md にテストタスクは含めていない）
│   ├── router.test.ts      # 任意
│   └── config.test.ts      # 任意
└── integration/
    └── pipeline.test.ts    # 任意
```

**Structure Decision**: Option 1（Single project）。Round 1 の `src/` ツリーに `classifier/` と `router/` を追加するのみ。

## Complexity Tracking

Constitution Check の全 6 ゲートが PASS しており、違反はありません。
