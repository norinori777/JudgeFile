# Implementation Plan: 契約書振り分け時の契約情報抽出・テキスト出力

**Branch**: `006-office-human-review` | **Date**: 2026-05-31 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/007-contract-info-extraction/spec.md`

## Summary

振り分け処理（route → moveFile）が完了したファイルのうち、AI 分類カテゴリが「契約書」と判定されたものに対して、独立した `extractContractInfo()` 関数で契約対象（`contractSubject`）と規約期間（`contractPeriod`）を OpenAI SDK から取得する。抽出結果は振り分け先の `.meta.json` に追記し、監査ログの `event: 'completed'` エントリにも含める。抽出失敗はパイプラインを止めず `contractExtractionError` として記録するのみ。

## Technical Context

**Language/Version**: Node.js 20 LTS / TypeScript 5.x

**Primary Dependencies**: openai SDK, zod（既存依存）, node:fs（既存）

**Storage**: JSON Lines 監査ログファイル, `.meta.json`（ファイルシステム）

**Testing**: vitest（既存）

**Target Platform**: Windows / Linux ローカルデーモン

**Project Type**: CLI デーモン（監視フォルダ型パイプライン）

**Performance Goals**: 1 ファイルあたりの追加 AI 呼び出しが既存分類呼び出し以下（≤30 秒タイムアウト）

**Constraints**: 分類用テキストを再利用し追加ファイル I/O なし。抽出失敗時も振り分け完了率 100% を維持する

**Scale/Scope**: 既存パイプラインへの後付け追加。新規モジュール 1 本（`src/extractor/contract.ts`）+ 型拡張 + queue 統合

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| 原則 | 判定 | 根拠 |
|------|------|------|
| I. 決定的処理優先 | ✅ PASS | カテゴリ判定は文字列比較（決定的）。AI は補助抽出のみ |
| II. 構造化AI出力と検証 | ✅ PASS | Zod スキーマ `ContractInfoSchema` で JSON 出力を検証する |
| III. 低信頼度は自動実行しない | ✅ PASS | 抽出失敗・null は記録のみ。振り分け先を変更しない |
| IV. 抽出・分類・振り分けを分離し監査可能にする | ✅ PASS | `extractContractInfo()` は独立モジュール。既存 classifier/router 変更なし |
| V. 小さく始めて拡張する | ✅ PASS | 新規ファイル 1 本のみ追加。既存パイプラインへの後付け |

**GATE: PASS（研究フェーズへ進行可）**

## Project Structure

### Documentation (this feature)

```text
specs/007-contract-info-extraction/
├── plan.md              # このファイル
├── research.md          # Phase 0 出力
├── data-model.md        # Phase 1 出力
├── quickstart.md        # Phase 1 出力
├── contracts/           # Phase 1 出力
└── tasks.md             # Phase 2 出力（/speckit.tasks で生成）
```

### Source Code (repository root)

```text
src/
├── extractor/
│   └── contract.ts      # NEW: extractContractInfo() + ContractInfoSchema
├── classifier/
│   ├── index.ts         # 変更なし
│   └── schema.ts        # 変更なし
├── queue/
│   └── index.ts         # MODIFY: enqueue() に契約情報抽出ステップを追加
├── config/
│   └── schema.ts        # MODIFY: contractCategoryLabel フィールド追加
└── types/
    └── index.ts         # MODIFY: AuditLogEntry に contractSubject / contractPeriod / contractExtractionError 追加

tests/
├── contract-info-extraction.test.ts   # NEW: extractContractInfo のユニットテスト
```

## Implementation Flow

### パイプライン全体図（変更後）

```
watcher → queue.enqueue(filePath)
  └─ extract(filePath)
       └─ classify(text)
            └─ route(filePath, classification)
                 └─ moveFile(filePath, destDir)          ← ここまで既存
                      └─ [category === contractLabel?]   ← FR-001: カテゴリ判定（新規）
                           └─ extractContractInfo(text)  ← FR-002: 独立関数（新規）
                                ├─ updateMetaJson(destDir, contractInfo)  ← FR-005（新規）
                                └─ auditLog includes contractInfo         ← FR-006（新規）
```

### 変更ファイルと責務

| ファイル | 種別 | 変更内容 |
|---------|------|---------|
| `src/extractor/contract.ts` | NEW | `extractContractInfo(text, config)` 関数、`ContractInfoSchema`（Zod）、`buildContractPrompt()` |
| `src/types/index.ts` | MODIFY | `AuditLogEntry` に `contractSubject`・`contractPeriod`・`contractExtractionError` を optional 追加。`ContractInfo` 型を追加 |
| `src/config/schema.ts` | MODIFY | `contractCategoryLabel` フィールド（デフォルト: `"契約書"`）を追加 |
| `src/queue/index.ts` | MODIFY | `enqueue()` 内の `completed` 直前に契約情報抽出ステップを追加 |

### `src/extractor/contract.ts` の設計

```typescript
// ContractPeriod 型（Zod スキーマと型を一致させる）
interface ContractPeriod {
  start: string | null;
  end: string | null;
  note: string | null;
}

// ContractInfo 型
interface ContractInfo {
  contractSubject: string | null;
  contractPeriod: ContractPeriod;
}

// Zod スキーマ（AI JSON 出力検証用）
const ContractInfoSchema = z.object({
  contractSubject: z.string().nullable(),
  contractPeriod: z.object({
    start: z.string().nullable(),
    end: z.string().nullable(),
    note: z.string().nullable(),
  }),
});

// プロンプト: 既存テキストから契約対象・規約期間のみ抽出
// 分類用テキストを再利用し追加ファイル I/O なし（FR-002）
export async function extractContractInfo(text: string, config: Config): Promise<ContractInfo>
```

### `src/queue/index.ts` の変更箇所（概要）

```typescript
// moveFile() 完了後、category === contractCategoryLabel の場合のみ実行
const contractLabel = (config.contractCategoryLabel ?? '契約書').toLowerCase();
if (classification.category.toLowerCase() === contractLabel && decision.moveType !== 'error') {
  try {
    const contractInfo = await extractContractInfo(result.text, config);
    // FR-005: .meta.json 更新
    await updateMetaJson(decision.destDir, contractInfo);
    // FR-006: completedEntry に追加（後で completedEntry 生成時に組み込む）
  } catch (err) {
    contractExtractionError = err instanceof Error ? err.message : String(err);
  }
}
```

## Constitution Check（Phase 1 再評価）

| 原則 | 判定 | 根拠 |
|------|------|------|
| I. 決定的処理優先 | ✅ PASS | カテゴリ判定・meta.json 更新はすべて決定的処理 |
| II. 構造化AI出力と検証 | ✅ PASS | `ContractInfoSchema`（Zod）で検証。通らない出力は例外としてキャッチ |
| III. 低信頼度は自動実行しない | ✅ PASS | 抽出失敗は null 記録のみ。振り分け先変更なし |
| IV. 抽出・分類・振り分けを分離し監査可能にする | ✅ PASS | `contract.ts` は独立モジュール。`classify()` `route()` に変更なし |
| V. 小さく始めて拡張する | ✅ PASS | 「契約書」カテゴリのみが対象。他カテゴリへの拡張は別スプリント |

**GATE: PASS（Phase 1 設計完了）**

