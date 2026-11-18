// DS-5e: знімок усієї «Аналітики» згори донизу (390 pt, обидві теми) для звірки «до/після» прибирання; лише з DS_SHOTS_DIR і DS_TAG (before|after).
const { test } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { installClock } = require('./clock');
const DIR = process.env.DS_SHOTS_DIR, TAG = process.env.DS_TAG || 'after';
test.skip(!DIR, 'потрібен DS_SHOTS_DIR');
test('ds5e-shots', async ({ page }) => {
  test.setTimeout(240000); fs.mkdirSync(DIR, { recursive: true });
  for (const theme of ['light', 'dark']){
    await page.setViewportSize({ width: 390, height: 4200 }); await installClock(page);
    await page.goto('/index.html?fixture=typical');
    await page.waitForFunction(() => window.MockCloud && typeof cloudSession !== 'undefined' && cloudSession && cloudSession.user && document.querySelector('.tabbar-glass'));
    await page.waitForFunction(() => !document.querySelector('.avatar-status-dot.syncing'), null, { timeout: 15000 }).catch(() => {});
    await page.evaluate(t => { switchTab('analytics'); document.documentElement.setAttribute('data-theme', t); }, theme);
    await page.waitForTimeout(3500);
    await page.evaluate(() => { const t = document.querySelector('.tabbar-glass'); if(t) t.style.display = 'none'; });
    await page.screenshot({ path: path.join(DIR, 'analytics-' + TAG + '-' + theme + '.png') });
  }
});
