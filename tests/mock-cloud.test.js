// Rev 2.32.75 (K3) — мок Cloud (dev/mock-cloud.js): детермінованість наборів, семантика PostgREST, sync_heads, purged_at, «інший пристрій».
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../dev/mock-cloud.js');

const OPTS = { anchor: '2026-10-15', seed: 1 };
const BASE = 'https://x.supabase.co';
function mk(name){ const fx = M.generateFixture(name || 'typical', OPTS); return M.createState(fx); }
async function get(st, path){ const r = await M.handle(st, BASE + path, { method: 'GET' }); return { status: r.status, body: await r.json().catch(function(){ return null; }) }; }

test('K3 мок: 8 наборів, розміри, детермінованість за seed', function(){
  assert.deepEqual(M.FIXTURES, ['empty', 'one', 'typical', 'large', 'invalid', 'hostile', 'edge-dates', 'two-devices']);
  const n = function(f){ return M.generateFixture(f, OPTS).tables.expenses.length; };
  assert.equal(n('empty'), 0); assert.equal(n('one'), 1); assert.equal(n('typical'), 120); assert.equal(n('large'), 5000);
  assert.equal(JSON.stringify(M.generateFixture('typical', OPTS)), JSON.stringify(M.generateFixture('typical', OPTS)));
  assert.notEqual(JSON.stringify(M.generateFixture('typical', OPTS)), JSON.stringify(M.generateFixture('typical', { anchor: '2026-10-15', seed: 2 })));
});
test('K3 мок: наповнення синтетичне й узгоджене (FK, без реальних даних)', function(){
  M.FIXTURES.forEach(function(f){
    const fx = M.generateFixture(f, OPTS);
    const ids = new Set(); SYNC_ALL.forEach(function(t){ fx.tables[t].forEach(function(r){ if(r.id){ assert.ok(!ids.has(r.id), 'дубль id у ' + f); ids.add(r.id); } }); });
    const catIds = new Set(fx.tables.categories.map(function(c){ return c.id; }));
    fx.tables.subcategories.forEach(function(s){ assert.ok(catIds.has(s.category_id)); });
    fx.tables.debts.forEach(function(d){ assert.ok(d.bank_account_id ? fx.tables.bank_accounts.some(function(b){ return b.id === d.bank_account_id; }) : fx.tables.installment_accounts.some(function(b){ return b.id === d.installment_account_id; })); });
    assert.ok(!/@(?!example\.test)/.test(JSON.stringify(fx)), 'лише example.test');
  });
});
const SYNC_ALL = M.SYNC_TABLES;
test('K3 мок: GET — фільтри eq/gte/in/is/ilike, order, limit/offset, колонки, maybeSingle', async function(){
  const st = mk('typical');
  const fam = st.familyId;
  let r = await get(st, '/rest/v1/expenses?select=id,amount&family_id=eq.' + fam);
  assert.equal(r.body.length, 120); assert.deepEqual(Object.keys(r.body[0]), ['id', 'amount']);
  r = await get(st, '/rest/v1/expenses?select=id&order=id.asc&limit=10&offset=5');
  assert.equal(r.body.length, 10);
  const all = (await get(st, '/rest/v1/expenses?select=id&order=id.asc')).body.map(function(x){ return x.id; });
  assert.deepEqual(r.body.map(function(x){ return x.id; }), all.slice(5, 15));
  const some = st.tables.expenses[0].updated_at;
  r = await get(st, '/rest/v1/expenses?select=id&updated_at=gte.' + encodeURIComponent(some));
  assert.ok(r.body.length >= 1 && r.body.length <= 120);
  r = await get(st, '/rest/v1/expenses?select=id&deleted_at=is.null'); assert.equal(r.body.length, 120);
  r = await get(st, '/rest/v1/dictionary?select=id&keyword=ilike.' + encodeURIComponent('СЛОВО1')); assert.equal(r.body.length, 1);
  r = await get(st, '/rest/v1/expenses?select=id&id=in.(' + all[0] + ',' + all[1] + ')'); assert.equal(r.body.length, 2);
  const one = await M.handle(st, BASE + '/rest/v1/family_members?select=family_id&user_id=eq.' + st.users[0].id, { method: 'GET', headers: { Accept: 'application/vnd.pgrst.object+json' } });
  assert.equal((await one.json()).family_id, fam);
  const none = await M.handle(st, BASE + '/rest/v1/family_members?user_id=eq.nobody', { method: 'GET', headers: { Accept: 'application/vnd.pgrst.object+json' } });
  assert.equal(none.status, 406);
});
test('K3 мок: запис — insert, upsert за id, update, delete; гарні типи відповіді', async function(){
  const st = mk('empty');
  let r = await M.handle(st, BASE + '/rest/v1/expenses', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify([{ id: 'e1', family_id: st.familyId, amount: 10 }]) });
  assert.equal(r.status, 201);
  await M.handle(st, BASE + '/rest/v1/expenses?on_conflict=id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify([{ id: 'e1', amount: 20 }]) });
  assert.equal(st.tables.expenses.length, 1); assert.equal(st.tables.expenses[0].amount, 20);
  r = await M.handle(st, BASE + '/rest/v1/expenses?id=eq.e1', { method: 'PATCH', body: JSON.stringify({ amount: 30 }) });
  assert.equal(r.status, 204); assert.equal(st.tables.expenses[0].amount, 30);
  await M.handle(st, BASE + '/rest/v1/hidden_entities', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify([{ family_id: 'f', entity_type: 'bank', entity_id: 'b1', hidden_from_month: '2026-10-01' }, { family_id: 'f', entity_type: 'bank', entity_id: 'b1', hidden_from_month: '2026-11-01' }]) });
  assert.equal(st.tables.hidden_entities.length, 1);
  assert.equal(st.purgedAt, null);                                  // м'який запис маркера не чіпає
  r = await M.handle(st, BASE + '/rest/v1/expenses?id=eq.e1', { method: 'DELETE' });
  assert.equal(st.tables.expenses.length, 0);
  assert.ok(st.purgedAt);                                           // жорстке видалення = purged_at
});
test('K3 мок: sync_heads — форма як на сервері; зміна даних рухає голову; purged_at null → значення', async function(){
  const st = mk('typical');
  const h0 = (await (await M.handle(st, BASE + '/rest/v1/rpc/sync_heads', { method: 'POST' })).json());
  M.SYNC_TABLES.forEach(function(t){ assert.ok(Object.prototype.hasOwnProperty.call(h0.tables, t), t); });
  ['members_hash', 'family_hash', 'unread_notifications', 'mono_new', 'purged_at', 'server_time'].forEach(function(k){ assert.ok(Object.prototype.hasOwnProperty.call(h0, k), k); });
  assert.equal(h0.purged_at, null);
  const e = st.tables.expenses[0];
  M.simulateOtherDevice(st, { table: 'expenses', op: 'update', id: e.id, patch: { amount: 777 } });
  const h1 = headsOfJson(st);
  assert.notEqual(h1.tables.expenses, h0.tables.expenses); assert.equal(h1.tables.incomes, h0.tables.incomes);
  M.simulateOtherDevice(st, { table: 'expenses', op: 'harddelete', id: e.id });
  assert.ok(headsOfJson(st).purged_at);
  assert.equal(st.tables.expenses.length, 119);
});
function headsOfJson(st){ return JSON.parse(JSON.stringify(M.headsOf(st))); }
test('K3 мок: Realtime-заглушка — подія «з іншого пристрою» доходить до підписника; removeChannel відписує', function(){
  const st = mk('two-devices');
  const client = {}; M.attachRealtimeTo(st, client);
  const got = [];
  const ch = client.channel('x').on('postgres_changes', { event: '*', schema: 'public', table: 'expenses' }, function(p){ got.push(p.eventType); }).subscribe();
  M.simulateOtherDevice(st, { table: 'expenses', op: 'update', id: st.tables.expenses[0].id, patch: { note: 'z' } });
  M.simulateOtherDevice(st, { table: 'incomes', op: 'update', id: st.tables.incomes[0].id, patch: { note: 'z' } });
  assert.deepEqual(got, ['UPDATE']);
  client.removeChannel(ch);
  M.simulateOtherDevice(st, { table: 'expenses', op: 'softdelete', id: st.tables.expenses[1].id });
  assert.equal(got.length, 1);
});
test('K3 мок: auth — вхід/оновлення/користувач/вихід без мережі, JWT з далеким exp', async function(){
  const st = mk('one');
  const s = await (await M.handle(st, BASE + '/auth/v1/token?grant_type=password', { method: 'POST', body: '{}' })).json();
  const payload = JSON.parse(Buffer.from(s.access_token.split('.')[1], 'base64').toString());
  assert.ok(payload.exp * 1000 > Date.now() + 86400000);
  assert.equal(payload.sub, st.users[0].id);
  assert.equal((await M.handle(st, BASE + '/auth/v1/logout', { method: 'POST' })).status, 204);
  assert.equal((await M.handle(st, BASE + '/functions/v1/mono-connect', { method: 'POST' })).status, 200);
});
test('K3 мок: відповідь не більша за 1000 рядків (як max-rows PostgREST); 0 = без обмеження; range сторінкує', async function(){
  const st = mk('large');
  let r = await get(st, '/rest/v1/expenses?select=id');
  assert.equal(r.body.length, 1000);
  r = await get(st, '/rest/v1/expenses?select=id&order=id.asc&offset=4900&limit=100');
  assert.equal(r.body.length, 100);
  st.maxRows = 0;
  assert.equal((await get(st, '/rest/v1/expenses?select=id')).body.length, 5000);
});
