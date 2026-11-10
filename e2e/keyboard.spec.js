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

// KB-9 (Rev 2.32.262): звіти MT-1106-6914 / MT-1106-7332 (iPhone): «Вхідні» Mono (mono-detail-drawer) вищий за вільне місце над клавіатурою: висота листа міняється миттєво (498 ↔ 471, без переходу max-height; анімується лише підйом), вміст обрізається, кнопки дії («Додати», «Ігнорувати») лишаються під клавіатурою.
// Тест на справжній розмітці WebKit: (1) кнопки дії у видимій області над клавіатурою, коли лист вищий за вільне місце; (2) max-height листа анімується (той самий перехід, що й підйом) і при відкритті, і при закритті.
test('42. KB-9: лист вищий за вільне місце — кнопки дії видно над клавіатурою, висота листа анімується', async ({ browser }) => {
  const { ctx, page } = await open(browser, devices['iPhone 14'], false, true);
  try{
    await page.evaluate(async () => { window.__vv.h = null; window.__vv.top = 0; await openMonoInbox(); monoInbox.rows = [{ id: 'sim1', status: 'new', tx_time: new Date().toISOString(), amount_uah: 120, description: 'Тест', suggested_category: '', suggested_subcategory: '', mono_account_id: 'x' }]; openMonoDetail('sim1'); document.getElementById('mono-detail-body').style.minHeight = '700px'; });
    await page.waitForTimeout(900);
    await page.evaluate(() => { document.getElementById('fldmono4').scrollIntoView({ block: 'nearest' }); });
    const bb = await page.locator('#fldmono4').boundingBox(); await page.touchscreen.tap(bb.x + bb.width / 2, bb.y + bb.height / 2);
    await page.waitForTimeout(150);
    await page.evaluate(() => { const k = Math.round(window.__H0 * 0.465); window.__vv.h = window.__H0 - k; window.visualViewport.dispatchEvent(new Event('resize')); });
    await page.waitForTimeout(1000);
    const r = await page.evaluate(() => {
      const vvB = window.__vv.h, dr = document.getElementById('mono-detail-drawer'), cs = getComputedStyle(dr);
      const rect = id => { const b = document.getElementById(id).getBoundingClientRect(); return { top: Math.round(b.top), bottom: Math.round(b.bottom) }; };
      return { vvB, add: rect('mono-detail-add'), ignore: rect('mono-detail-ignore'), drawer: rect('mono-detail-drawer'), tp: cs.transitionProperty, td: cs.transitionDuration, scrollH: dr.scrollHeight, clientH: dr.clientHeight };
    });
    if(process.env.KB9_SHOTS){ for(const th of ['light', 'dark']){ await page.evaluate(t => document.documentElement.setAttribute('data-theme', t), th); await page.waitForTimeout(300); await page.screenshot({ path: 'docs/ui/mockups/KB-9/vhidni-klaviatura-' + th + '.png' }); } } // знімки «Вхідних» з клавіатурою (емуляція): KB9_SHOTS=1
    expect(r.scrollH, 'лист справді вищий за вільне місце (умова тесту)').toBeGreaterThan(r.clientH);
    expect(r.add.bottom, 'кнопка «Додати» над клавіатурою: ' + JSON.stringify(r)).toBeLessThanOrEqual(r.vvB);
    expect(r.ignore.bottom, 'кнопка «Ігнорувати» над клавіатурою: ' + JSON.stringify(r)).toBeLessThanOrEqual(r.vvB);
    expect(r.add.top, 'кнопка «Додати» не вище екрана').toBeGreaterThanOrEqual(0);
    expect(r.tp, 'KB-18: max-height не входить у перехід (міняється одним кроком, не покадрово): ' + r.tp).not.toMatch(/max-height/);
    // закриття: перехід max-height діє й у фазі закриття (та сама крива, що й підйом)
    await page.evaluate(() => { document.activeElement && document.activeElement.blur(); window.__vv.h = null; window.visualViewport.dispatchEvent(new Event('resize')); });
    await page.waitForTimeout(120);
    const c = await page.evaluate(() => { const cs = getComputedStyle(document.getElementById('mono-detail-drawer')); return { tp: cs.transitionProperty, closing: document.documentElement.classList.contains('kb-sheet-closing') }; });
    expect(c.tp, 'KB-18: при закритті max-height теж не в переході: ' + JSON.stringify(c)).not.toMatch(/max-height/);
  }finally{ await ctx.close(); }
});

// KB-10 (Rev 2.32.263): звіт MT-1107-3790 (2.32.262, iPhone): у «Вхідних» з клавіатурою поле «Примітка» у фокусі лишалось на місці (343–391), а нижню частину листа займали прикріплені (KB-9) кнопки «Додати»/«Ігнорувати»: поле опинялось за ними, лист до поля не прокручувався.
// Тест на справжній розмітці WebKit: поле у фокусі повністю видно над прикріпленим блоком кнопок, відступ ≥ 8 пт.
test('43. KB-10: лист із прикріпленими кнопками — поле у фокусі над блоком кнопок (відступ ≥ 8 пт)', async ({ browser }) => {
  const { ctx, page } = await open(browser, devices['iPhone 14'], false, true);
  try{
    await page.evaluate(async () => { window.__vv.h = null; window.__vv.top = 0; await openMonoInbox(); monoInbox.rows = [{ id: 'sim1', status: 'new', tx_time: new Date().toISOString(), amount_uah: 120, description: 'Тест', suggested_category: '', suggested_subcategory: '', mono_account_id: 'x' }]; openMonoDetail('sim1'); });
    await page.waitForTimeout(900);
    // висота вмісту над полем така, щоб поле стояло приблизно на 260 пт від верху листа (там, де його закриє прикріплений блок кнопок), як у звіті
    await page.evaluate(() => { const b = document.getElementById('mono-detail-body'); b.style.minHeight = '0px'; const dr = document.getElementById('mono-detail-drawer'); const top0 = document.getElementById('fldmono4').getBoundingClientRect().top - dr.getBoundingClientRect().top; b.style.minHeight = Math.max(0, 260 - top0) + 'px'; });
    const bb = await page.locator('#fldmono4').boundingBox(); await page.touchscreen.tap(bb.x + bb.width / 2, bb.y + bb.height / 2);
    await page.waitForTimeout(150);
    await page.evaluate(() => { const k = Math.round(window.__H0 * 0.465); window.__vv.h = window.__H0 - k; window.visualViewport.dispatchEvent(new Event('resize')); });
    await page.waitForTimeout(1300);
    const r = await page.evaluate(() => {
      const dr = document.getElementById('mono-detail-drawer'), f = document.getElementById('fldmono4').getBoundingClientRect(), a = document.getElementById('mono-detail-actions').getBoundingClientRect();
      return { fieldTop: Math.round(f.top), fieldBottom: Math.round(f.bottom), actionsTop: Math.round(a.top), actionsBottom: Math.round(a.bottom), vvB: window.__vv.h, scrollTop: Math.round(dr.scrollTop), scrollH: dr.scrollHeight, clientH: dr.clientHeight, active: document.activeElement && document.activeElement.id };
    });
    expect(r.scrollH, 'лист вищий за вільне місце (умова тесту): ' + JSON.stringify(r)).toBeGreaterThan(r.clientH);
    expect(r.active).toBe('fldmono4');
    expect(r.fieldBottom, 'низ поля проти верху блоку кнопок (потрібен відступ ≥ 8): ' + JSON.stringify(r)).toBeLessThanOrEqual(r.actionsTop - 8);
    expect(r.fieldTop, 'поле не вище верху екрана: ' + JSON.stringify(r)).toBeGreaterThanOrEqual(0);
  }finally{ await ctx.close(); }
});

// KB-11 (Rev 2.32.264): звіт MT-1107-1889 (2.32.263, iPhone, 6 однакових циклів «Вхідні»): прокрутка до поля починалась лише через ~340 мс після початку підйому листа (після його зупинки), йшла одним кроком (49 пт), а курсор з'являвся, коли лист уже зупинився, але вміст ще їхав.
// Тест на справжній розмітці WebKit: від початку підйому листа (visualViewport.resize) семплуємо scrollTop і клас kb-sheet-moving (курсор прихований) щокадру.
test('44. KB-11: прокрутка до поля йде разом із підйомом листа (старт ≤ 70 мс, крок ≤ 20 пт, кінець разом з анімацією), курсор прихований до кінця всього руху', async ({ browser }) => {
  const { ctx, page } = await open(browser, devices['iPhone 14'], false, true);
  try{
    await page.evaluate(async () => { window.__vv.h = null; window.__vv.top = 0; await openMonoInbox(); monoInbox.rows = [{ id: 'sim1', status: 'new', tx_time: new Date().toISOString(), amount_uah: 120, description: 'Тест', suggested_category: '', suggested_subcategory: '', mono_account_id: 'x' }]; openMonoDetail('sim1'); });
    await page.waitForTimeout(900);
    await page.evaluate(() => { const b = document.getElementById('mono-detail-body'); b.style.minHeight = '0px'; const dr = document.getElementById('mono-detail-drawer'); const top0 = document.getElementById('fldmono4').getBoundingClientRect().top - dr.getBoundingClientRect().top; b.style.minHeight = Math.max(0, 260 - top0) + 'px'; });
    const bb = await page.locator('#fldmono4').boundingBox(); await page.touchscreen.tap(bb.x + bb.width / 2, bb.y + bb.height / 2);
    await page.waitForTimeout(450); // KB-18: FLIP від самого тапу завершено, f0 міряється без залишкового зсуву
    const s = await page.evaluate(() => new Promise(resolve => {
      const dr = document.getElementById('mono-detail-drawer'), out = []; const t0 = performance.now();
      const fe = document.getElementById('fldmono4'), f0 = fe.getBoundingClientRect().top - dr.getBoundingClientRect().top + dr.scrollTop; // KB-18: видиме положення вмісту (scrollTop ставиться одним кроком, рух — FLIP)
      const tick = () => { out.push([Math.round(performance.now() - t0), Math.round((f0 - (fe.getBoundingClientRect().top - dr.getBoundingClientRect().top)) * 10) / 10, document.documentElement.classList.contains('kb-sheet-moving')]); if(performance.now() - t0 < 1100) requestAnimationFrame(tick); else resolve(out); };
      requestAnimationFrame(tick);
      const k = Math.round(window.__H0 * 0.3); window.__vv.h = window.__H0 - k; window.visualViewport.dispatchEvent(new Event('resize'));
    }));
    const start0 = s[0][1], end = s[s.length - 1][1];
    expect(Math.abs(end - start0), 'прокрутка справді відбулась (умова тесту): ' + JSON.stringify(s.slice(-1))).toBeGreaterThan(30);
    const tStart = (s.find(r => Math.abs(r[1] - start0) > 1) || [9999])[0];
    const tEnd = (s.find(r => Math.abs(r[1] - end) <= 1) || [9999])[0];
    let maxStep = 0; for(let i = 1; i < s.length; i++) maxStep = Math.max(maxStep, Math.abs(s[i][1] - s[i - 1][1]));
    const tCaret = (s.find(r => r[2] === false && r[0] > 50) || [9999])[0]; // курсор показано (клас kb-sheet-moving знято)
    const info = 'від ' + start0 + ' до ' + end + ', старт прокрутки ' + tStart + ' мс, кінець ' + tEnd + ' мс, макс. крок ' + maxStep + ' пт, курсор показано ' + tCaret + ' мс';
    expect(tStart, 'прокрутка стартує разом із підйомом (≤ 2–3 кадрів): ' + info).toBeLessThanOrEqual(70);
    expect(maxStep, 'без кроку понад 20 пт за кадр: ' + info).toBeLessThanOrEqual(20);
    expect(tEnd, 'прокрутка закінчується разом з анімацією листа (≤ 330 мс): ' + info).toBeLessThanOrEqual(330);
    expect(tCaret, 'курсор не раніше кінця всієї прокрутки: ' + info).toBeGreaterThanOrEqual(tEnd - 20);
  }finally{ await ctx.close(); }
});

