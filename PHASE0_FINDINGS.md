# Phase 0 技術検証 — 結果

検証日: 2026-09-17
検証環境: 実ブラウザ（ログイン済み Google アカウント）で新規 Googleスライドを作成し、DOM/SVG を直接調査。kuromoji.js はローカル Node.js 環境で動作検証。

## 結論: **Go**

Phase 1・Phase 2 の前提となる技術要素はすべて実現可能と確認した。設計を一部具体化する必要がある箇所が 2 点見つかったので、対応方針を以下に記す。

---

## 1. スライドの SVG テキスト構造

想定より扱いやすい構造だった。

- 編集画面のキャンバスは SVG で描画され、**1 文字ごとに独立した `<text>` 要素**が `<g class="sketchy-text-content-text">` に包まれて存在する（熟語をまとめた `<text>` ではない）。
- 例: 「食べる学校生活は楽しい」→ `<text>食</text>`、`<text>べ</text>`、`<text>る</text>`… と 1 文字 1 要素。
- 段落は `<g id="editor-i0-paragraph-0">` のようにグループ化され、シェイプ全体は `<g id="editor-i0">`、ページ全体は `<g id="editor-p">` に包まれる。
- サムネイル（フィルムストリップ）側は別構造（`punch-filmstrip-*` クラス）で、ページ番号などのテキストしか持たない。TextExtractor はメインキャンバスの SVG のみを対象にすればよい。

**影響**: 文字ごとの座標取得がそのまま行える。トークン（熟語）とグループルビの区間は、この 1 文字ずつの `<text>` 要素を「読み仮名を割り当てたい文字範囲」でひとまとめにして描画すればよく、DOM 側の追加パースはほぼ不要。

## 2. 文字ごとの座標取得（`getExtentOfChar` / `getScreenCTM`）

- `SVGTextContentElement.getExtentOfChar(0)` は要素のローカル座標系で正しい `{x, y, width, height}` を返す（実測: `x:56.29, y:-63, width:69.3, height:78`）。
- `getScreenCTM()` も正しく取得でき、ローカル座標を `DOMPoint.matrixTransform()` で画面 px に変換した結果が `getBoundingClientRect()` の実測値と一致した（誤差 0.01px 未満）。

**影響**: モード A（オーバーレイ表示）は EMU 換算を経由せず、`getExtentOfChar` → `getScreenCTM` → 画面 px、という経路だけで正確な位置にルビ用の要素を重ねられる。ズーム・スクロール後も `getScreenCTM()` を都度再取得すれば追従できる（ライブ DOM API のため常に最新の変換行列を返す）。

## 3. DOM の id は Slides API の objectId と一致しない（要対応）

- シェイプの DOM id は `editor-i0`、ページは `editor-p` のような**内部的な連番/表示上のインデックス**であり、Slides API (`presentations.get`) が返す `objectId`（Google 側が発行する不透明な文字列）とは別物であることを確認した。
- つまり「DOM の id を Slides API にそのまま渡す」という単純な対応付けはできない。

**影響（設計変更）**: モード B（書き込み）で「画面上のどのテキストがどの API シェイプに対応するか」を特定するには、**位置（bounding box）とテキスト内容の突き合わせ**で対応付ける方式に変更する。具体的には、Phase 2 の CoordMapper で次の手順を踏む。

1. Slides API `presentations.get` でページ内の全シェイプの `objectId`・位置（EMU）・テキスト内容を取得する。
2. エディタの実ピクセル寸法（ページ全体のスクリーン座標での bounding box）と、API から得たページサイズ（EMU）の比率から px↔EMU のスケール係数を算出する（この係数は SVG の内部 viewBox 値を使わない。理由は次項）。
3. 各 API シェイプの EMU 位置をこの係数で px に変換し、DOM 側の各テキストグループの bounding box と**最も近い位置**のものを候補にする。
4. 候補が複数ある場合はテキスト内容の完全一致で絞り込む。
5. 一意に決まらない場合（同一テキストが複数箇所にある等）は書き込みをスキップし、ユーザーに手動確認を促す。

これは Phase 2 の Injector / CoordMapper の設計に反映済み（本ファイル末尾の計画更新を参照）。

## 4. px ↔ EMU 変換: SVG の内部座標はそのまま使わない

- メインキャンバスの SVG は `viewBox="0 0 436626 212217"` のような値を持つが、この比率（約 2.06）は標準的なスライド比率（4:3=1.33、16:9=1.78）のどれとも一致しない。UI 上に手動の「ページ設定」ダイアログも見当たらず、この内部単位が何を表すか（マージンや操作ハンドル領域を含む可能性がある）を確証できなかった。
- 一方で `getScreenCTM()` は実ピクセルとの対応が正確に取れることを確認済み。

**影響（設計方針）**: px↔EMU の変換は、SVG 内部座標を解読する方式を採用せず、**Phase 2 で Slides API から取得できる実際のページサイズ（EMU）と、エディタのページ要素の実測ピクセル幅の比率**から都度算出する方式にする。これは「3.3 モード B の書き込み方式」の手順 2 を精緻化したものとして計画に反映する。

