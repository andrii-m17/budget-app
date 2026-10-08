// Rev 2.32.4 (T2) — безповоротне видалення карток/ОЧ і місячних записів: чисті функції та охоронні тести підключення.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ex = require('./extract');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const ctx = ex.buildSandbox({}, ['purgeAccountPlan', 'purgeAccountConfirmText', 'removeAccountFromState', 'filterPurgedAccounts', 'filterPurgedDebts']);
const J = v => JSON.parse(JSON.stringify(v));
const fresh = () => ({
  bankAccounts: [{ name: 'Моно', cloudId: 'b1' }, { name: 'Приват', cloudId: 'b2' }],
  installmentAccounts: [{ name: 'iPhone', cloudId: 'i1' }, { name: 'Dyson', cloudId: 'i2' }],
  debts: [
    { id: 'd1', kind: 'card', name: 'Моно', month: '2026-08', balance: 100 },
    { id: 'd2', kind: 'card', name: 'Моно', month: '2026-09', balance: 200, deletedAt: 'x' },
    { id: 'd3', kind: 'card', name: 'Приват', month: '2026-09', balance: 300 },
    { id: 'd4', kind: 'installment', name: 'iPhone', month: '2026-09', balance: 400 },
    { id: 'd5', kind: 'installment', name: 'Моно', month: '2026-09', balance: 1 }, // той самий name, інший kind — не чіпати
  ],
  expenses: [{ id: 'e1', name: 'платіж', amount: 10, linkedInstallment: 'iPhone', updatedAt: 'old' }, { id: 'e2', name: 'x', amount: 20, linkedInstallment: 'Dyson' }, { id: 'e3', name: 'y', amount: 30 }],
  hiddenFrom: { 'card:Моно': { month: '2026-10' }, 'installment:iPhone': { month: '2026-10' }, 'card:Приват': { month: '2026-10' } },
});

