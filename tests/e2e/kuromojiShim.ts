/**
 * Playwright e2e テスト用のシム。
 *
 * 実際の service worker(src/worker/tokenizer.ts)は MV3 の制約(XMLHttpRequest 無し)
 * に対応するため xhrShim.ts を必要とするが、この e2e ハーネスは通常の
 * ブラウザページとして動くため、ネイティブの XMLHttpRequest がそのまま使える。
 * そのため xhrShim.ts は不要(kuromoji 本体は無改変のまま動く)。
 *
 * ただし zlibjs の Closure Compiler 形式エクスポート問題(vite.config.ts と
 * 同じ理由)には引き続き対応が必要なため、vite.e2e.config.ts で同じ alias を張る。
 *
 * window.__kuromojiTokenize を公開し、e2e テストの chrome.runtime.sendMessage
 * スタブから呼び出す(本物の kuromoji で実際のトークン化を行う)。
 */
import kuromoji from 'kuromoji';
import type { TokenizedWord } from '../../src/core/types';

type KuromojiTokenizer = kuromoji.Tokenizer<kuromoji.IpadicFeatures>;

let tokenizerPromise: Promise<KuromojiTokenizer> | null = null;

function getTokenizer(): Promise<KuromojiTokenizer> {
  if (!tokenizerPromise) {
    tokenizerPromise = new Promise((resolve, reject) => {
      kuromoji.builder({ dicPath: '/public/dict/' }).build((err, tokenizer) => {
        if (err) {
          reject(err instanceof Error ? err : new Error(String(err)));
          return;
        }
        resolve(tokenizer);
      });
    });
  }
  return tokenizerPromise;
}

async function tokenize(text: string): Promise<TokenizedWord[]> {
  const tokenizer = await getTokenizer();
  return tokenizer.tokenize(text).map((t) => ({
    surface: t.surface_form,
    reading: t.reading,
    pos: t.pos,
  }));
}

declare global {
  interface Window {
    __kuromojiTokenize: (text: string) => Promise<TokenizedWord[]>;
  }
}

window.__kuromojiTokenize = tokenize;
