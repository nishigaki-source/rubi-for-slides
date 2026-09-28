import { beforeAll, describe, expect, it } from 'vitest';
import kuromoji from 'kuromoji';
import { buildRubyTokens } from '@core/reading';
import { parseKanjiReadingTable } from '@core/kanjiSplit';
import type { ReadingServiceOptions, RubyToken, TokenizedWord } from '@core/types';
import { extractParagraphs, fontSizeAt, listSegments, OBJECT_PLACEHOLDER, type DocParagraph } from '@core/docs/extract';
import { excludeOverlapping, rubySpansForParagraph, type RubySpan } from '@core/docs/rubySpans';
import { buildInlineRubyRequests, readingFontSize, RUBI_RANGE_NAME, type InlineRubyStyle } from '@core/docs/inlineRuby';
import { buildDeleteRubyRequests, collectRubiRanges, newlineStyleFix } from '@core/docs/deleteRuby';
import { layoutRubyLines, NO_LINE_START, readingFontOf, unitsForParagraph, type LineLayoutOptions } from '@core/docs/lineLayout';
import type { DocsDocument, NamedRanges, StructuralElement, TextStyle } from '@core/docs/types';
import kanjiReadingsJson from '../../public/data/kanji-readings.json';
import { applyRequests, textAt, type SimDoc } from './docsSimulator';

// 本物の kuromoji(拡張機能と同じ辞書)で分かち書きする
let tokenize: (text: string) => TokenizedWord[];
beforeAll(async () => {
  const dicPath = decodeURIComponent(new URL('../../public/dict/', import.meta.url).pathname);
  const tokenizer = await new Promise<kuromoji.Tokenizer<kuromoji.IpadicFeatures>>((resolve, reject) =>
    kuromoji.builder({ dicPath }).build((err, t) => (err ? reject(err) : resolve(t)))
  );
  tokenize = (text) =>
    tokenizer.tokenize(text).map((t) => ({ surface: t.surface_form, reading: t.reading, pos: t.pos, posDetail1: t.pos_detail_1 }));
}, 30000);

const kanjiReadings = parseKanjiReadingTable(kanjiReadingsJson);
const PER_KANJI: ReadingServiceOptions = { rubyMode: 'per-kanji', kanjiReadings };
const PER_WORD: ReadingServiceOptions = { rubyMode: 'per-word' };

/** 段落の文字列の並びから、documents.get の body の content を作る(index は 1 から)。 */
function bodyContent(paragraphs: string[], textStyle: TextStyle = {}): StructuralElement[] {
  const content: StructuralElement[] = [{ endIndex: 1, sectionBreak: {} }];
  let index = 1;
  for (const p of paragraphs) {
    const text = `${p}\n`;
    content.push({
      startIndex: index,
      endIndex: index + text.length,
      paragraph: {
        elements: [{ startIndex: index, endIndex: index + text.length, textRun: { content: text, textStyle } }],
        paragraphStyle: { namedStyleType: 'NORMAL_TEXT' },
      },
    });
    index += text.length;
  }
  return content;
}

function simDoc(paragraphs: string[]): SimDoc {
  return { text: paragraphs.map((p) => `${p}\n`).join(''), namedRanges: [], styles: [] };
}

/** シミュレーターの名前付き範囲を、documents.get の namedRanges の形にする。 */
function toNamedRanges(doc: SimDoc): NamedRanges {
  const out: NamedRanges = {};
  for (const r of doc.namedRanges) {
    const entry = (out[r.name] ??= { name: r.name, namedRanges: [] });
    entry.namedRanges?.push({ name: r.name, ranges: [{ startIndex: r.startIndex, endIndex: r.endIndex }] });
  }
  return out;
}

function spansFor(paragraph: DocParagraph, options: ReadingServiceOptions): RubySpan[] {
  const spans = rubySpansForParagraph(paragraph, buildRubyTokens(tokenize(paragraph.text), options));
  if (!spans) throw new Error('トークンと段落のテキストが一致しない');
  return spans;
}

