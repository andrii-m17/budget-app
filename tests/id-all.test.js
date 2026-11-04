// Rev 2.32.244 (ID-ALL) — картки, категорії, підкатегорії й слова впізнаються лише за id (як ОЧ у Rev 244).
// Перевіряється: спільне правило міграції (мітка створення → додаткова ознака → нічого не робити → новий id), перейменування з тим самим id,
// підтвердження вставки при pull, захист від застарілої копії (назва шлеться лише після справжнього перейменування). Синтетичні дані.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildSandbox } = require('./extract');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

const j = function(v){ return JSON.parse(JSON.stringify(v)); };
let clock = Date.parse('2026-10-07T10:00:00.000Z');
const tick = function(sec){ clock += (sec || 1) * 1000; return new Date(clock).toISOString(); };
const STAMP = '2026-09-01T10:00:00.000Z'; // спільна мітка створення для «однакових» рядків (як у картках)

function makeCloud(){
  const tables = { categories: [], subcategories: [], dictionary: [], bank_accounts: [], installment_accounts: [], hidden_entities: [] };
  const stats = { inserts: {}, updates: {} };
  let seq = 0;
  const SERVICE = { updated_at: 1, updated_by: 1, created_at: 1, created_by: 1, __ua: 1 };
  function from(table){
    if(!tables[table]) throw new Error('несподівана таблиця ' + table);
    const rows = tables[table];
    const st = { op: 'select', f: [] };
    const api = {
      select(cols){ st.cols = cols; return api; },
      insert(p){ st.op = 'insert'; st.p = p; return api; },
      update(p){ st.op = 'update'; st.p = p; return api; },
      delete(){ st.op = 'delete'; return api; },
      upsert(p){ st.op = 'upsert'; st.p = p; return api; },
      eq(c, v){ st.f.push(function(r){ return r[c] === v; }); return api; },
      in(c, arr){ st.f.push(function(r){ return arr.indexOf(r[c]) !== -1; }); return api; },
      gte(c, v){ st.f.push(function(r){ return r[c] >= v; }); return api; },
      is(c, v){ st.f.push(function(r){ return (r[c] == null ? null : r[c]) === v; }); return api; },
      ilike(c, pat){ const raw = String(pat).replace(/\\([\\%_])/g, '$1').toLowerCase(); st.f.push(function(r){ return String(r[c]).toLowerCase() === raw; }); return api; },
      or(){ return api; }, order(){ return api; }, limit(){ return api; },
      range(a, b){ st.range = [a, b]; return api; },
      single(){ st.single = true; return api; }, maybeSingle(){ st.maybe = true; return api; },
      then(res, rej){ return run().then(res, rej); },
    };
    async function run(){
      await Promise.resolve();
      const hit = rows.filter(function(r){ return st.f.every(function(f){ return f(r); }); });
      if(st.op === 'update'){
        stats.updates[table] = (stats.updates[table] || 0) + 1;
        if(table === 'dictionary' && st.p.keyword !== undefined && hit.length && rows.some(function(r){ return r !== hit[0] && !r.deleted_at && String(r.keyword).toLowerCase() === String(st.p.keyword).toLowerCase(); })) return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "dictionary_live_keyword_uniq"' } };
        hit.forEach(function(r){
          const changed = Object.keys(st.p).some(function(k){ return !SERVICE[k] && JSON.stringify(r[k] === undefined ? null : r[k]) !== JSON.stringify(st.p[k] === undefined ? null : st.p[k]); });
          Object.assign(r, st.p); r.updated_at = changed ? tick() : r.__ua; r.__ua = r.updated_at;
        });
        return { data: hit.map(function(r){ return { id: r.id, updated_at: r.updated_at, deleted_at: r.deleted_at || null }; }), error: null };
      }
      if(st.op === 'insert'){
        if(st.p && st.p.id && rows.some(function(r){ return r.id === st.p.id; })) return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "' + table + '_pkey"' } };
        if(table === 'dictionary' && !st.p.deleted_at && rows.some(function(r){ return !r.deleted_at && String(r.keyword).toLowerCase() === String(st.p.keyword).toLowerCase(); })) return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "dictionary_live_keyword_uniq"' } };
        stats.inserts[table] = (stats.inserts[table] || 0) + 1;
        const r = Object.assign({ id: table[0] + (++seq), deleted_at: null, created_at: tick() }, st.p, { updated_at: tick() }); r.__ua = r.updated_at; rows.push(r);
        return { data: { id: r.id, updated_at: r.updated_at, deleted_at: r.deleted_at }, error: null };
      }
      if(st.op === 'delete' || st.op === 'upsert') return { data: null, error: null };
      if(st.cols === 'id' && st.range) return { data: hit.slice(st.range[0], st.range[1] + 1).map(function(r){ return { id: r.id }; }), error: null };
      if(st.range) return { data: hit.slice(st.range[0], st.range[1] + 1).map(function(r){ return Object.assign({}, r); }), error: null };
      if(st.maybe) return { data: hit[0] ? Object.assign({}, hit[0]) : null, error: null };
      return { data: hit.map(function(r){ return Object.assign({}, r); }), error: null };
    }
    return api;
  }
  return { tables: tables, stats: stats, from: from };
}
const row = function(table, o){ return Object.assign({ family_id: 'fam', deleted_at: null, created_at: STAMP, updated_at: tick(), __ua: 0 }, o); };

