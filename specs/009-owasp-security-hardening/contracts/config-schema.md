# Config Schema Contract: OWASPセキュリティ強化

**Feature**: 009-owasp-security-hardening
**Date**: 2026-06-01

---

## 変更概要

`config.json` に以下の2フィールドを追加する。既存フィールドに変更はない。

---

## 新規フィールド: `sensitiveFields`

### 定義

```jsonc
{
  "sensitiveFields": ["contractSubject", "contractPeriod"]
}
```

| 項目 | 内容 |
|------|------|
| 型 | `string[]` |
| デフォルト値 | `["contractSubject", "contractPeriod"]` |
| 必須 | いいえ（省略時はデフォルト値が適用される） |
| 説明 | 監査ログ書き込み時にマスク（`[REDACTED]` に置換）するフィールド名のリスト |

### 制約

- リストは空でもよい（`[]` の場合マスクなし）
- フィールド名は `AuditLogEntry` の既存フィールドと一致するものだけが有効（不一致は無視）
- マスク文字列は固定値 `[REDACTED]`（設定変更不可）

### 適用対象

監査ログ（`logFile` に書き込まれる JSON Lines）の全エントリに適用される。

---

## 新規フィールド: `maxFileSizeMB`

### 定義

```jsonc
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

| 項目 | 内容 |
|------|------|
| 型 | `Record<string, number>`（キー: 拡張子または `"default"`） |
| デフォルト値 | `{ "default": 50 }` |
| 必須 | いいえ（省略時はデフォルトオブジェクトが適用される） |
| 説明 | ファイルタイプ別のサイズ上限（MB単位）。タイプ別設定がない場合は `default` を使用 |

### 制約

- `default` キーは必ず存在する（Zod スキーマでデフォルト値を保証）
- 各値は 1〜1000（整数）
- 拡張子キーはドットを含む形式（例：`.txt`、`.pdf`）
- 上限を超えたファイルは処理スキップし `reviewDir` へ移動する

### 適用タイミング

キューからジョブを取り出した直後（`extract()` 呼び出し前）に検証される。

---

## 完全な config.json サンプル（差分のみ）

```jsonc
{
  // ... 既存フィールド省略 ...

  // ── Round 9: OWASPセキュリティ強化 ──
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

## Backward Compatibility

- 両フィールドともオプショナルで、既存の `config.json` を変更しなくてもデフォルト値で動作する
- 既存のテストは設定変更なしで引き続き合格する
