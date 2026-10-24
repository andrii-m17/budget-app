// Rev 2.32.125 (BUG-OCH): resolveInstallmentFact не губить збережений факт, коли оцінки залишку нема; «—» замість «0»; видима відмова без початкової суми. Сценарії S1–S5 зі звіту Кроку 0 (синтетика).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildSandbox, evalInSandbox } = require('./extract');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const NAME = 'ОЧ А';
const D = function(m, b, p){ return { name: NAME, kind: 'installment', month: m, balance: b, monthlyPayment: p }; };
const E = function(date, amount){ return { id: date, date: date, amount: amount, linkedInstallment: NAME }; };
function resolve(debts, expenses, month){
  const ctx = buildSandbox({ debts: debts, expenses: expenses, hiddenFrom: {}, installmentAccounts: [] },
    ['hideKey', 'isHiddenForMonth', 'typicalMonthlyPayment', 'lastKnownBalance', 'monthKey', 'linkedExpensesSum', 'OCH_OVALS_MAX', 'installmentStandardPayment', 'installmentPaymentsLeft', 'installmentPayAmount', 'installmentTypicalPay', 'ppPad', 'ppNextMonth', 'ochMonthIndex', 'ochPlannedPaymentsBefore', 'ochOpeningBalance', 'installmentChainCalc', 'installmentChainSpec', 'installmentBalanceBefore', 'estimateInstallment', 'resolveInstallmentFact', 'activeDebts', 'activeExpenses']);
  const ex = debts.filter(function(d){ return d.month === month && !d.deletedAt; })[0] || null;
  return JSON.parse(evalInSandbox(ctx, 'JSON.stringify(resolveInstallmentFact(' + JSON.stringify(NAME) + ',' + JSON.stringify(month) + ',' + JSON.stringify(ex) + '))'));
}
test('S1: перший місяць, є прив\'язана витрата, оцінки нема → збережений факт, не null', function(){
  const r = resolve([D('2026-05', 5000, 1000)], [E('2026-05-10', 1000)], '2026-05');
  assert.equal(r.balance, 4000, 'Rev 2.32.177: факт 5 000 — опора, мінус прив\'язана 1 000'); assert.equal(r.pay, 1000);
});
test('S1b: перший місяць, прив\'язана витрата, факту нема → null («—»)', function(){
  assert.equal(resolve([], [E('2026-05-10', 1000)], '2026-05').balance, null);
});
test('S2: без прив\'язаної витрати факт лишається', function(){
  assert.equal(resolve([D('2026-05', 5000, 1000)], [], '2026-05').balance, 5000);
});
test('S3: пріоритет прив\'язаної витрати (6D.148) незмінний — оцінка переважає факт, коли вона є', function(){
  const r = resolve([D('2026-05', 3000, 1000), D('2026-06', 4000, 1000)], [E('2026-06-10', 1000)], '2026-06');
  assert.equal(r.balance, 3000, 'опора червня 4 000 − 1 000');
});
test('S4 (Rev 2.32.168): наступний місяць без запису й без прив\'язаної — залишок попереднього, без віднімання типового платежу', function(){
  assert.equal(resolve([D('2026-09', 3000, 1000)], [], '2026-10').balance, 3000);
});
test('S5: наступний місяць без запису, є прив\'язана витрата — оцінка', function(){
  assert.equal(resolve([D('2026-09', 3000, 1000)], [E('2026-10-05', 1000)], '2026-10').balance, 2000);
});
test('«Облік»: невідомий залишок показується «—», у «Разом ОЧ» не перетворюється на 0; відмова без початкової суми видима', function(){
  assert.match(SRC, /balance != null \? fmt\(balance\) : '—'/);
  assert.match(SRC, /if\(b != null\)\{ sum \+= b; known\+\+; \}/);
  assert.match(SRC, /anyVisible && !known\)\{ totalEl\.textContent = '—'/);
  assert.match(SRC, /flashField\('idd-initial'\);\s*showTextToast\('Вкажіть початкову суму ОЧ/);
});
