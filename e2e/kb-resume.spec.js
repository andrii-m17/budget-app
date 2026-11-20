// KB-RESUME-2 (Rev 2.32.434, C): експеримент kb-resume (control | proxy-tap | ro-tap). Підміна document.hasFocus() імітує «вікно неактивне» (у Playwright і на симуляторі вікно завжди активне); нативне фокусування замінника/поля імітуємо викликом focus() (синтетичні дотики його не дають). Мок; дані вигадані.
const { test, expect, devices } = require('@playwright/test');
const { installClock } = require('./clock');
const PORT = process.env.E2E_PORT || 8935;
const FIELD = '#cdd-balance';

async function open(browser, variant, hasFocus){
  const ctx = await browser.newContext({ ...devices['iPhone 14'], serviceWorkers: 'block', baseURL: 'http://127.0.0.1:' + PORT });
  const page = await ctx.newPage();
  await installClock(page);
  await page.addInitScript(() => { window.__kbNoAuto = true; window.__vv = { h: null, top: 0 }; try{ localStorage.setItem('budget-kb-new-formula-iphone', '1'); }catch(e){} });
  await page.goto('/index.html?fixture=typical');
  await page.waitForFunction(() => window.MockCloud && typeof cloudSession !== 'undefined' && cloudSession && cloudSession.user && document.querySelector('.tabbar-glass'));
  await page.waitForTimeout(1500);
  await page.evaluate(([v, hf]) => {
    const vv = window.visualViewport, H0 = window.innerHeight; window.__H0 = H0;
    Object.defineProperty(vv, 'height', { configurable: true, get(){ return window.__vv.h == null ? H0 : window.__vv.h; } });
    Object.defineProperty(vv, 'offsetTop', { configurable: true, get(){ return window.__vv.top; } });
    if (v) setVariant('kb-resume', v);
    if (hf === false) document.hasFocus = () => false;
    recBuf.length = 0; switchTab('accounting'); openCardDebtEditor(0);
  }, [variant, hasFocus]);
  await page.waitForTimeout(900);
  return { ctx, page };
}
const touch = (page, type, sel) => page.evaluate(({ type, sel }) => {
  const el = document.querySelector(sel); const r = el.getBoundingClientRect();
  if (type === 'touchstart') window.__tt = { el, x: r.left + r.width / 2, y: r.top + r.height / 2 };
  const { x, y } = window.__tt;
  const ev = new Event(type, { bubbles: true, cancelable: true }); const tt = [{ clientX: x, clientY: y, identifier: 1, target: window.__tt.el }];
  Object.defineProperty(ev, 'touches', { value: type === 'touchend' ? [] : tt }); Object.defineProperty(ev, 'changedTouches', { value: tt });
  window.__tt.el.dispatchEvent(ev);
  return { prevented: ev.defaultPrevented, x, y };
}, { type, sel });
const showKeyboard = (page) => page.evaluate(() => { window.__vv.h = window.__H0 - 388; window.visualViewport.dispatchEvent(new Event('resize')); });
const proxyInfo = (page) => page.evaluate(() => { const p = document.getElementById('kb-focus-proxy'); if (!p) return null; const r = p.getBoundingClientRect(), cs = getComputedStyle(p); return { left: r.left, top: r.top, w: r.width, h: r.height, pe: cs.pointerEvents, pos: cs.position, display: cs.display, fs: cs.fontSize, parent: p.parentNode && p.parentNode.tagName }; });
const events = (page) => page.evaluate(() => recBuf.filter(e => e.type === 'kb-resume'));
const state = (page) => page.evaluate(() => ({ active: document.activeElement && document.activeElement.id, ro: document.querySelector('#cdd-balance').readOnly, roAttr: document.querySelector('#cdd-balance').getAttribute('data-kb-resume-ro') }));

test('control при hasFocus false: перехоплення як зараз; замінника і readonly нема; подія branch none, intercept true', async ({ browser }) => {
  const { ctx, page } = await open(browser, null, false);
  try {
    const s = await touch(page, 'touchstart', FIELD); const e = await touch(page, 'touchend', FIELD);
    expect(s.prevented).toBe(true); expect(e.prevented).toBe(true);
    expect((await state(page)).ro).toBe(false);
    await page.waitForTimeout(1200);
    const ev = await events(page);
    expect(ev.length).toBe(1); expect(ev[0]).toMatchObject({ variant: 'control', branch: 'none', hasFocusStart: false, intercept: true });
  } finally { await ctx.close(); }
});

