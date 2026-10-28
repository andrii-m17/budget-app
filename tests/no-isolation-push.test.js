// Rev 2.32.82+ (ISOL-1, доробка): поведінкові тести push витрат, доходів і боргів — запис із назвою на «TRASH-TEST-» відправляється так само, як звичайний
// (раніше для цих типів був лише охоронний текстовий тест у no-isolation.test.js).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildSandbox } = require('./extract');

const NAMES = ['AMOUNT_MAX', 'isSyncableAmount', 'monoSourcePayload', 'editedAtPayload', 'expenseEditedAtValue', 'isCloudWriteReady', 'isWriteBlocked',
  'pushExpenseRecordPilot', 'linkedOwnerAccount', 'pushExpensesBatch', 'pushIncomeRecordPilot', 'pushIncomesBatch', 'pushDebtRecordPilot', 'debtOwnerAccount', 'pushDebtsBatch'];
function make(){
  const upserts = [];
  const client = { from(table){ return { upsert(payload, opts){ upserts.push({ table, payload: JSON.parse(JSON.stringify(payload)), opts }); return Promise.resolve({ error: null }); } }; } };
  const g = {
    CLOUD_ENV: { env: 'mock' }, isCloudSessionReady: function(){ return true; }, getSupabaseClient: function(){ return client; }, cloudSession: { user: { id: 'u1' } }, cloudFamilyId: 'fam',
    saveExpenses: async function(){}, saveIncomes: async function(){}, saveDebts: async function(){}, saveBankAccountsLocal: async function(){}, saveInstallmentAccountsLocal: async function(){},
    pullExpensesCore: async function(){}, pullIncomesCore: async function(){}, pullDebtsCore: async function(){},
    bankAccounts: [{ name: 'TRASH-TEST-card', cloudId: 'b-test' }, { name: 'Звичайна', cloudId: 'b-1' }], installmentAccounts: [{ name: 'TRASH-TEST-inst', cloudId: 'i-test' }],
  };
  const c = buildSandbox(g, NAMES); c.__upserts = upserts; return c;
}
const stamp = '2026-10-15T10:00:00.000Z';
const exp = name => ({ id: 'e-' + name, name, amount: 100, date: '2026-10-10', category: 'К', subcategory: '', createdAt: stamp, updatedAt: stamp });
const inc = name => ({ id: 'i-' + name, source: name, amount: 500, date: '2026-10-05', createdAt: stamp, updatedAt: stamp });
const debt = (name, kind) => ({ id: 'd-' + name, name, kind, month: '2026-10', balance: 1000, minPayment: 100, createdAt: stamp, updatedAt: stamp });

test('ISOL-1: витрата з назвою TRASH-TEST-… пушиться як звичайна (окремий запис і пакет)', async function(){
  const c = make();
  for(const name of ['TRASH-TEST-вит', 'Звичайна витрата']){
    const r = exp(name);
    assert.equal((await c.pushExpenseRecordPilot(r, { suppressPull: true })).success, true);
    assert.equal(r.syncedUpdatedAt, stamp, name + ': позначено синхронізованою');
  }
  const batch = [exp('TRASH-TEST-пакет'), exp('Звичайна пакет')];
  assert.deepEqual(JSON.parse(JSON.stringify(await c.pushExpensesBatch(batch))), { pushed: 2, failed: 0 });
  assert.deepEqual(c.__upserts.map(u => u.table), ['expenses', 'expenses', 'expenses']);
  assert.deepEqual(c.__upserts.map(u => [].concat(u.payload).map(p => p.note)).flat(), ['TRASH-TEST-вит', 'Звичайна витрата', 'TRASH-TEST-пакет', 'Звичайна пакет']);
});
test('ISOL-1: дохід із джерелом TRASH-TEST-… пушиться як звичайний (окремий запис і пакет)', async function(){
  const c = make();
  for(const name of ['TRASH-TEST-дох', 'Звичайний дохід']){
    const r = inc(name);
    assert.equal((await c.pushIncomeRecordPilot(r, { suppressPull: true })).success, true);
    assert.equal(r.syncedUpdatedAt, stamp);
  }
  assert.deepEqual(JSON.parse(JSON.stringify(await c.pushIncomesBatch([inc('TRASH-TEST-пакет'), inc('Звичайний пакет')]))), { pushed: 2, failed: 0 });
  assert.deepEqual(c.__upserts.map(u => [].concat(u.payload).map(p => p.note)).flat(), ['TRASH-TEST-дох', 'Звичайний дохід', 'TRASH-TEST-пакет', 'Звичайний пакет']);
});
test('ISOL-1: борг тестової картки/ОЧ пушиться як звичайний (окремий запис і пакет)', async function(){
  const c = make();
  const a = debt('TRASH-TEST-card', 'card'), b = debt('Звичайна', 'card'), d = debt('TRASH-TEST-inst', 'installment');
  for(const r of [a, b, d]){ assert.equal((await c.pushDebtRecordPilot(r, { suppressPull: true })).success, true); assert.equal(r.syncedUpdatedAt, stamp, r.name); }
  assert.deepEqual(JSON.parse(JSON.stringify(await c.pushDebtsBatch([debt('TRASH-TEST-card', 'card'), debt('TRASH-TEST-inst', 'installment')]))), { pushed: 2, failed: 0 });
  const names = c.__upserts.map(u => [].concat(u.payload).map(p => p.name)).flat();
  assert.deepEqual(names, ['TRASH-TEST-card', 'Звичайна', 'TRASH-TEST-inst', 'TRASH-TEST-card', 'TRASH-TEST-inst']);
  assert.equal(c.__upserts[0].payload.bank_account_id, 'b-test'); assert.equal(c.__upserts[2].payload.installment_account_id, 'i-test');
});
test('ISOL-1: у режимі «лише перегляд» ті самі записи НЕ пушаться (захист не залежить від імені)', async function(){
  const c = make();
  const ro = buildSandbox({ CLOUD_ENV: { env: 'readonly' }, isCloudSessionReady: function(){ return true; }, getSupabaseClient: function(){ throw new Error('не мав викликатись'); }, cloudSession: { user: { id: 'u' } }, cloudFamilyId: 'fam' }, NAMES);
  assert.deepEqual(JSON.parse(JSON.stringify(await ro.pushExpensesBatch([exp('TRASH-TEST-x')]))), { pushed: 0, failed: 0 });
  assert.equal((await ro.pushIncomeRecordPilot(inc('TRASH-TEST-x'))).success, true);
  assert.equal(c.__upserts.length, 0);
});
