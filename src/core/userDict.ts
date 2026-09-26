/**
 * ユーザー辞書まわりの小さなヘルパー。
 * 実際の読み上書き処理は reading.ts の buildRubyToken 内で行う
 * （ユーザー辞書は学年フィルタより優先される）。
 */

import { hasKanji } from './kana';
import type { RubyStyleOverride, UserDictEntry, UserDictionary } from './types';

export interface UserDictEntryInput {
  surface: string;
  /** 省略時は読みを上書きしない(見た目だけ指定する場合)。 */
  reading?: string;
  style?: RubyStyleOverride;
}

export type UserDictErrorCode =
  | 'sizeRatioPositive'
  | 'surfaceRequired'
  | 'surfaceNeedsKanji'
  | 'readingHiragana'
  | 'readingOrStyleRequired'
  | 'invalidJson'
  | 'invalidDictFormat'
  | 'invalidEntryFormat'
  | 'readingNotString'
  | 'invalidStyleFormat'
  | 'fontFamilyNotString'
  | 'colorNotString'
  | 'sizeRatioNotNumber';

/**
 * core/ は DOM・chrome API に依存しない設計(単体テストの主対象)のため、
 * ここではローカライズ済みの文言そのものではなく、UI 側(options/main.ts)が
 * `chrome.i18n` で表示文言に変換するための「エラーコード + 対象の表層形」だけを持つ。
 */
export class UserDictError extends Error {
  readonly code: UserDictErrorCode;
  readonly surface?: string;

  constructor(code: UserDictErrorCode, surface?: string) {
    super(surface ? `${code}: ${surface}` : code);
    this.code = code;
    this.surface = surface;
  }
}

/**
 * 読みはひらがな。漢字ごとの区切りを「|」で指定できる(例: 「始業式」→「し|ぎょう|しき」)。
 * 区切りの前後が空になる書き方(「|し」「し||ぎょう」)は受け付けない。
 */
const HIRAGANA_PATTERN = /^[぀-ゟー]+(\|[぀-ゟー]+)*$/;

function normalizeStyle(style: RubyStyleOverride | undefined): RubyStyleOverride | undefined {
  if (!style) return undefined;
  const next: RubyStyleOverride = {};
  if (style.fontFamily && style.fontFamily.trim().length > 0) next.fontFamily = style.fontFamily.trim();
  if (style.color && style.color.trim().length > 0) next.color = style.color.trim();
  if (style.sizeRatio !== undefined) {
    if (!Number.isFinite(style.sizeRatio) || style.sizeRatio <= 0) {
      throw new UserDictError('sizeRatioPositive');
    }
    next.sizeRatio = style.sizeRatio;
  }
  return Object.keys(next).length > 0 ? next : undefined;
}

/**
 * ユーザー辞書に 1 件追加・上書きする。表層形が空、漢字を含まない、
 * 読みがひらがな以外を含む場合はエラーを投げる（options ページの入力検証用）。
 * 読み・見た目は独立に指定でき、少なくとも一方が必要。
 */
export function upsertEntry(dict: UserDictionary, entry: UserDictEntryInput): UserDictionary {
  const surface = entry.surface.trim();
  const reading = entry.reading?.trim();

  if (surface.length === 0) {
    throw new UserDictError('surfaceRequired');
  }
  if (!hasKanji(surface)) {
    throw new UserDictError('surfaceNeedsKanji');
  }
  if (reading !== undefined && reading.length > 0 && !HIRAGANA_PATTERN.test(reading)) {
    throw new UserDictError('readingHiragana');
  }

  const style = normalizeStyle(entry.style);
  const nextEntry: UserDictEntry = {};
  if (reading) nextEntry.reading = reading;
  if (style) nextEntry.style = style;

  if (!nextEntry.reading && !nextEntry.style) {
    throw new UserDictError('readingOrStyleRequired');
  }

  return { ...dict, [surface]: nextEntry };
}

export function removeEntry(dict: UserDictionary, surface: string): UserDictionary {
  const next = { ...dict };
  delete next[surface];
  return next;
}

/** dict を JSON 文字列にエクスポートする（options ページのバックアップ機能用）。 */
export function exportUserDict(dict: UserDictionary): string {
  return JSON.stringify(dict, null, 2);
}

/** JSON 文字列からユーザー辞書を復元する。不正な形式なら例外を投げる。 */
export function importUserDict(json: string): UserDictionary {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new UserDictError('invalidJson');
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new UserDictError('invalidDictFormat');
  }
  const result: UserDictionary = {};
  for (const [surface, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw new UserDictError('invalidEntryFormat', surface);
    }
    const raw = value as Record<string, unknown>;
    const entry: UserDictEntry = {};

    if (raw.reading !== undefined) {
      if (typeof raw.reading !== 'string') {
        throw new UserDictError('readingNotString', surface);
      }
      entry.reading = raw.reading;
    }

    if (raw.style !== undefined) {
      if (typeof raw.style !== 'object' || raw.style === null || Array.isArray(raw.style)) {
        throw new UserDictError('invalidStyleFormat', surface);
      }
      const rawStyle = raw.style as Record<string, unknown>;
      const style: RubyStyleOverride = {};
      if (rawStyle.fontFamily !== undefined) {
        if (typeof rawStyle.fontFamily !== 'string') {
          throw new UserDictError('fontFamilyNotString', surface);
        }
        style.fontFamily = rawStyle.fontFamily;
      }
      if (rawStyle.color !== undefined) {
        if (typeof rawStyle.color !== 'string') {
          throw new UserDictError('colorNotString', surface);
        }
        style.color = rawStyle.color;
      }
      if (rawStyle.sizeRatio !== undefined) {
        if (typeof rawStyle.sizeRatio !== 'number') {
          throw new UserDictError('sizeRatioNotNumber', surface);
        }
        style.sizeRatio = rawStyle.sizeRatio;
      }
      entry.style = style;
    }

    result[surface] = entry;
  }
  return result;
}
