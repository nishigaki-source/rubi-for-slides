/**
 * chrome.i18n.getMessage の薄いラッパーと、静的マークアップへの適用ヘルパー。
 * ブラウザの表示言語(chrome://settings/languages)に応じて `_locales/{lang}/messages.json`
 * から自動的に選ばれる(`_locales/ja` が `default_locale`、無ければ英語にフォールバック)。
 * この拡張機能自体に言語切り替えUIは無く、ブラウザの言語設定に追従する。
 */
export function t(key: string, substitutions?: string | string[]): string {
  try {
    return chrome.i18n.getMessage(key, substitutions) || key;
  } catch {
    // chrome.i18n が無い環境(一部のテストスタブ等)向けのフォールバック
    return key;
  }
}

/**
 * `data-i18n` / `data-i18n-placeholder` / `data-i18n-aria-label` 属性を持つ要素に
 * 対応するメッセージを適用する。動的に組み立てる文字列(件数・単語名などを含むもの)は
 * 対象外なので、呼び出し側で個別に `t()` を使うこと。
 */
export function applyI18n(root: ParentNode): void {
  for (const el of root.querySelectorAll<HTMLElement>('[data-i18n]')) {
    const key = el.dataset.i18n;
    if (key) el.textContent = t(key);
  }
  for (const el of root.querySelectorAll<HTMLInputElement>('[data-i18n-placeholder]')) {
    const key = el.dataset.i18nPlaceholder;
    if (key) el.placeholder = t(key);
  }
  for (const el of root.querySelectorAll<HTMLElement>('[data-i18n-aria-label]')) {
    const key = el.dataset.i18nAriaLabel;
    if (key) el.setAttribute('aria-label', t(key));
  }
  for (const el of root.querySelectorAll<HTMLElement>('[data-i18n-html]')) {
    const key = el.dataset.i18nHtml;
    if (key) el.innerHTML = t(key);
  }
}
