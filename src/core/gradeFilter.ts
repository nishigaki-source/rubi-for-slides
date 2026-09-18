/**
 * 学年別漢字配当表まわりの小さなヘルパー。
 *
 * 実データ（public/data/kanji-grades.json）については README を参照。
 * 既定値は「フィルタなし」（PLAN.md の決定事項）なので、このモジュールは
 * オプトインで学年フィルタを使いたい場合にのみ呼び出す。
 */

import type { GradeFilterOptions, KanjiGradeTable } from './types';

export const MIN_GRADE = 1;
export const MAX_GRADE = 6;

/**
 * 学年フィルタの設定を作る。
 * @param maxGrade 1〜6。この学年以下で習う漢字だけのトークンはルビ対象外にする。
 * @param gradeTable 学年別漢字配当表
 */
export function createGradeFilter(
  maxGrade: number,
  gradeTable: KanjiGradeTable
): GradeFilterOptions {
  if (!Number.isInteger(maxGrade) || maxGrade < MIN_GRADE || maxGrade > MAX_GRADE) {
    throw new RangeError(`maxGrade must be an integer between ${MIN_GRADE} and ${MAX_GRADE}`);
  }
  return { maxGrade, gradeTable };
}

/**
 * 学年別漢字配当表 JSON の形式検証。
 * 値は 1〜6 の整数であることを想定する。
 */
export function isValidGradeTable(data: unknown): data is KanjiGradeTable {
  if (typeof data !== 'object' || data === null) return false;
  return Object.entries(data as Record<string, unknown>).every(
    ([key, value]) =>
      Array.from(key).length === 1 &&
      typeof value === 'number' &&
      Number.isInteger(value) &&
      value >= MIN_GRADE &&
      value <= MAX_GRADE
  );
}

/**
 * 生の JSON から、学年別漢字配当表として妥当なエントリだけを抽出する(寛容な変換)。
 * `_comment` のようなメタデータキーや不正な値は黙って無視する。
 * public/data/*.json をそのまま読み込むときに使う想定。
 */
export function sanitizeGradeTable(data: unknown): KanjiGradeTable {
  if (typeof data !== 'object' || data === null) return {};
  const result: KanjiGradeTable = {};
  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    if (
      Array.from(key).length === 1 &&
      typeof value === 'number' &&
      Number.isInteger(value) &&
      value >= MIN_GRADE &&
      value <= MAX_GRADE
    ) {
      result[key] = value;
    }
  }
  return result;
}
