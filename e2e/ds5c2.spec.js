// Rev 2.32.390 (DS-5c-2): картка «Потенціал економії» на моку (?fixture=…; суми й назви вигадані). «Сьогодні» фіксує installClock (E2E_DAY=1|15|31).
// Очікувані числа рахуються незалежно від застосунку (за коефіцієнтами 1 / 0,65 / 0,25); математику typicalMonth перевіряє tests/savings-potential.test.js. Знімки (docs/ui/ds-5c2/…) — лише з DS_SHOTS_DIR.
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { installClock } = require('./clock');
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
  await page.evaluate(() => {
    switchTab('analytics');
    window.__nm = k => Object.keys(SUBCATEGORY_PRIORITY).find(x => x.includes(k));
    window.__add = (month, sub, amount, id) => { expenses.push({ id: 'ds5c2-' + id, date: month + '-05', amount: amount, category: 'К', subcategory: sub, note: '', deletedAt: null }); };
  });
  await page.waitForTimeout(1800);
  return errors;
}
const card = page => page.evaluate(() => { const el = id => document.getElementById(id), c = el('bal-pot-card');
  return { empty: c.classList.contains('is-empty'), open: c.classList.contains('open'), num: el('kpi-pot').getAttribute('aria-label'), final: el('kpi-pot').dataset.final, share: el('bal-pot-share').textContent, year: el('bal-pot-year').innerText.replace(/\s+/g, ' ').trim(), em: [...el('bal-pot-em').children].map(x => x.textContent),
    bar: el('bal-pot-bar').children.length, rows: [...el('bal-pot-list').querySelectorAll('.bal-pli')].map(r => ({ name: r.querySelector('.bal-pnm').childNodes[0].textContent, lvl: r.querySelector('.bal-plvl').className.replace('bal-plvl ', ''), lvlText: r.querySelector('.bal-plvl').textContent, sub: r.querySelector('.bal-psub').textContent })),
    emptyText: el('bal-pot-empty').textContent, hint: el('bal-pot-hint').textContent, text: c.innerText, h: el('bal-pot-more').getBoundingClientRect().height, month: selectedMonth }; });
const clean = (t, m) => expect(t, m).not.toMatch(/NaN|Infinity|undefined|null/);
const fmtN = n => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
const digits = s => s.replace(/[^\d]/g, '');

test('DS-5c-2 1. без позначених підкатегорій: «Немає підкатегорій для аналізу» і підказка, розгортання недоступне, без NaN', async ({ page }) => {
  test.setTimeout(120000);
  const errors = await boot(page);
  const s = await card(page);
  expect(s.empty).toBe(true); expect(s.emptyText).toBe('Немає підкатегорій для аналізу'); expect(s.hint).toContain('позначені підкатегорії'); expect(s.hint.length).toBeGreaterThan(30);
  await page.evaluate(() => document.getElementById('bal-pot-card').scrollIntoView({ block: 'center' })); await page.click('#bal-pot-toggle', { force: true }); await page.waitForTimeout(500);
  expect((await card(page)).open, 'порожня картка не розгортається').toBe(false); clean(s.text, 'порожньо'); expect(errors).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
});

