// KB-RESUME (Rev 2.32.433, C): експеримент kb-resume. Підміна document.hasFocus() імітує «вікно неактивне» (на симуляторі й у Playwright вікно завжди активне). Мок; дані вигадані.
// Перевіряємо: control — без змін; win-focus — window.focus() до перехоплення, шлях той самий; native — перший дотик не перехоплюється; при hasFocus true — жодної різниці; подія kb-resume записується.
const { test, expect, devices } = require('@playwright/test');
const { installClock } = require('./clock');
const PORT = process.env.E2E_PORT || 8935;

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
    window.__wfc = 0; window.focus = () => { window.__wfc++; };
    recBuf.length = 0; switchTab('accounting'); openCardDebtEditor(0);
  }, [variant, hasFocus]);
  await page.waitForTimeout(900);
  return { ctx, page };
}
// синтетичний дотик (як у keyboard.spec): повертає, чи погашено touchstart/touchend
async function tapField(page, sel, kbAfterMs){
  return page.evaluate(async ({ sel, kbAfterMs }) => {
    const el = document.querySelector(sel); const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    const mk = (type) => { const ev = new Event(type, { bubbles: true, cancelable: true }); const tt = [{ clientX: x, clientY: y, identifier: 1, target: el }]; Object.defineProperty(ev, 'touches', { value: type === 'touchend' ? [] : tt }); Object.defineProperty(ev, 'changedTouches', { value: tt }); return ev; };
    const st = mk('touchstart'); el.dispatchEvent(st);
    await new Promise(res => setTimeout(res, 80));
    const en = mk('touchend'); el.dispatchEvent(en);
    if (kbAfterMs != null) { await new Promise(res => setTimeout(res, kbAfterMs)); window.__vv.h = window.__H0 - 388; window.visualViewport.dispatchEvent(new Event('resize')); }
    return { startPrevented: st.defaultPrevented, endPrevented: en.defaultPrevented, active: document.activeElement && document.activeElement.id, wfc: window.__wfc };
  }, { sel, kbAfterMs });
}
const events = (page) => page.evaluate(() => recBuf.filter(e => e.type === 'kb-resume'));

test('control при hasFocus false: перехоплення як зараз, window.focus не викликається; подія kb-resume з hasFocus false і intercept true', async ({ browser }) => {
  const { ctx, page } = await open(browser, null, false);
  try {
    expect(await page.evaluate(() => getVariant('kb-resume'))).toBe('control');
    const r = await tapField(page, '#cdd-balance', 250);
    expect(r.startPrevented).toBe(true); expect(r.endPrevented).toBe(true); expect(r.wfc).toBe(0);
    await page.waitForTimeout(1300);
    const ev = await events(page);
    expect(ev.length).toBe(1);
    expect(ev[0]).toMatchObject({ variant: 'control', hasFocusStart: false, hasFocusEnd: false, intercept: true });
    expect(ev[0].kbShownMs).toBeGreaterThan(150); expect(ev[0].kbShownMs).toBeLessThan(700);
    expect(Object.keys(ev[0]).filter(k => typeof ev[0][k] === 'string' && k !== 'type' && k !== 'variant')).toEqual([]); // лише числа й булеві (variant — назва варіанта)
  } finally { await ctx.close(); }
});

test('win-focus при hasFocus false: window.focus() до перехоплення, далі шлях той самий (дотик перехоплено)', async ({ browser }) => {
  const { ctx, page } = await open(browser, 'win-focus', false);
  try {
    const r = await tapField(page, '#cdd-balance', null);
    expect(r.wfc).toBe(1); expect(r.startPrevented).toBe(true); expect(r.endPrevented).toBe(true);
    await page.waitForTimeout(1300);
    const ev = await events(page);
    expect(ev[0]).toMatchObject({ variant: 'win-focus', hasFocusStart: false, intercept: true }); expect(ev[0].kbShownMs == null, 'null у самописці = ключ відсутній').toBe(true);
  } finally { await ctx.close(); }
});

test('native при hasFocus false: перший дотик не перехоплюється (ні touchstart, ні touchend), подія з intercept false', async ({ browser }) => {
  const { ctx, page } = await open(browser, 'native', false);
  try {
    const r = await tapField(page, '#cdd-balance', null);
    expect(r.startPrevented).toBe(false); expect(r.endPrevented).toBe(false); expect(r.wfc).toBe(0);
    await page.waitForTimeout(1300);
    const ev = await events(page);
    expect(ev[0]).toMatchObject({ variant: 'native', hasFocusStart: false, intercept: false });
  } finally { await ctx.close(); }
});

for (const v of ['control', 'win-focus', 'native']) {
  test('hasFocus true: ' + v + ' ідентичний control (перехоплено, window.focus не викликано), подія записується з hasFocus true', async ({ browser }) => {
    const { ctx, page } = await open(browser, v, true);
    try {
      const r = await tapField(page, '#cdd-balance', 250);
      expect(r.startPrevented).toBe(true); expect(r.endPrevented).toBe(true); expect(r.wfc).toBe(0);
      await page.waitForTimeout(1300);
      const ev = await events(page);
      expect(ev[0]).toMatchObject({ variant: v, hasFocusStart: true, hasFocusEnd: true, intercept: true });
    } finally { await ctx.close(); }
  });
}