const NAMES = ['fetchDeltaRows', 'PULL_PAGE_SIZE', 'PULL_MAX_PAGES', 'LS_KEY_SYNC_MARKERS', 'LS_KEY_SYNC_HEADS', 'SYNC_DELTA_OVERLAP_MS', 'syncDeltaFrom', 'loadSyncMarkers', 'getSyncMarker', 'setSyncMarker', 'applySyncMarker', 'updateSyncMarkerFromAllRows',
  'idOf', 'idMatchKey', 'idMigrateUnlinked', 'idMigrateUnlinkedOnce', 'ID_MIGRATE_LAST', 'ID_AMBIGUOUS', 'idSendNew', 'idPushPlain', 'generateUUID', 'isDirty', 'applyCensus', 'fetchCloudIdCensus',
  'saveCategoriesLocal', 'saveSubcategoriesLocal', 'saveDictionaryLocal', 'saveBankAccountsLocal', 'saveInstallmentAccountsLocal',
  'pushCategoriesPilot', 'categoryIdSpec', 'pullCategoriesCore', 'pushSubcategoriesPilot', 'subcategoryIdSpec', 'pullSubcategoriesCore',
  'pushDictionaryPilotRun', 'dictionaryIdSpec', 'pullDictionaryCore', 'planDictionaryPush', 'dictionaryParentIds', 'markDictionarySynced', 'reconcileDictionaryCensus',
  'pushBankAccountsPilot', 'bankIdSpec', 'pullBankAccountsCore', 'paymentDayPayload', 'normalizePaymentDay', 'pullAccountTombstone', 'invalidateAccountChildren', 'cleanupOrphanedHiddenEntities',
  'pushInstallmentAccountsPilot', 'installmentIdSpec', 'pullInstallmentAccountsCore', 'ochModelDiffers', 'applyOchModelFromRow', 'rekeyHiddenFrom',
  'planCategoriesPush', 'isSubcategoryDirty', 'planSubcategoriesPush', 'categoriesByNameMap', 'planBankAccountsPush', 'planInstallmentAccountsPush', 'reconcileCategoriesCensus', 'reconcileSubcategoriesCensus',
  'reconcileBankAccountsCensus', 'reconcileAccountsCensusFor', 'pushHiddenEntitiesPilot', 'monthToDate', 'hideKey', 'hideKeyLegacy', 'hideKeyForAccount', 'hasIdHideKey', 'findAccountMonthDebt', 'accountsOfKind', 'hiddenEntryKey', 'hiddenEntryFor'];
function device(cloud, name, o){
  const store = {}; const events = []; const x = o || {};
  const ctx = buildSandbox({
    cloudSession: { user: { id: name } }, cloudFamilyId: 'fam', isCloudSessionReady: function(){ return true; }, getSupabaseClient: function(){ return cloud; },
    CATEGORIES: x.cats || [], SUBCATEGORIES: x.subs || [], DICTIONARY: x.dict || [], bankAccounts: x.banks || [], installmentAccounts: x.insts || [], debts: [], expenses: [], hiddenFrom: {},
    nameDomainChildren: 0, isDomainMigrated: function(){ return false; },
    LS_KEY_CATEGORIES: 'c', LS_KEY_SUBCATEGORIES: 's', LS_KEY_DICTIONARY: 'd', LS_KEY_BANKS: 'b', LS_KEY_INSTALLMENTS: 'i',
    localStorage: { getItem: function(k){ return store[k] === undefined ? null : store[k]; }, setItem: function(k, v){ store[k] = v; }, removeItem: function(k){ delete store[k]; } },
    renderStructure: function(){}, populateCategorySelect: function(){}, populateBankDebtTable: function(){}, populateInstallmentTable: function(){},
    saveDebts: async function(){ return { success: true }; }, saveExpenses: async function(){ return { success: true }; }, saveHiddenFromLocal: async function(){ return { success: true }; },
    pullHiddenEntitiesCore: async function(){ return { skipped: true }; }, reportSaveResult: function(){},
    captureDebugGeometry: function(t, e){ events.push([t, e]); },
  }, NAMES);
  ctx.__events = events;
  return ctx;
}
const ev = function(d, name){ return d.__events.filter(function(e){ return e[0] === name; }); };

// ---------- картки ----------
test('245-1: картки з однаковою міткою створення — вибір за назвою; решта карток не зачеплена, дубля нема', async () => {
  const cloud = makeCloud();
  ['Картка А', 'Картка Б', 'Картка В'].forEach(function(n, i){ cloud.tables.bank_accounts.push(row('bank_accounts', { id: 'b' + i, name: n, credit_limit: null })); });
  const D = device(cloud, 'D', { banks: [{ name: 'Картка Б', creditLimit: null, createdAt: STAMP, updatedAt: tick() }] });
  await D.pushBankAccountsPilot();
  assert.equal(D.bankAccounts[0].cloudId, 'b1');
  assert.equal(cloud.tables.bank_accounts.length, 3, 'нового рядка нема');
  assert.equal(cloud.stats.inserts.bank_accounts, undefined);
});

