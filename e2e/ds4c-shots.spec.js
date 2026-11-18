// DS-4c: знімки діалогу «Скасувати зміни?» (390 і 1280 пт, обидві теми). Лише з DS_SHOTS_DIR.
const { test } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { installClock } = require('./clock');
const DIR = process.env.DS_SHOTS_DIR;
test.skip(!DIR, 'потрібен DS_SHOTS_DIR');
test.use({ hasTouch: true, deviceScaleFactor: 2 });
test('ds4c-shots', async ({ page }) => {
  test.setTimeout(180000); fs.mkdirSync(DIR, { recursive: true });
  for (const w of [390, 1280]){
    await page.setViewportSize({ width: w, height: w === 390 ? 844 : 800 }); await installClock(page);
    await page.goto('/index.html?fixture=typical');
    await page.waitForFunction(() => window.MockCloud && typeof cloudSession !== 'undefined' && cloudSession && cloudSession.user && document.querySelector('.tabbar-glass'));
    await page.waitForTimeout(1500);
    for (const theme of ['light', 'dark']){
      await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme); await page.waitForTimeout(300);
      await page.evaluate(() => { switchTab('accounting'); openCardDebtEditor(0); }); await page.waitForTimeout(900);
      await page.evaluate(() => { const e = document.getElementById('cdd-balance'); e.value = '12 345'; e.dispatchEvent(new Event('input', { bubbles: true })); });
      await page.evaluate(() => requestCloseSheet('card-debt-drawer', 'close')); await page.waitForTimeout(900);
      await page.screenshot({ path: path.join(DIR, 'dialog-' + w + '-' + theme + '.png') });
      await page.evaluate(() => document.getElementById('app-modal-confirm-btn').click()); await page.waitForTimeout(600);
    }
  }
});
