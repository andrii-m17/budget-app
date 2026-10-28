// Rev 2.32.185 (ID-BIND-3, Етап 3) — перейменування, push, видалення/purge й ключі приховування ОЧ за id. Лише синтетичні дані («Предмет А/Б»).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildSandbox } = require('./extract');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const j = v => JSON.parse(JSON.stringify(v));
const fn = (name) => { const i = SRC.indexOf('function ' + name); assert.ok(i >= 0, name); return SRC.slice(i, SRC.indexOf('\n}\n', i) + 3); };
const NAMES = ['hideKey', 'hideKeyLegacy', 'hideKeyForAccount', 'hiddenEntryKey', 'hiddenEntryFor', 'rekeyHiddenFrom', 'hideEntityFromMonth', 'debtOwnerAccount', 'linkedOwnerAccount', 'findAccountMonthDebt', 'cascadeInstallmentRename', 'debtAccount', 'debtAccountKey', 'purgeAccountPlan', 'removeAccountFromState'];
const env = (g) => buildSandbox(Object.assign({ debts: [], expenses: [], hiddenFrom: {}, ignoredDivergences: {}, bankAccounts: [], installmentAccounts: [] }, g), NAMES);
const A = (name, id) => ({ name, cloudId: id });
const D = (id, name, month, extra) => Object.assign({ id, name, kind: 'installment', month, balance: 1000 }, extra || {});

// ---- ключі приховування ----
test('hideKey: ОЧ з cloudId → «installment:#id»; без cloudId і картки — за назвою (як раніше)', function(){
  const c = env({ installmentAccounts: [A('Предмет А', 'id-a'), { name: 'Предмет Б' }], bankAccounts: [A('Картка', 'b1')] });
  assert.equal(c.hideKey('Предмет А', 'installment'), 'installment:#id-a');
  assert.equal(c.hideKey('Предмет Б', 'installment'), 'installment:Предмет Б');
  assert.equal(c.hideKey('Картка', 'card'), 'card:Картка');
  assert.equal(c.hideKey('Нема', 'installment'), 'installment:Нема');
});
test('сумісність: старий ключ за назвою читається; ключ за id має пріоритет; ключ зі старим id знаходиться за accountName', function(){
  const c = env({ installmentAccounts: [A('Предмет А', 'id-a')], hiddenFrom: { 'installment:Предмет А': { month: '2026-05' } } });
  assert.equal(c.hiddenEntryFor('Предмет А', 'installment').month, '2026-05');
  c.hiddenFrom['installment:#id-a'] = { month: '2026-08' };
  assert.equal(c.hiddenEntryFor('Предмет А', 'installment').month, '2026-08', 'id головніший');
  const c2 = env({ installmentAccounts: [A('Предмет А', 'id-нове')], hiddenFrom: { 'installment:#id-старе': { month: '2026-05', accountName: 'Предмет А' } } });
  assert.equal(c2.hiddenEntryFor('Предмет А', 'installment').month, '2026-05', 'self-heal змінив cloudId — запис не губиться');
});
test('rekeyHiddenFrom: ключі за назвою й за старим id переносяться на поточний cloudId; конфлікт — не перезаписує; без рахунку — не чіпає', function(){
  const c = env({ installmentAccounts: [A('Предмет А', 'id-a'), A('Предмет Б', 'id-b')], hiddenFrom: { 'installment:Предмет А': { month: '2026-05' }, 'installment:#стар': { month: '2026-06', accountName: 'Предмет Б' }, 'installment:Сирота': { month: '2026-07' } } });
  assert.equal(c.rekeyHiddenFrom(), true);
  assert.deepEqual(Object.keys(c.hiddenFrom).sort(), ['installment:#id-a', 'installment:#id-b', 'installment:Сирота']);
  assert.equal(c.hiddenFrom['installment:#id-b'].accountName, 'Предмет Б');
  assert.equal(c.rekeyHiddenFrom(), false, 'ідемпотентно');
  const c2 = env({ installmentAccounts: [A('Предмет А', 'id-a')], hiddenFrom: { 'installment:Предмет А': { month: '2026-05' }, 'installment:#id-a': { month: '2026-09' } } });
  assert.equal(c2.rekeyHiddenFrom(), false); assert.equal(c2.hiddenFrom['installment:#id-a'].month, '2026-09');
});
test('hideEntityFromMonth: старий ключ за назвою переходить у ключ за id (зі збереженням запису), accountName ставиться', function(){
  const c = env({ installmentAccounts: [A('Предмет А', 'id-a')], hiddenFrom: { 'installment:Предмет А': { month: '2026-05', updatedAt: '2026-05-01T00:00:00Z' } } });
  c.hideEntityFromMonth('installment:#id-a', '2026-09', 'installment:Предмет А', 'Предмет А');
  assert.deepEqual(Object.keys(c.hiddenFrom), ['installment:#id-a']);
  assert.equal(c.hiddenFrom['installment:#id-a'].month, '2026-09'); assert.equal(c.hiddenFrom['installment:#id-a'].accountName, 'Предмет А');
});
test('перейменування не ламає приховування: ключ за id не змінюється, accountName оновлюється; старий ключ за назвою переїжджає на id', function(){
  const acc = A('Предмет А', 'id-a');
  const c = env({ installmentAccounts: [acc], hiddenFrom: { 'installment:#id-a': { month: '2026-05', accountName: 'Старий' } } });
  c.cascadeInstallmentRename(acc, 'Старий', 'Предмет А');
  assert.equal(c.hiddenFrom['installment:#id-a'].accountName, 'Предмет А');
  const c2 = env({ installmentAccounts: [acc], hiddenFrom: { 'installment:Старий': { month: '2026-05' } } });
  c2.cascadeInstallmentRename(acc, 'Старий', 'Предмет А');
  assert.deepEqual(Object.keys(c2.hiddenFrom), ['installment:#id-a']);
});

