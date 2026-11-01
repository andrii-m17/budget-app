// E2E-1: вісім основних сценаріїв у WebKit (iPhone 390×844) на моку Cloud. Світла тема — лише сценарії з @both. Без перевірки пікселів; знімки лише при падінні.
// «Другий пристрій» — MockCloud.otherDevice (зміна стану сервера, як справжній Realtime); мережа емулюється прапорцем window.__offline у MockCloud.fetch (у моку запити не йдуть у мережу).
const { test, expect, devices } = require('@playwright/test');
const { installClock } = require('./clock');
// «Перевірки» прив'язані до реальних дат Rev (термін кроку 7 днів від addedOn), тож їм годинник не підміняється.
test.beforeEach(async ({ page }, info) => { if(!/Перевірки/.test(info.title)) await installClock(page); });

async function boot(page, fixture){
  const errors = [];
  page.on('pageerror', e => errors.push(String(e && e.message || e)));
  await page.addInitScript(() => {
    window.__offline = false; window.__delay = 0;
    Object.defineProperty(navigator, 'onLine', { get: () => !window.__offline, configurable: true });
  });
  await page.goto('/index.html?fixture=' + (fixture || 'empty'));
  await page.waitForFunction(() => window.MockCloud && typeof cloudSession !== 'undefined' && cloudSession && cloudSession.user && typeof cloudFamilyId !== 'undefined' && !!cloudFamilyId && document.querySelector('.tabbar-glass'));
  await page.evaluate(() => { // мережа моку: офлайн-прапорець і штучна затримка (щоб був видимий стан syncing)
    const orig = window.MockCloud.fetch; // затримка лише для записів (POST/PATCH): стан syncing видно, читання не гальмують
    // Затримка лише для записів витрат (довідники при першій синхронізації йдуть десятками запитів). Запити авторизації не рвемо в офлайні: ретраї SDK без мережі вішають syncCheck на невизначений час (артефакт емуляції).
    window.MockCloud.fetch = function(){
      const a = arguments; const url = String(typeof a[0] === 'string' ? a[0] : (a[0] && a[0].url) || '');
      if(window.__offline && !/\/auth\/v1\//.test(url)) return Promise.reject(new TypeError('offline'));
      const m = String((a[1] && a[1].method) || (a[0] && a[0].method) || 'GET').toUpperCase();
      const d = (m === 'GET' || m === 'HEAD' || !/\/rest\/v1\/expenses/.test(url)) ? 0 : (window.__delay | 0); // лише записи витрат: решта початкових записів (довідники) не гальмується
      const run = () => orig.apply(window.MockCloud, a);
      return d ? new Promise(r => setTimeout(r, d)).then(run) : run();
    };
  });
  return errors;
}
async function addExpenseUI(page, name, amount){
  await page.evaluate(() => switchTab('vytraty'));
  await page.fill('#expfielda7', name);
  await page.fill('#f-amount', String(amount));
  await page.click('.submit-btn.expense');
  await page.waitForFunction(n => expenses.some(e => e.name === n), name);
  return page.evaluate(n => expenses.find(e => e.name === n).id, name);
}
const serverRow = (page, id) => page.evaluate(i => { const r = window.MockCloud.state.tables.expenses.find(x => x.id === i); return r ? { amount: r.amount, note: r.note, updated_at: r.updated_at } : null; }, id);
const openJournalFor = (page, id) => page.evaluate(i => { openJournal(monthKey(expenses.find(e => e.id === i).date)); }, id);
const slotOf = (page, id) => page.locator('.sync-slot[data-sync-id="' + id + '"]:visible');
async function editAmountUI(page, id, amount){
  await page.evaluate(i => startEditRecord('expense', i), id);
  await page.fill('#edit-amount-' + id, String(amount));
  await page.locator('.expense-row[data-rec-id="' + id + '"]:visible .rce-save').click();
  await page.waitForFunction(([i, a]) => expenses.find(e => e.id === i).amount === a, [id, amount]);
}
// Спільна підготовка конфлікту: витрата синхронізована, офлайн правка суми, «інший пристрій» змінює ту саму суму, мережа повертається.
async function makeConflict(page, id, mine, theirs){
  await page.waitForFunction(i => { const r = expenses.find(e => e.id === i); return r && r.serverUpdatedAt && r.serverBase; }, id);
  await page.evaluate(() => { window.__offline = true; });
  await editAmountUI(page, id, mine);
  await page.evaluate(([i, a]) => { window.MockCloud.otherDevice({ table: 'expenses', id: i, op: 'update', patch: { amount: a } }); }, [id, theirs]);
}
const goOnline = page => page.evaluate(() => { window.__offline = false; window.dispatchEvent(new Event('online')); });

test('1. старт із порожніми даними: застосунок живий, без помилок і горизонтального скролу @both', async ({ page }) => {
  const errors = await boot(page, 'empty');
  await expect(page.locator('.tabbar-glass')).toBeVisible();
  for(const tab of ['analytics', 'accounting', 'vytraty', 'structure', 'service']){
    await page.evaluate(t => switchTab(t), tab);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, 'горизонтальний скрол на вкладці ' + tab).toBeLessThanOrEqual(1);
  }
  expect(await page.evaluate(() => expenses.length)).toBe(0);
  expect(errors).toEqual([]);
});

test('2. додати витрату: з\'являється в списку й на сервері @both', async ({ page }) => {
  const errors = await boot(page, 'empty');
  const id = await addExpenseUI(page, 'Тест кава', 120);
  await expect.poll(() => serverRow(page, id)).toMatchObject({ amount: 120, note: 'Тест кава' });
  await openJournalFor(page, id);
  await expect(page.locator('.expense-row[data-rec-id="' + id + '"]:visible')).toContainText('Тест кава');
  expect(errors).toEqual([]);
});

test('3. відредагувати витрату: сума змінюється локально й на сервері', async ({ page }) => {
  await boot(page, 'empty');
  const id = await addExpenseUI(page, 'Тест таксі', 90);
  await expect.poll(() => serverRow(page, id)).toMatchObject({ amount: 90 });
  await openJournalFor(page, id);
  await editAmountUI(page, id, 95);
  await expect.poll(() => serverRow(page, id)).toMatchObject({ amount: 95 });
});

test('4. «Перевірки»: «Працює» і «Не працює» з причиною', async ({ page }) => {
  await boot(page, 'empty');
  await page.evaluate(() => { switchTab('service'); openChecksDrawer(); });
  const pendingCount = () => page.evaluate(() => checksPending(checksReadState()).length);
  const total = await pendingCount();
  expect(total).toBeGreaterThan(1);
  const firstId = await page.evaluate(() => checksPending(checksReadState())[0].id);
  const live = page.locator('#checks-list .chk-it:not(.done)');
  await expect(live.first()).toBeVisible();
  await live.first().locator('[data-a="ok"]').click();
  await expect.poll(() => page.evaluate(id => (checksReadState()[id] || {}).r, firstId)).toBe('ok');
  await expect.poll(pendingCount).toBe(total - 1);
  const secondId = await page.evaluate(() => checksPending(checksReadState())[0].id);
  await expect.poll(() => page.evaluate(() => { const it = document.querySelector('#checks-list .chk-it:not(.done)'); return !!it && it.classList.contains('open'); })).toBe(true);
  const second = live.first();
  await second.locator('[data-a="no"]').click();
  await second.locator('.chk-gn button').first().click();
  await expect.poll(() => page.evaluate(id => (checksReadState()[id] || {}).r, secondId)).toBe('no');
  expect(await page.evaluate(id => checksReadState()[id].why, secondId)).toBeTruthy();
});

test('5. без мережі: pending → повернення мережі: syncing → done', async ({ page }) => {
  await boot(page, 'empty');
  await page.evaluate(() => { window.__offline = true; });
  const id = await addExpenseUI(page, 'Тест офлайн', 70);
  await openJournalFor(page, id);
  await expect(slotOf(page, id)).toHaveAttribute('data-s', 'pending');
  expect(await serverRow(page, id)).toBeNull();
  await page.evaluate(i => { window.__delay = 1500; window.__seen = []; new MutationObserver(list => list.forEach(m => { if(m.target.getAttribute('data-sync-id') === i) window.__seen.push(m.target.getAttribute('data-s')); })).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['data-s'] }); }, id);
  await goOnline(page);
  await page.waitForFunction(() => window.__seen.includes('done'), null, { timeout: 20000 }).catch(async err => { throw new Error('done не настав; стани: ' + JSON.stringify(await page.evaluate(() => window.__seen)) + '; записи: ' + JSON.stringify(await page.evaluate(() => [...expSyncEntries.entries()].map(([k, v]) => [v.s, v.n]))) + '; без запису на сервері: ' + JSON.stringify(await page.evaluate(() => expenses.map(e => [e.syncedUpdatedAt === e.updatedAt, !!e.serverUpdatedAt])))); });
  // «done» триває ≈ 1 с: ловимо спостерігачем мутацій, а не опитуванням
  const seen = await page.evaluate(() => window.__seen);
  const order = seen.filter((v, i) => v && v !== seen[i - 1]); // послідовність станів без повторів
  expect(order.slice(0, 2), 'послідовність станів: ' + seen.join(' → ')).toEqual(['syncing', 'done']);
  expect(await serverRow(page, id)).toMatchObject({ amount: 70 });
  await expect(slotOf(page, id)).toHaveAttribute('data-s', '', { timeout: 8000 });
});

test('6. конфлікт того самого поля: картка, «Повернути моє» застосовує мою суму', async ({ page }) => {
  await boot(page, 'empty');
  const id = await addExpenseUI(page, 'Тест футбол', 100);
  await makeConflict(page, id, 120, 150);
  await goOnline(page);
  const card = page.locator('.success-toast');
  await expect(card).toContainText(/вже змін(ив|ила) суму/, { timeout: 15000 });
  await expect(card).toContainText('150');
  await expect(card).toContainText('120');
  expect(await page.evaluate(i => expenses.find(e => e.id === i).amount, id)).toBe(150);
  await card.getByRole('button', { name: 'Повернути моє' }).click();
  await expect.poll(() => page.evaluate(i => expenses.find(e => e.id === i).amount, id)).toBe(120);
  await expect.poll(() => serverRow(page, id), { timeout: 15000 }).toMatchObject({ amount: 120 });
});

test('7. відкрита шторка/поле вводу не перебивається карткою конфлікту', async ({ page }) => {
  await boot(page, 'empty');
  const id = await addExpenseUI(page, 'Тест шторка', 100);
  await makeConflict(page, id, 110, 140);
  await page.evaluate(() => switchTab('vytraty'));
  await page.locator('#f-amount').click();
  await page.keyboard.type('5');
  await goOnline(page);
  await expect.poll(() => page.evaluate(() => conflictOpenCount()), { timeout: 15000 }).toBeGreaterThan(0); // конфлікт є (значок), але картки ще нема
  await page.waitForTimeout(2500);
  await expect(page.locator('.success-toast')).toHaveCount(0);
  await page.evaluate(() => { document.activeElement && document.activeElement.blur(); });
  await expect(page.locator('.success-toast')).toContainText(/вже змін(ив|ила) суму/, { timeout: 8000 });
});

