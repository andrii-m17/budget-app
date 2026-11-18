// Rev 2.32.392–393 (DS-5d-1, DS-5d-2): картка «Динаміка за 6 місяців» і «Висновки» на моку (?fixture=…; суми й назви вигадані). «Сьогодні» фіксує installClock (E2E_DAY=1|15|31).
// Висновки: еталон текстів знято з коду ДО зміни (e2e/fixtures/ds5d-insights.json) для E2E_DAY 1/15/31 на тих самих даних (typical): логіка та сама, змінився лише вигляд. Знімки (docs/ui/ds-5d/…) — лише з DS_SHOTS_DIR.
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { installClock } = require('./clock');
const BASE = require('./fixtures/ds5d-insights.json');
const SHOTS = process.env.DS_SHOTS_DIR;
test.use({ hasTouch: true });
async function boot(page, fixture, w, h){
  const errors = [];
  page.on('pageerror', e => errors.push(String(e && e.message || e)));
  await page.setViewportSize({ width: w || 390, height: h || 844 });
  await installClock(page);
  await page.goto('/index.html?fixture=' + (fixture || 'typical'));
  await page.waitForFunction(() => window.MockCloud && typeof cloudSession !== 'undefined' && cloudSession && cloudSession.user && document.querySelector('.tabbar-glass'));
  await page.waitForFunction(() => !document.querySelector('.avatar-status-dot.syncing'), null, { timeout: 15000 }).catch(() => {});
  await page.evaluate(() => { switchTab('analytics'); });
  await page.waitForTimeout(2000);
  return errors;
}
const clean = (t, m) => expect(t, m).not.toMatch(/NaN|Infinity|undefined|null/);
const dyn = page => page.evaluate(() => { const c = document.getElementById('bal-dyn-card'), h = document.getElementById('bal-dyn-chart'), svg = h.querySelector('svg');
  return { mode: dynMode, has: !!svg, h: svg ? svg.getAttribute('height') : null, axis: svg ? [...svg.querySelectorAll('text:not(.vt):not(.xl)')].map(t => t.textContent) : [], xl: svg ? [...svg.querySelectorAll('.xl')].map(t => ({ t: t.textContent, cur: t.classList.contains('cur'), off: t.classList.contains('off'), on: t.classList.contains('on') })) : [],
    bars: svg ? svg.querySelectorAll('.bar').length : 0, badPath: svg ? [...svg.querySelectorAll('path')].filter(p => /NaN|undefined/.test(p.getAttribute('d') || '')).length : 0, tall: svg ? [...svg.querySelectorAll('.bar')].filter(b => b.getBBox().height > 3).length : 0, part: svg ? svg.querySelectorAll('.bar.part').length : 0, lines: svg ? svg.querySelectorAll('.ln').length : 0, dots: svg ? svg.querySelectorAll('circle').length : 0, vt: svg ? [...svg.querySelectorAll('.vt')].map(t => t.textContent) : [],
    leg: document.getElementById('bal-dyn-leg').innerText.replace(/\s+/g, ' ').trim(), note: document.getElementById('bal-dyn-note').textContent, empty: h.querySelector('.empty-hint') ? h.querySelector('.empty-hint').textContent : '', sel: dynSel, bandOn: svg ? svg.querySelector('.band').classList.contains('on') : false, vlOn: svg ? svg.querySelector('.vl').classList.contains('on') : false, hasCls: svg ? svg.classList.contains('has') : false,
    pressed: [...document.querySelectorAll('#bal-dyn-seg button')].map(b => b.getAttribute('aria-pressed')), p: document.getElementById('bal-dyn-seg').style.getPropertyValue('--p'), text: c.innerText, width: svg ? svg.getBoundingClientRect().width : 0 }; });
const ptOf = async (page, i) => page.evaluate(i => { const h = document.getElementById('bal-dyn-chart'), r = h.getBoundingClientRect(), n = 6, pl = 34, pr = 4, gw = (r.width - pl - pr) / n; return { x: r.left + pl + gw * (i + 0.5), y: r.top + 100 }; }, i);

