# Data Model: OWASPセキュリティ強化

**Feature**: 009-owasp-security-hardening
**Date**: 2026-06-01

---

## 新規エンティティ

### SecurityValidationResult

ファイル処理パイプラインの最前段で実行されるセキュリティ検証の結果を表す。

| フィールド | 型 | 説明 |
|-----------|-----|------|
| `passed` | `boolean` | 全検証が合格した場合 `true` |
| `rejectionReason` | `string \| undefined` | 拒否理由（`passed: false` の場合のみ設定） |
| `fileSizeBytes` | `number` | 検査時のファイルサイズ（バイト） |
| `detectedMimeType` | `string \| undefined` | `file-type` が検出した MIME タイプ（テキストは `undefined`） |
| `validations` | `ValidationDetail[]` | 各検証ステップの詳細 |

#### ValidationDetail

| フィールド | 型 | 説明 |
|-----------|-----|------|
| `type` | `'path' \| 'size' \| 'mime' \| 'circular'` | 検証種別 |
| `passed` | `boolean` | この検証が合格したか |
| `detail` | `string \| undefined` | 失敗時の詳細メッセージ |

**状態遷移**:
```
全 ValidationDetail.passed === true → SecurityValidationResult.passed = true
いずれか false → SecurityValidationResult.passed = false（最初の失敗を rejectionReason に設定）
```

---

## 既存エンティティの変更

### Config（`src/config/schema.ts` 拡張）

以下のフィールドを `ConfigSchema` に追加する：

| フィールド | 型 | デフォルト | 説明 |
|-----------|-----|----------|------|
| `sensitiveFields` | `string[]` | `["contractSubject", "contractPeriod"]` | 監査ログでマスクするフィールド名のリスト |
| `maxFileSizeMB` | `FileSizeLimitConfig` | `{ default: 50 }` | ファイルタイプ別の最大サイズ（MB） |

#### FileSizeLimitConfig

拡張子（例：`.txt`）をキー、MB単位の上限値を値とする Record。  
キー `"default"` が必ず存在し、タイプ別設定がない場合のフォールバックとして使われる。

```typescript
// 例
{
  default: 50,
  ".txt": 10,
  ".md": 10,
  ".pdf": 50
}
```

**Zodスキーマ**:
```typescript
z.object({
  default: z.number().int().min(1).max(1000).default(50),
}).catchall(z.number().int().min(1).max(1000))
```

---

### AuditLogEntry（`src/types/index.ts` 拡張）

既存の `AuditLogEntry` に以下のフィールドを追加する：

| フィールド | 型 | 説明 |
|-----------|-----|------|
| `securityRejection` | `{ reason: string; validationType: string } \| undefined` | セキュリティ検証で拒否された場合の詳細 |

`event: 'rejected'` を新規追加する（既存: `'started'` / `'completed'` / `'failed'`）：

| イベント | 説明 |
|---------|------|
| `'started'` | 処理開始（既存） |
| `'completed'` | 処理完了（既存） |
| `'failed'` | 処理失敗（既存） |
| `'rejected'` | **新規** — セキュリティ検証で拒否（レビューフォルダへ移動） |

---

## 新規モジュール

### `src/extractor/security.ts`

パイプライン最前段のセキュリティ検証モジュール。以下の関数を公開する：

| 関数 | 説明 |
|------|------|
| `validateFileSecurity(filePath, config)` | 全検証を実行し `SecurityValidationResult` を返す |
| `isPathAllowed(targetPath, allowedRoot)` | パストラバーサルチェック（純粋関数） |
| `getFileSizeLimit(ext, config)` | 拡張子別の上限MB取得（fallback to default） |
| `validateMimeType(filePath, ext)` | MIMEタイプ検証（file-type 使用） |

### `src/config/validator.ts`

設定読み込み後の追加バリデーション（起動時一回実行）：

| 関数 | 説明 |
|------|------|
| `validateConfigSecurity(config)` | `watchDir` ↔ `routes` / `reviewDir` の循環参照チェック |

---

## ファイルパーミッション

ログファイル生成時（`initLogger()` 内）に `fs.chmod(logFile, 0o600)` を実行する。  
- POSIX: オーナーのみ読み書き可（`-rw-------`）
- Windows: 無視（OS レベルの ACL で対応）

---

## 変更サマリー

| 変更対象 | 変更内容 |
|---------|---------|
| `src/config/schema.ts` | `sensitiveFields` / `maxFileSizeMB` フィールド追加 |
| `src/types/index.ts` | `AuditLogEntry.securityRejection` / `event: 'rejected'` 追加 |
| `src/logger/index.ts` | `initLogger(filePath, sensitiveFields)` の引数に `sensitiveFields: string[]` を追加してモジュールスコープ変数に格納。`writeLog()` のシグネチャは変更せず、内部でモジュールスコープの `sensitiveFields` を参照してマスク処理を適用する |
| `src/extractor/security.ts` | **新規** — 全セキュリティ検証ロジック |
| `src/config/validator.ts` | **新規** — 起動時設定バリデーション |
| `src/queue/index.ts` | `enqueue()` 前段にセキュリティ検証ステップ追加 |
| `src/watcher/index.ts` | `awaitWriteFinish` オプション有効化 |
| `src/index.ts` | 起動時に `validateConfigSecurity()` 呼び出し追加 |