test('8. закрита й прихована ОЧ не показуються у «Платежах», відкрита показується @both', async ({ page }) => {
  await boot(page, 'empty');
  await page.evaluate(() => {
    const now = new Date(); const mk = off => { const d = new Date(now.getFullYear(), now.getMonth() + off, 1); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); };
    const base = (name, id, extra) => Object.assign({ name, cloudId: id, initialAmount: 400, termMonths: 4, payment: 100, dueDay: 5, firstMonth: mk(-5), startDate: mk(-5) + '-05', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }, extra || {});
    installmentAccounts.length = 0;
    installmentAccounts.push(base('ОЧ-закрита', 'c-closed'), base('ОЧ-прихована', 'c-hidden', { initialAmount: 4000, termMonths: 40 }), base('ОЧ-відкрита', 'c-open', { initialAmount: 40000, termMonths: 400 }));
    // закрита: чотири платежі прив'язаними витратами, залишок 0; відкрита: платежі є, залишок великий
    const lk = (name, off) => ({ id: 'x-' + name + off, name: 'p', amount: 100, date: mk(off) + '-05', category: '', subcategory: '', linkedInstallment: name, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    [-5, -4, -3, -2].forEach(o => expenses.push(lk('ОЧ-закрита', o)));
    [-5, -4].forEach(o => expenses.push(lk('ОЧ-відкрита', o)));
    hiddenFrom['installment:#c-hidden'] = { month: mk(-1), accountName: 'ОЧ-прихована', updatedAt: new Date().toISOString() };
    renderAll();
  });
  await page.evaluate(() => { switchTab('analytics'); openPaymentsScreen(); });
  const screen = page.locator('#payments-screen');
  await expect(screen).toBeVisible();
  await expect(screen).toContainText('ОЧ-відкрита');
  await expect(screen).not.toContainText('ОЧ-закрита');
  await expect(screen).not.toContainText('ОЧ-прихована');
});

test('9. доходи: різні поля зливаються мовчки (моя сума офлайн, чуже джерело), без сповіщень', async ({ page }) => {
  await boot(page, 'empty');
  const id = await page.evaluate(async () => {
    const now = new Date().toISOString(); const rec = { id: generateUUID(), date: localDateISO(), source: 'Тест-джерело', amount: 1000, createdAt: now, updatedAt: now };
    incomes.unshift(rec); await saveIncomes(); await pushIncomeRecordPilot(rec, { suppressPull: true }); return rec.id;
  });
  await page.waitForFunction(i => { const r = incomes.find(x => x.id === i); return r && r.serverUpdatedAt && r.serverBase; }, id);
  await page.evaluate(() => { window.__offline = true; });
  await page.evaluate(async i => { const r = incomes.find(x => x.id === i); r.amount = 1200; r.updatedAt = new Date(Date.now() + 5).toISOString(); await saveIncomes(); await pushIncomeRecordPilot(r, { suppressPull: true }); }, id);
  await page.evaluate(i => { window.MockCloud.otherDevice({ table: 'incomes', id: i, op: 'update', patch: { note: 'Інше джерело' } }); }, id);
  await goOnline(page);
  await expect.poll(() => page.evaluate(i => { const r = incomes.find(x => x.id === i); return [r.amount, r.source]; }, id), { timeout: 20000 }).toEqual([1200, 'Інше джерело']);
  await expect.poll(() => page.evaluate(i => { const r = window.MockCloud.state.tables.incomes.find(x => x.id === i); return [r.amount, r.note]; }, id), { timeout: 20000 }).toEqual([1200, 'Інше джерело']);
  expect(await page.evaluate(() => conflictLog.length)).toBe(0);
  await expect(page.locator('.success-toast')).toHaveCount(0);
});

test('10. борги: те саме поле дає картку конфлікту з назвою запису й «Повернути моє»', async ({ page }) => {
  await boot(page, 'empty');
  await page.evaluate(async () => { const now = new Date().toISOString(); bankAccounts.push({ name: 'Тест-картка', createdAt: now, updatedAt: now }); await saveBankAccounts(); });
  await page.waitForFunction(() => { const a = bankAccounts.find(x => x.name === 'Тест-картка'); return a && a.cloudId; }, null, { timeout: 20000 });
  const id = await page.evaluate(async () => {
    const now = new Date().toISOString(); const acc = bankAccounts.find(x => x.name === 'Тест-картка'); const rec = { id: generateUUID(), accountId: acc.cloudId, name: acc.name, kind: 'card', month: localDateISO().slice(0, 7), balance: 5000, createdAt: now, updatedAt: now };
    debts.push(rec); await saveDebts(); await pushDebtRecordPilot(rec, { suppressPull: true }); return rec.id;
  });
  await page.waitForFunction(i => { const r = debts.find(x => x.id === i); return r && r.serverUpdatedAt && r.serverBase; }, id);
  await page.evaluate(() => { window.__offline = true; });
  await page.evaluate(async i => { const r = debts.find(x => x.id === i); r.balance = 4000; r.updatedAt = new Date(Date.now() + 5).toISOString(); await saveDebts(); await pushDebtRecordPilot(r, { suppressPull: true }); }, id);
  await page.evaluate(i => { window.MockCloud.otherDevice({ table: 'debts', id: i, op: 'update', patch: { balance: 4500 } }); }, id);
  await goOnline(page);
  const card = page.locator('.success-toast');
  await expect(card).toContainText(/вже змін(ив|ила) залишок/, { timeout: 20000 });
  await expect(card).toContainText('4');
  expect(await page.evaluate(i => debts.find(x => x.id === i).balance, id)).toBe(4500);
  await card.getByRole('button', { name: 'Повернути моє' }).click();
  await expect.poll(() => page.evaluate(i => debts.find(x => x.id === i).balance, id)).toBe(4000);
  await expect.poll(() => page.evaluate(i => window.MockCloud.state.tables.debts.find(x => x.id === i).balance, id), { timeout: 20000 }).toBe(4000);

});

test('11. «Перевірки»: спільний список сім\'ї: відповідь одного ховає крок у другого, «Не можу перевірити» не ховає, числа однакові', async ({ page, browser, baseURL }) => {
  // два контексти = два телефони; мок кожного живе в пам'яті сторінки, тож рядки журналу client_debug_logs переносяться між ними через MockCloud.otherDevice
  const ctxB = await browser.newContext({ ...devices['iPhone 14'], baseURL, colorScheme: 'dark', serviceWorkers: 'block' });
  const pageB = await ctxB.newPage();
  try{
    await boot(page, 'empty'); await boot(pageB, 'empty');
    const ids = await page.evaluate(() => checksPending(checksReadState()).map(c => c.id));
    expect(ids.length).toBeGreaterThan(2);
    const [first, second] = ids;
    const answerA = async (id, result, reason) => {
      await page.evaluate(([i, r, why]) => { checksCommit(i, r, why); }, [id, result, reason]);
      await page.evaluate(() => flushChecksQueue());
      const rows = await page.evaluate(() => window.MockCloud.state.tables.client_debug_logs.map(r => ({ scenario: r.scenario, events: r.events, user_id: r.user_id })));
      await pageB.evaluate(rs => { rs.forEach(r => window.MockCloud.otherDevice({ table: 'client_debug_logs', op: 'insert', row: Object.assign({ app_version: 'x' }, r) })); }, rows.slice(-1));
    };
    await answerA(first, 'ok');
    expect(await page.evaluate(() => checksPending(checksReadState()).length)).toBe(ids.length - 1); // миттєво в того, хто відповів
    expect(await pageB.evaluate(() => checksPending(checksReadState()).length)).toBe(ids.length); // другий ще не знає
    expect(await pageB.evaluate(() => checksRefreshShared(true))).toBe(true); // його наступне оновлення
    expect(await pageB.evaluate(i => checksPending(checksReadState()).some(c => c.id === i), first)).toBe(false);
    // «Не можу перевірити зараз» особисте
    await answerA(second, 'defer', 'Немає часу');
    await pageB.evaluate(() => checksRefreshShared(true));
    expect(await pageB.evaluate(i => checksPending(checksReadState()).some(c => c.id === i), second)).toBe(true);
    // числа однакові: у другого лишилось на один менше, ніж було; значок і «Пройдено» беруть той самий список
    const countsB = await pageB.evaluate(() => ({ left: checksPending(checksReadState()).length, done: checksAnswered(checksReadState()).length }));
    expect(countsB).toEqual({ left: ids.length - 1, done: 1 });
    await pageB.evaluate(() => { switchTab('service'); openChecksDrawer(); });
    await expect(pageB.locator('#checks-sub')).toContainText('залишилось ' + (ids.length - 1));
  }finally{ await ctxB.close(); }
});

test('17. швидкий запит (мок відповідає миттєво): pending і кожна відправка проходять syncing (не менше SYNC_MIN_SYNCING_MS, 3 блимання) → done; повторна правка не перезапускає', async ({ page }) => {
  await boot(page, 'empty');
  const watch = i => page.evaluate(id => { window.__seen = []; window.__t0 = Date.now(); new MutationObserver(list => list.forEach(m => { if(m.target.getAttribute('data-sync-id') === id) window.__seen.push([m.target.getAttribute('data-s'), Date.now() - window.__t0]); })).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['data-s'] }); }, i);
  // без мережі: pending
  await page.evaluate(() => { window.__offline = true; });
  const id = await addExpenseUI(page, 'Тест швидкий', 70);
  await openJournalFor(page, id);
  await expect(slotOf(page, id)).toHaveAttribute('data-s', 'pending');
  await page.evaluate(() => { window.__delay = 0; }); // запит швидкий
  await watch(id); await page.evaluate(i => { window.__blinks = 0; new MutationObserver(l => l.forEach(m => { if(m.target.classList && m.target.classList.contains('just-synced') && /just-synced/.test(String(m.oldValue || '')) === false) window.__blinks++; })).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['class'], attributeOldValue: true }); }, id);
  await goOnline(page);
  await page.waitForFunction(() => window.__seen.some(x => x[0] === 'done'), null, { timeout: 20000 });
  const seen = await page.evaluate(() => window.__seen);
  const order = seen.map(x => x[0]).filter((v, i, a) => v && v !== a[i - 1]);
  expect(order.slice(0, 2), 'послідовність: ' + JSON.stringify(seen)).toEqual(['syncing', 'done']);
  const tSync = seen.find(x => x[0] === 'syncing')[1], tDone = seen.find(x => x[0] === 'done')[1];
  expect(tDone - tSync, 'syncing показується щонайменше SYNC_MIN_SYNCING_MS').toBeGreaterThanOrEqual(2900);
  // Rev 2.32.207: КОЖНА відправка (онлайн-правка, мок миттєвий) проходить idle → syncing (не менше SYNC_MIN_SYNCING_MS, рівно 3 блимання) → done
  await page.waitForFunction(i => { const r = expenses.find(x => x.id === i); return r && r.serverUpdatedAt && r.serverBase; }, id);
  await page.waitForTimeout(2500);
  const arm = () => page.evaluate(() => { window.__seen = []; window.__t0 = Date.now(); window.__anim = { start: 0, iter: 0, end: 0 }; });
  await arm();
  await page.evaluate(() => { const cnt = ev => document.addEventListener(ev, e => { if(e.animationName === 'cardBlink') window.__anim[ev === 'animationstart' ? 'start' : ev === 'animationiteration' ? 'iter' : 'end']++; }, true); ['animationstart', 'animationiteration', 'animationend'].forEach(cnt); });
  await editAmountUI(page, id, 75);
  await page.waitForFunction(() => window.__seen.some(x => x[0] === 'done'), null, { timeout: 15000 });
  const s2 = await page.evaluate(() => window.__seen);
  expect(s2.map(x => x[0]).filter((v, i, a) => v && v !== a[i - 1]).slice(0, 2), JSON.stringify(s2)).toEqual(['syncing', 'done']);
  expect(s2.find(x => x[0] === 'done')[1] - s2.find(x => x[0] === 'syncing')[1], 'syncing не менше SYNC_MIN_SYNCING_MS').toBeGreaterThanOrEqual(2900);
  const anim = await page.evaluate(() => window.__anim);
  expect(anim, 'рівно 3 блимання: один старт і дві ітерації, без четвертого').toEqual({ start: 1, iter: 2, end: 1 });
  // повторна правка під час syncing: анімація не перезапускається й не дублюється, один syncing → done
  await page.waitForTimeout(2500);
  await arm();
  await editAmountUI(page, id, 80); await page.waitForTimeout(600); await editAmountUI(page, id, 85);
  await page.waitForFunction(() => window.__seen.some(x => x[0] === 'done'), null, { timeout: 15000 });
  const s3 = await page.evaluate(() => window.__seen);
  expect(s3.filter(x => x[0] === 'syncing').length, 'один syncing: ' + JSON.stringify(s3)).toBe(1);
  expect(s3.find(x => x[0] === 'done')[1], 'мінімум відлічується від першої правки').toBeGreaterThanOrEqual(2900);
  await expect.poll(() => serverRow(page, id), { timeout: 10000 }).toMatchObject({ amount: 85 });
});

test('18. клавіатура відкрита (поле у фокусі): конфлікт від синхронізації не зсуває екран і не перемальовує список; картка й перемальовування — після закриття поля', async ({ page }) => {
  await boot(page, 'empty');
  const id = await addExpenseUI(page, 'Тест клавіатура', 100);
  await makeConflict(page, id, 110, 140);
  await page.evaluate(() => switchTab('vytraty'));
  await page.locator('#f-amount').click(); await page.keyboard.type('5');
  await page.waitForTimeout(1200); // повз запобіжник «поле без клавіатури» (700 мс), далі емулюємо відкриту клавіатуру
  await page.evaluate(() => { document.body.classList.add('kb-open'); window.__renders = 0; const f = window.renderAll; window.renderAll = function(){ window.__renders++; return f.apply(this, arguments); }; });
  const snap = () => page.evaluate(() => { const r = s => { const e = document.querySelector(s); if(!e) return null; const b = e.getBoundingClientRect(); return [b.left, b.top, b.width, b.height].map(v => Math.round(v * 10) / 10); }; return { amount: r('#f-amount'), name: r('#expfielda7'), add: r('.submit-btn.expense'), head: r('.page-header-text'), bell: r('#notif-bell-btn'), scroll: document.scrollingElement.scrollTop, docH: document.documentElement.scrollHeight }; });
  const before = await snap();
  await goOnline(page);
  await expect.poll(() => page.evaluate(() => conflictOpenCount()), { timeout: 15000 }).toBeGreaterThan(0); // конфлікт є, значок у дзвіночку є
  await page.waitForTimeout(2500);
  expect(await snap(), 'жодного зсуву ключових елементів').toEqual(before);
  expect(await page.evaluate(() => window.__renders), 'список не перемальовується під відкритою клавіатурою').toBe(0);
  await expect(page.locator('.success-toast')).toHaveCount(0);
  await page.evaluate(() => { document.body.classList.remove('kb-open'); document.activeElement && document.activeElement.blur(); });
  await expect(page.locator('.success-toast')).toContainText(/вже змін(ив|ила) суму/, { timeout: 8000 });
  expect(await page.evaluate(() => window.__renders), 'відкладене перемальовування виконано після закриття поля').toBeGreaterThan(0);
});

test('19. немає мережі: плашки нема, нічого не зсувається (також при відкритій клавіатурі), індикатор біля аватара видно на всіх вкладках, «Синхронізувати зараз» без мережі → «Потрібна мережа»', async ({ page }) => {
  await boot(page, 'empty');
  expect(await page.locator('#offline-banner').count(), 'плашки в DOM нема').toBe(0);
  const snap = () => page.evaluate(() => { const r = s => { const e = document.querySelector(s); if(!e) return null; const b = e.getBoundingClientRect(); return [b.left, b.top, b.width, b.height].map(v => Math.round(v * 10) / 10); }; return { head: r('.page-header-text'), bell: r('#notif-bell-btn'), tabbar: r('.tabbar-glass'), main: r('.view:not(.hidden)'), amount: r('#f-amount'), docH: document.documentElement.scrollHeight, scroll: document.scrollingElement.scrollTop }; });
  const offline = () => page.evaluate(() => { window.__offline = true; window.dispatchEvent(new Event('offline')); });
  const online = () => page.evaluate(() => { window.__offline = false; window.dispatchEvent(new Event('online')); });
  for(const tab of ['analytics', 'accounting', 'vytraty', 'structure', 'service']){
    await page.evaluate(t => switchTab(t), tab);
    await expect(page.locator('#profile-avatar-top .avatar-status-dot'), 'індикатор біля аватара видно на вкладці ' + tab).toBeVisible();
  }
  await page.evaluate(() => switchTab('accounting')); await page.waitForTimeout(2500);
  const base = await snap();
  await offline(); await page.waitForTimeout(800);
  expect(await snap(), 'без мережі нічого не зсунулось').toEqual(base);
  await expect(page.locator('#profile-avatar-top .avatar-status-dot.offline'), 'індикатор біля аватара показує офлайн').toHaveCount(1, { timeout: 8000 });
  await online(); await page.waitForTimeout(1500);
  expect(await snap(), 'після повернення мережі нічого не зсунулось').toEqual(base);
  // «Синхронізувати зараз» без мережі
  await page.evaluate(() => switchTab('service')); await offline();
  await page.locator('#sync-all-btn').click();
  await expect(page.locator('#sync-all-status')).toHaveText('Потрібна мережа');
  expect(await page.locator('#offline-banner').count()).toBe(0);
  await page.screenshot({ path: 'e2e-results/offline-390-dark.png' });
  await online(); await page.waitForTimeout(500);
  // відкрита клавіатура (емульований kb-open)
  await page.evaluate(() => switchTab('vytraty')); await page.locator('#f-amount').click(); await page.keyboard.type('5');
  await page.waitForTimeout(1200); await page.evaluate(() => document.body.classList.add('kb-open'));
  const kb = await snap();
  await offline(); await page.waitForTimeout(800); expect(await snap(), 'при відкритій клавіатурі без мережі нічого не зсунулось').toEqual(kb);
  await online(); await page.waitForTimeout(1500); expect(await snap(), 'при відкритій клавіатурі після повернення мережі нічого не зсунулось').toEqual(kb);
});

