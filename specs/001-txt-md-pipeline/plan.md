# Implementation Plan: txt / md 監視・抽出・ロギング基盤

**Branch**: `001-txt-md-pipeline` | **Date**: 2026-05-17 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/001-txt-md-pipeline/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/plan-template.md` for the execution workflow.

## Summary

監視フォルダへの .txt / .md ファイル追加を chokidar で検知し、p-queue による同時実行制御のもとテキストを抽出して JSON Lines 形式の監査ログに記録する Node.js + TypeScript デーモン。抽出テキスト本文はメモリ内のみ保持し永続化しない。AI 連携はなく、後続フェーズ（AI 分類）への拡張を前提とした責務分離構造とする。

## Technical Context

**Language/Version**: Node.js 20 LTS + TypeScript 5.x

**Primary Dependencies**:
- `chokidar` ^3 — ファイル監視（クロスプラットフォーム安定）
- `p-queue` ^8 — 同時実行数制限付きジョブキュー（バックプレッシャー対応）
- `zod` ^3 — 設定ファイルのスキーマ検証・型推論
- Node.js 内蔵 `crypto.randomUUID()` — UUID 生成（外部依存不要）
- Node.js 内蔵 `fs/promises` + `fs.appendFileSync` — テキスト読み込み・JSON Lines 書き込み

**Storage**: ローカルファイルシステム（JSON Lines 監査ログのみ）。抽出テキスト本文はプロセスメモリ内のみ保持。

**Testing**: `vitest` ^2 + `tmp`（一時ディレクトリ）

**Target Platform**: Node.js 20 LTS（Windows / macOS / Linux）

**Project Type**: CLI デーモン（`node dist/index.js` で起動、設定ファイルで動作制御）

**Performance Goals**: ファイル検知から処理開始まで 5 秒以内（SC-001）

**Constraints**:
- 抽出テキスト本文は永続化禁止（FR-011）
- UTF-8 以外のファイルは `failed` ログを記録してスキップ
- キュー上限超過時はバックプレッシャー（検知一時停止・自動再開）
- 起動時の既存ファイルは処理しない

**Scale/Scope**: 単一フォルダ監視・txt / md のみ・同時実行数は設定値（デフォルト 2）

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| ゲート | ステータス | 備考 |
|---|---|---|
| ドキュメントは日本語で記述する | ✅ PASS | spec.md / plan.md / research.md / data-model.md はすべて日本語 |
| 決定的処理を優先する | ✅ PASS | Phase 1 は AI 連携ゼロ。ファイル検知・抽出・ログ記録はすべて決定的処理 |
| AI 出力はスキーマ検証を通す | ✅ N/A | このフェーズに AI 連携なし |
| 低信頼度は自動実行しない | ✅ N/A | このフェーズに AI 連携なし。失敗は `failed` ログに隔離（FR-008）|
| 抽出・分類・振り分け・ロギングは分離する | ✅ PASS | watcher / extractor / queue / logger を独立モジュールで実装 |
| 最小スコープで開始する | ✅ PASS | txt / md のみ、AI なし、PDF・画像・Office は対象外 |

**全ゲート通過。違反なし。**

## Project Structure

### Documentation (this feature)

```text
specs/001-txt-md-pipeline/
├── plan.md                      # This file
├── research.md                  # Phase 0 output
├── data-model.md                # Phase 1 output
├── quickstart.md                # Phase 1 output
├── contracts/
│   ├── config-schema.md         # 設定ファイルスキーマ
│   └── audit-log-schema.md      # 監査ログスキーマ
└── tasks.md                     # Phase 2 output (speckit.tasks)
```

### Source Code (repository root)

```text
src/
├── config/
│   ├── schema.ts         # Zod スキーマ定義
│   └── loader.ts         # 設定ファイル読み込み・検証
├── watcher/
│   └── index.ts          # chokidar ラッパー、バックプレッシャー制御
├── queue/
│   └── index.ts          # p-queue ジョブキュー、同時実行制御
├── extractor/
│   ├── index.ts          # エントリーポイント（拡張子ディスパッチ）
│   ├── txt.ts            # .txt 抽出処理
│   └── md.ts             # .md 抽出処理
├── logger/
│   └── index.ts          # JSON Lines 監査ログ書き込み
├── types/
│   └── index.ts          # 共有型定義（Job, AuditLogEntry 等）
└── index.ts              # エントリーポイント（起動・設定読み込み）
tests/
├── unit/
│   ├── extractor/
│   ├── logger/
│   └── config/
└── integration/
    └── pipeline/         # watcher → extractor → logger 結合テスト
```

**Structure Decision**: シングルプロジェクト構成。`src/` 配下に責務別モジュールを配置し、後続フェーズで `src/classifier/` と `src/router/` を追加するだけで拡張できる。

## Complexity Tracking

> 違反なし。Complexity Tracking 不要。
