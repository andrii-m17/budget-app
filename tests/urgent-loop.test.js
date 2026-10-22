// Rev 2.32.115 (URGENT-LOOP): цикл push ↔ pull. Реальні pull*Core / push*Pilot проти мока Cloud з серверним тригером set_updated_at_if_changed
// (updated_at клієнта ігнорується; без змін даних лишається старий; зі змінами = now() сервера).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildSandbox, evalInSandbox } = require('./extract');
const M = require('../dev/mock-cloud.js');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const BASE = 'https://x.supabase.co';
const j = v => JSON.parse(JSON.stringify(v));

// Клієнт supabase-js поверх мока: select/insert/update/upsert/delete, фільтри eq/gte/in/is/or, order/limit/range, maybeSingle/single.
function client(state, log){
  return { from(table){
    const params = new URLSearchParams(); let op = 'select', body = null, headers = {}, single = false, maybe = false, prefer = [];
    const api = {
      select(cols, o){ params.set('select', cols || '*'); if(o && o.count) prefer.push('count=' + o.count); if(op !== 'select') prefer.push('return=representation'); return api; },
      insert(b){ op = 'insert'; body = b; return api; }, update(b){ op = 'update'; body = b; return api; }, delete(){ op = 'delete'; return api; },
      upsert(b, o){ op = 'upsert'; body = b; prefer.push('resolution=merge-duplicates'); if(o && o.onConflict) params.set('on_conflict', o.onConflict); return api; },
      eq(c, v){ params.append(c, 'eq.' + v); return api; }, gte(c, v){ params.append(c, 'gte.' + v); return api; }, is(c, v){ params.append(c, 'is.' + (v === null ? 'null' : v)); return api; },
      in(c, arr){ params.append(c, 'in.(' + arr.join(',') + ')'); return api; }, or(e){ params.append('or', '(' + e + ')'); return api; },
      order(c, o){ const p = params.get('order'); params.set('order', (p ? p + ',' : '') + c + '.' + (o && o.ascending === false ? 'desc' : 'asc')); return api; },
      limit(n){ params.set('limit', String(n)); return api; }, range(a, b){ params.set('offset', String(a)); params.set('limit', String(b - a + 1)); return api; },
      single(){ single = true; return api; }, maybeSingle(){ maybe = true; return api; },
      then(res, rej){ return (async function(){
        const method = op === 'select' ? 'GET' : op === 'update' ? 'PATCH' : op === 'delete' ? 'DELETE' : 'POST';
        const h = Object.assign({ Prefer: prefer.join(',') }, headers); if(single || maybe) h.Accept = 'application/vnd.pgrst.object+json';
        log.push({ table, method });
        const r = await M.handle(state, BASE + '/rest/v1/' + table + '?' + params.toString(), { method, headers: h, body: body ? JSON.stringify(body) : undefined });
        const txt = await r.text(); let data = null; try{ data = txt ? JSON.parse(txt) : null; }catch(e){ data = null; }
        if(r.status >= 400){ if(maybe && r.status === 406) return { data: null, error: null }; return { data: null, error: data || { message: 'http ' + r.status } }; }
        const cr = r.headers.get('content-range'); const count = cr && /\/(\d+)$/.test(cr) ? +cr.split('/')[1] : null;
        return { data, error: null, count };
      })().then(res, rej); },
    };
    return api;
  } };
}
const NAMES = ['LS_KEY_SYNC_MARKERS', 'LS_KEY_SYNC_HEADS', 'SYNC_DELTA_OVERLAP_MS', 'PULL_PAGE_SIZE', 'PULL_MAX_PAGES', 'syncDeltaFrom', 'fetchDeltaRows', 'loadSyncMarkers', 'getSyncMarker', 'setSyncMarker', 'applySyncMarker', 'updateSyncMarkerFromAllRows', 'clearSyncMarkers',
  'saveBankAccountsLocal', 'saveInstallmentAccountsLocal', 'saveCategoriesLocal', 'pushBankAccountsPilot', 'reconcileBankAccountCloudId', 'paymentDayPayload', 'normalizePaymentDay', 'pullBankAccountsCore',
  'pushInstallmentAccountsPilot', 'reconcileInstallmentAccountCloudId', 'pullInstallmentAccountsCore', 'pushCategoriesPilot', 'reconcileCategoryCloudId', 'pullCategoriesCore',
  'isDirty', 'applyCensus', 'planCategoriesPush', 'planBankAccountsPush', 'planInstallmentAccountsPush', 'invalidateAccountChildren', 'cleanupOrphanedHiddenEntities',
  'monthToDate', 'hideKey', 'isCloudWriteReady', 'pushSubcategoriesPilot', 'reconcileSubcategoryCloudId', 'pullSubcategoriesCore', 'planSubcategoriesPush', 'isSubcategoryDirty', 'categoriesByNameMap', 'pushDictionaryPilot', 'pushDictionaryPilotRun', 'reconcileDictionaryCloudId', 'pullDictionaryCore', 'planDictionaryPush', 'dictionaryParentIds', 'markDictionarySynced', 'noteSyncCycle', 'syncCycleCounts', 'SYNC_CYCLE_LOG'];
