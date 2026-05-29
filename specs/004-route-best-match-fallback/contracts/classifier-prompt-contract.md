# Contract: classifier システムプロンプト仕様（Round 4 更新版）

**Feature**: 004-route-best-match-fallback | **Date**: 2026-05-29
**Replaces**: specs/003-pdf-extractor/contracts/config-schema.md との差分（システムプロンプト部分のみ変更）

---

## 変更概要

`classifier/schema.ts` の `SYSTEM_PROMPT` 定数を `buildSystemPrompt(routeCategories)` 関数に変更する。
`config.json` の `routes` キー一覧を受け取り、動的にプロンプトへ埋め込む。

---

## buildSystemPrompt 関数仕様

### 入力

| パラメータ | 型 | 必須 | 説明 |
|-----------|-----|------|------|
| `routeCategories` | `string[]` | ✅ | `Object.keys(config.routes)` で生成したカテゴリ名の配列 |

### 出力フォーマット

**routeCategories が空でない場合**（通常ケース）:

```
あなたはファイル内容を分析して分類するアシスタントです。
与えられたテキストを読み、以下の JSON 形式のみで回答してください。他の文章は一切含めないでください。

{
  "category": "<書類の主カテゴリ>",
  "tags": ["<関連タグ1>", "<関連タグ2>"],
  "summary": "<内容の簡潔な要約（100文字以内）>",
  "confidentiality": "<機密レベル: low / medium / high のいずれか>",
  "confidence": <分類の確信度 0.0〜1.0 の数値>,
  "destination": "<推奨する振り分け先カテゴリ名>"
}

振り分け先カテゴリ一覧（できる限りこの中から選んでください）:
- スケジュール
- アイデア
- 日記
- 法律
- その他

いずれにも当てはまらない場合のみ独自のカテゴリ名を使用してください。
```

**routeCategories が空の場合**（`routes: {}` のとき）:
- カテゴリ一覧セクションを省略し、既存と同等のプロンプトを返す

---

## AI 出力スキーマ（変更なし）

`ClassificationResultSchema`（Zod）は変更なし。

```typescript
{
  category: z.string().min(1),
  tags: z.array(z.string()),
  summary: z.string(),
  confidentiality: z.enum(['low', 'medium', 'high']),
  confidence: z.number().min(0).max(1),
  destination: z.string().min(1),
}
```

---

## ルーターフォールバック契約

`router/index.ts` の `route()` 関数は以下の優先順位でフォールバックを適用する:

| 優先度 | 条件 | 移動先 | moveType | reason |
|--------|------|--------|----------|--------|
| 1 | `confidence >= threshold` かつ `routes[category]` が存在 | `routes[category]` | `"auto"` | なし |
| 2 | `confidence >= threshold` かつ `routes[category]` 不在 かつ `routes["その他"]` が存在 | `routes["その他"]` | `"auto"` | フォールバック理由文字列 |
| 3 | `confidence < threshold` | `reviewDir` | `"review"` | 低信頼度理由文字列 |
| 4 | 上記いずれにも当てはまらない | `reviewDir` | `"review"` | 未設定理由文字列 |

**注**: カテゴリが `"その他"` に完全一致する場合（優先度 1 が適用）はフォールバック扱いにしない。
