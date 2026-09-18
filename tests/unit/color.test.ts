import { describe, expect, it } from 'vitest';
import { hexToRgbFraction, isValidHexColor } from '@core/color';

describe('isValidHexColor', () => {
  it('#rrggbb形式を正しいと判定する', () => {
    expect(isValidHexColor('#1a1a1a')).toBe(true);
    expect(isValidHexColor('#FFFFFF')).toBe(true);
  });

  it('#rgb形式(短縮形)も正しいと判定する', () => {
    expect(isValidHexColor('#fff')).toBe(true);
  });

  it('#が無い、桁数が違う、16進数以外の文字を含む場合は不正', () => {
    expect(isValidHexColor('1a1a1a')).toBe(false);
    expect(isValidHexColor('#1a1a1')).toBe(false);
    expect(isValidHexColor('#gggggg')).toBe(false);
  });
});

describe('hexToRgbFraction', () => {
  it('#rrggbb を 0〜1 の小数に変換する', () => {
    expect(hexToRgbFraction('#ffffff')).toEqual({ red: 1, green: 1, blue: 1 });
    expect(hexToRgbFraction('#000000')).toEqual({ red: 0, green: 0, blue: 0 });
  });

  it('#rgb(短縮形)も展開して変換する', () => {
    expect(hexToRgbFraction('#f00')).toEqual({ red: 1, green: 0, blue: 0 });
  });

  it('中間値を正しく変換する(実機で使う既定色 #1a1a1a)', () => {
    const result = hexToRgbFraction('#1a1a1a');
    const expected = 0x1a / 255;
    expect(result.red).toBeCloseTo(expected, 5);
    expect(result.green).toBeCloseTo(expected, 5);
    expect(result.blue).toBeCloseTo(expected, 5);
  });

  it('不正な形式は例外を投げる', () => {
    expect(() => hexToRgbFraction('red')).toThrow();
    expect(() => hexToRgbFraction('#12345')).toThrow();
  });
});