test('20. підказка назви: після «про» тап по підказці вставляє назву за < 150 мс і переводить фокус на «Суму»; перемальовувань списку при незмінному тексті 0', async ({ page }) => {
  await boot(page, 'empty');
  await page.evaluate(() => { const now = new Date().toISOString(); expenses.unshift({ id: generateUUID(), date: localDateISO(), name: 'Продукти Тест', amount: 100, category: '', subcategory: '', manual: true, createdAt: now, updatedAt: now }); renderAll(); switchTab('vytraty'); });
  await page.locator('#expfielda7').click(); await page.keyboard.type('про');
  await page.waitForTimeout(1000); await page.evaluate(() => document.body.classList.add('kb-open')); // емульована відкрита клавіатура
  const item = page.locator('#name-suggest-list .name-suggest-item', { hasText: 'Продукти Тест' });
  await expect(item).toBeVisible();
  // 0 перемальовувань при незмінному тексті: покоління розмітки не росте, вузол той самий
  const stable = await page.evaluate(() => { const g = suggestGen, el = document.querySelector('#name-suggest-list .name-suggest-item'), v = document.getElementById('expfielda7').value; for(let i = 0; i < 6; i++) updateNameSuggestions(v); return [suggestGen - g, el === document.querySelector('#name-suggest-list .name-suggest-item')]; });
  expect(stable, 'незмінний текст: 0 перемальовувань, той самий вузол').toEqual([0, true]);
  // дотик, під час якого приходить зайвий input без зміни тексту (iOS автокорекція): вибір усе одно миттєвий
  const res = await page.evaluate(() => {
    const el = document.querySelector('#name-suggest-list .name-suggest-item'), r = el.getBoundingClientRect(), x = r.left + 20, y = r.top + 10, input = document.getElementById('expfielda7'), v = input.value;
    const t0 = performance.now();
    handleSuggestionTouchStart({ touches: [{ clientX: x, clientY: y }] });
    updateNameSuggestions(v); // зайве перемальовування посеред дотику
    handleSuggestionTouchEnd({ changedTouches: [{ clientX: x, clientY: y }], currentTarget: el, target: el, preventDefault(){} }, 0);
    return { ms: performance.now() - t0, value: input.value, active: document.activeElement && document.activeElement.id };
  });
  expect(res.value, 'назву вставлено').toBe('Продукти Тест');
  expect(res.ms, 'вставка < 150 мс').toBeLessThan(150);
  expect(res.active, 'фокус на «Сумі»').toBe('f-amount');
});

test('21. підказка назви без touchend (iOS віддає його лише з наступним дотиком): тап розпізнається за 150 мс; рух > 8 px не обирає; швидкий тап і пізній touchend не дублюють вставку', async ({ page }) => {
  await boot(page, 'empty');
  await page.evaluate(() => { const now = new Date().toISOString(); expenses.unshift({ id: generateUUID(), date: localDateISO(), name: 'Продукти Тест', amount: 100, category: '', subcategory: '', manual: true, createdAt: now, updatedAt: now }); renderAll(); switchTab('vytraty'); window.__picks = 0; const f = window.selectNameSuggestion; window.selectNameSuggestion = function(){ window.__picks++; return f.apply(this, arguments); }; });
  await page.locator('#expfielda7').click(); await page.keyboard.type('про');
  await page.waitForTimeout(1000); await page.evaluate(() => document.body.classList.add('kb-open'));
  const prep = () => page.evaluate(() => { window.__picks = 0; lastSuggestionPickAt = 0; suggestSuppressed = false; const inp = document.getElementById('expfielda7'); inp.value = 'про'; onNameInput({ type: 'input' }); document.getElementById('f-amount').blur(); });
  const geo = () => page.evaluate(() => { const el = document.querySelector('#name-suggest-list .name-suggest-item'), r = el.getBoundingClientRect(); return { x: r.left + 20, y: r.top + 10 }; });
  // 1. touchstart без touchend: вставка за ≈ 150–250 мс, фокус на «Суму»
  await prep(); let g = await geo();
  const r1 = await page.evaluate(g => new Promise(res => { const t0 = performance.now(); handleSuggestionTouchStart({ touches: [{ clientX: g.x, clientY: g.y, identifier: 7 }] }, 0); const tick = () => { if(document.getElementById('expfielda7').value === 'Продукти Тест') res({ ms: performance.now() - t0, active: document.activeElement && document.activeElement.id }); else if(performance.now() - t0 > 2000) res({ ms: -1 }); else requestAnimationFrame(tick); }; tick(); }), g);
  expect(r1.ms, 'вставка за ≈ 150–250 мс без touchend').toBeGreaterThanOrEqual(140); expect(r1.ms).toBeLessThan(300); expect(r1.active).toBe('f-amount');
  // 4. пізній touchend цього дотику не дублює вставку
  await page.evaluate(g => { handleSuggestionTouchEnd({ changedTouches: [{ clientX: g.x, clientY: g.y, identifier: 7 }], currentTarget: document.querySelector('#name-suggest-list .name-suggest-item') || { isConnected: false, getBoundingClientRect: () => null }, preventDefault(){} }, 0); }, g);
  await page.waitForTimeout(900); expect(await page.evaluate(() => window.__picks), 'рівно одна вставка').toBe(1);
  // 2. touchstart + рух понад 8 px: вставки нема
  await prep(); g = await geo();
  await page.evaluate(g => { handleSuggestionTouchStart({ touches: [{ clientX: g.x, clientY: g.y, identifier: 8 }] }, 0); handleSuggestionTouchMove({ touches: [{ clientX: g.x, clientY: g.y + 20, identifier: 8 }] }); }, g);
  await page.waitForTimeout(500); expect(await page.evaluate(() => [window.__picks, document.getElementById('expfielda7').value]), 'прокрутка не обирає підказку').toEqual([0, 'про']);
  // 3. звичайний швидкий тап: рівно одна вставка
  await prep(); g = await geo();
  await page.evaluate(g => { const el = document.querySelector('#name-suggest-list .name-suggest-item'); handleSuggestionTouchStart({ touches: [{ clientX: g.x, clientY: g.y, identifier: 9 }] }, 0); setTimeout(() => handleSuggestionTouchEnd({ changedTouches: [{ clientX: g.x, clientY: g.y, identifier: 9 }], currentTarget: el, target: el, preventDefault(){} }, 0), 30); }, g);
  await page.waitForTimeout(600); expect(await page.evaluate(() => [window.__picks, document.getElementById('expfielda7').value])).toEqual([1, 'Продукти Тест']);
});

test('22. після вставки підказки (touchend не прийшов) тап по полю назви, «Сумі» й кнопці спрацьовує з першого дотику за < 150 мс', async ({ page }) => {
  await boot(page, 'empty');
  await page.evaluate(() => { const now = new Date().toISOString(); expenses.unshift({ id: generateUUID(), date: localDateISO(), name: 'Продукти Тест', amount: 100, category: '', subcategory: '', manual: true, createdAt: now, updatedAt: now }); renderAll(); switchTab('vytraty'); window.__ev = []; document.addEventListener('pointerdown', e => window.__ev.push(['down', performance.now(), e.target.id || e.target.className]), true); document.addEventListener('focusin', e => window.__ev.push(['focus', performance.now(), e.target.id]), true); document.addEventListener('click', e => window.__ev.push(['click', performance.now(), e.target.id || e.target.className]), true); });
  await page.locator('#expfielda7').click(); await page.keyboard.type('про');
  await page.waitForTimeout(1000); await page.evaluate(() => document.body.classList.add('kb-open'));
  const g = await page.evaluate(() => { const r = document.querySelector('#name-suggest-list .name-suggest-item').getBoundingClientRect(); return { x: r.left + 20, y: r.top + 10 }; });
  await page.evaluate(g => { handleSuggestionTouchStart({ touches: [{ clientX: g.x, clientY: g.y, identifier: 11 }] }, 0); }, g); // палець «лишається» (touchend не приходить)
  await expect.poll(() => page.evaluate(() => document.getElementById('expfielda7').value)).toBe('Продукти Тест');
  const tapDelay = async (selector, kind) => {
    await page.evaluate(() => { window.__ev.length = 0; });
    const b = await page.locator(selector).boundingBox();
    await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
    await page.waitForTimeout(400);
    const ev = await page.evaluate(() => window.__ev);
    const down = ev.find(x => x[0] === 'down'), hit = ev.find(x => x[0] === kind);
    expect(hit, selector + ' отримав ' + kind + ': ' + JSON.stringify(ev)).toBeTruthy();
    return hit[1] - down[1];
  };
  expect(await tapDelay('#expfielda7', 'focus'), 'тап по полю назви: фокус з першого дотику').toBeLessThan(150);
  expect(await tapDelay('#f-amount', 'focus'), 'тап по «Сумі»').toBeLessThan(150);
  expect(await tapDelay('.date-nav-btn >> nth=1', 'click'), 'тап по кнопці').toBeLessThan(150);
});

// Rev 2.32.221 (MERGE-HIDDEN): приховані на спільному злитті — два пристрої на моку, годинник ±1 доба, без картки конфлікту.
test('11. приховані: обоє приховали (сервер переміг, годинник ±1 доба), один приховав — інший показав, рядок зник на сервері, запис без зліпка, повторне приховування без змін', async ({ page }) => {
  await page.goto('/index.html?fixture=typical');
  await page.waitForFunction(() => window.MockCloud && typeof cloudSession !== 'undefined' && cloudSession && cloudSession.user && document.querySelector('.tabbar-glass'));
  await page.waitForTimeout(1500);
  const info = await page.evaluate(async () => {
    const acc = installmentAccounts.find(a => a.cloudId);
    window.__acc = acc; window.__key = hideKeyForAccount(acc, 'installment');
    hideEntityFromMonth(window.__key, '2026-01', null, acc.name); await saveHiddenFrom();
    return { id: acc.cloudId };
  });
  const row = () => page.evaluate(i => { const r = window.MockCloud.state.tables.hidden_entities.find(x => x.entity_id === i); return r ? [r.hidden_from_month, r.deleted_at] : null; }, info.id);
  await expect.poll(row, { timeout: 15000 }).toEqual(['2026-01-01', null]);
  await page.waitForFunction(k => hiddenFrom[k] && hiddenFrom[k].serverBase && hiddenFrom[k].serverUpdatedAt, await page.evaluate(() => window.__key));
  const reset = async () => { // сервер і локальний запис у вихідному стані (2026-01, не видалено), зі зліпком
    await page.evaluate(i => { window.MockCloud.otherDevice({ table: 'hidden_entities', key: 'entity_id', id: i, op: 'update', patch: { hidden_from_month: '2026-01-01', deleted_at: null } }); }, info.id);
    await page.evaluate(async () => { await pullHiddenEntitiesCore(); });
    await page.waitForFunction(() => hiddenFrom[window.__key].month === '2026-01' && !hiddenFrom[window.__key].deletedAt && hiddenFrom[window.__key].serverBase);
  };
  // A. обоє приховали різні місяці; годинник пристрою ±1 доба не міняє результату
  for(const skew of [86400000, -86400000]){
    await reset();
    await page.evaluate(() => { window.__offline = true; });
    await page.evaluate(async skew => { hideEntityFromMonth(window.__key, '2026-03', null, window.__acc.name); hiddenFrom[window.__key].updatedAt = new Date(Date.now() + skew).toISOString(); await saveHiddenFromLocal(); }, skew);
    await page.evaluate(i => { window.MockCloud.otherDevice({ table: 'hidden_entities', key: 'entity_id', id: i, op: 'update', patch: { hidden_from_month: '2026-02-01' } }); }, info.id);
    await goOnline(page);
    await page.evaluate(async () => { await pushHiddenEntitiesPilot(); await pullHiddenEntitiesCore(); });
    expect(await page.evaluate(() => hiddenFrom[window.__key].month), 'сервер переміг (' + skew + ')').toBe('2026-02');
    expect(await row()).toEqual(['2026-02-01', null]);
    expect(await page.evaluate(() => conflictLog.length), 'картки конфлікту нема').toBe(0);
  }
  // B. я змінив місяць, інший показав назад: перемагає сервер (показано)
  await reset();
  await page.evaluate(() => { window.__offline = true; });
  await page.evaluate(async () => { hideEntityFromMonth(window.__key, '2026-04', null, window.__acc.name); await saveHiddenFromLocal(); });
  await page.evaluate(i => { window.MockCloud.otherDevice({ table: 'hidden_entities', key: 'entity_id', id: i, op: 'update', patch: { deleted_at: new Date().toISOString() } }); }, info.id);
  await goOnline(page);
  await page.evaluate(async () => { await pushHiddenEntitiesPilot(); await pullHiddenEntitiesCore(); });
  expect(await page.evaluate(() => !!hiddenFrom[window.__key].deletedAt), 'показано назад (сервер)').toBe(true);
  expect((await row())[1]).not.toBeNull();
  expect(await page.evaluate(() => conflictLog.length)).toBe(0);
  // C. рядок зник на сервері (висячий): правка йде попереднім upsert
  await reset();
  await page.evaluate(() => { window.__offline = true; });
  await page.evaluate(async () => { hideEntityFromMonth(window.__key, '2026-05', null, window.__acc.name); await saveHiddenFromLocal(); });
  await page.evaluate(i => { window.MockCloud.otherDevice({ table: 'hidden_entities', key: 'entity_id', id: i, op: 'harddelete' }); }, info.id);
  await goOnline(page);
  await page.evaluate(async () => { await pushHiddenEntitiesPilot(); });
  await expect.poll(row, { timeout: 15000 }).toEqual(['2026-05-01', null]);
  // D. запис без зліпка: попередній upsert, після нього зліпок з'являється
  await page.evaluate(async () => { const en = hiddenFrom[window.__key]; delete en.serverBase; delete en.serverUpdatedAt; hideEntityFromMonth(window.__key, '2026-06', null, window.__acc.name); await saveHiddenFromLocal(); await pushHiddenEntitiesPilot(); });
  await expect.poll(row, { timeout: 15000 }).toEqual(['2026-06-01', null]);
  expect(await page.evaluate(() => !!hiddenFrom[window.__key].serverBase)).toBe(true);
  // E. повторне приховування з тим самим місяцем: версія не змінюється, запитів запису нема
  await page.waitForTimeout(500);
  const before = await page.evaluate(() => ({ s: JSON.stringify(hiddenFrom[window.__key]), w: window.MockCloud.state.log.filter(x => x.kind === 'rest' && x.method !== 'GET' && x.method !== 'HEAD').length }));
  await page.evaluate(async () => { hideEntityFromMonth(window.__key, '2026-06', null, window.__acc.name); await saveHiddenFrom(); });
  await page.waitForTimeout(1000);
  const after = await page.evaluate(() => ({ s: JSON.stringify(hiddenFrom[window.__key]), w: window.MockCloud.state.log.filter(x => x.kind === 'rest' && x.method !== 'GET' && x.method !== 'HEAD').length }));
  expect(after).toEqual(before);
  // F. приховане під старим ключем (за назвою): міграція на ключ за id зберігається, запис отримує зліпок сервера
  await page.evaluate(async () => { const old = hideKeyLegacy(window.__acc.name, 'installment'); hiddenFrom[old] = { month: '2026-06', updatedAt: '2020-01-01T00:00:00.000Z', syncedUpdatedAt: '2020-01-01T00:00:00.000Z', accountName: window.__acc.name }; delete hiddenFrom[window.__key]; await saveHiddenFromLocal(); await pullHiddenEntitiesCore(); });
  const mig = await page.evaluate(() => ({ old: !!hiddenFrom[hideKeyLegacy(window.__acc.name, 'installment')], neu: hiddenFrom[window.__key] ? hiddenFrom[window.__key].month : null }));
  expect(mig.neu, 'ключ за id після міграції').toBeTruthy();
});

