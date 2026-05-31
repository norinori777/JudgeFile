# JudgeFile

JudgeFile は、監視ディレクトリに置かれたファイルを抽出・分類・振り分けし、監査ログに記録する Node.js CLI デーモンです。

対応形式: `.txt` / `.md` / `.pdf` / 画像（`.png` / `.jpg` / `.jpeg`）/ Office 文書（`.docx` / `.xlsx` / `.csv`）

## 特長

- 監視フォルダに置かれたファイルを自動処理します
- テキスト抽出結果を AI 分類に渡し、ルート先または reviewDir へ移動します
- 監査ログを JSON Lines 形式で出力します
- `.pdf` はテキスト層のある文書を対象に抽出します
- 画像ファイルは OpenAI Vision API による OCR でテキストを抽出します
- `.docx` / `.xlsx` / `.csv` は mammoth / xlsx ライブラリで抽出します
- 「契約書」カテゴリと判定されたファイルは、契約対象・規約期間を追加抽出して `.meta.json` に記録します
- `watchedExtensions` で監視対象拡張子を設定できます

## 要件

- Node.js 20 LTS 以上
- `OPENAI_API_KEY` 環境変数
- 監視対象ディレクトリを含む `config.json`

## インストール

```bash
npm install
```

## 設定

プロジェクトルートに `config.json` を置きます。起動時にこのファイルを読み込み、スキーマ検証を行います。必須項目が不足している場合や JSON が不正な場合は起動できません。

`watchedExtensions` を省略すると `.txt` と `.md` が既定値になります。`.pdf` を処理したい場合は、明示的に追加してください。

```json
{
  "watchDir": "/path/to/inbox",
  "logFile": "/path/to/audit.jsonl",
  "reviewDir": "/path/to/review",
  "routes": {
    "invoice": "/path/to/invoices",
    "contract": "/path/to/contracts"
  },
  "watchedExtensions": [".txt", ".md", ".pdf", ".png", ".jpg", ".jpeg", ".docx", ".xlsx", ".csv"]
}
```

主な設定項目:

- `watchDir`: 監視対象ディレクトリ。存在する絶対パスが必要です
- `logFile`: 監査ログの出力先。親ディレクトリは起動時に作成されます
- `reviewDir`: 低信頼度または失敗時の移動先。起動時に作成されます
- `routes`: 分類カテゴリごとの移動先ディレクトリのマッピングです。起動時に各ディレクトリが作成されます
- `maxConcurrency`: 同時処理数の上限です。既定値は `2` です
- `maxQueueSize`: キューに積める最大件数です。既定値は `100` です
- `maxChars`: 抽出テキストの最大文字数です。既定値は `100000` です
- `confidenceThreshold`: 自動振り分けに使う最低信頼スコアです。既定値は `0.8` です
- `model`: 使用する OpenAI モデル名です。既定値は `gpt-4o-mini` です
- `apiTimeoutMs`: API 呼び出しのタイムアウトです。既定値は `30000` ミリ秒です
- `watchedExtensions`: 監視する拡張子一覧です。既定値は `['.txt', '.md']` です
- `maxImageSizeMB`: 画像ファイルの最大サイズです（MB 単位）。既定値は `10` です
- `contractCategoryLabel`: 契約情報抽出を行うカテゴリラベルです。既定値は `'契約書'` です

最小構成の例:

```json
{
  "watchDir": "/path/to/inbox",
  "logFile": "/path/to/audit.jsonl",
  "reviewDir": "/path/to/review"
}
```

この構成では `routes` は空、`watchedExtensions` は `['.txt', '.md']` が使われます。

## ビルドと起動

```bash
npm run build
node dist/index.js
```

開発中は次のコマンドでも起動できます。

```bash
npm run dev
```

## 動作確認

1. 監視対象ディレクトリにファイルを置きます
2. 監査ログで `event: 'completed'`、`category`、`moveType` を確認します
3. ファイルが `routes[category]` または `reviewDir` に移動したことを確認します

## PDF の扱い

- テキスト層のある PDF は通常の抽出パイプラインに入ります
- スキャン画像のみの PDF は空テキストとして扱われ、AI 分類はスキップされます
- パスワード保護 PDF や破損 PDF は失敗として処理されます

## 画像ファイルの扱い

- `.png` / `.jpg` / `.jpeg` は OpenAI Vision API（base64 インライン）を使って OCR でテキストを抽出します
- `maxImageSizeMB` を超えるファイルは失敗として reviewDir に移動します
- 監査ログに `ocrEngine: 'openai-vision'` が記録されます

## Office 文書の扱い

- `.docx`: `mammoth` で本文テキストを抽出します
- `.xlsx`: `xlsx` ライブラリでシート内のセルテキストを結合します
- `.csv`: UTF-8 で読み込み、各行をテキスト連結します

## 契約情報抽出

- AI 分類カテゴリが `contractCategoryLabel`（デフォルト: `'契約書'`）に一致したファイルに対して、追加の AI 呼び出しを行います
- 抽出される情報: 契約対象（`contractSubject`）・規約期間（`contractPeriod`）
- 結果は振り分け先の `.meta.json` に追記されます
- 抽出に失敗しても振り分けは完了とみなされ、`contractExtractionError` として監査ログに記録されます

## テスト

```bash
npm run test
```

## デバッグ手順

### ブレークポイントを設定する

- デバッグしたい行の左端（行番号の左）をクリックして赤丸を置く
- 例: pdf.ts の `pageText` にブレークポイントを置けばページテキスト抽出の中身を確認できる

### デバッグ実行

1. **`F5`** キーを押す（または左サイドバーの「実行とデバッグ」アイコン）
2. 上部のドロップダウンで構成を選択：
   - **`dev (tsx)`** — `yarn run dev` と同等。メインの起動デバッグ
   - **`現在のファイルをデバッグ (tsx)`** — 開いているファイル単体を実行
   - **`vitest (テスト)`** — テストをデバッグ実行

### デバッグ中の操作

| キー | 動作 |
|------|------|
| `F5` | 続行 |
| `F10` | ステップオーバー（次の行へ） |
| `F11` | ステップイン（関数の中へ） |
| `Shift+F11` | ステップアウト（関数から出る） |
| `F9` | ブレークポイントのトグル |

ブレークポイントで止まった際は、左パネルの「変数」ペインで `pageText`・`textContent` などの値をリアルタイムで確認できます。

## ライセンス

このリポジトリ内のライセンス表記に従ってください。