/** 文書全体にルビを付けたときの結果の文字列と、シミュレーターの状態を返す。 */
function writeRuby(paragraphs: string[], style: InlineRubyStyle, options: ReadingServiceOptions = PER_WORD) {
  const doc = simDoc(paragraphs);
  const paras = extractParagraphs(bodyContent(paragraphs));
  const spans = paras.flatMap((p) => spansFor(p, options));
  const requests = buildInlineRubyRequests(spans, { style, sizeRatio: 0.5, color: '#666666', fontSizeAt: () => 14 });
  return { before: doc, after: applyRequests(doc, requests), requests };
}

describe('listSegments: 文書の本文をタブごとに並べる', () => {
  it('タブ無しの取り方なら body を1つ返す', () => {
    const doc: DocsDocument = { body: { content: bodyContent(['あ']) } };
    const segs = listSegments(doc);
    expect(segs).toHaveLength(1);
    expect(segs[0]?.tabId).toBeUndefined();
  });

  it('includeTabsContent=true の取り方なら、子タブも含めてタブごとに返す', () => {
    const doc: DocsDocument = {
      tabs: [
        {
          tabProperties: { tabId: 't.0', title: 'タブ 1' },
          documentTab: { body: { content: bodyContent(['一']) } },
          childTabs: [{ tabProperties: { tabId: 't.1' }, documentTab: { body: { content: bodyContent(['二']) } } }],
        },
        { tabProperties: { tabId: 't.2' }, documentTab: { body: { content: bodyContent(['三']) } } },
      ],
    };
    expect(listSegments(doc).map((s) => s.tabId)).toEqual(['t.0', 't.1', 't.2']);
  });
});

describe('extractParagraphs: 段落を取り出す', () => {
  it('末尾の改行はテキストに含めず、index の範囲には含める', () => {
    const [p1, p2] = extractParagraphs(bodyContent(['漢字の授業', '学校']));
    expect(p1).toMatchObject({ startIndex: 1, endIndex: 7, text: '漢字の授業', inTable: false });
    expect(p2).toMatchObject({ startIndex: 7, endIndex: 10, text: '学校' });
  });

  it('画像などの文字以外の要素は、使う index の数だけ U+FFFC で埋める', () => {
    const content: StructuralElement[] = [
      {
        startIndex: 1,
        endIndex: 6,
        paragraph: {
          elements: [
            { startIndex: 1, endIndex: 3, textRun: { content: '漢字' } },
            { startIndex: 3, endIndex: 4, inlineObjectElement: {} },
            { startIndex: 4, endIndex: 6, textRun: { content: 'だ\n' } },
          ],
        },
      },
    ];
    expect(extractParagraphs(content)[0]?.text).toBe(`漢字${OBJECT_PLACEHOLDER}だ`);
  });

  it('要素の間に index のすき間がある段落は扱わない(位置の対応が崩れるため)', () => {
    const content: StructuralElement[] = [
      {
        startIndex: 1,
        endIndex: 6,
        paragraph: {
          elements: [
            { startIndex: 1, endIndex: 3, textRun: { content: '漢字' } },
            { startIndex: 4, endIndex: 6, textRun: { content: 'だ\n' } },
          ],
        },
      },
    ];
    expect(extractParagraphs(content)).toEqual([]);
  });

  it('文字の大きさ: 文字の書式 → 段落の種類(namedStyles)→ 標準テキスト → 11pt の順に決める', () => {
    const content: StructuralElement[] = [
      {
        startIndex: 1,
        endIndex: 5,
        paragraph: {
          paragraphStyle: { namedStyleType: 'HEADING_1' },
          elements: [
            { startIndex: 1, endIndex: 3, textRun: { content: '漢字', textStyle: { fontSize: { magnitude: 30, unit: 'PT' } } } },
            { startIndex: 3, endIndex: 5, textRun: { content: 'だ\n' } },
          ],
        },
      },
    ];
    const namedStyles = {
      styles: [
        { namedStyleType: 'NORMAL_TEXT' as const, textStyle: { fontSize: { magnitude: 12 } } },
        { namedStyleType: 'HEADING_1' as const, textStyle: { fontSize: { magnitude: 20 } } },
      ],
    };
    const p = extractParagraphs(content, { namedStyles })[0] as DocParagraph;
    expect(fontSizeAt(p, 1)).toBe(30);
    expect(fontSizeAt(p, 3)).toBe(20);
    expect(fontSizeAt(extractParagraphs(content)[0] as DocParagraph, 3)).toBe(11);
  });

  it('表のセルの中の段落も取り出す(inTable)。skipTable で指定した表は飛ばす', () => {
    const cell = (text: string, index: number): StructuralElement[] => [
      {
        startIndex: index,
        endIndex: index + text.length + 1,
        paragraph: { elements: [{ startIndex: index, endIndex: index + text.length + 1, textRun: { content: `${text}\n` } }] },
      },
    ];
    const content: StructuralElement[] = [
      { startIndex: 1, endIndex: 10, table: { tableRows: [{ tableCells: [{ content: cell('漢字', 3) }, { content: cell('学校', 6) }] }] } },
    ];
    expect(extractParagraphs(content).map((p) => [p.text, p.inTable])).toEqual([
      ['漢字', true],
      ['学校', true],
    ]);
    expect(extractParagraphs(content, { skipTable: () => true })).toEqual([]);
    expect(extractParagraphs(content, { includeTables: false })).toEqual([]);
  });
});

