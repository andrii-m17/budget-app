// Rev 2.32.179 (OCH-START) — початок видимості ОЧ із даних сервера (start_date → найраніший борг/прив'язана витрата → firstMonth → місяць створення). Синтетичні дані.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildSandbox } = require('./extract');

const NAMES = ['hideKey', 'isHiddenForMonth', 'isAccountHiddenForMonth', 'isInstallmentVisibleForMonth', 'installmentStartMonth', 'installmentStartMonthFor', 'cardCreatedMonth', 'activeDebts', 'activeExpenses', 'debtTotalsForMonth'];
function sb(g){ return buildSandbox(Object.assign({ debts: [], expenses: [], installmentAccounts: [], bankAccounts: [], hiddenFrom: {} }, g), NAMES.filter(n => !['debtTotalsForMonth', 'activeDebts', 'activeExpenses'].includes(n))); }
const D = (name, month, extra) => Object.assign({ name, kind: 'installment', month, balance: 1000, monthlyPayment: 100 }, extra || {});

test('без start_date: перший борг у вересні → ОЧ невидима в квітні, навіть коли локальний firstMonth = квітень', function(){
  const acc = { name: 'ОЧ Т', firstMonth: '2026-04', initialAmount: 9000 };
  const c = sb({ installmentAccounts: [acc], debts: [D('ОЧ Т', '2025-09'), D('ОЧ Т', '2025-10')] });
  assert.equal(c.installmentStartMonthFor(acc), '2025-09');
  assert.equal(c.isInstallmentVisibleForMonth(acc, '2025-08'), false);
  assert.equal(c.isInstallmentVisibleForMonth(acc, '2025-09'), true);
  const acc2 = { name: 'ОЧ Т2', firstMonth: '2026-04' };
  const c2 = sb({ installmentAccounts: [acc2], debts: [D('ОЧ Т2', '2026-09')] });
  assert.equal(c2.isInstallmentVisibleForMonth(acc2, '2026-04'), false, 'квітень до першого боргу вересня');
  assert.equal(c2.isInstallmentVisibleForMonth(acc2, '2026-09'), true);
});
test('start_date задано: початок = його місяць (раніший за борги)', function(){
  const acc = { name: 'ОЧ Т', startDate: '2026-08-15', firstMonth: '2026-04' };
  const c = sb({ installmentAccounts: [acc], debts: [D('ОЧ Т', '2026-09')] });
  assert.equal(c.installmentStartMonthFor(acc), '2026-08');
  assert.equal(c.isInstallmentVisibleForMonth(acc, '2026-07'), false);
  assert.equal(c.isInstallmentVisibleForMonth(acc, '2026-08'), true);
});
test('прив\'язана витрата теж задає початок; видалені борги й витрати не рахуються', function(){
  const acc = { name: 'ОЧ Т' };
  const c = sb({ installmentAccounts: [acc], debts: [D('ОЧ Т', '2026-03', { deletedAt: '2026-04-01' }), D('ОЧ Т', '2026-09')], expenses: [{ id: 'e1', date: '2026-07-05', amount: 100, linkedInstallment: 'ОЧ Т' }, { id: 'e2', date: '2026-05-05', amount: 100, linkedInstallment: 'ОЧ Т', deletedAt: '2026-05-06' }] });
  assert.equal(c.installmentStartMonthFor(acc), '2026-07');
});
test('без боргів і витрат: локальний firstMonth, а без нього — місяць створення запису; без нічого — не обмежується', function(){
  const c = sb({});
  assert.equal(c.installmentStartMonth({ name: 'А', firstMonth: '2026-06' }, [], []), '2026-06');
  assert.equal(c.installmentStartMonth({ name: 'А', createdAt: '2026-05-10T12:00:00Z' }, [], []), '2026-05');
  assert.equal(c.installmentStartMonth({ name: 'А' }, [], []), null);
  assert.equal(c.isInstallmentVisibleForMonth({ name: 'А' }, '2020-01'), true);
});
test('перерахунок після pull на новому пристрої: з\'явились борги — початок зсувається, без збереження в ОЧ', function(){
  const acc = { name: 'ОЧ Т', firstMonth: '2026-04' };
  const debts = [];
  const c = sb({ installmentAccounts: [acc], debts });
  assert.equal(c.isInstallmentVisibleForMonth(acc, '2026-04'), true, 'даних ще нема — запасний firstMonth');
  c.debts.push(D('ОЧ Т', '2026-09'));
  assert.equal(c.isInstallmentVisibleForMonth(acc, '2026-04'), false);
  assert.equal(acc.firstMonth, '2026-04', 'ОЧ не змінюється');
});
test('приховані без змін: hiddenFrom ≤ місяць — невидима, як і раніше; закрита (залишок 0) лишається видимою від початку', function(){
  const acc = { name: 'ОЧ Т' };
  const c = sb({ installmentAccounts: [acc], debts: [D('ОЧ Т', '2026-01', { balance: 0 })], hiddenFrom: { 'installment:ОЧ Т': { month: '2026-05' } } });
  assert.equal(c.isInstallmentVisibleForMonth(acc, '2026-03'), true);
  assert.equal(c.isInstallmentVisibleForMonth(acc, '2026-06'), false);
});
test('«Разом ОЧ»/аналітика: до початку ОЧ не входить у підсумки (isAccountHiddenForMonth)', function(){
  const acc = { name: 'ОЧ Т' };
  const c = sb({ installmentAccounts: [acc], debts: [D('ОЧ Т', '2026-09')] });
  assert.equal(c.isAccountHiddenForMonth('ОЧ Т', 'installment', '2026-04'), true);
  assert.equal(c.isAccountHiddenForMonth('ОЧ Т', 'installment', '2026-09'), false);
  assert.equal(c.isAccountHiddenForMonth('Невідома', 'installment', '2026-04'), false);
});
test('охоронні: розрахунок залишку не чіпали; «Платежі» й стан платежу використовують початок з даних', function(){
  const fs = require('node:fs'), path = require('node:path');
  const SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert.match(SRC, /const startM = installmentStartMonth\(inst, debts, expenses\);[^\n]*\n\s*if\(startM && month < startM\) return;/);
  assert.match(SRC, /firstMonth: installmentStartMonthFor\(acc\) \|\| null/);
  assert.match(SRC, /const chainSpec = \{ initial: inst\.initialAmount, firstMonth: inst\.firstMonth \|\| null/, 'ланцюжок залишку лишився на локальному firstMonth');
});
