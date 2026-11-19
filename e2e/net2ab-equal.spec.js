// NET-2ab (умова перед пушем): повний локальний стан після НОВОГО шляху (застосування відповіді) дорівнює стану після СТАРОГО (запис + pull).
// Старий шлях відтворюється, коли застосування відповіді відхиляється (incApplyPushedRow/debApplyPushedRow → null): залишається звичайний pull. Мок, синтетичні дані.
const { test, expect } = require('@playwright/test');
const { installClock } = require('./clock');
const ISO = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})/g;
async function run(browser, old){
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  const page = await context.newPage();
  await installClock(page);
  await page.goto('/index.html?fixture=typical');
  await page.waitForFunction(() => window.MockCloud && typeof cloudSession !== 'undefined' && cloudSession && cloudSession.user && document.querySelector('.tabbar-glass'));
  await page.waitForTimeout(3000);
  await page.evaluate(async () => { await syncCheck('focus', { force: true }); });
  await page.waitForTimeout(1500);
  if(old) await page.evaluate(() => { window.incApplyPushedRow = () => null; window.debApplyPushedRow = () => null; });
  const snap = () => page.evaluate(() => {
    const m = selectedMonth || kyivTodayISO().slice(0, 7);
    const mk = Object.keys(localStorage).filter(k => /marker/i.test(k)).sort().map(k => [k, localStorage.getItem(k)]);
    const own = r => ({ ...r });
    const flags = list => list.map(r => ({ id: r.id, eq: r.updatedAt === r.syncedUpdatedAt && r.syncedUpdatedAt === r.serverUpdatedAt }));
    let tot = null, up = null; try { tot = debtTotalsForMonth(m); } catch (e) { tot = 'ERR ' + e.message; } try { up = computeUpcomingNow(14, null); } catch (e) { up = 'ERR ' + e.message; }
    return JSON.stringify({ incomes: incomes.map(own), debts: debts.map(own), banks: bankAccounts.map(own), inst: installmentAccounts.map(own), flags: [flags(incomes), flags(debts)],
      recentInc: Array.from(recentlyPulledIncomeState.keys()), recentExp: Array.from(recentlyPulledExpenseState.keys()), markers: mk, totals: tot, upcoming: up, ls: Object.keys(localStorage).filter(k => /income|debt/i.test(k)).sort().map(k => [k, localStorage.getItem(k)]) });
  });
  const ids = new Map(); const norm = s => s.replace(ISO, 'TS').replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, u => { if(/^[123]0000000/.test(u)) return u; if(!ids.has(u)) ids.set(u, 'ID' + ids.size); return ids.get(u); });
  const out = [];
  const step = async (label, fn) => { await page.evaluate(fn); await page.waitForTimeout(2500); out.push([label, norm(await snap())]); };
  const M = '2027-05';
  await step('inc.add', async () => { const t = new Date().toISOString(); const rec = { id: '10000000-0000-4000-8000-000000000001', date: '2027-05-10', source: incomes.length ? incomes[0].source : '', amount: 100, createdAt: t, updatedAt: t }; incomes.push(rec); await saveIncomes(); await pushIncomeRecordPilot(rec); });
  await step('inc.edit', async () => { const r = incomes.find(x => x.id === '10000000-0000-4000-8000-000000000001'); r.amount = 150; r.updatedAt = new Date().toISOString(); await saveIncomes(); await pushIncomeRecordPilot(r); });
  await step('card.add', async () => { const t = new Date().toISOString(); const b = bankAccounts.find(x => x.cloudId); debts.push({ id: '20000000-0000-4000-8000-000000000001', accountId: b.cloudId, name: b.name, kind: 'card', month: '2027-05', balance: 700, minPayment: 50, createdAt: t, updatedAt: t }); await saveDebts(); await pushDebtRecordPilot(debts[debts.length - 1]); });
  await step('card.edit', async () => { const r = debts.find(x => x.id === '20000000-0000-4000-8000-000000000001'); r.balance = 650; r.minPayment = 40; r.minPaymentDone = true; r.updatedAt = new Date().toISOString(); await saveDebts(); await pushDebtRecordPilot(r); });
  await step('och.add', async () => { const t = new Date().toISOString(); const a = installmentAccounts.find(x => x.cloudId); debts.push({ id: '30000000-0000-4000-8000-000000000001', accountId: a.cloudId, name: a.name, kind: 'installment', month: '2027-05', balance: 3000, monthlyPayment: 500, createdAt: t, updatedAt: t }); await saveDebts(); await pushDebtRecordPilot(debts[debts.length - 1]); });
  await step('och.edit', async () => { const r = debts.find(x => x.id === '30000000-0000-4000-8000-000000000001'); r.balance = 2500; r.updatedAt = new Date().toISOString(); await saveDebts(); await pushDebtRecordPilot(r); });
  await step('debt.del', async () => { const r = debts.find(x => x.id === '20000000-0000-4000-8000-000000000001'); r.deletedAt = new Date().toISOString(); r.updatedAt = r.deletedAt; await saveDebts(); await pushDebtRecordPilot(r); });
  await step('inc.del', async () => { const r = incomes.find(x => x.id === '10000000-0000-4000-8000-000000000001'); r.deletedAt = new Date().toISOString(); r.updatedAt = r.deletedAt; await saveIncomes(); await pushIncomeRecordPilot(r); });
  await context.close();
  return out;
}
test('NET-2ab: стан після нового шляху = стану після старого (запис + pull): борги, доходи, ОЧ, recentlyPulled, маркери, підсумки', async ({ browser }) => {
  test.setTimeout(240000);
  const neu = await run(browser, false), old = await run(browser, true);
  const all = [];
  for (let i = 0; i < neu.length; i++) {
    const a = JSON.parse(neu[i][1]), b = JSON.parse(old[i][1]);
    const diffs = []; const walk = (x, y, path) => { if (JSON.stringify(x) === JSON.stringify(y)) return; if (x && y && typeof x === 'object' && typeof y === 'object') { new Set(Object.keys(x).concat(Object.keys(y))).forEach(k => walk(x[k], y[k], path + '.' + k)); } else diffs.push(path + ': новий=' + JSON.stringify(x) + ' старий=' + JSON.stringify(y)); };
    walk(a, b, neu[i][0]); if (diffs.length) console.log('DIFF ' + diffs.join('\nDIFF '));
    all.push(...diffs);
  }
  expect(all).toEqual([]);
});
