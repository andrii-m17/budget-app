// Rev 2.32.388 (DS-5c-1): картка «Деталізація витрат» і шторка з кільцями на моку (?fixture=…; суми й назви вигадані). «Сьогодні» фіксує installClock (E2E_DAY=1|15|31).
// Очікування рахуються на сторінці незалежно від застосунку (reduce по monthAggregates().monthExp); математику donutModel перевіряє tests/cat-donut.test.js. Знімки (docs/ui/ds-5c1/…) — лише з DS_SHOTS_DIR.
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
    window.__swipe = async (sel, dy, steps, gap) => { const el = document.querySelector(sel), r = el.getBoundingClientRect(), x = r.x + r.width / 2, y0 = r.y + r.height / 2;
      const fire = (type, yy) => el.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 5, pointerType: 'touch', isPrimary: true, clientX: x, clientY: yy, button: type === 'pointerdown' ? 0 : -1 }));
      fire('pointerdown', y0); for (let i = 1; i <= steps; i++){ if(gap) await new Promise(r => setTimeout(r, gap)); fire('pointermove', y0 + dy * i / steps); } fire('pointerup', y0 + dy); };
  });
  await page.waitForTimeout(1800);
  return errors;
}
const expected = page => page.evaluate(() => {
  const exp = monthAggregates(selectedMonth).monthExp, total = exp.reduce((s, e) => s + e.amount, 0), by = {};
  exp.forEach(e => { const k = e.category || '🧾 Без категорії'; by[k] = (by[k] || 0) + e.amount; });
  const list = Object.entries(by).sort((a, b) => b[1] - a[1]).map(([n, s]) => ({ name: stripLeadingEmoji(n), sum: s, pct: Math.round(s / total * 100) }));
  return { total, list, rows: [...document.querySelectorAll('#bal-cat-top .bal-crow')].map(r => ({ name: r.querySelector('.bal-cnm').childNodes[0].textContent, am: r.querySelector('.bal-cam').textContent, pc: r.querySelector('.bal-cpc').textContent })), text: document.getElementById('bal-cat-card').innerText };
});
const clean = (t, m) => expect(t, m).not.toMatch(/NaN|Infinity|undefined|null/);
const sheet = page => page.evaluate(() => { const d = document.getElementById('bal-sheet-cats'); return { open: d.classList.contains('open'), segs: [...d.querySelectorAll('.bal-sg')].map(c => ({ k: c.dataset.k, dim: c.classList.contains('dim'), v: c.dataset.v, dash: c.getAttribute('stroke-dasharray') })), labels: d.querySelectorAll('.bal-dl').length,
  rows: [...d.querySelectorAll('#bal-call .bal-crow')].map(r => ({ k: r.dataset.k, on: r.classList.contains('on') })), center: document.getElementById('bal-sunc') ? document.getElementById('bal-sunc').innerText : '', text: d.innerText, mode: balCatMode, sel: balCatSel }; });

