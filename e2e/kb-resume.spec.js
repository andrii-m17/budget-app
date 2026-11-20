// KB-RESUME-4 (Rev 2.32.435, C): експеримент kb-resume (control | proxy-tap | keep-lift | await-focus). Підміна document.hasFocus() імітує «вікно неактивне»; вихід у фон — підміна document.visibilityState + visibilitychange; клавіатура — підміна visualViewport (як у keyboard.spec); нативне фокусування імітується focus() (синтетичні дотики його не дають). Мок; дані вигадані.
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
const touch = (page, type, sel, dy) => page.evaluate(({ type, sel, dy }) => {
  const el = document.querySelector(sel); const r = el.getBoundingClientRect();
  if (type === 'touchstart') window.__tt = { el, x: r.left + r.width / 2, y: r.top + r.height / 2 };
  const { x, y } = window.__tt, yy = type === 'touchmove' ? y + (dy || 0) : y;
  const ev = new Event(type, { bubbles: true, cancelable: true }); const tt = [{ clientX: x, clientY: yy, identifier: 1, target: window.__tt.el }];
  Object.defineProperty(ev, 'touches', { value: type === 'touchend' ? [] : tt }); Object.defineProperty(ev, 'changedTouches', { value: tt });
  window.__tt.el.dispatchEvent(ev);
  return { prevented: ev.defaultPrevented, x, y };
}, { type, sel, dy });
const showKeyboard = (page) => page.evaluate(() => { window.__vv.h = window.__H0 - 388; window.visualViewport.dispatchEvent(new Event('resize')); });
const hideKeyboard = (page) => page.evaluate(() => { window.__vv.h = null; window.visualViewport.dispatchEvent(new Event('resize')); });
const setVisibility = (page, v) => page.evaluate((vis) => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => vis }); document.dispatchEvent(new Event('visibilitychange')); }, v);
const proxyInfo = (page) => page.evaluate(() => { const p = document.getElementById('kb-focus-proxy'); if (!p) return null; const r = p.getBoundingClientRect(), cs = getComputedStyle(p); return { left: r.left, top: r.top, w: r.width, h: r.height, pe: cs.pointerEvents, pos: cs.position, display: cs.display, fs: cs.fontSize, parent: p.parentNode && p.parentNode.tagName }; });
const events = (page) => page.evaluate(() => recBuf.filter(e => e.type === 'kb-resume'));
const active = (page) => page.evaluate(() => document.activeElement && document.activeElement.id);
const sheet = (page) => page.evaluate(() => { const d = document.getElementById('card-debt-drawer'), cs = document.documentElement; return { lift: parseFloat(cs.style.getPropertyValue('--sheet-lift')) || 0, top: Math.round(d.getBoundingClientRect().top * 10) / 10, kbSheet: cs.classList.contains('kb-sheet'), kbKeep: cs.classList.contains('kb-keep'), kbOpen: document.body.classList.contains('kb-open'), active: document.activeElement && (document.activeElement.id || document.activeElement.tagName) }; });

// відкрити поле з клавіатурою (звичайний перехоплений шлях при активному вікні)
async function openWithKeyboard(page){
  await touch(page, 'touchstart', FIELD); await touch(page, 'touchend', FIELD);
  await page.waitForTimeout(250); await showKeyboard(page); await page.waitForTimeout(1000);
}

test('control при hasFocus false: перехоплення як зараз; замінника нема; подія branch none, intercept true, fieldTopAtTouch число', async ({ browser }) => {
  const { ctx, page } = await open(browser, null, false);
  try {
    const s = await touch(page, 'touchstart', FIELD); const e = await touch(page, 'touchend', FIELD);
    expect(s.prevented).toBe(true); expect(e.prevented).toBe(true);
    await page.waitForTimeout(1200);
    const ev = await events(page);
    expect(ev.length).toBe(1); expect(ev[0]).toMatchObject({ variant: 'control', branch: 'none', hasFocusStart: false, intercept: true, keptLift: false });
    expect(typeof ev[0].fieldTopAtTouch).toBe('number');
  } finally { await ctx.close(); }
});

