# Contract: config.json スキーマ（Round 5 確認版）

**Feature**: 006-office-human-review | **Date**: 2026-05-30
**Replaces**: specs/005-image-ocr-extractor/contracts/config-schema.md（Round 4 版を継承）

---

## Round 5 での変更点

**config.json に追加フィールドなし。**

Office 抽出（FR-001〜FR-009）および review CLI（FR-010〜FR-014）に必要な設定は、すべて既存フィールドで賄える。

| 用途 | 使用する既存フィールド |
|------|----------------------|
| Office ファイルの監視有効化 | `watchedExtensions` に `.docx`/`.xlsx`/`.pptx` を追加 |
| review フォルダ | `reviewDir`（既存） |
| corrections.jsonl の保存先 | `path.dirname(config.logFile)` から導出（コード内） |
| review CLI の振り分け先 | `config.routes`（既存） |

---

## config.json 全フィールド定義（Round 5 時点）

```jsonc
{
  // ── Round 1: 基盤 ──────────────────────────────────
  "watchDir": "/absolute/path/to/watch",      // 必須: 監視対象ディレクトリ
  "maxConcurrency": 2,                         // オプション (1–10, default: 2)
  "maxQueueSize": 100,                         // オプション (1–1000, default: 100)
  "logFile": "/absolute/path/to/audit.jsonl",  // 必須: 監査ログファイルパス
                                               //   └─ dirname が corrections.jsonl の保存先にもなる
  "maxChars": 100000,                          // オプション (1000–1000000, default: 100000)

  // ── Round 2: AI 分類・ルーティング ─────────────────
  "reviewDir": "/absolute/path/to/review",     // 必須: 低信頼度ファイルの移動先
                                               //   └─ review CLI の処理対象フォルダでもある
  "routes": {                                   // オプション (default: {})
    "請求書": "/absolute/path/to/invoices",
    "契約書": "/absolute/path/to/contracts",
    "その他": "/absolute/path/to/others"
  },
  "confidenceThreshold": 0.8,                  // オプション (0.0–1.0, default: 0.8)
  "model": "gpt-4o-mini",                      // オプション (default: "gpt-4o-mini")
  "apiTimeoutMs": 30000,                        // オプション (5000–120000, default: 30000)

  // ── Round 3: PDF 拡張 ──────────────────────────────
  "watchedExtensions": [".txt", ".md"],         // オプション (default: [".txt", ".md"])

  // ── Round 4: 画像 OCR ──────────────────────────────
  "maxImageSizeMB": 10                          // オプション (1–1000, default: 10)

  // ── Round 5: Office 文書対応 ─────────────────────── 変更なし
  // watchedExtensions に .docx / .xlsx / .pptx を追加するだけで有効化
}
```

---

## watchedExtensions — Office 文書有効化

Office 抽出機能を有効にするには `watchedExtensions` に Office 拡張子を追加する。追加しない限り Office ファイルは無視される（意図しないアクティベーション防止 — FR-001）。

```jsonc
// Office 文書対応を有効にする場合の例
"watchedExtensions": [".txt", ".md", ".pdf", ".png", ".jpg", ".jpeg", ".docx", ".xlsx", ".pptx"]
```

v1 保証対象: `.docx` / `.xlsx` / `.pptx` の 3 種のみ。レガシー形式（`.doc` / `.xls` / `.ppt`）は v1 非対応。

---

## review CLI 実行時の設定参照

`review` コマンドは同じ `config.json` を読み込む。CLI が参照するフィールド:

| フィールド | CLI での用途 |
|-----------|------------|
| `reviewDir` | 処理対象フォルダ（`.meta.json` があるファイルを列挙） |
| `routes` | オペレーター入力時の振り分け先候補の表示と検証 |
| `logFile` | `dirname(logFile)/corrections.jsonl` の導出 |

---

## Round 5 適用時の最小 config.json 例

```json
{
  "watchDir": "/data/inbox",
  "logFile": "/data/logs/audit.jsonl",
  "reviewDir": "/data/review",
  "routes": {
    "請求書": "/data/invoices",
    "契約書": "/data/contracts",
    "議事録": "/data/minutes",
    "その他": "/data/others"
  },
  "watchedExtensions": [".txt", ".md", ".pdf", ".png", ".jpg", ".jpeg", ".docx", ".xlsx", ".pptx"],
  "maxImageSizeMB": 10
}
```

corrections.jsonl は自動的に `/data/logs/corrections.jsonl` に保存される（`logFile` の dirname から導出）。
