# Audit Log Schema Contract: 監査・コンプライアンス強化

**Feature**: 010-audit-compliance

---

## JSON Lines 形式のログエントリスキーマ

Feature 010 以降の監査ログには `prevHash` / `currHash` フィールドが追加される。

### 通常エントリ（完全性保証あり）

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "event": "completed",
  "filePath": "/data/watch/sample.pdf",
  "timestamp": "2026-06-01T09:00:00.000Z",
  "category": "契約書",
  "tags": ["自動処理"],
  "destination": "/data/contracts",
  "moveType": "auto",
  "confidence": 0.95,
  "prevHash": "genesis",
  "currHash": "a1b2c3d4e5f6..."
}
```

### redaction マーカーエントリ

消去要求実施後に挿入されるエントリ。このエントリを境にチェーンリセット。

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440001",
  "event": "redaction",
  "filePath": "[REDACTED]",
  "timestamp": "2026-06-01T12:00:00.000Z",
  "redactedIdentifierHash": "sha256hex...",
  "redactedCount": 3,
  "redactedAt": "2026-06-01T12:00:00.000Z",
  "prevHash": "前エントリのcurrHash",
  "currHash": "このエントリのHMAC"
}
```

### フィールド定義

| フィールド | 型 | 必須 | 説明 |
|-----------|-----|------|------|
| `id` | `string` | ✅ | `crypto.randomUUID()` による UUID v4エントリ一意識別子 |
| `event` | `string` | ✅ | イベント種別: `started` / `completed` / `failed` / `rejected` / `skipped` / `redaction` |
| `filePath` | `string` | ✅ | 対象ファイルパス（`redaction` 時は `'[REDACTED]'`） |
| `timestamp` | `string` | ✅ | ISO 8601 形式の処理日時 |
| `prevHash` | `string` | ✅ | 前エントリの `currHash`。最初は `'genesis'`。`redaction` 後もチェーンを継続 |
| `currHash` | `string` | ✅ | `HMAC-SHA256(JSON.stringify({...entry, prevHash}), AUDIT_HMAC_SECRET)`、hex 64文字 |
| `redactedIdentifierHash` | `string` | `redaction` 時のみ | `SHA-256(元の識別子)` の hex 文字列 |
| `redactedCount` | `integer` | `redaction` 時のみ | 匿名化したエントリ数 |
| `redactedAt` | `string` | `redaction` 時のみ | 消去要求実施日時（ISO 8601） |

### チェーン検証ルール

1. `prevHash = 'genesis'` のエントリがチェーン開始点
2. `redaction` エントリを検出した場合、そのエントリの `currHash` を次のチェーンの起点とする（リセット）
3. 各エントリで `currHash` を再計算し、記録値と一致しない場合は改ざんとして報告
4. `prevHash` が前エントリの `currHash` と一致しない場合も改ざんとして報告

### レガシーログとの互換性

- `prevHash` / `currHash` を持たないエントリ（Feature 010 以前のログ）は「レガシーエントリ」として扱い、完全性検証をスキップする
- 検証 CLI は警告として表示するが終了コード 0（正常）を返す
