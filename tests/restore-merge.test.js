// Rev 2.32.232 (RESTORE-MERGE): відновлення з копії = звичайні правки; видалене на сервері лишається видаленим.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildSandbox } = require('./extract');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const J = (x) => JSON.parse(JSON.stringify(x));

test('поля з копії стають локальною правкою: updatedAt = зараз, localRev росте, зліпок лишається; назви й видалення не переносяться', function(){
  const g = buildSandbox({}, []);
  const base = { amount: 5, date: '2026-09-01', name: 'Кава', category: '', subcategory: '' };
  const local = { id: 'e1', amount: 5, date: '2026-09-01', name: 'Кава', category: '', subcategory: '', updatedAt: '2026-09-02T00:00:00.000Z', syncedUpdatedAt: '2026-09-02T00:00:00.000Z', serverUpdatedAt: 'S', serverBase: base, localRev: 1, syncedRev: 1, revAt: '2026-09-02T00:00:00.000Z' };
  const n = g.restoreApplyAsEdit('expenses', local, { id: 'e1', amount: 65, date: '2026-08-01', name: 'Кава', category: '', subcategory: '', updatedAt: '2000-01-01T00:00:00.000Z', deletedAt: '2000-01-02T00:00:00.000Z' });
  assert.equal(n, 2, 'змінилися сума й дата');
  assert.equal(local.amount, 65); assert.equal(local.date, '2026-08-01');
  assert.equal(local.deletedAt, undefined, 'видалення з копії не переноситься');
  assert.ok(Date.parse(local.updatedAt) > Date.parse('2026-09-02T00:00:00.000Z'), 'не час копії, а «зараз»');
  assert.ok(local.localRev > local.syncedRev, 'запис «брудний»');
  assert.deepEqual(J(local.serverBase), J(base), 'зліпок не чіпаємо');
  assert.equal(g.restoreApplyAsEdit('expenses', local, { id: 'e1', amount: 65, date: '2026-08-01', name: 'Кава', category: '', subcategory: '' }), 0, 'однакове — нічого не міняємо');
});
test('поле, якого немає в записі копії (старий формат), локальне не затирає; чужий домен/порожній запис — 0', function(){
  const g = buildSandbox({}, []);
  const local = { id: 'i1', amount: 100, source: 'Зарплата', date: '2026-09-01', updatedAt: 'x' };
  assert.equal(g.restoreApplyAsEdit('incomes', local, { id: 'i1', amount: 100 }), 0);
  assert.equal(local.source, 'Зарплата');
  assert.equal(g.restoreApplyAsEdit('нема', local, { amount: 1 }), 0);
  assert.equal(g.restoreApplyAsEdit('incomes', null, {}), 0);
});
test('рішення про приховування: видалена частина (з будь-якого боку) не переноситься; місяць — переноситься', function(){
  const g = buildSandbox({}, []);
  const a = { month: '2026-09' }; assert.equal(g.restoreApplyAsEdit('hidden', a, { month: '2026-07', deletedAt: '2026-05-01T00:00:00.000Z' }), 0); assert.equal(a.month, '2026-09');
  const b = { month: '2026-09', deletedAt: '2026-05-01T00:00:00.000Z' }; assert.equal(g.restoreApplyAsEdit('hidden', b, { month: '2026-07' }), 0);
  const c = { month: '2026-09' }; assert.equal(g.restoreApplyAsEdit('hidden', c, { month: '2026-07' }), 1); assert.equal(c.month, '2026-07');
});
test('записи копії, яких немає локально: видалені на сервері лишаються видаленими, наявні на сервері не відтворюються, відсутні повертаються; офлайн і помилка — як було', async function(){
  const U = (n) => '0000000' + n + '-0000-4000-8000-000000000000';
  const rows = [{ id: U(1), deleted_at: '2026-10-01T00:00:00Z' }, { id: U(2), deleted_at: null }];
  const calls = [];
  const client = { from(t){ return { select(){ return { in(c, ids){ calls.push([t, c, ids.length]); return Promise.resolve({ data: rows.filter(r => ids.includes(r.id)), error: null }); } }; } }; } };
  const mk = (over) => buildSandbox(Object.assign({ isCloudSessionReady: () => true, getSupabaseClient: () => client, navigator: { onLine: true } }, over || {}), []);
  const g = mk();
  const recs = [{ id: U(1) }, { id: U(2) }, { id: U(3) }, { id: 'legacy-id' }], list = recs.slice(), push = recs.slice();
  const r = await g.restoreDropServerKnown('expenses', list, recs, push);
  assert.deepEqual(J(r), { gone: 1, there: 1 });
  assert.deepEqual(list.map(x => x.id), [U(3), 'legacy-id']); assert.deepEqual(push.map(x => x.id), [U(3), 'legacy-id']);
  assert.deepEqual(J(calls), [['expenses', 'id', 3]], 'один запит, лише UUID');
  const off = mk({ navigator: { onLine: false } }); const l2 = recs.slice();
  assert.deepEqual(J(await off.restoreDropServerKnown('expenses', l2, recs, l2.slice())), { gone: 0, there: 0 }); assert.equal(l2.length, 4);
  const bad = mk({ getSupabaseClient: () => ({ from(){ return { select(){ return { in(){ return Promise.resolve({ data: null, error: { message: 'x' } }); } }; } }; } }) });
  const l3 = recs.slice(); assert.deepEqual(J(await bad.restoreDropServerKnown('expenses', l3, recs, l3.slice())), { gone: 0, there: 0 }); assert.equal(l3.length, 4);
});
test('підсумок: слово «запис» за числом; у відновленні не лишилось порівняння часу копії', function(){
  const g = buildSandbox({}, []);
  assert.deepEqual([1, 2, 5, 11, 12, 21, 104].map(g.restoreCountWord), ['запис', 'записи', 'записів', 'записів', 'записів', 'запис', 'записи']);
  assert.ok(!/backupTime/.test(SRC), 'порівняння backupTime прибрано зі всіх відновлень');
  assert.match(SRC, /restoreMerge = \{ active: true, recs: \{\} \}/);
  assert.match(SRC, /finally\{ restoreMerge\.active = false; \}/);
});
