// Rev 2.32.150 (INCOMPLETE-3): нюанси модалки неповних даних — нульовий борг, закрита ОЧ, вікно місяців, явний «0».
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildSandbox } = require('./extract');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const c = buildSandbox({}, ['incompleteMonthWindow', 'incompleteDetails', 'incompleteReasons']);
const NOW = '2026-10', PREV = '2026-09', OLD = '2026-08', FUT = '2026-11';
const R = function(e, r, m, hidden, now){ return JSON.parse(JSON.stringify(c.incompleteDetails(e, r, m || NOW, !!hidden, now === undefined ? NOW : now).map(function(d){ return d.code; }))); };
const CARD = { name: 'A', creditLimit: 50000, paymentDay: null };
const INST = { name: 'x', initialAmount: 30000, dueDay: null };

test('вікно: поточний і попередній місяць; грудень↔січень; без nowMonth вікно вимкнене', function(){
  assert.equal(c.incompleteMonthWindow(NOW, NOW), true); assert.equal(c.incompleteMonthWindow(PREV, NOW), true);
  assert.equal(c.incompleteMonthWindow(OLD, NOW), false); assert.equal(c.incompleteMonthWindow(FUT, NOW), false);
  assert.equal(c.incompleteMonthWindow('2025-12', '2026-01'), true); assert.equal(c.incompleteMonthWindow('2025-11', '2026-01'), false);
  assert.equal(c.incompleteMonthWindow(OLD, undefined), true);
});
test('картка: відомий нульовий борг — без мін. платежу й дня платежу; ліміт обов\'язковий завжди', function(){
  assert.deepEqual(R(CARD, { balance: 0, minPayment: null }), []);
  assert.deepEqual(R({ name: 'A', creditLimit: null, paymentDay: null }, { balance: 0 }), ['limit']);
  assert.deepEqual(R({ name: 'A', creditLimit: 0, paymentDay: null }, { balance: 0 }, PREV), ['limit']);
});
test('картка: борг > 0 або невідомий — мін. платіж і день платежу вимагаються; явний 0 мін. платежу знімає, порожнє лишає', function(){
  assert.deepEqual(R(CARD, { balance: 1000, minPayment: null }), ['minPayment', 'dueDay']);
  assert.deepEqual(R(CARD, { balance: 1000, minPayment: 0 }), ['dueDay']);
  assert.deepEqual(R(CARD, { balance: 1000, minPayment: 100 }, NOW), ['dueDay']);
  assert.deepEqual(R(CARD, null), ['balance', 'minPayment', 'dueDay']);
  assert.deepEqual(R({ name: 'A', creditLimit: 5, paymentDay: 10 }, { balance: 1000, minPayment: 0 }), []);
});
test('картка: майбутній і старші місяці — без місячних причин (ліміт лишається); попередній — з ними', function(){
  [OLD, FUT].forEach(function(m){
    assert.deepEqual(R(CARD, { balance: 1000, minPayment: null }, m), []);
    assert.deepEqual(R(CARD, null, m), []);
    assert.deepEqual(R({ name: 'A', creditLimit: null, paymentDay: null }, null, m), ['limit']);
  });
  assert.deepEqual(R(CARD, { balance: 1000, minPayment: null }, PREV), ['minPayment', 'dueDay']);
});
test('картка прихована (до createdAt / після «приховано з»): без причин, навіть без ліміту', function(){
  assert.deepEqual(R({ name: 'A', creditLimit: null }, null, NOW, true), []);
  assert.deepEqual(R({ name: 'A', creditLimit: null }, null, FUT, true), []);
});
test('ОЧ закрита (залишок відомий і ≤ 0): жодних причин, включно з датою й початковою сумою; будь-який місяць', function(){
  const bare = { name: 'x', initialAmount: null, dueDay: null };
  [NOW, PREV, OLD, FUT].forEach(function(m){ assert.deepEqual(R(bare, { balance: 0, monthlyPayment: null }, m), [], m); });
  assert.deepEqual(R(bare, { balance: -5 }), []);
  assert.deepEqual(R(bare, { balance: 1 }), ['dueDay', 'initialAmount', 'payment']); // не закрита
});
test('ОЧ: залишок > 0 без платежу — payment; явний 0 знімає; порожнє лишає; невідомий залишок — balance + залежний payment', function(){
  assert.deepEqual(R({ name: 'x', initialAmount: 1, dueDay: 5 }, { balance: 20000, monthlyPayment: null }), ['payment']);
  assert.deepEqual(R({ name: 'x', initialAmount: 1, dueDay: 5 }, { balance: 20000, monthlyPayment: 0 }), []);
  assert.deepEqual(R({ name: 'x', initialAmount: 1, dueDay: 5 }, { balance: null, monthlyPayment: null }), ['balance', 'payment']);
  assert.deepEqual(R({ name: 'x', initialAmount: 1, dueDay: 5 }, { balance: null, monthlyPayment: 0 }), ['balance']);
});
test('ОЧ: майбутній і старші місяці — лише постійні (дата, початкова сума); попередній — і місячні; приховані — []', function(){
  [OLD, FUT].forEach(function(m){
    assert.deepEqual(R(INST, { balance: 20000, monthlyPayment: null }, m), ['dueDay'], m);
    assert.deepEqual(R({ name: 'x', initialAmount: 0, dueDay: 5 }, null, m), ['initialAmount'], m);
    assert.deepEqual(R({ name: 'x', initialAmount: 1, dueDay: 5 }, null, m), [], m);
  });
  assert.deepEqual(R(INST, { balance: 20000, monthlyPayment: null }, PREV), ['dueDay', 'payment']);
  assert.deepEqual(R({ name: 'x', initialAmount: null }, null, NOW, true), []);
});
test('залежність (dependent) не змінилась: мін. платіж картки і платіж ОЧ при невідомому боргу — залежні, день платежу — ні', function(){
  const d = c.incompleteDetails(CARD, null, NOW, false, NOW);
  assert.deepEqual(JSON.parse(JSON.stringify(d)), [{ code: 'balance', dependent: false }, { code: 'minPayment', dependent: true }, { code: 'dueDay', dependent: false }]);
});
test('виклики: картка й ОЧ передають поточний київський місяць; «Заповнити» вважає введений «0» непорожнім; вигляд модалки не чіпали', function(){
  assert.equal((SRC.match(/hidden, kyivTodayISO\(\)\.slice\(0, 7\)\)/g) || []).length, 2);
  assert.match(SRC, /if\(raw !== ''\) return; \/\/ Rev 2\.32\.150/);
  assert.match(SRC, /function showIncompleteInfo\(kind, i\)/);
});