test('DS-5c-1 1. картка: топ-4 категорій з емодзі, сумою, відсотком від витрат; числа збігаються з чинними сумами; сегмент перемикає підкатегорії', async ({ page }) => {
  test.setTimeout(120000);
  const errors = await boot(page);
  await page.evaluate(() => { const m = selectedMonth; ['🛒 Продукти', '🍔 Харчування', '🚌 Транспорт', '🛍️ Покупки', '🏠 Дім', '📱 Зв’язок'].forEach((c, i) => expenses.push({ id: 'ds5c1-' + i, date: m + '-01', amount: 900 - i * 100, category: c, subcategory: i < 3 ? ['🏪 Магазин', '☕️ Кафе', '🚕 Таксі'][i] : '', note: '', deletedAt: null })); renderDashboard(); });
  await page.waitForTimeout(500);
  const e = await expected(page);
  expect(e.rows.length).toBe(Math.min(4, e.list.length)); expect(e.rows.length).toBeGreaterThan(0);
  e.rows.forEach((r, i) => { expect(r.name).toBe(e.list[i].name); expect(r.pc).toBe(e.list[i].pct + '%'); expect(r.am.replace(/[\s  ]/g, '')).toBe(String(e.list[i].sum) + '₴'); });
  expect(await page.locator('#bal-cat-top .bal-em').first().innerText()).not.toBe(''); clean(e.text, 'картка');
  await page.click('#bal-cat-seg button[data-m="sub"]'); await page.waitForTimeout(400);
  expect(await page.getAttribute('#bal-cat-seg button[data-m="sub"]', 'aria-pressed')).toBe('true'); expect(await page.evaluate(() => document.getElementById('bal-cat-seg').style.getPropertyValue('--p'))).toBe('1');
  const sub = await page.evaluate(() => ({ rows: document.querySelectorAll('#bal-cat-top .bal-crow').length, hasParent: !!document.querySelector('#bal-cat-top .bal-csub'), fill: getComputedStyle(document.querySelector('#bal-cat-top .bal-cfill')).backgroundColor, catFill: getComputedStyle(document.documentElement).getPropertyValue('--sub-bar') }));
  expect(sub.rows).toBeGreaterThan(0); expect(sub.hasParent, 'у режимі підкатегорій видно категорію').toBe(true);
  await page.click('#bal-cat-seg button[data-m="cat"]'); await page.waitForTimeout(300);
  expect(await page.evaluate(() => document.querySelector('#bal-cat-top .bal-csub') === null)).toBe(true); expect(errors).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
});

test('DS-5c-1 2. дотик до рядка відкриває шторку з виділеним пунктом; кільце, підписи ≥ 7 %, центр = сума; свайп закриває', async ({ page }) => {
  test.setTimeout(120000);
  await boot(page);
  await page.evaluate(() => document.getElementById('bal-cat-card').scrollIntoView({ block: 'center' }));
  const first = await page.evaluate(() => ({ k: document.querySelector('#bal-cat-top .bal-crow').dataset.k, name: document.querySelector('#bal-cat-top .bal-cnm').childNodes[0].textContent }));
  await page.click('#bal-cat-top .bal-crow'); await page.waitForTimeout(900);
  let s = await sheet(page); expect(s.open).toBe(true); expect(s.sel).toBe(first.k); expect(s.rows.filter(r => r.on).map(r => r.k)).toEqual([first.k]);
  expect(s.center).toContain(first.name); expect(s.segs.length).toBeGreaterThan(0); expect(s.segs.filter(c => !c.dim).length, 'інші сектори затемнені').toBe(1);
  const total = await page.evaluate(() => balCatData.total);
  const m = await page.evaluate(() => donutModel(balCatItems(), 5)); expect(s.segs.length).toBe(m.segs.length); expect(s.labels).toBe(m.segs.filter(x => x.label).length);
  s.segs.forEach(c => expect(c.dash, 'дуга домальована').toBe(c.v + ' ' + (100 - parseFloat(c.v))));
  await page.click('#bal-sunc'); await page.waitForTimeout(300); s = await sheet(page); expect(s.sel, 'дотик у центр знімає вибір').toBe(null); expect(s.segs.every(c => !c.dim)).toBe(true); expect(s.center.replace(/[\s  ]/g, '')).toContain(String(total));
  await page.evaluate(() => __swipe('#bal-sheet-cats .drawer-handle', 140, 10, 40)); await page.waitForTimeout(600);
  expect((await sheet(page)).open, 'свайп закриває').toBe(false);
  expect(await page.evaluate(() => balCatSel), 'вибір скинуто').toBe(null);
});

