// Rev 2.16.0 — тести перевірок "Діагностика даних" (ROADMAP п.20).
// findExpenseIdIssues/findTimestampIssues/findInstallmentFieldIssues/
// findInstallmentDivergences читають глобальні expenses/debts/
// installmentAccounts напряму (побудовані для реального застосунку, не
// приймають параметри) — тому в sandbox підставляємо ці масиви як глобальні
// змінні, так само як і в tests/carry-forward.test.js/och-model.test.js.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildSandbox } = require('./extract');

function sandbox({ expenses, debts, installmentAccounts, hiddenFrom }){
  return buildSandbox(
    {
      expenses: expenses || [],
      debts: debts || [],
      installmentAccounts: installmentAccounts || [],
      hiddenFrom: hiddenFrom || {},
      fmt: (n) => String(Math.round(n)) + ' ₴',
    },
    [
      'findExpenseIdIssues', 'findTimestampIssues', 'findInstallmentFieldIssues', 'findInstallmentDivergences',
      'hideKey', 'isHiddenForMonth', 'lastKnownBalance', 'typicalMonthlyPayment', 'linkedExpensesSum',
    ]
  );
}

test('findExpenseIdIssues: валідні унікальні UUID → без проблем', () => {
  const ctx = sandbox({ expenses: [
    { id: 'a1', name: 'Кава', date: '2026-03-01' },
    { id: 'a2', name: 'Хліб', date: '2026-03-02' },
  ]});
  assert.equal(ctx.findExpenseIdIssues().length, 0);
});

test('findExpenseIdIssues: відсутній/невалідний id → одна проблема на запис', () => {
  const ctx = sandbox({ expenses: [
    { id: '', name: 'Кава', date: '2026-03-01' },
    { name: 'Хліб', date: '2026-03-02' }, // id взагалі відсутній
  ]});
  const issues = ctx.findExpenseIdIssues();
  assert.equal(issues.length, 2);
  assert.match(issues[0].reason, /невалідний UUID/);
});

test('findExpenseIdIssues: дубльований id → друге входження позначено, перше — ні', () => {
  const ctx = sandbox({ expenses: [
    { id: 'dup1', name: 'Кава', date: '2026-03-01' },
    { id: 'dup1', name: 'Кава (копія)', date: '2026-03-02' },
  ]});
  const issues = ctx.findExpenseIdIssues();
  assert.equal(issues.length, 1);
  assert.equal(issues[0].label, 'Кава (копія)');
  assert.match(issues[0].reason, /дубльований UUID/);
});

test('findTimestampIssues: updatedAt раніше за createdAt → проблема', () => {
  const ctx = sandbox({ expenses: [
    { name: 'Кава', date: '2026-03-01', createdAt: '2026-03-05T00:00:00.000Z', updatedAt: '2026-03-01T00:00:00.000Z' },
    { name: 'Хліб', date: '2026-03-02', createdAt: '2026-03-01T00:00:00.000Z', updatedAt: '2026-03-05T00:00:00.000Z' },
  ]});
  const issues = ctx.findTimestampIssues();
  assert.equal(issues.length, 1);
  assert.equal(issues[0].label, 'Кава');
});

test('findInstallmentFieldIssues: без initialAmount або без назви → проблема', () => {
  const ctx = sandbox({ installmentAccounts: [
    { name: 'ОЧ Приватбанк', initialAmount: 12000 },
    { name: 'ОЧ Mono', initialAmount: null },
    { name: '', initialAmount: 500 },
  ]});
  const issues = ctx.findInstallmentFieldIssues();
  assert.equal(issues.length, 2);
  assert.ok(issues.some(i => i.reason.includes('початкова сума')));
  assert.ok(issues.some(i => i.reason.includes('назва')));
});

test('findInstallmentDivergences: факт близький до очікуваного (<5%) → без проблем', () => {
  const debts = [
    { name: 'ОЧ Приватбанк', kind: 'installment', month: '2026-01', balance: 10000, monthlyPayment: 3000 },
    { name: 'ОЧ Приватбанк', kind: 'installment', month: '2026-02', balance: 7050, monthlyPayment: 3000 }, // очікувано 7000, відхилення ~0.7%
  ];
  const ctx = sandbox({ debts });
  assert.equal(ctx.findInstallmentDivergences().length, 0);
});

test('findInstallmentDivergences: факт суттєво відрізняється (>5%) → проблема з описом', () => {
  const debts = [
    { name: 'ОЧ Приватбанк', kind: 'installment', month: '2026-01', balance: 10000, monthlyPayment: 3000 },
    { name: 'ОЧ Приватбанк', kind: 'installment', month: '2026-02', balance: 9000, monthlyPayment: 3000 }, // очікувано 7000, факт 9000 → +28.6%
  ];
  const ctx = sandbox({ debts });
  const issues = ctx.findInstallmentDivergences();
  assert.equal(issues.length, 1);
  assert.equal(issues[0].label, 'ОЧ Приватбанк');
  assert.equal(issues[0].date, '2026-02');
});

test('findInstallmentDivergences: немає попереднього факту → нема з чим порівнювати, без проблем', () => {
  const debts = [
    { name: 'ОЧ Приватбанк', kind: 'installment', month: '2026-01', balance: 10000, monthlyPayment: 3000 },
  ];
  const ctx = sandbox({ debts });
  assert.equal(ctx.findInstallmentDivergences().length, 0);
});
