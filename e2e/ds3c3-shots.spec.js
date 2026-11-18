// DS-3c3: знімки «+» у розгорнутому й стисненому таббарі (лінія центрів іконок) і кадри виходу з «Витрат» (проти й за годинниковою). Лише за DS_SHOTS_DIR.
const { test } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { installClock } = require('./clock');
const DIR = process.env.DS_SHOTS_DIR;
test.skip(!DIR, 'потрібен DS_SHOTS_DIR');
test.use({ hasTouch: true, deviceScaleFactor: 3 });
test('ds3c3-shots', async ({ page }) => {
  test.setTimeout(300000); fs.mkdirSync(DIR, { recursive: true });
  const info = {};
  for (const w of [390, 320]){
    await page.setViewportSize({ width: w, height: 844 }); await installClock(page);
    await page.goto('/index.html?fixture=large');
    await page.waitForFunction(() => window.MockCloud && typeof cloudSession !== 'undefined' && cloudSession && cloudSession.user && document.querySelector('.tabbar-glass'));
    await page.waitForTimeout(1500);
    await page.evaluate(() => switchTab('structure', { noFocus: true })); await page.waitForTimeout(900);
    for (const theme of ['light', 'dark']){
      await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme); await page.waitForTimeout(300);
      const clip = { x: 0, y: 844 - 100, width: w, height: 100 };
      const shot = (n) => page.screenshot({ path: path.join(DIR, n + '.png'), scale: 'device', clip });
      await page.evaluate(() => { document.getElementById('main-col').scrollTop = 0; }); await page.waitForTimeout(900); await shot('mini-' + w + '-' + theme + '-expanded');
      await page.evaluate(async () => { const el = document.getElementById('main-col'); const mk = (type, dy) => { const ev = new Event(type, { bubbles: true, cancelable: true }); const p = { identifier: 7, clientX: 200, clientY: 400 + dy, target: el }; ev.touches = type === 'touchend' ? [] : [p]; ev.changedTouches = [p]; el.dispatchEvent(ev); }; mk('touchstart', 0); mk('touchmove', -20); el.scrollTop = 400; });
      await page.waitForTimeout(900);
      info[w + '-' + theme] = await page.evaluate(() => ({ iconCy: Array.from(document.querySelectorAll('nav.tabbar button:not(.tab-vytraty) .tbx > svg')).map(e => { const r = e.getBoundingClientRect(); return r.y + r.height / 2; })[0] - (844 - 100), plusCy: (() => { const r = document.querySelector('nav.tabbar .tb-icon-wrap').getBoundingClientRect(); return r.y + r.height / 2 - (844 - 100); })() }));
      await shot('mini-' + w + '-' + theme + '-mini');
      await page.evaluate(() => { document.getElementById('main-col').scrollTop = 0; }); await page.waitForTimeout(900);
    }
  }
  // кадри виходу (390): проти годинникової (→ Облік) і за годинниковою (→ Структура)
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/index.html?fixture=large'); await page.waitForFunction(() => window.MockCloud && typeof cloudSession !== 'undefined' && cloudSession && cloudSession.user && document.querySelector('.tabbar-glass')); await page.waitForTimeout(1500);
  const bt = async (t) => { const bb = await page.locator('nav.tabbar button[data-tab="' + t + '"]').boundingBox(); await page.touchscreen.tap(bb.x + bb.width / 2, bb.y + bb.height / 2); };
  await bt('accounting'); await page.waitForTimeout(600);
  for (const theme of ['light', 'dark']){
    await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
    for (const [name, to] of [['ccw-accounting', 'accounting'], ['cw-structure', 'structure']]){
      await page.evaluate(() => switchTab('vytraty', { noFocus: true })); await page.waitForTimeout(1300);
      const bb0 = await page.locator('nav.tabbar .tb-icon-wrap').boundingBox();
      await bt(to);
      await page.evaluate(() => { const list = document.querySelector('nav.tabbar').getAnimations({ subtree: true }).filter(a => a.playState !== 'finished'); list.forEach(a => a.pause()); window.__fr = list; });
      for (const [i, p] of [[0, 0], [1, 25], [2, 50], [3, 75], [4, 100]]){
        await page.evaluate((p) => { window.__fr.forEach(a => { const end = a.effect.getComputedTiming().endTime; try{ a.currentTime = Math.min(end - 0.01, end * p / 100); }catch(e){} }); }, p);
        await page.waitForTimeout(60);
        await page.screenshot({ path: path.join(DIR, 'exit-' + name + '-' + theme + '-' + i + '.png'), scale: 'device', clip: { x: bb0.x - 12, y: bb0.y - 12, width: bb0.width + 24, height: bb0.height + 40 } });
      }
      await page.evaluate(() => { window.__fr.forEach(a => { try{ a.finish(); }catch(e){} }); }); await page.waitForTimeout(900);
    }
  }
  fs.writeFileSync(path.join(DIR, 'measure.json'), JSON.stringify(info, null, 1));
});