test('proxy-tap (hasFocus false): замінник 44×44 під дотиком на touchstart (без preventDefault), угорі на touchend; після focusin замінника — фокус на цільовому полі, шторку піднято; branch proxy-focus', async ({ browser }) => {
  const { ctx, page } = await open(browser, 'proxy-tap', false);
  try {
    const s = await touch(page, 'touchstart', FIELD);
    expect(s.prevented).toBe(false);
    let p = await proxyInfo(page);
    expect(p.parent).toBe('BODY'); expect(p.pos).toBe('fixed'); expect(p.pe).toBe('auto'); expect(p.w).toBe(44); expect(p.h).toBe(44); expect(parseFloat(p.fs)).toBeGreaterThanOrEqual(16);
    expect(Math.abs(p.left + 22 - s.x)).toBeLessThanOrEqual(1); expect(Math.abs(p.top + 22 - s.y)).toBeLessThanOrEqual(1);
    const e = await touch(page, 'touchend', FIELD);
    expect(e.prevented).toBe(false);
    p = await proxyInfo(page);
    expect(p.top).toBeLessThan(80); expect(p.left).toBeLessThan(30); // угорі видимої області
    // нативний дотик фокусує замінник (імітуємо), потім з'являється клавіатура
    await page.evaluate(() => document.getElementById('kb-focus-proxy').focus());
    await page.waitForTimeout(150);
    await showKeyboard(page);
    await page.waitForTimeout(900);
    const st = await state(page);
    expect(st.active, 'фокус перенесено на цільове поле').toBe('cdd-balance');
    expect(await page.evaluate(() => document.documentElement.classList.contains('kb-sheet') || document.body.classList.contains('kb-open'))).toBe(true);
    expect((await proxyInfo(page)).top).toBeLessThan(2000); // замінник повернено до нейтрального стану (стиль за замовчуванням)
    await page.waitForTimeout(500);
    const ev = await events(page);
    expect(ev.length).toBe(1); expect(ev[0]).toMatchObject({ variant: 'proxy-tap', branch: 'proxy-focus', hasFocusStart: false, intercept: false });
    expect(typeof ev[0].transferMs).toBe('number'); expect(ev[0].transferMs).toBeGreaterThan(100);
  } finally { await ctx.close(); }
});

test('proxy-tap: фокус на замінник не прийшов за 400 мс — замінник сховано, нічого не змінено; branch proxy-miss', async ({ browser }) => {
  const { ctx, page } = await open(browser, 'proxy-tap', false);
  try {
    await touch(page, 'touchstart', FIELD); await touch(page, 'touchend', FIELD);
    await page.waitForTimeout(250);
    expect((await proxyInfo(page)).display).not.toBe('none');
    await page.waitForTimeout(300);
    expect((await proxyInfo(page)).display).toBe('none');
    expect((await state(page)).active).not.toBe('cdd-balance');
    await page.waitForTimeout(800);
    expect((await events(page))[0]).toMatchObject({ variant: 'proxy-tap', branch: 'proxy-miss' });
  } finally { await ctx.close(); }
});

test('ro-tap (hasFocus false): readonly на touchstart (без preventDefault); focus знімає readonly, blur і звичайний шлях — поле у фокусі; branch ro-focus', async ({ browser }) => {
  const { ctx, page } = await open(browser, 'ro-tap', false);
  try {
    const s = await touch(page, 'touchstart', FIELD);
    expect(s.prevented).toBe(false);
    expect(await state(page)).toMatchObject({ ro: true, roAttr: '1' });
    const e = await touch(page, 'touchend', FIELD);
    expect(e.prevented).toBe(false);
    await page.evaluate(() => document.querySelector('#cdd-balance').focus()); // нативний дотик фокусує readonly-поле
    await page.waitForTimeout(500);
    const st = await state(page);
    expect(st).toMatchObject({ ro: false, roAttr: null, active: 'cdd-balance' });
    await page.waitForTimeout(800);
    expect((await events(page))[0]).toMatchObject({ variant: 'ro-tap', branch: 'ro-focus', hasFocusStart: false, intercept: false });
  } finally { await ctx.close(); }
});