function device(state, o){
  const store = {}; const log = []; const calls = { pull: 0, push: 0 }; const x = o || {};
  const ctx = buildSandbox({
    cloudSession: { user: { id: 'dev' } }, cloudFamilyId: state.familyId, isCloudSessionReady: () => true, isCloudWriteReady: () => true, isWriteBlocked: () => false, getSupabaseClient: () => client(state, log),
    bankAccounts: x.banks || [], installmentAccounts: x.insts || [], CATEGORIES: x.cats || [], SUBCATEGORIES: x.subs || [], DICTIONARY: x.dict || [], debts: [], expenses: [], hiddenFrom: {}, syncFullMode: false, dictionaryPushRunning: null, dictionaryPushQueued: null,
    nameDomainChildren: 0, isDomainMigrated: () => false, LS_KEY_BANKS: 'b', LS_KEY_INSTALLMENTS: 'i', LS_KEY_CATEGORIES: 'c', LS_KEY_SUBCATEGORIES: 's', LS_KEY_DICTIONARY: 'd',
    localStorage: { getItem: k => store[k] === undefined ? null : store[k], setItem: (k, v) => { store[k] = v; }, removeItem: k => { delete store[k]; } },
    populateBankDebtTable(){}, populateInstallmentTable(){}, renderStructure(){}, populateCategorySelect(){}, reportSaveResult(){}, captureDebugGeometry(){}, saveDebts: async () => ({ success: true }), saveExpenses: async () => ({ success: true }),
    saveHiddenFromLocal: async () => ({ success: true }), saveSubcategoriesLocal: async () => ({ success: true }), saveDictionaryLocal: async () => ({ success: true }), pullHiddenEntitiesCore: async () => ({ skipped: true }), pushHiddenEntitiesPilot: async () => ({ success: true }),
    pushOtherActorEvent(){}, rememberPurgedAccount(){}, Date,
  }, NAMES);
  // лічильники викликів (глобальні імена, на які посилаються самі функції)
  ['pull', 'push'].forEach(kind => ['BankAccounts', 'InstallmentAccounts', 'Categories', 'Subcategories', 'Dictionary'].forEach(t => {
    const name = kind === 'pull' ? 'pull' + t + 'Core' : (t === 'Dictionary' ? 'pushDictionaryPilotRun' : 'push' + t + 'Pilot'); const orig = ctx[name]; if(!orig) return;
    ctx[name] = function(){ calls[kind]++; if(calls[kind] > 200) throw new Error('цикл: понад 200 викликів ' + kind); return orig.apply(this, arguments); };
  }));
  ctx.__log = log; ctx.__calls = calls; ctx.__state = state;
  return ctx;
}
function server(){
  const st = M.createState(M.generateFixture('empty', { anchor: '2026-10-15', seed: 1 }));
  st.familyId = 'fam'; return st;
}
const quiet = ms => new Promise(r => setTimeout(r, ms));

