# Implementation Plan: OWASPセキュリティ強化

**Branch**: `009-owasp-security-hardening` | **Date**: 2026-06-01 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/009-owasp-security-hardening/spec.md`

## Summary

監視フォルダ型ファイル処理パイプラインに OWASP Top 10 観点のセキュリティ強化を実装する。
対象は「パストラバーサル防止」「全ファイルタイプへのサイズ制限」「機密情報ログマスク」「MIMEタイプ検証」の4領域。
新規モジュール `src/extractor/security.ts` と `src/config/validator.ts` を追加し、既存の `queue/index.ts` / `config/schema.ts` / `logger/index.ts` / `watcher/index.ts` を最小変更で拡張する。

## Technical Context

**Language/Version**: Node.js 20 + TypeScript 5.x

**Primary Dependencies**:
- 既存: `zod`, `p-queue`, `openai`, `chokidar`
- 追加: `file-type` v19+（ESM-only、マジックナンバーによるMIME判定）

**Storage**: ローカルファイルシステム（JSON Lines 監査ログ）

**Testing**: vitest

**Target Platform**: Node.js（Windows / macOS / Linux）

**Project Type**: CLI デーモン（監視フォルダ型）

**Performance Goals**: セキュリティ検証処理による正常ファイルの追加処理時間を既存の10%以内に抑える

**Constraints**:
- 既存テストをすべて通過させたまま機能追加する
- `file-type` はESM-only のため `import()` または ESM-first な設定で利用
- Windows では `fs.chmod()` は無視される（OS レベルの ACL で対応する旨を Assumption に明記済み）

**Scale/Scope**: 既存の10ファイル未満のソース変更で完結（新規2ファイル + 既存6ファイル修正）

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| 原則 | 適合状況 |
|------|----------|
| I. 決定的処理優先 | ✅ パス正規化・サイズ検査・MIME検査はすべて決定的。AI を使わない |
| II. 構造化AI出力と検証 | ✅ セキュリティ検証は AI 非依存。スキーマ検証（Zod）を設定パース時に適用 |
| III. 低信頼度は自動実行しない | ✅ セキュリティ拒否ファイルは自動移動せず `reviewDir` へ送る |
| IV. 抽出・分類・振り分けを分離し監査可能にする | ✅ `security.ts` はセキュリティ検証専用モジュールとして分離。全拒否をログに記録 |
| V. 小さく始めて拡張する | ✅ 既存パイプラインを壊さず、最前段に検証ステップを挿入するだけ |

**Post-design Constitution Check（Phase 1 完了後）**: 全原則に違反なし。

## Project Structure

### Documentation (this feature)

```text
specs/009-owasp-security-hardening/
├── plan.md              ← このファイル
├── research.md          ← Phase 0 完了
├── data-model.md        ← Phase 1 完了
├── quickstart.md        ← Phase 1 完了
├── contracts/
│   └── config-schema.md ← Phase 1 完了
└── tasks.md             ← /speckit.tasks で生成
```

### Source Code（変更対象）

```text
src/
├── config/
│   ├── schema.ts          # sensitiveFields / maxFileSizeMB フィールド追加
│   └── validator.ts       # 新規: 起動時設定バリデーション（循環参照チェック）
├── extractor/
│   └── security.ts        # 新規: パス・サイズ・MIME 検証
├── logger/
│   └── index.ts           # writeLog() にマスク処理追加 + chmod
├── queue/
│   └── index.ts           # enqueue() 前段にセキュリティ検証ステップ追加
├── types/
│   └── index.ts           # AuditLogEntry に securityRejection / 'rejected' イベント追加
├── watcher/
│   └── index.ts           # awaitWriteFinish オプション有効化
└── index.ts               # validateConfigSecurity() 呼び出し追加

tests/
└── owasp-security.test.ts # 新規テストファイル
```

**Structure Decision**: 既存の単一プロジェクト構成を維持し、セキュリティ検証モジュールを `src/extractor/security.ts`（ファイル検証）と `src/config/validator.ts`（設定検証）に分離する。

## Complexity Tracking

違反なし。追加する抽象（`security.ts`, `validator.ts`）はいずれも単一責務を持ち、重複を生まない。

---

## Implementation Tasks（概要）

> 詳細タスクは `tasks.md` を参照すること。下記 T01–T10 は概要用の連番であり、**tasks.md の T001–T020 と一対一対応していない**。実装時は必ず `tasks.md` を正とする。

| タスク | 内容 |
|--------|------|
| T01 | `file-type` 依存パッケージ追加（`yarn add file-type`） |
| T02 | `src/config/schema.ts` に `sensitiveFields` / `maxFileSizeMB` 追加 |
| T03 | `src/types/index.ts` に `SecurityValidationResult` / `'rejected'` イベント追加 |
| T04 | `src/extractor/security.ts` 新規作成（パス・サイズ・MIME 検証） |
| T05 | `src/config/validator.ts` 新規作成（循環参照チェック） |
| T06 | `src/logger/index.ts` にマスク処理 + `chmod` 追加 |
| T07 | `src/watcher/index.ts` に `awaitWriteFinish` 追加 |
| T08 | `src/queue/index.ts` にセキュリティ検証ステップ追加 |
| T09 | `src/index.ts` に起動時バリデーション追加 |
| T10 | `tests/owasp-security.test.ts` 新規作成 |

---

## リスクと対策

| リスク | 対策 |
|--------|------|
| `file-type` ESM-only による import エラー | `package.json` の `"type": "module"` 確認済み（既存構成で対応可） |
| Windows での `fs.chmod()` 無効 | Assumption に明記済み。`chmod` は POSIX 環境のみ効果があることをコメントに記載 |
| 既存テストの `AuditLogEntry` 型変更による影響 | `securityRejection` はオプショナル（`?`）フィールドのため既存テストに影響なし |
| `awaitWriteFinish` 追加による処理遅延 | `stabilityThreshold: 2000ms` のみの追加。既存の性能テストなし（リスク低） |
