// Rev 2.14.0 — тести моделі ОЧ (FINANCIAL_RULES §4, "Модель C"):
// typicalMonthlyPayment() — статистична мода щомісячного платежу (стійка до
// одиничних відхилень); linkedExpensesSum() — сума витрат, прив'язаних до
// ОЧ автозв'язком за конкретний місяць (точніша основа за моду, коли є).
//
// ВАЖЛИВО: сама фінальна формула "очікуваний залишок = попередній факт −
// (прив'язана сума або мода)" НЕ є окремою функцією — вона порахована
// інлайн усередині populateInstallmentTable() (index.html), функції, що
// одночасно рендерить DOM-таблицю і тому не ізольована без рефакторингу
// (Stage 5, п.26 ROADMAP.md). Тест нижче ("композиція...") викликає РЕАЛЬНІ
// isolated-функції (typicalMonthlyPayment/lastKnownBalance/linkedExpensesSum)
// і лише останній однорядковий Math.max(...) дублює вручну — це задокументовано
// тут, а не приховано, як прогалина покриття до Stage 5.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildSandbox } = require('./extract');

function sandbox({ debts, expenses, hiddenFrom }){
  return buildSandbox(
    { debts: debts || [], expenses: expenses || [], hiddenFrom: hiddenFrom || {} },
    ['hideKey', 'isHiddenForMonth', 'typicalMonthlyPayment', 'lastKnownBalance', 'monthKey', 'linkedExpensesSum']
  );
}

test('typicalMonthlyPayment: мода стійка до одиничного відхилення (4×3500 + 1×4000 → 3500)', () => {
  const debts = [
    { name: 'ОЧ Приватбанк', kind: 'installment', month: '2026-01', monthlyPayment: 3500 },
    { name: 'ОЧ Приватбанк', kind: 'installment', month: '2026-02', monthlyPayment: 3500 },
    { name: 'ОЧ Приватбанк', kind: 'installment', month: '2026-03', monthlyPayment: 4000 },
    { name: 'ОЧ Приватбанк', kind: 'installment', month: '2026-04', monthlyPayment: 3500 },
    { name: 'ОЧ Приватбанк', kind: 'installment', month: '2026-05', monthlyPayment: 3500 },
  ];
  const ctx = sandbox({ debts });
  assert.equal(ctx.typicalMonthlyPayment('ОЧ Приватбанк', 'installment', '2026-06'), 3500);
});

test('typicalMonthlyPayment: тай-брейк при рівній частоті виграє новіше значення', () => {
  const debts = [
    { name: 'ОЧ Mono', kind: 'installment', month: '2026-01', monthlyPayment: 2000 },
    { name: 'ОЧ Mono', kind: 'installment', month: '2026-02', monthlyPayment: 2500 },
  ];
  const ctx = sandbox({ debts });
  assert.equal(ctx.typicalMonthlyPayment('ОЧ Mono', 'installment', '2026-03'), 2500);
});

test('typicalMonthlyPayment: без історії до beforeMonth → null', () => {
  const ctx = sandbox({ debts: [] });
  assert.equal(ctx.typicalMonthlyPayment('ОЧ Mono', 'installment', '2026-01'), null);
});

test('linkedExpensesSum: сумує лише витрати, прив\'язані до ОЧ саме за цей місяць', () => {
  const expenses = [
    { date: '2026-03-05', amount: 1500, linkedInstallment: 'ОЧ Приватбанк' },
    { date: '2026-03-20', amount: 2000, linkedInstallment: 'ОЧ Приватбанк' },
    { date: '2026-03-10', amount: 999,  linkedInstallment: 'ОЧ Mono' }, // інша ОЧ
    { date: '2026-02-15', amount: 1500, linkedInstallment: 'ОЧ Приватбанк' }, // інший місяць
  ];
  const ctx = sandbox({ expenses });
  assert.equal(ctx.linkedExpensesSum('ОЧ Приватбанк', '2026-03'), 3500);
});

test('композиція "очікуваний залишок": прив\'язана сума перекриває моду, коли вона є', () => {
  const debts = [
    { name: 'ОЧ Приватбанк', kind: 'installment', month: '2026-01', balance: 10000, monthlyPayment: 3000 },
  ];
  const expenses = [
    { date: '2026-02-10', amount: 3500, linkedInstallment: 'ОЧ Приватбанк' },
  ];
  const ctx = sandbox({ debts, expenses });
  const prevBal = ctx.lastKnownBalance('ОЧ Приватбанк', 'installment', '2026-02');
  const typicalPay = ctx.typicalMonthlyPayment('ОЧ Приватбанк', 'installment', '2026-02');
  const linkedSum = ctx.linkedExpensesSum('ОЧ Приватбанк', '2026-02');
  const estimatedPay = linkedSum > 0 ? linkedSum : typicalPay;
  const estimatedBalance = prevBal != null
    ? (estimatedPay != null ? Math.max(0, prevBal - estimatedPay) : prevBal)
    : null;
  assert.equal(prevBal, 10000);
  assert.equal(estimatedPay, 3500); // прив'язана сума (3500), а не мода (3000)
  assert.equal(estimatedBalance, 6500);
});

test('композиція "очікуваний залишок": без прив\'язаних витрат використовує моду, не йде в мінус', () => {
  const debts = [
    { name: 'ОЧ Mono', kind: 'installment', month: '2026-01', balance: 2000, monthlyPayment: 3000 },
  ];
  const ctx = sandbox({ debts, expenses: [] });
  const prevBal = ctx.lastKnownBalance('ОЧ Mono', 'installment', '2026-02');
  const typicalPay = ctx.typicalMonthlyPayment('ОЧ Mono', 'installment', '2026-02');
  const linkedSum = ctx.linkedExpensesSum('ОЧ Mono', '2026-02');
  const estimatedPay = linkedSum > 0 ? linkedSum : typicalPay;
  const estimatedBalance = prevBal != null
    ? (estimatedPay != null ? Math.max(0, prevBal - estimatedPay) : prevBal)
    : null;
  assert.equal(estimatedPay, 3000);
  assert.equal(estimatedBalance, 0); // 2000-3000 обрізано до 0, а не -1000
});
