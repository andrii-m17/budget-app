// NET-2ab: одна дія з доходом або боргом = один запит (мок, WebKit, NET_STATS; Realtime-луна власного запису гаситься). Синтетичні дані.
const { test, expect } = require('@playwright/test');
const { installClock } = require('./clock');
test('NET-2ab: доходи й борги: додати / змінити / видалити по 1 запиту (було 4)', async ({ page }) => {
  test.setTimeout(240000);
  await installClock(page);
  await page.goto('/index.html?fixture=typical');
  await page.waitForFunction(() => window.MockCloud && typeof cloudSession !== 'undefined' && cloudSession && cloudSession.user && document.querySelector('.tabbar-glass'));
  await page.waitForFunction(() => !document.querySelector('.avatar-status-dot.syncing'), null, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(2500);
  const out = {};
  const measure = async (label, fn) => {
    const before = await page.evaluate(() => ({ t: window.__netStats.total, b: Object.assign({}, window.__netStats.byType) }));
    await page.evaluate(fn);
    await page.waitForTimeout(3500);
    const after = await page.evaluate(() => ({ t: window.__netStats.total, b: Object.assign({}, window.__netStats.byType) }));
    const d = {}; Object.keys(after.b).forEach(k => { const x = after.b[k] - (before.b[k] || 0); if (x) d[k] = x; });
    out[label] = { n: after.t - before.t, by: d };
  };
  // прогрів: відкладена перевірка після завантаження не входить у виміри дій
  await page.evaluate(async () => { await syncCheck('focus', { force: true }); });
  await page.waitForTimeout(1500);
  await measure('inc.add', async () => { const t = new Date().toISOString(); const rec = Object.assign({}, incomes[0], { id: generateUUID(), amount: 100, createdAt: t, updatedAt: t }); delete rec.serverBase; delete rec.serverUpdatedAt; delete rec.syncedUpdatedAt; incomes.push(rec); await saveIncomes(); await pushIncomeRecordPilot(rec); window.__i = rec; });
  await measure('inc.edit', async () => { const r = window.__i; r.amount = 101; r.updatedAt = new Date().toISOString(); await saveIncomes(); await pushIncomeRecordPilot(r); });
  await measure('inc.del', async () => { const r = window.__i; r.deletedAt = new Date().toISOString(); r.updatedAt = r.deletedAt; await saveIncomes(); await pushIncomeRecordPilot(r); });
  await measure('debt.add', async () => { const t = new Date().toISOString(); const base = debts.find(d => d.kind === 'card') || debts[0]; const rec = Object.assign({}, base, { id: generateUUID(), month: '2027-05', balance: 700, createdAt: t, updatedAt: t }); ['serverBase', 'serverUpdatedAt', 'syncedUpdatedAt', 'cloudId'].forEach(k => delete rec[k]); debts.push(rec); await saveDebts(); await pushDebtRecordPilot(rec); window.__d = rec; });
  await measure('debt.edit', async () => { const r = window.__d; r.balance = 701; r.updatedAt = new Date().toISOString(); await saveDebts(); await pushDebtRecordPilot(r); });
  await measure('debt.del', async () => { const r = window.__d; r.deletedAt = new Date().toISOString(); r.updatedAt = r.deletedAt; await saveDebts(); await pushDebtRecordPilot(r); });
  console.log('NET2AB ' + JSON.stringify(out));
  Object.keys(out).forEach(k => expect(out[k].n, k + ': ' + JSON.stringify(out[k].by)).toBe(1));
  // відомий наслідок (як NET-1): «голова» не просувається, перша наступна перевірка робить sync_heads + GET за таблицями; друга вже лише sync_heads
  const next = await page.evaluate(async () => { const b = window.__netStats.total; await syncCheck('focus', { force: true }); const a = window.__netStats.total; await syncCheck('focus', { force: true }); return { first: a - b, second: window.__netStats.total - a }; });
  console.log('NET2AB-NEXT ' + JSON.stringify(next));
  expect(next.second).toBe(1);
});
