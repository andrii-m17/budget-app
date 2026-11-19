// UI-320: знімки «до/після» шапки вкладок «Витрати» й «Аналітика» на 320 пт (DS_SHOTS_DIR, DS_SHOTS_TAG=before|after).
const { test } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { installClock } = require('./clock');
const SHOTS = process.env.DS_SHOTS_DIR, TAG = process.env.DS_SHOTS_TAG || 'after';
test.use({ hasTouch: true });
test('ui320-shots', async ({ page }) => {
  test.skip(!SHOTS, 'потрібен DS_SHOTS_DIR');
  test.setTimeout(120000); fs.mkdirSync(SHOTS, { recursive: true });
  await page.setViewportSize({ width: 320, height: 700 }); await installClock(page);
  await page.goto('/index.html?fixture=typical');
  await page.waitForFunction(() => window.MockCloud && typeof cloudSession !== 'undefined' && cloudSession && cloudSession.user && document.querySelector('.tabbar-glass'));
  await page.waitForTimeout(1500);
  for(const theme of ['dark', 'light']){
    for(const tab of ['vytraty', 'analytics']){
      await page.evaluate(([t, tb]) => { document.documentElement.setAttribute('data-theme', t); switchTab(tb); }, [theme, tab]);
      await page.waitForTimeout(900);
      await page.screenshot({ path: path.join(SHOTS, tab + '-' + TAG + '-' + theme + '.png'), clip: { x: 0, y: 0, width: 320, height: 380 } });
    }
  }
});
