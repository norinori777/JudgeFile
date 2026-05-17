# Data Model: PDF テキスト抽出対応

**Feature**: 003-pdf-extractor | **Date**: 2026-05-17

---

## 変更・追加エンティティ

### 1. Config（既存 — `watchedExtensions` フィールド追加）

| フィールド | 型 | 必須 | デフォルト | 説明 |
|-----------|-----|------|-----------|------|
| `watchedExtensions` | `string[]` | ❌ | `[".txt", ".md"]` | watcher が監視対象とするファイル拡張子の配列（Round 3 では `.pdf` を追加する） |

他の既存フィールド（`watchDir`, `maxConcurrency`, `maxQueueSize`, `logFile`, `maxChars`, `reviewDir`, `routes`, `confidenceThreshold`, `model`, `apiTimeoutMs`）は変更なし。

**Zod スキーマ追加**:
```typescript
watchedExtensions: z.array(z.string().min(1)).default(['.txt', '.md']),
```

**バリデーションルール**:
- 各拡張子は 1 文字以上（空文字列を排除）
- 重複や先頭ドット有無は検証しない（運用で管理）
- フィールド省略時は `[".txt", ".md"]` を適用（Round 1 後方互換）

---

### 2. ExtractedText（既存 — 変更なし）

PDF 抽出でも同一の型を返す。新しい型や拡張は不要。

| フィールド | 型 | 説明 |
|-----------|-----|------|
| `filePath` | `string` | 元ファイルのパス |
| `text` | `string` | 抽出されたテキスト（メモリ内のみ — FR-014） |
| `charCount` | `number` | `text.length`（または `maxChars`） |
| `truncationWarning?` | `string` | `maxChars` で切り捨てた場合のみ設定 |

---

### 3. 新規ファイル: `src/extractor/pdf.ts`

**関数シグネチャ**:
```typescript
export async function extractPdf(filePath: string, config: Config): Promise<ExtractedText>
```

**処理フロー**:
1. `readFile(filePath)` → `Uint8Array`
2. `getDocument({ data, useWorkerFetch: false, isEvalSupported: false, useSystemFonts: true }).promise`
3. ページループ（1 〜 `pdfDoc.numPages`）: `page.getTextContent()` → `TextItem.str` を結合
4. ページ間を `\n\n` で結合 → `fullText`
5. `fullText.length <= maxChars` → そのまま返す / 超過 → 切り捨て + `truncationWarning`

**エラー伝播方針**: `try/catch` なし。例外は Queue 層に伝播させ、既存の `failed` ログ + reviewDir 移動パスを使用する。

---

### 4. 変更ファイルサマリー

| ファイル | 変更種別 | 概要 |
|---------|---------|------|
| `src/config/schema.ts` | 追加 | `watchedExtensions` フィールド |
| `src/extractor/index.ts` | 修正 | `case '.pdf': return extractPdf(...)` |
| `src/extractor/pdf.ts` | 新規 | PDF テキスト抽出実装 |
| `src/watcher/index.ts` | 修正 | `SUPPORTED_EXTENSIONS` → `config.watchedExtensions` |
| その他すべてのファイル | 変更なし | classifier, router, queue, logger, index.ts 等 |
