/**
 * review CLI — review フォルダのファイルを対話形式で確認・修正・承認する（Round 6）
 *
 * 使用方法:
 *   tsx src/reviewer/index.ts --config ./config.json
 *   node dist/reviewer/index.js --config ./config.json
 *
 * 操作:
 *   y  — AI 推奨の分類・振り分け先で承認
 *   n  — カテゴリ・タグ・振り分け先を手動修正して承認
 *   s  — このファイルをスキップ（review フォルダに残す）
 *
 * FR-010: review 待ちファイルの一覧表示
 * FR-011: 修正フロー（readline）
 * FR-012: ファイル移動
 * FR-013: .meta.json 削除
 * FR-015: テキスト本文はログ・ファイルに書き出さない
 */

import { createInterface } from 'node:readline';
import { promises as fs, readFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadConfig } from '../config/loader.js';
import { moveFile, resolveDestination } from '../router/index.js';
import type { CorrectionRecord, ReviewItem } from '../types/index.js';
import { computeHmac } from '../logger/integrity.js';

// ──────────────────────────────────────────────
// エントリポイント
// ──────────────────────────────────────────────

async function main(): Promise<void> {
  // --config 引数を解析
  const args = process.argv.slice(2);
  const configIdx = args.indexOf('--config');
  const configPath = configIdx !== -1 ? args[configIdx + 1] : './config.json';

  const config = await loadConfig(configPath);
  const reviewDir = config.reviewDir;

  // reviewDir 内の *.meta.json を列挙
  let entries: string[];
  try {
    entries = await fs.readdir(reviewDir);
  } catch {
    console.log('review 待ちのファイルはありません（reviewDir が存在しません）');
    process.exit(0);
  }

  const metaFiles = entries
    .filter((e) => e.endsWith('.meta.json'))
    .sort()
    .map((e) => join(reviewDir, e));

  if (metaFiles.length === 0) {
    console.log('review 待ちのファイルはありません');
    process.exit(0);
  }

  console.log(`\n[JudgeFile Review] review 待ちファイル: ${metaFiles.length} 件\n`);

  // readline インターフェース
  const rl = createInterface({ input: process.stdin, output: process.stdout });

  // SIGINT ハンドラ — 未処理ファイルを review フォルダに残して終了
  let interrupted = false;
  process.on('SIGINT', () => {
    interrupted = true;
    rl.close();
    console.log('\n\n[Review] 中断しました。未処理ファイルは review フォルダに残ります。');
    process.exit(0);
  });

  const correctionsPath = config.correctionsFile ?? join(dirname(config.logFile), 'corrections.jsonl');

  for (const metaPath of metaFiles) {
    if (interrupted) break;

    // .meta.json を読み込む
    let item: ReviewItem;
    try {
      const raw = await fs.readFile(metaPath, 'utf-8');
      const meta = JSON.parse(raw) as {
        filePath: string;
        originalName: string;
        category: string;
        tags: string[];
        confidence: number;
        confidentiality: 'low' | 'medium' | 'high';
        destination: string;
        queuedAt: string;
      };
      item = {
        filePath: meta.filePath,
        originalName: meta.originalName,
        aiClassification: {
          category: meta.category,
          tags: meta.tags,
          confidence: meta.confidence,
          confidentiality: meta.confidentiality,
          destination: meta.destination,
        },
        queuedAt: meta.queuedAt,
      };
    } catch {
      console.warn(`[Review] meta.json を読み込めません。スキップ: ${metaPath}`);
      continue;
    }

    // 実ファイルが存在するか確認
    try {
      await fs.access(item.filePath);
    } catch {
      console.warn(`[Review] ファイルが見つかりません。スキップ: ${item.filePath}`);
      continue;
    }

    // ファイル情報を表示
    printReviewItem(item, config.routes);

    // 操作入力ループ
    let handled = false;
    while (!handled && !interrupted) {
      const answer = await ask(rl, '操作を選択 [y=承認 / n=修正 / s=スキップ]: ');
      const choice = answer.trim().toLowerCase();

      if (choice === 'y') {
        // 承認フロー
        await handleApprove(item, config.routes, correctionsPath);
        await cleanupMeta(metaPath);
        handled = true;
      } else if (choice === 'n') {
        // 修正フロー
        const corrected = await handleCorrect(item, config.routes, rl);
        if (corrected) {
          await cleanupMeta(metaPath);
          await appendCorrectionRecord(correctionsPath, corrected);
        }
        handled = true;
      } else if (choice === 's') {
        console.log(`  → スキップしました。review フォルダに残ります。\n`);
        handled = true;
      } else {
        console.log('  y / n / s のいずれかを入力してください。');
      }
    }
  }

  rl.close();
  console.log('\n[Review] 完了しました。');
}

