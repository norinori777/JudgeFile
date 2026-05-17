# Implementation Plan: PDF テキスト抽出対応

**Branch**: `003-pdf-extractor` | **Date**: 2026-05-17 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/003-pdf-extractor/spec.md`

## Summary

`extractor` モジュールに `.pdf` 対応を追加し、既存の classify → route パイプライン（Round 2）を無変更で流す。PDF テキスト抽出には `pdfjs-dist`（ESM ネイティブ）を使用。`config.json` に `watchedExtensions` フィールドを追加して監視拡張子を設定可能にし、watcher のハードコードを撤廃する。

## Technical Context

**Language/Version**: TypeScript 5.x / Node.js 20 LTS（ESM — `"type": "module"`）

**Primary Dependencies**: `pdfjs-dist`（NEW）, chokidar ^3, p-queue ^8, zod ^3, openai ^6

**Storage**: JSON Lines 監査ログ（変更なし）

**Testing**: vitest ^2

**Target Platform**: Node.js 20 LTS デーモン（Windows / Linux）

**Project Type**: CLI デーモン

**Performance Goals**: PDF 抽出の追加オーバーヘッドを除き txt/md と同等の処理時間

**Constraints**: `maxChars` 切り捨て準拠。ファイルサイズ上限なし（Round 5 以降のスコープ）

**Scale/Scope**: ローカル単一インスタンス、既存の同時実行数制御（`maxConcurrency`）を継承

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| 原則 | 評価 | 根拠 |
|------|------|------|
| I. 決定的処理優先 | ✅ | pdfjs-dist のテキスト抽出は同一 PDF に対して同じ出力を返す |
| II. 構造化AI出力と検証 | ✅ | classifier/router は変更なし。既存の Zod 検証を継続使用 |
| III. 低信頼度は自動実行しない | ✅ | ルーティングロジックは変更なし |
| IV. 抽出・分類・振り分けを分離 | ✅ | PDF 抽出は extractor のみに閉じ、classifier・router は無変更 |
| V. 小さく始めて拡張する | ✅ | extractor に `.pdf` ケースを追加するだけ。OCR は Round 4 に委譲 |

**Gate 結果**: 全原則 ✅ — Phase 0 研究に進む。

## Project Structure

### Documentation (this feature)

```text
specs/003-pdf-extractor/
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
├── config/
│   └── schema.ts        # watchedExtensions フィールド追加（オプション、デフォルト [".txt",".md"]）
├── extractor/
│   ├── index.ts         # .pdf case 追加
│   ├── txt.ts           # 変更なし
│   ├── md.ts            # 変更なし
│   └── pdf.ts           # 新規: extractPdf(filePath, config): Promise<ExtractedText>
├── watcher/
│   └── index.ts         # SUPPORTED_EXTENSIONS ハードコード → config.watchedExtensions 参照
├── classifier/          # 変更なし
├── router/              # 変更なし
├── queue/               # 変更なし
├── logger/              # 変更なし
└── index.ts             # 変更なし

tests/                   # 既存テスト継続（回帰確認用）
```

**Structure Decision**: 既存の単一プロジェクト構成を維持。`src/extractor/pdf.ts` を追加し、拡張子判定を持つ `src/extractor/index.ts` のディスパッチに `.pdf` ケースを加える。他モジュールへの変更は `config/schema.ts` と `watcher/index.ts` の最小変更のみ。
