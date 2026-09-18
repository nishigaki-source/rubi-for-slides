import { describe, expect, it } from 'vitest';
import { createGradeFilter, isValidGradeTable, sanitizeGradeTable } from '@core/gradeFilter';

describe('createGradeFilter', () => {
  it('有効なmaxGradeで設定オブジェクトを作る', () => {
    const filter = createGradeFilter(3, { 学: 1 });
    expect(filter).toEqual({ maxGrade: 3, gradeTable: { 学: 1 } });
  });

  it('範囲外のmaxGradeは例外を投げる', () => {
    expect(() => createGradeFilter(0, {})).toThrow(RangeError);
    expect(() => createGradeFilter(7, {})).toThrow(RangeError);
    expect(() => createGradeFilter(1.5, {})).toThrow(RangeError);
  });
});

describe('isValidGradeTable', () => {
  it('1〜6の整数のみで構成されたテーブルはtrue', () => {
    expect(isValidGradeTable({ 学: 1, 校: 6 })).toBe(true);
  });

  it('範囲外の値やキーが複数文字のエントリはfalse', () => {
    expect(isValidGradeTable({ 学: 0 })).toBe(false);
    expect(isValidGradeTable({ 学: 7 })).toBe(false);
    expect(isValidGradeTable({ 学校: 1 })).toBe(false);
    expect(isValidGradeTable({ 学: '1' })).toBe(false);
  });

  it('オブジェクトでない値はfalse', () => {
    expect(isValidGradeTable(null)).toBe(false);
    expect(isValidGradeTable('not an object')).toBe(false);
    expect(isValidGradeTable(42)).toBe(false);
  });
});

describe('sanitizeGradeTable', () => {
  it('妥当なエントリだけを残す(_commentのようなメタデータは無視)', () => {
    const raw = { _comment: 'サンプルです', 学: 1, 校: 1, 不正: 9, 複数文字キー: 2 };
    expect(sanitizeGradeTable(raw)).toEqual({ 学: 1, 校: 1 });
  });

  it('オブジェクトでない入力は空オブジェクトを返す', () => {
    expect(sanitizeGradeTable(null)).toEqual({});
    expect(sanitizeGradeTable('invalid')).toEqual({});
  });
});
