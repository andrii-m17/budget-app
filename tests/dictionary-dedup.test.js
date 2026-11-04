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
      maybeSingle(){ st.maybe = true; return api; },
      then(res, rej){ return run().then(res, rej); },
    };
    async function run(){
      await Promise.resolve();
      if(o.latency) await new Promise(function(r){ setTimeout(r, o.latency); });
      if(st.op === 'select' && o.racerAfterFirstSelect && !o.racerDone){ o.racerDone = true; rows.push(o.racerAfterFirstSelect); return { data: [], error: null }; }
      if(st.op === 'select' && st.maybe){ const h = rows.filter(function(r){ return st.filters.every(function(f){ return f(r); }); }); return { data: h[0] || null, error: null }; }
      if(st.op === 'select') return { data: rows.filter(function(r){ return st.filters.every(function(f){ return f(r); }); }), error: null };
      if(st.op === 'update'){ rows.filter(function(r){ return st.filters.every(function(f){ return f(r); }); }).forEach(function(r){ Object.assign(r, st.payload); }); return { data: null, error: null }; }
      const p = st.payload;
      const live = !p.deleted_at;
      if(live && rows.some(function(r){ return !r.deleted_at && r.family_id === p.family_id && String(r.keyword).toLowerCase() === String(p.keyword).toLowerCase(); })){
        return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "dictionary_live_keyword_uniq"' } };
      }
      if(p.id && rows.some(function(r){ return r.id === p.id; })) return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "dictionary_pkey"' } };
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
    ['escapeLikeExact', 'findLiveDictionaryRow', 'dictionaryIdSpec', 'idSendNew', 'idMatchKey']);
}
const entry = function(kw){ return { kw: kw, createdAt: 't', updatedAt: 't' }; };

test('escapeLikeExact екранує \\, % і _', () => {
  const ctx = sandboxFor([]);
  assert.equal(ctx.escapeLikeExact('a%b_c\\d'), 'a\\%b\\_c\\\\d');
});

const send = function(ctx, cloud, e, id){ return ctx.idSendNew(cloud, ctx.dictionaryIdSpec('cat1', null), e, 'u1', id, false); };

test('Rev 2.32.244: 23505 через ключове слово (dictionary_live_keyword_uniq) — стан keyConflict, а не «id вже є»; регістр не важливий', async () => {
  const ctx = sandboxFor([]);
  const cloud = makeCloud([{ id: 'other', family_id: 'fam', keyword: 'Кава', deleted_at: null }]);
  const r = await send(ctx, cloud, entry('кава'), 'new-id');
  assert.equal(r.state, 'keyConflict');
  assert.equal(cloud.rows.length, 1, 'нового рядка нема');
});

test('Rev 2.32.244: 23505 через первинний ключ (dictionary_pkey) — «id вже є»: GET за id → живий рядок', async () => {
  const ctx = sandboxFor([]);
  const cloud = makeCloud([{ id: 'same-id', family_id: 'fam', keyword: 'чай', deleted_at: null }]);
  const r = await send(ctx, cloud, entry('кава'), 'same-id');
  assert.equal(r.state, 'live');
});

test('Rev 2.32.244: «id вже є», рядок із цим id — надгробок: видалення приймається (tombstone), нового рядка нема', async () => {
  const ctx = sandboxFor([]);
  const cloud = makeCloud([{ id: 'dead', family_id: 'fam', keyword: 'кава', deleted_at: '2026-10-01' }]);
  const r = await send(ctx, cloud, entry('кава'), 'dead');
  assert.equal(r.state, 'tombstone');
  assert.equal(cloud.rows.length, 1);
});

test('Rev 2.32.244: надгробок з тим самим ключовим словом (інший id) не заважає — вставляється новий живий рядок з клієнтським id', async () => {
  const ctx = sandboxFor([]);
  const cloud = makeCloud([{ id: 'dead', family_id: 'fam', keyword: 'кава', deleted_at: '2026-10-01' }]);
  const r = await send(ctx, cloud, entry('кава'), 'new-id');
  assert.equal(r.state, 'inserted');
  assert.equal(cloud.rows.length, 2);
  assert.equal(cloud.rows[1].id, 'new-id');
});

test('Rev 2.32.244: дві вставки одного слова з різними id — друга дає keyConflict (один живий рядок)', async () => {
  const ctx = sandboxFor([]);
  const cloud = makeCloud([]);
  assert.equal((await send(ctx, cloud, entry('кава'), 'id-a')).state, 'inserted');
  assert.equal((await send(ctx, cloud, entry('Кава'), 'id-b')).state, 'keyConflict');
  assert.equal(cloud.rows.length, 1);
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