test('DS-5c-1 3. дотик до сектора (справжній клік по дузі) і до рядка: центр показує суму й частку, решта приглушена; повторний дотик знімає; сегмент у шторці має своє кільце', async ({ page }) => {
  test.setTimeout(120000);
  await boot(page);
  await page.evaluate(() => { const m = selectedMonth; ['🛒 Продукти', '🍔 Харчування', '🚌 Транспорт'].forEach((c, i) => expenses.push({ id: 'ds5c1-s' + i, date: m + '-02', amount: 3000 + i * 500, category: c, subcategory: ['🏪 Магазин', '☕️ Кафе', ''][i], note: '', deletedAt: null })); renderDashboard(); });
  await page.waitForTimeout(500);
  await page.evaluate(() => document.getElementById('bal-cat-card').scrollIntoView({ block: 'center' })); await page.click('#bal-cat-all'); await page.waitForTimeout(1200);
  const info = await page.evaluate(() => { const m = donutModel(balCatItems(), 5), r = document.getElementById('bal-sunwrap').getBoundingClientRect(); const s = m.segs[1]; return { x: r.left + s.lx, y: r.top + s.ly, key: s.key, name: s.name, pct: s.pct }; });
  await page.mouse.click(info.x, info.y); await page.waitForTimeout(300);
  let s = await sheet(page); expect(s.sel, 'клік по дузі вибирає сектор').toBe(info.key); expect(s.center).toContain(info.name); expect(s.center).toContain(info.pct + '%'); expect(s.segs.filter(c => c.dim).length).toBe(s.segs.length - 1);
  await page.mouse.click(info.x, info.y); await page.waitForTimeout(300); expect((await sheet(page)).sel, 'повторний дотик знімає вибір').toBe(null);
  const rowKey = s.rows[2].k; await page.click('#bal-call .bal-crow[data-k="' + rowKey.replace(/"/g, '\\"') + '"]'); await page.waitForTimeout(300); s = await sheet(page); expect(s.sel).toBe(rowKey); expect(s.rows.filter(r => r.on).length).toBe(1);
  const catSegs = s.segs.length, catCenter = s.center;
  await page.click('#bal-cat-seg-s button[data-m="sub"]'); await page.waitForTimeout(1200); s = await sheet(page);
  expect(s.mode).toBe('sub'); expect(s.sel, 'вибір скидається при зміні режиму').toBe(null); expect(s.center).not.toBe(catCenter); expect(s.segs.map(c => c.k).every(k => /^(s|n):|^__other$/.test(k)), 'кільце підкатегорій окреме').toBe(true);
  expect(await page.evaluate(() => document.getElementById('bal-cat-seg').querySelector('button[data-m="sub"]').getAttribute('aria-pressed'))).toBe('true'); // сегменти синхронні
  expect(s.text).toContain('Без підкатегорії'); clean(s.text, 'підкатегорії');
});

test('DS-5c-1 4. стани: немає витрат, одна категорія, багато дрібних («Решта»), підкатегорії без значення; без NaN', async ({ page }) => {
  test.setTimeout(150000);
  await boot(page);
  // одна категорія
  await page.evaluate(() => { const m = selectedMonth; expenses.forEach(e => { if(monthKey(e.date) === m){ e.category = '🛒 Продукти'; e.subcategory = ''; } }); renderDashboard(); }); await page.waitForTimeout(500);
  await page.evaluate(() => document.getElementById('bal-cat-card').scrollIntoView({ block: 'center' })); await page.click('#bal-cat-all'); await page.waitForTimeout(1200);
  let s = await sheet(page); expect(s.segs.length).toBe(1); expect(s.segs[0].v).toBe('100.00'); expect(s.rows.length).toBe(1); clean(s.text, 'одна категорія');
  await page.keyboard.press('Escape'); await page.waitForTimeout(500);
  // багато дрібних
  await page.evaluate(() => { const m = selectedMonth; for (let i = 1; i <= 12; i++) expenses.push({ id: 'ds5c1-t' + i, date: m + '-03', amount: 5, category: 'Тест ' + i, subcategory: '', note: '', deletedAt: null }); renderDashboard(); }); await page.waitForTimeout(500);
  await page.click('#bal-cat-all'); await page.waitForTimeout(1200); s = await sheet(page);
  expect(s.segs.length).toBe(6); expect(s.segs[s.segs.length - 1].k).toBe('__other'); expect(s.rows.length, 'у списку всі категорії').toBe(13);
  await page.evaluate(() => { const c = document.querySelector('.bal-sg[data-k="__other"]'); c.dispatchEvent(new MouseEvent('click', { bubbles: true })); }); await page.waitForTimeout(300); s = await sheet(page);
  expect(s.center).toContain('Решта'); expect(s.rows.filter(r => r.on).length, 'виділено рядки, що входять в «Решта» (13 − 5 з назвою)').toBe(8); await page.keyboard.press('Escape'); await page.waitForTimeout(500);
  // немає витрат
  await page.evaluate(() => { expenses.forEach(e => { e.deletedAt = new Date().toISOString(); }); renderDashboard(); }); await page.waitForTimeout(500);
  expect(await page.locator('#bal-cat-top .empty-hint').count()).toBe(1); expect(await page.locator('#bal-cat-all.hidden').count(), '«Усі» прихована без витрат').toBe(1);
  await page.evaluate(() => openCatsSheet()); await page.waitForTimeout(800); s = await sheet(page); expect(s.segs.length).toBe(0); clean(s.text, 'порожньо'); expect(await page.evaluate(() => document.querySelector('#bal-sunwrap svg circle').getAttribute('stroke'))).toBe('var(--surface-2)');
});

test('DS-5c-1 5. минулий і наступний місяць: картка збігається з сумами місяця; вибір скидається; наступний — порожньо', async ({ page }) => {
  test.setTimeout(120000);
  await boot(page);
  const info = await page.evaluate(() => { const list = currentMonthList(); return { prev: shiftMonth(monthKey(localDateISO()), -1), next: list[list.length - 1] }; });
  await page.evaluate(() => { document.getElementById('bal-cat-card').scrollIntoView({ block: 'center' }); }); await page.click('#bal-cat-top .bal-crow'); await page.waitForTimeout(800); await page.keyboard.press('Escape'); await page.waitForTimeout(500);
  await page.evaluate(m => onMonthChange(m), info.prev); await page.waitForTimeout(1300);
  const e = await expected(page); e.rows.forEach((r, i) => { expect(r.name).toBe(e.list[i].name); expect(r.pc).toBe(e.list[i].pct + '%'); }); clean(e.text, 'минулий');
  expect(await page.evaluate(() => balCatSel)).toBe(null);
  await page.evaluate(m => onMonthChange(m), info.next); await page.waitForTimeout(1300);
  expect(await page.locator('#bal-cat-top .empty-hint').count()).toBe(1); clean((await expected(page)).text, 'наступний');
});

test('DS-5c-1 6. дані змінились, поки шторка відкрита: кільце й список перемальовуються; «зменшити рух»: дуги одразу готові', async ({ page }) => {
  test.setTimeout(120000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await boot(page);
  await page.evaluate(() => document.getElementById('bal-cat-card').scrollIntoView({ block: 'center' })); await page.click('#bal-cat-all'); await page.waitForTimeout(300);
  const s0 = await sheet(page); s0.segs.forEach(c => expect(c.dash, 'без анімації дуги готові одразу').toBe(c.v + ' ' + (100 - parseFloat(c.v))));
  expect(await page.evaluate(() => getComputedStyle(document.querySelector('.bal-sg')).transitionDuration)).toMatch(/^0s|0\.0\ds?$/);
  const before = await page.evaluate(() => balCatData.total);
  await page.evaluate(() => { expenses.push({ id: 'ds5c1-live', date: selectedMonth + '-02', amount: 7777, category: '🛒 Продукти', subcategory: '', note: '', deletedAt: null }); renderDashboard(); }); await page.waitForTimeout(500);
  const after = await page.evaluate(() => ({ total: balCatData.total, center: document.getElementById('bal-sunc').innerText })); expect(after.total).toBe(before + 7777);
  expect(after.center.replace(/[\s  ]/g, '')).toContain(String(before + 7777));
});

test('ds5c1-shots', async ({ page }) => {
  test.skip(!SHOTS, 'потрібен DS_SHOTS_DIR');
  test.setTimeout(420000); fs.mkdirSync(SHOTS, { recursive: true });
  const hideBar = () => page.evaluate(() => { const t = document.querySelector('.tabbar-glass'); if(t) t.style.display = 'none'; });
  const seed = () => page.evaluate(() => { const m = selectedMonth; [['🛒 Продукти', '🏪 Супермаркет', 4800], ['🛒 Продукти', '🥬 Ринок', 2100], ['🍔 Харчування', '☕️ Кафе', 1900], ['🍔 Харчування', '🍕 Доставка', 1000], ['🛍️ Покупки', '👕 Одяг', 2300], ['🛍️ Покупки', '', 1500], ['🚌 Транспорт', '⛽ Пальне', 1200], ['🚌 Транспорт', '', 500], ['📱 Зв’язок', '', 5000], ['🧾 Інше', '', 300], ['🏠 Дім', '', 250]].forEach((r, i) => expenses.push({ id: 'sh-' + i, date: m + '-01', amount: r[2], category: r[0], subcategory: r[1], note: '', deletedAt: null })); renderDashboard(); });
  const cardShot = async name => { await hideBar(); await page.evaluate(() => document.getElementById('bal-cat-card').scrollIntoView({ block: 'center' })); await page.waitForTimeout(1500); await page.locator('#bal-cat-card').screenshot({ path: path.join(SHOTS, name + '.png') }); };
  const sheetShot = async name => { await page.waitForTimeout(1500); await page.screenshot({ path: path.join(SHOTS, name + '.png') }); };
  for (const [w, h] of [[390, 844], [320, 700], [1280, 800]]){
    for (const theme of ['dark', 'light']){
      const tag = w + '-' + theme;
      await boot(page, 'typical', w, h); await page.evaluate(t => document.documentElement.setAttribute('data-theme', t), theme); await seed(); await page.waitForTimeout(500);
      await cardShot('card-cat-' + tag);
      await page.click('#bal-cat-seg button[data-m="sub"]'); await page.waitForTimeout(500); await cardShot('card-sub-' + tag);
      await page.click('#bal-cat-seg button[data-m="cat"]'); await page.waitForTimeout(300);
      await page.click('#bal-cat-all'); await page.waitForTimeout(300); await sheetShot('sheet-cat-' + tag);
      await page.evaluate(() => { const c = document.querySelectorAll('.bal-sg')[1]; c.dispatchEvent(new MouseEvent('click', { bubbles: true })); }); await page.waitForTimeout(500); await sheetShot('sheet-cat-selected-' + tag);
      await page.click('#bal-cat-seg-s button[data-m="sub"]'); await page.waitForTimeout(300); await sheetShot('sheet-sub-' + tag);
      await page.evaluate(() => { const c = document.querySelectorAll('.bal-sg')[0]; c.dispatchEvent(new MouseEvent('click', { bubbles: true })); }); await page.waitForTimeout(500); await sheetShot('sheet-sub-selected-' + tag);
      await page.keyboard.press('Escape'); await page.waitForTimeout(500);
      await page.evaluate(() => { for (let i = 1; i <= 14; i++) expenses.push({ id: 'sh-t' + i, date: selectedMonth + '-03', amount: 20, category: 'Тест ' + i, subcategory: '', note: '', deletedAt: null }); renderDashboard(); }); await page.waitForTimeout(400);
      await page.click('#bal-cat-all'); await page.waitForTimeout(300); await sheetShot('sheet-many-' + tag); await page.keyboard.press('Escape'); await page.waitForTimeout(500);
      await page.evaluate(() => { expenses.forEach(e => { e.deletedAt = 'x'; }); renderDashboard(); }); await page.waitForTimeout(400); await cardShot('card-empty-' + tag);
      await page.evaluate(() => openCatsSheet()); await page.waitForTimeout(300); await sheetShot('sheet-empty-' + tag); await page.keyboard.press('Escape');
    }
  }
});
