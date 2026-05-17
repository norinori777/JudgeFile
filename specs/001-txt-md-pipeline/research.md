# 調査レポート: txt / md 監視・抽出・ロギング基盤

**Feature**: `001-txt-md-pipeline`
**Date**: 2026-05-17

## 1. ファイル監視ライブラリ

**Decision**: `chokidar` ^3

**Rationale**:
- Node.js 内蔵 `fs.watch` はクロスプラットフォームで不安定（Windows でのイベント重複、macOS の rename 問題）
- `chokidar` は OS ネイティブ API（FSEvents, inotify, ReadDirectoryChangesW）をラップし安定したイベントを提供
- `add` イベントで新規ファイル検知、`ignored` オプションでサブフォルダ除外が容易
- `awaitWriteFinish` オプションでコピー中ファイルの誤検知を防止できる

**Alternatives considered**:
- `fs.watch`（Node.js 内蔵）: クロスプラットフォームで不安定なため不採用
- `@parcel/watcher`: chokidar より高速だが実績・ドキュメントが少なく、このフェーズでは chokidar が安全

---

## 2. 同時実行制御・キュー

**Decision**: `p-queue` ^8

**Rationale**:
- `concurrency` オプションで同時実行数を制御し、各ジョブが Promise として管理される
- キューが満杯になったとき `size` / `pending` を監視して chokidar の `pause()` / `resume()` を呼べる（バックプレッシャー実装に直結）
- 軽量（外部依存ゼロ）で TypeScript 型定義内蔵

**Alternatives considered**:
- BullMQ: Redis 必須で依存が重すぎる。このフェーズには過剰
- 自前実装: p-queue より多くのエッジケースを個別処理する必要があり、リスクが高い

---

## 3. 設定ファイルスキーマ検証

**Decision**: `zod` ^3 + JSON 設定ファイル（`config.json`）

**Rationale**:
- TypeScript 型を設定スキーマから自動推論できる（`z.infer<typeof ConfigSchema>` で型安全）
- 検証失敗時に分かりやすいエラーメッセージを生成（起動時の即時フェイルに最適）
- 設定ファイル形式は JSON を採用。YAML は追加パーサー依存が必要なため不採用

**Alternatives considered**:
- `@sinclair/typebox`: JSON Schema との親和性が高いが、型推論の使いやすさで zod が優位
- 手動バリデーション: 型安全でなく、追加バリデーションルールの追加が困難

---

## 4. UUID 生成

**Decision**: Node.js 内蔵 `crypto.randomUUID()`

**Rationale**:
- Node.js 14.17.0 以降で利用可能。Node.js 20 LTS では安定して使用できる
- 追加パッケージ不要（外部依存ゼロ）
- RFC 4122 準拠の UUID v4 を生成

**Alternatives considered**:
- `uuid` パッケージ: 追加依存が必要。Node.js 内蔵で代替できるため不採用

---

## 5. JSON Lines 監査ログ書き込み

**Decision**: Node.js 内蔵 `fs` モジュールの `appendFileSync` を使った追記

**Rationale**:
- JSON Lines（NDJSON）は 1 行 1 JSON オブジェクトの形式。`JSON.stringify(entry) + '\n'` を追記するだけで実装可能
- 追加ライブラリ不要
- 同時書き込みのリスクを避けるため、書き込みは `logger` モジュールにシングルトンとして集約する
- `appendFileSync` は非同期処理不要のシンプルな実装として適切（書き込みはイベントループをブロックしない程度の規模）

**Alternatives considered**:
- `pino` / `winston`: 監査ログの構造（スキーマ固定・フィールド明確）には過剰。自前 JSON Lines 追記で十分
- `createWriteStream`（非同期）: 同時書き込みのキューイングが必要になり複雑さが増す

---

## 6. テストフレームワーク

**Decision**: `vitest` ^2

**Rationale**:
- TypeScript をネイティブサポート（ts-jest 不要・設定が最小）
- `vi.fn()` でモック可能、`tmp` パッケージと組み合わせてファイルシステムテストが容易
- `--coverage` で V8 ベースのカバレッジ取得可能
- Jest 互換 API のため移行コストが低い

**Alternatives considered**:
- Jest + ts-jest: 設定が複雑、TypeScript トランスパイルが遅い
- Mocha: TypeScript サポートが弱く、型定義のセットアップが煩雑

---

## 7. 重複検知方式

**Decision**: `ファイル名 + サイズ + 更新日時（mtime）` の組み合わせでキーを生成し、メモリ内 `Set<string>` で管理

**Rationale**:
- `fs.stat()` で取得できる情報のみで実装でき、ハッシュ計算（ファイル全体読み込み）が不要
- チェックサムほど正確ではないが、同一ファイルのコピー検知（一般的な重複ケース）には十分
- プロセス再起動時にリセットされる（「起動時の既存ファイルは処理しない」ポリシーと整合）

**Alternatives considered**:
- SHA-256 チェックサム: 精度は高いが大容量ファイルで遅い。このフェーズでは過剰
- 永続化 DB（SQLite 等）: 起動時スキップポリシー（Q5: A）と整合させるとインメモリ Set で十分。将来フェーズで必要になれば追加する
