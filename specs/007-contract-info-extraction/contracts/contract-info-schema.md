# Contract Schema: 契約情報抽出 AI 出力スキーマ

**Feature**: 007-contract-info-extraction  
**Date**: 2026-05-31  
**Scope**: `extractContractInfo()` が OpenAI SDK から受け取る JSON 応答の契約

## 概要

`src/extractor/contract.ts` の `extractContractInfo(text, config)` 関数は、OpenAI SDK の `response_format: { type: 'json_object' }` を使い、以下のスキーマに準拠した JSON を返させる。Zod スキーマ（`ContractInfoSchema`）で検証し、合致しない場合は例外をスローする。

## AI 出力 JSON スキーマ

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "ContractInfo",
  "description": "契約書から抽出した契約対象と規約期間",
  "type": "object",
  "required": ["contractSubject", "contractPeriod"],
  "additionalProperties": false,
  "properties": {
    "contractSubject": {
      "type": ["string", "null"],
      "description": "契約の主たる対象（商品名・サービス名・取引先名など最主要の 1 件）。読み取れない場合は null"
    },
    "contractPeriod": {
      "type": "object",
      "required": ["start", "end", "note"],
      "additionalProperties": false,
      "properties": {
        "start": {
          "type": ["string", "null"],
          "description": "契約開始日（AI 出力のまま使用。ISO 8601 形式が望ましいが強制しない）。読み取れない場合は null"
        },
        "end": {
          "type": ["string", "null"],
          "description": "契約終了日（AI 出力のまま使用）。読み取れない場合は null"
        },
        "note": {
          "type": ["string", "null"],
          "description": "「自動更新」「期間の定めなし」など start/end で表せない場合の備考。start/end が取得できた場合は null"
        }
      }
    }
  }
}
```

## システムプロンプト仕様

`buildContractPrompt()` が生成するシステムプロンプトは以下の構造に従う。

```
あなたは契約書の内容を解析するアシスタントです。
与えられたテキストを読み、以下の JSON 形式のみで回答してください。他の文章は一切含めないでください。

{
  "contractSubject": "<契約の主たる対象（商品名・サービス名・取引先名など最主要の1件）。読み取れない場合は null>",
  "contractPeriod": {
    "start": "<契約開始日。読み取れない場合は null>",
    "end": "<契約終了日。読み取れない場合は null>",
    "note": "<「自動更新」など start/end で表せない備考。start/end が取得できた場合は null>"
  }
}

ルール:
- contractSubject は最も主要な契約対象を 1 件のみ文字列で返す（配列にしない）
- 日付は文書に記載された表記をそのまま使用する（変換しない）
- 読み取れない項目は null とする
- JSON 以外の出力を一切含めない
```

## バリデーション（Zod）

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

## エラー処理

| エラー種別 | 処理 |
|-----------|------|
| API タイムアウト | 例外をスロー（呼び出し側で `contractExtractionError` に記録） |
| JSON パース失敗 | 例外をスロー（呼び出し側で `contractExtractionError` に記録） |
| Zod スキーマ検証失敗 | 例外をスロー（呼び出し側で `contractExtractionError` に記録） |
| `null` フィールド | エラーではなく正常値として扱う（FR-004） |

## `.meta.json` への追記後の形式

```json
{
  "filePath": "/routes/contracts/契約書_2025.pdf",
  "originalName": "契約書_2025.pdf",
  "category": "契約書",
  "tags": ["契約", "業務委託"],
  "confidence": 0.95,
  "confidentiality": "high",
  "destination": "/routes/contracts/契約書_2025.pdf",
  "queuedAt": "2026-05-31T10:00:00.000Z",
  "contractSubject": "株式会社サンプル 業務委託契約",
  "contractPeriod": {
    "start": "2025-04-01",
    "end": "2026-03-31",
    "note": null
  }
}
```
