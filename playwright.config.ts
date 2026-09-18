import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;

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
  webServer: {
    command: `node tests/e2e/staticServer.mjs`,
    url: `http://localhost:${PORT}/tests/e2e/fixtures/slides-like.html`,
    reuseExistingServer: !process.env.CI,
    env: { E2E_STATIC_PORT: String(PORT) },
  },
});
