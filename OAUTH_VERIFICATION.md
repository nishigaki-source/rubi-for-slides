# OAuth アプリ確認(Google verification)用ドラフト

Cloud Console(プロジェクト `rubi-for-slides`)の「Google Auth Platform」で、同意画面を
「本番」に公開し、機密スコープ `https://www.googleapis.com/auth/presentations` の確認を
申請するための文面・手順。

## 事前条件

- [x] ブランディング保存済み(アプリ名・ロゴ・ホームページ・プライバシーポリシー・承認済みドメイン `rocketdone.com`・連絡先)
- [ ] プライバシーポリシーに Limited Use の開示を追加して公開(`docs/index.html`、本ファイルと同じコミット)
- [ ] **Search Console で `rocketdone.com` のドメイン所有権を確認**(DNS の TXT レコード。承認済みドメインは所有確認が必要)
- [ ] デモ動画を撮影し YouTube に「限定公開」でアップロード

## スコープの使用理由(英語で入力)

Scope: `https://www.googleapis.com/auth/presentations`

```
"Furigana for Google Slides" is a Chrome extension that adds hiragana reading aids
(furigana) above kanji in Japanese text on Google Slides. Its "Write to slide" feature
creates the furigana as real text boxes inside the user's own presentation so that
they also appear in presenter mode, printing and PDF export.

Why the "presentations" scope is required:
- The extension must READ the text and layout (positions, sizes, fonts) of the shapes on
  the slide the user is editing (presentations.get), so that furigana can be generated for
  the correct kanji and positioned directly above them.
- The extension must WRITE to the presentation (presentations.batchUpdate: createShape,
  insertText, updateTextStyle, deleteObject) to add furigana text boxes, and to remove
  only the text boxes it created earlier when the user clicks "Delete furigana".

Why a narrower scope is not sufficient:
- drive.file / presentations.readonly cannot be used: drive.file only covers files created
  or opened through a Google Picker/the app itself, which does not fit an extension that
  operates on the presentation the user already has open, and readonly cannot add or
  delete shapes. The Slides API's batchUpdate requires the "presentations" scope.

How the data is handled:
- All requests go directly from the user's browser to slides.googleapis.com. No data is
  sent to or stored on any server operated by the developer.
- Data is used only to provide the user-requested feature. It is never shared, sold,
  used for advertising, or read by humans.
- The feature runs only when the user explicitly clicks "Write to slide" or
  "Delete furigana" in the extension's panel.
```

## デモ動画の台本(YouTube・限定公開、英語の字幕またはナレーション推奨)

Google は「OAuth 同意画面 → スコープの利用」を通しで見られる動画を求める。
録画時のポイント: 言語は英語 UI が望ましい / URL バーで OAuth クライアントIDが見えるようにする。

1. `chrome://extensions` で拡張機能(ストア版)が入っていることを見せる。
2. Google スライドで日本語の入ったスライドを開く。ルビが画面上に表示されるオーバーレイ(認可不要)を見せる。
3. パネルの「スライドへ書き込み」を押す。
4. **OAuth 同意画面が出る** — アプリ名・ロゴ・要求スコープ(Google スライドのプレゼンテーションの表示・編集)を映し、許可する。
   (URL の `client_id=665117522331-fj1fnhj4c7huepvtumq90t1m1fhe95ql...` が見えるように)
5. スライド上にルビのテキストボックスが実際に書き込まれたことを見せる(発表モードでも表示)。
6. パネルの「削除」でルビのテキストボックスだけが消えることを見せる。
7. ホームページ・プライバシーポリシー(Limited Use の記載)を開いて見せる。

## 提出後

- 審査は数日〜数週間。質問メールが `n.ishigaki@rocketdone.com` / `info@rocketdone.com` に届く。
- 確認完了までは「未確認のアプリ」の警告が表示され、ユーザー数は 100 人まで。
