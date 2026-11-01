// Rev 2.32.230 (SERVER-DEL): штамп видалення беремо з відповіді сервера (trg_deleted_at_server).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildSandbox } = require('./extract');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const g = buildSandbox({}, ['shadowAdoptDeleted', 'shadowServerDeleted']);
const J = (x) => JSON.parse(JSON.stringify(x));
const L = '2026-11-01T10:00:00.000Z', S = '2026-11-02T10:00:00.123+00:00';

test('штамп із відповіді сервера замінює локальний у записі й у зліпку (також у складених рядках «мітка|причина», «місяць|мітка»)', function(){
  const r = { deletedAt: L, serverBase: { amount: 5, deletedAt: L, deletion: L + '|category', decision: '2026-10|' + L, note: 'x' } };
  assert.equal(g.shadowAdoptDeleted(r, S), true);
  assert.deepEqual(J(r), { deletedAt: S, serverBase: { amount: 5, deletedAt: S, deletion: S + '|category', decision: '2026-10|' + S, note: 'x' } });
});
test('нічого не змінює: не видалений запис, порожня відповідь, той самий штамп', function(){
  const a = { deletedAt: undefined, serverBase: { deletedAt: '' } }; assert.equal(g.shadowAdoptDeleted(a, S), false); assert.equal(a.deletedAt, undefined);
  const b = { deletedAt: L }; assert.equal(g.shadowAdoptDeleted(b, null), false); assert.equal(g.shadowAdoptDeleted(b, ''), false); assert.equal(b.deletedAt, L);
  const c = { deletedAt: L }; assert.equal(g.shadowAdoptDeleted(c, L), false);
  assert.equal(g.shadowAdoptDeleted(null, S), false);
});
test('штамп рядка з відповіді пакета береться за id', function(){
  assert.equal(g.shadowServerDeleted([{ id: 'a', deleted_at: S }, { id: 'b', deleted_at: null }], 'a'), S);
  assert.equal(g.shadowServerDeleted([{ id: 'a', deleted_at: S }], 'z'), null);
  assert.equal(g.shadowServerDeleted(null, 'a'), null);
});
test('усі push-місця п\'яти доменів (витрати, доходи, борги, слова, приховані + спільний умовний update) беруть штамп із відповіді', function(){
  assert.ok((SRC.match(/shadowAdoptDeleted\(/g) || []).length >= 11, 'визначення + 10 місць');
  assert.match(SRC, /\.select\(\(dom\.retCols \|\| 'id,updated_at'\) \+ ',deleted_at'\)/);
  assert.match(SRC, /function shadowRet\(q\)\{ return \(q && typeof q\.select === 'function'\) \? q\.select\('id,updated_at,deleted_at'\)/);
});
