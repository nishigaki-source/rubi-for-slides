import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

/**
 * Playwright e2e テスト用のビルド設定。
 *
 * 実際に拡張機能として配布される content script(src/content/index.ts)を
 * そのままバンドルし、chrome.* API だけを本物の kuromoji で裏打ちした
 * スタブに差し替えて実ブラウザ上で動かす(tests/e2e/rubi.spec.ts 参照)。
 * これにより、DOM 抽出・ReadingService・オーバーレイ描画・DOM監視という
 * content script の実際のロジックを、モックではなく本物のブラウザ SVG API
 * (getExtentOfChar / getScreenCTM / MutationObserver 等)で検証できる。
 *
 * vite.config.ts と同じ2つの既知の非互換性への対応が必要:
 *   - kuromoji が内部で使う Node の `path` モジュール(vite-plugin-node-polyfills)
 *   - zlibjs の Closure Compiler 形式エクスポートがバンドル後に壊れる問題
 *     (pako ベースの互換シムに差し替え。src/worker/zlibGunzipShim.cjs を再利用)
 */
export default defineConfig({
  resolve: {
    alias: {
      'zlibjs/bin/gunzip.min.js': fileURLToPath(
        new URL('./src/worker/zlibGunzipShim.cjs', import.meta.url)
      ),
    },
  },
  plugins: [
    nodePolyfills({
      include: ['path'],
      globals: { Buffer: false, global: false, process: false },
    }),
  ],
  build: {
    outDir: 'tests/e2e/dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        content: fileURLToPath(new URL('./src/content/index.ts', import.meta.url)),
        kuromojiShim: fileURLToPath(new URL('./tests/e2e/kuromojiShim.ts', import.meta.url)),
      },
      output: {
        entryFileNames: '[name].js',
      },
    },
  },
});
