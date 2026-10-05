/**
 * アンインストールしたときに Chrome が開く案内ページの URL(chrome.* にも DOM にも依存しない)。
 *
 * 目的: やめた理由(不具合・使い方が分からない・目的と違う、など)を、利用者が望むときだけ、直接教えてもらえるようにする。
 * ページ(docs/bye.html)には、困ったときの対処と、任意の1問のアンケートへのリンクがある。
 * 拡張機能からは、URL にバージョンだけを付ける(個人や環境を特定できる情報は付けない)。
 *
 * 開発用に読み込んだ拡張機能(unpacked)と、管理者が入れた拡張機能(企業・学校)では設定しない。
 * 開発者が自分の開発版を削除するたびにページが開いたり、管理下の利用者に案内が開いたりしないようにするため。
 */
export const UNINSTALL_PAGE_URL = 'https://rubi.rocketdone.com/bye.html';

/** Chrome の制限: URL は http(s) で 1023 文字以内。 */
export function buildUninstallUrl(version: string, base: string = UNINSTALL_PAGE_URL): string {
  const url = `${base}?v=${encodeURIComponent(version)}`;
  return url.length <= 1023 ? url : base;
}

/**
 * 設定してよいか。ストアなどから普通にインストールした拡張機能('normal')だけ。
 * installType を取れないとき(undefined)は、ストアからの更新の URL(update_url)があるかで見る。
 */
export function shouldSetUninstallUrl(installType: string | undefined, hasUpdateUrl = false): boolean {
  if (installType !== undefined) return installType === 'normal';
  return hasUpdateUrl;
}
