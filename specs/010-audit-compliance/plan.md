# Implementation Plan: 監査・コンプライアンス強化

**Branch**: `010-audit-compliance` | **Date**: 2026-06-01 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/010-audit-compliance/spec.md`

## Summary

監査ログに連鎖ハッシュ（HMAC-SHA256）による改ざん検知を追加し、日付ローテーションと起動時クリーンアップによる保持ポリシーを実装する。さらに、消去要求（忘れられる権利）に対応するログ匿名化 CLI を提供する。既存の `src/logger/index.ts` を拡張し、ログ構造と `AuditLogEntry` 型に完全性保証フィールドを追加することで既存パイプラインを壊さず機能を追加する。

## Technical Context

**Language/Version**: Node.js 20 + TypeScript 5.x（ESM `"type": "module"`）

**Primary Dependencies**: Node.js 組み込み `node:crypto`（HMAC-SHA256）、`node:fs/promises`、`zod`（Config スキーマ拡張）

**Storage**: ローカルファイルシステム — `audit-YYYY-MM-DD.jsonl` 形式の JSON Lines ファイル（ローカル日付ベース）

**Testing**: vitest v2.1.9（`tests/**/*.test.ts`、globals=true、environment=node）

**Target Platform**: Windows / Linux / macOS（ローカルデーモン、シングルテナント）

**Project Type**: CLI デーモン（既存パイプラインへの機能追加）

**Performance Goals**: HMAC 書き込み処理 1 エントリあたり ≤10ms（SC-002）、消去処理 1,000 件以内 ≤30 秒（SC-004）

**Constraints**: `AUDIT_HMAC_SECRET` 未設定時はアプリ起動を拒否（FR-007）。既存テスト 100% 合格を維持（SC-005）。暗号ライブラリは Node.js 組み込み `node:crypto` のみ使用（外部依存を増やさない）。

**Scale/Scope**: シングルテナント、1 デーモンプロセス。ログファイルは 1 日 1 ファイル（サイズ上限 10MB がデフォルト）。保持期間デフォルト 365 日。

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| 原則 | 確認 | 根拠 |
|------|------|------|
| I. 決定的処理優先 | ✅ | HMAC-SHA256 は同一入力で同一出力。AI は関与しない |
| II. 構造化AI出力と検証 | ✅ N/A | 本フィーチャに AI 呼び出しなし |
| III. 低信頼度は自動実行しない | ✅ N/A | 分類信頼度の概念なし |
| IV. 抽出・分類・振り分けを分離し監査可能にする | ✅ | logger 責務内で完結。extractor/classifier/router を汚染しない |
| V. 小さく始めて拡張する | ✅ | 既存 `writeLog` を最小変更で拡張。日次ローテーション・クリーンアップは独立モジュール |
| ドキュメント日本語 | ✅ | 本ファイル含め日本語で記述 |
| 外部抽象の抑制 | ✅ | 暗号は `node:crypto` のみ。新規 npm パッケージなし |

**判定: PASS — Phase 0 研究に進む**

## Project Structure

### Documentation (this feature)

```text
specs/010-audit-compliance/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
└── tasks.md             # Phase 2 output (speckit.tasks)
```

### Source Code (repository root)

```text
src/
└── logger/
    ├── index.ts              # 既存: initLogger(filePath, sensitiveFields, hmacSecret, maxLogSizeMB) に拡張
    │                         #        writeLog: HMAC チェーン付与
    │                         #        getLogFilePath() / getLogDir() を新規エクスポート
    ├── integrity.ts          # 新規: computeHmac / computeSha256 / computeEntryCurrHash / verifyChain
    ├── rotation.ts           # 新規: getActiveLogBaseName(now?) / resolveRotatedPath(dir, base, bytes)
    ├── retention.ts          # 新規: extractDateFromLogName(name) / runRetentionCleanup(dir, days, now?)
    └── redaction.ts          # 新規: redactEntries(logFile, identifier, secret, dryRun)
src/
├── config/
│   └── schema.ts             # 既存: logRetention.{retentionDays, maxLogSizeMB} フィールドを追加
├── types/
│   └── index.ts              # 既存: AuditLogEntry に integrity フィールド追加
│                             #        AuditEvent に 'redaction' 追加
│                             #        VerificationResult / VerificationViolation を新規エクスポート
└── index.ts                  # 既存: 起動時クリーンアップ・AUDIT_HMAC_SECRET 検証を追加

scripts/
├── verify-log.ts             # 新規: 完全性検証 CLI（引数なし / <file> / --all <dir>）
└── redact-log.ts             # 新規: 個人データ消去 CLI（--identifier / --dry-run / --dir）

tests/
└── audit-compliance.test.ts  # 新規: 改ざん検知・ローテーション・クリーンアップ・消去テスト
                              #        US1: HMAC チェーン検証 / US2: rotation+retention / US3: redactEntries
```

## 実装済みエクスポート一覧

| モジュール | エクスポート | 説明 |
|---|---|---|
| `logger/integrity.ts` | `computeHmac(payload, secret)` | HMAC-SHA256 hex |
| `logger/integrity.ts` | `computeSha256(value)` | SHA-256 一方向ハッシュ（消去識別子用） |
| `logger/integrity.ts` | `computeEntryCurrHash(entry, prevHash, secret)` | エントリの currHash 計算 |
| `logger/integrity.ts` | `verifyChain(entries, secret)` | チェーン完全性検証 |
| `logger/rotation.ts` | `getActiveLogBaseName(now?)` | 今日の `audit-YYYY-MM-DD.jsonl` を返す |
| `logger/rotation.ts` | `resolveRotatedPath(logDir, baseName, maxBytes)` | サイズ超過時に連番パスを返す |
| `logger/retention.ts` | `extractDateFromLogName(fileName)` | ファイル名から YYYY-MM-DD を抽出 |
| `logger/retention.ts` | `runRetentionCleanup(logDir, retentionDays, now?)` | 保持期間超過ファイルを削除 |
| `logger/redaction.ts` | `redactEntries(logFile, identifier, secret, dryRun?)` | filePath 匿名化・redaction マーカー挿入 |
| `logger/index.ts` | `initLogger(filePath, fields?, secret?, maxLogSizeMB?)` | ロガー初期化（rotation 統合済み） |
| `logger/index.ts` | `writeLog(entry)` | HMAC チェーン付きでログ追記 |
| `logger/index.ts` | `maskSensitiveFields(entry, fields)` | 機密フィールドマスク |
| `logger/index.ts` | `getLogFilePath()` | 現在のアクティブログファイルパスを返す |
| `logger/index.ts` | `getLogDir()` | 現在のログディレクトリを返す |

## Complexity Tracking

違反なし — Constitution Check PASS。
