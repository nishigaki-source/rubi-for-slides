# ルビふり for Googleスライド

Googleスライドの日本語テキスト中の漢字に、ひらがなのルビ（ふりがな）を表示・書き込みする Chrome 拡張機能。

詳しい要件・設計・開発計画は [PLAN.md](PLAN.md)、Phase 0 の技術検証結果は [PHASE0_FINDINGS.md](PHASE0_FINDINGS.md) を参照。

## 現在の状態（Phase 1・Phase 2 完了、Phase 3 一部完了）

- ✅ プロジェクト雛形（Vite + TypeScript + Manifest V3 + Vitest + ESLint）
- ✅ ReadingService（`src/core/`）: 送り仮名分離・グループルビ・学年フィルタ・ユーザー辞書（読み＋見た目の個別上書き）
- ✅ Tokenizer host（`src/worker/`）: kuromoji 統合。fetch ベースの XHR シムで MV3 service worker 上で動作
- ✅ TextExtractor / OverlayRenderer / DomWatcher（`src/content/`）: SVG からのテキスト抽出、オーバーレイ描画、DOM 監視
- ✅ フローティングパネル: ルビの ON/OFF・サイズ(小/中/大)・フォント・色・学年フィルタ・書き込み/削除操作（`src/content/panel.ts`）。拡張機能アイコンのクリックでスライド編集画面内に開閉し、ドラッグで自由な位置に動かせる（ツールバー固定の旧 popup を置き換え。理由は [PLAN.md](PLAN.md) Phase 3 節を参照）
- ✅ 詳細設定ページ（`src/options/`）: ユーザー辞書の追加・編集・削除、読み/フォント/色/サイズの個別上書き、JSON インポート・エクスポート
- ✅ **実際の Chrome + 実サンプルプレゼンテーションで動作確認済み**（全12枚のスライドで確認。発見した不具合は修正済み。詳細は [PLAN.md](PLAN.md) の Phase 1 節を参照）
- ✅ 発表モードの検証 — **完了・対応不可能と判明**。発表モードは文字を `<text>` ではなく `<path>`(輪郭図形)として描画しており、この拡張の表示方式では原理的にルビを重ねられない。詳細は [PLAN.md](PLAN.md) 3.8節を参照。発表・印刷にルビを出すには Phase 2 のスライドへの書き込み機能が必須
- ✅ Playwright による e2e テスト（`tests/e2e/`）: 実機で発見した不具合の回帰テストを含む8件がすべてパス。`npm run test:e2e` で実行

**Phase 1・Phase 2 は全タスク完了。Phase 3 は表示・書き込みまわりの品質向上まで完了、ストア公開準備(i18n・プライバシーポリシー等)は未着手。**

- ✅ Phase 2（スライドへの書き込み機能）: **実機で書き込み・削除の動作を確認済み**
  （`src/core/{emu,shapeMatcher,slidesRequests,slidesUrl}.ts`、`src/worker/{auth,slidesClient}.ts`、
  `src/content/writeController.ts`、パネルの書き込み/削除ボタン）。単体テスト132件パス
- ✅ GCP プロジェクト作成・OAuth 同意画面・OAuthクライアントIDの発行まで完了。実際にユーザーの
  プレゼンテーションへルビ用テキストボックスを書き込み、`description` マーカーによる一括削除まで
  実機で成功を確認した
- ✅ 全スライドへの一括書き込み — `src/content/slideNavigator.ts` がフィルムストリップのサムネイルを
  合成クリックしてページを自動切り替えしながら、各スライドを実際に画面表示して測定・書き込みを
  繰り返す方式で実装（`writeController.ts` の `writeRubyToAllSlides`）。実機で12枚構成のプレゼンテーション
  全体への書き込みに成功を確認した
- ✅ 書き込み成功後、モード A（画面表示）を自動的に OFF にする — 書き込んだテキストボックスと
  表示中のオーバーレイが同時に存在すると、レンダリング方式のわずかな違いにより二重表示のように
  見えてしまうため（実機で確認）

### 既知の軽微な課題(Phase 3 以降で改善検討)

- 非常に大きいフォントのタイトルが1行目にある場合、ルビがテキストボックスの外にわずかにはみ出ることがある
- 本文フォントが極端に小さいスライドで、5文字以上の長い読みが2文字幅の本文に乗ると、隣接語のルビとわずかに重なることがある(`sizeRatio` を下げれば軽減可能)
- 汎用辞書に無い専門用語(麻雀用語の「筒子」「雀頭」等)は誤読になる。ユーザー辞書機能(バックエンドは実装済み、options UI が未実装)で対応する想定

### 重要な制約: ルビの画面表示は編集画面限定

