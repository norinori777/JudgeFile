# Research: PDF テキスト抽出対応

**Feature**: 003-pdf-extractor | **Date**: 2026-05-17

---

## §1 pdfjs-dist Node.js ESM API

**Decision**: `pdfjs-dist` v4+ を ESM インポートで使用し、Node.js ではウェブワーカーを無効化する。

**Rationale**: PDF.js の公式パッケージ。`"type": "module"` の TypeScript プロジェクトで追加設定不要。Mozilla が積極的にメンテナンスしており、Unicode テキスト抽出の信頼性が高い。

**API パターン**:

```typescript
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import { readFile } from 'node:fs/promises';

// Node.js ではウェブワーカー不要（無効化）
GlobalWorkerOptions.workerSrc = '';

export async function extractPdf(filePath: string, config: Config): Promise<ExtractedText> {
  const data = new Uint8Array(await readFile(filePath));
  const loadingTask = getDocument({
    data,
    useWorkerFetch: false,
    isEvalSupported: false,
    useSystemFonts: true,
  });
  const pdfDoc = await loadingTask.promise;

  const pageTexts: string[] = [];
  for (let i = 1; i <= pdfDoc.numPages; i++) {
    const page = await pdfDoc.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = textContent.items
      .filter((item): item is { str: string } => 'str' in item)
      .map(item => item.str)
      .join(' ')
      .trim();
    pageTexts.push(pageText);
  }

  const fullText = pageTexts.join('\n\n').trim();
  // maxChars 切り捨て（既存 extractTxt と同一パターン）
  if (fullText.length <= config.maxChars) {
    return { filePath, text: fullText, charCount: fullText.length };
  }
  return {
    filePath,
    text: fullText.slice(0, config.maxChars),
    charCount: config.maxChars,
    truncationWarning: `テキストが maxChars (${config.maxChars}) を超えたため切り捨てました（元の文字数: ${fullText.length}）`,
  };
}
```

**Alternatives considered**:
- `pdf-parse`: CJS パッケージ。`"type": "module"` プロジェクトでは `createRequire` 等の互換対応が必要。採用しない。
- `unpdf`: `pdfjs-dist` のラッパー。API はシンプルだが採用実績が少なく、直接 `pdfjs-dist` を使う方が制御性が高い。

---

## §2 パスワード保護 PDF の検出

**Decision**: `getDocument().promise` が `PasswordException` を throw するため、そのまま Queue 層にバブルアップさせ `event: 'failed'` として扱う。

**Rationale**: FR-006 「抽出中に例外が発生した場合は `failed` としてログに記録し reviewDir へ移動」と整合する。パスワード解除は本フィーチャーのスコープ外。

**API 詳細**:
```typescript
// pdfjs-dist は PasswordException を export している
import { PasswordException } from 'pdfjs-dist';
// ただし extractPdf 側では try/catch せず Queue 層に伝播させる
// Queue 層の既存 catch ブロックが reviewDir 移動 + failed ログを処理する
```

---

## §3 スキャン PDF（テキスト層なし）の処理

**Decision**: 抽出結果 `text.trim() === ''` となるため、既存の FR-015 空テキストスキップが自動適用される。`extractPdf` 側では特別処理不要。

**Rationale**: スキャン PDF は `getTextContent()` がアイテムのない配列を返すため `pageTexts` が空配列となり、`fullText = ''` になる。Queue 層の `if (result.text.trim() === '')` 判定が `event: 'skipped'` を記録して AI 呼び出しをスキップする。OCR は Round 4 のスコープ。

---

## §4 メタデータの除外（FR-008）

**Decision**: `pdfDoc.getMetadata()` を一切呼び出さない。テキストは `page.getTextContent()` のみから取得する。

**Rationale**: pdfjs-dist はメタデータ（著者・タイトル等）とテキストコンテンツを別 API で提供する。`getTextContent()` にはメタデータが混入しない構造のため、呼び出しを省略するだけで FR-008 を自動充足する。

---

## §5 watchedExtensions — Zod スキーマ設計

**Decision**: `watchedExtensions` は `z.array(z.string().min(1)).default(['.txt', '.md'])` でオプションフィールドとして定義する。

**Rationale**:
- Round 1 ユーザーの既存 `config.json` に `watchedExtensions` がない場合でも起動エラーにならない（デフォルト `['.txt', '.md']` を適用）
- `.pdf` を追加するには config を明示的に更新する必要があり、意図しないアクティベーションを防ぐ
- `z.string().min(1)` で空文字列の拡張子を排除する

```typescript
watchedExtensions: z.array(z.string().min(1)).default(['.txt', '.md']),
```

---

## §6 watcher のハードコード撤廃

**Decision**: `const SUPPORTED_EXTENSIONS = new Set(['.txt', '.md'])` を削除し、`new Set(config.watchedExtensions)` に置き換える。

**Rationale**: watcher が config に依存することで、extractor が対応していない拡張子を監視対象に追加しても、extractor の `default` ケースが `Error` を throw → Queue が `failed` ログを記録するという既存のエラーパスが機能する。拡張子のホワイトリスト管理は config の単一責務になる。

---

## §7 pdfjs-dist の TypeScript 型定義

**Decision**: `pdfjs-dist` v4+ は TypeScript 型定義を同梱しているため `@types/pdfjs-dist` は不要。

**Rationale**: `TextItem` と `TextMarkedContent` の Union 型の絞り込みに `'str' in item` ガードを使用する（`TextItem` のみ `str` プロパティを持つ）。

```typescript
import type { TextItem } from 'pdfjs-dist/types/src/display/api.js';
// または型ガードで処理:
.filter((item): item is TextItem => 'str' in item)
```
