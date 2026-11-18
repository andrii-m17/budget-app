// Rev 2.32.365 (DS-3f): капсула «Аналітика · місяць · залишок» при прокрутці: поява біля 150 pt, дотик нагору, вміст для місяців, інші вкладки, клавіатура/шторка, reduced-motion, зона дотику, iPad
const { test, expect } = require('@playwright/test');
const { installClock } = require('./clock');
test.use({ hasTouch: true });
async function boot(page, o){
  o = o || {};
  await page.setViewportSize({ width: o.w || 390, height: o.h || 844 }); await installClock(page);
  await page.goto('/index.html?fixture=' + (o.fixture || 'large'));
  await page.waitForFunction(() => window.MockCloud && typeof cloudSession !== 'undefined' && cloudSession && cloudSession.user && document.querySelector('.tabbar-glass'));
  await page.waitForTimeout(1500);
  if(o.tab) { await page.evaluate((t) => switchTab(t, { noFocus: true }), o.tab); await page.waitForTimeout(900); }
}
const scrollTo = async (page, y) => { await page.evaluate((y) => { document.getElementById('main-col').scrollTop = y; }, y); await page.waitForTimeout(200); };
const on = (page) => page.evaluate(() => document.getElementById('mini-head').classList.contains('on'));
const stb = (page) => page.evaluate(() => document.getElementById('scroll-top-btn').classList.contains('visible'));
const txt = (page) => page.evaluate(() => document.getElementById('mini-head').innerText.replace(/\s+/g, ' ').trim());
const maxY = (page) => page.evaluate(() => { const e = document.getElementById('main-col'); return e.scrollHeight - e.clientHeight; });
test('77. поява й зникнення біля 150 pt; на «Аналітиці» дві кнопки одночасно не показуються', async ({ page }) => {
  await boot(page);
  expect(await maxY(page), 'довга «Аналітика»').toBeGreaterThan(400);
  await scrollTo(page, 100); expect(await on(page)).toBe(false);
  await scrollTo(page, 160); expect(await on(page), '160 > 150').toBe(true);
  await scrollTo(page, 300); expect(await on(page)).toBe(true); expect(await stb(page), 'кнопки «вгору» немає (капсула замінює), навіть понад 240').toBe(false);
  await scrollTo(page, 149); expect(await on(page), '149 < 150 — ховається').toBe(false);
  await scrollTo(page, 151); expect(await on(page)).toBe(true);
  await scrollTo(page, 0); expect(await on(page)).toBe(false);
});
test('78. дотик по капсулі плавно прокручує нагору; сама капсула закріплена (не їде зі сторінкою)', async ({ page }) => {
  await boot(page);
  await scrollTo(page, 400); expect(await on(page)).toBe(true);
  const r1 = await page.locator('#mini-head').boundingBox(); await scrollTo(page, 500); const r2 = await page.locator('#mini-head').boundingBox();
  expect(Math.abs(r1.y - r2.y), 'закріплена').toBeLessThan(0.5);
  await page.touchscreen.tap(r2.x + r2.width / 2, r2.y + r2.height / 2);
  await page.waitForTimeout(150); const mid = await page.evaluate(() => document.getElementById('main-col').scrollTop); expect(mid, 'прокрутка плавна, ще не на місці').toBeGreaterThan(0);
  await page.waitForTimeout(900); expect(await page.evaluate(() => document.getElementById('main-col').scrollTop), 'нагорі').toBe(0);
  expect(await on(page)).toBe(false);
});
test('79. вміст: «Аналітика · місяць · залишок» для поточного, минулого, наступного місяця й минулого року; залишок = «Баланс» Аналітики', async ({ page }) => {
  test.setTimeout(120000);
  await boot(page);
  const check = async (label, setup) => {
    await scrollTo(page, 0); await page.evaluate(setup); await page.waitForTimeout(2500);
    await scrollTo(page, 400); expect(await on(page), label).toBe(true);
    const exp = await page.evaluate(() => ({ m: monthShortName(selectedMonth, monthKey(localDateISO())), bal: document.getElementById('kpi-savings').textContent.replace(/[\s\u00a0\u202f]+/g, ' ').trim() }));
    const s = (await txt(page)).replace(/[\s\u00a0\u202f]+/g, ' ');
    expect(s, label).toBe('Аналітика · ' + exp.m + ' · ' + exp.bal);
    return exp;
  };
  const cur = await check('поточний', () => onMonthChange(monthKey(localDateISO())));
  expect(cur.m).not.toMatch(/\d{4}/);
  await check('минулий', () => onMonthChange(shiftMonth(monthKey(localDateISO()), -1)));
  await check('наступний', () => onMonthChange(shiftMonth(monthKey(localDateISO()), 1)));
  const py = await check('минулий рік', () => onMonthChange(shiftMonth(monthKey(localDateISO()), -12)));
  expect(py.m, 'рік на капсулі, як на пігулці').toMatch(/\d{4}$/);
  // оновлюється при зміні місяця, поки капсула видима
  const before = await txt(page); await page.evaluate(() => onMonthChange(monthKey(localDateISO()))); await page.waitForTimeout(2500); expect(await txt(page)).not.toBe(before);
  // цілі гривні й формат застосунку
  expect(await page.evaluate(() => document.getElementById('mini-head-bal').textContent)).toMatch(/^-?[\d\s  ]+ ₴$|^—$/);
});
test('80. на інших вкладках капсули немає, лишається кнопка «вгору»', async ({ page }) => {
  await boot(page, { tab: 'structure' });
  await scrollTo(page, 500); expect(await on(page), 'капсули немає').toBe(false); expect(await stb(page), 'кнопка «вгору» є').toBe(true);
  await page.evaluate(() => switchTab('analytics', { noFocus: true })); await page.waitForTimeout(900); await scrollTo(page, 500);
  expect(await on(page)).toBe(true); expect(await stb(page)).toBe(false);
  await page.evaluate(() => switchTab('accounting', { noFocus: true })); await page.waitForTimeout(900); expect(await on(page), 'при зміні вкладки капсула ховається').toBe(false);
});
test('81. клавіатура й шторка ховають капсулу; коротка сторінка — не показується', async ({ page }) => {
  await boot(page);
  await scrollTo(page, 400); expect(await on(page)).toBe(true);
  await page.evaluate(() => document.body.classList.add('kb-open')); await page.waitForTimeout(200); expect(await on(page), 'клавіатура').toBe(false);
  await page.evaluate(() => document.body.classList.remove('kb-open')); await page.waitForTimeout(200); expect(await on(page), 'після закриття клавіатури').toBe(true);
  await page.evaluate(() => { const d = document.createElement('div'); d.className = 'drawer'; d.id = 'zz-fake'; document.body.appendChild(d); document.getElementById('zz-fake').classList.add('open'); }); await page.waitForTimeout(200); expect(await on(page), 'шторка').toBe(false);
  await page.evaluate(() => document.getElementById('zz-fake').classList.remove('open')); await page.waitForTimeout(200); expect(await on(page), 'після закриття шторки').toBe(true);
});
test('82. коротка сторінка: капсула не показується', async ({ page }) => {
  await boot(page, { fixture: 'empty' });
  await page.evaluate(() => { document.getElementById('main-col').dispatchEvent(new Event('scroll')); }); await page.waitForTimeout(200);
  expect(await on(page)).toBe(false);
  expect(await maxY(page)).toBeLessThan(151);
});
test('83. «зменшити рух»: без переходу, дотик прокручує миттєво', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await boot(page);
  await scrollTo(page, 400); expect(await on(page)).toBe(true);
  expect(await page.evaluate(() => getComputedStyle(document.getElementById('mini-head')).transitionDuration)).toMatch(/^0(\.0[0-8])?s/);
  const r = await page.locator('#mini-head').boundingBox(); await page.touchscreen.tap(r.x + r.width / 2, r.y + r.height / 2);
  await page.waitForTimeout(150); expect(await page.evaluate(() => document.getElementById('main-col').scrollTop), 'миттєво нагорі').toBe(0);
});
test('84. розміри й положення: h40, зона дотику ≥ 44, по центру під safe-area; backdrop-filter лише коли видима; aria', async ({ page }) => {
  await boot(page);
  expect(await page.evaluate(() => getComputedStyle(document.getElementById('mini-head')).backdropFilter), 'прихована без розмиття').toMatch(/^(none|)$/);
  await scrollTo(page, 400); await page.waitForTimeout(500);
  const m = await page.evaluate(() => { const e = document.getElementById('mini-head'), r = e.getBoundingClientRect(), a = getComputedStyle(e, '::after'); const cs = getComputedStyle(e); return { h: r.height, cx: r.x + r.width / 2, top: r.y, hit: r.height + Math.abs(parseFloat(a.top)) + Math.abs(parseFloat(a.bottom)), bf: cs.backdropFilter, radius: cs.borderTopLeftRadius, padL: cs.paddingLeft, label: e.getAttribute('aria-label'), hidden: e.getAttribute('aria-hidden'), fs: cs.fontSize }; });
  expect(m.h).toBe(40); expect(Math.abs(m.cx - 195)).toBeLessThan(1); expect(m.top).toBeGreaterThanOrEqual(10); expect(m.hit, 'зона дотику').toBeGreaterThanOrEqual(44);
  expect(m.bf).toMatch(/blur\(24px\)/);
  // щільність фону: альфа ≥ .9 в обох темах (--glass-press), цифри під капсулою не просвічують
  for (const th of ['light', 'dark']){ await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), th); await page.waitForTimeout(200); const al = await page.evaluate(() => { const c = getComputedStyle(document.getElementById('mini-head')).backgroundColor.match(/[\d.]+/g).map(Number); return c.length > 3 ? c[3] : 1; }); expect(al, th + ': непрозорість фону капсули').toBeGreaterThanOrEqual(0.9); } expect(m.padL).toBe('16px'); expect(Number.parseFloat(m.radius)).toBeGreaterThan(19); expect(m.label).toBe('Повернутися нагору'); expect(m.hidden).toBe('false');
});
test('85. 1280 пт (бічна панель): капсула по центру основної колонки', async ({ page }) => {
  await boot(page, { w: 1280, h: 800 });
  await scrollTo(page, 400); await page.waitForTimeout(400); expect(await on(page)).toBe(true);
  const m = await page.evaluate(() => { const r = document.getElementById('mini-head').getBoundingClientRect(), side = document.querySelector('.side-panel').getBoundingClientRect(), main = document.getElementById('main-col').getBoundingClientRect(); return { cx: r.x + r.width / 2, left: r.x, sideRight: side.right, mainCx: main.x + main.width / 2 }; });
  expect(m.left, 'не заходить на бічну панель').toBeGreaterThan(m.sideRight);
  expect(Math.abs(m.cx - m.mainCx), 'біля центру основної колонки').toBeLessThan(80);
});
