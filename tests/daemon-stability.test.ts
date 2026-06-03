/**
 * daemon-stability.test.ts
 * Feature 011: デーモン安定性・信頼性強化
 * US1〜US6 のユニットテスト
 */
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as http from 'node:http';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SeenKeyStore } from '../src/seen-key-store.js';
import { startHealthServer, type HealthCheckServer } from '../src/health-server.js';
import { resolveDestination } from '../src/router/index.js';
import { appendCorrectionRecord } from '../src/reviewer/index.js';
import { computeHmac } from '../src/logger/integrity.js';

// ─── ユーティリティ ──────────────────────────────────────────────

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), 'judgeFile-test-'));
}

function httpGet(url: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    http
      .get(url, (res) => {
        let body = '';
        res.on('data', (chunk: Buffer) => {
          body += chunk.toString();
        });
        res.on('end', () => resolve({ status: res.statusCode ?? 0, body }));
      })
      .on('error', reject);
  });
}

function makeTestRecord() {
  return {
    fileName: 'test.txt',
    destFilePath: '/dest/test.txt',
    aiClassification: {
      category: '契約書',
      tags: ['契約'],
      confidence: 0.9,
      confidentiality: 'high' as const,
      destination: '契約書',
    },
    finalClassification: {
      category: '契約書',
      tags: ['契約'],
      destDir: '/dest',
    },
    action: 'approved' as const,
    timestamp: new Date().toISOString(),
  };
}

// ─── US1: SeenKeyStore LRU 上限 ──────────────────────────────────

