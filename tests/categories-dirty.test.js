// Rev 2.23.27 (6D.196, G2) — "пуш лише змінених" для категорій і підкатегорій на моку Cloud із
// семантикою серверного тригера G0 (updated_at піднімається лише при реальній зміні).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildSandbox } = require('./extract');

const j = function(v){ return JSON.parse(JSON.stringify(v)); };
let clock = Date.parse('2026-10-07T10:00:00.000Z');
const tick = function(sec){ clock += (sec || 1) * 1000; return new Date(clock).toISOString(); };

function makeCloud(){
  const tables = { categories: [], subcategories: [] };
  const stats = { updates: { categories: 0, subcategories: 0 }, inserts: { categories: 0, subcategories: 0 } };
  let seq = 0;
  const SERVICE = { updated_at: 1, updated_by: 1, created_at: 1, created_by: 1, __ua: 1 };
  function from(table){
    const rows = tables[table];
    const st = { op: 'select', f: [], p: null };
    const api = {
      select(cols){ st.cols = cols; return api; },
      insert(p){ st.op = 'insert'; st.p = p; return api; },
      update(p){ st.op = 'update'; st.p = p; return api; },
      eq(c, v){ st.f.push(function(r){ return r[c] === v; }); return api; },
      gte(c, v){ st.f.push(function(r){ return r[c] >= v; }); return api; },
      is(c, v){ st.f.push(function(r){ return (r[c] == null ? null : r[c]) === v; }); return api; }, // Rev 2.32.7 (T3)
      order(){ return api; }, range(a, b){ st.range = [a, b]; return api; },
      single(){ st.single = true; return api; }, maybeSingle(){ st.maybe = true; return api; },
      then(res, rej){ return run().then(res, rej); },
    };
    async function run(){
      await Promise.resolve();
      const hit = rows.filter(function(r){ return st.f.every(function(f){ return f(r); }); });
      if(st.op === 'update'){
        stats.updates[table]++;
        hit.forEach(function(r){
          const changed = Object.keys(st.p).some(function(k){ return !SERVICE[k] && JSON.stringify(r[k] === undefined ? null : r[k]) !== JSON.stringify(st.p[k] === undefined ? null : st.p[k]); });
          Object.assign(r, st.p);
          r.updated_at = changed ? tick() : r.__ua;
          r.__ua = r.updated_at;
        });
        return { data: hit.map(function(r){ return { id: r.id }; }), error: null };
      }
      if(st.op === 'insert'){
        stats.inserts[table]++;
        const r = Object.assign({ id: table[0] + (++seq) }, st.p, { updated_at: tick() });
        r.__ua = r.updated_at; rows.push(r);
        return { data: { id: r.id }, error: null };
      }
      if(st.cols === 'id' && st.range) return { data: hit.slice(st.range[0], st.range[1] + 1).map(function(r){ return { id: r.id }; }), error: null };
      if(st.maybe) return { data: hit[0] ? Object.assign({}, hit[0]) : null, error: null };
      return { data: hit.map(function(r){ return Object.assign({}, r); }), error: null };
    }
    return api;
  }
  return { tables: tables, stats: stats, from: from };
}
function hash(cloud, table){ return JSON.stringify(cloud.tables[table].map(function(r){ return [r.id, r.updated_at]; })); }

const NAMES = ['LS_KEY_SYNC_MARKERS', 'loadSyncMarkers', 'getSyncMarker', 'setSyncMarker', 'applySyncMarker', 'updateSyncMarkerFromAllRows',
  'saveCategoriesLocal', 'saveSubcategoriesLocal', 'pushCategoriesPilot', 'reconcileCategoryCloudId', 'pullCategoriesCore',
  'pushSubcategoriesPilot', 'reconcileSubcategoryCloudId', 'pullSubcategoriesCore',
  'TEST_IGNORE_LS_KEY', 'isTestRecordName', 'syncNameOf', 'shouldIgnoreForSync', 'isTestHiddenKey', 'testIgnoreFlag', 'isTestSyncIgnored', 'syncableRecords', 'filterTestRows', 'isDirty', 'applyCensus', 'fetchCloudIdCensus', 'planCategoriesPush', 'isSubcategoryDirty', 'planSubcategoriesPush', 'categoriesByNameMap',
  'reconcileCategoriesCensus', 'reconcileSubcategoriesCensus'];