現在の表示方式（モード A）は、Google スライドの**編集画面でのみ**動作します。発表モード・印刷・PDF/PPTX書き出しには反映されません。これは実装の不備ではなく、発表モードが文字を検出不能な図形として描画するという Google 側の仕様によるものです。発表・印刷にもルビを出したい場合は、Phase 2 で計画しているスライドへの書き込み機能（実際のテキストボックスとして焼き込む方式）が必要です。

## Chrome で試す（手動）

自動化ブラウザからは `chrome://extensions` にアクセスできない制約があるため、以下は手動で行ってください。

```bash
npm run build
```

1. Chrome で `chrome://extensions` を開く
2. 右上の「デベロッパーモード」を ON にする
3. 「パッケージ化されていない拡張機能を読み込む」→ このプロジェクトの `dist/` フォルダを選択
4. Googleスライドの編集画面を開き、漢字を含む日本語テキストを入力してルビが表示されるか確認する（拡張機能アイコンをクリックすると設定パネルが開く）

うまく動かない場合は、対象ページで拡張機能のサービスワーカーのコンソール（`chrome://extensions` の「Service Worker」リンク）と、ページ自体の開発者ツールコンソールの両方を確認してください。

## Phase 2: OAuth のセットアップ（スライドへの書き込み機能を使うために必要）

**✅ このプロジェクトではセットアップ済み・実機で動作確認済みです**（2026-09-17。`manifest.json` の
`oauth2.client_id` に実際の値が設定されています）。別の GCP プロジェクト・別の拡張機能IDで
セットアップし直す場合は、以下の手順を参考にしてください。

スライドへの書き込み機能（パネルの「このスライド」ボタン等）は Google Slides API を使うため、
Google アカウントでの事前設定が必要です。これは Claude では代行できない作業のため、以下の手順を
手動で行ってください。

### セットアップ時に実際にはまった点

- **GCP プロジェクト名に日本語は使えない**。英数字・シングルクォート・ハイフン・スペース・感嘆符のみ。
- **OAuth同意画面のアプリ名に "Google" という単語を含めるとエラーになる**（Google の商標ポリシー。
  「〜 for Google スライド」のような名前は拒否される。拡張機能自体の名前は変えず、同意画面の
  表示名だけ変更すればよい）。
- OAuthクライアント作成画面での種類の表記は「Chromeアプリ」ではなく **「Chrome 拡張機能」**。
- `updateShapeProperties` リクエストで `autofit` フィールドを更新しようとすると
  `Invalid field mask: * includes read-only fields` エラーになる（読み取り専用フィールドのため。
  このプロジェクトでは既に対応済み）。

**この拡張機能の固定ID（すでに `manifest.json` の `key` に設定済み）:**

```
manclgmnopghllchmkjenfbigakkamjm
```

このIDは `.secrets/extension-key.pem`（秘密鍵、Gitには含めていません）から算出した固定値です。
`chrome://extensions` で「デベロッパーモード」から読み込む限り、削除→再読み込みを繰り返しても
このIDは変わりません（`.secrets/` を紛失するとIDが変わってしまうので、バックアップを推奨します）。

### 手順

