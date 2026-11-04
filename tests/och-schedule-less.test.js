// Дослідження 242 — ОЧ без графіка (порожні due_day, term_months, start_date, pay_mode), без боргів і витрат: як живуть у місяцях M і M+1. Синтетичні дані. Логіка не змінюється.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildSandbox } = require('./extract');

const NAMES = ['hideKey', 'hideKeyLegacy', 'hideKeyForAccount', 'hasIdHideKey', 'findAccountMonthDebt', 'accountsOfKind', 'hiddenEntryKey', 'hiddenEntryFor', 'isHiddenForMonth', 'isInstallmentVisibleForMonth', 'installmentStartMonth', 'installmentStartMonthFor', 'cardCreatedMonth', 'accountNameKey', 'accountNameTaken', 'incompleteDetails', 'incompleteMonthWindow'];
function sb(g){ return buildSandbox(Object.assign({ debts: [], expenses: [], installmentAccounts: [], bankAccounts: [], hiddenFrom: {} }, g), NAMES); }

// «Повна» ОЧ із графіком і така сама за сумою ОЧ без графіка, створена 1 листопада (мітка часу від ensureInstallmentAccountIdentity).
const FULL = { name: 'Предмет 1', cloudId: 'f1', initialAmount: 30000, dueDay: 12, termMonths: 10, startDate: '2026-03-10', payMode: 'auto', createdAt: '2026-03-10T09:00:00Z' };
const BARE = { name: 'Предмет1', cloudId: 'b1', initialAmount: 30000, dueDay: null, termMonths: null, startDate: null, payMode: null, createdAt: '2026-11-01T20:34:00Z' };

test('характеристика: ОЧ без графіка невидима до місяця створення запису й «оживає» в наступному за ним місяці', function(){
  const c = sb({ installmentAccounts: [FULL, BARE] });
  assert.equal(c.installmentStartMonthFor(BARE), '2026-11', 'початок = місяць createdAt, бо ні start_date, ні боргів, ні витрат');
  assert.equal(c.isInstallmentVisibleForMonth(BARE, '2026-10'), false, 'M-1: не видно');
  assert.equal(c.isInstallmentVisibleForMonth(BARE, '2026-11'), true, 'M: видно як жива');
});

test('характеристика: помаранчева крапка — немає числа платежу, залишку й платежу місяця', function(){
  const c = sb({ installmentAccounts: [BARE] });
  const codes = c.incompleteDetails(BARE, null, '2026-11', false, '2026-11').map(d => d.code);
  assert.deepEqual(Array.from(codes),['dueDay', 'balance', 'payment']);
});

test('характеристика: попередження про дубль назви не ловить назви, що різняться пробілом усередині', function(){
  const c = sb({ installmentAccounts: [FULL] });
  assert.equal(c.accountNameTaken(c.installmentAccounts, 'Предмет1'), false);
  assert.equal(c.accountNameTaken(c.installmentAccounts, 'Предмет 1'), true, 'точний збіг ловиться');
});

// Очікувана поведінка (кандидат а): ОЧ без жодного сліду графіка не переноситься як жива. Падає на поточному коді; todo, щоб не ламати `node --test`.
test('ОЧ без графіка, боргів і витрат не є живою у місяці створення', { todo: 'Дослідження 242: падає на поточному коді' }, function(){
  const c = sb({ installmentAccounts: [FULL, BARE] });
  assert.equal(c.isInstallmentVisibleForMonth(BARE, '2026-11'), false);
  assert.equal(c.isInstallmentVisibleForMonth(BARE, '2026-12'), false);
});
