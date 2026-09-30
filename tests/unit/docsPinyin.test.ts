import { describe, expect, it } from 'vitest';
import { buildPinyinRanges } from '@core/pinyin';
import { mergeAdjacentSpans, rubySpansForParagraph, type RubySpan } from '@core/docs/rubySpans';
import type { DocParagraph } from '@core/docs/extract';

/** 段落の位置(startIndex)と文字列だけを持つ、テスト用の段落 */
const paragraph = (text: string, startIndex = 1): DocParagraph => ({ startIndex, text }) as DocParagraph;
const pinyinSpans = (text: string, startIndex = 1): RubySpan[] =>
  rubySpansForParagraph(paragraph(text, startIndex), [{ surface: text, rubyRanges: buildPinyinRanges(text) }]) ?? [];

describe('ドキュメントの拼音: 読みの区間(漢字1文字ごと)', () => {
  it('漢字1文字に1つの区間を作り、文書の位置(index)に直す', () => {
    const spans = pinyinSpans('汉语', 5);
    expect(spans).toEqual([
      { startIndex: 5, endIndex: 6, base: '汉', reading: 'hàn' },
      { startIndex: 6, endIndex: 7, base: '语', reading: 'yǔ' },
    ]);
  });

  it('漢字以外(数字・英字・句読点)には区間を作らず、位置は元の文字列のまま', () => {
    const spans = pinyinSpans('第3课，我有2个朋友');
    expect(spans.map((s) => `${s.base}:${s.reading}:${s.startIndex}`)).toEqual([
      '第:dì:1', '课:kè:3', '我:wǒ:5', '有:yǒu:6', '个:gè:8', '朋:péng:9', '友:you:10',
    ]);
  });

  it('サロゲートペアの文字があっても、文書の位置(UTF-16)がずれない', () => {
    const spans = pinyinSpans('𠮷野家', 1);
    // 「𠮷」は UTF-16 で 2 単位。読みの無い文字なので区間は作らないが、後ろの漢字の位置は 2 つ進む
    expect(spans.map((s) => `${s.base}:${s.startIndex}-${s.endIndex}`)).toEqual(['野:3-4', '家:4-5']);
  });
});

describe('mergeAdjacentSpans(括弧書き・上付き用に、続いた漢字を1つにまとめる)', () => {
  it('すき間なく続く漢字を1つにし、読みは半角スペースでつなぐ', () => {
    expect(mergeAdjacentSpans(pinyinSpans('汉语课文'))).toEqual([
      { startIndex: 1, endIndex: 5, base: '汉语课文', reading: 'hàn yǔ kè wén' },
    ]);
  });

  it('句読点・かな・数字・空白で区切る(節ごとに読みが付く)', () => {
    const merged = mergeAdjacentSpans(pinyinSpans('我叫王明，是日本人。'));
    expect(merged.map((s) => `${s.base}(${s.reading})`)).toEqual(['我叫王明(wǒ jiào wáng míng)', '是日本人(shì rì běn rén)']);
    expect(mergeAdjacentSpans(pinyinSpans('第3课')).map((s) => s.base)).toEqual(['第', '课']);
  });

  it('見た目を個別に指定した区間はまとめない', () => {
    const styled: RubySpan[] = [
      { startIndex: 1, endIndex: 2, base: '汉', reading: 'hàn' },
      { startIndex: 2, endIndex: 3, base: '语', reading: 'yǔ', style: { color: '#ff0000' } },
    ];
    expect(mergeAdjacentSpans(styled)).toHaveLength(2);
  });

  it('区間が無ければ空', () => {
    expect(mergeAdjacentSpans([])).toEqual([]);
  });
});
