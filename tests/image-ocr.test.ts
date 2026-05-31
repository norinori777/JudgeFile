/**
 * image-ocr.test.ts
 *
 * T007 (US1): extractImage() ユニットテスト
 * T008 (US2): Queue — 空テキスト → skipped
 * T009 (US3): Queue — エラー → failed + reviewDir 移動 / 後続ジョブ継続
 * FR-008 検証: completedEntry に text フィールドが含まれないこと
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Hoisted mock factories（vi.mock より先に定義が必要）──────────────────────

const { mockCreate, mockModerationsCreate, mockStat, mockReadFile, mockFsMkdir } = vi.hoisted(() => ({
  mockCreate: vi.fn(),
  mockModerationsCreate: vi.fn(),
  mockStat: vi.fn(),
  mockReadFile: vi.fn(),
  mockFsMkdir: vi.fn(),
}));

// ─── Module mocks ────────────────────────────────────────────────────────────

/** T007: Vision API モック / Queue の Moderation モック */
vi.mock('openai', () => ({
  default: vi.fn().mockImplementation(() => ({
    chat: { completions: { create: mockCreate } },
    moderations: { create: mockModerationsCreate },
  })),
}));

/** T007: fs/promises モック（extractImage が使用） */
vi.mock('node:fs/promises', () => ({
  stat: mockStat,
  readFile: mockReadFile,
}));

/** T008/T009: Queue が依存する extractor をモック */
vi.mock('../src/extractor/index.js', () => ({
  extract: vi.fn(),
}));

/** T008/T009: Queue が依存する classifier をモック */
vi.mock('../src/classifier/index.js', () => ({
  classify: vi.fn(),
}));

/** T008/T009: Queue が依存する router をモック */
vi.mock('../src/router/index.js', () => ({
  route: vi.fn(),
  moveFile: vi.fn(),
  resolveDestination: vi.fn(),
}));

/** T008/T009: Queue が依存する logger をモック */
vi.mock('../src/logger/index.js', () => ({
  writeLog: vi.fn(),
}));

/** T009: Queue の catch ブロックが使う fs.mkdir をモック */
vi.mock('node:fs', () => ({
  promises: { mkdir: mockFsMkdir },
}));

/** Queue.enqueue() のセキュリティ検証をバイパス（Queue のユニットテストでは常に passed にする） */
vi.mock('../src/extractor/security.js', () => ({
  validateFileSecurity: vi.fn().mockResolvedValue({
    passed: true,
    fileSizeBytes: 1024,
    validations: [],
  }),
}));

// ─── Imports（モック宣言の後に配置） ─────────────────────────────────────────

import { extractImage } from '../src/extractor/image.js';
import { Queue } from '../src/queue/index.js';
import { extract } from '../src/extractor/index.js';
import { classify } from '../src/classifier/index.js';
import { route, moveFile, resolveDestination } from '../src/router/index.js';
import { writeLog } from '../src/logger/index.js';
import { ConfigSchema } from '../src/config/schema.js';

// ─── 共通テスト設定 ──────────────────────────────────────────────────────────

/** extractImage ユニットテスト用設定（maxChars を最小値 1000 に設定して切り捨てテストを実施） */
const ocrConfig = ConfigSchema.parse({
  watchDir: '/tmp/watch',
  logFile: '/tmp/audit.jsonl',
  reviewDir: '/tmp/review',
  maxChars: 1000,
  routes: {},
});

/** Queue 統合テスト用設定 */
const queueConfig = ConfigSchema.parse({
  watchDir: '/tmp/watch',
  logFile: '/tmp/audit.jsonl',
  reviewDir: '/tmp/review',
  routes: { contract: '/tmp/contract' },
  maxConcurrency: 1,
});

/** 標準的な分類結果（Queue テスト用モック戻り値） */
const mockClassification = {
  category: 'contract',
  confidence: 0.95,
  tags: ['テスト'],
  summary: '',
  confidentiality: 'low' as const,
  destination: '/tmp/contract',
};

beforeEach(() => {
  vi.clearAllMocks();
  mockFsMkdir.mockResolvedValue(undefined);
  // デフォルト: Moderation はフラグなし（Queue テストが classify まで到達できるよう）
  mockModerationsCreate.mockResolvedValue({
    results: [{ flagged: false, categories: { violence: false, hate: false, 'hate/threatening': false, 'self-harm': false, sexual: false, 'sexual/minors': false, 'violence/graphic': false } }],
  });
});

// ════════════════════════════════════════════════════════════════════════════
// T007: extractImage() ユニットテスト（US1）
// ════════════════════════════════════════════════════════════════════════════

