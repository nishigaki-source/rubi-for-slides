import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SHAPE_INSET_H_EMU,
  DEFAULT_SHAPE_INSET_V_EMU,
  EMU_PER_POINT,
  expandRectForDefaultInsets,
  pxFontSizeToPoint,
  pxRectToEmuRect,
} from '@core/emu';

describe('pxRectToEmuRect', () => {
  it('ページ全体を選択すると(0,0)からページサイズ全体になる', () => {
    const pageContainerPx = { x: 100, y: 50, width: 800, height: 450 };
    const pageSizeEmu = { width: 9144000, height: 5143500 }; // 16:9 標準サイズ
    const result = pxRectToEmuRect(pageContainerPx, pageContainerPx, pageSizeEmu);
    expect(result).toEqual({ x: 0, y: 0, width: 9144000, height: 5143500 });
  });

  it('ページ中央の小さな矩形を正しい比率でEMUに変換する', () => {
    const pageContainerPx = { x: 0, y: 0, width: 800, height: 450 };
    const pageSizeEmu = { width: 8000000, height: 4500000 }; // scale = 10000 EMU/px
    const rectPx = { x: 100, y: 50, width: 40, height: 20 };
    const result = pxRectToEmuRect(rectPx, pageContainerPx, pageSizeEmu);
    expect(result).toEqual({ x: 1000000, y: 500000, width: 400000, height: 200000 });
  });

  it('ページコンテナがビューポート原点から離れていてもオフセットを正しく引く', () => {
    const pageContainerPx = { x: 200, y: 100, width: 800, height: 450 };
    const pageSizeEmu = { width: 8000000, height: 4500000 };
    const rectPx = { x: 300, y: 150, width: 40, height: 20 }; // ページ内では (100,50)
    const result = pxRectToEmuRect(rectPx, pageContainerPx, pageSizeEmu);
    expect(result).toEqual({ x: 1000000, y: 500000, width: 400000, height: 200000 });
  });

  it('幅・高さが極小でも最低1EMUを保証する(Slides APIがゼロ幅を拒否するため)', () => {
    const pageContainerPx = { x: 0, y: 0, width: 800, height: 450 };
    const pageSizeEmu = { width: 8000000, height: 4500000 };
    const result = pxRectToEmuRect({ x: 0, y: 0, width: 0, height: 0 }, pageContainerPx, pageSizeEmu);
    expect(result.width).toBeGreaterThanOrEqual(1);
    expect(result.height).toBeGreaterThanOrEqual(1);
  });

  it('pageContainerPxの幅・高さが0の場合はスケール0として安全に扱う(ゼロ除算を避ける)', () => {
    const pageContainerPx = { x: 0, y: 0, width: 0, height: 0 };
    const pageSizeEmu = { width: 8000000, height: 4500000 };
    const result = pxRectToEmuRect({ x: 10, y: 10, width: 10, height: 10 }, pageContainerPx, pageSizeEmu);
    expect(Number.isFinite(result.x)).toBe(true);
    expect(Number.isFinite(result.y)).toBe(true);
  });
});

describe('pxFontSizeToPoint', () => {
  it('スケール比に応じてpxをptに変換する', () => {
    const pageContainerPx = { x: 0, y: 0, width: 800, height: 450 };
    const pageSizeEmu = { width: 8000000, height: 4500000 }; // scale = 10000 EMU/px
    // 10px * 10000 EMU/px = 100000 EMU = 100000/12700 pt ≈ 7.9pt
    const pt = pxFontSizeToPoint(10, pageContainerPx, pageSizeEmu);
    expect(pt).toBeCloseTo(100000 / EMU_PER_POINT, 1);
  });

  it('計算結果が1pt未満になる場合は1ptを下限とする', () => {
    const pageContainerPx = { x: 0, y: 0, width: 8000, height: 4500 }; // 非常に大きい(=スケール小)
    const pageSizeEmu = { width: 8000000, height: 4500000 };
    const pt = pxFontSizeToPoint(1, pageContainerPx, pageSizeEmu);
    expect(pt).toBeGreaterThanOrEqual(1);
  });
});

describe('expandRectForDefaultInsets', () => {
  it('実機で発見した不具合の再現: 既定のインセット分だけ矩形を広げ、内側の実効サイズを相殺する', () => {
    // 「まーじゃん」がシェイプの既定インセットにより最後の「ん」だけ
    // 折り返され、本文の上に重なって表示された不具合(実機で発見)。
    // インセット込みで元の矩形サイズが実効的に保たれるよう、外側に広げる。
    const rect = { x: 1000000, y: 500000, width: 400000, height: 200000 };
    const expanded = expandRectForDefaultInsets(rect);
    expect(expanded.x).toBe(rect.x - DEFAULT_SHAPE_INSET_H_EMU);
    expect(expanded.y).toBe(rect.y - DEFAULT_SHAPE_INSET_V_EMU);
    expect(expanded.width).toBe(rect.width + DEFAULT_SHAPE_INSET_H_EMU * 2);
    expect(expanded.height).toBe(rect.height + DEFAULT_SHAPE_INSET_V_EMU * 2);
  });

  it('中心位置は変えない(左右・上下均等に広げる)', () => {
    const rect = { x: 0, y: 0, width: 100000, height: 50000 };
    const expanded = expandRectForDefaultInsets(rect);
    const originalCenterX = rect.x + rect.width / 2;
    const originalCenterY = rect.y + rect.height / 2;
    const expandedCenterX = expanded.x + expanded.width / 2;
    const expandedCenterY = expanded.y + expanded.height / 2;
    expect(expandedCenterX).toBeCloseTo(originalCenterX, 5);
    expect(expandedCenterY).toBeCloseTo(originalCenterY, 5);
  });
});