test('DS-5d-1 1. сегмент, графік 212 pt, вісь за F10, місяці знизу, підписи «Nk», поточний неповний місяць напівпрозорий', async ({ page }) => {
  test.setTimeout(120000);
  const errors = await boot(page);
  await page.evaluate(() => document.getElementById('bal-dyn-card').scrollIntoView({ block: 'center' })); await page.waitForTimeout(500);
  const d = await dyn(page), exp = await page.evaluate(() => { const m = selectedMonth, months = []; for (let i = 5; i >= 0; i--) months.push(shiftMonth(m, -i)); const vals = months.map(x => monthAggregates(x)); const mx = Math.max(...vals.flatMap(v => [v.totalIncome, v.totalExpense])); return { ticks: axisModel(mx).ticks.map(axisLabel), cur: monthKey(localDateISO()), sel: m, months: months.map(monthLabelShort), selIdx: 5, hasPartial: months.includes(monthKey(localDateISO())) }; });
  expect(d.mode).toBe('io'); expect(d.pressed).toEqual(['true', 'false']); expect(d.h).toBe('212'); expect(d.axis).toEqual(exp.ticks); expect(d.xl.map(x => x.t)).toEqual(exp.months); expect(d.xl[5].cur).toBe(true);
  expect(d.bars).toBeGreaterThan(0); expect(d.badPath, 'шляхи стовпчиків без NaN').toBe(0); expect(d.tall, 'стовпчики мають висоту').toBeGreaterThan(0); expect(d.part, 'поточний неповний місяць — два напівпрозорі стовпчики').toBe(exp.hasPartial ? 2 : 0); expect(d.vt.every(t => /^(\d+|\d+k)$/.test(t))).toBe(true);
  expect(d.leg).toContain('Доходи'); expect(d.leg).toContain('Витрати'); expect(d.note).toContain('неповний'); clean(d.text, 'динаміка'); expect(errors).toEqual([]);
  expect(await page.evaluate(() => getComputedStyle(document.getElementById('bal-dyn-chart')).touchAction)).toBe('pan-y');
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
});

test('DS-5d-1 2. дотик і ведення пальцем: смуга місяця й вертикальна лінія, решта приглушена, легенда з точними сумами; повторний дотик знімає вибір', async ({ page }) => {
  test.setTimeout(120000);
  await boot(page);
  await page.evaluate(() => document.getElementById('bal-dyn-card').scrollIntoView({ block: 'center' })); await page.waitForTimeout(600);
  const p4 = await ptOf(page, 4), p5 = await ptOf(page, 5);
  await page.mouse.move(p4.x, p4.y); await page.mouse.down(); await page.waitForTimeout(80);
  let d = await dyn(page); expect(d.sel).toBe(4); expect(d.bandOn && d.vlOn && d.hasCls).toBe(true); expect(d.xl[4].on).toBe(true);
  const want = await page.evaluate(() => { const m = shiftMonth(selectedMonth, -1), a = monthAggregates(m); return { name: UA_MONTHS[parseInt(m.slice(5, 7), 10) - 1], inc: fmt(a.totalIncome), exp: fmt(a.totalExpense) }; });
  expect(d.leg.toLowerCase()).toContain(want.name); expect(d.leg.replace(/[\s  ]/g, '')).toContain(want.inc.replace(/[\s  ]/g, '')); expect(d.leg.replace(/[\s  ]/g, '')).toContain(want.exp.replace(/[\s  ]/g, ''));
  await page.mouse.move(p5.x, p5.y, { steps: 4 }); await page.waitForTimeout(80); d = await dyn(page); expect(d.sel, 'ведення пальцем змінює вибір').toBe(5); await page.mouse.up();
  await page.mouse.move(p5.x, p5.y); await page.mouse.down(); await page.mouse.up(); await page.waitForTimeout(150); d = await dyn(page); expect(d.sel, 'повторний дотик по вибраному знімає вибір').toBe(-1); expect(d.bandOn).toBe(false); expect(d.leg).toContain('Доходи');
});

