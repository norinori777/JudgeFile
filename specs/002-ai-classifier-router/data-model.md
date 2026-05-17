---
description: "Data model for 002-ai-classifier-router"
---

# Data Model: AI 分類・スキーマ検証・振り分け

**Feature**: `002-ai-classifier-router`
**Date**: 2026-05-17
**Depends On**: `001-txt-md-pipeline` の型定義（`ExtractedText`, `AuditLogEntry` 基底）

---

## 1. Config（Round 2 拡張）

Round 1 の `ConfigSchema` を拡張し、Round 2 専用フィールドを追加する。

```typescript
// src/config/schema.ts に追記
import { z } from 'zod';

export const ConfigSchema = z.object({
  // ─── Round 1 フィールド（変更なし） ───
  watchDir:       z.string().min(1),
  maxConcurrency: z.number().int().min(1).max(10).default(2),
  maxQueueSize:   z.number().int().min(1).max(1000).default(100),
  logFile:        z.string().min(1),
  maxChars:       z.number().int().min(1000).max(1_000_000).default(100_000),

  // ─── Round 2 フィールド（新規） ───

  /** AI 分類に使用する OpenAI モデル（デフォルト: gpt-4o-mini） */
  model: z.string().min(1).default('gpt-4o-mini'),

  /** OpenAI API タイムアウト（ms、デフォルト: 30000） */
  apiTimeoutMs: z.number().int().min(5_000).max(120_000).default(30_000),

  /** 自動振り分けの信頼度閾値（デフォルト: 0.8） */
  confidenceThreshold: z.number().min(0).max(1).default(0.8),

  /** review フォルダの絶対パス（必須） */
  reviewDir: z.string().min(1),

  /**
   * カテゴリ名 → 絶対パスのマッピング（Option A）
   * 例: { "請求書": "/data/invoices", "契約書": "/data/contracts" }
   * routes に存在しないカテゴリは reviewDir へ移動する
   */
  routes: z.record(z.string(), z.string()).default({}),
});

export type Config = z.infer<typeof ConfigSchema>;
```

---

## 2. ClassificationResult（新規）

AI の JSON レスポンスを受け取り Zod で検証した結果。

```typescript
// src/classifier/schema.ts
import { z } from 'zod';

export const ClassificationResultSchema = z.object({
  /** AI が自由に決定したカテゴリ名（open-ended） */
  category: z.string().min(1),

  /** 複数タグ */
  tags: z.array(z.string()),

  /** 1〜3 文の要約（本文は含まない — FR-014） */
  summary: z.string(),

  /** 機密度 */
  confidentiality: z.enum(['low', 'medium', 'high']),

  /** 0.0〜1.0 の信頼度スコア */
  confidence: z.number().min(0).max(1),

  /** 振り分け先候補（category と同じ値を AI に返させる） */
  destination: z.string().min(1),
});

export type ClassificationResult = z.infer<typeof ClassificationResultSchema>;
```

---

## 3. RouteDecision（新規）

`classifier` の出力と `config` の `routes` / `confidenceThreshold` を突き合わせた振り分け判定結果。

```typescript
// src/router/index.ts 内の型
export type MoveType = 'auto' | 'review' | 'error';

export interface RouteDecision {
  /** 振り分け種別 */
  moveType: MoveType;

  /** 実際の移動先フォルダパス（error の場合は reviewDir） */
  destDir: string;

  /** ログに残す判定理由（任意） */
  reason?: string;
}
```

### 判定ロジック（決定的）

```
if confidence >= confidenceThreshold AND routes[category] exists
  → moveType: 'auto', destDir: routes[category]
else if confidence >= confidenceThreshold AND routes[category] NOT exists
  → moveType: 'review', reason: 'routes にカテゴリが未定義'
else
  → moveType: 'review', reason: `信頼度 ${confidence} < 閾値 ${confidenceThreshold}`
```

エラー時（API 失敗・Zod 検証失敗）:
```
  → moveType: 'error', destDir: reviewDir
```

---

## 4. AuditLogEntry（Round 2 拡張）

Round 1 の `AuditLogEntry` に分類フィールドを追加する（後方互換：Round 1 イベントは新フィールドを持たない）。

```typescript
// src/types/index.ts の AuditLogEntry を拡張
export interface AuditLogEntry {
  // ─── Round 1 フィールド（変更なし） ───
  id:         string;        // crypto.randomUUID()
  event:      AuditEvent;   // 'started' | 'completed' | 'failed' | 'skipped'
  timestamp:  string;        // ISO 8601
  filePath:   string;
  durationMs?: number;
  charCount?:  number;
  error?:      string;

  // ─── Round 2 フィールド（completed / failed / skipped 時に追記） ───

  /** AI が判定したカテゴリ（completed 時） */
  category?: string;

  /** AI が返した信頼度スコア（completed / review 時） */
  confidence?: number;

  /** 複数タグ（completed 時） */
  tags?: string[];

  /** 機密度（completed 時） */
  confidentiality?: 'low' | 'medium' | 'high';

  /** 実際の移動先パス（ファイル名を含む絶対パス、completed / review 時） */
  destination?: string;

  /** 振り分け種別（completed: 'auto', review フォルダ移動: 'review', エラー: 'error'） */
  moveType?: 'auto' | 'review' | 'error';
}
```

---

## 5. モジュール責務マップ

| モジュール | ファイル | 責務 |
|---|---|---|
| `classifier` | `src/classifier/index.ts` | OpenAI SDK 呼び出し・Zod 検証・`ClassificationResult` 返却 |
| `classifier/schema` | `src/classifier/schema.ts` | `ClassificationResultSchema` と型定義 |
| `router` | `src/router/index.ts` | `RouteDecision` 判定（決定的ロジック）・ファイル移動・衝突解決 |
| `queue`（拡張） | `src/queue/index.ts` | `extractor` → `classifier` → `router` の連鎖呼び出し |
| `config/schema`（拡張） | `src/config/schema.ts` | Round 2 フィールド追加 |
| `types`（拡張） | `src/types/index.ts` | `AuditLogEntry` 拡張フィールド追加 |

---

## 6. バリデーション規則

| フィールド | ルール |
|---|---|
| `confidence` | 0.0〜1.0（Zod: `z.number().min(0).max(1)`）。境界値 `>=` で閾値比較（FR-005） |
| `routes` 値 | 絶対パス文字列（Zod: `z.record(z.string(), z.string())`）。存在確認は起動時に行う |
| `reviewDir` | 絶対パス、必須。起動時に `access()` で存在確認し、なければ `mkdir -p` で作成 |
| `apiTimeoutMs` | 5000〜120000 ms の整数（範囲超過は config 検証エラー） |
| `model` | 空文字列禁止（Zod: `z.string().min(1)`） |
| `summary` | 本文（`ExtractedText.text`）をそのまま入れてはならない。AI が生成した要約のみ |
