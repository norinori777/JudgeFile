# seen-keys-format: 処理済みキー永続化ファイル仕様

**Feature**: 011-daemon-stability  
**Date**: 2026-06-01

---

## 概要

`seen-keys.jsonl` は処理済みファイルの識別キーを永続化するプレーンテキストファイル。
デーモン再起動後に同一ファイルの重複処理を防ぐために使用する（FR-005）。

> **名称の `.jsonl` について**: ファイル名は `.jsonl` だが内容は JSON Lines ではなく 1 行 1 キー文字列のプレーンテキスト。拡張子は「行指向テキスト」を示す慣例として使用している。

---

## ファイルパス

```
${dirname(config.logFile)}/seen-keys.jsonl
```

例: `config.logFile` が `/var/log/judgefile/audit.jsonl` の場合、`/var/log/judgefile/seen-keys.jsonl`

---

## フォーマット

### 行形式

```
${basename(filePath)}:${size}:${mtimeMs}
```

| フィールド | 型 | 説明 |
|-----------|---|------|
| `basename(filePath)` | `string` | ファイル名（パスなし、拡張子含む） |
| `size` | `number` | ファイルサイズ（バイト数、`fs.stat().size`） |
| `mtimeMs` | `number` | 最終更新時刻（ミリ秒 Unix タイムスタンプ、`fs.stat().mtimeMs`） |

区切り文字: `:` (コロン)  
行末: `\n`  
エンコーディング: `UTF-8`

### ファイル例

```text
report.pdf:204800:1748736000000
contract-2024.docx:51200:1748736001000
invoice_001.txt:1024:1748736002000
image-scan.png:1048576:1748736003000
```

---

## 書き込み規則

### 追記（通常稼働時）

```typescript
appendFileSync(persistPath, key + '\n', 'utf-8');
```

- タイミング: `completed` イベントが監査ログに記録された直後
- `failed` イベントは記録しない（再試行を可能にするため）

### 全書き直し（シャットダウン時）

```typescript
writeFileSync(persistPath, [...store].join('\n') + '\n', 'utf-8');
```

- タイミング: グレースフル停止シーケンスの最終段階
- 目的: LRU エビクション済みの古いエントリを削除し、ファイルサイズを正規化する

---

## 読み込み規則（起動時）

```typescript
const lines = readFileSync(persistPath, 'utf-8').split('\n').filter(Boolean);
const store = new Set(lines.slice(-maxSize)); // 末尾 maxSize 件のみ使用
```

- ファイルが存在しない: 空 Set で起動（エラーなし）
- 読み取り失敗（権限エラーなど）: 警告ログを出力し空 Set で起動
- 空ファイル: 空 Set で起動

---

## 上限と LRU エビクション

- 最大エントリ数: `config.seenKeysMaxSize`（デフォルト: 10,000）
- 追記モードではエビクション済みキーがファイルに残る場合があるが、起動時に `slice(-maxSize)` で古い分を切り捨てる
- シャットダウン時の全書き直しにより、ファイルは常に `maxSize` 件以内に正規化される

---

## セキュリティ考慮事項

- ファイルパス情報（`basename` のみ）と数値メタデータのみを保存する（ファイル内容は含まない）
- パーミッション: 監査ログ（`audit-*.jsonl`）と同じディレクトリに作成するため、OS の ACL 設定に従う
- 改ざんによる副作用: エントリを削除されると再処理が発生するが、内容上書きは起きない（冪等性を保つ設計）

---

## バリデーション

起動時に読み込んだ行に対してフォーマット検証は行わない（パース失敗行は無視して空扱い）。キーの有効性は `stat()` によるファイルメタデータと照合することで実質的に担保される。
