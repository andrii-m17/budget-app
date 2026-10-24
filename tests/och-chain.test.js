// Rev 2.32.164 (OCH-CHAIN) — залишок ОЧ як ланцюжок від першого місяця ОЧ (правило власника). Лише синтетичні назви й суми.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildSandbox, evalInSandbox } = require('./extract');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const j = v => JSON.parse(JSON.stringify(v));

const pure = buildSandbox({}, ['ppPad', 'ppNextMonth', 'OCH_OVALS_MAX', 'installmentStandardPayment', 'installmentPaymentsLeft', 'installmentPayAmount', 'installmentTypicalPay', 'ochMonthIndex', 'ochPlannedPaymentsBefore', 'ochOpeningBalance', 'installmentChainCalc']);
const bal = (spec, m) => pure.installmentChainCalc(spec, m).balance;
const NAME = 'ОЧ Тест';
const L = (obj) => obj; // { 'YYYY-MM': сума прив'язаних }
const R = (month, balance, monthlyPayment) => ({ month, balance, monthlyPayment });

test('перший місяць із прив\'язаною витратою: initialAmount − сума прив\'язаних', function(){
  assert.equal(bal({ initial: 40000, firstMonth: '2026-06', recs: [], linked: L({ '2026-06': 3000 }) }, '2026-06'), 37000);
  assert.equal(bal({ initial: 40000, firstMonth: '2026-06', recs: [], linked: L({ '2026-06': 1000 }) }, '2026-06'), 39000);
  assert.equal(pure.installmentChainCalc({ initial: 40000, firstMonth: '2026-06', recs: [], linked: { '2026-06': 3000 } }, '2026-06').before, 40000, 'до першого платежу — початкова сума');
});
test('синтетичний ланцюжок «Предмет Б»: початкова 40 000, платежі 3 000, 3 100, 3 600, 3 700 → 37 000, 33 900, 30 300, 26 600 (без жодного збереженого запису)', function(){
  const spec = { initial: 40000, firstMonth: '2026-06', recs: [], linked: L({ '2026-06': 3000, '2026-07': 3100, '2026-08': 3600, '2026-09': 3700 }) };
  assert.deepEqual(['2026-06', '2026-07', '2026-08', '2026-09'].map(m => bal(spec, m)), [37000, 33900, 30300, 26600]);
  assert.equal(pure.installmentChainCalc(spec, '2026-08').before, 33900);
});
test('синтетичний «Предмет А»: початкова 3 000, платіж 1 000 → 2 000, смуга 33%', function(){
  const spec = { initial: 3000, firstMonth: '2026-09', recs: [R('2026-09', 3000, null)], linked: L({ '2026-10': 1000 }) }; // у вересні лише запис «залишок = початкова», у жовтні запису нема
  assert.equal(bal(spec, '2026-10'), 2000);
  assert.equal(((3000 - bal(spec, '2026-10')) / 3000 * 100).toFixed(0), '33');
});
test('місяць без прив\'язаної, але з фактом: факт; наступний місяць рахується від нього', function(){
  const spec = { initial: 10000, firstMonth: '2026-06', recs: [R('2026-07', 6000, 1000)], linked: L({ '2026-06': 1000, '2026-08': 500 }) };
  assert.equal(bal(spec, '2026-06'), 9000);
  assert.equal(bal(spec, '2026-07'), 6000, 'факт місяця без прив\'язаних');
  assert.equal(bal(spec, '2026-08'), 5500, 'далі від факту');
});
test('Rev 2.32.177: внесений факт — опора (залишок до платежу місяця), прив\'язана віднімається від нього', function(){
  const spec = { initial: 10000, firstMonth: '2026-06', recs: [R('2026-06', 5000, 1000)], linked: L({ '2026-06': 1000 }) };
  assert.equal(bal(spec, '2026-06'), 4000);
});
test('без прив\'язаної й без факту (Rev 2.32.168): залишок = попередній, типовий платіж не віднімається; нічого не змінюється, доки платіж не внесено', function(){
  const spec = { initial: 10000, firstMonth: '2026-06', recs: [R('2026-06', 9000, 1000), R('2026-07', 8000, 1000)], linked: {} };
  assert.equal(bal(spec, '2026-08'), 8000, 'є мода платежів 1000, але прогнозів немає');
  assert.equal(bal(spec, '2026-09'), 8000, 'і далі лишається');
  assert.equal(bal({ initial: 10000, firstMonth: '2026-06', recs: [], linked: {} }, '2026-07'), 10000);
  assert.equal(bal({ initial: 10000, firstMonth: '2026-06', recs: [], linked: { '2026-08': 1000 } }, '2026-08'), 9000, 'прив\'язана — віднімається з попереднього');
  assert.equal(installmentTypicalPayChecked(), true);
});
function installmentTypicalPayChecked(){
  const p = pure.installmentTypicalPay;
  return p([R('2026-01', 1, 500), R('2026-02', 1, 500), R('2026-03', 1, 600)], '2026-04') === 500 && p([R('2026-01', 1, 500), R('2026-02', 1, 600)], '2026-04') === 600 && p([], '2026-04') === null && p([R('2026-04', 1, 500)], '2026-04') === null;
}
test('initialAmount порожня: перший місяць — факт, інакше null; ланцюжок null до першого факту, далі працює', function(){
  const none = { initial: null, firstMonth: '2026-06', recs: [], linked: L({ '2026-06': 1000 }) };
  assert.equal(bal(none, '2026-06'), null); assert.equal(bal(none, '2026-07'), null);
  const fact = { initial: null, firstMonth: '2026-06', recs: [R('2026-06', 5000, 1000)], linked: L({ '2026-06': 1000 }) };
  assert.equal(bal(fact, '2026-06'), 4000, 'нема initial: опора — факт, прив\'язана віднімається');
  assert.equal(bal(fact, '2026-07'), 4000, 'далі без віднімання (Rev 2.32.168)');
  const zero = { initial: 0, firstMonth: '2026-06', recs: [], linked: L({ '2026-06': 1000 }) };
  assert.equal(bal(zero, '2026-06'), null, 'нульова початкова = порожня');
  const later = { initial: null, firstMonth: '2026-06', recs: [R('2026-08', 3000, 1000)], linked: {} };
  assert.deepEqual([bal(later, '2026-06'), bal(later, '2026-07'), bal(later, '2026-08'), bal(later, '2026-09')], [null, null, 3000, 3000]);
});
test('пропущений місяць посередині: залишок лишається попереднім і передається далі (Rev 2.32.168)', function(){
  const spec = { initial: 10000, firstMonth: '2026-06', recs: [R('2026-06', 9000, 1000)], linked: L({ '2026-06': 1000, '2026-08': 1000 }) };
  assert.equal(bal(spec, '2026-07'), 8000, 'липня нема: залишок червня (опора 9 000 − 1 000)');
  assert.equal(bal(spec, '2026-08'), 7000, 'серпень: від липня мінус прив\'язана');
  const noTypical = { initial: 10000, firstMonth: '2026-06', recs: [], linked: L({ '2026-06': 1000, '2026-08': 1000 }) };
  assert.equal(bal(noTypical, '2026-07'), 9000); assert.equal(bal(noTypical, '2026-08'), 8000);
});
test('залишок не нижче 0: прив\'язана сума більша за залишок (у першому й наступних місяцях), очікуваний теж', function(){
  assert.equal(bal({ initial: 1000, firstMonth: '2026-06', recs: [], linked: L({ '2026-06': 1500 }) }, '2026-06'), 0);
  const spec = { initial: 3000, firstMonth: '2026-06', recs: [R('2026-06', 2000, 2500)], linked: L({ '2026-07': 5000 }) };
  assert.equal(bal(spec, '2026-07'), 0); assert.equal(bal(spec, '2026-08'), 0, 'закрита ОЧ лишається 0');
  assert.equal(bal({ initial: 1000, firstMonth: '2026-06', recs: [R('2026-06', 800, 900)], linked: {} }, '2026-07'), 800, 'без прив\'язаної залишок не змінюється');
  assert.equal(bal({ initial: 1000, firstMonth: '2026-06', recs: [R('2026-06', 800, 900)], linked: { '2026-07': 900 } }, '2026-07'), 0, 'прив\'язана більша за залишок — 0');
});
test('місяць раніше за початок ланцюжка: усе null; початок — найраніший з firstMonth, запису й прив\'язаної витрати', function(){
  const spec = { initial: 5000, firstMonth: '2026-08', recs: [R('2026-07', 4500, 500)], linked: L({ '2026-06': 500 }) };
  assert.equal(pure.installmentChainCalc(spec, '2026-05').balance, null);
  assert.equal(pure.installmentChainCalc(spec, '2026-05').start, '2026-06');
  assert.equal(bal(spec, '2026-06'), 4500, 'перша прив\'язана → початкова − сума');
});

