// Rev 2.32.239 (KB-UNIFIED): єдина формула підйому листа (vv.offsetTop + vv.height) і таб-бар. Клавіатуру емулюємо підміною visualViewport (height/offsetTop) + подія resize/scroll: реальної клавіатури в WebKit-емуляції нема.
const { test, expect, devices } = require('@playwright/test');
const { installClock } = require('./clock');
const PORT = process.env.E2E_PORT || 8935;
const CASES = [
  ['iPhone (перемикач увімкнено)', devices['iPhone 14'], 0, false, true],
  ['iPad портрет', devices['iPad (gen 7)'], 0, false],
  ['iPad ландшафт', devices['iPad (gen 7) landscape'], 0, false],
  ['Android (Chrome прокручує видиму область)', devices['Pixel 7'], 330, true],
];
async function open(browser, dev, android, flag){
  const ctx = await browser.newContext({ ...dev, serviceWorkers: 'block', baseURL: 'http://127.0.0.1:' + PORT });
  const page = await ctx.newPage();
  await installClock(page);
  if(flag) await page.addInitScript(() => { try{ localStorage.setItem('budget-kb-new-formula-iphone', '1'); }catch(e){} }); // перемикач «Нова формула клавіатури (iPhone)»
  await page.addInitScript(a => { window.__vv = { h: null, top: 0 }; if(a) Object.defineProperty(navigator, 'standalone', { get: () => undefined, configurable: true }); }, android); // Chrome не має navigator.standalone
  await page.goto('/index.html?fixture=typical');
  await page.waitForFunction(() => window.MockCloud && typeof cloudSession !== 'undefined' && cloudSession && cloudSession.user && document.querySelector('.tabbar-glass'));
  await page.waitForTimeout(1500);
  await page.evaluate(() => { const vv = window.visualViewport, H0 = window.innerHeight; window.__H0 = H0; Object.defineProperty(vv, 'height', { configurable: true, get(){ return window.__vv.h == null ? H0 : window.__vv.h; } }); Object.defineProperty(vv, 'offsetTop', { configurable: true, get(){ return window.__vv.top; } }); });
  return { ctx, page };
}
for(const [name, dev, scrolled, android, flag] of CASES){
  test('36. ' + name + ': низ листа (шторка з id і без id) стає на 8 пт вище нижньої межі видимої області (offsetTop + height); таб-бар ≥ 21 пт від низу', async ({ browser }) => {
    const { ctx, page } = await open(browser, dev, android, flag);
    try{
      const gap = await page.evaluate(() => { const r = document.querySelector('nav.tabbar').getBoundingClientRect(); return Math.round(window.innerHeight - r.bottom); });
      expect(gap, 'таб-бар від низу (сенсорний пристрій)').toBeGreaterThanOrEqual(21);
      for(const which of ['card', 'login']){
        await page.evaluate(w => { window.__vv.h = null; window.__vv.top = 0; if(w === 'card'){ switchTab('accounting'); openCardDebtEditor(0); } else showProfileLoginForm(); }, which);
        await page.waitForTimeout(900);
        const sel = which === 'card' ? '#card-debt-drawer' : '#profile-drawer', fld = which === 'card' ? '#cdd-balance' : '#cldfielda1';
        await page.evaluate(f => { document.querySelector(f).scrollIntoView({ block: 'nearest' }); }, fld);
        const bb = await page.locator(fld).boundingBox(); await page.touchscreen.tap(bb.x + bb.width / 2, bb.y + bb.height / 2);
        await page.waitForTimeout(150);
        const K = await page.evaluate(() => Math.round(window.__H0 * (window.__H0 > 900 ? 0.34 : 0.4))); // «справжня» висота клавіатури, не збігається з оцінкою застосунку (0,465)
        if(scrolled){ // Chrome прокручує видиму область за ≈ 0,2 с: offsetTop росте до висоти клавіатури
          await page.evaluate(k => { window.__vv.h = window.__H0 - k; window.visualViewport.dispatchEvent(new Event('resize')); }, K);
          for(const f of [0.003, 0.04, 0.17, 0.64, 0.9, 1]){ await page.evaluate(([k, t]) => { window.__vv.top = Math.round(k * t); window.visualViewport.dispatchEvent(new Event('scroll')); }, [K, f]); await page.waitForTimeout(40); }
        }else{
          await page.evaluate(k => { window.__vv.h = window.__H0 - k; window.visualViewport.dispatchEvent(new Event('resize')); }, K);
        }
        await page.waitForTimeout(1000);
        const r = await page.evaluate(s => { const b = document.querySelector(s).getBoundingClientRect(); return { bottom: b.bottom, target: window.__vv.top + window.__vv.h - 8, lift: getComputedStyle(document.documentElement).getPropertyValue('--sheet-lift') }; }, sel);
        expect(Math.abs(r.bottom - r.target), name + ' · ' + which + ' · низ ' + r.bottom + ' проти цілі ' + r.target + ' (lift ' + r.lift + ')').toBeLessThanOrEqual(1.5);
        if(scrolled) expect(Number(r.lift), 'Android: Chrome уже прокрутив — підйом не подвоюється').toBeLessThanOrEqual(Math.max(0, r.bottom - r.target) + 40);
        await page.evaluate(() => { document.activeElement && document.activeElement.blur(); window.__vv.h = null; window.__vv.top = 0; window.visualViewport.dispatchEvent(new Event('resize')); });
        await page.waitForTimeout(700);
        await page.evaluate(() => { document.querySelectorAll('.drawer.open, .drawer-backdrop.open').forEach(d => d.classList.remove('open')); document.body.classList.remove('kb-open'); document.documentElement.classList.remove('kb-sheet'); });
      }
    } finally { await ctx.close(); }
  });
}
test('37. desktop 1280×800: бічна панель на місці, таб-бар прихований: правило відступу таб-бара лише для pointer:coarse', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, serviceWorkers: 'block', baseURL: 'http://127.0.0.1:' + PORT });
  const page = await ctx.newPage();
  try{
    await installClock(page);
    await page.goto('/index.html?fixture=typical');
    await page.waitForFunction(() => window.MockCloud && typeof cloudSession !== 'undefined' && cloudSession && cloudSession.user);
    await page.waitForTimeout(1500);
    const d = await page.evaluate(() => ({ bottom: getComputedStyle(document.querySelector('nav.tabbar')).bottom, tabbar: getComputedStyle(document.querySelector('nav.tabbar')).display, side: !!document.querySelector('.side-panel') && getComputedStyle(document.querySelector('.side-panel')).display !== 'none' }));
    expect(d.tabbar, 'на desktop нижній таб-бар прихований (його замінює бічна панель)').toBe('none');
    expect(require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'index.html'), 'utf8')).toContain('@media (pointer: coarse){ nav.tabbar{ bottom:max(21px, calc(env(safe-area-inset-bottom) - 13px)); } }'); // Playwright WebKit без миші повідомляє pointer:coarse, тож значення на справжньому desktop (pointer:fine = 6px, як раніше) перевіряємо за джерелом
    expect(d.side, 'бічна панель').toBe(true);
  } finally { await ctx.close(); }
});