// KB-12 (Rev 2.32.265): звіт MT-1107-5492 (2.32.264, iPhone): iOS уточнює висоту клавіатури вже під час руху (vvH 478–479 → через 35–50 мс 505–506; при Face ID 479 → 583). CSS-перехід лише перезапускався з поточного положення з новою кривою: на 3–4 кадрі плато або зворотний крок, далі повільний хід.
// Тест на справжній розмітці WebKit: програємо послідовності vvH (415 → 388 через 40 мс; 415 → 311 через ~140 мс), семпли низу листа щокадру з часом. Перевіряємо: рух в один бік (415 → 388), жодного кадру без руху до кінця анімації. Різницю швидкості між кадрами (≤ 30 %) у headless WebKit міряти ненадійно (кадри 12–25 мс), її перевіряє детермінований tests/kb-lift-driver.test.js на тих самих функціях.
async function kb12Replay(page, kbs, delays){
  return await page.evaluate(([ks, ds]) => new Promise(resolve => {
    const dr = document.getElementById('card-debt-drawer'), out = []; const t0 = performance.now();
    const tick = () => { out.push([performance.now() - t0, dr.getBoundingClientRect().bottom]); if(performance.now() - t0 < 1000) requestAnimationFrame(tick); else resolve(out); };
    requestAnimationFrame(tick);
    ks.forEach((k, i) => setTimeout(() => { window.__vv.h = window.__H0 - Math.round(window.__H0 * k); window.visualViewport.dispatchEvent(new Event('resize')); }, ds[i]));
  }), [kbs, delays]);
}
// KB-22: кадри ближче 12 мс (rAF headless WebKit іноді віддає два виклики в одному кадрі композитора) у метриках руху не рахуються: «кадр без руху» має тривати не менше періоду кадру, інакше це артефакт вибірки, а не відсутність руху.
function kb12Metrics(s){
  const final = s[s.length - 1][1];
  const startY = s[0][1]; const t1 = (s.find(r => Math.abs(r[1] - startY) > 1) || [0])[0]; // початок руху: кадри до нього (запуск анімації з наступного кадру) не рахуємо
  const moving = [];
  for(let i = 1; i < s.length; i++){ const dt = s[i][0] - s[i - 1][0]; if(dt >= 12 && s[i][0] >= t1 && Math.abs(s[i][1] - final) > 3) moving.push({ t: s[i][0], y: s[i][1], v: (s[i][1] - s[i - 1][1]) / dt }); } // до фактичного кінця руху
  const reversals = moving.filter(r => r.v > 0.02).length; // низ листа йде вниз екрана (y росте), тоді як ціль вище
  const stalls = moving.filter(r => Math.abs(r.v) < 0.05).length; // кадр без руху, хоча до кінця ще > 3 пт
  // швидкість по двох сусідніх кадрах (згладжує нерівність часу кадрів); у порівнянні лише основна частина руху (≥ 40 % піку), розворот (зміна знаку) не рахується
  const sm = []; for(let i = 1; i < moving.length; i++){ const dt = moving[i].t - moving[i - 1].t; if(dt > 0) sm.push((moving[i].y - moving[i - 1].y) / dt); }
  const peak = Math.max(0, ...sm.map(Math.abs)); let maxJump = 0;
  for(let i = 1; i < sm.length; i++){ const a = Math.abs(sm[i - 1]); if(a >= 0.4 * peak && Math.sign(sm[i - 1]) === Math.sign(sm[i])) maxJump = Math.max(maxJump, Math.abs(Math.abs(sm[i]) - a) / a); }
  return { final: Math.round(final), reversals, stalls, maxJump: Math.round(maxJump * 100) / 100, frames: moving.length };
}
async function kb12Prepare(browser){
  const { ctx, page } = await open(browser, devices['iPhone 14'], false, true);
  await page.evaluate(() => { window.__vv.h = null; window.__vv.top = 0; switchTab('accounting'); openCardDebtEditor(0); });
  await page.waitForTimeout(900);
  await page.evaluate(() => { document.querySelector('#cdd-balance').scrollIntoView({ block: 'nearest' }); });
  const bb = await page.locator('#cdd-balance').boundingBox(); await page.touchscreen.tap(bb.x + bb.width / 2, bb.y + bb.height / 2);
  await page.waitForTimeout(200);
  return { ctx, page };
}
test('45. KB-12: клавіатура 415 → 388 через 40 мс — лист рухається в один бік, без плато, швидкість змінюється плавно', async ({ browser }) => {
  const { ctx, page } = await kb12Prepare(browser);
  try{
    const s = await kb12Replay(page, [0.465, 0.434], [0, 40]);
    const m = kb12Metrics(s), info = JSON.stringify(m) + JSON.stringify(s.slice(0, 16).map(r => [Math.round(r[0]), Math.round(r[1] * 10) / 10]));
    expect(m.frames, 'є кадри руху: ' + info).toBeGreaterThan(5);
    expect(m.reversals, 'рух лише в один бік: ' + info).toBe(0);
    expect(m.stalls, 'жодного кадру без руху до кінця анімації: ' + info + JSON.stringify(s.map(r => [Math.round(r[0]), Math.round(r[1] * 10) / 10]).slice(0, 40))).toBe(0);
  } finally { await ctx.close(); }
});
test('46. KB-12: Face ID 415 → 311 — один плавний розворот (без плато й ривків швидкості)', async ({ browser }) => {
  const { ctx, page } = await kb12Prepare(browser);
  try{
    const s = await kb12Replay(page, [0.465, 0.348], [0, 140]);
    const m = kb12Metrics(s), info = JSON.stringify(m);
    expect(m.frames, 'є кадри руху: ' + info).toBeGreaterThan(5);
    expect(m.stalls, 'кадри без руху лише в точці розвороту (≤ 3): ' + info).toBeLessThanOrEqual(3);
    expect(m.reversals, 'один розворот, без дрижання: ' + info).toBeGreaterThan(0);
  } finally { await ctx.close(); }
});

// KB-12 (Rev 2.32.266): підйом веде анімація браузера (Web Animations API, лише transform), а не покадровий JS: під час руху вона видна в element.getAnimations(), покадрового rAF підйому (kbLiftTick) немає, при зміні цілі стара анімація скасована, а нова стартує з поточного положення.
test('47. KB-12: підйом — анімація браузера (getAnimations, transform), без покадрового rAF; зміна цілі оновлює діючу анімацію', async ({ browser }) => {
  const { ctx, page } = await kb12Prepare(browser);
  try{
    const r = await page.evaluate(() => new Promise(resolve => {
      const dr = document.getElementById('card-debt-drawer'); let rafLift = 0;
      const origRaf = window.requestAnimationFrame.bind(window);
      window.requestAnimationFrame = fn => { if(fn && fn.name === 'kbLiftTick') rafLift++; return origRaf(fn); };
      const out = { first: null, second: null };
      const snap = () => dr.getAnimations().filter(a => a.effect && a.effect.getKeyframes && a.effect.getKeyframes().some(k => k.transform)).map(a => ({ props: Object.keys(a.effect.getKeyframes()[0]).filter(k => !['offset', 'computedOffset', 'easing', 'composite'].includes(k)), dur: Math.round(a.effect.getTiming().duration), playState: a.playState }));
      window.__vv.h = window.__H0 - Math.round(window.__H0 * 0.465); window.visualViewport.dispatchEvent(new Event('resize'));
      requestAnimationFrame(() => { out.first = snap(); setTimeout(() => {
        window.__vv.h = window.__H0 - Math.round(window.__H0 * 0.434); window.visualViewport.dispatchEvent(new Event('resize'));
        requestAnimationFrame(() => { out.second = snap(); setTimeout(() => { out.rafLift = rafLift; out.after = dr.getAnimations().filter(a => a.playState === 'running').length; resolve(out); }, 700); });
      }, 40); });
    }));
    expect(r.first.length, 'під час підйому є анімація transform: ' + JSON.stringify(r)).toBeGreaterThan(0);
    expect(r.first[0].props, 'лише transform: ' + JSON.stringify(r)).toEqual(['transform']);
    expect(r.second.filter(a => a.playState === 'running').length, 'під час передачі не більше двох анімацій transform: ' + JSON.stringify(r)).toBeLessThanOrEqual(2);
    expect(r.rafLift, 'покадрового rAF для підйому немає').toBe(0);
    expect(r.after, 'після завершення діючих анімацій листа нема').toBe(0);
  } finally { await ctx.close(); }
});

// KB-13 (Rev 2.32.267), B: звіт MT-1108-4073 (2.32.266, iPhone): перше відкриття центрованої форми «Додати ОЧ» з фокусом одразу в полі (не через kb-focus-proxy): sheet-anim open 588 → 622 (рух вниз), а наступне закриття стартує з 471: форма опинилась на 471 без анімації, стрибок ≈ 150 пт.
// Тест на справжній розмітці WebKit: відкриваємо модалку, чекаємо автофокусу, емулюємо клавіатуру, семплуємо низ форми щокадру: рух лише вгору до цілі (vv − 8), без кінцевого стрибка.
async function kb13Modal(browser, waitMs, kbFrac){
  const { ctx, page } = await open(browser, devices['iPhone 14'], false, true);
  await page.evaluate(() => { window.__vv.h = null; window.__vv.top = 0; switchTab('accounting'); openAddInstallmentModal(); });
  await page.waitForTimeout(waitMs == null ? 450 : waitMs);
  const bb = await page.locator('#app-modal-input').boundingBox();
  const sampler = page.evaluate(() => new Promise(resolve => {
    const m = document.getElementById('app-modal'), s = []; const t0 = performance.now();
    const tick = () => { s.push([Math.round(performance.now() - t0), Math.round(m.getBoundingClientRect().bottom * 10) / 10, document.activeElement && document.activeElement.id || '']); if(performance.now() - t0 < 1800) requestAnimationFrame(tick); else resolve(s); };
    requestAnimationFrame(tick);
  }));
  await page.touchscreen.tap(bb.x + bb.width / 2, bb.y + bb.height / 2);
  await page.waitForTimeout(150);
  await page.evaluate(k => { window.__vv.h = window.__H0 - Math.round(window.__H0 * k); window.visualViewport.dispatchEvent(new Event('resize')); }, kbFrac == null ? 0.465 : kbFrac);
  const series = await sampler;
  const vvB = await page.evaluate(() => window.__vv.h);
  return { ctx, page, series, vvB };
}
test('48. KB-13/B: «Додати ОЧ» з фокусом одразу в полі — форма рухається лише вгору до цілі над клавіатурою, без кінцевого стрибка', async ({ browser }) => {
  const { ctx, series, vvB } = await kb13Modal(browser, Number(process.env.KB13_WAIT || 450), Number(process.env.KB13_K || 0.465));
  try{
    const final = series[series.length - 1][1];
    const kbStart = (series.find(r => r[2] === 'app-modal-input' || r[2] === 'kb-focus-proxy') || [0])[0];
    const after = series.filter(r => r[0] >= kbStart + 100); // від початку підйому (resize клавіатури)
    let down = 0, maxStep = 0; for(let i = 1; i < after.length; i++){ const d = after[i][1] - after[i - 1][1]; if(d > 2) down++; maxStep = Math.max(maxStep, Math.abs(d)); }
    const info = JSON.stringify({ final, target: vvB - 8, down, maxStep: Math.round(maxStep) });
    expect(Math.abs(final - (vvB - 8)), 'форма стоїть на 8 пт над клавіатурою: ' + info).toBeLessThanOrEqual(2);
    expect(down, 'жодного кадру руху вниз (> 2 пт) під час підйому: ' + info).toBe(0);
    expect(maxStep, 'без кінцевого стрибка (крок ≤ 60 пт за кадр): ' + info).toBeLessThanOrEqual(60);
  } finally { await ctx.close(); }
});