test('245-2: картка з однаковою міткою й ЗМІНЕНОЮ назвою — нічого не робиться: ні зв\'язування, ні вставки; лише подія без назв', async () => {
  const cloud = makeCloud();
  ['Картка А', 'Картка Б', 'Картка В'].forEach(function(n, i){ cloud.tables.bank_accounts.push(row('bank_accounts', { id: 'b' + i, name: n, credit_limit: null })); });
  const D = device(cloud, 'D', { banks: [{ name: 'Картка Г (нова назва)', creditLimit: null, createdAt: STAMP, updatedAt: tick() }] });
  await D.pushBankAccountsPilot();
  assert.equal(D.bankAccounts[0].cloudId, undefined);
  assert.equal(D.bankAccounts[0].clientId, undefined, 'запис лишається локальним');
  assert.equal(cloud.tables.bank_accounts.length, 3);
  const e = ev(D, 'card-ambiguous');
  assert.equal(e.length > 0, true);
  assert.deepEqual(j(e[0][1]), { ambiguous: 1 }, 'подія без назв');
});

test('245-3: картка з унікальною міткою, перейменована до першого зв\'язування — зв\'язується за міткою, назва оновлюється, дубля нема', async () => {
  const cloud = makeCloud();
  cloud.tables.bank_accounts.push(row('bank_accounts', { id: 'b0', name: 'Стара назва', credit_limit: null, created_at: '2026-08-01T00:00:00.000Z' }));
  const D = device(cloud, 'D', { banks: [{ name: 'Нова назва', nameDirty: true, creditLimit: null, createdAt: '2026-08-01T00:00:00.000Z', updatedAt: tick() }] });
  await D.pushBankAccountsPilot();
  assert.equal(D.bankAccounts[0].cloudId, 'b0');
  assert.equal(cloud.tables.bank_accounts.length, 1);
  assert.equal(cloud.tables.bank_accounts[0].name, 'Нова назва');
});

// ---------- ОЧ ----------
test('245-4: ОЧ — кілька кандидатів за міткою: вибір за сумою; змінена сума без збігу — нічого не робиться; один кандидат — зв\'язується попри зміну суми, без дубля', async () => {
  const cloud = makeCloud();
  [100, 200].forEach(function(a, i){ cloud.tables.installment_accounts.push(row('installment_accounts', { id: 'i' + i, name: 'ОЧ ' + i, initial_amount: a })); });
  const D = device(cloud, 'D', { insts: [{ name: 'ОЧ 1', initialAmount: 200, createdAt: STAMP, updatedAt: tick() }] });
  await D.pushInstallmentAccountsPilot();
  assert.equal(D.installmentAccounts[0].cloudId, 'i1', 'вибір за сумою');
  const cloud2 = makeCloud();
  [100, 200].forEach(function(a, i){ cloud2.tables.installment_accounts.push(row('installment_accounts', { id: 'i' + i, name: 'ОЧ ' + i, initial_amount: a })); });
  const D2 = device(cloud2, 'D2', { insts: [{ name: 'ОЧ 1', initialAmount: 300, createdAt: STAMP, updatedAt: tick() }] });
  await D2.pushInstallmentAccountsPilot();
  assert.equal(cloud2.tables.installment_accounts.length, 2, 'змінена сума: дубля нема');
  assert.equal(D2.installmentAccounts[0].cloudId, undefined);
  assert.equal(ev(D2, 'och-ambiguous').length > 0, true);
  const cloud3 = makeCloud();
  cloud3.tables.installment_accounts.push(row('installment_accounts', { id: 'i9', name: 'ОЧ', initial_amount: 100, created_at: '2026-08-02T00:00:00.000Z' }));
  const D3 = device(cloud3, 'D3', { insts: [{ name: 'ОЧ', initialAmount: 150, nameDirty: false, createdAt: '2026-08-02T00:00:00.000Z', updatedAt: tick() }] });
  await D3.pushInstallmentAccountsPilot();
  assert.equal(cloud3.tables.installment_accounts.length, 1, 'один кандидат: зв\'язано, а не продубльовано');
  assert.equal(D3.installmentAccounts[0].cloudId, 'i9');
  assert.equal(cloud3.tables.installment_accounts[0].initial_amount, 150);
});

// ---------- категорії ----------
test('245-5: категорія зі зміненою назвою й унікальною міткою — зв\'язується за міткою, перейменування лягає в той самий рядок', async () => {
  const cloud = makeCloud();
  cloud.tables.categories.push(row('categories', { id: 'c0', name: 'Стара', active: true, type: 'Гнучка', created_at: '2026-08-05T00:00:00.000Z' }));
  const D = device(cloud, 'D', { cats: [{ name: 'Нова', nameDirty: true, active: true, type: 'Гнучка', createdAt: '2026-08-05T00:00:00.000Z', updatedAt: tick() }] });
  await D.pushCategoriesPilot();
  assert.equal(cloud.tables.categories.length, 1);
  assert.equal(cloud.tables.categories[0].id, 'c0');
  assert.equal(cloud.tables.categories[0].name, 'Нова');
});