test('purgeAccountPlan: картка — усі її місячні записи (з tombstone), без чужих kind; ОЧ — ще й прив’язані витрати; кількості', () => {
  const st = fresh();
  const card = J(ctx.purgeAccountPlan({ kind: 'card', name: 'Моно' }, st));
  assert.equal(card.exists, true);
  assert.deepEqual(card.debtIds, ['d1', 'd2']);
  assert.equal(card.debtCount, 2);
  assert.equal(card.linkedCount, 0);
  assert.equal(card.hiddenKey, 'card:Моно');
  assert.equal(card.cloudId, 'b1');
  const inst = J(ctx.purgeAccountPlan({ kind: 'installment', name: 'iPhone' }, st));
  assert.deepEqual(inst.debtIds, ['d4']);
  assert.deepEqual(inst.linkedExpenseIds, ['e1']);
  assert.equal(inst.hiddenKey, 'installment:iPhone');
  assert.equal(J(ctx.purgeAccountPlan({ kind: 'card', name: 'Нема' }, st)).exists, false);
  assert.equal(J(ctx.purgeAccountPlan({ kind: 'installment', name: 'Dyson' }, st)).hiddenKey, null);
});
test('purgeAccountConfirmText: картка і ОЧ; відмінювання; без записів — без «разом з»', () => {
  const T = p => ctx.purgeAccountConfirmText(p);
  assert.equal(T({ kind: 'card', name: 'Моно', debtCount: 3, linkedCount: 0 }), 'Картка «Моно»: буде видалено назавжди разом з 3 місячними записами боргів. Це неможливо скасувати.');
  assert.equal(T({ kind: 'card', name: 'Моно', debtCount: 1, linkedCount: 0 }), 'Картка «Моно»: буде видалено назавжди разом з 1 місячним записом боргів. Це неможливо скасувати.');
  assert.equal(T({ kind: 'card', name: 'Моно', debtCount: 0, linkedCount: 0 }), 'Картка «Моно»: буде видалено назавжди. Це неможливо скасувати.');
  assert.equal(T({ kind: 'installment', name: 'iPhone', debtCount: 5, linkedCount: 4 }), 'ОЧ «iPhone»: буде видалено назавжди разом з 5 місячними записами боргів. Це неможливо скасувати. 4 витрати, прив\'язаних до цієї ОЧ, лишаться, але втратять прив\'язку.');
  assert.match(T({ kind: 'installment', name: 'A', debtCount: 0, linkedCount: 1 }), /1 витрата, прив'язана до цієї ОЧ, лишиться, але втратить прив'язку\.$/);
  assert.match(T({ kind: 'installment', name: 'A', debtCount: 0, linkedCount: 7 }), /7 витрат, прив'язаних до цієї ОЧ, лишаться, але втратять прив'язку\.$/);
  assert.ok(!/прив/.test(T({ kind: 'card', name: 'A', debtCount: 1, linkedCount: 9 })), 'для картки про витрати не пишемо');
});
test('removeAccountFromState: рахунок, його борги, запис прихованого зникають; інші рахунки/kind/витрати цілі; суми витрат не змінюються; відв’язування штампує updatedAt', () => {
  const st = fresh();
  const plan = J(ctx.purgeAccountPlan({ kind: 'installment', name: 'iPhone' }, st));
  const res = J(ctx.removeAccountFromState(st, plan, '2026-10-08T00:00:00Z'));
  assert.deepEqual(res, { debts: 1, unlinkedExpenses: 1 });
  assert.deepEqual(st.installmentAccounts.map(a => a.name), ['Dyson']);
  assert.deepEqual(st.debts.map(d => d.id), ['d1', 'd2', 'd3', 'd5']);
  assert.equal(st.hiddenFrom['installment:iPhone'], undefined);
  assert.ok(st.hiddenFrom['card:Моно']);
  const e1 = st.expenses.find(e => e.id === 'e1');
  assert.equal(e1.linkedInstallment, undefined);
  assert.equal(e1.amount, 10, 'сума не змінилась');
  assert.equal(e1.updatedAt, '2026-10-08T00:00:00Z');
  assert.equal(st.expenses.find(e => e.id === 'e2').linkedInstallment, 'Dyson');
  const st2 = fresh();
  const r2 = J(ctx.removeAccountFromState(st2, J(ctx.purgeAccountPlan({ kind: 'card', name: 'Моно' }, st2)), null));
  assert.deepEqual(r2, { debts: 2, unlinkedExpenses: 0 });
  assert.deepEqual(st2.bankAccounts.map(a => a.name), ['Приват']);
  assert.deepEqual(st2.debts.map(d => d.id), ['d3', 'd4', 'd5']);
  assert.equal(st2.expenses.find(e => e.id === 'e1').updatedAt, 'old', 'для картки витрати не чіпаємо');
});
test('після видалення tombstone-рахунок відсутній у масивах, KPI-вхідних даних і виборі (плану більше немає)', () => {
  const st = fresh();
  ctx.removeAccountFromState(st, J(ctx.purgeAccountPlan({ kind: 'card', name: 'Моно' }, st)), null);
  assert.equal(J(ctx.purgeAccountPlan({ kind: 'card', name: 'Моно' }, st)).exists, false);
  assert.ok(!st.bankAccounts.some(a => a.name === 'Моно'));
  assert.ok(!st.debts.some(d => d.kind === 'card' && d.name === 'Моно'));
});
test('filterPurgedAccounts / filterPurgedDebts: бекап не відновлює видалені рахунки й їхні місячні записи; той самий name без cloudId не блокується', () => {
  const purged = [{ kind: 'card', name: 'Моно', cloudId: 'b1', debtIds: ['d1', 'd2'] }];
  const accs = [{ name: 'Моно', cloudId: 'b1' }, { name: 'Моно', cloudId: 'b9' }, { name: 'Моно' }, { name: 'Приват', cloudId: 'b2' }];
  assert.deepEqual(J(ctx.filterPurgedAccounts(accs, purged, 'card')).map(a => a.cloudId || null), ['b9', null, 'b2']);
  assert.equal(J(ctx.filterPurgedAccounts(accs, purged, 'installment')).length, 4, 'інший kind не чіпаємо');
  assert.deepEqual(J(ctx.filterPurgedDebts([{ id: 'd1' }, { id: 'd3' }], purged)).map(d => d.id), ['d3']);
  assert.deepEqual(J(ctx.filterPurgedAccounts(null, null, 'card')), []);
});

