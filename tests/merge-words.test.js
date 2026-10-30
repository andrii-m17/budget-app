// Rev 2.32.225 (MERGE-WORDS): домен «слова» на спільному злитті.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildSandbox } = require('./extract');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const g = buildSandbox({}, ['hiddenDecisionParts', 'mdFieldEq', 'mdMerge']);
const J = (x) => JSON.parse(JSON.stringify(x));

test('рішення deletion: рівність за наявністю мітки видалення, а не за часом', function(){
  assert.equal(g.mdFieldEq('deletion', '|', '|'), true);
  assert.equal(g.mdFieldEq('deletion', '2026-01-01T00:00:00Z|word', '2026-02-01T00:00:00Z|word'), true);
  assert.equal(g.mdFieldEq('deletion', '|', '2026-01-01T00:00:00Z|word'), false);
});
test('злиття двох рішень окремо: моє призначення + чуже видалення — обидва застосовуються; те саме призначення — сервер', function(){
  const dom = { fields: ['assignment', 'deletion'] };
  const base = { assignment: 'А|', deletion: '|' };
  const m = g.mdMerge(dom, base, { assignment: 'Б|', deletion: '|' }, { assignment: 'А|', deletion: 'T|word' });
  assert.deepEqual(J(m.values), { assignment: 'Б|', deletion: 'T|word' }); assert.deepEqual(J(m.localOnly), ['assignment']); assert.equal(m.conflicts.length, 0);
  const same = g.mdMerge(dom, base, { assignment: 'Б|', deletion: '|' }, { assignment: 'В|', deletion: '|' });
  assert.deepEqual(J(same.values), { assignment: 'В|', deletion: '|' }); assert.equal(same.conflicts.length, 1);
});
test('джерело: домен words без картки/сповіщень (quiet), ключ — cloudId, текст слова не зливається, 23505 усиновлює живе слово', function(){
  assert.match(SRC, /words: \{\n    key: 'words', table: 'dictionary', fields: \['assignment', 'deletion'\], optional: \[\], silent: true, quiet: true/);
  assert.match(SRC, /where: function\(q, rec\)\{ return rec\.cloudId \? q\.eq\('id', rec\.cloudId\) : null; \}/);
  assert.match(SRC, /entry\.serverKw === entry\.kw\)\{[\s\S]*mdPushCas\(MERGE_DOMAINS\.words/);
  assert.match(SRC, /cas\.code === '23505'\)\{ if\(await wordAdoptLive\(client, entry\)\)/);
  assert.match(SRC, /mdPullDirty\(MERGE_DOMAINS\.words, byCloudId, row/);
  assert.match(SRC, /if\(dom\.silent && dom\.quiet\)/);
});
