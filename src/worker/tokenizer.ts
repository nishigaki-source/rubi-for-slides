/**
 * kuromoji.js の Tokenizer をラップし、辞書の遅延ロード・キャッシュを行う。
 * PHASE0_FINDINGS.md 7節で検証済みの方式（fetch ベースの XHR シム）で
 * service worker 上でも kuromoji 本体を無改変のまま動かす。
 */
import './xhrShim';
import kuromoji from 'kuromoji';
import type { TokenizedWord } from '../core/types';

type KuromojiTokenizer = kuromoji.Tokenizer<kuromoji.IpadicFeatures>;

let tokenizerPromise: Promise<KuromojiTokenizer> | null = null;

function buildTokenizer(): Promise<KuromojiTokenizer> {
  return new Promise((resolve, reject) => {
    kuromoji
      // 【重要】dicPath には chrome.runtime.getURL('dict/') (= "chrome-extension://<id>/dict/")
      // のような完全な URL を渡してはいけない。kuromoji の DictionaryLoader は
      // 内部で path.join(dicPath, filename) を呼ぶが、bundle されている
      // path-browserify の join()->normalize() は連続するスラッシュを 1 つに
      // 潰してしまうため、"chrome-extension://xxxx/dict/" は
      // "chrome-extension:/xxxx/dict/..." (スラッシュ1個) に壊れてしまい、
      // 存在しない URL への fetch になって辞書ロードが全滅する
      // (実機テストで発見。詳細は PHASE0_FINDINGS.md 追記事項を参照)。
      // ルート相対パス "/dict/" を渡せば path.join の結果は "/dict/xxx.dat.gz" のまま壊れず、
      // service worker 内の fetch("/dict/xxx.dat.gz") は拡張機能自身のオリジン
      // (chrome-extension://<id>/) を基準に正しく解決される。
      .builder({ dicPath: '/dict/' })
      .build((err, tokenizer) => {
        if (err) {
          reject(err instanceof Error ? err : new Error(String(err)));
          return;
        }
        resolve(tokenizer);
      });
  });
}

/** Tokenizer を取得する（初回のみ辞書をロードし、以降はキャッシュを再利用する）。 */
export function getTokenizer(): Promise<KuromojiTokenizer> {
  if (!tokenizerPromise) {
    tokenizerPromise = buildTokenizer().catch((err: unknown) => {
      // 失敗した場合は次回呼び出しで再試行できるようキャッシュをクリアする
      tokenizerPromise = null;
      throw err;
    });
  }
  return tokenizerPromise;
}

/** テキストをトークン化し、core 層の TokenizedWord[] に変換して返す。 */
export async function tokenize(text: string): Promise<TokenizedWord[]> {
  const tokenizer = await getTokenizer();
  return tokenizer.tokenize(text).map((t) => ({
    surface: t.surface_form,
    reading: t.reading,
    pos: t.pos,
  }));
}

/** 辞書ロードを起動だけしておく（拡張機能インストール直後などに事前ロードしたい場合用）。 */
export function warmUpTokenizer(): void {
  void getTokenizer().catch((err: unknown) => {
    console.error('[ルビふり] 辞書の事前ロードに失敗しました', err);
  });
}
