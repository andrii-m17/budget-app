// DS-5c1b: «Деталізація витрат» бере ту саму суму витрат, що й «Сімейний баланс» і висновки (F9: відсотки від суми витрат місяця). Цикл бага: звірка за знімками виявила «різницю 20 850 ₴», яка пояснюється не кодом, а набором записів,
// доданим лише в знімки DS-5c-1 (e2e/ds5c1.spec.js, seed() додає 11 витрат на 20 850 ₴: 39 535 + 20 850 = 60 385). Тут — регресійний тест на ту саму вибірку в усіх компонентах; суми вигадані. Знімки (docs/ui/ds-5c1b/…) — лише з DS_SHOTS_DIR.
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { installClock } = require('./clock');
const SHOTS = process.env.DS_SHOTS_DIR;
test.use({ hasTouch: true });
async function boot(page, w, h){
  const errors = [];
  page.on('pageerror', e => errors.push(String(e && e.message || e)));
  await page.setViewportSize({ width: w || 390, height: h || 844 });
  await installClock(page);
  await page.goto('/index.html?fixture=typical');
  await page.waitForFunction(() => window.MockCloud && typeof cloudSession !== 'undefined' && cloudSession && cloudSession.user && document.querySelector('.tabbar-glass'));
  await page.waitForFunction(() => !document.querySelector('.avatar-status-dot.syncing'), null, { timeout: 15000 }).catch(() => {});
  await page.evaluate(() => { switchTab('analytics'); });
  await page.waitForTimeout(1800);
  return errors;
}
const num = s => Number(String(s).replace(/[^\d−-]/g, '').replace('−', '-'));
// Усі числа «Витрат місяця» з усіх компонентів на сторінці + незалежний підрахунок (reduce по активних витратах місяця, без функцій картки).
const chain = page => page.evaluate(() => {
  const m = selectedMonth;
  const own = activeExpenses().filter(e => monthKey(e.date) === m).reduce((s, e) => s + e.amount, 0);                      // незалежно від monthAggregates і catBreakdown
  const byCat = {}; activeExpenses().filter(e => monthKey(e.date) === m).forEach(e => { const k = e.category || '🧾 Без категорії'; byCat[k] = (byCat[k] || 0) + e.amount; });
  const maxCat = Math.max(0, ...Object.values(byCat));
  const balanceCard = document.getElementById('bal-c-exp-v').textContent, balanceBar = document.querySelector('.bal-dsum b') ? document.querySelector('.bal-dsum b').textContent : '';
  openCatsSheet(); // кільце (категорії)
  const sheetCats = { center: document.getElementById('bal-sunc').innerText, rows: [...document.querySelectorAll('#bal-call .bal-cam')].map(e => e.textContent), cmp: (document.querySelector('#bal-sunc .bal-cpos') || {}).textContent || '' };
  balCatMode = 'sub'; balCatSel = null; renderCatsSheet(true);
  const sheetSubs = { center: document.getElementById('bal-sunc').innerText, rows: [...document.querySelectorAll('#bal-call .bal-cam')].map(e => e.textContent) };
  balCatMode = 'cat'; closeCatsSheet(); renderCatCard(balCatSource);
  const ins = [...document.querySelectorAll('#summary-container .bal-ili')].map(i => i.innerText.replace(/\s+/g, ' '));
  const big = ins.find(t => t.includes('Найбільша витрата')) || '';
  return { m, own, aggregates: monthAggregates(m).totalExpense, balanceCard, balanceBar, ringTotal: balCatData.total, cats: balCatData.cats.reduce((s, c) => s + c.sum, 0), subs: balCatData.subs.reduce((s, c) => s + c.sum, 0), sheetCats, sheetSubs, big, maxCat, pill: (document.getElementById('bal-c-exp-pill') || {}).textContent || '' };
});
const digits = s => { const t = String(s).replace(/[\s\u00a0\u202f]/g, '').replace('−', '-'); const m = t.match(/-?\d+/); return m ? Number(m[0]) : NaN; }; // зі знаком: від'ємна сума не пройде непоміченою
function expectChain(c, label, opts){
  expect(c.aggregates, label + ': monthAggregates = незалежна сума').toBe(c.own);
  expect(digits(c.balanceCard), label + ': «Витрати» у «Сімейному балансі»').toBe(c.own);
  expect(c.ringTotal, label + ': сума кільця (catBreakdown)').toBe(c.own);
  expect(c.cats, label + ': Σ категорій').toBe(c.own); expect(c.subs, label + ': Σ підкатегорій + «Без підкатегорії»').toBe(c.own);
  expect(digits(c.sheetCats.center.split('\n')[0]), label + ': центр кільця категорій').toBe(c.own);
  expect(c.sheetCats.rows.reduce((s, r) => s + digits(r), 0), label + ': Σ рядків списку шторки (категорії)').toBe(c.own);
  expect(digits(c.sheetSubs.center.split('\n')[0]), label + ': центр кільця підкатегорій').toBe(c.own);
  expect(c.sheetSubs.rows.reduce((s, r) => s + digits(r), 0), label + ': Σ рядків списку шторки (підкатегорії)').toBe(c.own);
  if(c.own > 0 && c.big){ const m = c.big.match(/(\d+)(?:,\d+)?\u00a0?%/); expect(m, label + ': відсоток у висновку').toBeTruthy(); expect(Number(m[1]), label + ': знаменник висновку = та сама сума витрат').toBe(Math.round(c.maxCat / c.own * 100)); }
  // порівняння «на той самий день»: центр кільця й плитка «Витрати» в балансі — той самий відсоток
  const norm = t => (t || '').replace(/[\s ]/g, '').replace('−', '-');
  const pillNum = norm(c.pill).replace('%', ''), cmpNum = (norm(c.sheetCats.cmp).match(/^([+-]?\d+)%/) || [])[1];
  if(opts && opts.needCmp){ expect(c.pill, label + ': плитка «Витрати» має порівняння').not.toBe(''); expect(c.sheetCats.cmp, label + ': центр кільця має порівняння').not.toBe(''); }
  if(c.pill && c.sheetCats.cmp) expect(String(Number(cmpNum)), label + ': порівняння в центрі = порівняння в балансі').toBe(String(Number(pillNum)));
}