test('DS-5c-2 2. картка: сума = Σ сум топ-5 за сума × коефіцієнт, три емодзі найбільших, смуга з п\'яти сегментів, частка від витрат; розгортання на місці з рівнями', async ({ page }) => {
  test.setTimeout(120000);
  await boot(page);
  await page.evaluate(() => { const m = selectedMonth; [['Перекус', 3000], ['Футбол', 8000], ['Обіди', 2000], ['Таксі', 500], ['Кава', 400], ['Догляд', 100]].forEach(([k, a], i) => __add(m, __nm(k), a, 'a' + i)); renderDashboard(); });
  await page.waitForTimeout(600);
  // вага: Перекус 3000, Футбол 2000, Обіди 1300, Таксі 500, Кава 400, Догляд 65 → топ-5 без Догляду; потенціал = 3000+8000+2000+500+400
  let s = await card(page);
  expect(s.empty).toBe(false); expect(digits(s.num)).toBe('13900'); expect(s.final).toBe('13900'); expect(s.bar).toBe(5); expect(s.em.length).toBe(3); s.em.forEach(e => expect(e).not.toBe('•'));
  const exp = await page.evaluate(() => monthAggregates(selectedMonth).totalExpense); expect(s.share).toBe(Math.round(13900 / exp * 100) + '% із ' + (await page.evaluate(n => fmt(n), exp)) + ' витрат'); clean(s.text, 'картка');
  expect(s.h, 'згорнуто: висота 0').toBeLessThan(2);
  await page.evaluate(() => document.getElementById('bal-pot-card').scrollIntoView({ block: 'center' })); await page.click('#bal-pot-toggle'); await page.waitForTimeout(700);
  s = await card(page); expect(s.open).toBe(true); expect(s.h, 'розкрито: список').toBeGreaterThan(150); expect(s.rows.length).toBe(5);
  expect(s.rows.map(r => r.name)).toEqual(['Перекус', 'Футбол', 'Обіди', 'Таксі', 'Кава']); expect(s.rows.map(r => r.lvl)).toEqual(['high', 'low', 'mid', 'high', 'high']); expect(s.rows.map(r => r.lvlText)).toEqual(['Високий', 'Низький', 'Середній', 'Високий', 'Високий']);
  expect(s.rows[0].sub).toMatch(/внесок \d+%/); expect(await page.getAttribute('#bal-pot-toggle', 'aria-expanded')).toBe('true');
  const colors = await page.evaluate(() => ['high', 'mid', 'low'].map(l => getComputedStyle(document.querySelector('.bal-plvl.' + l)).color)); expect(new Set(colors).size, 'три різні кольори рівнів').toBe(3);
  await page.click('#bal-pot-toggle'); await page.waitForTimeout(700); expect((await card(page)).h).toBeLessThan(2);
});

test('DS-5c-2 3. «≈ на рік»: 6 місяців → без найбільшого й найменшого (5 000 → 60 000); 5, 3–4, 1–2 («мало даних»); перший місяць — без «на рік»', async ({ page }) => {
  test.setTimeout(150000);
  await boot(page);
  const setup = (vals) => page.evaluate((vals) => { expenses.forEach(e => { if(String(e.id).startsWith('ds5c2-')) e.deletedAt = 'x'; }); const m = selectedMonth; __add(m, __nm('Кава'), 1000, 'cur');
    for (let i = 1; i <= 6; i++){ const mm = shiftMonth(m, -i); const v = vals[i - 1]; if(v === undefined || v === null){ /* без записів */ } else if(v === 'noPot'){ expenses.push({ id: 'ds5c2-np' + i, date: mm + '-05', amount: 700, category: 'К', subcategory: 'Звичайна', note: '', deletedAt: null }); } else __add(mm, __nm('Таксі'), v, 'p' + i); } renderDashboard(); }, vals);
  const year = async () => (await card(page)).year;
  // у фікстурі вже є записи в попередніх місяцях: вимикаємо їх, щоб вікно задавали лише тестові
  await page.evaluate(() => { const m = selectedMonth; expenses.forEach(e => { if(monthKey(e.date) !== m) e.deletedAt = 'x'; }); });
  await setup([4200, 5100, 7900, 4600, 4900, 5400]); await page.waitForTimeout(500);
  let y = await year(); expect(digits(y)).toBe('60000'); expect(y).not.toContain('мало даних'); expect(y).toContain('на рік');
  await setup([1000, 5000, 5200, 5400, 20000]); await page.waitForTimeout(400); y = await year(); expect(digits(y), '5 місяців: (5000+5200+5400)/3 = 5200 → 62 400').toBe('62400');
  await setup([4000, 5000, 6000, 9000]); await page.waitForTimeout(400); y = await year(); expect(digits(y), '4 місяці: просте середнє 6000 → 72 000').toBe('72000'); expect(y).not.toContain('мало даних');
  await setup([4000, 9000]); await page.waitForTimeout(400); y = await year(); expect(digits(y), '2 місяці: 6500 → 78 000').toBe('78000'); expect(y).toContain('мало даних');
  await setup(['noPot', 3000, 'noPot']); await page.waitForTimeout(400); y = await year(); expect(digits(y), 'місяць із записами без позначених дає 0: (0+3000+0)/3 = 1000 → 12 000').toBe('12000');
  await setup([]); await page.waitForTimeout(400); expect(await year(), 'перший місяць даних: «на рік» не показуємо').toBe('');
  clean((await card(page)).text, 'перший місяць');
});

