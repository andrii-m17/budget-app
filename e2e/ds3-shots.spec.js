// DS-3a: знімки «до/після» залитих іконок таббару (390 пт, кожна вкладка вибрана) і бічної панелі (1024 пт), обидві теми + контраст іконки до скла (≥ 3:1)
const { test } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { installClock } = require('./clock');
const DIR = process.env.DS_SHOTS_DIR, SUF = process.env.DS_SHOTS_SUFFIX || 'after';
test.skip(!DIR, 'потрібен DS_SHOTS_DIR');
const TABS = ['analytics', 'accounting', 'vytraty', 'structure', 'service'];
async function boot(page){
  await installClock(page);
  await page.goto('/index.html?fixture=typical');
  await page.waitForFunction(() => window.MockCloud && typeof cloudSession !== 'undefined' && cloudSession && cloudSession.user);
  await page.waitForFunction(() => !document.querySelector('.avatar-status-dot.syncing'), null, { timeout: 15000 }).catch(() => {}); await page.waitForTimeout(1500);
  await page.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}' });
}
test('ds3-shots: таббар і бічна панель', async ({ page }) => {
  test.setTimeout(240000);
  fs.mkdirSync(DIR, { recursive: true });
  const contrast = {};
  await page.setViewportSize({ width: 390, height: 844 });
  await boot(page);
  for (const theme of ['light', 'dark']){
    await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme); await page.waitForTimeout(300);
    for (const tab of TABS){
      await page.evaluate((t) => switchTab(t), tab); await page.waitForTimeout(900);
      await page.screenshot({ path: path.join(DIR, 'tab-' + tab + '-' + theme + '-' + SUF + '.png'), scale: 'css', clip: { x: 0, y: 844 - 120, width: 390, height: 120 } });
      // контраст: колір залитої іконки (currentColor кнопки) проти скла таббару, змішаного з тлом сторінки під ним
      contrast[theme + '-' + tab] = await page.evaluate((t) => {
        const parse = (s) => { const m = s.match(/[\d.]+/g).map(Number); return { r: m[0], g: m[1], b: m[2], a: m.length > 3 ? m[3] : 1 }; };
        const lum = (c) => { const f = (v) => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }; return .2126 * f(c.r) + .7152 * f(c.g) + .0722 * f(c.b); };
        const mix = (top, bot) => ({ r: top.r * top.a + bot.r * (1 - top.a), g: top.g * top.a + bot.g * (1 - top.a), b: top.b * top.a + bot.b * (1 - top.a), a: 1 });
        const btn = document.querySelector('nav.tabbar button[data-tab="' + t + '"]'); const fg = parse(getComputedStyle(btn).color);
        const glass = parse(getComputedStyle(document.getElementById('tabbar-glass')).backgroundColor);
        const page = parse(getComputedStyle(document.body).backgroundColor);
        const bg = mix(glass, page.a < 1 ? parse(getComputedStyle(document.documentElement).getPropertyValue('--bg').trim().startsWith('#') ? (() => { const h = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim().replace('#', ''); return 'rgb(' + [0, 2, 4].map(i => parseInt(h.substr(i, 2), 16)).join(',') + ')'; })() : 'rgb(0,0,0)') : page);
        const L1 = lum(fg), L2 = lum(bg); return +((Math.max(L1, L2) + .05) / (Math.min(L1, L2) + .05)).toFixed(2);
      }, tab);
    }
  }
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.reload(); await boot(page);
  for (const theme of ['light', 'dark']){
    await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme); await page.waitForTimeout(300);
    for (const tab of ['analytics', 'accounting', 'structure', 'service']){
      await page.evaluate((t) => switchTab(t), tab); await page.waitForTimeout(900);
      await page.screenshot({ path: path.join(DIR, 'side-' + tab + '-' + theme + '-' + SUF + '.png'), scale: 'css', clip: { x: 0, y: 0, width: 300, height: 520 } });
    }
  }
  fs.writeFileSync(path.join(DIR, 'contrast-' + SUF + '.json'), JSON.stringify(contrast, null, 1));
});
