// Rev 2.32.80 (PAGING-1, Rev A) — сторінкування дельта-запитів: fetchDeltaRows на моку з обмеженням відповіді (як max-rows PostgREST).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildSandbox } = require('./extract');
const M = require('../dev/mock-cloud.js');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

// Мінімальний клієнт, що будує URL так само, як supabase-js (eq/gte/or/order/limit/select+count), і виконує його на моку.
function client(state, hooks){
  const log = [];
  return {
    log,
    from(table){
      const params = new URLSearchParams(); let headers = {};
      const api = {
        select(cols, opts){ params.set('select', cols); if(opts && opts.count) headers.Prefer = 'count=' + opts.count; return api; },
        eq(c, v){ params.append(c, 'eq.' + v); return api; }, gte(c, v){ params.append(c, 'gte.' + v); return api; },
        or(expr){ params.append('or', '(' + expr + ')'); return api; },
        order(c, o){ const prev = params.get('order'); params.set('order', (prev ? prev + ',' : '') + c + '.' + (o && o.ascending === false ? 'desc' : 'asc')); return api; },
        limit(n){ params.set('limit', String(n)); return api; },
        then(res, rej){
          return (async function(){
            const idx = log.length; log.push(params.toString());
            if(hooks && hooks.beforeRequest) hooks.beforeRequest(idx, state);
            if(hooks && hooks.failAt === idx) throw new Error('network');
            const r = await M.handle(state, 'https://x.supabase.co/rest/v1/' + table + '?' + params.toString(), { method: 'GET', headers });
            const body = await r.json();
            const cr = r.headers.get('content-range'); const count = cr && /\/(\d+)$/.test(cr) ? +cr.split('/')[1] : null;
            return r.status >= 400 ? { data: null, error: body, count: null } : { data: body, error: null, count };
          })().then(res, rej);
        },
      };
      return api;
    },
  };
}
function sandbox(marker, fam){
  return buildSandbox({ cloudFamilyId: fam || 'fam', syncFullMode: false, getSyncMarker: function(){ return marker || null; } }, ['PULL_PAGE_SIZE', 'PULL_MAX_PAGES', 'SYNC_DELTA_OVERLAP_MS', 'syncDeltaFrom', 'fetchDeltaRows']);
}
function serverWith(n, opts){
  const o = opts || {};
  const st = M.createState(M.generateFixture('empty', { anchor: '2026-10-15', seed: 1 }));
  st.familyId = 'fam'; st.maxRows = o.maxRows === undefined ? 1000 : o.maxRows;
  const base = Date.parse('2026-01-01T00:00:00Z');
  for(let i = 0; i < n; i++){
    st.tables.expenses.push({ id: 'e' + String(i).padStart(6, '0'), family_id: 'fam', amount: i, updated_at: new Date(base + (o.sameStamp ? 0 : i * 1000)).toISOString(), deleted_at: null });
  }
  return st;
}
const COLS = 'id,amount,updated_at,deleted_at';
async function load(st, hooks, marker){
  const c = sandbox(marker, st.familyId); const cl = client(st, hooks);
  const res = await c.fetchDeltaRows(cl, 'expenses', COLS, 'expenses');
  return { res, log: cl.log };
}

