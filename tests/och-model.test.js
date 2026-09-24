// Rev 2.14.0 — тести моделі ОЧ (FINANCIAL_RULES §4, "Модель C"):
// typicalMonthlyPayment() — статистична мода щомісячного платежу (стійка до
// одиничних відхилень); linkedExpensesSum() — сума витрат, прив'язаних до
// ОЧ автозв'язком за конкретний місяць (точніша основа за моду, коли є).
//
// Rev #26.4 — "очікуваний залишок = попередній факт − (прив'язана сума або
// мода)" НАСПРАВДІ вже є окремою чистою функцією, estimateInstallment(name,
// month) (index.html, винесена ще в Rev 2.16.6 — до речі, РАНІШЕ, ніж цей
// файл встиг про це дізнатись: попередній коментар тут стверджував, що
// формула "не є окремою функцією" і дублював її вручну в тесті — це було
// застарілим твердженням, а не актуальним станом коду, виявлено під час
// перевірки перед крок 2 п.26 ROADMAP.md). populateInstallmentTable() і ще
// три функції (updateInstallmentTotal/updateInstallmentBalanceTotal/
// openInstallmentEditor) вже й так лише викликають estimateInstallment() і
// рендерять результат — жодних змін в index.html цим Rev не знадобилось.
// Тест нижче тепер викликає САМУ estimateInstallment() напряму, а не
// дублює її формулу вручну.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildSandbox } = require('./extract');

function sandbox({ debts, expenses, hiddenFrom }){
  return buildSandbox(
    { debts: debts || [], expenses: expenses || [], hiddenFrom: hiddenFrom || {} },
    ['hideKey', 'isHiddenForMonth', 'typicalMonthlyPayment', 'lastKnownBalance', 'monthKey', 'linkedExpensesSum', 'estimateInstallment',
      // Rev #30 (6D.44) — typicalMonthlyPayment()/lastKnownBalance() сканують activeDebts(); linkedExpensesSum() (6D.42) — activeExpenses().
      'activeDebts', 'activeExpenses']
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

test('estimateInstallment: прив\'язана сума перекриває моду, коли вона є', () => {
  const debts = [
    { name: 'ОЧ Приватбанк', kind: 'installment', month: '2026-01', balance: 10000, monthlyPayment: 3000 },
  ];
  const expenses = [
    { date: '2026-02-10', amount: 3500, linkedInstallment: 'ОЧ Приватбанк' },
  ];
  const ctx = sandbox({ debts, expenses });
  const est = ctx.estimateInstallment('ОЧ Приватбанк', '2026-02');
  assert.equal(est.pay, 3500); // прив'язана сума (3500), а не мода (3000)
  assert.equal(est.balance, 6500);
  assert.equal(est.linkedSum, 3500);
});

test('estimateInstallment: без прив\'язаних витрат використовує моду, не йде в мінус', () => {
  const debts = [
    { name: 'ОЧ Mono', kind: 'installment', month: '2026-01', balance: 2000, monthlyPayment: 3000 },
  ];
  const ctx = sandbox({ debts, expenses: [] });
  const est = ctx.estimateInstallment('ОЧ Mono', '2026-02');
  assert.equal(est.pay, 3000);
  assert.equal(est.balance, 0); // 2000-3000 обрізано до 0, а не -1000
  assert.equal(est.linkedSum, 0);
});
