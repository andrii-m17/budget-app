// Rev 2.32.136: початковий стан без стандартних карток: немає DEFAULT_BANKS, clearAllData лишає [], імпорт Excel створює відсутні картки зі стовпців, у коді немає імен членів родини в стандартних назвах.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildSandbox, evalInSandbox } = require('./extract');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const j = v => JSON.parse(JSON.stringify(v));

test('DEFAULT_BANKS видалено; жодного засіву в loadBankAccounts/clearAllData/catch-гілках', function(){
  assert.ok(!/const DEFAULT_BANKS\b/.test(SRC) && !/DEFAULT_BANKS\.map/.test(SRC));
  const load = SRC.slice(SRC.indexOf('async function loadBankAccounts('), SRC.indexOf('async function loadInstallmentAccounts('));
  assert.ok(!/DEFAULT_BANKS|creditLimit: null \}; \}\)/.test(load.replace(/\/\/[^\n]*/g, '')), 'жодного засіву');
  assert.equal((load.match(/bankAccounts = \[\];/g) || []).length >= 4, true, 'порожній список у всіх гілках (без ключа ×2, catch ×2)');
});
test('clearAllData лишає порожній список карток і порожні ОЧ', function(){
  const fn = SRC.slice(SRC.indexOf('function clearAllData('), SRC.indexOf('function clearAllData(') + 6000);
  assert.match(fn, /bankAccounts = \[\];[^\n]*\n\s*installmentAccounts = \[\];/);
  assert.ok(!/DEFAULT_BANKS/.test(fn));
});
test('стовпці банків Excel: нейтральні назви без емодзі й без імен членів родини; idx 15…21; усі kind=card', function(){
  const c = buildSandbox({}, ['EXCEL_DEBT_COLUMNS']);
  const cols = j(evalInSandbox(c, 'EXCEL_DEBT_COLUMNS'));
  assert.deepEqual(cols.map(x => x.idx), [15, 16, 17, 18, 19, 20, 21]);
  assert.ok(cols.every(x => x.kind === 'card' && !/[\u{1F300}-\u{1FAFF}⬛️]/u.test(x.name) && !/Оля/.test(x.name)));
  assert.equal(new Set(cols.map(x => x.name)).size, 7, 'назви унікальні');
});
test('importEnsureAccounts: створює відсутні картки з createdAt/updatedAt, не дублює наявні; ОЧ — як раніше; повертає кількість', function(){
  const c = buildSandbox({}, ['importEnsureAccounts']);
  const banks = [{ name: 'Приват Банк', creditLimit: 1000 }];
  const insts = [];
  const debts = [{ kind: 'card', name: 'Приват Банк' }, { kind: 'card', name: 'Моно Банк' }, { kind: 'card', name: 'Моно Банк' }, { kind: 'installment', name: 'ОЧ А' }];
  const r = j(c.importEnsureAccounts(debts, banks, insts, '2026-10-22T10:00:00.000Z'));
  assert.deepEqual(r, { addedCards: 1, addedInstallments: 1 });
  assert.deepEqual(j(banks), [{ name: 'Приват Банк', creditLimit: 1000 }, { name: 'Моно Банк', creditLimit: null, createdAt: '2026-10-22T10:00:00.000Z', updatedAt: '2026-10-22T10:00:00.000Z' }]);
  assert.deepEqual(j(insts), [{ name: 'ОЧ А', initialAmount: null }]);
  assert.deepEqual(j(c.importEnsureAccounts([], banks, insts, 'x')), { addedCards: 0, addedInstallments: 0 });
});
test('імпорт: нові картки зберігаються й пушаться (pushBankAccountsPilot), виклик після збереження', function(){
  assert.match(SRC, /const ensured = importEnsureAccounts\(debts, bankAccounts, installmentAccounts, new Date\(\)\.toISOString\(\)\);/);
  assert.match(SRC, /if\(ensured\.addedCards > 0\)\{ try\{ await pushBankAccountsPilot\(\); \}catch\(e\)\{\} \}/);
});
test('у коді немає імен членів родини в стандартних назвах банків/ОЧ (Приват Банк Оля / Моно Банк Оля)', function(){
  assert.ok(!/Приват Банк Оля|Моно Банк Оля/.test(SRC), 'ні в коді, ні в коментарях');
});
