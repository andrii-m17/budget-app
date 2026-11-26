// KB-RESUME-4: знімок «піднята шторка без клавіатури після повернення» (темна тема, 390 pt) для погодження вигляду. Стан імітується: клавіатура відкрита → вихід у фон (visibilitychange hidden) → клавіатура зникла → повернення. Мок; дані вигадані.
const { test, devices } = require('@playwright/test');
const fs = require('fs');
const { installClock } = require('./clock');
test('знімок: піднята шторка картки ОЧ без клавіатури після повернення (keep-lift)', async ({ browser }) => {
  const ctx = await browser.newContext({ ...devices['iPhone 14'], serviceWorkers: 'block', baseURL: 'http://127.0.0.1:' + (process.env.E2E_PORT || 8935), colorScheme: 'dark' });
  const page = await ctx.newPage();
  await installClock(page);
  await page.addInitScript(() => { window.__kbNoAuto = true; window.__vv = { h: null, top: 0 }; try{ localStorage.setItem('budget-kb-new-formula-iphone', '1'); }catch(e){} });
  await page.goto('/index.html?fixture=typical');
  await page.waitForFunction(() => window.MockCloud && typeof cloudSession !== 'undefined' && cloudSession && cloudSession.user && document.querySelector('.tabbar-glass'));
  await page.waitForTimeout(1500);
  await page.evaluate(() => {
    const vv = window.visualViewport, H0 = window.innerHeight; window.__H0 = H0;
    Object.defineProperty(vv, 'height', { configurable: true, get(){ return window.__vv.h == null ? H0 : window.__vv.h; } });
    Object.defineProperty(vv, 'offsetTop', { configurable: true, get(){ return window.__vv.top; } });
    switchTab('accounting'); openCardDebtEditor(0);
  });
  await page.waitForTimeout(900);
  const fire = (type) => page.evaluate((t) => { const el = document.querySelector('#cdd-balance'); const r = el.getBoundingClientRect(); const x = r.left + r.width / 2, y = r.top + r.height / 2; const ev = new Event(t, { bubbles: true, cancelable: true }); const tt = [{ clientX: x, clientY: y, identifier: 1, target: el }]; Object.defineProperty(ev, 'touches', { value: t === 'touchend' ? [] : tt }); Object.defineProperty(ev, 'changedTouches', { value: tt }); el.dispatchEvent(ev); }, type);
  await fire('touchstart'); await fire('touchend'); await page.waitForTimeout(250);
  await page.evaluate(() => { window.__vv.h = window.__H0 - 388; window.visualViewport.dispatchEvent(new Event('resize')); });
  await page.waitForTimeout(1000);
  fs.mkdirSync('docs/ui/kb-resume-4', { recursive: true });
  await page.screenshot({ path: 'docs/ui/kb-resume-4/before-keyboard-open-390-dark.png' }); // для порівняння: шторка з клавіатурою (клавіатуру показує iOS; тут імітація зсувом visualViewport, без самої клавіатури)
  await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); window.__vv.h = null; window.visualViewport.dispatchEvent(new Event('resize')); });
  await page.waitForTimeout(600);
  await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' }); document.dispatchEvent(new Event('visibilitychange')); });
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'docs/ui/kb-resume-4/keep-lift-after-return-390-dark.png' });
  await ctx.close();
});
