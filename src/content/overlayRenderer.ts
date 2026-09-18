/**
 * 画面上にルビを重ねて表示するオーバーレイ(モード A)。
 * スライドの DOM 自体は変更せず、position:fixed の別レイヤーとして描画する。
 *
 * 【重要】Phase 0 では「1 文字 1 <text> 要素」を確認したが、実機での
 * 追加検証で、同じ書式が連続する文字は 1 つの <text> 要素にまとめられる
 * ことがあると判明した(例:「テッ」「う！」が1要素になるケース)。
 * そのため要素内に複数文字がある場合は getBoundingClientRect() では
 * 個々の文字の位置を取れず、getExtentOfChar(charIndexInElement) で
 * ローカル座標を取り、getScreenCTM() で画面座標に変換する
 * (Phase 0 で検証済みの経路)。要素内が1文字だけの場合は
 * getBoundingClientRect() で十分(こちらの方が軽量)。
 */
import type { RubyStyleOverride } from '../core/types';
import { domRectToRect, groupIndicesByLine, transformRect, unionRects, type Rect } from './geometry';
import { computeRubyFontSize, pickUniformRubyFontSize } from './rubyLayout';
import type { ExtractedChar } from './textExtractor';
import { ensureWebFontLoaded } from './webFontLoader';

/** 1 文字分の画面上の矩形を取得する。 */
function getCharRect(c: ExtractedChar): Rect {
  const totalChars = c.el.textContent ? Array.from(c.el.textContent).length : 1;
  if (totalChars <= 1) {
    return domRectToRect(c.el.getBoundingClientRect());
  }
  try {
    const extent = c.el.getExtentOfChar(c.charIndexInElement);
    const ctm = c.el.getScreenCTM();
    if (!ctm) return domRectToRect(c.el.getBoundingClientRect());
    return transformRect(ctm, { x: extent.x, y: extent.y, width: extent.width, height: extent.height });
  } catch {
    // getExtentOfChar が失敗する環境(非表示要素など)向けのフォールバック
    return domRectToRect(c.el.getBoundingClientRect());
  }
}

export interface GlobalRubyRange {
  /** 段落内のグローバル文字インデックス(開始、含む) */
  start: number;
  /** 段落内のグローバル文字インデックス(終了、含まない) */
  end: number;
  kana: string;
  /** ユーザー辞書による見た目の個別上書き(指定が無ければ全体設定を使う) */
  style?: RubyStyleOverride;
}

/**
 * 全体設定(popup)の既定フォント・色。個別上書きが無いルビはこの値を使う。
 *
 * 【重要】フォントは CSS の `font-family` として(モード A の画面表示)、かつ
 * Slides API の `updateTextStyle.fontFamily` として(モード B の書き込み)の
 * 両方でそのまま使う共通の値。`sans-serif` のような CSS 総称ファミリ名は
 * Slides API では実在のフォント名として扱われずエラーになる可能性があるため、
 * 両方で安全に使える実在のフォント名(Arial、大半の環境で利用可能)を既定値にする。
 */
export const DEFAULT_RUBY_FONT_FAMILY = 'Arial';
export const DEFAULT_RUBY_COLOR = '#1a1a1a';

export interface OverlayOptions {
  /** ルビの表示 ON/OFF */
  enabled: boolean;
  /** 本文フォントサイズに対するルビの比率(既定 0.5) */
  sizeRatio: number;
  /** 全体設定のフォント(省略時は DEFAULT_RUBY_FONT_FAMILY) */
  fontFamily?: string;
  /** 全体設定の色(省略時は DEFAULT_RUBY_COLOR) */
  color?: string;
}

/**
 * オーバーレイのルート要素 id。DomWatcher はこの id を持つ要素配下の DOM 変更を
 * 「自分自身の描画」とみなして無視する(無限に再描画ループしないようにするため)。
 */
export const OVERLAY_ROOT_ID = 'rubi-for-slides-overlay-root';

function getOrCreateOverlayRoot(): HTMLDivElement {
  let root = document.getElementById(OVERLAY_ROOT_ID) as HTMLDivElement | null;
  if (!root) {
    root = document.createElement('div');
    root.id = OVERLAY_ROOT_ID;
    root.setAttribute(
      'style',
      [
        'position: fixed',
        'top: 0',
        'left: 0',
        'width: 0',
        'height: 0',
        'overflow: visible',
        'pointer-events: none',
        'z-index: 2147483647',
      ].join('; ')
    );
    document.body.appendChild(root);
  }
  return root;
}

