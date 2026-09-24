// Rev 2.14.0 — тести computeImportPlan() (Rev 2.13.0): дедуплікація й
// оновлення записів при імпорті файлу "Поділитися витратами". Функція без
// побічних ефектів (не читає expenses/localStorage напряму, приймає масиви
// як аргументи) — тому єдина з чотирьох цілей ревізії, яку можна викликати
// геть без vm-заглушок глобальних змінних.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildSandbox } = require('./extract');

function sandbox(){
  return buildSandbox({}, ['computeImportPlan']);
}

test('новий id → потрапляє в newOnes', () => {
  const ctx = sandbox();
  const existing = [];
  const incoming = [{ id: 'a1', date: '2026-03-01', name: 'Кава', amount: 80, updatedAt: '2026-03-01T08:00:00.000Z' }];
  const plan = ctx.computeImportPlan(incoming, existing);
  assert.equal(plan.newOnes.length, 1);
  assert.equal(plan.updatedOnes.length, 0);
  assert.equal(plan.dupCount, 0);
});

test('id вже є, вхідний updatedAt СТАРІШИЙ → пропуск (dupCount), без newOnes/updatedOnes', () => {
  const ctx = sandbox();
  const existing = [{ id: 'a1', amount: 80, updatedAt: '2026-03-05T08:00:00.000Z' }];
  const incoming = [{ id: 'a1', date: '2026-03-01', name: 'Кава', amount: 100, updatedAt: '2026-03-01T08:00:00.000Z' }];
  const plan = ctx.computeImportPlan(incoming, existing);
  assert.equal(plan.newOnes.length, 0);
  assert.equal(plan.updatedOnes.length, 0);
  assert.equal(plan.dupCount, 1);
});

test('id вже є, вхідний updatedAt ТОЙ САМИЙ → пропуск (dupCount), не оновлення', () => {
  const ctx = sandbox();
  const ts = '2026-03-05T08:00:00.000Z';
  const existing = [{ id: 'a1', amount: 80, updatedAt: ts }];
  const incoming = [{ id: 'a1', date: '2026-03-01', name: 'Кава', amount: 100, updatedAt: ts }];
  const plan = ctx.computeImportPlan(incoming, existing);
  assert.equal(plan.updatedOnes.length, 0);
  assert.equal(plan.dupCount, 1);
});

test('id вже є, вхідний updatedAt НОВІШИЙ → потрапляє в updatedOnes (заміщення)', () => {
  const ctx = sandbox();
  const existing = [{ id: 'a1', amount: 80, updatedAt: '2026-03-01T08:00:00.000Z' }];
  const incoming = [{ id: 'a1', date: '2026-03-05', name: 'Кава з молоком', amount: 120, updatedAt: '2026-03-05T09:00:00.000Z' }];
  const plan = ctx.computeImportPlan(incoming, existing);
  assert.equal(plan.newOnes.length, 0);
  assert.equal(plan.updatedOnes.length, 1);
  assert.equal(plan.updatedOnes[0].amount, 120);
  assert.equal(plan.dupCount, 0);
  // existingById дозволяє реальному коду знайти й змінити той самий об'єкт "на місці"
  assert.equal(plan.existingById.get('a1'), existing[0]);
});

test('id вже є, вхідний БЕЗ updatedAt → трактується як не новіший → пропуск', () => {
  const ctx = sandbox();
  const existing = [{ id: 'a1', amount: 80, updatedAt: '2026-03-01T08:00:00.000Z' }];
  const incoming = [{ id: 'a1', date: '2026-03-05', name: 'Кава', amount: 120 }];
  const plan = ctx.computeImportPlan(incoming, existing);
  assert.equal(plan.updatedOnes.length, 0);
  assert.equal(plan.dupCount, 1);
});

// Rev #30 (6D.42) — Sync Safety Patch P0.1: локально видалений (tombstoned)
// запис безумовно виграє, навіть якщо вхідний файл має НОВІШИЙ updatedAt —
// без цього повторний Family Bridge-імпорт міг би тихо оновити поля вже
// видаленого запису під tombstone (undelete-механізму в UI немає взагалі,
// тож порівнювати часи нема сенсу — deletedAt завжди переможець).
test('id вже є, existing.deletedAt встановлено → пропуск (dupCount), НАВІТЬ якщо вхідний updatedAt новіший', () => {
  const ctx = sandbox();
  const existing = [{ id: 'a1', amount: 80, updatedAt: '2026-03-01T08:00:00.000Z', deletedAt: '2026-03-01T08:00:00.000Z' }];
  const incoming = [{ id: 'a1', date: '2026-03-05', name: 'Кава', amount: 999, updatedAt: '2026-03-10T00:00:00.000Z' }];
  const plan = ctx.computeImportPlan(incoming, existing);
  assert.equal(plan.newOnes.length, 0);
  assert.equal(plan.updatedOnes.length, 0);
  assert.equal(plan.dupCount, 1);
  // existing-об'єкт лишається незайманим — жодне поле не мало торкнутись.
  assert.equal(existing[0].amount, 80);
});

test('змішаний файл: одночасно нові, оновлені й дублікати рахуються окремо', () => {
  const ctx = sandbox();
  const existing = [
    { id: 'old-1', amount: 100, updatedAt: '2026-03-01T00:00:00.000Z' }, // буде оновлено
    { id: 'old-2', amount: 200, updatedAt: '2026-03-10T00:00:00.000Z' }, // залишиться (дублікат)
  ];
  const incoming = [
    { id: 'new-1', date: '2026-03-01', name: 'Хліб', amount: 50, updatedAt: '2026-03-01T00:00:00.000Z' },
    { id: 'old-1', date: '2026-03-02', name: 'Молоко', amount: 60, updatedAt: '2026-03-02T00:00:00.000Z' },
    { id: 'old-2', date: '2026-03-03', name: 'Сир', amount: 70, updatedAt: '2026-03-01T00:00:00.000Z' },
  ];
  const plan = ctx.computeImportPlan(incoming, existing);
  assert.equal(plan.newOnes.length, 1);
  assert.equal(plan.updatedOnes.length, 1);
  assert.equal(plan.dupCount, 1);
});
