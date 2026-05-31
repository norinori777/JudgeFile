# Research: OWASPセキュリティ強化

**Phase 0 完了日**: 2026-06-01
**Feature**: 009-owasp-security-hardening

---

## 1. ファイルパストラバーサル防止

### Decision
`path.resolve()` でパスを正規化し、`String.prototype.startsWith()` で許可ルート配下かを検証する。

### Rationale
- Node.js 標準ライブラリの `path.resolve()` は OS のパス区切り文字差異・`../` シーケンス・Null バイト（`\0`）をすべて処理する
- `resolve()` 後に `startsWith(allowedRoot + path.sep)` で完全一致境界をチェックすることで、`/watch` vs `/watchDir` 等のプレフィックス誤一致を防げる
- Windows の `C:\` 系パスにも `path.resolve()` が正しく動作する

### Implementation Pattern
```typescript
import { resolve, sep } from 'node:path';

export function isPathAllowed(targetPath: string, allowedRoot: string): boolean {
  const normalizedTarget = resolve(targetPath);
  const normalizedRoot = resolve(allowedRoot);
  return (
    normalizedTarget === normalizedRoot ||
    normalizedTarget.startsWith(normalizedRoot + sep)
  );
}
```

### Alternatives Considered
- `realpath()` の利用: シンボリックリンクを完全解決できるが、非同期になりテスト複雑度が増す。`resolve()` で十分
- カスタム正規化: OS差異の対応漏れリスクがあり不採用

---

## 2. MIMEタイプ検証（マジックナンバー検査）

### Decision
`file-type` npm パッケージ（v19+）を使用する。

### Rationale
- 純粋 TypeScript 実装、ネイティブ依存なし
- ファイル先頭バイトのマジックナンバーで判定（拡張子に依存しない）
- 主要フォーマット（PDF、DOCX、XLSX、PNG、JPG、GIF、WebP 等）をカバー
- ESM-only パッケージだが既存プロジェクトの `tsconfig.json` / `package.json` に `"type": "module"` 対応が必要か確認要
- 代替: `mmmagic`（ネイティブバインディング必要）、`magic-bytes.js`（対応フォーマット少）

### Mapping Table
| 対象拡張子 | 期待 MIME タイプ |
|-----------|----------------|
| `.txt`, `.md` | `text/plain` または `undefined`（ASCIIテキストはマジックナンバーなし）|
| `.pdf` | `application/pdf` |
| `.docx` | `application/vnd.openxmlformats-officedocument.wordprocessingml.document` |
| `.xlsx` | `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` |
| `.png` | `image/png` |
| `.jpg`, `.jpeg` | `image/jpeg` |

### テキストファイルの特別扱い
`.txt` / `.md` はバイナリマジックナンバーを持たないため `file-type` が `undefined` を返す。
- `undefined` かつ拡張子が `.txt` / `.md` の場合 → 許可（テキストとして扱う）
- `undefined` かつそれ以外の拡張子 → 拒否（拡張子なし扱いと同様）
- MIME タイプが取得できて拡張子と不一致 → 拒否

### Alternatives Considered
- `mmmagic`: ネイティブ依存があり、Windows CI での使用が不安定なため不採用
- 独自バイト検査: 対応フォーマット追加のたびにメンテが発生するため不採用

---

## 3. ファイルサイズ検証

### Decision
`fs.stat().size` でサイズを取得し、設定値と比較する。デフォルト上限は **50MB**。

### Rationale
- `chokidar` の `awaitWriteFinish` オプション（`stabilityThreshold: 2000` 等）を有効化することで、書き込み中ファイルがキューに積まれる前に完了を待てる
- ファイルサイズは `fs.stat()` で O(1) に取得でき、ファイル読み込み前に実行可能
- 50MB はビジネス文書の現実的な上限として選定（pdf/docx の通常ファイル最大サイズを考慮）

### Config Structure
```json
{
  "maxFileSizeMB": {
    "default": 50,
    ".txt": 10,
    ".md": 10,
    ".pdf": 50,
    ".docx": 50,
    ".xlsx": 50,
    ".png": 20,
    ".jpg": 20,
    ".jpeg": 20
  }
}
```

---

## 4. ログの機密フィールドマスク

### Decision
`config.json` に `sensitiveFields: string[]` 配列を追加し、ログ書き込み関数内でマスク処理を一元化する。マスク文字列は `[REDACTED]`（固定）。

### Rationale
- ログ書き込みは `writeLog()` 関数を唯一の出口として実装済みであり、ここにマスクロジックを集約できる
- 設定ファイル管理により、コード変更なしにマスク対象フィールドを追加・削除できる
- Zod スキーマで `sensitiveFields` のデフォルト値を `["contractSubject", "contractPeriod"]` に設定することで、未設定時も安全

### Implementation Pattern
```typescript
function maskSensitiveFields(
  entry: AuditLogEntry,
  sensitiveFields: string[]
): AuditLogEntry {
  const masked = { ...entry };
  for (const field of sensitiveFields) {
    if (field in masked && masked[field as keyof AuditLogEntry] !== undefined) {
      (masked as Record<string, unknown>)[field] = '[REDACTED]';
    }
  }
  return masked;
}
```

---

## 5. ファイルパーミッション設定

### Decision
ログファイル生成時に `fs.chmod(path, 0o600)` を呼び出す。Windows では chmod が効果を持たないが、Node.js は例外を投げないため安全に実行できる。

### Rationale
- POSIX 環境（Linux/macOS）では `0o600`（owner read/write only）が適切
- Windows では ACL ベースのアクセス制御が必要だが、アプリケーション層での実装は複雑すぎる。Windows 環境では OS レベルの対応（フォルダ ACL 設定）を Assumption として明記済み
- `fs.chmod()` は Windows で `ENOTSUP` を投げず、単に無視するため安全

---

## 6. `chokidar` awaitWriteFinish 設定

### Decision
`watcher` の初期化時に `awaitWriteFinish: { stabilityThreshold: 2000, pollInterval: 100 }` を設定する。

### Rationale
- `stabilityThreshold: 2000` はファイルサイズが 2 秒間変化しなければ「書き込み完了」とみなす
- これにより書き込み途中のファイルがキューに積まれることを防ぎ、サイズ検証の正確性を担保
- 既存の `watcher/index.ts` に設定を追加するだけで対応可能

---

## 7. 循環参照検証（watchDir と routes の一致検出）

### Decision
設定読み込み時（`loadConfig()` 後）に、`watchDir` の正規化パスと `routes` の全振り分け先パスを比較し、一致する場合は `Error` をスローしてプロセスを終了する。

### Rationale
- 設定ロード時に一度だけ実行すれば十分（ランタイム中に `watchDir` は変化しない）
- `reviewDir` も同様にチェック対象とする（`reviewDir === watchDir` も循環になる）
