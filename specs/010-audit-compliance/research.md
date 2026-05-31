# Research: 監査・コンプライアンス強化

**Phase 0 完了日**: 2026-06-01
**Feature**: 010-audit-compliance

---

## 1. 連鎖ハッシュによるログ改ざん検知

### Decision
Node.js 組み込みの `node:crypto` モジュールを使い、**HMAC-SHA256** による連鎖ハッシュ方式を採用する。

### Rationale
- `node:crypto` は Node.js 標準組み込みモジュールであり、外部 npm パッケージを追加しない（憲法 V「外部抽象の抑制」を遵守）
- HMAC は鍵付きハッシュのため、シークレットキーを知らない攻撃者がハッシュを再計算できない
- 連鎖構造：各エントリに `prevHash`（前エントリの HMAC 値）と `currHash`（自エントリ内容の HMAC 値）を付与し、チェーンを構成する
- 検証時に全エントリを順に再計算し、記録済みハッシュと不一致の箇所を「改ざん」として報告する

### Implementation Pattern
```typescript
import { createHmac } from 'node:crypto';

export function computeHmac(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload, 'utf8').digest('hex');
}

// エントリ構成: { ...entry, prevHash, currHash }
// currHash = HMAC(JSON.stringify({...entry, prevHash}), secret)
// 最初のエントリの prevHash = 'genesis'（固定文字列）
```

### Alternatives Considered
- SHA-256 のみ（鍵なし）: 攻撃者がログを改ざんした後にハッシュを再計算できるため不採用
- bcrypt / argon2: パスワードハッシュ用途向け。速度が遅くログ書き込みには不適合
- 外部ライブラリ（`js-sha256` 等）: 組み込みで同等機能が得られるため不採用

---

## 2. ログローテーション方式

### Decision
ローカル日付ベースのファイル名（`audit-YYYY-MM-DD.jsonl`）とサイズ上限（デフォルト 10MB）を組み合わせたローテーション。

### Rationale
- ファイル名に日付を含めると、保持ポリシーのクリーンアップがファイル名の文字列比較だけで完結する（ファイル最終更新日時への依存なし）
- ローカル日時の深夜 0 時にトリガーすることで、1 日 1 ファイルが基本形になり視認性が高い
- サイズ上限到達時のみ `-1`、`-2` のサフィックスを付与して同日内複数ファイルに対応

### Implementation Pattern
```typescript
// ファイル名: src/logger/rotation.ts

// ローカル日時から audit-YYYY-MM-DD.jsonl 形式のファイル名を生成する
// now パラメータはテスト用の注入可能なデフォルト引数
export function getActiveLogBaseName(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `audit-${y}-${m}-${d}.jsonl`;
}

// 既存ファイルサイズを確認し上限超過なら suffix を増やす（同期関数）
export function resolveRotatedPath(logDir: string, baseName: string, maxBytes: number): string {
  // audit-YYYY-MM-DD.jsonl → audit-YYYY-MM-DD-1.jsonl → audit-YYYY-MM-DD-2.jsonl ...
  // ファイルが存在しなければプライマリパスを返す
  // サイズが maxBytes 未満なら現在のファイルを継続使用
  // 超過の場合は -1, -2 ... と連番で試行
}
```

### Alternatives Considered
- ファイル最終更新日時ベース: OS のタイムゾーン設定や DST（夏時間）で日付がずれるリスクがある
- 外部ライブラリ（`winston-daily-rotate-file` 等）: 大型依存を追加するほどの複雑度ではなく不採用

---

## 3. ログ保持ポリシー（起動時クリーンアップ）

### Decision
アプリ起動時に `src/logger/retention.ts` を呼び出し、`retentionDays` を超えたログファイルを削除する。

### Rationale
- 起動時 1 回実行（Q5 回答: Option A）であれば常駐タイマー不要。アーキテクチャが単純に保てる
- ファイル名の日付部分（`YYYY-MM-DD`）を正規表現で抽出し、現在日との差分を計算する
- `retentionDays = 0` または未設定（`undefined`）の場合は削除しない（安全デフォルト）

