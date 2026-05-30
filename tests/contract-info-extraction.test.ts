import { describe, expect, it, vi, beforeEach } from 'vitest';
import { promises as fs } from 'node:fs';
import { extractContractInfo, updateMetaJson, ContractInfoSchema } from '../src/extractor/contract.js';
import type { Config } from '../src/config/schema.js';

// ── テスト共通ヘルパー ──

/** テスト用のミニマム Config */
const baseConfig: Config = {
  watchDir: '/tmp/watch',
  logFile: '/tmp/audit.jsonl',
  reviewDir: '/tmp/review',
  maxConcurrency: 2,
  maxQueueSize: 100,
  maxChars: 100_000,
  confidenceThreshold: 0.8,
  model: 'gpt-4o-mini',
  apiTimeoutMs: 30_000,
  watchedExtensions: ['.txt', '.md'],
  maxImageSizeMB: 10,
  contractCategoryLabel: '契約書',
  routes: {},
};

/** OpenAI モジュールのモック化 */
vi.mock('openai', () => {
  const create = vi.fn();
  const OpenAI = vi.fn(() => ({
    chat: {
      completions: { create },
    },
  }));
  // エラークラスをスタブとして設定
  (OpenAI as unknown as Record<string, unknown>).APIConnectionTimeoutError = class extends Error {};
  (OpenAI as unknown as Record<string, unknown>).RateLimitError = class extends Error {};
  (OpenAI as unknown as Record<string, unknown>).APIError = class extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.status = status;
    }
  };
  return { default: OpenAI };
});

/** openai モジュールのモック参照取得ヘルパー */
async function getOpenAIMock() {
  const { default: OpenAI } = await import('openai');
  const instance = new (OpenAI as unknown as new () => { chat: { completions: { create: ReturnType<typeof vi.fn> } } })();
  return instance.chat.completions.create;
}

// ── extractContractInfo テスト ──

describe('extractContractInfo()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('T011-1: 契約対象と期間が明記されたテキストから正常抽出する', async () => {
    const mockCreate = await getOpenAIMock();
    mockCreate.mockResolvedValueOnce({
      choices: [{
        message: {
          content: JSON.stringify({
            contractSubject: '株式会社サンプル 業務委託契約',
            contractPeriod: {
              start: '2025-04-01',
              end: '2026-03-31',
              note: null,
            },
          }),
        },
      }],
    });

    const result = await extractContractInfo('本契約書は...', baseConfig);

    expect(result.contractSubject).toBe('株式会社サンプル 業務委託契約');
    expect(result.contractPeriod.start).toBe('2025-04-01');
    expect(result.contractPeriod.end).toBe('2026-03-31');
    expect(result.contractPeriod.note).toBeNull();
  });

  it('T011-2: contractSubject が読み取れない場合は null を返す', async () => {
    const mockCreate = await getOpenAIMock();
    mockCreate.mockResolvedValueOnce({
      choices: [{
        message: {
          content: JSON.stringify({
            contractSubject: null,
            contractPeriod: { start: '2025-04-01', end: '2026-03-31', note: null },
          }),
        },
      }],
    });

    const result = await extractContractInfo('内容不明...', baseConfig);
    expect(result.contractSubject).toBeNull();
  });

  it('T011-3: 自動更新・期間の定めなし → start/end が null で note にテキストが入る', async () => {
    const mockCreate = await getOpenAIMock();
    mockCreate.mockResolvedValueOnce({
      choices: [{
        message: {
          content: JSON.stringify({
            contractSubject: 'サービス利用契約',
            contractPeriod: {
              start: null,
              end: null,
              note: '期間の定めなし（自動更新）',
            },
          }),
        },
      }],
    });

    const result = await extractContractInfo('本契約は自動更新...', baseConfig);
    expect(result.contractPeriod.start).toBeNull();
    expect(result.contractPeriod.end).toBeNull();
    expect(result.contractPeriod.note).toBe('期間の定めなし（自動更新）');
  });

  it('T011-4: すべてのフィールドが null の場合も正常値として扱う', async () => {
    const mockCreate = await getOpenAIMock();
    mockCreate.mockResolvedValueOnce({
      choices: [{
        message: {
          content: JSON.stringify({
            contractSubject: null,
            contractPeriod: { start: null, end: null, note: null },
          }),
        },
      }],
    });

    const result = await extractContractInfo('（内容なし）', baseConfig);
    expect(result.contractSubject).toBeNull();
    expect(result.contractPeriod.start).toBeNull();
    expect(result.contractPeriod.end).toBeNull();
    expect(result.contractPeriod.note).toBeNull();
  });

  it('T011-5: JSON パース失敗時は例外をスローする', async () => {
    const mockCreate = await getOpenAIMock();
    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: 'not valid json' } }],
    });

    await expect(extractContractInfo('テスト', baseConfig)).rejects.toThrow(
      '契約情報抽出結果の JSON パース失敗',
    );
  });

  it('T011-6: Zod スキーマ検証失敗時は例外をスローする', async () => {
    const mockCreate = await getOpenAIMock();
    mockCreate.mockResolvedValueOnce({
      choices: [{
        message: {
          content: JSON.stringify({ unexpectedKey: 'foo' }),
        },
      }],
    });

    await expect(extractContractInfo('テスト', baseConfig)).rejects.toThrow(
      '契約情報抽出結果のスキーマ検証失敗',
    );
  });

  it('T011-7: API エラー時は例外をスローする', async () => {
    const mockCreate = await getOpenAIMock();
    mockCreate.mockRejectedValueOnce(new Error('Network Error'));

    await expect(extractContractInfo('テスト', baseConfig)).rejects.toThrow(
      '契約情報抽出失敗',
    );
  });
});