// KB-13 (Rev 2.32.267), C: звіт MT-1108-4073: при закритті «Вхідних» вміст листа прокручується назад нерівно (перші ~60 мс scrollTop стоїть, далі іде нерівно, на кінці анімації лишається 6 пт і «доскакує» до 0 уже після кінця руху: дрижання в кінці закриття, у всіх 8 закриттях).
// Тест на справжній розмітці WebKit: відкриваємо «Вхідні» з клавіатурою (вміст прокручено), ховаємо клавіатуру й семплуємо scrollTop щокадру: рух від поточного до 0 лише в один бік, починається з перших кадрів, закінчується рівно на 0 разом із листом (до кінця переходу закриття), без «доскоку» після.
test('49. KB-13/C: закриття «Вхідних» — прокрутка вмісту до 0 разом з листом, без нерівностей і доскоку після кінця', async ({ browser }) => {
  const { ctx, page } = await open(browser, devices['iPhone 14'], false, true);
  try{
    await page.evaluate(async () => { window.__vv.h = null; window.__vv.top = 0; await openMonoInbox(); monoInbox.rows = [{ id: 'sim1', status: 'new', tx_time: new Date().toISOString(), amount_uah: 120, description: 'Тест', suggested_category: '', suggested_subcategory: '', mono_account_id: 'x' }]; openMonoDetail('sim1'); });
    await page.waitForTimeout(900);
    await page.evaluate(() => { const b = document.getElementById('mono-detail-body'); b.style.minHeight = '0px'; const dr = document.getElementById('mono-detail-drawer'); const top0 = document.getElementById('fldmono4').getBoundingClientRect().top - dr.getBoundingClientRect().top; b.style.minHeight = Math.max(0, 260 - top0) + 'px'; });
    const bb = await page.locator('#fldmono4').boundingBox(); await page.touchscreen.tap(bb.x + bb.width / 2, bb.y + bb.height / 2);
    await page.waitForTimeout(150);
    await page.evaluate(() => { window.__vv.h = window.__H0 - Math.round(window.__H0 * 0.3); window.visualViewport.dispatchEvent(new Event('resize')); });
    await page.waitForTimeout(1300);
    const s = await page.evaluate(() => new Promise(resolve => {
      const dr = document.getElementById('mono-detail-drawer'), out = []; const t0 = performance.now();
      const fe = document.getElementById('fldmono4'), f0 = fe.getBoundingClientRect().top - dr.getBoundingClientRect().top + dr.scrollTop; // KB-18: видиме положення вмісту (scrollTop ставиться одним кроком, рух — FLIP)
      const tick = () => { out.push([Math.round(performance.now() - t0), Math.round((f0 - (fe.getBoundingClientRect().top - dr.getBoundingClientRect().top)) * 10) / 10, document.documentElement.classList.contains('kb-sheet')]); if(performance.now() - t0 < 900) requestAnimationFrame(tick); else resolve(out); };
      requestAnimationFrame(tick);
      document.activeElement && document.activeElement.blur(); window.__vv.h = null; window.visualViewport.dispatchEvent(new Event('resize'));
    }));
    const start = s[0][1];
    expect(start, 'умова тесту: вміст прокручено перед закриттям').toBeGreaterThan(20);
    const tFirst = (s.find(r => Math.abs(r[1] - start) > 0.5) || [9999])[0];
    const tZero = (s.find(r => r[1] <= 0.01) || [9999])[0];
    const tClassOff = (s.find(r => r[2] === false) || [9999])[0]; // кінець переходу закриття (kb-sheet знято)
    let up = 0, maxStep = 0; for(let i = 1; i < s.length; i++){ const d = s[i][1] - s[i - 1][1]; if(d > 0.5) up++; if(i < 20) maxStep = Math.max(maxStep, Math.abs(d)); }
    const lateJump = s.filter(r => r[0] > tClassOff && r[1] > 0.5).length; // «доскок» після кінця руху
    const info = JSON.stringify({ start, tFirst, tZero, tClassOff, up, lateJump, maxStep: Math.round(maxStep) });
    expect(tFirst - s[0][0], 'прокрутка починає рух з перших кадрів закриття (≤ 40 мс від першого семпла): ' + info).toBeLessThanOrEqual(40);
    expect(up, 'без руху назад (вгору): ' + info).toBe(0);
    expect(tZero, 'доходить рівно до 0 до кінця переходу закриття: ' + info).toBeLessThanOrEqual(tClassOff + 10);
    expect(lateJump, 'без «доскоку» після кінця руху: ' + info).toBe(0);
  }finally{ await ctx.close(); }
});

// KB-14 (Rev 2.32.268), B: звіт MT-1108-2709 (2.32.267, iPhone): лист, що вміщується над клавіатурою, з клавіатурою стає на 6–8 пт нижчий (sheet-category 406 → 398 при верху листа 100; sheet-subcategory 451 → 443; sheet-dictionary 404 → 396; mono-detail-drawer до відкриття 581, після закриття 575), після закриття висота повертається.
// Тест на справжній розмітці WebKit: висота листа (offsetHeight і scrollHeight) з клавіатурою дорівнює висоті у спокої ±1 пт, коли лист вміщується, і після закриття повертається.
async function kb14Heights(page, sel){
  return await page.evaluate(s => { const d = document.querySelector(s); return { h: d.getBoundingClientRect().height, off: d.offsetHeight, sh: d.scrollHeight, top: Math.round(d.getBoundingClientRect().top), kbs: document.documentElement.classList.contains('kb-sheet') }; }, sel);
}
for(const [name, openFn, sel, fld] of [
  ['struct (sheet-category)', () => { showCategoryModal('Нова категорія', '', null, () => {}, null); }, '#struct-drawer', '#fldstr3'],
  ['mono-detail-drawer', async () => { await openMonoInbox(); monoInbox.rows = [{ id: 'sim1', status: 'new', tx_time: new Date().toISOString(), amount_uah: 120, description: 'Тест', suggested_category: '', suggested_subcategory: '', mono_account_id: 'x' }]; openMonoDetail('sim1'); }, '#mono-detail-drawer', '#fldmono4'],
  ['card-debt-drawer', () => { switchTab('accounting'); openCardDebtEditor(0); }, '#card-debt-drawer', '#cdd-balance'],
]){
  test('50. KB-14/B: ' + name + ' — висота листа з клавіатурою не змінюється, коли лист вміщується, і повертається після закриття', async ({ browser }) => {
    const { ctx, page } = await open(browser, devices['iPhone 14'], false, true);
    try{
      await page.evaluate(fn => { window.__vv.h = null; window.__vv.top = 0; return (new Function('return ' + fn))()(); }, openFn.toString());
      await page.waitForTimeout(1000);
      const rest = await kb14Heights(page, sel);
      await page.evaluate(f => { document.querySelector(f).scrollIntoView({ block: 'nearest' }); }, fld);
      const bb = await page.locator(fld).boundingBox(); await page.touchscreen.tap(bb.x + bb.width / 2, bb.y + bb.height / 2);
      await page.waitForTimeout(150);
      await page.evaluate(() => { window.__vv.h = window.__H0 - Math.round(window.__H0 * 0.12); window.visualViewport.dispatchEvent(new Event('resize')); }); // низька клавіатура: лист вміщується
      await page.waitForTimeout(1200);
      const kb = await kb14Heights(page, sel);
      await page.evaluate(() => { document.activeElement && document.activeElement.blur(); window.__vv.h = null; window.visualViewport.dispatchEvent(new Event('resize')); });
      await page.waitForTimeout(1200);
      const after = await kb14Heights(page, sel);
      const info = JSON.stringify({ rest, kb, after });
      expect(kb.kbs, 'умова тесту: клавіатурний режим увімкнено: ' + info).toBe(true);
      expect(kb.top, 'умова тесту: лист вміщується (верх не біля краю): ' + info).toBeGreaterThan(20);
      expect(Math.abs(kb.off - rest.off), 'висота з клавіатурою (offsetHeight) = висоті у спокої ±1: ' + info).toBeLessThanOrEqual(1);
      expect(Math.abs(kb.sh - rest.sh), 'scrollHeight з клавіатурою = у спокої ±1: ' + info).toBeLessThanOrEqual(1);
      expect(Math.abs(after.off - rest.off), 'після закриття висота повертається до значення до відкриття: ' + info).toBeLessThanOrEqual(1);
    } finally { await ctx.close(); }
  });
}

// KB-14 (Rev 2.32.268), A: звіт MT-1108-2709: центрована форма («Додати ОЧ», поле суми), vvH 478 → 505: анімація закінчується плато на 491–495, а kb-geometry vv-settled дає низ 497 (доскок 2–6 пт після кінця анімації, 6 з 6; нижні листи за тієї ж зміни цілі закінчують рівно на 497–498).
// Тест на справжній розмітці WebKit: послідовність 415 → 388 клавіатури (через 40 мс), семпли низу форми щокадру: значення в кінці анімації (≈ 450 мс після старту) дорівнює значенню через 600 мс ±1 пт, без доскоку.
test('51. KB-14/A: «Додати ОЧ», поле суми, клавіатура 415 → 388 — форма закінчує анімацію рівно на кінцевому положенні (±1 пт), без доскоку', async ({ browser }) => {
  const { ctx, page } = await open(browser, devices['iPhone 14'], false, true);
  try{
    await page.evaluate(() => { window.__vv.h = null; window.__vv.top = 0; switchTab('accounting'); openAddInstallmentModal(); });
    await page.waitForTimeout(500);
    await page.evaluate(() => { const d = document.createElement('div'); d.id = 'kb14-spacer'; d.style.height = '420px'; document.getElementById('app-modal').appendChild(d); }); // форма вища за вільне місце над клавіатурою: її висоту обмежує max-height, що росте разом з visualViewport (415 → 388)
    await page.waitForTimeout(100);
    const bb = await page.locator('#app-modal-amount-input').boundingBox();
    const sampler = page.evaluate(() => new Promise(resolve => {
      const m = document.getElementById('app-modal'), s = []; const t0 = performance.now();
      const tick = () => { s.push([Math.round(performance.now() - t0), Math.round(m.getBoundingClientRect().bottom * 10) / 10, m.offsetHeight]); if(performance.now() - t0 < 1500) requestAnimationFrame(tick); else resolve(s); };
      requestAnimationFrame(tick);
    }));
    await page.touchscreen.tap(bb.x + bb.width / 2, bb.y + bb.height / 2);
    await page.waitForTimeout(150);
    const tKb = await page.evaluate(() => { const t = performance.now(); window.__vv.h = window.__H0 - Math.round(window.__H0 * 0.465); window.visualViewport.dispatchEvent(new Event('resize')); setTimeout(() => { window.__vv.h = window.__H0 - Math.round(window.__H0 * 0.434); window.visualViewport.dispatchEvent(new Event('resize')); }, 40); return t; });
    const s = await sampler;
    const startAbs = await page.evaluate(() => performance.now());
    const endIdx = (() => { const finalY = s[s.length - 1][1]; for(let i = 0; i < s.length; i++) if(Math.abs(s[i][1] - finalY) <= 1.5 && s.slice(i).every(r => Math.abs(r[1] - finalY) <= 1.5)) return i; return s.length - 1; })();
    const lastMoving = s[Math.max(0, endIdx - 1)], settled = s[s.length - 1];
    const info = JSON.stringify({ lastMoving: lastMoving[1], settled: settled[1], heightMoving: lastMoving[2], heightSettled: settled[2], endAt: s[endIdx][0] });
    // доскок: різниця між положенням на кінець анімації (280 мс після початку підйому) і положенням у спокої
    const tStart = (s.find((r, i) => i > 0 && Math.abs(r[1] - s[i - 1][1]) > 1 && r[0] > 100) || [0])[0];
    const atEnd = (s.find(r => r[0] >= tStart + 330) || settled)[1];
    expect(Math.abs(settled[1] - atEnd), 'без доскоку після кінця анімації (±1 пт): ' + info + ' tStart ' + tStart + ', atEnd ' + atEnd).toBeLessThanOrEqual(1);
  } finally { await ctx.close(); }
});