describe('rubySpansForParagraph: 読みの区間を文書の index にする', () => {
  it('熟語ごと: 漢字の語の位置と読み', () => {
    const [p] = extractParagraphs(bodyContent(['漢字の授業があります。']));
    const spans = spansFor(p as DocParagraph, PER_WORD);
    expect(spans.map((s) => [s.base, s.reading, s.startIndex, s.endIndex])).toEqual([
      ['漢字', 'かんじ', 1, 3],
      ['授業', 'じゅぎょう', 4, 6],
    ]);
  });

  it('サロゲートペアの漢字(𠮟)の後ろでも位置がずれない', () => {
    const [p] = extractParagraphs(bodyContent(['𠮟る先生']));
    // RubyRange の start/end は文字(コードポイント)単位
    const tokens: RubyToken[] = [
      { surface: '𠮟る', rubyRanges: [{ start: 0, end: 1, kana: 'しか' }] },
      { surface: '先生', rubyRanges: [{ start: 0, end: 2, kana: 'せんせい' }] },
    ];
    const spans = rubySpansForParagraph(p as DocParagraph, tokens) as RubySpan[];
    expect(spans.map((s) => [s.base, s.startIndex, s.endIndex])).toEqual([
      ['𠮟', 1, 3],
      ['先生', 4, 6],
    ]);
  });

  it('トークンをつなげた文字列が段落と違えば null(その段落は扱わない)', () => {
    const [p] = extractParagraphs(bodyContent(['漢字']));
    expect(rubySpansForParagraph(p as DocParagraph, [{ surface: '感じ', rubyRanges: [] }])).toBeNull();
  });

  it('excludeOverlapping: すでにルビがある区間と重なるものを除く', () => {
    const spans: RubySpan[] = [
      { startIndex: 1, endIndex: 3, base: '漢字', reading: 'かんじ' },
      { startIndex: 4, endIndex: 6, base: '授業', reading: 'じゅぎょう' },
    ];
    expect(excludeOverlapping(spans, [{ startIndex: 2, endIndex: 4 }]).map((s) => s.base)).toEqual(['授業']);
  });
});

