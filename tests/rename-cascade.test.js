// Rev 2.32.228 (B2): локальний каскад перейменування без штампу й push; сервер змінює витрати тригером.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildSandbox } = require('./extract');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const J = (x) => JSON.parse(JSON.stringify(x));
function ctx(){
  const state = { expenses: [], SUBCATEGORIES: [], DICTIONARY: [], SUBCATEGORY_PRIORITY: {} };
  const g = buildSandbox(state, ['cascadeTaxonomyRename']);
  return { g, state };
}
test('категорія: витрати (і з кошика), підкатегорії, слова й зліпки переписуються; updatedAt не міняється; чужі категорії не чіпаються', function(){
  const { g, state } = ctx();
  state.expenses.push({ id: 1, category: 'А', updatedAt: 't1', serverBase: { category: 'А' } }, { id: 2, category: 'А', deletedAt: 'x', updatedAt: 't2' }, { id: 3, category: 'Б', updatedAt: 't3', serverBase: { category: 'Б' } });
  state.SUBCATEGORIES.push({ name: 'п', category: 'А' }, { name: 'р', category: 'Б' });
  state.DICTIONARY.push({ kw: 'w', cat: 'А', sub: 'п', serverBase: { assignment: 'А|п' } }, { kw: 'v', cat: 'Б', sub: null, serverBase: { assignment: 'Б|' } });
  const info = g.cascadeTaxonomyRename('category', 'А', 'Нова');
  assert.deepEqual(J(info), { expenses: 2, subs: 1, words: 1, priority: false });
  assert.deepEqual(state.expenses.map(e => [e.category, e.updatedAt]), [['Нова', 't1'], ['Нова', 't2'], ['Б', 't3']]);
  assert.equal(state.expenses[0].serverBase.category, 'Нова');
  assert.deepEqual(state.SUBCATEGORIES.map(s => s.category), ['Нова', 'Б']);
  assert.deepEqual([state.DICTIONARY[0].cat, state.DICTIONARY[0].serverBase.assignment, state.DICTIONARY[1].serverBase.assignment], ['Нова', 'Нова|п', 'Б|']);
});
test('підкатегорія: витрати, слова, зліпок призначення, ключ пріоритету; та сама назва або порожня — нічого', function(){
  const { g, state } = ctx();
  state.expenses.push({ id: 1, subcategory: 'п', updatedAt: 't1', serverBase: { subcategory: 'п' } });
  state.DICTIONARY.push({ kw: 'w', cat: 'А', sub: 'п', serverBase: { assignment: 'А|п' } });
  state.SUBCATEGORY_PRIORITY.п = { label: 'Високий' };
  const info = g.cascadeTaxonomyRename('subcategory', 'п', 'н');
  assert.deepEqual(J(info), { expenses: 1, subs: 0, words: 1, priority: true });
  assert.equal(state.expenses[0].subcategory, 'н'); assert.equal(state.expenses[0].updatedAt, 't1');
  assert.equal(state.DICTIONARY[0].sub, 'н'); assert.equal(state.DICTIONARY[0].serverBase.assignment, 'А|н');
  assert.deepEqual(Object.keys(state.SUBCATEGORY_PRIORITY), ['н']);
  assert.deepEqual(J(g.cascadeTaxonomyRename('subcategory', 'н', 'н')), { expenses: 0, subs: 0, words: 0, priority: false });
  assert.deepEqual(J(g.cascadeTaxonomyRename('category', '', 'x')), { expenses: 0, subs: 0, words: 0, priority: false });
});
test('джерело: редактори не штампують витрати й не шлють залежні записи; pull і злиття каскадують', function(){
  const ec = SRC.match(/function editCategory\(i\)\{([\s\S]*?)\n\}/)[1], es = SRC.match(/function editSubcategory\(i\)\{([\s\S]*?)\n\}/)[1];
  [ec, es].forEach(m => { assert.ok(!/renameRecordsStamp\(/.test(m)); assert.ok(/reportSaveResult\(await saveTaxonomyCascade\(ci\)\)/.test(m)); assert.ok(!/await saveDictionary\(\)/.test(m)); });
  assert.match(SRC, /if\(oldNameC !== row\.name\) await saveTaxonomyCascade\(cascadeTaxonomyRename\('category'/);
  assert.match(SRC, /if\(oldNameS !== row\.name\) await saveTaxonomyCascade\(cascadeTaxonomyRename\('subcategory'/);
  assert.match(SRC, /beforeMerge: function\(rec\)\{ return rec\.name; \},\n    afterMerge: function\(rec, oldName\)\{ \/\/ Rev 2\.32\.228/);
});