// Rev 2.32.225 (MERGE-WORDS): слова словника на спільному злитті — два пристрої на моку.
test('12. слова: різні рішення зливаються, те саме призначення (годинник ±1 доба) — сервер, видалення проти правки, обоє створили слово, відновлення при живому, висячий cloudId, без зліпка, порожній push', async ({ page }) => {
  await page.goto('/index.html?fixture=typical');
  await page.waitForFunction(() => window.MockCloud && typeof cloudSession !== 'undefined' && cloudSession && cloudSession.user && document.querySelector('.tabbar-glass'));
  await page.waitForTimeout(2000);
  const setup = await page.evaluate(() => {
    const cats = CATEGORIES.filter(c => c.cloudId && c.active).slice(0, 3);
    const words = DICTIONARY.filter(d => d.cloudId && !d.deletedAt && d.serverBase !== undefined || (d.cloudId && !d.deletedAt)).slice(0, 6);
    window.__cats = cats.map(c => ({ name: c.name, id: c.cloudId })); window.__w = words.map(w => w.cloudId);
    return { c: cats.length, w: words.length };
  });
  expect(setup.c).toBeGreaterThanOrEqual(3); expect(setup.w).toBeGreaterThanOrEqual(5);
  const srv = (cid) => page.evaluate(i => { const r = window.MockCloud.state.tables.dictionary.find(x => x.id === i); return r ? { cat: r.category_id, del: !!r.deleted_at, kw: r.keyword } : null; }, cid);
  const loc = (cid) => page.evaluate(i => { const d = DICTIONARY.find(x => x.cloudId === i); return d ? { cat: d.cat, del: !!d.deletedAt, base: !!d.serverBase } : null; }, cid);
  const edit = (cid, fn) => page.evaluate(async ([i, f]) => { const d = DICTIONARY.find(x => x.cloudId === i); new Function('d', 'cats', f)(d, window.__cats); await saveDictionaryLocal(); }, [cid, fn]);
  const other = (cid, patch) => page.evaluate(([i, pt]) => { window.MockCloud.otherDevice({ table: 'dictionary', id: i, op: 'update', patch: pt }); }, [cid, patch]);
  const syncNow = () => page.evaluate(async () => { await pushDictionaryPilot(); await pullDictionaryCore(); });
  const offline = (on) => page.evaluate(v => { window.__offline = v; if(!v) window.dispatchEvent(new Event('online')); }, on);
  const ids = await page.evaluate(() => window.__w);
  const cats = await page.evaluate(() => window.__cats);
  // A. призначення проти видалення: видалення перемагає, правка не воскрешає
  await page.waitForFunction(i => { const d = DICTIONARY.find(x => x.cloudId === i); return d && d.serverBase; }, ids[0]);
  await offline(true);
  await edit(ids[0], "d.cat = cats[2].name; d.sub = null; d.updatedAt = new Date().toISOString();");
  await other(ids[0], { deleted_at: new Date().toISOString(), deleted_via: 'word' });
  await offline(false); await syncNow();
  expect((await srv(ids[0])).del, 'видалення лишилось на сервері').toBe(true);
  expect((await loc(ids[0])).del, 'локально теж видалено').toBe(true);
  // B. те саме призначення: сервер переміг; годинник ±1 доба не міняє результату
  for(const [k, skew] of [[1, 86400000], [2, -86400000]]){
    const cid = ids[k];
    await page.waitForFunction(i => { const d = DICTIONARY.find(x => x.cloudId === i); return d && d.serverBase; }, cid);
    await offline(true);
    await edit(cid, "d.cat = cats[1].name; d.sub = null; d.updatedAt = new Date(Date.now() + (" + skew + ")).toISOString();");
    await other(cid, { category_id: cats[2].id, subcategory_id: null });
    await offline(false); await syncNow();
    expect((await srv(cid)).cat, 'сервер переміг (' + skew + ')').toBe(cats[2].id);
    expect((await loc(cid)).cat).toBe(cats[2].name);
  }
  // C. різні рішення: я видалив, інший змінив категорію — видалено, категорія сервера
  await page.waitForFunction(i => { const d = DICTIONARY.find(x => x.cloudId === i); return d && d.serverBase; }, ids[3]);
  await offline(true);
  await edit(ids[3], "d.deletedAt = new Date().toISOString(); d.deletedVia = 'word'; d.updatedAt = new Date().toISOString();");
  await other(ids[3], { category_id: cats[1].id, subcategory_id: null });
  await offline(false); await syncNow();
  const c = await srv(ids[3]); expect(c.del).toBe(true); expect(c.cat).toBe(cats[1].id);
  // D. обоє створили те саме слово: усиновлення, дубля нема, помилки нема
  await offline(true);
  await page.evaluate(async () => { const now = new Date().toISOString(); DICTIONARY.push({ id: generateUUID(), kw: 'тестслово', cat: window.__cats[0].name, sub: null, createdAt: now, updatedAt: now }); await saveDictionaryLocal(); });
  await page.evaluate(([cid]) => { window.MockCloud.otherDevice({ table: 'dictionary', op: 'insert', row: { id: 'srv-word-1', keyword: 'тестслово', category_id: cid, subcategory_id: null, deleted_at: null, deleted_via: null } }); }, [cats[1].id]);
  await offline(false); await syncNow();
  const dup = await page.evaluate(() => ({ srv: window.MockCloud.state.tables.dictionary.filter(r => String(r.keyword).toLowerCase() === 'тестслово' && !r.deleted_at).length, loc: DICTIONARY.filter(d => d.kw === 'тестслово' && !d.deletedAt).length, cat: (DICTIONARY.find(d => d.kw === 'тестслово') || {}).cat }));
  expect(dup.srv).toBe(1); expect(dup.loc).toBe(1); expect(dup.cat, 'категорія з сервера').toBe(cats[1].name);
  // E. відновлення видаленого слова, коли таке ж уже є живе
  await offline(true);
  await page.evaluate(() => { const i = window.__w[4]; window.__kw4 = DICTIONARY.find(x => x.cloudId === i).kw; });
  await edit(ids[4], "d.deletedAt = new Date().toISOString(); d.deletedVia = 'word'; d.updatedAt = new Date().toISOString();");
  await offline(false); await syncNow();
  await offline(true);
  await page.evaluate(() => { window.MockCloud.otherDevice({ table: 'dictionary', op: 'insert', row: { id: 'srv-word-2', keyword: window.__kw4, category_id: window.__cats[0].id, subcategory_id: null, deleted_at: null, deleted_via: null } }); });
  await edit(ids[4], "delete d.deletedAt; delete d.deletedVia; d.updatedAt = new Date().toISOString();");
  await offline(false); await syncNow();
  const res = await page.evaluate(() => ({ srv: window.MockCloud.state.tables.dictionary.filter(r => String(r.keyword).toLowerCase() === window.__kw4.toLowerCase() && !r.deleted_at).length, loc: DICTIONARY.filter(d => d.kw.toLowerCase() === window.__kw4.toLowerCase() && !d.deletedAt).length }));
  expect(res.srv, 'на сервері одне живе').toBe(1); expect(res.loc, 'локально одне живе').toBe(1);
  // F. висячий cloudId: рядок зник на сервері — правка йде попереднім шляхом
  await page.waitForFunction(() => window.__w.length);
  const cid5 = await page.evaluate(() => window.__w[5]);
  await page.waitForFunction(i => { const d = DICTIONARY.find(x => x.cloudId === i); return d && d.serverBase; }, cid5);
  const kw5 = await page.evaluate(i => DICTIONARY.find(x => x.cloudId === i).kw, cid5);
  await offline(true);
  await edit(cid5, "d.cat = cats[1].name; d.sub = null; d.updatedAt = new Date().toISOString();");
  await page.evaluate(i => { window.MockCloud.otherDevice({ table: 'dictionary', op: 'harddelete', id: i }); }, cid5);
  await offline(false); await syncNow();
  const f = await page.evaluate(k => { const r = window.MockCloud.state.tables.dictionary.filter(x => String(x.keyword).toLowerCase() === k.toLowerCase() && !x.deleted_at); return { n: r.length, cat: r[0] && r[0].category_id }; }, kw5);
  expect(f.n, 'слово відтворено на сервері без дубля').toBe(1); expect(f.cat).toBe(cats[1].id);
  // H. запис без зліпка: попередній шлях, після нього зліпок з'являється
  const cid6 = await page.evaluate(i => { const d = DICTIONARY.find(x => x.kw === i); return d.cloudId; }, kw5);
  await page.evaluate(async i => { const d = DICTIONARY.find(x => x.cloudId === i); delete d.serverBase; delete d.serverUpdatedAt; delete d.serverKw; d.cat = window.__cats[2].name; d.sub = null; d.updatedAt = new Date().toISOString(); await saveDictionaryLocal(); await pushDictionaryPilot(); }, cid6);
  expect((await srv(cid6)).cat).toBe(cats[2].id);
  expect((await loc(cid6)).base, 'зліпок після push').toBe(true);
  // G. порожній push: жодних запитів запису
  await syncNow(); await page.waitForTimeout(500);
  const w0 = await page.evaluate(() => window.MockCloud.state.log.filter(x => x.kind === 'rest' && x.method !== 'GET' && x.method !== 'HEAD').length);
  await page.evaluate(async () => { await pushDictionaryPilot(); });
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => window.MockCloud.state.log.filter(x => x.kind === 'rest' && x.method !== 'GET' && x.method !== 'HEAD').length)).toBe(w0);
});

// Rev 2.32.225 (MERGE-WORDS): додаткові краї — каскад видалення категорії і офлайн→онлайн.
async function wordsSetup(page){
  await page.goto('/index.html?fixture=typical');
  await page.waitForFunction(() => window.MockCloud && typeof cloudSession !== 'undefined' && cloudSession && cloudSession.user && document.querySelector('.tabbar-glass'));
  await page.waitForTimeout(2000);
  const errors = []; page.on('pageerror', x => errors.push(String(x)));
  const syncAll = () => page.evaluate(async () => { await pullCategoriesCore(); await pullSubcategoriesCore(); await pushDictionaryPilot(); await pullDictionaryCore(); await pullDictionaryCore(); });
  const offline = (on) => page.evaluate(v => { window.__offline = v; if(!v) window.dispatchEvent(new Event('online')); }, on);
  return { errors, syncAll, offline };
}

test('13. слова, каскад видалення категорії: слово, яке я змінив офлайн, лишається видаленим; не чіпане теж видалене; помилок і дублів нема', async ({ page }) => {
  const { errors, syncAll, offline } = await wordsSetup(page);
  const info = await page.evaluate(() => {
    const byCat = {};
    DICTIONARY.filter(d => d.cloudId && !d.deletedAt && !d.sub).forEach(d => { (byCat[d.cat] = byCat[d.cat] || []).push(d); });
    const cat = Object.keys(byCat).find(c => byCat[c].length >= 2 && CATEGORIES.find(x => x.name === c && x.cloudId));
    const target = CATEGORIES.find(x => x.cloudId && x.active && x.name !== cat);
    return cat ? { cat: cat, catId: CATEGORIES.find(x => x.name === cat).cloudId, w: byCat[cat].slice(0, 2).map(d => ({ id: d.cloudId, kw: d.kw })), target: { name: target.name, id: target.cloudId } } : null;
  });
  expect(info, 'у фікстурі є категорія щонайменше з двома словами без підкатегорії').toBeTruthy();
  for(const w of info.w) await page.waitForFunction(i => { const d = DICTIONARY.find(x => x.cloudId === i); return d && d.serverBase; }, w.id);
  await offline(true);
  // B (цей пристрій, офлайн): змінює призначення слова 1
  await page.evaluate(async ([id, t]) => { const d = DICTIONARY.find(x => x.cloudId === id); d.cat = t; d.sub = null; d.updatedAt = new Date().toISOString(); await saveDictionaryLocal(); }, [info.w[0].id, info.target.name]);
  // A (інший пристрій): видаляє категорію разом зі словами (deleted_via = category)
  await page.evaluate(([cid, words]) => {
    const ts = new Date().toISOString();
    window.MockCloud.otherDevice({ table: 'categories', id: cid, op: 'update', patch: { deleted_at: ts } });
    // каскад: усі слова категорії (як серверне видалення гілки), не лише два
    window.MockCloud.state.tables.dictionary.filter(r => r.category_id === cid && !r.deleted_at).forEach(r => window.MockCloud.otherDevice({ table: 'dictionary', id: r.id, op: 'update', patch: { deleted_at: ts, deleted_via: 'category' } }));
  }, [info.catId, info.w.map(w => w.id)]);
  await offline(false); await syncAll();
  const srv = await page.evaluate(ids => ids.map(i => { const r = window.MockCloud.state.tables.dictionary.find(x => x.id === i); return !!(r && r.deleted_at); }), info.w.map(w => w.id));
  expect(srv, 'на сервері обидва слова лишаються видаленими').toEqual([true, true]);
  const loc = await page.evaluate(ws => ws.map(w => { const all = DICTIONARY.filter(d => d.kw === w.kw); return { n: all.length, liveN: all.filter(d => !d.deletedAt).length }; }), info.w);
  loc.forEach((x, i) => { expect(x.liveN, 'слово ' + i + ' не відроджене локально').toBe(0); expect(x.n, 'дубля нема').toBeLessThanOrEqual(1); });
  expect(await page.evaluate(() => window.MockCloud.state.tables.dictionary.filter(r => !r.deleted_at).length - DICTIONARY.filter(d => !d.deletedAt && d.cloudId).length), 'живі слова збігаються з сервером').toBe(0);
  expect(await page.evaluate(() => conflictLog.length), 'картки конфлікту нема').toBe(0);
  expect(errors, 'без помилок').toEqual([]);
});

