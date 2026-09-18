/**
 * 色まわりの純粋関数。DOM にも Slides API クライアントにも依存しない。
 */

/** `#rgb` または `#rrggbb` 形式の16進数カラーコードかどうかを判定する。 */
const HEX_COLOR_PATTERN = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export function isValidHexColor(color: string): boolean {
  return HEX_COLOR_PATTERN.test(color.trim());
}

export interface RgbFraction {
  red: number;
  green: number;
  blue: number;
}

/**
 * `#rgb`/`#rrggbb` 形式の16進数カラーコードを、Slides API の
 * `OpaqueColor.rgbColor` が要求する 0〜1 の小数(RGB各成分)に変換する。
 * 不正な形式の場合は例外を投げる。
 */
export function hexToRgbFraction(color: string): RgbFraction {
  const trimmed = color.trim();
  if (!isValidHexColor(trimmed)) {
    throw new Error(`不正なカラーコードです: ${color}`);
  }
  const hex = trimmed.slice(1);
  const expand = (h: string): string => (h.length === 3 ? h.split('').map((c) => c + c).join('') : h);
  const full = expand(hex);
  const red = parseInt(full.slice(0, 2), 16) / 255;
  const green = parseInt(full.slice(2, 4), 16) / 255;
  const blue = parseInt(full.slice(4, 6), 16) / 255;
  return { red, green, blue };
}
