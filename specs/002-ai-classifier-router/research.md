---
description: "Technical research for 002-ai-classifier-router"
---

# Research: AI 分類・スキーマ検証・振り分け

**Feature**: `002-ai-classifier-router`
**Date**: 2026-05-17

---

## 1. OpenAI Node.js SDK — chat.completions.create

**Decision**: `openai` パッケージ（^4.x）を使用し、`chat.completions.create` に `response_format: { type: "json_object" }` を指定する。

**Rationale**: 公式 SDK の JSON モード（`json_object`）を使うことで、レスポンスが必ず有効な JSON になることが保証される。これにより JSON.parse 失敗を排除し、Zod 検証のみに集中できる。

**Implementation Pattern**:
```typescript
import OpenAI from 'openai';

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: config.apiTimeoutMs });

const response = await client.chat.completions.create({
  model: config.model,
  response_format: { type: 'json_object' },
  messages: [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user',   content: text },
  ],
});

const raw = response.choices[0].message.content ?? '';
```

**Alternatives Considered**:
- `response_format: { type: "json_schema" }` (Structured Outputs): より厳格だが gpt-4o-mini では利用不可なモデルがある。`json_object` の方が広いモデルで使える。

---

## 2. OpenAI SDK — タイムアウトと AbortController

**Decision**: `OpenAI` コンストラクタの `timeout` オプションに `config.apiTimeoutMs`（デフォルト 30000）を渡す。

**Rationale**: SDK が内部で `AbortController` を管理するため、手動で `AbortSignal` を作る必要がない。タイムアウト時は `APIConnectionTimeoutError` がスローされる（`openai` の `APIError` サブクラス）。

**Implementation Pattern**:
```typescript
// コンストラクタに渡すと全リクエストに適用される
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: config.apiTimeoutMs });
```

**Error Types**:
- `APIConnectionTimeoutError`: タイムアウト
- `APIConnectionError`: ネットワーク障害
- `RateLimitError`: 429（FR-010: すべて同じ扱い）
- `APIError`: その他の API エラー（基底クラス）

すべて `APIError` の instanceof チェックで一括捕捉可能。

**Alternatives Considered**:
- `per-request signal`: `client.chat.completions.create(..., { signal })` でも可能。複雑さが増すため採用しない。

---

## 3. Zod スキーマ — AI レスポンス検証

**Decision**: `z.object()` で `ClassificationResultSchema` を定義し、`safeParse` で検証する。

**Rationale**: `parse` は例外をスローするが、`safeParse` は `{ success, data, error }` を返し、エラーを Queue 層の `try/catch` で一貫して処理できる。

**Implementation Pattern**:
```typescript
import { z } from 'zod';

export const ClassificationResultSchema = z.object({
  category:        z.string().min(1),
  tags:            z.array(z.string()),
  summary:         z.string(),
  confidentiality: z.enum(['low', 'medium', 'high']),
  confidence:      z.number().min(0).max(1),
  destination:     z.string().min(1),
});

export type ClassificationResult = z.infer<typeof ClassificationResultSchema>;

// 検証
const parsed = ClassificationResultSchema.safeParse(JSON.parse(raw));
if (!parsed.success) {
  throw new Error(`AI レスポンスのスキーマ検証失敗: ${parsed.error.message}`);
}
```

**Alternatives Considered**:
- `ajv` による JSON Schema 検証: Zod は既に Round 1 で導入済みであり、追加依存不要。

---

## 4. ファイル移動 — fs.rename とクロスデバイス対策

**Decision**: `fs.promises.rename` を第一手段とし、`EXDEV` エラー（クロスデバイス）時のみ `copyFile` + `unlink` にフォールバックする。

**Rationale**: `rename` は同一ファイルシステム内では atomic であり最速。ただし移動先が別ドライブの場合（Windows では C: → D: など）は `EXDEV` エラーが発生する。フォールバックを持つことで環境差異を吸収できる。

**Implementation Pattern**:
```typescript
import { rename, copyFile, unlink } from 'node:fs/promises';

async function moveFile(src: string, dest: string): Promise<void> {
  try {
    await rename(src, dest);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'EXDEV') {
      await copyFile(src, dest);
      await unlink(src);
    } else {
      throw err;
    }
  }
}
```

**Alternatives Considered**:
- `mv` npm パッケージ: 不要な依存追加を避けるため採用しない。
- `copyFile` のみ: 元ファイルが残るため FR-001 Assumption 1（移動）に反する。

---

## 5. ファイル名衝突解決 — タイムスタンプサフィックス

**Decision**: 移動先に同名ファイルが存在する場合、`{stem}-{Date.now()}{ext}` 形式でリネームする。

**Rationale**: `Date.now()` は ms 精度で一意性が高い。UUID は過剰。追跡ログに実際の移動先パスが記録されるため、衝突後のファイルも特定可能。

**Implementation Pattern**:
```typescript
import { extname, basename, join, dirname } from 'node:path';
import { access } from 'node:fs/promises';

async function resolveDestination(filePath: string, destDir: string): Promise<string> {
  const ext  = extname(filePath);
  const stem = basename(filePath, ext);
  let dest   = join(destDir, basename(filePath));

  try {
    await access(dest);
    // 衝突: タイムスタンプサフィックスを付与
    dest = join(destDir, `${stem}-${Date.now()}${ext}`);
  } catch {
    // アクセス失敗 = ファイルが存在しない → そのまま使用
  }
  return dest;
}
```

**Alternatives Considered**:
- UUID サフィックス: 一意性は高いがファイル名が長くなり視認性が低い。
- 上書き: FR-008（上書き禁止）に違反するため採用しない。

---

## 6. システムプロンプト設計 — open-ended 分類

**Decision**: カテゴリリストを含まないオープンプロンプトを使用し、AI が自由にカテゴリを決定する。コード内の定数として定義する。

**Rationale**: Q2 の回答（open-ended）に基づく。`routes` に存在しないカテゴリは review フォルダへ送られるため、未知カテゴリが安全弁として機能する。

**Prompt Template**:
```
あなたはドキュメント分類アシスタントです。
以下のテキストを分析し、次の JSON 形式で返してください。

{
  "category": "ドキュメントの主カテゴリ（日本語、1〜10 文字）",
  "tags": ["タグ1", "タグ2"],
  "summary": "1〜3 文の要約",
  "confidentiality": "low | medium | high",
  "confidence": 0.0〜1.0,
  "destination": "カテゴリ名と同じ値"
}

分類できない場合は category を "未分類" に設定し、confidence を低く設定してください。
テキスト内の個人情報を要約に含めないでください。
```

**Alternatives Considered**:
- カテゴリリストをプロンプトに埋め込む（closed）: Q2 で Option B（open-ended）を選択したため採用しない。

---

## 7. openai パッケージのバージョン

**Decision**: `openai@^4.x`（2026年5月現在の最新安定版）を使用する。

**Rationale**: `openai@^4` は ESM/CJS 両対応、`timeout` オプションをコンストラクタで受け付ける。`openai@^3` は deprecated であり使用しない。

**Install Command**:
```bash
npm install openai
```

**Alternatives Considered**:
- `openai@^3`: 廃止済み、型定義が不完全。
- Azure OpenAI SDK: プロジェクトは OpenAI API を直接使用するため不要。