test('14. слова, офлайн→онлайн: обидва створили те саме слово й змінили призначення різних слів — однаковий стан, без дубля й помилок', async ({ page }) => {
  const { errors, syncAll, offline } = await wordsSetup(page);
  const info = await page.evaluate(() => {
    const cats = CATEGORIES.filter(c => c.cloudId && c.active).slice(0, 3).map(c => ({ name: c.name, id: c.cloudId }));
    const ws = DICTIONARY.filter(d => d.cloudId && !d.deletedAt && !d.sub).slice(0, 2).map(d => ({ id: d.cloudId, kw: d.kw }));
    return { cats, ws };
  });
  expect(info.cats.length).toBeGreaterThanOrEqual(3); expect(info.ws.length).toBe(2);
  for(const w of info.ws) await page.waitForFunction(i => { const d = DICTIONARY.find(x => x.cloudId === i); return d && d.serverBase; }, w.id);
  await offline(true);
  // цей пристрій: нове слово в категорії 0, слово 1 → категорія 1
  await page.evaluate(async ([c0, c1, w1]) => { const now = new Date().toISOString(); DICTIONARY.push({ id: generateUUID(), kw: 'новеслово', cat: c0, sub: null, createdAt: now, updatedAt: now }); const d = DICTIONARY.find(x => x.cloudId === w1); d.cat = c1; d.sub = null; d.updatedAt = now; await saveDictionaryLocal(); }, [info.cats[0].name, info.cats[1].name, info.ws[0].id]);
  // інший пристрій (теж без мережі, підключився першим): те саме слово в категорії 2, слово 2 → категорія 2
  await page.evaluate(([c2, w2]) => {
    window.MockCloud.otherDevice({ table: 'dictionary', op: 'insert', row: { id: 'srv-new-1', keyword: 'новеслово', category_id: c2, subcategory_id: null, deleted_at: null, deleted_via: null } });
    window.MockCloud.otherDevice({ table: 'dictionary', id: w2, op: 'update', patch: { category_id: c2, subcategory_id: null } });
  }, [info.cats[2].id, info.ws[1].id]);
  await offline(false); await syncAll();
  const state = await page.evaluate(([w1, w2]) => {
    const T = window.MockCloud.state.tables.dictionary, byId = i => T.find(r => r.id === i);
    const cname = id => (CATEGORIES.find(c => c.cloudId === id) || {}).name;
    const L = i => (DICTIONARY.find(d => d.cloudId === i) || {}).cat;
    return { newSrv: T.filter(r => r.keyword === 'новеслово' && !r.deleted_at).length, newLoc: DICTIONARY.filter(d => d.kw === 'новеслово' && !d.deletedAt).length,
      newSrvCat: cname((T.find(r => r.keyword === 'новеслово') || {}).category_id), newLocCat: (DICTIONARY.find(d => d.kw === 'новеслово') || {}).cat,
      w1: [cname(byId(w1).category_id), L(w1)], w2: [cname(byId(w2).category_id), L(w2)] };
  }, [info.ws[0].id, info.ws[1].id]);
  expect(state.newSrv).toBe(1); expect(state.newLoc).toBe(1);
  expect(state.newLocCat, 'нове слово: категорія з сервера (інший пристрій був першим)').toBe(state.newSrvCat); expect(state.newSrvCat).toBe(info.cats[2].name);
  expect(state.w1[0], 'моя зміна слова 1 на сервері').toBe(info.cats[1].name); expect(state.w1[1]).toBe(state.w1[0]);
  expect(state.w2[0], 'чужа зміна слова 2 локально').toBe(info.cats[2].name); expect(state.w2[1]).toBe(state.w2[0]);
  expect(errors, 'без помилок').toEqual([]);
});

// Rev 2.32.226 (MERGE-ACCOUNTS): картки та ОЧ на спільному злитті — два пристрої на моку, годинник ±1 доба.
async function accountsSetup(page, table, list){
  await page.goto('/index.html?fixture=typical');
  await page.waitForFunction(() => window.MockCloud && typeof cloudSession !== 'undefined' && cloudSession && cloudSession.user && document.querySelector('.tabbar-glass'));
  await page.waitForTimeout(2000);
  const errors = []; page.on('pageerror', x => errors.push(String(x)));
  const id = await page.evaluate(l => { const a = (l === 'bankAccounts' ? bankAccounts : installmentAccounts).find(x => x.cloudId); window.__aid = a.cloudId; return a.cloudId; }, list);
  await page.waitForFunction(([l, i]) => { const a = (l === 'bankAccounts' ? bankAccounts : installmentAccounts).find(x => x.cloudId === i); return a && a.serverBase && a.serverUpdatedAt; }, [list, id]);
  const offline = on => page.evaluate(v => { window.__offline = v; if(!v) window.dispatchEvent(new Event('online')); }, on);
  const other = patch => page.evaluate(([t, i, pt]) => { window.MockCloud.otherDevice({ table: t, id: i, op: 'update', patch: pt }); }, [table, id, patch]);
  const edit = (fn, skew) => page.evaluate(async ([l, i, f, k]) => { const a = (l === 'bankAccounts' ? bankAccounts : installmentAccounts).find(x => x.cloudId === i); new Function('a', f)(a); a.updatedAt = new Date(Date.now() + (k || 0)).toISOString(); await (l === 'bankAccounts' ? saveBankAccountsLocal() : saveInstallmentAccountsLocal()); }, [list, id, fn, skew]);
  const sync = () => page.evaluate(async l => { if(l === 'bankAccounts'){ await pushBankAccountsPilot(); await pullBankAccountsCore(); } else { await pushInstallmentAccountsPilot(); await pullInstallmentAccountsCore(); } }, list);
  const srv = () => page.evaluate(([t, i]) => JSON.parse(JSON.stringify(window.MockCloud.state.tables[t].find(x => x.id === i))), [table, id]);
  const loc = () => page.evaluate(([l, i]) => JSON.parse(JSON.stringify((l === 'bankAccounts' ? bankAccounts : installmentAccounts).find(x => x.cloudId === i))), [list, id]);
  return { id, errors, offline, other, edit, sync, srv, loc };
}

test('15. картки: різні поля зливаються мовчки; те саме поле — картка з «Повернути моє» (±1 доба); name тихо сервер; порожній push; без зліпка', async ({ page }) => {
  const h = await accountsSetup(page, 'bank_accounts', 'bankAccounts');
  // A. різні поля: мій ліміт, чужий день платежу
  await h.offline(true);
  await h.edit("a.creditLimit = 77000;");
  await h.other({ payment_day: 17 });
  await h.offline(false); await h.sync();
  let s = await h.srv(), l = await h.loc();
  expect([s.credit_limit, s.payment_day], 'на сервері обидві зміни').toEqual([77000, 17]); expect([l.creditLimit, l.paymentDay]).toEqual([77000, 17]);
  expect(await page.evaluate(() => conflictLog.length), 'без сповіщень').toBe(0);
  // B. те саме поле (ліміт): сервер лишається, у журналі моє; годинник ±1 доба не міняє
  for(const skew of [86400000, -86400000]){
    await h.offline(true);
    await h.edit("a.creditLimit = 11000;", skew);
    const srvVal = skew > 0 ? 22000 : 23000; // різні значення, щоб серверна зміна справді відбулась
    await h.other({ credit_limit: srvVal });
    await h.offline(false); await h.sync();
    s = await h.srv(); l = await h.loc();
    expect([s.credit_limit, l.creditLimit], 'сервер переміг (' + skew + ')').toEqual([srvVal, srvVal]);
    const cf = await page.evaluate(() => conflictLog.filter(x => x.status === 'open' && x.field === 'creditLimit').map(x => [x.mine, x.theirs]));
    expect(cf[cf.length - 1], 'моє значення в журналі').toEqual([11000, srvVal]);
  }
  // «Повернути моє» = нова звичайна правка
  await page.evaluate(async () => { const e = conflictLog.filter(x => x.status === 'open' && x.field === 'creditLimit').slice(-1)[0]; await conflictResolve(e.id, 'mine'); });
  await expect.poll(async () => (await h.srv()).credit_limit, { timeout: 15000 }).toBe(11000);
  // C. name: тихо сервер, без картки
  const before = await page.evaluate(() => conflictLog.length);
  await h.offline(true);
  await h.edit("a.name = 'Моя назва картки';");
  await h.other({ name: 'Серверна назва картки' });
  await h.offline(false); await h.sync();
  expect((await h.loc()).name).toBe('Серверна назва картки'); expect(await page.evaluate(() => conflictLog.length)).toBe(before);
  // D. порожній push: запитів запису нема
  await h.sync(); await page.waitForTimeout(400);
  const w0 = await page.evaluate(() => window.MockCloud.state.log.filter(x => x.kind === 'rest' && x.method !== 'GET' && x.method !== 'HEAD').length);
  await page.evaluate(async () => { await pushBankAccountsPilot(); });
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => window.MockCloud.state.log.filter(x => x.kind === 'rest' && x.method !== 'GET' && x.method !== 'HEAD').length)).toBe(w0);
  // E. висячий cloudId (рядок зник на сервері): правка відтворюється попереднім шляхом
  await h.offline(true);
  await h.edit("a.creditLimit = 33000;");
  await page.evaluate(i => { window.MockCloud.otherDevice({ table: 'bank_accounts', id: i, op: 'harddelete' }); }, h.id);
  await h.offline(false); await h.sync();
  const back = await page.evaluate(() => { const a = bankAccounts.find(x => x.creditLimit === 33000); return a ? { has: window.MockCloud.state.tables.bank_accounts.some(r => r.credit_limit === 33000 && !r.deleted_at) } : null; });
  expect(back && back.has, 'рахунок відтворено на сервері').toBe(true);
  // F. без зліпка: попередній шлях, після нього зліпок з'являється
  await page.evaluate(async () => { const a = bankAccounts.find(x => x.creditLimit === 33000); window.__aid = a.cloudId; delete a.serverBase; delete a.serverUpdatedAt; a.creditLimit = 44000; a.updatedAt = new Date().toISOString(); await saveBankAccountsLocal(); await pushBankAccountsPilot(); });
  expect(await page.evaluate(() => window.MockCloud.state.tables.bank_accounts.some(r => r.credit_limit === 44000))).toBe(true);
  expect(await page.evaluate(() => !!bankAccounts.find(x => x.creditLimit === 44000).serverBase)).toBe(true);
  expect(h.errors).toEqual([]);
});

test('16. ОЧ: різні поля, те саме поле (платіж) з карткою, перейменування одним + платіж іншим (борги з новою назвою), name тихо сервер, без зліпка, порожній push', async ({ page }) => {
  const h = await accountsSetup(page, 'installment_accounts', 'installmentAccounts');
  // A. різні поля: мій платіж, чужий термін
  await h.offline(true);
  await h.edit("a.payment = 1500;");
  await h.other({ term_months: 18 });
  await h.offline(false); await h.sync();
  let s = await h.srv(), l = await h.loc();
  expect([s.payment, s.term_months]).toEqual([1500, 18]); expect([l.payment, l.termMonths]).toEqual([1500, 18]);
  expect(await page.evaluate(() => conflictLog.length)).toBe(0);
  // B. те саме поле (платіж): картка «вже змінила платіж», годинник ±1 доба
  for(const skew of [86400000, -86400000]){
    await h.offline(true);
    await h.edit("a.payment = 1111;", skew);
    const srvVal = skew > 0 ? 2222 : 2333;
    await h.other({ payment: srvVal });
    await h.offline(false); await h.sync();
    s = await h.srv(); l = await h.loc();
    expect([s.payment, l.payment], 'сервер переміг (' + skew + ')').toEqual([srvVal, srvVal]);
  }
  const card = await page.evaluate(() => { const e = conflictLog.filter(x => x.status === 'open' && x.field === 'payment').slice(-1)[0]; return { title: conflictModel(e).title, mine: e.mine, theirs: e.theirs }; });
  expect(card.title).toContain('вже'); expect(card.title).toContain('платіж'); expect([card.mine, card.theirs]).toEqual([1111, 2333]);
  // C. перейменування одним пристроєм (сервер), платіж — іншим: обидві збережені, борги з новою назвою
  const oldName = (await h.loc()).name;
  await page.evaluate(async n => { debts.push({ id: generateUUID(), name: n, kind: 'installment', month: '2026-09', balance: 100, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }); await saveDebts(); }, oldName);
  await h.offline(true);
  await h.edit("a.payment = 3333;");
  await h.other({ name: 'ОЧ нова назва' });
  await h.offline(false); await h.sync();
  s = await h.srv(); l = await h.loc();
  expect([s.name, s.payment]).toEqual(['ОЧ нова назва', 3333]); expect([l.name, l.payment]).toEqual(['ОЧ нова назва', 3333]);
  expect(await page.evaluate(() => debts.filter(d => d.name === 'ОЧ нова назва').length), 'борги з новою назвою').toBeGreaterThan(0);
  expect(await page.evaluate(n => debts.filter(d => d.name === n && d.kind === 'installment').length, oldName), 'старої назви в боргах нема').toBe(0);
  // D. name в обох: тихо сервер, без картки
  const before = await page.evaluate(() => conflictLog.length);
  await h.offline(true);
  await h.edit("a.name = 'Моя назва ОЧ';");
  await h.other({ name: 'Серверна назва ОЧ' });
  await h.offline(false); await h.sync();
  expect((await h.loc()).name).toBe('Серверна назва ОЧ'); expect(await page.evaluate(() => conflictLog.length)).toBe(before);
  // E. порожній push
  await h.sync(); await page.waitForTimeout(400);
  const w0 = await page.evaluate(() => window.MockCloud.state.log.filter(x => x.kind === 'rest' && x.method !== 'GET' && x.method !== 'HEAD').length);
  await page.evaluate(async () => { await pushInstallmentAccountsPilot(); });
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => window.MockCloud.state.log.filter(x => x.kind === 'rest' && x.method !== 'GET' && x.method !== 'HEAD').length)).toBe(w0);
  // F. без зліпка: попередній шлях
  await page.evaluate(async () => { const a = installmentAccounts.find(x => x.cloudId); delete a.serverBase; delete a.serverUpdatedAt; a.payment = 5555; a.updatedAt = new Date().toISOString(); await saveInstallmentAccountsLocal(); await pushInstallmentAccountsPilot(); });
  expect(await page.evaluate(() => window.MockCloud.state.tables.installment_accounts.some(r => r.payment === 5555))).toBe(true);
  expect(h.errors).toEqual([]);
});


