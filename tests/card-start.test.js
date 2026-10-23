// Rev 2.32.137 (CARD-START): картка показується лише з місяця createdAt і далі (список, крапки, підсумки); ОЇ без змін; нові картки й імпорт Excel мають правильний createdAt.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildSandbox, evalInSandbox } = require('./extract');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const j = v => JSON.parse(JSON.stringify(v));
const NAMES = ['hideKey', 'isHiddenForMonth', 'isAccountHiddenForMonth', 'isCardVisibleForMonth', 'cardCreatedMonth', 'monthStartISO', 'stampBankAccountTimestamps', 'importEnsureAccounts', 'isInstallmentVisibleForMonth', 'newCardCreatedAt'];
const mk = g => buildSandbox(Object.assign({ hiddenFrom: {}, bankAccounts: [], installmentAccounts: [] }, g || {}), NAMES);
const CREATED = '2026-05-02T10:00:00.000Z'; // як у наявних картках на сервері

test('до createdAt картки немає; у місяці створення та після є', function(){
  const c = mk();
  const card = { name: 'K', createdAt: CREATED };
  assert.equal(c.cardCreatedMonth(card), '2026-05');
  assert.equal(c.isCardVisibleForMonth(card, '2026-04'), false);
  assert.equal(c.isCardVisibleForMonth(card, '2026-05'), true);
  assert.equal(c.isCardVisibleForMonth(card, '2026-06'), true);
  assert.equal(c.isCardVisibleForMonth(card, '2027-01'), true);
  assert.equal(c.isCardVisibleForMonth(card, '2025-12'), false);
});
test('сім наявних карток (created_at 2026-05-02): видимі з травня, невидимі раніше', function(){
  const c = mk();
  const cards = Array.from({ length: 7 }, (_, i) => ({ name: 'K' + i, createdAt: CREATED }));
  cards.forEach(card => { assert.equal(c.isCardVisibleForMonth(card, '2026-05'), true); assert.equal(c.isCardVisibleForMonth(card, '2026-04'), false); assert.equal(c.isCardVisibleForMonth(card, '2026-10'), true); });
});
test('прихована для місяця картка — без крапки/списку незалежно від createdAt; картка без createdAt не обмежується', function(){
  const c = mk({ hiddenFrom: { 'card:K': { month: '2026-08' } } });
  const card = { name: 'K', createdAt: CREATED };
  assert.equal(c.isCardVisibleForMonth(card, '2026-07'), true);
  assert.equal(c.isCardVisibleForMonth(card, '2026-08'), false);
  assert.equal(c.isCardVisibleForMonth({ name: 'Z' }, '2020-01'), true, 'без createdAt обмеження нема');
  assert.equal(c.isCardVisibleForMonth({ name: 'Z', createdAt: 'не дата' }, '2020-01'), true);
  assert.equal(c.isCardVisibleForMonth(null, '2026-05'), false);
});
test('isAccountHiddenForMonth: картка до createdAt прихована, ОЧ — лише hiddenFrom (без змін)', function(){
  const c = mk({ bankAccounts: [{ name: 'K', createdAt: CREATED }], hiddenFrom: { 'installment:O': { month: '2026-09' } } });
  assert.equal(c.isAccountHiddenForMonth('K', 'card', '2026-04'), true);
  assert.equal(c.isAccountHiddenForMonth('K', 'card', '2026-05'), false);
  assert.equal(c.isAccountHiddenForMonth('O', 'installment', '2026-04'), false, 'для ОЧ запису до місяця створення обмеження нема (firstMonth окремо)');
  assert.equal(c.isAccountHiddenForMonth('O', 'installment', '2026-09'), true);
  assert.equal(c.isAccountHiddenForMonth('Невідома', 'card', '2020-01'), false);
});
test('підсумки: борг картки до createdAt не потрапляє в debtTotalsForMonth', function(){
  const ex = require('./extract');
  const c = ex.buildSandbox({ debts: [{ name: 'K', kind: 'card', month: '2026-03', balance: 500 }, { name: 'K', kind: 'card', month: '2026-06', balance: 700 }], hiddenFrom: {}, expenses: [], bankAccounts: [{ name: 'K', createdAt: CREATED }] },
    ['debtTotalsForMonth', 'hideKey', 'isHiddenForMonth', 'isAccountHiddenForMonth', 'isCardVisibleForMonth', 'cardCreatedMonth', 'activeDebts', 'activeExpenses', 'monthKey', 'lastKnownBalance', 'typicalMonthlyPayment', 'linkedExpensesSum', 'OCH_OVALS_MAX', 'installmentStandardPayment', 'installmentPaymentsLeft', 'installmentPayAmount', 'installmentTypicalPay', 'ppPad', 'ppNextMonth', 'installmentChainCalc', 'installmentChainSpec', 'installmentBalanceBefore', 'estimateInstallment', 'resolveInstallmentFact']);
  assert.equal(ex.evalInSandbox(c, "debtTotalsForMonth('2026-04').total"), 0, 'квітень: картки ще нема');
  assert.equal(ex.evalInSandbox(c, "debtTotalsForMonth('2026-06').total"), 700);
});
test('імпорт Excel: нова картка має createdAt = початок найранішого імпортованого місяця її боргів; наявні не чіпаються; updatedAt — момент імпорту', function(){
  const c = mk();
  const banks = [{ name: 'Стара', creditLimit: 1, createdAt: '2026-05-02T10:00:00.000Z' }];
  const r = j(c.importEnsureAccounts([
    { kind: 'card', name: 'Нова', month: '2026-03' }, { kind: 'card', name: 'Нова', month: '2026-01' }, { kind: 'card', name: 'Нова', month: '2026-07' },
    { kind: 'card', name: 'Стара', month: '2026-01' }], banks, [], '2026-10-22T10:00:00.000Z'));
  assert.equal(r.addedCards, 1);
  assert.equal(banks.length, 2);
  assert.equal(c.cardCreatedMonth(banks[1]), '2026-01');
  assert.equal(banks[1].updatedAt, '2026-10-22T10:00:00.000Z');
  assert.equal(banks[0].createdAt, '2026-05-02T10:00:00.000Z', 'наявна не змінилась');
  assert.equal(c.isCardVisibleForMonth(banks[1], '2026-01'), true, 'борги імпортованого місяця видимі');
});
test('stampBankAccountTimestamps: наявні createdAt не змінюються; відсутній — за найранішим місяцем боргів, інакше «зараз»; updatedAt — зараз', function(){
  const c = mk();
  const accs = [{ name: 'A', createdAt: CREATED, updatedAt: CREATED }, { name: 'B' }, { name: 'C' }];
  const ch = c.stampBankAccountTimestamps(accs, [{ kind: 'card', name: 'B', month: '2026-03' }, { kind: 'card', name: 'B', month: '2026-02' }]);
  assert.equal(ch, true);
  assert.equal(accs[0].createdAt, CREATED); assert.equal(accs[0].updatedAt, CREATED);
  assert.equal(c.cardCreatedMonth(accs[1]), '2026-02');
  assert.ok(Math.abs(Date.parse(accs[2].createdAt) - Date.now()) < 60000, 'без боргів — «зараз»');
  assert.ok(accs[1].updatedAt);
  assert.equal(c.stampBankAccountTimestamps(accs, []), false, 'ідемпотентно');
});
test('нова картка: createdAt = момент створення (addBankAccount); споживачі правила: список, підсумки, крапки', function(){
  assert.match(SRC, /bankAccounts\.push\(\{ name, creditLimit: creditLimit \|\| null, createdAt: newCardCreatedAt\(selectedMonth, nowISO\), updatedAt: nowISO \}\);/);
  assert.match(SRC, /\.filter\(function\(x\)\{ return isCardVisibleForMonth\(x\.acc, selectedMonth\); \}\)/);
  assert.match(SRC, /if\(!isCardVisibleForMonth\(acc, selectedMonth\)\) return;/);
  assert.match(SRC, /const hidden = !isCardVisibleForMonth\(acc, selectedMonth\);/);
  assert.match(SRC, /\.filter\(function\(x\)\{ return !isAccountHiddenForMonth\(x\.name, 'card', month\); \}\)/);
});

test('Rev 2.32.138: нова картка в ранньому місяці — createdAt = початок вибраного місяця; поточний і майбутній — момент створення; борг за той місяць видимий', function(){
  const c = mk();
  const now = '2026-10-22T09:30:00.000Z';
  const early = c.newCardCreatedAt('2026-03', now);
  assert.equal(c.cardCreatedMonth({ createdAt: early }), '2026-03');
  assert.equal(c.isCardVisibleForMonth({ name: 'N', createdAt: early }, '2026-03'), true, 'введений за березень борг видимий');
  assert.equal(c.isCardVisibleForMonth({ name: 'N', createdAt: early }, '2026-02'), false);
  assert.equal(c.newCardCreatedAt('2026-10', now), now, 'поточний місяць');
  assert.equal(c.newCardCreatedAt('2027-02', now), now, 'майбутній місяць');
  assert.equal(c.newCardCreatedAt(null, now), now); assert.equal(c.newCardCreatedAt('сміття', now), now);
});
