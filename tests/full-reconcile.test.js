// Rev 2.32.99 (PAGING-1 Rev B, F1): справжня повна звірка (легкий індекс id/updated_at/deleted_at).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildSandbox } = require('./extract');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const j = v => JSON.parse(JSON.stringify(v));

// Фейковий PostgREST: eq / gt / gte / in / or(не потрібен тут) / order / limit / count; maxRows — серверний ліміт.
function fakeClient(tables, o){
  const opts = o || {}; const calls = [];
  const client = { calls, from(table){
    return { select(cols, so){
      const filters = []; let order = []; let lim = Infinity;
      const q = {
        eq(c, v){ filters.push(r => r[c] === v); return q; }, gt(c, v){ filters.push(r => r[c] > v); return q; },
        gte(c, v){ filters.push(r => r[c] >= v); return q; }, in(c, l){ filters.push(r => l.indexOf(r[c]) !== -1); return q; },
        or(s){ const m = /updated_at\.gt\."([^"]+)".*id\.gt\."([^"]+)"/.exec(s); filters.push(r => r.updated_at > m[1] || (r.updated_at === m[1] && r.id > m[2])); return q; },
        order(c, oo){ order.push(c); return q; }, limit(n){ lim = n; return q; },
        then(res, rej){
          calls.push({ table, cols, count: !!(so && so.count), filters: filters.length });
          if(opts.failOnCall && calls.length === opts.failOnCall) return Promise.resolve({ data: null, error: { message: 'network' } }).then(res, rej);
          let rows = (tables[table] || []).filter(r => filters.every(f => f(r)));
          order.forEach(c => { rows = rows.slice().sort((a, b) => a[c] < b[c] ? -1 : a[c] > b[c] ? 1 : 0); });
          const total = rows.length;
          rows = rows.slice(0, Math.min(lim, opts.maxRows || Infinity));
          const out = { data: rows.map(r => Object.fromEntries(cols.split(',').map(c => [c.trim(), r[c.trim()]]))), error: null };
          if(so && so.count) out.count = total;
          return Promise.resolve(out).then(res, rej);
        },
      };
      return q;
    } };
  } };
  return client;
}
const U = n => new Date(Date.UTC(2026, 9, 1, 0, 0, n)).toISOString().replace('Z', '+00:00');
const ID = n => 'id-' + String(n).padStart(6, '0');
const srv = (n, extra) => Object.assign({ id: ID(n), family_id: 'fam', updated_at: U(n), deleted_at: null, amount: 1 }, extra || {});
const loc = (n, extra) => Object.assign({ id: ID(n), updatedAt: U(n), syncedUpdatedAt: U(n), amount: 1 }, extra || {});

function env(over){
  const g = Object.assign({
    cloudFamilyId: 'fam', syncFullMode: true, syncFullDirty: false, getSyncMarker: () => 'marker',
    expenses: [], incomes: [], debts: [], CATEGORIES: [], SUBCATEGORIES: [], DICTIONARY: [], bankAccounts: [], installmentAccounts: [],
    removed: [], saved: [], diag: [],
    trashStateNow: function(){ return { expenses: g.expenses, incomes: g.incomes, debts: g.debts, dictionary: g.DICTIONARY }; },
    isMonthRecordType: () => false,
    removeTrashLocally: async function(keys){ g.removed.push(...keys); },
    saveExpenses: async function(){ g.saved.push('expenses'); }, saveIncomes: async function(){ g.saved.push('incomes'); }, saveDebts: async function(){ g.saved.push('debts'); },
    reportSaveResult: function(){}, syncDiag: function(n, d){ g.diag.push([n, d]); },
  }, over || {});
  const c = buildSandbox(g, ['PULL_PAGE_SIZE', 'PULL_MAX_PAGES', 'SYNC_DELTA_OVERLAP_MS', 'syncDeltaFrom', 'sameInstantStr', 'diffServerIndex', 'fetchServerIndex', 'fetchRowsByIds', 'localSyncEntries',
    'FULL_RECON_TOMB_TYPES', 'trashTombstonesForReconcile', 'reconcilePlan', 'applyFullReconcileEffects', 'fetchFullReconcileRows', 'fetchDeltaRows']);
  return { c, g };
}

