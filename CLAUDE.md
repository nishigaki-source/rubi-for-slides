# ルビふり for Googleスライド — 作業の前提

## Googleドキュメント対応(v1.0.0 で統合、2026-09-29)

- Chrome ウェブストアの公開済み拡張機能が上限(3個)に達し、引き上げも通らなかった。そのため
  「ルビふり for Googleドキュメント」は新しい拡張機能として出さず、**この拡張機能(ストア ID
  `boccgohdphepnoaenacpckicbdinihoc`)の v1.0.0 としてドキュメントにも対応させた**。名前は
  「ルビふり for Googleスライド＆ドキュメント（拼音対応）」(英語 Furigana & Pinyin for Google Slides & Docs)。
- ドキュメント版は `/Users/ni/claude/rubi-docs`(GitHub `nishigaki-source/rubi-for-docs`)で開発した。検証の記録・
  Docs API の性質はそちらの `PHASE0_FINDINGS.md`(4.2 節)・`PLAN.md`・`HANDOFF.md`。
- ドキュメント固有のファイル:
  - `src/core/docs/`(本文の取り出し・読みの差し込み/表ルビのリクエスト作り。chrome に依存しない)
  - `src/worker/docsHandler.ts`(`rubi-docs/command` の受け口。未許可の文書は Picker `kind=document` で許可を求める)・
    `docsRuby.ts`(ふる・消す・付け直す)・`docsClient.ts`(Docs API)・`measure.ts`(文書のページで文字幅を測る。`scripting` 権限)
  - `src/content/docs/qaBridge.ts`(動作確認用ビルドだけの受け口)
  - テスト: `tests/unit/docs*.ts`・`tableRuby.test.ts`、`tests/integration/`(偽の Docs で最初から最後まで)、
    `tests/e2e/sidepanel.spec.ts`(サイドパネル。`npm run build:e2e` が `tests/e2e/panel-dist` も作る)
- サイドパネルは、開いているタブに合わせて「スライド」「ドキュメント」の画面を自動で切り替える(見出しのバッジ:
  スライドは薄いイエロー、ドキュメントは薄いブルー。2026-09-29 ユーザー決定。切り替えのスイッチは置かない)。
  サイズ・フォント・色・省く漢字・振り方・ユーザー辞書は共通。ドキュメントだけの設定は `docsStyle`(見せ方)。
  ドキュメントでは、設定を変えるとルビを自動で付け直す(付いていなければ何もしない。Picker も開かない)。

### v1.0.0 に含めた、統合後の追加(2026-09-29)

- **中国語の拼音(スライド・ドキュメント)**: サイドパネルの「言語」で、日本語のふりがな / 中国語の拼音(簡体字)を選べる(設定は
  スライドが `slidesRubyLanguage`、ドキュメントが `docsRubyLanguage`。別々に覚える)。ドキュメントは `src/worker/docsRuby.ts` の
  `spansForParagraph` が拼音の区間を作り、括弧書き・上付きでは `mergeAdjacentSpans`(`src/core/docs/rubySpans.ts`)で続いた漢字をまとめる
  (「汉字(hàn zì)」)。表ルビは1文字ごとの列に拼音を置く。`src/core/pinyin.ts`・`pinyinFixes.ts`(軽声の補正表。試作で、中国語の先生の確認は未)・`textWidth.ts`
  (ルビの幅を英字で見積もる)、ライブラリ pinyin-pro(MIT。`public/licenses/` に全文)。詳細は README の「中国語の拼音」節。
  未対応: 繁体字・儿化・拼音のユーザー辞書・日本語と中国語が混ざったスライド(書き込みは前のルビと置き換えるため、日本語のあとに中国語を書くと日本語が消える)。
- **PDF・印刷でルビがずれる件の警告**: 本文が Arial など日本語を含まないフォントだと、PDF では別のフォント(MS PGothic)になって本文が狭くなり、
  ルビがずれる。書き込み後、設定パネルに警告を出す(`src/core/fontCoverage.ts`)。本文を Noto Sans JP にすればずれない(利用者が確認済み)。README の「既知の注意点」に経緯。
- **v1.0.0 は 2026-09-30 に提出し、公開済み(2026-10-04 ごろ)**。提出した zip のコードは `a720f1b`(手順・結果の記録は STORE_LISTING.md 末尾のチェックリスト)。
  掲載文・プライバシーポリシー(`docs/index.html`)・拡張機能の説明は、ドキュメントと拼音を反映済み。権限は `storage`・`identity`・`activeTab`・`sidePanel`・`scripting`。
  ホスト権限に `https://docs.googleapis.com/*` は足さない(警告が増える)。

