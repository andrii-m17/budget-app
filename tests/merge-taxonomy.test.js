// Rev 2.32.227 (MERGE-TAXONOMY): категорії й підкатегорії на спільному злитті.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildSandbox, evalInSandbox } = require('./extract');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const g = buildSandbox({}, ['mdFieldEq', 'mdMerge', 'taxCasEligible']);
const J = (x) => JSON.parse(JSON.stringify(x));

test('категорія: різні поля (тип мій, «активна» чужа) зливаються; те саме поле — сервер, у конфліктах', function(){
  const dom = { fields: ['type', 'active'] };
  const base = { type: 'Гнучка', active: true };
  const m = g.mdMerge(dom, base, { type: "Обов'язкова", active: true }, { type: 'Гнучка', active: false });
  assert.deepEqual(J(m.values), { type: "Обов'язкова", active: false }); assert.deepEqual(J(m.localOnly), ['type']); assert.equal(m.conflicts.length, 0);
  const same = g.mdMerge(dom, base, { type: "Обов'язкова", active: true }, { type: 'Скорочувана', active: true });
  assert.equal(same.values.type, 'Скорочувана'); assert.equal(same.conflicts.length, 1);
});
test('підкатегорія: «стан» (active + deactivated_via) — одне рішення; збіг за рядком, різна причина — конфлікт, сервер', function(){
  const dom = { fields: ['state'] };
  const m = g.mdMerge(dom, { state: '1|' }, { state: '0|' }, { state: '0|category' });
  assert.equal(m.values.state, '0|category'); assert.equal(m.conflicts.length, 1);
  const m2 = g.mdMerge(dom, { state: '1|' }, { state: '0|' }, { state: '1|' });
  assert.equal(m2.values.state, '0|'); assert.deepEqual(J(m2.localOnly), ['state']);
});
test('допуск до умовного update: зліпок, серверний час, назва не перейменована, батько підкатегорії збігається', function(){
  const ok = { cloudId: 'a', serverBase: {}, serverUpdatedAt: 't', name: 'К', serverName: 'К', syncedCategoryId: 'p' };
  assert.equal(g.taxCasEligible(ok), true);
  assert.equal(g.taxCasEligible(ok, 'p'), true);
  assert.equal(g.taxCasEligible(ok, 'q'), false, 'батька змінено — попередній шлях');
  assert.equal(g.taxCasEligible(Object.assign({}, ok, { name: 'Нова' })), false, 'перейменування — попередній шлях');
  assert.equal(g.taxCasEligible(Object.assign({}, ok, { serverBase: undefined })), false, 'без зліпка');
  assert.equal(g.taxCasEligible(Object.assign({}, ok, { cloudId: null })), false);
});
test('джерело: домени без карток (silent+quiet), ключі не в fields, payload без name і category_id, push/pull через mdPushCas/mdPullDirty, надгробок через gone', function(){
  assert.match(SRC, /categories: \{\n    key: 'categories', table: 'categories', fields: \['type', 'active'\], optional: \[\], silent: true, quiet: true/);
  assert.match(SRC, /subcategories: \{\n    key: 'subcategories', table: 'subcategories', fields: \['state'\], optional: \[\], silent: true, quiet: true/);
  assert.match(SRC, /payloadField: function\(rec, f\)\{ return f === 'type' \? \{ type: rec\.type \} : \{ active: rec\.active \}; \}/);
  assert.match(SRC, /payloadField: function\(rec\)\{ return \{ active: rec\.active, deactivated_via: rec\.deactivatedVia \|\| null \}; \}/);
  assert.match(SRC, /taxCasEligible\(cat\)\)\{[\s\S]*mdPushCas\(MERGE_DOMAINS\.categories/);
  assert.match(SRC, /taxCasEligible\(sub, parentCat\.cloudId\)\)\{[\s\S]*mdPushCas\(MERGE_DOMAINS\.subcategories/);
  assert.match(SRC, /mdPullDirty\(MERGE_DOMAINS\.categories, byCloudId, row/);
  assert.match(SRC, /mdPullDirty\(MERGE_DOMAINS\.subcategories, byCloudId, row/);
  assert.match(SRC, /if\(dom\.gone && row\.deleted_at\)/);
  assert.match(SRC, /name: sub\.name, category_id: parentCat\.cloudId, active: sub\.active/, 'попередній шлях (перейменування, зміна батька) лишився');
  assert.match(SRC, /syncedCategoryId === row\.category_id && byCloudId\.category === parentCat\.name\)\{/, 'pull підкатегорії: локальне перенесення (батько) не йде у злиття');
});