// Rev 2.32.239: iPhone за замовчуванням лишає стару поведінку підйому (позиція листа збігається зі станом до змін ±1 пт); значення зняті на старому коді в емуляції iPhone 14 (innerH 664), «справжня» клавіатура = оцінка застосунку (0,465 · innerH), реальний тап по полю.
test('38. iPhone за замовчуванням: позиція листа як до змін (±1 пт); з перемикачем — нова формула; перемикач у «Діагностиці» працює', async ({ browser }) => {
  const BASE = { card: 367, login: 439 };
  const { ctx, page } = await open(browser, devices['iPhone 14'], false, false);
  try{
    for(const which of ['card', 'login']){
      await page.evaluate(w => { window.__vv.h = null; window.__vv.top = 0; if(w === 'card'){ switchTab('accounting'); openCardDebtEditor(0); } else showProfileLoginForm(); }, which);
      await page.waitForTimeout(900);
      const sel = which === 'card' ? '#card-debt-drawer' : '#profile-drawer', fld = which === 'card' ? '#cdd-balance' : '#cldfielda1';
      await page.evaluate(f => { document.querySelector(f).scrollIntoView({ block: 'nearest' }); }, fld);
      const bb = await page.locator(fld).boundingBox(); await page.touchscreen.tap(bb.x + bb.width / 2, bb.y + bb.height / 2);
      await page.waitForTimeout(150);
      await page.evaluate(() => { const k = Math.round(window.__H0 * 0.465); window.__vv.h = window.__H0 - k; window.visualViewport.dispatchEvent(new Event('resize')); });
      await page.waitForTimeout(1000);
      const bottom = await page.evaluate(s2 => document.querySelector(s2).getBoundingClientRect().bottom, sel);
      expect(Math.abs(bottom - BASE[which]), which + ': ' + bottom + ' проти старого ' + BASE[which]).toBeLessThanOrEqual(1);
      await page.evaluate(() => { document.activeElement && document.activeElement.blur(); window.__vv.h = null; window.visualViewport.dispatchEvent(new Event('resize')); });
      await page.waitForTimeout(700);
      await page.evaluate(() => { document.querySelectorAll('.drawer.open, .drawer-backdrop.open').forEach(d => d.classList.remove('open')); document.body.classList.remove('kb-open'); document.documentElement.classList.remove('kb-sheet'); });
    }
    // перемикач у «Діагностиці»: вмикається локально й миттєво
    await page.evaluate(() => { openTestingDrawer(); });
    await page.waitForTimeout(500);
    expect(await page.locator('#kb-newf-btn').getAttribute('aria-checked')).toBe('false');
    await page.evaluate(() => toggleKbNewFormula());
    expect(await page.locator('#kb-newf-btn').getAttribute('aria-checked')).toBe('true');
    expect(await page.evaluate(() => [localStorage.getItem('budget-kb-new-formula-iphone'), kbUseNewFormula()])).toEqual(['1', true]);
    await page.evaluate(() => toggleKbNewFormula());
    expect(await page.evaluate(() => [localStorage.getItem('budget-kb-new-formula-iphone'), kbUseNewFormula()])).toEqual([null, false]);
  } finally { await ctx.close(); }
});