test('мок: серверний тригер — оновлення без змін лишає старий updated_at (клієнтський ігнорується), зі змінами ставить now() сервера', async () => {
  const st = server(); const log = []; const c = client(st, log);
  st.tables.bank_accounts.push({ id: 'b1', family_id: 'fam', name: 'К1', credit_limit: 100, updated_at: '2026-10-01T10:00:00.000Z', deleted_at: null });
  await c.from('bank_accounts').update({ name: 'К1', credit_limit: 100, updated_at: '2030-01-01T00:00:00.000Z' }).eq('id', 'b1').select('id');
  assert.equal(st.tables.bank_accounts[0].updated_at, '2026-10-01T10:00:00.000Z', 'без змін: старий updated_at');
  await c.from('bank_accounts').update({ credit_limit: 200, updated_at: '2020-01-01T00:00:00.000Z' }).eq('id', 'b1').select('id');
  const after = st.tables.bank_accounts[0].updated_at;
  assert.notEqual(after, '2020-01-01T00:00:00.000Z', 'клієнтський час ігнорується');
  assert.notEqual(after, '2026-10-01T10:00:00.000Z', 'зі змінами: новий updated_at');
});
for(const T of [
  { name: 'bank_accounts', list: 'banks', g: 'bankAccounts', pull: 'pullBankAccountsCore', push: 'pushBankAccountsPilot', row: { credit_limit: 1000, payment_day: null }, mk: (cloudId, upd) => ({ name: 'К1', creditLimit: 1000, paymentDay: null, cloudId, createdAt: upd, updatedAt: upd, syncedUpdatedAt: upd }) },
  { name: 'installment_accounts', list: 'insts', g: 'installmentAccounts', pull: 'pullInstallmentAccountsCore', push: 'pushInstallmentAccountsPilot', row: { initial_amount: 5000, due_day: 5 }, mk: (cloudId, upd) => ({ name: 'ОЧ1', initialAmount: 5000, dueDay: 5, cloudId, createdAt: upd, updatedAt: upd, syncedUpdatedAt: upd }) },
  { name: 'categories', list: 'cats', g: 'CATEGORIES', pull: 'pullCategoriesCore', push: 'pushCategoriesPilot', row: { active: true, type: 'flexible' }, mk: (cloudId, upd) => ({ name: 'Кат1', active: true, type: 'flexible', cloudId, createdAt: upd, updatedAt: upd, syncedUpdatedAt: upd }) },
]){
  test(`URGENT-LOOP ${T.name}: «локальний новіший, але чистий» (інцидент) більше не дає циклу: ≤ 1 pull, 0 push, 0 PATCH; приймається серверний updated_at`, async () => {
    const st = server();
    const server0 = '2026-10-19T13:53:14.555Z';
    st.tables[T.name].push(Object.assign({ id: 'r1', family_id: 'fam', name: T.name === 'categories' ? 'Кат1' : (T.name === 'bank_accounts' ? 'К1' : 'ОЧ1'), created_at: server0, updated_at: server0, deleted_at: null }, T.row));
    const future = new Date(Date.now() + 3600e3).toISOString();
    const d = device(st, { [T.list]: [T.mk('r1', future)] });
    const rec = d[T.g][0];
    const nPatchBefore = d.__log.filter(l => l.method === 'PATCH').length;
    const r = await d[T.pull]();
    await quiet(60);
    assert.equal(d.__calls.push, 0, 'push не викликався');
    assert.ok(d.__calls.pull <= 1, 'pull ' + d.__calls.pull);
    assert.equal(d.__log.filter(l => l.method === 'PATCH').length, nPatchBefore, 'жодного запису на сервер');
    assert.equal(rec.updatedAt, server0, 'прийнято серверний updated_at'); assert.equal(rec.syncedUpdatedAt, server0, 'запис чистий');
    assert.equal(r.skipped, false);
  });
  test(`URGENT-LOOP ${T.name}: брудний і новіший → один push, потім один pull, без циклу; сервер лишається єдиним автором updated_at`, async () => {
    const st = server();
    const server0 = '2026-10-19T13:53:14.555Z';
    st.tables[T.name].push(Object.assign({ id: 'r1', family_id: 'fam', name: T.name === 'categories' ? 'Кат1' : (T.name === 'bank_accounts' ? 'К1' : 'ОЧ1'), created_at: server0, updated_at: server0, deleted_at: null }, T.row));
    const future = new Date(Date.now() + 3600e3).toISOString();
    const rec0 = T.mk('r1', server0); rec0.updatedAt = future; // брудний: syncedUpdatedAt ≠ updatedAt
    if(T.name === 'bank_accounts') rec0.creditLimit = 2000; else if(T.name === 'installment_accounts') rec0.initialAmount = 6000; else rec0.type = 'obligatory';
    const d = device(st, { [T.list]: [rec0] });
    await d[T.push](); await quiet(80);
    assert.ok(d.__calls.push <= 2 && d.__calls.pull <= 2, `push ${d.__calls.push}, pull ${d.__calls.pull}`);
    const srow = st.tables[T.name][0];
    assert.notEqual(srow.updated_at, future, 'клієнтський час сервер не прийняв');
    assert.equal(d[T.g][0].updatedAt, srow.updated_at, 'після pull локальний час = серверний');
    assert.equal(d[T.g][0].syncedUpdatedAt, srow.updated_at);
    const patches = d.__log.filter(l => l.method === 'PATCH').length;
    await d[T.pull](); await quiet(40);
    assert.equal(d.__log.filter(l => l.method === 'PATCH').length, patches, 'повторний pull нічого не пише');
  });
  test(`URGENT-LOOP ${T.name}: чистий push без змін не робить завершального pull`, async () => {
    const st = server(); const s0 = '2026-10-19T13:53:14.555Z';
    const d = device(st, { [T.list]: [T.mk(null, s0)] }); d[T.g][0].cloudId = null; delete d[T.g][0].syncedUpdatedAt; // новий: перший push створює рядок
    await d[T.push](); await quiet(40);
    const pullsAfterCreate = d.__calls.pull;
    await d[T.push](); await quiet(40);
    assert.equal(d.__calls.pull, pullsAfterCreate, 'другий push нічого не відправив → pull не викликався');
  });
}
test('URGENT-LOOP: джерело — у всіх 6 таблицях завершальний pull лише після реальної відправки; у 5 pull*Core push лише для «брудних»; лічильник циклів скрізь', () => {
  ['Categories', 'Subcategories', 'Dictionary', 'BankAccounts', 'InstallmentAccounts', 'HiddenEntities'].forEach(n => {
    assert.ok(SRC.includes('if(!anyError && localChanged) await pull' + n + 'Core();'), 'push→pull умовний: ' + n);
    assert.ok(!SRC.includes('if(!anyError) await pull' + n + 'Core();'), 'безумовного pull немає: ' + n);
    assert.match(SRC, new RegExp("noteSyncCycle\\('[a-z_]+', 'pull'\\);[\\s\\S]{0,3000}?"), 'лічильник pull: ' + n);
  });
  assert.equal((SRC.match(/localTime > cloudTime && (isDirty\(byCloudId\)|isSubcategoryDirty\(byCloudId, categoriesByNameMap\(\)\)|planDictionaryPush\(\[byCloudId\], null, dictionaryParentIds\)\.push\.length > 0)/g) || []).length, 5);
  assert.equal((SRC.match(/noteSyncCycle\('[a-z_]+', 'push'\)/g) || []).length, 6);
  assert.equal((SRC.match(/noteSyncCycle\('[a-z_]+', 'pull'\)/g) || []).length, 6);
});
test('лічильник циклів: pull/push за таблицею за останню хвилину; старі записи відсікаються; пам\'ять обмежена', () => {
  const c = buildSandbox({ Date }, ['SYNC_CYCLE_LOG', 'noteSyncCycle', 'syncCycleCounts']);
  c.noteSyncCycle('bank_accounts', 'pull'); c.noteSyncCycle('bank_accounts', 'pull'); c.noteSyncCycle('bank_accounts', 'push'); c.noteSyncCycle('categories', 'pull');
  assert.deepEqual(j(c.syncCycleCounts()), { bank_accounts: { pull: 2, push: 1 }, categories: { pull: 1, push: 0 } });
  for(let i = 0; i < 5000; i++) c.noteSyncCycle('bank_accounts', 'pull');
  assert.ok(evalInSandbox(c, 'SYNC_CYCLE_LOG.bank_accounts.pull.length') <= 1000, 'обмежено 1000');
  c.noteSyncCycle('x', 'невідомо'); // не падає
});
test('джерело: лічильник показується в «Запити до сервера» («Тестування»); нічого не обмежує', () => {
  assert.match(SRC, /Цикли синхронізації за хвилину/);
  const f = SRC.slice(SRC.indexOf('function noteSyncCycle'), SRC.indexOf('function syncCycleCounts'));
  assert.ok(!/return false|throw|setTimeout/.test(f), 'лише облік');
});

