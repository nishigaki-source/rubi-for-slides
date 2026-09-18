/**
 * スライドの編集・スクロール・ズーム・スライド切り替えを検知し、
 * デバウンスしたコールバックで再描画をトリガーする。
 *
 * PHASE0_FINDINGS.md 5節で、MutationObserver が編集操作に対して
 * 確実に発火することを実機で確認済み。ただしズーム操作等は DOM 変更を
 * 伴わない場合があるため、window の resize イベントも合わせて監視する。
 *
 * 重要: オーバーレイ自体の描画(ルビ <span> の追加・削除)も document.body 配下の
 * DOM 変更として観測されてしまうため、自分自身が発生させた変更は無視しないと
 * 「再描画 -> mutation検知 -> 再描画」の無限ループになる。そのため
 * OVERLAY_ROOT_ID 配下で完結する MutationRecord は無視する。
 */
import { OVERLAY_ROOT_ID } from './overlayRenderer';

const DEBOUNCE_MS = 250;

export interface DomWatcherHandle {
  stop: () => void;
}

function isInsideOverlay(node: Node | null): boolean {
  if (!node) return false;
  const el = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
  return el ? el.closest(`#${OVERLAY_ROOT_ID}`) !== null : false;
}

/** この MutationRecord がオーバーレイ自身の変更だけで完結しているか。 */
function isOwnOverlayMutation(record: MutationRecord): boolean {
  if (isInsideOverlay(record.target)) return true;
  if (record.type === 'childList') {
    const nodes = [...Array.from(record.addedNodes), ...Array.from(record.removedNodes)];
    if (nodes.length > 0 && nodes.every((n) => isInsideOverlay(n) || isInsideOverlay(n.parentNode))) {
      return true;
    }
  }
  return false;
}

export function startDomWatcher(onChange: () => void, target: Node = document.body): DomWatcherHandle {
  let timer: ReturnType<typeof setTimeout> | null = null;

  const scheduleChange = (): void => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      onChange();
    }, DEBOUNCE_MS);
  };

  const observer = new MutationObserver((records) => {
    const hasExternalChange = records.some((r) => !isOwnOverlayMutation(r));
    if (hasExternalChange) {
      scheduleChange();
    }
  });
  observer.observe(target, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
  });

  window.addEventListener('resize', scheduleChange);
  // Slides の編集エリアはウィンドウ全体のスクロールではなく内部コンテナが
  // スクロールすることが多いため、capture:true でスクロールイベントを拾う。
  window.addEventListener('scroll', scheduleChange, true);

  return {
    stop: () => {
      if (timer) clearTimeout(timer);
      observer.disconnect();
      window.removeEventListener('resize', scheduleChange);
      window.removeEventListener('scroll', scheduleChange, true);
    },
  };
}
