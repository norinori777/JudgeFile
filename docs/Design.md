# JudgeFile — 実装設計書

> 最終更新: 2026-05-29  
> 対象ブランチ: `005-image-ocr-extractor`（feature `001`〜`005` 実装済み）

---

## 目次

- [JudgeFile — 実装設計書](#judgefile--実装設計書)
  - [目次](#目次)
  - [1. システム概要](#1-システム概要)
  - [2. 技術スタック](#2-技術スタック)
  - [3. ディレクトリ構成](#3-ディレクトリ構成)
  - [4. 設定ファイル（config.json）](#4-設定ファイルconfigjson)
    - [注意事項](#注意事項)
  - [5. アーキテクチャ概観](#5-アーキテクチャ概観)
  - [6. モジュール詳細](#6-モジュール詳細)
    - [6.1 エントリポイント — src/index.ts](#61-エントリポイント--srcindexts)
    - [6.2 設定 — src/config/](#62-設定--srcconfig)
      - [src/config/schema.ts](#srcconfigschemats)
      - [src/config/loader.ts](#srcconfigloaderts)
    - [6.3 ファイル監視 — src/watcher/](#63-ファイル監視--srcwatcher)
    - [6.4 キュー — src/queue/](#64-キュー--srcqueue)
    - [6.5 テキスト抽出 — src/extractor/](#65-テキスト抽出--srcextractor)
      - [src/extractor/index.ts（ディスパッチャ）](#srcextractorindextsディスパッチャ)
      - [src/extractor/txt.ts / md.ts](#srcextractortxtts--mdts)
      - [src/extractor/pdf.ts](#srcextractorpdfts)
      - [src/extractor/image.ts（Round 4 新規）](#srcextractorimagetsround-4-新規)
    - [6.6 AI 分類 — src/classifier/](#66-ai-分類--srcclassifier)
      - [src/classifier/schema.ts](#srcclassifierschemats)
      - [src/classifier/index.ts](#srcclassifierindexts)
    - [6.7 ルーティング — src/router/](#67-ルーティング--srcrouter)
      - [export 関数一覧](#export-関数一覧)
      - [ルーティング判定（3 分岐）](#ルーティング判定3-分岐)
    - [6.8 ロガー — src/logger/](#68-ロガー--srclogger)
    - [6.9 型定義 — src/types/](#69-型定義--srctypes)
  - [7. データフロー](#7-データフロー)
  - [8. ルーティングロジック詳細](#8-ルーティングロジック詳細)
  - [9. 監査ログ仕様](#9-監査ログ仕様)
    - [イベント種別](#イベント種別)
    - [ログ例（completed）](#ログ例completed)
  - [10. エラーハンドリング方針](#10-エラーハンドリング方針)
  - [11. 開発・運用コマンド](#11-開発運用コマンド)
  - [12. 改修ガイド](#12-改修ガイド)
    - [新しいファイル形式に対応する](#新しいファイル形式に対応する)
    - [振り分け先カテゴリを追加する](#振り分け先カテゴリを追加する)
    - [ルーティングロジックを変更する](#ルーティングロジックを変更する)
    - [AI モデルを変更する](#ai-モデルを変更する)
    - [信頼スコアの閾値を調整する](#信頼スコアの閾値を調整する)
    - [監査ログのフィールドを追加する](#監査ログのフィールドを追加する)

---

## 1. システム概要

JudgeFile は **ファイルを監視し、内容を AI で分類して自動的に振り分ける Node.js デーモン**です。

| フェーズ | 処理内容 |
|--------|---------|
| 監視   | 指定フォルダに新規ファイルが追加されるのを検知 |
| 抽出   | ファイル形式（.txt / .md / .pdf）に応じてテキストを抽出 |
| 分類   | OpenAI API でテキストをカテゴリ分類 |
| 振り分け | 分類結果と信頼スコアに基づいてファイルを移動 |
| ログ   | すべての処理結果を JSON Lines 形式の監査ログに記録 |

---

## 2. 技術スタック

| 項目 | バージョン | 用途 |
|------|-----------|------|
| Node.js | 20 LTS | ランタイム |
| TypeScript | ^5.5 | 言語（`target: ES2022`, `module: Node16`） |
| `chokidar` | ^3.6 | ファイルシステム監視 |
| `p-queue` | ^8.0 | 非同期タスクキュー（並列度制御） |
| `zod` | ^3.23 | 設定ファイルのスキーマ検証 |
| `openai` | ^6.38 | OpenAI API クライアント |
| `pdfjs-dist` | ^5.7 | PDF テキスト抽出 |
| `dotenv` | ^17 | `.env` ファイルの読み込み |
| `tsx` | ^4 | 開発時の TypeScript 直接実行 |
| `vitest` | ^2 | テストフレームワーク |

**モジュール形式**: `"type": "module"` — すべて ESM。インポートパスには `.js` 拡張子が必要。

---

## 3. ディレクトリ構成

```
judgeFileSdd/
├── config.json           # 実行時設定（要編集）
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── .env                  # OPENAI_API_KEY を記載（gitignore 対象）
│
├── src/
│   ├── index.ts          # エントリポイント
│   ├── types/
│   │   └── index.ts      # 全モジュール共通の型定義
│   ├── config/
│   │   ├── schema.ts     # Zod スキーマ定義
│   │   └── loader.ts     # config.json の読み込み・検証
│   ├── watcher/
│   │   └── index.ts      # chokidar によるファイル監視
│   ├── queue/
│   │   └── index.ts      # p-queue ラッパー・ジョブオーケストレーション
│   ├── extractor/
│   │   ├── index.ts      # 拡張子ディスパッチャ
│   │   ├── txt.ts        # .txt 抽出
│   │   ├── md.ts         # .md 抽出
│   │   └── pdf.ts        # .pdf 抽出（pdfjs-dist v5）
│   ├── classifier/
│   │   ├── index.ts      # OpenAI API 呼び出し
│   │   └── schema.ts     # 分類結果スキーマ・プロンプト生成
│   ├── router/
│   │   └── index.ts      # ルーティングロジック・ファイル移動
│   └── logger/
│       └── index.ts      # JSON Lines 監査ログ書き込み
│
├── tests/
│   ├── config-schema.test.ts
│   └── route-fallback.test.ts
│
└── docs/
    ├── PreConstitution.md
    ├── PreDesign.md
    └── Design.md          # ← 本ファイル
```

---

## 4. 設定ファイル（config.json）

プロジェクトルートの `config.json` を直接編集して動作をカスタマイズします。

```jsonc
{
  "watchDir": "C:\\path\\to\\watch",          // 必須: 監視対象フォルダ（絶対パス）
  "logFile": "C:\\path\\to\\log\\audit.json", // 必須: 監査ログファイルパス（絶対パス）
  "reviewDir": "C:\\path\\to\\review",        // 必須: 低信頼・エラーファイルの移動先

  "watchedExtensions": [".txt", ".md", ".pdf"], // 監視する拡張子（デフォルト: [".txt", ".md"]）

  // カテゴリ名 → 移動先フォルダのマッピング（フラットな文字列）
  // キー「その他」は特殊: routes に一致しない場合のフォールバック先として機能する
  "routes": {
    "スケジュール": "C:\\path\\to\\schedule",
    "アイデア":     "C:\\path\\to\\ideas",
    "日記":         "C:\\path\\to\\diary",
    "法律":         "C:\\path\\to\\law",
    "その他":       "C:\\path\\to\\others"
  },

  // オプション（以下はすべてデフォルト値）
  "confidenceThreshold": 0.8,  // 自動振り分けに必要な最低信頼スコア（0.0〜1.0）
  "model": "gpt-4o-mini",      // OpenAI モデル名
  "apiTimeoutMs": 30000,       // API タイムアウト（ミリ秒）
  "maxConcurrency": 2,         // 同時処理数
  "maxQueueSize": 100,         // キュー最大サイズ
  "maxChars": 100000           // AI に送るテキストの最大文字数
}
```

### 注意事項

- `routes` の値は **パス文字列のみ**（ネストされたオブジェクト不可）
- `"その他"` キーは **フォールバック専用の予約キー** — このキーの値が指定されていると、他のカテゴリに一致しないファイルの受け皿になる
- 環境変数 `OPENAI_API_KEY` は `.env` ファイルまたは OS 環境変数で設定する（`config.json` には書かない）

---

## 5. アーキテクチャ概観

```
┌─────────────────────────────────────────────────────────────────┐
│  src/index.ts  (エントリポイント)                                │
│  ・config 読み込み  ・ディレクトリ作成  ・logger 初期化           │
│  ・Queue 生成  ・Watcher 起動  ・SIGINT/SIGTERM ハンドラ登録     │
└──────────────────────┬──────────────────────────────────────────┘
                       │
           ┌───────────▼────────────┐
           │     Watcher            │  chokidar で watchDir を監視
           │  src/watcher/index.ts  │  ・depth:0（トップレベルのみ）
           │                        │  ・重複ファイル検知（name+size+mtime）
           └───────────┬────────────┘  ・バックプレッシャー制御
                       │ filePath
           ┌───────────▼────────────┐
           │     Queue              │  p-queue ラッパー
           │  src/queue/index.ts    │  ・並列度 = config.maxConcurrency
           │                        │  ・監査ログ記録（started/completed/failed/skipped）
           └──────┬────────┬────────┘
                  │        │ エラー時
         ┌────────▼──┐  ┌──▼──────────┐
         │ Extractor │  │  reviewDir  │
         └────────┬──┘  └─────────────┘
                  │text
         ┌────────▼──────────┐
         │    Classifier     │  OpenAI API 呼び出し
         │ src/classifier/   │  ・buildSystemPrompt(routeCategories) でプロンプト動的生成
         └────────┬──────────┘
                  │ClassificationResult
         ┌────────▼──────────┐
         │     Router        │  3 分岐ルーティングロジック
         │  src/router/      │  auto / fallback-auto / review
         └────────┬──────────┘
                  │ ファイル移動
          ┌───────▼────────────┐
          │  Logger            │  JSON Lines 形式で audit.json に追記
          │  src/logger/       │
          └────────────────────┘
```

---

## 6. モジュール詳細

### 6.1 エントリポイント — src/index.ts

**役割**: アプリケーション全体の起動・シャットダウン管理

**起動フロー**:
1. `.env` を読み込み（`dotenv/config`）
2. `OPENAI_API_KEY` の存在チェック（未設定の場合 `process.exit(1)`）
3. `config.json` を読み込み・検証（`loadConfig`）
4. 必要なディレクトリを一括作成（`reviewDir`、各 `routes` 値、`logFile` の親ディレクトリ）
5. `initLogger` でロガー初期化
6. `Queue` インスタンス作成
7. `startWatcher` でファイル監視開始
8. `SIGINT` / `SIGTERM` でグレースフルシャットダウン

---

### 6.2 設定 — src/config/

#### src/config/schema.ts

Zod スキーマ `ConfigSchema` と推論型 `Config` を定義。すべてのフィールドにデフォルト値が設定されており、`safeParse` で検証する。

| フィールド | 型 | デフォルト |
|-----------|-----|-----------|
| `watchDir` | `string` | （必須） |
| `logFile` | `string` | （必須） |
| `reviewDir` | `string` | （必須） |
| `routes` | `Record<string, string>` | `{}` |
| `watchedExtensions` | `string[]` | `['.txt', '.md']` |
| `confidenceThreshold` | `number` (0〜1) | `0.8` |
| `model` | `string` | `'gpt-4o-mini'` |
| `apiTimeoutMs` | `number` (5000〜120000) | `30000` |
| `maxConcurrency` | `number` (1〜10) | `2` |
| `maxQueueSize` | `number` (1〜1000) | `100` |
| `maxChars` | `number` (1000〜1000000) | `100000` |

#### src/config/loader.ts

`loadConfig(configPath: string): Promise<Config>` を export。

1. JSON ファイル読み込み
2. JSON.parse
3. `ConfigSchema.safeParse` で検証（失敗時 `process.exit(1)`）
4. `watchDir` の存在確認
5. `logFile` の親ディレクトリを作成して `Config` を返す

---

### 6.3 ファイル監視 — src/watcher/

`startWatcher(config, queue): FSWatcher` を export。

**動作仕様**:
- `chokidar.watch(config.watchDir, { depth: 0, ignoreInitial: true })` でトップレベルのみ監視
- `watchedExtensions` に含まれる拡張子のみ対象（大文字・小文字は小文字に正規化）
- **重複検知**: `name:size:mtime` キーを `Set<string>` で管理、重複ファイルは `skipped` ログを記録してスキップ
- **バックプレッシャー**: `queue.size >= maxQueueSize` になったとき `watcher.unwatch` → `onEmpty()` 待機 → `watcher.add` で再開

---

### 6.4 キュー — src/queue/

`Queue` クラスを export。`p-queue` の薄いラッパー。

```typescript
class Queue {
  get size(): number           // 未処理件数
  onEmpty(): Promise<void>     // キューが空になるまで待機
  onIdle(): Promise<void>      // すべての処理完了まで待機（シャットダウン用）
  enqueue(filePath: string): void  // ジョブを追加
}
```

**`enqueue` 処理フロー**:

```
started ログ記録
    ↓
extract(filePath, config)
    ↓ text が空
skipped ログ記録 → return
    ↓ text あり
classify(text, config)
    ↓
route(filePath, classification, config)
    ↓
completed ログ記録
```

**エラー時**: `reviewDir` にファイルを移動して `failed` ログを記録し、例外を**飲み込む**（次のジョブを継続）。

---

### 6.5 テキスト抽出 — src/extractor/

#### src/extractor/index.ts（ディスパッチャ）

```typescript
extract(filePath, config): Promise<ExtractedText>
```

拡張子で振り分け：
- `.txt` → `extractTxt`
- `.md` → `extractMd`
- `.pdf` → `extractPdf`
- `.png` / `.jpg` / `.jpeg` → `extractImage`（Round 4 追加）
- その他 → `throw new Error('サポートされていない拡張子です')`

#### src/extractor/txt.ts / md.ts

UTF-8 でファイルを読み込み、`TextDecoder` の `fatal: true` で不正バイト列を検知。

- 3 行以上の連続改行を 2 行に正規化
- `config.maxChars` を超える場合は先頭で切り捨て、`truncationWarning` を付与

#### src/extractor/pdf.ts

`pdfjs-dist` v5 を使用。**v5 固有の注意点**:

```typescript
// GlobalWorkerOptions.workerSrc に実際の file:// URL が必要（空文字列は NG）
const _require = createRequire(import.meta.url);
const _workerPath = _require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs');
GlobalWorkerOptions.workerSrc = pathToFileURL(_workerPath).href;
```

全ページのテキストレイヤーを抽出し `\n\n` で結合。`maxChars` 超過時は切り捨て。

#### src/extractor/image.ts（Round 4 新規）

**`extractImage(filePath, config): Promise<ExtractedText>`**

OpenAI Vision API（base64 インライン）を使って画像ファイルから OCR でテキストを抽出する。新規 npm パッケージは不要。

**処理フロー**:
1. `fs.stat()` でファイルサイズを確認— `maxImageSizeMB` 超過時は `Error` を throw（FR-006）
2. `fs.readFile()` で読み込み base64 変換し `data:{mime};base64,{data}` URLを構築
3. `chat.completions.create` で Vision API を呼び出し（OCR 専用固定プロンプト）
4. `trim().replace(/\n{3,}/g, '\n\n')` で正規化（FR-002）
5. `maxChars` 超過時は切り捨て `truncationWarning` を付与（FR-003）
6. `ocrEngine: 'openai-vision'` を付与して `ExtractedText` を返す（FR-011）

**エラー伝搭**: すべての例外は throw して Queue 層に委ねる（FR-007）。テキスト本文はこの関数外でログに書き出さない（FR-008）。

**対応 MIME**: `.png` → `image/png`、`.jpg` / `.jpeg` → `image/jpeg`

**返却型**: `ExtractedText`

```typescript
interface ExtractedText {
  filePath: string;
  text: string;           // メモリ内のみ（ログ書き出し禁止）
  charCount: number;
  truncationWarning?: string;
  ocrEngine?: string;     // 'openai-vision' | undefined
}
```

---

### 6.6 AI 分類 — src/classifier/

#### src/classifier/schema.ts

**`buildSystemPrompt(routeCategories: string[]): string`**

`config.routes` のキー一覧を受け取り、プロンプトに動的注入する。

- `routeCategories` が空 → カテゴリ一覧セクションなし（従来相当）
- 非空 → 末尾に「振り分け先カテゴリ一覧」セクションを追加し、AI が設定済みカテゴリを優先選択するよう誘導

**`ClassificationResultSchema`** (Zod)

AI が返す JSON オブジェクトの検証スキーマ。

```typescript
{
  category:        string      // 書類の主カテゴリ
  tags:            string[]    // 関連タグ
  summary:         string      // 100文字以内の要約
  confidentiality: 'low' | 'medium' | 'high'
  confidence:      number      // 0.0〜1.0
  destination:     string      // 推奨振り分け先カテゴリ名
}
```

#### src/classifier/index.ts

**`classify(text: string, config: Config): Promise<ClassificationResult>`**

1. `buildSystemPrompt(Object.keys(config.routes))` でプロンプト生成
2. `client.chat.completions.create` で API 呼び出し（`response_format: json_object`）
3. JSON.parse → `ClassificationResultSchema.safeParse` でスキーマ検証
4. タイムアウト・レートリミット・API エラーを個別メッセージに変換して throw

---

### 6.7 ルーティング — src/router/

#### export 関数一覧

| 関数 | 説明 |
|------|------|
| `route(filePath, classification, config)` | 3 分岐ルーティング判定 + ファイル移動 |
| `moveFile(src, dest)` | ファイル移動（EXDEV の場合はコピー+削除） |
| `resolveDestination(filePath, destDir)` | 移動先パス解決（同名ファイル存在時はタイムスタンプ付き名前） |

#### ルーティング判定（3 分岐）

詳細は [セクション 8](#8-ルーティングロジック詳細) を参照。

**定数**: `FALLBACK_ROUTE_KEY = 'その他'`（モジュールプライベート）

---

### 6.8 ロガー — src/logger/

**`initLogger(filePath: string): void`** — ログファイルパスを設定（起動時 1 回呼び出し）

**`writeLog(entry: AuditLogEntry): void`** — `appendFileSync` で JSON Lines 形式（1 エントリ = 1 行 JSON）を追記

> 同期書き込みを使用しているため、プロセスクラッシュ直前のログも確実に記録される。

---

### 6.9 型定義 — src/types/

すべてのモジュールが共通で使う型を集約。

```typescript
// ジョブ状態
type JobStatus = 'waiting' | 'processing' | 'done' | 'failed';

// テキスト抽出結果（text はログ禁止）
interface ExtractedText { filePath, text, charCount, truncationWarning? }

// AI 分類結果
interface ClassificationResult { category, tags, summary, confidentiality, confidence, destination }

// 移動種別
type MoveType = 'auto' | 'review' | 'error';

// ルーティング決定
interface RouteDecision { moveType, destDir, reason? }

// 監査ログエントリ
interface AuditLogEntry {
  id, event, timestamp, filePath,
  durationMs?, charCount?, error?,
  category?, confidence?, tags?, confidentiality?, destination?, moveType?
}
```

---

## 7. データフロー

```
新規ファイル検知
  filePath: string
     │
     ▼ Watcher（重複チェック・バックプレッシャー）
     │
     ▼ Queue.enqueue(filePath)
     │  ┌── 監査ログ: started
     │
     ▼ extract(filePath, config)
     │  → ExtractedText { text, charCount, truncationWarning? }
     │  ┌── text が空 → 監査ログ: skipped → STOP
     │
     ▼ classify(text, config)
     │  → ClassificationResult { category, confidence, ... }
     │
     ▼ route(filePath, classification, config)
     │  → RouteDecision { moveType, destDir, reason? }
     │  → ファイルを destDir へ移動
     │
     ▼ 監査ログ: completed / failed
```

---

## 8. ルーティングロジック詳細

`route()` は分類結果と `config.routes` を照合し、3 段階の優先度でファイルの移動先を決定します。

```
isHighConfidence = confidence >= config.confidenceThreshold

┌─────────────────────────────────────────────────────────┐
│ 優先度 1 (完全一致)                                       │
│   isHighConfidence && routes[category] !== undefined      │
│   → destDir = routes[category]                           │
│   → moveType = 'auto'                                    │
├─────────────────────────────────────────────────────────┤
│ 優先度 2 (「その他」フォールバック)                        │
│   isHighConfidence                                       │
│   && category !== 'その他'                               │
│   && routes['その他'] !== undefined                      │
│   → destDir = routes['その他']                           │
│   → moveType = 'auto'                                    │
│   → reason = 'routes に category "XXX" の設定がない...'  │
├─────────────────────────────────────────────────────────┤
│ 優先度 3 (レビュー待ち)                                   │
│   それ以外                                               │
│   → destDir = config.reviewDir                           │
│   → moveType = 'review'                                  │
│   → reason = 信頼スコア不足 または その他未設定           │
└─────────────────────────────────────────────────────────┘
```

**移動先パス解決 (`resolveDestination`)**:
- 同名ファイルが既に `destDir` に存在する場合 → `{stem}-{Date.now()}{ext}` に変更
- 移動元と移動先が同一パスの場合 → 移動をスキップして `warn` ログ

**クロスデバイス移動 (`moveFile`)**:
- `fs.rename` を試行し、`EXDEV` エラーが発生した場合は `copyFile` + `unlink` にフォールバック

---

## 9. 監査ログ仕様

ログファイル（`config.logFile`）は **JSON Lines** 形式（1 行 = 1 JSON オブジェクト）。

### イベント種別

| `event` | タイミング | 主要フィールド |
|---------|-----------|--------------|
| `started` | ジョブ開始時 | `id`, `timestamp`, `filePath` |
| `completed` | 正常完了時 | + `durationMs`, `charCount`, `category`, `confidence`, `tags`, `confidentiality`, `destination`, `moveType` |
| `failed` | 例外発生時 | + `durationMs`, `error`, `moveType: 'error'`, `destination`（移動できた場合） |
| `skipped` | 重複検知 / 空テキスト | `id`, `timestamp`, `filePath`, `durationMs?` |

### ログ例（completed）

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "event": "completed",
  "timestamp": "2026-05-29T10:00:00.000Z",
  "filePath": "C:\\Users\\norin\\OneDrive\\デスクトップ\\test\\memo.txt",
  "durationMs": 1523,
  "charCount": 842,
  "category": "日記",
  "confidence": 0.92,
  "tags": ["日常", "メモ"],
  "confidentiality": "low",
  "destination": "C:\\Users\\norin\\OneDrive\\デスクトップ\\test\\diary\\memo.txt",
  "moveType": "auto"
}
```

---

## 10. エラーハンドリング方針

| レイヤー | 方針 |
|---------|------|
| `loader.ts` | 設定エラーは `process.exit(1)`（起動前の致命的エラー） |
| `extractor/*` | 例外をそのまま throw し、Queue 層に伝播させる |
| `classifier/index.ts` | API エラーを人間が読めるメッセージに変換して throw |
| `router/index.ts` | 例外をそのまま throw し、Queue 層に伝播させる |
| `queue/index.ts` | **すべての例外をキャッチ**して `reviewDir` に移動 + `failed` ログを記録し、例外を飲み込む（次のジョブを継続） |

---

## 11. 開発・運用コマンド

```bash
# 開発実行（tsx で直接実行）
yarn dev

# ビルド（dist/ に出力）
yarn build

# 本番実行（ビルド後）
yarn start

# 型チェック（コンパイルなし）
yarn lint

# テスト実行
yarn test

# テスト（ウォッチモード）
yarn test:watch

# カバレッジ付きテスト
yarn test:coverage
```

**必要な環境変数**（`.env` ファイルに記載）:

```
OPENAI_API_KEY=sk-...
```

---

## 12. 改修ガイド

### 新しいファイル形式に対応する

1. `src/extractor/` に新しい抽出器ファイルを作成（例: `xlsx.ts`）
   - `extractXlsx(filePath, config): Promise<ExtractedText>` を実装
   - `ExtractedText` の構造は `txt.ts` を参照

2. `src/extractor/index.ts` の `switch` に新しい `case` を追加

3. `config.json` の `watchedExtensions` に拡張子を追加

### 振り分け先カテゴリを追加する

`config.json` の `routes` にキーと移動先パスを追加するだけ（コード変更不要）:

```json
"routes": {
  "既存カテゴリ": "/path/to/existing",
  "新カテゴリ名": "/path/to/new"   ← 追加
}
```

AI へのプロンプトは `buildSystemPrompt(Object.keys(config.routes))` により自動的に更新されます。

### ルーティングロジックを変更する

`src/router/index.ts` の `route()` 関数の 3 分岐ブロックを編集します。

`FALLBACK_ROUTE_KEY` 定数（現在は `'その他'`）を変更すれば、フォールバック先のキー名を変更できます。

### AI モデルを変更する

`config.json` の `model` フィールドを変更します（例: `"gpt-4o"`）。コード変更は不要です。

### 信頼スコアの閾値を調整する

`config.json` の `confidenceThreshold` を変更します（`0.0〜1.0`）。
値を下げると自動振り分けされやすくなり、上げると `reviewDir` に回されやすくなります。

### 監査ログのフィールドを追加する

1. `src/types/index.ts` の `AuditLogEntry` インターフェースに新しいフィールドを追加
2. `src/queue/index.ts` の `completedEntry` / `failedEntry` に値をセット