// Rev 2.32.227 (MERGE-TAXONOMY): категорії й підкатегорії на спільному злитті — два пристрої на моку, годинник ±1 доба.
async function taxSetup(page, table){
  await page.goto('/index.html?fixture=typical');
  await page.waitForFunction(() => window.MockCloud && typeof cloudSession !== 'undefined' && cloudSession && cloudSession.user && document.querySelector('.tabbar-glass'));
  await page.waitForTimeout(2000);
  const errors = []; page.on('pageerror', x => errors.push(String(x)));
  const isCat = table === 'categories';
  const ids = await page.evaluate(t => (t === 'categories' ? CATEGORIES : SUBCATEGORIES).filter(x => x.cloudId && x.active).slice(0, 4).map(x => x.cloudId), table);
  expect(ids.length, 'у фікстурі є щонайменше 4 живих записи').toBeGreaterThanOrEqual(4);
  for(const i of ids) await page.waitForFunction(([t, id]) => { const r = (t === 'categories' ? CATEGORIES : SUBCATEGORIES).find(x => x.cloudId === id); return r && r.serverBase && r.serverUpdatedAt && r.serverName === r.name; }, [table, i]);
  const offline = on => page.evaluate(v => { window.__offline = v; if(!v) window.dispatchEvent(new Event('online')); }, on);
  const other = (id, patch) => page.evaluate(([t, i, pt]) => { window.MockCloud.otherDevice({ table: t, id: i, op: 'update', patch: pt }); }, [table, id, patch]);
  const edit = (id, fn, skew) => page.evaluate(async ([t, i, f, k]) => { const a = (t === 'categories' ? CATEGORIES : SUBCATEGORIES).find(x => x.cloudId === i); new Function('a', f)(a); a.updatedAt = new Date(Date.now() + (k || 0)).toISOString(); await (t === 'categories' ? saveCategoriesLocal() : saveSubcategoriesLocal()); }, [table, id, fn, skew]);
  const sync = () => page.evaluate(async t => { if(t === 'categories'){ await pushCategoriesPilot(); await pullCategoriesCore(); } else { await pushSubcategoriesPilot(); await pullSubcategoriesCore(); } }, table);
  const srv = id => page.evaluate(([t, i]) => { const r = window.MockCloud.state.tables[t].find(x => x.id === i); return r ? JSON.parse(JSON.stringify(r)) : null; }, [table, id]);
  const loc = id => page.evaluate(([t, i]) => { const r = (t === 'categories' ? CATEGORIES : SUBCATEGORIES).find(x => x.cloudId === i); return r ? JSON.parse(JSON.stringify(r)) : null; }, [table, id]);
  const writes = () => page.evaluate(() => window.MockCloud.state.log.filter(x => x.kind === 'rest' && x.method !== 'GET' && x.method !== 'HEAD').length);
  return { ids, errors, offline, other, edit, sync, srv, loc, writes, isCat };
}
const otherType = t => (t === 'Гнучка' ? "Обов'язкова" : 'Гнучка');

test('23. категорії: різні поля (тип і «активна»), те саме поле — сервер (±1 доба), видалення проти правки, висячий cloudId, без зліпка, порожній push, офлайн→онлайн; без карток', async ({ page }) => {
  const h = await taxSetup(page, 'categories');
  // A. різні поля: мій тип, чужа «активна»
  await h.offline(true);
  const t0 = (await h.loc(h.ids[0])).type, mineT = otherType(t0);
  await h.edit(h.ids[0], "a.type = " + JSON.stringify(mineT) + ";");
  await h.other(h.ids[0], { active: false });
  await h.offline(false); await h.sync();
  let s = await h.srv(h.ids[0]), l = await h.loc(h.ids[0]);
  expect([s.type, s.active], 'на сервері обидві зміни').toEqual([mineT, false]); expect([l.type, l.active]).toEqual([mineT, false]);
  // B. те саме поле (тип): сервер переміг, ±1 доба не міняє
  for(const [k, skew] of [[1, 86400000], [2, -86400000]]){
    const id = h.ids[k]; const cur = (await h.loc(id)).type;
    const mine = otherType(cur), theirs = cur === 'Скорочувана' ? 'Гнучка' : 'Скорочувана';
    const srvVal = theirs === mine ? "Обов'язкова" : theirs;
    await h.offline(true);
    await h.edit(id, "a.type = " + JSON.stringify(mine) + ";", skew);
    await h.other(id, { type: srvVal });
    await h.offline(false); await h.sync();
    expect([(await h.srv(id)).type, (await h.loc(id)).type], 'сервер переміг (' + skew + ')').toEqual([srvVal, srvVal]);
  }
  // C. видалення (позначка «неактивна») на сервері проти моєї правки типу: обидві зміни; назавжди видалена на сервері: видалення перемагає
  const idC = h.ids[3];
  await h.offline(true);
  await h.edit(idC, "a.type = " + JSON.stringify(otherType((await h.loc(idC)).type)) + ";");
  await h.other(idC, { deleted_at: new Date().toISOString() });
  await h.offline(false); await h.sync();
  expect(await h.loc(idC), 'надгробок сервера: запис прибрано локально').toBeNull();
  expect((await h.srv(idC)).deleted_at, 'видалення лишилось на сервері').toBeTruthy();
  // D. порожній push: запитів запису нема
  await h.sync(); await page.waitForTimeout(400);
  const w0 = await h.writes();
  await page.evaluate(async () => { await pushCategoriesPilot(); });
  await page.waitForTimeout(400);
  expect(await h.writes(), 'порожній push не пише').toBe(w0);
  // E. висячий cloudId: рядок зник на сервері → правка відтворюється попереднім шляхом
  const idE = h.ids[1];
  await h.offline(true);
  const nameE = (await h.loc(idE)).name;
  const typeE = (await h.loc(idE)).type === 'Скорочувана' ? 'Гнучка' : 'Скорочувана';
  await h.edit(idE, "a.type = " + JSON.stringify(typeE) + ";");
  await page.evaluate(i => { window.MockCloud.otherDevice({ table: 'categories', id: i, op: 'harddelete' }); }, idE);
  await h.offline(false); await h.sync();
  expect(await page.evaluate(n => window.MockCloud.state.tables.categories.some(r => r.name === n[0] && r.type === n[1] && !r.deleted_at), [nameE, typeE]), 'категорію відтворено на сервері').toBe(true);
  expect(await page.evaluate(n => CATEGORIES.filter(c => c.name === n).length, nameE), 'дубля нема').toBe(1);
  // F. без зліпка: попередній шлях, після нього зліпок з'являється
  const idF = h.ids[2];
  await page.evaluate(async i => { const a = CATEGORIES.find(x => x.cloudId === i); delete a.serverBase; delete a.serverUpdatedAt; a.type = 'Обов\'язкова'; a.updatedAt = new Date().toISOString(); await saveCategoriesLocal(); await pushCategoriesPilot(); }, idF);
  expect((await h.srv(idF)).type).toBe("Обов'язкова");
  expect(await page.evaluate(i => !!CATEGORIES.find(x => x.cloudId === i).serverBase, idF)).toBe(true);
  expect(await page.evaluate(() => conflictLog.length), 'карток і сповіщень нема').toBe(0);
  expect(h.errors).toEqual([]);
});

test('24. підкатегорії: «активна» разом з причиною деактивації та інше, те саме поле — сервер (±1 доба), видалення проти правки, висячий cloudId, без зліпка, каскад видалення категорії проти правки слова; без карток', async ({ page }) => {
  const h = await taxSetup(page, 'subcategories');
  // A. різні «рішення» для різних підкатегорій: я деактивую, інший теж деактивує іншу — обидві стають неактивними; одна й та сама: сервер
  await h.offline(true);
  await h.edit(h.ids[0], "a.active = false;");
  await h.other(h.ids[1], { active: false, deactivated_via: 'category' });
  await h.offline(false); await h.sync();
  expect([(await h.srv(h.ids[0])).active, (await h.loc(h.ids[0])).active], 'моя деактивація дійшла до сервера').toEqual([false, false]);
  let l1 = await h.loc(h.ids[1]);
  expect([l1.active, l1.deactivatedVia], 'чужа деактивація каскадом застосована').toEqual([false, 'category']);
  // B. те саме поле: я деактивую, інший залишає активною й міняє батька-незалежне — сервер; ±1 доба
  for(const [k, skew] of [[2, 86400000], [3, -86400000]]){
    const id = h.ids[k];
    await h.offline(true);
    await h.edit(id, "a.active = false; delete a.deactivatedVia;", skew);
    await h.other(id, { active: false, deactivated_via: 'category' });
    await h.offline(false); await h.sync();
    const l = await h.loc(id), s = await h.srv(id);
    expect([s.active, s.deactivated_via, l.active, l.deactivatedVia], 'сервер переміг (' + skew + ')').toEqual([false, 'category', false, 'category']);
  }
  // C. видалення проти правки: надгробок сервера перемагає, локально запис прибрано
  const idC = h.ids[2];
  await page.evaluate(async i => { const a = SUBCATEGORIES.find(x => x.cloudId === i); a.active = true; delete a.deactivatedVia; }, idC);
  await h.offline(true);
  await h.edit(idC, "a.active = true;");
  await h.other(idC, { deleted_at: new Date().toISOString() });
  await h.offline(false); await h.sync();
  expect(await h.loc(idC), 'надгробок сервера: запис прибрано локально').toBeNull();
  // D. порожній push
  await h.sync(); await page.waitForTimeout(400);
  const w0 = await h.writes();
  await page.evaluate(async () => { await pushSubcategoriesPilot(); });
  await page.waitForTimeout(400);
  expect(await h.writes(), 'порожній push не пише').toBe(w0);
  // E. висячий cloudId
  const idE = h.ids[3];
  const nameE = (await h.loc(idE)).name;
  await h.offline(true);
  await h.edit(idE, "a.active = !a.active; delete a.deactivatedVia;");
  await page.evaluate(i => { window.MockCloud.otherDevice({ table: 'subcategories', id: i, op: 'harddelete' }); }, idE);
  await h.offline(false); await h.sync();
  expect(await page.evaluate(n => window.MockCloud.state.tables.subcategories.filter(r => r.name === n && !r.deleted_at).length, nameE), 'підкатегорію відтворено один раз').toBe(1);
  expect(await page.evaluate(n => SUBCATEGORIES.filter(c => c.name === n).length, nameE), 'дубля нема').toBe(1);
  // F. без зліпка
  const idF = h.ids[0];
  await page.evaluate(async i => { const a = SUBCATEGORIES.find(x => x.cloudId === i); delete a.serverBase; delete a.serverUpdatedAt; a.active = true; delete a.deactivatedVia; a.updatedAt = new Date().toISOString(); await saveSubcategoriesLocal(); await pushSubcategoriesPilot(); }, idF);
  expect((await h.srv(idF)).active).toBe(true);
  expect(await page.evaluate(i => !!SUBCATEGORIES.find(x => x.cloudId === i).serverBase, idF)).toBe(true);
  expect(await page.evaluate(() => conflictLog.length), 'карток і сповіщень нема').toBe(0);
  expect(h.errors).toEqual([]);
});

