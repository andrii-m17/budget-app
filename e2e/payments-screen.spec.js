// DS-PAYLIST Rev 1: екран «Платежі» (вигляд): плитки, «Чекає внесення», групи за днями, «Пізніше» (розгортання місяця), дотик рядка → наявна шторка дії → наявна форма витрати. Синтетичні дані; прогін E2E_DAY=1|15|31.
const { test, expect } = require('@playwright/test');
const { installClock } = require('./clock');
async function openScreen(page){
  await installClock(page);
  await page.goto('/index.html?fixture=typical');
  await page.waitForFunction(() => window.MockCloud && typeof cloudSession !== 'undefined' && cloudSession && cloudSession.user && document.querySelector('.tabbar-glass'));
  await page.waitForFunction(() => !document.querySelector('.avatar-status-dot.syncing'), null, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1500); // пул мока завершено до підстановки даних
  await page.evaluate(() => {
    const today = kyivTodayISO(), cur = today.slice(0, 7), nxt = ppNextMonth(cur);
    const days = [3, 9, 17, 18, 25];
    installmentAccounts = days.map((d, i) => ({ name: 'Тест ОЧ ' + (i + 1), dueDay: d, initialAmount: 20000, termMonths: 10, payment: 1000 + i * 100, startDate: '2025-01-01', firstPayment: 'same_day', payMode: 'manual' }));
    bankAccounts = [];
    debts = [];
    installmentAccounts.forEach((a, i) => [cur, nxt].forEach(mo => debts.push({ kind: 'installment', name: a.name, month: mo, balance: 15000 - i * 500, monthlyPayment: 1000 + i * 100 })));
    switchTab('analytics'); renderAll();
    openPaymentsScreen(null);
  });
  await page.waitForTimeout(600);
}
test('PAYLIST 1. екран: плитки збігаються з моделлю, групи за днями, картка «Чекає внесення» з кнопкою, без слова «Прострочено»', async ({ page }) => {
  await openScreen(page);
  const info = await page.evaluate(() => {
    const m = paymentsScreenModel(computeUpcomingNow(14), kyivTodayISO());
    const q = s => Array.from(document.querySelectorAll('#payments-body ' + s));
    return { model: { tiles: m.tiles.map(t => [t.label, t.count]), wait: m.wait.length, days: m.window ? m.window.days.length : 0, later: m.later.length },
      dom: { tiles: q('.pl-tile').map(t => [t.querySelector('.pl-tile-lab').textContent, parseInt(t.querySelector('.pl-tile-cnt').textContent, 10) || 0]), wait: q('.pl-wait').length, waitBtn: q('.pl-wait .submit-btn').map(b => b.textContent), days: q('.pl-day').length, later: q('.pl-month').length },
      text: document.getElementById('payments-body').innerText };
  });
  expect(info.dom.tiles).toEqual(info.model.tiles); expect(info.dom.wait).toBe(info.model.wait); expect(info.dom.days).toBe(info.model.days); expect(info.dom.later).toBe(info.model.later);
  info.dom.waitBtn.forEach(t => expect(t).toBe('Внести платіж'));
  expect(info.text).not.toMatch(/Прострочено/); expect(info.text).not.toMatch(/NaN|undefined/);
  expect(info.dom.tiles.map(t => t[0])).toEqual(['Чекає внесення', 'Цей тиждень', 'До кінця місяця']);
});
test('PAYLIST 2. «Пізніше»: місяці згорнуті за замовчуванням, дотик розгортає групи за днями, повторний згортає', async ({ page }) => {
  await openScreen(page);
  const n = await page.locator('#payments-body .pl-month').count();
  test.skip(n === 0, 'немає місяців у «Пізніше» на цей день');
  await expect(page.locator('#payments-body .pl-month-body')).toHaveCount(0);
  await expect(page.locator('#payments-body .pl-month').first()).toHaveAttribute('aria-expanded', 'false');
  await page.locator('#payments-body .pl-month').first().click();
  await expect(page.locator('#payments-body .pl-month').first()).toHaveAttribute('aria-expanded', 'true');
  expect(await page.locator('#payments-body .pl-month-body .pl-day').count()).toBeGreaterThan(0);
  await page.locator('#payments-body .pl-month').first().click();
  await expect(page.locator('#payments-body .pl-month-body')).toHaveCount(0);
});
test('PAYLIST 3. дотик рядка платежу відкриває наявну шторку дії, «Внести платіж» — наявну форму витрати без збереження', async ({ page }) => {
  await openScreen(page);
  const row = page.locator('#payments-body .pl-day .pay-line').first();
  test.skip(await row.count() === 0, 'немає рядків у вікні на цей день');
  const before = await page.evaluate(() => expenses.length);
  await row.click();
  await expect(page.locator('#pay-action-drawer.open')).toHaveCount(1);
  await page.locator('#pay-action-primary').click();
  await page.waitForTimeout(500);
  const st = await page.evaluate(() => ({ tab: lastActiveTab, name: document.getElementById('expfielda7').value, amount: document.getElementById('f-amount').value, n: expenses.length }));
  expect(st.tab).toBe('vytraty'); expect(st.name).toMatch(/Тест ОЧ/); expect(st.amount).not.toBe(''); expect(st.n).toBe(before);
});
test('PAYLIST 4. картка «Чекає внесення»: кнопка відкриває наявну форму (без збереження); бурштин лише коли є що вносити', async ({ page }) => {
  await openScreen(page);
  const waits = await page.locator('#payments-body .pl-wait').count();
  const amber = await page.locator('#payments-body .pl-tile.amber').count();
  expect(amber).toBe(waits > 0 ? 1 : 0);
  test.skip(waits === 0, 'на цей день немає невнесених платежів');
  const before = await page.evaluate(() => expenses.length);
  await page.locator('#payments-body .pl-wait .submit-btn').first().click();
  await page.waitForTimeout(500);
  const st = await page.evaluate(() => ({ tab: lastActiveTab, amount: document.getElementById('f-amount').value, n: expenses.length }));
  expect(st.tab).toBe('vytraty'); expect(st.amount).not.toBe(''); expect(st.n).toBe(before);
});
test('PAYLIST 5. плитки: суми й підписи кількості на одній лінії; відступ після заголовка розділу; після прокрутки до кінця останній рядок над панеллю вкладок', async ({ page }) => {
  await openScreen(page);
  const g = await page.evaluate(() => {
    const tiles = Array.from(document.querySelectorAll('#payments-body .pl-tile'));
    const tops = sel => tiles.map(t => Math.round(t.querySelector(sel).getBoundingClientRect().top));
    const lab = document.querySelector('#payments-body .pl-winlabel'), day = lab && lab.nextElementSibling;
    const s = document.getElementById('payments-screen'); s.scrollTop = s.scrollHeight;
    return { amt: tops('.pl-tile-amt'), cnt: tops('.pl-tile-cnt'), labH: tiles.map(t => Math.round(t.querySelector('.pl-tile-lab').getBoundingClientRect().height)), gap: lab && day ? Math.round(day.getBoundingClientRect().top - lab.getBoundingClientRect().bottom) : null };
  });
  expect(new Set(g.amt).size, 'суми на одній лінії: ' + JSON.stringify(g)).toBe(1); expect(new Set(g.cnt).size, 'підписи кількості на одній лінії').toBe(1); expect(g.labH.every(h => h >= 32)).toBe(true);
  if (g.gap !== null) expect(g.gap, 'відступ заголовок розділу → перший день ≥ 16').toBeGreaterThanOrEqual(16);
  await page.waitForTimeout(300);
  const end = await page.evaluate(() => { const last = Array.from(document.querySelectorAll('#payments-body > *')).pop(), bar = document.querySelector('.tabbar-glass'); return { lastBottom: last.getBoundingClientRect().bottom, barTop: bar.getBoundingClientRect().top }; });
  expect(end.lastBottom, 'останній елемент над панеллю вкладок: ' + JSON.stringify(end)).toBeLessThanOrEqual(end.barTop);
});
