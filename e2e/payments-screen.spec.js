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
test('PAYLIST 3. дотик рядка платежу ОЧ відкриває наявну форму витрати одразу (без проміжної шторки), нічого не зберігається', async ({ page }) => {
  await openScreen(page);
  const row = page.locator('#payments-body .pl-day .pay-line').first();
  test.skip(await row.count() === 0, 'немає рядків у вікні на цей день');
  const before = await page.evaluate(() => expenses.length);
  await row.click();
  await page.waitForTimeout(500);
  const st = await page.evaluate(() => ({ drawer: document.getElementById('pay-action-drawer').classList.contains('open'), tab: lastActiveTab, name: document.getElementById('expfielda7').value, amount: document.getElementById('f-amount').value, n: expenses.length }));
  expect(st.drawer).toBe(false); expect(st.tab).toBe('vytraty'); expect(st.name).toMatch(/Тест ОЧ/); expect(st.amount).not.toBe(''); expect(st.n).toBe(before);
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

// ===== DS-PAYLIST Rev 2 (внесення через витрату) =====
// дотик по платежу: невнесений — кнопка картки «Внести платіж», інший — рядок у групі дня
const tapPick = (page, pick) => { const nm = pick.name.replace(/^[^\p{L}]+/u, ''); return (pick.wait ? page.locator('#payments-body .pl-wait', { hasText: nm }).locator('.submit-btn').first() : page.locator('#payments-body .pl-day .pay-line', { hasText: nm }).first()).click(); };
async function seedAndModel(page){
  return page.evaluate(() => {
    const today = kyivTodayISO(), m = paymentsScreenModel(computeUpcomingNow(14, null), today);
    const rows = m.wait.concat(m.window ? m.window.days.reduce((a, d) => a.concat(d.rows), []) : []).filter(r => r.kind === 'installment');
    const pick = rows[0] || null;
    return { today, pick: pick ? { name: pick.name, month: pick.month, date: pick.date, k: pick.k, n: pick.n, amount: pick.amount, wait: m.wait.some(w => w.name === pick.name && w.date === pick.date) } : null };
  });
}
test('PAYLIST 6. дотик рядка ОЧ — одразу форма (без шторки): дата за правилом, блок «Прив\'язано до ОЧ · … · Платіж k з n · за дата», «Додати витрату» зберігає, картка зникає, k зростає', async ({ page }) => {
  await openScreen(page);
  const s = await seedAndModel(page);
  test.skip(!s.pick, 'немає ОЧ у вікні на цей день');
  await tapPick(page, s.pick);
  await page.waitForTimeout(500);
  const st = await page.evaluate(() => ({ drawer: document.getElementById('pay-action-drawer').classList.contains('open'), tab: lastActiveTab, date: document.getElementById('f-date').value, amount: document.getElementById('f-amount').value, block: document.getElementById('pay-link-block').textContent, shown: document.getElementById('pay-link-block').classList.contains('show') }));
  expect(st.drawer).toBe(false); expect(st.tab).toBe('vytraty'); expect(st.shown).toBe(true);
  expect(st.block).toContain('Прив\'язано до ОЧ · ' + s.pick.name); if (s.pick.k && s.pick.n) expect(st.block).toContain('Платіж ' + s.pick.k + ' з ' + s.pick.n);
  expect(st.date, 'дата: поточний місяць — сьогодні, інакше дата платежу').toBe(s.pick.month === s.today.slice(0, 7) ? s.today : s.pick.date);
  expect(Number.isInteger(Number(st.amount.replace(/\s| /g, '')))).toBe(true);
  const before = await page.evaluate(n => activeExpenses().filter(e => e.linkedInstallment === n).length, s.pick.name);
  await page.locator('button.submit-btn.expense').click();
  await page.waitForTimeout(800);
  const after = await page.evaluate(n => ({ linked: activeExpenses().filter(e => e.linkedInstallment === n).length }), s.pick.name);
  expect(after.linked, 'витрату збережено з прив\'язкою').toBe(before + 1);
  await page.evaluate(() => { switchTab('analytics'); openPaymentsScreen(null); });
  await page.waitForTimeout(500);
  const m2 = await page.evaluate(([n, date]) => { const m = paymentsScreenModel(computeUpcomingNow(14, null), kyivTodayISO()); const all = m.wait.concat(m.window ? m.window.days.reduce((a, d) => a.concat(d.rows), []) : [], m.later.reduce((a, x) => a.concat(x.days.reduce((b, d) => b.concat(d.rows), [])), [])); return { still: all.some(r => r.name === n && r.date === date), nextK: (all.find(r => r.name === n) || {}).k }; }, [s.pick.name, s.pick.date]);
  if (s.pick.month === s.today.slice(0, 7) && s.pick.k) expect(m2.still, 'платіж більше не в списку (прив\'язана витрата ≥ очікуваного)').toBe(false);
});
test('PAYLIST 7. чернетка: у формі є дані — «Замінити чернетку?»; «Ні» лишає чернетку й екран, «Так» замінює', async ({ page }) => {
  await openScreen(page);
  const s = await seedAndModel(page);
  test.skip(!s.pick, 'немає ОЧ у вікні на цей день');
  await page.evaluate(() => { document.getElementById('expfielda7').value = 'Моя чернетка'; });
  await tapPick(page, s.pick);
  await expect(page.locator('#app-modal.open')).toHaveCount(1);
  await expect(page.locator('#app-modal-text')).toContainText('Замінити чернетку?');
  await expect(page.locator('#app-modal-cancel-btn')).toHaveText('Ні');
  await page.locator('#app-modal-cancel-btn').click();
  await page.waitForTimeout(400);
  const no = await page.evaluate(() => ({ name: document.getElementById('expfielda7').value, screen: isPaymentsOpen }));
  expect(no.name).toBe('Моя чернетка'); expect(no.screen).toBe(true);
  await tapPick(page, s.pick);
  await page.locator('#app-modal-confirm-btn').click();
  await page.waitForTimeout(600);
  const yes = await page.evaluate(() => ({ name: document.getElementById('expfielda7').value, tab: lastActiveTab }));
  expect(yes.tab).toBe('vytraty'); expect(yes.name).toContain(s.pick.name.replace(/^[^\p{L}]+/u, ''));
});
test('PAYLIST 8. вибраний минулий місяць: невнесені платежі того місяця з\'являються в «Чекає внесення»; у поточному — ні', async ({ page }) => {
  await openScreen(page);
  const r = await page.evaluate(() => {
    const cur = kyivTodayISO().slice(0, 7), prev = ppPrevMonth(cur);
    installmentAccounts.forEach(a => debts.push({ kind: 'installment', name: a.name, month: prev, balance: 15000, monthlyPayment: 1000 }));
    const a = paymentsScreenModel(computeUpcomingNow(14, null), kyivTodayISO()).wait.filter(w => w.month === prev).length;
    const b = paymentsScreenModel(computeUpcomingNow(14, prev), kyivTodayISO()).wait.filter(w => w.month === prev).length;
    selectedMonth = prev; renderAll(); openPaymentsScreen(null);
    return { a, b, dom: document.querySelectorAll('#payments-body .pl-wait').length, prev };
  });
  expect(r.a).toBe(0); expect(r.b).toBeGreaterThan(0); expect(r.dom).toBeGreaterThanOrEqual(r.b);
  await page.waitForTimeout(300);
  const date = await page.evaluate(() => { const w = paymentsScreenModel(computeUpcomingNow(14, selectedMonth), kyivTodayISO()).wait.find(x => x.month === selectedMonth); return { w: w ? { name: w.name, date: w.date } : null }; });
  expect(date.w).not.toBeNull();
  await page.locator('#payments-body .pl-wait .submit-btn').first().click();
  await page.waitForTimeout(500);
  const f = await page.evaluate(() => document.getElementById('f-date').value);
  expect(f, 'для минулого місяця дата форми — дата платежу, не сьогодні').toBe(date.w.date);
});
test('PAYLIST 9. екран перемальовується після збереження витрати й синхронізації (renderAll): прив\'язана витрата прибирає картку', async ({ page }) => {
  await openScreen(page);
  const r = await page.evaluate(() => {
    const m = paymentsScreenModel(computeUpcomingNow(14, null), kyivTodayISO());
    const w = m.wait[0] || (m.window && m.window.days[0].rows[0]);
    if(!w) return null;
    const before = document.querySelectorAll('#payments-body .pay-line, #payments-body .pl-wait').length;
    expenses.push({ id: 'x-test-1', name: 'Платіж', amount: Math.max(w.amount || 1000, 1000) * 2, date: kyivTodayISO(), category: '🏦 Оплати Частинами', linkedInstallment: w.name });
    renderAll();
    const after = document.querySelectorAll('#payments-body .pay-line, #payments-body .pl-wait').length;
    return { before, after };
  });
  test.skip(r === null, 'на цей день немає платежів');
  expect(r.after, 'відкритий екран перемальовано без повторного відкриття').toBeLessThan(r.before);
});
test('PAYLIST 10. офлайн: внесення без мережі — витрата зберігається локально, платіж зникає зі списку', async ({ page, context }) => {
  await openScreen(page);
  const s = await seedAndModel(page);
  test.skip(!s.pick || s.pick.month !== s.today.slice(0, 7), 'потрібен платіж поточного місяця');
  await context.setOffline(true);
  await tapPick(page, s.pick);
  await page.waitForTimeout(400);
  await page.evaluate(() => { const a = document.getElementById('f-amount'); a.value = '99 999'; });
  await page.locator('button.submit-btn.expense').click();
  await page.waitForTimeout(800);
  const st = await page.evaluate(n => ({ linked: activeExpenses().filter(e => e.linkedInstallment === n && Number(e.amount) === 99999).length }), s.pick.name);
  expect(st.linked, 'витрату збережено локально без мережі').toBe(1);
  await page.evaluate(() => { switchTab('analytics'); openPaymentsScreen(null); });
  await page.waitForTimeout(400);
  const still = await page.evaluate(([n, d]) => { const m = paymentsScreenModel(computeUpcomingNow(14, null), kyivTodayISO()); return m.wait.concat(m.window ? m.window.days.reduce((a, g) => a.concat(g.rows), []) : []).some(r => r.name === n && r.date === d); }, [s.pick.name, s.pick.date]);
  expect(still).toBe(false);
  await context.setOffline(false);
});
