// E2E-1: WebKit (рушій Safari), емуляція iPhone 390×844. Мок Cloud — вбудований dev/mock-cloud.js (fixture у URL), мережа Supabase не потрібна.
// Знімки лише при падінні, у теці з міткою часу (e2e-results/<мітка>/); еталонів немає. Один повтор при збої; загальний ліміт 3 хв.
const { defineConfig, devices } = require('@playwright/test');
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const PORT = Number(process.env.E2E_PORT || 8935);
module.exports = defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.js',
  outputDir: './e2e-results/' + stamp,
  timeout: 40000,
  globalTimeout: 180000,
  retries: 1,
  workers: 1,
  reporter: [['list']],
  expect: { timeout: 8000 },
  use: { ...devices['iPhone 14'], baseURL: 'http://127.0.0.1:' + PORT, screenshot: 'only-on-failure', trace: 'off', serviceWorkers: 'block' },
  projects: [
    { name: 'dark', use: { colorScheme: 'dark' } },
    { name: 'light', use: { colorScheme: 'light' }, grep: /@both/ }, // світла тема: лише сценарії, чутливі до розкладки
  ],
  webServer: { command: 'node e2e/server.js', url: 'http://127.0.0.1:' + PORT + '/index.html', reuseExistingServer: true, timeout: 20000, env: { E2E_PORT: String(PORT) } },
});