test('DS-5c-2 4. минулий і наступний місяць: числа з чинного розрахунку; наступний — порожній стан; розгортання лишається, поки дані змінюються', async ({ page }) => {
  test.setTimeout(120000);
  await boot(page);
  const info = await page.evaluate(() => { const list = currentMonthList(), today = monthKey(localDateISO()); return { prev: shiftMonth(today, -1), next: list[list.length - 1], today }; });
  await page.evaluate(i => { __add(i.prev, __nm('Таксі'), 4000, 'pv'); __add(i.today, __nm('Кава'), 1500, 'cr'); renderDashboard(); }, info); await page.waitForTimeout(500);
  await page.evaluate(() => document.getElementById('bal-pot-card').scrollIntoView({ block: 'center' })); await page.click('#bal-pot-toggle'); await page.waitForTimeout(700);
  await page.evaluate(m => onMonthChange(m), info.prev); await page.waitForTimeout(1300);
  let s = await card(page); expect(s.month).toBe(info.prev); expect(digits(s.num)).toBe('4000'); expect(s.rows.length).toBe(1); expect(s.open, 'розгорнутість зберігається при зміні місяця').toBe(true); clean(s.text, 'минулий');
  await page.evaluate(m => onMonthChange(m), info.next); await page.waitForTimeout(1300);
  s = await card(page); expect(s.empty).toBe(true); expect(s.emptyText).toBe('Немає підкатегорій для аналізу'); clean(s.text, 'наступний');
  expect(await page.getAttribute('#bal-pot-toggle', 'aria-expanded'), 'порожня картка не заявляє «розгорнуто»').toBe('false'); expect(await page.getAttribute('#bal-pot-toggle', 'aria-disabled')).toBe('true'); expect(s.open).toBe(false);
  await page.evaluate(m => onMonthChange(m), info.today); await page.waitForTimeout(1300);
  s = await card(page); expect(digits(s.num)).toBe('1500'); expect(s.open, 'бажана розгорнутість повернулась').toBe(true);
  await page.evaluate(() => { __add(selectedMonth, __nm('Таксі'), 777, 'live'); renderDashboard(); }); await page.waitForTimeout(500);
  s = await card(page); expect(digits(s.num)).toBe('2277'); expect(s.rows.length).toBe(2); expect(s.open).toBe(true);
});

test('DS-5c-2 6. наступний місяць: неповний поточний місяць не входить у «≈ на рік»', async ({ page }) => {
  test.setTimeout(120000);
  await boot(page);
  const info = await page.evaluate(() => { const list = currentMonthList(), today = monthKey(localDateISO()); expenses.forEach(e => { if(monthKey(e.date) !== today) e.deletedAt = 'x'; }); return { today, next: list[list.length - 1] }; });
  await page.evaluate(i => { __add(i.today, __nm('Таксі'), 90000, 'big'); // великий потенціал неповного поточного місяця
    [4200, 5100, 7900, 4600, 4900].forEach((v, k) => __add(shiftMonth(i.next, -(k + 2)), __nm('Таксі'), v, 'w' + k)); // повні місяці −2…−6 відносно наступного
    __add(i.next, __nm('Кава'), 1500, 'nx'); renderDashboard(); }, info);
  await page.evaluate(m => onMonthChange(m), info.next); await page.waitForTimeout(1300);
  const s = await card(page); expect(s.month).toBe(info.next); expect(s.empty).toBe(false);
  expect(digits(s.year), 'типовий з 5 повних місяців (без найбільшого й найменшого): (4600+4900+5100)/3 = 4867 → 4900 → 58 800; 90 000 неповного місяця не входить').toBe('58800');
  expect(s.year).not.toContain('мало даних');
});

