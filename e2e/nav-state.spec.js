// NAV-STATE (Rev 2.32.429): шторки відкриваються з початку вмісту; перехід між вкладками зберігає прокручування й розгорнуті картки; повторний тап по активній вкладці згортає картки цієї вкладки й прокручує на початок. Мок; дані вигадані.
const { test, expect } = require('@playwright/test');

async function boot(page){
  await page.goto('/index.html?fixture=typical');
  await page.waitForFunction(() => window.MockCloud && typeof cloudSession !== 'undefined' && cloudSession && cloudSession.user && document.querySelector('.tabbar-glass'));
  await page.waitForTimeout(1500);
}
const DRAWERS = ['bal-sheet-debt', 'bal-sheet-inst', 'bal-sheet-cats', 'card-debt-drawer', 'installment-drawer', 'income-drawer', 'mono-detail-drawer', 'pay-action-drawer', 'struct-drawer', 'settings-drawer'];

test('1. кожна детальна шторка: відкрити, прокрутити вниз, закрити, відкрити знову → прокручування 0 (клас open — той самий сигнал, що в усіх відкривачах)', async ({ page }) => {
  await boot(page);
  for (const id of DRAWERS) {
    const r = await page.evaluate(async (did) => {
      const d = document.getElementById(did); if (!d) return { id: did, missing: true };
      const spacer = document.createElement('div'); spacer.style.cssText = 'height:3000px'; spacer.setAttribute('data-test-spacer', '1'); d.appendChild(spacer);
      d.classList.add('open'); await new Promise(r => setTimeout(r, 60));
      d.scrollTop = 500; const scrolled = d.scrollTop;
      d.classList.remove('open'); await new Promise(r => setTimeout(r, 60));
      d.classList.add('open');
      const atOpen = d.scrollTop; // одразу після додавання класу (мікрозавдання спостерігача ще не виконались? перевіряємо після await)
      await Promise.resolve();
      const afterMicro = d.scrollTop;
      d.classList.remove('open'); spacer.remove();
      return { id: did, scrolled, atOpen, afterMicro };
    }, id);
    expect(r.missing, id + ': шторки нема').toBeFalsy();
    expect(r.scrolled, id + ': шторка прокручується (перед закриттям було > 0)').toBeGreaterThan(0);
    expect(r.afterMicro, id + ': після повторного відкриття прокручування 0').toBe(0);
  }
});

test('2. справжні відкривачі: «Борги по картках», «Оплати частинами», налаштування — повторне відкриття з початку; форма з чернеткою: значення лишається', async ({ page }) => {
  await boot(page);
  for (const [open, close, id] of [['openDebtSheet()', 'closeDebtSheet()', 'bal-sheet-debt'], ['openInstSheet()', 'closeInstSheet()', 'bal-sheet-inst'], ['openSettings()', 'closeSettings()', 'settings-drawer']]) {
    const r = await page.evaluate(async ([o, c, did]) => {
      const d = document.getElementById(did), w = (ms) => new Promise(r => setTimeout(r, ms));
      eval(o); await w(500);
      const sp = document.createElement('div'); sp.style.cssText = 'height:3000px'; d.appendChild(sp);
      d.scrollTop = 400; const first = d.scrollTop;
      eval(c); await w(500);
      eval(o); await w(100);
      const again = d.scrollTop; sp.remove(); eval(c); await w(400);
      return { first, again };
    }, [open, close, id]);
    expect(r.first, id).toBeGreaterThan(0); expect(r.again, id + ': з початку').toBe(0);
  }
  // форма з чернеткою: поле, значення, прокрутка → закрити без збереження класом → відкрити: значення лишилось, прокручування 0
  const r = await page.evaluate(async () => {
    const d = document.getElementById('card-debt-drawer'), w = (ms) => new Promise(r => setTimeout(r, ms));
    d.classList.add('open'); await w(80);
    const inp = d.querySelector('input[type="text"], input:not([type])'); if (inp) inp.value = '777';
    const sp = document.createElement('div'); sp.style.cssText = 'height:3000px'; d.appendChild(sp); d.scrollTop = 300;
    d.classList.remove('open'); await w(80); d.classList.add('open'); await Promise.resolve();
    const out = { top: d.scrollTop, value: inp ? inp.value : null }; d.classList.remove('open'); sp.remove(); return out;
  });
  expect(r.top).toBe(0); expect(r.value).toBe('777');
});

