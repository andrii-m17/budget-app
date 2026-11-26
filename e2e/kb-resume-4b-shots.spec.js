// KB-RESUME-4b (Крок 1): знімки стану keep-lift після повернення (шторка піднята, клавіатури нема): ОЧ («Термін» — тут поле балансу картки) і дохід; темна/світла; 390 і 440 pt.
// Лише знімки й виміри (fieldCenter, коробка шторки). Тека з міткою часу: docs/ui/kb-resume-4b/<KB4B_TS>/. Запуск: KB4B_TS=... npx playwright test e2e/kb-resume-4b-shots.spec.js
const { test } = require('@playwright/test');
const fs = require('fs');
const { installClock } = require('./clock');
const TS = process.env.KB4B_TS || 'manual';
const AFTER = process.env.KB4B_AFTER === '1'; // пропозиція «після»: лише порядок шарів box-shadow (заповнення зверху, shadow-lg під ним); у застосунок не потрапляє, вставляється стилем у сторінку
const OUT = 'docs/ui/kb-resume-4b/' + TS;
const SHEETS = [
  { id: 'och', open: "switchTab('accounting'); openCardDebtEditor(0);", field: '#cdd-balance', drawer: '#card-debt-drawer' },
  { id: 'income', open: "switchTab('accounting'); openIncomeEditor(0);", field: '#ind-amount', drawer: '#income-drawer' },
];
const SIZES = [{ w: 390, h: 844 }, { w: 440, h: 956 }];
const fire = (page, sel, type) => page.evaluate(({ sel, type }) => { const el = document.querySelector(sel); const r = el.getBoundingClientRect(); const x = r.left + r.width / 2, y = r.top + r.height / 2; const ev = new Event(type, { bubbles: true, cancelable: true }); const tt = [{ clientX: x, clientY: y, identifier: 1, target: el }]; Object.defineProperty(ev, 'touches', { value: type === 'touchend' ? [] : tt }); Object.defineProperty(ev, 'changedTouches', { value: tt }); el.dispatchEvent(ev); }, { sel, type });
const vis = (page, v) => page.evaluate((vs) => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => vs }); document.dispatchEvent(new Event('visibilitychange')); }, v);
const measure = (page, sh) => page.evaluate((s) => { const f = document.querySelector(s.field).getBoundingClientRect(), d = document.querySelector(s.drawer).getBoundingClientRect(); return { fieldCenter: Math.round((f.top + f.height / 2) * 10) / 10, drawerTop: Math.round(d.top * 10) / 10, drawerBottom: Math.round(d.bottom * 10) / 10, innerH: window.innerHeight }; }, sh);
for (const theme of ['dark', 'light']) for (const sz of SIZES) for (const sh of SHEETS) {
  test('keep-lift до: ' + sh.id + ' ' + theme + ' ' + sz.w, async ({ browser }) => {
    const { devices } = require('@playwright/test');
    const ctx = await browser.newContext({ ...devices['iPhone 14'], viewport: { width: sz.w, height: sz.h }, serviceWorkers: 'block', baseURL: 'http://127.0.0.1:' + (process.env.E2E_PORT || 8935), colorScheme: theme });
    const page = await ctx.newPage();
    await installClock(page);
    await page.addInitScript((th) => { window.__kbNoAuto = true; window.__vv = { h: null, top: 0 }; try{ localStorage.setItem('budget-kb-new-formula-iphone', '1'); localStorage.setItem('budget_theme_v1', th); }catch(e){} }, theme);
    await page.goto('/index.html?fixture=typical');
    await page.waitForFunction(() => window.MockCloud && typeof cloudSession !== 'undefined' && cloudSession && cloudSession.user && document.querySelector('.tabbar-glass'));
    await page.waitForTimeout(1500);
    await page.evaluate((o) => {
      const vv = window.visualViewport, H0 = window.innerHeight; window.__H0 = H0;
      Object.defineProperty(vv, 'height', { configurable: true, get(){ return window.__vv.h == null ? H0 : window.__vv.h; } });
      Object.defineProperty(vv, 'offsetTop', { configurable: true, get(){ return window.__vv.top; } });
      (new Function(o))();
    }, sh.open);
    await page.waitForTimeout(900);
    await fire(page, sh.field, 'touchstart'); await fire(page, sh.field, 'touchend'); await page.waitForTimeout(250);
    await page.evaluate(() => { window.__vv.h = window.__H0 - 388; window.visualViewport.dispatchEvent(new Event('resize')); });
    await page.waitForTimeout(1000);
    const kb = await measure(page, sh);
    await vis(page, 'hidden'); await page.evaluate(() => { window.__vv.h = null; window.visualViewport.dispatchEvent(new Event('resize')); });
    await page.waitForTimeout(500); await vis(page, 'visible'); await page.waitForTimeout(700);
    const keep = await measure(page, sh);
    fs.mkdirSync(OUT, { recursive: true });
    if (AFTER) { await page.addStyleTag({ content: 'html.kb-keep .drawer.open{ box-shadow: 0 calc(var(--sheet-lift, 0) * .25px) 0 0 var(--surface), 0 calc(var(--sheet-lift, 0) * .5px) 0 0 var(--surface), 0 calc(var(--sheet-lift, 0) * .75px) 0 0 var(--surface), 0 calc(var(--sheet-lift, 0) * 1px) 0 0 var(--surface), var(--shadow-lg) !important; }' }); await page.waitForTimeout(300); }
    const keep2 = await measure(page, sh);
    const name = OUT + '/' + (AFTER ? 'after' : 'before') + '-' + sh.id + '-' + theme + '-' + sz.w + '.png';
    await page.screenshot({ path: name });
    fs.appendFileSync(OUT + '/measure.jsonl', JSON.stringify({ shot: name, kbOpen: kb, keepLift: keep, keepLiftAfterStyle: keep2, kbKeep: await page.evaluate(() => document.documentElement.classList.contains('kb-keep')) }) + '\n');
    await ctx.close();
  });
}