/** オーバーレイの内容を消す(トークン化前や無効化時に呼ぶ)。 */
export function clearOverlay(): void {
  const root = document.getElementById(OVERLAY_ROOT_ID);
  if (root) root.replaceChildren();
}

/** オーバーレイの表示/非表示だけを切り替える(再計算なしで高速)。 */
export function setOverlayVisible(visible: boolean): void {
  const root = document.getElementById(OVERLAY_ROOT_ID);
  if (root) root.style.display = visible ? '' : 'none';
}

function createRubySpan(
  kana: string,
  box: { x: number; y: number; width: number; height: number },
  fontSizePx: number,
  fontFamily: string,
  color: string
): HTMLSpanElement {
  const span = document.createElement('span');
  span.textContent = kana;
  span.dataset.rubiForSlides = 'true';
  const left = box.x + box.width / 2;
  const top = box.y - fontSizePx * 1.05; // 本文の少し上に配置
  span.setAttribute(
    'style',
    [
      'position: fixed',
      `left: ${left}px`,
      `top: ${top}px`,
      'transform: translateX(-50%)',
      `font-size: ${fontSizePx}px`,
      'line-height: 1',
      'white-space: nowrap',
      'background: rgba(255, 255, 255, 0.7)',
      'border-radius: 2px',
      'padding: 0 1px',
      'pointer-events: none',
    ].join('; ')
  );
  // fontFamily/color はユーザー辞書由来の自由入力の可能性があるため、
  // 文字列結合で style 属性に埋め込まず、CSSOM の個別プロパティ代入を使う
  // (個別プロパティへの代入は値全体が1つのプロパティとしてのみ解釈されるため、
  // `;` 等を含む値で他のプロパティへ抜け出す CSS インジェクションを防げる)。
  span.style.setProperty('font-family', fontFamily);
  span.style.setProperty('color', color);
  ensureWebFontLoaded(fontFamily);
  return span;
}

export interface RubyPlacement {
  kana: string;
  box: Rect;
  fontSizePx: number;
  fontFamily: string;
  color: string;
}

/**
 * 1 段落分の「どこに・何の読みを・どのサイズで」ルビを置くかを計算する。
 * DOM への描画は行わない純粋な計算部分だけを切り出したもの。
 *
 * モード A(このファイルの `renderParagraphRuby`、画面オーバーレイ)と
 * モード B(`content/writeController.ts`、スライドへの書き込み)の両方が
 * この関数を共有する。文字位置の計算・折り返し行の分割・段落内での
 * フォントサイズ統一は、実機テストで複数の不具合が見つかった複雑なロジック
 * (このファイル冒頭のコメント、および PLAN.md Phase 1 節を参照)なので、
 * 一度直したものを両モードで再利用し、同じ不具合を作り込まないようにする。
 *
 * 【重要】フォントサイズは 2 パスで決定する。1 パス目で各ルビの「単体では
 * 最適な」サイズを計算し、2 パス目でその段落内の最小値を全ルビに一律適用する。
 * 単純に各ルビを個別最適化すると、隣り合う単語で読みの文字数が違うだけで
 * サイズがバラバラになり、見た目が不自然になることが実機テストで判明した
 * (例:「最小」+「単位」で「さいしょう」だけ小さく「たんい」だけ大きく
 * 表示された)。段落内で統一感のあるサイズにするため、最も厳しい制約
 * (最小値)を段落全体の共通サイズとして採用する。
 *
 * 【重要】単語ごとの sizeRatio 上書き(ユーザー辞書、PLAN.md 3.7節)がある
 * ルビは、この「段落内で統一する」プールから除外し、常に自分専用のサイズで
 * 描画する。ユーザーが意図的に個別指定したサイズを、他の単語の都合で
 * 縮小/拡大してしまわないようにするため。
 *
 * @param chars 段落の文字と DOM 要素(textExtractor の出力)
 * @param ranges グローバル文字インデックスで表したルビ区間
 * @param sizeRatio 本文フォントサイズに対するルビの比率(全体設定の既定値)
 * @param styleDefaults 全体設定のフォント・色(個別上書きが無いルビのフォールバック値)
 */