## 5. DOM 変更の検知（MutationObserver）

- `MutationObserver`（`childList + subtree + characterData + attributes`）を `document.body` に張った状態でテキストを 1 文字追記したところ、**編集操作に対して確実に mutation イベントが発火**した。
- 短時間に複数の mutation（2件、6件）に分かれて発火したため、実装では debounce（150〜300ms 程度、`requestAnimationFrame` 併用）を挟んで再描画をまとめる設計が必要。これは計画の DomWatcher の想定通り。

**影響**: 追加の設計変更なし。想定通りの実装で問題ない。

## 6. kuromoji.js の動作検証（Node.js ローカル）

- 辞書サイズ: 実測 **17MB**（gzip 済み `.dat.gz` 合計）。計画の見積り「十数 MB」と一致。
- トークン化・読み取得は良好。送り仮名分離が必要なケースを複数確認:
  - 「食べる」→ 表層形と読み（カタカナ→ひらがな変換後「たべる」）を末尾から突き合わせ、一致する「べる」を除いた「食」に「た」を割り当てる、という計画のアルゴリズムで対応可能と確認。
  - 「打ち合わせ」「自由が丘」のように送り仮名が語の途中に挟まる語も存在するため、単純な prefix/suffix 一致だけでなく、**仮名の出現位置で再帰的に区切る**アルゴリズム（既存の ruby 生成ライブラリで採用されている手法）が必要と判明。Phase 1 の `core/reading.ts` の実装方針に反映する。

## 7. kuromoji.js を MV3 service worker で動かす際の既知の問題と解決策（検証済み）

**問題**: kuromoji の `package.json` は `browser` フィールドで `NodeDictionaryLoader.js` → `BrowserDictionaryLoader.js` を差し替える仕組みになっているが、`BrowserDictionaryLoader` は内部で `new XMLHttpRequest()` を使う。MV3 の service worker グローバルスコープには `XMLHttpRequest` が存在しない（`fetch` のみ利用可能）ため、素のままではロードに失敗する。

**検証**: Node.js 上で `XMLHttpRequest` が未定義の状態（MV3 service worker と同条件）を再現し、`fetch` ベースの最小限の `XMLHttpRequest` シム（`open`/`send`/`onload`/`onerror`/`response` の約 20 行の互換クラス）を `globalThis.XMLHttpRequest` に登録した上で、**kuromoji のブラウザ用ローダーを一切改変せずに**辞書ロード→トークン化まで成功することを確認した。

```
OK: XMLHttpRequest is undefined, matching MV3 service worker scope
OK: installed fetch-backed XMLHttpRequest shim
OK: dictionary loaded via fetch-shim in 639ms
OK: tokenized via shim-loaded dictionary: 食べる(タベル) 学校(ガッコウ) 生活(セイカツ) は(ハ) 楽しい(タノシイ) 。(。)
```

ロード時間は 639ms（ローカル HTTP サーバ経由。実際の拡張機能ではパッケージ内蔵ファイルへの `fetch(chrome.runtime.getURL(...))` になるためこれと同等かそれ以上に速い見込み）。非機能要件「初回ロード 3 秒以内」を満たす。

**影響**: Phase 1 の worker 実装で、kuromoji を読み込む前に上記の XHR シムをグローバルに登録するモジュールを 1 つ用意する（例: `src/worker/xhrShim.ts`）。フォークや改変は不要。

## 8. ビルド時の注意点（新規発見・計画に追加）

- kuromoji のローダー内部は Node の `path` モジュールと `async` パッケージに依存する。`async` は純 JS なので npm 経由でそのままバンドル可能だが、`path` は Node コア API であり Vite は既定で Node コアモジュールを解決しない。
- **対応**: `vite-plugin-node-polyfills`（または `path-browserify` を `path` のエイリアスとして手動設定）を Vite 設定に追加する。webpack や esbuild で `path-browserify` を使う場合も同様の設定が要る。この一行は当初の技術スタック選定（3.1節）では明示していなかったため、Phase 1 のプロジェクト雛形タスクに追記する。

---

## 計画（PLAN.md）への反映事項まとめ

- [x] Phase 0 の Go / No-Go 判断: **Go**
- CoordMapper（Phase 2）の対応付け方式を「DOM id ⇔ API objectId の直接対応」から「位置＋テキスト内容によるマッチング」に確定（3.5節・3.3節の記述を更新）
- px↔EMU 変換は SVG 内部座標を使わず、Slides API のページサイズと実測ピクセル幅から都度算出する方式に確定
- `core/reading.ts` の送り仮名分離は、末尾一致だけでなく仮名位置での再帰的分割アルゴリズムが必要と確定
- Vite ビルド設定に Node コアモジュール（`path`）のポリフィルが必要と判明。Phase 1 の雛形構築タスクに追加
- kuromoji の MV3 対応は fetch ベースの XHR シムで解決可能と実証済み。フォーク不要