// KB-15 (Rev 2.32.269), A: звіт MT-1108-1788 (2.32.267, Face ID): коли лист уже відкритий, а висота клавіатури міняється пізніше (через ~3 с vvH 479, потім 99 пт руху), лист рухається без sheet-anim і без caret-hidden: курсор видно під час руху.
// Тест на справжній розмітці WebKit: відкритий лист із клавіатурою, висота клавіатури міняється: лист рухається, курсор (kb-sheet-moving) прихований увесь рух і повертається після нього, подія sheet-anim (phase resize) записана.
test('52. KB-15/A: зміна висоти клавіатури при відкритому листі — рух тим самим механізмом: курсор прихований до кінця руху, sheet-anim записано', async ({ browser }) => {
  const { ctx, page } = await kb12Prepare(browser);
  try{
    await page.evaluate(() => { window.__vv.h = window.__H0 - Math.round(window.__H0 * 0.3); window.visualViewport.dispatchEvent(new Event('resize')); });
    await page.waitForTimeout(1500);
    const s = await page.evaluate(() => new Promise(resolve => {
      const dr = document.getElementById('card-debt-drawer'), out = []; const t0 = performance.now();
      const tick = () => { out.push([Math.round(performance.now() - t0), Math.round(dr.getBoundingClientRect().bottom * 10) / 10, document.documentElement.classList.contains('kb-sheet-moving')]); if(performance.now() - t0 < 1200) requestAnimationFrame(tick); else resolve(out); };
      requestAnimationFrame(tick);
      window.__vv.h = window.__H0 - Math.round(window.__H0 * 0.42); window.visualViewport.dispatchEvent(new Event('resize')); // клавіатура стала вищою (як після зникнення пропозиції)
    }));
    const startY = s[0][1], endY = s[s.length - 1][1];
    const moving = s.filter((r, i) => i > 0 && Math.abs(r[1] - s[i - 1][1]) > 0.3);
    const tMoveStart = moving.length ? moving[0][0] : 9999, tMoveEnd = moving.length ? moving[moving.length - 1][0] : 0;
    const caretDuring = moving.filter(r => r[2] === true).length, caretOff = moving.filter(r => r[2] === false).length;
    const caretAfter = (s.find(r => r[0] > Math.max(tMoveEnd, 320) + 120) || [0, 0, true])[2]; // курсор знімається після кінця руху (нижня межа 320 мс, як у відкритті)
    const ev = await page.evaluate(() => recBuf.filter(e => e.type === 'sheet-anim').map(e => e.phase));
    const info = JSON.stringify({ startY, endY, tMoveStart, tMoveEnd, caretDuring, caretOff, caretAfter, phases: ev });
    expect(Math.abs(endY - startY), 'лист справді рухався (умова тесту): ' + info).toBeGreaterThan(10);
    expect(caretOff, 'курсор прихований на всіх кадрах руху: ' + info).toBe(0);
    expect(caretAfter, 'після руху курсор повертається (≤ ~440 мс): ' + info).toBe(false);
    expect(ev.includes('resize'), 'подія sheet-anim (phase resize) записана: ' + info).toBe(true);
    // C: семпли відкриття йдуть до фактичного кінця руху (останній семпл = кінцеве положення, тривалість ≈ анімації, а не обрив на ~140 мс)
    const op = await page.evaluate(() => { const e = recBuf.filter(x => x.type === 'sheet-anim' && x.phase === 'open')[0]; return e ? { dur: e.durationMs, last: e.samples && e.samples.length ? e.samples[e.samples.length - 1][1] : null, firstY: e.samples && e.samples[0] ? e.samples[0][1] : null } : null; });
    expect(op && op.dur, 'тривалість семплів відкриття ≥ 240 мс (не обрив): ' + JSON.stringify(op)).toBeGreaterThanOrEqual(200);
  } finally { await ctx.close(); }
});

// KB-15 (Rev 2.32.269), B: звіт MT-1108-1788: перемикання пошта → пароль (нативне, зокрема автозаповнення iOS) йшло через допоміжне поле kb-focus-proxy (focusin cloud-password, focusin kb-focus-proxy, proxy-switch, focusin cloud-password), курсор на мить з'являвся на місці допоміжного поля, далі клавіатура закрилась.
// Тест: два поля одного листа з тим самим типом клавіатури, відкрита клавіатура, нативне перемикання (field.focus()): послідовність фокусу — лише нове поле, без kb-focus-proxy; клавіатурний режим не знімається.
test('53. KB-15/B: перемикання між полями листа (той самий тип клавіатури) — прямий фокус, без допоміжного поля, клавіатура не закривається', async ({ browser }) => {
  const { ctx, page } = await open(browser, devices['iPhone 14'], false, true);
  try{
    await page.evaluate(() => { window.__vv.h = null; window.__vv.top = 0; showProfileLoginForm(); });
    await page.waitForTimeout(900);
    const bb = await page.locator('#cldfielda1').boundingBox(); await page.touchscreen.tap(bb.x + bb.width / 2, bb.y + bb.height / 2);
    await page.waitForTimeout(150);
    await page.evaluate(() => { window.__vv.h = window.__H0 - Math.round(window.__H0 * 0.4); window.visualViewport.dispatchEvent(new Event('resize')); });
    await page.waitForTimeout(1200);
    const r = await page.evaluate(async () => {
      const seq = []; const h = e => seq.push(e.target.id || e.target.tagName);
      document.addEventListener('focusin', h, true);
      const before = { kbSheet: document.documentElement.classList.contains('kb-sheet'), kbOpen: document.body.classList.contains('kb-open'), active: document.activeElement && document.activeElement.id };
      document.getElementById('cloud-password').focus(); // нативне перемикання (стрілка «Далі» / автозаповнення iOS)
      await new Promise(res => setTimeout(res, 400));
      document.removeEventListener('focusin', h, true);
      return { seq, before, after: { kbSheet: document.documentElement.classList.contains('kb-sheet'), kbOpen: document.body.classList.contains('kb-open'), active: document.activeElement && document.activeElement.id }, closed: recBuf.filter(e => e.type === 'sheet-close').length };
    });
    const info = JSON.stringify(r);
    expect(r.before.active, 'умова тесту: фокус у пошті: ' + info).toBe('cldfielda1');
    expect(r.seq.includes('kb-focus-proxy'), 'без допоміжного поля: ' + info).toBe(false);
    expect(r.after.active, 'фокус у новому полі: ' + info).toBe('cloud-password');
    expect(r.after.kbSheet && r.after.kbOpen, 'клавіатурний режим не знято: ' + info).toBe(true);
  } finally { await ctx.close(); }
});

// KB-16 (Rev 2.32.270), C: звіт MT-1108-9004 (2.32.269, «Вхідні», закриття): focusout за ~45 мс до kb-vv-resize 894, sheet-close ще через ~16 мс, sheet-anim close 290 мс; стандартна тривалість клавіатури iOS 250 мс.
// Тест на справжній розмітці WebKit: від втрати фокуса (blur) закриття стартує одразу (перший рух ≤ 3 кадрів, 55 мс), перехід закриття триває 250 мс (обчислений transition-duration).
async function kb16Open(browser){
  const { ctx, page } = await kb12Prepare(browser);
  await page.evaluate(() => { window.__vv.h = window.__H0 - Math.round(window.__H0 * 0.3); window.visualViewport.dispatchEvent(new Event('resize')); });
  await page.waitForTimeout(1500);
  return { ctx, page };
}
test('54. KB-16/C: закриття стартує в момент втрати фокуса й триває 250 мс (кінець руху збігається з клавіатурою iOS)', async ({ browser }) => {
  const { ctx, page } = await kb16Open(browser);
  try{
    const s = await page.evaluate(() => new Promise(resolve => {
      const dr = document.getElementById('card-debt-drawer'), out = []; const t0 = performance.now();
      const tick = () => { out.push([performance.now() - t0, dr.getBoundingClientRect().bottom]); if(!window.__closeDur && document.documentElement.classList.contains('kb-sheet-closing')) window.__closeDur = getComputedStyle(dr).transitionDuration.split(',')[0].trim(); if(performance.now() - t0 < 900) requestAnimationFrame(tick); else resolve(out); };
      requestAnimationFrame(tick);
      document.activeElement && document.activeElement.blur();
      setTimeout(() => { window.__vv.h = null; window.visualViewport.dispatchEvent(new Event('resize')); }, 45); // iOS: vv приходить ~45 мс після focusout
    }));
    const closeDur = await page.evaluate(() => window.__closeDur);
    const startY = s[0][1], finalY = s[s.length - 1][1];
    const tStart = (s.find(r => Math.abs(r[1] - startY) > 1) || [9999])[0];
    const tEnd = (s.find((r, i) => Math.abs(r[1] - finalY) <= 1 && s.slice(i).every(q => Math.abs(q[1] - finalY) <= 1)) || [9999])[0];
    const info = JSON.stringify({ startY: Math.round(startY), finalY: Math.round(finalY), tStart: Math.round(tStart), tEnd: Math.round(tEnd), dur: Math.round(tEnd - tStart), closeDur });
    expect(tStart, 'рух закриття стартує одразу після втрати фокуса (≤ 3 кадри, 55 мс): ' + info).toBeLessThanOrEqual(55);
    expect(closeDur, 'тривалість переходу закриття 250 мс (було 280 через kb-pipe-ms): ' + info).toBe('0.25s');
  } finally { await ctx.close(); }
});

// KB-16 (Rev 2.32.270), A: звіт MT-1108-9004: при закритті sheet-anim close (484 → 780) і одночасно sheet-anim resize (473 → 780, 579 мс) з тим самим листом: під час зникнення клавіатури iOS шле проміжні кадри visualViewport, застосунок реагував на них «рухом при зміні висоти» (KB-15), а вже за мить починалось закриття.
// Тест: після втрати фокуса проміжні кадри vv (клавіатура ще «відкрита» за порогом) не запускають рух resize, і на листі в кожен момент не більше однієї анімації положення.
test('55. KB-16/A: закриття — один рух: проміжні кадри visualViewport після втрати фокуса не запускають resize; не більше однієї анімації положення', async ({ browser }) => {
  const { ctx, page } = await kb16Open(browser);
  try{
    const r = await page.evaluate(() => new Promise(resolve => {
      const dr = document.getElementById('card-debt-drawer'); let maxAnims = 0, dblMs = 0, tPrev = performance.now(); const t0 = tPrev; const H0 = window.__H0;
      const countAnims = () => dr.getAnimations().filter(a => a.playState === 'running' && ((a.effect && a.effect.getKeyframes && a.effect.getKeyframes().some(k => k.transform)) || a.transitionProperty === 'transform')).length;
      const tick = () => { maxAnims = Math.max(maxAnims, countAnims()); if(performance.now() - t0 < 900) requestAnimationFrame(tick); else resolve({ maxAnims, phases: recBuf.filter(e => e.type === 'sheet-anim' && e.wall > window.__t1).map(e => e.phase) }); };
      window.__t1 = Date.now(); requestAnimationFrame(tick);
      document.activeElement && document.activeElement.blur();
      [[10, 0.22], [30, 0.12], [50, 0.04], [70, null]].forEach(([ms, k]) => setTimeout(() => { window.__vv.h = k === null ? null : H0 - Math.round(H0 * k); window.visualViewport.dispatchEvent(new Event('resize')); }, ms)); // проміжні кадри зникнення клавіатури
    }));
    const info = JSON.stringify(r);
    expect(r.phases.includes('resize'), 'рух resize під час закриття не запускається: ' + info).toBe(false);
    expect(r.maxAnims, 'не більше однієї анімації положення одночасно: ' + info).toBeLessThanOrEqual(1);
  } finally { await ctx.close(); }
});

