// Rev 2.32.50 (S3) — «Словник»: групи-акордеон, пошук, порожні стани, тест structure-accordion.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ex = require('./extract');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const j = function(v){ return JSON.parse(JSON.stringify(v)); };
const c = ex.buildSandbox({}, ['compareDictionaryForDisplay', 'groupWordsByCategory', 'dictionaryView', 'accordionAnchorDelta']);
const CATS = [{ name: 'A' }, { name: 'B' }, { name: 'C' }];
const W = [{ id: '1', kw: 'кава', cat: 'A', createdAt: '1' }, { id: '2', kw: 'каша', cat: 'B', createdAt: '2' }, { id: '3', kw: 'чай', cat: 'A', createdAt: '3' }, { id: '4', kw: 'сік', cat: 'Z', createdAt: '4' }];
test('groupWordsByCategory: порядок категорій, порожні групи не показуються, невідома категорія в кінці', function(){
  const g = j(c.groupWordsByCategory(W, CATS));
  assert.deepEqual(g.map(function(x){ return x.category; }), ['A', 'B', 'Z']);
  assert.deepEqual(g[0].items.map(function(x){ return x.kw; }), ['кава', 'чай']);
});
test('dictionaryView: без пошуку всі групи згорнуті, розкрита лише openId (група з одним словом теж розкривається)', function(){
  const v = j(c.dictionaryView(W, CATS, '', 'B'));
  assert.equal(v.searching, false);
  assert.deepEqual(v.groups.map(function(g){ return g.open; }), [false, true, false]);
  assert.equal(v.groups[1].count, 1);
  assert.deepEqual(j(c.dictionaryView(W, CATS, '', null)).groups.map(function(g){ return g.open; }), [false, false, false]);
});
test('dictionaryView: пошук вимикає акордеон, групи зі збігом розкриті, без збігів ховаються; нічого не знайдено', function(){
  const v = j(c.dictionaryView(W, CATS, ' КА ', 'C'));
  assert.equal(v.searching, true); assert.deepEqual(v.groups.map(function(g){ return g.category + ':' + g.count + ':' + g.open; }), ['A:1:true', 'B:1:true']);
  assert.equal(j(c.dictionaryView(W, CATS, 'яяя', null)).noResults, true);
});
test('accordionAnchorDelta: на скільки змістити прокрутку, щоб заголовок лишився на місці', function(){
  assert.equal(c.accordionAnchorDelta(300, 240), -60); assert.equal(c.accordionAnchorDelta(300, 300), 0); assert.equal(c.accordionAnchorDelta(100, 130), 30); assert.equal(c.accordionAnchorDelta(), 0);
});
test('охоронні: групи мають aria-expanded; акордеон і скидання; без «Розкрити всі»; тексти підписів; порожні стани; без анімації висоти в типовому b', function(){
  assert.match(SRC, /<button type="button" class="struct-dict-head" aria-expanded="/);
  assert.match(SRC, /structDict\.openId = \(forceOpen \|\| structDict\.openId !== cat\) \? cat : null;/);
  assert.match(SRC, /if\(structDict\.query\.trim\(\)\) return; \/\/ під час пошуку акордеон вимкнено/);
  assert.match(SRC, /if\(tab === 'dictionary'\)\{ structDictReset\(\);/);
  assert.ok(!/Розкрити всі/.test(SRC));
  assert.match(SRC, /const STRUCT_CAPTION_DICT = 'Слова допомагають автоматично визначати категорію під час додавання витрати\. Торкніться рядка, щоб змінити або видалити\.';/);
  assert.match(SRC, /structEmptyHtml\('Словник порожній', 'Додайте перше слово, наприклад «кава»: воно підставлятиме «Харчування · Кава»\.', 'Додати слово'/);
  assert.match(SRC, /'Додати слово «' \+ q \+ '»'/);
  assert.match(SRC, /parts\.push\(structAddGroupHtml\('Додати слово', 'openAddDictionaryModal\(\)', STRUCT_CAPTION_DICT\)\)/);
  const css = SRC.slice(SRC.indexOf('.struct-dict-collapse{ display:none'), SRC.indexOf('.struct-dict-collapse{ display:none') + 400);
  assert.match(css, /display:none/); // b: висота миттєво
  assert.ok(!/grid-template-rows[^;]*transition|transition:[^;}]*(height|grid-template-rows)/.test(SRC.slice(SRC.indexOf('.struct-dict-group{'), SRC.indexOf('#struct-dictionary[data-acc="c"] .struct-dict-collapse{'))));
  assert.match(SRC, /@media \(prefers-reduced-motion: reduce\)\{ \.struct-dict-chev\{ transition:none; \}/);
});
test('охоронні: поле пошуку — type=search, абстрактний id, автозаповнення вимкнено; значення екрановані; видалення слова — у шторці', function(){
  const inp = SRC.match(/<input type="search" id="fldstr2"[^>]*>/)[0];
  ['autocomplete="off"', 'aria-label="Пошук слова"', 'autocorrect="off"', 'spellcheck="false"'].forEach(function(x){ assert.ok(inp.indexOf(x) !== -1, x); });
  const fn = SRC.slice(SRC.indexOf('function structDictWordRow'), SRC.indexOf('function onStructDictSearch'));
  assert.match(fn, /escapeHtml\(w\.kw\)/); assert.match(fn, /escapeAttr\('Слово ' \+ w\.kw\)/); assert.match(fn, /safeId\(w\.id\)/); assert.match(fn, /escapeAttr\(g\.category\)/);
  assert.match(SRC, /label: 'Видалити слово', note: 'Слово більше не підставлятиме категорію\./);
  assert.match(SRC, /showAlertModal\('Спершу додайте категорію: слово словника веде до категорії\.'\)/);
});
test('реєстр: structure-accordion (b типовий, c) з повним записом', function(){
  const reg = JSON.parse(ex.evalInSandbox(ex.buildSandbox({}, ['TEST_VARIANTS']), 'JSON.stringify(TEST_VARIANTS)'));
  const t = reg.filter(function(x){ return x.id === 'structure-accordion'; })[0];
  assert.ok(t); assert.deepEqual(t.variants.map(function(v){ return v.key; }), ['b', 'c']); assert.equal(t.defaultVariant, 'b');
  ['title', 'what', 'addedIn', 'cleanupBy'].forEach(function(f){ assert.ok(t[f]); }); assert.ok(t.checkSteps.length >= 2);
});
