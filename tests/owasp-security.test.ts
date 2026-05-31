/**
 * tests/owasp-security.test.ts
 *
 * OWASPセキュリティ強化（Round 9）のユニット・統合テスト
 * カバレッジ対象: isPathAllowed / validateConfigSecurity / getFileSizeLimit /
 *               validateFileSecurity（サイズ） / maskSensitiveFields / validateMimeType
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, writeFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { isPathAllowed, getFileSizeLimit, validateMimeType, validateFileSecurity } from '../src/extractor/security.js';
import { validateConfigSecurity } from '../src/config/validator.js';
import { maskSensitiveFields } from '../src/logger/index.js';
import type { Config } from '../src/config/schema.js';
import type { AuditLogEntry } from '../src/types/index.js';

// ──────────────────────────────────────────────────────────────
// ヘルパー: テスト用の最小 Config を生成する
// ──────────────────────────────────────────────────────────────
function makeConfig(overrides: Partial<Config> = {}): Config {
  return {
    watchDir: '/tmp/watch',
    maxConcurrency: 2,
    maxQueueSize: 100,
    logFile: '/tmp/audit.jsonl',
    maxChars: 100_000,
    reviewDir: '/tmp/review',
    routes: {},
    confidenceThreshold: 0.8,
    model: 'gpt-4o-mini',
    apiTimeoutMs: 30_000,
    watchedExtensions: ['.txt', '.md'],
    maxImageSizeMB: 10,
    contractCategoryLabel: '契約書',
    sensitiveFields: ['contractSubject', 'contractPeriod'],
    maxFileSizeMB: { default: 50 },
    ...overrides,
  };
}

// ──────────────────────────────────────────────────────────────
// T008: isPathAllowed ユニットテスト
// ──────────────────────────────────────────────────────────────
describe('isPathAllowed', () => {
  it('watchDir と同じパスは許可する', () => {
    expect(isPathAllowed('/tmp/watch', '/tmp/watch')).toBe(true);
  });

  it('watchDir 配下のパスは許可する', () => {
    expect(isPathAllowed('/tmp/watch/subdir/file.txt', '/tmp/watch')).toBe(true);
  });

  it('../ シーケンスを含む watchDir 外パスは拒否する', () => {
    expect(isPathAllowed('/tmp/watch/../outside/file.txt', '/tmp/watch')).toBe(false);
  });

  it('watchDir の親ディレクトリへのパスは拒否する', () => {
    expect(isPathAllowed('/tmp', '/tmp/watch')).toBe(false);
  });

  it('全く別のパスは拒否する', () => {
    expect(isPathAllowed('/etc/passwd', '/tmp/watch')).toBe(false);
  });

  it('Null バイトを含むパスは拒否する', () => {
    expect(isPathAllowed('/tmp/watch/file\0.txt', '/tmp/watch')).toBe(false);
  });

  it('Null バイトを含む allowedRoot は拒否する', () => {
    expect(isPathAllowed('/tmp/watch/file.txt', '/tmp/watch\0')).toBe(false);
  });

  it('watchDir と前方一致するが配下ではないパスは拒否する', () => {
    // /tmp/watchExtra は /tmp/watch の配下ではない
    expect(isPathAllowed('/tmp/watchExtra/file.txt', '/tmp/watch')).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────
// T009: validateConfigSecurity ユニットテスト
// ──────────────────────────────────────────────────────────────
describe('validateConfigSecurity', () => {
  it('正常設定ではエラーをスローしない', () => {
    const config = makeConfig({
      watchDir: '/tmp/watch',
      reviewDir: '/tmp/review',
      routes: { 契約書: '/tmp/contracts' },
    });
    expect(() => validateConfigSecurity(config)).not.toThrow();
  });

  it('reviewDir が watchDir と同じ場合は Error をスローする', () => {
    const config = makeConfig({
      watchDir: '/tmp/watch',
      reviewDir: '/tmp/watch',
    });
    expect(() => validateConfigSecurity(config)).toThrow(/reviewDir.*watchDir/i);
  });

  it('routes の振り分け先が watchDir と同じ場合は Error をスローする', () => {
    const config = makeConfig({
      watchDir: '/tmp/watch',
      routes: { 契約書: '/tmp/watch' },
    });
    expect(() => validateConfigSecurity(config)).toThrow(/routes.*watchDir/i);
  });

  it('routes に複数ある場合、一つでも一致すれば Error をスローする', () => {
    const config = makeConfig({
      watchDir: '/tmp/watch',
      routes: {
        契約書: '/tmp/contracts',
        請求書: '/tmp/watch',   // ← 一致
      },
    });
    expect(() => validateConfigSecurity(config)).toThrow();
  });
});

// ──────────────────────────────────────────────────────────────
// T012: getFileSizeLimit ユニットテスト
// ──────────────────────────────────────────────────────────────
describe('getFileSizeLimit', () => {
  it('拡張子に対応する設定値をバイトで返す', () => {
    const config = makeConfig({
      maxFileSizeMB: { default: 50, '.txt': 10 },
    });
    expect(getFileSizeLimit('.txt', config)).toBe(10 * 1024 * 1024);
  });

  it('設定にない拡張子はデフォルト値を返す', () => {
    const config = makeConfig({ maxFileSizeMB: { default: 50 } });
    expect(getFileSizeLimit('.pdf', config)).toBe(50 * 1024 * 1024);
  });

  it('大文字小文字を区別しない', () => {
    const config = makeConfig({
      maxFileSizeMB: { default: 50, '.TXT': 5 },
    });
    expect(getFileSizeLimit('.txt', config)).toBe(5 * 1024 * 1024);
  });

  it('MB からバイトへの変換が正確', () => {
    const config = makeConfig({ maxFileSizeMB: { default: 1 } });
    expect(getFileSizeLimit('.md', config)).toBe(1 * 1024 * 1024);
  });
});

// ──────────────────────────────────────────────────────────────
// T013: validateFileSecurity サイズ検証 統合テスト
// ──────────────────────────────────────────────────────────────
describe('validateFileSecurity - サイズ検証', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'owasp-test-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('サイズ上限以内のファイルは passed: true を返す', async () => {
    const filePath = join(tmpDir, 'small.txt');
    await writeFile(filePath, 'hello world');
    const config = makeConfig({
      watchDir: tmpDir,
      maxFileSizeMB: { default: 1 },
    });
    const result = await validateFileSecurity(filePath, tmpDir, config);
    const sizeDet = result.validations.find(v => v.type === 'size');
    expect(sizeDet?.passed).toBe(true);
  });

  it('サイズ上限を超えたファイルは passed: false を返す', async () => {
    const filePath = join(tmpDir, 'big.txt');
    // 0.001 MB = 1024 バイト 上限に対して 2048 バイト
    await writeFile(filePath, 'x'.repeat(2048));
    const config = makeConfig({
      watchDir: tmpDir,
      maxFileSizeMB: { default: 50, '.txt': 0.001 },
    });
    const result = await validateFileSecurity(filePath, tmpDir, config);
    expect(result.passed).toBe(false);
    expect(result.rejectionReason).toMatch(/サイズ超過/);
  });

  it('サイズ設定なし（default のみ）のとき 50MB デフォルトが適用される', async () => {
    const filePath = join(tmpDir, 'normal.txt');
    await writeFile(filePath, 'hello');
    const config = makeConfig({ watchDir: tmpDir });
    const result = await validateFileSecurity(filePath, tmpDir, config);
    const sizeDet = result.validations.find(v => v.type === 'size');
    expect(sizeDet?.passed).toBe(true);
  });
});

// ──────────────────────────────────────────────────────────────
// T016: maskSensitiveFields ユニットテスト
// ──────────────────────────────────────────────────────────────
describe('maskSensitiveFields', () => {
  const baseEntry: AuditLogEntry = {
    id: 'test-id',
    event: 'completed',
    timestamp: '2026-06-01T00:00:00Z',
    filePath: '/tmp/watch/test.txt',
    contractSubject: '秘密の契約対象',
    contractPeriod: { start: '2026-01-01', end: '2026-12-31', note: null },
  };

  it('sensitiveFields に指定されたフィールドを [REDACTED] に置換する', () => {
    const masked = maskSensitiveFields(baseEntry, ['contractSubject']);
    expect(masked.contractSubject).toBe('[REDACTED]');
  });

  it('sensitiveFields に指定されていないフィールドは変更しない', () => {
    const masked = maskSensitiveFields(baseEntry, ['contractSubject']);
    expect(masked.filePath).toBe('/tmp/watch/test.txt');
    expect(masked.event).toBe('completed');
  });

  it('複数フィールドをまとめてマスクする', () => {
    const masked = maskSensitiveFields(baseEntry, ['contractSubject', 'contractPeriod']);
    expect(masked.contractSubject).toBe('[REDACTED]');
    expect(masked.contractPeriod).toBe('[REDACTED]');
  });

  it('空配列のとき元のエントリをそのまま返す', () => {
    const masked = maskSensitiveFields(baseEntry, []);
    expect(masked.contractSubject).toBe('秘密の契約対象');
  });

  it('存在しないフィールド名を指定してもエラーにならない', () => {
    const masked = maskSensitiveFields(baseEntry, ['nonExistentField']);
    expect(masked.contractSubject).toBe('秘密の契約対象');
  });
});

// ──────────────────────────────────────────────────────────────
// T018: validateMimeType ユニットテスト
// ──────────────────────────────────────────────────────────────
describe('validateMimeType', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'owasp-mime-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('正常なテキストファイル (.txt) は passed: true を返す', async () => {
    const filePath = join(tmpDir, 'normal.txt');
    await writeFile(filePath, 'Hello World');
    const result = await validateMimeType(filePath, '.txt');
    expect(result.passed).toBe(true);
  });

  it('正常な Markdown ファイル (.md) は passed: true を返す', async () => {
    const filePath = join(tmpDir, 'readme.md');
    await writeFile(filePath, '# Title');
    const result = await validateMimeType(filePath, '.md');
    expect(result.passed).toBe(true);
  });

  it('拡張子なし (空文字) のファイルは passed: false を返す', async () => {
    const filePath = join(tmpDir, 'noext');
    await writeFile(filePath, 'binary data');
    const result = await validateMimeType(filePath, '');
    expect(result.passed).toBe(false);
    expect(result.detail).toMatch(/拡張子なし/);
  });

  it('PDFバイトを .txt に改名したファイルは passed: false を返す（偽装検出）', async () => {
    // PDF のマジックナンバー %PDF-
    const pdfMagic = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);
    const filePath = join(tmpDir, 'fake.txt');
    await writeFile(filePath, pdfMagic);
    const result = await validateMimeType(filePath, '.txt');
    expect(result.passed).toBe(false);
    expect(result.detail).toMatch(/コンテンツタイプ不一致/);
  });

  it('未対応の拡張子 (.xyz) は passed: false を返す', async () => {
    const filePath = join(tmpDir, 'file.xyz');
    await writeFile(filePath, 'some data');
    const result = await validateMimeType(filePath, '.xyz');
    expect(result.passed).toBe(false);
    expect(result.detail).toMatch(/未対応/);
  });
});
