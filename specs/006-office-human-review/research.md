# Research: Office 文書対応と人間確認フロー

**Date**: 2026-05-30
**Feature**: [spec.md](spec.md)

---

## 1. .docx テキスト抽出ライブラリ

### 検討した選択肢

| ライブラリ | Stars | ESM 対応 | 段落 | 表 | 備考 |
|-----------|-------|----------|------|----|------|
| `mammoth` | 4.5k+ | ✅（CJS / require 経由） | ✅ | ✅ | `.docx` 専用、HTML/Markdown/text 変換。テスト多数 |
| `docx4js` | 1k | △ | ✅ | △ | メンテナンス停滞 |
| `officeparser` | 500+ | ✅ | ✅ | △ | 複数形式対応だが細粒度制御に限界 |
| `word-extractor` | — | △ | △ | △ | 古い `.doc` 対象、非対象 |

### 決定: `mammoth`

- **理由**: `.docx` 専用設計で段落・表のテキスト変換が確実。`convertToMarkdown()` ではなく `extractRawText()` を使えば純粋テキストのみ取得可能。v1 仕様（段落 + 表のテキスト結合）に完全合致。
- **代替を却下した理由**: `officeparser` は複数形式をカバーするが、表のテキスト順序保証が弱い。`docx4js` はメンテナンス停滞。
- **ESM 注意点**: mammoth は CJS 出力のみだが、Node.js ESM から `createRequire` なしで `import mammoth from 'mammoth'` が動作する（named export なし、default export のみ）。

---

## 2. .xlsx テキスト抽出ライブラリ

### 検討した選択肢

| ライブラリ | Stars | ESM 対応 | 全シート | 計算済み値 | 数値制御 | 備考 |
|-----------|-------|----------|---------|------------|---------|------|
| `exceljs` | 13k+ | ✅ | ✅ | ✅ | ✅ toString() | Stream API 対応 |
| `xlsx` (SheetJS) | 35k+ | △（有料版のみ完全対応） | ✅ | ✅ | ✅ | ライセンス変更で非商用制限あり |
| `officeparser` | 500+ | ✅ | ✅ | △ | △ | 数値書式制御不可 |

### 決定: `exceljs`

- **理由**: 全シートを反復処理し、各セルの `cell.value` を明示的に `String(val)` に変換できる。数式セルは `result` プロパティから計算済み値を取得可能（`cell.model.result`）。ライセンスは MIT で制限なし。
- **代替を却下した理由**: SheetJS（xlsx）はコミュニティ版のライセンスが 2023 年以降変更され商用利用に注意が必要。`officeparser` は数値セルの書式を制御できず、`toString()` 変換の保証が不明。
- **数値変換ルール**: `typeof cell.value === 'number'` なら `String(cell.value)`、formula なら `String(cell.result ?? '')` を使用する。

---

## 3. .pptx テキスト抽出方法

### 検討した選択肢

| 手法 | 新規依存 | ノート抽出 | スライド順序 | 備考 |
|------|---------|-----------|------------|------|
| `jszip` + XML 手動解析 | 1 件（jszip） | ✅ | ✅ | pptx は ZIP + XML の公開仕様 |
| `officeparser` | 1 件 | △（不明確） | ✅ | ノートは明示的に除外する設計の可能性 |
| `pptx-parser` | 1 件 | △ | ✅ | メンテナンス停滞 |
| `node-pptx` | 1 件 | △ | ✅ | 生成用途メイン |

### 決定: `jszip` + 手動 XML テキスト抽出

- **理由**: `.pptx` は OOXML 仕様に基づく ZIP アーカイブであり、スライド本文は `ppt/slides/slide{n}.xml`、ノートは `ppt/notesSlides/notesSlide{n}.xml` に格納される。XML 内のテキストは `<a:t>` タグに格納されており、正規表現でシンプルに抽出できる。`jszip` は Promise ベースで ESM フレンドリー。
- **代替を却下した理由**: `officeparser` のノート抽出サポートが仕様外のため確実性なし。手動解析は依存を最小化しつつ要件を満たす。
- **スライド順序**: `ppt/slides/_rels/slide{n}.xml.rels` から順序を取得するのではなく、`ppt/presentation.xml` の `<p:sldIdLst>` でスライド ID 順序を確定してから処理する。
- **テキスト抽出正規表現**: `/<a:t[^>]*>([^<]*)<\/a:t>/g` でテキストノードを収集し結合する。

