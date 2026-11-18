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
const record = (page, ms) => page.evaluate((ms) => new Promise((res) => { const out = []; const w = document.querySelector('nav.tabbar .tb-icon-wrap'), s = w.querySelector('svg'); let t0 = null; (function f(ts){ if(t0 === null) t0 = ts; const cs = getComputedStyle(s).transform; const m = new DOMMatrix(cs === 'none' ? undefined : cs); out.push({ t: ts - t0, a: Math.atan2(m.b, m.a) * 180 / Math.PI, ring: +getComputedStyle(w, '::after').opacity, sc: (() => { const v = getComputedStyle(w).scale; return v === 'none' ? 1 : parseFloat(v); })() }); if(ts - t0 < ms) requestAnimationFrame(f); else res(out); })(performance.now()); }), ms);
// крок кута, приведений до кадру 16,7 мс (rAF у headless інколи 20–25 мс)
const stepMax = (fr) => { let mx = 0; for (let i = 1; i < fr.length; i++){ const dt = Math.max(1, fr[i].t - fr[i - 1].t); mx = Math.max(mx, Math.abs(fr[i].a - fr[i - 1].a) * 16.7 / Math.max(dt, 16.7)); } return Math.round(mx * 10) / 10; };
test('62. вихід з «Витрат» на кожну з чотирьох вкладок (дотик): ≈ 900 мс, кут «+» 90→0 без кроку понад 30° між кадрами, стиснення до .9 і назад, кільце згасає до кінця', async ({ page }) => {
  test.setTimeout(150000);
  await boot(page);
  await tapTab(page, 'accounting'); await page.waitForTimeout(500); // перший жест вмикає анімації
  for (const to of ['accounting', 'analytics', 'structure', 'service']){
    await page.evaluate(() => switchTab('vytraty', { noFocus: true })); await page.waitForTimeout(1200);
    expect(await page.evaluate(() => +getComputedStyle(document.querySelector('nav.tabbar .tb-icon-wrap'), '::after').opacity), 'на «Витратах» є кільце').toBe(1);
    const rec = record(page, 1400); await tapTab(page, to); const fr = await rec;
    expect(Math.round(fr[0].a), to + ': старт 90°').toBe(90);
    expect(Math.round(fr[fr.length - 1].a), to + ': кінець 0°').toBe(0);
    expect(stepMax(fr), to + ': найбільший крок між кадрами, °').toBeLessThanOrEqual(30);
    for (let i = 1; i < fr.length; i++) expect(fr[i].a, to + ': кут не росте').toBeLessThanOrEqual(fr[i - 1].a + 0.5);
    // тривалість ≈ 900 мс: від початку руху (кут < 89,5°) до кінця (кут < 0,5°)
    const t0 = fr.find(f => f.a < 89.5).t, t1 = fr.find(f => f.a < 0.5).t;
    expect(t1 - t0, to + ': тривалість виходу, мс').toBeGreaterThan(700); expect(t1 - t0, to + ': тривалість виходу, мс').toBeLessThan(1000);
    // стиснення: 1 → .9 → 1
    const mn = Math.min(...fr.map(f => f.sc)); expect(mn, to + ': стиснення до .9').toBeLessThanOrEqual(0.915); expect(mn).toBeGreaterThan(0.85);
    expect(fr[fr.length - 1].sc, to + ': назад до 1').toBeCloseTo(1, 2);
    // кільце: згасає в тому ж темпі (проміжні значення впродовж виходу), не росте, у кінці 0
    expect(fr.filter(f => f.a > 5 && f.a < 85).some(f => f.ring > 0.02 && f.ring < 0.98), to + ': кільце згасає разом із поворотом').toBe(true);
    for (let i = 1; i < fr.length; i++) expect(fr[i].ring, to + ': кільце не з\'являється назад').toBeLessThanOrEqual(fr[i - 1].ring + 0.01);
    expect(fr[fr.length - 1].ring, to + ': кільця немає в кінці').toBe(0);
  }
});
test('63. вихід повільний (900 мс, стандартна крива), вхід і решта без змін (480 мс, --ease-out); ті самі змінні для кільця', async ({ page }) => {
  await boot(page);
  const read = () => page.evaluate(() => { const w = document.querySelector('nav.tabbar .tb-icon-wrap'), s = w.querySelector('svg'); const f = (c) => ({ p: c.transitionProperty, d: c.transitionDuration, e: c.transitionTimingFunction }); const nav = getComputedStyle(document.querySelector('nav.tabbar')); return { svg: f(getComputedStyle(s)), ring: f(getComputedStyle(w, '::after')), vars: [nav.getPropertyValue('--tb-plus-out').trim(), nav.getPropertyValue('--tb-plus-sq').trim()] }; });
  await page.evaluate(() => switchTab('accounting')); await page.waitForTimeout(700); const off = await read();
  await page.evaluate(() => switchTab('vytraty', { noFocus: true })); await page.waitForTimeout(1200); const on = await read();
  expect(off.vars, 'темп і стиснення — змінні').toEqual(['900ms', '.9']);
  expect(off.svg).toEqual({ p: 'transform', d: '0.9s', e: 'cubic-bezier(0.4, 0, 0.2, 1)' }); expect(off.ring).toEqual({ p: 'opacity', d: '0.9s', e: 'cubic-bezier(0.4, 0, 0.2, 1)' });
  expect(on.svg, 'вхід без змін').toEqual({ p: 'transform', d: '0.48s', e: 'cubic-bezier(0.22, 1, 0.36, 1)' }); expect(on.ring, 'вхід кільця без змін').toEqual({ p: 'opacity', d: '0.48s', e: 'cubic-bezier(0.22, 1, 0.36, 1)' });
});
test('64. швидка серія «Витрати → Облік → Витрати» (перемикання до завершення): кут не стрибає (≤ 30° між кадрами) і приходить до 90°', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => switchTab('vytraty', { noFocus: true })); await page.waitForTimeout(1000);
  for (const gap of [60, 120, 200]){
    const rec = record(page, 1500);
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
  await page.evaluate(() => switchTab('vytraty', { noFocus: true })); await page.waitForTimeout(300);
  const a = await page.evaluate(() => { const w = document.querySelector('nav.tabbar .tb-icon-wrap'); return { svg: getComputedStyle(w.querySelector('svg')).transitionDuration, ring: getComputedStyle(w, '::after').transitionDuration }; });
  expect(a.svg).toMatch(/^0(\.0[0-8])?s/); expect(a.ring).toMatch(/^0(\.0[0-8])?s/);
  await page.evaluate(() => switchTab('accounting')); await page.waitForTimeout(100);
  expect(await page.locator('nav.tabbar button.tab-out, nav.tabbar button.tb-out').count(), 'у reduced-motion стиснення «+» не запускається').toBe(0);
});

