// Rev 2.23.26 (6D.195, G1) — "пуш лише змінених" для словника: isDirty, applyCensus, planDictionaryPush,
// перепис id, restore з бекапу, інтеграція на моку Cloud із серверним тригером G0.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildSandbox } = require('./extract');

const pure = buildSandbox({}, ['TEST_IGNORE_LS_KEY', 'isTestRecordName', 'syncNameOf', 'shouldIgnoreForSync', 'isTestHiddenKey', 'testIgnoreFlag', 'isTestSyncIgnored', 'syncableRecords', 'filterTestRows', 'isDirty', 'applyCensus', 'planDictionaryPush']);
const j = function(v){ return JSON.parse(JSON.stringify(v)); };
const clean = function(id, extra){ return Object.assign({ id: 'l-' + id, kw: 'слово' + id, cat: 'Їжа', sub: null, cloudId: 'c-' + id, updatedAt: 'U', syncedUpdatedAt: 'U', syncedCategoryId: 'cat1', syncedSubcategoryId: null }, extra || {}); };

test('isDirty: без cloudId, без syncedUpdatedAt або syncedUpdatedAt≠updatedAt → dirty; синхронізований → ні', () => {
  assert.equal(pure.isDirty(clean(1)), false);
  assert.equal(pure.isDirty(clean(1, { cloudId: null })), true);
  assert.equal(pure.isDirty(clean(1, { syncedUpdatedAt: undefined })), true);
  assert.equal(pure.isDirty(clean(1, { updatedAt: 'U2' })), true);
});

test('applyCensus: відсутній у переписі живий → cloudId скинуто й dirty; tombstone → прибрано локально; наявні не чіпає', () => {
  const live = clean(1), dead = clean(2, { deletedAt: 'D' }), ok = clean(3);
  const list = [live, dead, ok];
  const res = pure.applyCensus(list, ['c-3']);
  assert.deepEqual(j(res), { reset: 1, dropped: 1 });
  assert.equal(live.cloudId, null);
  assert.equal(live.syncedUpdatedAt, undefined);
  assert.deepEqual(list.map(function(e){ return e.id; }), ['l-1', 'l-3']);
  assert.equal(ok.cloudId, 'c-3');
});

test('applyCensus: збій запиту (null) і порожня відповідь при наявних cloudId → нічого не змінюється', () => {
  [null, undefined, 'err', []].forEach(function(bad){
    const e = clean(1); const list = [e];
    assert.deepEqual(j(pure.applyCensus(list, bad)), { reset: 0, dropped: 0 });
    assert.equal(e.cloudId, 'c-1'); assert.equal(list.length, 1);
  });
  assert.deepEqual(j(pure.applyCensus([clean(1, { cloudId: null })], [])), { reset: 0, dropped: 0 });
});

test('planDictionaryPush: чисті пропускає, dirty бере; cloudId поза переписом і зміна батьків теж dirty', () => {
  const parents = function(e){ return e.id === 'l-4' ? { catId: 'cat-NEW', subId: null } : { catId: 'cat1', subId: null }; };
  const list = [clean(1), clean(2, { updatedAt: 'U2' }), clean(3, { cloudId: null }), clean(4), clean(5)];
  const plan = pure.planDictionaryPush(list, ['c-1', 'c-2', 'c-4'], parents);
  assert.deepEqual(j(plan.push.map(function(e){ return e.id; })), ['l-2', 'l-3', 'l-4', 'l-5']); // l-5: cloudId не в переписі
  assert.equal(plan.skipped, 1);
  const plain = pure.planDictionaryPush(list, null, null);
  assert.deepEqual(j(plain.push.map(function(e){ return e.id; })), ['l-2', 'l-3']);
});

