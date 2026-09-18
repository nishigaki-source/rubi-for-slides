/**
 * MV3 service worker には XMLHttpRequest が存在しない（fetch のみ利用可能）。
 * kuromoji.js のブラウザ用ローダー（BrowserDictionaryLoader）は内部で
 * `new XMLHttpRequest()` を使っているため、そのままでは service worker 上で
 * 辞書ファイルを読み込めない。
 *
 * この最小限のシムは、kuromoji のローダーが実際に使っている API
 * （open / send / onload / onerror / responseType="arraybuffer" / status / response）
 * だけを fetch ベースで実装し、globalThis.XMLHttpRequest として登録する。
 * kuromoji.js 本体は一切改変しない。
 *
 * PHASE0_FINDINGS.md 7節で、この方式により辞書ロード〜トークン化まで
 * 成功することを実証済み（読み込み時間 639ms、フォーク不要）。
 *
 * 副作用モジュールなので、tokenizer.ts の先頭で import するだけでよい。
 */

class FetchXMLHttpRequest {
  status = 0;
  statusText = '';
  response: ArrayBuffer | null = null;
  responseType: XMLHttpRequestResponseType = '';
  onload: (() => void) | null = null;
  onerror: ((err: unknown) => void) | null = null;

  private method = 'GET';
  private url = '';

  open(method: string, url: string): void {
    this.method = method;
    this.url = url;
  }

  send(): void {
    fetch(this.url, { method: this.method })
      .then((res) => {
        this.status = res.status;
        this.statusText = res.statusText;
        if (!res.ok) {
          // kuromoji 側は status !== 200 を見てエラー扱いにするので、
          // onload を呼んでその判定に委ねる。
          this.onload?.();
          return null;
        }
        return res.arrayBuffer();
      })
      .then((buf) => {
        if (buf) {
          this.response = buf;
          this.onload?.();
        }
      })
      .catch((err) => {
        this.onerror?.(err);
      });
  }
}

// service worker には window が無いため globalThis に登録する。
// 既に定義されている環境（将来 content script 側で誤って import された場合など）では上書きしない。
if (typeof (globalThis as { XMLHttpRequest?: unknown }).XMLHttpRequest === 'undefined') {
  (globalThis as unknown as { XMLHttpRequest: unknown }).XMLHttpRequest = FetchXMLHttpRequest;
}
