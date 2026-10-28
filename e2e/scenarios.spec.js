// E2E-1: вісім основних сценаріїв у WebKit (iPhone 390×844) на моку Cloud. Світла тема — лише сценарії з @both. Без перевірки пікселів; знімки лише при падінні.
// «Другий пристрій» — MockCloud.otherDevice (зміна стану сервера, як справжній Realtime); мережа емулюється прапорцем window.__offline у MockCloud.fetch (у моку запити не йдуть у мережу).
const { test, expect, devices } = require('@playwright/test');

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