test('proxy-tap (hasFocus false): замінник 44×44 під дотиком на touchstart (без preventDefault), угорі на touchend; після focusin замінника — фокус на цільовому полі; branch proxy-focus', async ({ browser }) => {
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
    expect(p.top).toBeLessThan(80); expect(p.left).toBeLessThan(30);
    await page.evaluate(() => document.getElementById('kb-focus-proxy').focus());
    await page.waitForTimeout(150); await showKeyboard(page); await page.waitForTimeout(900);
    expect(await active(page), 'фокус перенесено на цільове поле').toBe('cdd-balance');
    await page.waitForTimeout(500);
    const ev = await events(page);
    expect(ev.length).toBe(1); expect(ev[0]).toMatchObject({ variant: 'proxy-tap', branch: 'proxy-focus', hasFocusStart: false, intercept: false });
  } finally { await ctx.close(); }
});

test('proxy-tap: фокус на замінник не прийшов за 400 мс — замінник сховано; branch proxy-miss. Два швидкі дотики: активний лише останній сеанс', async ({ browser }) => {
  const { ctx, page } = await open(browser, 'proxy-tap', false);
  try {
    await touch(page, 'touchstart', FIELD); await touch(page, 'touchend', FIELD);
    await page.waitForTimeout(250);
    expect((await proxyInfo(page)).display).not.toBe('none');
    await page.waitForTimeout(300);
    expect((await proxyInfo(page)).display).toBe('none');
    await page.waitForTimeout(800);
    expect((await events(page))[0]).toMatchObject({ variant: 'proxy-tap', branch: 'proxy-miss' });
  } finally { await ctx.close(); }
  const b = await open(browser, 'proxy-tap', false);
  try {
    await touch(b.page, 'touchstart', FIELD); await touch(b.page, 'touchend', FIELD);
    await b.page.waitForTimeout(200);
    await touch(b.page, 'touchstart', FIELD); await touch(b.page, 'touchend', FIELD);
    await b.page.waitForTimeout(300);
    expect((await proxyInfo(b.page)).display).not.toBe('none');
    await b.page.evaluate(() => document.getElementById('kb-focus-proxy').focus());
    await b.page.waitForTimeout(150); await showKeyboard(b.page); await b.page.waitForTimeout(900);
    expect(await active(b.page)).toBe('cdd-balance');
    await b.page.waitForTimeout(500);
    expect((await events(b.page)).filter(e => e.branch === 'proxy-focus').length).toBe(1);
  } finally { await b.ctx.close(); }
});

// ---------- keep-lift ----------
test('keep-lift: вихід у фон з відкритою клавіатурою — шторка не опускається (kb-keep, kb-sheet, підйом і положення ті самі), поле без фокусу', async ({ browser }) => {
  const { ctx, page } = await open(browser, 'keep-lift', true);
  try {
    await openWithKeyboard(page);
    const before = await sheet(page);
    expect(before.kbSheet).toBe(true); expect(before.lift).toBeGreaterThan(50); expect(before.active).toBe('cdd-balance');
    await setVisibility(page, 'hidden'); await hideKeyboard(page);
    await page.waitForTimeout(900); // довше за 40/250 мс звичайних таймерів опускання
    const after = await sheet(page);
    expect(after.kbKeep).toBe(true); expect(after.kbSheet).toBe(true); expect(after.kbOpen).toBe(true);
    expect(after.lift).toBe(before.lift); expect(Math.abs(after.top - before.top)).toBeLessThanOrEqual(1);
    expect(after.active).not.toBe('cdd-balance'); // поле втратило фокус (наступний дотик дасть нативний фокус)
    await setVisibility(page, 'visible'); await page.waitForTimeout(300);
    const back = await sheet(page);
    expect(back.kbKeep).toBe(true); expect(Math.abs(back.top - before.top)).toBeLessThanOrEqual(1);
    const ev = await events(page);
    expect(ev.some(e => e.branch === 'keep-enter' && e.keptLift === true && e.liftTarget > 50)).toBe(true);
  } finally { await ctx.close(); }
});

