/**
 * 座標計算の純粋関数群。DOM 型には依存せず、プレーンな数値のみを扱うため
 * jsdom 無しで単体テストできる（実際の DOMRect 等は呼び出し側で
 * プレーンオブジェクトに変換してから渡す）。
 */

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 複数の矩形をすべて内包する最小の矩形を返す。空配列なら幅・高さ0の矩形を返す。 */
export function unionRects(rects: Rect[]): Rect {
  if (rects.length === 0) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const r of rects) {
    minX = Math.min(minX, r.x);
    minY = Math.min(minY, r.y);
    maxX = Math.max(maxX, r.x + r.width);
    maxY = Math.max(maxY, r.y + r.height);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/** DOMRect(相当のオブジェクト)を Rect に変換する。 */
export function domRectToRect(r: { x: number; y: number; width: number; height: number }): Rect {
  return { x: r.x, y: r.y, width: r.width, height: r.height };
}

/** SVGMatrix / DOMMatrix 相当の 2D アフィン変換行列。 */
export interface AffineMatrix {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}

/** アフィン変換行列を1点に適用する。 */
export function transformPoint(m: AffineMatrix, x: number, y: number): { x: number; y: number } {
  return { x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f };
}

/**
 * ローカル座標系の矩形(例: SVGTextContentElement.getExtentOfChar の戻り値)を
 * アフィン変換行列(例: getScreenCTM の戻り値)で画面座標系に変換する。
 * 回転・スキューが無い前提の getScreenCTM でも、4隅すべてを変換してから
 * 外接矩形を取り直すことで、将来スライドが回転していても破綻しない。
 */
export function transformRect(m: AffineMatrix, r: Rect): Rect {
  const corners = [
    transformPoint(m, r.x, r.y),
    transformPoint(m, r.x + r.width, r.y),
    transformPoint(m, r.x, r.y + r.height),
    transformPoint(m, r.x + r.width, r.y + r.height),
  ];
  const xs = corners.map((p) => p.x);
  const ys = corners.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/**
 * 文字の矩形列(表示順)を、視覚的な行ごとにグループ化する。
 * テキストボックスの幅で折り返された場合、同じルビ区間の文字が複数行に
 * またがることがある(実機テストで発見: 折り返しをまたぐルビが変な位置に
 * 表示される不具合の原因)。連続する2文字の中心Y座標の差が
 * 文字の高さの半分を超えたら改行とみなす。
 * @returns 各行に属する `rects` のインデックス配列の配列
 */
export function groupIndicesByLine(rects: Rect[]): number[][] {
  if (rects.length === 0) return [];
  const groups: number[][] = [[0]];
  for (let i = 1; i < rects.length; i++) {
    const prev = rects[i - 1] as Rect;
    const cur = rects[i] as Rect;
    const prevCenter = prev.y + prev.height / 2;
    const curCenter = cur.y + cur.height / 2;
    const threshold = Math.max(prev.height, cur.height) * 0.5;
    if (Math.abs(curCenter - prevCenter) > threshold) {
      groups.push([i]);
    } else {
      (groups[groups.length - 1] as number[]).push(i);
    }
  }
  return groups;
}