test('3. вкладки: «Сімейний баланс» розгорнуто, прокручено → інша вкладка → назад: розгорнуто й на тому ж місці', async ({ page }) => {
  await boot(page);
  await page.evaluate(async () => { switchTab('analytics'); await new Promise(r => setTimeout(r, 600)); toggleBalanceCard(); await new Promise(r => setTimeout(r, 700)); });
  const maxScroll = await page.evaluate(() => { const m = document.getElementById('main-col'); return m.scrollHeight - m.clientHeight; });
  expect(maxScroll).toBeGreaterThan(200);
  const y0 = await page.evaluate(async () => { const m = document.getElementById('main-col'); m.scrollTop = 220; await new Promise(r => setTimeout(r, 200)); return m.scrollTop; });
  expect(y0).toBeGreaterThan(100);
  await page.evaluate(async () => { switchTab('service', { noFocus: true }); await new Promise(r => setTimeout(r, 700)); switchTab('analytics', { noFocus: true }); await new Promise(r => setTimeout(r, 900)); });
  const back = await page.evaluate(() => ({ open: document.getElementById('bal-card').classList.contains('open'), flag: balOpen, y: document.getElementById('main-col').scrollTop }));
  expect(back.open).toBe(true); expect(back.flag).toBe(true);
  expect(Math.abs(back.y - y0), 'прокручування збережено').toBeLessThanOrEqual(2);
});

test('4. повторний тап по активній вкладці: картки згорнуто, на початку; уже на початку без розгорнутого — нічого', async ({ page }) => {
  await boot(page);
  await page.evaluate(async () => { switchTab('analytics'); await new Promise(r => setTimeout(r, 600)); toggleBalanceCard(); await new Promise(r => setTimeout(r, 700)); document.getElementById('main-col').scrollTop = 220; await new Promise(r => setTimeout(r, 200)); });
  expect(await page.evaluate(() => document.getElementById('main-col').scrollTop)).toBeGreaterThan(100);
  await page.tap('.tabbar button[data-tab="analytics"]');
  await page.waitForFunction(() => document.getElementById('main-col').scrollTop === 0 && !balOpen, null, { timeout: 4000 });
  const s = await page.evaluate(() => ({ open: document.getElementById('bal-card').classList.contains('open'), exp: document.getElementById('bal-toggle').getAttribute('aria-expanded'), y: document.getElementById('main-col').scrollTop }));
  expect(s.open).toBe(false); expect(s.exp).toBe('false'); expect(s.y).toBe(0);
  // другий тап: нічого не відбувається (стан без змін, помилок нема)
  const errors = []; page.on('pageerror', e => errors.push(String(e)));
  await page.tap('.tabbar button[data-tab="analytics"]'); await page.waitForTimeout(500);
  expect(await page.evaluate(() => ({ open: balOpen, y: document.getElementById('main-col').scrollTop }))).toEqual({ open: false, y: 0 });
  expect(errors).toEqual([]);
});

test('5. повторний тап по вкладці при «зменшити рух»: прокручування миттєве', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await boot(page);
  await page.evaluate(async () => { switchTab('analytics'); await new Promise(r => setTimeout(r, 600)); document.getElementById('main-col').scrollTop = 220; await new Promise(r => setTimeout(r, 200)); });
  await page.evaluate(() => { window.__steps = []; const m = document.getElementById('main-col'); m.addEventListener('scroll', () => window.__steps.push(m.scrollTop)); });
  await page.tap('.tabbar button[data-tab="analytics"]');
  await page.waitForFunction(() => document.getElementById('main-col').scrollTop === 0, null, { timeout: 2000 });
  const steps = await page.evaluate(() => window.__steps);
  expect(steps.length, 'жодних проміжних кроків: прокручування одним стрибком').toBeLessThanOrEqual(2);
});