// Лічильник витрат за сьогодні — завжди поверх кільця й світіння «+»: у вибраному й невибраному стані, під час анімації, у стисненому таббарі, обидві теми
const badgeTop = (page) => page.evaluate(() => {
  const w = document.querySelector('nav.tabbar .tb-icon-wrap'), b = w.querySelector('.tb-count-badge'); if(!b || b.classList.contains('hidden')) return { none: true };
  const st = document.createElement('style'); st.textContent = 'nav.tabbar .tb-icon-wrap::after{pointer-events:auto!important}'; document.head.appendChild(st); // псевдоелемент кільця робимо «влучним»: elementFromPoint віддасть його власника .tb-icon-wrap
  const r = b.getBoundingClientRect(), wr = w.getBoundingClientRect(); const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); st.remove();
  return { onTop: !!(hit && hit.closest('.tb-count-badge')), hitCls: hit && (hit.className || hit.tagName), w: Math.round(r.width * 10) / 10, h: r.height, dTop: Math.round((r.top - wr.top) * 10) / 10, dRight: Math.round((r.right - wr.right) * 10) / 10 };
});
test('66. лічильник над «+»: верхній елемент у центрі лічильника — сам лічильник у всіх станах (вибрана/невибрана, під час виходу й входу, стиснутий таббар, обидві теми); розмір і місце не змінились', async ({ page }) => {
  test.setTimeout(150000);
  await boot(page);
  await tapTab(page, 'accounting'); await page.waitForTimeout(500);
  for (const theme of ['light', 'dark']){
    await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme); await page.waitForTimeout(200);
    const states = [];
    await page.evaluate(() => switchTab('accounting', { noFocus: true })); await page.waitForTimeout(1200); states.push(['невибрана', await badgeTop(page)]);
    await page.evaluate(() => switchTab('vytraty', { noFocus: true })); await page.waitForTimeout(150); states.push(['під час входу', await badgeTop(page)]); await page.waitForTimeout(1000); states.push(['вибрана (кільце)', await badgeTop(page)]);
    await tapTab(page, 'accounting'); await page.waitForTimeout(300); states.push(['під час виходу', await badgeTop(page)]); await page.waitForTimeout(1200);
    await page.evaluate(() => switchTab('vytraty', { noFocus: true })); await page.waitForTimeout(1200);
    await page.evaluate(() => { document.querySelector('nav.tabbar').classList.add('mini'); }); await page.waitForTimeout(700); states.push(['стиснений таббар', await badgeTop(page)]);
    await page.evaluate(() => { document.querySelector('nav.tabbar').classList.remove('mini'); });
    for (const [name, s] of states){
      expect(s.none, theme + ' ' + name + ': лічильник видно (у фікстурі є витрати за сьогодні)').toBeFalsy(); expect(s.onTop, theme + ' ' + name + ': верхній елемент — лічильник, а не ' + s.hitCls).toBe(true);
      if(name === 'під час виходу' || name === 'стиснений таббар') continue; // кнопка «+» разом із лічильником стискається (.9 при виході; .8 × .9 у стиснутому таббарі) — розмір/місце перевіряємо в решті станів
      expect(s.h, theme + ' ' + name + ': висота лічильника').toBe(16); expect(s.w).toBeGreaterThanOrEqual(16); expect(s.dTop, 'зсув зверху −2').toBe(-2); expect(s.dRight, 'зсув праворуч +2').toBe(2);
    }
  }
});
