// OCH-CLOSE (Rev 2.32.441): діалог «ОЧ погашено» після власного збереження платежу, який переводить ОЧ у «погашено» (залишок ≤ 10 грн); без повтору, без діалогу для не закритої ОЧ; «Приховати» ховає з наступного місяця, поточний видно; «Не зараз» нічого не пише. Мок хмари, лише синтетичні дані.
const { test, expect } = require('@playwright/test');
const { installClock } = require('./clock');

async function boot(page) {
  await installClock(page);
  await page.goto('/index.html?fixture=empty');
  await page.waitForFunction(() => window.MockCloud && typeof cloudSession !== 'undefined' && cloudSession && cloudSession.user && document.querySelector('.tabbar-glass'));
  await page.waitForTimeout(1200);
}
// ОЧ на 400: два платежі по 100 уже внесено (залишок 200); поточний місяць — з годинника тесту
async function seed(page) {
  return page.evaluate(() => {
    const mk = off => { const d = new Date(new Date().getFullYear(), new Date().getMonth() + off, 1); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); };
    const now = new Date().toISOString();
    installmentAccounts.length = 0;
    installmentAccounts.push({ name: 'ОЧ-тест', cloudId: 'c-och-1', initialAmount: 400, termMonths: 4, payment: 100, dueDay: 5, firstMonth: mk(-2), startDate: mk(-2) + '-05', createdAt: now, updatedAt: now });
    expenses.length = 0;
    [-2, -1].forEach(o => expenses.push({ id: 'seed' + o, name: 'p', amount: 100, date: mk(o) + '-05', category: '', subcategory: '', linkedInstallment: 'ОЧ-тест', createdAt: now, updatedAt: now }));
    selectedMonth = mk(0); renderAll();
    return { cur: mk(0), next: mk(1) };
  });
}
const pay = (page, amount) => page.evaluate(async (a) => {
  switchTab('vytraty');
  document.getElementById('expfielda7').value = 'Платіж ОЧ-тест'; document.getElementById('f-amount').value = String(a);
  confirmedInstallmentLinkIdx = 0;
  await addExpenseCore();
}, amount);
const modalOpen = (page) => page.evaluate(() => { const m = document.getElementById('app-modal'); return !!m && m.classList.contains('open') ? m.textContent : null; });

test('платіж не закриває ОЧ (залишок 100 після платежу 100) — діалогу нема', async ({ page }) => {
  await boot(page); await seed(page);
  await pay(page, 100);
  await page.waitForTimeout(900);
  expect(await modalOpen(page)).toBe(null);
});
test('платіж 195 (залишок 5 ≤ 10) — діалог «ОЧ погашено»; «Приховати» ховає з наступного місяця, поточний видно', async ({ page }) => {
  await boot(page); const m = await seed(page);
  await pay(page, 195);
  await page.waitForFunction(() => { const x = document.getElementById('app-modal'); return x && x.classList.contains('open'); }, null, { timeout: 5000 });
  const txt = await modalOpen(page);
  expect(txt).toContain('ОЧ погашено'); expect(txt).toContain('Приховати з');
  await page.evaluate(() => document.getElementById('app-modal-confirm-btn').click());
  await page.waitForTimeout(700);
  const vis = await page.evaluate((mm) => ({ cur: isInstallmentVisibleForMonth(installmentAccounts[0], mm.cur), next: isInstallmentVisibleForMonth(installmentAccounts[0], mm.next), from: hiddenFrom[Object.keys(hiddenFrom)[0]].month }), m);
  expect(vis.cur).toBe(true); expect(vis.next).toBe(false); expect(vis.from).toBe(m.next);
});
test('«Не зараз» нічого не пише; підпис «Погашено · Приховати з …» лишається в рядку; повторний платіж/редагування суми діалог не повторює', async ({ page }) => {
  await boot(page); await seed(page);
  await pay(page, 200);
  await page.waitForFunction(() => { const x = document.getElementById('app-modal'); return x && x.classList.contains('open'); }, null, { timeout: 5000 });
  await page.evaluate(() => document.getElementById('app-modal-cancel-btn').click());
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => Object.keys(hiddenFrom).length)).toBe(0);
  await page.evaluate(() => { switchTab('accounting'); renderAll(); });
  await page.waitForTimeout(500);
  await expect(page.locator('.cdr-paidoff')).toContainText('Приховати з');
  await pay(page, 50); // ОЧ уже погашена: переходу нема
  await page.waitForTimeout(900);
  expect(await modalOpen(page)).toBe(null);
});
test('Monobank/синхронізація: витрата з іншого пристрою закриває ОЧ — діалогу нема, лише підпис', async ({ page }) => {
  await boot(page); const m = await seed(page);
  await page.evaluate((mm) => { const now = new Date().toISOString(); expenses.push({ id: 'remote1', name: 'з іншого пристрою', amount: 200, date: mm.cur + '-06', category: '', subcategory: '', linkedInstallment: 'ОЧ-тест', createdAt: now, updatedAt: now }); switchTab('accounting'); renderAll(); }, m);
  await page.waitForTimeout(1000);
  expect(await modalOpen(page)).toBe(null);
  await expect(page.locator('.cdr-paidoff')).toContainText('Приховати з');
});
