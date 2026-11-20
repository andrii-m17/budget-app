// NAV-STATE (Rev 2.32.429): розгорнуті картки не переживають холодний запуск; повторний тап згортає картки лише своєї вкладки; шторки скидають прокручування при відкритті.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildSandbox } = require('./extract');
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

test('холодний запуск: стани розгортання карток — лише змінні в пам’яті зі значенням false, у сховище не пишуться', function(){
  const A = read('js/analytics.js');
  assert.match(A, /^let balOpen = false;/m);
  assert.match(A, /^let balPotOpen = false/m);
  [/localStorage[^\n]*bal(Pot)?Open/, /bal(Pot)?Open[^\n]*localStorage/, /idbAdapterSet[^\n]*bal(Pot)?Open/, /sessionStorage[^\n]*bal(Pot)?Open/].forEach(function(re){ assert.doesNotMatch(A + read('index.html'), re); });
});
test('tabCollapseExpanded: «Аналітика» згортає обидві розгорнуті картки; інші вкладки нічого не чіпають; нічого не розгорнуто → 0 викликів', function(){
  const calls = [];
  const mk = function(o){ return buildSandbox(Object.assign({ toggleBalanceCard: function(){ calls.push('bal'); }, togglePotCard: function(){ calls.push('pot'); } }, o), ['tabCollapseExpanded']); };
  let c = mk({ balOpen: true, balPotOpen: true });
  assert.equal(c.tabCollapseExpanded('analytics'), 2); assert.deepEqual(calls.splice(0), ['bal', 'pot']);
  assert.equal(c.tabCollapseExpanded('accounting'), 0); assert.equal(c.tabCollapseExpanded('service'), 0); assert.deepEqual(calls, []);
  c = mk({ balOpen: false, balPotOpen: true });
  assert.equal(c.tabCollapseExpanded('analytics'), 1); assert.deepEqual(calls.splice(0), ['pot']);
  c = mk({ balOpen: false, balPotOpen: false });
  assert.equal(c.tabCollapseExpanded('analytics'), 0); assert.deepEqual(calls, []);
});
test('повторний тап по вкладці: tabRepeatTap = згортання + плавна прокрутка; обробник таббару викликає його лише для чистого тапу по активній вкладці', function(){
  const S = read('js/shell.js'), H = read('index.html');
  assert.match(S, /function tabRepeatTap\(tab\)\{\s*tabCollapseExpanded\(tab\);\s*smoothScrollToTop\(\);/);
  assert.match(H, /finalBtn\.dataset\.tab === lastActiveTab && wasTap\)\{[\s\S]{0,400}tabRepeatTap\(finalBtn\.dataset\.tab\)/);
  assert.match(S, /if\(motionReduced\(\)\)\{ mainColEl\.scrollTop = 0;/, '«зменшити рух»: миттєва прокрутка');
});
test('шторки: спостерігач за класом open скидає scrollTop при переході закрита → відкрита; клавіатурний модуль не чіпається', function(){
  const S = read('js/sheets.js');
  assert.match(S, /new MutationObserver/);
  assert.match(S, /attributeFilter: \['class'\]/);
  assert.match(S, /drawer\.scrollTop = 0/);
  assert.doesNotMatch(S.slice(S.indexOf('sheetScrollResetOnOpen')), /kb-|keyboard|focus\(/i, 'у новому коді немає клавіатурної логіки');
});