test('keep-lift: дотик по полю після повернення — нативний (без preventDefault), шторка нерухома, kb-keep знято (released tap-field), подія з keptLift і fieldTopAtTouch', async ({ browser }) => {
  const { ctx, page } = await open(browser, 'keep-lift', true);
  try {
    await openWithKeyboard(page);
    const before = await sheet(page);
    await setVisibility(page, 'hidden'); await hideKeyboard(page); await page.waitForTimeout(500); await setVisibility(page, 'visible'); await page.waitForTimeout(200);
    const s = await touch(page, 'touchstart', FIELD); const e = await touch(page, 'touchend', FIELD);
    expect(s.prevented).toBe(false); expect(e.prevented).toBe(false);
    await page.evaluate(() => document.querySelector('#cdd-balance').focus()); // нативний фокус
    await page.waitForTimeout(150); await showKeyboard(page); await page.waitForTimeout(1000);
    const after = await sheet(page);
    expect(after.kbKeep).toBe(false); expect(after.kbSheet).toBe(true); expect(after.active).toBe('cdd-balance');
    expect(Math.abs(after.top - before.top), 'шторка нерухома: ' + JSON.stringify({ before, after })).toBeLessThanOrEqual(3);
    await page.waitForTimeout(600);
    const ev = await events(page);
    expect(ev.some(e => e.branch === 'keep-release' && e.released === 'tap-field')).toBe(true);
    const rec = ev.find(e => e.variant === 'keep-lift' && e.branch === 'none' && e.keptLift === true);
    expect(rec, JSON.stringify(ev)).toBeTruthy(); expect(typeof rec.fieldTopAtTouch).toBe('number'); expect(rec.liftTarget).toBeGreaterThan(50); expect(rec.released).toBe('tap-field');
  } finally { await ctx.close(); }
});

test('keep-lift: дотик поза полем (заголовок шторки) — шторка опускається звичайною анімацією, released tap-other; нічого не лишається піднятим', async ({ browser }) => {
  const { ctx, page } = await open(browser, 'keep-lift', true);
  try {
    await openWithKeyboard(page);
    await setVisibility(page, 'hidden'); await hideKeyboard(page); await page.waitForTimeout(400); await setVisibility(page, 'visible'); await page.waitForTimeout(200);
    await touch(page, 'touchstart', '#card-debt-drawer .drawer-head h2');
    await page.waitForTimeout(900);
    const s = await sheet(page);
    expect(s.kbKeep).toBe(false); expect(s.kbSheet).toBe(false); expect(s.lift).toBe(0);
    expect((await events(page)).some(e => e.branch === 'keep-release' && e.released === 'tap-other')).toBe(true);
  } finally { await ctx.close(); }
});

test('keep-lift: рух пальця з поля ≥ 10 pt (прокрутка) — released drag; закриття шторки — released close', async ({ browser }) => {
  let h = await open(browser, 'keep-lift', true);
  try {
    await openWithKeyboard(h.page);
    await setVisibility(h.page, 'hidden'); await hideKeyboard(h.page); await h.page.waitForTimeout(400); await setVisibility(h.page, 'visible'); await h.page.waitForTimeout(200);
    await touch(h.page, 'touchstart', FIELD); await touch(h.page, 'touchmove', FIELD, -30);
    await h.page.waitForTimeout(900);
    expect((await sheet(h.page)).kbKeep).toBe(false);
    expect((await events(h.page)).some(e => e.branch === 'keep-release' && e.released === 'drag')).toBe(true);
  } finally { await h.ctx.close(); }
  h = await open(browser, 'keep-lift', true);
  try {
    await openWithKeyboard(h.page);
    await setVisibility(h.page, 'hidden'); await hideKeyboard(h.page); await h.page.waitForTimeout(400); await setVisibility(h.page, 'visible'); await h.page.waitForTimeout(200);
    await h.page.evaluate(() => closeCardDebtEditor());
    await h.page.waitForTimeout(900);
    const s = await sheet(h.page);
    expect(s.kbKeep).toBe(false); expect(s.kbSheet).toBe(false);
    expect((await events(h.page)).some(e => e.branch === 'keep-release' && e.released === 'close')).toBe(true);
  } finally { await h.ctx.close(); }
});

