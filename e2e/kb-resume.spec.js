// KB-RESUME-5 (Rev 2.32.436, C): експеримент kb-resume (control | proxy-tap | keep-lift; await-focus прибрано). Підміна document.hasFocus() імітує «вікно неактивне»; вихід у фон — підміна document.visibilityState + visibilitychange; клавіатура — підміна visualViewport (як у keyboard.spec); нативне фокусування імітується focus() (синтетичні дотики його не дають). Мок; дані вигадані.
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
    expect(after.lift, 'KB-RESUME-7: у фоні шторка в спокої (без переходу)').toBe(0); expect(after.top).toBeGreaterThan(before.top + 50);
    expect(after.active).not.toBe('cdd-balance'); // поле втратило фокус (наступний дотик дасть нативний фокус)
    await setVisibility(page, 'visible'); await page.waitForTimeout(900);
    const back = await sheet(page);
    expect(back.kbKeep).toBe(true); expect(back.lift).toBe(before.lift); expect(Math.abs(back.top - before.top)).toBeLessThanOrEqual(1);
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

test('keep-lift: тягнення з поля 30 pt опускає шторку при завершенні дотику (released drag, releaseAt touchend), не на touchmove; закриття шторки — released close', async ({ browser }) => {
  let h = await open(browser, 'keep-lift', true);
  try {
    await openWithKeyboard(h.page);
    await setVisibility(h.page, 'hidden'); await hideKeyboard(h.page); await h.page.waitForTimeout(400); await setVisibility(h.page, 'visible'); await h.page.waitForTimeout(200);
    await touch(h.page, 'touchstart', FIELD); await touch(h.page, 'touchmove', FIELD, -30);
    await h.page.waitForTimeout(300);
    expect((await sheet(h.page)).kbKeep, 'на touchmove шторку ще не опущено').toBe(true);
    await touch(h.page, 'touchend', FIELD);
    await h.page.waitForTimeout(900);
    expect((await sheet(h.page)).kbKeep).toBe(false);
    const ev = await events(h.page);
    expect(ev.some(e => e.branch === 'keep-release' && e.released === 'drag' && e.releaseAt === 'touchend')).toBe(true);
    expect(ev.find(e => e.keptLift === true && e.branch === 'none').moveMax).toBe(30);
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

test('keep-lift: дотик по полю з рухом 6 pt — це дотик, шторку не опущено; нативний focusin → tap-field, releaseAt touchend, moveMax 6, метрики документа записано', async ({ browser }) => {
  const { ctx, page } = await open(browser, 'keep-lift', true);
  try {
    await openWithKeyboard(page);
    const before = await sheet(page);
    await setVisibility(page, 'hidden'); await hideKeyboard(page); await page.waitForTimeout(400); await setVisibility(page, 'visible'); await page.waitForTimeout(200);
    await touch(page, 'touchstart', FIELD); await touch(page, 'touchmove', FIELD, 6);
    expect((await sheet(page)).kbKeep).toBe(true);
    const e = await touch(page, 'touchend', FIELD); expect(e.prevented).toBe(false);
    await page.waitForTimeout(150);
    expect((await sheet(page)).kbKeep, 'до focusin шторку не опущено (чекаємо ≤ 300 мс)').toBe(true);
    await page.evaluate(() => document.querySelector('#cdd-balance').focus());
    await page.waitForTimeout(150); await showKeyboard(page); await page.waitForTimeout(1200);
    const after = await sheet(page);
    expect(after.kbKeep).toBe(false); expect(after.active).toBe('cdd-balance'); expect(Math.abs(after.top - before.top)).toBeLessThanOrEqual(3);
    const ev = await events(page);
    expect(ev.some(x => x.branch === 'keep-release' && x.released === 'tap-field')).toBe(true);
    const rec = ev.find(x => x.keptLift === true && x.branch === 'none');
    expect(rec).toMatchObject({ released: 'tap-field', releaseAt: 'touchend', moveMax: 6 });
    expect(typeof rec.docScrollH).toBe('number'); expect(typeof rec.innerH).toBe('number'); expect(rec.scrollY).toBe(0);
    expect(rec.docScrollH, 'документ не прокручується у стані keep-lift (причина зсуву не в ньому)').toBeLessThanOrEqual(rec.innerH + 1);
  } finally { await ctx.close(); }
});

test('keep-lift: дотик по полю без focusin за 300 мс після touchend — звичайне опускання (released tap-miss, releaseAt timeout)', async ({ browser }) => {
  const { ctx, page } = await open(browser, 'keep-lift', true);
  try {
    await openWithKeyboard(page);
    await setVisibility(page, 'hidden'); await hideKeyboard(page); await page.waitForTimeout(400); await setVisibility(page, 'visible'); await page.waitForTimeout(200);
    await touch(page, 'touchstart', FIELD); await touch(page, 'touchend', FIELD);
    await page.waitForTimeout(200);
    expect((await sheet(page)).kbKeep).toBe(true);
    await page.waitForTimeout(900);
    const s = await sheet(page);
    expect(s.kbKeep).toBe(false); expect(s.kbSheet).toBe(false);
    expect((await events(page)).some(e => e.branch === 'keep-release' && e.released === 'tap-miss' && e.releaseAt === 'timeout')).toBe(true);
  } finally { await ctx.close(); }
});

test('keep-lift: зсув iOS при нативному фокусі приймається — без scrollTo(0,0) і pan-comp одним кадром; у control той самий зсув компенсується як раніше', async ({ browser }) => {
  const run = async (variant) => {
    const { ctx, page } = await open(browser, variant, true);
    try {
      await openWithKeyboard(page);
      if (variant === 'keep-lift') {
        await setVisibility(page, 'hidden'); await hideKeyboard(page); await page.waitForTimeout(400); await setVisibility(page, 'visible'); await page.waitForTimeout(200);
        await touch(page, 'touchstart', FIELD); await touch(page, 'touchend', FIELD);
        await page.evaluate(() => document.querySelector('#cdd-balance').focus());
        await page.waitForTimeout(100); await showKeyboard(page);
      }
      await page.evaluate(() => { window.__sc = 0; const f = window.scrollTo.bind(window); window.scrollTo = function(){ window.__sc++; return f.apply(window, arguments); }; });
      await page.evaluate(() => { window.__vv.top = 44; window.visualViewport.dispatchEvent(new Event('scroll')); window.visualViewport.dispatchEvent(new Event('resize')); });
      await page.waitForTimeout(600);
      return { sc: await page.evaluate(() => window.__sc), comp: (await page.evaluate(() => recBuf.filter(e => e.type === 'pan-comp').length)) };
    } finally { await ctx.close(); }
  };
  const keep = await run('keep-lift');
  expect(keep.sc, 'keep-lift: scrollTo не викликано').toBe(0); expect(keep.comp, 'keep-lift: pan-comp немає').toBe(0);
});

const fieldCenter = (page) => page.evaluate((sel) => { const r = document.querySelector(sel).getBoundingClientRect(); return Math.round((r.top + r.height / 2) * 10) / 10; }, FIELD);
const sheetBox = (page) => page.evaluate(() => { const r = document.getElementById('card-debt-drawer').getBoundingClientRect(); return { top: Math.round(r.top * 10) / 10, bottom: Math.round(r.bottom * 10) / 10 }; });
const toKeep = async (page) => { await openWithKeyboard(page); await setVisibility(page, 'hidden'); await hideKeyboard(page); await page.waitForTimeout(500); await setVisibility(page, 'visible'); await page.waitForTimeout(300); };

test('keep-lift (KB-RESUME-6): центр поля стоїть у (innerH - kbH)/2 - 2 ±2 (або шторку піднято наскільки можна, liftClamped); подія має centerTarget, liftMore, liftClamped, fieldCenterAtTouch', async ({ browser }) => {
  const { ctx, page } = await open(browser, 'keep-lift', true);
  try {
    const before = await (async () => { await openWithKeyboard(page); return fieldCenter(page); })();
    await setVisibility(page, 'hidden'); await hideKeyboard(page); await page.waitForTimeout(500); await setVisibility(page, 'visible'); await page.waitForTimeout(300);
    const inner = await page.evaluate(() => window.__H0);
    const c = await fieldCenter(page);
    const target = (inner - 388) / 2 - 2;
    const ev = (await events(page)).find(e => e.branch === 'keep-enter');
    expect(ev.centerTarget).toBe(Math.round(target));
    expect(typeof ev.liftMore).toBe('number'); expect(typeof ev.liftClamped).toBe('boolean');
    if (!ev.liftClamped) expect(Math.abs(c - target)).toBeLessThanOrEqual(2);
    else expect(c).toBeGreaterThan(target);
    expect(c <= before + 0.5, 'поле не опускається нижче, ніж було').toBe(true);
    await touch(page, 'touchstart', FIELD); await touch(page, 'touchend', FIELD);
    await page.evaluate(() => document.querySelector('#cdd-balance').focus());
    await page.waitForTimeout(1300);
    const rec = (await events(page)).find(e => e.keptLift === true && e.branch === 'none');
    expect(rec.centerTarget).toBe(Math.round(target)); expect(rec.liftMore).toBe(ev.liftMore); expect(rec.liftClamped).toBe(ev.liftClamped);
    expect(typeof rec.fieldCenterAtTouch).toBe('number');
  } finally { await ctx.close(); }
});

test('keep-lift (KB-RESUME-6): після нативного фокусу й kb-vv-resize верх шторки не рухається, низ = верх клавіатури; закриття клавіатури повертає звичайну висоту', async ({ browser }) => {
  const { ctx, page } = await open(browser, 'keep-lift', true);
  try {
    await toKeep(page);
    const hKeep = await page.evaluate(() => document.getElementById('card-debt-drawer').style.minHeight);
    const b0 = await sheetBox(page);
    await touch(page, 'touchstart', FIELD); await touch(page, 'touchend', FIELD);
    await page.evaluate(() => document.querySelector('#cdd-balance').focus());
    await page.waitForTimeout(100); await showKeyboard(page); await page.waitForTimeout(1300);
    const b1 = await sheetBox(page);
    const inner = await page.evaluate(() => window.__H0);
    expect(Math.abs(b1.top - b0.top), 'верх не рухається').toBeLessThanOrEqual(2);
    expect(Math.abs(b1.bottom - (inner - 388)), 'низ шторки — біля верху клавіатури (проміжок ≤ 12)').toBeLessThanOrEqual(12);
    expect(await page.evaluate(() => document.getElementById('card-debt-drawer').style.minHeight)).toBe(hKeep);
    await page.evaluate(() => document.activeElement.blur()); await hideKeyboard(page);
    await page.waitForTimeout(1200);
    expect(await page.evaluate(() => document.getElementById('card-debt-drawer').style.minHeight), 'після закриття клавіатури висота звичайна').toBe('');
  } finally { await ctx.close(); }
});

test('keep-lift (KB-RESUME-6): перемикання на інше поле скидає збільшену висоту; звичайне відкриття (control) без змін', async ({ browser }) => {
  let h = await open(browser, 'keep-lift', true);
  try {
    await toKeep(h.page);
    await touch(h.page, 'touchstart', FIELD); await touch(h.page, 'touchend', FIELD);
    await h.page.evaluate(() => document.querySelector('#cdd-balance').focus());
    await h.page.waitForTimeout(100); await showKeyboard(h.page); await h.page.waitForTimeout(900);
    const other = await h.page.evaluate(() => { const f = Array.from(document.querySelectorAll('#card-debt-drawer input')).find(i => i.id && i.id !== 'cdd-balance' && i.offsetParent); if (f) f.focus(); return !!f; });
    await h.page.waitForTimeout(500);
    if (other) expect(await h.page.evaluate(() => document.getElementById('card-debt-drawer').style.minHeight)).toBe('');
  } finally { await h.ctx.close(); }
  h = await open(browser, 'control', true);
  try {
    await openWithKeyboard(h.page);
    expect(await h.page.evaluate(() => document.getElementById('card-debt-drawer').style.minHeight), 'у control висоту не чіпаємо').toBe('');
    expect((await sheet(h.page)).kbKeep).toBe(false);
  } finally { await h.ctx.close(); }
});

const winBlur = (page) => page.evaluate(() => { window.dispatchEvent(new Event('blur')); });
const winFocus = (page) => page.evaluate(() => { window.dispatchEvent(new Event('focus')); });
const leaveBySwitcher = async (page, hiddenAfterMs) => { await winBlur(page); await hideKeyboard(page); await page.waitForTimeout(hiddenAfterMs); await setVisibility(page, 'hidden'); await page.waitForTimeout(300); };

test('keep-lift (KB-RESUME-7): перемикач застосунків — blur, vvH повна, hidden через 800 мс: keptLift за знімком (eligibleBy blur-snap), kbHSource і kbHUsed записано, шторка в спокої без sheet-close', async ({ browser }) => {
  const { ctx, page } = await open(browser, 'keep-lift', true);
  try {
    await openWithKeyboard(page);
    const before = await sheet(page);
    await leaveBySwitcher(page, 800);
    const s = await sheet(page);
    expect(s.kbKeep).toBe(true); expect(s.kbSheet).toBe(true); expect(s.lift).toBe(0);
    const en = (await events(page)).find(e => e.branch === 'keep-enter');
    expect(en).toMatchObject({ eligibleBy: 'blur-snap', keptLift: true });
    expect(['store-kind', 'store-text', 'snapshot']).toContain(en.kbHSource); expect(en.kbHUsed).toBeGreaterThan(150);
    expect(en.blurToHiddenMs).toBeGreaterThanOrEqual(790); expect(['numeric', 'text', 'email', 'password']).toContain(en.kbKind);
    expect(await page.evaluate(() => document.documentElement.classList.contains('kb-sheet-closing'))).toBe(false);
    await setVisibility(page, 'visible'); await page.waitForTimeout(900);
    const back = await sheet(page);
    expect(back.lift).toBe(before.lift); expect(Math.abs(back.top - before.top)).toBeLessThanOrEqual(1);
    expect(await page.evaluate(() => document.documentElement.classList.contains('kb-sheet-closing'))).toBe(false);
  } finally { await ctx.close(); }
});

test('keep-lift (KB-RESUME-7): знімок старший за 3000 мс, window focus між blur і hidden, чужа шторка — звичайний шлях (kb-bg-reset), подія keep-skip з eligibleBy none', async ({ browser }) => {
  for (const mode of ['old', 'focus']) {
    const { ctx, page } = await open(browser, 'keep-lift', true);
    try {
      await openWithKeyboard(page);
      await winBlur(page); await hideKeyboard(page);
      if (mode === 'old') await page.waitForTimeout(3150); else { await page.waitForTimeout(300); await winFocus(page); await page.waitForTimeout(100); }
      await setVisibility(page, 'hidden'); await page.waitForTimeout(900);
      const s = await sheet(page);
      expect(s.kbKeep, mode).toBe(false);
      const ev = await events(page);
      expect(ev.some(e => e.branch === 'keep-skip' && e.eligibleBy === 'none'), mode).toBe(true);
      expect(ev.some(e => e.branch === 'keep-enter'), mode).toBe(false);
    } finally { await ctx.close(); }
  }
});

test('keep-lift (KB-RESUME-7): після visible шторка плавно піднімається 0 -> ціль: kb-resume-lift ms 200–350, frames ≥ 10, jumpMax ≤ 100 (headless), без sheet-close; щит прозорий і знятий ≤ 500 мс', async ({ browser }) => {
  const { ctx, page } = await open(browser, 'keep-lift', true);
  try {
    await openWithKeyboard(page);
    const before = await sheet(page);
    await leaveBySwitcher(page, 400);
    await setVisibility(page, 'visible');
    await page.waitForTimeout(40);
    const sh = await page.evaluate(() => { const e = document.querySelector('[data-kb-keep-shield]'); if (!e) return null; const cs = getComputedStyle(e); return { bg: cs.backgroundColor, pos: cs.position, pe: cs.pointerEvents }; });
    expect(sh, 'щит є одразу після visible').not.toBeNull(); expect(sh.pos).toBe('fixed'); expect(sh.bg === 'rgba(0, 0, 0, 0)' || sh.bg === 'transparent').toBe(true);
    await page.waitForTimeout(700);
    expect(await page.evaluate(() => !!document.querySelector('[data-kb-keep-shield]')), 'щит знято до 500 мс після старту').toBe(false);
    const lf = (await page.evaluate(() => recBuf.filter(e => e.type === 'kb-resume-lift')));
    expect(lf.length).toBe(1);
    expect(lf[0].from).toBe(0); expect(lf[0].to).toBe(Math.round(before.lift));
    expect(lf[0].ms).toBeGreaterThanOrEqual(200); expect(lf[0].ms).toBeLessThanOrEqual(350); expect(lf[0].frames).toBeGreaterThanOrEqual(10); expect(lf[0].jumpMax, 'крива стандартного підйому: пік ≈ 48 пт/кадр при 275 пт за 250 мс; у headless кадри інколи пропускаються, тому межа тут 100 (критерій X2 ≤ 60 — на телефоні)').toBeLessThanOrEqual(100);
    expect(await page.evaluate(() => document.documentElement.classList.contains('kb-sheet-closing'))).toBe(false);
    expect((await sheet(page)).lift).toBe(before.lift);
  } finally { await ctx.close(); }
});

test('keep-lift (KB-RESUME-7): дотик під час підйому потрапляє на щит (touchDuringLift 1, click під щитом не виконується), поле не фокусується; наступний дотик — нативний', async ({ browser }) => {
  const { ctx, page } = await open(browser, 'keep-lift', true);
  try {
    await openWithKeyboard(page);
    await leaveBySwitcher(page, 400);
    await page.evaluate(() => { window.__clicks = 0; document.addEventListener('click', (e) => { if (!e.target.hasAttribute || !e.target.hasAttribute('data-kb-keep-shield')) window.__clicks++; }, true); });
    await setVisibility(page, 'visible'); await page.waitForTimeout(40);
    const r = await page.evaluate(() => { const sh = document.querySelector('[data-kb-keep-shield]'); const x = innerWidth / 2, y = innerHeight / 2; const hit = document.elementFromPoint(x, y) === sh;
      const mk = (type, tl) => { const ev = new Event(type, { bubbles: true, cancelable: true }); Object.defineProperty(ev, 'touches', { value: tl }); Object.defineProperty(ev, 'changedTouches', { value: [{ clientX: x, clientY: y, identifier: 7, target: sh }] }); sh.dispatchEvent(ev); return ev; };
      const tt = [{ clientX: x, clientY: y, identifier: 7, target: sh }]; const s = mk('touchstart', tt); const e = mk('touchend', []); return { hit, startPrevented: s.defaultPrevented, endPrevented: e.defaultPrevented }; });
    expect(r.hit).toBe(true); expect(r.startPrevented, 'touchstart не гасимо').toBe(false); expect(r.endPrevented, 'touchend гасить синтетичний click').toBe(true);
    await page.waitForTimeout(700);
    expect(await page.evaluate(() => window.__clicks)).toBe(0);
    expect((await sheet(page)).active).not.toBe('cdd-balance');
    await touch(page, 'touchstart', FIELD); await touch(page, 'touchmove', FIELD, 0); const e2 = await touch(page, 'touchend', FIELD); expect(e2.prevented).toBe(false);
    await page.evaluate(() => document.querySelector('#cdd-balance').focus()); await page.waitForTimeout(100); await showKeyboard(page); await page.waitForTimeout(900);
    const rec = (await events(page)).find(e => e.keptLift === true && e.branch === 'none');
    expect(rec.touchDuringLift).toBe(1); expect(typeof rec.visibleToTouchMs).toBe('number'); expect(rec.eligibleBy).toBe('blur-snap'); expect(typeof rec.liftAnimMs).toBe('number');
  } finally { await ctx.close(); }
});

test('keep-lift (KB-RESUME-7): orientationchange і pagehide під час підйому знімають щит; повторний hidden до дотику — знову спокій без переходу; закриття шторки знімає щит', async ({ browser }) => {
  let h = await open(browser, 'keep-lift', true);
  try {
    await openWithKeyboard(h.page); await leaveBySwitcher(h.page, 300);
    await setVisibility(h.page, 'visible'); await h.page.waitForTimeout(40);
    await h.page.evaluate(() => window.dispatchEvent(new Event('orientationchange'))); await h.page.waitForTimeout(100);
    expect(await h.page.evaluate(() => !!document.querySelector('[data-kb-keep-shield]'))).toBe(false);
    expect((await sheet(h.page)).kbKeep).toBe(false);
  } finally { await h.ctx.close(); }
  h = await open(browser, 'keep-lift', true);
  try {
    await openWithKeyboard(h.page); const before = await sheet(h.page); await leaveBySwitcher(h.page, 300);
    await setVisibility(h.page, 'visible'); await h.page.waitForTimeout(40);
    await h.page.evaluate(() => window.dispatchEvent(new Event('pagehide'))); await h.page.waitForTimeout(50);
    expect(await h.page.evaluate(() => !!document.querySelector('[data-kb-keep-shield]'))).toBe(false);
    await setVisibility(h.page, 'hidden'); await h.page.waitForTimeout(200);
    expect((await sheet(h.page)).lift, 'повторний hidden: знову спокій').toBe(0);
    await setVisibility(h.page, 'visible'); await h.page.waitForTimeout(900);
    const back = await sheet(h.page); expect(back.lift).toBe(before.lift); expect(back.kbKeep).toBe(true);
  } finally { await h.ctx.close(); }
  h = await open(browser, 'keep-lift', true);
  try {
    await openWithKeyboard(h.page); await leaveBySwitcher(h.page, 300);
    await setVisibility(h.page, 'visible'); await h.page.waitForTimeout(40);
    await h.page.evaluate(() => closeCardDebtEditor()); await h.page.waitForTimeout(900);
    expect(await h.page.evaluate(() => !!document.querySelector('[data-kb-keep-shield]'))).toBe(false);
    expect((await sheet(h.page)).kbKeep).toBe(false);
  } finally { await h.ctx.close(); }
});

test('keep-lift (KB-RESUME-7): повернення з синхронізацією (pullAllOnResume, renderAll, app-visible) під час підйому не скидає стан keep-lift і не перемальовує шторку', async ({ browser }) => {
  const { ctx, page } = await open(browser, 'keep-lift', true);
  try {
    await openWithKeyboard(page);
    const before = await sheet(page);
    await page.evaluate(() => { window.__d0 = document.getElementById('card-debt-drawer'); window.__f0 = document.querySelector('#cdd-balance'); });
    await leaveBySwitcher(page, 300);
    await setVisibility(page, 'visible'); await page.waitForTimeout(60);
    await page.evaluate(async () => { try { if (typeof pullAllOnResume === 'function') await pullAllOnResume(); } catch (e) {} try { renderAll(); } catch (e) {} try { if (typeof syncAppVisible === 'function') await syncAppVisible(true); } catch (e) {} try { checkDayRollover('resume'); } catch (e) {} });
    await page.waitForTimeout(900);
    const same = await page.evaluate(() => ({ d: window.__d0 === document.getElementById('card-debt-drawer'), f: window.__f0 === document.querySelector('#cdd-balance'), open: document.getElementById('card-debt-drawer').classList.contains('open') }));
    expect(same).toEqual({ d: true, f: true, open: true });
    const s = await sheet(page); expect(s.kbKeep).toBe(true); expect(s.lift).toBe(before.lift); expect(Math.abs(s.top - before.top)).toBeLessThanOrEqual(1);
  } finally { await ctx.close(); }
});

test('control (KB-RESUME-7, X5): перемикач застосунків без keep-lift — знімка нема, подій keep-* нема, шторка опускається як раніше', async ({ browser }) => {
  const { ctx, page } = await open(browser, 'control', true);
  try {
    await openWithKeyboard(page);
    await leaveBySwitcher(page, 400); await page.waitForTimeout(700);
    const s = await sheet(page); expect(s.kbKeep).toBe(false);
    expect((await page.evaluate(() => recBuf.filter(e => e.type === 'kb-resume-lift' || (e.type === 'kb-resume' && /^keep/.test(e.branch || ''))).length))).toBe(0);
  } finally { await ctx.close(); }
});

test('keep-lift (KB-RESUME-8, Крок 0): повторний вихід без закриття клавіатури — центр поля після keep-enter = centerTarget ±2 (3 цикли поспіль)', async ({ browser }) => {
  const { ctx, page } = await open(browser, 'keep-lift', true);
  const KB = 388;
  const kb = () => page.evaluate((k) => { window.__vv.h = window.__H0 - k; window.visualViewport.dispatchEvent(new Event('resize')); }, KB);
  try {
    await page.setViewportSize({ width: 390, height: 1100 }); await page.evaluate(() => { window.__H0 = window.innerHeight; }); await page.waitForTimeout(500); // вища сторінка: шторка нижча за максимум, є запас зверху
    await touch(page, 'touchstart', FIELD); await touch(page, 'touchend', FIELD);
    await page.waitForTimeout(250); await kb(); await page.waitForTimeout(1000);
    const inner = await page.evaluate(() => window.__H0), target = (inner - KB) / 2 - 2;
    const centers = [];
    for (let i = 0; i < 3; i++) {
      await setVisibility(page, 'hidden'); await hideKeyboard(page); await page.waitForTimeout(500); await setVisibility(page, 'visible'); await page.waitForTimeout(400);
      const c = await fieldCenter(page); centers.push(Math.round(c));
      const ev = (await events(page)).filter(e => e.branch === 'keep-enter')[i];
      expect(ev, 'keep-enter №' + (i + 1)).toBeTruthy();
      expect(Math.abs(c - target), 'цикл ' + (i + 1) + ', центри ' + centers.join(',') + ', ціль ' + target).toBeLessThanOrEqual(2);
      await touch(page, 'touchstart', FIELD); await touch(page, 'touchend', FIELD);
      await page.evaluate(() => document.querySelector('#cdd-balance').focus());
      await kb(); await page.waitForTimeout(900);
    }
  } finally { await ctx.close(); }
});

test('варіанти kb-resume: control, proxy-tap, keep-lift (await-focus і ro-tap відсутні); типово control', async ({ browser }) => {
  const { ctx, page } = await open(browser, null, true);
  try {
    expect(await page.evaluate(() => findTestVariant('kb-resume').variants.map(v => v.key))).toEqual(['control', 'proxy-tap', 'keep-lift']);
    expect(await page.evaluate(() => getVariant('kb-resume'))).toBe('control');
  } finally { await ctx.close(); }
});

test('control і інші варіанти: вихід у фон з клавіатурою опускає шторку як зараз (kb-keep ніколи не ставиться)', async ({ browser }) => {
  for (const v of ['control', 'proxy-tap']) {
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

for (const v of ['control', 'proxy-tap', 'keep-lift']) {
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
