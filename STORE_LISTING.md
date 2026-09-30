# Chrome ウェブストア掲載文(ドラフト)

デベロッパーダッシュボード(<https://chrome.google.com/webstore/devconsole>)の各項目に、
そのままコピー&ペーストして使える文面。実際の提出はこちらでは行わない(Googleアカウントでの
デベロッパー登録・$5の登録料の支払いが必要なため、利用者ご自身の操作が必要)。

## 基本情報

- **拡張機能名**: ルビふり for Googleスライド＆ドキュメント（拼音対応）(英語: Furigana & Pinyin for Google Slides & Docs)。`manifest.json` の `__MSG_extName__` から自動取得されるので、ダッシュボードでの入力は基本不要。v1.0.0 でドキュメント・拼音対応にあわせて変更(v0.8.0 までは「ルビふり for Googleスライド」)。「拼音」で検索した中国語の先生にも見つけてもらえるよう、末尾に「（拼音対応）」を付けた(名前にキーワードを並べる形は、ストアの規約で指摘されるおそれがあるため避けた)。OAuth の同意画面の名前は別の設定で、変えない(「Google」を入れない)
- **カテゴリ**: 生産性(Productivity)。「教育」(Education)でも当てはまるが、Googleスライド・ドキュメント上で動く実務ツールという性質上、生産性を第一候補として推奨
- **言語**: 日本語(主)。英語の掲載文も下に用意した(ストアの「追加言語」機能で登録可能)。拡張機能の画面は日本語・英語のみなので、中国語の掲載文は、中国語の画面(`zh_CN`)を用意してからにする
- **プライバシーポリシーURL**: <https://rubi.rocketdone.com/>(カスタムドメイン)

## 概要(短い説明、132文字以内)

### 日本語
```
Googleスライド・ドキュメントの漢字にルビ(ふりがな)や中国語の拼音を、表示・書き込み。読み・サイズ・フォント・色も設定できます。
```
(73文字)

### English
```
Furigana for kanji and pinyin for Chinese in Google Slides and Docs. Set the reading, font, color, and size.
```
(120 characters)

## 詳細説明

### 日本語
```
「ルビふり for Googleスライド＆ドキュメント（拼音対応）」は、Googleスライド・Googleドキュメントの漢字に、
ひらがなのルビ(ふりがな)を表示・書き込みする拡張機能です。
中国語の漢字に拼音(ピンイン)を振ることもできます(スライド・ドキュメント)。

■ Googleスライドで
・編集画面にルビをリアルタイム表示(画面表示のみ。スライド自体は変更されません)
・「スライドへの書き込み」で、実際のテキストボックスとしてルビを書き込み
  → 発表モード・印刷・PDF書き出しにもルビを反映できます
  → 書き直すと前のルビと置き換わるので、設定を変えて何度でもやり直せます
・中国語の拼音(簡体字)にも対応。サイドパネルの「言語」で切り替えます

■ Googleドキュメントで
・文書の本文にルビを書き込みます。見せ方を5種類から選べます
  漢字の上(表)/ 漢字の上(縮める)/ 括弧書き / 括弧書き(小さい文字)/ 漢字の右上
・「ルビを消す」で、書き込む前の状態に戻せます
・箇条書き・表の中・ヘッダー・フッター・脚注にも対応(括弧書きで書き込みます)
・中国語の拼音(簡体字)にも対応。「言語」で切り替えます(括弧書きでは、続いた漢字をまとめて「汉字(hàn zì)」の形にします)
・設定を変えると、ルビを自動で付け直します

■ どちらでも使える機能
・ルビのサイズ(小・中・大)、フォント、色を設定
・ルビは漢字1文字ずつに振るか(例: 始業式 → し/ぎょう/しき)、熟語ごとにまとめて振るかを選択
・日付・時刻・数も正しい読みで(例: 4月1日 → がつ/ついたち、30分 → ぷん、一人 → ひとり)
・習った漢字にはルビを振らない設定(小学校の学年:小1〜小6、または JLPT のレベル:N5〜N1 から選択)
・ユーザー辞書で単語ごとに読み・見た目を個別上書き
  (例: 専門用語や固有名詞の読みを正しく設定、特定の単語だけ強調表示)
・設定パネルは画面の横(Chrome のサイドパネル)に表示されるので、全体を見ながら操作できます

■ 使い方
1. Googleスライドまたはドキュメントを開き、拡張機能のアイコンをクリックします。
2. スライドは、ルビの表示をONにするだけで表示されます。
3. 書き込みは、初めてのときにファイルの選択画面が出るので、対象のスライド・ドキュメントを選んで許可します。
   選んだファイルだけが対象で、ほかのファイルには一切アクセスしません。

■ PDF・印刷するときのヒント
スライドの本文が Arial など日本語を含まないフォントだと、PDF・印刷のときに別のフォントに置き換わり、
ルビがずれることがあります。本文を日本語のフォント(Noto Sans JP など)にしてから書き込んでください。

■ こんな方におすすめ
・日本語学習者向けの教材、子ども向けの教材をGoogleスライド・ドキュメントで作っている方
・中国語の教材に拼音を振りたい方
・専門用語や固有名詞が多い資料にふりがなを振りたい方

■ 権限について
・Googleスライド・ドキュメントへのアクセス: 「書き込み」を使うとき、あなたが選択したファイルだけを
  対象に、内容の読み取りと、ルビの追加・削除を行います(選択していないファイルにはアクセスしません)
・保存された設定・辞書データは、ご自身のChromeアカウント(chrome.storage.sync)
  にのみ保存され、開発者のサーバーには一切送信されません

詳しくはプライバシーポリシーをご覧ください: https://rubi.rocketdone.com/
```

### English
```
"Furigana & Pinyin for Google Slides & Docs" is a Chrome extension that displays and writes hiragana reading aids
(furigana/ruby text) over kanji in Google Slides and Google Docs.
It can also add pinyin over Chinese characters (in Slides and Docs).

■ In Google Slides
- Real-time furigana display in the editor (display only; your slide content is untouched)
- "Write to slide" adds furigana as real text boxes
  → use this if you need furigana in presenter mode, printing, or PDF export
  → writing again replaces the previous furigana, so you can redo it after changing settings
- Chinese pinyin (Simplified) is supported too. Switch with "Language" in the side panel

■ In Google Docs
- Writes furigana into the document body, in one of five styles
  Above the kanji (table) / Above the kanji (shrunk) / In parentheses / In parentheses (small) / Superscript
- "Remove furigana" restores the document to how it was before
- Also works in bullet lists, table cells, headers, footers, and footnotes (written in parentheses)
- Chinese pinyin (Simplified) is supported too. Switch with "Language" (in parentheses styles, consecutive characters are grouped like 汉字 (hàn zì))
- Changing a setting redoes the furigana automatically

■ In both
- Choose furigana size (small/medium/large), font, and color
- Furigana per kanji (e.g. 始業式 → し/ぎょう/しき) or per word, your choice
- Correct readings for dates, times, and counts (e.g. 4月1日 → がつ/ついたち, 30分 → ぷん, 一人 → ひとり)
- Skip kanji you already know: choose a Japanese school grade (1–6) or a JLPT level (N5–N1)
- Per-word overrides via a user dictionary (fix a reading, or customize the look
  of a specific word — handy for technical terms and proper nouns)
- The settings panel opens in Chrome's side panel next to your page, so you can see everything while you work

■ How to use
1. Open a Google Slides presentation or Google Docs document and click the extension icon.
2. In Slides, turn furigana display on and it appears right away.
3. The first time you write, a file-selection dialog appears: choose the presentation or document to allow.
   Only the file you choose is accessed; nothing else.

■ Tip for PDF / printing
If the slide's body font has no Japanese glyphs (e.g. Arial), PDF export and printing substitute another font, and the
furigana can drift. Change the body font to a Japanese font (e.g. Noto Sans JP) before writing.

■ Who this is for
- Anyone building materials for Japanese learners or children in Google Slides / Docs
- Anyone who wants pinyin on Chinese teaching material
- Anyone with lots of jargon or proper nouns who wants accurate furigana

■ Permissions
- Google Slides / Docs access: when you use "write", the extension reads and adds/removes furigana
  only in the file you select (it cannot access any other file)
- Your settings and dictionary are stored only in your own Chrome account
  (chrome.storage.sync) and are never sent to a developer-run server

See the privacy policy for details: https://rubi.rocketdone.com/
```

## 単一の目的(Single purpose)

Chromeウェブストアは拡張機能に「単一の目的」の説明を求める。日本語の漢字のふりがなも、中国語の漢字の拼音も、「漢字の読みを添えるルビ」という同じ目的の中に入れている。

### 日本語
```
Googleスライド・ドキュメントの漢字に、読みを添えるルビ(日本語のふりがな、中国語の拼音)を表示・書き込みすること。
```

### English
```
To display and write reading aids (Japanese furigana, and Chinese pinyin) over kanji/hanzi in Google Slides and Google Docs.
```

## 権限の使用理由(審査で求められる場合がある)

| 権限 | 理由(日本語) | Reason (English) |
|---|---|---|
| `storage` | ルビの表示設定・ユーザー辞書をChromeの同期ストレージに保存するため | To store display settings and the user dictionary in Chrome's sync storage |
| `identity` | Google Slides API・Google Docs APIを呼び出すためのOAuth認可(`drive.file` スコープ。ユーザーが選んだスライド・ドキュメントのみ)に使用 | For OAuth authorization (`drive.file` scope; only the presentation or document the user selects) to call the Google Slides API and Google Docs API |
| `activeTab` | 現在開いているタブがGoogleスライド・ドキュメントかどうかを判定するために使用 | To detect whether the current tab is a Google Slides or Docs page |
| `sidePanel` | 設定パネルを Chrome のサイドパネル(ページの横)に表示するために使用 | To show the settings panel in Chrome's side panel next to the page |
| `scripting` | Googleドキュメントに表のルビを書き込むとき、表の列の幅を決めるため、開いているドキュメントのページ内で文字の幅を測る短い処理を実行する(受け取るのは幅の数値だけ。文書の内容は読み取らず、外部にも送らない) | When writing table-style furigana to a Google Docs document, to run a short script in the open document's page that measures character widths for the table column widths (only width numbers are returned; the document content is not read or sent anywhere) |
| ホスト権限(`docs.google.com/presentation/*`, `docs.google.com/document/*`, `slides.googleapis.com`) | Googleスライドの編集画面へのルビ表示、ドキュメントの編集画面での動作、Slides APIとの通信のために必要 | Needed to display furigana in the Slides editor, to work in the Docs editor, and to communicate with the Slides API |

(Google Docs API のホスト `docs.googleapis.com` は、ホスト権限に含めていない。含めると利用者への権限の警告が増えるため。API はアクセストークン付きで呼べる。)

## スクリーンショット

Chromeウェブストアは1280×800(または640×400)の画像を1〜5枚求める。v1.0.0 用に4枚を撮り直した(2026-09-30。`design/` に置いた。1280×800、RGB、透過なし)。
ページ側は、実際の Googleスライド・ドキュメントの画面。右側の設定パネルは、Chrome のサイドパネルが自動操作では撮れないため、
実物と同じ HTML・CSS・スクリプトをブラウザで描画したものを合成している(表示内容は実物と同じ)。

1. `design/store-screenshot-v1-1-slides.png` — スライド(日本語のふりがな)。漢字ごとのルビを表示。パネルは「言語:日本語のふりがな」
2. `design/store-screenshot-v1-2-docs.png` — ドキュメント(漢字の上・表のルビ、熟語ごと)。パネルは見せ方の5種類の選択
3. `design/store-screenshot-v1-3-pinyin.png` — スライド(中国語の拼音)。パネルは「言語:中国語の拼音(簡体字)」
4. `design/store-screenshot-v1-4-docs-pinyin.png` — ドキュメント(中国語の拼音、漢字の上・表のルビ)。パネルは「言語:中国語の拼音(簡体字)」
5. (任意)ユーザー辞書の詳細設定ページ — `chrome-extension://` のページなので自動操作では撮れない。手動で撮影する場合のみ

撮り直すとき: 撮影用の確認用ビルド(`npm run build:qa`)を読み込み、ページの `window.postMessage` で設定・書き込みを指示する
(使い方は `src/content/qaBridge.ts`・`src/content/docs/qaBridge.ts` の冒頭)。ドキュメントは、確認用ビルドの「テスト用の文書を作る」
(`command: 'create-test-doc'`)で作った文書なら、許可の画面(Picker)なしで書き込める。撮影後は `npm run build` で通常のビルドに戻す。

古い画像(参考): `design/store-screenshot-real-1.png`・`design/store-screenshot-1.png`(v0.8.0 までのスライドの画面)

## 提出・公開のチェックリスト

- [x] Chrome ウェブストア デベロッパーアカウント登録($5)
- [x] `npm run build:store-zip` で作った zip をアップロード(`key` 除去。README.md 参照)
- [x] 掲載文・カテゴリ・スクリーンショット・プロモーションタイル・プライバシーポリシーURLを入力
- [x] 審査通過・公開(拡張機能ID `boccgohdphepnoaenacpckicbdinihoc`)
- [x] 紹介LPを公開: <https://rocketdone.com/products/rubi-for-slides>
- [x] 公開版専用の OAuth クライアントを作成し、ストア用ビルドに反映(v0.5.1)
- [x] v0.5.1 をアップロードし、審査通過(公開版の書き込み機能が動く)
- [x] OAuth 同意画面を本番に公開し、ブランディング検証済み。スコープ(presentations)の確認申請を提出済み(2026-09-20)。結果待ち — 詳細は OAUTH_VERIFICATION.md
- [x] Google の審査で `presentations` → `drive.file` への変更を求められ、v0.6.0 で移行(Picker 経由で許可、実機確認済み)
- [x] v0.6.0 のストア用 zip をアップロードし、審査通過(drive.file 化、実機で書き込み・削除を確認済み)
- [x] Cloud Console から `presentations` スコープを削除。検証センターは「検証は必要ありません」の状態に。審査メールへの返信は不要と判断(下記参照)
- [x] v0.8.0 のストア用 zip をアップロードし、審査通過(2026-09-30。JLPT・日付・数の読み・縮小表示の書き込み・二重書き込みの修正)
- [ ] v1.0.0(スライド＆ドキュメント、拼音、PDF の警告、ドキュメントの「変換中」表示)
  - [x] コードとテスト(単体・結合 324 件、e2e 37 件)
  - [x] 拡張機能の説明文(manifest)・プライバシーポリシー(`docs/index.html`)・掲載文(このファイル)を更新
  - [x] スクリーンショットの撮り直し(4枚。`design/store-screenshot-v1-*.png`)
  - [ ] GitHub への push(`docs/` は GitHub Pages に反映されるまでに少しかかる。Picker のドキュメント向けの文言も同じ)
  - [ ] `npm run build:store-zip` で zip を作り直して提出(権限の警告が v0.8.0 から増えないことを、提出前にもう一度確認)
