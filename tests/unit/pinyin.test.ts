import { describe, expect, it } from 'vitest';
import { buildPinyinRanges, pinyinPerCodePoint } from '@core/pinyin';
import { estimateRubyWidthEm } from '@core/textWidth';

/** 「表層形(拼音)」の形で並べる */
function ruby(text: string): string[] {
  const chars = Array.from(text);
  return buildPinyinRanges(text).map((r) => `${chars.slice(r.start, r.end).join('')}(${r.kana})`);
}

describe('buildPinyinRanges', () => {
  it('漢字1文字に1音節を、声調記号付きで振る', () => {
    expect(ruby('我们学习汉语')).toEqual(['我(wǒ)', '们(men)', '学(xué)', '习(xí)', '汉(hàn)', '语(yǔ)']);
  });

  it('数字・英字・記号・かなには振らず、文字の位置(コードポイント)は元の文字列のまま', () => {
    const text = '第3课：我有2个朋友，name是Tom。';
    const ranges = buildPinyinRanges(text);
    const chars = Array.from(text);
    for (const r of ranges) expect(chars[r.start]).toMatch(/[一-鿿]/); // 区間は必ず漢字を指す
    expect(ranges.map((r) => r.kana)).toEqual(['dì', 'kè', 'wǒ', 'yǒu', 'gè', 'péng', 'you', 'shì']);
    expect(pinyinPerCodePoint(text)).toHaveLength(chars.length); // 文字数と一致する
  });

  it('サロゲートペアの文字があっても、文字の位置がずれない', () => {
    const text = '𠮷野家好';
    expect(pinyinPerCodePoint(text)).toHaveLength(4);
    expect(ruby(text)).toEqual(['野(yě)', '家(jiā)', '好(hǎo)']);
  });

  it('空の文字列・漢字の無い文字列は区間を返さない', () => {
    expect(buildPinyinRanges('')).toEqual([]);
    expect(buildPinyinRanges('こんにちは abc 123')).toEqual([]);
  });

  it('多音字は語で判定する(长・行・重・觉)', () => {
    expect(ruby('长城很长')).toEqual(['长(cháng)', '城(chéng)', '很(hěn)', '长(cháng)']);
    expect(ruby('银行的行长')).toEqual(['银(yín)', '行(háng)', '的(de)', '行(háng)', '长(zhǎng)']);
    expect(ruby('重要重新')).toEqual(['重(zhòng)', '要(yào)', '重(chóng)', '新(xīn)']);
    expect(ruby('觉得睡觉')).toEqual(['觉(jué)', '得(de)', '睡(shuì)', '觉(jiào)']);
  });

  it('「不」「一」は実際の発音に合わせて変調を書く', () => {
    expect(ruby('不去一个')).toEqual(['不(bú)', '去(qù)', '一(yí)', '个(gè)']);
  });
});

describe('補正表(教科書が軽声で書く語)', () => {
  it('朋友・学生・早上などを軽声にする', () => {
    expect(ruby('我朋友是学生')).toEqual(['我(wǒ)', '朋(péng)', '友(you)', '是(shì)', '学(xué)', '生(sheng)']);
    expect(ruby('早上好')).toEqual(['早(zǎo)', '上(shang)', '好(hǎo)']);
  });

  it('「买东西」は軽声、方角の「东西南北」は声調記号付きのまま', () => {
    expect(ruby('买东西')).toEqual(['买(mǎi)', '东(dōng)', '西(xi)']);
    expect(ruby('东西南北')).toEqual(['东(dōng)', '西(xī)', '南(nán)', '北(běi)']);
  });

  it('副詞をつくる「地」は de、ほかの「地」は dì のまま', () => {
    expect(ruby('高兴地说')).toEqual(['高(gāo)', '兴(xìng)', '地(de)', '说(shuō)']);
    expect(ruby('地图')).toEqual(['地(dì)', '图(tú)']);
  });
});

describe('estimateRubyWidthEm', () => {
  it('かな・全角文字は1文字 = 1em(日本語の計算結果を変えない)', () => {
    expect(estimateRubyWidthEm('しぎょうしき')).toBe(6);
    expect(estimateRubyWidthEm('シギョウ')).toBe(4);
    expect(estimateRubyWidthEm('ー')).toBe(1);
    expect(estimateRubyWidthEm('ぱぴぷ')).toBe(3); // 濁点・半濁点付きのかなを分解して数えない
  });

  it('拼音は英字の幅で見積もる(かなの文字数より小さい)', () => {
    const zhuang = estimateRubyWidthEm('zhuāng');
    expect(zhuang).toBeGreaterThan(2.5);
    expect(zhuang).toBeLessThan(3.5); // 6文字でも、かな6文字(6em)の約半分
    expect(estimateRubyWidthEm('yī')).toBeLessThan(estimateRubyWidthEm('wǒ')); // 細い字(i)は狭い
  });

  it('声調記号は幅に数えない(ā と a は同じ幅)', () => {
    expect(estimateRubyWidthEm('hǎo')).toBeCloseTo(estimateRubyWidthEm('hao'), 10);
    expect(estimateRubyWidthEm('nǚ')).toBeCloseTo(estimateRubyWidthEm('nu'), 10);
  });
});