describe('extractImage()', () => {
  beforeEach(() => {
    // デフォルト: ファイルサイズ 1 MB（maxImageSizeMB=10 を下回る）
    mockStat.mockResolvedValue({ size: 1 * 1024 * 1024 });
    mockReadFile.mockResolvedValue(Buffer.from('fake-png-data'));
  });

  it('テキストを含む画像を正常に OCR し ocrEngine フィールドを付与する（FR-002/011）', async () => {
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: 'Invoice No. 1234\nTotal: $500' } }],
    });

    const result = await extractImage('/test/invoice.png', ocrConfig);

    expect(result.text).toBe('Invoice No. 1234\nTotal: $500');
    expect(result.ocrEngine).toBe('openai-vision');
    expect(result.charCount).toBe('Invoice No. 1234\nTotal: $500'.length);
    expect(result.truncationWarning).toBeUndefined();
    expect(result.filePath).toBe('/test/invoice.png');
  });

  it('maxChars を超えるテキストは切り捨て truncationWarning を付与する（FR-003）', async () => {
    const longText = 'x'.repeat(2000); // maxChars=1000 を超える
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: longText } }],
    });

    const result = await extractImage('/test/image.png', ocrConfig);

    expect(result.charCount).toBe(1000);
    expect(result.text).toBe('x'.repeat(1000));
    expect(result.truncationWarning).toBeDefined();
    expect(result.ocrEngine).toBe('openai-vision');
  });

  it('日本語テキストを含む画像を正常に OCR する（FR-009）', async () => {
    const japaneseText = '請求書\n株式会社テスト\n合計金額: 10,000円';
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: japaneseText } }],
    });

    const result = await extractImage('/test/document.png', ocrConfig);

    expect(result.text).toBe(japaneseText);
    expect(result.ocrEngine).toBe('openai-vision');
  });

  it('3 行以上の連続改行を 2 行に正規化する（FR-002 / Q4）', async () => {
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: 'line1\n\n\n\nline2' } }],
    });

    const result = await extractImage('/test/image.png', ocrConfig);

    expect(result.text).toBe('line1\n\nline2');
  });

  it('maxImageSizeMB を超える画像は Error を throw する（FR-006）', async () => {
    mockStat.mockResolvedValue({ size: 11 * 1024 * 1024 }); // 11 MB > 10 MB

    await expect(extractImage('/test/large.png', ocrConfig)).rejects.toThrow(
      /maxImageSizeMB/,
    );
  });

  it('Vision API が空文字を返した場合も ExtractedText を返す（空テキスト判定は Queue 層で行う）', async () => {
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: '' } }],
    });

    const result = await extractImage('/test/blank.png', ocrConfig);

    expect(result.text).toBe('');
    expect(result.ocrEngine).toBe('openai-vision');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// T008: Queue — 空テキスト → skipped（US2）
// ════════════════════════════════════════════════════════════════════════════