test('ro-tap: ні focus, ні click за 300 мс — readonly знято і звичайний шлях; branch ro-timeout', async ({ browser }) => {
  const { ctx, page } = await open(browser, 'ro-tap', false);
  try {
    await touch(page, 'touchstart', FIELD); await touch(page, 'touchend', FIELD);
    await page.waitForTimeout(200);
    expect((await state(page)).ro).toBe(true);
    await page.waitForTimeout(500);
    expect(await state(page)).toMatchObject({ ro: false, roAttr: null, active: 'cdd-balance' });
    await page.waitForTimeout(700);
    expect((await events(page))[0]).toMatchObject({ variant: 'ro-tap', branch: 'ro-timeout' });
  } finally { await ctx.close(); }
});

for (const v of ['control', 'proxy-tap', 'ro-tap']) {
  test('hasFocus true: ' + v + ' ідентичний control — перехоплено, замінника й readonly нема, branch none', async ({ browser }) => {
    const { ctx, page } = await open(browser, v, true);
    try {
      const s = await touch(page, 'touchstart', FIELD);
      expect(s.prevented).toBe(true);
      expect(await page.evaluate(() => { const p = document.getElementById('kb-focus-proxy'); return !p || p.parentNode.tagName !== 'BODY' || getComputedStyle(p).pointerEvents === 'none'; })).toBe(true);
      expect((await state(page)).ro).toBe(false);
      const e = await touch(page, 'touchend', FIELD); expect(e.prevented).toBe(true);
      await page.waitForTimeout(1200);
      expect((await events(page))[0]).toMatchObject({ variant: v, branch: 'none', hasFocusStart: true, intercept: true });
    } finally { await ctx.close(); }
  });
}

test('proxy-tap: два швидкі дотики — активний лише останній сеанс (перший таймер не ховає замінник), один перенос фокусу', async ({ browser }) => {
  const { ctx, page } = await open(browser, 'proxy-tap', false);
  try {
    await touch(page, 'touchstart', FIELD); await touch(page, 'touchend', FIELD);
    await page.waitForTimeout(200);
    await touch(page, 'touchstart', FIELD); await touch(page, 'touchend', FIELD);
    await page.waitForTimeout(300); // 500 мс від першого дотику: його таймер (400) не має спрацювати
    expect((await proxyInfo(page)).display).not.toBe('none');
    await page.evaluate(() => document.getElementById('kb-focus-proxy').focus());
    await page.waitForTimeout(150); await showKeyboard(page); await page.waitForTimeout(900);
    expect((await state(page)).active).toBe('cdd-balance');
    await page.waitForTimeout(500);
    const ev = await events(page);
    expect(ev.filter(e => e.branch === 'proxy-focus').length).toBe(1);
  } finally { await ctx.close(); }
});

test('ro-tap і proxy-tap: шторку закрито між дотиком і фокусом — фокус не ставиться, readonly знято', async ({ browser }) => {
  for (const v of ['ro-tap', 'proxy-tap']) {
    const { ctx, page } = await open(browser, v, false);
    try {
      await touch(page, 'touchstart', FIELD); await touch(page, 'touchend', FIELD);
      await page.evaluate(() => { document.getElementById('card-debt-drawer').classList.remove('open'); document.getElementById('card-debt-drawer').setAttribute('inert', ''); });
      if (v === 'proxy-tap') await page.evaluate(() => document.getElementById('kb-focus-proxy').focus());
      await page.waitForTimeout(600);
      const st = await state(page);
      expect(st.ro, v).toBe(false); expect(st.active, v).not.toBe('cdd-balance');
    } finally { await ctx.close(); }
  }
});

test('ro-tap і proxy-tap: рух пальця понад 10 pt (прокрутка) — readonly/замінник знімаються без фокусу', async ({ browser }) => {
  for (const v of ['ro-tap', 'proxy-tap']) {
    const { ctx, page } = await open(browser, v, false);
    try {
      await touch(page, 'touchstart', FIELD);
      await page.evaluate(() => { const el = window.__tt.el; const tt = [{ clientX: window.__tt.x, clientY: window.__tt.y - 30, identifier: 1, target: el }]; const ev = new Event('touchmove', { bubbles: true, cancelable: true }); Object.defineProperty(ev, 'touches', { value: tt }); Object.defineProperty(ev, 'changedTouches', { value: tt }); el.dispatchEvent(ev); });
      const st = await state(page);
      expect(st.ro, v).toBe(false);
      if (v === 'proxy-tap') expect((await proxyInfo(page)).display).toBe('none');
      await touch(page, 'touchend', FIELD); await page.waitForTimeout(700);
      expect((await state(page)).active, v).not.toBe('cdd-balance');
    } finally { await ctx.close(); }
  }
});