describe('buildInlineRubyRequests: 見せ方 A・B・C の書き込み', () => {
  it('A 括弧書き: 全角の括弧で差し込み、書式は変えない', () => {
    const { after, requests } = writeRuby(['漢字の授業があります。', '学校生活は楽しい。'], 'paren');
    expect(after.text).toBe('漢字（かんじ）の授業（じゅぎょう）があります。\n学校（がっこう）生活（せいかつ）は楽（たの）しい。\n');
    expect(requests.some((r) => 'updateTextStyle' in r)).toBe(false);
  });

  it('差し込んだ読みごとに名前付き範囲が付き、括弧を含む読みの部分をちょうど指す', () => {
    const { after } = writeRuby(['漢字の授業があります。', '学校生活は楽しい。'], 'paren');
    const named = after.namedRanges.filter((r) => r.name === RUBI_RANGE_NAME);
    expect(named.map((r) => textAt(after, r.startIndex, r.endIndex))).toEqual([
      '（かんじ）',
      '（じゅぎょう）',
      '（がっこう）',
      '（せいかつ）',
      '（たの）',
    ]);
  });

  it('B 小さい文字: 半角の括弧、文字の大きさと色を読みの範囲にだけ付ける', () => {
    const { after, requests } = writeRuby(['漢字の授業'], 'paren-small');
    expect(after.text).toBe('漢字(かんじ)の授業(じゅぎょう)\n');
    expect(after.styles.map((s) => [textAt(after, s.startIndex, s.endIndex), s.fields])).toEqual([
      ['(かんじ)', 'fontSize,foregroundColor'],
      ['(じゅぎょう)', 'fontSize,foregroundColor'],
    ]);
    const style = requests.find((r) => 'updateTextStyle' in r);
    expect(style && 'updateTextStyle' in style ? style.updateTextStyle.textStyle.fontSize : null).toEqual({
      magnitude: 7,
      unit: 'PT',
    });
  });

  it('C 上付き: 括弧なし、上付きと色を付ける', () => {
    const { after } = writeRuby(['漢字の授業'], 'superscript');
    expect(after.text).toBe('漢字かんじの授業じゅぎょう\n');
    expect(after.styles.map((s) => [textAt(after, s.startIndex, s.endIndex), s.fields])).toEqual([
      ['かんじ', 'baselineOffset,foregroundColor'],
      ['じゅぎょう', 'baselineOffset,foregroundColor'],
    ]);
  });

  it('漢字ごと: 熟語を1文字ずつに分けて差し込む', () => {
    const { after } = writeRuby(['始業式'], 'paren', PER_KANJI);
    expect(after.text).toBe('始（し）業（ぎょう）式（しき）\n');
  });

  it('数字 + 助数詞: 4月1日 は「がつ」「ついたち」(スライド版の counters.ts をそのまま使う)', () => {
    const { after } = writeRuby(['4月1日に集合'], 'paren', PER_KANJI);
    expect(after.text).toBe('4月（がつ）1日（ついたち）に集（しゅう）合（ごう）\n');
  });

  it('複数タブの文書: 位置・範囲にタブ ID を付ける', () => {
    const spans: RubySpan[] = [{ startIndex: 1, endIndex: 3, base: '漢字', reading: 'かんじ' }];
    const requests = buildInlineRubyRequests(spans, { style: 'paren', tabId: 't.1', sizeRatio: 0.5, fontSizeAt: () => 11 });
    expect(requests[0]).toEqual({ insertText: { location: { index: 3, tabId: 't.1' }, text: '（かんじ）' } });
    expect(requests[1]).toEqual({ createNamedRange: { name: RUBI_RANGE_NAME, range: { startIndex: 3, endIndex: 8, tabId: 't.1' } } });
  });

  it('ユーザー辞書の見た目の上書き(色・大きさ・フォント)は、その語の読みにだけ使う', () => {
    const spans: RubySpan[] = [
      { startIndex: 1, endIndex: 3, base: '雀魂', reading: 'じゃんたま', style: { color: '#ff0000', sizeRatio: 0.3, fontFamily: 'Noto Sans JP' } },
    ];
    const requests = buildInlineRubyRequests(spans, { style: 'paren-small', sizeRatio: 0.5, color: '#666666', fontSizeAt: () => 20 });
    const style = requests.find((r) => 'updateTextStyle' in r);
    expect(style && 'updateTextStyle' in style ? style.updateTextStyle : null).toMatchObject({
      textStyle: {
        fontSize: { magnitude: 6 },
        foregroundColor: { color: { rgbColor: { red: 1, green: 0, blue: 0 } } },
        weightedFontFamily: { fontFamily: 'Noto Sans JP' },
      },
      fields: 'fontSize,foregroundColor,weightedFontFamily',
    });
  });

  it('区間が重なっていたら作らない(書き込みを壊さないため)', () => {
    const spans: RubySpan[] = [
      { startIndex: 1, endIndex: 3, base: '漢字', reading: 'かんじ' },
      { startIndex: 2, endIndex: 4, base: '字の', reading: 'じの' },
    ];
    expect(() => buildInlineRubyRequests(spans, { style: 'paren', sizeRatio: 0.5, fontSizeAt: () => 11 })).toThrow();
  });

  it('readingFontSize: 0.5pt 単位に丸め、1pt 未満にしない', () => {
    expect(readingFontSize(11, 0.5)).toBe(5.5);
    expect(readingFontSize(14, 0.35)).toBe(5);
    expect(readingFontSize(1, 0.35)).toBe(1);
  });
});