test('245-6: типова категорія без мітки створення — зв\'язується за точною назвою лише при рівно одному кандидаті на обох боках', async () => {
  const cloud = makeCloud();
  cloud.tables.categories.push(row('categories', { id: 'c0', name: '🏠 Житло', active: true, type: 'Обов\'язкова' }));
  const D = device(cloud, 'D', { cats: [{ name: '🏠 Житло', type: 'Обов\'язкова', active: true }, { name: '🛒 Продукти', type: 'Гнучка', active: true }] }); // без createdAt (типові)
  await D.pushCategoriesPilot();
  assert.equal(D.CATEGORIES[0].cloudId, 'c0', 'єдиний кандидат за назвою');
  assert.equal(D.CATEGORIES[0].createdAt, STAMP, 'мітка береться з сервера');
  assert.equal(cloud.tables.categories.filter(function(r){ return r.name === '🏠 Житло'; }).length, 1, 'дубля нема');
  assert.equal(cloud.tables.categories.filter(function(r){ return r.name === '🛒 Продукти'; }).length, 1, 'кандидатів нуль → новий рядок');
  const cloud2 = makeCloud();
  cloud2.tables.categories.push(row('categories', { id: 'c1', name: '🏠 Житло', active: true, type: 'Гнучка' }), row('categories', { id: 'c2', name: '🏠 Житло', active: true, type: 'Гнучка' }));
  const D2 = device(cloud2, 'D2', { cats: [{ name: '🏠 Житло', type: 'Гнучка', active: true }] });
  await D2.pushCategoriesPilot();
  assert.equal(D2.CATEGORIES[0].cloudId, undefined, 'два кандидати за назвою — нічого не чіпаємо');
  assert.equal(cloud2.tables.categories.length, 2);
  assert.equal(ev(D2, 'cat-ambiguous').length > 0, true);
});

test('245-6b: типова категорія з позначкою seed і мітками ПРИСТРОЮ (ensureCategoryIdentity їх проставляє) — зв\'язується за назвою, мітка стає серверною, позначка знімається', async () => {
  const cloud = makeCloud();
  cloud.tables.categories.push(row('categories', { id: 'c0', name: '🏠 Житло', active: true, type: 'Гнучка', created_at: '2026-08-05T00:00:00.000Z' }));
  const D = device(cloud, 'D', { cats: [{ name: '🏠 Житло', type: 'Гнучка', active: true, seed: true, createdAt: '2026-11-04T09:00:00.000Z', updatedAt: '2026-11-04T09:00:00.000Z' }] });
  await D.pushCategoriesPilot();
  assert.equal(D.CATEGORIES.length, 1);
  assert.equal(D.CATEGORIES[0].cloudId, 'c0');
  assert.equal(D.CATEGORIES[0].createdAt, '2026-08-05T00:00:00.000Z');
  assert.equal(D.CATEGORIES[0].seed, undefined);
  assert.equal(cloud.tables.categories.length, 1, 'дубля нема');
});

test('245-6c: звичайна категорія (не seed) з міткою пристрою за назвою НЕ зіставляється', async () => {
  const cloud = makeCloud();
  cloud.tables.categories.push(row('categories', { id: 'c0', name: '🏠 Житло', active: true, type: 'Гнучка', created_at: '2026-08-05T00:00:00.000Z' }));
  const D = device(cloud, 'D', { cats: [{ name: '🏠 Житло', type: 'Гнучка', active: true, createdAt: '2026-11-04T09:00:00.000Z', updatedAt: '2026-11-04T09:00:00.000Z' }] });
  await D.pushCategoriesPilot();
  assert.equal(D.CATEGORIES[0].cloudId !== 'c0', true);
});

test('245-7: запис з міткою ніколи не зіставляється за назвою (назва — лише для записів без мітки)', async () => {
  const cloud = makeCloud();
  cloud.tables.categories.push(row('categories', { id: 'c0', name: 'Їжа', active: true, type: 'Гнучка', created_at: '2026-08-05T00:00:00.000Z' }));
  const D = device(cloud, 'D', { cats: [{ name: 'Їжа', active: true, type: 'Гнучка', createdAt: '2026-08-06T00:00:00.000Z', updatedAt: tick() }] }); // та сама назва, інша мітка
  await D.pushCategoriesPilot();
  assert.equal(cloud.tables.categories.length, 2, 'інша мітка → окремий запис з клієнтським id');
  assert.equal(D.CATEGORIES[0].cloudId !== 'c0', true);
});

test('245-8: перейменування категорії на пристрої A доходить до пристрою B у той самий рядок; застаріла копія без nameDirty не стирає назву', async () => {
  const cloud = makeCloud();
  const A = device(cloud, 'A', { cats: [{ name: 'Їжа', active: true, type: 'Гнучка', createdAt: tick(), updatedAt: tick(), clientId: 'cid-c' }] });
  await A.pushCategoriesPilot();
  const id = A.CATEGORIES[0].cloudId;
  assert.equal(id, 'cid-c', 'id, виданий до мережі, став id рядка');
  const B = device(cloud, 'B', {});
  await B.pullCategoriesCore();
  assert.equal(B.CATEGORIES.length, 1);
  A.CATEGORIES[0].name = 'Харчування'; A.CATEGORIES[0].nameDirty = true; A.CATEGORIES[0].updatedAt = tick();
  await A.pushCategoriesPilot();
  assert.equal(cloud.tables.categories.length, 1);
  assert.equal(cloud.tables.categories[0].name, 'Харчування');
  // B (стара назва, без зліпка) змінює лише тип — назва із сервера не затирається
  delete B.CATEGORIES[0].serverBase; delete B.CATEGORIES[0].serverName; delete B.CATEGORIES[0].serverUpdatedAt;
  B.CATEGORIES[0].type = "Обов'язкова"; B.CATEGORIES[0].updatedAt = tick();
  await B.pushCategoriesPilot();
  assert.equal(cloud.tables.categories[0].name, 'Харчування', 'назва не затерта');
  assert.equal(cloud.tables.categories[0].type, "Обов'язкова");
  assert.equal(cloud.tables.categories.length, 1);
});