describe('Queue: 空テキスト → skipped（US2 / FR-005）', () => {
  it('Vision API が空文字を返す場合 event: skipped を記録し classify を呼び出さない', async () => {
    vi.mocked(extract).mockResolvedValue({
      filePath: '/tmp/watch/blank.png',
      text: '',
      charCount: 0,
      ocrEngine: 'openai-vision',
    });

    const queue = new Queue(queueConfig);
    queue.enqueue('/tmp/watch/blank.png');
    await queue.onIdle();

    const allCalls = vi.mocked(writeLog).mock.calls.map(([entry]) => entry.event);
    expect(allCalls).toContain('skipped');
    expect(vi.mocked(classify)).not.toHaveBeenCalled();
  });

  it('skipped ジョブの後に続くジョブが正常処理される（SC-003 — 後続継続）', async () => {
    vi.mocked(extract)
      .mockResolvedValueOnce({ filePath: '/tmp/blank.png', text: '', charCount: 0 })
      .mockResolvedValueOnce({
        filePath: '/tmp/doc.png',
        text: '請求書の内容',
        charCount: 7,
        ocrEngine: 'openai-vision',
      });

    vi.mocked(classify).mockResolvedValue(mockClassification);
    vi.mocked(route).mockResolvedValue({ moveType: 'auto', destDir: '/tmp/contract' });
    vi.mocked(resolveDestination).mockResolvedValue('/tmp/contract/doc.png');
    vi.mocked(moveFile).mockResolvedValue(undefined);

    const queue = new Queue(queueConfig);
    queue.enqueue('/tmp/blank.png');
    queue.enqueue('/tmp/doc.png');
    await queue.onIdle();

    const events = vi.mocked(writeLog).mock.calls.map(([e]) => e.event);
    expect(events).toContain('skipped');
    expect(events).toContain('completed');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// T009: Queue — エラー → failed + reviewDir 移動 / 後続継続（US3）
// ════════════════════════════════════════════════════════════════════════════

describe('Queue: エラー → failed（US3 / FR-006/007）', () => {
  it('extract が throw した場合 event: failed を記録し reviewDir へ移動する', async () => {
    vi.mocked(extract).mockRejectedValue(
      new Error('maxImageSizeMB (10 MB) を超えています'),
    );
    vi.mocked(resolveDestination).mockResolvedValue('/tmp/review/large.png');
    vi.mocked(moveFile).mockResolvedValue(undefined);

    const queue = new Queue(queueConfig);
    queue.enqueue('/tmp/large.png');
    await queue.onIdle();

    const calls = vi.mocked(writeLog).mock.calls;
    const failedCall = calls.find(([e]) => e.event === 'failed');
    expect(failedCall).toBeDefined();
    expect(failedCall![0].error).toContain('maxImageSizeMB');
    expect(vi.mocked(moveFile)).toHaveBeenCalled();
  });

  it('破損ファイルで extract が throw した場合も後続ジョブが継続する（SC-003）', async () => {
    vi.mocked(extract)
      .mockRejectedValueOnce(new Error('file corrupted'))
      .mockResolvedValueOnce({
        filePath: '/tmp/doc.txt',
        text: 'Normal text',
        charCount: 11,
      });

    vi.mocked(classify).mockResolvedValue(mockClassification);
    vi.mocked(route).mockResolvedValue({ moveType: 'auto', destDir: '/tmp/contract' });
    vi.mocked(resolveDestination)
      .mockResolvedValueOnce('/tmp/review/corrupt.png')
      .mockResolvedValueOnce('/tmp/contract/doc.txt');
    vi.mocked(moveFile).mockResolvedValue(undefined);

    const queue = new Queue(queueConfig);
    queue.enqueue('/tmp/corrupt.png');
    queue.enqueue('/tmp/doc.txt');
    await queue.onIdle();

    const events = vi.mocked(writeLog).mock.calls.map(([e]) => e.event);
    expect(events).toContain('failed');
    expect(events).toContain('completed');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// FR-008 検証: completedEntry に text フィールドが含まれないこと
// ════════════════════════════════════════════════════════════════════════════

describe('FR-008: テキスト本文はログに含まれない', () => {
  it('completedEntry に text フィールドが含まれず ocrEngine が付与される（FR-008/011）', async () => {
    vi.mocked(extract).mockResolvedValue({
      filePath: '/tmp/doc.png',
      text: '機密文書の内容',
      charCount: 7,
      ocrEngine: 'openai-vision',
    });
    vi.mocked(classify).mockResolvedValue(mockClassification);
    vi.mocked(route).mockResolvedValue({ moveType: 'auto', destDir: '/tmp/contract' });
    vi.mocked(resolveDestination).mockResolvedValue('/tmp/contract/doc.png');
    vi.mocked(moveFile).mockResolvedValue(undefined);

    const queue = new Queue(queueConfig);
    queue.enqueue('/tmp/doc.png');
    await queue.onIdle();

    const completedCall = vi.mocked(writeLog).mock.calls.find(
      ([entry]) => entry.event === 'completed',
    );
    expect(completedCall).toBeDefined();
    // FR-008: テキスト本文はログに書き出してはならない
    expect(completedCall![0]).not.toHaveProperty('text');
    // FR-011: OCR 処理を経たファイルには ocrEngine が付与される
    expect(completedCall![0].ocrEngine).toBe('openai-vision');
  });

  it('txt/md 処理の completedEntry には ocrEngine が付与されない（後方互換）', async () => {
    vi.mocked(extract).mockResolvedValue({
      filePath: '/tmp/doc.txt',
      text: 'Plain text content',
      charCount: 18,
      // ocrEngine なし
    });
    vi.mocked(classify).mockResolvedValue(mockClassification);
    vi.mocked(route).mockResolvedValue({ moveType: 'auto', destDir: '/tmp/contract' });
    vi.mocked(resolveDestination).mockResolvedValue('/tmp/contract/doc.txt');
    vi.mocked(moveFile).mockResolvedValue(undefined);

    const queue = new Queue(queueConfig);
    queue.enqueue('/tmp/doc.txt');
    await queue.onIdle();

    const completedCall = vi.mocked(writeLog).mock.calls.find(
      ([entry]) => entry.event === 'completed',
    );
    expect(completedCall).toBeDefined();
    expect(completedCall![0]).not.toHaveProperty('text');
    expect(completedCall![0]).not.toHaveProperty('ocrEngine');
  });
});