test('diffServerIndex: нові id, інший updated_at (момент часу, не рядок) → дозавантажити; локальні без рядка на сервері → missing', function(){
  const e = env();
  const d = e.c.diffServerIndex(
    [{ id: 'a', updated_at: '2026-10-01T00:00:00+00:00' }, { id: 'b', updated_at: '2026-10-02T00:00:00+00:00' }, { id: 'c', updated_at: '2026-10-03T00:00:00+00:00' }],
    [{ id: 'a', updatedAt: '2026-10-01T00:00:00.000Z' }, { id: 'b', updatedAt: '2026-10-01T00:00:00.000Z' }, { id: 'x', updatedAt: 'z' }]);
  assert.deepEqual(j(d.fetchIds), ['b', 'c']);
  assert.deepEqual(j(d.missing.map(m => m.id)), ['x']);
});
test('індекс сервера: усі рядки при n = 0…5000 і ліміті сервера 100/500/1000/без; запитів ⌈n/500⌉ (мало рядків = 1)', async function(){
  for(const n of [0, 1, 499, 500, 501, 1000, 1001, 5000]){
    for(const maxRows of [100, 500, 1000, 0]){
      const rows = []; for(let i = 0; i < n; i++) rows.push(srv(i));
      const cl = fakeClient({ expenses: rows }, { maxRows });
      const e = env();
      const r = await e.c.fetchServerIndex(cl, 'expenses');
      assert.ok(r.rows, 'n=' + n + ' max=' + maxRows);
      assert.equal(r.rows.length, n, 'n=' + n + ' max=' + maxRows);
      assert.equal(new Set(r.rows.map(x => x.id)).size, n);
      if(maxRows === 0 || maxRows >= 500) assert.equal(cl.calls.length, Math.max(1, Math.ceil(n / 500)), 'запити n=' + n + ' max=' + maxRows);
      assert.ok(cl.calls.every(c => c.cols === 'id,updated_at,deleted_at'), 'лише легкі колонки');
    }
  }
});
test('№8 рядок зі старим updated_at, якого немає локально: повна звірка його віддає (дельта від маркера не бачить)', async function(){
  const server = [srv(1), srv(2), srv(3, { updated_at: U(0) })]; // №3 «заднім числом»
  const e = env({ expenses: [loc(1), loc(2)] });
  const cl = fakeClient({ expenses: server });
  const r = await e.c.fetchDeltaRows(cl, 'expenses', 'id,updated_at,deleted_at,amount', 'expenses');
  assert.deepEqual(j(r.data.map(x => x.id)), [ID(3)]);
  // той самий сценарій у дельта-режимі: нічого (мітка пізніше за updated_at)
  const e2 = env({ expenses: [loc(1), loc(2)], syncFullMode: false, getSyncMarker: () => U(2) });
  const r2 = await e2.c.fetchDeltaRows(fakeClient({ expenses: server }), 'expenses', 'id,updated_at,deleted_at,amount', 'expenses');
  assert.ok(!r2.data.some(x => x.id === ID(3)), 'дельта не бачить рядок заднім числом');
});
test('№9 локальний синхронізований надгробок, жорстко видалений на сервері → прибирається; надгробок, що є на сервері, лишається', async function(){
  const e = env({ expenses: [loc(1, { deletedAt: U(9) }), loc(2, { deletedAt: U(9) }), loc(3)] });
  const cl = fakeClient({ expenses: [srv(2, { deleted_at: U(9) }), srv(3)] });
  await e.c.fetchFullReconcileRows(cl, 'expenses', 'id,updated_at,deleted_at,amount');
  assert.deepEqual(j(e.g.removed), ['expense:' + ID(1)]);
});
test('№10 локальний ЖИВИЙ синхронізований запис без рядка на сервері не видаляється, а знімається syncedUpdatedAt (повторний push); ще не синхронізований не чіпається', async function(){
  const live = loc(1), fresh = loc(5, { syncedUpdatedAt: undefined });
  const e = env({ expenses: [live, loc(2), fresh] });
  await e.c.fetchFullReconcileRows(fakeClient({ expenses: [srv(2)] }), 'expenses', 'id,updated_at,deleted_at,amount');
  assert.equal(e.g.expenses.length, 3, 'нічого не видалено');
  assert.equal(live.syncedUpdatedAt, undefined);
  assert.deepEqual(j(e.g.saved), ['expenses']);
  assert.equal(e.c.syncFullDirty, true);
  assert.equal(e.c.localSyncEntries('expenses').length, 3);
});
test('захист: порожній індекс сервера при непорожніх локальних записах = помилка (мертва сесія/RLS), нічого не змінюється', async function(){
  const e = env({ expenses: [loc(1, { deletedAt: U(9) }), loc(2)] });
  const r = await e.c.fetchFullReconcileRows(fakeClient({ expenses: [] }), 'expenses', 'id');
  assert.equal(r.data, null); assert.equal(r.error.message, 'empty-index');
  assert.deepEqual(j(e.g.removed), []); assert.deepEqual(j(e.g.saved), []);
  assert.ok(e.g.expenses[1].syncedUpdatedAt);
});
test('№2 помилка мережі на другій сторінці індексу: дані null, побічних ефектів немає', async function(){
  const rows = []; for(let i = 0; i < 700; i++) rows.push(srv(i));
  const e = env({ expenses: [loc(1, { deletedAt: U(9) })] });
  const r = await e.c.fetchFullReconcileRows(fakeClient({ expenses: rows }, { failOnCall: 2 }), 'expenses', 'id');
  assert.equal(r.data, null);
  assert.deepEqual(j(e.g.removed), []); assert.deepEqual(j(e.g.saved), []);
});
test('№6 мало рядків і нічого не змінилось: 1 запит (індекс), без дозавантаження; 929 витрат = 2 запити індексу', async function(){
  const rows = [srv(1), srv(2)];
  const e = env({ expenses: [loc(1), loc(2)] });
  const cl = fakeClient({ expenses: rows });
  const r = await e.c.fetchFullReconcileRows(cl, 'expenses', 'id,updated_at,deleted_at,amount');
  assert.equal(cl.calls.length, 1); assert.deepEqual(j(r.data), []);
  const big = []; for(let i = 0; i < 929; i++) big.push(srv(i));
  const e2 = env({ expenses: big.map(r => loc(Number(r.id.slice(3)))) });
  const cl2 = fakeClient({ expenses: big });
  await e2.c.fetchFullReconcileRows(cl2, 'expenses', 'id,updated_at,deleted_at,amount');
  assert.equal(cl2.calls.length, 2);
});
test('дозавантаження по 100 id в in(...): 250 відмінних рядків = 1 індекс (1 стор.) + 3 запити', async function(){
  const rows = []; for(let i = 0; i < 250; i++) rows.push(srv(i));
  const e = env({ expenses: [] });
  const cl = fakeClient({ expenses: rows });
  const r = await e.c.fetchFullReconcileRows(cl, 'expenses', 'id,updated_at,deleted_at,amount');
  assert.equal(r.data.length, 250); assert.equal(cl.calls.length, 1 + 3);
});
test('без маркера (перший pull) режим повної звірки не вмикається: звичайне сторінкове читання', async function(){
  const rows = []; for(let i = 0; i < 1200; i++) rows.push(srv(i));
  const e = env({ getSyncMarker: () => null });
  const cl = fakeClient({ expenses: rows });
  const r = await e.c.fetchDeltaRows(cl, 'expenses', 'id,updated_at,deleted_at,amount', 'expenses');
  assert.equal(r.error, null); assert.equal(r.data.length, 1200);
  assert.ok(cl.calls.every(c => c.cols !== 'id,updated_at,deleted_at'), 'повні колонки, не індекс');
});
test('запобіжники: курсор, що не просувається, і перевищення PULL_MAX_PAGES дають помилку, а не «успіх» з неповними даними', async function(){
  const e = env({ syncFullMode: false });
  const stuck = { from: () => ({ select: () => { const q = { eq: () => q, gt: () => q, gte: () => q, or: () => q, order: () => q, limit: () => q, then: (res) => Promise.resolve({ data: [{ id: 'z', updated_at: 'u' }], count: 99999, error: null }).then(res) }; return q; } }) };
  const r = await e.c.fetchDeltaRows(stuck, 'expenses', 'id', 'expenses');
  assert.equal(r.data, null); assert.equal(r.error.message, 'cursor-stuck');
  const idxStuck = await e.c.fetchServerIndex(stuck, 'expenses');
  assert.equal(idxStuck.rows, null); assert.equal(idxStuck.error.message, 'cursor-stuck');
  assert.match(SRC, /const PULL_MAX_PAGES = 2000;/);
});
test('охоронні: режим повної звірки вмикається лише за planSync.full і в «Синхронізувати все» і завжди скидається; відправка живих без рядка через autoSyncStale', function(){
  assert.match(SRC, /syncFullMode = !!plan\.full; syncFullDirty = false;[\s\S]{0,200}finally\{ syncFullMode = false; \}/);
  assert.match(SRC, /syncFullMode = true;[^\n]*\n  try\{\n  for\(let si = 0; si < steps\.length; si\+\+\)[\s\S]{0,700}\}finally\{ syncFullMode = false; \}/);
  assert.match(SRC, /if\(syncFullDirty\)\{ syncFullDirty = false; try\{ await autoSyncStale\('full-reconcile'\); \}catch\(e\)\{\} \}/);
  assert.match(SRC, /if\(syncFullMode && marker\) return fetchFullReconcileRows\(client, table, columns\);/);
});
