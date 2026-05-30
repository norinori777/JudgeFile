# Data Model: Office 文書対応と人間確認フロー

**Date**: 2026-05-30
**Feature**: [spec.md](spec.md)

---

## 既存エンティティ（参照）

```typescript
// src/types/index.ts より（変更なし）
interface ExtractedText {
  filePath: string;
  text: string;
  charCount: number;
  truncationWarning?: string;
  ocrEngine?: string;
}

interface ClassificationResult {
  category: string;
  tags: string[];
  summary: string;
  confidentiality: 'low' | 'medium' | 'high';
  confidence: number;
  destination: string;
}

interface RouteDecision {
  moveType: 'auto' | 'review' | 'error';
  destDir: string;
  reason?: string;
}
```

---

## 新規エンティティ

### ReviewItem

review フォルダ内の 1 ファイルと、それに対応する AI 分類メタデータを表す。
review CLI が `.meta.json` を読み込んで生成するインメモリ表現。

```typescript
/** review フォルダ内の 1 ファイル + AI 分類メタデータ（インメモリ） */
interface ReviewItem {
  /** review フォルダ内のファイルパス（絶対パス） */
  filePath: string;
  /** 元ファイル名（表示用） */
  originalName: string;
  /** AI 分類候補 */
  aiClassification: {
    category: string;
    tags: string[];
    confidence: number;
    confidentiality: 'low' | 'medium' | 'high';
    /** AI 推奨振り分け先（routes のキー） */
    destination: string;
  };
  /** review フォルダへの移動日時（ISO 8601） */
  queuedAt: string;
}
```

**制約**:
- `filePath` は review フォルダ内の実在パスでなければならない
- `queuedAt` は `.meta.json` から読み込む。ファイルが見つからない場合はそのファイルをスキップする（Edge Cases）

---

### ReviewDecision

オペレーターが review CLI で下した判断を表す。1 件の `ReviewItem` に対して 1 件生成される。

```typescript
/** オペレーターの確認結果 */
interface ReviewDecision {
  /** 判断した日時（ISO 8601） */
  reviewedAt: string;
  /** 操作種別 */
  action: 'approved' | 'corrected';
  /** 最終的な分類（承認時は aiClassification と同一、修正時は修正後の値） */
  finalClassification: {
    category: string;
    tags: string[];
    /** 振り分け先フォルダパス（絶対パス） */
    destDir: string;
  };
}
```

**制約**:
- `action === 'approved'` のとき `finalClassification` は `aiClassification` の値をそのまま使う
- `action === 'corrected'` のとき `finalClassification` はオペレーター入力値を使う
- `destDir` は `config.routes` に存在するパスでなければならない（入力検証）

---

### CorrectionRecord

`corrections.jsonl` の 1 行（1 エントリ）を表す。承認・修正のすべての操作を記録する。

```typescript
/** corrections.jsonl の 1 エントリ（JSONL 形式で永続化） */
interface CorrectionRecord {
  /** 元ファイル名（review フォルダ内の名前） */
  fileName: string;
  /** 絶対パス（振り分け後） */
  destFilePath: string;
  /** AI 分類候補のスナップショット */
  aiClassification: {
    category: string;
    tags: string[];
    confidence: number;
    confidentiality: 'low' | 'medium' | 'high';
    destination: string;
  };
  /** 最終的な分類（承認時は AI 候補と同一、修正時は修正後の値） */
  finalClassification: {
    category: string;
    tags: string[];
    destDir: string;
  };
  /** 操作種別 */
  action: 'approved' | 'corrected';
  /** 操作日時（ISO 8601） */
  timestamp: string;
}
```

**制約**:
- テキスト本文は含めない（FR-015）
- `corrections.jsonl` への書き込みは append（追記）のみ。既存行を変更しない

---

## ファイル永続化スキーマ

### .meta.json（review フォルダへの移動時に queue.ts が生成）

保存パス: `<reviewDir>/<元ファイル名>.meta.json`

```json
{
  "filePath": "/path/to/review/<ファイル名>",
  "originalName": "<元ファイル名>",
  "category": "請求書",
  "tags": ["請求", "2026年"],
  "confidence": 0.62,
  "confidentiality": "low",
  "destination": "経理",
  "queuedAt": "2026-05-30T10:00:00.000Z"
}
```

**フィールド定義**:

| フィールド | 型 | 必須 | 説明 |
|-----------|-----|------|------|
| `filePath` | string | ✅ | review フォルダ内のファイル絶対パス |
| `originalName` | string | ✅ | 元ファイル名（basename） |
| `category` | string | ✅ | AI が出力したカテゴリ |
| `tags` | string[] | ✅ | AI が出力したタグ配列 |
| `confidence` | number | ✅ | AI 信頼スコア（0.0–1.0） |
| `confidentiality` | string | ✅ | `'low'` / `'medium'` / `'high'` |
| `destination` | string | ✅ | AI が推奨する振り分け先（routes のキー） |
| `queuedAt` | string | ✅ | review フォルダ移動日時（ISO 8601） |

---

### corrections.jsonl（reviewer が追記）

保存パス: `path.dirname(config.logFile)/corrections.jsonl`

1 行 1 JSON オブジェクト（JSONL）:

```jsonl
{"fileName":"invoice.docx","destFilePath":"/routes/経理/invoice.docx","aiClassification":{"category":"請求書","tags":["請求","2026年"],"confidence":0.62,"confidentiality":"low","destination":"経理"},"finalClassification":{"category":"請求書","tags":["請求","2026年"],"destDir":"/routes/経理"},"action":"approved","timestamp":"2026-05-30T10:05:00.000Z"}
{"fileName":"report.xlsx","destFilePath":"/routes/その他/report.xlsx","aiClassification":{"category":"議事録","tags":[],"confidence":0.55,"confidentiality":"low","destination":"経理"},"finalClassification":{"category":"報告書","tags":["月次"],"destDir":"/routes/その他"},"action":"corrected","timestamp":"2026-05-30T10:07:30.000Z"}
```

---

## エンティティ関係図

```
監視フォルダ
  │ ファイル検知
  ▼
Queue.enqueue()
  │ extract() → classify() → route()
  ├─ moveType='auto' → routes フォルダへ移動
  └─ moveType='review' → reviewDir へ移動
                            │ .meta.json も保存
                            ▼
                        ReviewItem（インメモリ）
                            │ reviewer CLI が読み込み
                            ▼
                        ReviewDecision（インメモリ）
                            │ ファイルを destDir へ移動
                            │ CorrectionRecord を corrections.jsonl に追記
                            ▼
                        振り分け完了
```

---

## 状態遷移

### review フォルダ内ファイルの状態

```
[review フォルダ着地]
  │
  ├─ .meta.json あり → ReviewItem として CLI に提示可能
  │     │
  │     ├─ approved → destDir へ移動、CorrectionRecord 追記（action='approved'）
  │     └─ corrected → 修正後 destDir へ移動、CorrectionRecord 追記（action='corrected'）
  │
  └─ .meta.json なし → CLI がスキップ（警告ログ出力）
```