// ---- інтеграція: мок Cloud із тригером G0 (updated_at піднімається лише при реальній зміні) ----
function makeCloud(rows){
  let seq = 0, now = 1000;
  const stats = { updates: 0, inserts: 0, censusCalls: 0 };
  const SERVICE = { updated_at: 1, updated_by: 1 };
  function builder(){
    const st = { op: 'select', f: [], p: null };
    const api = {
      select(cols){ st.cols = cols; return api; },
      insert(p){ st.op = 'insert'; st.p = p; return api; },
      update(p){ st.op = 'update'; st.p = p; return api; },
      eq(c, v){ st.f.push(function(r){ return r[c] === v; }); return api; },
      ilike(c, pat){ const raw = pat.replace(/\\([\\%_])/g, '$1').toLowerCase(); st.f.push(function(r){ return String(r[c]).toLowerCase() === raw; }); return api; },
      is(c, v){ st.f.push(function(r){ return (r[c] === undefined ? null : r[c]) === v; }); return api; },
      or(){ return api; }, order(){ return api; },
      limit(){ return api; }, range(a, b){ st.range = [a, b]; return api; }, single(){ return api; },
      then(res, rej){ return run().then(res, rej); },
    };
    async function run(){
      await Promise.resolve();
      const hit = rows.filter(function(r){ return st.f.every(function(f){ return f(r); }); });
      if(st.op === 'update'){
        stats.updates++;
        hit.forEach(function(r){
          const changed = Object.keys(st.p).some(function(k){ return !SERVICE[k] && JSON.stringify(r[k] === undefined ? null : r[k]) !== JSON.stringify(st.p[k] === undefined ? null : st.p[k]); });
          Object.assign(r, st.p);
          if(changed) r.updated_at = ++now; else r.updated_at = r.__ua;
          r.__ua = r.updated_at;
        });
        return { data: hit.map(function(r){ return { id: r.id }; }), error: null };
      }
      if(st.op === 'insert'){
        stats.inserts++;
        const r = Object.assign({ id: 'row-' + (++seq) }, st.p, { updated_at: ++now });
        r.__ua = r.updated_at; rows.push(r);
        return { data: { id: r.id }, error: null };
      }
      if(st.cols === 'id' && st.range){ stats.censusCalls++; return { data: hit.slice(st.range[0], st.range[1] + 1).map(function(r){ return { id: r.id }; }), error: null }; }
      return { data: hit, error: null };
    }
    return api;
  }
  return { rows: rows, stats: stats, from(){ return builder(); } };
}
function cloudRow(id, kw, extra){ return Object.assign({ id: id, family_id: 'fam', keyword: kw, category_id: 'cat1', subcategory_id: null, deleted_at: null, deleted_via: null, updated_at: 1, __ua: 1, updated_by: 'u' }, extra || {}); }

function sandboxWith(cloud, dict){
  const events = [];
  const ctx = buildSandbox({
    cloudSession: { user: { id: 'u1' } }, cloudFamilyId: 'fam', isCloudSessionReady: function(){ return true; },
    getSupabaseClient: function(){ return cloud; }, DICTIONARY: dict, CATEGORIES: [{ name: 'Їжа', cloudId: 'cat1', active: true }], SUBCATEGORIES: [],
    saveDictionaryLocal: async function(){ return { success: true }; }, renderStructure: function(){}, reportSaveResult: function(){},
    pullDictionaryCore: async function(){ return { skipped: true }; },
    captureDebugGeometry: function(t, x){ events.push([t, x]); },
  }, ['TEST_IGNORE_LS_KEY', 'isTestRecordName', 'syncNameOf', 'shouldIgnoreForSync', 'isTestHiddenKey', 'testIgnoreFlag', 'isTestSyncIgnored', 'syncableRecords', 'filterTestRows', 'isDirty', 'applyCensus', 'fetchCloudIdCensus', 'planDictionaryPush', 'dictionaryParentIds', 'markDictionarySynced', 'reconcileDictionaryCensus',
      'pushDictionaryPilotRun', 'reconcileDictionaryCloudId', 'findLiveDictionaryRow', 'escapeLikeExact']);
  ctx.__events = events;
  return ctx;
}
const word = function(id, kw, extra){ return Object.assign({ id: 'l-' + id, kw: kw, cat: 'Їжа', sub: null, cloudId: 'c-' + id, createdAt: 't', updatedAt: 'U', syncedUpdatedAt: 'U', syncedCategoryId: 'cat1', syncedSubcategoryId: null }, extra || {}); };

test('G1-1: збереження без правок — жодного UPDATE/INSERT у Cloud, updated_at усіх слів не змінився', async () => {
  const cloud = makeCloud([cloudRow('c-1', 'кава'), cloudRow('c-2', 'чай')]);
  const ctx = sandboxWith(cloud, [word(1, 'кава'), word(2, 'чай')]);
  await ctx.pushDictionaryPilotRun();
  assert.equal(cloud.stats.updates, 0);
  assert.equal(cloud.stats.inserts, 0);
  assert.deepEqual(cloud.rows.map(function(r){ return r.updated_at; }), [1, 1]);
  assert.deepEqual(ctx.__events.map(function(e){ return [e[0], e[1].entries, e[1].skipped]; }), [['push-dirty', 0, 2]]);
});

test('G1-2: реальна правка слова — рівно один UPDATE і зміна updated_at лише цього рядка', async () => {
  const cloud = makeCloud([cloudRow('c-1', 'кава'), cloudRow('c-2', 'чай')]);
  const dict = [word(1, 'кава'), word(2, 'чай')];
  const ctx = sandboxWith(cloud, dict);
  dict[1].cat = 'Їжа'; dict[1].kw = 'чай зелений'; dict[1].updatedAt = 'U2';
  await ctx.pushDictionaryPilotRun();
  assert.equal(cloud.stats.updates, 1);
  assert.equal(cloud.rows[0].updated_at, 1);
  assert.ok(cloud.rows[1].updated_at > 1);
  assert.equal(dict[1].syncedUpdatedAt, 'U2');
});

