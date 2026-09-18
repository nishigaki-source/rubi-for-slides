# Chrome ウェブストア掲載文(ドラフト)

デベロッパーダッシュボード(<https://chrome.google.com/webstore/devconsole>)の各項目に、
そのままコピー&ペーストして使える文面。実際の提出はこちらでは行わない(Googleアカウントでの
デベロッパー登録・$5の登録料の支払いが必要なため、利用者ご自身の操作が必要)。

## 基本情報

- **拡張機能名**: ルビふり for Googleスライド(`manifest.json` の `__MSG_extName__` から自動取得されるので、ダッシュボードでの入力は基本不要)
- **カテゴリ**: 生産性(Productivity)。「教育」(Education)でも当てはまるが、Googleスライド上で動く実務ツールという性質上、生産性を第一候補として推奨
- **言語**: 日本語(主)。英語の掲載文も下に用意した(ストアの「追加言語」機能で登録可能)
- **プライバシーポリシーURL**: <https://nishigaki-source.github.io/rubi-for-slides/>

## 概要(短い説明、132文字以内)

### 日本語
```
Googleスライドの漢字にひらがなのルビ(ふりがな)を表示・書き込み。単語ごとに読み・フォント・色・サイズも個別設定できます。
```
(60文字)

### English
```
Show furigana over kanji in Google Slides, or write it directly into the slide. Customize reading, font, color, and size per word.
```
(132 characters)

## 詳細説明

### 日本語
```
「ルビふり for Googleスライド」は、Googleスライドの編集画面で日本語テキスト中の漢字に
ひらがなのルビ(ふりがな)を表示する拡張機能です。

■ できること
・編集画面上にルビをリアルタイム表示(画面表示のみ、スライド自体は変更されません)
・「スライドへの書き込み」機能で、実際のテキストボックスとしてルビを書き込み
  → 発表モード・印刷・PDF書き出しにもルビを反映させたい場合はこちらを使用
・ルビのサイズ(小・中・大)、フォント、色を自由に設定
・学年別漢字配当表による自動フィルタ(指定した学年までに習う漢字は除外)
・ユーザー辞書で単語ごとに読み・見た目を個別上書き
  (例: 専門用語や固有名詞の読みを正しく設定、特定の単語だけ強調表示)
・設定パネルはスライド編集画面内でドラッグして自由に移動可能

■ こんな方におすすめ
・子ども向け・日本語学習者向けの教材をGoogleスライドで作っている方
・専門用語や固有名詞が多いプレゼン資料にふりがなを振りたい方
・漢字が読めない相手にも配慮したスライドを作りたい方

■ 権限について
・Googleスライドへのアクセス: 現在開いているスライドの内容を読み取り、
  ルビ用テキストボックスの追加・削除を行うために使用します
・保存された設定・辞書データは、ご自身のChromeアカウント(chrome.storage.sync)
  にのみ保存され、開発者のサーバーには一切送信されません

詳しくはプライバシーポリシーをご覧ください: https://nishigaki-source.github.io/rubi-for-slides/
```

### English
```
"Furigana for Google Slides" is a Chrome extension that displays hiragana reading aids
(furigana/ruby text) over kanji in the Google Slides editor.

■ Features
- Real-time furigana display in the editor (display only; your slide content is untouched)
- "Write to slide" mode adds furigana as real text boxes
  → use this if you need furigana in presenter mode, printing, or PDF export
- Choose furigana size (small/medium/large), font, and color
- Automatic grade-level filtering (skip kanji taught by a given school grade)
- Per-word overrides via a user dictionary (fix a reading, or customize the look
  of a specific word — handy for technical terms and proper nouns)
- The settings panel can be dragged anywhere inside the slide editor

■ Who this is for
- Anyone building educational material or materials for Japanese learners in Google Slides
- Anyone with lots of jargon or proper nouns who wants accurate furigana
- Anyone who wants their slides to be readable by people who can't read certain kanji

■ Permissions
- Google Slides access: used to read the currently open slide's text and to add/remove
  the furigana text boxes it creates
- Your settings and dictionary are stored only in your own Chrome account
  (chrome.storage.sync) and are never sent to a developer-run server

See the privacy policy for details: https://nishigaki-source.github.io/rubi-for-slides/
```

## 単一の目的(Single purpose)

Chromeウェブストアは拡張機能に「単一の目的」の説明を求める。

### 日本語
```
Googleスライドの日本語テキスト中の漢字に、ひらがなのルビ(ふりがな)を表示・書き込みすること。
```

### English
```
To display and write hiragana furigana over kanji in Google Slides presentations.
```

## 権限の使用理由(審査で求められる場合がある)

| 権限 | 理由(日本語) | Reason (English) |
|---|---|---|
| `storage` | ルビの表示設定・ユーザー辞書をChromeの同期ストレージに保存するため | To store display settings and the user dictionary in Chrome's sync storage |
| `identity` | Google Slides APIを呼び出すためのOAuth認可(スライドへの書き込み機能)に使用 | For OAuth authorization to call the Google Slides API (write-to-slide feature) |
| `activeTab` | 現在開いているタブがGoogleスライドかどうかを判定するために使用 | To detect whether the current tab is a Google Slides page |
| ホスト権限(`docs.google.com`, `slides.googleapis.com`) | Googleスライドの編集画面へのルビ表示・Slides APIとの通信のために必要 | Needed to display furigana in the Slides editor and to communicate with the Slides API |

## スクリーンショット

Chromeウェブストアは1280×800(または640×400)の画像を1〜5枚求める。1枚目(設定パネル+ルビが
表示されたスライド編集画面)はこの会話内で1280×800サイズで撮影済みなので、その画像を保存して
使用できる。詳細設定ページのスクリーンショットは `chrome-extension://` ページのため自動操作の
対象外(このセッションの制約)なので、お手数ですが下記を手動で撮影してください。

1. 設定パネルとルビが表示されたスライド編集画面(撮影済み・チャット内の画像を保存)
2. ユーザー辞書の詳細設定ページ(表層形・読み・見た目を登録した状態) — 拡張機能アイコンのパネルから「ユーザー辞書を編集」を開いて撮影
3. (任意)「スライドへの書き込み」後、実際のテキストボックスとして書き込まれた状態

## 提出前のチェックリスト

- [ ] Chrome ウェブストア デベロッパーアカウント登録($5、未登録の場合)
- [ ] `npm run build` した `dist/` を zip 化してアップロード
- [ ] 上記の掲載文・カテゴリ・プライバシーポリシーURLを入力
- [ ] スクリーンショットをアップロード
- [ ] 公開範囲を「限定公開」(Unlisted)にして動作確認 → 問題なければ「公開」に変更
      (PLAN.md 7節の決定事項: 限定公開 → 一般公開)
