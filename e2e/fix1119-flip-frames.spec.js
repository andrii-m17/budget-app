// FIX-1119 п.10: кадри FLIP-розгортання «Сімейного балансу» (0–100 % з кроком 20 %, розгортання й згортання, обидві теми, 390 pt) для погодження.
// Анімації ставляться на паузу і прокручуються на потрібний час (document.getAnimations); лише з DS_SHOTS_DIR.
const { test } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { installClock } = require('./clock');
const DIR = process.env.DS_SHOTS_DIR;
test.skip(!DIR, 'потрібен DS_SHOTS_DIR');
const STEPS = [0, 20, 40, 60, 80, 100];
test('fix1119-flip-frames', async ({ browser }) => {
  test.setTimeout(240000); fs.mkdirSync(DIR, { recursive: true });
  for (const theme of ['dark', 'light']) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 1100 }, deviceScaleFactor: 2, colorScheme: theme });
    const page = await ctx.newPage(); await installClock(page);
    await page.goto('/index.html?fixture=typical');
    await page.waitForFunction(() => window.MockCloud && typeof cloudSession !== 'undefined' && cloudSession && cloudSession.user && document.querySelector('.tabbar-glass'));
    await page.evaluate(t => { switchTab('analytics'); document.documentElement.setAttribute('data-theme', t); }, theme);
    await page.waitForTimeout(3500);
    await page.evaluate(() => { const t = document.querySelector('.tabbar-glass'); if (t) t.style.display = 'none'; });
    // висота розгорнутої картки для єдиної рамки кадру
    const box = await page.evaluate(async () => {
      const card = document.getElementById('bal-card');
      toggleBalanceCard(); await new Promise(r => setTimeout(r, 900));
      const r = card.getBoundingClientRect(); const h = r.height;
      toggleBalanceCard(); await new Promise(r2 => setTimeout(r2, 900));
      const r0 = card.getBoundingClientRect();
      return { x: 0, y: Math.max(0, r0.top + window.scrollY - 8), h: h + 16 };
    });
    const clip = { x: 0, y: box.y, width: 390, height: box.h };
    for (const dir of ['open', 'close']) {
      // згортання знімаємо з розгорнутого стану (після фази open картка розгорнута): один toggle = анімація згортання
      if (dir === 'close') { const isOpen = await page.evaluate(() => document.getElementById('bal-card').classList.contains('open')); if (!isOpen) throw new Error('перед згортанням картка має бути розгорнутою'); }
      await page.evaluate(() => { toggleBalanceCard(); });
      await page.evaluate(() => { document.getAnimations().forEach(a => a.pause()); });
      for (const pr of STEPS) {
        await page.evaluate(p => { document.getAnimations().forEach(a => { const t = a.effect && a.effect.getComputedTiming ? 320 * p / 100 : 0; a.currentTime = t; }); }, pr);
        await page.waitForTimeout(60);
        await page.screenshot({ path: path.join(DIR, 'flip-' + dir + '-' + theme + '-' + String(pr).padStart(3, '0') + '.png'), clip, fullPage: true });
      }
      await page.evaluate(() => { document.getAnimations().forEach(a => { try { a.finish(); } catch (e) {} }); });
      await page.waitForTimeout(500);
    }
    await ctx.close();
  }
  // перевірка: кадри розгортання й згортання різні (раніше збігалися побайтово)
  const crypto = require('crypto');
  for (const theme of ['dark', 'light']) for (const pr of STEPS.slice(1, -1)) {
    const h = d => crypto.createHash('md5').update(fs.readFileSync(path.join(DIR, 'flip-' + d + '-' + theme + '-' + String(pr).padStart(3, '0') + '.png'))).digest('hex');
    if (h('open') === h('close')) throw new Error('кадри open і close збігаються: ' + theme + ' ' + pr);
  }
  // контактні аркуші: один PNG на тему й напрям (6 кадрів у ряд)
  const page = await browser.newPage({ viewport: { width: 1240, height: 400 } });
  for (const theme of ['dark', 'light']) for (const dir of ['open', 'close']) {
    const imgs = STEPS.map(pr => 'data:image/png;base64,' + fs.readFileSync(path.join(DIR, 'flip-' + dir + '-' + theme + '-' + String(pr).padStart(3, '0') + '.png')).toString('base64'));
    const bg = theme === 'dark' ? '#0B0F17' : '#F4F6FA', fg = theme === 'dark' ? '#cbd5e1' : '#334155';
    await page.setContent('<body style="margin:0;background:' + bg + ';font:12px system-ui;color:' + fg + '"><div style="display:flex;gap:8px;padding:8px">' + imgs.map((s, i) => '<div style="width:200px"><div style="padding:0 0 4px">' + STEPS[i] + ' %</div><img src="' + s + '" style="width:200px;display:block"></div>').join('') + '</div></body>');
    await page.waitForTimeout(300);
    const h = await page.evaluate(() => document.body.scrollHeight);
    await page.setViewportSize({ width: 1240, height: h });
    await page.screenshot({ path: path.join(DIR, 'flip-contact-' + dir + '-' + theme + '.png') });
  }
});
