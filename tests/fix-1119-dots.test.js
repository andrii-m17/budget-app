// Rev 2.32.411 (FIX-1119 п.5): крапка неповних даних у шторках «Борги по картках»/«ОЧ» відкриває пояснення й «Заповнити»; попап плиток не виходить за екран.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildSandbox, readAppCss } = require('./extract');
const SRC = require('./extract').readIndexWithCss();
const CSS = readAppCss();
const cardA = { name: 'Картка А' }, cardB = { name: 'Картка Б' }, inst = { name: 'ОЧ 1' };
const c = buildSandbox({ bankAccounts: [cardA, cardB], installmentAccounts: [inst] }, ['balDotHtml']);
test('крапка картки/ОЧ: role=button, дотик → showIncompleteInfo(вид, індекс у списку рахунків), клавіатура Enter/Space', function(){
  const h = c.balDotHtml('card', cardB);
  assert.match(h, /role="button"/); assert.match(h, /tabindex="0"/);
  assert.match(h, /onclick="event\.stopPropagation\(\); showIncompleteInfo\('card', 1\)"/);
  assert.match(h, /event\.key === 'Enter'/);
  assert.match(c.balDotHtml('installment', inst), /showIncompleteInfo\('installment', 0\)/);
});
test('рахунок поза списком (немає індексу): безпечна німа крапка без обробника', function(){
  const h = c.balDotHtml('card', { name: 'X' });
  assert.ok(!/onclick/.test(h)); assert.match(h, /role="img"/);
  assert.ok(!/onclick/.test(c.balDotHtml()));
});
test('шторки передають рахунок у крапку; «Заповнити» спершу закриває шторку «Аналітики»', function(){
  assert.match(SRC, /\(incomplete \? balDotHtml\('card', acc\) : ''\)/);
  assert.match(SRC, /\(incomplete \? balDotHtml\('installment', acc\) : ''\)/);
  const fn = SRC.slice(SRC.indexOf('function fillIncomplete'), SRC.indexOf('function recordIncompleteDots'));
  assert.match(fn, /balSheetClose\(id\)/);
  assert.ok(fn.indexOf('balSheetClose') < fn.indexOf("openCardDebtEditor(i)"), 'закриття раніше за відкриття форми');
});
test('CSS: попап крапки на плитці прив\'язаний до плитки й займає ширину пари (не виходить за лівий край)', function(){
  assert.match(CSS, /\.bal-tile \.data-status\{ position:static; \}/);
  assert.match(CSS, /\.bal-tile \.data-status-popover\{[^}]*width:calc\(200% \+ var\(--sp-3\)\)/);
  assert.match(CSS, /#bal-debt-tile \.data-status-popover\{ left:0; right:auto; \}/);
  assert.match(CSS, /#bal-inst-tile \.data-status-popover\{ right:0; left:auto; \}/);
});