// KB-16 (Rev 2.32.270), B: звіт MT-1108-9004: центрована форма (sheet-account, поле суми), vvH 478 → 505: семпли 583 → 491/488 до ~90 мс, далі повільно 491 → 497 до ~340 мс: рух проскакує нову ціль на 6–9 пт і повертається.
// Тест: цілі першої ноги (клавіатура 415) і нової (388) із запізненням нового resize на 35 і 50 мс (як шле iOS): ціль не пролітається більш ніж на 2 пт, рух не повертається назад більш ніж на 2 пт. (Якщо нове уточнення приходить, коли лист уже минув нову ціль, повернення фізично неминуче; нова нога тоді стартує без початкової швидкості, без прольоту.)
for(const lateMs of [33, 39]){ // KB-22: затримки зі звітів (33–39 мс); 50 мс — на межі, де стара нога сама встигає пройти нову ціль до уточнення (фізичний перельот 1–5 пт залежить від джиттеру таймера)
  test('56. KB-16/B: «Додати ОЧ», поле суми, клавіатура 415 → 388 із запізненням ' + lateMs + ' мс — без перельоту, зворотний крок ≤ 0,5 пт', async ({ browser }) => {
    const { ctx, page } = await open(browser, devices['iPhone 14'], false, true);
    try{
      await page.evaluate(() => { window.__vv.h = null; window.__vv.top = 0; switchTab('accounting'); openAddInstallmentModal(); });
      await page.waitForTimeout(500);
      const bb = await page.locator('#app-modal-amount-input').boundingBox();
      const sampler = page.evaluate(() => new Promise(resolve => {
        const m = document.getElementById('app-modal'), s = []; // KB-19: міряється лише підйом (transform без -50 % висоти), а не низ: ступінь висоти (max-height) зрушує низ центрованої форми і давала недетермінованість; висоту перевіряє тест 59
        const t0 = performance.now();
        const tick = () => { s.push([Math.round(performance.now() - t0), new DOMMatrix(getComputedStyle(m).transform).m42 + m.offsetHeight / 2, m.offsetHeight, document.documentElement.style.getPropertyValue('--sheet-lift-target')]); if(performance.now() - t0 < 1600) requestAnimationFrame(tick); else resolve(s); };
        requestAnimationFrame(tick);
      }));
      await page.touchscreen.tap(bb.x + bb.width / 2, bb.y + bb.height / 2);
      await page.waitForTimeout(150);
      await page.evaluate(ms => { window.__vv.h = window.__H0 - Math.round(window.__H0 * 0.465); window.visualViewport.dispatchEvent(new Event('resize')); setTimeout(() => { window.__vv.h = window.__H0 - Math.round(window.__H0 * 0.434); window.visualViewport.dispatchEvent(new Event('resize')); }, ms); }, lateMs);
      const s = await sampler;
      const finalY = s[s.length - 1][1];
      const t1 = (s.find((r, i) => i > 0 && Math.abs(r[1] - s[i - 1][1]) > 1 && r[0] > 100) || [0])[0];
      const run = s.filter(r => r[0] >= t1 - 20);
      let minY = 1e9, back = 0, runMax = 0; for(let i = 0; i < run.length; i++){ minY = Math.min(minY, run[i][1]); if(i > 0 && run[i][1] - run[i - 1][1] > 0.3) back += run[i][1] - run[i - 1][1]; runMax = Math.max(runMax, run[i][1]); }
      const overshoot = finalY - minY; // наскільки пролетіло ціль угору (низ менший за кінцевий) перед поверненням
      const startY = s[0][1]; const flash = s.filter(r => r[0] > t1 + 20 && Math.abs(r[1] - startY) < 1.5).length; // KB-18/B (MT-1109-7870): кадр зі стартовим положенням посеред руху
      const info = JSON.stringify(s.filter(r => r[0] > 100).slice(0, 26).map(r => [r[0], Math.round(r[1] * 10) / 10])) + JSON.stringify({ finalY: Math.round(finalY * 10) / 10, minY: Math.round(minY * 10) / 10, overshoot: Math.round(overshoot * 10) / 10, backTravel: Math.round(back * 10) / 10, startY: Math.round(startY), flash });
      expect(flash, 'жодного кадру зі стартовим положенням посеред руху: ' + info).toBe(0);
      expect(overshoot, 'без перельоту (≤ 1 пт): ' + info).toBeLessThanOrEqual(1);
      expect(back, 'жодного зворотного кроку більше 0,5 пт (KB-20): ' + info).toBeLessThanOrEqual(0.5);
    } finally { await ctx.close(); }
  });
}

// KB-17 (Rev 2.32.271): опис Андрія (2.32.269): під час руху листа входу курсор уже видно в полі; при появі/зникненні пропозиції Face ID і в кінці появи клавіатури курсор стрибає (до заголовка «Вхід», до кнопки «Увійти»). У формах ОЧ курсор правильний.
// Причина: правило приховування html.kb-sheet-moving ... { caret-color: transparent } було прив'язане до id чотирьох листів (дохід, картка боргу, ОЧ, структура) і #app-modal; profile-drawer (вхід) і mono-detail-drawer до списку не входили.
// Тест на справжній розмітці WebKit: під час руху (клас kb-sheet-moving) обчислений caret-color полів входу (cldfielda1, cloud-password) і «Примітки» прозорий, як у app-modal-input.
const KB17_TRANSPARENT = /^rgba\(0, 0, 0, 0\)$|^transparent$/;
test('57. KB-17: під час руху листа caret-color полів входу й «Примітки» прозорий (як у формах ОЧ)', async ({ browser }) => {
  const { ctx, page } = await open(browser, devices['iPhone 14'], false, true);
  try{
    await page.evaluate(() => { window.__vv.h = null; window.__vv.top = 0; showProfileLoginForm(); });
    await page.waitForTimeout(900);
    const bb = await page.locator('#cldfielda1').boundingBox(); await page.touchscreen.tap(bb.x + bb.width / 2, bb.y + bb.height / 2);
    await page.waitForTimeout(150);
    const r = await page.evaluate(() => new Promise(resolve => {
      const ids = ['cldfielda1', 'cloud-password'], seen = []; const t0 = performance.now();
      const tick = () => {
        if(document.documentElement.classList.contains('kb-sheet-moving')) seen.push(ids.map(i => getComputedStyle(document.getElementById(i)).caretColor));
        if(performance.now() - t0 < 700) requestAnimationFrame(tick); else resolve(seen);
      };
      requestAnimationFrame(tick);
      window.__vv.h = window.__H0 - Math.round(window.__H0 * 0.4); window.visualViewport.dispatchEvent(new Event('resize'));
    }));
    const flat = [].concat(...r);
    const info = JSON.stringify({ frames: r.length, sample: r[0], visible: flat.filter(c => !KB17_TRANSPARENT.test(c)).length });
    expect(r.length, 'є кадри руху з прихованим курсором (умова тесту): ' + info).toBeGreaterThan(3);
    expect(flat.filter(c => !KB17_TRANSPARENT.test(c)).length, 'caret-color полів входу прозорий на всіх кадрах руху: ' + info).toBe(0);
  } finally { await ctx.close(); }
});
test('58. KB-17: caret-color «Примітки» у «Вхідних» і поля суми центрованої форми прозорі під час руху (охорона поряд із входом)', async ({ browser }) => {
  const { ctx, page } = await open(browser, devices['iPhone 14'], false, true);
  try{
    await page.evaluate(async () => { window.__vv.h = null; window.__vv.top = 0; await openMonoInbox(); monoInbox.rows = [{ id: 'sim1', status: 'new', tx_time: new Date().toISOString(), amount_uah: 120, description: 'Тест', suggested_category: '', suggested_subcategory: '', mono_account_id: 'x' }]; openMonoDetail('sim1'); });
    await page.waitForTimeout(900);
    const bb = await page.locator('#fldmono4').boundingBox(); await page.touchscreen.tap(bb.x + bb.width / 2, bb.y + bb.height / 2);
    await page.waitForTimeout(150);
    const r = await page.evaluate(() => new Promise(resolve => {
      const seen = []; const t0 = performance.now();
      const tick = () => { if(document.documentElement.classList.contains('kb-sheet-moving')) seen.push(getComputedStyle(document.getElementById('fldmono4')).caretColor); if(performance.now() - t0 < 700) requestAnimationFrame(tick); else resolve(seen); };
      requestAnimationFrame(tick);
      window.__vv.h = window.__H0 - Math.round(window.__H0 * 0.4); window.visualViewport.dispatchEvent(new Event('resize'));
    }));
    const info = JSON.stringify({ frames: r.length, sample: r[0], visible: r.filter(c => !KB17_TRANSPARENT.test(c)).length });
    expect(r.length, 'є кадри руху: ' + info).toBeGreaterThan(3);
    expect(r.filter(c => !KB17_TRANSPARENT.test(c)).length, 'caret-color «Примітки» прозорий під час руху: ' + info).toBe(0);
  } finally { await ctx.close(); }
});

// KB-18 (Rev 2.32.271), C: звіт MT-1109-7870: «Додати ОЧ» (центрована форма), перше відкриття: 584 → 594 за 170 мс, лише потім угору: висота форми росте покадрово (перехід max-height, KB-9), а низ центрованої форми рухається на половину зміни висоти проти руху підйому.
// Принцип «легкість»: max-height міняється одним кроком, не покадрово. Тест: форма вища за вільне місце, клавіатура 415 → 388: висота змінюється не більш ніж на одному кадрі (стрибок), без проміжних значень; низ не рухається вниз.
test('59. KB-18/C: центрована форма — max-height змінюється одним кроком (не покадрово), низ форми не йде вниз під час підйому', async ({ browser }) => {
  const { ctx, page } = await open(browser, devices['iPhone 14'], false, true);
  try{
    await page.evaluate(() => { window.__vv.h = null; window.__vv.top = 0; switchTab('accounting'); openAddInstallmentModal(); });
    await page.waitForTimeout(500);
    await page.evaluate(() => { const d = document.createElement('div'); d.style.height = '420px'; document.getElementById('app-modal').appendChild(d); });
    await page.waitForTimeout(100);
    const bb = await page.locator('#app-modal-amount-input').boundingBox();
    const sampler = page.evaluate(() => new Promise(resolve => {
      const m = document.getElementById('app-modal'), s = []; const t0 = performance.now();
      const tick = () => { s.push([Math.round(performance.now() - t0), m.getBoundingClientRect().bottom, m.getBoundingClientRect().height]); if(performance.now() - t0 < 1400) requestAnimationFrame(tick); else resolve(s); };
      requestAnimationFrame(tick);
    }));
    await page.touchscreen.tap(bb.x + bb.width / 2, bb.y + bb.height / 2);
    await page.waitForTimeout(150);
    await page.evaluate(() => { window.__vv.h = window.__H0 - Math.round(window.__H0 * 0.465); window.visualViewport.dispatchEvent(new Event('resize')); setTimeout(() => { window.__vv.h = window.__H0 - Math.round(window.__H0 * 0.434); window.visualViewport.dispatchEvent(new Event('resize')); }, 40); });
    const s = await sampler;
    let hSteps = 0, down = 0; for(let i = 1; i < s.length; i++){ if(Math.abs(s[i][2] - s[i - 1][2]) > 0.5) hSteps++; if(s[i][1] - s[i - 1][1] > 2 && s[i][0] > 200) down++; }
    const info = JSON.stringify({ hSteps, down, h0: Math.round(s[0][2]), hEnd: Math.round(s[s.length - 1][2]) });
    expect(hSteps, 'висота змінюється одним кроком, не покадрово: ' + info).toBeLessThanOrEqual(2);
    expect(down, 'низ форми не йде вниз під час підйому: ' + info).toBe(0);
  } finally { await ctx.close(); }
});

