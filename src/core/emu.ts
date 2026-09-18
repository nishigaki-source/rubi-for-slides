/**
 * EMU(English Metric Units、Slides API がシェイプの位置・サイズに使う長さの単位。
 * 1pt = 12700EMU、1inch = 914400EMU)まわりの純粋な計算ロジック。
 * DOM にも Slides API クライアントにも依存しないため単体テスト可能。
 *
 * Phase 0 の技術検証で確認した方針(PHASE0_FINDINGS.md 4節・PLAN.md 3.5節)に基づく:
 * SVG の内部座標(viewBox)は解読不能な独自単位なので使わず、
 * 「Slides API から得たページサイズ(EMU)」と「編集画面の実測ピクセル寸法」の
 * 比率から、その場でスケール係数を算出する。
 */

export interface PxRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface EmuRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface EmuSize {
  width: number;
  height: number;
}

/** 1pt(ポイント) は 12700 EMU。Slides API のフォントサイズは pt 単位で指定する。 */
export const EMU_PER_POINT = 12700;

/**
 * 画面ピクセルの矩形(ページコンテナ基準の相対座標ではなく、ビューポート座標)を
 * EMU 矩形に変換する。
 *
 * @param rectPx 変換したい矩形(ビューポート座標、px)
 * @param pageContainerPx ページ全体を表す SVG 要素などの、ビューポート座標での矩形(px)
 * @param pageSizeEmu Slides API から得たページサイズ(EMU)
 */
export function pxRectToEmuRect(rectPx: PxRect, pageContainerPx: PxRect, pageSizeEmu: EmuSize): EmuRect {
  const scaleX = pageContainerPx.width > 0 ? pageSizeEmu.width / pageContainerPx.width : 0;
  const scaleY = pageContainerPx.height > 0 ? pageSizeEmu.height / pageContainerPx.height : 0;

  const relativeX = rectPx.x - pageContainerPx.x;
  const relativeY = rectPx.y - pageContainerPx.y;

  return {
    x: Math.round(relativeX * scaleX),
    y: Math.round(relativeY * scaleY),
    // シェイプの幅・高さが 0 だと Slides API がエラーを返すため、最低 1 EMU を保証する
    width: Math.max(1, Math.round(rectPx.width * scaleX)),
    height: Math.max(1, Math.round(rectPx.height * scaleY)),
  };
}

/**
 * Slides API で新規作成したテキストボックスの既定の内部余白(インセット)。
 * PowerPoint/OOXML 互換の標準的な既定値(左右 0.1inch・上下 0.05inch)を
 * EMU で表したもの。Slides API はシェイプのインセットを直接設定する
 * フィールドを公開していないため、こちらでシェイプ自体を広げて相殺する
 * 必要がある。
 *
 * 【重要】実機テストで発見した不具合: ルビ用シェイプの幅・高さを
 * ちょうどルビ文字列がぴったり収まるサイズで作成すると、既定のインセットの
 * 分だけ実際に文字が入る内側の領域が狭くなり、Slides 側で文字列が
 * 自動折り返しされてしまう(例:「まーじゃん」の「ん」だけ2行目に
 * 折り返され、本文の上に重なって表示される)。
 */
export const DEFAULT_SHAPE_INSET_H_EMU = 91440; // 0.1inch × 914400EMU/inch
export const DEFAULT_SHAPE_INSET_V_EMU = 45720; // 0.05inch × 914400EMU/inch

/**
 * 既定のシェイプインセットを相殺できるよう、矩形を全方向に広げる
 * (中心位置は変えず、内側の実効サイズが元の矩形と一致するようにする)。
 */
export function expandRectForDefaultInsets(rect: EmuRect): EmuRect {
  return {
    x: rect.x - DEFAULT_SHAPE_INSET_H_EMU,
    y: rect.y - DEFAULT_SHAPE_INSET_V_EMU,
    width: rect.width + DEFAULT_SHAPE_INSET_H_EMU * 2,
    height: rect.height + DEFAULT_SHAPE_INSET_V_EMU * 2,
  };
}

/** 画面上のフォントサイズ(px)を Slides API 用の pt に変換する。 */
export function pxFontSizeToPoint(fontSizePx: number, pageContainerPx: PxRect, pageSizeEmu: EmuSize): number {
  const scaleY = pageContainerPx.height > 0 ? pageSizeEmu.height / pageContainerPx.height : 0;
  const emuHeight = fontSizePx * scaleY;
  const pt = emuHeight / EMU_PER_POINT;
  // Slides API は 1pt 未満やゼロだとエラーになるため下限を設ける
  return Math.max(1, Math.round(pt * 10) / 10);
}
