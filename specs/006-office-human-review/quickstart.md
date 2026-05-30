# Quickstart: Office 文書対応と人間確認フロー

**Feature**: 006-office-human-review | **Date**: 2026-05-30

---

## 前提条件

- Node.js 20 LTS がインストール済みであること
- Round 1〜5（txt/md/pdf/画像/Office）の実装が完了していること
- `config.json` が設定済みであること

---

## Step 1: 新規パッケージのインストール

```bash
npm install mammoth exceljs jszip
```

| パッケージ | 用途 |
|-----------|------|
| `mammoth` | `.docx` テキスト抽出 |
| `exceljs` | `.xlsx` シート・セル操作 |
| `jszip` | `.pptx` を ZIP として展開し XML 解析 |

---

## Step 2: config.json の更新

`watchedExtensions` に Office 拡張子を追加する。

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
  "watchedExtensions": [
    ".txt", ".md", ".pdf",
    ".png", ".jpg", ".jpeg",
    ".docx", ".xlsx", ".pptx"
  ],
  "maxImageSizeMB": 10
}
```

> **注意**: この変更だけで Office ファイルの自動処理が有効になる。不要な場合は拡張子を追加しない。

---

## Step 3: デーモン起動（監視フォルダの自動処理）

```bash
# ビルドしてから起動
npm run build
node dist/index.js

# または開発時は tsx で直接実行
npx tsx src/index.ts
```

監視フォルダに `.docx` / `.xlsx` / `.pptx` を置くと自動的に処理が開始される。

```
[Logger] 2026-05-30T10:00:00.000Z started  /data/inbox/invoice.docx
[Logger] 2026-05-30T10:00:02.000Z completed /data/inbox/invoice.docx → review (信頼スコア不足)
```

---

## Step 4: review CLI で低信頼度ファイルを確認・承認

低信頼度で `reviewDir` に溜まったファイルを確認・修正・承認する。

```bash
# review CLI を起動
npx tsx src/reviewer/index.ts --config ./config.json

# または ビルド後
node dist/reviewer/index.js --config ./config.json
```

### 操作フロー（1 ファイルの例）

```
==============================
review 待ち: 3 件
==============================

[1/3] invoice.docx
  AI 分類:
    カテゴリ  : 請求書
    タグ      : 請求, 2026年, 5月
    信頼スコア: 0.62
    機密度    : low
    推奨先    : 請求書 → /data/invoices

このまま承認しますか？ [y=承認 / n=修正 / s=スキップ] > y

→ /data/invoices/invoice.docx に移動しました
→ 承認記録を corrections.jsonl に保存しました

------------------------------

[2/3] meeting-notes.xlsx
  AI 分類:
    カテゴリ  : 請求書
    タグ      : 請求
    信頼スコア: 0.55
    機密度    : low
    推奨先    : 請求書 → /data/invoices

このまま承認しますか？ [y=承認 / n=修正 / s=スキップ] > n

カテゴリを入力してください (現在: 請求書): 議事録
タグをカンマ区切りで入力してください (現在: 請求): 会議, 5月
振り分け先を選択してください:
  1. 請求書 → /data/invoices
  2. 契約書 → /data/contracts
  3. 議事録 → /data/minutes
  4. その他 → /data/others
番号を入力してください: 3

→ /data/minutes/meeting-notes.xlsx に移動しました
→ 修正記録を corrections.jsonl に保存しました

------------------------------

[3/3] draft.pptx
  ...

==============================
review 完了: 2 件処理 (承認: 1, 修正: 1)
残り: 1 件（スキップ済み）
==============================
```

---

## Step 5: corrections.jsonl の確認

```bash
# 修正履歴を確認する
cat /data/logs/corrections.jsonl

# または jq で整形表示
cat /data/logs/corrections.jsonl | npx jq .
```

---

## エラーパターンと対処

| 状況 | ログ出力 | 対処 |
|------|---------|------|
| パスワード保護された .docx | `event: 'failed'`, error: "パスワード保護..." | reviewDir に移動済み。手動で復号後に再配置 |
| テキストを含まない .docx | `event: 'skipped'` | 画像・図のみのファイルは AI に送らない設計 |
| 破損した .xlsx | `event: 'failed'` | reviewDir に移動済み。元ファイルの修復が必要 |
| review CLI 中断（Ctrl+C） | — | 未処理ファイルは reviewDir に残る。次回 CLI 起動で継続 |
| .meta.json が見つからない | CLI: 警告表示してスキップ | 対象ファイルを手動で整理するか reviewDir から再移動 |

---

## ディレクトリ構成例（運用後）

```
/data/
├── inbox/           # 監視フォルダ（処理後は空になる）
├── review/          # 低信頼度ファイル一時置き場
│   ├── draft.pptx
│   └── draft.pptx.meta.json
├── logs/
│   ├── audit.jsonl       # すべての処理ログ
│   └── corrections.jsonl # 人間確認ログ
├── invoices/
│   └── invoice-2026-05.docx
├── contracts/
├── minutes/
│   └── meeting-notes.xlsx
└── others/
```