// ---- підкатегорії й словник: клас «брудний через батька» зберігається; «чистий і новіший» без циклу ----
const S0 = '2026-10-19T13:53:14.555Z';
function treeServer(){
  const st = server();
  st.tables.categories.push({ id: 'c1', family_id: 'fam', name: 'Кат1', active: true, type: 'flexible', created_at: S0, updated_at: S0, deleted_at: null });
  st.tables.subcategories.push({ id: 's1', family_id: 'fam', category_id: 'c1', name: 'Під1', active: true, deactivated_via: null, created_at: S0, updated_at: S0, deleted_at: null });
  st.tables.dictionary.push({ id: 'd1', family_id: 'fam', category_id: 'c1', subcategory_id: 's1', keyword: 'слово', created_at: S0, updated_at: S0, deleted_at: null, deleted_via: null });
  return st;
}
function treeDevice(st, future, over){
  const cat = { name: 'Кат1', active: true, type: 'flexible', cloudId: 'c1', createdAt: S0, updatedAt: S0, syncedUpdatedAt: S0 };
  const sub = Object.assign({ name: 'Під1', category: 'Кат1', active: true, cloudId: 's1', createdAt: S0, updatedAt: future, syncedUpdatedAt: future, syncedCategoryId: 'c1' }, (over && over.sub) || {});
  const dict = Object.assign({ kw: 'слово', cat: 'Кат1', sub: 'Під1', cloudId: 'd1', createdAt: S0, updatedAt: future, syncedUpdatedAt: future, syncedCategoryId: 'c1', syncedSubcategoryId: 's1' }, (over && over.dict) || {});
  return device(st, { cats: [cat], subs: [sub], dict: [dict] });
}
test('URGENT-LOOP subcategories: «локальний новіший, але чистий» без циклу, приймається серверний час', async () => {
  const st = treeServer(); const future = new Date(Date.now() + 3600e3).toISOString();
  const d = treeDevice(st, future);
  await d.pullSubcategoriesCore(); await quiet(60);
  assert.equal(d.__calls.push, 0); assert.ok(d.__calls.pull <= 1);
  assert.equal(d.SUBCATEGORIES[0].updatedAt, S0); assert.equal(d.SUBCATEGORIES[0].syncedUpdatedAt, S0);
  assert.equal(d.__log.filter(l => l.method === 'PATCH').length, 0);
});
test('URGENT-LOOP subcategories: чистий за часом, але батьківський cloudId змінився (syncedCategoryId ≠) → як раніше push (клас «брудний через батька» збережено), без циклу', async () => {
  const st = treeServer(); const future = new Date(Date.now() + 3600e3).toISOString();
  const d = treeDevice(st, future, { sub: { syncedCategoryId: 'старий-id' } });
  await d.pullSubcategoriesCore(); await quiet(120);
  assert.ok(d.__calls.push >= 1, 'push викликано');
  assert.ok(d.__calls.push <= 3 && d.__calls.pull <= 4, `без циклу: push ${d.__calls.push}, pull ${d.__calls.pull}`);
});
test('URGENT-LOOP dictionary: «локальний новіший, але чистий» без циклу; зміна батьківських id → push зберігається', async () => {
  const st = treeServer(); const future = new Date(Date.now() + 3600e3).toISOString();
  const d = treeDevice(st, future);
  await d.pullDictionaryCore(); await quiet(60);
  assert.equal(d.__calls.push, 0); assert.ok(d.__calls.pull <= 1);
  assert.equal(d.DICTIONARY[0].updatedAt, S0); assert.equal(d.DICTIONARY[0].syncedUpdatedAt, S0);
  const st2 = treeServer();
  const d2 = treeDevice(st2, future, { dict: { syncedSubcategoryId: 'інший' } });
  await d2.pullDictionaryCore(); await quiet(120);
  assert.ok(d2.__calls.push >= 1 && d2.__calls.push <= 3 && d2.__calls.pull <= 4, `push ${d2.__calls.push}, pull ${d2.__calls.pull}`);
});
test('два пристрої (bank_accounts): A змінює й пушить, B підтягує; B змінює, A підтягує; обидва сходяться на серверному updated_at, без зайвих запитів', async () => {
  const st = server();
  const A = device(st, { banks: [{ name: 'К1', creditLimit: 1000, paymentDay: null, createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z' }] });
  await A.pushBankAccountsPilot(); await quiet(60);
  const srv = () => st.tables.bank_accounts[0];
  assert.equal(A.bankAccounts[0].updatedAt, srv().updated_at, 'A після створення: серверний час');
  const B = device(st, {}); await B.pullBankAccountsCore(); await quiet(40);
  assert.equal(B.bankAccounts.length, 1); assert.equal(B.bankAccounts[0].updatedAt, srv().updated_at);
  B.bankAccounts[0].creditLimit = 5000; B.bankAccounts[0].updatedAt = new Date(Date.now() + 5000).toISOString(); // годинник B попереду
  await B.pushBankAccountsPilot(); await quiet(80);
  assert.equal(srv().credit_limit, 5000); assert.equal(B.bankAccounts[0].updatedAt, srv().updated_at, 'B: серверний час, не власний');
  const getsBefore = A.__log.length;
  await A.pullBankAccountsCore(); await quiet(60);
  assert.equal(A.bankAccounts[0].creditLimit, 5000); assert.equal(A.bankAccounts[0].updatedAt, srv().updated_at);
  assert.ok(A.__calls.push === 1 && A.__calls.pull <= 3, `A: push ${A.__calls.push}, pull ${A.__calls.pull}`);
  assert.ok(A.__log.length - getsBefore <= 2, 'один pull, без push');
  assert.ok(B.__calls.pull <= 3 && B.__calls.push <= 1, `B: push ${B.__calls.push}, pull ${B.__calls.pull}`);
});
test('видалення (tombstone) картки з іншого пристрою: pull без циклу', async () => {
  const st = server();
  st.tables.bank_accounts.push({ id: 'r1', family_id: 'fam', name: 'К1', credit_limit: 1, payment_day: null, created_at: S0, updated_at: S0, deleted_at: S0 });
  const d = device(st, { banks: [{ name: 'К1', creditLimit: 1, paymentDay: null, cloudId: 'r1', createdAt: S0, updatedAt: S0, syncedUpdatedAt: S0 }] });
  let removed = 0; d.pullAccountTombstone = async () => { removed++; return true; };
  const r = await d.pullBankAccountsCore(); await quiet(40);
  assert.equal(r.skipped, false); assert.equal(removed, 1); assert.equal(d.__calls.push, 0); assert.ok(d.__calls.pull <= 1);
});
