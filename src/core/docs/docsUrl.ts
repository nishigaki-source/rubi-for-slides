/**
 * Googleドキュメントの URL から文書 ID と、開いているタブの ID を取り出す(スライド版の slidesUrl.ts と同じ考え方)。
 *
 * 例: https://docs.google.com/document/d/1AbC.../edit?tab=t.0#heading=h.xxx
 *   -> documentId = "1AbC...", tabId = "t.0"
 * タブの指定が無い URL では tabId は undefined(最初のタブを使う)。
 */

export interface ParsedDocsUrl {
  documentId: string;
  tabId?: string;
}

export function parseDocsUrl(href: string): ParsedDocsUrl | null {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  if (url.hostname !== 'docs.google.com') return null;
  const idMatch = /^\/document(?:\/u\/\d+)?\/d\/([a-zA-Z0-9_-]+)/.exec(url.pathname);
  if (!idMatch?.[1]) return null;
  const tab = url.searchParams.get('tab');
  return { documentId: idMatch[1], ...(tab && /^t\.[a-zA-Z0-9_.-]+$/.test(tab) ? { tabId: tab } : {}) };
}
