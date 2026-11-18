// DS-3b4: знімки «до/після» таббару на 320 і 390 пт (кожна вкладка вибрана, обидві теми) і вимірювання геометрії (висота скла, розміри іконок і «+», підписи, контраст). Лише за DS_SHOTS_DIR.
const { test } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { installClock } = require('./clock');
const DIR = process.env.DS_SHOTS_DIR, SUF = process.env.DS_SHOTS_SUFFIX || 'after';
test.skip(!DIR, 'потрібен DS_SHOTS_DIR');
const TABS = ['analytics', 'accounting', 'vytraty', 'structure', 'service'];
async function boot(page, w){
  await page.setViewportSize({ width: w, height: 844 }); await installClock(page);
  await page.goto('/index.html?fixture=typical');
  await page.waitForFunction(() => window.MockCloud && typeof cloudSession !== 'undefined' && cloudSession && cloudSession.user && document.querySelector('.tabbar-glass'));
  await page.waitForFunction(() => !document.querySelector('.avatar-status-dot.syncing'), null, { timeout: 15000 }).catch(() => {}); await page.waitForTimeout(1500);
  await page.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}' });
}
const measure = (page, tab) => page.evaluate((t) => {
  const r = (e) => { const b = e.getBoundingClientRect(); return [Math.round(b.x * 10) / 10, Math.round(b.y * 10) / 10, Math.round(b.width * 10) / 10, Math.round(b.height * 10) / 10]; };
  const glass = document.getElementById('tabbar-glass'), g = glass.getBoundingClientRect();
  const btns = Array.from(glass.querySelectorAll('button[data-tab]'));
  const parse = (s) => { const m = s.match(/[\d.]+/g).map(Number); return { r: m[0], g: m[1], b: m[2], a: m.length > 3 ? m[3] : 1 }; };
  const lum = (c) => { const f = (v) => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }; return .2126 * f(c.r) + .7152 * f(c.g) + .0722 * f(c.b); };
  const hex = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim().replace('#', ''); const pg = { r: parseInt(hex.substr(0, 2), 16), g: parseInt(hex.substr(2, 2), 16), b: parseInt(hex.substr(4, 2), 16), a: 1 };
  const gl = parse(getComputedStyle(glass).backgroundColor); const bg = { r: gl.r * gl.a + pg.r * (1 - gl.a), g: gl.g * gl.a + pg.g * (1 - gl.a), b: gl.b * gl.a + pg.b * (1 - gl.a) };
  const act = glass.querySelector('button[data-tab="' + t + '"]'); const fg = parse(getComputedStyle(act).color);
  const L1 = lum(fg), L2 = lum(bg);
  return { glass: r(glass), buttons: btns.map(b => ({ tab: b.dataset.tab, box: r(b), svg: r(b.querySelector('svg')), label: (() => { const x = b.querySelector('.tb-label') || b.querySelector('.tbx'); return x ? [x.scrollWidth, x.clientWidth] : null; })() })), wrap: (() => { const w = glass.querySelector('.tb-icon-wrap'); return w ? r(w) : null; })(), bubble: r(document.getElementById('tabbar-bubble')), color: getComputedStyle(act).color, contrast: Math.round((Math.max(L1, L2) + .05) / (Math.min(L1, L2) + .05) * 100) / 100 };
}, tab);
test('ds3b4-shots', async ({ page }) => {
  test.setTimeout(300000);
  fs.mkdirSync(DIR, { recursive: true });
  const info = {};
  for (const w of [320, 390, 430]){
    await boot(page, w);
    for (const theme of ['light', 'dark']){
      await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme); await page.waitForTimeout(300);
      for (const tab of TABS){
        await page.evaluate((t) => switchTab(t, { noFocus: true }), tab); await page.waitForTimeout(700);
        info[w + '-' + theme + '-' + tab] = await measure(page, tab);
        if(w !== 430) await page.screenshot({ path: path.join(DIR, 'tab-' + w + '-' + tab + '-' + theme + '-' + SUF + '.png'), scale: 'css', clip: { x: 0, y: 844 - 120, width: w, height: 120 } });
      }
    }
  }
  fs.writeFileSync(path.join(DIR, 'measure-' + SUF + '.json'), JSON.stringify(info, null, 1));
});
