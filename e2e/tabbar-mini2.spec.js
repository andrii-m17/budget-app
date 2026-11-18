// Rev 2.32.367+ (DS-3c2): стиснення таббару — лише від прокрутки користувача; нижній край не нижчий за розгорнутий; «+» пропорційно; плавний перехід; запис byUser
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
const maxY = (page) => page.evaluate(() => { const e = document.getElementById('main-col'); return e.scrollHeight - e.clientHeight; });
// прокрутка користувача: палець по #main-col (touchstart → touchmove > 4 px → зміна scrollTop → touchend), як на iPhone
const userScroll = (page, y) => page.evaluate(async (y) => {
  const el = document.getElementById('main-col'); const mk = (type, dy) => { const ev = new Event(type, { bubbles: true, cancelable: true }); const p = { identifier: 7, clientX: 200, clientY: 400 + dy, target: el }; ev.touches = type === 'touchend' ? [] : [p]; ev.changedTouches = [p]; el.dispatchEvent(ev); };
  mk('touchstart', 0); mk('touchmove', -20); el.scrollTop = y; await new Promise(r => setTimeout(r, 120)); mk('touchend', -20); await new Promise(r => setTimeout(r, 120));
}, y);
// програмна прокрутка: scrollTop без жодного вводу користувача
const progScroll = async (page, y) => { await page.evaluate((y) => { document.getElementById('main-col').scrollTop = y; }, y); await page.waitForTimeout(250); };
const recMini = (page) => page.evaluate(() => recBuf.filter(e => e.type === 'tab-mini').map(e => ({ mini: e.mini, why: e.why, byUser: e.byUser })));
test('87. прокрутили вкладку вниз → перейшли на іншу → повернулись: таббар розгорнутий після кожного переходу і лишається таким без нової прокрутки; нова прокрутка користувача стискає', async ({ page }) => {
  test.setTimeout(120000);
  await boot(page, { tab: 'structure' });
  const y = Math.floor((await maxY(page)) / 2);
  await userScroll(page, y); expect(await mini(page), 'прокрутка користувача стискає').toBe(true);
  for (const to of ['accounting', 'structure', 'analytics', 'structure']){
    await page.evaluate((t) => switchTab(t, { noFocus: true }), to); await page.waitForTimeout(150); expect(await mini(page), '→ ' + to + ': розгорнуто').toBe(false);
    await page.waitForTimeout(1300); expect(await mini(page), '→ ' + to + ': і лишається розгорнутим (відновлення прокрутки не гортання)').toBe(false);
  }
  expect(await page.evaluate(() => document.getElementById('main-col').scrollTop), 'позицію відновлено').toBeGreaterThan(100);
  await userScroll(page, (await page.evaluate(() => document.getElementById('main-col').scrollTop)) + 120); expect(await mini(page), 'нове гортання вниз стискає').toBe(true);
});
test('88. програмна прокрутка («вгору», відновлення, scrollTo) таббар не стискає; колесо — стискає', async ({ page }) => {
  await boot(page, { tab: 'structure' });
  const mx = await maxY(page);
  await progScroll(page, Math.floor(mx / 2)); expect(await mini(page), 'scrollTop без вводу користувача').toBe(false);
  await progScroll(page, Math.floor(mx / 2) + 200); expect(await mini(page)).toBe(false);
  await page.evaluate(() => document.getElementById('main-col').scrollTo({ top: 600, behavior: 'smooth' })); await page.waitForTimeout(900); expect(await mini(page), 'плавна програмна прокрутка').toBe(false);
  await progScroll(page, 0);
  // колесо (у мобільному WebKit mouse.wheel недоступний): подія wheel на #main-col, далі зміна scrollTop
  await page.evaluate(() => { const el = document.getElementById('main-col'); el.dispatchEvent(new WheelEvent('wheel', { deltaY: 500, bubbles: true, cancelable: true })); el.scrollTop = 500; }); await page.waitForTimeout(500); expect(await mini(page), 'колесо — дія користувача').toBe(true);
});
test('89. нижній край капсули у стисненому стані не нижчий за розгорнутий (допуск 1 px) на 320/390/430; відступ знизу не змінився', async ({ page }) => {
  test.setTimeout(150000);
  for (const w of [320, 390, 430]){
    await boot(page, { w, tab: 'structure' });
    const ex = await page.evaluate(() => { const g = document.getElementById('tabbar-glass').getBoundingClientRect(); return { bottom: g.bottom, top: g.top, navBottom: getComputedStyle(document.querySelector('nav.tabbar')).bottom }; });
    await userScroll(page, Math.floor((await maxY(page)) / 2)); expect(await mini(page)).toBe(true); await page.waitForTimeout(800);
    const mn = await page.evaluate(() => { const g = document.getElementById('tabbar-glass').getBoundingClientRect(); return { bottom: g.bottom, top: g.top, navBottom: getComputedStyle(document.querySelector('nav.tabbar')).bottom }; });
    expect(mn.bottom, w + ': нижній край стисненого ≤ розгорнутого + 1').toBeLessThanOrEqual(ex.bottom + 1);
    expect(mn.top, w + ': стиснений нижчий угорі (капсула зменшилась)').toBeGreaterThan(ex.top + 5); expect(mn.navBottom).toBe(ex.navBottom);
  }
});
test('90. «+» у стисненому стані (DS-3c3): менший (≈ 35 px), опущений у панель — центр кола на одній лінії з центрами інших іконок (±2 px), не виступає над капсулою, лічильник поверх; на 320/390/430', async ({ page }) => {
  test.setTimeout(150000);
  for (const w of [320, 390, 430]){
    await boot(page, { w, tab: 'structure' });
    const measure = () => page.evaluate(() => { const g = document.getElementById('tabbar-glass').getBoundingClientRect(), wr = document.querySelector('nav.tabbar .tb-icon-wrap'), r = wr.getBoundingClientRect(), b = wr.querySelector('.tb-count-badge');
      const icons = Array.from(document.querySelectorAll('nav.tabbar button:not(.tab-vytraty) .tbx > svg')).map(e => { const q = e.getBoundingClientRect(); return q.y + q.height / 2; });
      const st = document.createElement('style'); st.textContent = 'nav.tabbar .tb-icon-wrap::after{pointer-events:auto!important}'; document.head.appendChild(st); let top = null; if(b && !b.classList.contains('hidden')){ const br = b.getBoundingClientRect(); const hit = document.elementFromPoint(br.x + br.width / 2, br.y + br.height / 2); top = !!(hit && hit.closest('.tb-count-badge')); } st.remove();
      return { d: r.width, cy: r.y + r.height / 2, top: r.top, bottom: r.bottom, gTop: g.top, gBottom: g.bottom, icons: icons, shadow: getComputedStyle(wr).boxShadow !== 'none', badgeOnTop: top }; });
    const ex = await measure();
    await userScroll(page, Math.floor((await maxY(page)) / 2)); expect(await mini(page)).toBe(true); await page.waitForTimeout(800);
    const mn = await measure();
    expect(Math.round(ex.d), w + ': розгорнутий 44').toBe(44); expect(ex.top, 'у розгорнутому «+» виступає над капсулою').toBeLessThan(ex.gTop);
    expect(mn.d, w + ': стиснений менший').toBeLessThan(ex.d); expect(mn.d).toBeGreaterThan(32); expect(mn.d).toBeLessThan(40);
    mn.icons.forEach((c, i) => expect(Math.abs(mn.cy - c), w + ': центр «+» (' + mn.cy.toFixed(1) + ') на одній лінії з іконкою ' + i + ' (' + c.toFixed(1) + ')').toBeLessThanOrEqual(2));
    expect(mn.top, w + ': «+» не виступає над капсулою').toBeGreaterThanOrEqual(mn.gTop - 0.5); expect(mn.bottom, w + ': «+» у межах панелі').toBeLessThanOrEqual(mn.gBottom + 0.5);
    expect(mn.shadow).toBe(true); expect(mn.badgeOnTop, w + ': лічильник поверх кола').toBe(true);
    // нижній край панелі не змінився
    expect(mn.gBottom, w + ': нижній край').toBeLessThanOrEqual(ex.gBottom + 1);
  }
});
test('91. перехід між станами ≈ 420 мс, м\'яка крива без перельоту, в обидва боки; лише transform; reduced-motion — миттєво', async ({ page }) => {
  test.setTimeout(120000);
  await boot(page, { tab: 'structure' });
  const d = await page.evaluate(() => { const c = getComputedStyle(document.querySelector('nav.tabbar')); return { d: c.transitionDuration, e: c.transitionTimingFunction, p: c.transitionProperty, v: c.getPropertyValue('--tb-mini-t').trim() }; });
  expect(d.v).toBe('420ms'); expect(d.p).toBe('transform'); expect(d.d).toBe('0.42s'); expect(d.e).toBe('cubic-bezier(0.4, 0, 0.2, 1)');
  const sample = (ms) => page.evaluate((ms) => new Promise((res) => { const out = []; const nav = document.querySelector('nav.tabbar'); let t0 = null; (function f(ts){ if(t0 === null) t0 = ts; const m = new DOMMatrix(getComputedStyle(nav).transform === 'none' ? undefined : getComputedStyle(nav).transform); out.push({ t: ts - t0, s: m.a }); if(ts - t0 < ms) requestAnimationFrame(f); else res(out); })(performance.now()); }), ms);
  let p = sample(900); await userScroll(page, Math.floor((await maxY(page)) / 2)); let fr = await p;
  expect(Math.min(...fr.map(f => f.s)), 'без перельоту при стисненні: не менше .8').toBeGreaterThanOrEqual(0.799);
  for (let i = 1; i < fr.length; i++) expect(fr[i].s, 'монотонно зменшується').toBeLessThanOrEqual(fr[i - 1].s + 0.001);
  const t0 = fr.find(f => f.s < 0.995).t, t1 = (fr.find(f => f.s <= 0.8005) || fr[fr.length - 1]).t; expect(t1 - t0, 'тривалість стиснення, мс').toBeGreaterThan(300); expect(t1 - t0).toBeLessThan(520);
  p = sample(900); await userScroll(page, 0); fr = await p;
  expect(Math.max(...fr.map(f => f.s)), 'без перельоту при розгортанні: не більше 1').toBeLessThanOrEqual(1.001);
});
test('92. reduced-motion: стиснення миттєве', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await boot(page, { tab: 'structure' });
  await userScroll(page, Math.floor((await maxY(page)) / 2)); expect(await mini(page)).toBe(true);
  expect(await page.evaluate(() => getComputedStyle(document.querySelector('nav.tabbar')).transitionDuration)).toMatch(/^0(\.0[0-8])?s/);
});
test('93. самописець: tab-mini має byUser (true для гортання користувача), розгортання при зміні вкладки — byUser=false', async ({ page }) => {
  await boot(page, { tab: 'structure' });
  await page.evaluate(() => { recBuf.length = 0; });
  await userScroll(page, 400); await userScroll(page, 100);
  await page.evaluate(() => switchTab('accounting', { noFocus: true })); await page.waitForTimeout(300);
  await page.evaluate(() => switchTab('structure', { noFocus: true })); await page.waitForTimeout(1500);
  const ev = await recMini(page);
  expect(ev.length, JSON.stringify(ev)).toBeGreaterThanOrEqual(2);
  expect(ev[0]).toEqual({ mini: true, why: 'down', byUser: true });
  expect(ev.filter(e => e.why === 'down' && !e.byUser).length, 'жодного стискання не від користувача').toBe(0);
});
