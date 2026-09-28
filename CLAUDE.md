# ルビふり for Googleスライド — 作業の前提

## ドキュメント版との統合予定(2026-09-28 決定)

- Chrome ウェブストアの公開済み拡張機能が上限(3個)に達し、引き上げも通らなかった。そのため
  「ルビふり for Googleドキュメント」は新しい拡張機能として出さず、**この拡張機能(ストア ID
  `boccgohdphepnoaenacpckicbdinihoc`)の更新としてドキュメントにも対応させる**。
- ドキュメント版は `/Users/ni/claude/rubi-docs` で開発中。統合の方針は同リポジトリの `PLAN.md` の「0 節」。
  このリポジトリの `5d3ef5c`(v0.8.0)から `src/core/`・`src/shared/`・`src/worker/` の一部・`public/data`・
  スクリプトをコピーして使っている。ドキュメント固有の処理は `src/core/docs/`・`src/worker/docsClient.ts`・
  `src/content/docs/` に分けてある。
- 統合の時期は、ストア審査(v0.7.0・v0.8.0)が終わってから、ユーザーと相談して決める。

### 統合までの間に守ること

1. `src/core/` の読みの処理(`buildRubyTokens` などの関数の形、`RubyToken`・`RubyRange` などの型)を変えたり
   不具合を直したりしたら、README の「src/core の変更履歴」に書く(統合のときに差分を取り込むため)。
2. 設定(`chrome.storage.sync` の `rubiSettings`)とユーザー辞書は、統合後にスライドとドキュメントで共通にする。
   項目を追加・改名するときは、スライドだけの項目だと分かる名前にする(例: `slides...`)。
3. 次は統合のときに変える。**今は変えない**:
   - manifest に `https://docs.google.com/document/*` の権限を足す(既存利用者への警告が増えるかを確認する)
   - Cloud プロジェクト rubi-for-slides で Google Docs API を有効にする(スコープは `drive.file` のまま)
   - `docs/picker.html` で Googleドキュメントも選べるようにする
   - 拡張機能名・掲載文を「スライド・ドキュメント」向けにする(OAuth 同意画面の名前には「Google」を入れない)