test('25. категорія, каскад видалення (підкатегорії, слова) на сервері проти моєї правки слова й типу: усе видалене лишається видаленим, моя зміна типу збережена; без карток', async ({ page }) => {
  const errors = []; page.on('pageerror', x => errors.push(String(x)));
  await page.goto('/index.html?fixture=typical');
  await page.waitForFunction(() => window.MockCloud && typeof cloudSession !== 'undefined' && cloudSession && cloudSession.user && document.querySelector('.tabbar-glass'));
  await page.waitForTimeout(2000);
  const info = await page.evaluate(() => {
    const cat = CATEGORIES.find(c => c.cloudId && c.active && DICTIONARY.some(d => d.cloudId && !d.deletedAt && d.cat === c.name && !d.sub));
    const w = DICTIONARY.find(d => d.cloudId && !d.deletedAt && d.cat === cat.name && !d.sub);
    const target = CATEGORIES.find(c => c.cloudId && c.active && c !== cat);
    return { cid: cat.cloudId, cname: cat.name, ctype: cat.type, wid: w.cloudId, target: target.name };
  });
  await page.waitForFunction(i => { const c = CATEGORIES.find(x => x.cloudId === i); return c && c.serverBase; }, info.cid);
  await page.waitForFunction(i => { const d = DICTIONARY.find(x => x.cloudId === i); return d && d.serverBase; }, info.wid);
  await page.evaluate(() => { window.__offline = true; });
  await page.evaluate(async ([cid, wid, target, nt]) => { // моє: тип категорії й призначення слова
    const c = CATEGORIES.find(x => x.cloudId === cid); c.type = nt; c.updatedAt = new Date().toISOString(); await saveCategoriesLocal();
    const d = DICTIONARY.find(x => x.cloudId === wid); d.cat = target; d.sub = null; d.updatedAt = new Date().toISOString(); await saveDictionaryLocal();
  }, [info.cid, info.wid, info.target, otherType(info.ctype)]);
  await page.evaluate(([cid]) => { // інший пристрій: каскад видалення категорії
    const ts = new Date().toISOString(), M = window.MockCloud;
    M.otherDevice({ table: 'categories', id: cid, op: 'update', patch: { active: false } });
    M.state.tables.subcategories.filter(r => r.category_id === cid && r.active).forEach(r => M.otherDevice({ table: 'subcategories', id: r.id, op: 'update', patch: { active: false, deactivated_via: 'category' } }));
    M.state.tables.dictionary.filter(r => r.category_id === cid && !r.deleted_at).forEach(r => M.otherDevice({ table: 'dictionary', id: r.id, op: 'update', patch: { deleted_at: ts, deleted_via: 'category' } }));
  }, [info.cid]);
  await page.evaluate(() => { window.__offline = false; window.dispatchEvent(new Event('online')); });
  await page.evaluate(async () => { await pushCategoriesPilot(); await pullCategoriesCore(); await pushSubcategoriesPilot(); await pullSubcategoriesCore(); await pushDictionaryPilot(); await pullDictionaryCore(); await pullDictionaryCore(); });
  const r = await page.evaluate(([cid, wid, nt]) => {
    const T = window.MockCloud.state.tables, sc = T.categories.find(x => x.id === cid), sw = T.dictionary.find(x => x.id === wid);
    const c = CATEGORIES.find(x => x.cloudId === cid), w = DICTIONARY.find(x => x.cloudId === wid);
    return { srvCat: [sc.active, sc.type], locCat: [c.active, c.type], srvWord: !!sw.deleted_at, locWord: !!w.deletedAt,
      subsLive: SUBCATEGORIES.filter(s => s.cloudId && s.active && T.subcategories.some(x => x.id === s.cloudId && x.category_id === cid)).length,
      cards: conflictLog.length, nt: nt };
  }, [info.cid, info.wid, otherType(info.ctype)]);
  expect(r.srvCat, 'категорія неактивна, мій тип збережений').toEqual([false, otherType(info.ctype)]); expect(r.locCat).toEqual([false, otherType(info.ctype)]);
  expect([r.srvWord, r.locWord], 'слово лишається видаленим').toEqual([true, true]);
  expect(r.subsLive, 'підкатегорії категорії неактивні').toBe(0);
  expect(r.cards, 'карток нема').toBe(0);
  expect(errors).toEqual([]);
});

// Rev 2.32.228 (B2): сервер сам змінює назву у витратах тригером; клієнт каскадує локально без штампу й push. Розкол X→Y / X→Z більше неможливий.
async function renameSetup(page){
  await page.goto('/index.html?fixture=typical');
  await page.waitForFunction(() => window.MockCloud && typeof cloudSession !== 'undefined' && cloudSession && cloudSession.user && document.querySelector('.tabbar-glass'));
  await page.waitForTimeout(2000);
  const errors = []; page.on('pageerror', x => errors.push(String(x)));
  const syncAll = () => page.evaluate(async () => { await pushCategoriesPilot(); await pullCategoriesCore(); await pushSubcategoriesPilot(); await pullSubcategoriesCore(); await pullExpensesCore(); await pullCategoriesCore(); await pullSubcategoriesCore(); });
  const offline = on => page.evaluate(v => { window.__offline = v; if(!v) window.dispatchEvent(new Event('online')); }, on);
  return { errors, syncAll, offline };
}
const nameCounts = (page, kind, ids) => page.evaluate(([k, ids]) => {
  const col = k === 'category' ? 'category' : 'subcategory', T = window.MockCloud.state.tables, count = list => { const m = {}; list.forEach(x => { m[x] = (m[x] || 0) + 1; }); return m; };
  const tbl = k === 'category' ? T.categories : T.subcategories, loc = k === 'category' ? CATEGORIES : SUBCATEGORIES;
  return { srv: tbl.find(x => x.id === ids).name, loc: loc.find(x => x.cloudId === ids).name,
    srvExp: count(T.expenses.filter(r => r[col + '_id'] === ids).map(r => r[col])), locExp: count(expenses.filter(e => !e.deletedAt && e[col] && (T.expenses.find(r => r.id === e.id) || {})[col + '_id'] === ids).map(e => e[col])) };
}, [kind, ids]);

for(const kind of ['category', 'subcategory']){
  test('26' + (kind === 'category' ? 'a' : 'b') + '. перейменування ' + (kind === 'category' ? 'категорії' : 'підкатегорії') + ' X→Y тут і X→Z на іншому пристрої: одна назва в записі й у всіх витратах, розколу нема', async ({ page }) => {
    const { errors, syncAll, offline } = await renameSetup(page);
    const info = await page.evaluate(k => {
      const isCat = k === 'category';
      if(!isCat){ // підкатегорія з витратами: прив'язуємо кілька витрат до першої підкатегорії через сервер (як це робить запис витрати з підкатегорією)
        const M = window.MockCloud, sub = SUBCATEGORIES.find(s => s.cloudId && s.active && M.state.tables.expenses.some(r => r.category === s.category));
        M.state.tables.expenses.filter(r => r.category === sub.category).slice(0, 4).forEach(r => M.otherDevice({ table: 'expenses', id: r.id, op: 'update', patch: { subcategory: sub.name } }));
        return { id: sub.cloudId, name: sub.name };
      }
      const cat = CATEGORIES.find(c => c.cloudId && c.active && expenses.filter(e => e.category === c.name && !e.deletedAt).length >= 2);
      return { id: cat.cloudId, name: cat.name };
    }, kind);
    await page.evaluate(async () => { await pullExpensesCore({ full: true }).catch(() => pullExpensesCore()); });
    await page.waitForFunction(([k, i]) => { const r = (k === 'category' ? CATEGORIES : SUBCATEGORIES).find(x => x.cloudId === i); return r && r.serverBase && r.serverName === r.name; }, [kind, info.id]);
    await offline(true);
    // цей пристрій: як editCategory/editSubcategory — локальний каскад без штампу, нова назва запису
    const locExpBefore = await page.evaluate(([k, nm]) => expenses.filter(e => e[k] === nm).map(e => e.updatedAt), [kind, info.name]);
    await page.evaluate(async ([k, i, old]) => {
      const rec = (k === 'category' ? CATEGORIES : SUBCATEGORIES).find(x => x.cloudId === i);
      await saveTaxonomyCascade(cascadeTaxonomyRename(k, old, 'Y-назва'));
      rec.name = 'Y-назва'; rec.updatedAt = new Date().toISOString();
      await (k === 'category' ? saveCategoriesLocal() : saveSubcategoriesLocal());
    }, [kind, info.id, info.name]);
    expect(await page.evaluate(([k]) => expenses.filter(e => e[k] === 'Y-назва').map(e => e.updatedAt), [kind]), 'локальний каскад не штампує updatedAt').toEqual(locExpBefore);
    // інший пристрій: X→Z (сервер сам перейменує витрати)
    await page.evaluate(([k, i]) => { window.MockCloud.otherDevice({ table: k === 'category' ? 'categories' : 'subcategories', id: i, op: 'update', patch: { name: 'Z-назва' } }); }, [kind, info.id]);
    await offline(false); await syncAll(); await syncAll();
    const r = await nameCounts(page, kind, info.id);
    expect(r.srv, 'одна назва на сервері й тут').toBe(r.loc);
    expect(Object.keys(r.srvExp), 'усі витрати на сервері з тією самою назвою').toEqual([r.srv]);
    expect(Object.keys(r.locExp), 'усі витрати тут з тією самою назвою').toEqual([r.srv]);
    expect(await page.evaluate(() => window.MockCloud.state.tables.expenses.filter(r => /^(Y|Z)-назва$/.test(r.category || '') && r.category_id == null).length), 'ідентифікатори витрат на місці').toBe(0);
    expect(errors, 'без помилок').toEqual([]);
  });
}

test('27. перейменування чужим пристроєм: pull категорії й підкатегорії каскадує локально (витрати, підкатегорії, слова) без запису на сервер і без нових міток версій', async ({ page }) => {
  const { errors, offline } = await renameSetup(page);
  const info = await page.evaluate(() => {
    const cat = CATEGORIES.find(c => c.cloudId && c.active && expenses.some(e => e.category === c.name) && SUBCATEGORIES.some(s => s.category === c.name) && DICTIONARY.some(d => !d.deletedAt && d.cat === c.name));
    return { id: cat.cloudId, name: cat.name, n: expenses.filter(e => e.category === cat.name).length };
  });
  await page.waitForFunction(i => { const c = CATEGORIES.find(x => x.cloudId === i); return c && c.serverBase; }, info.id);
  const stamps = await page.evaluate(n => expenses.filter(e => e.category === n).map(e => e.updatedAt), info.name);
  const w0 = await page.evaluate(() => window.MockCloud.state.log.filter(x => x.kind === 'rest' && x.method !== 'GET' && x.method !== 'HEAD').length);
  await page.evaluate(i => { window.MockCloud.otherDevice({ table: 'categories', id: i, op: 'update', patch: { name: 'Нова-назва' } }); }, info.id);
  await page.evaluate(async () => { await pullCategoriesCore(); }); // лише категорії: витрати не підтягуємо, каскад мусить спрацювати за cloudId
  const r = await page.evaluate(([n, i]) => ({ cat: CATEGORIES.find(c => c.cloudId === i).name, exp: expenses.filter(e => e.category === n).length, expNew: expenses.filter(e => e.category === 'Нова-назва').length,
    subs: SUBCATEGORIES.filter(s => s.category === n).length, subsNew: SUBCATEGORIES.filter(s => s.category === 'Нова-назва').length, words: DICTIONARY.filter(d => d.cat === n).length, wordsNew: DICTIONARY.filter(d => d.cat === 'Нова-назва').length,
    stamps: expenses.filter(e => e.category === 'Нова-назва').map(e => e.updatedAt) }), [info.name, info.id]);
  expect(r.cat).toBe('Нова-назва');
  expect([r.exp, r.subs, r.words], 'старої назви ніде нема').toEqual([0, 0, 0]);
  expect(r.expNew).toBe(info.n); expect(r.subsNew).toBeGreaterThan(0); expect(r.wordsNew).toBeGreaterThan(0);
  expect(r.stamps, 'мітки версій витрат не змінились').toEqual(stamps);
  expect(await page.evaluate(() => window.MockCloud.state.log.filter(x => x.kind === 'rest' && x.method !== 'GET' && x.method !== 'HEAD').length), 'жодного запису на сервер').toBe(w0);
  // потім звичайний pull витрат: нічого не ламає, назва та сама
  await page.evaluate(async () => { await pullExpensesCore(); });
  expect(await page.evaluate(() => expenses.filter(e => e.category === 'Нова-назва').length)).toBe(info.n);
  expect(errors).toEqual([]);
});

// Rev 2.32.229: сервер після B2 (мок відтворює taxonomy_aliases, резолвер за псевдонімом, запізніле зв'язування). Тут клієнт лише приймає результат pull.
test('28a. витрата зі старою назвою категорії, надіслана після перейменування, отримує id і нову назву (немає «сироти»)', async ({ page }) => {
  const { errors } = await renameSetup(page);
  const info = await page.evaluate(() => { const c = CATEGORIES.find(x => x.cloudId && x.active && expenses.some(e => e.category === x.name)); return { id: c.cloudId, old: c.name }; });
  await page.evaluate(i => { window.MockCloud.otherDevice({ table: 'categories', id: i, op: 'update', patch: { name: 'Нова-псевдонім' } }); }, info.id);
  const expId = await page.evaluate(o => { const T = window.MockCloud.state.tables; return window.MockCloud.otherDevice({ table: 'expenses', op: 'insert', row: { id: 'e2e-alias-1', amount: 77, expense_date: localDateISO(), category: o, category_id: null, subcategory: null, subcategory_id: null, note: 'Зі старою назвою', linked_installment_id: null, source: null, external_id: null, created_by: T.categories[0].created_by, updated_by: T.categories[0].created_by } }).id; }, info.old);
  const srv = await page.evaluate(([i, c]) => { const e = window.MockCloud.state.tables.expenses.find(x => x.id === i); return { cat: e.category, cid: e.category_id, target: c }; }, [expId, info.id]);
  expect(srv.cid, 'id за псевдонімом').toBe(info.id); expect(srv.cat, 'сучасна назва').toBe('Нова-псевдонім');
  await page.evaluate(async () => { await pullCategoriesCore(); await pullExpensesCore(); });
  const loc = await page.evaluate(() => { const e = expenses.find(x => x.note === 'Зі старою назвою' || x.cloudId === 'e2e-alias-1' || x.id === 'e2e-alias-1'); return e ? e.category : null; });
  expect(loc, 'локально теж нова назва').toBe('Нова-псевдонім');
  expect(await page.evaluate(() => CATEGORIES.some(c => c.name === 'Нова-псевдонім')), 'категорія перейменована й локально').toBe(true);
  expect(errors).toEqual([]);
});

test('28b. витрата з назвою категорії, якої ще немає, після створення категорії отримує id (запізніле зв\'язування)', async ({ page }) => {
  const { errors } = await renameSetup(page);
  await page.evaluate(() => { const T = window.MockCloud.state.tables; window.MockCloud.otherDevice({ table: 'expenses', op: 'insert', row: { id: 'e2e-late-1', amount: 55, expense_date: localDateISO(), category: 'Ще-не-існує', category_id: null, subcategory: null, subcategory_id: null, note: 'Сирота', linked_installment_id: null, source: null, external_id: null, created_by: T.categories[0].created_by, updated_by: T.categories[0].created_by } }); });
  expect(await page.evaluate(() => window.MockCloud.state.tables.expenses.find(x => x.id === 'e2e-late-1').category_id), 'поки категорії немає — id порожній').toBeNull();
  await page.evaluate(() => { const T = window.MockCloud.state.tables; window.MockCloud.otherDevice({ table: 'categories', op: 'insert', row: { id: 'e2e-late-cat', name: 'Ще-не-існує', active: true, type: 'Гнучка', created_by: T.categories[0].created_by, updated_by: T.categories[0].created_by } }); });
  expect(await page.evaluate(() => window.MockCloud.state.tables.expenses.find(x => x.id === 'e2e-late-1').category_id), 'після створення категорії id проставлено').toBe('e2e-late-cat');
  expect(errors).toEqual([]);
});

