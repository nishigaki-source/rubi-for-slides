import { describe, expect, it } from 'vitest';
import { extractParagraphs, type DocParagraph } from '@core/docs/extract';
import { alignLines, DEFAULT_FONT, measureFromTable, type RubyColumn } from '@core/docs/lineLayout';
import { paragraphGeometry } from '@core/docs/extract';
import {
  buildRestoreTableRubyRequests,
  buildTableRubyRequests,
  collectTableGroups,
  decodeGroupName,
  encodeGroupName,
  RUBI_TABLE_PREFIX,
} from '@core/docs/tableRuby';
import type { DocsRequest, ParagraphStyle, StructuralElement } from '@core/docs/types';

function paragraphAt(start: number, text: string, style: ParagraphStyle = { namedStyleType: 'NORMAL_TEXT' }): DocParagraph {
  const content: StructuralElement[] = [
    {
      startIndex: start,
      endIndex: start + text.length + 1,
      paragraph: {
        paragraphStyle: style,
        elements: [{ startIndex: start, endIndex: start + text.length + 1, textRun: { content: `${text}\n` } }],
      },
    },
  ];
  return extractParagraphs(content)[0] as DocParagraph;
}

function col(base: string, reading: string | null, startIndex: number): RubyColumn {
  return {
    base,
    reading,
    startIndex,
    endIndex: startIndex + base.length,
    sizePt: 14,
    font: DEFAULT_FONT,
    textStyle: { bold: true },
    readingSizePt: 7,
    widthPt: 30,
  };
}

const kinds = (reqs: DocsRequest[]) => reqs.map((r) => Object.keys(r)[0]);