test('G1-3: слово, видалене в Cloud вручну → після перепису створюється знову, локально без дубля', async () => {
  const cloud = makeCloud([cloudRow('c-2', 'чай')]); // c-1 («кава») видалено вручну
  const dict = [word(1, 'кава'), word(2, 'чай')];
  const ctx = sandboxWith(cloud, dict);
  const res = await ctx.reconcileDictionaryCensus();
  assert.deepEqual(j(res), { reset: 1, dropped: 0 });
  await ctx.pushDictionaryPilotRun();
  assert.equal(cloud.stats.inserts, 1);
  assert.equal(cloud.rows.filter(function(r){ return r.keyword === 'кава'; }).length, 1);
  assert.equal(dict.length, 2);
  assert.ok(dict[0].cloudId && dict[0].cloudId !== 'c-1');
  assert.equal(cloud.stats.updates, 0, 'чисте слово «чай» не пушилось');
});

test('перепис: tombstone, якого немає в Cloud (видалено назавжди деінде), НЕ відтворюється, а прибирається локально', async () => {
  const cloud = makeCloud([cloudRow('c-2', 'чай')]);
  const dict = [word(1, 'кава', { deletedAt: 'D' }), word(2, 'чай')];
  const ctx = sandboxWith(cloud, dict);
  await ctx.reconcileDictionaryCensus();
  await ctx.pushDictionaryPilotRun();
  assert.equal(dict.length, 1);
  assert.equal(cloud.stats.inserts, 0);
});

test('перепис: збій запиту нічого не змінює; tombstone-слово поводиться як раніше (чистий не пушиться, змінений — update)', async () => {
  const cloud = makeCloud([cloudRow('c-1', 'кава', { deleted_at: 'D' })]);
  const dict = [word(1, 'кава', { deletedAt: 'D' })];
  const ctx = sandboxWith(cloud, dict);
  cloud.from = function(){ throw new Error('мережа'); };
  assert.equal(await ctx.reconcileDictionaryCensus(), null);
  assert.equal(dict[0].cloudId, 'c-1');
  cloud.from = makeCloud(cloud.rows).from;
  await ctx.pushDictionaryPilotRun();
  assert.equal(cloud.stats.updates, 0);
});

test('зміна cloudId батьківської категорії робить чисте слово dirty (раніше це робив "пуш усього")', async () => {
  const cloud = makeCloud([cloudRow('c-1', 'кава')]);
  const dict = [word(1, 'кава')];
  const ctx = sandboxWith(cloud, dict);
  ctx.CATEGORIES[0].cloudId = 'cat-relinked';
  await ctx.pushDictionaryPilotRun();
  assert.equal(cloud.rows[0].category_id, 'cat-relinked');
  assert.equal(dict[0].syncedCategoryId, 'cat-relinked');
});

test('restore з бекапу знімає syncedUpdatedAt у змінених і доданих словах', () => {
  const ctx = buildSandbox({}, ['mergeBackupRecordsByCloudIdOrName']);
  const local = [{ kw: 'a', updatedAt: '2026-01-01T00:00:00.000Z', cloudId: 'c1', syncedUpdatedAt: '2026-01-01T00:00:00.000Z', syncedCategoryId: 'x' }];
  const backup = [
    { kw: 'a', updatedAt: '2026-02-01T00:00:00.000Z', cloudId: 'c1', syncedUpdatedAt: '2026-02-01T00:00:00.000Z', syncedCategoryId: 'x' },
    { kw: 'b', updatedAt: '2026-02-01T00:00:00.000Z', syncedUpdatedAt: '2026-02-01T00:00:00.000Z', syncedCategoryId: 'x' },
  ];
  const res = ctx.mergeBackupRecordsByCloudIdOrName(local, backup, 'kw');
  assert.equal(res.updated, 1); assert.equal(res.added, 1);
  local.forEach(function(r){ assert.equal(r.syncedUpdatedAt, undefined); assert.equal(r.syncedCategoryId, undefined); });
  assert.equal(local[0].cloudId, 'c1');
});

test('джерело (G1): перепис id не на кожному збереженні (save* його не кличе), без нових DELETE', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const saveFn = src.slice(src.indexOf('async function saveDictionary()'), src.indexOf('async function saveDictionaryLocal()'));
  assert.equal(saveFn.indexOf('Census'), -1);
  const n = (src.match(/reconcileDictionaryCensus\(\)/g) || []).length;
  assert.ok(n >= 2, 'визначення + syncNameDomainsOnConnect (вхід/online/"Синхронізувати все" ідуть через нього)');
  assert.ok((src.match(/syncNameDomainsOnConnect\(/g) || []).length >= 4);
});
