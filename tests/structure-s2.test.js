// Rev 2.32.49 (S2) — «Підкатегорії» за макетом.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildSandbox } = require('./extract');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const j = function(v){ return JSON.parse(JSON.stringify(v)); };
const c = buildSandbox({}, ['groupSubcategoriesByParent']);
test('groupSubcategoriesByParent: порядок категорій як у списку, категорії без підкатегорій не показуються, невідома батьківська — в кінці', function(){
  const cats = [{ name: 'A' }, { name: 'B' }, { name: 'C' }];
  const subs = [{ name: 's1', category: 'C' }, { name: 's2', category: 'A' }, { name: 's3', category: 'C' }, { name: 's4', category: 'Z' }];
  const g = j(c.groupSubcategoriesByParent(subs, cats));
  assert.deepEqual(g.map(function(x){ return x.category; }), ['A', 'C', 'Z']);
  assert.deepEqual(g[1].items.map(function(x){ return x.name; }), ['s1', 's3']);
  assert.deepEqual(j(c.groupSubcategoriesByParent([], cats)), []);
});
test('охоронні: рядки без олівця/хрестика, панель без інфо-плашки й картки; підпис у кожному стані; порожній стан', function(){
  const panel = SRC.slice(SRC.indexOf('id="struct-tab-panel-subcategories"'), SRC.indexOf('id="struct-tab-panel-dictionary"'));
  assert.ok(!/info-note|table-card-title|class="card"|bdr-icon-btn/.test(panel));
  const fn = SRC.slice(SRC.indexOf('function renderStructureSubcategories'), SRC.indexOf('function structOpenTrash'));
  assert.ok(!/bdr-icon-btn|bdr-actions/.test(fn));
  assert.match(fn, /parts\.push\(structAddGroupHtml\('Додати підкатегорію', 'openAddSubcategoryModal\(\)', STRUCT_CAPTION_CAT\)\)/);
  assert.match(fn, /structEmptyHtml\('Підкатегорій немає', 'Підкатегорії уточнюють категорію, наприклад «Кава» у «Харчуванні»\. Це необов\\'язково\.', 'Додати підкатегорію', 'openAddSubcategoryModal\(\)', STRUCT_CAPTION_SUB_EMPTY\)/);
  assert.match(SRC, /const STRUCT_CAPTION_SUB_EMPTY = 'Підкатегорії необов\\'язкові\. Зміни не зачіпають вже додані витрати\.';/);
  assert.match(fn, /escapeHtml\(splitLeadingEmoji\(g\.category\)\.text\)/);
});
test('охоронні: без категорій «Додати підкатегорію» показує пояснення; видалення — усередині шторки; пріоритет збережено; значення екрановані', function(){
  assert.match(SRC, /showAlertModal\('Спершу додайте категорію: підкатегорія завжди належить категорії\.'\)/);
  assert.match(SRC, /label: 'Видалити підкатегорію', note: 'Витрати з цією підкатегорією не видаляються\. Видалена підкатегорія потрапляє у «Видалені дані»\.', onDelete: function\(\)\{ deleteSubcategory\(i\); \}/);
  assert.match(SRC, /'Потенціал економії'/); assert.match(SRC, /sheetId: 'sheet-subcategory', del: del/);
  assert.ok(!/id="fldstr/.test(SRC.slice(SRC.indexOf('id="struct-tab-panel-subcategories"'), SRC.indexOf('id="struct-tab-panel-dictionary"'))));
});
