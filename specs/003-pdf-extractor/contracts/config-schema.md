# Contract: config.json スキーマ（Round 3 更新版）

**Feature**: 003-pdf-extractor | **Date**: 2026-05-17  
**Replaces**: specs/002-ai-classifier-router/contracts/config-schema.md（Round 2 版を継承・拡張）

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
  "apiTimeoutMs": 30000,                       // オプション (5000–120000, default: 30000)

  // ── Round 3: PDF 拡張 ───────────────────────────── NEW
  "watchedExtensions": [".txt", ".md", ".pdf"] // オプション (default: [".txt", ".md"])
                                                // Round 1 互換: 省略時は [".txt", ".md"]
}
```

## watchedExtensions フィールド仕様

| 項目 | 詳細 |
|------|------|
| **型** | `string[]` |
| **必須** | ❌ オプション |
| **デフォルト** | `[".txt", ".md"]` |
| **各要素** | 1 文字以上の文字列（例: `".pdf"`, `".txt"`） |
| **後方互換** | フィールド省略時は Round 1 の動作を維持する |

## Round 3 適用時の最小 config.json 例

```json
{
  "watchDir": "/data/inbox",
  "logFile": "/data/audit.jsonl",
  "reviewDir": "/data/review",
  "routes": {
    "invoice": "/data/invoices",
    "contract": "/data/contracts"
  },
  "watchedExtensions": [".txt", ".md", ".pdf"]
}
```

## 変更なしのフィールド

Round 1 / Round 2 で定義された全フィールドの型・バリデーション・デフォルト値は変更なし。
