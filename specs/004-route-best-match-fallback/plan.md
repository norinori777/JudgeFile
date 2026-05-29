# Implementation Plan: 設定済みルートへのベストマッチ振り分けとフォールバック

**Branch**: `004-route-best-match-fallback` | **Date**: 2026-05-29 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/004-route-best-match-fallback/spec.md`

## Summary

classifier の SYSTEM_PROMPT に `config.json` の `routes` キー一覧を動的注入し、AI が設定済みカテゴリを優先選択するよう誘導する。加えて router に「その他」フォールバックロジックを追加し、AI が未知のカテゴリを返した場合でも `routes["その他"]` が存在すれば自動振り分けする。`config.json` スキーマの変更はなく、新規依存ライブラリも不要。

## Technical Context

<!--
  ACTION REQUIRED: Replace the content in this section with the technical details
  for the project. The structure here is presented in advisory capacity to guide
  the iteration process.
-->

**Language/Version**: TypeScript 5.x / Node.js 20 LTS（ESM — `"type": "module"`）

**Primary Dependencies**: openai ^6, zod ^3（既存。新規依存なし）

**Storage**: JSON Lines 監査ログ（変更なし）

**Testing**: vitest ^2

**Target Platform**: Node.js 20 LTS デーモン（Windows / Linux）

**Project Type**: CLI デーモン

**Performance Goals**: 追加オーバーヘッドなし（条件分岐のみ）

**Constraints**: `config.json` スキーマ変更なし。`confidenceThreshold` ロジック維持。

**Scale/Scope**: ローカル単一インスタンス、既存の同時実行数制御（`maxConcurrency`）を継承

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| 原則 | 評価 | 根拠 |
|------|------|------|
| I. 決定的処理優先 | ✅ | フォールバックロジックは決定的（`routes` キー有無の比較のみ）。AI は引き続き補助判定のみ |
| II. 構造化AI出力と検証 | ✅ | スキーマ検証変更なし。プロンプトにカテゴリ一覧を追記するだけで出力形式は維持 |
| III. 低信頼度は自動実行しない | ✅ | 「その他」フォールバックも `confidence >= confidenceThreshold` の場合のみ適用 |
| IV. 抽出・分類・振り分けを分離 | ✅ | classifier と router は独立。フォールバック理由は監査ログの `error` フィールドに記録 |
| V. 小さく始めて拡張する | ✅ | 変更は SYSTEM_PROMPT の動的化と router の条件追加のみ。新規モジュール・依存なし |

**Gate 結果**: 全原則 ✅ — Phase 0 研究に進む。

## Project Structure

### Documentation (this feature)

```text
specs/004-route-best-match-fallback/
├── plan.md              # このファイル
├── research.md          # Phase 0 出力
├── data-model.md        # Phase 1 出力
├── quickstart.md        # Phase 1 出力
├── contracts/           # Phase 1 出力
└── tasks.md             # /speckit.tasks コマンド出力（plan では生成しない）
```

### Source Code (repository root)

```text
src/
├── classifier/
│   ├── index.ts         # classify() に routeCategories を渡す変更
│   └── schema.ts        # SYSTEM_PROMPT を buildSystemPrompt(categories) 関数に変更
├── router/
│   └── index.ts         # 「その他」フォールバックロジックを追加
├── config/              # 変更なし
├── extractor/           # 変更なし
├── queue/               # 変更なし
├── logger/              # 変更なし
├── watcher/             # 変更なし
└── index.ts             # 変更なし

tests/
└── route-fallback.test.ts  # 新規: フォールバックロジックの単体テスト
```

**Structure Decision**: 既存の Single Project 構成を維持。変更対象は `classifier/` と `router/` のみ。

## Complexity Tracking

憲法違反なし — 本セクション不要。
