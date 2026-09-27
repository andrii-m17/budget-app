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

function sandbox({ expenses, incomes, debts, installmentAccounts, hiddenFrom, ignoredDivergences, cloudSession, cloudFamilyId }){
  return buildSandbox(
    {
      expenses: expenses || [],
      incomes: incomes || [],
      debts: debts || [],
      installmentAccounts: installmentAccounts || [],
      bankAccounts: [],
      hiddenFrom: hiddenFrom || {},
      ignoredDivergences: ignoredDivergences || {},
      fmt: (n) => String(Math.round(n)) + ' ₴',
      // Rev #30 (6D.61) — findUnsyncedRecordsIssues() потребує isCloudSessionReady()
      // (за замовчуванням "не залогінений" — той самий принцип, що pilot-repository.test.js).
      cloudSession: cloudSession || null,
      cloudFamilyId: cloudFamilyId || null,
      isSupabaseSdkReady: () => true,
    },
    [
      'findExpenseIdIssues', 'findTimestampIssues', 'findInstallmentFieldIssues', 'findInstallmentDivergences',
      'divergenceKey', 'hideKey', 'isHiddenForMonth', 'lastKnownBalance', 'typicalMonthlyPayment', 'linkedExpensesSum',
      // Rev #30 (6D.42) — findExpenseIdIssues()/findTimestampIssues() тепер сканують activeExpenses(), не сирий expenses.
      'activeExpenses',
      // Rev #30 (6D.44) — findInstallmentDivergences()/lastKnownBalance()/typicalMonthlyPayment() тепер сканують activeDebts().
      'activeDebts',
      // Rev #30 (6D.61) — термінове питання користувача "що робити з незапушеними
      // записами" — видимість конкретних застряглих записів у Діагностиці.
      'findUnsyncedRecordsIssues', 'activeIncomes', 'isCloudSessionReady',
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

test('findInstallmentDivergences: ігнорована розбіжність (name|month) більше не потрапляє в список', () => {
  const debts = [
    { name: 'ОЧ Приватбанк', kind: 'installment', month: '2026-01', balance: 10000, monthlyPayment: 3000 },
    { name: 'ОЧ Приватбанк', kind: 'installment', month: '2026-02', balance: 9000, monthlyPayment: 3000 }, // свідома переплата, як приклад з фідбеку
  ];
  const ignoredDivergences = { 'ОЧ Приватбанк|2026-02': true };
  const ctx = sandbox({ debts, ignoredDivergences });
  assert.equal(ctx.findInstallmentDivergences().length, 0);
});

test('divergenceKey: об\'єднує назву і місяць через "|"', () => {
  const ctx = sandbox({});
  assert.equal(ctx.divergenceKey('ОЧ Приватбанк', '2026-02'), 'ОЧ Приватбанк|2026-02');
});

// Rev #30 (6D.61) — findUnsyncedRecordsIssues(): термінове питання
// користувача "що робити з даними, які не пройшли push" — видимість
// конкретних застряглих записів (усі 3 id-based домени) у Діагностиці.
// syncedUpdatedAt (6D.57/6D.50) — єдине надійне джерело "чи дійшло до Cloud".
test('findUnsyncedRecordsIssues: без Cloud-сесії → порожньо (не проблема, а очікуваний стан)', () => {
  const ctx = sandbox({ expenses: [{ id: 'e1', name: 'Кава', date: '2026-03-01', updatedAt: '2026-03-01T00:00:00.000Z' }] });
  assert.equal(ctx.findUnsyncedRecordsIssues().length, 0);
});

test('findUnsyncedRecordsIssues: expense без syncedUpdatedAt → одна проблема, правильний target', () => {
  const ctx = sandbox({
    cloudSession: { user: { id: 'u1' } }, cloudFamilyId: 'fam-1',
    expenses: [{ id: 'e1', name: 'Кава', date: '2026-03-01', updatedAt: '2026-03-01T00:00:00.000Z' }],
  });
  const issues = ctx.findUnsyncedRecordsIssues();
  assert.equal(issues.length, 1);
  assert.equal(issues[0].label, 'Кава');
  // Rev #30 (6D.61) — cross-realm vm.Context: assert.deepEqual на об'єкті,
  // повернутому з sandbox, ненадійний (та сама пастка, що вже tests/
  // pilot-repository.test.js документує через plain()) — порівнюємо поля напряму.
  assert.equal(issues[0].target.type, 'expense');
  assert.equal(issues[0].target.idx, 0);
});

test('findUnsyncedRecordsIssues: expense з syncedUpdatedAt === updatedAt → НЕ проблема', () => {
  const ctx = sandbox({
    cloudSession: { user: { id: 'u1' } }, cloudFamilyId: 'fam-1',
    expenses: [{ id: 'e1', name: 'Кава', date: '2026-03-01', updatedAt: '2026-03-01T00:00:00.000Z', syncedUpdatedAt: '2026-03-01T00:00:00.000Z' }],
  });
  assert.equal(ctx.findUnsyncedRecordsIssues().length, 0);
});

test('findUnsyncedRecordsIssues: tombstoned (видалений) запис не рахується — activeExpenses() приховує його', () => {
  const ctx = sandbox({
    cloudSession: { user: { id: 'u1' } }, cloudFamilyId: 'fam-1',
    expenses: [{ id: 'e1', name: 'Кава', date: '2026-03-01', updatedAt: '2026-03-01T00:00:00.000Z', deletedAt: '2026-03-02T00:00:00.000Z' }],
  });
  assert.equal(ctx.findUnsyncedRecordsIssues().length, 0);
});

test('findUnsyncedRecordsIssues: income без syncedUpdatedAt → проблема з правильним target', () => {
  const ctx = sandbox({
    cloudSession: { user: { id: 'u1' } }, cloudFamilyId: 'fam-1',
    incomes: [{ id: 'i1', source: 'ЗП', date: '2026-03-01', updatedAt: '2026-03-01T00:00:00.000Z' }],
  });
  const issues = ctx.findUnsyncedRecordsIssues();
  assert.equal(issues.length, 1);
  assert.equal(issues[0].label, 'ЗП');
  assert.equal(issues[0].target.type, 'income');
  assert.equal(issues[0].target.idx, 0);
});

test('findUnsyncedRecordsIssues: debt (card) без syncedUpdatedAt → проблема з kind у target', () => {
  const ctx = sandbox({
    cloudSession: { user: { id: 'u1' } }, cloudFamilyId: 'fam-1',
    debts: [{ id: 'd1', name: '🟩 Приват', kind: 'card', month: '2026-03', balance: 5000, updatedAt: '2026-03-01T00:00:00.000Z' }],
  });
  const issues = ctx.findUnsyncedRecordsIssues();
  assert.equal(issues.length, 1);
  assert.equal(issues[0].label, '🟩 Приват');
  assert.equal(issues[0].date, '2026-03');
  assert.equal(issues[0].target.type, 'debt');
  assert.equal(issues[0].target.name, '🟩 Приват');
  assert.equal(issues[0].target.month, '2026-03');
  assert.equal(issues[0].target.kind, 'card');
});

test('findUnsyncedRecordsIssues: змішаний сценарій — по одному незапушеному в кожному з 3 доменів → 3 проблеми', () => {
  const ctx = sandbox({
    cloudSession: { user: { id: 'u1' } }, cloudFamilyId: 'fam-1',
    expenses: [{ id: 'e1', name: 'Кава', date: '2026-03-01', updatedAt: '2026-03-01T00:00:00.000Z' }],
    incomes: [{ id: 'i1', source: 'ЗП', date: '2026-03-01', updatedAt: '2026-03-01T00:00:00.000Z' }],
    debts: [{ id: 'd1', name: 'iPhone', kind: 'installment', month: '2026-03', balance: 3000, updatedAt: '2026-03-01T00:00:00.000Z' }],
  });
  assert.equal(ctx.findUnsyncedRecordsIssues().length, 3);
});