describe('buildDeleteRubyRequests: 書き込んだ読みを消して元に戻す', () => {
  for (const style of ['paren', 'paren-small', 'superscript'] as const) {
    it(`${style}: 消すと元の文に完全に戻り、名前付き範囲も残らない`, () => {
      const paragraphs = ['4月1日に漢字の授業があります。', '学校生活は楽しい。𠮟る先生。'];
      const { before, after } = writeRuby(paragraphs, style, PER_KANJI);
      const ranges = collectRubiRanges(toNamedRanges(after));
      const restored = applyRequests(after, buildDeleteRubyRequests(ranges));
      expect(restored.text).toBe(before.text);
      expect(restored.namedRanges).toEqual([]);
    });
  }

  it('collectRubiRanges: 重なる・隣り合う区間はまとめ、ヘッダーなど本文以外(segmentId 付き)は除く', () => {
    const named: NamedRanges = {
      [RUBI_RANGE_NAME]: {
        namedRanges: [
          { ranges: [{ startIndex: 10, endIndex: 14 }] },
          { ranges: [{ startIndex: 3, endIndex: 6 }] },
          { ranges: [{ startIndex: 6, endIndex: 8 }] },
          { ranges: [{ startIndex: 1, endIndex: 2, segmentId: 'kix.header' }] },
        ],
      },
      other: { namedRanges: [{ ranges: [{ startIndex: 20, endIndex: 30 }] }] },
    };
    expect(collectRubiRanges(named)).toEqual([
      { startIndex: 3, endIndex: 8 },
      { startIndex: 10, endIndex: 14 },
    ]);
  });

  it('段落の最後の読みを消したら、改行の書式を直前の文字に合わせて戻す(段落の途中なら何もしない)', () => {
    const content: StructuralElement[] = [
      {
        startIndex: 1,
        endIndex: 10,
        paragraph: {
          elements: [
            { startIndex: 1, endIndex: 3, textRun: { content: '水筒', textStyle: { bold: true, fontSize: { magnitude: 14, unit: 'PT' } } } },
            { startIndex: 3, endIndex: 10, textRun: { content: '(すいとう)\n', textStyle: { fontSize: { magnitude: 7, unit: 'PT' } } } },
          ],
        },
      },
    ];
    const paragraphs = extractParagraphs(content);
    expect(newlineStyleFix(paragraphs, { startIndex: 3, endIndex: 9 }, 't.0')).toEqual({
      updateTextStyle: {
        range: { startIndex: 3, endIndex: 4, tabId: 't.0' },
        textStyle: { fontSize: { magnitude: 14, unit: 'PT' } },
        fields: 'fontSize,foregroundColor,baselineOffset,weightedFontFamily',
      },
    });
    expect(newlineStyleFix(paragraphs, { startIndex: 3, endIndex: 5 })).toBeNull();
  });

  it('消すものが無ければ空。タブ ID があれば範囲と deleteNamedRange に付ける', () => {
    expect(buildDeleteRubyRequests([])).toEqual([]);
    expect(buildDeleteRubyRequests([{ startIndex: 3, endIndex: 5 }], 't.1')).toEqual([
      { deleteContentRange: { range: { startIndex: 3, endIndex: 5, tabId: 't.1' } } },
      { deleteNamedRange: { name: RUBI_RANGE_NAME, tabsCriteria: { tabIds: ['t.1'] } } },
    ]);
  });
});

