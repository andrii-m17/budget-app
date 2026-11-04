// E2E-CLOUD (Rev 2.32.243): справжній тестовий сервер Supabase, два браузерні контексти («Тест А», «Тест Б»). Запуск: npm run e2e:cloud. Лише локально.
const { defineConfig, devices } = require('@playwright/test');
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const PORT = Number(process.env.E2E_CLOUD_PORT || 8936);
module.exports = defineConfig({
  testDir: './e2e/cloud',
  testMatch: '**/*.spec.js',
  outputDir: './e2e-results/cloud-' + stamp,
  globalSetup: './e2e/cloud/global-setup.js',
  timeout: 90000,
  globalTimeout: 600000,
  retries: 0,
  workers: 1,
  fullyParallel: false,
  reporter: [['list']],
  expect: { timeout: 15000 },
  use: { ...devices['iPhone 14'], baseURL: 'http://127.0.0.1:' + PORT, colorScheme: 'dark', screenshot: 'only-on-failure', trace: 'off', serviceWorkers: 'block' },
  projects: [{ name: 'cloud' }],
  webServer: { command: 'node e2e/server.js', url: 'http://127.0.0.1:' + PORT + '/index.html', reuseExistingServer: true, timeout: 20000, env: { E2E_PORT: String(PORT) } },
});