export function computeParagraphRubyPlan(
  chars: ExtractedChar[],
  ranges: GlobalRubyRange[],
  sizeRatio: number,
  styleDefaults: { fontFamily?: string; color?: string } = {}
): RubyPlacement[] {
  const defaultFontFamily = styleDefaults.fontFamily ?? DEFAULT_RUBY_FONT_FAMILY;
  const defaultColor = styleDefaults.color ?? DEFAULT_RUBY_COLOR;

  interface Pending {
    kana: string;
    box: Rect;
    /** この1件だけを見た場合の最適サイズ(段落全体で統一する前の値) */
    naturalFontSize: number;
    fontFamily: string;
    color: string;
    /** sizeRatio が単語ごとに上書きされているか(段落内の統一サイズ計算から除外する) */
    hasSizeOverride: boolean;
  }
  const pending: Pending[] = [];

  for (const range of ranges) {
    const targetChars = chars.slice(range.start, range.end);
    if (targetChars.length === 0) continue;

    const rects = targetChars.map(getCharRect);

    // テキストボックスの折り返しにより、同じルビ区間の文字が複数の視覚行に
    // またがることがある(実機テストで発見)。行ごとにグループ化し、
    // それぞれの行の上に読みを文字数比で振り分けて描画する。
    const lineGroups = groupIndicesByLine(rects);
    const kanaChars = Array.from(range.kana);
    let kanaCursor = 0;

    const effectiveSizeRatio = range.style?.sizeRatio ?? sizeRatio;
    const fontFamily = range.style?.fontFamily ?? defaultFontFamily;
    const color = range.style?.color ?? defaultColor;
    const hasSizeOverride = range.style?.sizeRatio !== undefined;

    lineGroups.forEach((group, groupIndex) => {
      const isLastGroup = groupIndex === lineGroups.length - 1;
      let count: number;
      if (isLastGroup) {
        count = kanaChars.length - kanaCursor;
      } else {
        count = Math.round((kanaChars.length * group.length) / targetChars.length);
      }
      count = Math.max(0, Math.min(count, kanaChars.length - kanaCursor));
      const kanaSlice = kanaChars.slice(kanaCursor, kanaCursor + count).join('');
      kanaCursor += count;
      if (kanaSlice.length === 0) return;

      const groupRects = group.map((i) => rects[i] as Rect);
      const box = unionRects(groupRects);
      if (box.width === 0 || box.height === 0) return; // 非表示中の要素など

      const naturalFontSize = computeRubyFontSize(
        box.width,
        box.height,
        Array.from(kanaSlice).length,
        effectiveSizeRatio
      );
      pending.push({ kana: kanaSlice, box, naturalFontSize, fontFamily, color, hasSizeOverride });
    });
  }

  if (pending.length === 0) return [];

  const uniformCandidates = pending.filter((p) => !p.hasSizeOverride).map((p) => p.naturalFontSize);
  const uniformFontSize = uniformCandidates.length > 0 ? pickUniformRubyFontSize(uniformCandidates) : 0;

  return pending.map((p) => ({
    kana: p.kana,
    box: p.box,
    fontSizePx: p.hasSizeOverride ? p.naturalFontSize : uniformFontSize,
    fontFamily: p.fontFamily,
    color: p.color,
  }));
}

/**
 * 1 段落分のルビを描画する。呼び出し側で段落ごとに呼ぶことを想定。
 * この関数自体はオーバーレイをクリアしない(複数段落を順に追記していくため)。
 * 全体の再描画を行う際は、呼び出し側が最初に一度だけ clearOverlay() を呼ぶこと。
 *
 * @param chars 段落の文字と DOM 要素(textExtractor の出力)
 * @param ranges グローバル文字インデックスで表したルビ区間
 */
export function renderParagraphRuby(
  chars: ExtractedChar[],
  ranges: GlobalRubyRange[],
  options: OverlayOptions
): void {
  const root = getOrCreateOverlayRoot();
  root.style.display = options.enabled ? '' : 'none';
  if (!options.enabled) return;

  const plan = computeParagraphRubyPlan(chars, ranges, options.sizeRatio, {
    fontFamily: options.fontFamily,
    color: options.color,
  });
  for (const p of plan) {
    root.appendChild(createRubySpan(p.kana, p.box, p.fontSizePx, p.fontFamily, p.color));
  }
}
