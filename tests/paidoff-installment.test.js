// Rev 2.32.69 — пропозиція приховати погашену ОЧ.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildSandbox } = require('./extract');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const base = ['ppPad', 'ppNextMonth', 'PAY_MONTHS_GEN', 'isInstallmentPaidOff', 'paidOffHideFromMonth', 'paidOffHideLabel'];
const c = buildSandbox({}, base);
const R = function(month, balance, monthlyPayment){ return { month: month, balance: balance, monthlyPayment: monthlyPayment }; };
test('isInstallmentPaidOff: залишок 0 у останньому записі', function(){
  assert.equal(c.isInstallmentPaidOff([R('2026-08', 300, 100), R('2026-09', 0, 300)]), true);
  assert.equal(c.isInstallmentPaidOff([R('2026-09', -5, 100)]), true);
});
test('isInstallmentPaidOff: платіж дорівнює (або більший за) попередній залишок', function(){
  assert.equal(c.isInstallmentPaidOff([R('2026-08', 300, 100), R('2026-09', 300, 300)]), true);
  assert.equal(c.isInstallmentPaidOff([R('2026-08', 300, 100), R('2026-09', 200, 350)]), true);
});
test('isInstallmentPaidOff: залишок > 0 і платіж менший — не погашена; без записів — ні; порожній залишок — ні', function(){
  assert.equal(c.isInstallmentPaidOff([R('2026-08', 300, 100), R('2026-09', 200, 100)]), false);
  assert.equal(c.isInstallmentPaidOff([]), false); assert.equal(c.isInstallmentPaidOff(null), false);
  assert.equal(c.isInstallmentPaidOff([R('2026-09', null, undefined)]), false);
  assert.equal(c.isInstallmentPaidOff([R('2026-09', 100, 500)]), false); // немає попереднього залишку — платіж не порівнюється
});
test('записи неупорядковані — береться останній за місяцем', function(){
  assert.equal(c.isInstallmentPaidOff([R('2026-09', 0, 100), R('2026-07', 500, 100)]), true);
  assert.equal(c.isInstallmentPaidOff([R('2026-10', 100, 50), R('2026-09', 0, 100)]), false); // новіший запис із залишком > 0 — не погашена
});
test('paidOffHideFromMonth: наступний місяць; перехід через рік; null коли не погашена', function(){
  assert.equal(c.paidOffHideFromMonth([R('2026-09', 0, 100)]), '2026-10');
  assert.equal(c.paidOffHideFromMonth([R('2026-12', 0, 100)]), '2027-01');
  assert.equal(c.paidOffHideFromMonth([R('2026-09', 5, 1)]), null);
  assert.equal(c.paidOffHideLabel('2027-01'), 'січня'); assert.equal(c.paidOffHideLabel('2026-10'), 'жовтня'); assert.equal(c.paidOffHideLabel('2026-11'), 'листопада');
});
test('installmentPaidOffOffer: приховані й непогашені не пропонуються', function(){
  const mk = function(debts, hidden){ return buildSandbox({ activeDebts: function(){ return debts; }, monthKey2: function(m){ return m; }, isHiddenForMonth: function(n, k, m){ return !!hidden && m >= hidden; } }, base.concat(['installmentPaidOffOffer'])); };
  const paid = [{ kind: 'installment', name: 'A', month: '2026-09', balance: 0, monthlyPayment: 100 }];
  assert.deepEqual(JSON.parse(JSON.stringify(mk(paid).installmentPaidOffOffer('A'))), { from: '2026-10', label: 'жовтня' });
  assert.equal(mk(paid, '2026-10').installmentPaidOffOffer('A'), null); // вже прихована
  assert.equal(mk([{ kind: 'installment', name: 'A', month: '2026-09', balance: 50, monthlyPayment: 10 }]).installmentPaidOffOffer('A'), null);
  assert.equal(mk(paid).installmentPaidOffOffer('Інша'), null);
});
test('діалог: тексти, основна кнопка — наявний механізм hideEntityFromMonth з наступним місяцем, «Не зараз» нічого не зберігає', async function(){
  const calls = [], shown = {};
  const ctx = buildSandbox({ installmentPaidOffOffer: function(){ return { from: '2026-10', label: 'жовтня' }; }, stripLeadingEmoji: function(x){ return x; },
    showConfirmModal: function(msg, onConfirm, label, variant){ shown.msg = msg; shown.label = label; shown.variant = variant; shown.confirm = onConfirm; },
    document: { getElementById: function(){ return { textContent: '' }; } }, hideEntityFromMonth: function(k, m){ calls.push('hide:' + k + ':' + m); }, hideKey: function(n, k){ return k + ':' + n; }, hideKeyLegacy: function(n, k){ return k + ':' + n; },
    saveHiddenFrom: async function(){ calls.push('save'); return {}; }, reportSaveResult: function(){}, renderAll: function(){ calls.push('render'); } }, ['applyHideInstallmentFrom', 'offerHidePaidOffInstallment']);
  assert.equal(ctx.offerHidePaidOffInstallment('Телефон'), true);
  assert.equal(shown.msg, 'ОЧ погашено\n\n«Телефон»: залишок 0 ₴. Приховати з жовтня? Платежі й нагадування для неї припиняться, історію буде збережено.');
  assert.equal(shown.label, 'Приховати з жовтня'); assert.deepEqual(calls, [], 'до підтвердження нічого не змінено («Не зараз» не викликає нічого)');
  await shown.confirm(); await new Promise(function(r){ setTimeout(r, 5); });
  assert.deepEqual(calls, ['hide:installment:Телефон:2026-10', 'save', 'render']);
});
test('діалог не з\'являється без пропозиції (залишок > 0 / прихована)', function(){
  const ctx = buildSandbox({ installmentPaidOffOffer: function(){ return null; }, showConfirmModal: function(){ throw new Error('не повинно'); } }, ['offerHidePaidOffInstallment']);
  assert.equal(ctx.offerHidePaidOffInstallment('X'), false);
});
test('охоронні: діалог після збереження лише при нульовому залишку; підпис у рядку ОЧ; той самий механізм у removeInstallmentAccount; кнопка «Не зараз»', function(){
  assert.match(SRC, /if\(pushedRecord && !pushedRecord\.deletedAt && pushedRecord\.balance === 0\) setTimeout\(function\(\)\{ offerHidePaidOffInstallment\(newName\); \}, 350\);/);
  assert.match(SRC, /cancel\.textContent = 'Не зараз'/);
  assert.match(SRC, /Погашено · Приховати з \$\{escapeHtml\(paidOff\.label\)\}/);
  assert.match(SRC, /hideEntityFromMonth\(hideKey\(name,'installment'\), fromMonth, hideKeyLegacy\(name,'installment'\), name\);/);
  assert.match(SRC, /function applyHideInstallmentFrom\(name, fromMonth\)\{\n  hideEntityFromMonth\(hideKey\(name, 'installment'\), fromMonth, hideKeyLegacy\(name, 'installment'\), name\);/);
  assert.ok(!/hideEntityFromMonth\([^)]*\);\s*\/\/ авто/.test(SRC), 'автоматичного приховування немає');
  const offer = SRC.slice(SRC.indexOf('function offerHidePaidOffInstallment'), SRC.indexOf('function removeInstallmentAccount'));
  assert.ok(offer.indexOf('hideEntityFromMonth') === -1, 'діалог сам нічого не ховає — лише в onConfirm через applyHideInstallmentFrom');
});
