/**
 * 本文のフォントが日本語の文字を含むかの判定(chrome.* にも DOM にも依存しない)。
 *
 * 【実機で見つけた不具合(2026-09-29)】スライドの本文が Arial のように日本語の文字を含まないフォントだと、
 * 日本語の文字は代わりのフォントで描かれる。編集画面では利用者のパソコンの日本語フォント
 * (Mac なら ヒラギノ角ゴ、等幅の全角)だが、PDF の書き出し・印刷では Google のサーバーが
 * MS PGothic(かな・括弧・句読点の幅がまちまちのプロポーショナルフォント)で描いた(PDF に埋め込まれた
 * フォントで確認)。本文は PDF のほうが狭くなる一方、ルビは編集画面で測った位置に固定なので、
 * 括弧・句読点・かなのたびに本文だけが左に寄り、ルビがずれていった。
 * 本文に日本語のフォント(Noto Sans JP など)を指定すれば、編集画面と PDF が同じフォントで描かれ、防げる(見込み)。
 *
 * ここでは「日本語を含まないと分かっている代表的なフォント」だけを見る。知らないフォントは、警告を出さない
 * (日本語のフォントかもしれないので。誤って警告するより、見逃すほうを選ぶ)。
 */
const LATIN_ONLY_FONTS: ReadonlySet<string> = new Set([
  'arial', 'arimo', 'helvetica', 'helvetica neue', 'times new roman', 'times', 'tinos', 'courier new', 'courier', 'cousine',
  'verdana', 'georgia', 'tahoma', 'trebuchet ms', 'calibri', 'cambria', 'candara', 'consolas', 'garamond', 'palatino',
  'century gothic', 'comic sans ms', 'impact', 'segoe ui', 'roboto', 'roboto mono', 'roboto slab', 'open sans', 'lato',
  'montserrat', 'oswald', 'raleway', 'poppins', 'nunito', 'inter', 'ubuntu', 'lora', 'merriweather', 'playfair display',
  'source sans pro', 'source sans 3', 'pt sans', 'pt serif', 'work sans', 'fira sans', 'inconsolata', 'droid sans',
]);

/** CSS の font-family(「"Noto Sans JP", Arial, sans-serif」など)の先頭のフォント名。引用符は外す。 */
export function firstFontFamily(cssFontFamily: string): string {
  const first = cssFontFamily.split(',')[0] ?? '';
  return first.trim().replace(/^["']|["']$/g, '').trim();
}

/** 日本語の文字を含まないと分かっているフォントか(先頭のフォントだけを見る)。 */
export function isLatinOnlyFont(cssFontFamily: string): boolean {
  return LATIN_ONLY_FONTS.has(firstFontFamily(cssFontFamily).toLowerCase());
}
