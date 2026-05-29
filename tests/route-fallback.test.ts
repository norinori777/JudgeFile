import { describe, it, expect, vi, beforeEach } from 'vitest';
import { join } from 'node:path';
import { route } from '../src/router/index.js';
import type { ClassificationResult } from '../src/types/index.js';
import type { Config } from '../src/config/schema.js';

// ファイルシステム操作をモック化（実際のファイル移動を行わない）
// src/router/index.ts は `import { promises as fs } from 'node:fs'` を使用
vi.mock('node:fs', async () => {
  const mockFs = {
    rename: vi.fn().mockResolvedValue(undefined),
    copyFile: vi.fn().mockResolvedValue(undefined),
    unlink: vi.fn().mockResolvedValue(undefined),
    mkdir: vi.fn().mockResolvedValue(undefined),
    // access が失敗 = ファイルが存在しない → candidate をそのまま使う
    access: vi.fn().mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' })),
  };
  return { promises: mockFs, default: { promises: mockFs } };
});

/** テスト用の最小 Config */
function makeConfig(routes: Record<string, string>, threshold = 0.7): Config {
  return {
    watchDir: '/watch',
    logFile: '/log/audit.json',
    reviewDir: '/review',
    maxConcurrency: 2,
    maxQueueSize: 100,
    maxChars: 100_000,
    confidenceThreshold: threshold,
    model: 'gpt-4o-mini',
    apiTimeoutMs: 30_000,
    watchedExtensions: ['.txt', '.md'],
    routes,
  };
}

/** テスト用の最小 ClassificationResult */
function makeClassification(category: string, confidence: number): ClassificationResult {
  return {
    category,
    confidence,
    tags: [],
    summary: 'テスト',
    confidentiality: 'low',
    destination: category,
  };
}

describe('route() — フォールバックロジック', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ケース 1: 完全一致 → 設定済みフォルダへ auto（US1 回帰）
  it('完全一致するカテゴリがある場合は routes[category] へ moveType: auto で振り分ける', async () => {
    const config = makeConfig({
      'スケジュール': '/schedule',
      'その他': '/others',
    });
    const classification = makeClassification('スケジュール', 0.9);

    const decision = await route('/watch/file.txt', classification, config);

    expect(decision.moveType).toBe('auto');
    expect(decision.destDir).toBe(join('/schedule', 'file.txt'));
    expect(decision.reason).toBeUndefined();
  });

  // ケース 2: 不一致 + 「その他」あり → フォールバック（US2）
  it('routes にないカテゴリかつ「その他」が設定されている場合は「その他」へ moveType: auto で振り分け reason を記録する', async () => {
    const config = makeConfig({
      'スケジュール': '/schedule',
      'その他': '/others',
    });
    const classification = makeClassification('法令', 0.85);

    const decision = await route('/watch/file.txt', classification, config);

    expect(decision.moveType).toBe('auto');
    expect(decision.destDir).toBe(join('/others', 'file.txt'));
    expect(decision.reason).toContain('法令');
    expect(decision.reason).toContain('その他');
  });

  // ケース 3: 低信頼スコア → reviewDir へ review（FR-005）
  it('信頼スコアが confidenceThreshold 未満の場合は reviewDir へ moveType: review で振り分ける', async () => {
    const config = makeConfig({
      'スケジュール': '/schedule',
      'その他': '/others',
    });
    const classification = makeClassification('スケジュール', 0.5); // threshold 0.7 未満

    const decision = await route('/watch/file.txt', classification, config);

    expect(decision.moveType).toBe('review');
    expect(decision.destDir).toBe(join('/review', 'file.txt'));
    expect(decision.reason).toContain('信頼スコア不足');
  });

  // ケース 4: 不一致 + 「その他」未設定 → reviewDir へ review（FR-004）
  it('routes にないカテゴリかつ「その他」も設定されていない場合は reviewDir へ moveType: review で振り分ける', async () => {
    const config = makeConfig({
      'スケジュール': '/schedule',
    });
    const classification = makeClassification('法令', 0.9);

    const decision = await route('/watch/file.txt', classification, config);

    expect(decision.moveType).toBe('review');
    expect(decision.destDir).toBe(join('/review', 'file.txt'));
    expect(decision.reason).toContain('法令');
  });
});

describe('buildSystemPrompt — カテゴリ一覧注入', () => {
  it('routeCategories を渡した場合、プロンプトにカテゴリ名が含まれる', async () => {
    const { buildSystemPrompt } = await import('../src/classifier/schema.js');
    const prompt = buildSystemPrompt(['スケジュール', '日記', 'その他']);

    expect(prompt).toContain('スケジュール');
    expect(prompt).toContain('日記');
    expect(prompt).toContain('その他');
    expect(prompt).toContain('振り分け先カテゴリ一覧');
  });

  it('routeCategories が空の場合、カテゴリ一覧セクションを含まない', async () => {
    const { buildSystemPrompt } = await import('../src/classifier/schema.js');
    const prompt = buildSystemPrompt([]);

    expect(prompt).not.toContain('振り分け先カテゴリ一覧');
    expect(prompt).toContain('JSON 形式のみで回答');
  });
});
