/**
 * かな・漢字の文字種判定とカタカナ→ひらがな変換。
 * DOM にも kuromoji にも依存しない純粋関数のみ。
 */

/** CJK 統合漢字（基本 + 拡張 A）と、踊り字「々」を漢字として扱う。 */
export function isKanji(char: string): boolean {
  const code = char.codePointAt(0);
  if (code === undefined) return false;
  return (
    (code >= 0x4e00 && code <= 0x9fff) || // CJK統合漢字
    (code >= 0x3400 && code <= 0x4dbf) || // CJK統合漢字拡張A
    code === 0x3005 // 々（踊り字）
  );
}

export function isHiragana(char: string): boolean {
  const code = char.codePointAt(0);
  if (code === undefined) return false;
  return code >= 0x3040 && code <= 0x309f;
}

export function isKatakana(char: string): boolean {
  const code = char.codePointAt(0);
  if (code === undefined) return false;
  return code >= 0x30a0 && code <= 0x30ff;
}

/** ひらがな・カタカナのいずれか（送り仮名の判定に使う）。 */
export function isKana(char: string): boolean {
  return isHiragana(char) || isKatakana(char);
}

/**
 * カタカナ文字列をひらがなに変換する。
 * 長音記号「ー」(U+30FC) は -0x60 すると無効な文字になるため変換せずそのまま残す。
 * カタカナ以外の文字（すでにひらがな、記号、英数字など）はそのまま通す。
 */
export function katakanaToHiragana(input: string): string {
  let result = '';
  for (const char of input) {
    const code = char.codePointAt(0);
    if (code === undefined) {
      result += char;
      continue;
    }
    if (code === 0x30fc) {
      // 長音記号はそのまま（ひらがなに対応文字がないため）
      result += char;
    } else if (code >= 0x30a1 && code <= 0x30f6) {
      // ァ..ヶ -> ぁ..ゖ
      result += String.fromCodePoint(code - 0x60);
    } else if (code === 0x30fd || code === 0x30fe) {
      // ヽヾ -> ゝゞ（かな繰り返し記号）
      result += String.fromCodePoint(code - 0x60);
    } else {
      result += char;
    }
  }
  return result;
}

/** 文字列内に漢字が 1 文字以上含まれるか。 */
export function hasKanji(text: string): boolean {
  for (const char of text) {
    if (isKanji(char)) return true;
  }
  return false;
}