test('6. цільові відкриття: «Деталізація витрат» з вибраною категорією відкривається з видимим рядком (не з початку), а без вибору — з початку', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 520 });
  await boot(page);
  await page.evaluate(async () => { switchTab('analytics'); await new Promise(r => setTimeout(r, 800)); });
  const keys = await page.evaluate(async () => { openCatsSheet(); await new Promise(r => setTimeout(r, 500)); const k = Array.from(document.querySelectorAll('#bal-call .bal-crow')).map(x => x.dataset.k); closeCatsSheet(); await new Promise(r => setTimeout(r, 500)); return k; });
  expect(keys.length).toBeGreaterThan(3);
  const last = keys[keys.length - 1];
  const r = await page.evaluate(async (k) => {
    openCatsSheet(k, 'cat'); await new Promise(r => setTimeout(r, 700));
    const d = document.getElementById('bal-sheet-cats'), row = document.querySelector('#bal-call .bal-crow.on'), dr = d.getBoundingClientRect(), rr = row ? row.getBoundingClientRect() : null;
    const out = { scroll: d.scrollTop, overflow: d.scrollHeight > d.clientHeight, visible: !!rr && rr.top >= dr.top - 1 && rr.bottom <= dr.bottom + 1 };
    closeCatsSheet(); await new Promise(r => setTimeout(r, 500));
    openCatsSheet(); await new Promise(r => setTimeout(r, 300)); out.plainScroll = d.scrollTop; closeCatsSheet();
    return out;
  }, last);
  expect(r.overflow, 'список довший за шторку (тест значущий)').toBe(true);
  expect(r.visible, 'вибраний рядок у видимій області шторки').toBe(true);
  expect(r.scroll).toBeGreaterThan(0);
  expect(r.plainScroll, 'без вибору — з початку').toBe(0);
});

test('7. цільове відкриття «Платежів» на дні (FIX-1119 п.4): екран не є .drawer; рядок дня у видимій області після відкриття', async ({ page }) => {
  const { installClock } = require('./clock');
  await installClock(page); await page.setViewportSize({ width: 390, height: 520 });
  await boot(page);
  const r = await page.evaluate(async () => {
    const today = kyivTodayISO(), cur = today.slice(0, 7), nxt = ppNextMonth(cur);
    installmentAccounts = Array.from({ length: 14 }, (_, i) => ({ name: 'Тест ОЧ ' + (i + 1), dueDay: 1 + i * 2, initialAmount: 20000, termMonths: 10, payment: 1000 + i * 100, startDate: '2025-01-01', firstPayment: 'same_day', payMode: 'manual' }));
    bankAccounts = []; debts = [];
    installmentAccounts.forEach((a, i) => [cur, nxt].forEach(mo => debts.push({ kind: 'installment', name: a.name, month: mo, balance: 15000 - i * 500, monthlyPayment: 1000 + i * 100 })));
    switchTab('analytics'); renderAll();
    openPaymentsScreen(null); await new Promise(r => setTimeout(r, 500));
    const lines = Array.from(document.querySelectorAll('#payments-screen .pay-line[data-date]')), target = lines[lines.length - 1];
    const date = target ? target.getAttribute('data-date') : null;
    closePaymentsScreen(); await new Promise(r => setTimeout(r, 500));
    openPaymentsScreen(date); await new Promise(r => setTimeout(r, 700));
    const sc = document.getElementById('payments-screen'), line = sc.querySelector('.pay-line[data-date="' + date + '"]'), sr = sc.getBoundingClientRect(), lr = line ? line.getBoundingClientRect() : null;
    return { date, isDrawer: sc.classList.contains('drawer'), scroll: sc.scrollTop, visible: !!lr && lr.top >= sr.top - 1 && lr.bottom <= sr.bottom + 1, lines: lines.length };
  });
  expect(r.isDrawer).toBe(false);
  expect(r.lines).toBeGreaterThan(3);
  expect(r.visible, 'рядок дня ' + r.date + ' у видимій області').toBe(true);
});

test('8. екрани, куди ведуть маршрути сповіщень (журнал, «Вхідні», Monobank, архів, «Платежі»), не є .drawer: скидання прокручування шторок їх не торкається; усі шторки зі списку — .drawer', async ({ page }) => {
  await boot(page);
  const r = await page.evaluate(() => ['journal-overlay', 'mono-inbox-screen', 'mono-screen', 'notif-archive-screen', 'payments-screen'].map(id => [id, document.getElementById(id).classList.contains('drawer')]));
  r.forEach(([id, isDrawer]) => expect(isDrawer, id).toBe(false));
});

