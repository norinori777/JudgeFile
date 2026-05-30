# Data Model: 契約書振り分け時の契約情報抽出・テキスト出力

**Date**: 2026-05-31  
**Feature**: [spec.md](spec.md)

## 新規エンティティ

### ContractPeriod

規約期間を表す。日付フォーマットは AI が返した文字列をそのまま使用し、変換は行わない。

| フィールド | 型 | 必須 | 説明 |
|-----------|---|------|------|
| `start` | `string \| null` | — | 契約開始日（AI 出力のまま。例: `"2025-04-01"` `"2025年4月1日"` `null`） |
| `end` | `string \| null` | — | 契約終了日（AI 出力のまま。例: `"2026-03-31"` `null`） |
| `note` | `string \| null` | — | 期間が「自動更新」「期間の定めなし」等の場合の備考テキスト。`start`/`end` が取得できた場合は `null` |

### ContractInfo

契約情報抽出結果を表す。AI が返す JSON に対して Zod スキーマ（`ContractInfoSchema`）で検証する。

| フィールド | 型 | 必須 | 説明 |
|-----------|---|------|------|
| `contractSubject` | `string \| null` | — | 契約対象（商品名・サービス名・取引先名など最主要の 1 件。複数ある場合は AI が選択） |
| `contractPeriod` | `ContractPeriod` | ✅ | 規約期間オブジェクト（null ではなくオブジェクトとして常に存在する） |

---

## 既存エンティティの拡張

### AuditLogEntry（`src/types/index.ts`）

以下のオプショナルフィールドを追加する。いずれも `event: 'completed'` エントリにのみ設定される。

| フィールド | 型 | 条件 | 説明 |
|-----------|---|------|------|
| `contractSubject` | `string \| null` | 契約書カテゴリかつ抽出成功時 | 契約対象 |
| `contractPeriod` | `ContractPeriod \| null` | 契約書カテゴリかつ抽出成功時 | 規約期間（ネスト JSON オブジェクト） |
| `contractExtractionError` | `string` | 契約情報抽出の AI 呼び出しがエラーになった場合 | エラーメッセージ |

### MetaJson（`.meta.json` ファイル）

`src/queue/index.ts` で生成される `.meta.json` に以下のフィールドを追加する。

| フィールド | 型 | 条件 | 説明 |
|-----------|---|------|------|
| `contractSubject` | `string \| null` | 契約書カテゴリかつ抽出成功時 | 契約対象 |
| `contractPeriod` | `ContractPeriod \| null` | 契約書カテゴリかつ抽出成功時 | 規約期間（ネスト JSON オブジェクト） |

### Config（`src/config/schema.ts`）

| フィールド | 型 | デフォルト | 説明 |
|-----------|---|-----------|------|
| `contractCategoryLabel` | `string` | `"契約書"` | 契約情報抽出を発動するカテゴリラベル（大文字小文字無視で比較） |

---

## Zod スキーマ定義（`src/extractor/contract.ts`）

```typescript
import { z } from 'zod';

export const ContractInfoSchema = z.object({
  contractSubject: z.string().nullable(),
  contractPeriod: z.object({
    start: z.string().nullable(),
    end: z.string().nullable(),
    note: z.string().nullable(),
  }),
});

export type ContractInfo = z.infer<typeof ContractInfoSchema>;
```

---

## 状態遷移：契約情報抽出ステップ

```
route() + moveFile() 完了
     │
     ├─ [category !== contractLabel] ─→ スキップ（何もしない）
     │
     └─ [category === contractLabel]
          │
          ├─ extractContractInfo() 呼び出し
          │    ├─ 成功 → ContractInfo 取得
          │    │    ├─ updateMetaJson(destDir, contractInfo)
          │    │    │    ├─ 成功 → .meta.json 更新完了
          │    │    │    └─ 失敗 → 警告ログのみ（処理継続）
          │    │    └─ completedEntry に contractSubject / contractPeriod 追加
          │    │
          │    └─ 失敗（例外）
          │         └─ completedEntry に contractExtractionError 追加（抽出フィールドは付加しない）
          │
          └─ writeLog(completedEntry)
```

---

## フィールド設定パターン例

### 正常抽出時の `event: 'completed'` ログエントリ

```json
{
  "id": "uuid",
  "event": "completed",
  "timestamp": "2026-05-31T10:00:00.000Z",
  "filePath": "/watch/契約書_2025.pdf",
  "durationMs": 3200,
  "charCount": 4500,
  "category": "契約書",
  "confidence": 0.95,
  "tags": ["契約", "業務委託"],
  "confidentiality": "high",
  "destination": "/routes/contracts/契約書_2025.pdf",
  "moveType": "auto",
  "contractSubject": "株式会社サンプル 業務委託契約",
  "contractPeriod": {
    "start": "2025-04-01",
    "end": "2026-03-31",
    "note": null
  }
}
```

### 抽出エラー時の `event: 'completed'` ログエントリ

```json
{
  "id": "uuid",
  "event": "completed",
  "timestamp": "2026-05-31T10:01:00.000Z",
  "filePath": "/watch/契約書_不明.pdf",
  "durationMs": 5100,
  "charCount": 120,
  "category": "契約書",
  "confidence": 0.91,
  "moveType": "auto",
  "contractExtractionError": "AI 契約情報抽出タイムアウト: 30000ms を超過しました"
}
```
