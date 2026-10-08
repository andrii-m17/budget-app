// Rev 2.32.3 (E2) — підказки назви в редагуванні запису: спільна чиста функція й охоронні тести підключення.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ex = require('./extract');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const ctx = ex.buildSandbox({}, ['NAME_SUGGEST_MIN', 'NAME_SUGGEST_MAX', 'nameSuggestionsFor']);
const S = (map, text) => JSON.parse(ex.evalInSandbox(ctx, `JSON.stringify(nameSuggestionsFor(${JSON.stringify(map)},${JSON.stringify(text)}))`));
const H = (count, lastDate) => ({ count, lastDate, lastCategory: '', lastSubcategory: '' });

test('nameSuggestionsFor: поріг 2 символи, підрядок без регістру, точний збіг виключено, ранжування за кількістю, тай-брейк за датою, ліміт 6', () => {
  const map = { 'Продукти': H(5, '2026-10-01'), 'Продукти Сільпо': H(9, '2026-09-01'), 'продукти АТБ': H(9, '2026-10-05'), 'Таксі': H(1, '2026-10-02') };
  assert.deepEqual(S(map, 'п'), []);
  assert.deepEqual(S(map, ' '), []);
  assert.deepEqual(S(map, 'ПРОД'), ['продукти АТБ', 'Продукти Сільпо', 'Продукти']);
  assert.deepEqual(S(map, 'продукти'), ['продукти АТБ', 'Продукти Сільпо']);
  assert.deepEqual(S(map, 'ак'), ['Таксі']);
  assert.deepEqual(S(map, 'zzz'), []);
  assert.deepEqual(S(null, 'ab'), []);
  const many = {}; for(let i = 0; i < 10; i++) many['Кава ' + i] = H(10 - i, '2026-10-0' + (i % 9 + 1));
  assert.equal(S(many, 'кава').length, 6);
});
test('форма «Нова витрата» користується тією самою функцією (без копії правил)', () => {
  const i = SRC.indexOf('function updateNameSuggestions'), code = SRC.slice(i, SRC.indexOf('function highlightNameSuggestion', i));
  assert.match(code, /nameSuggestionsFor\(nameHistoryMap, text\)/);
  assert.ok(!/\.sort\(/.test(code), 'сортування лише в спільній функції');
  assert.match(SRC, /function updateEditNameSuggestions[\s\S]*?nameSuggestionsFor\(nameHistoryMap, input\.value\)/);
});
test('підказки в редагуванні: список під полем (на введенні, не на фокусі), абстрактні id, власний max-height', () => {
  assert.match(SRC, /id="edtlista1-\$\{e\.id\}"/);
  assert.match(SRC, /\.name-suggest-list\.edit-suggest-list\{ max-height:150px;/);
  assert.match(SRC, /updateEditNameSuggestions\(id\); \/\/ Rev 2\.32\.3 \(E2\)/);
  const edt = SRC.slice(SRC.indexOf('id="edtfielda1-${e.id}"'), SRC.indexOf('id="edtfielda1-${e.id}"') + 400);
  assert.ok(!/onfocus=/.test(edt), 'на фокусі список не відкривається');
  ['edtlista1', 'edtfielda1'].forEach(id => assert.ok(!/name|phone|tel|mail|addr|user|login|first|last|fio|contact/i.test(id), id));
});
test('вибір не забирає фокус: mousedown.preventDefault + pointerdown.preventDefault; focus лише preventScroll; на «Суму» фокус не переходить', () => {
  const i = SRC.indexOf('function pickEditNameSuggestion'), pick = SRC.slice(i, SRC.indexOf('// «Змінити» під підказкою', i));
  assert.match(SRC, /onmousedown="event\.preventDefault\(\)" onpointerdown="onEditSuggestPointerDown/);
  assert.match(SRC, /function onEditSuggestPointerDown\(e, i, id\)\{\s*e\.preventDefault\(\);/);
  assert.match(pick, /focus\(\{ preventScroll: true \}\)/);
  assert.ok(!/edit-amount/.test(pick));
  assert.ok(!/blur\(\)/.test(pick));
});
test('вибір підставляє назву, потім словник (2.31.2) і історію за правилами shouldAutoFillOnEdit; ручний вибір категорії не перезаписується', () => {
  const i = SRC.indexOf('function applyHistoryCategoryOnEdit'), code = SRC.slice(i, SRC.indexOf('function pickEditNameSuggestion', i));
  assert.match(code, /shouldAutoFillOnEdit\(\{ matched: \{ cat: h\.lastCategory/);
  assert.match(code, /touchedByUser: recordEditSession\.touched/);
  assert.match(code, /catSel\.options/);
  const pick = SRC.slice(SRC.indexOf('function pickEditNameSuggestion'), SRC.indexOf('// «Змінити» під підказкою'));
  assert.ok(pick.indexOf('onRecordNameInput(id)') < pick.indexOf('applyHistoryCategoryOnEdit(id, name)'));
  assert.ok(!/markRecordEditTouched/.test(pick), 'програмна підстановка не вважається ручним вибором');
});
test('рекордер: suggest-edit (event shown/picked, count), без значень назв', () => {
  const i = SRC.indexOf('function editSuggestEvent'), code = SRC.slice(i, SRC.indexOf('function updateEditNameSuggestions', i));
  assert.match(code, /type: 'suggest-edit', event: event, count: count/);
  assert.ok(!/\.value|name/.test(code.replace(/type: 'suggest-edit'/, '')));
  assert.match(SRC, /editSuggestEvent\('shown'/);
  assert.match(SRC, /editSuggestEvent\('picked'/);
});
