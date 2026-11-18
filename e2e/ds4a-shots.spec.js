// DS-4a: кадри жесту закриття шторки (спокій, зсув 40/80/130 pt із затемненням, закриття, пружне повернення), обидві теми. Лише за DS_SHOTS_DIR.
const { test } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { installClock } = require('./clock');
const DIR = process.env.DS_SHOTS_DIR;
test.skip(!DIR, 'потрібен DS_SHOTS_DIR');
test.use({ hasTouch: true, deviceScaleFactor: 2 });
test('ds4a-shots', async ({ page }) => {
  test.setTimeout(240000); fs.mkdirSync(DIR, { recursive: true });
  await page.setViewportSize({ width: 390, height: 844 }); await installClock(page);
  await page.goto('/index.html?fixture=typical');
  await page.waitForFunction(() => window.MockCloud && typeof cloudSession !== 'undefined' && cloudSession && cloudSession.user && document.querySelector('.tabbar-glass'));
  await page.waitForTimeout(1500);
  await page.evaluate(() => {
    window.__sw = { el: null, x: 0, y0: 0 };
    window.__ptr = (type, yy) => window.__sw.el.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 5, pointerType: 'touch', isPrimary: true, clientX: window.__sw.x, clientY: yy, button: type === 'pointerdown' ? 0 : -1 }));
  });
  for (const theme of ['light', 'dark']){
    await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme); await page.waitForTimeout(300);
    const shot = (n) => page.screenshot({ path: path.join(DIR, 'f-' + theme + '-' + n + '.png'), scale: 'css' });
    await page.evaluate(() => openSettings()); await page.waitForTimeout(700); await shot('0-rest');
    await page.evaluate(() => { const el = document.querySelector('#settings-drawer .drawer-head h2'), r = el.getBoundingClientRect(); window.__sw = { el: el, x: r.x + r.width / 2, y0: r.y + r.height / 2 }; window.__ptr('pointerdown', window.__sw.y0); });
    let cur = 0;
    for (const d of [40, 80, 130]){
      for (let s = cur + 10; s <= d; s += 10) await page.evaluate(([s]) => window.__ptr('pointermove', window.__sw.y0 + s), [s]);
      cur = d; await page.waitForTimeout(120); await shot('1-drag' + d);
    }
    await page.evaluate(() => window.__ptr('pointerup', window.__sw.y0 + 130)); await page.waitForTimeout(120); await shot('2-closing'); await page.waitForTimeout(600);
    // повільний короткий: пружне повернення
    await page.evaluate(() => openSettings()); await page.waitForTimeout(700);
    await page.evaluate(async () => { const el = document.querySelector('#settings-drawer .drawer-head h2'), r = el.getBoundingClientRect(); window.__sw = { el: el, x: r.x + r.width / 2, y0: r.y + r.height / 2 }; window.__ptr('pointerdown', window.__sw.y0); for (let s = 10; s <= 60; s += 10){ await new Promise(r => setTimeout(r, 90)); window.__ptr('pointermove', window.__sw.y0 + s); } });
    await shot('3-drag60'); await page.evaluate(() => window.__ptr('pointerup', window.__sw.y0 + 60)); await page.waitForTimeout(140); await shot('4-springback'); await page.waitForTimeout(500);
    await page.evaluate(() => closeSettings()); await page.waitForTimeout(500);
  }
});
