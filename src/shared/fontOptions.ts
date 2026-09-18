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
 * 表示されることがある(エラーにはならず、見た目が既定フォントになるだけ。
 * `content/webFontLoader.ts` で Google Fonts から動的に読み込んで解消している)。
 *
 * `value` は Slides API にもそのまま送る実在のフォント名なので翻訳しない。
 * `labelKey` は表示用ラベル(フォント名+簡単な説明)の `chrome.i18n` キーで、
 * 実際の文言は `scripts/build-locales.mjs` -> `public/_locales/{ja,en}/messages.json`
 * にある。
 */
import { t } from './i18n';

export interface FontOption {
  value: string;
  labelKey: string;
}

export interface FontOptionGroup {
  labelKey: string;
  options: FontOption[];
}

export const FONT_GROUPS: FontOptionGroup[] = [
  {
    labelKey: 'fontGroupStandard',
    options: [
      { value: 'Arial', labelKey: 'fontArial' },
      { value: 'Arial Black', labelKey: 'fontArialBlack' },
      { value: 'Comic Sans MS', labelKey: 'fontComicSansMs' },
      { value: 'Courier New', labelKey: 'fontCourierNew' },
      { value: 'Georgia', labelKey: 'fontGeorgia' },
      { value: 'Helvetica', labelKey: 'fontHelvetica' },
      { value: 'Impact', labelKey: 'fontImpact' },
      { value: 'Times New Roman', labelKey: 'fontTimesNewRoman' },
      { value: 'Trebuchet MS', labelKey: 'fontTrebuchetMs' },
      { value: 'Verdana', labelKey: 'fontVerdana' },
    ],
  },
  {
    labelKey: 'fontGroupGoogleLatin',
    options: [
      { value: 'Lato', labelKey: 'fontLato' },
      { value: 'Lobster', labelKey: 'fontLobster' },
      { value: 'Merriweather', labelKey: 'fontMerriweather' },
      { value: 'Montserrat', labelKey: 'fontMontserrat' },
      { value: 'Open Sans', labelKey: 'fontOpenSans' },
      { value: 'Oswald', labelKey: 'fontOswald' },
      { value: 'Playfair Display', labelKey: 'fontPlayfairDisplay' },
      { value: 'Poppins', labelKey: 'fontPoppins' },
      { value: 'PT Sans', labelKey: 'fontPtSans' },
      { value: 'PT Serif', labelKey: 'fontPtSerif' },
      { value: 'Roboto', labelKey: 'fontRoboto' },
      { value: 'Roboto Condensed', labelKey: 'fontRobotoCondensed' },
      { value: 'Roboto Mono', labelKey: 'fontRobotoMono' },
      { value: 'Roboto Slab', labelKey: 'fontRobotoSlab' },
      { value: 'Ubuntu', labelKey: 'fontUbuntu' },
    ],
  },
  {
    labelKey: 'fontGroupJapaneseGothic',
    options: [
      { value: 'Noto Sans JP', labelKey: 'fontNotoSansJp' },
      { value: 'M PLUS 1p', labelKey: 'fontMPlus1p' },
      { value: 'M PLUS Rounded 1c', labelKey: 'fontMPlusRounded1c' },
      { value: 'Kosugi', labelKey: 'fontKosugi' },
      { value: 'Kosugi Maru', labelKey: 'fontKosugiMaru' },
      { value: 'Sawarabi Gothic', labelKey: 'fontSawarabiGothic' },
      { value: 'BIZ UDGothic', labelKey: 'fontBizUdGothic' },
      { value: 'Zen Kaku Gothic New', labelKey: 'fontZenKakuGothicNew' },
      { value: 'Zen Maru Gothic', labelKey: 'fontZenMaruGothic' },
    ],
  },
  {
    labelKey: 'fontGroupJapaneseOther',
    options: [
      { value: 'Noto Serif JP', labelKey: 'fontNotoSerifJp' },
      { value: 'Sawarabi Mincho', labelKey: 'fontSawarabiMincho' },
      { value: 'BIZ UDMincho', labelKey: 'fontBizUdMincho' },
      { value: 'Shippori Mincho', labelKey: 'fontShipporiMincho' },
      { value: 'Klee One', labelKey: 'fontKleeOne' },
      { value: 'Yomogi', labelKey: 'fontYomogi' },
      { value: 'Yusei Magic', labelKey: 'fontYuseiMagic' },
      { value: 'Hachi Maru Pop', labelKey: 'fontHachiMaruPop' },
      { value: 'Dela Gothic One', labelKey: 'fontDelaGothicOne' },
    ],
  },
];

/** グループ分けを気にしない用途(既定値の取得等)向けのフラットな一覧。 */
export const FONT_OPTIONS: FontOption[] = FONT_GROUPS.flatMap((group) => group.options);

/** `<select>` にグループ分けされたフォント選択肢を追加する(パネル・options ページ共通)。 */
export function populateFontSelect(select: HTMLSelectElement): void {
  for (const group of FONT_GROUPS) {
    const optgroup = document.createElement('optgroup');
    optgroup.label = t(group.labelKey);
    for (const font of group.options) {
      const option = document.createElement('option');
      option.value = font.value;
      option.textContent = t(font.labelKey);
      optgroup.appendChild(option);
    }
    select.appendChild(optgroup);
  }
}
