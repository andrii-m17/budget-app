// Rev 2.32.361 (DS-3b4): скло таббару лише при свайпі; іконки 22 px, «+» 44 px; колір вибраного; зони дотику, підписи, бульбашка на 320/390/430; контраст ≥ 3:1
const { test, expect } = require('@playwright/test');
const { installClock } = require('./clock');
test.use({ hasTouch: true });
async function boot(page, w){
  await page.setViewportSize({ width: w || 390, height: 844 }); await installClock(page);
  await page.goto('/index.html?fixture=typical');
  await page.waitForFunction(() => window.MockCloud && typeof cloudSession !== 'undefined' && cloudSession && cloudSession.user && document.querySelector('.tabbar-glass'));
  await page.waitForTimeout(1200);
}
// стан скла й класів у цей момент
const snap = (page) => page.evaluate(() => { const bar = document.querySelector('nav.tabbar'), g = document.getElementById('tabbar-glass'); const r = g.getBoundingClientRect(); return { pressed: bar.classList.contains('pressed'), down: bar.classList.contains('tb-down'), w: Math.round(r.width * 100) / 100, h: Math.round(r.height * 100) / 100, tf: getComputedStyle(g).transform, bscale: getComputedStyle(document.getElementById('tabbar-bubble')).getPropertyValue('--bubble-scale').trim(), shimmer: getComputedStyle(document.getElementById('tabbar-bubble'), '::before').animationName }; });
const touch = (page, type, x, y) => page.evaluate(([type, x, y]) => { const bar = document.querySelector('nav.tabbar'); const ev = new Event(type, { bubbles: true, cancelable: true }); const t = { identifier: 1, clientX: x, clientY: y, target: bar }; ev.touches = type === 'touchend' ? [] : [t]; ev.changedTouches = [t]; (document.elementFromPoint(x, y) || bar).dispatchEvent(ev); }, [type, x, y]);
const center = (page, tab) => page.evaluate((t) => { const r = document.querySelector('nav.tabbar button[data-tab="' + t + '"]').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }, tab);
test('58. простий дотик: скло не збільшується, блиск не біжить, класу .pressed немає (є лише .tb-down); після дотику все чисто', async ({ page }) => {
  await boot(page);
  const rest = await snap(page); expect(rest.pressed).toBe(false); expect(rest.down).toBe(false);
  const c = await center(page, 'structure');
  await touch(page, 'touchstart', c.x, c.y); await page.waitForTimeout(450); // довше за колишні .22 с збільшення
  let s = await snap(page);
  expect(s.pressed, 'дотик без руху не вмикає .pressed').toBe(false); expect(s.down, 'палець на таббарі').toBe(true);
  expect(s.w, 'скло не збільшилось').toBe(rest.w); expect(s.h).toBe(rest.h); expect(s.bscale, 'бульбашка не збільшується').toBe('1'); expect(s.shimmer, 'блиск не біжить').not.toBe('tabbarBubbleShimmer');
  // дрібний зсув (менше порога 8 px) теж не змінює
  await touch(page, 'touchmove', c.x + 4, c.y); await page.waitForTimeout(100); s = await snap(page); expect(s.pressed).toBe(false);
  await touch(page, 'touchend', c.x + 4, c.y); await page.waitForTimeout(1200);
  s = await snap(page); expect(s.pressed).toBe(false); expect(s.down).toBe(false); expect(s.w).toBe(rest.w);
  expect(await page.evaluate(() => document.querySelector('nav.tabbar button.active').dataset.tab), 'вкладку перемкнуто').toBe('structure');
});
test('59. свайп: після порога руху скло збільшується й блищить; після відпускання повертається; перемикання як раніше', async ({ page }) => {
  await boot(page);
  const rest = await snap(page);
  const a = await center(page, 'accounting'), b = await center(page, 'service');
  await touch(page, 'touchstart', a.x, a.y); await page.waitForTimeout(80); expect((await snap(page)).pressed, 'до руху ефекту немає').toBe(false);
  for (let i = 1; i <= 6; i++){ await touch(page, 'touchmove', a.x + (b.x - a.x) * i / 6, a.y); await page.waitForTimeout(20); }
  await page.waitForTimeout(400);
  const s = await snap(page); expect(s.pressed, 'свайп вмикає .pressed').toBe(true); expect(s.w, 'скло збільшилось (≈ ×1,035)').toBeGreaterThan(rest.w * 1.02); expect(s.bscale).toBe('1.2'); expect(s.shimmer).toBe('tabbarBubbleShimmer');
  await touch(page, 'touchend', b.x, b.y); await page.waitForTimeout(1300);
  const e = await snap(page); expect(e.pressed).toBe(false); expect(e.down).toBe(false); expect(e.w, 'скло повернулось').toBe(rest.w);
  expect(await page.evaluate(() => document.querySelector('nav.tabbar button.active').dataset.tab), 'свайп перемикає вкладку').toBe('service');
});
test('60. розміри на 320/390/430 пт: іконки 22, «+» 44, зони дотику ≥ 44, підписи вміщуються, бульбашка в капсулі, висота капсули 75', async ({ page }) => {
  test.setTimeout(120000);
  for (const w of [320, 390, 430]){
    await boot(page, w);
    for (const tab of ['analytics', 'accounting', 'vytraty', 'structure', 'service']){
      await page.evaluate((t) => switchTab(t, { noFocus: true }), tab); await page.waitForTimeout(700);
      const m = await page.evaluate(() => {
        const g = document.getElementById('tabbar-glass'), gr = g.getBoundingClientRect(), r = (e) => { const b = e.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height }; };
        const bub = r(document.getElementById('tabbar-bubble'));
        return { glass: r(g), svgs: Array.from(g.querySelectorAll('button[data-tab] > .tbx > svg')).map(e => r(e)), wrapSvg: r(g.querySelector('.tb-icon-wrap svg')), wrap: r(g.querySelector('.tb-icon-wrap')), btns: Array.from(g.querySelectorAll('button[data-tab]')).map(b => ({ t: b.dataset.tab, ...r(b), lab: (() => { const x = b.querySelector('.lb'); const rng = document.createRange(); rng.selectNodeContents(x); return r(rng); })() })), bub, inside: bub.x >= gr.x - 0.5 && bub.x + bub.w <= gr.x + gr.width + 0.5 };
      });
      const id = w + ' ' + tab;
      expect(m.glass.h, id + ': висота капсули').toBe(75);
      m.svgs.forEach(s => { expect(Math.round(s.w), id + ': іконка').toBe(22); expect(Math.round(s.h)).toBe(22); });
      expect(Math.round(m.wrap.w), id + ': «+»').toBe(44); expect(Math.round(m.wrap.h)).toBe(44); expect(Math.round(m.wrapSvg.w)).toBe(22);
      m.btns.forEach(b => { expect(b.h, id + ' ' + b.t + ': зона дотику по висоті').toBeGreaterThanOrEqual(44); expect(b.w, id + ' ' + b.t + ': по ширині').toBeGreaterThanOrEqual(44); expect(b.lab.x, id + ' ' + b.t + ': підпис у межах кнопки (допуск 1,5 px на 320: «Структура» ширша за кнопку на ~1 px, як і до DS-3b4)').toBeGreaterThanOrEqual(b.x - 1.5); expect(b.lab.x + b.lab.w, id + ' ' + b.t + ': підпис не виходить за кнопку').toBeLessThanOrEqual(b.x + b.w + 1.5); expect(b.lab.x).toBeGreaterThanOrEqual(m.glass.x); expect(b.lab.x + b.lab.w, id + ' ' + b.t + ': підпис у межах капсули').toBeLessThanOrEqual(m.glass.x + m.glass.w); });
      for (let i = 1; i < m.btns.length; i++) expect(m.btns[i].lab.x - (m.btns[i - 1].lab.x + m.btns[i - 1].lab.w), id + ': підписи сусідніх вкладок не налазять').toBeGreaterThanOrEqual(1);
      expect(m.inside, id + ': бульбашка в капсулі').toBe(true);
    }
  }
});
test('61. контраст вибраної іконки до скла ≥ 3:1 в обох темах; колір вибраного = --accent-text', async ({ page }) => {
  await boot(page);
  for (const theme of ['light', 'dark']){
    await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme); await page.waitForTimeout(300);
    for (const tab of ['analytics', 'accounting', 'vytraty', 'structure', 'service']){
      await page.evaluate((t) => switchTab(t, { noFocus: true }), tab); await page.waitForTimeout(500);
      const r = await page.evaluate((t) => {
        const parse = (s) => { const m = s.match(/[\d.]+/g).map(Number); return { r: m[0], g: m[1], b: m[2], a: m.length > 3 ? m[3] : 1 }; };
        const lum = (c) => { const f = (v) => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }; return .2126 * f(c.r) + .7152 * f(c.g) + .0722 * f(c.b); };
        const hex = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim().replace('#', ''); const pg = { r: parseInt(hex.substr(0, 2), 16), g: parseInt(hex.substr(2, 2), 16), b: parseInt(hex.substr(4, 2), 16) };
        const gl = parse(getComputedStyle(document.getElementById('tabbar-glass')).backgroundColor); const bg = { r: gl.r * gl.a + pg.r * (1 - gl.a), g: gl.g * gl.a + pg.g * (1 - gl.a), b: gl.b * gl.a + pg.b * (1 - gl.a) };
        const b = document.querySelector('nav.tabbar button[data-tab="' + t + '"]'), fg = parse(getComputedStyle(b).color); const L1 = lum(fg), L2 = lum(bg);
        const probe = document.createElement('span'); probe.style.color = 'var(--accent-text)'; document.body.appendChild(probe); const at = getComputedStyle(probe).color; probe.remove();
        return { c: (Math.max(L1, L2) + .05) / (Math.min(L1, L2) + .05), color: getComputedStyle(b).color, at };
      }, tab);
      expect(r.c, theme + ' ' + tab + ' контраст').toBeGreaterThanOrEqual(3); expect(r.color, theme + ' ' + tab + ': колір вибраного').toBe(r.at);
      // невибрані (Rev 2.32.362): колір --text-2, контраст ≥ 4,5:1 (дрібний підпис 11 px)
      const other = await page.evaluate((t) => {
        const parse = (s) => { const m = s.match(/[\d.]+/g).map(Number); return { r: m[0], g: m[1], b: m[2], a: m.length > 3 ? m[3] : 1 }; };
        const lum = (c) => { const f = (v) => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }; return .2126 * f(c.r) + .7152 * f(c.g) + .0722 * f(c.b); };
        const hex = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim().replace('#', ''); const pg = { r: parseInt(hex.substr(0, 2), 16), g: parseInt(hex.substr(2, 2), 16), b: parseInt(hex.substr(4, 2), 16) };
        const gl = parse(getComputedStyle(document.getElementById('tabbar-glass')).backgroundColor); const bg = { r: gl.r * gl.a + pg.r * (1 - gl.a), g: gl.g * gl.a + pg.g * (1 - gl.a), b: gl.b * gl.a + pg.b * (1 - gl.a) };
        const b = Array.from(document.querySelectorAll('nav.tabbar button[data-tab]')).find(x => x.dataset.tab !== t && x.dataset.tab !== 'vytraty'), fg = parse(getComputedStyle(b).color);
        const probe = document.createElement('span'); probe.style.color = 'var(--text-2)'; document.body.appendChild(probe); const t2 = getComputedStyle(probe).color; probe.remove();
        const L1 = lum(fg), L2 = lum(bg); return { c: (Math.max(L1, L2) + .05) / (Math.min(L1, L2) + .05), color: getComputedStyle(b).color, t2: t2 };
      }, tab);
      expect(other.color, theme + ' ' + tab + ': колір невибраних = --text-2').toBe(other.t2); expect(other.c, theme + ' ' + tab + ': контраст невибраних').toBeGreaterThanOrEqual(4.5);
    }
  }
});