// ---- інтеграція: усе, що читає залишок, бачить один ланцюжок ----
function app(debts, expenses, accounts){
  return buildSandbox({ debts, expenses, hiddenFrom: {}, bankAccounts: [], installmentAccounts: accounts || [] },
    ['debtTotalsForMonth', 'hideKey', 'isHiddenForMonth', 'isAccountHiddenForMonth', 'isCardVisibleForMonth', 'cardCreatedMonth', 'activeDebts', 'resolveInstallmentFact', 'OCH_OVALS_MAX', 'installmentStandardPayment', 'installmentPaymentsLeft', 'installmentPayAmount', 'installmentTypicalPay', 'ppPad', 'ppNextMonth', 'ochMonthIndex', 'ochPlannedPaymentsBefore', 'ochOpeningBalance', 'installmentChainCalc', 'installmentChainSpec', 'installmentBalanceBefore', 'estimateInstallment', 'linkedExpensesSum', 'lastKnownBalance', 'typicalMonthlyPayment', 'activeExpenses', 'monthKey']);
}
test('таблиця Аналітики (debtTotalsForMonth): «Предмет А» у жовтні без запису, з прив\'язаною витратою → залишок 2 000 і смуга 33%; без прив\'язаної → залишок попереднього (3 000, смуга 0%)', function(){
  const acc = [{ name: NAME, initialAmount: 3000, firstMonth: '2026-09' }];
  const debts = [{ name: NAME, kind: 'installment', month: '2026-09', balance: 3000, monthlyPayment: 1000 }];
  let c = app(debts, [{ id: 'e1', date: '2026-10-05', amount: 1000, linkedInstallment: NAME }], acc);
  let row = j(evalInSandbox(c, "debtTotalsForMonth('2026-10')")).list.filter(d => d.kind === 'installment')[0];
  assert.equal(row.balance, 2000); assert.equal(((3000 - row.balance) / 3000 * 100).toFixed(0), '33');
  c = app(debts, [], acc);
  row = j(evalInSandbox(c, "debtTotalsForMonth('2026-10')")).list.filter(d => d.kind === 'installment')[0];
  assert.equal(row.balance, 3000, 'нічого не внесено: залишок попереднього місяця (Rev 2.32.168), так само, як в «Обліку»');
  assert.equal(row.monthlyPayment, 1000, 'платіж як і раніше з перенесеного запису');
});
test('«Облік» і таблиця збігаються: той самий resolveInstallmentFact; «Разом ОЧ» — сума тих самих залишків', function(){
  const acc = [{ name: NAME, initialAmount: 40000, firstMonth: '2026-06' }];
  const exp = [['2026-06-05', 3000], ['2026-07-05', 3100], ['2026-08-05', 3600], ['2026-09-05', 3700]].map(([date, amount], i) => ({ id: 'e' + i, date, amount, linkedInstallment: NAME }));
  const debts = [{ name: NAME, kind: 'installment', month: '2026-06', balance: 40000, monthlyPayment: 3000 }];
  const c = app(debts, exp, acc);
  const r = m => j(evalInSandbox(c, "resolveInstallmentFact(" + JSON.stringify(NAME) + ", '" + m + "', undefined)"));
  assert.deepEqual(['2026-06', '2026-07', '2026-08', '2026-09'].map(m => r(m).balance), [37000, 33900, 30300, 26600]);
  const tot = j(evalInSandbox(c, "debtTotalsForMonth('2026-09')"));
  assert.equal(tot.totalInstallment, 26600); assert.equal(tot.list[0].balance, 26600);
});
test('перенесений запис старого місяця не вважається фактом цього (debtTotalsForMonth передає його як existing)', function(){
  const acc = [{ name: NAME, initialAmount: 10000, firstMonth: '2026-06' }];
  const debts = [{ name: NAME, kind: 'installment', month: '2026-06', balance: 9000, monthlyPayment: 1000 }];
  const c = app(debts, [{ id: 'e', date: '2026-08-05', amount: 1000, linkedInstallment: NAME }], acc);
  const row = j(evalInSandbox(c, "debtTotalsForMonth('2026-08')")).list[0];
  assert.equal(row.balance, 8000, 'червень 9 000 → липень 9 000 (без прив\'язаної не змінюється) → серпень 9 000 − 1 000');
});

