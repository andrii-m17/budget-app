// DS-3b6: знімок «+» з лічильником (вибрана/невибрана/стиснений таббар, обидві теми). Лише за DS_SHOTS_DIR.
const { test } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { installClock } = require('./clock');
const DIR = process.env.DS_SHOTS_DIR, SUF = process.env.DS_SHOTS_SUFFIX || 'after';
test.skip(!DIR, 'потрібен DS_SHOTS_DIR');
test.use({ deviceScaleFactor: 3 });
test('ds3b6-badge', async ({ page }) => {
  test.setTimeout(120000); fs.mkdirSync(DIR, { recursive: true });
  await page.setViewportSize({ width: 390, height: 844 }); await installClock(page);
  await page.goto('/index.html?fixture=typical');
  await page.waitForFunction(() => window.MockCloud && typeof cloudSession !== 'undefined' && cloudSession && cloudSession.user && document.querySelector('.tabbar-glass'));
  await page.waitForTimeout(1500);
  for (const theme of ['light', 'dark']){
    await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
    for (const [name, tab, mini] of [['unselected', 'accounting', false], ['selected', 'vytraty', false], ['mini-selected', 'vytraty', true]]){
      await page.evaluate(([t, m]) => { switchTab(t, { noFocus: true }); document.querySelector('nav.tabbar').classList.toggle('mini', m); }, [tab, mini]); await page.waitForTimeout(1500);
      const r = await page.locator('nav.tabbar .tb-icon-wrap').boundingBox();
      await page.screenshot({ path: path.join(DIR, 'badge-' + name + '-' + theme + '-' + SUF + '.png'), clip: { x: r.x - 16, y: r.y - 16, width: r.width + 32, height: r.height + 44 } });
    }
    await page.evaluate(() => document.querySelector('nav.tabbar').classList.remove('mini'));
  }
});
