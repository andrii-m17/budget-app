// Rev 2.31.3 (B) — крапки «дані заповнені неповністю» для карток боргів і ОЧ.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ex = require('./extract');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const ctx = ex.buildSandbox({}, ['incompleteReasons']);
const j = code => JSON.parse(ex.evalInSandbox(ctx, 'JSON.stringify(' + code + ')'));
const R = (e, r, h) => j(`incompleteReasons(${JSON.stringify(e)},${JSON.stringify(r)},"2026-10",${!!h})`);
const MOD = SRC.slice(SRC.indexOf('// ===== Rev 2.31.3 (B)'), SRC.indexOf('// ===== Rev 2.28.1 (C) — аудит id/name'));

test('картка: повна → []; кожна причина окремо; баланс>0 без мін. платежу; нульовий баланс не вимагає мін. платежу', () => {
  const full = { name: 'A', creditLimit: 50000 };
  assert.deepEqual(R(full, { balance: 1000, minPayment: 100 }), []);
  assert.deepEqual(R({ name: 'A', creditLimit: null }, { balance: 1000, minPayment: 100 }), ['limit']);
  assert.deepEqual(R({ name: 'A', creditLimit: 0 }, { balance: 1000, minPayment: 100 }), ['limit'], 'ліміт має бути > 0');
  assert.deepEqual(R(full, null), ['balance'], 'немає запису за місяць');
  assert.deepEqual(R(full, { balance: null, minPayment: null }), ['balance']);
  assert.deepEqual(R(full, { balance: 1000, minPayment: null }), ['minPayment']);
  assert.deepEqual(R(full, { balance: 1000 }), ['minPayment']);
  assert.deepEqual(R(full, { balance: 0, minPayment: null }), [], 'нульовий баланс — мін. платіж не потрібен');
  assert.deepEqual(R(full, { balance: 1000, minPayment: 0 }), [], 'явно внесений 0 — не відсутній');
  assert.deepEqual(R({ name: 'A', creditLimit: null }, null), ['limit', 'balance'], 'кілька причин одразу');
  assert.deepEqual(R({ name: 'A', creditLimit: null }, { balance: 5, minPayment: null }), ['limit', 'minPayment']);
});

test('ОЧ: повна → []; день платежу / початкова сума / платіж окремо; нульовий залишок не вимагає платежу', () => {
  const full = { name: 'iPhone', initialAmount: 30000, dueDay: 15 };
  assert.deepEqual(R(full, { balance: 20000, monthlyPayment: 2500 }), []);
  assert.deepEqual(R({ name: 'x', initialAmount: 30000, dueDay: null }, { balance: 20000, monthlyPayment: 2500 }), ['dueDay']);
  assert.deepEqual(R({ name: 'x', initialAmount: null, dueDay: 5 }, { balance: 20000, monthlyPayment: 2500 }), ['initialAmount']);
  assert.deepEqual(R({ name: 'x', initialAmount: 0, dueDay: 5 }, { balance: 20000, monthlyPayment: 2500 }), ['initialAmount'], 'початкова сума > 0');
  assert.deepEqual(R(full, { balance: 20000, monthlyPayment: null }), ['payment']);
  assert.deepEqual(R(full, { balance: 20000, monthlyPayment: 0 }), ['payment']);
  assert.deepEqual(R(full, { balance: 0, monthlyPayment: null }), [], 'нульовий залишок — платіж не потрібен');
  assert.deepEqual(R(full, null), [], 'без розв\'язаного факту причину payment не вигадуємо');
  assert.deepEqual(R({ name: 'x', initialAmount: null, dueDay: null }, { balance: 5, monthlyPayment: null }), ['dueDay', 'initialAmount', 'payment']);
});

test('прихована картка/ОЧ — без крапки; порожня сутність — []', () => {
  assert.deepEqual(R({ name: 'A', creditLimit: null }, null, true), []);
  assert.deepEqual(R({ name: 'x', initialAmount: null, dueDay: null }, { balance: 5 }, true), []);
  assert.deepEqual(j('incompleteReasons(null,null,"2026-10",false)'), []);
});

