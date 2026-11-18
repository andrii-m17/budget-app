// Rev 2.32.357 (DS-3b2): анімація іконки таббару при ДОТИКУ пальцем (iPhone), а не мишею. Послідовності подій як на iOS: touchstart → (дрібний touchmove) → touchend → click, якщо touchend не скасовано (на iPhone так буває, і слідом іде click → другий switchTab). Свайп по таббару — touch-події на nav.
const { test, expect } = require('@playwright/test');
const { installClock } = require('./clock');
test.use({ hasTouch: true });
async function boot(page){
  await installClock(page);
  await page.goto('/index.html?fixture=typical');
  await page.waitForFunction(() => window.MockCloud && typeof cloudSession !== 'undefined' && cloudSession && cloudSession.user && document.querySelector('.tabbar-glass'));
  await page.waitForTimeout(1200);
  await page.evaluate(() => {
    window.__anim = [];
    document.addEventListener('animationstart', (e) => { if(/^tb/.test(e.animationName) && e.target.closest && e.target.closest('nav.tabbar')) window.__anim.push(e.animationName); }, true);
    // дотик: variant = { cancelable: touchend скасовується (клік не синтезується) | false (слідом click), jitter: зсув пальця px, hold: мс }
    window.__tap = async (tab, o) => {
      o = o || {}; const btn = document.querySelector('nav.tabbar button[data-tab="' + tab + '"]'); const r = btn.getBoundingClientRect(); const x = r.x + r.width / 2, y = r.y + r.height / 2;
      const fire = (type, dx, cancelable) => { const ev = new Event(type, { bubbles: true, cancelable: cancelable !== false }); const t = { identifier: 1, clientX: x + (dx || 0), clientY: y, target: btn }; ev.touches = type === 'touchend' ? [] : [t]; ev.changedTouches = [t]; btn.dispatchEvent(ev); return ev; };
      fire('touchstart'); if(o.jitter){ await new Promise(r => setTimeout(r, 25)); fire('touchmove', o.jitter); }
      await new Promise(r => setTimeout(r, o.hold || 50));
      const ev = fire('touchend', o.jitter || 0, o.cancelable);
      if(!ev.defaultPrevented) btn.click(); // браузер синтезує click, якщо touchend не скасовано
    };
  });
}
const NAME = { analytics: 'tbSlice', accounting: 'tbPress', structure: 'tbNode', service: 'tbSpin' };
const tap = (page, tab, o) => page.evaluate(([t, o]) => window.__tap(t, o), [tab, o || {}]);
const active = (page) => page.evaluate(() => (document.querySelector('nav.tabbar button.active') || {}).dataset.tab);
const reset = (page) => page.evaluate(() => { window.__anim = []; });
const seen = (page) => page.evaluate(() => window.__anim.slice());
const running = (page) => page.evaluate(() => document.getAnimations().filter(a => /^tb/.test(a.animationName || '')).map(a => a.animationName));
// свайп пальцем по таббару
const swipe = (page, fromTab, toTab) => page.evaluate(async ([a, b]) => {
  const bar = document.querySelector('nav.tabbar');
  const c = (t) => { const r = document.querySelector('nav.tabbar button[data-tab="' + t + '"]').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; };
  const A = c(a), B = c(b);
  const fire = (type, p) => { const ev = new Event(type, { bubbles: true, cancelable: true }); const t = { identifier: 1, clientX: p.x, clientY: p.y, target: bar }; ev.touches = type === 'touchend' ? [] : [t]; ev.changedTouches = [t]; (document.elementFromPoint(p.x, p.y) || bar).dispatchEvent(ev); };
  fire('touchstart', A);
  for (let i = 1; i <= 6; i++){ await new Promise(r => setTimeout(r, 16)); fire('touchmove', { x: A.x + (B.x - A.x) * i / 6, y: A.y }); }
  fire('touchend', B);
}, [fromTab, toTab]);
test('49. дотик пальцем: 10 змін вкладок (різний порядок, інтервали 50–500 мс, touchend скасовується й ні) — анімація запускається й доходить щоразу', async ({ page }) => {
  test.setTimeout(120000);
  await boot(page);
  await tap(page, 'accounting'); await page.waitForTimeout(1200); // перший жест вмикає анімації
  const seq = [['structure', 300, { cancelable: false }], ['service', 120, {}], ['analytics', 500, { cancelable: false, jitter: 5 }], ['structure', 60, {}], ['accounting', 250, { cancelable: false }], ['service', 90, { jitter: 4 }], ['analytics', 400, { cancelable: false }], ['accounting', 150, {}], ['structure', 50, { cancelable: false, jitter: 6 }], ['service', 300, {}]];
  const fails = [];
  for (const [tab, gap, o] of seq){
    await reset(page); await tap(page, tab, o); await page.waitForTimeout(220);
    const act = await active(page), got = await seen(page), run = await running(page);
    if(act !== tab || got.indexOf(NAME[tab]) === -1) fails.push(tab + ' (' + JSON.stringify(o) + '): активна=' + act + ', анімації=' + JSON.stringify(got));
    else if(run.indexOf(NAME[tab]) === -1 && NAME[tab] !== 'tbPress') fails.push(tab + ' (' + JSON.stringify(o) + '): анімація обірвана на 220 мс, працюють: ' + JSON.stringify(run));
    await page.waitForTimeout(gap);
  }
  expect(fails, fails.join('\n')).toEqual([]);
});
test('50. дотик пальцем: повторний дотик до вибраної вкладки анімацію не запускає і не обриває ту, що йде (touchend скасовується й ні, подвійний, одразу після зміни)', async ({ page }) => {
  await boot(page);
  await tap(page, 'accounting'); await page.waitForTimeout(1200);
  for (const o of [{}, { cancelable: false }, { cancelable: false, jitter: 5 }]){
    await reset(page); await tap(page, 'accounting', o); await page.waitForTimeout(300);
    expect(await seen(page), 'повторний дотик ' + JSON.stringify(o)).toEqual([]);
    expect(await page.locator('.tb-anim').count()).toBe(0);
  }
  await reset(page); await tap(page, 'accounting'); await tap(page, 'accounting', { cancelable: false }); await page.waitForTimeout(250);
  expect(await seen(page), 'подвійний дотик').toEqual([]);
  // зміна, а слідом (поки грає) повторні дотики по ній — і з click, і без: анімація доходить до кінця
  await page.waitForTimeout(900);
  await reset(page); await tap(page, 'service', { cancelable: false }); await page.waitForTimeout(120);
  expect(await running(page), 'анімація йде після зміни (click слідом)').toContain('tbSpin');
  await tap(page, 'service', { cancelable: false }); await tap(page, 'service'); await page.waitForTimeout(150);
  expect(await running(page), 'повторні дотики не обривають анімацію').toContain('tbSpin');
  expect((await seen(page)).filter(n => n === 'tbSpin').length, 'і не запускають її вдруге').toBe(1);
});
test('51. свайп пальцем по таббару: анімація запускається на вкладці, де палець відпущено; свайп на ту саму — ні', async ({ page }) => {
  await boot(page);
  await tap(page, 'accounting'); await page.waitForTimeout(1200);
  const fails = [];
  for (const [from, to] of [['accounting', 'structure'], ['structure', 'service'], ['service', 'analytics'], ['analytics', 'structure']]){
    await reset(page); await swipe(page, from, to); await page.waitForTimeout(200);
    const act = await active(page), got = await seen(page);
    if(act !== to || got.indexOf(NAME[to]) === -1) fails.push(from + '→' + to + ': активна=' + act + ', анімації=' + JSON.stringify(got));
    await page.waitForTimeout(900);
  }
  expect(fails, fails.join('\n')).toEqual([]);
  await reset(page); await swipe(page, 'structure', 'structure'); await page.waitForTimeout(250);
  expect(await seen(page), 'свайп завершився на вибраній').toEqual([]);
});
test('52. швидке A→B→A→B (< 300 мс): анімація перезапускається щоразу', async ({ page }) => {
  await boot(page);
  await tap(page, 'accounting'); await page.waitForTimeout(1200);
  const log = [];
  for (const tab of ['structure', 'service', 'structure', 'service', 'structure']){ await reset(page); await tap(page, tab, { cancelable: false }); await page.waitForTimeout(110); log.push(tab + ':' + ((await seen(page)).indexOf(NAME[tab]) !== -1)); await page.waitForTimeout(90); }
  expect(log, log.join(' ')).toEqual(['structure:true', 'service:true', 'structure:true', 'service:true', 'structure:true']);
});
test('53. повторний дотик по вибраній: повернення після натиску без пружного перельоту; зміна вкладки лишає пружину', async ({ page }) => {
  await boot(page);
  await tap(page, 'accounting'); await page.waitForTimeout(1200);
  const spring = 'cubic-bezier(0.3, 1.4, 0.5, 1)';
  // повторний дотик: touchstart на вибраній → .tb-repeat; після touchend функція повернення плавна
  const r = await page.evaluate(async () => {
    const btn = document.querySelector('nav.tabbar button[data-tab="accounting"]'), rect = btn.getBoundingClientRect(), bar = document.querySelector('nav.tabbar');
    const mk = (type) => { const ev = new Event(type, { bubbles: true, cancelable: true }); const t = { identifier: 1, clientX: rect.x + rect.width / 2, clientY: rect.y + rect.height / 2, target: btn }; ev.touches = type === 'touchend' ? [] : [t]; ev.changedTouches = [t]; return ev; };
    btn.dispatchEvent(mk('touchstart')); const during = bar.classList.contains('tb-repeat'); await new Promise(r => setTimeout(r, 60));
    btn.dispatchEvent(mk('touchend')); await new Promise(r => setTimeout(r, 30));
    return { during, tf: getComputedStyle(btn.querySelector('.tbx')).transitionTimingFunction };
  });
  expect(r.during).toBe(true); expect(r.tf).not.toBe(spring);
  await page.waitForTimeout(700);
  expect(await page.locator('nav.tabbar.tb-repeat').count(), 'клас знято після дотику').toBe(0);
  const r2 = await page.evaluate(async () => {
    const btn = document.querySelector('nav.tabbar button[data-tab="structure"]'), rect = btn.getBoundingClientRect(), bar = document.querySelector('nav.tabbar');
    const mk = (type) => { const ev = new Event(type, { bubbles: true, cancelable: true }); const t = { identifier: 1, clientX: rect.x + rect.width / 2, clientY: rect.y + rect.height / 2, target: btn }; ev.touches = type === 'touchend' ? [] : [t]; ev.changedTouches = [t]; return ev; };
    btn.dispatchEvent(mk('touchstart')); const during = bar.classList.contains('tb-repeat'); await new Promise(r => setTimeout(r, 40)); btn.dispatchEvent(mk('touchend')); return during;
  });
  expect(r2, 'дотик по невибраній: .tb-repeat немає').toBe(false);
});
// Rev 2.32.360 (DS-3b3): 20 натискань (зміни вкладок, серія швидше 300 мс, повторні дотики, touchend скасовується й ні): анімація запускається й доходить щоразу, повторний дотик не запускає, подія самописця tab-anim записується на кожне натискання
const recTab = (page) => page.evaluate(() => recBuf.filter(e => e.type === 'tab-anim').map(e => Object.assign({}, e)));
test('55. 20 натискань: подія tab-anim на кожне; зміни — started/ran, дограли або обірвані наступною; повторні — started=false, why=same-tab', async ({ page }) => {
  test.setTimeout(180000);
  await boot(page);
  expect(await page.evaluate(() => recBgOn), 'бортовий самописець увімкнено').toBe(true);
  await tap(page, 'accounting'); await page.waitForTimeout(1200); // перший жест
  await page.evaluate(() => { recBuf.length = 0; });
  // [вкладка, пауза після мс, параметри дотику]; пауза < 300 — серія швидше 300 мс
  const plan = [['structure', 900, {}], ['structure', 900, {}], ['service', 900, { cancelable: false }], ['analytics', 250, {}], ['structure', 200, { cancelable: false }], ['service', 150, {}], ['accounting', 900, { jitter: 5 }],
    ['accounting', 700, {}], ['structure', 900, {}], ['analytics', 120, { cancelable: false }], ['service', 100, {}], ['analytics', 900, {}], ['analytics', 500, { cancelable: false }], ['accounting', 280, {}], ['structure', 260, { cancelable: false }],
    ['service', 900, {}], ['service', 600, {}], ['analytics', 900, {}], ['structure', 200, {}], ['accounting', 1000, {}]];
  expect(plan.length).toBe(20);
  let cur = 'accounting'; const exp = [];
  for (const [tab, gap, o] of plan){ const change = tab !== cur; exp.push({ tab, from: cur, change, gap, click: o.cancelable === false }); await tap(page, tab, o); cur = tab; await page.waitForTimeout(gap); }
  await page.waitForTimeout(1200);
  const evs = await recTab(page);
  const fails = [];
  // події на дотик (via touch|swipe) — по одній на натискання; click-after-touch — додаткові (same-tab)
  const main = evs.filter(e => e.via !== 'click-after-touch'), extra = evs.filter(e => e.via === 'click-after-touch');
  expect(main.length, 'подія на кожне з 20 натискань: ' + JSON.stringify(evs.map(e => e.to + ':' + e.via))).toBe(20);
  exp.forEach((x, i) => {
    const e = main[i];
    if(e.to !== x.tab || e.from !== x.from) { fails.push(i + ' ' + x.from + '→' + x.tab + ': в записі ' + e.from + '→' + e.to); return; }
    if(x.change){
      if(!e.started || !e.ran) fails.push(i + ' ' + x.tab + ': анімація не запущена/не йшла ' + JSON.stringify(e));
      else if(x.gap >= 700 && !e.finished) fails.push(i + ' ' + x.tab + ': не догралась за ' + x.gap + ' мс ' + JSON.stringify(e));
      else if(x.gap < 300 && !e.finished && e.cutBy !== 'next-tab') fails.push(i + ' ' + x.tab + ': обірвана не наступною вкладкою: ' + JSON.stringify(e));
    } else if(e.started !== false || e.why !== 'same-tab') fails.push(i + ' ' + x.tab + ': повторний дотик має бути started=false, why=same-tab: ' + JSON.stringify(e));
  });
  extra.forEach(e => { if(e.started !== false || e.why !== 'same-tab') fails.push('click слідом за дотиком запустив анімацію: ' + JSON.stringify(e)); });
  expect(fails, fails.join('\n')).toEqual([]);
  // приватність: у записі лише дозволені ключі; жодних даних користувача
  const keys = new Set(); evs.forEach(e => Object.keys(e).forEach(k => keys.add(k)));
  const allowed = await page.evaluate(() => REC_ALLOWED_KEYS.concat(['type', 'wall']));
  expect([...keys].filter(k => allowed.indexOf(k) === -1), 'ключі поза білим списком').toEqual([]);
});
test('56. причини, чому анімацію не запущено, потрапляють у запис: старт, клавіатура, шторка, reduced-motion', async ({ page }) => {
  await boot(page);
  // до першого жесту (старт): програмне перемикання
  await page.evaluate(() => { recBuf.length = 0; switchTab('structure'); });
  let evs = await recTab(page); expect(evs.map(e => e.why)).toEqual(['start']);
  await tap(page, 'accounting'); await page.waitForTimeout(1200); await page.evaluate(() => { recBuf.length = 0; });
  await page.evaluate(() => { document.body.classList.add('kb-open'); switchTab('service'); document.body.classList.remove('kb-open'); });
  await page.evaluate(() => { const d = document.createElement('div'); d.className = 'drawer open'; d.id = 'zz-fake'; document.body.appendChild(d); switchTab('structure'); });
  evs = await recTab(page); expect(evs.map(e => e.why)).toEqual(['kb', 'drawer']);
  expect(evs.every(e => e.started === false && typeof e.from === 'string' && typeof e.to === 'string')).toBe(true);
  await page.emulateMedia({ reducedMotion: 'reduce' }); await page.evaluate(() => { document.getElementById('zz-fake').remove(); recBuf.length = 0; switchTab('analytics'); });
  evs = await recTab(page); expect(evs.map(e => e.why)).toEqual(['reduced']);
});
test('57. iPad/десктоп із бічною панеллю: у записі why=ipad (таббар сховано)', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await boot(page);
  await page.click('.side-tab[data-tab="accounting"]'); await page.waitForTimeout(300);
  await page.evaluate(() => { recBuf.length = 0; }); await page.click('.side-tab[data-tab="structure"]'); await page.waitForTimeout(300);
  const evs = await recTab(page); expect(evs.map(e => e.why)).toEqual(['ipad']); expect(evs[0].from).toBe('accounting'); expect(evs[0].to).toBe('structure');
});