describe('buildTableRubyRequests: 表ルビの位置の計算', () => {
  const inserts = (reqs: DocsRequest[]) => reqs.flatMap((r) => ('insertText' in r ? [r.insertText] : []));
  const tables = (reqs: DocsRequest[]) => reqs.flatMap((r) => ('insertTable' in r ? [r.insertTable] : []));

  it('1行3列(実際の文書で確かめた規則): 段落を空にして表を入れ、セル 88・90・92 に「読み\\n本文」を後ろから入れる', () => {
    // 2026-09-28 の実機: index 84 の空の段落に 1行3列の表 → 84 改行 / 85 表 / 88・90・92 セルの段落 / 94 元の段落
    const p = paragraphAt(84, '漢字の学校');
    const { requests, layout } = buildTableRubyRequests(p, [[col('漢字', 'かんじ', 84), col('の', null, 86), col('学校', 'がっこう', 87)]]);
    expect(requests[0]).toEqual({ deleteContentRange: { range: { startIndex: 84, endIndex: 89 } } });
    expect(tables(requests)).toEqual([{ rows: 1, columns: 3, location: { index: 84 } }]);
    expect(inserts(requests)).toEqual([
      { location: { index: 92 }, text: 'がっこう\n学校' },
      { location: { index: 90 }, text: '\nの' },
      { location: { index: 88 }, text: 'かんじ\n漢字' },
    ]);
    // 文字を入れた後: 88「かんじ\n」「漢字\n」、次のセルは 90+6=96 から
    expect(layout.tableStarts).toEqual([85]);
    expect(layout.cells[0]).toEqual([
      { reading: [88, 92], base: [92, 95] },
      { reading: [96, 97], base: [97, 99] },
      { reading: [100, 105], base: [105, 108] },
    ]);
    // 表の後ろの元の段落: 94 + 入れた文字(6+2+7=15) = 109。まとまりは 84〜109(元の段落は入れない)
    expect(layout.spacers).toEqual([84, 109]);
    expect(layout.groupStart).toBe(84);
    expect(layout.groupEnd).toBe(109);
  });

  it('2行: 行を後ろから入れ、表と表の間の段落の位置も数える', () => {
    const p = paragraphAt(10, '漢字学校');
    const { requests, layout } = buildTableRubyRequests(p, [[col('漢字', 'かんじ', 10)], [col('学校', 'がっこう', 12)]]);
    expect(tables(requests).map((t) => t.location.index)).toEqual([10, 10]);
    // 入れる前: 10 改行 / 11 表1(大きさ 5) / 16 改行 / 17 表2 / 22 元の段落。セルの段落は 14 と 20
    expect(inserts(requests)).toEqual([
      { location: { index: 20 }, text: 'がっこう\n学校' },
      { location: { index: 14 }, text: 'かんじ\n漢字' },
    ]);
    // 入れた後: 表1のセルに 6 文字 → 表2 は 17+6=23、セルは 26。元の段落は 22+6+7=35
    expect(layout.tableStarts).toEqual([11, 23]);
    expect(layout.spacers).toEqual([10, 22, 35]);
    expect(layout.groupEnd).toBe(35);
  });

  it('表を入れる前に、段落へ「左揃え・字下げなし・余白なし」を付け(前後の段落とセルが引き継ぐ)、入れた後にまとまり全体を 2pt にする。段落の種類は変えない', () => {
    const p = paragraphAt(1, '漢字', { namedStyleType: 'HEADING_1', alignment: 'CENTER' });
    const { requests } = buildTableRubyRequests(p, [[col('漢字', 'かんじ', 1)]]);
    expect(kinds(requests).slice(0, 4)).toEqual(['deleteContentRange', 'updateParagraphStyle', 'insertTable', 'updateTextStyle']);
    expect(requests[1]).toMatchObject({
      updateParagraphStyle: { range: { startIndex: 1, endIndex: 2 }, paragraphStyle: { alignment: 'START', lineSpacing: 100 } },
    });
    const first = requests[1] as Extract<DocsRequest, { updateParagraphStyle: unknown }>;
    expect(first.updateParagraphStyle.fields).not.toContain('namedStyleType');
    // 表を入れた後、まとまり全体(1 改行 / 2〜6 表 / 7 元の段落 → 1〜8)を 2pt にする
    expect(requests[3]).toEqual({ updateTextStyle: { range: { startIndex: 1, endIndex: 8 }, textStyle: { fontSize: { magnitude: 2, unit: 'PT' } }, fields: 'fontSize' } });
  });

  it('文字を入れる前に、表ごとにセルを中央揃えにし、行で一番多い本文の書式を付ける。違う列だけあとで直す', () => {
    const p = paragraphAt(1, '漢字の学校');
    const plain = (c: RubyColumn): RubyColumn => ({ ...c, textStyle: {} });
    const { requests, layout } = buildTableRubyRequests(p, [[plain(col('漢字', 'かんじ', 1)), plain(col('の', null, 3)), col('学校', 'がっこう', 4)]]);
    const firstInsert = requests.findIndex((r) => 'insertText' in r);
    const before = requests.slice(0, firstInsert);
    // セルの中だけ(表の始まり 2 から: 最初のセルの段落 5 〜 最後のセルの段落の改行 9 まで)に中央揃えと、一番多い書式(太字なし・14pt)。
    // 段落の種類は送らない(送ると Docs が文字の書式と隣の段落の書式を初期状態に戻す)
    expect(before.find((r) => 'updateParagraphStyle' in r && r.updateParagraphStyle.paragraphStyle.alignment === 'CENTER')).toEqual({
      updateParagraphStyle: { range: { startIndex: 5, endIndex: 10 }, paragraphStyle: { alignment: 'CENTER' }, fields: 'alignment' },
    });
    expect(before.filter((r) => 'updateTextStyle' in r).pop()).toEqual({
      updateTextStyle: { range: { startIndex: 5, endIndex: 10 }, textStyle: { fontSize: { magnitude: 14, unit: 'PT' } }, fields: 'fontSize' },
    });
    // 太字の「学校」だけ本文の書式を直す
    const after = requests.slice(firstInsert).flatMap((r) => ('updateTextStyle' in r ? [r.updateTextStyle] : []));
    const base = layout.cells[0]?.[2]?.base as [number, number];
    expect(after.filter((s) => s.range.startIndex === base[0])).toEqual([
      { range: { startIndex: base[0], endIndex: base[1] }, textStyle: { bold: true, fontSize: { magnitude: 14, unit: 'PT' } }, fields: 'bold,fontSize' },
    ]);
    // 読みは3列とも(読みの無い列の空の段落も)小さくする
    const readings = layout.cells[0]?.map((c) => c.reading[0]) ?? [];
    expect(after.filter((s) => readings.includes(s.range.startIndex as number)).map((s) => s.textStyle.fontSize?.magnitude)).toEqual([7, 7, 7]);
  });

  it('見出しの段落: 文字を入れた後にセルごとに標準テキスト・中央揃えにしてから、本文の書式をすべての列に付ける', () => {
    const p = paragraphAt(1, '漢字の', { namedStyleType: 'HEADING_1' });
    const plain = (c: RubyColumn): RubyColumn => ({ ...c, textStyle: {} });
    const { requests, layout } = buildTableRubyRequests(p, [[plain(col('漢字', 'かんじ', 1)), plain(col('の', null, 3))]]);
    const firstInsert = requests.findIndex((r) => 'insertText' in r);
    // 文字を入れる前に、表全体への書式は送らない
    expect(requests.slice(0, firstInsert).filter((r) => 'updateParagraphStyle' in r)).toHaveLength(1);
    const after = requests.slice(firstInsert);
    const cells = layout.cells[0] ?? [];
    for (const c of cells) {
      const i = after.findIndex((r) => 'updateParagraphStyle' in r && r.updateParagraphStyle.range.startIndex === c.reading[0]);
      expect(after[i]).toMatchObject({ updateParagraphStyle: { paragraphStyle: { namedStyleType: 'NORMAL_TEXT', alignment: 'CENTER' } } });
      // 段落の種類を変えた後に、本文の書式(14pt)を付ける
      const j = after.findIndex((r) => 'updateTextStyle' in r && r.updateTextStyle.range.startIndex === c.base[0]);
      expect(j).toBeGreaterThan(i);
      expect(after[j]).toMatchObject({ updateTextStyle: { textStyle: { fontSize: { magnitude: 14 } } } });
    }
  });

  it('読みには色を付け、本文から引き継いだ太字などを外す。まとまりに名前付き範囲(名前に元の段落の書式)', () => {
    const p = paragraphAt(1, '漢字', { namedStyleType: 'HEADING_1', alignment: 'CENTER' });
    const { requests, layout } = buildTableRubyRequests(p, [[col('漢字', 'かんじ', 1)]], { color: '#666666', tabId: 't.0' });
    const cell = layout.cells[0]?.[0];
    const reading = requests.flatMap((r) => ('updateTextStyle' in r && r.updateTextStyle.range.startIndex === cell?.reading[0] ? [r.updateTextStyle] : []));
    expect(reading.pop()).toMatchObject({
      textStyle: { fontSize: { magnitude: 7 }, bold: false, foregroundColor: { color: { rgbColor: { red: 0.4 } } } },
      fields: 'fontSize,weightedFontFamily,bold,italic,foregroundColor',
    });
    expect(requests.find((r) => 'createNamedRange' in r)).toEqual({
      createNamedRange: {
        name: `${RUBI_TABLE_PREFIX}{"namedStyleType":"HEADING_1","alignment":"CENTER","tables":1}`,
        range: { startIndex: layout.groupStart, endIndex: layout.groupEnd, tabId: 't.0' },
      },
    });
    expect(requests.find((r) => 'insertTable' in r)).toEqual({ insertTable: { rows: 1, columns: 1, location: { index: 1, tabId: 't.0' } } });
  });

  it('同じ幅の列はまとめて幅を指定する。表は枠線なし・余白なし・下揃え・行がページをまたがない', () => {
    const p = paragraphAt(1, '漢字の学校');
    const { requests } = buildTableRubyRequests(p, [[col('漢字', 'かんじ', 1), { ...col('の', null, 3), widthPt: 12 }, col('学校', 'がっこう', 4)]]);
    expect(requests.flatMap((r) => ('updateTableColumnProperties' in r ? [r.updateTableColumnProperties] : [])).map((c) => [c.columnIndices, c.tableColumnProperties.width?.magnitude])).toEqual([
      [[0, 2], 30],
      [[1], 12],
    ]);
    expect(requests.find((r) => 'updateTableCellStyle' in r)).toMatchObject({
      updateTableCellStyle: { tableCellStyle: { contentAlignment: 'BOTTOM', paddingLeft: { magnitude: 0 } } },
    });
    expect(requests.find((r) => 'updateTableRowStyle' in r)).toMatchObject({
      updateTableRowStyle: { tableRowStyle: { preventOverflow: true } },
    });
  });

  it('空の行があれば作らない', () => {
    expect(() => buildTableRubyRequests(paragraphAt(1, '漢字'), [[]])).toThrow();
  });
});

