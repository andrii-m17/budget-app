// Rev 2.18.0 — тести для повноекранного Журналу (навігація по місяцях):
// shiftMonth() (арифметика місяців, включно з переходом через межу року) і
// recordsForMonth() (чиста фільтрація записів за місяцем, винесена окремо з
// renderJournalView() саме для цього тесту). Сам рендер (buildRecordGroupsHtml)
// НЕ ізольований — це побудова DOM-розмітки (.expense-row/.journal-day-group),
// той самий клас функцій, що вже задокументований як невідʼємний від DOM у
// tests/och-model.test.js (populateInstallmentTable) — тестуємо лише чисту
// логіку, якою він живиться.
// Rev 2.19.0 — додано findRecordIdForDate() (календар Журналу, Крок 2 ROADMAP
// п.38): чистий пошук першого запису (витрата/дохід) на точну дату, що
// повертає той самий DOM-id, який buildRecordGroupsHtml (не чіпали) вже
// проставляє на рядок — використовується для flashDiagnosticTarget після
// вибору дати в календарі.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildSandbox } = require('./extract');

function sandbox({ expenses, incomes } = {}){
  return buildSandbox(
    { expenses: expenses || [], incomes: incomes || [] },
    ['shiftMonth', 'monthKey', 'recordsForMonth', 'findRecordIdForDate']
  );
}

test('shiftMonth: вперед у межах року', () => {
  const ctx = sandbox();
  assert.equal(ctx.shiftMonth('2026-03', 1), '2026-04');
});

test('shiftMonth: назад у межах року', () => {
  const ctx = sandbox();
  assert.equal(ctx.shiftMonth('2026-03', -1), '2026-02');
});

test('shiftMonth: грудень → січень наступного року', () => {
  const ctx = sandbox();
  assert.equal(ctx.shiftMonth('2026-12', 1), '2027-01');
});

test('shiftMonth: січень → грудень попереднього року', () => {
  const ctx = sandbox();
  assert.equal(ctx.shiftMonth('2026-01', -1), '2025-12');
});

test('shiftMonth: delta більший за 12 — теж коректно переносить рік', () => {
  const ctx = sandbox();
  assert.equal(ctx.shiftMonth('2026-06', 8), '2027-02');
});

test('recordsForMonth: лишає тільки записи обраного місяця', () => {
  const ctx = sandbox();
  const records = [
    { date: '2026-08-31', name: 'Серпень' },
    { date: '2026-09-01', name: 'Вересень 1' },
    { date: '2026-09-15', name: 'Вересень 2' },
    { date: '2026-10-01', name: 'Жовтень' },
  ];
  const result = ctx.recordsForMonth(records, '2026-09');
  assert.equal(result.length, 2);
  assert.deepEqual(result.map(r => r.name), ['Вересень 1', 'Вересень 2']);
});

test('recordsForMonth: місяць без жодного запису → порожній масив', () => {
  const ctx = sandbox();
  const records = [{ date: '2026-08-31', name: 'Серпень' }];
  assert.deepEqual(ctx.recordsForMonth(records, '2026-09'), []);
});

test('recordsForMonth: порожній вхідний масив → порожній результат', () => {
  const ctx = sandbox();
  assert.deepEqual(ctx.recordsForMonth([], '2026-09'), []);
});

test('findRecordIdForDate: знаходить витрату на точну дату', () => {
  const ctx = sandbox({
    expenses: [
      { id: 'e1', name: 'Кава', date: '2026-09-14' },
      { id: 'e2', name: 'Хліб', date: '2026-09-15' },
    ],
  });
  assert.equal(ctx.findRecordIdForDate('2026-09-15'), 'journal-row-expense-1');
});

test('findRecordIdForDate: витрата пріоритетніша за дохід на ту саму дату', () => {
  const ctx = sandbox({
    expenses: [{ id: 'e1', name: 'Кава', date: '2026-09-15' }],
    incomes: [{ id: 'i1', source: 'Зарплата Андрій', date: '2026-09-15' }],
  });
  assert.equal(ctx.findRecordIdForDate('2026-09-15'), 'journal-row-expense-0');
});

test('findRecordIdForDate: без витрат на цю дату — шукає серед доходів', () => {
  const ctx = sandbox({
    expenses: [{ id: 'e1', name: 'Кава', date: '2026-09-14' }],
    incomes: [{ id: 'i1', source: 'Зарплата Андрій', date: '2026-09-15' }],
  });
  assert.equal(ctx.findRecordIdForDate('2026-09-15'), 'journal-row-income-0');
});

test('findRecordIdForDate: жодного запису на цю дату → null (не помилка)', () => {
  const ctx = sandbox({
    expenses: [{ id: 'e1', name: 'Кава', date: '2026-09-14' }],
  });
  assert.equal(ctx.findRecordIdForDate('2026-09-20'), null);
});
