// Rev 2.32.70 — expectedPaymentForCard: оцінка платежу ОЧ для картки платежів.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildSandbox } = require('./extract');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const c = buildSandbox({}, ['ppPad', 'ppDaysInMonth', 'ppAddDays', 'ppDayDiff', 'ppNextMonth', 'ppClampDate', 'ppModeAmount', 'expectedPaymentForCard', 'installmentExpectedPayment', 'installmentPaidFull', 'installmentDuePassed', 'upcomingPayments']);
test('[5000, 5000, 6000, 6000, 6000] → 5000 (два найновіші однакові)', function(){ assert.equal(c.expectedPaymentForCard([5000, 5000, 6000, 6000, 6000]), 5000); });
test('[2000, 2000, 2000, 2508, 2000] → 2000', function(){ assert.equal(c.expectedPaymentForCard([2000, 2000, 2000, 2508, 2000]), 2000); });
test('[3350, 3200, 3200] → 3200 (одноразове відхилення не перемагає)', function(){ assert.equal(c.expectedPaymentForCard([3350, 3200, 3200]), 3200); });
test('[5000, 6000] → 5000 (рівність у моді — виграє новіше)', function(){ assert.equal(c.expectedPaymentForCard([5000, 6000]), 5000); });
test('одне значення — воно; порожня історія й лише null/0 — null', function(){
  assert.equal(c.expectedPaymentForCard([4940]), 4940); assert.equal(c.expectedPaymentForCard([]), null); assert.equal(c.expectedPaymentForCard(null), null); assert.equal(c.expectedPaymentForCard([null, 0, -5]), null);
});
test('[null, 0, 4940] → 4940; null і 0 ігноруються і в правилі двох найновіших', function(){
  assert.equal(c.expectedPaymentForCard([null, 0, 4940]), 4940);
  assert.equal(c.expectedPaymentForCard([null, 700, 0, 700, 900]), 700);
});
test('мода лише найновіших 6 значень: старіші не впливають', function(){
  assert.equal(c.expectedPaymentForCard([1, 2, 1, 2, 1, 2, 9, 9, 9, 9]), 1);
});
test('upcomingPayments: оцінка ОЧ без запису місяця використовує нову функцію (з «≈»); сума з запису місяця точна', function(){
  const D = function(m, pay, extra){ return Object.assign({ kind: 'installment', name: 'iPhone', month: m, monthlyPayment: pay, balance: 9 }, extra || {}); };
  const hist = [D('2026-05', 6000), D('2026-06', 6000), D('2026-07', 6000), D('2026-08', 5000), D('2026-09', 5000)];
  const r = JSON.parse(JSON.stringify(c.upcomingPayments({ today: '2026-10-15', horizonDays: 7, installments: [{ name: 'iPhone', dueDay: 17 }], cards: [], debtsByMonth: hist, expenses: [], hidden: {} })));
  assert.equal(r.items[0].amount, 5000); assert.equal(r.items[0].estimated, true);
  const r2 = JSON.parse(JSON.stringify(c.upcomingPayments({ today: '2026-10-15', horizonDays: 7, installments: [{ name: 'iPhone', dueDay: 17 }], cards: [], debtsByMonth: hist.concat([D('2026-10', 6000)]), expenses: [], hidden: {} })));
  assert.equal(r2.items[0].amount, 6000); assert.equal(r2.items[0].estimated, false);
});
test('охоронні: typicalMonthlyPayment і розрахунок залишку не змінено; нова функція використовується лише в upcomingPayments', function(){
  const typical = SRC.slice(SRC.indexOf('function typicalMonthlyPayment'), SRC.indexOf('function typicalMonthlyPayment') + 700);
  assert.ok(!/expectedPaymentForCard/.test(typical));
  const est = SRC.slice(SRC.indexOf('function estimateInstallment'), SRC.indexOf('function estimateInstallment') + 500);
  assert.match(est, /typicalMonthlyPayment\(name, 'installment', month\)/); assert.ok(!/expectedPaymentForCard/.test(est));
  assert.equal((SRC.match(/expectedPaymentForCard\(/g) || []).length, 2, 'оголошення й один виклик у upcomingPayments');
  assert.match(SRC, /const mode = expectedPaymentForCard\(prev\.slice\(\)\.reverse\(\)\);/);
});
