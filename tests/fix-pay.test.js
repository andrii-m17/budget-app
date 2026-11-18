// Rev 2.32.396 (FIX-PAY): дата, сума й «на місяць» ОЧ — «Найближчі платежі», «Облік» і плитка «ОЧ» рахують однаково. Лише синтетичні дані («Предмет А/Б»).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildSandbox, evalInSandbox } = require('./extract');
const j = v => JSON.parse(JSON.stringify(v));
const NAMES = ['debtTotalsForMonth', 'installmentMonthPayTotal', 'isInstallmentVisibleForMonth', 'debtAccount', 'debtAccountKey', 'debtDisplayName', 'hideKey', 'hideKeyLegacy', 'hideKeyForAccount', 'hasIdHideKey', 'findAccountMonthDebt', 'accountsOfKind', 'hiddenEntryKey', 'hiddenEntryFor', 'isHiddenForMonth', 'isAccountHiddenForMonth', 'isCardVisibleForMonth', 'cardCreatedMonth', 'activeDebts', 'activeExpenses', 'monthKey', 'lastKnownBalance', 'typicalMonthlyPayment', 'linkedExpensesSum', 'resolveInstallmentFact', 'OCH_OVALS_MAX', 'installmentStandardPayment', 'installmentPaymentsLeft', 'installmentPayAmount', 'installmentTypicalPay', 'ppPad', 'ppDaysInMonth', 'ppAddDays', 'ppDayDiff', 'ppNextMonth', 'ppClampDate', 'ppModeAmount', 'expectedPaymentForCard', 'installmentExpectedPayment', 'installmentPaidFull', 'installmentDuePassed', 'ochMonthIndex', 'ochPlannedPaymentsBefore', 'ochOpeningBalance', 'installmentChainCalc', 'installmentStartMonth', 'installmentStartMonthFor', 'installmentChainSpec', 'installmentBalanceBefore', 'estimateInstallment', 'upcomingPayments'];
const D = (name, month, balance, pay) => ({ id: 'd-' + name + month, name, kind: 'installment', month, balance, monthlyPayment: pay });
function app(debts, accounts, expenses){ return buildSandbox({ debts, expenses: expenses || [], hiddenFrom: {}, ignoredDivergences: {}, bankAccounts: [], installmentAccounts: accounts, monthKey2: m => m }, NAMES); }
const upcoming = (c, today) => j(evalInSandbox(c, "upcomingPayments({ today: '" + today + "', horizonDays: 14, installments: installmentAccounts, cards: [], debtsByMonth: activeDebts(), expenses: activeExpenses(), hidden: hiddenFrom, isHidden: isHiddenForMonth })"));
const accounting = (c, m) => evalInSandbox(c, "(function(){ const a = installmentAccounts.find(function(x){ return x.name === 'Предмет А'; }); const ex = activeDebts().find(function(d){ return d.name === 'Предмет А' && d.month === '" + m + "'; }); return resolveInstallmentFact(a.name, '" + m + "', ex).pay; })()");
const tile = (c, m) => evalInSandbox(c, "debtTotalsForMonth('" + m + "').totalMonthlyInstallment");
const accTotal = (c, m) => evalInSandbox(c, "installmentMonthPayTotal('" + m + "')");

// історія: 6 000 ×3 і 5 000 ×2 (мода всіх — 6 000; «два найновіші однакові» давали 5 000)
const HIST = [D('Предмет А', '2026-06', 40000, 6000), D('Предмет А', '2026-07', 34000, 6000), D('Предмет А', '2026-08', 28000, 6000), D('Предмет А', '2026-09', 22000, 5000), D('Предмет А', '2026-10', 17000, 5000)];
const ACC = [{ name: 'Предмет А', cloudId: 'id-a', dueDay: 17, initialAmount: 46000 }];

test('сума платежу: «Найближчі» = «Облік» (очікуваний за модою всіх платежів, не «два найновіші»)', function(){
  const c = app(HIST, ACC);
  const r = upcoming(c, '2026-11-16');
  assert.equal(r.items.length, 1);
  assert.equal(r.items[0].amount, accounting(c, '2026-11'), 'та сама сума, що в «Обліку»');
  assert.equal(r.items[0].amount, 6000);
});
test('прострочений (пільговий день) платіж: справжня дата 17 і overdue, не «сьогодні» (18)', function(){
  const c = app(HIST, ACC);
  const r = upcoming(c, '2026-11-18');
  assert.equal(r.items.length, 1);
  assert.equal(r.items[0].date, '2026-11-17');
  assert.equal(r.items[0].overdue, true);
  assert.equal(r.items[0].amount, 6000);
  assert.equal(r.unconfirmed.length, 0);
});
test('«на місяць»: плитка «ОЧ» = «Разом на місяць» в «Обліку»; ОЧ без запису місяця й ОЧ без жодного запису рахуються однаково', function(){
  const accounts = ACC.concat([{ name: 'Предмет Б', cloudId: 'id-b', dueDay: 5, payment: 3000, initialAmount: 9000 }]);
  const debts = HIST.concat([D('Предмет Б', '2026-09', 9000, 2500)]); // у «Б» перенесений запис вересня з платежем 2 500, платіж моделі 3 000
  const c = app(debts, accounts);
  assert.equal(tile(c, '2026-11'), accTotal(c, '2026-11'));
  assert.equal(accTotal(c, '2026-11'), 6000 + 3000, 'А: очікуваний 6 000; Б: стандартний платіж моделі, не перенесений 2 500');
});
test('ОЧ без жодного запису боргу входить у плитку (як в «Обліку»)', function(){
  const c = app(HIST, ACC.concat([{ name: 'Предмет В', cloudId: 'id-v', dueDay: 9, payment: 1000, initialAmount: 5000 }]));
  assert.equal(tile(c, '2026-11'), 7000);
});
test('запис самого місяця (факт) лишається пріоритетним і в плитці, і в «Обліку»', function(){
  const c = app(HIST.concat([D('Предмет А', '2026-11', 11000, 5500)]), ACC);
  assert.equal(accounting(c, '2026-11'), 5500); assert.equal(tile(c, '2026-11'), 5500);
});