test('DS-5c1b 1. поточний, минулий і наступний місяць: сума кільця = «Витрати» балансу = знаменник висновку = Σ рядків шторки', async ({ page }) => {
  test.setTimeout(150000);
  const errors = await boot(page);
  const info = await page.evaluate(() => { const list = currentMonthList(), today = monthKey(localDateISO()); return { cur: today, prev: shiftMonth(today, -1), next: list[list.length - 1] }; });
  for (const [k, m] of [['поточний', info.cur], ['минулий', info.prev], ['наступний', info.next]]){
    await page.evaluate(m => onMonthChange(m), m); await page.waitForTimeout(1300);
    expectChain(await chain(page), k, { needCmp: k === 'поточний' });
  }
  expect(errors).toEqual([]);
});

test('DS-5c1b 2. складні дані: видалені й чужого місяця записи, доходи, без категорії, спільна підкатегорія, борги (зміни балансу карток і ОЧ не є витратами) — та сама сума скрізь', async ({ page }) => {
  test.setTimeout(150000);
  await boot(page);
  await page.evaluate(() => {
    const m = selectedMonth, prev = shiftMonth(m, -1), c = bankAccounts[0];
    const add = (id, date, amount, cat, sub, extra) => expenses.push(Object.assign({ id: 'c1b-' + id, date, amount, category: cat, subcategory: sub, note: '', deletedAt: null }, extra || {}));
    add('a', m + '-02', 1200, '🛒 Продукти', '🏪 Супермаркет'); add('b', m + '-03', 800, '🛒 Продукти', ''); add('c', m + '-04', 300, '', ''); add('d', m + '-05', 450, '🍔 Харчування', '🏪 Супермаркет'); add('e', m + '-06', 5000, '📱 Зв’язок', '', { linkedInstallment: 'Розстрочка 1' });
    add('del', m + '-07', 99999, '🛒 Продукти', '🏪 Супермаркет', { deletedAt: new Date().toISOString() });  // видалений: ніде не рахується
    add('other', prev + '-02', 77777, '🛒 Продукти', '🏪 Супермаркет');                                         // інший місяць
    incomes.push({ id: 'c1b-inc', date: m + '-02', amount: 88888, source: 'x', note: '', deletedAt: null });    // дохід — не витрата
    c.createdAt = monthStartISO('2025-01'); debts.push({ id: 'c1b-debt', name: c.name, kind: 'card', month: m, balance: 66666, minPayment: 100, deletedAt: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), accountId: c.cloudId || undefined }); // зміна балансу картки — не витрата
    renderDashboard(); });
  await page.waitForTimeout(700);
  const c = await chain(page);
  expectChain(c, 'складні дані');
  expect(c.own, 'видалені, чужий місяць, дохід і борги не входять').toBeLessThan(99999);
  const added = await page.evaluate(() => 1200 + 800 + 300 + 450 + 5000); expect(c.own).toBeGreaterThanOrEqual(added);
});

test('c1b-shots', async ({ page }) => {
  test.skip(!SHOTS, 'потрібен DS_SHOTS_DIR');
  test.setTimeout(420000); fs.mkdirSync(SHOTS, { recursive: true });
  const hideBar = () => page.evaluate(() => { const t = document.querySelector('.tabbar-glass'); if(t) t.style.display = 'none'; });
  const shot = async (sel, name) => { await hideBar(); await page.evaluate(s => document.querySelector(s).scrollIntoView({ block: 'center' }), sel); await page.waitForTimeout(1300); await page.locator(sel).screenshot({ path: path.join(SHOTS, name + '.png') }); };
  for (const theme of ['light', 'dark']){
    for (const set of ['plain', 'seeded']){
      await boot(page, 390, 844); await page.evaluate(t => document.documentElement.setAttribute('data-theme', t), theme); await page.waitForTimeout(300);
      if (set === 'seeded') await page.evaluate(() => { const m = selectedMonth; [['🛒 Продукти', '🏪 Супермаркет', 4800], ['🛒 Продукти', '🥬 Ринок', 2100], ['🍔 Харчування', '☕️ Кафе', 1900], ['🍔 Харчування', '🍕 Доставка', 1000], ['🛍️ Покупки', '👕 Одяг', 2300], ['🛍️ Покупки', '', 1500], ['🚌 Транспорт', '⛽ Пальне', 1200], ['🚌 Транспорт', '', 500], ['📱 Зв’язок', '', 5000], ['🧾 Інше', '', 300], ['🏠 Дім', '', 250]].forEach((r, i) => expenses.push({ id: 'sh-' + i, date: m + '-01', amount: r[2], category: r[0], subcategory: r[1], note: '', deletedAt: null })); renderDashboard(); });
      await page.waitForTimeout(500);
      await page.click('#bal-toggle'); await page.waitForTimeout(900); await shot('#bal-card', set + '-balance-' + theme); await page.click('#bal-toggle'); await page.waitForTimeout(500);
      await shot('#bal-cat-card', set + '-card-' + theme); await shot('#bal-ins-card', set + '-insights-' + theme);
      await page.click('#bal-cat-all'); await page.waitForTimeout(1500); await hideBar(); await page.screenshot({ path: path.join(SHOTS, set + '-sheet-' + theme + '.png') });
    }
  }
});
