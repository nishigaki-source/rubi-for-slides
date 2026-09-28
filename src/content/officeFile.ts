/**
 * PowerPoint 形式などのファイル(.pptx)を、変換せずに Googleスライドで開いているかを調べる。
 *
 * このとき Slides API はファイルを扱えず 400 を返すため、書き込み・削除の前に案内を出す
 * (v0.6.1 の利用者から「プレゼンテーションの取得に失敗しました (status: 400)」の報告があった)。
 * Googleスライドはタイトルの横に「.PPTX」などの印を出すので、その文字を探す。
 * 印の要素の名前(クラス名など)は変わりうるため、文字だけで判断する。見逃した場合も、
 * worker 側で 400 を受け取ったときに同じ案内を出す(src/worker/slidesClient.ts)。
 */

/** タイトルの横の印の文字(.PPTX / .PPT / .PPTM / .ODP) */
export const OFFICE_BADGE_PATTERN = /^\.(pptx|pptm|ppt|odp)$/i;

/** 印を探す範囲(画面の上端からの高さ px)。タイトルの行より下(スライドや本文)の文字は見ない */
const TITLE_AREA_HEIGHT_PX = 120;

export function isOfficeFileOpen(doc: Document = document): boolean {
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!OFFICE_BADGE_PATTERN.test((node.textContent ?? '').trim())) continue;
    const el = node.parentElement;
    if (!el || el.closest('svg')) continue; // スライド上の文字(SVG)は対象外
    const rect = el.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0 && rect.top < TITLE_AREA_HEIGHT_PX) return true;
  }
  return false;
}
