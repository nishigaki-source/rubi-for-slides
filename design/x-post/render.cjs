// design/x-post/post.html を Playwright(Chromium)で開き、X の告知ポストに添える画像(1600x900)を書き出す。
// 使い方: node design/x-post/render.cjs [出力先(省略時は design/x-post/)]
// フォント(Noto Sans JP)は Google Fonts から読み込むため、ネットワーク接続が必要。
const path = require('node:path');
const { chromium } = require('playwright');

const DIR = __dirname;
const OUT = process.argv[2] ? path.resolve(process.argv[2]) : DIR;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1700, height: 1000 }, deviceScaleFactor: 1 });
  await page.goto('file://' + path.join(DIR, 'post.html'), { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  const outputs = [
    ['#hero', 'x-post-1-hero.png'],
    ['#docs', 'x-post-2-docs.png'],
    ['#pinyin', 'x-post-3-pinyin.png'],
    ['#slides', 'x-post-4-slides.png'],
  ];
  for (const [selector, file] of outputs) {
    await page.locator(selector).screenshot({ path: path.join(OUT, file) });
    console.log(`wrote ${path.join(OUT, file)}`);
  }
  await browser.close();
})();