describe('元に戻す', () => {
  it('名前に元の段落の書式を入れ、取り出せる。ほかの名前は無視する', () => {
    const name = encodeGroupName({ namedStyleType: 'HEADING_2', alignment: 'END', lineSpacing: 150, direction: 'LEFT_TO_RIGHT' }, 3);
    expect(decodeGroupName(name)).toEqual({ style: { namedStyleType: 'HEADING_2', alignment: 'END', lineSpacing: 150 }, tables: 3 });
    expect(decodeGroupName(`${RUBI_TABLE_PREFIX}{"namedStyleType":"NORMAL_TEXT"}`)).toEqual({ style: { namedStyleType: 'NORMAL_TEXT' } });
    expect(decodeGroupName('rubi-furigana')).toBeNull();
    expect(decodeGroupName(`${RUBI_TABLE_PREFIX}{broken`)).toBeNull();
    expect(
      collectTableGroups({
        [name]: { namedRanges: [{ ranges: [{ startIndex: 30, endIndex: 50 }] }, { ranges: [{ startIndex: 5, endIndex: 20 }] }] },
        'rubi-furigana': { namedRanges: [{ ranges: [{ startIndex: 1, endIndex: 3 }] }] },
      }).map((g) => [g.startIndex, g.endIndex])
    ).toEqual([
      [5, 20],
      [30, 50],
    ]);
  });

  const cell = (reading: string, base: string, style: object) => ({
    content: [
      { paragraph: { elements: [{ textRun: { content: `${reading}\n` } }] } },
      { paragraph: { elements: [{ textRun: { content: `${base}\n`, textStyle: style } }] } },
    ],
  });
  const rubyTable = (start: number, end: number): StructuralElement => ({
    startIndex: start,
    endIndex: end,
    table: {
      tableRows: [
        {
          tableCells: [
            cell('かんじ', '漢字', { bold: true, fontSize: { magnitude: 14, unit: 'PT' } }),
            cell('', 'の', { fontSize: { magnitude: 11, unit: 'PT' } }),
          ],
        },
      ],
    },
  });

  it('表の中の本文(セルの最後の段落)から文字と書式を集め、まとまりを消して、後ろの元の段落へ文字を戻す', () => {
    // 84 改行 / 85〜108 表 / 108 元の段落(改行だけ)。まとまりは 84〜108
    const content: StructuralElement[] = [
      { startIndex: 84, endIndex: 85, paragraph: { elements: [{ textRun: { content: '\n' } }] } },
      rubyTable(85, 108),
      { startIndex: 108, endIndex: 109, paragraph: { elements: [{ textRun: { content: '\n' } }] } },
    ];
    const group = { name: 'x', startIndex: 84, endIndex: 108, style: { namedStyleType: 'NORMAL_TEXT' as const }, tables: 1 };
    const reqs = buildRestoreTableRubyRequests(content, group, undefined, 11) as DocsRequest[];
    expect(reqs[0]).toEqual({ deleteContentRange: { range: { startIndex: 84, endIndex: 108 } } });
    expect(reqs[1]).toEqual({ insertText: { location: { index: 84 }, text: '漢字の' } });
    // 段落の書式を先に戻す(段落の種類を変えると Docs が文字の書式をリセットするため。2026-09-28 実機で太字が消えた)
    expect(reqs[2]).toMatchObject({
      updateParagraphStyle: { range: { startIndex: 84, endIndex: 88 }, paragraphStyle: { namedStyleType: 'NORMAL_TEXT' } },
    });
    // 14pt の太字はそのまま、段落の既定(11pt)と同じ大きさは明示をやめる(fontSize を fields に入れて値なし)
    expect(reqs[3]).toEqual({
      updateTextStyle: { range: { startIndex: 84, endIndex: 86 }, textStyle: { bold: true, fontSize: { magnitude: 14, unit: 'PT' } }, fields: 'bold,fontSize' },
    });
    expect(reqs[4]).toEqual({ updateTextStyle: { range: { startIndex: 86, endIndex: 87 }, textStyle: {}, fields: 'fontSize' } });
    // 元の段落の改行は 108 → 消して文字を入れた後は 84 + 3 = 87
    expect(reqs[5]).toEqual({ updateTextStyle: { range: { startIndex: 87, endIndex: 88 }, textStyle: {}, fields: 'fontSize' } });
  });

  it('元の段落に先生が文字を打っていても取り込まない。表の間の段落に打った文字は残す', () => {
    const content: StructuralElement[] = [
      { startIndex: 84, endIndex: 88, paragraph: { elements: [{ textRun: { content: 'メモ\n' } }] } },
      rubyTable(88, 111),
      { startIndex: 111, endIndex: 116, paragraph: { elements: [{ textRun: { content: '追記です\n' } }] } },
    ];
    const group = { name: 'x', startIndex: 84, endIndex: 111, style: {}, tables: 1 };
    const reqs = buildRestoreTableRubyRequests(content, group) as DocsRequest[];
    expect(reqs[0]).toEqual({ deleteContentRange: { range: { startIndex: 84, endIndex: 111 } } });
    expect(reqs[1]).toEqual({ insertText: { location: { index: 84 }, text: 'メモ漢字の' } });
    // 元の段落の改行(115)は、消して(−27)文字を入れた(+5)後は 93
    expect(reqs[reqs.length - 1]).toMatchObject({ updateTextStyle: { range: { startIndex: 93, endIndex: 94 } } });
  });

  it('表の数が書き込んだときと違う(先生が表を足した)まとまりは、消さない(null)', () => {
    const content: StructuralElement[] = [
      { startIndex: 84, endIndex: 85, paragraph: { elements: [{ textRun: { content: '\n' } }] } },
      rubyTable(85, 108),
      rubyTable(108, 131),
      { startIndex: 131, endIndex: 132, paragraph: { elements: [{ textRun: { content: '\n' } }] } },
    ];
    expect(buildRestoreTableRubyRequests(content, { name: 'x', startIndex: 84, endIndex: 131, style: {}, tables: 1 })).toBeNull();
    expect(buildRestoreTableRubyRequests(content, { name: 'x', startIndex: 84, endIndex: 131, style: {}, tables: 2 })).not.toBeNull();
  });

  it('古い形(元の段落までまとまりに入れていた)の範囲でも、元の段落を消さずに戻す', () => {
    const content: StructuralElement[] = [
      { startIndex: 84, endIndex: 85, paragraph: { elements: [{ textRun: { content: '\n' } }] } },
      rubyTable(85, 108),
      { startIndex: 108, endIndex: 109, paragraph: { elements: [{ textRun: { content: '\n' } }] } },
    ];
    const reqs = buildRestoreTableRubyRequests(content, { name: 'x', startIndex: 84, endIndex: 109, style: {} }) as DocsRequest[];
    expect(reqs[0]).toEqual({ deleteContentRange: { range: { startIndex: 84, endIndex: 108 } } });
  });
});

