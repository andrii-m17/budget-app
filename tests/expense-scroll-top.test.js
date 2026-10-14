// Rev 2.32.43 (SC) — «+Витрата» завжди відкривається з верху.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildSandbox } = require('./extract');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const c = buildSandbox({}, ['shouldScrollExpenseTop']);
test('shouldScrollExpenseTop: усі тригери «+Витрата» — так; інші вкладки й невідомі тригери — ні', function(){
  ['tab', 'repeat', 'push'].forEach(function(t){ assert.equal(c.shouldScrollExpenseTop(t, { tab: 'vytraty' }), true, t); assert.equal(c.shouldScrollExpenseTop(t, { tab: 'analytics' }), false, t); });
  assert.equal(c.shouldScrollExpenseTop('x', { tab: 'vytraty' }), false); assert.equal(c.shouldScrollExpenseTop('tab'), false);
});
test('охоронні: скидання прокрутки йде ДО автофокуса, збережену позицію обнулено, події без значень', function(){
  const a = SRC.indexOf('const scrollTopForExpense'), b = SRC.indexOf('target.focus({preventScroll:true})');
  assert.ok(a > 0 && b > a, 'скидання раніше фокуса');
  assert.match(SRC, /tabScrollPositions\[tab\] = 0;/);
  assert.match(SRC, /mainColEl\.scrollTop = scrollTopForExpense \? 0 :/);
  assert.match(SRC, /type: 'expense-scroll-top', from: Math\.round\([^)]*\)[^)]*\), reason: expenseTopTrigger/);
});
test('сценарій: прокрутили, перейшли на іншу вкладку, повернулись — scrollTop 0; повторний тап теж', function(){
  const saved = {};
  const main = { scrollTop: 0 };
  // дзеркало логіки performSwitchTab для scrollTop
  const apply = function(prevTab, tab, fromScroll){
    const switching = !!prevTab && prevTab !== tab;
    if(switching) saved[prevTab] = fromScroll;
    const trig = tab === 'vytraty' ? (switching ? 'tab' : 'repeat') : null;
    const top = trig && c.shouldScrollExpenseTop(trig, { tab: tab });
    if(top) saved[tab] = 0;
    main.scrollTop = top ? 0 : (switching ? (saved[tab] || 0) : 0);
  };
  apply('analytics', 'vytraty', 0); main.scrollTop = 640;
  apply('vytraty', 'analytics', 640); assert.equal(main.scrollTop, 0);
  apply('analytics', 'vytraty', 0); assert.equal(main.scrollTop, 0);
  main.scrollTop = 500; apply('vytraty', 'vytraty', 500); assert.equal(main.scrollTop, 0);
  // інші вкладки зберігають прокрутку
  apply('analytics', 'accounting', 300); apply('accounting', 'analytics', 300); assert.equal(main.scrollTop, 300);
});
