import { describe, expect, it } from 'vitest';
import { hasKanji, isHiragana, isKana, isKanji, isKatakana, katakanaToHiragana } from '@core/kana';

describe('isKanji', () => {
  it('CJK統合漢字を漢字と判定する', () => {
    expect(isKanji('食')).toBe(true);
    expect(isKanji('学')).toBe(true);
  });
  it('踊り字「々」を漢字として扱う', () => {
    expect(isKanji('々')).toBe(true);
  });
  it('ひらがな・カタカナ・記号・英数字は漢字ではない', () => {
    expect(isKanji('あ')).toBe(false);
    expect(isKanji('ア')).toBe(false);
    expect(isKanji('。')).toBe(false);
    expect(isKanji('A')).toBe(false);
    expect(isKanji('1')).toBe(false);
  });
});

describe('isHiragana / isKatakana / isKana', () => {
  it('ひらがな判定', () => {
    expect(isHiragana('あ')).toBe(true);
    expect(isHiragana('ア')).toBe(false);
  });
  it('カタカナ判定', () => {
    expect(isKatakana('ア')).toBe(true);
    expect(isKatakana('あ')).toBe(false);
  });
  it('isKanaはひらがな・カタカナ両方でtrue', () => {
    expect(isKana('あ')).toBe(true);
    expect(isKana('ア')).toBe(true);
    expect(isKana('食')).toBe(false);
  });
});

describe('katakanaToHiragana', () => {
  it('標準的なカタカナをひらがなに変換する', () => {
    expect(katakanaToHiragana('タベル')).toBe('たべる');
    expect(katakanaToHiragana('ガッコウ')).toBe('がっこう');
  });
  it('長音記号「ー」はそのまま残す', () => {
    expect(katakanaToHiragana('コーヒー')).toBe('こーひー');
  });
  it('カタカナ以外の文字はそのまま通す', () => {
    expect(katakanaToHiragana('食べる')).toBe('食べる');
    expect(katakanaToHiragana('ABC123')).toBe('ABC123');
  });
  it('小さいヶ・ヵも変換する', () => {
    expect(katakanaToHiragana('ヶ')).toBe('ゖ');
  });
});

describe('hasKanji', () => {
  it('漢字を含む文字列でtrue', () => {
    expect(hasKanji('食べる')).toBe(true);
  });
  it('漢字を含まない文字列でfalse', () => {
    expect(hasKanji('たべる')).toBe(false);
    expect(hasKanji('。')).toBe(false);
    expect(hasKanji('')).toBe(false);
  });
});
