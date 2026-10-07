// Rev 2.23.32 (6D.201) — ізоляція тестових записів "TRASH-TEST-" від синхронізації + очищення на пристрої.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildSandbox } = require('./extract');

const j = function(v){ return JSON.parse(JSON.stringify(v)); };
const SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
function ls(value){ return { getItem: function(){ return value; } }; }
const NAMES = ['TEST_IGNORE_LS_KEY', 'isTestRecordName', 'syncNameOf', 'shouldIgnoreForSync', 'isTestHiddenKey', 'testIgnoreFlag', 'isTestSyncIgnored', 'syncableRecords', 'filterTestRows', 'collectTestRecords', 'countTestRecords', 'describeTestRecords', 'applyCensus', 'pluralUa'];
const mk = function(flag){ return buildSandbox({ localStorage: ls(flag) }, NAMES); };

test('isTestRecordName: лише початок, регістр неважливий; «Мій TRASH-TEST-», «Test», «Тестова картка» не збігаються', () => {
  const c = mk(null);
  ['TRASH-TEST-G3-card', 'trash-test-1', 'Trash-Test-X', 'TRASH-TEST-'].forEach(function(n){ assert.equal(c.isTestRecordName(n), true, n); });
  ['Мій TRASH-TEST-1', 'Test', 'Тестова картка', 'TRASH-TEST', 'TRASHTEST-1', '', null, undefined, 5].forEach(function(n){ assert.equal(c.isTestRecordName(n), false, String(n)); });
});
test('shouldIgnoreForSync: ім\'я з name / source / kw / keyword; прапор "0" вимикає ізоляцію', () => {
  const c = mk(null);
  assert.equal(c.shouldIgnoreForSync({ name: 'TRASH-TEST-a' }, null), true);
  assert.equal(c.shouldIgnoreForSync({ source: 'trash-test-inc' }, undefined), true);
  assert.equal(c.shouldIgnoreForSync({ kw: 'trash-test-w' }, '1'), true);
  assert.equal(c.shouldIgnoreForSync({ keyword: 'TRASH-TEST-w' }, null), true);
  assert.equal(c.shouldIgnoreForSync({ name: 'TRASH-TEST-a' }, '0'), false, 'прапор 0 — не ігнорувати');
  assert.equal(c.shouldIgnoreForSync({ name: 'Моно' }, null), false);
  assert.equal(c.shouldIgnoreForSync({ name: 'Мій TRASH-TEST-1' }, null), false);
  assert.equal(c.shouldIgnoreForSync(null, null), false);
});
test('syncableRecords / filterTestRows / isTestHiddenKey: ізоляція ввімкнена за замовчуванням, вимикається прапором 0', () => {
  const list = [{ name: 'Моно' }, { name: 'TRASH-TEST-x' }, { name: 'Тестова картка' }];
  assert.deepEqual(j(mk(null).syncableRecords(list)), [{ name: 'Моно' }, { name: 'Тестова картка' }]);
  assert.deepEqual(j(mk('1').syncableRecords(list)), [{ name: 'Моно' }, { name: 'Тестова картка' }]);
  assert.equal(mk('0').syncableRecords(list).length, 3);
  const rows = [{ name: 'a' }, { name: 'TRASH-TEST-b' }, { name: null }];
  assert.equal(mk(null).filterTestRows(rows, 'name').length, 2);
  assert.equal(mk('0').filterTestRows(rows, 'name').length, 3);
  assert.equal(mk(null).filterTestRows(rows, null).length, 3);
  const c = mk(null);
  assert.equal(c.isTestHiddenKey('card:TRASH-TEST-G3-card2'), true);
  assert.equal(c.isTestHiddenKey('installment:trash-test-x'), true);
  assert.equal(c.isTestHiddenKey('card:Моно'), false);
  assert.equal(c.isTestHiddenKey('card:Мій TRASH-TEST-1'), false);
});
test('перепис id (applyCensus): тестові записи не скидаються й не відтворюються; звичайні — як раніше', () => {
  const c = mk(null);
  const t = { name: 'TRASH-TEST-a', cloudId: 'c1', syncedUpdatedAt: 's' }, n = { name: 'Моно', cloudId: 'c2', syncedUpdatedAt: 's' };
  const res = c.applyCensus([t, n], ['other'], c.isTestSyncIgnored);
  assert.deepEqual(j(res), { reset: 1, dropped: 0 });
  assert.equal(t.cloudId, 'c1'); assert.equal(t.syncedUpdatedAt, 's');
  assert.equal(n.cloudId, null);
  const t2 = { name: 'TRASH-TEST-a', cloudId: 'c1' };
  assert.deepEqual(j(buildSandbox({ localStorage: ls('0') }, NAMES).applyCensus([t2], ['x'], function(e){ return buildSandbox({ localStorage: ls('0') }, NAMES).isTestSyncIgnored(e); })), { reset: 1, dropped: 0 }, 'прапор 0 — тестовий запис теж звіряється');
});
function state(){
  return {
    bankAccounts: [{ name: 'TRASH-TEST-G3-card' }, { name: 'trash-test-card2' }, { name: 'Моно' }, { name: 'Тестова картка' }],
    installmentAccounts: [{ name: 'TRASH-TEST-G3-inst2' }, { name: 'Мій TRASH-TEST-1' }],
    debts: [{ kind: 'card', name: 'TRASH-TEST-G3-card' }, { kind: 'installment', name: 'TRASH-TEST-G3-inst2' }, { kind: 'card', name: 'Моно' }],
    expenses: [{ name: 'TRASH-TEST-E' }, { name: 'Кава' }], incomes: [{ source: 'ЗП Андрій' }],
    categories: [{ name: 'TRASH-TEST-cat' }, { name: 'Їжа' }], subcategories: [{ name: 'trash-test-sub' }], dictionary: [{ kw: 'trash-test-w' }, { kw: 'кава' }],
    hiddenFrom: { 'card:TRASH-TEST-G3-card2': {}, 'installment:TRASH-TEST-G3-inst2': {}, 'card:Моно': {} },
  };
}
test('collectTestRecords / describeTestRecords: усі домени, підсумок збігається з кількістю', () => {
  const c = mk(null);
  const found = c.collectTestRecords(state());
  assert.deepEqual([found.cards.length, found.installments.length, found.debts.length, found.expenses.length, found.incomes.length, found.categories.length, found.subcategories.length, found.words.length, found.hidden.length], [2, 1, 2, 1, 0, 1, 1, 1, 2]);
  assert.equal(c.countTestRecords(found), 11);
  assert.equal(c.describeTestRecords(found), '2 картки, 1 ОЧ, 2 борги, 1 витрата, 1 категорія, 1 підкатегорія, 1 слово, 2 приховані');
  assert.equal(c.describeTestRecords(c.collectTestRecords({})), '');
});
test('кнопка очищення: прибирає лише тестові записи (усі домени), звичайні лишає; без push і tombstone; підсумок = видалене', async () => {
  const st = state();
  const events = [], saved = [], toasts = [];
  const g = Object.assign({}, st, { CATEGORIES: st.categories, SUBCATEGORIES: st.subcategories, DICTIONARY: st.dictionary, localStorage: ls(null),
    captureDebugGeometry: function(t, x){ events.push([t, x]); }, showTrashToast: function(t){ toasts.push(t); },
    populateMonths(){}, renderAll(){}, renderStructure(){}, populateBankDebtTable(){}, populateInstallmentTable(){}, populateCategorySelect(){},
    saveBankAccountsLocal: async function(){ saved.push('banks'); }, saveInstallmentAccountsLocal: async function(){ saved.push('insts'); }, saveDebts: async function(){ saved.push('debts'); },
    saveExpenses: async function(){ saved.push('exp'); }, saveIncomes: async function(){ saved.push('inc'); }, saveCategoriesLocal: async function(){ saved.push('cats'); },
    saveSubcategoriesLocal: async function(){ saved.push('subs'); }, saveDictionaryLocal: async function(){ saved.push('dict'); }, saveHiddenFromLocal: async function(){ saved.push('hidden'); } });
  const c = buildSandbox(g, NAMES.concat(['cleanupTestRecordsNow']));
  await c.cleanupTestRecordsNow();
  assert.deepEqual(j(st.bankAccounts), [{ name: 'Моно' }, { name: 'Тестова картка' }]);
  assert.deepEqual(j(st.installmentAccounts), [{ name: 'Мій TRASH-TEST-1' }]);
  assert.deepEqual(j(st.debts), [{ kind: 'card', name: 'Моно' }]);
  assert.deepEqual(j(st.expenses), [{ name: 'Кава' }]); assert.deepEqual(j(st.incomes), [{ source: 'ЗП Андрій' }]);
  assert.deepEqual(j(st.categories), [{ name: 'Їжа' }]); assert.deepEqual(j(st.subcategories), []); assert.deepEqual(j(st.dictionary), [{ kw: 'кава' }]);
  assert.deepEqual(Object.keys(st.hiddenFrom), ['card:Моно']);
  assert.equal(events.length, 1); assert.equal(events[0][0], 'test-cleanup'); assert.equal(events[0][1].cleanedTotal, 11);
  assert.deepEqual(Object.keys(events[0][1]).sort(), ['cleanedAccounts', 'cleanedDebts', 'cleanedRecords', 'cleanedStructure', 'cleanedTotal'], 'лише кількості, без назв');
  assert.ok(toasts[0].indexOf('2 картки, 1 ОЧ, 2 борги') !== -1);
  assert.equal(c.countTestRecords(c.collectTestRecords(st)), 0);
});
test('джерело (6D.201): усі pull-цикли фільтрують тестові рядки, push-обгортки ігнорують тестові записи, hidden теж; Cloud-видалення відсутнє', () => {
  assert.equal((SRC.match(/for\(const row of filterTestRows\(data, '/g) || []).length, 8);
  ['pushExpenseRecordPilot(rec, opts)', 'pushIncomeRecordPilot(rec, opts)', 'pushDebtRecordPilot(rec, opts)'].forEach(function(fn){
    const at = SRC.indexOf('async function ' + fn);
    assert.ok(SRC.slice(at, at + 400).indexOf('isTestSyncIgnored(rec)') !== -1, fn);
  });
  ['pushExpensesBatched', 'pushIncomesBatched', 'pushDebtsBatched'].forEach(function(fn){
    const at = SRC.indexOf('async function ' + fn + '(records');
    assert.ok(SRC.slice(at, at + 300).indexOf('syncableRecords(records)') !== -1, fn);
  });
  assert.ok(/if\(testIgnoreFlag\(\) !== '0' && isTestHiddenKey\(key\)\) continue;/.test(SRC));
  const cleanup = SRC.slice(SRC.indexOf('async function cleanupTestRecordsNow'), SRC.indexOf('function resetAllTestVariantsFromUi'));
  assert.equal(/\.from\(|pushExpenseRecordPilot|pushDebtRecordPilot|deletedAt/.test(cleanup), false, 'очищення — лише локально, без Cloud/tombstone');
});