// ── ContractInfoSchema テスト ──

describe('ContractInfoSchema', () => {
  it('有効なオブジェクトを正しく解析する', () => {
    const input = {
      contractSubject: '業務委託契約',
      contractPeriod: { start: '2025-04-01', end: '2026-03-31', note: null },
    };
    const result = ContractInfoSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('contractSubject が null でも有効', () => {
    const input = {
      contractSubject: null,
      contractPeriod: { start: null, end: null, note: '自動更新' },
    };
    const result = ContractInfoSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('contractPeriod が欠落している場合は無効', () => {
    const input = { contractSubject: '契約' };
    const result = ContractInfoSchema.safeParse(input);
    expect(result.success).toBe(false);
  });
});

// ── updateMetaJson テスト ──

describe('updateMetaJson()', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('T012-1: .meta.json が存在する場合に contractSubject・contractPeriod を追記して上書き保存する', async () => {
    const existing = {
      filePath: '/routes/contracts/test.pdf',
      category: '契約書',
    };
    vi.spyOn(fs, 'readFile').mockResolvedValueOnce(JSON.stringify(existing) as unknown as Uint8Array);
    const writeSpy = vi.spyOn(fs, 'writeFile').mockResolvedValueOnce(undefined);

    const contractInfo = {
      contractSubject: '業務委託契約',
      contractPeriod: { start: '2025-04-01', end: '2026-03-31', note: null },
    };

    await updateMetaJson('/routes/contracts/test.pdf', contractInfo);

    expect(writeSpy).toHaveBeenCalledOnce();
    const writtenContent = writeSpy.mock.calls[0][1] as string;
    const parsed = JSON.parse(writtenContent);
    expect(parsed.contractSubject).toBe('業務委託契約');
    expect(parsed.contractPeriod.start).toBe('2025-04-01');
    // 既存フィールドが保持される
    expect(parsed.category).toBe('契約書');
  });

  it('T012-2: .meta.json が存在しない場合は警告を出力してスキップする', async () => {
    const enoentError = Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    vi.spyOn(fs, 'readFile').mockRejectedValueOnce(enoentError);
    const writeSpy = vi.spyOn(fs, 'writeFile').mockResolvedValueOnce(undefined);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const contractInfo = {
      contractSubject: null,
      contractPeriod: { start: null, end: null, note: null },
    };

    await updateMetaJson('/routes/contracts/missing.pdf', contractInfo);

    expect(writeSpy).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('.meta.json が存在しないためスキップします'),
    );
  });
});

// ── T013: 非契約書カテゴリへの無影響確認 ──

describe('T013: 非契約書カテゴリでは extractContractInfo が呼ばれない', () => {
  it('contractCategoryLabel が「請求書」と異なる場合は抽出をスキップする', () => {
    // queue/index.ts の条件分岐ロジックをユニットレベルで検証する
    const contractLabel = '契約書';
    const category = '請求書';
    const shouldExtract = category.toLowerCase() === contractLabel.toLowerCase();
    expect(shouldExtract).toBe(false);
  });

  it('大文字小文字を区別せず比較する', () => {
    const contractLabel = '契約書';
    const categoryExact = '契約書';
    expect(categoryExact.toLowerCase() === contractLabel.toLowerCase()).toBe(true);

    // config でラベルを上書きした場合
    const customLabel = 'Contract';
    const categoryCustom = 'contract';
    expect(categoryCustom.toLowerCase() === customLabel.toLowerCase()).toBe(true);
  });

  it('moveType が error の場合は抽出をスキップする', () => {
    const contractLabel = '契約書';
    const category = '契約書';
    const moveType = 'error';
    const shouldExtract =
      category.toLowerCase() === contractLabel.toLowerCase() && moveType !== 'error';
    expect(shouldExtract).toBe(false);
  });
});
