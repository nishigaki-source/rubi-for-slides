import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import { crx, type ManifestV3Export } from '@crxjs/vite-plugin';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import baseManifest from './manifest.json' with { type: 'json' };

// 動作確認用ビルド(npm run build:qa)だけ、Googleドキュメントのページから指示を受ける content script も入れる
// (src/content/docs/qaBridge.ts。スライドの受け口は src/content/index.ts の中にある)。
const isQa = process.env.RUBI_QA === '1';
const manifest = {
  ...baseManifest,
  ...(isQa
    ? {
        content_scripts: [
          ...baseManifest.content_scripts,
          { matches: ['https://docs.google.com/document/*'], js: ['src/content/docs/qaBridge.ts'], run_at: 'document_idle' },
        ],
      }
    : {}),
} as ManifestV3Export;

// Phase 0 の技術検証で判明した通り、kuromoji.js のブラウザ用ローダーは
// Node コアモジュール `path` に依存する。Vite は既定で Node コアモジュールを
// 解決しないため、vite-plugin-node-polyfills で `path` のみを補う。
// （XMLHttpRequest 依存の解決は src/worker/xhrShim.ts で別途対応する）
export default defineConfig({
  define: {
    // どのビルドが Chrome に読み込まれているかをログで判別できるようにする
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
    // 動作確認用ビルド(npm run build:qa)だけ、ページから書き込み等を指示できる受け口を入れる(src/content/qaBridge.ts)
    __RUBI_QA__: JSON.stringify(isQa),
  },
  resolve: {
    alias: {
      // kuromoji.js の BrowserDictionaryLoader が gzip 展開に使う zlibjs は
      // Closure Compiler 形式のエクスポートで、Vite のバンドル環境下では
      // 正しく動作しない(実機テストで発見。詳細は src/worker/zlibGunzipShim.cjs 参照)。
      // pako ベースの互換シムに差し替える。
      'zlibjs/bin/gunzip.min.js': fileURLToPath(
        new URL('./src/worker/zlibGunzipShim.cjs', import.meta.url)
      ),
    },
  },
  plugins: [
    nodePolyfills({
      include: ['path'],
      globals: {
        Buffer: false,
        global: false,
        process: false,
      },
    }),
    crx({ manifest }),
  ],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        options: 'src/options/index.html',
      },
    },
  },
});
