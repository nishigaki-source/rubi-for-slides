/**
 * フィルムストリップのサムネイルをプログラム的にクリックし、
 * 指定したページへ編集画面を切り替えるナビゲーションユーティリティ。
 * 全スライド書き込み機能(PLAN.md 3.5節)で、各ページを実際に画面表示して
 * DOM を測定するために使う(Slides API はテキストの折り返し等のレイアウト
 * 情報を返さないため)。
 *
 * 実機検証で、`mousedown`→`mouseup`→`click` の合成 MouseEvent を
 * サムネイル要素へ dispatchEvent すると、実際のマウスクリックと同じく
 * ページ切り替えが発生することを確認済み(`bubbles: true` が必須)。
 */
import { getPageContainerElement } from './selectors';

const THUMBNAIL_PAGE_ID_ATTR = 'data-slide-page-id';

function findThumbnailElement(pageObjectId: string): Element | null {
  return document.querySelector(`[${THUMBNAIL_PAGE_ID_ATTR}="${pageObjectId}"]`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * サムネイルへ合成クリックを発行する。
 *
 * 【重要】フィルムストリップは表示中の範囲外がスクロールで隠れる作りになっており、
 * スライド枚数が多い場合、目的のサムネイルが画面外(例: clientY が負の値)に
 * ある状態でクリックイベントを発行しても Google 側のクリックハンドラに無視され、
 * ページ切り替えが発生しないことが実機検証で判明した。そのため、クリック前に
 * 必ず `scrollIntoView` でフィルムストリップ内に実際にスクロールさせる必要がある。
 */
async function dispatchSyntheticClick(el: Element): Promise<void> {
  el.scrollIntoView({ block: 'center' });
  await sleep(300);

  const rect = el.getBoundingClientRect();
  const clientX = rect.x + rect.width / 2;
  const clientY = rect.y + rect.height / 2;
  const opts: MouseEventInit = { bubbles: true, cancelable: true, view: window, clientX, clientY };
  el.dispatchEvent(new MouseEvent('mousedown', opts));
  el.dispatchEvent(new MouseEvent('mouseup', opts));
  el.dispatchEvent(new MouseEvent('click', opts));
}

async function waitForPageRendered(pageObjectId: string, timeoutMs: number): Promise<boolean> {
  const pollIntervalMs = 50;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const pageEl = getPageContainerElement(document, pageObjectId);
    if (pageEl) {
      const rect = pageEl.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) return true;
    }
    await sleep(pollIntervalMs);
  }
  return false;
}

/**
 * 指定した pageObjectId のスライドへ編集画面を切り替える。
 * サムネイルが見つからない場合、または timeoutMs 以内に画面表示への
 * 切り替え(その id を持つ SVG ページルートが実際にレンダリングされる)が
 * 完了しなかった場合は false を返す。
 *
 * 【重要】フィルムストリップ上で現在位置から遠いサムネイル(例: 最後のページ
 * から最初のページへ戻る場合)へジャンプする際は、スクロールアニメーションが
 * 大きくなり、固定の待機時間だけでは合成クリックのタイミングがずれて
 * ページ切り替えに失敗することが実機検証で判明した。そのため、1回で
 * 切り替えを確認できなかった場合は、サムネイル要素を取り直して最大2回まで
 * リトライする。
 */
export async function navigateToSlide(pageObjectId: string, timeoutMs = 4000): Promise<boolean> {
  const maxAttempts = 3;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const thumb = findThumbnailElement(pageObjectId);
    if (!thumb) return false;

    await dispatchSyntheticClick(thumb);
    if (await waitForPageRendered(pageObjectId, timeoutMs)) return true;
  }
  return false;
}
