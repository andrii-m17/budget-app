// Rev 2.14.0 — тести carry-forward логіки боргів/ОЧ (FINANCIAL_RULES §4-5):
// debtAsOfInfo() — "станом на [місяць]", коли за поточний місяць запису
// немає; lastKnownBalance() — останній ФАКТИЧНИЙ баланс до заданого місяця
// (основа prefill у формі щомісячного оновлення).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildSandbox } = require('./extract');

function sandbox(debts, hiddenFrom){
  return buildSandbox(
    { debts, hiddenFrom: hiddenFrom || {} },
    ['hideKey', 'isHiddenForMonth', 'debtAsOfInfo', 'lastKnownBalance']
  );
}

test('debtAsOfInfo: немає жодного запису до місяця → hasData=false', () => {
  // Примітка: порівнюємо поля окремо, а не через assert.deepEqual(info, {...}) —
  // об'єкт info створений усередині vm.Context (окремий "реалм"), і Node
  // трактує його як інший тип навіть при однаковій структурі полів.
  const ctx = sandbox([]);
  const info = ctx.debtAsOfInfo('2026-03', 'card');
  assert.equal(info.hasData, false);
  assert.equal(info.isCurrent, false);
  assert.equal(info.asOfMonth, null);
});

test('debtAsOfInfo: запис за минулий місяць → carry-forward "станом на", isCurrent=false', () => {
  const debts = [
    { name: 'ПриватБанк', kind: 'card', month: '2026-01', balance: 5000 },
  ];
  const ctx = sandbox(debts);
  const info = ctx.debtAsOfInfo('2026-03', 'card');
  assert.equal(info.hasData, true);
  assert.equal(info.asOfMonth, '2026-01');
  assert.equal(info.isCurrent, false);
});

test('debtAsOfInfo: запис саме за поточний місяць → isCurrent=true', () => {
  const debts = [
    { name: 'ПриватБанк', kind: 'card', month: '2026-01', balance: 5000 },
    { name: 'ПриватБанк', kind: 'card', month: '2026-03', balance: 4200 },
  ];
  const ctx = sandbox(debts);
  const info = ctx.debtAsOfInfo('2026-03', 'card');
  assert.equal(info.isCurrent, true);
  assert.equal(info.asOfMonth, '2026-03');
});

test('debtAsOfInfo: береться НАЙСТАРІШИЙ "станом на" серед кількох боргів одного kind (консервативна оцінка)', () => {
  const debts = [
    { name: 'ПриватБанк', kind: 'card', month: '2026-02', balance: 5000 },
    { name: 'Mono',       kind: 'card', month: '2026-01', balance: 1000 },
  ];
  const ctx = sandbox(debts);
  const info = ctx.debtAsOfInfo('2026-03', 'card');
  assert.equal(info.asOfMonth, '2026-01');
  assert.equal(info.isCurrent, false);
});

test('debtAsOfInfo: прихований борг (hiddenFrom) не враховується після межі приховування', () => {
  const debts = [
    { name: 'Старий кредит', kind: 'card', month: '2026-01', balance: 3000 },
  ];
  const ctx = sandbox(debts, { 'card:Старий кредит': '2026-02' });
  const info = ctx.debtAsOfInfo('2026-03', 'card');
  assert.equal(info.hasData, false);
});

test('lastKnownBalance: немає записів до заданого місяця → null', () => {
  const debts = [{ name: 'ПриватБанк', kind: 'card', month: '2026-02', balance: 4000 }];
  const ctx = sandbox(debts);
  assert.equal(ctx.lastKnownBalance('ПриватБанк', 'card', '2026-01'), null);
});

test('lastKnownBalance: бере найновіший факт СУВОРО до beforeMonth', () => {
  const debts = [
    { name: 'ПриватБанк', kind: 'card', month: '2026-01', balance: 5000 },
    { name: 'ПриватБанк', kind: 'card', month: '2026-02', balance: 4200 },
    { name: 'ПриватБанк', kind: 'card', month: '2026-04', balance: 3000 }, // майбутнє відносно запиту — ігнорується
  ];
  const ctx = sandbox(debts);
  assert.equal(ctx.lastKnownBalance('ПриватБанк', 'card', '2026-03'), 4200);
});

test('lastKnownBalance: запис РІВНО за beforeMonth не рахується (строге "до")', () => {
  const debts = [{ name: 'ПриватБанк', kind: 'card', month: '2026-03', balance: 4200 }];
  const ctx = sandbox(debts);
  assert.equal(ctx.lastKnownBalance('ПриватБанк', 'card', '2026-03'), null);
});
