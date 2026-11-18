// DS-4d2: знімки «до/після» по групах відступів шторок і форм (390 pt, обидві теми). Лише з DS_SHOTS_DIR (+ DS_SHOTS_SUFFIX = before|after, DS_GROUPS = список груп).
const { test } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { installClock } = require('./clock');
const DIR = process.env.DS_SHOTS_DIR, SUF = process.env.DS_SHOTS_SUFFIX || 'after';
test.skip(!DIR, 'потрібен DS_SHOTS_DIR');
test.use({ hasTouch: true, deviceScaleFactor: 2 });
const { STATES, GROUPS } = require('./ds4d2-states');
test('ds4d2-shots', async ({ page }) => {
  test.setTimeout(400000);
  const want = (process.env.DS_GROUPS || Object.keys(GROUPS).join(',')).split(',');
  await page.setViewportSize({ width: 390, height: 844 }); await installClock(page);
  await page.goto('/index.html?fixture=typical');
  await page.waitForFunction(() => window.MockCloud && typeof cloudSession !== 'undefined' && cloudSession && cloudSession.user && document.querySelector('.tabbar-glass'));
  await page.waitForTimeout(1500);
  for (const theme of ['light', 'dark']){
    await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme); await page.waitForTimeout(300);
    for (const g of want){
      fs.mkdirSync(path.join(DIR, g), { recursive: true });
      for (const s of GROUPS[g]){
        await page.evaluate(STATES[s].open); await page.waitForTimeout(1000);
        const el = page.locator(STATES[s].sel).first();
        await (STATES[s].sel === 'body' ? page : el).screenshot({ path: path.join(DIR, g, s + '-' + theme + '-' + SUF + '.png') });
        await page.evaluate(() => { try{ if(typeof closeTopSheet === 'function'){ for(let i = 0; i < 4; i++) closeTopSheet(); } }catch(e){} document.querySelectorAll('.drawer.open, .app-modal.open, .drawer-backdrop.open').forEach(d => d.classList.remove('open')); try{ switchTab('analytics'); }catch(e){} });
        await page.waitForTimeout(500);
      }
    }
  }
});
