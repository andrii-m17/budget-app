// Rev 2.32.48 (S1) — «Структура»: оболонка й «Категорії» за макетом.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildSandbox } = require('./extract');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const j = function(v){ return JSON.parse(JSON.stringify(v)); };
const c = buildSandbox({}, ['splitLeadingEmoji', 'STRUCT_TYPE_GROUPS', 'groupCategoriesByType']);
test('splitLeadingEmoji: перший емодзі (у т.ч. складений) відокремлюється; без емодзі — порожньо', function(){
  assert.deepEqual(j(c.splitLeadingEmoji('🍔 Харчування')), { emoji: '🍔', text: 'Харчування' });
  assert.deepEqual(j(c.splitLeadingEmoji('🏥 Краса та Здоров’я')), { emoji: '🏥', text: 'Краса та Здоров’я' });
  assert.deepEqual(j(c.splitLeadingEmoji('👨‍👩‍👧 Родина')), { emoji: '👨‍👩‍👧', text: 'Родина' });
  assert.deepEqual(j(c.splitLeadingEmoji('Без емодзі')), { emoji: '', text: 'Без емодзі' });
  assert.deepEqual(j(c.splitLeadingEmoji(null)), { emoji: '', text: '' });
});
test('groupCategoriesByType: порядок типів, порожні типи не показуються, порядок усередині типу зберігається', function(){
  const cats = [{ name: 'a', type: 'Гнучка' }, { name: 'b', type: "Обов'язкова" }, { name: 'c', type: 'Гнучка' }, { name: 'd', type: "Обов'язкова" }];
  const g = j(c.groupCategoriesByType(cats));
  assert.deepEqual(g.map(function(x){ return x.label; }), ["Обов'язкові", 'Гнучкі']);
  assert.deepEqual(g[0].items.map(function(x){ return x.name; }), ['b', 'd']); assert.deepEqual(g[1].items.map(function(x){ return x.name; }), ['a', 'c']);
  assert.deepEqual(j(c.groupCategoriesByType([])), []);
});
test('охоронні: у рядках «Категорій» немає олівця й хрестика; інфо-плашки й заголовка картки немає; підзаголовок в один рядок', function(){
  const rows = SRC.slice(SRC.indexOf('function structRowHtml'), SRC.indexOf('function structAddGroupHtml'));
  assert.ok(!/bdr-icon-btn|bdr-actions|badge/.test(rows));
  const panel = SRC.slice(SRC.indexOf('id="struct-tab-panel-categories"'), SRC.indexOf('id="struct-tab-panel-subcategories"'));
  assert.ok(!/info-note|table-card-title|class="card"/.test(panel));
  assert.match(SRC, /subtitle: \(\) => 'Категорії, підкатегорії, автопідбір'/);
  assert.match(SRC, /\.page-header-text \.page-subtitle\{ margin-left:-60px; margin-right:-60px; white-space:nowrap; \}/);
});
test('охоронні: підпис під «Додати категорію» у кожному стані; порожній стан із кнопкою, підписом і рядком «Видалені дані»; видалення — усередині шторки', function(){
  assert.match(SRC, /const STRUCT_CAPTION_CAT = 'Торкніться рядка, щоб змінити або видалити\. Зміни не зачіпають вже додані витрати\.';/);
  assert.match(SRC, /parts\.push\(structAddGroupHtml\('Додати категорію', 'openAddCategoryModal\(\)', STRUCT_CAPTION_CAT\)\);/);
  assert.match(SRC, /structEmptyHtml\('Категорій ще немає', 'Категорії групують витрати\. Додайте першу або поверніть видалені\.', 'Додати категорію', 'openAddCategoryModal\(\)', STRUCT_CAPTION_CAT_EMPTY, trashRow\)/);
  assert.match(SRC, /Витрати можна вносити й без категорії\. Зміни не зачіпають вже додані витрати\./);
  assert.match(SRC, /deletedN \? '<div class="struct-section">/);
  assert.match(SRC, /label: 'Видалити категорію', note: 'Витрати цієї категорії не видаляються\. Видалена категорія потрапляє у «Видалені дані»\.', onDelete: function\(\)\{ deleteCategory\(i\); \}/);
  assert.match(SRC, /function presentAppModal\(\{[^}]*del = null \} = \{\}\)\{\n  setAppModalDelete\(del\);/);
});
test('охоронні: рядки екрановані; видалення останньої категорії не заборонено; нових полів вводу немає', function(){
  const fn = SRC.slice(SRC.indexOf('function structTileHtml'), SRC.indexOf('function structOpenTrash'));
  assert.match(fn, /escapeHtml\(sp\.text\)/); assert.match(fn, /escapeAttr\(label \+ ' ' \+ sp\.text\)/); assert.match(fn, /escapeHtml\(sp\.emoji\)/);
  const del = SRC.slice(SRC.indexOf('function deleteCategory'), SRC.indexOf('function openAddSubcategoryModal'));
  assert.ok(!/остання|last category|length\s*<=\s*1|length\s*===\s*1/.test(del));
  assert.ok(!/id="fldstr/.test(SRC.slice(SRC.indexOf('id="struct-tab-panel-categories"'), SRC.indexOf('id="struct-tab-panel-subcategories"'))));
});
