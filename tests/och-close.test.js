// OCH-CLOSE (Rev 2.32.441): стан «ОЧ погашена» (поріг 10 грн; ланцюжок прив язаних витрат і записи боргу), місяць приховування, перехід стану й місця виклику діалогу. Лише синтетичні дані.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const ex = require('./extract');
const SRC = ex.readIndexWithCss();
const c = ex.buildSandbox({}, ['ppPad', 'ppNextMonth', 'PAY_MONTHS_GEN', 'OCH_OVALS_MAX', 'installmentStandardPayment', 'installmentPaymentsLeft', 'installmentPayAmount', 'installmentTypicalPay', 'ochMonthIndex', 'ochPlannedPaymentsBefore', 'ochOpeningBalance', 'installmentChainCalc', 'isInstallmentPaidOff', 'paidOffHideFromMonth', 'paidOffHideLabel', 'PAIDOFF_THRESHOLD', 'installmentPaidOffState']);
const ACC = { name: 'ОЧ-тест', initialAmount: 1000, firstMonth: '2026-06' };
const E = (m, amount, d) => ({ id: 'e' + m + amount, date: m + '-' + (d || '10'), amount: amount, linkedInstallment: 'ОЧ-тест' });
const D = (m, balance, pay) => ({ name: 'ОЧ-тест', kind: 'installment', month: m, balance: balance, monthlyPayment: pay });
const st = (exps, debts, th) => JSON.parse(JSON.stringify(c.installmentPaidOffState(ACC, exps, debts || [], th)));