test('control і інші варіанти: вихід у фон з клавіатурою опускає шторку як зараз (kb-keep ніколи не ставиться)', async ({ browser }) => {
  for (const v of ['control', 'proxy-tap', 'await-focus']) {
    const { ctx, page } = await open(browser, v, true);
    try {
      await openWithKeyboard(page);
      await setVisibility(page, 'hidden'); await hideKeyboard(page);
      await page.waitForTimeout(1200);
      const s = await sheet(page);
      expect(s.kbKeep, v).toBe(false); expect(s.kbSheet, v + ': шторку опущено').toBe(false); expect(s.lift, v).toBe(0);
    } finally { await ctx.close(); }
  }
});

// ---------- await-focus ----------
test('await-focus (hasFocus false): фокус не ставиться, доки вікно не отримає focus; після події focus — фокус нашим кодом, клавіатура → branch await-ok, by focus', async ({ browser }) => {
  const { ctx, page } = await open(browser, 'await-focus', false);
  try {
    const s = await touch(page, 'touchstart', FIELD); const e = await touch(page, 'touchend', FIELD);
    expect(s.prevented).toBe(true); expect(e.prevented).toBe(true); // дотик перехоплено, як у control
    await page.waitForTimeout(150);
    expect(await active(page), 'до події focus вікна фокус не ставиться').not.toBe('cdd-balance');
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await page.waitForTimeout(200); await showKeyboard(page); await page.waitForTimeout(900);
    expect(await active(page)).toBe('cdd-balance');
    await page.waitForTimeout(1200);
    expect((await events(page))[0]).toMatchObject({ variant: 'await-focus', branch: 'await-ok', by: 'focus', hasFocusStart: false });
  } finally { await ctx.close(); }
});

test('await-focus: вікно не активувалось за 300 мс — фокус ставиться за таймером (by timeout); клавіатури нема → branch await-miss', async ({ browser }) => {
  const { ctx, page } = await open(browser, 'await-focus', false);
  try {
    await touch(page, 'touchstart', FIELD); await touch(page, 'touchend', FIELD);
    await page.waitForTimeout(200);
    expect(await active(page)).not.toBe('cdd-balance');
    await page.waitForTimeout(250);
    expect(await active(page), 'через ≈ 300 мс фокус поставлено').toBe('cdd-balance');
    await page.waitForTimeout(1600);
    expect((await events(page))[0]).toMatchObject({ variant: 'await-focus', branch: 'await-miss', by: 'timeout' });
  } finally { await ctx.close(); }
});

for (const v of ['control', 'proxy-tap', 'keep-lift', 'await-focus']) {
  test('hasFocus true: ' + v + ' ідентичний control — перехоплено, замінника нема, фокус одразу, branch none', async ({ browser }) => {
    const { ctx, page } = await open(browser, v, true);
    try {
      const s = await touch(page, 'touchstart', FIELD);
      expect(s.prevented).toBe(true);
      expect(await page.evaluate(() => { const p = document.getElementById('kb-focus-proxy'); return !p || p.parentNode.tagName !== 'BODY' || getComputedStyle(p).pointerEvents === 'none'; })).toBe(true);
      const e = await touch(page, 'touchend', FIELD); expect(e.prevented).toBe(true);
      await page.waitForTimeout(250);
      expect(await active(page)).toBe('cdd-balance');
      await page.waitForTimeout(1500);
      expect((await events(page))[0]).toMatchObject({ variant: v, branch: 'none', hasFocusStart: true, intercept: true });
    } finally { await ctx.close(); }
  });
}