// ──────────────────────────────────────────────
// 表示ヘルパー
// ──────────────────────────────────────────────

function printReviewItem(item: ReviewItem, routes: Record<string, string>): void {
  const ai = item.aiClassification;
  const destDir = routes[ai.destination] ?? ai.destination;
  console.log('─'.repeat(60));
  console.log(`ファイル      : ${item.originalName}`);
  console.log(`AI カテゴリ   : ${ai.category}`);
  console.log(`AI タグ       : ${ai.tags.join(', ') || '（なし）'}`);
  console.log(`信頼スコア    : ${(ai.confidence * 100).toFixed(1)}%`);
  console.log(`機密度        : ${ai.confidentiality}`);
  console.log(`推奨振り分け先: ${destDir}`);
  console.log(`review 日時   : ${item.queuedAt}`);
  console.log('─'.repeat(60));
}

// ──────────────────────────────────────────────
// 承認フロー
// ──────────────────────────────────────────────

async function handleApprove(
  item: ReviewItem,
  routes: Record<string, string>,
  correctionsPath: string,
): Promise<void> {
  const ai = item.aiClassification;
  const destDir = routes[ai.destination] ?? item.filePath; // fallback: 移動しない

  if (!routes[ai.destination]) {
    console.warn(`  [警告] routes に "${ai.destination}" が見つかりません。ファイルを移動できません。`);
    return;
  }

  await fs.mkdir(destDir, { recursive: true });
  const dest = await resolveDestination(item.filePath, destDir);
  await moveFile(item.filePath, dest);

  const record: CorrectionRecord = {
    fileName: item.originalName,
    destFilePath: dest,
    aiClassification: { ...ai },
    finalClassification: {
      category: ai.category,
      tags: ai.tags,
      destDir: dest,
    },
    action: 'approved',
    timestamp: new Date().toISOString(),
  };

  await appendCorrectionRecord(correctionsPath, record);
  console.log(`  → 承認して移動しました: ${dest}\n`);
}

// ──────────────────────────────────────────────
// 修正フロー
// ──────────────────────────────────────────────