// ---- «Найближчі платежі» і кільце: очікуваний платіж обмежується ланцюжком ----
test('«Найближчі платежі»: очікуваний платіж обмежений обчисленим залишком (а не останнім записом)', function(){
  const c = buildSandbox({}, ['ppPad', 'ppDaysInMonth', 'ppAddDays', 'ppDayDiff', 'ppNextMonth', 'ppClampDate', 'ppPrevMonth', 'installmentExpectedPayment', 'installmentPaidFull', 'installmentDuePassed', 'OCH_OVALS_MAX', 'installmentStandardPayment', 'installmentPaymentsLeft', 'installmentPayAmount', 'installmentTypicalPay', 'ochMonthIndex', 'ochPlannedPaymentsBefore', 'ochOpeningBalance', 'installmentChainCalc', 'upcomingPayments', 'expectedPaymentForCard', 'ppModeAmount']);
  const run = (expenses) => j(c.upcomingPayments({ today: '2026-10-10', horizonDays: 7, installments: [{ name: NAME, dueDay: 12, initialAmount: 3000, firstMonth: '2026-09' }], cards: [], debtsByMonth: [{ kind: 'installment', name: NAME, month: '2026-09', balance: 500, monthlyPayment: 1000 }], expenses, hidden: {} }));
  // жовтень: очікуваний платіж 1 000, але залишок після вересня 500 → очікуване = 500; прив'язаних 500 → сплачено повністю
  assert.equal(run([{ date: '2026-10-05', amount: 500, linkedInstallment: NAME }]).items.length, 0);
  assert.equal(run([{ date: '2026-10-05', amount: 400, linkedInstallment: NAME }]).items.length, 1, 'частково — лишається');
});
test('охоронні: усі читачі залишку ОЧ — через ланцюжок (lastKnownBalance більше не викликається)', function(){
  assert.ok(!/lastKnownBalance\(/.test(SRC.replace(/function lastKnownBalance\(/, '').replace(/\/\/[^\n]*/g, '')), 'lastKnownBalance ніде не викликається');
  assert.match(SRC, /prevBalance: installmentBalanceBefore\(name, selectedMonth\)/);
  assert.match(SRC, /const chainBefore = installmentChainCalc\(chainSpec, month\)\.before;/);
});