// ---------- охоронні тести коду ----------
test('pull: tombstone-рядок прибирає рахунок і не зв’язується/не створює за назвою; select містить deleted_at; reconcile за назвою ігнорує tombstone-рядки', () => {
  assert.match(SRC, /select\('id,name,credit_limit,created_at,updated_at,deleted_at'\)/);
  assert.match(SRC, /select\('id,name,initial_amount,due_day,created_at,updated_at,deleted_at'\)/);
  assert.equal((SRC.match(/if\(row\.deleted_at\)\{ if\(await pullAccountTombstone\(/g) || []).length, 2);
  // tombstone-обробка йде ДО зв'язування за назвою
  const bank = SRC.slice(SRC.indexOf('async function pullBankAccountsCore'), SRC.indexOf('async function pullBankAccountsPilot'));
  assert.ok(bank.indexOf('pullAccountTombstone') < bank.indexOf('bankAccounts.find(function(a){ return a.name === row.name; })'));
  assert.match(SRC, /from\('bank_accounts'\)\.select\('id'\)\.eq\('family_id', cloudFamilyId\)\.eq\('name', acc\.name\)\.is\('deleted_at', null\)\.maybeSingle\(\)/);
  assert.match(SRC, /from\('installment_accounts'\)\.select\('id'\)\.eq\('family_id', cloudFamilyId\)\.eq\('name', acc\.name\)\.is\('deleted_at', null\)\.maybeSingle\(\)/);
});
test('перепис id (applyCensus) не відтворює видалений рахунок: рахунку немає локально, push за назвою ігнорує tombstone-рядок', () => {
  const src = SRC.slice(SRC.indexOf('async function reconcileAccountsCensusFor'), SRC.indexOf('async function reconcileBankAccountsCensus'));
  assert.match(src, /applyCensus\(list, ids, isTestSyncIgnored\)/);
  assert.ok(!/deleted_at/.test(src));
});
test('видалення: порядок Cloud-кроків борги → приховане → рахунок; збій зупиняє до локальних змін; DELETE рахунків клієнтом немає', () => {
  const i = SRC.indexOf('async function runAccountPurge'), code = SRC.slice(i, SRC.indexOf('async function applyAccountRemovalLocally', i));
  assert.ok(code.indexOf("from('debts').update") < code.indexOf("from('hidden_entities').delete()"));
  assert.ok(code.indexOf("from('hidden_entities').delete()") < code.indexOf("'bank_accounts' : 'installment_accounts'"));
  assert.ok(code.indexOf("'bank_accounts' : 'installment_accounts'") < code.indexOf('applyAccountRemovalLocally(plan, true)'));
  assert.match(code, /catch\(err\)\{[\s\S]*?return;\s*\}/);
  assert.ok(!/from\('(bank_accounts|installment_accounts)'\)\.delete/.test(SRC), 'сервер сам видаляє через 30 днів, клієнт — лише tombstone');
  assert.ok(!/from\('expenses'\)\.update/.test(code), 'витрати відв’язуються звичайним оновленням запису, не bulk UPDATE');
  assert.match(code, /isTestSyncIgnored\(acc\)/);
  assert.match(code, /type: 'account-purge'/);
});
test('діалог рахунку: purgeTrashItem додає план; місячні записи йдуть DELETE у debts лише для tombstone; реконсиляція вже охоплює debtMonth/installmentMonth', () => {
  assert.match(SRC, /if\(isAccountTrashType\(item\.type\)\) item\.purgePlan = purgeAccountPlan\(/);
  assert.match(SRC, /isMonthRecordType\(item\.type\) \? 'debts' : item\.type === 'expense'/);
  assert.match(SRC, /debtMonth: \{ table: 'debts'/);
});
test('бекап: restoreBankAccounts/InstallmentAccounts/Debts фільтрують видалені назавжди; журнал поза BACKUP_LS_KEYS', () => {
  assert.match(SRC, /backupList = filterPurgedAccounts\(backupList, readPurgedAccounts\(\), 'card'\)/);
  assert.match(SRC, /backupList = filterPurgedAccounts\(backupList, readPurgedAccounts\(\), 'installment'\)/);
  assert.match(SRC, /backupList = filterPurgedDebts\(backupList, readPurgedAccounts\(\)\)/);
  const keys = SRC.slice(SRC.indexOf('const BACKUP_LS_KEYS = ['), SRC.indexOf('];', SRC.indexOf('const BACKUP_LS_KEYS = [')));
  assert.ok(!/PURGED/.test(keys));
});
test('рекордер: account-purge (kind, debts, unlinkedExpenses) без назв і сум', () => {
  ['kind', 'debts', 'unlinkedExpenses'].forEach(f => assert.match(SRC, new RegExp("DEBUG_EVENT_ALLOWLIST = \\[[\\s\\S]*'" + f + "'")));
  const events = SRC.match(/type: 'account-purge'[^}]*\}/g) || [];
  assert.ok(events.length >= 2);
  events.forEach(e => assert.ok(!/name|title|amount|balance/.test(e), e));
});
test('примітка про старі застосунки є в docs/TESTING.md', () => {
  const t = fs.readFileSync(path.join(__dirname, '..', 'docs', 'TESTING.md'), 'utf8');
  assert.match(t, /старий застосунок[\s\S]*показати видалену картку/);
});