async function handleCorrect(
  item: ReviewItem,
  routes: Record<string, string>,
  rl: ReturnType<typeof createInterface>,
): Promise<CorrectionRecord | null> {
  const ai = item.aiClassification;

  console.log('\n  --- 修正入力 ---');

  // カテゴリ入力
  const newCategory = (await ask(rl, `  新しいカテゴリ [現在: ${ai.category}]: `)).trim() || ai.category;

  // タグ入力（カンマ区切り）
  const tagsRaw = await ask(rl, `  新しいタグ（カンマ区切り）[現在: ${ai.tags.join(', ')}]: `);
  const newTags = tagsRaw.trim() === '' ? ai.tags : tagsRaw.split(',').map((t) => t.trim()).filter(Boolean);

  // 振り分け先入力（routes キーの番号選択）
  const routeKeys = Object.keys(routes);
  console.log('  振り分け先:');
  routeKeys.forEach((k, i) => console.log(`    ${i + 1}. ${k} → ${routes[k]}`));

  let destDir: string | undefined;
  while (!destDir) {
    const input = (await ask(rl, '  番号を入力: ')).trim();
    const idx = Number(input) - 1;
    if (idx >= 0 && idx < routeKeys.length) {
      destDir = routes[routeKeys[idx]];
    } else {
      console.log(`  1〜${routeKeys.length} の番号を入力してください。`);
    }
  }

  await fs.mkdir(destDir, { recursive: true });
  const dest = await resolveDestination(item.filePath, destDir);
  await moveFile(item.filePath, dest);

  const record: CorrectionRecord = {
    fileName: item.originalName,
    destFilePath: dest,
    aiClassification: { ...ai },
    finalClassification: {
      category: newCategory,
      tags: newTags,
      destDir: dest,
    },
    action: 'corrected',
    timestamp: new Date().toISOString(),
  };

  console.log(`  → 修正して移動しました: ${dest}\n`);
  return record;
}

// ──────────────────────────────────────────────
// ユーティリティ
// ──────────────────────────────────────────────

/** readline で 1 行プロンプト入力を待つ */
function ask(rl: ReturnType<typeof createInterface>, prompt: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => resolve(answer));
  });
}

/** .meta.json を削除する（FR-013） */
async function cleanupMeta(metaPath: string): Promise<void> {
  try {
    await fs.unlink(metaPath);
  } catch {
    console.warn(`[Review] meta.json 削除に失敗: ${metaPath}`);
  }
}

/**
 * corrections.jsonl の最終エントリの currHash を同期的に読み取る（T031）。
 * ファイルが空・存在しない・最終エントリに currHash がない場合は 'genesis' を返す。
 */
function readLastCurrHashFromCorrections(filePath: string): string {
  try {
    const content = readFileSync(filePath, 'utf-8').trimEnd();
    if (!content) return 'genesis';
    const lines = content.split('\n');
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i]?.trim();
      if (!line) continue;
      const parsed = JSON.parse(line) as Partial<CorrectionRecord>;
      if (parsed.currHash) return parsed.currHash;
    }
    return 'genesis';
  } catch {
    return 'genesis';
  }
}

/**
 * CorrectionRecord を corrections.jsonl に JSONL 形式で追記する（FR-015: テキスト本文なし）。
 * hmacSecret が 1 文字以上の場合は prevHash/currHash チェーンを付与する（FR-009）。
 * hmacSecret が未設定 / 空の場合は警告を出して HMAC なしで追記する。
 */
export async function appendCorrectionRecord(
  correctionsPath: string,
  record: CorrectionRecord,
  hmacSecret?: string,
): Promise<void> {
  const secret = hmacSecret ?? process.env.AUDIT_HMAC_SECRET ?? '';
  let recordToWrite: CorrectionRecord;

  if (secret.length > 0) {
    const prevHash = readLastCurrHashFromCorrections(correctionsPath);
    const currHash = computeHmac(JSON.stringify({ ...record, prevHash }), secret);
    recordToWrite = { ...record, prevHash, currHash };
  } else {
    console.warn(
      '[Review] AUDIT_HMAC_SECRET が未設定のため corrections.jsonl の HMAC 保護がスキップされます。',
    );
    recordToWrite = record;
  }

  try {
    await fs.mkdir(dirname(correctionsPath), { recursive: true });
    await fs.appendFile(correctionsPath, JSON.stringify(recordToWrite) + '\n', 'utf-8');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[Review] corrections.jsonl への追記に失敗しました: ${msg}`);
  }
}

// ──────────────────────────────────────────────
// 起動
// ──────────────────────────────────────────────

const isExecutedDirectly = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isExecutedDirectly) {
  main().catch((err) => {
    console.error('[Review] 予期しないエラー:', err);
    process.exit(1);
  });
}
