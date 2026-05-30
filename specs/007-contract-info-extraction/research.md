# Research: 契約書振り分け時の契約情報抽出・テキスト出力

**Date**: 2026-05-31  
**Feature**: [spec.md](spec.md)

## 調査項目と結論

### 1. AI による構造化情報抽出パターン（既存 `classify()` の参照実装）

**Decision**: `classify()` と同じ `response_format: { type: 'json_object' }` + Zod スキーマ検証パターンを踏襲する

**Rationale**:
- 既存 `src/classifier/index.ts` が OpenAI SDK の JSON モード + Zod 検証で安定稼働しており、同パターンを再利用することで実装リスクを最小化できる
- `extractContractInfo()` は `classify()` の後続ステップとして独立した関数にする（FR-002・FR-008）
- 分類プロンプトと抽出プロンプトを分離することで、各プロンプトを独立に改善できる

**Alternatives considered**:
- `classify()` の出力に契約情報を追加する案 → classify への変更禁止（clarification Q3）により棄却
- LangChain の StructuredOutputParser → 依存追加不要。Zod + JSON モードで同等の検証が可能なため棄却

---

### 2. JSON Lines 監査ログへのネストオブジェクト埋め込み

**Decision**: `contractPeriod` はネスト JSON オブジェクトのまま `JSON.stringify()` で 1 行に変換して記録する

**Rationale**:
- 既存の `writeLog(entry)` は `JSON.stringify(entry)` を 1 行として書き出す実装。ネストオブジェクトは自動的に 1 行 JSON に収まる
- フラット化（`contractPeriodStart` 等）は後工程クエリ時に再結合が必要になり、可読性が低下する
- clarification Q5 で「ネスト JSON オブジェクト」を採用済み

**Alternatives considered**:
- フラットフィールド（`contractPeriodStart` / `contractPeriodEnd`） → 後工程の台帳連携でオブジェクト再組み立てが必要になるため棄却

---

### 3. `.meta.json` の読み込み・更新パターン

**Decision**: `fs.readFile` → JSON.parse → フィールド追加 → `fs.writeFile` の同期的な上書き更新

**Rationale**:
- `.meta.json` は 1 ファイルにつき 1 件のオブジェクトで、並列書き込みは発生しない（queue の concurrency 制御により同一ファイルは 1 ジョブのみ処理される）
- `moveType: 'review'` の場合は `reviewDir + '.meta.json'`、`moveType: 'auto'` の場合は `destDir + '.meta.json'` を更新する（clarification Q4）
- ファイルが存在しない場合は警告ログのみ記録してスキップ（FR-005）

**Alternatives considered**:
- append-only で新フィールドを別ファイルに書く → `.meta.json` の一元管理が崩れるため棄却

---

### 4. 契約書カテゴリ判定ロジック

**Decision**: `classification.category.toLowerCase() === (config.contractCategoryLabel ?? '契約書').toLowerCase()` で比較する

**Rationale**:
- デフォルト正規ラベルは `"契約書"`（日本語）。clarification Q2 で確定
- `config.contractCategoryLabel` で上書き可能にすることで、英語環境・カスタムラベルにも対応
- `toLowerCase()` による大文字小文字無視は FR-001・FR-009 要件

**Alternatives considered**:
- 「契約書」と「contract」を常に両方許容する案 → 設定ファイルで制御できれば十分であり、ハードコードの多重条件は保守コストが高いため棄却

---

### 5. エラーハンドリング方針

**Decision**: `extractContractInfo()` は例外をスローし、呼び出し元（`queue/index.ts`）で try/catch して `contractExtractionError` に記録する

**Rationale**:
- FR-007・FR-008 の要件：抽出失敗はメインパイプラインの `failed` を引き起こしてはならない
- 既存の queue の `enqueue()` 構造（外側 try/catch が failed ログを記録）と整合させるため、契約情報抽出は内側の独立 try/catch で囲む
- `extractContractInfo()` 自体は失敗時に例外をスローする設計とし、呼び出し側が責務を分離する

**Alternatives considered**:
- `extractContractInfo()` が `null` を返すことで失敗を表現する案 → エラーメッセージが失われるため棄却。例外でエラー内容を伝達し、呼び出し側で `contractExtractionError` に記録する

---

## 未解決事項

なし（すべての NEEDS CLARIFICATION は clarification セッションで解消済み）