describe('measureFromTable: ページで測った幅から、文字の幅を計算する', () => {
  it('100px で測った幅を pt に直す。表に無い文字は全角 1em・半角 0.55em', () => {
    const table = new Map([['|Arial', new Map([['漢', 100], ['1', 55.6]])]]);
    const m = measureFromTable(table);
    expect(m('漢1', 14, DEFAULT_FONT)).toBeCloseTo(14 + 7.784);
    expect(m('字a', 10, DEFAULT_FONT)).toBeCloseTo(10 + 5.5);
  });
});

describe('alignLines: 字下げ・中央揃え・右揃えを、行の先頭の見えない列で再現する', () => {
  const line = (w: number): RubyColumn[] => [{ ...col('漢字', 'かんじ', 1), widthPt: w }];
  const geo = (alignment: 'START' | 'CENTER' | 'END', indentStartPt = 0, indentFirstLinePt = 0) => ({ alignment, indentStartPt, indentFirstLinePt });

  it('字下げ: 1行目は「1行目の字下げ」の位置、2行目からは「左の字下げ」の位置(Docs の indentFirstLine は余白からの位置)', () => {
    const out = alignLines([line(100), line(100)], geo('START', 20, 14), 400);
    expect(out.map((l) => l.length)).toEqual([2, 2]);
    expect(out[0]?.[0]).toMatchObject({ base: '', reading: null, widthPt: 14, sizePt: 1 });
    expect(out[1]?.[0]?.widthPt).toBe(20);
  });

  it('中央揃え・右揃え: 残りの幅の半分・全部を先頭に空ける。字下げが無い左揃えはそのまま', () => {
    expect(alignLines([line(100)], geo('CENTER'), 400)[0]?.[0]?.widthPt).toBe(150);
    expect(alignLines([line(100)], geo('END', 10), 400)[0]?.[0]?.widthPt).toBe(310);
    expect(alignLines([line(100)], geo('START'), 400)[0]).toHaveLength(1);
    // 2pt より狭い空きは入れない
    expect(alignLines([line(399)], geo('CENTER'), 400)[0]).toHaveLength(1);
  });

  it('見えない列(本文も読みも空)も表のセルになり、元に戻すときの文字には入らない', () => {
    const p = paragraphAt(1, '漢字');
    const lines = alignLines([[col('漢字', 'かんじ', 1)]], geo('CENTER'), 200);
    const { requests } = buildTableRubyRequests(p, lines);
    expect(requests.find((r) => 'insertTable' in r)).toMatchObject({ insertTable: { columns: 2 } });
    // 見えない列のセルには改行だけを入れる
    expect(requests.filter((r) => 'insertText' in r).map((r) => ('insertText' in r ? r.insertText.text : ''))).toEqual([
      'かんじ\n漢字',
      '\n',
    ]);
  });
});

