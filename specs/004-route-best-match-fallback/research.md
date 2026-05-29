# Research: 設定済みルートへのベストマッチ振り分けとフォールバック

**Feature**: 004-route-best-match-fallback | **Date**: 2026-05-29

---

## §1 SYSTEM_PROMPT の動的化方針

**Decision**: `SYSTEM_PROMPT` を定数文字列から `buildSystemPrompt(routeCategories: string[]): string` 関数に変更し、`routes` キー一覧を動的に注入する。

**Rationale**:
- テンプレートリテラルのみで実装可能。新規ライブラリ不要。
- 呼び出し元（`classifier/index.ts`）が `config.routes` のキー一覧を渡すだけでよい。
- `SYSTEM_PROMPT` エクスポートは関数に変わるが、`ClassificationResultSchema` は変更なし。

**実装パターン**:
```typescript
// classifier/schema.ts
export function buildSystemPrompt(routeCategories: string[]): string {
  const categorySection = routeCategories.length > 0
    ? `\n\n振り分け先カテゴリ一覧（できる限りこの中から選んでください）:\n${routeCategories.map(c => `- ${c}`).join('\n')}\n\nいずれにも当てはまらない場合のみ独自のカテゴリ名を使用してください。`
    : '';
  return `あなたはファイル内容を分析して分類するアシスタントです。
与えられたテキストを読み、以下の JSON 形式のみで回答してください。他の文章は一切含めないでください。

{
  "category": "<書類の主カテゴリ>",
  "tags": ["<関連タグ1>", "<関連タグ2>"],
  "summary": "<内容の簡潔な要約（100文字以内）>",
  "confidentiality": "<機密レベル: low / medium / high のいずれか>",
  "confidence": <分類の確信度 0.0〜1.0 の数値>,
  "destination": "<推奨する振り分け先カテゴリ名>"
}${categorySection}`;
}

// classifier/index.ts
const routeCategories = Object.keys(config.routes);
const systemPrompt = buildSystemPrompt(routeCategories);
// ... messages の system に systemPrompt を使用
```

**Alternatives considered**:
- プロンプトを `config.json` に持たせる: 設定が複雑になり「小さく始める」原則に反する
- LangChain の OutputParser を使う: 依存増加。既存 Zod 検証で十分

---

## §2 「その他」フォールバックキー名の扱い

**Decision**: フォールバックキー名は `'その他'` としてルーター内の定数（`const FALLBACK_ROUTE_KEY = 'その他'`）で管理する。`config.json` スキーマは変更しない。

**Rationale**:
- ユーザーは `config.json` の `routes` に「その他」キーを定義することで有効化できる
- キー名のカスタマイズ需要は Assumptions に明記済みでスコープ外
- 定数化により将来の設定可能化（Round 5 等）に対応しやすい

**フォールバック判定ロジック**:
```typescript
const FALLBACK_ROUTE_KEY = 'その他';

// router/index.ts の route() 内
const autoDir = config.routes[category];
const isHighConfidence = confidence >= config.confidenceThreshold;
const fallbackDir = config.routes[FALLBACK_ROUTE_KEY];

let destDir: string;
let moveType: MoveType;
let reviewReason: string | undefined;

if (isHighConfidence && autoDir !== undefined) {
  // 完全一致 → 自動振り分け
  destDir = autoDir;
  moveType = 'auto';
} else if (isHighConfidence && category !== FALLBACK_ROUTE_KEY && fallbackDir !== undefined) {
  // 不一致 + 「その他」あり → フォールバック
  destDir = fallbackDir;
  moveType = 'auto';
  reviewReason = `routes に category "${category}" の設定がないため「${FALLBACK_ROUTE_KEY}」へ振り分け`;
} else {
  // 低信頼度 or 「その他」もなし → review
  destDir = config.reviewDir;
  moveType = 'review';
  if (!isHighConfidence) {
    reviewReason = `信頼スコア不足 (confidence=${confidence} < threshold=${config.confidenceThreshold})`;
  } else {
    reviewReason = `routes に category "${category}" の設定がなく「${FALLBACK_ROUTE_KEY}」も未設定`;
  }
}
```

**Alternatives considered**:
- `config.json` に `fallbackRoute` フィールドを追加: スキーマ変更が必要。スコープ外
- AI に「その他」を強制させる: AI は完全一致を保証できないため、ルーター側の保証が必要

---

## §3 監査ログの記録方針

**Decision**: フォールバックにより「その他」へ振り分けた場合、`moveType: "auto"` かつ `error` フィールドにフォールバック理由を記録する。

**Rationale**:
- `moveType: "auto"` はユーザーの意図した自動振り分けであることを示す
- `error` フィールドはフォールバック理由の記録に使用（既存の `reason` → `error` マッピングを踏襲）
- 監査ログのスキーマ（`AuditLogEntry`）変更は不要

**記録例**:
```json
{
  "event": "completed",
  "category": "法令",
  "confidence": 0.85,
  "destination": "C:\\...\\others\\file.txt",
  "moveType": "auto",
  "error": "routes に category \"法令\" の設定がないため「その他」へ振り分け"
}
```

---

## §4 既存テストへの影響

**Decision**: `tests/config-schema.test.ts` は変更なし。新規テスト `tests/route-fallback.test.ts` を追加。

**テスト対象**:
1. 「その他」フォールバックが正しく適用されるケース（完全一致なし + 「その他」あり）
2. 「その他」も未設定の場合に `reviewDir` へ送るケース（既存動作の回帰確認）
3. 完全一致がある場合はフォールバックを適用しないケース
4. 信頼スコア不足の場合はフォールバックを適用しないケース

**テスト方針**: `route()` 関数を直接呼び出す単体テスト。ファイル移動は `vi.mock('node:fs/promises')` でモック化。
