// Rev 2.32.363 (DS-3b5): «+» на «Витратах»: вхід і вихід з однаковою тривалістю й кривою, кільце згасає разом із поворотом, переривання без стрибка. Дотик (hasTouch), кут «+» по кадрах.
const { test, expect } = require('@playwright/test');
const { installClock } = require('./clock');
test.use({ hasTouch: true });
async function boot(page){
  await installClock(page); await page.goto('/index.html?fixture=typical');
  await page.waitForFunction(() => window.MockCloud && typeof cloudSession !== 'undefined' && cloudSession && cloudSession.user && document.querySelector('.tabbar-glass'));
  await page.waitForTimeout(1500);
}
const tapTab = async (page, tab) => { await page.evaluate(async (t) => { const btn = document.querySelector('nav.tabbar button[data-tab="' + t + '"]'), r = btn.getBoundingClientRect(); const mk = (type) => { const ev = new Event(type, { bubbles: true, cancelable: true }); const p = { identifier: 1, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2, target: btn }; ev.touches = type === 'touchend' ? [] : [p]; ev.changedTouches = [p]; return ev; }; btn.dispatchEvent(mk('touchstart')); await new Promise(x => setTimeout(x, 40)); btn.dispatchEvent(mk('touchend')); }, tab); };
// записує кут «+», кільце (box-shadow) і час кожного кадру ms мс
const record = (page, ms) => page.evaluate((ms) => new Promise((res) => { const out = []; const w = document.querySelector('nav.tabbar .tb-icon-wrap'), s = w.querySelector('svg'); let t0 = null; (function f(ts){ if(t0 === null) t0 = ts; const cs = getComputedStyle(s).transform; const m = new DOMMatrix(cs === 'none' ? undefined : cs); out.push({ t: ts - t0, a: Math.atan2(m.b, m.a) * 180 / Math.PI, ring: +getComputedStyle(w, '::after').opacity }); if(ts - t0 < ms) requestAnimationFrame(f); else res(out); })(performance.now()); }), ms);
// крок кута, приведений до кадру 16,7 мс (rAF у headless інколи 20–25 мс)
const stepMax = (fr) => { let mx = 0; for (let i = 1; i < fr.length; i++){ const dt = Math.max(1, fr[i].t - fr[i - 1].t); mx = Math.max(mx, Math.abs(fr[i].a - fr[i - 1].a) * 16.7 / Math.max(dt, 16.7)); } return Math.round(mx * 10) / 10; };
test('62. вихід з «Витрат» на кожну з чотирьох вкладок (дотик): кут «+» 90→0 плавно (≤ 30° між кадрами), кільце згасає разом із поворотом (opacity 1→0, не зникає миттєво)', async ({ page }) => {
  test.setTimeout(120000);
  await boot(page);
  for (const to of ['accounting', 'analytics', 'structure', 'service']){
    await page.evaluate(() => switchTab('vytraty', { noFocus: true })); await page.waitForTimeout(1000);
    expect(await page.evaluate(() => +getComputedStyle(document.querySelector('nav.tabbar .tb-icon-wrap'), '::after').opacity), 'на «Витратах» є кільце').toBe(1);
    const rec = record(page, 800); await tapTab(page, to); const fr = await rec;
    expect(Math.round(fr[0].a), to + ': старт 90°').toBe(90);
    expect(Math.round(fr[fr.length - 1].a), to + ': кінець 0°').toBe(0);
    expect(stepMax(fr), to + ': найбільший крок між кадрами, °').toBeLessThanOrEqual(30);
    for (let i = 1; i < fr.length; i++) expect(fr[i].a, to + ': кут не росте').toBeLessThanOrEqual(fr[i - 1].a + 0.5);
    // кільце: у проміжних кадрах поворту непрозорість між 0 і 1 (згасає, а не зникає миттєво) і не росте
    const mid = fr.filter(f => f.a > 5 && f.a < 85);
    expect(mid.some(f => f.ring > 0.02 && f.ring < 0.98), to + ': кільце згасає разом із поворотом').toBe(true);
    for (let i = 1; i < fr.length; i++) expect(fr[i].ring, to + ': кільце не з\'являється назад').toBeLessThanOrEqual(fr[i - 1].ring + 0.01);
    expect(fr[fr.length - 1].ring, to + ': кільця немає в кінці').toBe(0);
  }
});
test('63. вхід і вихід однакові: та сама тривалість і крива для повороту «+» і кільця в обох станах', async ({ page }) => {
  await boot(page);
  const read = () => page.evaluate(() => { const w = document.querySelector('nav.tabbar .tb-icon-wrap'), s = w.querySelector('svg'); const f = (c) => ({ p: c.transitionProperty, d: c.transitionDuration, e: c.transitionTimingFunction }); return { svg: f(getComputedStyle(s)), ring: f(getComputedStyle(w, '::after')) }; });
  await page.evaluate(() => switchTab('accounting')); await page.waitForTimeout(700); const off = await read();
  await page.evaluate(() => switchTab('vytraty', { noFocus: true })); await page.waitForTimeout(900); const on = await read();
  expect(on, 'тривалість і крива в станах «вибрана» / «не вибрана» однакові').toEqual(off);
  expect(on.svg.d).toBe('0.48s'); expect(on.svg.e).toBe('cubic-bezier(0.22, 1, 0.36, 1)');
  expect(on.ring).toEqual({ p: 'opacity', d: '0.48s', e: 'cubic-bezier(0.22, 1, 0.36, 1)' }); // кільце: та сама тривалість і крива, що й поворот; лише opacity
});
test('64. швидка серія «Витрати → Облік → Витрати» (перемикання до завершення): кут не стрибає (≤ 30° між кадрами) і приходить до 90°', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => switchTab('vytraty', { noFocus: true })); await page.waitForTimeout(1000);
  for (const gap of [60, 120, 200]){
    const rec = record(page, 1100);
    await tapTab(page, 'accounting'); await page.waitForTimeout(gap); await page.evaluate(() => switchTab('vytraty', { noFocus: true })); // без автофокусу: інакше відкривається клавіатура й таббар ховається (display:none)
    const fr = await rec;
    expect(stepMax(fr), 'перерване повернення (' + gap + ' мс): крок між кадрами, °').toBeLessThanOrEqual(30);
    expect(Math.round(fr[fr.length - 1].a), 'повернувся на 90°').toBe(90);
    await page.waitForTimeout(300);
  }
});
test('65. «зменшити рух»: без змін — поворот і кільце без переходу', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await boot(page);
  const d = await page.evaluate(() => { const w = document.querySelector('nav.tabbar .tb-icon-wrap'), s = w.querySelector('svg'); return { svg: getComputedStyle(s).transitionDuration, ring: getComputedStyle(w, '::after').transitionDuration }; });
  expect(d.svg).toMatch(/^0(\.0[0-8])?s/); expect(d.ring).toMatch(/^0(\.0[0-8])?s/);
});
