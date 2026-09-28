/**
 * 表ルビの文字の幅を、文書を開いているページの中で測る(chrome.scripting.executeScript)。
 * Docs の編集画面は canvas に文字を描き、そのページに読み込まれたフォントを使うので、同じページの canvas.measureText で
 * 測ると実際の表示と合う(PHASE0_FINDINGS.md 4.1節)。測れなかったときは空の表を返し、既定の幅(全角 1em・半角 0.55em)を使う。
 */
import { fontKey, type FontSpec } from '../core/docs/lineLayout';

export type WidthTable = Map<string, Map<string, number>>;

/** ページの中で実行する関数(拡張機能の外の変数は使えない)。100px で書いたときの幅(px)を返す。 */
function measureInPage(items: { font: string; chars: string[] }[]): number[][] {
  const ctx = document.createElement('canvas').getContext('2d');
  if (!ctx) return items.map((it) => it.chars.map(() => -1));
  return items.map((it) => {
    ctx.font = it.font;
    return it.chars.map((ch) => ctx.measureText(ch).width);
  });
}

/**
 * 【重要】Docs はウェブフォントを「docs-」を付けた名前で読み込む(2026-09-28 実機: document.fonts に
 * "docs-BIZ UDPGothic" があり、"BIZ UDPGothic" は無かった)。付けずに測ると別のフォントの幅になり、表のセルの中で
 * 数字が折り返した。docs- 付きの名前を先に、端末のフォント(Arial など)用に元の名前を後ろに並べる。
 */
export function cssFont(font: FontSpec): string {
  const family = font.family.replace(/"/g, '');
  return `${font.italic ? 'italic ' : ''}${font.bold ? 'bold ' : ''}100px "docs-${family}", "${family}"`;
}

export async function measureCharWidths(
  browserTabId: number | undefined,
  wanted: ReadonlyMap<string, { font: FontSpec; chars: Set<string> }>
): Promise<WidthTable> {
  const table: WidthTable = new Map();
  if (browserTabId === undefined || wanted.size === 0) return table;
  const entries = [...wanted.values()].map((w) => ({ font: w.font, chars: [...w.chars] }));
  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: browserTabId },
      func: measureInPage,
      args: [entries.map((e) => ({ font: cssFont(e.font), chars: e.chars }))],
    });
    const widths = result?.result as number[][] | undefined;
    entries.forEach((e, i) => {
      const m = new Map<string, number>();
      e.chars.forEach((ch, j) => {
        const w = widths?.[i]?.[j];
        if (typeof w === 'number' && w > 0) m.set(ch, w);
      });
      table.set(fontKey(e.font), m);
    });
  } catch (err) {
    console.warn('[ルビふり] 文字の幅を測れませんでした。既定の幅を使います', err);
  }
  return table;
}
