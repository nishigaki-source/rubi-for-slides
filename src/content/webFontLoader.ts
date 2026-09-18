/**
 * ルビ用フォントとして選べる Google Fonts(日本語フォント・欧文の Google Fonts)は、
 * そのスライド上でまだ一度も使われていないと、ブラウザにフォントファイルが
 * 読み込まれておらず、指定しても既定フォントのまま見た目が変わらない
 * (実機で確認: `document.fonts.check()` は true を返すのに canvas 上の実測幅が
 * 存在しないフォント名と同じで、実際には代替フォントで描画されていた)。
 *
 * これを避けるため、選ばれたフォントを Google Fonts の stylesheet から動的に
 * 読み込む。OS 標準の定番フォント(Arial 等、FONT_GROUPS の「定番(欧文)」)は
 * 読み込み不要なので対象外にする。
 */
import { FONT_GROUPS } from '../shared/fontOptions';

const SYSTEM_FONT_NAMES = new Set(FONT_GROUPS[0]?.options.map((f) => f.value) ?? []);

const loadedFonts = new Set<string>();

export function ensureWebFontLoaded(fontFamily: string | undefined): void {
  if (!fontFamily || SYSTEM_FONT_NAMES.has(fontFamily) || loadedFonts.has(fontFamily)) return;
  loadedFonts.add(fontFamily);

  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(fontFamily).replace(/%20/g, '+')}&display=swap`;
  document.head.appendChild(link);
}