### Implementation Pattern
```typescript
// ファイル名: src/logger/retention.ts

// ファイル名から日付文字列 (YYYY-MM-DD) を抽出する
export function extractDateFromLogName(fileName: string): string | null { /* ... */ }

// now パラメータはテスト用の注入可能なデファイルト引数（同期関数）
export function runRetentionCleanup(
  logDir: string,
  retentionDays: number,
  now: Date = new Date(),
): string[] {
  if (retentionDays === 0) return []; // 0 = 削除しない（安全デフォルト）
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - retentionDays);
  // ファイル名から日付を抽出し cutoff より古いものを削除
  // 削除したファイルパスの配列を返す（ログに記録するため）
}
```

### Alternatives Considered
- 24 時間タイマー常駐: プロセス管理が複雑になる。本プロジェクトのシングルデーモン規模では過剰
- 外部 cron: 前提環境依存（Windows では Task Scheduler、Linux では crontab）。ポータビリティが下がるため不採用

---

## 4. 個人データ匿名化 CLI（消去要求対応）

### Decision
`scripts/redact-log.ts` を手動実行 CLI として提供。`redaction` タイプのマーカーエントリを挿入してチェーンをリセットする。

### Rationale
- 消去要求は頻繁に発生しないためバッチ CLI が適切（Q2: Option A に対応する匿名化 CLI）
- チェーン断絶は `redaction` マーカーエントリを挿入し、検証ツールがリセット点として扱う（Q4: Option B）
- 匿名化後エントリの識別子は SHA-256 一方向ハッシュとして保存（FR-009）。復元不可かつ件数は追跡可能

### Redaction Marker Entry Format
```typescript
interface RedactionMarkerEntry extends AuditLogEntry {
  event: 'redaction';
  redactedIdentifierHash: string; // SHA-256(元の識別子)
  redactedCount: number;
  redactedAt: string; // ISO 8601
  prevHash: string;   // 直前エントリの currHash（または 'genesis'）
  currHash: string;   // マーカーエントリ自体の HMAC
}
```

### Alternatives Considered
- チェーン全体再計算（Option A）: 大規模ログで書き込みコストが O(n) になりSC-004 制約を超えるリスク
- 検証ツールで消去マーカー以降のみ検証（Option C）: 消去前後の改ざんを検知できないため不採用

---

## 5. `AUDIT_HMAC_SECRET` 環境変数管理

### Decision
`src/index.ts` の起動シーケンスで `process.env.AUDIT_HMAC_SECRET` を検証し、未設定の場合は `process.exit(1)` する（Q1: Option A）。

### Rationale
- 起動エラーで強制終了することで、「改ざん検知なしでパイプラインが静かに動き続ける」状態を防ぐ
- `OPENAI_API_KEY` の既存検証パターンと同様の実装で一貫性を保てる（`src/index.ts` 冒頭に追記）
- キー長の最低要件: 32 文字以上を推奨（Zod バリデーションではなく起動時チェックで実施）

### Implementation Pattern
```typescript
const hmacSecret = process.env.AUDIT_HMAC_SECRET;
if (!hmacSecret || hmacSecret.length < 32) {
  console.error('[JudgeFile] エラー: 環境変数 AUDIT_HMAC_SECRET が未設定または短すぎます（32文字以上必要）。');
  process.exit(1);
}
```

### Alternatives Considered
- `.env` ファイルへの記述: `dotenv` は既に使用しているが、シークレットをファイルに書くとリポジトリへの誤 commit リスクがある。`.gitignore` で除外を前提とした上で許容する
- config.json への記述: config.json はバージョン管理対象のため機密情報を記述しない（FR-007）

---

## 6. 完全性検証 CLI

### Decision
`scripts/verify-log.ts` を手動実行 CLI として提供。戻り値は終了コード（正常=0、異常=1）。

### Rationale
- Q2 の回答（Option A: 手動 CLI）に対応
- 対象ログファイルはコマンドライン引数で指定（省略時は設定ファイルのアクティブログを使用）
- `redaction` マーカーエントリを検出した場合はチェーンリセット点として扱い、以降を新チェーンとして検証

### Output Format
```text
[PASS] audit-2026-06-01.jsonl: 全42エントリ整合性OK
[FAIL] audit-2026-05-15.jsonl: エントリ17（2026-05-15T10:23:44Z）に改ざんを検知
```

### Alternatives Considered
- 起動時自動検証（Option B）: 起動時間が長くなりファイルが増えると O(n) になる。手動 CLI が適切
- 定期タイマー自動検証（Option C）: 常駐プロセスの複雑化。本スコープでは不採用