describe('paragraphGeometry: 段落の揃え方と字下げ(段落の種類の既定も見る)', () => {
  it('段落の書式が優先、無ければ段落の種類の既定、どちらも無ければ左揃え・字下げ 0', () => {
    const p = paragraphAt(1, '漢字', { namedStyleType: 'TITLE', indentFirstLine: { magnitude: 11, unit: 'PT' } });
    const named = { styles: [{ namedStyleType: 'TITLE' as const, paragraphStyle: { alignment: 'CENTER', indentFirstLine: { magnitude: 99 } } }] };
    expect(paragraphGeometry(p, named)).toEqual({ alignment: 'CENTER', indentStartPt: 0, indentEndPt: 0, indentFirstLinePt: 11 });
    expect(paragraphGeometry(paragraphAt(1, '漢字'), undefined)).toEqual({ alignment: 'START', indentStartPt: 0, indentEndPt: 0, indentFirstLinePt: 0 });
  });
});

describe('cssFont: ページで幅を測るときのフォントの指定', () => {
  it('Docs が読み込む「docs-」付きの名前を先に、元の名前を後ろに並べる', async () => {
    const { cssFont } = await import('@worker/measure');
    expect(cssFont({ family: 'BIZ UDPGothic', bold: true, italic: false })).toBe('bold 100px "docs-BIZ UDPGothic", "BIZ UDPGothic"');
    expect(cssFont({ family: 'Arial', bold: false, italic: true })).toBe('italic 100px "docs-Arial", "Arial"');
  });
});

describe('ユーザー辞書の見た目の上書き(漢字の上・漢字の上(縮める))', () => {
  it('語ごとに指定した読みの色・フォントをセルの読みに使う', () => {
    const p = paragraphAt(1, '雀魂');
    const c: RubyColumn = { ...col('雀魂', 'じゃんたま', 1), readingStyle: { color: '#ff0000', fontFamily: 'Klee One' } };
    const { requests, layout } = buildTableRubyRequests(p, [[c]], { color: '#666666' });
    const reading = layout.cells[0]?.[0]?.reading[0];
    const style = requests.flatMap((r) => ('updateTextStyle' in r && r.updateTextStyle.range.startIndex === reading ? [r.updateTextStyle] : [])).pop();
    expect(style?.textStyle).toMatchObject({
      foregroundColor: { color: { rgbColor: { red: 1, green: 0, blue: 0 } } },
      weightedFontFamily: { fontFamily: 'Klee One' },
    });
  });
});
