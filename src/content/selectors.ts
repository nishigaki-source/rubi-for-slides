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
 * 【重要】ページ全体のルート要素の id は "editor-" + スライドの objectId
 * (URL の `#slide=id.<objectId>` と同じ値)である。新規作成したスライドは
 * objectId が "p"・"p1" なので "editor-p"・"editor-p1" になるが、複製・コピー・
 * 取り込みで作られたスライドは objectId が "h273037817fe35b37_0_0" や
 * "g2c3d4e5_0_12" のような形になり、ルートも "editor-h273037817fe35b37_0_0" になる
 * (2026-09-26、実機でスライドを複製して確認)。以前は "editor-p" で始まり
 * "-"・"_" を含まない id だけをルートとみなしていたため、コピーしたプレゼン
 * テーションで「スライドの表示領域が見つかりませんでした」になっていた。
 * id の形に頼らず、「id が "editor-" で始まり、祖先に "editor-" の id を持たない
 * 要素」(ページ内のシェイプ・背景はすべてその子孫)をルートの候補とする。
 *
 * 【重要・全スライド対応で判明】スライド間を切り替えると、以前表示していた
 * ページの SVG ルートは DOM から削除されず `display:none` のまま残り続ける
 * (実機で `editor-p1`, `editor-p3`, `editor-p5` が同時に存在する状態を確認)。
 * そのため候補が複数見つかった場合は「最初にマッチしたもの」ではなく、
 * 呼び出し側が分かっていれば `pageObjectId` で厳密に一致するものを、
 * 分からなければ実際に画面に表示されている(サイズを持つ)ものを優先する
 * (選び方は DOM に依存しない `choosePageRoot` に切り出して単体テストしている)。
 */
const PAGE_ROOT_ID_PREFIX = 'editor-';

export function pageRootIdFor(pageObjectId: string): string {
  return `${PAGE_ROOT_ID_PREFIX}${pageObjectId}`;
}

export interface PageRootCandidate {
  id: string;
  /** 画面に表示されている(サイズを持つ)か */
  rendered: boolean;
}

/**
 * ページルートの候補から対象を選ぶ。
 * - pageObjectId があれば id が一致するもの(表示中かどうかは問わない)
 * - 無い、または一致するものが無ければ、表示中のもの
 * - それも無ければ先頭のもの
 */
export function choosePageRoot<T extends PageRootCandidate>(candidates: T[], pageObjectId?: string): T | null {
  if (pageObjectId) {
    const exact = candidates.find((c) => c.id === pageRootIdFor(pageObjectId));
    if (exact) return exact;
  }
  return candidates.find((c) => c.rendered) ?? candidates[0] ?? null;
}

function isRenderedSvg(svg: SVGSVGElement): boolean {
  const rect = svg.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

interface PageRootElement extends PageRootCandidate {
  svg: SVGSVGElement;
}

function collectPageRoots(root: ParentNode): PageRootElement[] {
  const roots: PageRootElement[] = [];
  for (const el of Array.from(root.querySelectorAll<Element>(`[id^="${PAGE_ROOT_ID_PREFIX}"]`))) {
    if (isInThumbnail(el)) continue;
    if (el.parentElement?.closest(`[id^="${PAGE_ROOT_ID_PREFIX}"]`)) continue; // シェイプ・背景など、ページ内の要素
    const svg = el.closest('svg');
    if (svg) roots.push({ id: el.id, rendered: isRenderedSvg(svg), svg });
  }
  return roots;
}

export function getPageContainerElement(
  root: ParentNode = document,
  pageObjectId?: string
): SVGSVGElement | null {
  return choosePageRoot(collectPageRoots(root), pageObjectId)?.svg ?? null;
}

/**
 * 指定した pageObjectId のページルート SVG だけを返す(見つからなければ null)。
 * スライド切り替えの完了待ちに使うため、`getPageContainerElement` と違って
 * 表示中の別ページへのフォールバックはしない(した場合、切り替え前のページを
 * 「表示された」と誤判定してしまう)。
 */
export function findPageRootSvgById(root: ParentNode, pageObjectId: string): SVGSVGElement | null {
  const id = pageRootIdFor(pageObjectId);
  return collectPageRoots(root).find((r) => r.id === id)?.svg ?? null;
}
