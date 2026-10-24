// Rev 2.32.177 (OCH-ANCHOR) — залишок ОЧ з опорними точками: внесений «Залишок за банком до платежу цього місяця» — опора ланцюжка.
// Лише синтетичні назви й суми.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildSandbox } = require('./extract');

const pure = buildSandbox({}, ['ppPad', 'ppNextMonth', 'OCH_OVALS_MAX', 'installmentStandardPayment', 'installmentPaymentsLeft', 'installmentPayAmount', 'installmentTypicalPay', 'ochMonthIndex', 'ochPlannedPaymentsBefore', 'ochOpeningBalance', 'installmentChainCalc', 'installmentStartMonth', 'installmentStartMonthFor', 'cardCreatedMonth']);
const calc = (spec, m) => pure.installmentChainCalc(spec, m);
const bal = (spec, m) => calc(spec, m).balance;
const R = (month, balance, monthlyPayment) => ({ month, balance, monthlyPayment: monthlyPayment == null ? null : monthlyPayment });
// «Синтетичний iPhone»: 70 000 / 10 міс / 7 000 / 8.11.2025, списання в день старту, авто
const AUTO = { initial: 70000, std: 7000, termMonths: 10, startDate: '2025-11-08', firstPayment: 'same_day', payMode: 'auto', firstMonth: '2026-05' };
// «Синтетичний банк Б»: ручний режим, старт раніше за облік
const MAN = { initial: 50000, std: 5000, termMonths: 10, startDate: '2026-01-10', firstPayment: 'next_month', payMode: 'manual', firstMonth: '2026-03' };

