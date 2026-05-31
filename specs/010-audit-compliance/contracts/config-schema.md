# Config Schema Contract: 監査・コンプライアンス強化

**Feature**: 010-audit-compliance

---

## config.json への追加フィールド

Feature 010 では既存の `config.json` に `logRetention` オブジェクトを追加する。

### スキーマ定義（Zod 準拠）

```typescript
logRetention: {
  retentionDays: number; // 整数, min: 0, default: 365
  maxLogSizeMB: number;  // 整数, min: 1, max: 1000, default: 10
}
```

### サンプル設定

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

### フィールド詳細

| フィールド | 型 | 必須 | デフォルト | 制約 | 説明 |
|-----------|-----|-----|-----------|------|------|
| `logRetention` | `object` | No | `{ retentionDays: 365, maxLogSizeMB: 10 }` | — | ログ保持・ローテーション設定 |
| `logRetention.retentionDays` | `integer` | No | `365` | `≥ 0` | ログファイル保持日数。`0` = 削除しない |
| `logRetention.maxLogSizeMB` | `integer` | No | `10` | `1–1000` | ファイルサイズ上限（MB）。超過でローテーション |

### バリデーションエラー例

```json
// retentionDays に負の値を設定した場合
{ "logRetention": { "retentionDays": -1 } }
// → Zod エラー: "retentionDays must be >= 0"

// maxLogSizeMB に上限超過値を設定した場合
{ "logRetention": { "maxLogSizeMB": 9999 } }
// → Zod エラー: "maxLogSizeMB must be <= 1000"
```

---

## 環境変数

| 変数名 | 必須 | 説明 |
|--------|------|------|
| `AUDIT_HMAC_SECRET` | **必須** | 監査ログ HMAC-SHA256 の署名キー。**32文字以上必須**（未満・未設定の場合はアプリ起動を拒否） |
