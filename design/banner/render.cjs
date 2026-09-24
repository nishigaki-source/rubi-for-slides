// design/banner/banner.html を Playwright(Chromium)で開き、ストア用のプロモーションタイルを書き出す。
// 使い方: node design/banner/render.cjs
// 出力: design/promo-tile-small-440x280.png, design/promo-tile-marquee-1400x560.png
// フォント(Noto Sans JP)は Google Fonts から読み込むため、ネットワーク接続が必要。
const path = require('node:path');
const { chromium } = require('playwright');

const DIR = __dirname;
const DESIGN = path.join(DIR, '..');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  await page.goto('file://' + path.join(DIR, 'banner.html'), { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);

  const outputs = [
    ['#small', 'promo-tile-small-440x280.png'],
    ['#marquee', 'promo-tile-marquee-1400x560.png'],
  ];
  for (const [selector, file] of outputs) {
    await page.locator(selector).screenshot({ path: path.join(DESIGN, file) });
    console.log(`wrote design/${file}`);
  }
  await browser.close();
})();