test('DS-5d-1 3. «Борг»: лінія з розривами для місяців без факту; carry-forward не малюється; легенда з дельтою; сегмент синхронний', async ({ page }) => {
  test.setTimeout(120000);
  await boot(page);
  await page.evaluate(() => { const m = selectedMonth, c = bankAccounts[0]; c.createdAt = monthStartISO('2025-01'); debts.forEach(d => { if(d.kind === 'card') d.deletedAt = 'x'; });
    [[-5, 9000], [-4, 8000], [-2, 6000], [0, 5000]].forEach(([k, v], i) => debts.push({ id: 'ds5d-d' + i, name: c.name, kind: 'card', month: shiftMonth(m, k), balance: v, minPayment: 100, deletedAt: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), accountId: c.cloudId || undefined }));
    renderDashboard(); });
  await page.evaluate(() => document.getElementById('bal-dyn-card').scrollIntoView({ block: 'center' })); await page.click('#bal-dyn-seg button[data-k="debt"]'); await page.waitForTimeout(900);
  let d = await dyn(page); expect(d.mode).toBe('debt'); expect(d.pressed).toEqual(['false', 'true']); expect(d.p).toBe('1'); expect(d.h).toBe('212');
  expect(d.dots, 'точки лише за місяці з фактом: −5, −4, −2, 0').toBe(4); expect(d.lines, 'один суцільний відрізок (−5…−4); решта — окремі точки').toBe(1); expect(d.leg).toContain('Борг на кінець місяця'); clean(d.text, 'борг');
  const p3 = await ptOf(page, 2); /* m−3: без запису */ await page.mouse.move(p3.x, p3.y); await page.mouse.down(); await page.mouse.up(); await page.waitForTimeout(150); d = await dyn(page);
  expect(d.sel).toBe(2); expect(d.leg, 'місяць без запису: без вигаданого значення').toContain('немає даних');
  const p1 = await ptOf(page, 1); await page.mouse.move(p1.x, p1.y); await page.mouse.down(); await page.mouse.up(); await page.waitForTimeout(150); d = await dyn(page); expect(d.sel).toBe(1);
  expect(d.leg.replace(/[\s  ]/g, '')).toContain('8000'); expect(d.leg).toMatch(/[−-]\s?1\s?000/);
  await page.click('#bal-dyn-seg button[data-k="io"]'); await page.waitForTimeout(500); d = await dyn(page); expect(d.mode).toBe('io'); expect(d.p).toBe('0'); expect(d.sel, 'зміна режиму скидає вибір').toBe(-1); expect(d.hasCls, 'без вибору групи не приглушені').toBe(false);
  await page.click('#bal-dyn-seg button[data-k="debt"]'); await page.waitForTimeout(500); expect((await dyn(page)).hasCls).toBe(false); expect(await page.evaluate(() => getComputedStyle(document.querySelector('#bal-dyn-chart .grp')).opacity)).toBe('1');
});

test('DS-5d-1 4. порожні стани: немає даних, 1–2 місяці, немає боргів; без NaN', async ({ page }) => {
  test.setTimeout(150000);
  await boot(page);
  // 1–2 місяці: лише поточний
  await page.evaluate(() => { const m = selectedMonth; expenses.forEach(e => { if(monthKey(e.date) !== m) e.deletedAt = 'x'; }); incomes.forEach(e => { if(monthKey(e.date) !== m) e.deletedAt = 'x'; }); renderDashboard(); }); await page.waitForTimeout(600);
  let d = await dyn(page); expect(d.has).toBe(true); expect(d.xl.filter(x => x.off).length, 'місяці до початку обліку приглушені').toBe(5); expect(d.bars).toBe(2); clean(d.text, '1 місяць');
  // немає боргів
  await page.evaluate(() => { debts.forEach(x => { x.deletedAt = 'x'; }); renderDashboard(); }); await page.click('#bal-dyn-seg button[data-k="debt"]'); await page.waitForTimeout(500);
  d = await dyn(page); expect(d.has).toBe(false); expect(d.empty).toContain('Додай борги'); clean(d.text, 'немає боргів');
  // немає даних про доходи й витрати (борг є, тож «Аналітика» не порожня)
  await page.click('#bal-dyn-seg button[data-k="io"]'); await page.evaluate(() => { const c = bankAccounts[0]; c.createdAt = monthStartISO('2025-01'); debts.push({ id: 'ds5d-x', name: c.name, kind: 'card', month: selectedMonth, balance: 1000, minPayment: 100, deletedAt: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), accountId: c.cloudId || undefined }); expenses.forEach(e => { e.deletedAt = 'x'; }); incomes.forEach(e => { e.deletedAt = 'x'; }); renderDashboard(); }); await page.waitForTimeout(500);
  d = await dyn(page); expect(d.has).toBe(false); expect(d.empty).toContain('Ще немає даних про доходи й витрати'); clean(d.text, 'немає даних');
});

