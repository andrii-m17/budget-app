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
        if(scrolled && which === 'card') expect(await page.evaluate(() => Number(getComputedStyle(document.documentElement).getPropertyValue('--sheet-vvtop'))), 'Android: зсув видимої області йде окремою складовою (--sheet-vvtop), підйом не подвоюється').toBeGreaterThan(300);
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

// Rev 2.32.248 (KB-2): iPhone — і картка з id, і вхід на одному конвеєрі: низ листа на 8 пт над краєм видимої області (стару гілку й перемикач прибрано).
test('38. iPhone: картка й вхід на одному конвеєрі — низ листа 8 пт над краєм видимої області (±1,5 пт)', async ({ browser }) => {

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
      const vvB = await page.evaluate(() => window.__vv.h); expect(Math.abs(bottom - (vvB - 8)), which + ': низ ' + bottom + ' проти ' + (vvB - 8)).toBeLessThanOrEqual(1.5);
      await page.evaluate(() => { document.activeElement && document.activeElement.blur(); window.__vv.h = null; window.visualViewport.dispatchEvent(new Event('resize')); });
      await page.waitForTimeout(700);
      await page.evaluate(() => { document.querySelectorAll('.drawer.open, .drawer-backdrop.open').forEach(d => d.classList.remove('open')); document.body.classList.remove('kb-open'); document.documentElement.classList.remove('kb-sheet'); });
    }
  } finally { await ctx.close(); }
});

// Rev 2.32.240 (KB-PIPE): Android-регресія за записом — Chrome прокручує видиму область (offsetTop 0 → 330) і під час, і після анімації підйому: позиція листа на екрані (rect.bottom − offsetTop) не відхиляється від цілі (vvH − 8) більш ніж на 2 пт (раніше лист «відлітав» і повертався).
test('39. Android-прокрутка видимої області: низ листа на екрані стабільний протягом усієї прокрутки (±2 пт), без стрибка вгору й назад', async ({ browser }) => {
  const { ctx, page } = await open(browser, devices['Pixel 7'], true, false);
  try{
    for(const concurrent of [false, true]){
      await page.evaluate(() => { window.__vv.h = null; window.__vv.top = 0; switchTab('accounting'); openCardDebtEditor(0); });
      await page.waitForTimeout(900);
      await page.evaluate(() => document.querySelector('#cdd-balance').scrollIntoView({ block: 'nearest' }));
      const bb = await page.locator('#cdd-balance').boundingBox(); await page.touchscreen.tap(bb.x + bb.width / 2, bb.y + bb.height / 2);
      await page.waitForTimeout(150);
      const K = await page.evaluate(() => Math.round(window.__H0 * 0.4));
      await page.evaluate(k => { window.__vv.h = window.__H0 - k; window.visualViewport.dispatchEvent(new Event('resize')); }, K);
      if(!concurrent) await page.waitForTimeout(500); // спершу підйом завершується, потім прокрутка
      const dev = [];
      for(const f of [0.003, 0.04, 0.17, 0.64, 0.9, 1]){
        await page.evaluate(([k, t]) => { window.__vv.top = Math.round(k * t); window.visualViewport.dispatchEvent(new Event('scroll')); }, [K, f]);
        await page.waitForTimeout(concurrent ? 25 : 60);
        if(!concurrent) dev.push(await page.evaluate(() => { const r = document.querySelector('#card-debt-drawer').getBoundingClientRect(); return Math.abs((r.bottom - window.__vv.top) - (window.__vv.h - 8)); }));
      }
      await page.waitForTimeout(700);
      dev.push(await page.evaluate(() => { const r = document.querySelector('#card-debt-drawer').getBoundingClientRect(); return Math.abs((r.bottom - window.__vv.top) - (window.__vv.h - 8)); }));
      dev.forEach((d, i) => expect(d, (concurrent ? 'одночасно' : 'після підйому') + ' · крок ' + i + ': відхилення ' + d).toBeLessThanOrEqual(2));
      await page.evaluate(() => { document.activeElement && document.activeElement.blur(); window.__vv.h = null; window.__vv.top = 0; window.visualViewport.dispatchEvent(new Event('resize')); });
      await page.waitForTimeout(700);
      await page.evaluate(() => { document.querySelectorAll('.drawer.open, .drawer-backdrop.open').forEach(d => d.classList.remove('open')); document.body.classList.remove('kb-open'); document.documentElement.classList.remove('kb-sheet'); });
    }
  } finally { await ctx.close(); }
});