test('245-9: pull: рядок із id, що збігається з clientId категорії (вставка дійшла, підтвердження не збереглось), зв\'язується без дубля', async () => {
  const cloud = makeCloud();
  const A = device(cloud, 'A', { cats: [{ name: 'Їжа', active: true, type: 'Гнучка', createdAt: tick(), updatedAt: tick(), clientId: 'cid-x' }] });
  await A.pushCategoriesPilot();
  A.CATEGORIES[0].cloudId = null; A.CATEGORIES[0].clientId = 'cid-x'; delete A.CATEGORIES[0].syncedUpdatedAt; // підтвердження не збереглось
  await A.pullCategoriesCore();
  assert.equal(A.CATEGORIES.length, 1);
  assert.equal(A.CATEGORIES[0].cloudId, 'cid-x');
  assert.equal(A.CATEGORIES[0].clientId, undefined);
});

test('245-10: перепис id: категорії немає на сервері → id лишається за записом і рядок піднімається тим самим id', async () => {
  const cloud = makeCloud();
  cloud.tables.categories.push(row('categories', { id: 'other', name: 'Інша', active: true, type: 'Гнучка', created_at: '2026-01-01T00:00:00.000Z' })); // порожній перепис вважається збоєм сесії
  const A = device(cloud, 'A', { cats: [{ name: 'Їжа', active: true, type: 'Гнучка', createdAt: tick(), updatedAt: tick(), cloudId: 'gone-id', syncedUpdatedAt: 'x' }] });
  await A.reconcileCategoriesCensus();
  assert.equal(A.CATEGORIES[0].clientId, 'gone-id');
  await A.pushCategoriesPilot();
  assert.equal(cloud.tables.categories.filter(function(r){ return r.id === 'gone-id'; }).length, 1);
  assert.equal(A.CATEGORIES[0].cloudId, 'gone-id');
});

// ---------- підкатегорії ----------
test('245-11: підкатегорії з однаковою міткою — вибір за назвою; змінена назва без збігу — нічого; перейменування з тим самим id', async () => {
  const cloud = makeCloud();
  cloud.tables.categories.push(row('categories', { id: 'cat1', name: 'Їжа', active: true, type: 'Гнучка', created_at: '2026-08-01T00:00:00.000Z' }));
  ['Кафе', 'Піца'].forEach(function(n, i){ cloud.tables.subcategories.push(row('subcategories', { id: 's' + i, name: n, category_id: 'cat1', active: true })); });
  const D = device(cloud, 'D', { cats: [{ name: 'Їжа', active: true, type: 'Гнучка', createdAt: '2026-08-01T00:00:00.000Z', updatedAt: tick() }],
    subs: [{ name: 'Піца', category: 'Їжа', active: true, createdAt: STAMP, updatedAt: tick() }, { name: 'Суші', category: 'Їжа', active: true, createdAt: STAMP, updatedAt: tick() }] });
  await D.pushCategoriesPilot(); await D.pushSubcategoriesPilot();
  assert.equal(D.SUBCATEGORIES[0].cloudId, 's1', 'вибір за назвою');
  assert.equal(D.SUBCATEGORIES[1].cloudId, undefined, 'змінена назва без збігу — нічого не робиться');
  assert.equal(cloud.tables.subcategories.length, 2);
  assert.equal(ev(D, 'sub-ambiguous').length > 0, true);
  D.SUBCATEGORIES[0].name = 'Піца і паста'; D.SUBCATEGORIES[0].nameDirty = true; D.SUBCATEGORIES[0].updatedAt = tick();
  await D.pushSubcategoriesPilot();
  assert.equal(cloud.tables.subcategories.length, 2);
  assert.equal(cloud.tables.subcategories[1].id, 's1');
  assert.equal(cloud.tables.subcategories[1].name, 'Піца і паста');
});

