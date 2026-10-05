import { describe, expect, it } from 'vitest';
import {
  findSelectionRanges,
  flattenContent,
  groupInSelection,
  inlineReadingInSelection,
  normalizeSelectionText,
} from '@core/docs/selection';
import type { StructuralElement } from '@core/docs/types';

/** index 1 から、段落を順に並べた本文。 */
function body(paragraphs: string[]): StructuralElement[] {
  let at = 1;
  return paragraphs.map((text) => {
    const start = at;
    at += text.length + 1;
    return { startIndex: start, endIndex: at, paragraph: { elements: [{ startIndex: start, endIndex: at, textRun: { content: `${text}\n` } }] } };
  });
}

describe('選択した文字と文書の位置の対応', () => {
  it('空白・改行・タブを除いて比べる(コピーした文字と API の文字で、入り方が違うため)', () => {
    expect(normalizeSelectionText(' 漢字\tの\n学校\u000b ')).toBe('漢字の学校');
    const flat = flattenContent(body(['漢字 の学校', 'つぎの段落']));
    expect(flat.text).toBe('漢字の学校つぎの段落');
    // 段落をまたぐ選択: 「学校」(index 5〜6)から「つぎ」(index 8〜9)まで
    expect(findSelectionRanges(flat, '学校\nつぎ')).toEqual([{ startIndex: 5, endIndex: 10 }]);
  });

  it('同じ並びが何か所もあれば、すべて返す(呼び出し側で、選び直してもらう)。無ければ空', () => {
    const flat = flattenContent(body(['学校と学校', '学校']));
    expect(findSelectionRanges(flat, '学校')).toHaveLength(3);
    expect(findSelectionRanges(flat, '病院')).toEqual([]);
    expect(findSelectionRanges(flat, ' \n')).toEqual([]);
  });

  it('表の中は、左のセルから・セルの中は上の段落から並べる(表ルビは「読み → 本文」の順)', () => {
    const cell = (start: number, reading: string, base: string) => ({
      content: [
        { startIndex: start, endIndex: start + reading.length + 1, paragraph: { elements: [{ startIndex: start, endIndex: start + reading.length + 1, textRun: { content: `${reading}\n` } }] } },
        {
          startIndex: start + reading.length + 1,
          endIndex: start + reading.length + base.length + 2,
          paragraph: { elements: [{ startIndex: start + reading.length + 1, endIndex: start + reading.length + base.length + 2, textRun: { content: `${base}\n` } }] },
        },
      ],
    });
    const content: StructuralElement[] = [{ startIndex: 2, endIndex: 30, table: { tableRows: [{ tableCells: [cell(5, 'かんじ', '漢字'), cell(13, '', 'の')] }] } }];
    const flat = flattenContent(content);
    expect(flat.text).toBe('かんじ漢字の');
    // 画面で表の行をコピーした文字(セルの間はタブ・改行)
    expect(findSelectionRanges(flat, 'かんじ\n漢字\t\nの')).toEqual([{ startIndex: 5, endIndex: 15 }]);
  });

  it('サロゲートペアの文字(𠮷)でも位置がずれない', () => {
    const flat = flattenContent(body(['𠮷野家の人']));
    expect(findSelectionRanges(flat, '野家')).toEqual([{ startIndex: 3, endIndex: 5 }]);
  });

  it('読みは漢字のすぐ後ろにあるので、漢字だけを選んでも、その読みを対象にする。前の語の読みは対象にしない', () => {
    // 漢字(かんじ)の学校(がっこう): 漢字 1〜3、(かんじ) 3〜8、の 8〜9、学校 9〜11、(がっこう) 11〜17
    const kanji = { startIndex: 3, endIndex: 8 };
    const gakkou = { startIndex: 11, endIndex: 17 };
    expect(inlineReadingInSelection(kanji, { startIndex: 1, endIndex: 3 })).toBe(true); // 「漢字」だけ
    expect(inlineReadingInSelection(kanji, { startIndex: 8, endIndex: 9 })).toBe(false); // 「の」だけ
    expect(inlineReadingInSelection(gakkou, { startIndex: 8, endIndex: 9 })).toBe(false);
    expect(inlineReadingInSelection(gakkou, { startIndex: 8, endIndex: 11 })).toBe(true); // 「の学校」
  });

  it('表ルビのまとまりは、選択が少しでもかかれば対象。隣り合うだけなら対象にしない', () => {
    const g = { startIndex: 10, endIndex: 40 };
    expect(groupInSelection(g, { startIndex: 35, endIndex: 50 })).toBe(true);
    expect(groupInSelection(g, { startIndex: 40, endIndex: 50 })).toBe(false);
    expect(groupInSelection(g, { startIndex: 1, endIndex: 10 })).toBe(false);
  });
});