describe('layoutRubyLines: 表ルビ(E・F)の行の分け方', () => {
  // Phase 0 で測った幅: 和文は 1em、数字は 0.556em(PHASE0_FINDINGS.md 4.1節)
  const EM: Record<string, number> = { '0': 0.556, '1': 0.556, '2': 0.556, '3': 0.556, '4': 0.556, '7': 0.556, '8': 0.556 };
  const measure = (text: string, size: number): number => [...text].reduce((w, c) => w + (EM[c] ?? 1) * size, 0);
  const base: LineLayoutOptions = { maxWidthPt: 449, maxColumns: 20, readingRatio: 0.5, measure };

  const TEXT =
    '4月20日に、1年生と2年生は近くの公園へ遠足に行きます。朝8時30分に学校の正門に集合してください。雨の場合は、体育館で学年ごとに活動します。';

  function linesFor(text: string, options: LineLayoutOptions) {
    const [p] = extractParagraphs(bodyContent([text], { fontSize: { magnitude: 14, unit: 'PT' } }));
    const para = p as DocParagraph;
    return layoutRubyLines(unitsForParagraph(para, spansFor(para, PER_WORD)), options);
  }

  it('すべての行が幅と列数の上限に収まり、行をつなげると元の段落になる', () => {
    const lines = linesFor(TEXT, base);
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) {
      expect(line.reduce((w, c) => w + c.widthPt, 0)).toBeLessThanOrEqual(base.maxWidthPt);
      expect(line.length).toBeLessThanOrEqual(base.maxColumns);
    }
    expect(lines.flat().map((c) => c.base).join('')).toBe(TEXT);
  });

  it('列の幅は max(本文の幅, 読みの幅) + 0.5pt を 1pt 単位に切り上げたもの。読みの無いかなは1列にまとめる', () => {
    const [line] = linesFor('漢字のじゅぎょう', base);
    expect(line?.map((c) => [c.base, c.reading, c.widthPt])).toEqual([
      ['漢字', 'かんじ', 29],
      ['のじゅぎょう', null, 85],
    ]);
  });

  it('行頭に「、。」などが来ない(行頭禁則)', () => {
    const lines = linesFor(TEXT, { ...base, maxWidthPt: 150 });
    for (const line of lines.slice(1)) {
      expect(NO_LINE_START.includes(line[0]?.base.charAt(0) ?? '')).toBe(false);
    }
  });

  it('数字と助数詞(30|分)・英数字の途中では行を分けない', () => {
    // 幅を「朝8時30」がちょうど入るくらいにして、「分」の前で分けたくなる状況を作る
    const lines = linesFor('朝8時30分に集合', { ...base, maxWidthPt: 14 + 7.8 + 14 + 15.6 + 2 });
    const joined = lines.map((l) => l.map((c) => c.base).join(''));
    expect(joined.every((l) => !/[0-9]$/.test(l) || l === joined[joined.length - 1])).toBe(true);
    expect(joined.join('')).toBe('朝8時30分に集合');
    expect(joined.some((l) => l.includes('30分'))).toBe(true);
  });

  it('列数の上限を超えない(細かい語が多い行)', () => {
    const lines = linesFor(TEXT, { ...base, maxWidthPt: 10000, maxColumns: 5 });
    for (const line of lines) expect(line.length).toBeLessThanOrEqual(5);
  });

  it('F: 読みが「本文 + 半文字」より長い語だけ読みを縮める(協力 → 5.8pt)。下限は本文の 35%', () => {
    const shrink = { ...base, shrink: { allowanceEm: 0.5, minRatio: 0.35 } };
    const cols = linesFor('皆様のご協力と、体育館', shrink).flat();
    const size = (b: string): number | undefined => cols.find((c) => c.base === b)?.readingSizePt;
    // きょうりょく(6文字)を「協力(2文字) + 半文字」= 35pt に収める → 35 / 6 = 5.83 → 5.8pt
    expect(size('協力')).toBe(5.8);
    // たいいくかん(6文字 × 7pt = 42pt)は「体育館(42pt) + 半文字」に収まるので縮めない
    expect(size('体育館')).toBe(7);
    expect(size('皆様')).toBe(7);

    const tiny = linesFor('協力', { ...shrink, shrink: { allowanceEm: 0, minRatio: 0.45 } }).flat();
    expect(tiny[0]?.readingSizePt).toBe(6.3); // 28 / 6 = 4.67 → 下限の 14 × 0.45 = 6.3
  });

  it('F: 読みは minPt(5pt)より小さくしない。もともとの読みが 5pt より小さいときは大きくしない', () => {
    const shrink = { ...base, shrink: { allowanceEm: 0, minRatio: 0.35, minPt: 5 } };
    // 本文 14pt: きょうりょく を 28pt に収めると 4.67pt → 5pt で止める
    expect(linesFor('協力', shrink).flat()[0]?.readingSizePt).toBe(5);
    // 本文 11pt: 35% は 3.9pt だが 5pt で止める
    const [p11] = extractParagraphs(bodyContent(['協力'], { fontSize: { magnitude: 11, unit: 'PT' } }));
    const cols11 = layoutRubyLines(unitsForParagraph(p11 as DocParagraph, spansFor(p11 as DocParagraph, PER_WORD)), shrink).flat();
    expect(cols11[0]?.readingSizePt).toBe(5);
    // 本文 8pt: もともとの読み 4pt は 5pt に大きくしない
    const [p8] = extractParagraphs(bodyContent(['協力'], { fontSize: { magnitude: 8, unit: 'PT' } }));
    const cols8 = layoutRubyLines(unitsForParagraph(p8 as DocParagraph, spansFor(p8 as DocParagraph, PER_WORD)), shrink).flat();
    expect(cols8[0]?.readingSizePt).toBe(4);
  });

  it('ユーザー辞書で語ごとに指定した読みの大きさ(sizeRatio)を使う', () => {
    const [p] = extractParagraphs(bodyContent(['麻雀の大会'], { fontSize: { magnitude: 14, unit: 'PT' } }));
    const para = p as DocParagraph;
    const userDict = { 麻雀: { reading: 'まーじゃん', style: { sizeRatio: 0.35 } } };
    const spans = rubySpansForParagraph(para, buildRubyTokens(tokenize(para.text), { ...PER_WORD, userDict })) as RubySpan[];
    const cols = layoutRubyLines(unitsForParagraph(para, spans), base).flat();
    expect(cols.find((c) => c.base === '麻雀')).toMatchObject({ reading: 'まーじゃん', readingSizePt: 4.9 });
    expect(cols.find((c) => c.base === '大会')?.readingSizePt).toBe(7);
  });

  it('数字 + 助数詞は、実際の読みの計算では助数詞だけにルビが付く(8時 → 時(じ)、30分 → 分(ぷん))', () => {
    const cols = linesFor('朝8時30分に学校', base).flat();
    expect(cols.filter((c) => c.reading).map((c) => `${c.base}(${c.reading})`)).toEqual([
      '朝(あさ)',
      '時(じ)',
      '分(ぷん)',
      '学校(がっこう)',
    ]);
  });
});