function device(cloud, name, cats, subs){
  const store = {}; const events = [];
  const ctx = buildSandbox({
    cloudSession: { user: { id: name } }, cloudFamilyId: 'fam', isCloudSessionReady: function(){ return true; }, getSupabaseClient: function(){ return cloud; },
    CATEGORIES: cats || [], SUBCATEGORIES: subs || [], DICTIONARY: [], isDomainMigrated: function(){ return false; },
    LS_KEY_CATEGORIES: 'c', LS_KEY_SUBCATEGORIES: 's',
    localStorage: { getItem: function(k){ return store[k] === undefined ? null : store[k]; }, setItem: function(k, v){ store[k] = v; }, removeItem: function(k){ delete store[k]; } },
    renderStructure: function(){}, populateCategorySelect: function(){}, saveDictionaryLocal: async function(){ return { success: true }; },
    reportSaveResult: function(){}, captureDebugGeometry: function(t, x){ events.push([t, x]); },
  }, NAMES);
  ctx.__events = events;
  return ctx;
}
async function seeded(){
  const cloud = makeCloud();
  const A = device(cloud, 'A', [
    { name: 'Їжа', type: 'Гнучка', active: true, createdAt: tick(), updatedAt: tick() },
    { name: 'Дім', type: 'Гнучка', active: true, createdAt: tick(), updatedAt: tick() },
  ], [
    { name: 'Кафе', category: 'Їжа', active: true, createdAt: tick(), updatedAt: tick() },
    { name: 'Піца', category: 'Їжа', active: true, createdAt: tick(), updatedAt: tick() },
    { name: 'Ремонт', category: 'Дім', active: true, createdAt: tick(), updatedAt: tick() },
  ]);
  await A.pushCategoriesPilot(); await A.pushSubcategoriesPilot();
  return { cloud: cloud, A: A };
}
const counts = function(c){ return j({ u: c.stats.updates, i: c.stats.inserts }); };

test('G2-1: збереження без правок — 0 UPDATE і 0 INSERT, хеш id+updated_at не змінився', async () => {
  const { cloud, A } = await seeded();
  const before = [hash(cloud, 'categories'), hash(cloud, 'subcategories')], c0 = counts(cloud);
  await A.pushCategoriesPilot(); await A.pushSubcategoriesPilot();
  assert.deepEqual(counts(cloud), c0);
  assert.deepEqual([hash(cloud, 'categories'), hash(cloud, 'subcategories')], before);
  const pd = A.__events.filter(function(e){ return e[0] === 'push-dirty'; }).slice(-2).map(function(e){ return [e[1].entries, e[1].skipped]; });
  assert.deepEqual(pd, [[0, 2], [0, 3]]);
});

test('G2-2: перейменування категорії — рівно один UPDATE категорії, 0 у підкатегорій (діти за id)', async () => {
  const { cloud, A } = await seeded();
  const c0 = counts(cloud);
  const cat = A.CATEGORIES[0];
  A.SUBCATEGORIES.forEach(function(s){ if(s.category === 'Їжа') s.category = 'Харчування'; }); // як editCategory: updatedAt дітей не чіпає
  cat.name = 'Харчування'; cat.updatedAt = tick();
  await A.pushCategoriesPilot(); await A.pushSubcategoriesPilot();
  assert.equal(cloud.stats.updates.categories - c0.u.categories, 1);
  assert.equal(cloud.stats.updates.subcategories - c0.u.subcategories, 0);
  assert.equal(cloud.tables.categories.find(function(r){ return r.name === 'Харчування'; }).id, cat.cloudId);
});

test('G2-3: видалення категорії з каскадом — оновлюються лише вона й її підкатегорії', async () => {
  const { cloud, A } = await seeded();
  const c0 = counts(cloud), hCat = cloud.tables.categories.map(function(r){ return r.updated_at; }), hSub = cloud.tables.subcategories.map(function(r){ return r.updated_at; });
  const when = tick();
  A.CATEGORIES[0].active = false; A.CATEGORIES[0].updatedAt = when;
  A.SUBCATEGORIES.filter(function(s){ return s.category === 'Їжа'; }).forEach(function(s){ s.active = false; s.deactivatedVia = 'category'; s.updatedAt = when; });
  await A.pushCategoriesPilot(); await A.pushSubcategoriesPilot();
  assert.equal(cloud.stats.updates.categories - c0.u.categories, 1);
  assert.equal(cloud.stats.updates.subcategories - c0.u.subcategories, 2);
  assert.notEqual(cloud.tables.categories[0].updated_at, hCat[0]);
  assert.equal(cloud.tables.categories[1].updated_at, hCat[1], '«Дім» не чіпали');
  assert.equal(cloud.tables.subcategories[2].updated_at, hSub[2], '«Ремонт» не чіпали');
  assert.equal(cloud.tables.subcategories[0].deactivated_via, 'category');
});

