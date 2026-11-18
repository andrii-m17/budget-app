// Rev 2.32.364 (DS-3c): стиснення таббару при прокрутці (.tabbar.mini): пороги, кінець, зміна вкладки, клавіатура, шторка, iPad, коротка сторінка, reduced-motion, дотик у стиснутому стані
const { test, expect } = require('@playwright/test');
const { installClock } = require('./clock');
test.use({ hasTouch: true });
async function boot(page, o){
  o = o || {};
  await page.setViewportSize({ width: o.w || 390, height: o.h || 844 }); await installClock(page);
  await page.goto('/index.html?fixture=' + (o.fixture || 'large'));
  await page.waitForFunction(() => window.MockCloud && typeof cloudSession !== 'undefined' && cloudSession && cloudSession.user && document.querySelector('.tabbar-glass'));
  await page.waitForTimeout(1200);
  if(o.tab) { await page.evaluate((t) => switchTab(t, { noFocus: true }), o.tab); await page.waitForTimeout(900); }
}
const mini = (page) => page.evaluate(() => document.querySelector('nav.tabbar').classList.contains('mini'));
const info = (page) => page.evaluate(() => { const el = document.getElementById('main-col'); return { max: el.scrollHeight - el.clientHeight, y: el.scrollTop }; });
// прокрутка до y: scrollTop міняє #main-col, слухач виконується через rAF
const scrollTo = async (page, y) => { await page.evaluate((y) => { document.getElementById('main-col').scrollTop = y; }, y); await page.waitForTimeout(140); };
const half = async (page) => Math.floor((await info(page)).max / 2);
const rec = (page) => page.evaluate(() => recBuf.filter(e => e.type === 'tab-mini').map(e => ({ mini: e.mini, why: e.why })));
test('66. пороги в обидва боки: > 24 від верху й крок вниз > 6 стискає; крок вгору > 6 розгортає; ≤ 6 — ні; ближче 24 до верху — розгортає', async ({ page }) => {
  await boot(page, { tab: 'structure' });
  const { max } = await info(page); expect(max, 'довга сторінка').toBeGreaterThan(400);
  await scrollTo(page, 10); expect(await mini(page), 'y=10 (< 24)').toBe(false);
  await scrollTo(page, 30); expect(await mini(page), 'y=30, крок 20 вниз від верхньої точки').toBe(true);
  await scrollTo(page, 100); expect(await mini(page)).toBe(true);
  await scrollTo(page, 95); expect(await mini(page), 'крок вгору 5 (≤ 6) — лишається').toBe(true);
  await scrollTo(page, 86); expect(await mini(page), 'крок вгору 9 від опорної 100 — розгорнути').toBe(false);
  await scrollTo(page, 90); expect(await mini(page), 'крок вниз 4 (≤ 6) — лишається розгорнутим').toBe(false);
  await scrollTo(page, 200); expect(await mini(page)).toBe(true);
  await scrollTo(page, 20); expect(await mini(page), 'ближче 24 до верху — розгорнути').toBe(false);
});
test('67. кінець сторінки (< 24 до кінця) розгортає; пружний відскок за межі не стискає', async ({ page }) => {
  await boot(page, { tab: 'structure' });
  const { max } = await info(page);
  await scrollTo(page, max - 300); expect(await mini(page)).toBe(true);
  await scrollTo(page, max - 10); expect(await mini(page), 'до кінця < 24 (рух вниз)').toBe(false);
  await scrollTo(page, max - 200); expect(await mini(page), 'рух угору розгортає').toBe(false);
  await scrollTo(page, max - 100); expect(await mini(page), 'знову вниз — стискає').toBe(true);
  await scrollTo(page, max); expect(await mini(page), 'у самому кінці').toBe(false);
  // відскок угорі: scrollTop поза діапазоном (негативний) → беремо межу 0 → верх: розгорнуто
  await scrollTo(page, 10); await scrollTo(page, 400); expect(await mini(page)).toBe(true);
  await page.evaluate(() => { const el = document.getElementById('main-col'); Object.defineProperty(el, 'scrollTop', { configurable: true, get: () => -30, set: () => {} }); el.dispatchEvent(new Event('scroll')); }); await page.waitForTimeout(140);
  expect(await mini(page), 'scrollTop < 0 (відскок угорі) = верх').toBe(false);
  await page.evaluate(() => { delete document.getElementById('main-col').scrollTop; });
  // відскок унизу: scrollTop > max → межа max → кінець
  await scrollTo(page, max - 300); expect(await mini(page)).toBe(true);
  await page.evaluate((m) => { const el = document.getElementById('main-col'); Object.defineProperty(el, 'scrollTop', { configurable: true, get: () => m + 40, set: () => {} }); el.dispatchEvent(new Event('scroll')); }, max); await page.waitForTimeout(140);
  expect(await mini(page), 'scrollTop > max (відскок унизу) = кінець').toBe(false);
  await page.evaluate(() => { delete document.getElementById('main-col').scrollTop; });
});
test('68. зміна вкладки розгортає таббар; дотик по таббару розгортає', async ({ page }) => {
  await boot(page, { tab: 'structure' });
  await scrollTo(page, await half(page)); expect(await mini(page)).toBe(true);
  await page.evaluate(() => switchTab('accounting', { noFocus: true })); await page.waitForTimeout(300); expect(await mini(page), 'зміна вкладки').toBe(false);
  await page.evaluate(() => switchTab('structure', { noFocus: true })); await page.waitForTimeout(700);
  await scrollTo(page, await half(page)); expect(await mini(page)).toBe(true);
  const r = await page.locator('nav.tabbar button[data-tab="service"]').boundingBox();
  await page.touchscreen.tap(r.x + r.width / 2, r.y + 4); await page.waitForTimeout(300);
  expect(await mini(page), 'дотик до таббару').toBe(false);
});
test('69. клавіатура відкрита: не стискається, а якщо вже стиснуто — розгортається', async ({ page }) => {
  await boot(page, { tab: 'structure' });
  await scrollTo(page, 300); expect(await mini(page)).toBe(true);
  const mx = (await info(page)).max;
  await page.evaluate(() => document.body.classList.add('kb-open')); await page.waitForTimeout(200); expect(await mini(page), 'kb-open розгортає').toBe(false);
  await scrollTo(page, 500); expect(await mini(page), 'при kb-open не стискається').toBe(false);
  await page.evaluate(() => document.body.classList.remove('kb-open')); await page.waitForTimeout(100); await scrollTo(page, Math.min(700, (await info(page)).max - 100)); expect(await mini(page), 'після закриття клавіатури знову стискається').toBe(true);
});
test('70. шторка відкрита: не стискається, а якщо вже стиснуто — розгортається', async ({ page }) => {
  await boot(page, { tab: 'structure' });
  await scrollTo(page, 300); expect(await mini(page)).toBe(true);
  await page.evaluate(() => { const d = document.createElement('div'); d.className = 'drawer'; d.id = 'zz-fake'; document.body.appendChild(d); });
  await page.evaluate(() => document.getElementById('zz-fake').classList.add('open')); await page.waitForTimeout(200); expect(await mini(page), 'шторка розгортає (клас .open)').toBe(false);
  await scrollTo(page, 500); expect(await mini(page), 'при відкритій шторці не стискається').toBe(false);
  await page.evaluate(() => document.getElementById('zz-fake').remove()); await scrollTo(page, Math.min(700, (await info(page)).max - 100)); expect(await mini(page)).toBe(true);
});
test('71. iPad/десктоп із бічною панеллю (1280 пт): таббар не стискається', async ({ page }) => {
  await boot(page, { w: 1280, h: 800, tab: 'structure' });
  expect(await page.locator('nav.tabbar').evaluate(e => getComputedStyle(e).display)).toBe('none');
  await scrollTo(page, 400); expect(await mini(page)).toBe(false);
});
test('72. коротка сторінка (коротша за екран): не стискається', async ({ page }) => {
  await boot(page, { fixture: 'empty', tab: 'service' });
  const i = await info(page);
  if(i.max <= 48){ await scrollTo(page, 30); expect(await mini(page)).toBe(false); }
  // примусово коротка: ховаємо вміст #main-col так, щоб max ≤ 48 (прокрутка неможлива) і шлемо scroll
  await page.evaluate(() => { document.getElementById('main-col').dispatchEvent(new Event('scroll')); }); await page.waitForTimeout(140);
  expect(await mini(page)).toBe(false);
});
test('73. «зменшити рух»: стиснення миттєве (без переходу)', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await boot(page, { tab: 'structure' });
  await scrollTo(page, 300); expect(await mini(page)).toBe(true);
  const d = await page.evaluate(() => ({ nav: getComputedStyle(document.querySelector('nav.tabbar')).transitionDuration, lb: getComputedStyle(document.querySelector('nav.tabbar .lb')).transitionDuration, svg: getComputedStyle(document.querySelector('nav.tabbar button[data-tab="analytics"] .tbx > svg')).transitionDuration }));
  for (const k of ['nav', 'lb', 'svg']) expect(d[k], k).toMatch(/^0(\.0[0-8])?s/);
});
test('74. зони дотику у стиснутому стані ≥ 44 пт по висоті (і по ширині) на 320/390/430; висота капсули й відступ знизу не змінюються', async ({ page }) => {
  test.setTimeout(120000);
  for (const w of [320, 390, 430]){
    await boot(page, { w, tab: 'structure' });
    const before = await page.evaluate(() => { const g = document.getElementById('tabbar-glass'), n = document.querySelector('nav.tabbar'); return { h: g.offsetHeight, bottom: getComputedStyle(n).bottom }; });
    await scrollTo(page, 500); expect(await mini(page)).toBe(true); await page.waitForTimeout(700);
    const m = await page.evaluate(() => ({ btns: Array.from(document.querySelectorAll('nav.tabbar button[data-tab]')).map(b => { const r = b.getBoundingClientRect(); return { t: b.dataset.tab, w: r.width, h: r.height }; }), h: document.getElementById('tabbar-glass').offsetHeight, bottom: getComputedStyle(document.querySelector('nav.tabbar')).bottom, lab: getComputedStyle(document.querySelector('nav.tabbar .lb')).opacity, tf: getComputedStyle(document.querySelector('nav.tabbar')).transform }));
    m.btns.forEach(b => { expect(b.h, w + ' ' + b.t + ': висота зони дотику').toBeGreaterThanOrEqual(44); expect(b.w, w + ' ' + b.t + ': ширина').toBeGreaterThanOrEqual(44); });
    expect(m.h, 'висота капсули (offsetHeight) не змінилась').toBe(before.h); expect(m.bottom).toBe(before.bottom); expect(m.lab, 'підписи сховано').toBe('0'); expect(m.tf).not.toBe('none');
  }
});
test('75. дотик пальцем по іконці в стиснутому стані перемикає вкладку, розгортає таббар і анімація іконки грає; свайп розгортає й працює як раніше', async ({ page }) => {
  await boot(page, { tab: 'structure' });
  await page.evaluate(() => { window.__anim = []; document.addEventListener('animationstart', (e) => { if(/^tb/.test(e.animationName)) window.__anim.push(e.animationName); }, true); });
  const sb = await page.locator('nav.tabbar button[data-tab="structure"]').boundingBox(); await page.touchscreen.tap(sb.x + sb.width / 2, sb.y + sb.height / 2); await page.waitForTimeout(800); // перший жест (повторний дотик по вибраній) вмикає анімації
  await scrollTo(page, await half(page)); expect(await mini(page)).toBe(true);
  await page.evaluate(() => { window.__anim = []; });
  const bb = await page.locator('nav.tabbar button[data-tab="accounting"]').boundingBox();
  await page.touchscreen.tap(bb.x + bb.width / 2, bb.y + bb.height / 2); await page.waitForTimeout(300);
  expect(await page.evaluate(() => document.querySelector('nav.tabbar button.active').dataset.tab), 'вкладку перемкнуто').toBe('accounting');
  expect(await mini(page), 'таббар розгорнуто').toBe(false);
  expect(await page.evaluate(() => window.__anim), 'анімація іконки грає').toContain('tbPress');
  // свайп у стиснутому стані
  await page.evaluate(() => switchTab('structure', { noFocus: true })); await page.waitForTimeout(700); await scrollTo(page, await half(page)); expect(await mini(page)).toBe(true);
  const a = await page.evaluate(() => { const r = document.querySelector('nav.tabbar button[data-tab="structure"]').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  const b2 = await page.evaluate(() => { const r = document.querySelector('nav.tabbar button[data-tab="service"]').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  await page.evaluate(async ([A, B]) => { const bar = document.querySelector('nav.tabbar'); const fire = (type, p) => { const ev = new Event(type, { bubbles: true, cancelable: true }); const t = { identifier: 1, clientX: p.x, clientY: p.y, target: bar }; ev.touches = type === 'touchend' ? [] : [t]; ev.changedTouches = [t]; (document.elementFromPoint(p.x, p.y) || bar).dispatchEvent(ev); }; fire('touchstart', A); for (let i = 1; i <= 6; i++){ await new Promise(r => setTimeout(r, 20)); fire('touchmove', { x: A.x + (B.x - A.x) * i / 6, y: A.y }); } window.__pressed = bar.classList.contains('pressed'); fire('touchend', B); }, [a, b2]);
  await page.waitForTimeout(700);
  expect(await page.evaluate(() => window.__pressed), 'свайп: ефект скла як зараз').toBe(true);
  expect(await page.evaluate(() => document.querySelector('nav.tabbar button.active').dataset.tab), 'свайп перемкнув вкладку').toBe('service');
  expect(await mini(page), 'свайп розгорнув таббар').toBe(false);
});
test('76. самописець: tab-mini записує лише зміну стану з причиною', async ({ page }) => {
  await boot(page, { tab: 'structure' });
  await page.evaluate(() => { recBuf.length = 0; });
  await scrollTo(page, 300); await scrollTo(page, 320); await scrollTo(page, 340); // стиснуто один раз, далі стан не міняється
  await scrollTo(page, 200); await scrollTo(page, 10); // розгорнуто (вгору), у верху стан не міняється
  await scrollTo(page, 300);
  await page.evaluate(() => switchTab('accounting', { noFocus: true })); await page.waitForTimeout(200);
  await page.evaluate(() => switchTab('structure', { noFocus: true })); await page.waitForTimeout(700);
  await scrollTo(page, 300); await page.evaluate(() => document.body.classList.add('kb-open')); await page.waitForTimeout(200); await page.evaluate(() => document.body.classList.remove('kb-open'));
  const ev = await rec(page);
  expect(ev.map(e => (e.mini ? 'on:' : 'off:') + e.why), JSON.stringify(ev)).toEqual(['on:down', 'off:up', 'on:down', 'off:tab', 'on:down', 'off:kb']);
});