// NAV-STATE-2: повноекранні екрани (.mono-screen, журнал) при новому відкритті — з початку; «назад» з вкладеного екрана лишає попередній на місці
const SCREENS = [
  ['Платежі', 'payments-screen', () => openPaymentsScreen(null), () => closePaymentsScreen()],
  ['Вхідні', 'mono-inbox-screen', () => openMonoInbox({ tab: 'new' }), () => closeMonoInbox()],
  ['Monobank', 'mono-screen', () => openMonoScreen(), () => closeMonoScreen()],
  ['Архів сповіщень', 'notif-archive-screen', () => openNotifArchive(), () => closeNotifArchive()],
];
for (const [name, id, open, close] of SCREENS) {
  test('9. ' + name + ': відкрити → прокрутити → закрити → відкрити знову → 0', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 600 });
    await boot(page);
    const r = await page.evaluate(async ([sid, o, c]) => {
      const w = (ms) => new Promise(r => setTimeout(r, ms)), sc = document.getElementById(sid);
      eval('(' + o + ')()'); await w(700);
      const sp = document.createElement('div'); sp.style.cssText = 'height:3000px'; sc.appendChild(sp);
      sc.scrollTop = 600; const first = sc.scrollTop;
      eval('(' + c + ')()'); await w(600);
      eval('(' + o + ')()'); await w(500);
      const again = sc.scrollTop; sp.remove(); eval('(' + c + ')()'); await w(400);
      return { first, again };
    }, [id, open.toString(), close.toString()]);
    expect(r.first, name + ': прокручувалось').toBeGreaterThan(0);
    expect(r.again, name + ': з початку').toBe(0);
  });
}
test('9. журнал: відкрити → прокрутити → закрити → відкрити знову → 0', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 600 });
  await boot(page);
  const r = await page.evaluate(async () => {
    const w = (ms) => new Promise(r => setTimeout(r, ms)), pos = () => Math.max(document.getElementById('main-col').scrollTop, document.getElementById('journal-overlay').scrollTop);
    switchTab('vytraty', { noFocus: true }); await w(600); openJournal(); await w(800);
    const ov = document.getElementById('journal-overlay'), mc = document.getElementById('main-col');
    const sp = document.createElement('div'); sp.style.cssText = 'height:3000px'; ov.appendChild(sp);
    ov.scrollTop = 500; mc.scrollTop = 500; const first = pos();
    closeJournal(); await w(600); openJournal(); await w(600);
    const again = pos(); sp.remove(); closeJournal();
    return { first, again };
  });
  expect(r.first).toBeGreaterThan(0); expect(r.again).toBe(0);
});
test('10. «Назад» з «Вхідних» у Monobank: екран Monobank лишається на місці (скидання лише при новому відкритті)', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 600 });
  await boot(page);
  const r = await page.evaluate(async () => {
    const w = (ms) => new Promise(r => setTimeout(r, ms)), sc = document.getElementById('mono-screen');
    openMonoScreen(); await w(700);
    const sp = document.createElement('div'); sp.style.cssText = 'height:3000px'; sc.appendChild(sp); sc.scrollTop = 400; const before = sc.scrollTop;
    const row = document.querySelector('#mono-body [data-mono-action="inbox"]');
    if (row) row.click(); else openMonoInbox({ tab: 'new' });
    await w(700);
    const inboxOpen = isMonoInboxOpen;
    closeMonoInbox(); await w(700);
    const after = sc.scrollTop, stillOpen = isMonoOpen; sp.remove(); closeMonoScreen();
    return { before, after, inboxOpen, stillOpen };
  });
  expect(r.before).toBeGreaterThan(0);
  expect(r.inboxOpen).toBe(true);
  console.log('NAV2-BACK ' + JSON.stringify(r));
  expect(r.stillOpen).toBe(true);
  expect(r.after, 'Monobank на тому ж місці після «назад»').toBe(r.before);
});
