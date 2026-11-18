// DS-3c: знімки таббару в звичайному й стиснутому стані та 5 кадрів переходу (0/25/50/75/100 %) на 390 і 320 пт, обидві теми. Лише за DS_SHOTS_DIR.
const { test } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { installClock } = require('./clock');
const DIR = process.env.DS_SHOTS_DIR;
test.skip(!DIR, 'потрібен DS_SHOTS_DIR');
test.use({ hasTouch: true, deviceScaleFactor: 2 });
test('ds3c-shots', async ({ page }) => {
  test.setTimeout(300000);
  fs.mkdirSync(DIR, { recursive: true });
  for (const w of [390, 320]){
    await page.setViewportSize({ width: w, height: 844 }); await installClock(page);
    await page.goto('/index.html?fixture=large');
    await page.waitForFunction(() => window.MockCloud && typeof cloudSession !== 'undefined' && cloudSession && cloudSession.user && document.querySelector('.tabbar-glass'));
    await page.waitForTimeout(1500);
    await page.evaluate(() => switchTab('structure', { noFocus: true })); await page.waitForTimeout(900);
    for (const theme of ['light', 'dark']){
      await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme); await page.waitForTimeout(300);
      const clip = { x: 0, y: 844 - 130, width: w, height: 130 };
      const shot = (n) => page.screenshot({ path: path.join(DIR, 'f-' + w + '-' + theme + '-' + n + '.png'), scale: 'device', clip });
      const setY = async (y) => { await page.evaluate((y) => { document.getElementById('main-col').scrollTop = y; }, y); await page.waitForTimeout(200); };
      await setY(0); await page.waitForTimeout(900); await shot('normal');
      // кадри переходу: запускаємо стиснення й ставимо анімації nav на паузу
      await page.evaluate(() => { document.getAnimations().forEach(a => { try{ a.finish(); }catch(e){} }); });
      await page.evaluate((y) => { document.getElementById('main-col').scrollTop = y; }, 400);
      await page.waitForFunction(() => document.querySelector('nav.tabbar').classList.contains('mini'));
      await page.evaluate(() => { const list = document.querySelector('nav.tabbar').getAnimations({ subtree: true }).filter(a => a.playState !== 'finished'); list.forEach(a => a.pause()); window.__fr = list; });
      for (const [i, p] of [[0, 0], [1, 25], [2, 50], [3, 75], [4, 100]]){
        await page.evaluate((p) => { window.__fr.forEach(a => { const end = a.effect.getComputedTiming().endTime; try{ a.currentTime = Math.min(end - 0.01, end * p / 100); }catch(e){} }); }, p);
        await page.waitForTimeout(50); await shot('t' + i);
      }
      await page.evaluate(() => { window.__fr.forEach(a => { try{ a.finish(); }catch(e){} }); });
      await page.waitForTimeout(500); await shot('mini');
      await setY(0); await page.waitForTimeout(900);
    }
  }
});
