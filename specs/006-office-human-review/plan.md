# Implementation Plan: Office 文書対応と人間確認フロー

**Branch**: `006-office-human-review` | **Date**: 2026-05-30 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/006-office-human-review/spec.md`

## Summary

`.docx` / `.xlsx` / `.pptx` のテキスト抽出を既存の `src/extractor/` に追加し、router が review フォルダ移動時に `.meta.json` を保存するよう拡張する。加えて、review フォルダに溜まったファイルをオペレーターが 1 件ずつ確認・修正・承認できる対話型 CLI（`src/reviewer/`）を新規実装し、操作結果を `corrections.jsonl` に記録する。新規 npm パッケージは mammoth（docx）・exceljs（xlsx）・jszip（pptx）の 3 件。

## Technical Context

**Language/Version**: TypeScript 5.x / Node.js 20 LTS（ESM — `"type": "module"`）

**Primary Dependencies（新規）**:
- `mammoth ^1.x` — `.docx` のテキスト抽出（段落・表対応、ESM 互換）
- `exceljs ^4.x` — `.xlsx` のシート・セル操作（数値を `toString()` 変換、計算済み値取得）
- `jszip ^3.x` — `.pptx` を ZIP として展開し、スライド XML・ノート XML からテキスト抽出

**Primary Dependencies（既存）**: openai ^6.38、zod ^3、pdfjs-dist ^5、chokidar ^3、p-queue ^8

**Storage**: 既存 JSON Lines 監査ログ（`config.logFile`）に加え、`path.dirname(config.logFile)/corrections.jsonl` を新規作成。review 移動時に `<ファイル名>.meta.json` を reviewDir に保存。

**Testing**: vitest ^2（既存）

**Target Platform**: Node.js 20 LTS（Windows / Linux）、既存デーモンに追加

**Project Type**: CLI デーモン拡張 + on-demand 対話型 review CLI

**Performance Goals**: SC-001 — Office ファイルの振り分け完了まで 30 秒以内。SC-002 — 1 ファイルのレビュー操作を 2 分以内。

**Constraints**: 既存テスト退行ゼロ。classifier・logger・watcher・queue への変更は最小限。`confidenceThreshold` ロジック変更なし。テキスト本文をログに書き出さない。

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

*For this repository, the plan must satisfy the constitution below before research begins:*

- Documentation produced by this workflow is written in Japanese unless a file explicitly requires otherwise.
- Deterministic file handling takes priority over AI-assisted decisions.
- Any AI output used by the feature is structured and schema-validated before use.
- Low-confidence outcomes are routed to review or human confirmation instead of automatic action.
- Extraction, classification, routing, and audit logging remain separate responsibilities.
## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| 原則 | 評価 | 根拠 |
|------|------|------|
| I. 決定的処理優先 | ✅ | Office テキスト抽出は決定的。review CLI は人間の入力を受けて決定的に移動する。AI は既存分類のみ補助使用 |
| II. 構造化AI出力と検証 | ✅ | 新規 AI 呼び出しなし。既存 JSON スキーマ検証（Zod）を維持。meta.json も Zod でスキーマ定義 |
| III. 低信頼度は自動実行しない | ✅ | review CLI は低信頼度ファイルへの人間確認フロー。AI 推奨をそのまま移動しない設計 |
| IV. 抽出・分類・振り分けを分離 | ✅ | `src/extractor/office.ts` として独立実装。`src/reviewer/` も独立モジュール。queue/classifier 変更なし |
| V. 小さく始めて拡張する | ✅ | extractor ディスパッチャに 3 case 追加 + reviewer モジュール新規作成。新規 npm 3 件のみ |

**Gate 結果**: 全原則 ✅ — Phase 0 研究に進む。

## Project Structure

### Documentation (this feature)

```text
specs/006-office-human-review/
├── plan.md                       # このファイル
├── research.md                   # Phase 0 出力
├── data-model.md                 # Phase 1 出力
├── quickstart.md                 # Phase 1 出力
├── contracts/
│   ├── config-schema.md          # Phase 1 出力（変更なし確認）
│   ├── meta-json-schema.md       # Phase 1 出力（.meta.json スキーマ）
│   └── corrections-schema.md     # Phase 1 出力（corrections.jsonl スキーマ）
└── tasks.md                      # /speckit.tasks コマンド出力（未作成）
```

### Source Code（変更・追加対象ファイル）

```text
src/
├── extractor/
│   ├── index.ts        # .docx / .xlsx / .pptx の case を追加
│   └── office.ts       # 新規 — extractDocx() / extractXlsx() / extractPptx() 実装
├── router/
│   └── index.ts        # review 移動時に .meta.json 保存処理を追加（FR-009a）
├── reviewer/
│   └── index.ts        # 新規 — review CLI（対話型確認・修正・承認フロー）
├── config/
│   └── schema.ts       # 変更なし（correctionsLogPath は logFile から導出）
└── types/
    └── index.ts        # ReviewItem / ReviewDecision / CorrectionRecord 型追加

tests/
├── office-extractor.test.ts   # 新規 — Office 抽出ユニットテスト
└── reviewer.test.ts           # 新規 — reviewer ロジックユニットテスト
```

**Structure Decision**: 単一プロジェクト構成を継続。新規ソースファイルは `src/extractor/office.ts` と `src/reviewer/index.ts` の 2 ファイル。

## Complexity Tracking

> 構成原則違反なし。追記不要。
