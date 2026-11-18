// DS-3f: знімки капсули «Аналітика · місяць · залишок» (поточний і минулий місяць) на 390 і 320 пт та iPad 1280 пт, обидві теми. Лише за DS_SHOTS_DIR.
const { test } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { installClock } = require('./clock');
const DIR = process.env.DS_SHOTS_DIR;
test.skip(!DIR, 'потрібен DS_SHOTS_DIR');
test.use({ hasTouch: true, deviceScaleFactor: 2 });
test('ds3f-shots', async ({ page }) => {
  test.setTimeout(300000);
  fs.mkdirSync(DIR, { recursive: true });
  for (const [w, h] of [[390, 844], [320, 700], [1280, 800]]){
    await page.setViewportSize({ width: w, height: h }); await installClock(page);
    await page.goto('/index.html?fixture=large');
    await page.waitForFunction(() => window.MockCloud && typeof cloudSession !== 'undefined' && cloudSession && cloudSession.user && document.querySelector('.tabbar-glass'));
    await page.waitForTimeout(1500);
    for (const theme of ['light', 'dark']){
      await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme); await page.waitForTimeout(300);
      const states = w === 1280 ? [['current', 0]] : [['current', 0], ['past', -1]];
      for (const [name, d] of states){
        await page.evaluate((d) => { document.getElementById('main-col').scrollTop = 0; onMonthChange(shiftMonth(monthKey(localDateISO()), d)); }, d); await page.waitForTimeout(2500);
        await page.evaluate(() => { document.getElementById('main-col').scrollTop = 400; }); await page.waitForTimeout(900);
        const clip = w === 1280 ? { x: 0, y: 0, width: 1280, height: 260 } : { x: 0, y: 0, width: w, height: 140 };
        await page.screenshot({ path: path.join(DIR, 'f-' + w + '-' + theme + '-' + name + '.png'), scale: 'device', clip });
        await page.evaluate(() => { document.getElementById('main-col').scrollTop = 0; }); await page.waitForTimeout(400);
      }
    }
  }
});
