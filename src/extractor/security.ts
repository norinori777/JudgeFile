/**
 * src/extractor/security.ts
 *
 * パイプライン最前段のセキュリティ検証モジュール（Round 9: OWASPセキュリティ強化）。
 * 4つの検証関数を提供する:
 *   - isPathAllowed        パストラバーサルチェック（FR-001, FR-002）
 *   - getFileSizeLimit     拡張子別サイズ上限取得（FR-003, FR-005）
 *   - validateMimeType     MIMEタイプ検証（FR-008）
 *   - validateFileSecurity 全検証を束ねる統合関数（FR-009）
 */

import { resolve, extname } from 'node:path';
import { stat } from 'node:fs/promises';
import { fileTypeFromFile } from 'file-type';
import type { Config } from '../config/schema.js';
import type { SecurityValidationResult, ValidationDetail } from '../types/index.js';

// テキスト系拡張子（MIMEがundefinedでも許容する）
const TEXT_EXTENSIONS = new Set(['.txt', '.md', '.csv', '.log']);

// 拡張子 → 期待MIMEプレフィックス のマッピング
const MIME_MAP: Record<string, string> = {
  '.pdf':  'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif':  'image/gif',
  '.webp': 'image/webp',
};

/**
 * ターゲットパスが allowedRoot の配下にあるかを検証する（FR-001, FR-002）。
 *
 * path.resolve() で正規化し ../シーケンスを解消する。
 * Null バイトを含む文字列は即時拒否する。
 *
 * @returns true = 許可範囲内、false = 範囲外または不正パス
 */
export function isPathAllowed(targetPath: string, allowedRoot: string): boolean {
  // Null バイト・制御文字チェック
  if (targetPath.includes('\0') || allowedRoot.includes('\0')) {
    return false;
  }

  const normalizedTarget = resolve(targetPath);
  const normalizedRoot   = resolve(allowedRoot);

  // allowedRoot 自身またはその配下であることを確認
  return normalizedTarget === normalizedRoot ||
    normalizedTarget.startsWith(normalizedRoot + '/') ||
    normalizedTarget.startsWith(normalizedRoot + '\\');
}

/**
 * 拡張子に対応するファイルサイズ上限をバイト単位で返す（FR-003, FR-005）。
 *
 * config.maxFileSizeMB にタイプ別設定があればそれを使用し、
 * なければ config.maxFileSizeMB.default（デフォルト 50MB）を使用する。
 */
export function getFileSizeLimit(ext: string, config: Config): number {
  const limits = config.maxFileSizeMB as Record<string, number>;
  const normalizedExt = ext.toLowerCase();
  // 入力した拡張子を小文字に正規化した上でキーを検索する（大文字小文字を区別しない）
  const directHit = limits[normalizedExt];
  if (directHit !== undefined) return directHit * 1024 * 1024;
  // キー側も正規化して探す
  const caseInsensitiveHit = Object.entries(limits).find(
    ([k]) => k.toLowerCase() === normalizedExt && k !== 'default',
  )?.[1];
  if (caseInsensitiveHit !== undefined) return caseInsensitiveHit * 1024 * 1024;
  const mbLimit = limits['default'] ?? 50;
  return mbLimit * 1024 * 1024;
}

/**
 * ファイルのMIMEタイプを検証する（FR-008）。
 *
 * - 拡張子なし → 即時拒否
 * - テキスト系（.txt / .md 等）→ file-type が undefined を返すのは正常（許容）
 * - その他 → file-type の検出結果と拡張子マッピングを照合し、不一致は拒否
 *
 * @returns ValidationDetail（type: 'mime'）
 */