test('G2-4: рядок категорії видалено в Cloud → перепис скидає cloudId, push створює знову, підкатегорії отримують новий category_id', async () => {
  const { cloud, A } = await seeded();
  const oldId = A.CATEGORIES[0].cloudId;
  cloud.tables.categories.splice(0, 1); // «Їжа» видалено вручну; підкатегорії лишились із мертвим category_id
  const rc = await A.reconcileCategoriesCensus(); const rs = await A.reconcileSubcategoriesCensus();
  assert.deepEqual(j([rc, rs]), [{ reset: 1, dropped: 0 }, { reset: 0, dropped: 0 }]);
  await A.pushCategoriesPilot(); await A.pushSubcategoriesPilot();
  const newId = A.CATEGORIES[0].cloudId;
  assert.ok(newId && newId !== oldId);
  assert.equal(cloud.tables.categories.filter(function(r){ return r.name === 'Їжа'; }).length, 1);
  cloud.tables.subcategories.filter(function(r){ return r.name === 'Кафе' || r.name === 'Піца'; }).forEach(function(r){ assert.equal(r.category_id, newId); });
  assert.equal(A.CATEGORIES.length, 2); assert.equal(A.SUBCATEGORIES.length, 3);
});

test('зміна cloudId категорії робить чисту підкатегорію dirty (isSubcategoryDirty)', async () => {
  const { A } = await seeded();
  const sub = A.SUBCATEGORIES[0];
  assert.equal(A.isSubcategoryDirty(sub, A.categoriesByNameMap()), false);
  A.CATEGORIES[0].cloudId = 'relinked';
  assert.equal(A.isSubcategoryDirty(sub, A.categoriesByNameMap()), true);
  assert.deepEqual(j(A.planSubcategoriesPush(A.SUBCATEGORIES, null, A.categoriesByNameMap()).push.map(function(s){ return s.name; })), ['Кафе', 'Піца']);
});

test('G2-5: застарілий пристрій без власних правок не затирає чужі зміни; несуміжне збереження не чіпає чужі записи', async () => {
  const { cloud, A } = await seeded();
  const B = device(cloud, 'B', [], []);
  await B.pullCategoriesCore(); await B.pullSubcategoriesCore();
  assert.equal(B.CATEGORIES.length, 2);
  // A деактивує «Їжа» й міняє тип «Дім»; B (офлайн) цього не знає
  A.CATEGORIES[0].active = false; A.CATEGORIES[0].updatedAt = tick();
  A.CATEGORIES[1].type = "Обов'язкова"; A.CATEGORIES[1].updatedAt = tick();
  await A.pushCategoriesPilot();
  // B додає свою категорію (несуміжний запис) й зберігає → push
  B.CATEGORIES.push({ name: 'Нова', type: 'Гнучка', active: true, createdAt: tick(), updatedAt: tick() });
  const u0 = cloud.stats.updates.categories;
  await B.pushCategoriesPilot();
  assert.equal(cloud.stats.updates.categories - u0, 0, 'B не оновлював чужі рядки');
  assert.equal(cloud.stats.inserts.categories, 3);
  const eda = cloud.tables.categories.find(function(r){ return r.name === 'Їжа'; });
  assert.equal(eda.active, false, 'зміна active, зроблена A, збереглась');
  assert.equal(cloud.tables.categories.find(function(r){ return r.name === 'Дім'; }).type, "Обов'язкова");
  // pull-after-push на B приніс зміни A
  assert.equal(B.CATEGORIES.find(function(c){ return c.name === 'Їжа'; }).active, false);
});

test('pull LWW: гілка «локальна правка новіша за Cloud» тепер справді спрацьовує (keptLocal) і правка доходить до Cloud', async () => {
  const { cloud, A } = await seeded();
  tick(60);
  A.CATEGORIES[1].type = 'Скорочувана'; A.CATEGORIES[1].updatedAt = tick(); // локальна правка (годинник клієнта) пізніша за останню зміну рядка в Cloud
  const res = await A.pullCategoriesCore(); // pull ДО push (напр. подія Realtime)
  assert.equal(res.keptLocal, 1);
  await new Promise(function(r){ setTimeout(r, 20); }); // fire-and-forget push усередині pull
  assert.equal(cloud.tables.categories.find(function(r){ return r.name === 'Дім'; }).type, 'Скорочувана');
});

