# Contract: config.json スキーマ（Round 4 更新版）

**Feature**: 005-image-ocr-extractor | **Date**: 2026-05-30  
**Replaces**: specs/003-pdf-extractor/contracts/config-schema.md（Round 3 版を継承・拡張）

---

## config.json 全フィールド定義

```jsonc
{
  // ── Round 1: 基盤 ──────────────────────────────────
  "watchDir": "/absolute/path/to/watch",     // 必須: 監視対象ディレクトリ
  "maxConcurrency": 2,                        // オプション (1–10, default: 2)
  "maxQueueSize": 100,                        // オプション (1–1000, default: 100)
  "logFile": "/absolute/path/to/audit.jsonl", // 必須: 監査ログファイルパス
  "maxChars": 100000,                         // オプション (1000–1000000, default: 100000)

  // ── Round 2: AI 分類・ルーティング ─────────────────
  "reviewDir": "/absolute/path/to/review",    // 必須: 低信頼度ファイルの移動先
  "routes": {                                  // オプション (default: {})
    "invoice": "/absolute/path/to/invoices",
    "contract": "/absolute/path/to/contracts"
  },
  "confidenceThreshold": 0.8,                 // オプション (0.0–1.0, default: 0.8)
  "model": "gpt-4o-mini",                     // オプション (default: "gpt-4o-mini")
  "apiTimeoutMs": 30000,                      // オプション (5000–120000, default: 30000)

  // ── Round 3: PDF 拡張 ──────────────────────────────
  "watchedExtensions": [".txt", ".md"],       // オプション (default: [".txt", ".md"])

  // ── Round 4: 画像 OCR ──────────────────────────── NEW
  "maxImageSizeMB": 10                        // オプション (1–1000, default: 10)
}
```

---

## maxImageSizeMB フィールド仕様

| 項目 | 詳細 |
|------|------|
| **型** | `number`（整数） |
| **必須** | ❌ オプション |
| **デフォルト** | `10`（MB） |
| **範囲** | 1 〜 1000 MB |
| **動作** | 画像ファイルのサイズがこの値（MB）を超えた場合、OCR 処理を行わず `event: 'failed'` として `reviewDir` に移動する |
| **後方互換** | フィールド省略時はデフォルト値 10 MB が適用され、既存 config.json の変更は不要 |

---

## watchedExtensions — 画像 OCR 有効化

画像 OCR 機能を有効にするには `watchedExtensions` に画像拡張子を追加する。追加しない限り画像ファイルは無視される（意図しないアクティベーション防止）。

```jsonc
// 画像 OCR を有効にする場合の例
"watchedExtensions": [".txt", ".md", ".pdf", ".png", ".jpg", ".jpeg"]
```

v1 保証対象: `.png` / `.jpg` / `.jpeg` の 3 種のみ。それ以外の拡張子は利用者の責任で追加可能（サポート対象外）。

---

## Round 4 適用時の最小 config.json 例

```json
{
  "watchDir": "/data/inbox",
  "logFile": "/data/audit.jsonl",
  "reviewDir": "/data/review",
  "routes": {
    "請求書": "/data/invoices",
    "契約書": "/data/contracts"
  },
  "watchedExtensions": [".txt", ".md", ".pdf", ".png", ".jpg", ".jpeg"],
  "maxImageSizeMB": 10
}
```

---

## 変更なしのフィールド

Round 1 / Round 2 / Round 3 で定義されたすべてのフィールドの型・バリデーション・デフォルト値は変更なし。
