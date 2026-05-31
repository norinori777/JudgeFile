/**
 * Feature 010 - 監査・コンプライアンス強化 テストスイート
 * US1: HMAC-SHA256 チェーン完全性検証
 * US2: ログローテーション / 保持期間クリーンアップ
 * US3: GDPR 消去 CLI（redactEntries）
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { rm } from 'node:fs/promises';

// テスト対象モジュール
import { computeEntryCurrHash, computeHmac, verifyChain } from '../src/logger/integrity.js';
import { initLogger, writeLog, maskSensitiveFields } from '../src/logger/index.js';
import { getActiveLogBaseName, resolveRotatedPath } from '../src/logger/rotation.js';
import { runRetentionCleanup, extractDateFromLogName } from '../src/logger/retention.js';
import { redactEntries } from '../src/logger/redaction.js';
import { computeSha256 } from '../src/logger/integrity.js';
import type { AuditLogEntry } from '../src/types/index.js';

const TEST_SECRET = 'test-secret-that-is-at-least-32-chars-long!!';

// ============================================================
// ヘルパー
// ============================================================

function makeTmpDir(): string {
  return mkdtempSync(join(tmpdir(), 'judgefile-test-'));
}

function makeEntry(overrides: Partial<AuditLogEntry> = {}): AuditLogEntry {
  return {
    id: crypto.randomUUID(),
    event: 'completed',
    timestamp: new Date().toISOString(),
    filePath: '/tmp/test.txt',
    ...overrides,
  };
}

function buildChain(count: number, secret: string): AuditLogEntry[] {
  const entries: AuditLogEntry[] = [];
  let prevHash = 'genesis';
  for (let i = 0; i < count; i++) {
    const base = makeEntry({ timestamp: new Date(Date.now() + i).toISOString() });
    const currHash = computeEntryCurrHash(base, prevHash, secret);
    const entry: AuditLogEntry = { ...base, prevHash, currHash };
    entries.push(entry);
    prevHash = currHash;
  }
  return entries;
}

// ============================================================
// US1 – HMAC-SHA256 チェーン完全性検証 (FR-001, FR-002)
// ============================================================

describe('US1: HMAC チェーン完全性', () => {
  it('正常チェーン → verifyChain が passed=true を返す', () => {
    const entries = buildChain(5, TEST_SECRET);
    const result = verifyChain(entries, TEST_SECRET);
    expect(result.passed).toBe(true);
    expect(result.violations).toHaveLength(0);
    expect(result.totalEntries).toBe(5);
  });

  it('1エントリ改ざん → 該当 entryIndex で hash_mismatch 違反が検出される', () => {
    const entries = buildChain(4, TEST_SECRET);
    // インデックス 2 のエントリのフィールドを改ざん
    entries[2] = { ...entries[2]!, filePath: '/tampered/path.txt' };
    const result = verifyChain(entries, TEST_SECRET);
    expect(result.passed).toBe(false);
    const violationIndexes = result.violations.map((v) => v.entryIndex);
    expect(violationIndexes).toContain(2);
    const mismatch = result.violations.find((v) => v.entryIndex === 2);
    expect(mismatch?.reason).toBe('hash_mismatch');
  });

  it('チェーンの切断（prevHash 不整合） → unexpected_chain_break が検出される', () => {
    const entries = buildChain(3, TEST_SECRET);
    // インデックス 1 の prevHash を壊す（currHash は変えない → chain break）
    entries[1] = { ...entries[1]!, prevHash: 'invalid-prev-hash' };
    const result = verifyChain(entries, TEST_SECRET);
    expect(result.passed).toBe(false);
    const chainBreak = result.violations.find((v) => v.reason === 'unexpected_chain_break');
    expect(chainBreak).toBeDefined();
  });

  it('レガシーエントリ（hash フィールドなし）は警告のみでパスとする', () => {
    const legacyEntry: AuditLogEntry = makeEntry();
    // prevHash / currHash を持たない（= レガシー）
    const result = verifyChain([legacyEntry], TEST_SECRET);
    expect(result.passed).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it('空チェーン → passed=true', () => {
    const result = verifyChain([], TEST_SECRET);
    expect(result.passed).toBe(true);
    expect(result.totalEntries).toBe(0);
  });

  it('SC-002: HMAC 計算が 10ms 未満/エントリである', () => {
    const ENTRY_COUNT = 100;
    const entries = buildChain(ENTRY_COUNT, TEST_SECRET);
    const start = performance.now();
    verifyChain(entries, TEST_SECRET);
    const elapsed = performance.now() - start;
    // 100エントリで 1000ms 未満 = 平均 10ms/エントリ
    expect(elapsed).toBeLessThan(1000);
  });
});

// ============================================================
// US2 – ログローテーション / 保持期間クリーンアップ
// ============================================================

describe('US2: ログローテーション', () => {
  it('getActiveLogBaseName: 現在の日付で audit-YYYY-MM-DD.jsonl を返す', () => {
    const now = new Date(2025, 5, 15); // 2025-06-15 (local)
    const name = getActiveLogBaseName(now);
    expect(name).toBe('audit-2025-06-15.jsonl');
  });

  it('getActiveLogBaseName: 月と日がゼロパディングされる', () => {
    const name = getActiveLogBaseName(new Date(2025, 0, 5)); // 2025-01-05
    expect(name).toBe('audit-2025-01-05.jsonl');
  });

  it('resolveRotatedPath: ファイルが存在しない場合はプライマリパスを返す', () => {
    const dir = makeTmpDir();
    const result = resolveRotatedPath(dir, 'audit-2025-06-15.jsonl', 10 * 1024 * 1024);
    expect(result).toBe(resolve(dir, 'audit-2025-06-15.jsonl'));
  });

  it('resolveRotatedPath: サイズ超過時は -1 サフィックスを返す', () => {
    const dir = makeTmpDir();
    const primary = join(dir, 'audit-2025-06-15.jsonl');
    // 5バイトのファイルを作成し、上限を 3バイトに設定
    writeFileSync(primary, 'hello', 'utf-8');
    const result = resolveRotatedPath(dir, 'audit-2025-06-15.jsonl', 3);
    expect(result).toBe(resolve(dir, 'audit-2025-06-15-1.jsonl'));
  });

  it('resolveRotatedPath: -1 も超過の場合は -2 を返す', () => {
    const dir = makeTmpDir();
    writeFileSync(join(dir, 'audit-2025-06-15.jsonl'), 'hello', 'utf-8');
    writeFileSync(join(dir, 'audit-2025-06-15-1.jsonl'), 'world', 'utf-8');
    const result = resolveRotatedPath(dir, 'audit-2025-06-15.jsonl', 3);
    expect(result).toBe(resolve(dir, 'audit-2025-06-15-2.jsonl'));
  });
});

describe('US2: 保持期間クリーンアップ (FR-004)', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('retentionDays=0 の場合は何も削除しない', () => {
    // 古いファイルを作成
    writeFileSync(join(tmpDir, 'audit-2020-01-01.jsonl'), '{}');
    const deleted = runRetentionCleanup(tmpDir, 0);
    expect(deleted).toHaveLength(0);
    expect(existsSync(join(tmpDir, 'audit-2020-01-01.jsonl'))).toBe(true);
  });

  it('保持期間を超えたログファイルが削除される', () => {
    // 5日前のファイル（retentionDays=3 → 削除対象）
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 5);
    const y = oldDate.getFullYear();
    const m = String(oldDate.getMonth() + 1).padStart(2, '0');
    const d = String(oldDate.getDate()).padStart(2, '0');
    const oldFile = `audit-${y}-${m}-${d}.jsonl`;
    writeFileSync(join(tmpDir, oldFile), '{}');

    const deleted = runRetentionCleanup(tmpDir, 3);
    expect(deleted).toHaveLength(1);
    expect(deleted[0]).toContain(oldFile);
    expect(existsSync(join(tmpDir, oldFile))).toBe(false);
  });

  it('保持期間内のファイルは削除されない', () => {
    // 今日のファイル（retentionDays=365 → 保持）
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');
    const todayFile = `audit-${y}-${m}-${d}.jsonl`;
    writeFileSync(join(tmpDir, todayFile), '{}');

    const deleted = runRetentionCleanup(tmpDir, 365);
    expect(deleted).toHaveLength(0);
    expect(existsSync(join(tmpDir, todayFile))).toBe(true);
  });

  it('パターン外のファイルは無視される', () => {
    writeFileSync(join(tmpDir, 'README.md'), '# test');
    writeFileSync(join(tmpDir, 'audit.jsonl'), '{}'); // legacy format - no date
    const deleted = runRetentionCleanup(tmpDir, 1);
    expect(deleted).toHaveLength(0);
  });

  it('extractDateFromLogName: 正しい日付を抽出する', () => {
    expect(extractDateFromLogName('audit-2025-06-15.jsonl')).toBe('2025-06-15');
    expect(extractDateFromLogName('audit-2025-06-15-1.jsonl')).toBe('2025-06-15');
    expect(extractDateFromLogName('audit-2025-06-15-99.jsonl')).toBe('2025-06-15');
    expect(extractDateFromLogName('audit.jsonl')).toBeNull();
    expect(extractDateFromLogName('README.md')).toBeNull();
  });
});

// ============================================================
// US2 – initLogger + writeLog の統合動作
// ============================================================

describe('US2: initLogger 統合', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('initLogger が日付ベースのログファイルを作成する', () => {
    const dummyLogPath = join(tmpDir, 'audit.jsonl');
    initLogger(dummyLogPath, [], TEST_SECRET, 10);
    // 今日の日付ベースファイルが作成されているはず
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');
    const expectedFile = join(tmpDir, `audit-${y}-${m}-${d}.jsonl`);
    expect(existsSync(expectedFile)).toBe(true);
  });

  it('writeLog が HMAC フィールド付きエントリを書き込む', () => {
    const dummyLogPath = join(tmpDir, 'audit.jsonl');
    initLogger(dummyLogPath, [], TEST_SECRET, 10);
    writeLog(makeEntry());

    const today = new Date();
    const y = today.getFullYear();
    const mo = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');
    const logFile = join(tmpDir, `audit-${y}-${mo}-${d}.jsonl`);
    const content = readFileSync(logFile, 'utf-8').trim();
    const parsed = JSON.parse(content) as AuditLogEntry;
    expect(parsed.prevHash).toBe('genesis');
    expect(typeof parsed.currHash).toBe('string');
    expect(parsed.currHash).toHaveLength(64); // SHA-256 hex = 64 chars
  });

  it('複数エントリ書き込み後 verifyChain が PASS する', () => {
    const dummyLogPath = join(tmpDir, 'audit.jsonl');
    initLogger(dummyLogPath, [], TEST_SECRET, 10);
    for (let i = 0; i < 5; i++) {
      writeLog(makeEntry({ filePath: `/tmp/file${i}.txt` }));
    }

    const today = new Date();
    const y = today.getFullYear();
    const mo = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');
    const logFile = join(tmpDir, `audit-${y}-${mo}-${d}.jsonl`);
    const lines = readFileSync(logFile, 'utf-8').trim().split('\n');
    const entries = lines.map((l) => JSON.parse(l) as AuditLogEntry);
    const result = verifyChain(entries, TEST_SECRET);
    expect(result.passed).toBe(true);
  });
});

// ============================================================
// US3 – GDPR 消去: redactEntries (FR-009)
// ============================================================

describe('US3: GDPR 消去 (redactEntries)', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  function writeJsonlFile(filePath: string, entries: AuditLogEntry[]): void {
    writeFileSync(filePath, entries.map((e) => JSON.stringify(e)).join('\n') + '\n', 'utf-8');
  }

  it('一致するエントリの filePath を [REDACTED] に置換する', () => {
    const logFile = join(tmpDir, 'audit-2025-01-01.jsonl');
    const entries = buildChain(3, TEST_SECRET);
    // エントリ 1 の filePath を特定の識別子に変更（HMAC チェーンは再構築しない = ここではチェーン不整合を無視）
    entries[1] = { ...entries[1]!, filePath: '/private/user-file.txt' };
    writeJsonlFile(logFile, entries);

    const summary = redactEntries(logFile, '/private/user-file.txt', TEST_SECRET);
    expect(summary.redactedCount).toBe(1);

    const lines = readFileSync(logFile, 'utf-8').trim().split('\n');
    const redacted = lines.map((l) => JSON.parse(l) as AuditLogEntry);
    // 元のエントリ数 + redaction マーカー
    expect(redacted).toHaveLength(entries.length + 1);
    const redactedEntry = redacted.find((e) => e.event !== 'redaction' && e.filePath === '[REDACTED]');
    expect(redactedEntry).toBeDefined();
  });

  it('一致しないエントリは変更せず、redactedCount=0 を返す', () => {
    const logFile = join(tmpDir, 'audit-2025-01-02.jsonl');
    const entries = buildChain(3, TEST_SECRET);
    writeJsonlFile(logFile, entries);

    const summary = redactEntries(logFile, '/nonexistent/file.txt', TEST_SECRET);
    expect(summary.redactedCount).toBe(0);

    // ファイルは変更されていない（redaction マーカーなし）
    const lines = readFileSync(logFile, 'utf-8').trim().split('\n');
    expect(lines).toHaveLength(entries.length);
  });

  it('dry-run モードではファイルを変更しない', () => {
    const logFile = join(tmpDir, 'audit-2025-01-03.jsonl');
    const entries = buildChain(3, TEST_SECRET);
    entries[0] = { ...entries[0]!, filePath: '/private/user-file.txt' };
    writeJsonlFile(logFile, entries);

    const originalContent = readFileSync(logFile, 'utf-8');
    const summary = redactEntries(logFile, '/private/user-file.txt', TEST_SECRET, true);
    expect(summary.dryRun).toBe(true);
    expect(summary.redactedCount).toBe(1);

    // ファイルは変更されていない
    const afterContent = readFileSync(logFile, 'utf-8');
    expect(afterContent).toBe(originalContent);
  });

  it('redaction マーカーが末尾に挿入される (event=redaction, redactedIdentifierHash)', () => {
    const logFile = join(tmpDir, 'audit-2025-01-04.jsonl');
    const entries = buildChain(2, TEST_SECRET);
    entries[1] = { ...entries[1]!, filePath: '/private/user-file.txt' };
    writeJsonlFile(logFile, entries);

    redactEntries(logFile, '/private/user-file.txt', TEST_SECRET);

    const lines = readFileSync(logFile, 'utf-8').trim().split('\n');
    const marker = JSON.parse(lines[lines.length - 1]!) as AuditLogEntry;
    expect(marker.event).toBe('redaction');
    expect(marker.filePath).toBe('[REDACTED]');
    expect(marker.redactedIdentifierHash).toBe(computeSha256('/private/user-file.txt'));
    expect(marker.redactedCount).toBe(1);
    expect(marker.redactedAt).toBeDefined();
  });

  it('redaction マーカーに HMAC フィールドが付与される', () => {
    const logFile = join(tmpDir, 'audit-2025-01-05.jsonl');
    const entries = buildChain(2, TEST_SECRET);
    entries[0] = { ...entries[0]!, filePath: '/private/user-file.txt' };
    writeJsonlFile(logFile, entries);

    redactEntries(logFile, '/private/user-file.txt', TEST_SECRET);

    const lines = readFileSync(logFile, 'utf-8').trim().split('\n');
    const marker = JSON.parse(lines[lines.length - 1]!) as AuditLogEntry;
    expect(marker.prevHash).toBeDefined();
    expect(marker.currHash).toBeDefined();
    expect(marker.currHash).toHaveLength(64);
  });

  it('存在しないファイルを指定した場合 redactedCount=0 を返す', () => {
    const summary = redactEntries(join(tmpDir, 'nonexistent.jsonl'), '/some/path', TEST_SECRET);
    expect(summary.redactedCount).toBe(0);
  });

  it('SC-004: 1000エントリのファイルに対して 30秒以内に完了する', () => {
    const logFile = join(tmpDir, 'audit-perf.jsonl');
    // 1000エントリを生成（チェーンは構築しない → 高速化）
    const entries = Array.from({ length: 1000 }, (_, i) =>
      makeEntry({ filePath: `/files/document-${i}.txt`, timestamp: new Date(Date.now() + i).toISOString() }),
    );
    // 500番目だけ redaction 対象
    entries[500] = { ...entries[500]!, filePath: '/private/target.txt' };
    writeFileSync(logFile, entries.map((e) => JSON.stringify(e)).join('\n') + '\n', 'utf-8');

    const start = performance.now();
    const summary = redactEntries(logFile, '/private/target.txt', TEST_SECRET);
    const elapsed = performance.now() - start;

    expect(summary.redactedCount).toBe(1);
    expect(elapsed).toBeLessThan(30_000);
  });
});