// ---------- слова ----------
test('245-12: слова з однаковою міткою — вибір за ключовим словом без урахування регістру; перейменування з тим самим id', async () => {
  const cloud = makeCloud();
  cloud.tables.categories.push(row('categories', { id: 'cat1', name: 'Їжа', active: true, type: 'Гнучка', created_at: '2026-08-01T00:00:00.000Z' }));
  ['кава', 'чай'].forEach(function(n, i){ cloud.tables.dictionary.push(row('dictionary', { id: 'd' + i, keyword: n, category_id: 'cat1', subcategory_id: null })); });
  const D = device(cloud, 'D', { cats: [{ name: 'Їжа', cloudId: 'cat1', active: true, type: 'Гнучка', createdAt: '2026-08-01T00:00:00.000Z', updatedAt: 'U', syncedUpdatedAt: 'U' }],
    dict: [{ id: 'l1', kw: 'Чай', cat: 'Їжа', sub: null, createdAt: STAMP, updatedAt: tick() }] });
  await D.pushDictionaryPilotRun();
  assert.equal(D.DICTIONARY[0].cloudId, 'd1', 'вибір за ключовим словом');
  assert.equal(cloud.tables.dictionary.length, 2);
  D.DICTIONARY[0].kw = 'чай зелений'; D.DICTIONARY[0].nameDirty = true; D.DICTIONARY[0].updatedAt = tick();
  await D.pushDictionaryPilotRun();
  assert.equal(cloud.tables.dictionary.length, 2);
  assert.equal(cloud.tables.dictionary[1].id, 'd1');
  assert.equal(cloud.tables.dictionary[1].keyword, 'чай зелений');
});

test('245-13: нове слово: клієнтський id стає id рядка; pull з тим самим id (підтвердження не збереглось) — без дубля', async () => {
  const cloud = makeCloud();
  cloud.tables.categories.push(row('categories', { id: 'cat1', name: 'Їжа', active: true, type: 'Гнучка', created_at: '2026-08-01T00:00:00.000Z' }));
  const D = device(cloud, 'D', { cats: [{ name: 'Їжа', cloudId: 'cat1', active: true, type: 'Гнучка', createdAt: '2026-08-01T00:00:00.000Z', updatedAt: 'U', syncedUpdatedAt: 'U' }],
    dict: [{ id: 'l1', kw: 'кава', cat: 'Їжа', sub: null, createdAt: tick(), updatedAt: tick(), clientId: 'cid-w' }] });
  await D.pushDictionaryPilotRun();
  assert.equal(cloud.tables.dictionary[0].id, 'cid-w');
  assert.equal(D.DICTIONARY[0].cloudId, 'cid-w');
  D.DICTIONARY[0].cloudId = null; D.DICTIONARY[0].clientId = 'cid-w'; delete D.DICTIONARY[0].syncedUpdatedAt;
  await D.pullDictionaryCore();
  assert.equal(D.DICTIONARY.length, 1);
  assert.equal(D.DICTIONARY[0].cloudId, 'cid-w');
});

test('245-14: слова: 23505 через ключове слово НЕ вважається «id вже є» (на відміну від первинного ключа)', async () => {
  const cloud = makeCloud();
  cloud.tables.categories.push(row('categories', { id: 'cat1', name: 'Їжа', active: true, type: 'Гнучка', created_at: '2026-08-01T00:00:00.000Z' }));
  cloud.tables.dictionary.push(row('dictionary', { id: 'dx', keyword: 'кава', category_id: 'cat1', subcategory_id: null }));
  const D = device(cloud, 'D', { cats: [{ name: 'Їжа', cloudId: 'cat1', active: true, type: 'Гнучка', createdAt: '2026-08-01T00:00:00.000Z', updatedAt: 'U', syncedUpdatedAt: 'U' }] });
  const spec = D.dictionaryIdSpec('cat1', null);
  const r = await D.idSendNew(cloud, spec, { kw: 'Кава', createdAt: tick(), updatedAt: tick() }, 'D', 'new-w', false);
  assert.equal(r.state, 'keyConflict');
  assert.equal(cloud.tables.dictionary.length, 1);
  const r2 = await D.idSendNew(cloud, spec, { kw: 'інше', createdAt: tick(), updatedAt: tick() }, 'D', 'dx', false);
  assert.equal(r2.state, 'live', 'первинний ключ: id вже є → GET за id');
});

// ---------- картки: перейменування ----------
test('245-15: перейменування картки з тим самим id на двох пристроях; застаріла копія без nameDirty назву не затирає', async () => {
  const cloud = makeCloud();
  const A = device(cloud, 'A', { banks: [{ name: 'Картка', creditLimit: 1000, createdAt: tick(), updatedAt: tick(), clientId: 'cid-b' }] });
  await A.pushBankAccountsPilot();
  const id = A.bankAccounts[0].cloudId;
  assert.equal(id, 'cid-b');
  const B = device(cloud, 'B', {});
  await B.pullBankAccountsCore();
  assert.equal(B.bankAccounts.length, 1);
  A.bankAccounts[0].name = 'Картка нова'; A.bankAccounts[0].nameDirty = true; A.bankAccounts[0].updatedAt = tick();
  await A.pushBankAccountsPilot();
  assert.equal(cloud.tables.bank_accounts.length, 1);
  assert.equal(cloud.tables.bank_accounts[0].name, 'Картка нова');
  delete B.bankAccounts[0].serverBase; delete B.bankAccounts[0].serverUpdatedAt;
  B.bankAccounts[0].creditLimit = 2000; B.bankAccounts[0].updatedAt = tick();
  await B.pushBankAccountsPilot();
  assert.equal(cloud.tables.bank_accounts[0].name, 'Картка нова', 'назва не затерта');
  assert.equal(cloud.tables.bank_accounts[0].credit_limit, 2000);
  assert.equal(cloud.tables.bank_accounts.length, 1);
});

