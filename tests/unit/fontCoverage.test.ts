import { describe, expect, it } from 'vitest';
import { firstFontFamily, isLatinOnlyFont } from '@core/fontCoverage';

describe('firstFontFamily', () => {
  it('先頭のフォント名を取り出し、引用符を外す', () => {
    expect(firstFontFamily('Arial')).toBe('Arial');
    expect(firstFontFamily('"Noto Sans JP", Arial, sans-serif')).toBe('Noto Sans JP');
    expect(firstFontFamily("'Times New Roman', serif")).toBe('Times New Roman');
    expect(firstFontFamily('')).toBe('');
  });
});

describe('isLatinOnlyFont(日本語の文字を含まないフォント。PDF・印刷でルビがずれる原因)', () => {
  it('Arial など、日本語を含まないと分かっているフォントは true(大文字小文字・引用符・代替の並びは問わない)', () => {
    expect(isLatinOnlyFont('Arial')).toBe(true);
    expect(isLatinOnlyFont('arial, sans-serif')).toBe(true);
    expect(isLatinOnlyFont('"Times New Roman", serif')).toBe(true);
    expect(isLatinOnlyFont('Roboto')).toBe(true);
    expect(isLatinOnlyFont('Open Sans')).toBe(true);
  });

  it('日本語のフォントは false(警告を出さない)', () => {
    expect(isLatinOnlyFont('Noto Sans JP')).toBe(false);
    expect(isLatinOnlyFont('"BIZ UDPGothic", sans-serif')).toBe(false);
    expect(isLatinOnlyFont('M PLUS Rounded 1c')).toBe(false);
    expect(isLatinOnlyFont('Meiryo')).toBe(false);
  });

  it('知らないフォントは false(日本語のフォントかもしれないので、誤って警告しない)', () => {
    expect(isLatinOnlyFont('My Custom Font')).toBe(false);
    expect(isLatinOnlyFont('')).toBe(false);
  });

  it('先頭のフォントだけを見る(先頭が日本語のフォントなら、後ろに Arial があっても false)', () => {
    expect(isLatinOnlyFont('"Noto Sans JP", Arial')).toBe(false);
  });
});
