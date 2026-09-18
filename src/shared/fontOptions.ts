/**
 * ルビのフォント選択肢。パネル(全体設定)・options ページ(単語ごとの上書き)の
 * 両方で共有する。
 *
 * 【重要】ここに挙げるフォント名は、CSS の `font-family` として(モード A の
 * 画面表示)、かつ Slides API の `updateTextStyle.fontFamily` として
 * (モード B の書き込み)、そのまま両方で使われる。`sans-serif` のような CSS
 * 総称ファミリ名は Slides API では実在のフォントとして扱われずエラーになる
 * 可能性があるため、含めていない(実機で確認済みの制約)。
 *
 * ここに挙げているのは Google スライドの「その他のフォント」ダイアログに
 * 実際に含まれる実在フォント名(定番の欧文フォント + Google Fonts)。
 * ルビ(ふりがな)の用途上、日本語 Web フォントも一通り選べるようにしている。
 * ただし Web フォントは、そのスライド上でまだ一度も使われていない場合、
 * ブラウザ側(モード A)ではフォントファイルが未読み込みのため代替フォントで
 * 表示されることがある(エラーにはならず、見た目が既定フォントになるだけ)。
 */
export interface FontOption {
  value: string;
  label: string;
}

export interface FontOptionGroup {
  label: string;
  options: FontOption[];
}

export const FONT_GROUPS: FontOptionGroup[] = [
  {
    label: '定番(欧文)',
    options: [
      { value: 'Arial', label: 'Arial(既定・ゴシック体)' },
      { value: 'Arial Black', label: 'Arial Black' },
      { value: 'Comic Sans MS', label: 'Comic Sans MS(手書き風)' },
      { value: 'Courier New', label: 'Courier New(等幅)' },
      { value: 'Georgia', label: 'Georgia(明朝体風)' },
      { value: 'Helvetica', label: 'Helvetica' },
      { value: 'Impact', label: 'Impact' },
      { value: 'Times New Roman', label: 'Times New Roman' },
      { value: 'Trebuchet MS', label: 'Trebuchet MS' },
      { value: 'Verdana', label: 'Verdana' },
    ],
  },
  {
    label: 'Google Fonts(欧文)',
    options: [
      { value: 'Lato', label: 'Lato' },
      { value: 'Lobster', label: 'Lobster' },
      { value: 'Merriweather', label: 'Merriweather' },
      { value: 'Montserrat', label: 'Montserrat' },
      { value: 'Open Sans', label: 'Open Sans' },
      { value: 'Oswald', label: 'Oswald' },
      { value: 'Playfair Display', label: 'Playfair Display' },
      { value: 'Poppins', label: 'Poppins' },
      { value: 'PT Sans', label: 'PT Sans' },
      { value: 'PT Serif', label: 'PT Serif' },
      { value: 'Roboto', label: 'Roboto' },
      { value: 'Roboto Condensed', label: 'Roboto Condensed' },
      { value: 'Roboto Mono', label: 'Roboto Mono(等幅)' },
      { value: 'Roboto Slab', label: 'Roboto Slab' },
      { value: 'Ubuntu', label: 'Ubuntu' },
    ],
  },
  {
    label: '日本語 - ゴシック体',
    options: [
      { value: 'Noto Sans JP', label: 'Noto Sans JP' },
      { value: 'M PLUS 1p', label: 'M PLUS 1p' },
      { value: 'M PLUS Rounded 1c', label: 'M PLUS Rounded 1c(丸ゴシック)' },
      { value: 'Kosugi', label: 'Kosugi' },
      { value: 'Kosugi Maru', label: 'Kosugi Maru(丸ゴシック)' },
      { value: 'Sawarabi Gothic', label: 'Sawarabi Gothic' },
      { value: 'BIZ UDGothic', label: 'BIZ UDGothic' },
      { value: 'Zen Kaku Gothic New', label: 'Zen Kaku Gothic New' },
      { value: 'Zen Maru Gothic', label: 'Zen Maru Gothic(丸ゴシック)' },
    ],
  },
  {
    label: '日本語 - 明朝体・手書き風など',
    options: [
      { value: 'Noto Serif JP', label: 'Noto Serif JP' },
      { value: 'Sawarabi Mincho', label: 'Sawarabi Mincho' },
      { value: 'BIZ UDMincho', label: 'BIZ UDMincho' },
      { value: 'Shippori Mincho', label: 'Shippori Mincho' },
      { value: 'Klee One', label: 'Klee One(手書き風)' },
      { value: 'Yomogi', label: 'Yomogi(手書き風)' },
      { value: 'Yusei Magic', label: 'Yusei Magic' },
      { value: 'Hachi Maru Pop', label: 'Hachi Maru Pop(ポップ体)' },
      { value: 'Dela Gothic One', label: 'Dela Gothic One(見出し向け)' },
    ],
  },
];

/** グループ分けを気にしない用途(バリデーション等)向けのフラットな一覧。 */
export const FONT_OPTIONS: FontOption[] = FONT_GROUPS.flatMap((group) => group.options);

/** `<select>` にグループ分けされたフォント選択肢を追加する(パネル・options ページ共通)。 */
export function populateFontSelect(select: HTMLSelectElement): void {
  for (const group of FONT_GROUPS) {
    const optgroup = document.createElement('optgroup');
    optgroup.label = group.label;
    for (const font of group.options) {
      const option = document.createElement('option');
      option.value = font.value;
      option.textContent = font.label;
      optgroup.appendChild(option);
    }
    select.appendChild(optgroup);
  }
}
