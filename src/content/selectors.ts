/**
 * Googleスライドの DOM/SVG セレクタを一箇所に集約するモジュール。
 * PHASE0_FINDINGS.md で確認した構造に基づく:
 *   - 編集キャンバスは SVG で、漢字1文字ごとに独立した <text> 要素を持つ
 *     (<g class="sketchy-text-content-text"> に包まれる)
 *   - サムネイル(フィルムストリップ)側は別構造(.punch-filmstrip-thumbnail)
 *   - 段落は <g id="editor-i<N>-paragraph-<M>"> でグループ化される
 *   - シェイプ全体は <g id="editor-i<N>">
 *
 * Google 側の DOM 実装が変わった場合、影響はこのファイルに閉じ込める。
 */

const THUMBNAIL_CLASS = 'punch-filmstrip-thumbnail';
const PARAGRAPH_ID_PATTERN = /-paragraph-\d+$/;
const SHAPE_ID_PATTERN = /^editor-i\d+$/;
/**
 * スピーカーノート欄も編集キャンバスと同じ SVG <text> 構造で描画されており
 * (id が "speakernotes-i<N>-paragraph-<M>" になる)、実機テストで
 * ノート欄のプレースホルダー文字にまでルビが付いてしまう不具合が見つかった。
 * スライド本体の id は "editor-" で始まるのに対し、ノート欄は "speakernotes-"
 * で始まるため、この prefix で区別して除外する。
 */
const SPEAKER_NOTES_ID_PREFIX = 'speakernotes-';

export function isInThumbnail(el: Element): boolean {
  return el.closest(`.${THUMBNAIL_CLASS}`) !== null;
}

/** 祖先に id が "speakernotes-" で始まる要素を持つか(スピーカーノート欄かどうか)。 */
export function isInSpeakerNotes(el: Element): boolean {
  let current: Element | null = el;
  while (current) {
    if (current.id.startsWith(SPEAKER_NOTES_ID_PREFIX)) return true;
    current = current.parentElement;
  }
  return false;
}

/** 編集キャンバス上の、1 文字ずつの <text> 要素を取得する(サムネイル・スピーカーノート欄は除外)。 */
export function getMainCanvasTextElements(root: ParentNode = document): SVGTextElement[] {
  const all = Array.from(root.querySelectorAll<SVGTextElement>('text'));
  return all.filter((el) => !isInThumbnail(el) && !isInSpeakerNotes(el));
}

/**
 * 文字要素からその文字が属する「段落」または妥当なフォールバック単位の
 * コンテナ要素を返す。優先順位:
 *   1. id が `-paragraph-<N>` で終わる祖先(段落)
 *   2. id が `editor-i<N>` の祖先(シェイプ全体。段落IDが見つからない場合)
 *   3. 直近の <g> 祖先(それも見つからない場合の最終フォールバック)
 *   4. 文字要素自身(万一 <g> すら無い場合)
 */
export function getGroupContainer(textEl: SVGTextElement): Element {
  let el: Element | null = textEl.parentElement;
  let shapeFallback: Element | null = null;

  while (el) {
    if (el.id && PARAGRAPH_ID_PATTERN.test(el.id)) {
      return el;
    }
    if (!shapeFallback && el.id && SHAPE_ID_PATTERN.test(el.id)) {
      shapeFallback = el;
    }
    el = el.parentElement;
  }

  if (shapeFallback) return shapeFallback;

  const nearestG = textEl.closest('g');
  return nearestG ?? textEl;
}

/**
 * スライド1ページ全体を表す SVG 要素を取得する(モード B の px→EMU 変換で、
 * 「編集画面の実測ピクセル寸法」の基準として使う。PLAN.md 3.5節参照)。
 *
 * 【重要】ページ全体のルート要素の id は固定の "editor-p" ではなく、
 * 実際には "editor-p<スライドのobjectId>"(例: "editor-p1")という形式である
 * ことが実機テストで判明した(Phase 0 で検証した際は新規作成した空の
 * プレゼンテーションだったため、たまたま単純な "editor-p" になっていた)。
 * さらに同じ prefix を持つ兄弟要素("editor-p1-bg" や "editor-p1_i2" など、
 * ページ内の背景・シェイプ)と区別する必要があるため、id が
 * "editor-p" の直後にハイフン・アンダースコアを含まずに終わるものだけを
 * ページルートとみなす。
 *
 * 【重要・全スライド対応で判明】スライド間を切り替えると、以前表示していた
 * ページの SVG ルートは DOM から削除されず `display:none` のまま残り続ける
 * (実機で `editor-p1`, `editor-p3`, `editor-p5` が同時に存在する状態を確認)。
 * そのため候補が複数見つかった場合は「最初にマッチしたもの」ではなく、
 * 呼び出し側が分かっていれば `pageObjectId` で厳密に一致するものを、
 * 分からなければ実際に画面に表示されている(サイズを持つ)ものを優先する。
 */
const PAGE_ROOT_ID_PATTERN = /^editor-p[^-_]*$/;

function isRenderedSvg(svg: SVGSVGElement): boolean {
  const rect = svg.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

export function getPageContainerElement(
  root: ParentNode = document,
  pageObjectId?: string
): SVGSVGElement | null {
  const candidates = Array.from(root.querySelectorAll<Element>('[id^="editor-p"]')).filter((el) =>
    PAGE_ROOT_ID_PATTERN.test(el.id)
  );

  if (pageObjectId) {
    const exact = candidates.find((el) => el.id === `editor-p${pageObjectId}`);
    const svg = exact?.closest('svg') ?? null;
    if (svg) return svg;
  }

  const visible = candidates
    .map((el) => el.closest('svg'))
    .find((svg): svg is SVGSVGElement => svg !== null && isRenderedSvg(svg));
  if (visible) return visible;

  for (const candidate of candidates) {
    const svg = candidate.closest('svg');
    if (svg) return svg;
  }
  return null;
}
