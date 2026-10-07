// Rev 2.23.25 (6D.194, Ревізія F) — слова без дублів: серіалізація push, усиновлення
// живого рядка при 23505, tombstone-рядки не усиновлюються.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildSandbox } = require('./extract');

// Мок Supabase-клієнта з таблицею dictionary і частково-унікальним індексом
// (family_id, lower(keyword)) де deleted_at is null → 23505 при дубльованій живій вставці.
function makeCloud(initialRows, opts){
  const rows = initialRows.slice();
  let seq = 0;
  const o = opts || {};
  function builder(){
    const st = { op: 'select', filters: [], payload: null };
    const api = {
      select(){ if(st.op === 'select' || st.op === 'insert') st.wantRows = true; return api; },
      insert(p){ st.op = 'insert'; st.payload = p; return api; },
      update(p){ st.op = 'update'; st.payload = p; return api; },
      eq(c, v){ st.filters.push(function(r){ return r[c] === v; }); return api; },
      ilike(c, pat){
        const raw = pat.replace(/\\([\\%_])/g, '$1');
        st.filters.push(function(r){ return String(r[c]).toLowerCase() === raw.toLowerCase(); });
        return api;
      },
      is(c, v){ st.filters.push(function(r){ return (r[c] === undefined ? null : r[c]) === v; }); return api; },
      order(){ return api; },
      limit(){ return api; },
      single(){ st.single = true; return api; },
      then(res, rej){ return run().then(res, rej); },
    };
    async function run(){
      await Promise.resolve();
      if(o.latency) await new Promise(function(r){ setTimeout(r, o.latency); });
      if(st.op === 'select' && o.racerAfterFirstSelect && !o.racerDone){ o.racerDone = true; rows.push(o.racerAfterFirstSelect); return { data: [], error: null }; }
      if(st.op === 'select') return { data: rows.filter(function(r){ return st.filters.every(function(f){ return f(r); }); }), error: null };
      if(st.op === 'update'){ rows.filter(function(r){ return st.filters.every(function(f){ return f(r); }); }).forEach(function(r){ Object.assign(r, st.payload); }); return { data: null, error: null }; }
      const p = st.payload;
      const live = !p.deleted_at;
      if(live && rows.some(function(r){ return !r.deleted_at && r.family_id === p.family_id && String(r.keyword).toLowerCase() === String(p.keyword).toLowerCase(); })){
        return { data: null, error: { code: '23505', message: 'duplicate key value' } };
      }
      const row = Object.assign({ id: 'row-' + (++seq) }, p);
      rows.push(row);
      return { data: { id: row.id }, error: null };
    }
    return api;
  }
  return { rows: rows, from(){ return builder(); } };
}

function sandboxFor(events){
  return buildSandbox({ cloudFamilyId: 'fam', captureDebugGeometry: function(t){ events.push(t); } },
    ['escapeLikeExact', 'findLiveDictionaryRow', 'reconcileDictionaryCloudId']);
}
const entry = function(kw){ return { kw: kw, createdAt: 't', updatedAt: 't' }; };

test('escapeLikeExact екранує \\, % і _', () => {
  const ctx = sandboxFor([]);
  assert.equal(ctx.escapeLikeExact('a%b_c\\d'), 'a\\%b\\_c\\\\d');
});

test('23505 при вставці: усиновлює наявний живий рядок (без урахування регістру), подія dict-dup-adopt', async () => {
  const events = [];
  const ctx = sandboxFor(events);
  // Рядок з'являється між першим SELECT (порожньо) і INSERT — інший пристрій/запуск устиг першим.
  const cloud = makeCloud([], { racerAfterFirstSelect: { id: 'other', family_id: 'fam', keyword: 'Кава', deleted_at: null } });
  const e = entry('кава');
  await ctx.reconcileDictionaryCloudId(cloud, 'u1', e, 'cat1', null);
  assert.equal(e.cloudId, 'other');
  assert.deepEqual(events, ['dict-dup-adopt']);
  assert.equal(cloud.rows.length, 1);
});

test('дві послідовні вставки одного слова дають один Cloud-рядок (друга усиновлює першу)', async () => {
  const events = [];
  const ctx = sandboxFor(events);
  const cloud = makeCloud([]);
  const a = entry('кава'), b = entry('Кава');
  await ctx.reconcileDictionaryCloudId(cloud, 'u1', a, 'c', null);
  await ctx.reconcileDictionaryCloudId(cloud, 'u1', b, 'c', null);
  assert.equal(cloud.rows.length, 1);
  assert.equal(a.cloudId, b.cloudId);
  assert.deepEqual(events, []); // звичайне усиновлення через SELECT — не 23505
});

test('tombstone-рядок з тим самим словом НЕ усиновлюється: вставляється новий живий', async () => {
  const events = [];
  const ctx = sandboxFor(events);
  const cloud = makeCloud([{ id: 'dead', family_id: 'fam', keyword: 'кава', deleted_at: '2026-10-01' }]);
  const e = entry('кава');
  await ctx.reconcileDictionaryCloudId(cloud, 'u1', e, 'c', null);
  assert.notEqual(e.cloudId, 'dead');
  assert.equal(cloud.rows.length, 2);
  assert.deepEqual(events, []);
});

test('23505, але живого рядка не знайдено (лише tombstone): не усиновлюємо, cloudId порожній, без падіння', async () => {
  const events = [];
  const ctx = sandboxFor(events);
  const cloud = { rows: [], from(){
    const b = { select(){ return b; }, eq(){ return b; }, ilike(){ return b; }, is(){ return b; }, order(){ return b; }, limit(){ return b; }, insert(){ return b; }, single(){ return b; },
      then(res){ return Promise.resolve(b.__ins ? { data: null, error: { code: '23505' } } : { data: [], error: null }).then(res); } };
    b.insert = function(){ b.__ins = true; return b; };
    return b;
  } };
  const e = entry('кава');
  await ctx.reconcileDictionaryCloudId(cloud, 'u1', e, 'c', null);
  assert.equal(e.cloudId, undefined);
  assert.deepEqual(events, []);
});

test('pushDictionaryPilot: не більше одного одночасного запуску, виклики під час запуску зливаються в один наступний', async () => {
  let running = 0, maxRunning = 0, runs = 0;
  const ctx = buildSandbox({
    dictionaryPushRunning: null, dictionaryPushQueued: null,
    pushDictionaryPilotRun: async function(){ running++; runs++; maxRunning = Math.max(maxRunning, running); await new Promise(function(r){ setTimeout(r, 15); }); running--; return { success: true }; },
  }, ['pushDictionaryPilot']);
  const results = await Promise.all([1, 2, 3, 4, 5].map(function(){ return ctx.pushDictionaryPilot(); }));
  assert.equal(maxRunning, 1);
  assert.equal(runs, 2, 'перший запуск + один злитий наступний');
  assert.equal(results.length, 5);
  // після завершення черга вільна: наступний виклик знову запускає рівно один
  await ctx.pushDictionaryPilot();
  assert.equal(runs, 3);
});

test('джерело (F): подія dict-dup-adopt без значення слова; нових DELETE/міграцій немає', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert.ok(/captureDebugGeometry\('dict-dup-adopt', \{\}\)/.test(src));
  assert.equal(/from\('dictionary'\)\.delete\(\)/.test(src.replace(/purgeCloudRow[\s\S]*?\n}/, '')), false);
});