describe('ヘッダー・フッター・脚注', () => {
  it('listSegments: タブごとに、ヘッダー・フッター・脚注の中身を segmentId 付きで並べる', () => {
    const doc: DocsDocument = {
      tabs: [
        {
          tabProperties: { tabId: 't.0' },
          documentTab: {
            body: { content: bodyContent(['本文']) },
            headers: { 'kix.h1': { headerId: 'kix.h1', content: bodyContent(['学校名']) } },
            footers: { 'kix.f1': { footerId: 'kix.f1', content: bodyContent(['校長']) } },
            footnotes: { 'kix.n1': { footnoteId: 'kix.n1', content: bodyContent(['注記']) } },
          },
        },
      ],
    };
    expect(listSegments(doc)[0]?.subSegments.map((x) => [x.kind, x.segmentId])).toEqual([
      ['header', 'kix.h1'],
      ['footer', 'kix.f1'],
      ['footnote', 'kix.n1'],
    ]);
  });

  it('extractParagraphs: index が 0 で省かれた最初の段落(ヘッダーなど)も読む', () => {
    // 実物の応答(2026-09-29): ヘッダーの最初の段落と要素には startIndex が無い
    const header: StructuralElement[] = [
      {
        endIndex: 11,
        paragraph: {
          elements: [{ endIndex: 11, textRun: { content: '山田小学校　学年便り\n', textStyle: {} } }],
          paragraphStyle: { namedStyleType: 'NORMAL_TEXT' },
        },
      },
      {
        startIndex: 11,
        endIndex: 14,
        paragraph: {
          elements: [{ startIndex: 11, endIndex: 14, textRun: { content: '校長\n', textStyle: {} } }],
          paragraphStyle: { namedStyleType: 'NORMAL_TEXT' },
        },
      },
    ];
    expect(extractParagraphs(header).map((p) => [p.startIndex, p.endIndex, p.text])).toEqual([
      [0, 11, '山田小学校　学年便り'],
      [11, 14, '校長'],
    ]);
  });

  it('読みの差し込み・名前付き範囲に segmentId を付ける', () => {
    const spans: RubySpan[] = [{ startIndex: 0, endIndex: 2, base: '学校', reading: 'がっこう' }];
    const requests = buildInlineRubyRequests(spans, { style: 'paren-small', tabId: 't.0', segmentId: 'kix.h1', sizeRatio: 0.5, fontSizeAt: () => 11 });
    expect(requests[0]).toEqual({ insertText: { location: { index: 2, segmentId: 'kix.h1', tabId: 't.0' }, text: '(がっこう)' } });
    expect(requests.find((r) => 'createNamedRange' in r)).toMatchObject({
      createNamedRange: { range: { startIndex: 2, endIndex: 8, segmentId: 'kix.h1', tabId: 't.0' } },
    });
  });

  it('collectRubiRanges: 本文とヘッダーなどの範囲を分けて集める。消すリクエストにも segmentId を付ける', () => {
    const named: NamedRanges = {
      [RUBI_RANGE_NAME]: {
        namedRanges: [
          { ranges: [{ startIndex: 3, endIndex: 6 }] },
          { ranges: [{ startIndex: 2, endIndex: 8, segmentId: 'kix.h1' }] },
        ],
      },
    };
    expect(collectRubiRanges(named)).toEqual([{ startIndex: 3, endIndex: 6 }]);
    expect(collectRubiRanges(named, 'kix.h1')).toEqual([{ startIndex: 2, endIndex: 8 }]);
    expect(buildDeleteRubyRequests([{ startIndex: 2, endIndex: 8 }], 't.0', 'kix.h1')[0]).toEqual({
      deleteContentRange: { range: { startIndex: 2, endIndex: 8, segmentId: 'kix.h1', tabId: 't.0' } },
    });
  });
});

