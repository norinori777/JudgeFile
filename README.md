# JudgeFile

JudgeFile は、監視ディレクトリに置かれた `.txt` / `.md` / `.pdf` ファイルを抽出・分類・振り分けし、監査ログに記録する Node.js CLI デーモンです。

## 特長

- 監視フォルダに置かれたファイルを自動処理します
- テキスト抽出結果を AI 分類に渡し、ルート先または reviewDir へ移動します
- 監査ログを JSON Lines 形式で出力します
- `.pdf` はテキスト層のある文書を対象に抽出します
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

プロジェクトルートに `config.json` を置きます。`watchedExtensions` を省略すると `.txt` と `.md` が既定値になります。

```json
{
  "watchDir": "/path/to/inbox",
  "logFile": "/path/to/audit.jsonl",
  "reviewDir": "/path/to/review",
  "routes": {
    "invoice": "/path/to/invoices",
    "contract": "/path/to/contracts"
  },
  "watchedExtensions": [".txt", ".md", ".pdf"]
}
```

主な設定項目:

- `watchDir`: 監視対象ディレクトリ
- `logFile`: 監査ログの出力先
- `reviewDir`: 低信頼度または失敗時の移動先
- `routes`: 分類カテゴリごとの移動先
- `watchedExtensions`: 監視する拡張子一覧

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

## テスト

```bash
npm run test
```

## ライセンス

このリポジトリ内のライセンス表記に従ってください。