// KB-18 (Rev 2.32.272), інваріанти контролера руху на справжній розмітці: для кожної форми з клавіатурою кінець руху = ціль ±1; не більше однієї transform-анімації на формі; жодного кроку низу листа назад посеред підйому; швидкі цикли відкриття-закриття-відкриття (5 разів) не міняють ціль.
test('60. KB-18: інваріанти — 5 швидких циклів «фокус → клавіатура → закриття» не міняють ціль, рівно одна анімація, без руху назад', async ({ browser }) => {
  const { ctx, page } = await kb12Prepare(browser);
  try{
    const res = [];
    for(let i = 0; i < 5; i++){
      const r = await page.evaluate(() => new Promise(resolve => {
        const dr = document.getElementById('card-debt-drawer'), s = []; let maxAnims = 0, dblMs = 0, tPrev = performance.now(); const t0 = tPrev;
        const f = document.getElementById('cdd-balance');
        const tick = () => { s.push(dr.getBoundingClientRect().bottom); const nA = dr.getAnimations().filter(a => a.playState === 'running' && a.effect && a.effect.getComputedTiming().activeDuration > 0 && /transform/.test(JSON.stringify(a.effect.getKeyframes().map(k => Object.keys(k))))).length; maxAnims = Math.max(maxAnims, nA); const tn = performance.now(); if(nA > 1) dblMs += tn - tPrev; tPrev = tn; if(performance.now() - t0 < 900) requestAnimationFrame(tick); else { let back = 0; for(let j = 1; j < s.length; j++) if(s[j] - s[j - 1] > 2) back++; resolve({ end: s[s.length - 1], maxAnims, dblMs, back }); } };
        requestAnimationFrame(tick);
        window.__vv.h = window.__H0 - Math.round(window.__H0 * 0.434); window.visualViewport.dispatchEvent(new Event('resize'));
      }));
      res.push(r);
      await page.evaluate(() => { document.activeElement && document.activeElement.blur(); window.__vv.h = null; window.visualViewport.dispatchEvent(new Event('resize')); });
      await page.waitForTimeout(i < 4 ? 80 : 600); // швидко (≤ 80 мс) — наступне відкриття посеред закриття
      if(i < 4){ const bb = await page.locator('#cdd-balance').boundingBox(); await page.touchscreen.tap(bb.x + bb.width / 2, bb.y + bb.height / 2); await page.waitForTimeout(60); }
    }
    const ends = res.map(r => Math.round(r.end));
    const info = JSON.stringify(res.map(r => ({ end: Math.round(r.end), a: r.maxAnims, dbl: Math.round(r.dblMs), back: r.back })));
    expect(Math.max(...ends) - Math.min(...ends), 'ціль однакова в усіх циклах (±1): ' + info).toBeLessThanOrEqual(1);
    expect(Math.max(...res.map(r => r.maxAnims)), 'рівно одна transform-анімація на формі (KB-19): ' + info).toBeLessThanOrEqual(1);
    expect(Math.max(...res.map(r => r.back)), 'жодного кроку назад посеред підйому: ' + info).toBe(0);
  } finally { await ctx.close(); }
});

// KB-19 (Rev 2.32.273), D зі звіту MT-1109-7870: iOS уже прокрутила вміст (scrollFrom 26–27) до старту нашої анімації — подвійна прокрутка. Тандем з iOS: фокус лише з preventScroll, нативної прокрутки до поля немає; справжній scrollTop змінюється ОДИН раз (наш крок), перед ним лишається 0.
test('61. KB-19/D: тап по полю в листі — scrollTop змінюється один раз (наш крок), нативної прокрутки до поля немає', async ({ browser }) => {
  const { ctx, page } = await open(browser, devices['iPhone 14'], false, true);
  try{
    await page.evaluate(async () => { window.__vv.h = null; window.__vv.top = 0; await openMonoInbox(); monoInbox.rows = [{ id: 'sim1', status: 'new', tx_time: new Date().toISOString(), amount_uah: 120, description: 'Тест', suggested_category: '', suggested_subcategory: '', mono_account_id: 'x' }]; openMonoDetail('sim1'); });
    await page.waitForTimeout(900);
    await page.evaluate(() => { const b = document.getElementById('mono-detail-body'); b.style.minHeight = '0px'; const dr = document.getElementById('mono-detail-drawer'); const top0 = document.getElementById('fldmono4').getBoundingClientRect().top - dr.getBoundingClientRect().top; b.style.minHeight = Math.max(0, 260 - top0) + 'px'; });
    const bb = await page.locator('#fldmono4').boundingBox();
    const sampler = page.evaluate(() => new Promise(resolve => {
      const dr = document.getElementById('mono-detail-drawer'), out = []; const t0 = performance.now();
      const tick = () => { out.push([Math.round(performance.now() - t0), Math.round(dr.scrollTop * 10) / 10]); if(performance.now() - t0 < 1000) requestAnimationFrame(tick); else resolve(out); };
      requestAnimationFrame(tick);
    }));
    await page.touchscreen.tap(bb.x + bb.width / 2, bb.y + bb.height / 2);
    await page.waitForTimeout(150);
    await page.evaluate(() => { window.__vv.h = window.__H0 - Math.round(window.__H0 * 0.3); window.visualViewport.dispatchEvent(new Event('resize')); });
    const s = await sampler;
    const changes = []; for(let i = 1; i < s.length; i++) if(Math.abs(s[i][1] - s[i - 1][1]) > 0.5) changes.push(s[i][1]);
    const info = JSON.stringify({ changes, end: s[s.length - 1][1] });
    expect(changes.length, 'scrollTop змінюється не більше двох разів (наш крок на тапі й уточнення за vv), без нативного кроку: ' + info).toBeLessThanOrEqual(2);
    expect(changes.filter(v => v < s[s.length - 1][1] - 1).length, 'жодного проміжного значення між нулем і ціллю (подвійна прокрутка): ' + info).toBeLessThanOrEqual(1);
  } finally { await ctx.close(); }
});

// KB-20 (Rev 2.32.274), B (MT-1110-2783): клавіатура з'являється, поки лист ще виїжджає: обидва руху — один неперервний рух до кінцевої цілі, без кадру зі стрибком (було 1115 → 842 за 148 мс, далі 477 за кадр: 365 пт).
test('62. KB-20/B: клавіатура з’являється посеред виїзду листа входу — неперервний рух до цілі, жодного стрибка швидкості понад 6× середньої і руху вниз', async ({ browser }) => {
  const { ctx, page } = await open(browser, devices['iPhone 14'], false, true);
  try{
    await page.evaluate(() => { window.__vv.h = null; window.__vv.top = 0; });
    const s = await page.evaluate(() => new Promise(resolve => {
      const out = []; const t0 = performance.now();
      showProfileLoginForm();
      const dr = document.getElementById('profile-drawer');
      const tick = () => { out.push([Math.round(performance.now() - t0), dr.getBoundingClientRect().bottom]); if(performance.now() - t0 < 1200) requestAnimationFrame(tick); else resolve(out); };
      requestAnimationFrame(tick);
      setTimeout(() => { const f = document.getElementById('cldfielda1'); f.focus(); window.__vv.h = window.__H0 - Math.round(window.__H0 * 0.465); window.visualViewport.dispatchEvent(new Event('resize')); }, 60);
    }));
    let maxSpeed = 0, down = 0; for(let i = 1; i < s.length; i++){ const d = s[i][1] - s[i - 1][1], dt = Math.max(1, s[i][0] - s[i - 1][0]); if(i > 2) maxSpeed = Math.max(maxSpeed, Math.abs(d) / dt); if(d > 2 && s[i][0] > 100) down++; }
    const info = JSON.stringify({ maxSpeed: Math.round(maxSpeed * 10) / 10, down, seq: s.slice(0, 30).map(r => Math.round(r[1])), end: Math.round(s[s.length - 1][1]) });
    const travel = s[0][1] - s[s.length - 1][1];
    expect(maxSpeed, 'швидкість не більше 6× середньої (шлях/250 мс); до виправлення 30–34 пт/мс (9×) при середній ≈ 3,5; нормування на час кадру робить тест стійким до пропущених кадрів: ' + info).toBeLessThanOrEqual(6 * travel / 250);
    expect(down, 'без руху вниз посеред підйому: ' + info).toBe(0);
  } finally { await ctx.close(); }
});

// KB-21 (Rev 2.32.275), звіт MT-1110-0936: допоміжне поле відкривало текстову клавіатуру (kbH 416) перед цифровою (389) на полях суми. У момент фокуса допоміжного поля все, що визначає вигляд клавіатури iOS (inputmode, type, enterkeyhint, autocomplete), має збігатися з цільовим полем; після перенесення фокуса допоміжне — нейтральне.
for(const [name, openFn, fld] of [
  ['сума (app-modal-amount-input)', () => { switchTab('accounting'); openAddInstallmentModal(); }, '#app-modal-amount-input'],
  ['назва (sheet-category)', () => { showCategoryModal('Нова категорія', '', null, () => {}, null); }, '#fldstr3'],
]){
  test('63. KB-21: допоміжне поле в момент фокуса має атрибути клавіатури цільового — ' + name, async ({ browser }) => {
    const { ctx, page } = await open(browser, devices['iPhone 14'], false, true);
    try{
      await page.evaluate(fn => { window.__vv.h = null; window.__vv.top = 0; (new Function('return ' + fn))()(); window.__pf = []; const orig = HTMLElement.prototype.focus; HTMLElement.prototype.focus = function(o){ if(this.id === 'kb-focus-proxy'){ const A = e => ({ im: e.getAttribute('inputmode'), type: e.type, ek: e.getAttribute('enterkeyhint'), ac: e.getAttribute('autocomplete'), ph: e.getAttribute('autocapitalize'), ar: e.getAttribute('autocorrect'), sp: e.getAttribute('spellcheck') }); const t = document.querySelector('#app-modal.open input:not(#kb-focus-proxy):not([type=hidden])'); window.__pf.push({ proxy: A(this), target: window.__pt ? A(window.__pt) : null }); } return orig.apply(this, arguments); }; }, openFn.toString());
      await page.waitForTimeout(700);
      await page.evaluate(f => { const h = document.querySelector(f).closest('.drawer, .app-modal'); h.getAnimations = () => [{ playState: 'running' }]; }, fld); // KB-22: імітуємо «лист ще рухається» — фокус іде через допоміжне поле (у спокої він прямий, тест 64)
      await page.evaluate(f => { window.__pt = document.querySelector(f); }, fld);
      const bb = await page.locator(fld).boundingBox(); await page.touchscreen.tap(bb.x + bb.width / 2, bb.y + bb.height / 2);
      await page.waitForTimeout(150);
      await page.evaluate(() => { window.__vv.h = window.__H0 - Math.round(window.__H0 * 0.4); window.visualViewport.dispatchEvent(new Event('resize')); });
      await page.waitForTimeout(500);
      const pf = await page.evaluate(() => window.__pf);
      expect(pf.length, 'допоміжне поле отримало фокус').toBeGreaterThan(0);
      expect(pf[0].proxy, 'атрибути допоміжного = цільового: ' + JSON.stringify(pf[0])).toEqual(pf[0].target);
      const neutral = await page.evaluate(() => { const p = document.getElementById('kb-focus-proxy'); return p ? { im: p.getAttribute('inputmode'), type: p.type } : null; });
      expect(neutral === null || neutral.im === null, 'після перенесення фокуса допоміжне нейтральне: ' + JSON.stringify(neutral)).toBe(true);
    } finally { await ctx.close(); }
  });
}