test('DS-5d-1 5. минулий і наступний місяць: вікно зсувається, вибір скидається, без NaN; «зменшити рух»', async ({ page }) => {
  test.setTimeout(120000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await boot(page);
  const info = await page.evaluate(() => { const list = currentMonthList(), today = monthKey(localDateISO()); return { prev: shiftMonth(today, -1), next: list[list.length - 1], today }; });
  await page.evaluate(() => document.getElementById('bal-dyn-card').scrollIntoView({ block: 'center' })); await page.waitForTimeout(500);
  const p = await ptOf(page, 2); await page.mouse.move(p.x, p.y); await page.mouse.down(); await page.mouse.up(); await page.waitForTimeout(100); expect((await dyn(page)).sel).toBe(2);
  await page.evaluate(m => onMonthChange(m), info.prev); await page.waitForTimeout(1300);
  let d = await dyn(page); expect(d.sel, 'інший місяць — вибір скинуто').toBe(-1); expect(d.xl[5].cur).toBe(true); expect(d.part, 'минулий місяць повний (поточний неповний лишається напівпрозорим лише там, де він у вікні)').toBe(0); clean(d.text, 'минулий');
  await page.evaluate(m => onMonthChange(m), info.next); await page.waitForTimeout(1300);
  d = await dyn(page); clean(d.text, 'наступний'); expect(d.xl[5].t).toBe(await page.evaluate(m => monthLabelShort(m), info.next)); expect(d.part, 'неповний поточний місяць у вікні напівпрозорий').toBe(2);
  const anim = await page.evaluate(() => getComputedStyle(document.querySelector('#bal-dyn-chart .bar')).animationName); expect(anim).toBe('none');
});

test('DS-5d-2 6. «Висновки»: ті самі п\'ять висновків (тексти як до зміни), контурні піктограми без кружків, порожньо — пояснення', async ({ page }) => {
  test.setTimeout(150000);
  await boot(page);
  const day = String(process.env.E2E_DAY || 15);
  for (const k of ['cur', 'prev', 'next']){
    await page.evaluate(k => { const list = currentMonthList(), today = monthKey(localDateISO()); onMonthChange(k === 'cur' ? today : (k === 'prev' ? shiftMonth(today, -1) : list[list.length - 1])); }, k); await page.waitForTimeout(1200);
    const got = await page.evaluate(() => [...document.querySelectorAll('#summary-container .bal-ili')].map(i => [i.querySelector('.bal-itx b').textContent, i.querySelector('.bal-itx span').textContent]));
    expect(got, 'тексти висновків, місяць ' + k + ', день ' + day).toEqual(BASE[day][k]);
  }
  await page.evaluate(() => onMonthChange(monthKey(localDateISO()))); await page.waitForTimeout(1000);
  const v = await page.evaluate(() => { const i = document.querySelector('#summary-container .bal-ili'); return { icons: document.querySelectorAll('#summary-container .bal-ii svg').length, rows: document.querySelectorAll('#summary-container .bal-ili').length, fill: getComputedStyle(i.querySelector('.bal-ii')).backgroundColor, stroke: i.querySelector('.bal-ii svg').getAttribute('stroke'), old: document.querySelectorAll('.insight-icon, .insight-item').length, w: document.documentElement.scrollWidth - window.innerWidth }; });
  expect(v.icons).toBe(v.rows); expect(v.rows).toBeGreaterThan(0); expect(v.stroke).toBe('currentColor'); expect(v.fill).toMatch(/rgba\(0, 0, 0, 0\)|transparent/); expect(v.old).toBe(0); expect(v.w).toBeLessThanOrEqual(0);
  await page.evaluate(() => { expenses.forEach(e => { e.deletedAt = 'x'; }); incomes.forEach(e => { e.deletedAt = 'x'; }); debts.forEach(e => { e.deletedAt = 'x'; }); renderDashboard(); }); await page.waitForTimeout(500);
  // повністю порожня «Аналітика»: картка прихована разом з тілом (analytics-empty)
  expect(await page.evaluate(() => document.getElementById('analytics-body').classList.contains('hidden'))).toBe(true);
});

test('ds5d-shots', async ({ page }) => {
  test.skip(!SHOTS, 'потрібен DS_SHOTS_DIR');
  test.setTimeout(480000); fs.mkdirSync(SHOTS, { recursive: true });
  const hideBar = () => page.evaluate(() => { const t = document.querySelector('.tabbar-glass'); if(t) t.style.display = 'none'; });
  const shot = async (sel, name) => { await hideBar(); await page.evaluate(s => document.querySelector(s).scrollIntoView({ block: 'center' }), sel); await page.waitForTimeout(1500); await page.locator(sel).screenshot({ path: path.join(SHOTS, name + '.png') }); };
  for (const [w, h] of [[390, 844], [320, 700], [1280, 800]]){
    for (const theme of ['dark', 'light']){
      const tag = w + '-' + theme;
      await boot(page, 'typical', w, h); await page.evaluate(t => document.documentElement.setAttribute('data-theme', t), theme); await page.waitForTimeout(300);
      await shot('#bal-dyn-card', 'dyn-io-' + tag);
      const p = await ptOf(page, 4); await page.mouse.move(p.x, p.y); await page.mouse.down(); await page.mouse.up(); await page.waitForTimeout(400); await shot('#bal-dyn-card', 'dyn-io-selected-' + tag);
      await page.evaluate(() => { const m = selectedMonth, c = bankAccounts[0]; c.createdAt = monthStartISO('2025-01'); debts.forEach(d => { if(d.kind === 'card') d.deletedAt = 'x'; }); [[-5, 9000], [-4, 8000], [-2, 6000], [0, 5000]].forEach(([k, v], i) => debts.push({ id: 'sh-d' + i, name: c.name, kind: 'card', month: shiftMonth(m, k), balance: v, minPayment: 100, deletedAt: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), accountId: c.cloudId || undefined })); renderDashboard(); });
      await page.click('#bal-dyn-seg button[data-k="debt"]'); await page.waitForTimeout(600); await shot('#bal-dyn-card', 'dyn-debt-' + tag);
      const p2 = await ptOf(page, 4); await page.mouse.move(p2.x, p2.y); await page.mouse.down(); await page.mouse.up(); await page.waitForTimeout(400); await shot('#bal-dyn-card', 'dyn-debt-selected-' + tag);
      await shot('#bal-ins-card', 'insights-' + tag);
      await page.evaluate(() => { debts.forEach(x => { x.deletedAt = 'x'; }); expenses.forEach(e => { const m = selectedMonth; if(monthKey(e.date) !== m) e.deletedAt = 'x'; }); incomes.forEach(e => { if(monthKey(e.date) !== selectedMonth) e.deletedAt = 'x'; }); renderDashboard(); }); await page.waitForTimeout(500);
      await shot('#bal-dyn-card', 'dyn-debt-empty-' + tag); await page.click('#bal-dyn-seg button[data-k="io"]'); await page.waitForTimeout(500); await shot('#bal-dyn-card', 'dyn-one-month-' + tag);
      await page.evaluate(() => { expenses.forEach(e => { e.deletedAt = 'x'; }); incomes.forEach(e => { e.deletedAt = 'x'; }); renderDashboard(); }); await page.waitForTimeout(500);
      await page.evaluate(() => { document.getElementById('bal-dyn-card').style.display = ''; }); 
    }
  }
});
