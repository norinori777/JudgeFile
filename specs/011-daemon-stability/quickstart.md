# Quickstart: デーモン安定性・信頼性強化

**Feature**: 011-daemon-stability  
**Date**: 2026-06-01

---

## 前提条件

- Node.js 20 以上
- `yarn` または `npm`
- 既存の `config.json` と `.env`（Feature 010 以降のセットアップ済み環境）

---

## 新規設定項目（config.json）

Feature 011 で追加されるオプション設定を `config.json` に追記する：

```json
{
  "watchDir": "/path/to/watch",
  "logFile": "/path/to/logs/audit.jsonl",
  "reviewDir": "/path/to/review",

  // Feature 011 追加設定 ↓

  // US1: seenKeys 上限（デフォルト: 10000、変更は任意）
  "seenKeysMaxSize": 10000,

  // US2: グレースフル停止タイムアウト（ミリ秒、デフォルト: 30000）
  "gracefulShutdownTimeoutMs": 30000,

  // US5: ヘルスチェックサーバー（オプション。省略時は起動しない）
  "healthCheck": {
    "port": 8080
  },

  // US6: corrections.jsonl のパス（オプション。省略時は logFile と同ディレクトリ）
  "correctionsFile": "/path/to/logs/corrections.jsonl"
}
```

> `seenKeysMaxSize` と `gracefulShutdownTimeoutMs` はデフォルト値があるため省略可能。

---

## デーモン起動

```bash
# 開発環境（tsx + .env 自動読み込み）
yarn dev

# または直接実行
tsx --env-file=.env src/index.ts
```

**起動時のログ例（ヘルスチェック有効時）**:
```
[JudgeFile] 起動しました。監視ディレクトリ: /path/to/watch
[JudgeFile] ヘルスチェックサーバー起動: http://localhost:8080/health
```

---

## ヘルスチェックの確認

```bash
# デーモン稼働中
curl http://localhost:8080/health
# → {"status":"ok","queueSize":0,"uptimeMs":120}

# シャットダウン中（SIGTERM 送信後）
curl http://localhost:8080/health
# → HTTP 503 {"status":"shutting_down","queueSize":2,"uptimeMs":121}
```

---

## グレースフル停止

```bash
# PID を確認して SIGTERM を送信
kill -TERM <PID>

# または Ctrl+C（SIGINT）
^C
```

**停止時のログ例**:
```
[JudgeFile] グレースフル停止を開始します...
[JudgeFile] 停止しました。
```

**タイムアウト時のログ例**:
```
[JudgeFile] グレースフル停止を開始します...
[JudgeFile] タイムアウト (30000ms)。残存ジョブを reviewDir に移動します。
[JudgeFile] 停止しました。
```

タイムアウトした場合、処理中断ファイルは `reviewDir` に移動し `event: 'stopped'` が監査ログに記録される。

---

## corrections.jsonl の HMAC 保護確認

### HMAC 有効時（`.env` に `AUDIT_HMAC_SECRET` を設定）

```bash
# レビュー CLI を実行して承認
tsx src/reviewer/index.ts --config ./config.json

# corrections.jsonl の内容確認
cat /path/to/logs/corrections.jsonl
# → {"fileName":"report.pdf",...,"prevHash":"genesis","currHash":"a3f2b..."}
```

### HMAC 検証

```bash
tsx src/verify-log.ts --file /path/to/logs/corrections.jsonl
# → ✅ 検証成功: 5 エントリ、違反 0 件
```

### HMAC 未設定時の警告

```bash
# .env に AUDIT_HMAC_SECRET が未設定の場合
tsx src/reviewer/index.ts --config ./config.json
# stderr → [Review] AUDIT_HMAC_SECRET が未設定のため corrections.jsonl の HMAC 保護がスキップされます。
```

---

## seen-keys.jsonl の確認

```bash
# ログディレクトリ内に自動生成される
cat /path/to/logs/seen-keys.jsonl
# report.pdf:204800:1748736000000
# contract.docx:51200:1748736001000
```

---

## トラブルシューティング

| 症状 | 原因 | 対処 |
|------|------|------|
| `ヘルスチェックポート 8080 が使用中です` | 他プロセスがポートを使用 | `config.json` の `healthCheck.port` を変更するか、競合プロセスを停止する |
| デーモン再起動後に重複処理が発生する | `seen-keys.jsonl` が削除または破損 | ファイルを削除して空状態から起動（警告ログが出るが正常） |
| `corrections.jsonl: 検証エラー` | ファイルが改ざんされている | バックアップから復元するか、調査のため `verify-log.ts` の出力を確認する |
