# Quickstart: OWASPセキュリティ強化

**Feature**: 009-owasp-security-hardening
**Date**: 2026-06-01

---

## この機能で何が変わるか

- 監視フォルダ外へのファイル移動を全ブロック（パストラバーサル防止）
- 全ファイルタイプにサイズ上限を適用（デフォルト 50MB）
- 拡張子偽装ファイルをMIMEタイプ検証で拒否
- 起動時に `watchDir` と振り分け先の循環参照を検出してプロセス終了
- 監査ログの機密フィールド（契約対象・期間）を `[REDACTED]` でマスク
- ログファイルのパーミッションを制限（POSIX: `0o600`）

---

## 設定変更

`config.json` に以下を追加する（省略時はデフォルト値が適用されるため必須ではない）：

```json
{
  "sensitiveFields": ["contractSubject", "contractPeriod"],
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

## 新規依存パッケージのインストール

```bash
yarn add file-type
```

> `file-type` v19+ は ESM-only です。既存の `package.json` に `"type": "module"` が設定されている場合はそのまま使えます。

---

## 動作確認手順

### 1. パストラバーサルブロックの確認

`config.json` の `routes` に `watchDir` 外のパスを一時的に設定：

```json
{
  "routes": {
    "テスト": "../../outside"
  }
}
```

システム起動後、ファイルを投入すると `security_rejected` イベントがログに記録され、ファイルは `reviewDir` へ移動される。

### 2. サイズ上限の確認

`.txt` ファイルの上限を一時的に小さく設定：

```json
{
  "maxFileSizeMB": { "default": 50, ".txt": 0.001 }
}
```

1KB 超のテキストファイルを投入すると `reviewDir` へ移動され、ログに `fileSizeExceeded` が記録される。

### 3. MIME タイプ検証の確認

```bash
# バイナリファイルを .txt に偽装
copy some-binary.pdf fake.txt
```

`fake.txt` を監視フォルダに置くと拒否されて `reviewDir` へ移動される。

### 4. 循環参照の確認

```json
{
  "watchDir": "/path/to/watch",
  "routes": { "テスト": "/path/to/watch" }
}
```

この設定でシステムを起動するとエラーログが出力されてプロセスが終了する。

### 5. ログマスクの確認

契約書ファイルを処理した後、ログファイルを確認：

```bash
grep "contractSubject" audit.jsonl
# → [REDACTED] が表示される（実値は含まれない）
```

---

## テスト実行

```bash
yarn test tests/owasp-security.test.ts
```

---

## 既存機能への影響

| 機能 | 影響 |
|------|------|
| txt / md 処理 | サイズ上限チェックが追加される（デフォルト 10MB） |
| PDF 処理 | サイズ上限チェックが追加される（デフォルト 50MB） |
| 画像 OCR | MIME 検証が追加される（既存の `maxImageSizeMB` と共存） |
| Office 処理 | MIME 検証 + サイズ上限が追加される（デフォルト 50MB） |
| 契約情報抽出 | ログ出力時に `contractSubject` / `contractPeriod` がマスクされる |
| レビューフロー | セキュリティ拒否ファイルも `reviewDir` へ移動（既存ルートと同じ） |
