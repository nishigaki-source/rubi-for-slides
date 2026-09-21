// _locales/{ja,en}/messages.json を1つの定義から生成するスクリプト。
// キーの過不足(片方の言語にしかないキー)を防ぐため、手書きの2ファイル管理はしない。
// 使い方: node scripts/build-locales.mjs
import { writeFileSync } from 'node:fs';

// [key, ja, en, placeholderNames?]
// placeholder は $NAME$ を message 内に書き、messages.json の "placeholders" には
// $1 を割り当てる(chrome.i18n.getMessage の substitutions は配列で渡す)。
const ENTRIES = [
  // --- manifest ---
  ['extName', 'ルビふり for Googleスライド', 'Furigana for Google Slides'],
  [
    'extDescription',
    'Googleスライドの漢字にひらがなのルビ（ふりがな）を表示・書き込みします。',
    'Displays and writes hiragana furigana over kanji in Google Slides.',
  ],

  // --- panel: static labels ---
  ['panelDialogLabel', 'ルビふり', 'Furigana'],
  ['panelTitle', 'ルビふり', 'Furigana'],
  ['panelClose', '閉じる', 'Close'],
  ['toggleShowRuby', 'ルビを表示', 'Show furigana'],
  ['sectionAppearance', 'ルビの見た目', 'Furigana appearance'],
  ['labelSize', 'サイズ', 'Size'],
  ['sizeGroupAriaLabel', 'ルビのサイズ', 'Furigana size'],
  ['sizeSmall', '小', 'Small'],
  ['sizeMedium', '中', 'Medium'],
  ['sizeLarge', '大', 'Large'],
  ['labelFont', 'フォント', 'Font'],
  ['labelColor', '色', 'Color'],
  ['labelGradeFilter', '省く漢字', 'Skip kanji'],
  ['gradeFilterNone', 'なし(すべてにルビ)', 'None (furigana on all kanji)'],
  ['gradeFilterGrade', '小$GRADE$までに習う漢字', 'Kanji taught by grade $GRADE$', ['GRADE']],
  ['sectionWrite', 'スライドに書き込む', 'Write to slide'],
  ['btnCurrentSlide', 'このスライド', 'This slide'],
  ['btnAllSlides', '全スライド', 'All slides'],
  ['labelGroupWithOriginal', '元のテキストとグループ化', 'Group with original text'],
  ['sectionDelete', '書き込んだルビを削除', 'Delete written furigana'],
  ['linkEditUserDict', 'ユーザー辞書を編集', 'Edit user dictionary'],

  // --- panel: dynamic status/messages ---
  ['statusWriting', '書き込み中…', 'Writing…'],
  ['statusWritingAll', '全スライドに書き込み中…', 'Writing to all slides…'],
  ['statusDeleting', '削除中…', 'Deleting…'],
  ['statusWriteSuccessCurrent', '$COUNT$件を書き込みました', 'Wrote $COUNT$ item(s)', ['COUNT']],
  [
    'statusWriteSuccessAll',
    '$SLIDES$枚に$COUNT$件を書き込みました',
    'Wrote $COUNT$ item(s) across $SLIDES$ slide(s)',
    ['SLIDES', 'COUNT'],
  ],
  ['statusDisplayTurnedOff', '(表示はOFFにしました)', ' (display turned off)'],
  ['statusDeleteSuccess', '$COUNT$件を削除しました', 'Deleted $COUNT$ item(s)', ['COUNT']],
  [
    'confirmWriteAll',
    '全スライドに書き込みます。スライドを1枚ずつ切り替えながら処理するため、枚数によっては時間がかかります。よろしいですか？',
    'This writes furigana to all slides, switching between them one at a time — it may take a while depending on the number of slides. Continue?',
  ],
  ['confirmDeleteAll', '全スライドからルビを削除します。よろしいですか？', 'This deletes furigana from all slides. Continue?'],
  ['sizeCannotIncrease', 'これ以上大きくできません', "Can't get any bigger"],
  ['sizeCannotDecrease', 'これ以上小さくできません', "Can't get any smaller"],

  // --- writeController.ts error messages ---
  [
    'errorNoPageContainer',
    'スライドの表示領域が見つかりませんでした。編集画面で実行してください。',
    "Couldn't find the slide's display area. Please run this from the editing screen.",
  ],
  [
    'errorCannotIdentifySlide',
    'このページの URL からスライドを特定できませんでした。',
    "Couldn't identify the slide from this page's URL.",
  ],
  ['errorAllSlidesFailed', 'すべてのスライドで処理に失敗しました。', 'Processing failed for all slides.'],

  // --- worker/slidesClient.ts, worker/gradeTable.ts error messages ---
  [
    'errorFetchPresentationFailed',
    'プレゼンテーションの取得に失敗しました (status: $STATUS$)',
    'Failed to fetch the presentation (status: $STATUS$)',
    ['STATUS'],
  ],
  ['errorPageNotFound', 'ページが見つかりません (pageObjectId: $PAGE_ID$)', 'Page not found (pageObjectId: $PAGE_ID$)', ['PAGE_ID']],
  [
    'errorSlideUpdateFailed',
    'スライドの更新に失敗しました (status: $STATUS$) $BODY$',
    'Failed to update the slide (status: $STATUS$) $BODY$',
    ['STATUS', 'BODY'],
  ],
  [
    'errorFileAccessDenied',
    'このスライドへのアクセスが許可されませんでした。もう一度お試しいただき、表示された画面でスライドを選んでください。',
    'Access to this presentation was not granted. Please try again and select the presentation in the dialog.',
  ],
  [
    'errorGradeTableLoadFailed',
    '学年別漢字配当表の読み込みに失敗しました (status: $STATUS$)',
    'Failed to load the kanji grade table (status: $STATUS$)',
    ['STATUS'],
  ],

  // --- options page: static labels ---
  ['optionsPageTitle', 'ルビふり 詳細設定', 'Furigana Advanced Settings'],
  ['optionsHeading', 'ルビふり 詳細設定', 'Furigana Advanced Settings'],
  [
    'optionsLead',
    '特定の単語だけ読みを直したい、見た目(フォント・色・サイズ)を変えたい場合はここでユーザー辞書に登録してください。ユーザー辞書は学年フィルタより優先され、モード A(画面表示)・モード B(スライドへの書き込み)の両方に反映されます。',
    'Register a word here in the user dictionary to fix its reading or change its look (font/color/size) for that word only. The user dictionary takes priority over the grade filter, and applies to both Mode A (on-screen display) and Mode B (writing to the slide).',
  ],
  ['headingRegisteredWords', '登録済みの単語', 'Registered words'],
  ['colSurface', '表層形', 'Word'],
  ['colReading', '読み', 'Reading'],
  ['colStyle', '見た目', 'Style'],
  ['emptyDictRow', 'まだ登録された単語はありません', 'No words registered yet'],
  ['headingAddWord', '単語を追加', 'Add a word'],
  [
    'labelSurface',
    '表層形(スライド上の表記。漢字を1文字以上含める)',
    'Word (as written in the slide; must contain at least one kanji)',
  ],
  ['placeholderSurface', '例: 麻雀', 'e.g. 麻雀'],
  ['labelReadingOverride', '読みを上書きする', 'Override reading'],
  ['labelReading', '読み(ひらがな)', 'Reading (hiragana)'],
  ['placeholderReading', '例: まーじゃん', 'e.g. まーじゃん'],
  ['labelStyleOverride', '見た目を個別設定する', 'Customize appearance'],
  ['btnAdd', '追加する', 'Add'],
  ['btnSaveEdit', '保存する', 'Save'],
  ['btnCancelEdit', '編集をキャンセル', 'Cancel editing'],
  ['btnEdit', '編集', 'Edit'],
  ['btnDelete', '削除', 'Delete'],
  ['headingBackup', 'バックアップ', 'Backup'],
  ['btnExport', 'エクスポート(JSONファイルを保存)', 'Export (save as JSON file)'],
  ['btnImport', 'インポート(JSONファイルを読み込み)', 'Import (load JSON file)'],
  [
    'hintImportReplaces',
    'インポートすると現在のユーザー辞書は<strong>丸ごと置き換わります</strong>(マージではありません)。',
    'Importing will <strong>completely replace</strong> your current user dictionary (not merged).',
  ],

  // --- options page: dynamic ---
  ['readingFallback', '(kuromojiのまま)', '(unchanged, from kuromoji)'],
  ['styleFallback', '(全体設定のまま)', '(uses global settings)'],
  ['formTitleEdit', '「$SURFACE$」を編集', 'Editing "$SURFACE$"', ['SURFACE']],
  ['statusUpdated', '更新しました。', 'Updated.'],
  ['statusAdded', '追加しました。', 'Added.'],
  ['statusExported', 'エクスポートしました。', 'Exported.'],
  ['statusImported', '$COUNT$件のエントリをインポートしました。', 'Imported $COUNT$ entries.', ['COUNT']],
  ['statusImportReadError', 'ファイルの読み込みに失敗しました。', 'Failed to read the file.'],
  [
    'confirmDeleteWord',
    '「$SURFACE$」をユーザー辞書から削除します。よろしいですか？',
    'Delete "$SURFACE$" from the user dictionary. Continue?',
    ['SURFACE'],
  ],

  // --- core/userDict.ts validation errors (looked up from the UI layer by error code) ---
  ['errSizeRatioPositive', 'サイズ比は正の数で入力してください', 'Size ratio must be a positive number'],
  ['errSurfaceRequired', '表層形を入力してください', 'Please enter the word'],
  ['errSurfaceNeedsKanji', '表層形には漢字を 1 文字以上含めてください', 'The word must contain at least one kanji character'],
  ['errReadingHiragana', '読みはひらがなで入力してください', 'Please enter the reading in hiragana'],
  [
    'errReadingOrStyleRequired',
    '読みまたは見た目の上書きのどちらかを入力してください',
    'Please provide either a reading override or a style override',
  ],
  ['errInvalidJson', 'JSON の形式が正しくありません', 'Invalid JSON format'],
  ['errInvalidDictFormat', 'ユーザー辞書の形式が正しくありません', 'Invalid user dictionary format'],
  [
    'errInvalidEntryFormat',
    '"$SURFACE$" のエントリの形式が正しくありません',
    '"$SURFACE$" entry has an invalid format',
    ['SURFACE'],
  ],
  ['errReadingNotString', '"$SURFACE$" の読みが文字列ではありません', '"$SURFACE$" reading is not a string', ['SURFACE']],
  [
    'errInvalidStyleFormat',
    '"$SURFACE$" の見た目指定の形式が正しくありません',
    '"$SURFACE$" style is in an invalid format',
    ['SURFACE'],
  ],
  [
    'errFontFamilyNotString',
    '"$SURFACE$" の fontFamily が文字列ではありません',
    '"$SURFACE$" fontFamily is not a string',
    ['SURFACE'],
  ],
  ['errColorNotString', '"$SURFACE$" の color が文字列ではありません', '"$SURFACE$" color is not a string', ['SURFACE']],
  [
    'errSizeRatioNotNumber',
    '"$SURFACE$" の sizeRatio が数値ではありません',
    '"$SURFACE$" sizeRatio is not a number',
    ['SURFACE'],
  ],

  // --- shared/fontOptions.ts: group labels ---
  ['fontGroupStandard', '定番(欧文)', 'Standard (Latin)'],
  ['fontGroupGoogleLatin', 'Google Fonts(欧文)', 'Google Fonts (Latin)'],
  ['fontGroupJapaneseGothic', '日本語 - ゴシック体', 'Japanese - Gothic'],
  ['fontGroupJapaneseOther', '日本語 - 明朝体・手書き風など', 'Japanese - Serif, handwriting, etc.'],

  // --- shared/fontOptions.ts: per-font labels ---
  ['fontArial', 'Arial(既定・ゴシック体)', 'Arial (default, sans-serif)'],
  ['fontArialBlack', 'Arial Black', 'Arial Black'],
  ['fontComicSansMs', 'Comic Sans MS(手書き風)', 'Comic Sans MS (handwriting-style)'],
  ['fontCourierNew', 'Courier New(等幅)', 'Courier New (monospace)'],
  ['fontGeorgia', 'Georgia(明朝体風)', 'Georgia (serif-style)'],
  ['fontHelvetica', 'Helvetica', 'Helvetica'],
  ['fontImpact', 'Impact', 'Impact'],
  ['fontTimesNewRoman', 'Times New Roman', 'Times New Roman'],
  ['fontTrebuchetMs', 'Trebuchet MS', 'Trebuchet MS'],
  ['fontVerdana', 'Verdana', 'Verdana'],
  ['fontLato', 'Lato', 'Lato'],
  ['fontLobster', 'Lobster', 'Lobster'],
  ['fontMerriweather', 'Merriweather', 'Merriweather'],
  ['fontMontserrat', 'Montserrat', 'Montserrat'],
  ['fontOpenSans', 'Open Sans', 'Open Sans'],
  ['fontOswald', 'Oswald', 'Oswald'],
  ['fontPlayfairDisplay', 'Playfair Display', 'Playfair Display'],
  ['fontPoppins', 'Poppins', 'Poppins'],
  ['fontPtSans', 'PT Sans', 'PT Sans'],
  ['fontPtSerif', 'PT Serif', 'PT Serif'],
  ['fontRoboto', 'Roboto', 'Roboto'],
  ['fontRobotoCondensed', 'Roboto Condensed', 'Roboto Condensed'],
  ['fontRobotoMono', 'Roboto Mono(等幅)', 'Roboto Mono (monospace)'],
  ['fontRobotoSlab', 'Roboto Slab', 'Roboto Slab'],
  ['fontUbuntu', 'Ubuntu', 'Ubuntu'],
  ['fontNotoSansJp', 'Noto Sans JP', 'Noto Sans JP'],
  ['fontMPlus1p', 'M PLUS 1p', 'M PLUS 1p'],
  ['fontMPlusRounded1c', 'M PLUS Rounded 1c(丸ゴシック)', 'M PLUS Rounded 1c (rounded gothic)'],
  ['fontKosugi', 'Kosugi', 'Kosugi'],
  ['fontKosugiMaru', 'Kosugi Maru(丸ゴシック)', 'Kosugi Maru (rounded gothic)'],
  ['fontSawarabiGothic', 'Sawarabi Gothic', 'Sawarabi Gothic'],
  ['fontBizUdGothic', 'BIZ UDGothic', 'BIZ UDGothic'],
  ['fontZenKakuGothicNew', 'Zen Kaku Gothic New', 'Zen Kaku Gothic New'],
  ['fontZenMaruGothic', 'Zen Maru Gothic(丸ゴシック)', 'Zen Maru Gothic (rounded gothic)'],
  ['fontNotoSerifJp', 'Noto Serif JP', 'Noto Serif JP'],
  ['fontSawarabiMincho', 'Sawarabi Mincho', 'Sawarabi Mincho'],
  ['fontBizUdMincho', 'BIZ UDMincho', 'BIZ UDMincho'],
  ['fontShipporiMincho', 'Shippori Mincho', 'Shippori Mincho'],
  ['fontKleeOne', 'Klee One(手書き風)', 'Klee One (handwriting-style)'],
  ['fontYomogi', 'Yomogi(手書き風)', 'Yomogi (handwriting-style)'],
  ['fontYuseiMagic', 'Yusei Magic', 'Yusei Magic'],
  ['fontHachiMaruPop', 'Hachi Maru Pop(ポップ体)', 'Hachi Maru Pop (pop style)'],
  ['fontDelaGothicOne', 'Dela Gothic One(見出し向け)', 'Dela Gothic One (for headings)'],
];

function buildCatalog(langIndex) {
  const out = {};
  for (const [key, ja, en, placeholderNames] of ENTRIES) {
    const message = (langIndex === 0 ? ja : en).replace(/\$([A-Z]+)\$/g, (_, name) => `$${name}$`);
    const entry = { message };
    if (placeholderNames) {
      entry.placeholders = {};
      placeholderNames.forEach((name, i) => {
        entry.placeholders[name] = { content: `$${i + 1}` };
      });
    }
    out[key] = entry;
  }
  return out;
}

writeFileSync(
  new URL('../public/_locales/ja/messages.json', import.meta.url),
  JSON.stringify(buildCatalog(0), null, 2) + '\n'
);
writeFileSync(
  new URL('../public/_locales/en/messages.json', import.meta.url),
  JSON.stringify(buildCatalog(1), null, 2) + '\n'
);
console.log(`Wrote ${ENTRIES.length} message keys to public/_locales/{ja,en}/messages.json`);