1. [Google Cloud Console](https://console.cloud.google.com/) にアクセスし、新しいプロジェクトを作成する
   （個人利用なら無料枠で十分です）。
2. 左メニュー「APIとサービス」→「有効なAPIとサービス」→「APIとサービスを有効化」から
   **Google Slides API** を検索して有効化する。
3. 「APIとサービス」→「OAuth同意画面」を設定する。
   - User Type は「外部」を選択（Google Workspace アカウントでない場合）。
   - アプリ名・サポートメール等を入力する。
   - スコープの追加で `https://www.googleapis.com/auth/presentations` を追加する。
   - 公開ステータスは「テスト」のままでよい（自分や少人数で使う分には審査不要。
     不特定多数に配布する場合は Google の審査が必要になる。PLAN.md 3.2節参照）。
   - 「テストユーザー」に自分の Google アカウントのメールアドレスを追加する
     （テストモードでは、ここに登録したアカウントしかログインできません）。
4. 「認証情報」→「認証情報を作成」→「OAuthクライアントID」を選択する。
   - アプリケーションの種類は **「Chromeアプリ」** を選択する。
   - 「アプリケーションID」の欄に、上記の固定ID `manclgmnopghllchmkjenfbigakkamjm` を入力する。
5. 作成されたクライアントIDをコピーし、`manifest.json` の `oauth2.client_id` を書き換える。

```json
"oauth2": {
  "client_id": "ここに実際のクライアントIDを貼り付け.apps.googleusercontent.com",
  "scopes": ["https://www.googleapis.com/auth/presentations"]
}
```

6. `npm run build` して `dist/` を作り直し、`chrome://extensions` で拡張機能を削除→再読み込みする。
7. Googleスライドの編集画面を開き、拡張機能アイコンをクリックしてパネルを開き、「このスライド」を押す。
   初回は Google の同意画面が表示されるので、許可する。

## セットアップ

```bash
npm install
```

## 開発コマンド

```bash
npm run dev        # Vite dev サーバ（拡張の HMR 開発）
npm run build       # 型チェック + dist/ にビルド（chrome://extensions で「パッケージ化されていない拡張機能を読み込む」から dist/ を指定）
npm run typecheck   # 型チェックのみ
npm run test        # 単体テスト(Vitest)を1回実行
npm run test:watch  # 単体テストをwatchモードで実行
npm run test:e2e    # e2eテスト(Playwright)。content scriptを実ブラウザで動かして検証する
npm run lint         # ESLint
```

### e2eテスト(Playwright)の仕組み

`npm run test:e2e` は次を行う。

1. `vite.e2e.config.ts` で content script 本体(`src/content/index.ts`)と kuromoji シム(`tests/e2e/kuromojiShim.ts`)をバンドルする(`tests/e2e/dist/`)
2. 実機で確認した Slides の DOM 構造を再現した固定 HTML(`tests/e2e/fixtures/slides-like.html`)を静的サーバ(`tests/e2e/staticServer.mjs`)で配信する
3. Playwright が `chrome.runtime`/`chrome.storage` だけを本物の kuromoji で裏打ちしたスタブに差し替えて(実際の service worker は使わない)、content script を無改変のまま実ブラウザ(Chromium)で動かす

これにより、モックではなく本物の DOM/SVG API(`getExtentOfChar`・`getScreenCTM`・`MutationObserver` 等)を使って、表示・実機で発見した不具合の回帰・DomWatcherによる編集追従・ON/OFF切り替えを自動検証できる。Google 本物のログインが必要な Slides ページに依存しないため CI でも実行できる。

## ディレクトリ構成

```
src/
  core/      # DOM・kuromoji非依存のロジック(ReadingService)。単体テストの主対象
             #   types / kana / reading / gradeFilter / userDict / messages(メッセージプロトコル型)
  content/   # content script(スライド編集画面に注入される側)
             #   selectors(DOMセレクタ集約) / textExtractor / overlayRenderer / geometry(純粋関数)
             #   domWatcher / rubyPipeline(オーケストレーション) / tokenizeClient / gradeTableClient
             #   panel(設定パネルUI、Shadow DOM) / webFontLoader(Google Fontsの動的読み込み)
  worker/    # service worker
             #   xhrShim(kuromoji用fetchシム) / tokenizer(kuromoji統合) / gradeTable / index(メッセージハンドラ)
             #   アイコンクリック(chrome.action.onClicked)を受けてcontent scriptにパネル開閉を依頼する
  options/   # 詳細設定ページ(ユーザー辞書の追加・編集・削除、インポート/エクスポート、実装済み)
  shared/    # content/optionsで共有する設定・ユーザー辞書のstorage I/O・フォント/サイズの選択肢
public/
  data/      # 学年別漢字配当表などの静的データ
  dict/      # kuromoji辞書(gitには含めず、node_modules/kuromoji/dictからコピーする運用)
  icons/     # 拡張機能アイコン(プレースホルダー、後で差し替え)
tests/unit/  # core/ とDOM非依存の純粋関数(content/geometry.ts等)に対する単体テスト
tests/e2e/   # Playwrightによるe2eテスト。fixtures/(固定HTML)、kuromojiShim.ts、
             # staticServer.mjs、rubi.spec.ts。dist/はビルド生成物(gitignore対象)
```

## ReadingService の設計メモ

`src/core/reading.ts` の `buildRubyToken` は、次の優先順位でルビを決定する。

1. 漢字を含まないトークンはルビなし
2. ユーザー辞書に表層形が完全一致すればそれを最優先(単語全体へのグループルビ)
3. 読みが決定できない(未知語マーカー `*` や未定義)トークンはルビなし
4. 学年フィルタが有効で、トークン内の漢字がすべて指定学年以下ならルビなし(学年不明の漢字は安全側でルビを振る)
5. それ以外は、表層形を「漢字の連続」と「かな等の連続」に交互分割し、読みと突き合わせて
   漢字の連続ごとにルビを割り当てる(グループルビ)。整合が取れない場合は単語全体を
   1つのグループルビにフォールバックする

既定値は「学年フィルタなし(全漢字にルビ)」「グループルビ」(PLAN.md の決定事項)。

## 既知の注意点(未解決/Phase 1 残タスクに引き継ぎ)

- `public/data/kanji-grades.sample.json` は**サンプル/プレースホルダー**であり、文部科学省の
  学年別漢字配当表(教育漢字)の全件ではない。学年フィルタ機能を実際に使えるようにする前に、
  公式データで置き換える必要がある。
- アイコン画像(`public/icons/*.png`)は単色のプレースホルダー。デザイン確定後に差し替える。
- `manifest.json` は `default_locale` を意図的に外している(i18n 対応は Phase 3 のタスク)。