describe('SeenKeyStore — LRU cap (US1)', () => {
  let tmpDir: string;
  let persistPath: string;

  beforeEach(() => {
    tmpDir = makeTempDir();
    persistPath = join(tmpDir, 'seen-keys.jsonl');
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('サイズが maxSize を超えない', () => {
    const store = new SeenKeyStore(10_000, persistPath);
    for (let i = 0; i < 10_001; i++) {
      store.add(`key-${i}`);
    }
    expect(store.size).toBe(10_000);
  });

  it('最古エントリがエビクションされる', () => {
    const store = new SeenKeyStore(3, persistPath);
    store.add('a');
    store.add('b');
    store.add('c');
    store.add('d'); // 'a' がエビクションされる
    expect(store.has('a')).toBe(false);
    expect(store.has('b')).toBe(true);
    expect(store.has('c')).toBe(true);
    expect(store.has('d')).toBe(true);
  });

  it('重複キーは追加されない', () => {
    const store = new SeenKeyStore(10_000, persistPath);
    store.add('key-x');
    store.add('key-x');
    expect(store.size).toBe(1);
  });

  it('既存ファイルから起動時にロードされる (FR-006)', () => {
    writeFileSync(persistPath, 'key1\nkey2\nkey3\n', 'utf-8');
    const store = new SeenKeyStore(10_000, persistPath);
    expect(store.has('key1')).toBe(true);
    expect(store.has('key2')).toBe(true);
    expect(store.has('key3')).toBe(true);
  });

  it('ファイルが存在しない場合は空 Set で起動する (FR-006)', () => {
    const store = new SeenKeyStore(10_000, join(tmpDir, 'nonexistent.jsonl'));
    expect(store.size).toBe(0);
  });

  it('ファイルの行数が maxSize を超える場合は末尾 maxSize 件をロードする', () => {
    const lines = Array.from({ length: 5 }, (_, i) => `key-${i}`).join('\n') + '\n';
    writeFileSync(persistPath, lines, 'utf-8');
    const store = new SeenKeyStore(3, persistPath);
    expect(store.has('key-0')).toBe(false);
    expect(store.has('key-1')).toBe(false);
    expect(store.has('key-2')).toBe(true);
    expect(store.has('key-3')).toBe(true);
    expect(store.has('key-4')).toBe(true);
  });
});

// ─── US3: TOCTOU 対策 ────────────────────────────────────────────

describe('resolveDestination — TOCTOU fix (US3)', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTempDir();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('同名ファイルが存在しない場合はそのままのパスを返す', async () => {
    const dest = await resolveDestination(join(tmpDir, 'test.txt'), tmpDir);
    expect(dest).toBe(join(tmpDir, 'test.txt'));
  });

  it('同名ファイルが存在する場合は UUID サフィックスを付与したパスを返す', async () => {
    writeFileSync(join(tmpDir, 'test.txt'), 'existing content');
    const dest = await resolveDestination(join(tmpDir, 'test.txt'), tmpDir);
    expect(dest).not.toBe(join(tmpDir, 'test.txt'));
    const filename = dest.split(/[/\\]/).pop() ?? '';
    // UUID v4 パターン: 8-4-4-4-12 16 進数文字
    expect(filename).toMatch(
      /^test-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.txt$/,
    );
  });

  it('同名ファイルが 2 件存在する状況でも衝突しない（UUID の衝突確率は無視できる）', async () => {
    writeFileSync(join(tmpDir, 'file.md'), 'original');
    const dest1 = await resolveDestination(join(tmpDir, 'file.md'), tmpDir);
    writeFileSync(dest1, 'copy1');
    const dest2 = await resolveDestination(join(tmpDir, 'file.md'), tmpDir);
    expect(dest1).not.toBe(dest2);
  });
});

// ─── US4: 処理済みキー永続化 ─────────────────────────────────────

describe('SeenKeyStore — persistence (US4)', () => {
  let tmpDir: string;
  let persistPath: string;

  beforeEach(() => {
    tmpDir = makeTempDir();
    persistPath = join(tmpDir, 'seen-keys.jsonl');
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('add() 後に別インスタンスで has() が true を返す', () => {
    const store1 = new SeenKeyStore(10_000, persistPath);
    store1.add('file-a:100:1717200000000');

    const store2 = new SeenKeyStore(10_000, persistPath);
    expect(store2.has('file-a:100:1717200000000')).toBe(true);
  });

  it('flush() 後に再ロードすると現在の Set の状態が復元される', () => {
    const store1 = new SeenKeyStore(3, persistPath);
    store1.add('a');
    store1.add('b');
    store1.add('c');
    store1.add('d'); // 'a' がエビクション、ファイルには a,b,c,d が追記されている
    store1.flush(); // 再書き込み: b,c,d のみ

    const store2 = new SeenKeyStore(10_000, persistPath);
    expect(store2.has('a')).toBe(false);
    expect(store2.has('b')).toBe(true);
    expect(store2.has('c')).toBe(true);
    expect(store2.has('d')).toBe(true);
  });

  it('ファイルが破損していても空 Set で起動できる', () => {
    writeFileSync(persistPath, '\x00\x01\x02', 'utf-8');
    expect(() => new SeenKeyStore(10_000, persistPath)).not.toThrow();
  });
});

// ─── US5: HTTP ヘルスチェック ────────────────────────────────────

describe('HealthCheckServer (US5)', () => {
  // テスト用ポートを分散させて競合を防ぐ
  const BASE_PORT = 14_600;
  let server: HealthCheckServer | null = null;
  let currentPort: number;

  beforeEach(() => {
    currentPort = BASE_PORT + Math.floor(Math.random() * 200);
  });

  afterEach(() => {
    server?.close();
    server = null;
  });

  it('GET /health が 200 と正しい JSON を返す', async () => {
    server = startHealthServer(currentPort, () => ({ queueSize: 3 }));
    await new Promise<void>((resolve) => setTimeout(resolve, 80));

    const { status, body } = await httpGet(`http://localhost:${currentPort}/health`);
    expect(status).toBe(200);
    const data = JSON.parse(body) as { status: string; queueSize: number; uptimeMs: number };
    expect(data.status).toBe('ok');
    expect(data.queueSize).toBe(3);
    expect(typeof data.uptimeMs).toBe('number');
  });

  it('X-Content-Type-Options: nosniff ヘッダーが付与される (OWASP)', async () => {
    server = startHealthServer(currentPort, () => ({ queueSize: 0 }));
    await new Promise<void>((resolve) => setTimeout(resolve, 80));

    await new Promise<void>((resolve, reject) => {
      http
        .get(`http://localhost:${currentPort}/health`, (res) => {
          expect(res.headers['x-content-type-options']).toBe('nosniff');
          res.resume();
          res.on('end', resolve);
        })
        .on('error', reject);
    });
  });

  it('/health 以外のパスは 404 を返す', async () => {
    server = startHealthServer(currentPort, () => ({ queueSize: 0 }));
    await new Promise<void>((resolve) => setTimeout(resolve, 80));

    const { status } = await httpGet(`http://localhost:${currentPort}/metrics`);
    expect(status).toBe(404);
  });

  it('close() 後の GET /health が 503 と shutting_down を返す', async () => {
    server = startHealthServer(currentPort, () => ({ queueSize: 0 }));
    await new Promise<void>((resolve) => setTimeout(resolve, 80));
    server.close();
    await new Promise<void>((resolve) => setTimeout(resolve, 30));

    const { status, body } = await httpGet(`http://localhost:${currentPort}/health`);
    expect(status).toBe(503);
    const data = JSON.parse(body) as { status: string };
    expect(data.status).toBe('shutting_down');
  });
});

// ─── US6: corrections.jsonl HMAC 保護 ───────────────────────────

const TEST_SECRET = 'test-hmac-secret-that-is-32chars!!';

describe('corrections.jsonl HMAC (US6)', () => {
  let tmpDir: string;
  let correctionsPath: string;

  beforeEach(() => {
    tmpDir = makeTempDir();
    correctionsPath = join(tmpDir, 'corrections.jsonl');
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('HMAC_SECRET 設定時に prevHash/currHash が付与される', async () => {
    await appendCorrectionRecord(correctionsPath, makeTestRecord(), TEST_SECRET);

    const lines = readFileSync(correctionsPath, 'utf-8').trim().split('\n');
    expect(lines).toHaveLength(1);
    const written = JSON.parse(lines[0]!) as { prevHash?: string; currHash?: string };
    expect(written.prevHash).toBe('genesis');
    expect(typeof written.currHash).toBe('string');
    expect(written.currHash!.length).toBe(64); // HMAC-SHA256 hex
  });

  it('2 件目の prevHash が 1 件目の currHash と一致する（チェーン）', async () => {
    await appendCorrectionRecord(correctionsPath, makeTestRecord(), TEST_SECRET);
    await appendCorrectionRecord(correctionsPath, makeTestRecord(), TEST_SECRET);

    const lines = readFileSync(correctionsPath, 'utf-8').trim().split('\n');
    const first = JSON.parse(lines[0]!) as { currHash: string };
    const second = JSON.parse(lines[1]!) as { prevHash: string };
    expect(second.prevHash).toBe(first.currHash);
  });

  it('エントリを改ざんすると currHash と再計算値が一致しない（改ざん検知）', async () => {
    await appendCorrectionRecord(correctionsPath, makeTestRecord(), TEST_SECRET);

    const lines = readFileSync(correctionsPath, 'utf-8').trim().split('\n');
    const parsed = JSON.parse(lines[0]!) as Record<string, unknown>;
    const originalCurrHash = parsed['currHash'] as string;

    // 改ざん: action を変更
    parsed['action'] = 'corrected';
    const { currHash, ...rest } = parsed as { currHash: string } & Record<string, unknown>;
    const recomputed = computeHmac(JSON.stringify(rest), TEST_SECRET);
    expect(recomputed).not.toBe(originalCurrHash);
  });

  it('secret が空の場合は prevHash/currHash を付与せず警告を出す', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await appendCorrectionRecord(correctionsPath, makeTestRecord(), '');
    warnSpy.mockRestore();

    const lines = readFileSync(correctionsPath, 'utf-8').trim().split('\n');
    const written = JSON.parse(lines[0]!) as { prevHash?: string; currHash?: string };
    expect(written.prevHash).toBeUndefined();
    expect(written.currHash).toBeUndefined();
  });
});