export async function validateMimeType(filePath: string, ext: string): Promise<ValidationDetail> {
  // 拡張子なし
  if (!ext) {
    return {
      type: 'mime',
      passed: false,
      detail: '拡張子なし: 処理対象外として拒否',
    };
  }

  // テキスト系はマジックナンバーが存在しない場合が多いため、拒否しない
  if (TEXT_EXTENSIONS.has(ext.toLowerCase())) {
    const detected = await fileTypeFromFile(filePath);
    if (detected !== undefined) {
      // バイナリコンテンツを持つのに拡張子がテキスト系 → 偽装とみなして拒否
      return {
        type: 'mime',
        passed: false,
        detail: `コンテンツタイプ不一致: 拡張子 ${ext} に対して ${detected.mime} を検出`,
      };
    }
    return { type: 'mime', passed: true };
  }

  // バイナリ系: MIMEマッピングがない拡張子はサポート外として拒否
  const expectedMime = MIME_MAP[ext.toLowerCase()];
  if (!expectedMime) {
    return {
      type: 'mime',
      passed: false,
      detail: `未対応の拡張子: ${ext}`,
    };
  }

  const detected = await fileTypeFromFile(filePath);
  if (!detected) {
    return {
      type: 'mime',
      passed: false,
      detail: `MIMEタイプを検出できませんでした (拡張子: ${ext})`,
    };
  }

  if (detected.mime !== expectedMime) {
    return {
      type: 'mime',
      passed: false,
      detail: `コンテンツタイプ不一致: 拡張子 ${ext} に対して ${detected.mime} を検出 (期待: ${expectedMime})`,
    };
  }

  return { type: 'mime', passed: true };
}

/**
 * ファイルのセキュリティ検証を全て実行する統合関数（FR-009）。
 *
 * 実行順: パス検証 → サイズ検証 → MIMEタイプ検証
 * 最初の失敗で rejectionReason を設定するが、全検証を記録する。
 *
 * @param filePath  検証対象ファイルの絶対パス
 * @param allowedRoot  許可されたルートディレクトリ（通常は config.watchDir）
 * @param config    アプリケーション設定
 */
export async function validateFileSecurity(
  filePath: string,
  allowedRoot: string,
  config: Config,
): Promise<SecurityValidationResult> {
  const validations: ValidationDetail[] = [];
  let rejectionReason: string | undefined;
  let fileSizeBytes = 0;
  let detectedMimeType: string | undefined;

  // ── パス検証 (FR-001, FR-002) ──
  const pathAllowed = isPathAllowed(filePath, allowedRoot);
  const pathDetail: ValidationDetail = {
    type: 'path',
    passed: pathAllowed,
    detail: pathAllowed ? undefined : `watchDir外のパス: ${filePath}`,
  };
  validations.push(pathDetail);
  if (!pathAllowed && !rejectionReason) {
    rejectionReason = pathDetail.detail;
  }

  // ── サイズ検証 (FR-004, FR-005) ──
  try {
    const s = await stat(filePath);
    fileSizeBytes = s.size;
    const ext = extname(filePath);
    const limitBytes = getFileSizeLimit(ext, config);
    const sizeOk = fileSizeBytes <= limitBytes;
    const sizeDetail: ValidationDetail = {
      type: 'size',
      passed: sizeOk,
      detail: sizeOk
        ? undefined
        : `サイズ超過: ${fileSizeBytes} バイト > 上限 ${limitBytes} バイト`,
    };
    validations.push(sizeDetail);
    if (!sizeOk && !rejectionReason) {
      rejectionReason = sizeDetail.detail;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const sizeDetail: ValidationDetail = {
      type: 'size',
      passed: false,
      detail: `ファイルサイズ取得失敗: ${msg}`,
    };
    validations.push(sizeDetail);
    if (!rejectionReason) {
      rejectionReason = sizeDetail.detail;
    }
  }

  // ── MIMEタイプ検証 (FR-008) ──
  const ext = extname(filePath);
  try {
    const mimeDetail = await validateMimeType(filePath, ext);
    validations.push(mimeDetail);
    if (!mimeDetail.passed && !rejectionReason) {
      rejectionReason = mimeDetail.detail;
    }
    // 検出MIMEを記録（file-typeを再度呼ばないよう、拒否理由から間接取得）
    const rawDetected = await fileTypeFromFile(filePath);
    if (rawDetected) {
      detectedMimeType = rawDetected.mime;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const mimeDetail: ValidationDetail = {
      type: 'mime',
      passed: false,
      detail: `MIME検証エラー: ${msg}`,
    };
    validations.push(mimeDetail);
    if (!rejectionReason) {
      rejectionReason = mimeDetail.detail;
    }
  }

  const passed = validations.every(v => v.passed);

  return {
    passed,
    rejectionReason,
    fileSizeBytes,
    detectedMimeType,
    validations,
  };
}