describe('readingFontOf: 読みのフォント', () => {
  it('辞書で語に指定したフォント → 設定の「ルビのフォント」→ 本文のフォント、の順', () => {
    const [p] = extractParagraphs(bodyContent(['学校'], { weightedFontFamily: { fontFamily: 'M PLUS Rounded 1c' } }));
    const para = p as DocParagraph;
    const span: RubySpan = { startIndex: 1, endIndex: 3, base: '学校', reading: 'がっこう' };
    expect(readingFontOf(unitsForParagraph(para, [span])[0]!).family).toBe('M PLUS Rounded 1c');
    expect(readingFontOf(unitsForParagraph(para, [span], 'Arial', 'Arial')[0]!).family).toBe('Arial');
    const withDict = { ...span, style: { fontFamily: 'Klee One' } };
    expect(readingFontOf(unitsForParagraph(para, [withDict], 'Arial', 'Arial')[0]!).family).toBe('Klee One');
  });

  it('読みのない列(かな)の空の読みにも、設定の「ルビのフォント」を使う(丸ゴシックで読みの行が高くならないように)', () => {
    const [p] = extractParagraphs(bodyContent(['学校へ'], { weightedFontFamily: { fontFamily: 'M PLUS Rounded 1c' } }));
    const span: RubySpan = { startIndex: 1, endIndex: 3, base: '学校', reading: 'がっこう' };
    const units = unitsForParagraph(p as DocParagraph, [span], 'Arial', 'Arial');
    expect(units.map((u) => [u.base, u.reading, readingFontOf(u).family, u.font.family])).toEqual([
      ['学校', 'がっこう', 'Arial', 'M PLUS Rounded 1c'],
      ['へ', null, 'Arial', 'M PLUS Rounded 1c'],
    ]);
  });
});
