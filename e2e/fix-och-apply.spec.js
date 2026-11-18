// Rev 2.32.397 (FIX-OCH-APPLY): «Застосувати» у формі ОЧ підставляє розрахункове значення в «Залишок за банком», підказка зникає, «Зберегти» стає активною, після збереження значення в даних. Мок, вигадані суми.
const { test, expect } = require('@playwright/test');
const { installClock } = require('./clock');
test.use({ hasTouch: true });
async function boot(page){
  const errors = [];
  page.on('pageerror', e => errors.push(String(e && e.message || e)));
  await page.setViewportSize({ width: 390, height: 844 });
  await installClock(page);
  await page.goto('/index.html?fixture=typical');
  await page.waitForFunction(() => window.MockCloud && typeof cloudSession !== 'undefined' && cloudSession && cloudSession.user && document.querySelector('.tabbar-glass'));
  await page.waitForFunction(() => !document.querySelector('.avatar-status-dot.syncing'), null, { timeout: 15000 }).catch(() => {});
  return errors;
}
async function openForm(page){
  // знаходимо ОЧ із відомим розрахунковим залишком і відкриваємо її форму для вибраного місяця
  const info = await page.evaluate(() => {
    switchTab('accounting'); if(typeof switchAccountingSub === 'function') try{ switchAccountingSub('installments'); }catch(e){}
    const idx = installmentAccounts.findIndex(a => { const e = estimateInstallment(a.name, selectedMonth); return e.calcBefore != null; });
    if(idx < 0) return null;
    openInstallmentEditor(idx);
    const calc = estimateInstallment(installmentAccounts[idx].name, selectedMonth).calcBefore;
    return { idx, calc };
  });
  await page.waitForTimeout(700);
  return info;
}
test('FIX-OCH-APPLY: «Застосувати» → поле = розрахунок, підказка зникає, «Зберегти» активна, після збереження — у даних', async ({ page }) => {
  test.setTimeout(120000);
  const errors = await boot(page);
  const info = await openForm(page);
  expect(info, 'у фікстурі є ОЧ із розрахунковим залишком').not.toBeNull();
  await page.evaluate(() => ochSetCond(true)); await page.waitForTimeout(400); // поле «Залишок за банком» — у згорнутих «Умовах»
  const wrong = info.calc + 777;
  await page.fill('#idd-balance', String(wrong));
  await page.waitForTimeout(200);
  const hint = page.locator('#idd-balance-diff .bdr-diff-apply');
  await expect(hint).toBeVisible();
  await hint.tap();
  await page.waitForTimeout(400);
  const after = await page.evaluate(() => ({ val: document.getElementById('idd-balance').value.replace(/[\s  ]/g, ''), hint: document.getElementById('idd-balance-diff').classList.contains('show'), open: document.getElementById('installment-drawer').classList.contains('open'), gate: document.querySelector('#installment-drawer .submit-btn.debt').getAttribute('aria-disabled') }));
  expect(after.val).toBe(String(info.calc));
  expect(after.hint, 'підказка зникла').toBe(false);
  expect(after.open, 'шторка лишається відкритою до «Зберегти»').toBe(true);
  expect(after.gate, '«Зберегти» активна').toBeNull();
  await page.locator('#installment-drawer .submit-btn.debt').tap();
  await page.waitForTimeout(800);
  const saved = await page.evaluate(i => { const a = installmentAccounts[i]; const d = findAccountMonthDebt(debts, a, selectedMonth, 'installment'); return d ? d.balance : null; }, info.idx);
  expect(saved, 'значення в даних').toBe(info.calc);
  expect(errors).toEqual([]);
});
