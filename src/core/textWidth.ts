/**
 * ルビの文字列の幅を見積もる(chrome.* にも DOM にも依存しない)。
 *
 * 日本語のふりがな(かな)は「1文字 = 全角1文字分」で、これまでは文字数をそのまま幅として使っていた。
 * 中国語の拼音は英字(声調記号付き)で、1文字あたりの幅はかなの約半分。文字数で幅を数えると、
 * ルビが実際よりずっと広いと見積もられ、小さく縮められたり、隣のルビを必要以上に押しのけたりする。
 * そこで、ルビのフォントサイズを 1 としたときの幅(em)を、文字の種類ごとに見積もる。
 * かな・全角文字は 1em なので、日本語の計算結果はこれまでと変わらない。
 *
 * 英字の幅は Arial の字幅を丸めた値(フォントによって多少違うが、隣のルビとの間隔を決める程度の精度でよい)。
 */
const NARROW: Readonly<Record<string, number>> = {
  i: 0.22, j: 0.22, l: 0.22, I: 0.28, t: 0.28, f: 0.28, r: 0.33,
  ' ': 0.28, '.': 0.28, ',': 0.28, ':': 0.28, ';': 0.28, '!': 0.28, "'": 0.2, '|': 0.26,
};
const WIDE: Readonly<Record<string, number>> = { m: 0.83, w: 0.72, W: 0.94, M: 0.83 };
const LATIN_DEFAULT_EM = 0.55;
const COMBINING_MARK = /[̀-ͯ]/;
/** これ未満の文字コードは英字・記号(ラテン文字)として、細かい幅で数える */
const LATIN_LIMIT = 0x250;

export function estimateRubyWidthEm(text: string): number {
  let em = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    if (COMBINING_MARK.test(ch)) continue; // 分解された声調記号(幅は元の英字に含まれる)
    if (code >= LATIN_LIMIT) {
      // かな・漢字・全角文字。濁点付きのかな(ぎ など)を分解して数えないよう、ここでは分解しない
      em += 1;
      continue;
    }
    // 声調記号付きの英字(ā ǎ ǚ など)は、元の英字(a a u)の幅で数える
    const base = ch.normalize('NFD').charAt(0);
    let width = NARROW[base] ?? WIDE[base] ?? (base >= 'A' && base <= 'Z' ? 0.67 : LATIN_DEFAULT_EM);
    // 声調記号付きの i(ī í ǐ ì)は、記号のぶん i より広い(実機で確認。Arial で約 0.28em)
    if (base === 'i' && ch !== base) width = 0.28;
    em += width;
  }
  return em;
}
