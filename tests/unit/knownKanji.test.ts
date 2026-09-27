import { describe, expect, it } from 'vitest';
import {
  areAllKanjiKnown,
  createKnownKanjiFilter,
  isSkipKanjiSetting,
  parseKanjiLevelTables,
  skipKanjiFromLegacyGrade,
} from '@core/knownKanji';
import { normalizeSettings } from '@shared/settings';
import kanjiLevelsJson from '../../public/data/kanji-levels.json';

const tables = parseKanjiLevelTables(kanjiLevelsJson);

describe('同梱データ(public/data/kanji-levels.json)', () => {
  const count = (obj: Record<string, number>, v: number): number => Object.values(obj).filter((x) => x === v).length;

  it('学年別漢字配当表: 1〜6年で1,026字(2020年度からの配当表と同じ字数)', () => {
    expect([1, 2, 3, 4, 5, 6].map((g) => count(tables.grade, g))).toEqual([80, 160, 200, 202, 193, 191]);
  });

  it('JLPT: N5〜N1 の5段階がそろっている(tanos.co.uk のリスト)', () => {
    expect([5, 4, 3, 2, 1].map((n) => count(tables.jlpt, n))).toEqual([79, 166, 367, 367, 1232]);
  });
});

describe('createKnownKanjiFilter', () => {
  it("'none' なら省かない(null)", () => {
    expect(createKnownKanjiFilter('none', tables)).toBeNull();
  });

  it('学年: 小3までに習う漢字を「習った」とみなす', () => {
    const f = createKnownKanjiFilter('grade-3', tables)!;
    expect(areAllKanjiKnown('始業式', f)).toBe(true); // すべて小3
    expect(areAllKanjiKnown('習', f)).toBe(true); // 小3
    expect(areAllKanjiKnown('練習', f)).toBe(true); // どちらも小3
    expect(areAllKanjiKnown('試験', f)).toBe(false); // どちらも小4
  });

  it('JLPT: N4 を選ぶと N5・N4 の漢字を「習った」とみなし、N3 以上は習っていない', () => {
    const f = createKnownKanjiFilter('jlpt-n4', tables)!;
    expect(areAllKanjiKnown('学校', f)).toBe(true); // どちらも N5
    expect(areAllKanjiKnown('始', f)).toBe(true); // N4
    expect(areAllKanjiKnown('式', f)).toBe(false); // N3
  });

  it('JLPT: N1 を選ぶと N1 までのすべての漢字を「習った」とみなす', () => {
    const f = createKnownKanjiFilter('jlpt-n1', tables)!;
    expect(areAllKanjiKnown('麻雀', f)).toBe(false); // 雀は JLPT のリストに無い → 習っていない扱い
    expect(areAllKanjiKnown('鑑賞', f)).toBe(true);
  });
});

describe('areAllKanjiKnown', () => {
  const f = { levelTable: { 人: 1, 学: 1 }, maxLevel: 1 };

  it('表に無い漢字があれば false(安全側に倒し、ルビを振る)', () => {
    expect(areAllKanjiKnown('学園', f)).toBe(false);
  });

  it('漢字以外は無視する', () => {
    expect(areAllKanjiKnown('学ぶ', f)).toBe(true);
  });

  it('「々」は直前の漢字と同じ扱い', () => {
    expect(areAllKanjiKnown('人々', f)).toBe(true);
    expect(areAllKanjiKnown('日々', f)).toBe(false);
  });

  it('漢字を含まなければ false(省く対象ではない)', () => {
    expect(areAllKanjiKnown('ひらがな', f)).toBe(false);
  });
});

describe('設定の値', () => {
  it('isSkipKanjiSetting', () => {
    expect(isSkipKanjiSetting('none')).toBe(true);
    expect(isSkipKanjiSetting('grade-6')).toBe(true);
    expect(isSkipKanjiSetting('jlpt-n3')).toBe(true);
    expect(isSkipKanjiSetting('grade-7')).toBe(false);
    expect(isSkipKanjiSetting('jlpt-n6')).toBe(false);
    expect(isSkipKanjiSetting(3)).toBe(false);
  });

  it('v0.7.0 までの学年の設定(gradeFilterMaxGrade)を引き継ぐ', () => {
    expect(skipKanjiFromLegacyGrade(3)).toBe('grade-3');
    expect(skipKanjiFromLegacyGrade(null)).toBe('none');
    expect(skipKanjiFromLegacyGrade(9)).toBe('none');
  });

  it('normalizeSettings: 古い保存値を今の形にそろえ、古い項目は残さない', () => {
    const s = normalizeSettings({ enabled: false, sizeRatio: 0.35, gradeFilterMaxGrade: 2 });
    expect(s.skipKanji).toBe('grade-2');
    expect(s.enabled).toBe(false);
    expect(s).not.toHaveProperty('gradeFilterMaxGrade');
  });

  it('normalizeSettings: 新しい形の値があればそちらを使う(不正な値は「なし」)', () => {
    expect(normalizeSettings({ skipKanji: 'jlpt-n4', gradeFilterMaxGrade: 3 }).skipKanji).toBe('jlpt-n4');
    expect(normalizeSettings({ skipKanji: 'bogus' }).skipKanji).toBe('none');
    expect(normalizeSettings(undefined).skipKanji).toBe('none');
  });
});

describe('parseKanjiLevelTables', () => {
  it('不正な値は読み飛ばす', () => {
    expect(parseKanjiLevelTables({ grade: { 学: 1, 校: 7, 二文字: 1 }, jlpt: { 学: 5, 校: '5' } })).toEqual({
      grade: { 学: 1 },
      jlpt: { 学: 5 },
    });
    expect(parseKanjiLevelTables(null)).toEqual({ grade: {}, jlpt: {} });
  });
});
