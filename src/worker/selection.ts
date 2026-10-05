/**
 * 文書のページで、いま選択している文字を読む(「選択した範囲のルビを消す」用。chrome.scripting.executeScript)。
 *
 * Docs の編集画面は canvas に描かれ、選択は DOM に現れない(window.getSelection() は空)。Docs はキー入力を受ける
 * 見えない iframe(.docs-texteventtarget-iframe)で copy イベントを受け、選択した文字を clipboardData に入れる。
 * そこで、自分で作った copy イベント(中身は空の DataTransfer)をその iframe に送り、Docs が入れた文字を読む
 * (2026-10-05 実機で確認)。本物のコピーではないので、利用者のクリップボードは変わらず、権限も増えない。
 */

/** ページの中で実行する関数(拡張機能の外の変数は使えない)。選択が無い・読めないときは null。 */
function readSelectionInPage(): string | null {
  try {
    const iframe = document.querySelector<HTMLIFrameElement>('.docs-texteventtarget-iframe');
    const doc = iframe?.contentDocument;
    if (!doc) return null;
    const data = new DataTransfer();
    // 送り先は、iframe の中の入力欄(contenteditable)。サイドパネルを押したあとはページにフォーカスが無く、
    // iframe の activeElement は body になる。body に送ると Docs は何も入れない(2026-10-05 実機)
    const target = doc.querySelector('[contenteditable="true"]') ?? doc.activeElement ?? doc.body;
    target.dispatchEvent(new ClipboardEvent('copy', { clipboardData: data, bubbles: true, cancelable: true }));
    return data.getData('text/plain');
  } catch {
    return null;
  }
}

/** 選択している文字。読めなかったときは null(タブが分からない・ページが対応していない)。 */
export async function readSelectedText(browserTabId: number | undefined): Promise<string | null> {
  if (browserTabId === undefined) return null;
  try {
    // Docs の copy の処理はページ側で動くので、ページと同じ世界で実行する
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: browserTabId },
      func: readSelectionInPage,
      world: 'MAIN',
    });
    const text = result?.result;
    return typeof text === 'string' ? text : null;
  } catch (err) {
    console.warn('[ルビふり] 選択した範囲を読めませんでした', err);
    return null;
  }
}