test('DS-5c-2 5. «зменшити рух»: одометр без переходу; рядки й смуга без анімацій', async ({ page }) => {
  test.setTimeout(120000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await boot(page);
  await page.evaluate(() => { __add(selectedMonth, __nm('Таксі'), 900, 'rm'); renderDashboard(); }); await page.waitForTimeout(400);
  const r = await page.evaluate(() => ({ z: [...document.querySelectorAll('#kpi-pot .odc')].every(c => c.classList.contains('z')), anim: getComputedStyle(document.querySelector('#bal-pot-bar i')).animationName }));
  expect(r.z).toBe(true); expect(r.anim).toBe('none');
});

test('ds5c2-shots', async ({ page }) => {
  test.skip(!SHOTS, 'потрібен DS_SHOTS_DIR');
  test.setTimeout(420000); fs.mkdirSync(SHOTS, { recursive: true });
  const hideBar = () => page.evaluate(() => { const t = document.querySelector('.tabbar-glass'); if(t) t.style.display = 'none'; });
  const shot = async name => { await hideBar(); await page.evaluate(() => document.getElementById('bal-pot-card').scrollIntoView({ block: 'center' })); await page.waitForTimeout(1500); await page.locator('#bal-pot-card').screenshot({ path: path.join(SHOTS, name + '.png') }); };
  const seed = (vals) => page.evaluate((vals) => { const m = selectedMonth; expenses.forEach(e => { if(monthKey(e.date) !== m) e.deletedAt = 'x'; });
    [['Перекус', 3000], ['Футбол', 8000], ['Обіди', 2000], ['Таксі', 500], ['Кава', 400]].forEach(([k, a], i) => __add(m, __nm(k), a, 'a' + i));
    vals.forEach((v, i) => __add(shiftMonth(m, -(i + 1)), __nm('Таксі'), v, 'p' + i)); renderDashboard(); }, vals);
  for (const [w, h] of [[390, 844], [320, 700], [1280, 800]]){
    for (const theme of ['dark', 'light']){
      const tag = w + '-' + theme;
      await boot(page, 'typical', w, h); await page.evaluate(t => document.documentElement.setAttribute('data-theme', t), theme); await page.waitForTimeout(300);
      await shot('empty-' + tag);
      await seed([4200, 5100, 7900, 4600, 4900, 5400]); await page.waitForTimeout(500); await shot('collapsed-' + tag);
      await page.click('#bal-pot-toggle'); await page.waitForTimeout(900); await shot('expanded-' + tag); await page.click('#bal-pot-toggle'); await page.waitForTimeout(500);
      await seed([4000, 9000]); await page.waitForTimeout(500); await shot('few-' + tag);
      await page.evaluate(() => { expenses.forEach(e => { if(String(e.id).startsWith('ds5c2-')) e.deletedAt = 'x'; }); const m = selectedMonth; expenses.forEach(e => { if(monthKey(e.date) !== m) e.deletedAt = 'x'; }); __add(m, __nm('Таксі'), 1200, 'first'); renderDashboard(); }); await page.waitForTimeout(500); await shot('first-' + tag);
      const next = await page.evaluate(() => currentMonthList().slice(-1)[0]); await page.evaluate(m => onMonthChange(m), next); await page.waitForTimeout(1200); await shot('next-' + tag);
    }
  }
});
