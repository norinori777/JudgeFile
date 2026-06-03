import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';

/**
 * 処理済みファイルキーの LRU 上限付き集合。
 * - 上限超過時は挿入順（最古）エントリをエビクションする（FR-001）
 * - add() 時に appendFileSync で 1 行追記（completed のみ呼ばれる想定）（FR-005）
 * - flush() でエビクション後の状態を全量再書き込み（シャットダウン時）
 * - 起動時は persistPath からロード。失敗時は空 Set で継続（FR-006）
 */
export class SeenKeyStore {
  private readonly store: Set<string>;
  private readonly maxSize: number;
  readonly persistPath: string;

  constructor(maxSize: number, persistPath: string) {
    this.maxSize = maxSize;
    this.persistPath = persistPath;
    this.store = this.load();
  }

  has(key: string): boolean {
    return this.store.has(key);
  }

  /**
   * キーを追加する。上限超過時は最古エントリをエビクションする。
   * 追加後に persistPath に 1 行追記する。書き込み失敗時は警告を出してインメモリ運用を継続する（T034）。
   */
  add(key: string): void {
    if (this.store.has(key)) return;
    if (this.store.size >= this.maxSize) {
      const oldest = this.store.values().next().value as string;
      this.store.delete(oldest);
    }
    this.store.add(key);
    try {
      appendFileSync(this.persistPath, key + '\n', 'utf-8');
    } catch (err) {
      console.warn(
        `[SeenKeyStore] 永続化ファイルへの書き込み失敗 — インメモリ運用継続: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /** 現在のストアサイズ */
  get size(): number {
    return this.store.size;
  }

  /**
   * 全エントリを persistPath に再書き込みする。
   * エビクション後のファイルの不整合を解消し、シャットダウン時に呼ぶ。
   * 書き込み失敗時は警告を出す（T034）。
   */
  flush(): void {
    try {
      const content = this.store.size > 0 ? [...this.store].join('\n') + '\n' : '';
      writeFileSync(this.persistPath, content, 'utf-8');
    } catch (err) {
      console.warn(
        `[SeenKeyStore] flush 失敗: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /**
   * persistPath からキーをロードする（FR-006）。
   * ファイルが存在しない / 読み込み失敗の場合は空 Set を返す。
   * ファイルが maxSize より大きい場合は末尾の maxSize 件を使用する。
   */
  private load(): Set<string> {
    try {
      const lines = readFileSync(this.persistPath, 'utf-8')
        .split('\n')
        .filter(Boolean);
      return new Set(lines.slice(-this.maxSize));
    } catch {
      return new Set();
    }
  }
}
