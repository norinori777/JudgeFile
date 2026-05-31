# Quickstart: 監査・コンプライアンス強化

**Feature**: 010-audit-compliance

---

## 前提条件

- 既存の JudgeFile セットアップが完了していること（Feature 001–009 が実装済み）
- Node.js 20 以上

---

## セットアップ

### 1. 環境変数を追加する

`.env` ファイルに `AUDIT_HMAC_SECRET` を追記する（32文字以上を推奨）。

```bash
# .env
OPENAI_API_KEY=sk-...
AUDIT_HMAC_SECRET=your-very-long-secret-key-at-least-32-chars
```

未設定のままアプリを起動しようとすると、以下のエラーで起動が拒否される：

```
[JudgeFile] エラー: 環境変数 AUDIT_HMAC_SECRET が未設定または32文字未満です。監査ログの完全性保証のため、32文字以上のシークレットを設定してください。
```

### 2. config.json に logRetention を追加する（任意）

省略するとデフォルト値（保持期間 365日、サイズ上限 10MB）が適用される。

```json
{
  "watchDir": "/data/watch",
  "logFile": "/data/logs/audit.jsonl",
  "logRetention": {
    "retentionDays": 365,
    "maxLogSizeMB": 10
  }
}
```

---

## 動作確認

### アプリ起動

```bash
npm start
```

起動時に `AUDIT_HMAC_SECRET` が検証され、古いログファイルが自動的にクリーンアップされる。

ログディレクトリには日付別ファイルが作成される：

```
/data/logs/
├── audit-2026-06-01.jsonl   ← アクティブ
└── audit-2026-05-31.jsonl   ← 保持中
```

### 完全性検証（改ざん検知）

```bash
npx tsx scripts/verify-log.ts
```

出力例：

```
[PASS] audit-2026-06-01.jsonl: 全12エントリ整合性OK（redactionセグメント: 0）
```

ログを手動で書き換えた後に実行すると：

```
[FAIL] audit-2026-06-01.jsonl: エントリ5（2026-06-01T09:12:34Z）に改ざんを検知
```

### 個人データの消去

```bash
# ドライランで対象件数を確認
npx tsx scripts/redact-log.ts --identifier "/data/watch/target_file.pdf" --dry-run

# 実際に匿名化を実行
npx tsx scripts/redact-log.ts --identifier "/data/watch/target_file.pdf"
```

出力例：

```
[INFO] 対象識別子: /data/watch/target_file.pdf
[INFO] identifierHash: sha256:3f2a...
[INFO] 対象ファイル: audit-2026-05-20.jsonl（2件）
[OK]   計2件を匿名化完了。redaction マーカーを1ファイルに挿入しました。
```

---

## テスト実行

```bash
npm test
```

全テストが合格することを確認する（新規テスト: `tests/audit-compliance.test.ts`）。

---

## 注意事項

- `AUDIT_HMAC_SECRET` を変更すると、変更前のすべてのログに対する完全性検証が失敗する。変更が必要な場合は、変更前後のログを別ディレクトリに分けて管理すること
- ログディレクトリへの書き込み権限がない場合、起動時にエラーが発生する
- `retentionDays: 0` を設定すると自動削除が無効化される（意図的な長期保持に利用可）
