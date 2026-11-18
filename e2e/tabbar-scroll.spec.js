// Rev 2.32.372–373 (DS-3c4): запис tab-scroll (жест прокрутки + причина відсутньої реакції) і стиснення таббару при швидкій прокрутці: старт на тижневій смузі платежів, картках, горизонтальних списках; швидкий «флік» без touchmove; серія змін напрямку; довга інерція
const { test, expect } = require('@playwright/test');
const { installClock } = require('./clock');
test.use({ hasTouch: true });
async function boot(page, o){
  o = o || {};
  await page.setViewportSize({ width: 390, height: 844 }); await installClock(page);
  await page.goto('/index.html?fixture=' + (o.fixture || 'large'));
  await page.waitForFunction(() => window.MockCloud && typeof cloudSession !== 'undefined' && cloudSession && cloudSession.user && document.querySelector('.tabbar-glass'));
  await page.waitForTimeout(1500);
  if(o.tab){ await page.evaluate((t) => switchTab(t, { noFocus: true }), o.tab); await page.waitForTimeout(900); }
  await page.evaluate(() => {
    window.__mc = () => document.getElementById('main-col');
    // жест користувача: touchstart на елементі (sel або точка), опційні touchmove (moves кроків по dy/moves), touchend у кінцевій точці; далі прокрутка scrollTop кроками (інерція): total px за ms мс, крок кожні 16 мс
    window.__flick = async (o) => {
      const el = o.sel ? document.querySelector(o.sel) : document.getElementById('main-col'); const r = el.getBoundingClientRect(); const x = r.x + r.width / 2, y0 = o.sel ? r.y + Math.min(r.height / 2, 30) : 500;
      const mk = (type, yy) => { const ev = new Event(type, { bubbles: true, cancelable: true }); const p = { identifier: 3, clientX: x, clientY: yy, target: el }; ev.touches = type === 'touchend' ? [] : [p]; ev.changedTouches = [p]; el.dispatchEvent(ev); };
      mk('touchstart', y0); const dir = o.dir === 'up' ? 1 : -1; // палець вгору → сторінка вниз
      for (let i = 1; i <= (o.moves || 0); i++){ mk('touchmove', y0 + dir * 12 * i); await new Promise(r => setTimeout(r, 16)); }
      mk('touchend', y0 + dir * (o.endDy || 60));
      const from = __mc().scrollTop, sgn = o.dir === 'up' ? -1 : 1, steps = Math.max(1, Math.round((o.ms || 400) / 16));
      for (let i = 1; i <= steps; i++){ await new Promise(r => setTimeout(r, 16)); __mc().scrollTop = from + sgn * (o.total || 600) * i / steps; if(o.midHook && i === Math.round(steps * o.midAt)) o.midHook(); }
    };
  });
}
const mini = (page) => page.evaluate(() => document.querySelector('nav.tabbar').classList.contains('mini'));
const settle = (page) => page.waitForTimeout(450);
const evs = (page) => page.evaluate(() => recBuf.filter(e => e.type === 'tab-scroll').map(e => Object.assign({}, e)));
test('102. запис tab-scroll: одна подія на жест (напрямок, відстань, швидкість, елемент-старт, byUser, changed); програмна прокрутка → byUser=false, why=not-user', async ({ page }) => {
  await boot(page, { tab: 'structure' });
  await page.evaluate(() => { recBuf.length = 0; });
  await page.evaluate(() => __flick({ moves: 4, endDy: 60, total: 500, ms: 400 })); await page.waitForTimeout(700);
  let e = await evs(page); expect(e.length, JSON.stringify(e)).toBe(1);
  expect(e[0]).toMatchObject({ dir: 'down', byUser: true, changed: true, why: '' }); expect(e[0].delta).toBeGreaterThan(400); expect(e[0].vel).toBeGreaterThan(100); expect(e[0].startEl, 'лише тег і клас').toMatch(/^[a-z0-9]+(\.[A-Za-z0-9_-]+)?$/); expect(e[0].durationMs).toBeGreaterThan(200);
  // той самий напрямок, коли вже стиснуто: причина «same»
  await page.evaluate(() => __flick({ moves: 3, total: 80, ms: 200 })); await page.waitForTimeout(700);
  e = await evs(page); expect(e.length).toBe(2); expect(e[1]).toMatchObject({ dir: 'down', byUser: true, changed: false, why: 'same' });
  // програмна прокрутка (без вводу користувача)
  await page.evaluate(() => { window.__mc().scrollTop = 0; }); await page.waitForTimeout(700);
  await page.evaluate(() => { recBuf.length = 0; });
  await page.evaluate(() => mainUserReset()); // як при зміні вкладки: попередній ввід користувача не діє
  await page.evaluate(async () => { for (let i = 1; i <= 20; i++){ await new Promise(r => setTimeout(r, 16)); __mc().scrollTop = i * 30; } }); await page.waitForTimeout(700);
  e = await evs(page); expect(e.length, JSON.stringify(e)).toBe(1); expect(e[0]).toMatchObject({ dir: 'down', byUser: false, changed: false, why: 'not-user' });
});
test('103. старт жесту на тижневій смузі платежів, картці зі свайпом, горизонтальному списку: таббар стискається (гіпотеза «елементи не пропускають дотик» перевірена)', async ({ page }) => {
  test.setTimeout(120000);
  await boot(page, { tab: 'analytics' });
  const targets = ['#payments-card .pay-day', '.kpi-card', '.pay-card-hit'];
  for (const sel of targets){
    if(!await page.locator(sel).count()) continue;
    await page.evaluate(() => { __mc().scrollTop = 0; }); await page.waitForTimeout(700); expect(await mini(page)).toBe(false);
    await page.evaluate((sel) => __flick({ sel: sel, moves: 4, total: 500, ms: 400 }), sel); await settle(page);
    expect(await mini(page), 'жест від ' + sel).toBe(true);
    const e = await evs(page); expect(e[e.length - 1].startEl).not.toBe('?');
  }
  await page.evaluate(() => switchTab('accounting', { noFocus: true })); await page.waitForTimeout(900);
  for (const sel of ['.struct-tabs', '.struct-tab-btn', '.t-row']){
    if(!await page.locator(sel).count() || !await page.locator(sel).first().isVisible()) continue;
    if((await page.evaluate(() => __mc().scrollHeight - __mc().clientHeight)) < 200) continue; // сторінка занадто коротка для перевірки
    await page.evaluate(() => { __mc().scrollTop = 0; }); await page.waitForTimeout(700);
    const tot = Math.max(120, Math.min(500, Math.floor((await page.evaluate(() => __mc().scrollHeight - __mc().clientHeight)) / 2)));
    await page.evaluate(([sel, tot]) => __flick({ sel: sel, moves: 4, total: tot, ms: 400 }), [sel, tot]); await settle(page);
    expect(await mini(page), 'жест від ' + sel).toBe(true);
  }
});
test('104. серія швидких змін напрямку: після кожного кроку стан відповідає напрямку (вниз — стиснуто, вгору — розгорнуто)', async ({ page }) => {
  await boot(page, { tab: 'structure' });
  const seq = [['down', 300, true], ['up', 120, false], ['down', 200, true], ['up', 90, false], ['down', 150, true], ['up', 60, false]];
  for (const [dir, total, want] of seq){ await page.evaluate(([dir, total]) => __flick({ dir: dir, moves: 3, total: total, ms: 160 }), [dir, total]); await page.waitForTimeout(120); expect(await mini(page), dir + ' ' + total).toBe(want); }
});
test('105. швидкий «флік»: touchmove не надійшло, лише touchend з іншою координатою, далі інерція — таббар стискається', async ({ page }) => {
  await boot(page, { tab: 'structure' });
  await page.evaluate(() => __flick({ moves: 0, endDy: 80, total: 450, ms: 500 })); await settle(page);
  expect(await mini(page), 'флік без touchmove').toBe(true);
  const e = await evs(page); expect(e[e.length - 1]).toMatchObject({ byUser: true, changed: true });
  // і назад (вгору) без touchmove
  await page.evaluate(() => __flick({ dir: 'up', moves: 0, endDy: 80, total: 300, ms: 300 })); await settle(page);
  expect(await mini(page), 'флік вгору розгортає').toBe(false);
});
test('106. довга інерція (> 3 с): прокрутка лишається користувацькою; після розгортання сторонньою дією інерція знову стискає', async ({ page }) => {
  test.setTimeout(60000);
  await boot(page, { tab: 'structure' });
  await page.evaluate(() => { window.__hook = () => tabbarMiniExpand('touch'); });
  // 4,5 с інерції; на 3,6 с хтось розгортає таббар (стороння дія), прокрутка триває
  await page.evaluate(() => __flick({ moves: 3, total: 480, ms: 4500, midAt: 0.8, midHook: () => tabbarMiniExpand('touch') })); await page.waitForTimeout(500);
  expect(await mini(page), 'інерція понад 3 с триває як користувацька: таббар стиснувся знову').toBe(true);
});
