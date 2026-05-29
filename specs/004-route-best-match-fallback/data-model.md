# Data Model: 設定済みルートへのベストマッチ振り分けとフォールバック

**Feature**: 004-route-best-match-fallback | **Date**: 2026-05-29

---

## 変更・追加エンティティ

### 既存エンティティの変更

#### `RouteDecision`（変更なし）

`router/index.ts` が返す振り分け判定結果。フォールバック経由の場合も既存フィールドで表現できるため変更不要。

```typescript
interface RouteDecision {
  moveType: MoveType;   // 'auto' | 'review' | 'error'
  destDir: string;      // 実際の移動先ディレクトリパス
  reason?: string;      // フォールバック理由（フォールバック時に設定）
}
```

| フィールド | フォールバック時の値 | 説明 |
|-----------|---------------------|------|
| `moveType` | `"auto"` | 設定済みカテゴリへの振り分けと同等扱い |
| `destDir` | `routes["その他"]` のパス | 実際の移動先 |
| `reason` | フォールバック理由文字列 | 監査ログの `error` フィールドに記録される |

---

### 新規定数

#### `FALLBACK_ROUTE_KEY`（`router/index.ts` に追加）

```typescript
const FALLBACK_ROUTE_KEY = 'その他';
```

| 項目 | 値 |
|------|----|
| 型 | `string` |
| スコープ | モジュールスコープ定数 |
| 役割 | フォールバック先カテゴリキーの識別子 |

---

### 新規関数シグネチャ

#### `buildSystemPrompt(routeCategories: string[]): string`（`classifier/schema.ts`）

| パラメータ | 型 | 説明 |
|-----------|-----|------|
| `routeCategories` | `string[]` | `Object.keys(config.routes)` で生成したカテゴリ一覧 |
| 戻り値 | `string` | 動的生成された SYSTEM_PROMPT 文字列 |

`routeCategories` が空配列の場合、カテゴリ一覧セクションは省略され、既存と同等のプロンプトを返す。

---

## 変更なしのエンティティ

以下は本フィーチャーでは変更しない。

| エンティティ | 場所 | 理由 |
|------------|------|------|
| `Config` | `config/schema.ts` | `config.json` スキーマ変更なし |
| `ClassificationResult` | `types/index.ts` | AI 出力スキーマ変更なし |
| `ClassificationResultSchema` | `classifier/schema.ts` | 検証ルール変更なし |
| `AuditLogEntry` | `types/index.ts` | 既存フィールドで記録可能 |
| `ExtractedText` | `types/index.ts` | 変更なし |
