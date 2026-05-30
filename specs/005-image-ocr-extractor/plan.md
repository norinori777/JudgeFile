# Implementation Plan: 画像 OCR テキスト抽出対応

**Branch**: `005-image-ocr-extractor` | **Date**: 2026-05-30 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/005-image-ocr-extractor/spec.md`

## Summary

既存の OpenAI SDK（Vision 入力）を使って画像ファイル（`.png` / `.jpg` / `.jpeg`）から OCR テキストを抽出し、既存の classify → route パイプラインにそのまま通す。新規 npm パッケージは不要。主な変更は `src/extractor/image.ts` の新規作成・ディスパッチャ更新・`maxImageSizeMB` の config 追加・`AuditLogEntry` への `ocrEngine` フィールド追加の 4 点。

## Technical Context

**Language/Version**: TypeScript 5.x / Node.js 20 LTS（ESM — `"type": "module"`）

**Primary Dependencies**: openai ^6.38（既存 — Vision 入力サポート済み）、zod ^3（既存）

**Storage**: JSON Lines 監査ログ（既存フォーマット + `ocrEngine` フィールド追加）

**Testing**: vitest ^2

**Target Platform**: Node.js 20 LTS デーモン（Windows / Linux）

**Project Type**: CLI デーモン（既存アーキテクチャの拡張）

**Performance Goals**: SC-001 準拠 — テキスト含む画像の振り分け完了まで 30 秒以内

**Constraints**: 新規 npm パッケージなし。`confidenceThreshold` ロジック変更なし。既存テスト退行ゼロ。

**Scale/Scope**: ローカル単一インスタンス。既存 `maxConcurrency` が OCR 同時実行数を自動制御。

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| 原則 | 評価 | 根拠 |
|------|------|------|
| I. 決定的処理優先 | ✅ | ファイルサイズ判定・拡張子判定は決定的。Vision API は補助変換（テキスト抽出のみ）|
| II. 構造化AI出力と検証 | ✅ | OCR は構造化不要のテキスト応答。AI 分類は既存 JSON スキーマ検証を維持 |
| III. 低信頼度は自動実行しない | ✅ | OCR 追加後も `confidenceThreshold` ロジック変更なし |
| IV. 抽出・分類・振り分けを分離 | ✅ | `src/extractor/image.ts` として独立実装。classifier / router / logger は変更最小限 |
| V. 小さく始めて拡張する | ✅ | extractor ディスパッチャに 3 case 追加のみ。新規 npm パッケージなし |

**Gate 結果**: 全原則 ✅ — Phase 0 研究に進む。

## Project Structure

### Documentation (this feature)

```text
specs/005-image-ocr-extractor/
├── plan.md                  # このファイル
├── research.md              # Phase 0 出力
├── data-model.md            # Phase 1 出力
├── quickstart.md            # Phase 1 出力
├── contracts/
│   ├── config-schema.md     # Phase 1 出力（maxImageSizeMB 追加）
│   └── audit-log-schema.md  # Phase 1 出力（ocrEngine 追加）
└── tasks.md                 # /speckit.tasks コマンド出力（未作成）
```

### Source Code（変更対象ファイル）

```text
src/
├── extractor/
│   ├── index.ts        # .png / .jpg / .jpeg の case を追加
│   └── image.ts        # 新規 — extractImage() 実装
├── config/
│   └── schema.ts       # maxImageSizeMB フィールド追加
├── types/
│   └── index.ts        # ExtractedText.ocrEngine? / AuditLogEntry.ocrEngine? 追加
└── queue/
    └── index.ts        # completedEntry に ocrEngine 転記

tests/
└── image-ocr.test.ts   # 新規 — OCR 抽出・パイプライン統合テスト
```

**Structure Decision**: 単一プロジェクト構成を継続。新規ソースファイルは `src/extractor/image.ts` のみ。

## Complexity Tracking

*Constitution Check 違反なし — 本セクション記入不要*