// ---- (а) перейменування за id, (в) без push боргів ----
test('(а) перейменування при боргах у кількох місяцях: усі місяці, зі старою назвою й без назви збігу; чужа ОЧ не чіпається', function(){
  const acc = A('Предмет А', 'id-a');
  const debts = ['2026-03', '2026-04', '2026-05', '2026-06'].map((m, i) => D('d' + i, 'Старий', m, { accountId: 'id-a' })).concat([D('d9', 'Старий', '2026-07', { accountId: 'id-b' })]);
  const c = env({ debts, installmentAccounts: [acc, A('Предмет Б', 'id-b')] });
  const info = j(c.cascadeInstallmentRename(acc, 'Старий', 'Предмет А'));
  assert.equal(info.debts, 4);
  assert.deepEqual(c.debts.map(d => d.name), ['Предмет А', 'Предмет А', 'Предмет А', 'Предмет А', 'Старий']);
});
test('(в) перейменування не викликає push боргів: у блоці перейменування форми немає push, борги не отримують нового updatedAt/syncedUpdatedAt', function(){
  const form = fn('saveInstallmentDrawer');
  const block = form.slice(form.indexOf('if(newName !== oldName){'), form.indexOf('acc.name = newName;'));
  assert.ok(/cascadeInstallmentRename\(acc, oldName, newName\)/.test(block));
  assert.ok(!/pushDebt|pushExpense|updatedAt|syncedUpdatedAt/.test(block.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')), 'у блоці перейменування немає push і зміни updatedAt');
  assert.ok(!/push/i.test(fn('saveDebts')) && !/push/i.test(fn('saveExpenses')), 'saveDebts/saveExpenses лише локальні');
  const acc = A('Предмет А', 'id-a');
  const c = env({ debts: [D('d1', 'Старий', '2026-03', { accountId: 'id-a', updatedAt: '2026-03-05T00:00:00Z', syncedUpdatedAt: '2026-03-05T00:00:00Z' })], installmentAccounts: [acc] });
  c.cascadeInstallmentRename(acc, 'Старий', 'Предмет А');
  assert.equal(c.debts[0].updatedAt, '2026-03-05T00:00:00Z'); assert.equal(c.debts[0].syncedUpdatedAt, '2026-03-05T00:00:00Z');
});

// ---- (б) збереження форми зі застарілою назвою не дає дубля ----
test('(б) борг місяця шукається спершу за accountId, потім за назвою: борг зі застарілою назвою знаходиться, другий не створюється', function(){
  const acc = A('Предмет А', 'id-a');
  const debts = [D('s1', 'Старий', '2026-07', { accountId: 'id-a' }), D('s2', 'Предмет Б', '2026-07', { accountId: 'id-b' })];
  const c = env({ debts, installmentAccounts: [acc] });
  assert.equal(c.findAccountMonthDebt(c.debts, acc, '2026-07', 'installment').id, 's1');
  assert.equal(c.findAccountMonthDebt(c.debts, acc, '2026-08', 'installment'), undefined);
  const c2 = env({ debts: [D('n1', 'Предмет А', '2026-07')], installmentAccounts: [acc] });
  assert.equal(c2.findAccountMonthDebt(c2.debts, acc, '2026-07', 'installment').id, 'n1', 'борг без id — за назвою');
  const c3 = env({ debts: [D('x', 'Предмет А', '2026-07', { accountId: 'id-інша' })], installmentAccounts: [acc] });
  assert.equal(c3.findAccountMonthDebt(c3.debts, acc, '2026-07', 'installment'), undefined, 'борг іншої ОЧ з тією самою назвою не береться');
  const form = fn('saveInstallmentDrawer');
  assert.match(form, /findAccountMonthDebt\(debts, acc, selectedMonth, 'installment'\)/);
  assert.ok(!/const existingIdx = debts\.findIndex\(function\(d\)\{ return d\.name===newName/.test(form));
});

// ---- push за id ----
test('push: рахунок боргу/витрати — за accountId/linkedInstallmentId, запасний варіант — назва; не знайдено — null (запис лишається непушнутим)', function(){
  const accs = [A('Предмет А', 'id-a'), A('Предмет Б', 'id-b')];
  const c = env({ installmentAccounts: accs, bankAccounts: [A('Картка', 'k1')] });
  assert.equal(c.debtOwnerAccount({ kind: 'installment', name: 'Старий', accountId: 'id-a' }).name, 'Предмет А');
  assert.equal(c.debtOwnerAccount({ kind: 'installment', name: 'Предмет Б' }).cloudId, 'id-b');
  assert.equal(c.debtOwnerAccount({ kind: 'installment', name: 'Невідомо', accountId: 'id-нема' }), null);
  assert.equal(c.debtOwnerAccount({ kind: 'card', name: 'Картка' }).cloudId, 'k1');
  assert.equal(c.linkedOwnerAccount({ linkedInstallment: 'Старий', linkedInstallmentId: 'id-b' }).name, 'Предмет Б');
  assert.equal(c.linkedOwnerAccount({ linkedInstallment: 'Предмет А' }).cloudId, 'id-a');
});
test('push: у payload борг іде з назвою рахунку, не застарілою; push-функції шукають через debtOwnerAccount/linkedOwnerAccount', function(){
  ['pushDebtRecordPilot', 'pushDebtsBatch'].forEach(n => { const f = fn(n); assert.match(f, /debtOwnerAccount\(rec\)/); assert.ok(!/(bankAccounts|installmentAccounts)\.find\(function\(\w\)\{ return \w\.name === rec\.name; \}\)/.test(f.replace(/\/\/[^\n]*/g, '')), n + ': пошук за назвою прибрано'); });
  ['pushExpenseRecordPilotCore', 'pushExpensesBatch'].forEach(n => { const f = fn(n); assert.match(f, /linkedOwnerAccount\(rec\)/); });
  assert.match(fn('pushDebtRecordPilot'), /name: \(debtOwnerAccount\(rec\) \|\| rec\)\.name/);
  assert.match(fn('pushDebtRecordPilot'), /unresolved: true/);
});

// ---- (4) видалення й purge за записом ----
test('purge за записом: борги й витрати — за id рахунку (зі застарілою назвою теж), борги ОЧ з такою самою назвою, але іншим id — лишаються; ключі приховування за id й за назвою видаляються', function(){
  const accs = [A('Предмет А', 'id-a'), A('Предмет А', 'id-b')];
  const state = { bankAccounts: [], installmentAccounts: accs,
    debts: [D('1', 'Старий', '2026-03', { accountId: 'id-a' }), D('2', 'Предмет А', '2026-04', { accountId: 'id-a' }), D('3', 'Предмет А', '2026-04', { accountId: 'id-b' }), D('4', 'Предмет А', '2026-05')],
    expenses: [{ id: 'e1', linkedInstallment: 'Старий', linkedInstallmentId: 'id-a' }, { id: 'e2', linkedInstallment: 'Предмет А', linkedInstallmentId: 'id-b' }],
    hiddenFrom: { 'installment:#id-a': { month: '2026-09' }, 'installment:Предмет А': { month: '2026-09' } } };
  const c = env({});
  const plan = j(c.purgeAccountPlan({ kind: 'installment', name: 'Предмет А', cloudId: 'id-a' }, state));
  assert.equal(plan.cloudId, 'id-a');
  assert.deepEqual(plan.debtIds.sort(), ['1', '2']);
  assert.deepEqual(plan.linkedExpenseIds, ['e1']);
  assert.deepEqual(plan.hiddenKeys.sort(), ['installment:#id-a', 'installment:Предмет А']);
  const res = j(c.removeAccountFromState(state, plan, '2026-10-01T00:00:00Z'));
  assert.deepEqual(state.installmentAccounts.map(a => a.cloudId), ['id-b'], 'видалено саме запис id-a');
  assert.deepEqual(state.debts.map(d => d.id).sort(), ['3', '4']);
  assert.equal(state.expenses[0].linkedInstallment, undefined); assert.equal(state.expenses[1].linkedInstallment, 'Предмет А');
  assert.deepEqual(Object.keys(state.hiddenFrom), []);
  assert.equal(res.debts, 2); assert.equal(res.unlinkedExpenses, 1);
});
test('purge без cloudId/id: запасний варіант за назвою працює як раніше (план без debtIds теж)', function(){
  const c = env({});
  const state = { bankAccounts: [], installmentAccounts: [{ name: 'Предмет А' }], debts: [D('1', 'Предмет А', '2026-03'), D('2', 'Предмет Б', '2026-03')], expenses: [{ id: 'e', linkedInstallment: 'Предмет А' }], hiddenFrom: {} };
  const res = j(c.removeAccountFromState(state, { kind: 'installment', name: 'Предмет А' }, null));
  assert.deepEqual(state.debts.map(d => d.id), ['2']); assert.equal(res.debts, 1); assert.equal(state.installmentAccounts.length, 0);
});
test('охоронні: нових полів у push нема, формули залишку не змінено, нових полів вводу нема', function(){
  assert.ok(!/upsert\(\{[^}]*(accountName|accountId)/.test(SRC.replace(/\/\/[^\n]*/g, '')));
  assert.match(SRC, /function installmentChainCalc\(spec, month\)/);
  assert.match(SRC, /const startBal = factRec \? Number\(factRec\.balance\) : calcBefore;/);
});
