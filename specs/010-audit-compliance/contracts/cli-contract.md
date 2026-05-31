# CLI Contract: 監査・コンプライアンス強化

**Feature**: 010-audit-compliance

---

## verify-log スクリプト（完全性検証）

### 実行方法

```bash
# アクティブログファイルを検証（config.json の logFile ディレクトリを参照）
npx tsx scripts/verify-log.ts

# 特定ファイルを検証
npx tsx scripts/verify-log.ts /data/logs/audit-2026-06-01.jsonl

# すべての audit-*.jsonl を一括検証
npx tsx scripts/verify-log.ts --all /data/logs/
```

### 標準出力フォーマット

```text
[PASS] audit-2026-06-01.jsonl: 全42エントリ整合性OK（redactionセグメント: 0）
[WARN] audit-2026-05-01.jsonl: レガシーエントリ15件（完全性フィールドなし）
[FAIL] audit-2026-05-15.jsonl: エントリ17（2026-05-15T10:23:44Z）に改ざんを検知
```

### 終了コード

| コード | 意味 |
|--------|------|
| `0` | すべてのエントリが整合性 OK（警告のみは 0） |
| `1` | 改ざん検知または検証エラー |

---

## redact-log スクリプト（個人データ消去）

### 実行方法

```bash
# 特定のファイルパスに関連するエントリを匿名化（config.json の logFile ディレクトリを参照）
npx tsx scripts/redact-log.ts --identifier "/data/watch/personal_doc.pdf"

# ドライラン（実際には書き換えない、件数のみ表示）
npx tsx scripts/redact-log.ts --identifier "/data/watch/personal_doc.pdf" --dry-run

# 指定ディレクトリを対象にする
npx tsx scripts/redact-log.ts --identifier "/data/watch/personal_doc.pdf" --dir /data/logs/
```

### 動作説明

1. すべての `audit-*.jsonl` ファイルを走査する
2. `filePath` が指定 `--identifier` に一致するエントリを匿名化する（`filePath` → `[REDACTED]`、sensitiveFields を `[REDACTED]` に置換）
3. 匿名化完了後、`event: 'redaction'` マーカーエントリを挿入する
4. 処理結果を標準出力に報告する

### 標準出力フォーマット

```text
# 通常実行（一致あり）
[REDACTED] /data/logs/audit-2026-06-01.jsonl: 3 エントリを匿名化
  identifierHash(SHA-256): abc123...
[REDACTED] /data/logs/audit-2026-05-15.jsonl: 1 エントリを匿名化
  identifierHash(SHA-256): abc123...

[redact-log] 完了: 合計 4 エントリを匿名化しました

# ドライラン
[DRY-RUN] /data/logs/audit-2026-06-01.jsonl: 3 エントリを匿名化
  identifierHash(SHA-256): abc123...

[redact-log] 完了: 合計 3 エントリを匿名化しました（ドライランのため変更なし）

# 一致なし
[redact-log] 識別子に一致するエントリが見つかりませんでした: /data/watch/personal_doc.pdf
```

### 終了コード

| コード | 意味 |
|--------|------|
| `0` | 匿名化完了（0件を含む） |
| `1` | 書き込みエラーなどの処理失敗 |
