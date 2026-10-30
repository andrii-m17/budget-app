// Rev 2.32.221 (MERGE-HIDDEN): домен «приховані» на спільному злитті.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildSandbox } = require('./extract');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const g = buildSandbox({}, ['hiddenDecisionParts', 'mdFieldEq', 'mdMerge']);

test('рішення «місяць + прапорець видалення»: рівність за місяцем і наявністю мітки, а не за самим часом', function(){
  assert.equal(g.mdFieldEq('decision', '2026-01|', '2026-01|'), true);
  assert.equal(g.mdFieldEq('decision', '2026-01|2026-02-01T00:00:00Z', '2026-01|2026-03-01T00:00:00Z'), true);
  assert.equal(g.mdFieldEq('decision', '2026-01|', '2026-01|2026-02-01T00:00:00Z'), false);
  assert.equal(g.mdFieldEq('decision', '2026-01|', '2026-02|'), false);
});
test('злиття: місяць і видалення — одне поле, окремих «змішаних» станів нема; обоє змінили — сервер', function(){
  const dom = { fields: ['decision'] };
  const m = g.mdMerge(dom, { decision: '2026-01|' }, { decision: '2026-03|' }, { decision: '2026-02|' });
  assert.deepEqual(JSON.parse(JSON.stringify(m.values)), { decision: '2026-02|' }); assert.equal(m.conflicts.length, 1);
  const only = g.mdMerge(dom, { decision: '2026-01|' }, { decision: '2026-03|' }, { decision: '2026-01|' });
  assert.deepEqual(JSON.parse(JSON.stringify(only.values)), { decision: '2026-03|' }); assert.deepEqual(JSON.parse(JSON.stringify(only.localOnly)), ['decision']);
});
test('джерело: домен hidden без картки (silent), ключ — складений, push зі зліпком через mdPushCas, без зліпка — upsert', function(){
  assert.match(SRC, /hidden: \{\n    key: 'hiddenEntities', table: 'hidden_entities', fields: \['decision'\], optional: \[\], silent: true/);
  assert.match(SRC, /where: function\(q, rec\)\{ const t = hiddenTargetOf\(rec\); return t \? q\.eq\('family_id', cloudFamilyId\)\.eq\('entity_type', t\.type\)\.eq\('entity_id', t\.id\) : null; \}/);
  assert.match(SRC, /entry\.serverBase && entry\.serverUpdatedAt\)\{[\s\S]*mdPushCas\(MERGE_DOMAINS\.hidden, entry, \{\}, \{ suppressPull: true \}\)/);
  assert.match(SRC, /mdPullDirty\(MERGE_DOMAINS\.hidden, local, row, \{ name: entity\.name \}, hadMarker\)/);
  assert.match(SRC, /if\(dom\.silent\)\{/);
  assert.match(SRC, /entry && !entry\.deletedAt && entry\.month === fromMonth/);
});
