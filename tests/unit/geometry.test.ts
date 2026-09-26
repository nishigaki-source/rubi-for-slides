import { describe, expect, it } from 'vitest';
import {
  domRectToRect,
  groupIndicesByLine,
  remapRectBetweenFrames,
  transformPoint,
  transformRect,
  unionRects,
} from '@content/geometry';

describe('unionRects', () => {
  it('単一の矩形はそのまま返す', () => {
    expect(unionRects([{ x: 10, y: 20, width: 30, height: 40 }])).toEqual({
      x: 10,
      y: 20,
      width: 30,
      height: 40,
    });
  });

  it('複数の矩形を内包する最小の矩形を返す(横並びの文字を想定)', () => {
    const rects = [
      { x: 0, y: 0, width: 10, height: 20 },
      { x: 10, y: 0, width: 10, height: 20 },
      { x: 20, y: 2, width: 10, height: 18 },
    ];
    expect(unionRects(rects)).toEqual({ x: 0, y: 0, width: 30, height: 20 });
  });

  it('空配列は幅・高さ0の矩形を返す', () => {
    expect(unionRects([])).toEqual({ x: 0, y: 0, width: 0, height: 0 });
  });
});

describe('groupIndicesByLine', () => {
  it('同じ行の文字は1つのグループにまとめる', () => {
    const rects = [
      { x: 0, y: 100, width: 20, height: 30 },
      { x: 20, y: 100, width: 20, height: 30 },
      { x: 40, y: 101, width: 20, height: 30 }, // わずかなブレは同じ行とみなす
    ];
    expect(groupIndicesByLine(rects)).toEqual([[0, 1, 2]]);
  });

  it('折り返しで行が変わった場合はグループを分ける(実機で発見した不具合の再現)', () => {
    // 「追」が1行目の末尾、「加」が2行目の先頭に折り返されたケースを想定
    const rects = [
      { x: 900, y: 257, width: 60, height: 68 }, // 追(1行目)
      { x: 780, y: 330, width: 60, height: 68 }, // 加(2行目)
    ];
    expect(groupIndicesByLine(rects)).toEqual([[0], [1]]);
  });

  it('3行以上にまたがる場合も正しく分割する', () => {
    const rects = [
      { x: 0, y: 0, width: 10, height: 20 },
      { x: 0, y: 20, width: 10, height: 20 },
      { x: 0, y: 40, width: 10, height: 20 },
    ];
    expect(groupIndicesByLine(rects)).toEqual([[0], [1], [2]]);
  });

  it('空配列は空配列を返す', () => {
    expect(groupIndicesByLine([])).toEqual([]);
  });

  it('1文字だけなら1グループ', () => {
    expect(groupIndicesByLine([{ x: 0, y: 0, width: 10, height: 20 }])).toEqual([[0]]);
  });
});

describe('transformPoint', () => {
  it('恒等変換はそのまま返す', () => {
    const identity = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
    expect(transformPoint(identity, 10, 20)).toEqual({ x: 10, y: 20 });
  });

  it('拡大縮小・平行移動を適用する(getScreenCTM相当)', () => {
    // 例: 0.5倍に縮小して (100, 200) だけ平行移動
    const m = { a: 0.5, b: 0, c: 0, d: 0.5, e: 100, f: 200 };
    expect(transformPoint(m, 10, 20)).toEqual({ x: 105, y: 210 });
  });
});

describe('transformRect', () => {
  it('拡大縮小・平行移動した矩形を返す(getExtentOfChar + getScreenCTM相当)', () => {
    // 1つの<text>要素に複数文字が含まれる場合、getExtentOfChar(i)で得た
    // ローカル矩形をこの関数でスクリーン座標に変換する想定
    const m = { a: 0.5, b: 0, c: 0, d: 0.5, e: 100, f: 200 };
    const local = { x: 10, y: 20, width: 30, height: 40 };
    expect(transformRect(m, local)).toEqual({ x: 105, y: 210, width: 15, height: 20 });
  });

  it('恒等変換では矩形が変化しない', () => {
    const identity = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
    const local = { x: 1, y: 2, width: 3, height: 4 };
    expect(transformRect(identity, local)).toEqual(local);
  });
});

describe('domRectToRect', () => {
  it('x/y/width/heightだけを取り出す', () => {
    const fake = { x: 1, y: 2, width: 3, height: 4, top: 2, left: 1, right: 4, bottom: 6 };
    expect(domRectToRect(fake)).toEqual({ x: 1, y: 2, width: 3, height: 4 });
  });
});

describe('remapRectBetweenFrames', () => {
  it('スライドが画面上で上に動いたら、同じだけ上に移す(相対位置を保つ)', () => {
    const before = { x: 367, y: 151, width: 884, height: 497 };
    const after = { x: 367, y: 126, width: 884, height: 497 }; // 下部に案内が出て 25px 上に動いた
    expect(remapRectBetweenFrames({ x: 400, y: 300, width: 20, height: 10 }, before, after)).toEqual({
      x: 400,
      y: 275,
      width: 20,
      height: 10,
    });
  });

  it('ズームで枠の大きさが変わったら、位置と大きさを同じ比率で移す', () => {
    const before = { x: 0, y: 0, width: 800, height: 450 };
    const after = { x: 100, y: 50, width: 400, height: 225 };
    expect(remapRectBetweenFrames({ x: 400, y: 200, width: 40, height: 20 }, before, after)).toEqual({
      x: 300,
      y: 150,
      width: 20,
      height: 10,
    });
  });
});
