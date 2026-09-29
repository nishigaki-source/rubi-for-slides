import { describe, expect, it } from 'vitest';
import { computeParagraphRubyPlan, type GlobalRubyRange } from '@content/overlayRenderer';
import type { ExtractedChar } from '@content/textExtractor';
import { groupBoxesByLine } from '@content/rubyLayout';
import { pointToPxFontSize, pxFontSizeToPoint } from '@core/emu';
import { buildPinyinRanges } from '@core/pinyin';
import { estimateRubyWidthEm } from '@core/textWidth';

/** 1文字ずつの <text> 要素を、指定した大きさで横一列に並べた偽物(getBoundingClientRect だけ使う) */
function fakeLine(text: string, charPx: number, originX = 0, originY = 100): ExtractedChar[] {
  return Array.from(text).map((char, i) => {
    const rect = { x: originX + i * charPx, y: originY, width: charPx, height: charPx };
    const el = {
      textContent: char,
      getBoundingClientRect: () => ({ ...rect, left: rect.x, top: rect.y, right: rect.x + charPx, bottom: rect.y + charPx }),
    } as unknown as SVGTextElement;
    return { el, char, charIndexInElement: 0 } as ExtractedChar;
  });
}

// 「現状の重要」を漢字ごとに: げん|じょう|(の)|じゅう|よう
const RANGES: GlobalRubyRange[] = [
  { start: 0, end: 1, kana: 'げん' },
  { start: 1, end: 2, kana: 'じょう' },
  { start: 3, end: 4, kana: 'じゅう' },
  { start: 4, end: 5, kana: 'よう' },
];

describe('computeParagraphRubyPlan: 隣のルビとの重なり', () => {
  it('ルビが最小サイズに切り上げられても、かなを挟んだ隣のルビと重ならない(「じょう」と「じゅう」)', () => {
    // スライドを縮小表示した状態: 本文 1 文字 8px → 小(0.35)では最小 8px に切り上がる
    const plan = computeParagraphRubyPlan(fakeLine('現状の重要', 8), RANGES, 0.35);
    expect(plan).toHaveLength(4);
    for (let i = 1; i < plan.length; i++) {
      const a = plan[i - 1]!;
      const b = plan[i]!;
      const halfWidths = (Array.from(a.kana).length * a.fontSizePx + Array.from(b.kana).length * b.fontSizePx) / 2;
      expect(b.centerX - a.centerX).toBeGreaterThanOrEqual(halfWidths - 1e-9);
    }
  });

  it('重ならないルビは本文の中心のまま', () => {
    const plan = computeParagraphRubyPlan(fakeLine('現あいう重', 40), [RANGES[0]!, { start: 4, end: 5, kana: 'じゅう' }], 0.35);
    expect(plan.map((p) => p.centerX)).toEqual([20, 180]);
  });
});

describe('computeParagraphRubyPlan: ルビの大きさのそろえ方', () => {
  it('本文の大きさが同じ部分はそろえ、1つの段落の中で一部だけ大きい文字は別にそろえる', () => {
    // 「朝ごはん」(18px 相当)と「元気」(36px 相当)が同じ段落にある
    const small = fakeLine('朝ご', 18);
    const big = fakeLine('元気', 36, 100, 82);
    const plan = computeParagraphRubyPlan(
      [...small, ...big],
      [
        { start: 0, end: 1, kana: 'あさ' },
        { start: 2, end: 3, kana: 'げん' },
        { start: 3, end: 4, kana: 'き' },
      ],
      0.5
    );
    expect(plan[0]!.fontSizePx).toBeCloseTo(9, 5); // 18 × 0.5
    expect(plan[1]!.fontSizePx).toBeCloseTo(18, 5); // 36 × 0.5(小さい部分に合わせて小さくしない)
    expect(plan[2]!.fontSizePx).toBeCloseTo(18, 5);
  });
});

describe('computeParagraphRubyPlan: 最小サイズの指定(書き込み用)', () => {
  it('最小サイズを画面の拡大率に比例させれば、縮小表示でも拡大表示でも同じ見た目の比率になる', () => {
    const scaleOf = (charPx: number) => {
      const plan = computeParagraphRubyPlan(fakeLine('現状の重要', charPx), RANGES, 0.35, {}, { minFontSizePx: charPx * 0.2 });
      return plan.map((p) => p.fontSizePx / charPx);
    };
    const small = scaleOf(8);
    const large = scaleOf(32);
    small.forEach((v, i) => expect(v).toBeCloseTo(large[i]!, 9));
  });
});

describe('groupBoxesByLine', () => {
  const box = (x: number, y: number) => ({ x, y, width: 10, height: 10 });

  it('すき間があっても同じ行ならまとめ、折り返し(左に戻る・下の行)で分ける', () => {
    expect(groupBoxesByLine([box(0, 0), box(40, 0), box(80, 1), box(0, 20), box(30, 20)])).toEqual([
      [0, 1, 2],
      [3, 4],
    ]);
  });
});

describe('pointToPxFontSize', () => {
  it('pxFontSizeToPoint の逆になっている', () => {
    const page = { x: 0, y: 0, width: 480, height: 270 }; // 720pt × 405pt のスライドを半分の大きさで表示
    const pageSizeEmu = { width: 9144000, height: 5143500 };
    const px = pointToPxFontSize(6, page, pageSizeEmu);
    expect(px).toBeCloseTo(4, 9);
    expect(pxFontSizeToPoint(px, page, pageSizeEmu)).toBe(6);
  });
});

describe('computeParagraphRubyPlan: 中国語の拼音(英字のルビ)', () => {
  const text = '我们今天学习汉语，欢迎光临';

  it('英字の幅で見積もるので、かなの文字数で数えたときより大きなルビになる', () => {
    const plan = computeParagraphRubyPlan(fakeLine(text, 32), buildPinyinRanges(text), 0.5);
    expect(plan.length).toBeGreaterThan(8);
    const size = plan[0]!.fontSizePx;
    // 本文 32px の 50% = 16px が上限。文字数で数える(1文字 = 1em)と、平均 3.5 文字の拼音は 9px 前後まで縮められていた
    expect(size).toBeGreaterThan(12);
    expect(size).toBeLessThanOrEqual(16);
  });

  it('隣り合う拼音は重ならない(幅は英字の幅で見積もる)', () => {
    const plan = computeParagraphRubyPlan(fakeLine(text, 32), buildPinyinRanges(text), 0.5);
    for (let i = 1; i < plan.length; i++) {
      const a = plan[i - 1]!;
      const b = plan[i]!;
      const halves = ((estimateRubyWidthEm(a.kana) + estimateRubyWidthEm(b.kana)) * a.fontSizePx) / 2;
      expect(b.centerX - a.centerX).toBeGreaterThanOrEqual(halves - 1e-6);
    }
  });

  it('日本語のふりがなの配置は変わらない(かなは1文字 = 1em)', () => {
    const plan = computeParagraphRubyPlan(fakeLine('現状の重要', 8), RANGES, 0.35);
    expect(plan.map((p) => Math.round(p.fontSizePx * 100) / 100)).toEqual(plan.map(() => 8));
  });
});
