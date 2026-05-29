# Quickstart: 設定済みルートへのベストマッチ振り分けとフォールバック

**Feature**: 004-route-best-match-fallback | **Date**: 2026-05-29

---

## 概要

このフィーチャーにより、AI が分類したカテゴリが `config.json` の `routes` に存在しない場合でも、`routes["その他"]` が設定されていれば自動振り分けされます。

---

## config.json の設定方法

`routes` に `"その他"` キーを追加するだけで有効になります。追加の設定は不要です。

```json
{
  "watchDir": "C:\\...\\inbox",
  "logFile": "C:\\...\\log\\audit.json",
  "reviewDir": "C:\\...\\review",
  "watchedExtensions": [".txt", ".md", ".pdf"],
  "routes": {
    "スケジュール": "C:\\...\\schedule",
    "日記": "C:\\...\\diary",
    "アイデア": "C:\\...\\ideas",
    "法律": "C:\\...\\law",
    "その他": "C:\\...\\others"   ← これを追加
  }
}
```

---

## 動作の流れ

```
ファイル検知
    ↓
テキスト抽出（txt / md / pdf）
    ↓
AI 分類（routes カテゴリ一覧を提示）
    ↓
信頼スコア >= confidenceThreshold？
    ├─ YES → routes[category] が存在する？
    │           ├─ YES → そのフォルダへ自動移動 (moveType: auto)
    │           └─ NO  → routes["その他"] が存在する？
    │                       ├─ YES → "その他" フォルダへ自動移動 (moveType: auto)
    │                       └─ NO  → reviewDir へ移動 (moveType: review)
    └─ NO  → reviewDir へ移動 (moveType: review)
```

---

## 変更ファイル（開発者向け）

### `src/classifier/schema.ts`

```typescript
// Before: 定数
export const SYSTEM_PROMPT = `...`;

// After: 関数（routeCategories を動的注入）
export function buildSystemPrompt(routeCategories: string[]): string { ... }
```

### `src/classifier/index.ts`

```typescript
// classify() 内で buildSystemPrompt を使用
import { buildSystemPrompt, ClassificationResultSchema } from './schema.js';

const routeCategories = Object.keys(config.routes);
const systemPrompt = buildSystemPrompt(routeCategories);
// messages[0].content = systemPrompt に変更
```

### `src/router/index.ts`

```typescript
// 「その他」フォールバックロジックを追加
const FALLBACK_ROUTE_KEY = 'その他';
```

---

## ローカル動作確認

1. `config.json` の `routes` に `"その他"` キーを追加する
2. `yarn run dev` でアプリを起動する
3. `routes` にないカテゴリに分類されそうなファイルを監視フォルダに置く
4. 監査ログ（`logFile`）で `"destination"` が `routes["その他"]` のパス、かつ `"moveType": "auto"` になっていることを確認する

---

## テスト

```bash
yarn test
# または特定のテストのみ
yarn test tests/route-fallback.test.ts
```