test('restore з бекапу: змінена підкатегорія втрачає syncedCategoryId і пушиться', () => {
  const ctx = buildSandbox({}, ['mergeBackupRecordsByCloudIdOrName']);
  const local = [{ name: 'Кафе', category: 'Їжа', updatedAt: '2026-01-01T00:00:00.000Z', cloudId: 's1', syncedUpdatedAt: '2026-01-01T00:00:00.000Z', syncedCategoryId: 'c1' }];
  ctx.mergeBackupRecordsByCloudIdOrName(local, [{ name: 'Кафе', category: 'Дім', updatedAt: '2026-02-01T00:00:00.000Z', cloudId: 's1', syncedUpdatedAt: '2026-02-01T00:00:00.000Z', syncedCategoryId: 'c9' }], 'name');
  assert.equal(local[0].category, 'Дім'); assert.equal(local[0].syncedUpdatedAt, undefined); assert.equal(local[0].syncedCategoryId, undefined); assert.equal(local[0].cloudId, 's1');
});

test('перепис: порожня відповідь при наявних cloudId і збій запиту нічого не змінюють (G1-правила діють і для категорій)', async () => {
  const { cloud, A } = await seeded();
  cloud.tables.categories.length = 0; // порожня відповідь без помилки (підозра на сесію/RLS)
  assert.deepEqual(j(await A.reconcileCategoriesCensus()), { reset: 0, dropped: 0 });
  assert.ok(A.CATEGORIES.every(function(c){ return !!c.cloudId; }));
  const broken = Object.assign({}, cloud, { from: function(){ throw new Error('мережа'); } });
  const ctx2 = device(broken, 'X', A.CATEGORIES, A.SUBCATEGORIES);
  assert.equal(await ctx2.reconcileCategoriesCensus(), null);
});

// Rev 2.23.32 (6D.201): ізоляція тестових записів TRASH-TEST- на справжньому push/pull категорій.
test('TRASH-TEST-: pull не додає тестові рядки Cloud, push не відправляє тестові записи; прапор 0 вмикає обидва', async () => {
  const cloud = makeCloud();
  cloud.tables.categories.push({ id: 'ct1', family_id: 'fam', name: 'TRASH-TEST-cloud', type: 'Гнучка', active: true, created_at: 'c', updated_at: tick(), __ua: 0 });
  cloud.tables.categories.push({ id: 'cr1', family_id: 'fam', name: 'Реальна', type: 'Гнучка', active: true, created_at: 'c', updated_at: tick(), __ua: 0 });
  const A = device(cloud, 'A', [{ name: 'TRASH-TEST-local', type: 'Гнучка', active: true, createdAt: tick(), updatedAt: tick() }], []);
  await A.pullCategoriesCore();
  assert.deepEqual(j(A.CATEGORIES.map(function(c){ return c.name; })).sort(), ['Реальна', 'TRASH-TEST-local'].sort(), 'тестовий рядок Cloud не підтягнувся');
  const ins0 = cloud.stats.inserts.categories;
  await A.pushCategoriesPilot();
  assert.equal(cloud.stats.inserts.categories, ins0, 'тестовий локальний запис не відправлено');
  assert.equal(cloud.tables.categories.some(function(r){ return r.name === 'TRASH-TEST-local'; }), false);
  A.CATEGORIES.find(function(c){ return c.name === 'TRASH-TEST-local'; }).cloudId = 'dead-id';
  await A.reconcileCategoriesCensus();
  assert.equal(A.CATEGORIES.find(function(c){ return c.name === 'TRASH-TEST-local'; }).cloudId, 'dead-id', 'перепис не відтворює тестовий запис');
  A.localStorage.setItem('budget_ignore_test_prefix_v1', '0');
  A.localStorage.removeItem('budget_sync_markers_v1'); // pull інкрементальний: скидаємо маркер, щоб рядок Cloud знову потрапив у вибірку
  A.CATEGORIES.find(function(c){ return c.name === 'TRASH-TEST-local'; }).cloudId = null;
  await A.pullCategoriesCore();
  assert.ok(A.CATEGORIES.some(function(c){ return c.name === 'TRASH-TEST-cloud'; }), 'при прапорі 0 тестовий рядок Cloud підтягується');
  await A.pushCategoriesPilot();
  assert.ok(cloud.tables.categories.some(function(r){ return r.name === 'TRASH-TEST-local'; }), 'при прапорі 0 тестовий запис відправляється');
});