test('графік: платежів до початку місяця (same_day / next_month, границі терміну, порожня дата)', function(){
  const n = pure.ochPlannedPaymentsBefore;
  assert.equal(n('2025-11-08', 'same_day', 10, '2026-05'), 6);
  assert.equal(n('2025-11-08', 'same_day', 10, '2025-11'), 0, 'у місяці старту ще нічого не заплачено до його початку');
  assert.equal(n('2025-11-08', 'next_month', 10, '2026-05'), 5);
  assert.equal(n('2025-11-08', 'same_day', 10, '2027-12'), 10, 'не більше терміну');
  assert.equal(n('2026-06-01', 'same_day', 10, '2026-05'), 0, 'місяць раніше за старт');
  assert.equal(n('', 'same_day', 10, '2026-05'), null, 'порожня дата старту');
});
test('Синтетичний iPhone (авто): без опори графік 28 000; з травневою прив\'язаною 7 000 → 21 000, червень 14 000', function(){
  const spec = Object.assign({ recs: [], linked: { '2026-05': 7000, '2026-06': 7000 } }, AUTO);
  assert.equal(calc(spec, '2026-05').before, 28000);
  assert.equal(bal(spec, '2026-05'), 21000);
  assert.equal(bal(spec, '2026-06'), 14000);
  assert.equal(calc(spec, '2026-05').openingMissing, false);
});
test('опора = графіку: внесений 28 000 → той самий результат', function(){
  const spec = Object.assign({ recs: [R('2026-05', 28000, 7000)], linked: { '2026-05': 7000 } }, AUTO);
  assert.equal(bal(spec, '2026-05'), 21000); assert.equal(bal(spec, '2026-06'), 21000, 'без платежу червня — без змін (2.32.168)');
});
test('Банк Б без опори (ручний режим): повна сума + крапка «Залишок за банком на початок обліку»', function(){
  const spec = Object.assign({ recs: [], linked: {} }, MAN);
  const c = calc(spec, '2026-03');
  assert.equal(c.before, 50000); assert.equal(c.openingMissing, true);
  assert.equal(bal(Object.assign({ recs: [], linked: { '2026-03': 5000 } }, MAN), '2026-03'), 45000);
});
test('Банк Б з опорою: внесено 40 000 → залишок 40 000 − прив\'язана; крапки нема', function(){
  const spec = Object.assign({ recs: [R('2026-03', 40000, null)], linked: { '2026-03': 5000 } }, MAN);
  const c = calc(spec, '2026-03');
  assert.equal(c.balance, 35000); assert.equal(c.openingMissing, false); assert.equal(c.anchored, true);
  assert.equal(c.calcBefore, 50000, 'розрахунок без опори лишається для підказки про відхилення');
});
test('опора посередині ланцюжка: наступні місяці рахуються від неї, попередні не змінюються', function(){
  const linked = { '2026-03': 5000, '2026-04': 5000, '2026-05': 5000, '2026-06': 5000 };
  const base = Object.assign({ recs: [], linked }, MAN);
  assert.deepEqual(['2026-03', '2026-04', '2026-05', '2026-06'].map(m => bal(base, m)), [45000, 40000, 35000, 30000]);
  const anch = Object.assign({ recs: [R('2026-05', 32000, null)], linked }, MAN);
  assert.deepEqual(['2026-03', '2026-04', '2026-05', '2026-06'].map(m => bal(anch, m)), [45000, 40000, 27000, 22000]);
  assert.equal(calc(anch, '2026-05').calcBefore, 40000, 'розрахунок без опори — для підказки');
});
test('опора й прив\'язана в одному місяці: початок місяця = опора, прив\'язана віднімається', function(){
  const spec = Object.assign({ recs: [R('2026-04', 20000, null)], linked: { '2026-04': 5000 } }, MAN);
  assert.equal(calc(spec, '2026-04').before, 20000); assert.equal(bal(spec, '2026-04'), 15000);
});
test('опора більша за залишок після платежу не обмежується: 5 000 − прив\'язана 8 000 → 0, далі 0', function(){
  const spec = Object.assign({ recs: [R('2026-04', 5000, null)], linked: { '2026-04': 8000 } }, MAN);
  assert.equal(bal(spec, '2026-04'), 0); assert.equal(bal(spec, '2026-05'), 0);
});
test('опора більша за розрахунок (внесено 60 000 при загальній 50 000): береться як є', function(){
  const spec = Object.assign({ recs: [R('2026-03', 60000, null)], linked: {} }, MAN);
  assert.equal(bal(spec, '2026-03'), 60000);
});
test('порожня дата старту (авто): графіка нема → повна сума; крапки нема (нема з чим порівнювати)', function(){
  const spec = { initial: 30000, std: 3000, termMonths: 10, startDate: null, firstPayment: 'same_day', payMode: 'auto', firstMonth: '2026-05', recs: [], linked: {} };
  const c = calc(spec, '2026-05');
  assert.equal(c.before, 30000); assert.equal(c.openingMissing, false);
});
test('пропущений місяць: без платежу й опори залишок переноситься, наступна опора переписує ланцюжок', function(){
  const spec = Object.assign({ recs: [R('2026-07', 20000, null)], linked: { '2026-03': 5000, '2026-05': 5000, '2026-07': 5000 } }, MAN);
  assert.equal(bal(spec, '2026-04'), 45000, 'квітня без платежу');
  assert.equal(bal(spec, '2026-06'), 40000);
  assert.equal(bal(spec, '2026-07'), 15000, 'опора липня 20 000 − 5 000');
});
test('31-ше число старту: місяць старту й графік рахуються за місяцем, а не за днем', function(){
  assert.equal(pure.ochPlannedPaymentsBefore('2025-12-31', 'same_day', 10, '2026-03'), 3);
  assert.equal(pure.ochPlannedPaymentsBefore('2025-12-31', 'next_month', 10, '2026-03'), 2);
});
test('нульова/порожня загальна сума: без графіка й без опори — null; з опорою — опора', function(){
  const none = Object.assign({}, AUTO, { initial: null, recs: [], linked: {} });
  assert.equal(bal(none, '2026-05'), null);
  const anch = Object.assign({}, AUTO, { initial: null, recs: [R('2026-05', 9000, null)], linked: {} });
  assert.equal(bal(anch, '2026-05'), 9000);
});
