# ルビふり for Googleスライド — 作業の前提

## Googleドキュメント対応(v1.0.0 で統合、2026-09-29)

- Chrome ウェブストアの公開済み拡張機能が上限(3個)に達し、引き上げも通らなかった。そのため
  「ルビふり for Googleドキュメント」は新しい拡張機能として出さず、**この拡張機能(ストア ID
  `boccgohdphepnoaenacpckicbdinihoc`)の v1.0.0 としてドキュメントにも対応させた**。名前は
  「ルビふり for Googleスライド＆ドキュメント」(英語 Furigana for Google Slides & Docs)。
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

- **中国語の拼音(スライドのみ)**: サイドパネルの「言語」で、日本語のふりがな / 中国語の拼音(簡体字)を選べる(設定 `slidesRubyLanguage`。
  ドキュメントはまだ日本語のふりがなだけ)。`src/core/pinyin.ts`・`pinyinFixes.ts`(軽声の補正表。試作で、中国語の先生の確認は未)・`textWidth.ts`
  (ルビの幅を英字で見積もる)、ライブラリ pinyin-pro(MIT。`public/licenses/` に全文)。詳細は README の「中国語の拼音」節。
  未対応: 繁体字・儿化・拼音のユーザー辞書・日本語と中国語が混ざったスライド(書き込みは前のルビと置き換えるため、日本語のあとに中国語を書くと日本語が消える)。
- **PDF・印刷でルビがずれる件の警告**: 本文が Arial など日本語を含まないフォントだと、PDF では別のフォント(MS PGothic)になって本文が狭くなり、
  ルビがずれる。書き込み後、設定パネルに警告を出す(`src/core/fontCoverage.ts`)。本文を Noto Sans JP にすればずれない(利用者が確認済み)。README の「既知の注意点」に経緯。
- 提出前に残っていること: ストアの掲載文・拡張機能の説明(manifest の `extDescription`)に拼音とドキュメント対応を反映、スクリーンショット、
  プライバシーポリシー(`docs/index.html`)のドキュメント向けの更新(拼音のライブラリの記載は済み)。

### 統合で確かめたこと・気をつけること

- **権限の警告は v0.8.0 と同じ**(「docs.google.com、slides.googleapis.com 上にある自分のデータの読み取りと変更」。
  `chrome.management.getPermissionWarningsByManifest` で確認)。更新で既存の利用者の拡張機能は止まらない。
  **`https://docs.googleapis.com/*` を host_permissions に足すと警告が増える**ので足さない(足さなくても Docs API は呼べた)
- Cloud プロジェクト rubi-for-slides で Google Docs API を有効にした(2026-09-29。スコープは `drive.file` のまま)
- `docs/picker.html` は `kind=document` のときだけドキュメント向けの文言にする(渡さない古い版はスライドのまま)。
  結果のメッセージの `presentationId` にはドキュメントの ID も入る(既存の版との互換のため名前は変えない)。
  **GitHub Pages(main の docs/)に反映されるまでは、ドキュメントでも「スライドを選択」と出る**(動きは同じ)
- 実機(開発用の拡張機能 ID、2026-09-29): ドキュメントに Picker で許可 → ルビをふる → 消すまで確認。スライドも従来どおり
- 残り: ストアの掲載文・スクリーンショット・プライバシーポリシー(`docs/index.html`)をドキュメント向けに更新、
  v0.8.0 の審査が終わってから v1.0.0 を提出