test('PAGING-1 №1/№6: 0, 1, 499, 500, 501, 999, 1000, 1001, 5000 рядків × ліміт сервера 100/500/1000/без — усі рядки, без дублів; мало рядків = 1 запит', async function(){
  for(const n of [0, 1, 499, 500, 501, 999, 1000, 1001, 5000]){
    for(const maxRows of [100, 500, 1000, 0]){
      const st = serverWith(n, { maxRows });
      const { res, log } = await load(st);
      assert.equal(res.error, null, n + '/' + maxRows);
      assert.equal(res.data.length, n, 'n=' + n + ' maxRows=' + maxRows);
      assert.equal(new Set(res.data.map(function(r){ return r.id; })).size, n, 'дублі n=' + n + ' maxRows=' + maxRows);
      if(n <= 499 && maxRows !== 100) assert.equal(log.length, 1, 'мало рядків → один запит n=' + n);
    }
  }
});
test('PAGING-1: сторінки впорядковані за (updated_at, id); перший запит із count, наступні за курсором or(...) без count; рівно N·500 рядків без зайвого запиту', async function(){
  const st = serverWith(1200);
  const { log } = await load(st);
  assert.equal(log.length, 3);
  assert.equal((await load(serverWith(1000))).log.length, 2);
  log.forEach(function(q){ assert.match(q, /order=updated_at\.asc%2Cid\.asc/); assert.match(q, /limit=500/); });
  assert.ok(!/or=/.test(log[0])); assert.match(log[1], /or=%28updated_at\.gt\.%22/); assert.match(log[1], /and%28updated_at\.eq\./);
});
test('PAGING-1: рядки з однаковим updated_at (тай-брейк за id) — жодних пропусків на межі сторінки', async function(){
  const st = serverWith(1700, { sameStamp: true });
  const { res } = await load(st);
  assert.equal(res.data.length, 1700); assert.equal(new Set(res.data.map(function(r){ return r.id; })).size, 1700);
});
test('PAGING-1 №2: помилка мережі посередині → { error }, даних немає (pull пропустить таблицю, мітка й «голова» не рухаються)', async function(){
  const st = serverWith(1200);
  await assert.rejects(function(){ return load(st, { failAt: 1 }); }, /network/); // кидок усередині try у pull*Core → { skipped: true }
  let calls = 0; // помилка PostgREST у відповіді (не виняток) на другій сторінці → { error }, без часткових даних
  const flaky = { from(){ const api = { select(){ return api; }, eq(){ return api; }, gte(){ return api; }, or(){ return api; }, order(){ return api; }, limit(){ return api; },
    then(res){ calls++; return Promise.resolve(calls === 1 ? { data: Array.from({ length: 500 }, function(_, i){ return { id: 'i' + i, updated_at: '2026-01-01T00:00:00.000Z' }; }), error: null, count: 900 } : { data: null, error: { message: 'x' } }).then(res); } }; return api; } };
  const r2 = await sandbox(null, 'fam').fetchDeltaRows(flaky, 'expenses', COLS, 'expenses');
  assert.ok(r2.error); assert.equal(r2.data, null);
});
test('PAGING-1 №3: рядки змінюються на сервері під час пулу — пропусків немає (змінений рядок з новим updated_at потрапляє наприкінці), дублі нешкідливі', async function(){
  const st = serverWith(1200);
  let moved = null;
  const { res } = await load(st, { beforeRequest: function(i, s){
    if(i === 1){ // між першою й другою сторінкою оновлюємо вже прочитаний і ще не прочитаний рядки
      moved = s.tables.expenses[10]; moved.amount = 999999; moved.updated_at = '2026-12-31T00:00:00.000Z';
      const late = s.tables.expenses[1100]; late.amount = 888888; late.updated_at = '2026-12-31T00:00:01.000Z';
    }
  } });
  const ids = res.data.map(function(r){ return r.id; });
  const uniq = new Set(ids);
  assert.equal(uniq.size, 1200, 'усі id присутні');
  const lastSeen = {}; res.data.forEach(function(r){ lastSeen[r.id] = r; });
  assert.equal(lastSeen[moved.id].amount, 999999, 'остання версія зміненого рядка отримана');
  assert.ok(ids.length >= 1200 && ids.length <= 1202, 'дублі лише для змінених рядків');
});
test('PAGING-1: дельта від маркера бере лише новіші (gte маркер − 2 с) і теж сторінкує', async function(){
  const st = serverWith(1500);
  const marker = st.tables.expenses[1000].updated_at;
  const { res, log } = await load(st, null, marker);
  assert.ok(/gte\.2026-/.test(decodeURIComponent(log[0])));
  assert.equal(res.data.length, 1500 - 1000 + 2, 'від маркера − 2 с: рядок маркера й попередні 2 с');
  assert.ok(res.data.every(function(r){ return r.updated_at >= '2026-01-01T00:16:38' ; }));
});
test('PAGING-1 №4: набір large (5000 витрат) з обмеженням 1000 завантажується повністю', async function(){
  const st = M.createState(M.generateFixture('large', { anchor: '2026-10-15', seed: 1 }));
  st.maxRows = 1000;
  const c = sandbox(null, st.familyId); const cl = client(st);
  const res = await c.fetchDeltaRows(cl, 'expenses', COLS.replace('amount', 'amount,expense_date'), 'expenses');
  assert.equal(res.data.length, 5000); assert.equal(cl.log.length, 10);
});
test('PAGING-1: усі 8 pull*Core читають через fetchDeltaRows (без прямих select без order); hidden_entities (мала таблиця) лишається повним читанням', function(){
  const names = ['Categories', 'Subcategories', 'Dictionary', 'Expenses', 'Incomes', 'Debts', 'BankAccounts', 'InstallmentAccounts'];
  names.forEach(function(n){
    const i = SRC.indexOf('async function pull' + n + 'Core'); assert.ok(i > 0, n);
    const body = SRC.slice(i, i + 6000);
    assert.match(body, /await fetchDeltaRows\(client, '/, n);
    assert.ok(!/applySyncMarker\(query/.test(body.slice(0, 3000)), n);
  });
  assert.equal((SRC.match(/await fetchDeltaRows\(/g) || []).length, 8);
});

test('PAGING-1: без count (сервер його не повернув) — закінчення за першою неповною сторінкою; з count — за count (в т.ч. серверний ліміт менший за сторінку)', async function(){
  const mk = function(n, withCount, cap){ let off = 0; return { from(){ const api = { select(){ return api; }, eq(){ return api; }, gte(){ return api; }, or(){ return api; }, order(){ return api; }, limit(){ return api; },
    then(res){ const take = Math.min(cap || 500, 500, n - off); const data = Array.from({ length: take }, function(_, i){ return { id: 'i' + String(off + i).padStart(5, '0'), updated_at: '2026-01-01T00:00:00.000Z' }; }); off += take; return Promise.resolve({ data, error: null, count: withCount ? n : null }).then(res); } }; return api; } }; };
  assert.equal((await sandbox(null, 'fam').fetchDeltaRows(mk(1200, false), 'expenses', COLS, 'expenses')).data.length, 1200); // сторінки по 500 без count
  assert.equal((await sandbox(null, 'fam').fetchDeltaRows(mk(1200, true, 100), 'expenses', COLS, 'expenses')).data.length, 1200); // ліміт сервера 100 < сторінки 500, count є
  assert.ok((await sandbox(null, 'fam').fetchDeltaRows(mk(1200, false, 100), 'expenses', COLS, 'expenses')).data.length < 1200, 'відомий ризик: ліміт < сторінки І немає count → зупиняємось на першій неповній сторінці');
});