---

## 4. 対話型 review CLI の実装方針

### 検討した選択肢

| アプローチ | 新規依存 | ESM 対応 | 対話性 | 備考 |
|-----------|---------|---------|--------|------|
| `node:readline` | なし（組み込み） | ✅ | 基本的な行入力 | シンプルな Y/n + テキスト入力に十分 |
| `@inquirer/prompts` | 1 件 | ✅ | リッチ（リスト・確認等） | 依存追加が必要 |
| `enquirer` | 1 件 | △ | リッチ | CJS メイン |
| `prompts` | 1 件 | △ | 中程度 | メンテナンス停滞 |

### 決定: `node:readline` + `node:process` (built-in)

- **理由**: review CLI の操作は「現在の AI 分類を表示 → Y/n で承認 or カテゴリ・タグ・振り分け先を入力」という逐次フロー。`readline.createInterface` + `question()` メソッドで十分実現可能。新規依存ゼロで構成原則 V（小さく始める）に合致。
- **代替を却下した理由**: `@inquirer/prompts` は UX が向上するが、この CLI は内部ツールのため追加依存のコストが価値を上回る。将来的に Web UI を追加する際は独立して選定すればよい。

---

## 5. .meta.json の保存タイミングと担当モジュール

### 問題

review フォルダへの移動後に review CLI がメタデータ（AI 分類結果）を参照するには、移動時点でメタデータが保存されていなければならない。

### 決定: queue.ts で route() 呼び出し後に保存

- **理由**: `queue.ts` の `enqueue()` 内では `classification`（AI 分類結果）と `decision`（ルーティング結果）の両方が利用可能。`decision.moveType === 'review'` の場合のみ `.meta.json` を保存するのがスコープを絞るうえで最適。router に `classification` を渡すのは router の責務（移動のみ）を広げすぎる。
- **保存パス**: `decision.destDir` が review フォルダの場合、`decision.destDir` + `/<元ファイル名>.meta.json` に JSON で保存する。
- **保存内容**: `{ filePath, category, tags, confidence, confidentiality, destination, queuedAt }`（テキスト本文は含めない — FR-015）

---

## 6. corrections.jsonl の保存パス

### 決定: `path.dirname(config.logFile)` に `corrections.jsonl` として保存

- **理由**: 既存の `config.json` に `logsDir` フィールドは存在しない（`logFile` がフルパス）。`dirname(logFile)` を使うことで、設定変更なしに監査ログと同ディレクトリに保存できる。`logFile` の親ディレクトリはすでに作成済みのため、`mkdir` 不要。
- **新規設定フィールドを追加しない理由**: v1 スコープで追加の設定項目は不要。将来的に保存先を変えたい場合は `correctionsLogFile` フィールドを追加する（後方互換）。

---

## 7. 既存コードへの最小限の変更点サマリー

| ファイル | 変更種別 | 内容 |
|---------|---------|------|
| `src/extractor/index.ts` | 変更 | `.docx` / `.xlsx` / `.pptx` の case を switch に追加 |
| `src/extractor/office.ts` | 新規 | extractDocx / extractXlsx / extractPptx 実装 |
| `src/queue/index.ts` | 変更 | `moveType === 'review'` 時に `.meta.json` 保存処理を追加 |
| `src/reviewer/index.ts` | 新規 | review CLI 実装（readline ベース） |
| `src/types/index.ts` | 変更 | ReviewItem / ReviewDecision / CorrectionRecord 型追加 |
| `src/config/schema.ts` | 変更なし | corrections パスは logFile から導出 |
| `src/router/index.ts` | 変更なし | meta.json 保存は queue 層で実施 |
| `src/classifier/index.ts` | 変更なし | |
| `src/logger/index.ts` | 変更なし | |
| `src/watcher/index.ts` | 変更なし | |
