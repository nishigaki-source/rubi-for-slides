import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;
const PANEL_PORT = 4175;

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.spec.ts',
  timeout: 30_000,
  fullyParallel: true,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // 静的サーバーを自動起動する。バンドル(vite.e2e.config.ts)は
  // 事前に `npm run build:e2e` で生成しておく必要がある
  // (webServer の command には含めない: ビルドは重く、テスト実行のたびに
  //  毎回走らせるのではなく明示的に叩く運用にするため)。
  webServer: [
    {
      command: `node tests/e2e/staticServer.mjs`,
      url: `http://localhost:${PORT}/tests/e2e/fixtures/slides-like.html`,
      reuseExistingServer: !process.env.CI,
      env: { E2E_STATIC_PORT: String(PORT) },
    },
    // サイドパネルの画面(tests/e2e/sidepanel.spec.ts): 拡張機能をビルドした tests/e2e/panel-dist を配信する
    {
      command: `node tests/e2e/staticServer.mjs`,
      url: `http://localhost:${PANEL_PORT}/src/sidepanel/index.html`,
      reuseExistingServer: !process.env.CI,
      env: { E2E_STATIC_PORT: String(PANEL_PORT), E2E_STATIC_ROOT: 'tests/e2e/panel-dist' },
    },
  ],
});