test('поріг 10 грн за ланцюжком: залишок 0 / 1 / 10 — погашена; 11 / 100 — ні', () => {
  assert.equal(st([E('2026-06', 1000)]).paidOff, true);
  assert.equal(st([E('2026-06', 999)]).paidOff, true);
  assert.equal(st([E('2026-06', 990)]).paidOff, true);
  assert.equal(st([E('2026-06', 989)]).paidOff, false);
  assert.equal(st([E('2026-06', 900)]).paidOff, false);
  assert.equal(st([E('2026-06', 990)]).source, 'chain');
});
test('переплата: залишок max(0, ...) — погашена; часткові платежі накопичуються по місяцях', () => {
  assert.equal(st([E('2026-06', 1500)]).paidOff, true);
  assert.equal(st([E('2026-06', 400), E('2026-07', 400)]).paidOff, false);
  assert.equal(st([E('2026-06', 400), E('2026-07', 400), E('2026-08', 195)]).paidOff, true);
  assert.equal(st([E('2026-06', 500, '05'), E('2026-06', 495, '20')]).paidOff, true, 'два платежі одного місяця');
});
test('місяць приховування: наступний після місяця останнього платежу; межа року; минулий місяць, а не «зараз»', () => {
  const s = st([E('2026-06', 400), E('2026-09', 600)]);
  assert.deepEqual([s.lastPayMonth, s.hideFrom], ['2026-09', '2026-10']);
  assert.equal(st([E('2026-12', 1000)]).hideFrom, '2027-01');
  assert.equal(st([E('2025-03', 1000)]).hideFrom, '2025-04');
});
test('джерело debt: запис боргу з залишком ≤ 10 (без прив язаних витрат) і платіж, що покриває попередній залишок з точністю до порогу', () => {
  const noInit = { name: 'ОЧ-тест' };
  const r1 = JSON.parse(JSON.stringify(c.installmentPaidOffState(noInit, [], [D('2026-08', 5, 100)])));
  assert.deepEqual([r1.paidOff, r1.hideFrom], [true, '2026-09']); // запис боргу є опорною точкою ланцюжка
  const r2 = JSON.parse(JSON.stringify(c.installmentPaidOffState(noInit, [], [D('2026-07', 300, 100), D('2026-08', 40, 295)])));
  assert.deepEqual([r2.paidOff, r2.source], [true, 'debt']); // залишок 40 > 10, але платіж 295 покриває попередній 300 з точністю до порогу
  const r3 = JSON.parse(JSON.stringify(c.installmentPaidOffState(noInit, [], [D('2026-08', 11, 100)])));
  assert.equal(r3.paidOff, false);
});
test('місяць останнього платежу — пізніший із прив язаної витрати й запису боргу', () => {
  const s = st([E('2026-06', 1000)], [D('2026-08', 0, 0)]);
  assert.equal(s.lastPayMonth, '2026-08'); assert.equal(s.hideFrom, '2026-09');
});
test('без initial_amount і без записів залишок невідомий — не погашена; без платежів і записів — ні; видалені витрати й борги ігноруються', () => {
  assert.equal(JSON.parse(JSON.stringify(c.installmentPaidOffState({ name: 'ОЧ-тест' }, [E('2026-06', 5000)], []))).paidOff, false);
  assert.equal(st([]).paidOff, false); assert.equal(st([]).hideFrom, null);
  assert.equal(st([Object.assign(E('2026-06', 1000), { deletedAt: '2026-07-01T00:00:00Z' })]).paidOff, false, 'видалений останній платіж — стан повертається');
  assert.equal(st([E('2026-06', 400)], [Object.assign(D('2026-07', 0, 0), { deletedAt: 'x' })]).paidOff, false);
  assert.equal(c.installmentPaidOffState(null, [E('2026-06', 1000)], []).paidOff, false);
});
test('прив язка за id рахунку: чужі витрати й борги не враховуються; інша ОЧ не впливає', () => {
  const acc = { name: 'ОЧ-тест', cloudId: 'a1', initialAmount: 1000, firstMonth: '2026-06' };
  const other = Object.assign(E('2026-06', 1000), { linkedInstallment: 'Інша' });
  assert.equal(c.installmentPaidOffState(acc, [other], []).paidOff, false);
  const mine = Object.assign(E('2026-06', 1000), { linkedInstallmentId: 'a1', linkedInstallment: 'стара назва' });
  assert.equal(c.installmentPaidOffState(acc, [mine], []).paidOff, true);
});
test('перехід стану (X1): ОЧ 11 грн -> платіж 1 грн погашає; редагування суми останнього платежу, коли вже погашена, перехід не дає; видалення платежу повертає стан; 3 платежі поспіль', () => {
  const before = st([E('2026-06', 989)]).paidOff;
  const after = st([E('2026-06', 989), E('2026-07', 1)]).paidOff;
  assert.deepEqual([before, after], [false, true]);
  const again = st([E('2026-06', 989), E('2026-07', 5)]).paidOff;
  assert.equal(again && after, true, 'був погашений і лишився: діалог не повторюється');
  assert.equal(st([E('2026-06', 989)]).paidOff, false, 'після видалення останнього платежу стан повертається');
  const seq = [[E('2026-06', 300)], [E('2026-06', 300), E('2026-07', 300)], [E('2026-06', 300), E('2026-07', 300), E('2026-08', 395)]].map(l => st(l).paidOff);
  assert.deepEqual(seq, [false, false, true]);
});
test('шляхи виклику діалогу: форма витрати, редагування витрати, шторка ОЧ; Monobank і синхронізація без діалогу (лише підпис)', () => {
  assert.match(SRC, /const paidBefore = rec\.linkedInstallment \? installmentPaidOffNow\(rec\.linkedInstallment\) : true;[^\n]*\n\s*expenses\.unshift\(rec\);/);
  assert.match(SRC, /if\(rec\.linkedInstallment\) offerPaidOffOnTransition\(rec\.linkedInstallment, paidBefore\);/);
  assert.match(SRC, /const paidLink = instSel \? \(instSel\.value \|\| ''\) : \(rec\.linkedInstallment \|\| ''\);[^\n]*\n\s*const paidBefore = paidLink \? installmentPaidOffNow\(paidLink\) : true;/);
  assert.match(SRC, /if\(paidLink\) offerPaidOffOnTransition\(paidLink, paidBefore\);/);
  assert.match(SRC, /const paidBefore = installmentPaidOffNow\(acc\.name\);[^\n]*\n\s*const rawBal = /);
  assert.match(SRC, /if\(!paidBefore && installmentPaidOffNow\(newName\)\) setTimeout\(function\(\)\{ offerHidePaidOffInstallment\(newName\); \}, 350\);/);
  const callers = (SRC.match(/offerPaidOffOnTransition\(/g) || []).length;
  assert.equal(callers, 3, 'визначення + 2 виклики (додавання, редагування); mono_accept, pull і відновлення не викликають діалог');
  const monoAccept = SRC.slice(SRC.indexOf('async function monoAcceptRow'), SRC.indexOf('function monoInstToggle('));
  assert.doesNotMatch(monoAccept, /offerHidePaid|offerPaidOff/);
  assert.match(SRC, /const paidOff = installmentPaidOffOffer\(name, selectedMonth\);/);
});
test('offerHidePaidOffInstallment: тексти без змін; offer лише коли не прихована з hideFrom; підпис у рядку не показується в місяцях до останнього платежу', () => {
  assert.match(SRC, /showConfirmModal\('ОЧ погашено\\n\\n«'/);
  assert.match(SRC, /if\(month && month < st\.lastPayMonth\) return null;/);
  assert.match(SRC, /if\(isHiddenForMonth\(name, 'installment', st\.hideFrom\)\) return null;/);
  assert.equal(ex.evalInSandbox(c, 'PAIDOFF_THRESHOLD'), 10);
});