// KB-22 (Rev 2.32.276), звіти MT-1110-2783/0936/1962: кожен дотик у поле йшов через kb-focus-proxy (focus-transfer), навіть коли поле видиме й форма в спокої: на полях суми клавіатура 416 → 389 (миготіння). Тепер видиме й доступне поле фокусується напряму в тому самому дотику (preventDefault + focus({preventScroll:true})); допоміжне поле лише коли цільове не можна сфокусувати (лист ще виїжджає тощо).
for(const [name, openFn, fld, direct] of [
  ['сума в «Додати ОЧ» (форма в спокої)', () => { switchTab('accounting'); openAddInstallmentModal(); }, '#app-modal-amount-input', true],
  ['назва в «Новій категорії» (форма в спокої)', () => { showCategoryModal('Нова категорія', '', null, () => {}, null); }, '#fldstr3', true],
]){
  test('64. KB-22: ' + name + ' — прямий фокус у дотику без допоміжного поля й без focus-transfer', async ({ browser }) => {
    const { ctx, page } = await open(browser, devices['iPhone 14'], false, true);
    try{
      await page.evaluate(fn => { window.__vv.h = null; window.__vv.top = 0; (new Function('return ' + fn))()(); window.__pf = 0; const orig = HTMLElement.prototype.focus; HTMLElement.prototype.focus = function(){ if(this.id === 'kb-focus-proxy') window.__pf++; return orig.apply(this, arguments); }; }, openFn.toString());
      await page.waitForTimeout(900);
      const bb = await page.locator(fld).boundingBox(); await page.touchscreen.tap(bb.x + bb.width / 2, bb.y + bb.height / 2);
      await page.waitForTimeout(150);
      await page.evaluate(() => { window.__vv.h = window.__H0 - Math.round(window.__H0 * 0.4); window.visualViewport.dispatchEvent(new Event('resize')); });
      await page.waitForTimeout(500);
      const r = await page.evaluate(f => ({ proxyFocus: window.__pf, active: document.activeElement && document.activeElement.id, want: document.querySelector(f).id, transfer: recBuf.filter(e => e.type === 'focus-transfer' || e.type === 'focus-transfer-forced').length, via: (recBuf.filter(e => e.type === 'sheet-open').pop() || {}).via || null }), fld);
      const info = JSON.stringify(r);
      expect(r.active, 'фокус на цільовому полі: ' + info).toBe(r.want);
      expect(r.proxyFocus, 'допоміжне поле не отримує фокус: ' + info).toBe(0);
      expect(r.transfer, 'focus-transfer не записується: ' + info).toBe(0);
      expect(r.via, 'sheet-open.via = direct: ' + info).toBe('direct');
    } finally { await ctx.close(); }
  });
}
test('65. KB-22: поле, що ще виїжджає разом із листом, фокусується через допоміжне (via: proxy), як і раніше', async ({ browser }) => {
  const { ctx, page } = await open(browser, devices['iPhone 14'], false, true);
  try{
    await page.evaluate(() => { window.__vv.h = null; window.__vv.top = 0; window.__pf = 0; const orig = HTMLElement.prototype.focus; HTMLElement.prototype.focus = function(){ if(this.id === 'kb-focus-proxy') window.__pf++; return orig.apply(this, arguments); }; switchTab('accounting'); openAddInstallmentModal(); });
    await page.waitForTimeout(40); // лист ще з'являється (CSS-анімація)
    const bb = await page.locator('#app-modal-amount-input').boundingBox(); await page.touchscreen.tap(bb.x + bb.width / 2, bb.y + bb.height / 2);
    await page.waitForTimeout(300);
    await page.evaluate(() => { window.__vv.h = window.__H0 - Math.round(window.__H0 * 0.4); window.visualViewport.dispatchEvent(new Event('resize')); });
    await page.waitForTimeout(500);
    const r = await page.evaluate(() => ({ proxyFocus: window.__pf, active: document.activeElement && document.activeElement.id }));
    expect(r.proxyFocus, 'через допоміжне поле: ' + JSON.stringify(r)).toBeGreaterThan(0);
  } finally { await ctx.close(); }
});

// KB-23 (Rev 2.32.277): для видимого поля в спокійному листі допоміжне поле НІКОЛИ не отримує фокус — для сум, назв і полів входу.
test('64b. KB-23: видиме поле — допоміжне поле ніколи не отримує фокус (сума, назва, вхід)', async ({ browser }) => {
  const { ctx, page } = await open(browser, devices['iPhone 14'], false, true);
  try{
    await page.evaluate(() => { window.__vv.h = null; window.__vv.top = 0; window.__pf = 0; const orig = HTMLElement.prototype.focus; HTMLElement.prototype.focus = function(){ if(this.id === 'kb-focus-proxy') window.__pf++; return orig.apply(this, arguments); }; });
    for(const [fn, fld] of [[() => { switchTab('accounting'); openAddInstallmentModal(); }, '#app-modal-amount-input'], [() => { showProfileLoginForm(); }, '#cldfielda1'], [() => { showCategoryModal('Нова категорія', '', null, () => {}, null); }, '#fldstr3']]){
      await page.evaluate(f => (new Function('return ' + f))()(), fn.toString());
      await page.waitForTimeout(900);
      const bb = await page.locator(fld).boundingBox(); await page.touchscreen.tap(bb.x + bb.width / 2, bb.y + bb.height / 2);
      await page.waitForTimeout(150);
      await page.evaluate(() => { window.__vv.h = window.__H0 - Math.round(window.__H0 * 0.4); window.visualViewport.dispatchEvent(new Event('resize')); });
      await page.waitForTimeout(400);
      const r = await page.evaluate(f => ({ pf: window.__pf, active: document.activeElement && document.activeElement.id, want: document.querySelector(f).id, via: (recBuf.filter(e => e.type === 'sheet-open').pop() || {}).via }), fld);
      expect(r.pf, fld + ': ' + JSON.stringify(r)).toBe(0);
      expect(r.active, fld + ': ' + JSON.stringify(r)).toBe(r.want);
      expect(r.via, fld + ': ' + JSON.stringify(r)).toBe('direct');
      await page.evaluate(() => { document.activeElement && document.activeElement.blur(); window.__vv.h = null; window.visualViewport.dispatchEvent(new Event('resize')); document.querySelectorAll('.drawer.open, .drawer-backdrop.open, .app-modal.open').forEach(d => d.classList.remove('open')); document.body.classList.remove('kb-open'); document.documentElement.classList.remove('kb-sheet'); });
      await page.waitForTimeout(500);
    }
  } finally { await ctx.close(); }
});

// KB-22 (доробка): name не порівнюється: його не копіюють за правилом полів вводу (не впливає на клавіатуру; у полів суми його немає).
// KB-22 (доробка, Rev 2.32.276), пункт 2: повна різниця між допоміжним і цільовим полем у момент фокуса допоміжного: усі атрибути й властивості, що можуть впливати на клавіатуру iOS (рядок підказок, автовиправлення, великі літери, перевірка правопису, тип клавіатури, дія Enter, автозаповнення). Різниці бути не повинно; службові (id, class, style, aria-*, tabindex, on*, for) не рахуються.
for(const [name, openFn, fld] of [
  ['сума', () => { switchTab('accounting'); openAddInstallmentModal(); }, '#app-modal-amount-input'],
  ['назва', () => { showCategoryModal('Нова категорія', '', null, () => {}, null); }, '#fldstr3'],
]){
  test('66. KB-22: повна різниця атрибутів допоміжного й цільового поля порожня — ' + name, async ({ browser }) => {
    const { ctx, page } = await open(browser, devices['iPhone 14'], false, true);
    try{
      await page.evaluate(fn => { window.__vv.h = null; window.__vv.top = 0; (new Function('return ' + fn))()(); window.__pdiff = null; const orig = HTMLElement.prototype.focus; HTMLElement.prototype.focus = function(){ if(this.id === 'kb-focus-proxy' && !window.__pdiff && window.__pt){ const t = window.__pt, p = this; const skip = n => /^(id|class|style|tabindex|for|placeholder|name|data-.*|aria-.*|on.*)$/.test(n); const names = new Set(); [t, p].forEach(e => Array.from(e.attributes).forEach(a => { if(!skip(a.name)) names.add(a.name); })); const d = []; names.forEach(n => { if(t.getAttribute(n) !== p.getAttribute(n)) d.push('attr ' + n + ': proxy=' + p.getAttribute(n) + ' target=' + t.getAttribute(n)); }); ['autocapitalize', 'autocorrect', 'spellcheck', 'inputMode', 'enterKeyHint', 'type', 'maxLength', 'minLength', 'pattern', 'readOnly', 'disabled', 'autocomplete', 'lang', 'dir'].forEach(k => { const a = t[k], b = p[k]; if(String(a) !== String(b)) d.push('prop ' + k + ': proxy=' + b + ' target=' + a); }); window.__pdiff = d; } return orig.apply(this, arguments); }; }, openFn.toString());
      await page.waitForTimeout(700);
      await page.evaluate(f => { window.__pt = document.querySelector(f); const h = window.__pt.closest('.drawer, .app-modal'); h.getAnimations = () => [{ playState: 'running' }]; }, fld);
      const bb = await page.locator(fld).boundingBox(); await page.touchscreen.tap(bb.x + bb.width / 2, bb.y + bb.height / 2);
      await page.waitForTimeout(300);
      const d = await page.evaluate(() => window.__pdiff);
      expect(d, 'допоміжне поле отримало фокус').not.toBeNull();
      expect(d, 'різниця допоміжне ≠ цільове: ' + JSON.stringify(d)).toEqual([]);
    } finally { await ctx.close(); }
  });
}