test('крапки не дублюють наявні місячні статуси: окремий клас .cdr-dot, не .data-status; KPI-логіка (renderDataStatusDot/missingCardDebtsForMonth) не чіпалась', () => {
  assert.match(SRC, /\.cdr-dot\{ position:relative; display:inline-flex; width:7px; height:7px;[^}]*background:var\(--color-warning\)/);
  assert.match(SRC, /\.data-status-dot::after\{ content:""; width:7px; height:7px;/);
  const mod = MOD;
  assert.ok(!/renderDataStatusDot|missingCardDebtsForMonth|debtUiStatus/.test(mod), 'модуль не торкається KPI-статусів');
  // рядок — не вкладена кнопка (button у button недопустимо): крапка — span
  assert.match(mod, /return `<span class="cdr-dot" role="img" aria-label="Дані заповнені неповністю" onclick="event\.stopPropagation\(\); showIncompleteInfo\(/);
});

test('прихована картка й прихована ОЧ не мають крапки: використовуються isHiddenForMonth / isInstallmentVisibleForMonth для вибраного місяця', () => {
  assert.match(MOD, /const hidden = isHiddenForMonth\(acc\.name, 'card', selectedMonth\);/);
  assert.match(MOD, /const hidden = !isInstallmentVisibleForMonth\(acc, selectedMonth\);/);
});

test('крапки у рядках карток і ОЧ; лічильники на сегментах «Борги»/«ОЧ»; оновлення після збереження через renderAll без мерехтіння (текст міняється лише при зміні числа)', () => {
  assert.match(SRC, /\$\{incompleteDotHtml\('card', i, cardIncompleteReasons\(acc\)\)\}/);
  assert.match(SRC, /\$\{incompleteDotHtml\('installment', i, installmentIncompleteReasons\(acc\)\)\}/);
  assert.match(SRC, /id="seg-badge-debts"/);
  assert.match(SRC, /id="seg-badge-installments"/);
  assert.match(SRC, /safeCall\(updateIncompleteBadges, 'updateIncompleteBadges'\)/);
  assert.match(MOD, /if\(el\.textContent !== txt\) el\.textContent = txt;/);
  // таблиці «Обліку» перемальовуються лише при зміні вмісту (acctGuardedSetHtml) → нічого не мерехтить
  assert.match(SRC, /if\(el\.__acctHtml === value && el\.firstChild\) return;/);
});

test('«Заповнити» відкриває шторку цієї картки/ОЧ і лише підсвічує перше порожнє поле (без focus() — клавіатурна логіка шторок не чіпається); кнопка основна, не червона', () => {
  const fill = MOD.slice(MOD.indexOf('function fillIncomplete'), MOD.indexOf('function recordIncompleteDots'));
  assert.match(fill, /openCardDebtEditor\(i\); else openInstallmentEditor\(i\);/);
  assert.ok(!/\.focus\(/.test(fill), 'без автофокусу');
  assert.match(fill, /el\.scrollIntoView\(\{ block: 'center' \}\);/);
  assert.match(MOD, /showConfirmModal\(msg, function\(\)\{ fillIncomplete\(kind, i, reasons\[0\]\); \}, 'Заповнити'\);/);
  assert.match(MOD, /getElementById\('app-modal-confirm-btn'\)\.className = 'submit-btn';/);
  ['limit', 'balance', 'minPayment', 'dueDay', 'initialAmount', 'payment'].forEach(r => { assert.match(MOD, new RegExp(r + ': \'[a-z-]+\'')); });
  ['cdd-limit', 'cdd-balance', 'cdd-minpay', 'idd-due-day', 'idd-initial', 'idd-pay'].forEach(id => assert.ok(SRC.includes('id="' + id + '"'), id + ' існує'));
});

test('рекордер: incomplete-dots (cards, installments, reasonCounts) при відкритті «Обліку», без назв і сум', () => {
  const ev = MOD.slice(MOD.indexOf('function recordIncompleteDots'));
  assert.match(ev, /type: 'incomplete-dots', cards: cards, installments: inst, reasonCounts: counts/);
  assert.ok(!/name|\.balance|\.amount/.test(ev.slice(ev.indexOf('pushDebugEvent')).replace(/reasonCounts/g, '')), 'у подію не потрапляють назви/суми');
  assert.match(SRC, /function onAccountVisit\(\)\{[^}]*recordIncompleteDots\(\); \}/);
  ['cards', 'installments', 'reasonCounts'].forEach(f => assert.match(SRC, new RegExp("DEBUG_EVENT_ALLOWLIST = \\[[\\s\\S]*'" + f + "'")));
});

test('нових полів у БД немає: модуль не пише в cloud/бд і не змінює дані (лише читає)', () => {
  assert.ok(!/client\.from|saveDebts|saveBankAccounts|\.push\(|expenses\.|debts\.(push|splice)/.test(MOD.replace(/out\.push|res\.push/g, '')), 'лише читання');
});