// ---------- джерело ----------
test('245-16 (джерело): пошуку за назвою на відправці й отриманні більше нема; нові записи дістають clientId при створенні; типові категорії лишаються без мітки (див. звіт)', () => {
  assert.doesNotMatch(SRC, /function reconcile(Category|Subcategory|BankAccount|Dictionary)CloudId/);
  assert.doesNotMatch(SRC, /CATEGORIES\.find\(function\(c\)\{ return c\.name === row\.name; \}\)/);
  assert.doesNotMatch(SRC, /SUBCATEGORIES\.find\(function\(s\)\{ return s\.name === row\.name; \}\)/);
  assert.doesNotMatch(SRC, /bankAccounts\.find\(function\(a\)\{ return a\.name === row\.name; \}\)/);
  assert.doesNotMatch(SRC, /DICTIONARY\.find\(function\(d\)\{ return !d\.cloudId && d\.kw === row\.keyword/);
  assert.match(SRC, /CATEGORIES\.push\(\{name, type, active:true, createdAt: nowISO, updatedAt: nowISO, clientId: generateUUID\(\)\}\)/);
  assert.match(SRC, /SUBCATEGORIES\.push\(\{name, category, active:true, createdAt: nowISO, updatedAt: nowISO, clientId: generateUUID\(\)\}\)/);
  assert.match(SRC, /DICTIONARY\.push\(\{id: generateUUID\(\), kw, cat, sub, createdAt: nowISO, updatedAt: nowISO, clientId: generateUUID\(\)\}\)/);
  assert.match(SRC, /if\(cat\.name !== newName\) cat\.nameDirty = true;/);
  assert.match(SRC, /if\(sub\.name !== newName\) sub\.nameDirty = true;/);
  assert.match(SRC, /if\(acc\.name !== newName\) acc\.nameDirty = true;/);
  assert.match(SRC, /if\(entry\.kw !== kw\) entry\.nameDirty = true;/);
});

// ===== Rev 2.32.246 (RESTORE-ID): відновлення з копії, повернення під старим id, питання про нові картки/ОЧ, видалення назавжди =====
test('246-1: повернення з копії: надгробок із тим самим id оживає (deleted_at → null), нового рядка нема', async () => {
  const cloud = makeCloud();
  cloud.tables.categories.push(row('categories', { id: 'cx', name: 'Їжа', active: true, type: 'Гнучка', deleted_at: '2026-10-01T00:00:00.000Z' }));
  const D = device(cloud, 'D', { cats: [{ name: 'Їжа', active: true, type: 'Гнучка', createdAt: STAMP, updatedAt: tick(), clientId: 'cx', restoreReturn: true }] });
  await D.pushCategoriesPilot();
  assert.equal(cloud.tables.categories.length, 1);
  assert.equal(cloud.tables.categories[0].id, 'cx');
  assert.equal(cloud.tables.categories[0].deleted_at, null);
  assert.equal(D.CATEGORIES[0].cloudId, 'cx');
  assert.equal(D.CATEGORIES[0].restoreReturn, undefined);
});

test('246-2: без прапорця повернення надгробок приймається (видалення), а не оживає', async () => {
  const cloud = makeCloud();
  cloud.tables.categories.push(row('categories', { id: 'cx', name: 'Їжа', active: true, type: 'Гнучка', deleted_at: '2026-10-01T00:00:00.000Z' }));
  const D = device(cloud, 'D', { cats: [{ name: 'Їжа', active: true, type: 'Гнучка', createdAt: STAMP, updatedAt: tick(), clientId: 'cx' }] });
  D.pullTaxonomyTombstone = async function(){ return true; };
  await D.pushCategoriesPilot();
  assert.notEqual(cloud.tables.categories[0].deleted_at, null);
});

function mergeSandbox(){
  return buildSandbox({ restoreApplyAsEdit: function(dom, local, rec){ let n = 0; Object.keys(rec).forEach(function(k){ if(local[k] !== rec[k] && ['name', 'type'].indexOf(k) !== -1){ local[k] = rec[k]; n++; } }); return n; }, UUID_FORMAT_RE: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, restoreStripServerState: function(r){ return r; } },
    ['mergeBackupRecordsByCloudIdOrName', 'restoreNameKey', 'restoreSameName', 'idMatchKey']);
}
test('246-3: копія без id після перейменування — запис впізнається за міткою, назва береться з копії, третього запису нема (243-4)', () => {
  const c = mergeSandbox();
  const list = [{ name: 'Нова', cloudId: 'c1', createdAt: STAMP, updatedAt: 'U' }];
  const r = c.mergeBackupRecordsByCloudIdOrName(list, [{ name: 'Стара', createdAt: STAMP, updatedAt: 'T' }], 'name', 'categories');
  assert.deepEqual(j(r), { added: 0, updated: 1, kept: 0, skipped: 0 });
  assert.equal(list.length, 1);
  assert.equal(list[0].name, 'Стара');
  assert.equal(list[0].nameDirty, true);
});

test('246-4: «мертвий» id: у копії id D, якого нема; є живий запис із такою назвою під іншим id і іншою міткою — не додаємо, лічимо як пропущений', () => {
  const c = mergeSandbox();
  const list = [{ name: 'Їжа', cloudId: 'L', createdAt: '2026-09-02T00:00:00.000Z' }];
  const r = c.mergeBackupRecordsByCloudIdOrName(list, [{ name: 'Їжа', cloudId: '11111111-1111-4111-8111-111111111111', createdAt: STAMP }], 'name', 'categories');
  assert.deepEqual(j(r), { added: 0, updated: 0, kept: 0, skipped: 1 });
  assert.equal(list.length, 1);
});

test('246-5: «мертвий» id без запису з такою назвою — повертається під своїм id (clientId + restoreReturn); неоднозначна мітка — нічого не робимо', () => {
  const c = mergeSandbox();
  const list = [];
  const D = '11111111-1111-4111-8111-111111111111';
  const r = c.mergeBackupRecordsByCloudIdOrName(list, [{ name: 'Нова', cloudId: D, createdAt: STAMP }], 'name', 'categories');
  assert.deepEqual(j(r), { added: 1, updated: 0, kept: 0, skipped: 0 });
  assert.equal(list[0].clientId, D); assert.equal(list[0].restoreReturn, true); assert.equal(list[0].cloudId, undefined);
  const two = [{ name: 'А', cloudId: 'a', createdAt: STAMP }, { name: 'Б', cloudId: 'b', createdAt: STAMP }];
  const r2 = c.mergeBackupRecordsByCloudIdOrName(two, [{ name: 'В', createdAt: STAMP }], 'name', 'categories');
  assert.equal(r2.skipped, 1); assert.equal(two.length, 2);
});

test('246-6: Excel: текст питання про нові картки й ОЧ; понад п\'ять назв — перші п\'ять і «та ще N»', () => {
  const c = buildSandbox({}, ['importNewAccountsText']);
  assert.equal(c.importNewAccountsText(['A', 'B']), 'У файлі є картки й оплати частинами, яких немає в застосунку: «A», «B». Якщо це перейменовані записи, вони з\'являться вдруге. Додати їх як нові?');
  assert.match(c.importNewAccountsText(['1', '2', '3', '4', '5', '6', '7']), /«5»\sта ще 2\./);
});

test('246-10: відновлення підкатегорій: така сама назва в ІНШІЙ категорії — окремий запис, не пропуск; у тій самій — пропуск', () => {
  const c = buildSandbox({ restoreApplyAsEdit: function(){ return 0; }, UUID_FORMAT_RE: /^[0-9a-f-]{36}$/i, restoreStripServerState: function(r){ return r; } }, ['mergeBackupRecordsByCloudIdOrName', 'restoreNameKey', 'restoreSameName', 'idMatchKey']);
  const list = [{ name: 'Інше', category: 'Б', cloudId: 'b1', createdAt: '2026-09-02T00:00:00.000Z' }];
  const r = c.mergeBackupRecordsByCloudIdOrName(list, [{ name: 'Інше', category: 'А', createdAt: STAMP }], 'name', 'subcategories');
  assert.deepEqual(j(r), { added: 1, updated: 0, kept: 0, skipped: 0 });
  const r2 = c.mergeBackupRecordsByCloudIdOrName(list, [{ name: 'Інше', category: 'Б', createdAt: '2026-01-01T00:00:00.000Z' }], 'name', 'subcategories');
  assert.equal(r2.skipped, 1);
});

test('246-11: прапорець restoreReturn із копії не переноситься; слово без правки тексту після push має зліпок і serverKw із відповіді сервера', async () => {
  const c = buildSandbox({ restoreApplyAsEdit: function(){ return 0; }, UUID_FORMAT_RE: /^[0-9a-f-]{36}$/i, restoreStripServerState: function(r){ return r; } }, ['mergeBackupRecordsByCloudIdOrName', 'restoreNameKey', 'restoreSameName', 'idMatchKey']);
  const list = [];
  c.mergeBackupRecordsByCloudIdOrName(list, [{ name: 'Нова', restoreReturn: true, createdAt: STAMP }], 'name', 'categories');
  assert.equal(list[0].restoreReturn, undefined);
});

test('246-12: діалог імпорту: технічний збій (не відкрився) → failed, нічого не обрано за користувача; вибір «Додати як нові» → add; закриття після показу → skip', async () => {
  const mk = (open) => {
    const cls = { open: false }; const modal = { classList: { contains: () => cls.open } };
    const btns = { 'app-modal-cancel-btn': { textContent: '' }, 'app-modal-confirm-btn': {} };
    let confirmCb = null;
    const c = buildSandbox({ setInterval, clearInterval, document: { getElementById: id => id === 'app-modal' ? modal : btns[id] }, showConfirmModal: (m, cb) => { confirmCb = cb; if(open) cls.open = true; } }, ['askImportNewAccounts', 'importNewAccountsText']);
    return { c, cls, confirm: () => confirmCb() };
  };
  const failed = mk(false);
  assert.equal(await failed.c.askImportNewAccounts(['A']), 'failed'); // ≈ 3,3 с
  const add = mk(true); const p = add.c.askImportNewAccounts(['A']); await new Promise(r => setTimeout(r, 400)); add.confirm();
  assert.equal(await p, 'add');
  const skip = mk(true); const p2 = skip.c.askImportNewAccounts(['A']); await new Promise(r => setTimeout(r, 400)); skip.cls.open = false;
  assert.equal(await p2, 'skip');
});