// Rev 2.32.230 (SERVER-DEL): штамп видалення ставить сервер (мок відтворює trg_deleted_at_server); годинник сервера у тесті випереджає годинник пристрою на добу.
test('29. серверний deleted_at: штамп з відповіді сервера (не з годинника пристрою ±1 доба), без хибної «чужої зміни»; повторне видалення лишає перший час; повернення з «Видалених даних»; видалення на іншому пристрої зникає тут', async ({ page }) => {
  const { errors } = await renameSetup(page);
  const DAY = 86400000;
  await page.evaluate(d => { window.MockCloud.state.clock = () => new Date(Date.now() + d).toISOString(); }, DAY);
  const id = await page.evaluate(() => { const e = expenses.find(x => !x.deletedAt && x.serverBase && x.serverUpdatedAt); return e && e.id; });
  expect(id, 'є синхронізована витрата зі зліпком').toBeTruthy();
  const srv = i => page.evaluate(i => { const r = window.MockCloud.state.tables.expenses.find(x => x.id === i); return r && r.deleted_at; }, i);
  // 1. видалення на цьому пристрої (як deleteRecord, але push без завершального pull — перевіряємо саме відповідь push): штамп = серверний (на добу попереду), а не локальний
  const t0 = Date.now();
  await page.evaluate(async i => { const e = expenses.find(x => x.id === i); const n = new Date().toISOString(); e.deletedAt = n; e.updatedAt = n; await saveExpenses(); await pushExpenseRecordPilot(e, { suppressPull: true }); }, id);
  const s1 = await srv(id);
  expect(Date.parse(s1) - t0, 'штамп поставив сервер (попереду на добу)').toBeGreaterThan(DAY - 60000);
  expect(await page.evaluate(i => { const e = expenses.find(x => x.id === i); return [Date.parse(e.deletedAt), e.serverBase && e.serverBase.deletedAt ? Date.parse(e.serverBase.deletedAt) : null]; }, id), 'запис і зліпок несуть серверний штамп одразу після push').toEqual([Date.parse(s1), Date.parse(s1)]);
  const before = await page.evaluate(i => { const e = expenses.find(x => x.id === i); return JSON.stringify([e.deletedAt, e.localRev, e.syncedRev, e.serverBase && e.serverBase.deletedAt]); }, id);
  await page.evaluate(async () => { await pullExpensesCore(); });
  const after = await page.evaluate(i => { const e = expenses.find(x => x.id === i); return JSON.stringify([e.deletedAt, e.localRev, e.syncedRev, e.serverBase && e.serverBase.deletedAt]); }, id);
  expect(after, 'pull не бачить хибної чужої зміни штампа').toBe(before);
  expect(await page.evaluate(i => { const e = expenses.find(x => x.id === i); return e.localRev === e.syncedRev; }, id), 'запис не «брудний»').toBe(true);
  // 2. повторне видалення (інший пристрій шле інший час) лишає перший
  await page.evaluate(i => { window.MockCloud.otherDevice({ table: 'expenses', id: i, op: 'update', patch: { deleted_at: '2030-01-01T00:00:00.000Z' } }); }, id);
  expect(await srv(id), 'перший час збережено').toBe(s1);
  // 3. повернення з «Видалених даних»
  await page.evaluate(async i => { await restoreTrashRecord('expense', i); }, id);
  await expect.poll(() => srv(id), { timeout: 10000 }).toBeNull();
  expect(await page.evaluate(i => !expenses.find(x => x.id === i).deletedAt, id), 'локально повернено').toBe(true);
  // 4. видалення на іншому пристрої: тут запис зникає, штамп серверний, жодного push назад
  const other = await page.evaluate(i => { const e = expenses.find(x => !x.deletedAt && x.id !== i && x.serverBase); return e && e.id; }, id);
  const w0 = await page.evaluate(() => window.MockCloud.state.log.filter(x => x.kind === 'rest' && x.method !== 'GET' && x.method !== 'HEAD').length);
  await page.evaluate(i => { window.MockCloud.otherDevice({ table: 'expenses', id: i, op: 'update', patch: { deleted_at: new Date(Date.now() - 86400000).toISOString() } }); }, other);
  await page.evaluate(async () => { await pullExpensesCore(); });
  const r = await page.evaluate(i => { const e = expenses.find(x => x.id === i); return { gone: !!e.deletedAt, same: Date.parse(e.deletedAt) === Date.parse(window.MockCloud.state.tables.expenses.find(x => x.id === i).deleted_at) }; }, other);
  expect(r.gone && r.same, 'на цьому пристрої запис видалений із серверним штампом').toBe(true);
  expect(await page.evaluate(() => window.MockCloud.state.log.filter(x => x.kind === 'rest' && x.method !== 'GET' && x.method !== 'HEAD').length), 'push назад немає').toBe(w0);
  expect(errors).toEqual([]);
});

// Rev 2.32.232 (RESTORE-MERGE): відновлення з копії = звичайні правки через спільне злиття; видалене на сервері лишається видаленим. Годинник сервера на добу попереду, час у копії ігнорується.
async function restoreSetup(page){
  const errors = await boot(page, 'typical'); // boot вмикає офлайн-прапорець мока (window.__offline)
  await page.waitForTimeout(1500);
  const s = { errors, offline: on => page.evaluate(v => { window.__offline = v; if(!v) window.dispatchEvent(new Event('online')); }, on) };
  await page.evaluate(() => { window.MockCloud.state.clock = () => new Date(Date.now() + 86400000).toISOString(); });
  await page.waitForFunction(() => expenses.filter(e => !e.deletedAt && e.serverBase && e.serverUpdatedAt).length >= 4);
  return s;
}
const wCount = page => page.evaluate(() => window.MockCloud.state.log.filter(x => x.kind === 'rest' && x.method !== 'GET' && x.method !== 'HEAD').length);
const backupOf = (page, mut) => page.evaluate(m => { const d = buildBackupPayloadData(); const list = JSON.parse(d[LS_KEY_EXP]); new Function('list', m)(list); d[LS_KEY_EXP] = JSON.stringify(list); return d; }, mut || '');

test('30a. відновлення: значення з копії (старіша і новіша за годинником) стають правками і доходять до сервера; записи без змін не пишуться; порожнє відновлення не пише нічого', async ({ page }) => {
  const { errors } = await restoreSetup(page);
  const ids = await page.evaluate(() => expenses.filter(e => !e.deletedAt && e.serverBase && e.serverUpdatedAt).slice(0, 2).map(e => e.id));
  const orig = await page.evaluate(i => i.map(x => expenses.find(e => e.id === x).amount), ids);
  // копія: перший запис — «старша» мітка часу, другий — «з майбутнього»; суми змінені
  const data = await backupOf(page, "list.forEach(r => { if(r.id === '" + ids[0] + "'){ r.amount = 111; r.updatedAt = '2000-01-01T00:00:00.000Z'; } if(r.id === '" + ids[1] + "'){ r.amount = 222; r.updatedAt = '2099-01-01T00:00:00.000Z'; } });");
  const w0 = await wCount(page);
  const res = await page.evaluate(async d => { await applyBackupData(d); return lastRestoreSummary; }, data);
  expect(res.total, 'відновлено два записи').toBe(2); expect(res.serverNewer).toBe(0);
  const srv = await page.evaluate(i => i.map(x => window.MockCloud.state.tables.expenses.find(e => e.id === x).amount), ids);
  expect(srv, 'на сервері значення з копії, незалежно від часу в копії').toEqual([111, 222]);
  expect(await page.evaluate(i => i.map(x => expenses.find(e => e.id === x).amount), ids)).toEqual([111, 222]);
  expect(orig).not.toEqual([111, 222]);
  expect((await wCount(page)) - w0, 'записано лише два змінені записи').toBeLessThanOrEqual(4);
  // те саме відновлення вдруге і порожнє: змін немає, записів на сервер немає
  const w1 = await wCount(page);
  const again = await page.evaluate(async d => { await applyBackupData(d); return lastRestoreSummary; }, data);
  expect(again.total).toBe(0); expect(await wCount(page), 'повторне відновлення нічого не пише').toBe(w1);
  const empty = await page.evaluate(async () => { const d = buildBackupPayloadData(); d[LS_KEY_EXP] = '[]'; d[LS_KEY_INC] = '[]'; d[LS_KEY_DEBT] = '[]'; await applyBackupData(d); return { s: lastRestoreSummary, n: expenses.length }; });
  expect(empty.s.total, 'порожня копія не змінює записів').toBe(0); expect(empty.n).toBeGreaterThan(3);
  expect(errors).toEqual([]);
});

test('30b. змагання під час відновлення: сервер змінив те саме поле між зліпком і відправкою — переможе сервер, значення з копії в журналі конфліктів, у підсумку лічильник; інше поле з копії застосоване', async ({ page }) => {
  const { errors } = await restoreSetup(page);
  const id = await page.evaluate(() => expenses.find(e => !e.deletedAt && e.serverBase && e.serverUpdatedAt).id);
  const data = await backupOf(page, "list.forEach(r => { if(r.id === '" + id + "'){ r.amount = 555; r.name = 'Назва з копії'; } });");
  // чужа правка тієї ж суми трапляється саме перед нашим умовним update (зліпок уже застарів)
  await page.evaluate(i => { const orig = window.MockCloud.fetch; let done = false; window.MockCloud.fetch = function(){ const a = arguments; const url = String(typeof a[0] === 'string' ? a[0] : (a[0] && a[0].url) || ''); const m = String((a[1] && a[1].method) || (a[0] && a[0].method) || 'GET'); if(!done && m === 'PATCH' && /\/rest\/v1\/expenses/.test(url)){ done = true; window.MockCloud.otherDevice({ table: 'expenses', id: i, op: 'update', patch: { amount: 777 } }); } return orig.apply(this, a); }; }, id);
  const sm = await page.evaluate(async d => { await applyBackupData(d); return lastRestoreSummary; }, data);
  const r = await page.evaluate(i => { const s = window.MockCloud.state.tables.expenses.find(e => e.id === i), l = expenses.find(e => e.id === i); return { srvAmount: s.amount, srvName: s.note, locAmount: l.amount, locName: l.name, journal: conflictLog.filter(c => c.field === 'amount' && c.mine === 555).length, cards: conflictAnnounce.length }; }, id);
  expect(r.srvAmount, 'сервер переміг для поля, яке змінив він').toBe(777); expect(r.locAmount).toBe(777);
  expect(r.srvName, 'інше поле з копії дійшло до сервера').toBe('Назва з копії'); expect(r.locName).toBe('Назва з копії');
  expect(r.journal, 'значення з копії збережено в журналі конфліктів').toBeGreaterThanOrEqual(1);
  expect(r.cards, 'карток конфліктів немає').toBe(0);
  expect(sm.serverNewer, 'у підсумку: один запис, де сервер новіший').toBe(1);
  expect(errors).toEqual([]);
});

test('30c. запис, видалений на сервері, лишається видаленим; відсутній локально й на сервері — повертається', async ({ page }) => {
  const { errors } = await restoreSetup(page);
  const [gone, lost] = await page.evaluate(() => expenses.filter(e => !e.deletedAt && e.serverBase && e.serverUpdatedAt).slice(2, 4).map(e => e.id));
  const data = await backupOf(page);
  // gone: на сервері надгробок, локально запису нема (пристрій ще не бачив видалення)
  await page.evaluate(i => { const k = expenses.findIndex(e => e.id === i); expenses.splice(k, 1); window.MockCloud.state.tables.expenses.find(e => e.id === i).deleted_at = new Date().toISOString(); }, gone);
  // lost: нема ні локально, ні на сервері (очищено)
  await page.evaluate(i => { const k = expenses.findIndex(e => e.id === i); expenses.splice(k, 1); const t = window.MockCloud.state.tables.expenses; t.splice(t.findIndex(e => e.id === i), 1); }, lost);
  const sm = await page.evaluate(async d => { await applyBackupData(d); return lastRestoreSummary; }, data);
  expect(sm.stayedDeleted, 'один запис лишився видаленим').toBe(1);
  const st = await page.evaluate(([g, l]) => ({ goneLive: expenses.some(e => e.id === g && !e.deletedAt), goneSrv: window.MockCloud.state.tables.expenses.find(e => e.id === g).deleted_at, lostLocal: expenses.some(e => e.id === l && !e.deletedAt), lostSrv: window.MockCloud.state.tables.expenses.some(e => e.id === l && !e.deleted_at), srvHas: window.MockCloud.state.tables.expenses.some(e => e.id === l), log: window.MockCloud.state.log.filter(x => x.kind === 'rest' && x.method !== 'GET').slice(-6).map(x => JSON.stringify(x).slice(0, 200)) }), [gone, lost]);
  expect(st.goneLive, 'видалений на сервері не воскрес локально').toBe(false); expect(st.goneSrv, 'надгробок на сервері лишився').toBeTruthy();
  expect(st.lostLocal && st.lostSrv, 'відсутній повернувся локально й на сервері ' + JSON.stringify(st)).toBe(true);
  expect(errors).toEqual([]);
});

// Rev 2.32.233: порожній журнал не кидає ReferenceError (renderRecords передавав у setJournalListHtml неіснуючу змінну keepIfSame).
test('31. порожній журнал: місяць без записів і пошук без результатів — помилок сторінки немає, показується порожній стан', async ({ page }) => {
  const errors = await boot(page, 'empty');
  await page.waitForTimeout(800);
  await page.evaluate(() => { switchTab('vytraty'); renderAll(); });
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => !!document.querySelector('#journal-list .empty-state, #records-list .empty-state, .empty-state')), 'порожній стан у «Витрати»').toBe(true);
  const consoleErrors = [];
  page.on('console', m => { if(m.type() === 'error' || /Помилка в/.test(m.text())) consoleErrors.push(m.text()); });
  await page.evaluate(() => { renderRecords(); });
  // повний журнал з активним пошуком без результатів
  await page.evaluate(() => { openJournal(); });
  await page.waitForTimeout(500);
  await page.evaluate(() => { const i = document.getElementById('journal-search-input'); i.value = 'zzzневідомо'; onJournalSearchChange(); });
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => !!document.querySelector('#journal-list .empty-state, #journal-list')), 'журнал відрендерився').toBe(true);
  expect(consoleErrors.filter(t => /keepIfSame|ReferenceError/.test(t)), 'у консолі немає ReferenceError').toEqual([]);
  expect(errors).toEqual([]);
});