### v1.0.1(2026-10-05。不具合の修正)

- **v1.0.0 は公開済み。v1.0.1 は 2026-10-05 に提出し、承認された(zip のコードは `e2d4b4f`)**。v1.0.1 は、ドキュメントの表ルビ(「漢字の上」)が長い文書で失敗する件の修正が中心。
- **Docs API は 1つでも不正なリクエストがあると、書き込み全体を拒否する**(1回の batchUpdate で送っているため)。
  表ルビで踏んだ・踏みうる制限は `src/core/docs/lineLayout.ts` の `MIN_COLUMN_WIDTH_PT`(列の幅は 5pt 以上。実機で確認)と、
  `src/core/docs/extract.ts` の `canUseTableRuby`(入れ直すと消える文字・提案を含む段落は表にしない。API の仕様から判断、実機は未確認)。
- 未対応・未確認(次の版の候補): 選択した範囲だけルビを消す(利用者の要望)、とても長い文書(13ページで約50秒。分割して書く改修が要る)、
  タブで揃えた段落・「段落の前で改ページ」の段落の表ルビ、スライドの「元のテキストとグループ化」でプレースホルダー・
  利用者のグループがあると失敗する可能性(未確認)。

### 選択した範囲のルビを消す(ドキュメント。2026-10-05 作成、次の版に入れる)

- サイドパネルの「選択した範囲のルビを消す」(`delete-selection`)。本文に差し込んだ読みは範囲にかかるものだけ、表ルビは範囲を含む段落ごと元に戻す。
- **Docs の選択範囲の位置は、画面からも API からも取れない**(編集画面は canvas。`window.getSelection()` は空)。取れるのは選択した文字だけ:
  見えない iframe(`.docs-texteventtarget-iframe`)の中の contenteditable に、自分で作った `copy` イベント(空の `DataTransfer`)を送ると、
  Docs が選択した文字を入れる(`src/worker/selection.ts`。クリップボードは変わらず、権限も増えない。送り先を body にすると、
  ページにフォーカスが無いときに空になる)。
- 位置は、選択した文字の並びを本文から探して決める(`src/core/docs/selection.ts`。空白・改行・タブは除いて比べる)。
  **同じ並びが何か所もあるときは消さず、広く選び直してもらう**。ヘッダー・フッター・脚注は対象外。
- 名前付き範囲は、消したものだけを ID で消す(名前で消すと、残した読みの目印まで消える)。
- 実機(開発用の拡張機能、テスト文書、2026-10-05): 括弧書きで段落を選んで消す・表ルビで行の一部を選んで段落を戻す・残りを「ルビを消す」で
  消して元どおり、まで確認(動作確認用の受け口から。サイドパネルのボタンを押しての確認は利用者にお願いした)。

### 選択した範囲のルビを消す: スライドには入れない(2026-10-05 ユーザー決定)

- スライド版も作って実機で動くところまで確かめたが、不要との判断で取り下げた(コードは残していない)。スライドのルビは別のテキストボックスなので、
  利用者が自分で選んで消せる。
- また要望が出たときのための記録: スライドは選択を画面上の位置で読める。文字を選ぶと行ごとに `rect.sketchy-text-selection-overlay`、
  図形を選ぶと枠線の `path[stroke="#1a73e8"]`(fill 属性なし)。文字の選択の rect は、編集画面からフォーカスが外れると消える
  (サイドパネルを押すと消えるので、事前に覚えておく必要がある)。ルビの位置は `editor-<objectId>` の要素を測ればよい。

### 統合で確かめたこと・気をつけること

- **権限の警告は v0.8.0 と同じ**(「docs.google.com、slides.googleapis.com 上にある自分のデータの読み取りと変更」。
  `chrome.management.getPermissionWarningsByManifest` で確認)。更新で既存の利用者の拡張機能は止まらない。
  **`https://docs.googleapis.com/*` を host_permissions に足すと警告が増える**ので足さない(足さなくても Docs API は呼べた)
- Cloud プロジェクト rubi-for-slides で Google Docs API を有効にした(2026-09-29。スコープは `drive.file` のまま)
- `docs/picker.html` は `kind=document` のときだけドキュメント向けの文言にする(渡さない古い版はスライドのまま)。
  結果のメッセージの `presentationId` にはドキュメントの ID も入る(既存の版との互換のため名前は変えない)。
  **GitHub Pages(main の docs/)に反映されるまでは、ドキュメントでも「スライドを選択」と出る**(動きは同じ)
- 実機(開発用の拡張機能 ID、2026-09-29): ドキュメントに Picker で許可 → ルビをふる → 消すまで確認。スライドも従来どおり