// KB-24 (Rev 2.32.279), звіт MT-1110-8421: A — перемикання назва ↔ сума (нативне: стрілки/«Далі») ішло через допоміжне поле (focusin поле → proxy → поле) і курсор був видно до vv-resize; B — закриття під час resize давало дві анімації й стрибок; C — зсув сторінки iOS посеред відкриття давав стрибок 365 пт.
test('67. KB-24/A: нативне перемикання назва → сума: допоміжне поле не отримує фокус; курсор прихований з focusin і показаний не пізніше 400 мс без зміни висоти', async ({ browser }) => {
  const { ctx, page } = await open(browser, devices['iPhone 14'], false, true);
  try{
    await page.evaluate(() => { window.__vv.h = null; window.__vv.top = 0; window.__pf = 0; window.__fi = []; const orig = HTMLElement.prototype.focus; HTMLElement.prototype.focus = function(){ if(this.id === 'kb-focus-proxy') window.__pf++; return orig.apply(this, arguments); }; document.addEventListener('focusin', e => window.__fi.push(e.target.id), true); switchTab('accounting'); openAddInstallmentModal(); });
    await page.waitForTimeout(900);
    const bb = await page.locator('#app-modal-input').boundingBox(); await page.touchscreen.tap(bb.x + bb.width / 2, bb.y + bb.height / 2);
    await page.waitForTimeout(150);
    await page.evaluate(() => { window.__vv.h = window.__H0 - Math.round(window.__H0 * 0.465); window.visualViewport.dispatchEvent(new Event('resize')); });
    await page.waitForTimeout(700);
    await page.evaluate(() => { window.__pf = 0; window.__fi = []; });
    await page.evaluate(() => { document.getElementById('app-modal-amount-input').focus(); }); // нативне перемикання (стрілка/«Далі»): без дотику
    await page.waitForTimeout(30);
    const early = await page.evaluate(() => document.documentElement.classList.contains('kb-sheet-moving'));
    await page.waitForTimeout(500);
    const r = await page.evaluate(() => ({ pf: window.__pf, fi: window.__fi.slice(), moving: document.documentElement.classList.contains('kb-sheet-moving'), active: document.activeElement.id }));
    const info = JSON.stringify({ early, ...r });
    expect(r.pf, 'допоміжне поле не отримує фокус: ' + info).toBe(0);
    expect(r.fi, 'послідовність focusin без допоміжного: ' + info).toEqual(['app-modal-amount-input']);
    expect(early, 'курсор прихований з focusin нового поля: ' + info).toBe(true);
    expect(r.moving, 'без зміни висоти курсор показано до 400 мс (500 мс після focusin): ' + info).toBe(false);
  } finally { await ctx.close(); }
});
test('68. KB-24/B: закриття посеред resize (vvH 479 → 506 → 894, інтервали 60 і 45 мс) — рівно одна анімація, без стрибка', async ({ browser }) => {
  const { ctx, page } = await open(browser, devices['iPhone 14'], false, true);
  try{
    await page.evaluate(() => { window.__vv.h = null; window.__vv.top = 0; showProfileLoginForm(); });
    await page.waitForTimeout(900);
    const bb = await page.locator('#cldfielda1').boundingBox(); await page.touchscreen.tap(bb.x + bb.width / 2, bb.y + bb.height / 2);
    await page.waitForTimeout(150);
    const s = await page.evaluate(() => new Promise(resolve => {
      const dr = document.getElementById('profile-drawer'), out = []; const t0 = performance.now();
      const tick = () => { const run = dr.getAnimations().filter(a => a.playState === 'running').length; out.push([Math.round(performance.now() - t0), dr.getBoundingClientRect().bottom, run]); if(performance.now() - t0 < 1100) requestAnimationFrame(tick); else resolve(out); };
      requestAnimationFrame(tick);
      const set = k => { window.__vv.h = k === null ? null : window.__H0 - Math.round(window.__H0 * k); window.visualViewport.dispatchEvent(new Event('resize')); };
      set(0.465);
      setTimeout(() => set(0.434), 60);
      setTimeout(() => { document.activeElement && document.activeElement.blur(); }, 105);
      [[130, 0.34], [160, 0.22], [190, 0.1], [220, null]].forEach(([t, k]) => setTimeout(() => set(k), t)); // клавіатура ховається не миттєво: vv росте за ~100–250 мс після focusout
    }));
    const ys = s.map(r => r[1]); const travel = Math.max(...ys) - Math.min(...ys);
    let maxStep = 0, maxRun = 0; for(let i = 1; i < s.length; i++){ if(s[i][0] > 100){ maxStep = Math.max(maxStep, Math.abs(s[i][1] - s[i - 1][1])); maxRun = Math.max(maxRun, s[i][2]); } }
    const info = JSON.stringify({ travel: Math.round(travel), maxStep: Math.round(maxStep), maxRun, seq: s.slice(5, 22).map(r => [r[0], Math.round(r[1]), r[2]]) });
    expect(maxRun, 'рівно одна анімація на формі після закриття: ' + info).toBeLessThanOrEqual(1);
    expect(maxStep, 'жодного стрибка понад 45 % шляху за кадр: ' + info).toBeLessThanOrEqual(0.45 * travel);
  } finally { await ctx.close(); }
});
test('69. KB-24/C: зсув сторінки iOS (361) посеред відкриття, повернутий correctPanIfNeeded — видиме положення не стрибає (FLIP), швидкість руху не більше 8× середньої', async ({ browser }) => {
  const { ctx, page } = await open(browser, devices['iPhone 14'], false, true);
  try{
    await page.evaluate(() => { window.__vv.h = null; window.__vv.top = 0; showProfileLoginForm(); });
    await page.waitForTimeout(900);
    const bb = await page.locator('#cldfielda1').boundingBox(); await page.touchscreen.tap(bb.x + bb.width / 2, bb.y + bb.height / 2);
    const s = await page.evaluate(() => new Promise(resolve => {
      const dr = document.getElementById('profile-drawer'), out = [], root = document.documentElement; const t0 = performance.now();
      let shifted = false;
      // емуляція iOS: сторінка зсунута (видима область на 361 нижче) до виклику scrollTo(0,0); після нього сторінка й offsetTop повертаються
      window.scrollTo = function(){ root.style.transform = ''; shifted = false; window.__vv.top = 0; window.visualViewport.dispatchEvent(new Event('scroll')); };
      const tick = () => { out.push([Math.round(performance.now() - t0), dr.getBoundingClientRect().bottom, shifted]); if(performance.now() - t0 < 1100) requestAnimationFrame(tick); else resolve(out); };
      requestAnimationFrame(tick);
      setTimeout(() => { window.__vv.h = window.__H0 - Math.round(window.__H0 * 0.465); window.visualViewport.dispatchEvent(new Event('resize')); }, 40);
      setTimeout(() => { shifted = true; root.style.transform = 'translateY(-361px)'; window.__vv.top = 361; window.visualViewport.dispatchEvent(new Event('scroll')); }, 110);
    }));
    const ys = s.map(r => r[1]); const travel = Math.max(...ys) - Math.min(...ys);
    let maxSpeed = 0; for(let i = 1; i < s.length; i++){ if(s[i][0] <= 100 || (s[i][2] && !s[i - 1][2])) continue; maxSpeed = Math.max(maxSpeed, Math.abs(s[i][1] - s[i - 1][1]) / Math.max(1, s[i][0] - s[i - 1][0])); } // сам зсув (кадр, де сторінка зсунулась) робить iOS, не ми; швидкість, а не крок: довгий кадр (головний потік зайнятий) не є стрибком
    const avg = travel / 250;
    const info = JSON.stringify({ travel: Math.round(travel), maxSpeed: Math.round(maxSpeed * 10) / 10, avg: Math.round(avg * 10) / 10, seq: s.slice(5, 26).map(r => [r[0], Math.round(r[1]), r[2] ? 1 : 0]) });
    expect(maxSpeed, 'швидкість не більше 8× середньої (шлях/250 мс); до виправлення стрибок 346–359 пт за кадр ≈ 10× середньої: ' + info).toBeLessThanOrEqual(8 * avg);
  } finally { await ctx.close(); }
});

// KB-25 (Rev 2.32.281), звіт MT-1111-6091 (2.32.279): перемикання стрілками (без дотику): A — власна прокрутка iOS (scrollY/offsetTop 0 → 6 → 12, один раз 112) зсувала лист, а наші обробники скидали її на кожну подію («гойдалка»); B — подвійна field-scroll при зміні типу клавіатури; C — курсор ховався без руху.
async function kb25Open(browser, withSpacer){
  const { ctx, page } = await open(browser, devices['iPhone 14'], false, true);
  await page.evaluate(() => { window.__vv.h = null; window.__vv.top = 0; showProfileLoginForm(); });
  await page.waitForTimeout(900);
  if(withSpacer) await page.evaluate(() => { const pw = document.getElementById('cloud-password'); const sp = document.createElement('div'); sp.id = 'kb25-spacer'; sp.style.height = '0px'; pw.parentNode.insertBefore(sp, pw); });
  const bb = await page.locator('#cldfielda1').boundingBox(); await page.touchscreen.tap(bb.x + bb.width / 2, bb.y + bb.height / 2);
  await page.waitForTimeout(150);
  await page.evaluate(() => { window.__vv.h = window.__H0 - Math.round(window.__H0 * 0.465); window.visualViewport.dispatchEvent(new Event('resize')); });
  await page.waitForTimeout(700);
  return { ctx, page };
}
for(const seq of [[6, 12], [112]]){
  test('70. KB-25/A: стрілки, iOS прокручує сторінку (' + seq.join(' → ') + ') — видиме положення листа не змінюється більше ніж на 2 пт', async ({ browser }) => {
    const { ctx, page } = await kb25Open(browser, false);
    try{
      const r = await page.evaluate(seq => new Promise(resolve => {
        const dr = document.getElementById('profile-drawer'), root = document.documentElement, out = []; const t0 = performance.now();
        window.scrollTo = function(){ root.style.transform = ''; window.__vv.top = 0; window.visualViewport.dispatchEvent(new Event('scroll')); }; // емуляція: iOS повертає сторінку після scrollTo(0,0)
        const base = dr.getBoundingClientRect().bottom;
        document.getElementById('cloud-password').focus(); // нативне перемикання: без дотику
        const tick = () => { out.push([Math.round(performance.now() - t0), dr.getBoundingClientRect().bottom - base]); if(performance.now() - t0 < 900) requestAnimationFrame(tick); else resolve(out); };
        requestAnimationFrame(tick);
        seq.forEach((s, i) => setTimeout(() => { root.style.transform = 'translateY(' + (-s) + 'px)'; window.__vv.top = s; window.visualViewport.dispatchEvent(new Event('scroll')); }, 60 + i * 32));
        // iOS сама не повертає сторінку (повертає застосунок); страховка емуляції після 500 мс
        setTimeout(() => { if(window.__vv.top) window.scrollTo(); }, 500);
      }), seq);
      const maxDev = Math.max(...r.map(x => Math.abs(x[1])));
      const info = JSON.stringify({ maxDev: Math.round(maxDev * 10) / 10, seq: r.filter(x => x[0] > 40).slice(0, 40).map(x => [x[0], Math.round(x[1])]) });
      expect(maxDev, 'видиме положення листа не змінюється > 2 пт: ' + info).toBeLessThanOrEqual(2);
    } finally { await ctx.close(); }
  });
}
test('71. KB-25/B: стрілки зі зміною типу клавіатури (назва → сума) — одна прокрутка до поля й один монотонний рух без перельоту', async ({ browser }) => {
  const { ctx, page } = await open(browser, devices['iPhone 14'], false, true);
  try{
    await page.evaluate(() => { window.__vv.h = null; window.__vv.top = 0; switchTab('accounting'); openAddInstallmentModal(); });
    await page.waitForTimeout(500);
    await page.evaluate(() => { const d = document.createElement('div'); d.style.height = '420px'; document.getElementById('app-modal').appendChild(d); });
    await page.waitForTimeout(200);
    const bb = await page.locator('#app-modal-input').boundingBox(); await page.touchscreen.tap(bb.x + bb.width / 2, bb.y + bb.height / 2);
    await page.waitForTimeout(150);
    await page.evaluate(() => { window.__vv.h = window.__H0 - Math.round(window.__H0 * 0.465); window.visualViewport.dispatchEvent(new Event('resize')); });
    await page.waitForTimeout(800);
    const s = await page.evaluate(() => new Promise(resolve => {
      const m = document.getElementById('app-modal'), out = []; const t0 = performance.now(); const n0 = recBuf.filter(e => e.type === 'field-scroll').length;
      const tick = () => { out.push([Math.round(performance.now() - t0), -(new DOMMatrix(getComputedStyle(m).transform).m42 + m.offsetHeight / 2)]); if(performance.now() - t0 < 1100) requestAnimationFrame(tick); else resolve({ out, scrolls: recBuf.filter(e => e.type === 'field-scroll').length - n0 }); };
      requestAnimationFrame(tick);
      document.getElementById('app-modal-amount-input').focus();
      setTimeout(() => { window.__vv.h = window.__H0 - Math.round(window.__H0 * 0.434); window.visualViewport.dispatchEvent(new Event('resize')); }, 90);
    }));
    const ys = s.out.map(r => r[1]); const fin = ys[ys.length - 1];
    let over = 0, back = 0; for(let i = 0; i < ys.length; i++){ if(fin >= ys[0]) over = Math.max(over, ys[i] - fin); else over = Math.max(over, fin - ys[i]); }
    for(let i = 1; i < ys.length; i++){ const d = ys[i] - ys[i - 1]; if((fin >= ys[0] && d < -0.5) || (fin < ys[0] && d > 0.5)) back += Math.abs(d); }
    const info = JSON.stringify({ scrolls: s.scrolls, over: Math.round(over * 10) / 10, back: Math.round(back * 10) / 10, from: Math.round(ys[0]), to: Math.round(fin) });
    expect(s.scrolls, 'одна field-scroll на перемикання: ' + info).toBeLessThanOrEqual(1);
    expect(over, 'без перельоту (≤ 1 пт): ' + info).toBeLessThanOrEqual(1);
    expect(back, 'без руху назад (≤ 0,5 пт): ' + info).toBeLessThanOrEqual(0.5);
  } finally { await ctx.close(); }
});
for(const [name, spacer, expectHide] of [['поле видиме, той самий тип — курсор не чіпаємо', 0, false], ['поле не повністю видиме — курсор ховається на час прокрутки', 600, true]]){
  test('72. KB-25/C: стрілки, ' + name, async ({ browser }) => {
    const { ctx, page } = await kb25Open(browser, true);
    try{
      await page.evaluate(h => { document.getElementById('kb25-spacer').style.height = h + 'px'; }, spacer);
      await page.waitForTimeout(100);
      const seen = await page.evaluate(() => new Promise(resolve => {
        let hid = false; const root = document.documentElement;
        const mo = new MutationObserver(() => { if(root.classList.contains('kb-sheet-moving')) hid = true; }); mo.observe(root, { attributes: true, attributeFilter: ['class'] });
        document.getElementById('cloud-password').focus();
        setTimeout(() => { mo.disconnect(); resolve(hid); }, 700);
      }));
      expect(seen, 'курсор ' + (expectHide ? 'ховається' : 'не ховається') + ' (kb-sheet-moving)').toBe(expectHide);
    } finally { await ctx.close(); }
  });
}