// Rev 2.32.241 (KB-PIPE-CLOSE): закриття листа на Android при ненульовому зсуві видимої області: Chrome повертає offsetTop 330 → 0, зсув листа (--sheet-vvtop) іде кожен кадр разом із ним, без різкого скидання. Позиція листа на екрані (rect.bottom − offsetTop) лише опускається до спокою (не стрибає вгору більш ніж на 2 пт), у кінці — у стані спокою (±2 пт).
test('40. Android: закриття листа при offsetTop 330→0 — без стрибка, у кінці лист у спокої (±2 пт)', async ({ browser }) => {
  const { ctx, page } = await open(browser, devices['Pixel 7'], true, false);
  try{
    await page.evaluate(() => { window.__vv.h = null; window.__vv.top = 0; switchTab('accounting'); openCardDebtEditor(0); });
    await page.waitForTimeout(900);
    const rest = await page.evaluate(() => document.querySelector('#card-debt-drawer').getBoundingClientRect().bottom);
    await page.evaluate(() => document.querySelector('#cdd-balance').scrollIntoView({ block: 'nearest' }));
    const bb = await page.locator('#cdd-balance').boundingBox(); await page.touchscreen.tap(bb.x + bb.width / 2, bb.y + bb.height / 2);
    await page.waitForTimeout(150);
    const K = await page.evaluate(() => Math.round(window.__H0 * 0.4));
    await page.evaluate(k => { window.__vv.h = window.__H0 - k; window.visualViewport.dispatchEvent(new Event('resize')); }, K);
    await page.evaluate(k => { window.__vv.top = k; window.visualViewport.dispatchEvent(new Event('scroll')); }, K);
    await page.waitForTimeout(700);
    const vis = () => page.evaluate(() => { const r = document.querySelector('#card-debt-drawer').getBoundingClientRect(); return r.bottom - window.__vv.top; });
    const samples = [await vis()];
    await page.evaluate(() => { document.activeElement && document.activeElement.blur(); }); // закриття клавіатури: фокус пішов
    for(const f of [0.9, 0.64, 0.4, 0.17, 0.04, 0]){
      await page.evaluate(([k, t]) => { window.__vv.top = Math.round(k * t); window.visualViewport.dispatchEvent(new Event('scroll')); }, [K, f]);
      await page.waitForTimeout(35);
      samples.push(await vis());
    }
    await page.evaluate(() => { window.__vv.h = null; window.visualViewport.dispatchEvent(new Event('resize')); });
    await page.waitForTimeout(800);
    samples.push(await vis());
    for(let i = 1; i < samples.length; i++) expect(samples[i] - samples[i - 1], 'крок ' + i + ': лист не стрибає вгору (' + samples[i - 1] + ' → ' + samples[i] + ')').toBeGreaterThanOrEqual(-2);
    expect(Math.abs(samples[samples.length - 1] - rest), 'у кінці лист у спокої: ' + samples[samples.length - 1] + ' проти ' + rest).toBeLessThanOrEqual(2);
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--sheet-vvtop').trim()), 'зсув обнулено').toBe('0');
  } finally { await ctx.close(); }
});

// KB-8 (Rev 2.32.261): звіт MT-1106-6914 (iPhone, 2.32.260): на початку відкриття нижній лист стрибав на 106 пт вниз (низ 780 → 886, перший семпл анімації [14, 886]), при закритті на 106 пт угору (365 → 780).
// Причина: body.kb-open міняє --drawer-bottom-base 100 → 8, а шторки, що успадковують базу, миттєво змінюють свій layout-bottom (106 пт = зона таб-бару) до початку transform-анімації. Тест на справжній розмітці WebKit:
// для КОЖНОЇ .drawer низ у стані «відкрито» не залежить від body.kb-open (±2 пт), тож перший кадр відкриття = положення до дотику, а перший кадр закриття = положення відкритого листа.
test('41. KB-8: низ кожного нижнього листа не залежить від body.kb-open (немає миттєвого стрибка на 106 пт при відкритті й закритті)', async ({ browser }) => {
  const { ctx, page } = await open(browser, devices['iPhone 14'], 0, true);
  try{
    const res = await page.evaluate(() => {
      const out = [];
      document.querySelectorAll('.drawer').forEach(function(d){
        d.classList.add('open');
        document.body.classList.remove('kb-open'); void d.offsetHeight;
        const off = d.getBoundingClientRect().bottom;
        document.body.classList.add('kb-open'); void d.offsetHeight;
        const on = d.getBoundingClientRect().bottom;
        document.body.classList.remove('kb-open'); d.classList.remove('open');
        out.push({ id: d.id, off: Math.round(off * 10) / 10, on: Math.round(on * 10) / 10 });
      });
      return out;
    });
    expect(res.length).toBeGreaterThan(5);
    const bad = res.filter(r => Math.abs(r.on - r.off) > 2);
    expect(bad, 'листи зі зсувом низу при kb-open: ' + JSON.stringify(bad)).toEqual([]);
    expect(res.some(r => r.id === 'profile-drawer')).toBe(true);
    expect(res.some(r => r.id === 'mono-detail-drawer')).toBe(true);
  }finally{ await ctx.close(); }
});
