// Rev 2.32.237 (CARD-BY-ID): картки — ключі приховування, групування боргів і каскад перейменування за id. Лише синтетичні дані («Картка А/Б»).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildSandbox } = require('./extract');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const j = v => JSON.parse(JSON.stringify(v));
const NAMES = ['hideKey', 'hideKeyLegacy', 'hideKeyForAccount', 'hasIdHideKey', 'accountsOfKind', 'hiddenEntryKey', 'hiddenEntryFor', 'rekeyHiddenFrom', 'hideEntityFromMonth', 'debtOwnerAccount', 'findAccountMonthDebt', 'cascadeInstallmentRename', 'cascadeAccountRename', 'cascadeCardRename', 'debtAccount', 'debtAccountKey', 'debtDisplayName', 'isHiddenForMonth'];
const env = (g) => buildSandbox(Object.assign({ debts: [], expenses: [], hiddenFrom: {}, ignoredDivergences: {}, bankAccounts: [], installmentAccounts: [] }, g), NAMES);
const C = (name, id) => ({ name, cloudId: id });
const D = (id, name, month, extra) => Object.assign({ id, name, kind: 'card', month, balance: 1000 }, extra || {});

test('ключ приховування картки: з cloudId — «card:#id», без — за назвою; старий ключ за назвою читається й має нижчий пріоритет', () => {
  const c = env({ bankAccounts: [C('Картка А', 'b1'), { name: 'Картка Б' }], hiddenFrom: { 'card:Картка А': { month: '2026-05' } } });
  assert.equal(c.hideKey('Картка А', 'card'), 'card:#b1'); assert.equal(c.hideKey('Картка Б', 'card'), 'card:Картка Б'); assert.equal(c.hideKey('Нема', 'card'), 'card:Нема');
  assert.equal(c.hiddenEntryFor('Картка А', 'card').month, '2026-05', 'старий ключ читається');
  c.hiddenFrom['card:#b1'] = { month: '2026-08' };
  assert.equal(c.hiddenEntryFor('Картка А', 'card').month, '2026-08', 'ключ за id головніший');
  assert.equal(c.isHiddenForMonth('Картка А', 'card', '2026-09'), true); assert.equal(c.isHiddenForMonth('Картка А', 'card', '2026-07'), false);
});
test('rekeyHiddenFrom переносить ключі карток за назвою й зі старим id на поточний cloudId; ключі ОЧ не плутаються', () => {
  const c = env({ bankAccounts: [C('Картка А', 'b1'), C('Картка Б', 'b2')], installmentAccounts: [C('Предмет А', 'i1')], hiddenFrom: { 'card:Картка А': { month: '2026-05' }, 'card:#старий': { month: '2026-06', accountName: 'Картка Б' }, 'installment:Предмет А': { month: '2026-07' } } });
  assert.equal(c.rekeyHiddenFrom(), true);
  assert.deepEqual(Object.keys(j(c.hiddenFrom)).sort(), ['card:#b1', 'card:#b2', 'installment:#i1']);
  assert.equal(c.hiddenFrom['card:#b2'].accountName, 'Картка Б');
});
test('каскад перейменування картки: борги за id (і без id за старою назвою), без нового updatedAt; ключ приховування лишається, accountName оновлюється; другий власник старої назви не чіпається', () => {
  const acc = C('Картка А', 'b1');
  const c = env({ bankAccounts: [acc], hiddenFrom: { 'card:#b1': { month: '2026-05', accountName: 'Картка А' } }, debts: [D('d1', 'Картка А', '2026-01', { accountId: 'b1', updatedAt: 'U' }), D('d2', 'Стара', '2026-02', { accountId: 'b1' }), D('d3', 'Картка А', '2026-03'), D('d4', 'Картка А', '2026-04', { kind: 'installment' })] });
  const ci = c.cascadeCardRename(acc, 'Картка А', 'Картка Нова');
  assert.deepEqual(c.debts.map(d => d.name), ['Картка Нова', 'Картка Нова', 'Картка Нова', 'Картка А'], 'ОЧ з тією ж назвою не чіпається');
  assert.equal(ci.debts, 3); assert.equal(c.debts[0].updatedAt, 'U', 'updatedAt боргів не змінюється (push не потрібен)');
  assert.equal(ci.hidden, true); assert.equal(c.hiddenFrom['card:#b1'].accountName, 'Картка Нова');
  const dup = env({ bankAccounts: [C('Картка А', 'b1'), C('Картка А', 'b2')], debts: [D('d1', 'Картка А', '2026-01'), D('d2', 'Картка А', '2026-02', { accountId: 'b1' })] });
  dup.cascadeCardRename(dup.bankAccounts[0], 'Картка А', 'Картка Н');
  assert.deepEqual(dup.debts.map(d => d.name), ['Картка А', 'Картка Н'], 'борг без id при дублі назви не переноситься (неоднозначно)');
});
test('групування й пошук боргу картки за місяць: за id, запасний варіант — назва; без id лишається за назвою', () => {
  const acc = C('Картка Нова', 'b1');
  const c = env({ bankAccounts: [acc], debts: [D('d1', 'Стара', '2026-01', { accountId: 'b1' }), D('d2', 'Картка Нова', '2026-02')] });
  assert.equal(c.findAccountMonthDebt(c.debts, acc, '2026-01', 'card').id, 'd1', 'за id, хоч назва в боргу стара');
  assert.equal(c.findAccountMonthDebt(c.debts, acc, '2026-02', 'card').id, 'd2', 'без id — за назвою');
  assert.equal(c.debtAccountKey(c.debts[0]), 'card:#b1'); assert.equal(c.debtAccountKey(D('x', 'Сирота', '2026-01')), 'card:Сирота');
  assert.equal(c.debtDisplayName(c.debts[0]), 'Картка Нова');
});
test('джерело: UI перейменування картки й pull каскадують через cascadeCardRename (без debts.forEach за назвою); push боргу картки за id, без картки — unresolved; мок має тригер боргів картки', () => {
  assert.ok(!/debts\.forEach\(function\(d\)\{ if\(d\.name===oldName && d\.kind==='card'\) d\.name = newName; \}\);/.test(SRC));
  assert.match(SRC, /const cardRename = cascadeCardRename\(acc, oldName, newName\);/);
  assert.match(SRC, /const ci = cascadeCardRename\(byCloudId, oldCardName, row\.name\);/);
  assert.match(SRC, /afterMerge: function\(rec, oldName\)\{\n      if\(!oldName \|\| oldName === rec\.name\) return;\n      const ci = cascadeCardRename/);
  assert.match(SRC, /if\(rec\.kind === 'card'\)\{\n    const acc = debtOwnerAccount\(rec\);[^\n]*\n    if\(!acc \|\| !acc\.cloudId\) return \{ success: true, unresolved: true \};/);
  assert.match(fs.readFileSync(path.join(__dirname, '..', 'dev', 'mock-cloud.js'), 'utf8'), /trg_sync_debt_names_bank/);
});
