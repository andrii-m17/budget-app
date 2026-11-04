// Дослідження 243 — перейменування/правка ОЧ не повинні створювати другий рядок у хмарі. Мок хмари й пристрій — з accounts-dirty.test.js. Синтетичні дані.
// Тести з {todo} описують ОЧІКУВАНУ поведінку (ідентичність лише за id) і падають на поточному коді; решта фіксують поточну поведінку.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildSandbox } = require('./extract');

const j = function(v){ return JSON.parse(JSON.stringify(v)); };
let clock = Date.parse('2026-10-07T10:00:00.000Z');
const tick = function(sec){ clock += (sec || 1) * 1000; return new Date(clock).toISOString(); };

function makeCloud(){
  const tables = { bank_accounts: [], installment_accounts: [], hidden_entities: [] };
  const stats = { updates: { bank_accounts: 0, installment_accounts: 0 }, inserts: { bank_accounts: 0, installment_accounts: 0 }, hiddenDeletes: [], touched: [] };
  let seq = 0;
  const SERVICE = { updated_at: 1, updated_by: 1, created_at: 1, created_by: 1, __ua: 1 };
  function from(table){
    if(!tables[table]) throw new Error('несподівана таблиця ' + table);
    stats.touched.push(table);
    const rows = tables[table];
    const st = { op: 'select', f: [] };
    const api = {
      select(cols, o){ st.cols = cols; st.count = !!(o && o.count); return api; },
      limit(){ return api; }, or(){ return api; },
      insert(p){ st.op = 'insert'; st.p = p; return api; },
      update(p){ st.op = 'update'; st.p = p; return api; },
      delete(){ st.op = 'delete'; return api; },
      upsert(p){ st.op = 'upsert'; st.p = p; return api; },
      eq(c, v){ st.f.push(function(r){ return r[c] === v; }); return api; },
      in(c, arr){ st.f.push(function(r){ return arr.indexOf(r[c]) !== -1; }); return api; },
      gte(c, v){ st.f.push(function(r){ return r[c] >= v; }); return api; },
      is(c, v){ st.f.push(function(r){ return (r[c] == null ? null : r[c]) === v; }); return api; }, // Rev 2.32.4 (T2)
      order(){ return api; }, range(a, b){ st.range = [a, b]; return api; },
      single(){ return api; }, maybeSingle(){ st.maybe = true; return api; },
      then(res, rej){ return run().then(res, rej); },
    };
    async function run(){
      await Promise.resolve();
      const hit = rows.filter(function(r){ return st.f.every(function(f){ return f(r); }); });
      if(st.op === 'update'){
        stats.updates[table]++;
        hit.forEach(function(r){
          const changed = Object.keys(st.p).some(function(k){ return !SERVICE[k] && JSON.stringify(r[k] === undefined ? null : r[k]) !== JSON.stringify(st.p[k] === undefined ? null : st.p[k]); });
          Object.assign(r, st.p); r.updated_at = changed ? tick() : r.__ua; r.__ua = r.updated_at;
        });
        return { data: hit.map(function(r){ return { id: r.id }; }), error: null };
      }
      if(st.op === 'insert'){
        if(st.p && st.p.id && rows.some(function(r){ return r.id === st.p.id; })) return { data: null, error: { code: '23505', message: 'duplicate key' } }; // Rev 2.32.242: як первинний ключ на сервері
        stats.inserts[table]++;
        const r = Object.assign({ id: table[0] + (++seq) }, st.p, { updated_at: tick() }); r.__ua = r.updated_at; rows.push(r);
        return { data: { id: r.id }, error: null };
      }
      if(st.op === 'delete'){
        hit.forEach(function(r){ rows.splice(rows.indexOf(r), 1); });
        stats.hiddenDeletes.push(hit.map(function(r){ return r.entity_id; }));
        return { data: null, error: null };
      }
      if(st.op === 'upsert'){
        const ex = rows.find(function(r){ return r.entity_type === st.p.entity_type && r.entity_id === st.p.entity_id; });
        if(ex) Object.assign(ex, st.p); else rows.push(Object.assign({ id: 'h' + (++seq) }, st.p));
        return { data: null, error: null };
      }
      if(st.cols === 'id' && st.range) return { data: hit.slice(st.range[0], st.range[1] + 1).map(function(r){ return { id: r.id }; }), error: null };
      if(st.maybe) return { data: hit[0] ? Object.assign({}, hit[0]) : null, error: null };
      return { data: hit.map(function(r){ return Object.assign({}, r); }), error: null, count: st.count ? hit.length : undefined };
    }
    return api;
  }
  return { tables: tables, stats: stats, from: from };
}
const NAMES = ['fetchDeltaRows', 'PULL_PAGE_SIZE', 'PULL_MAX_PAGES', 'fetchFullReconcileRows', 'mergeBackupRecordsByCloudIdOrName', 'restoreNameKey', 'restoreSameName', 'restoreStripServerState', 'importEnsureAccounts', 'purgeAccountPlan', 'monthStartISO', 'LS_KEY_SYNC_MARKERS', 'LS_KEY_SYNC_HEADS', 'SYNC_DELTA_OVERLAP_MS', 'syncDeltaFrom', 'loadSyncMarkers', 'getSyncMarker', 'setSyncMarker', 'applySyncMarker', 'updateSyncMarkerFromAllRows',
  'saveBankAccountsLocal', 'saveInstallmentAccountsLocal', 'pushBankAccountsPilot', 'bankIdSpec', 'idPushPlain', 'paymentDayPayload', 'normalizePaymentDay', 'pullBankAccountsCore',
  'pushInstallmentAccountsPilot', 'installmentIdSpec', 'idOf', 'idEnsureClientId', 'idMatchKey', 'idMigrateUnlinked', 'idMigrateUnlinkedOnce', 'ID_MIGRATE_LAST', 'ID_AMBIGUOUS', 'idSendNew', 'generateUUID', 'pullAccountTombstone', 'ochModelDiffers', 'applyOchModelFromRow', 'pullInstallmentAccountsCore', 'rekeyHiddenFrom',
  'isDirty', 'applyCensus', 'fetchCloudIdCensus', 'planCategoriesPush', 'planBankAccountsPush', 'planInstallmentAccountsPush',
  'reconcileBankAccountsCensus', 'reconcileInstallmentAccountsCensus', 'reconcileAccountsCensusFor', 'invalidateAccountChildren', 'cleanupOrphanedHiddenEntities',
  'pushHiddenEntitiesPilot', 'monthToDate', 'hideKey', 'hideKeyLegacy', 'hideKeyForAccount', 'hasIdHideKey', 'findAccountMonthDebt', 'accountsOfKind', 'hiddenEntryKey', 'hiddenEntryFor'];
function device(cloud, name, o){
  const store = {}; const events = []; const x = o || {};
  const ctx = buildSandbox({
    cloudSession: { user: { id: name } }, cloudFamilyId: 'fam', isCloudSessionReady: function(){ return true; }, getSupabaseClient: function(){ return cloud; },
    bankAccounts: x.banks || [], installmentAccounts: x.insts || [], debts: x.debts || [], expenses: x.expenses || [], hiddenFrom: x.hidden || {},
    nameDomainChildren: 0, isDomainMigrated: function(){ return false; },
    LS_KEY_BANKS: 'b', LS_KEY_INSTALLMENTS: 'i',
    localStorage: { getItem: function(k){ return store[k] === undefined ? null : store[k]; }, setItem: function(k, v){ store[k] = v; }, removeItem: function(k){ delete store[k]; } },
    populateBankDebtTable: function(){}, populateInstallmentTable: function(){},
    saveDebts: async function(){ return { success: true }; }, saveExpenses: async function(){ return { success: true }; }, saveHiddenFromLocal: async function(){ return { success: true }; },
    pullHiddenEntitiesCore: async function(){ return { skipped: true }; }, reportSaveResult: function(){},
    captureDebugGeometry: function(t, e){ events.push([t, e]); },
  }, NAMES);
  ctx.__events = events;
  return ctx;
}

const rows = function(cloud){ return cloud.tables.installment_accounts; };
const live = function(cloud){ return rows(cloud).filter(function(r){ return !r.deleted_at; }); };
async function synced(){
  const cloud = makeCloud();
  const A = device(cloud, 'A', { insts: [{ name: 'Предмет А', initialAmount: 5000, dueDay: 5, createdAt: '2026-09-01T10:00:00.000Z', updatedAt: tick() }] });
  await A.pushInstallmentAccountsPilot();
  return { cloud: cloud, A: A };
}
function rename(A, n, to){ A.installmentAccounts[n].name = to; A.installmentAccounts[n].nameDirty = true; A.installmentAccounts[n].updatedAt = tick(); } // як saveInstallmentDrawer

test('243-1 (контроль): створити, синхронізувати, перейменувати, синхронізувати — один рядок із тим самим id', async () => {
  const { cloud, A } = await synced();
  const id = A.installmentAccounts[0].cloudId;
  rename(A, 0, 'Предмет Б');
  await A.pushInstallmentAccountsPilot();
  assert.equal(live(cloud).length, 1);
  assert.equal(live(cloud)[0].id, id);
  assert.equal(live(cloud)[0].name, 'Предмет Б');
});

test('243-2: cloudId на пристрої втрачено після вставки (збереження не встигло), перейменування, push — лишається один рядок (id збережено до мережі)', async () => {
  const { cloud, A } = await synced();
  const id = A.installmentAccounts[0].cloudId;
  A.installmentAccounts[0].cloudId = null; A.installmentAccounts[0].clientId = id; delete A.installmentAccounts[0].syncedUpdatedAt; // id видано й збережено до вставки; підтвердження не збереглось
  rename(A, 0, 'Предмет Б');
  await A.pushInstallmentAccountsPilot();
  assert.equal(live(cloud)[0].id, id);
  assert.equal(live(cloud)[0].name, 'Предмет Б');
  assert.equal(live(cloud).length, 1, 'очікується один рядок; зараз ' + live(cloud).length + ' (' + live(cloud).map(function(r){ return r.name; }).join(' / ') + ')');
});

test('243-2b: запис без жодного id (старі дані) зіставляється за created_at і сумою, а не за назвою — навіть після перейменування', async () => {
  const { cloud, A } = await synced();
  const id = A.installmentAccounts[0].cloudId;
  A.installmentAccounts[0].cloudId = null; delete A.installmentAccounts[0].syncedUpdatedAt; // як до Rev 244: id на пристрої нема
  rename(A, 0, 'Предмет Б');
  await A.pushInstallmentAccountsPilot();
  assert.equal(live(cloud).length, 1);
  assert.equal(A.installmentAccounts[0].cloudId, id);
  assert.equal(live(cloud)[0].name, 'Предмет Б');
});

test('243-2c: міграція, пара дублів (два кандидати з однаковими created_at і сумою) — нічого не чіпається й не вставляється, лише подія без назв', async () => {
  const { cloud, A } = await synced();
  const r0 = rows(cloud)[0];
  rows(cloud).push(Object.assign({}, r0, { id: 'dup2', name: 'Предмет Б' })); // другий живий рядок із тим самим created_at і сумою
  const B = device(cloud, 'B', { insts: [{ name: 'Предмет В', initialAmount: 5000, createdAt: r0.created_at, updatedAt: tick() }] });
  await B.pushInstallmentAccountsPilot();
  assert.equal(rows(cloud).length, 2, 'insert не робився');
  assert.equal(B.installmentAccounts[0].cloudId, undefined);
  assert.equal(B.installmentAccounts[0].clientId, undefined, 'запис лишається локальним');
  const ev = B.__events.filter(function(e){ return e[0] === 'och-ambiguous'; });
  assert.equal(ev.length > 0, true);
  assert.equal(JSON.stringify(ev), JSON.stringify([['och-ambiguous', { ambiguous: 1 }]].concat(ev.slice(1))), 'подія без назв');
});

test('243-2d: міграція, рівно один кандидат — зв\'язати; нуль кандидатів — новий рядок з клієнтським id', async () => {
  const { cloud, A } = await synced();
  const r0 = rows(cloud)[0];
  const B = device(cloud, 'B', { insts: [
    { name: 'Предмет Б', initialAmount: 5000, createdAt: r0.created_at, updatedAt: tick() },
    { name: 'Предмет Г', initialAmount: 777, createdAt: '2026-10-02T10:00:00.000Z', updatedAt: tick() },
  ] });
  await B.pushInstallmentAccountsPilot();
  assert.equal(B.installmentAccounts[0].cloudId, A.installmentAccounts[0].cloudId);
  assert.equal(rows(cloud).length, 2);
  assert.equal(B.installmentAccounts[1].cloudId, rows(cloud)[1].id, 'id рядка = id, виданий клієнтом');
});

test('243-2e: помилка запиту (не «не знайдено») не дає insert; пошук кількох збігів теж', async () => {
  const { cloud, A } = await synced();
  const orig = cloud.from;
  cloud.from = function(t){ const api = orig(t); if(t === 'installment_accounts'){ const ins = api.insert; api.insert = function(){ const r = ins.apply(api, arguments); r.then = function(res){ return Promise.resolve({ data: null, error: { code: '57014', message: 'timeout' } }).then(res); }; return r; }; } return api; };
  A.installmentAccounts.push({ name: 'Нова', initialAmount: 1, createdAt: tick(), updatedAt: tick(), clientId: 'cid-1' });
  const before = rows(cloud).length;
  const res = await A.pushInstallmentAccountsPilot();
  assert.equal(res.success, false);
  assert.equal(rows(cloud).length, before, 'insert не вдався і не повторювався за назвою');
  assert.equal(A.installmentAccounts[1].cloudId, undefined);
  assert.equal(A.installmentAccounts[1].clientId, 'cid-1', 'id збережено для наступної спроби');
});

test('243-3: серверний надгробок — видалення приймається, нового рядка поруч не створюється', async () => {
  const { cloud, A } = await synced();
  rows(cloud)[0].deleted_at = tick(); // видалено на іншому пристрої
  A.installmentAccounts[0].initialAmount = 5001; A.installmentAccounts[0].updatedAt = tick();
  A.applyAccountRemovalLocally = async function(){}; A.purgeAccountPlan = function(){ return {}; }; A.trashStateNow = function(){ return {}; }; A.rememberPurgedAccount = function(){};
  await A.pushInstallmentAccountsPilot();
  assert.equal(rows(cloud).length, 1, 'другого рядка нема');
  assert.equal(live(cloud).length, 0);
});

test('243-4: відновлення з копії, зробленої до першої синхронізації, після перейменування — не має додавати третій запис зі старою назвою', async () => {
  const { cloud, A } = await synced();
  rename(A, 0, 'Предмет Б');
  await A.pushInstallmentAccountsPilot();
  const backup = [{ name: 'Предмет А', initialAmount: 5000, dueDay: 5, createdAt: '2026-09-01T10:00:00.000Z', updatedAt: '2026-09-01T10:00:00.000Z' }]; // без cloudId
  const counts = A.mergeBackupRecordsByCloudIdOrName(A.installmentAccounts, backup, 'name', 'installmentAccounts');
  await A.pushInstallmentAccountsPilot();
  assert.equal(counts.added, 0, 'запис копії мав би впізнатись як той самий');
  assert.equal(live(cloud).length, 1);
});

test('243-5 (характеристика): повторний Excel-імпорт зі старою назвою додає нову ОЧ без питання', function(){
  const { buildSandbox: bs } = require('./extract');
  const c = bs({}, ['importEnsureAccounts', 'monthStartISO']);
  const list = [{ name: 'Предмет Б', cloudId: 'i1' }];
  const r = c.importEnsureAccounts([{ kind: 'installment', name: 'Предмет А', month: '2026-09' }], [], list, '2026-11-01T00:00:00Z');
  assert.equal(r.addedInstallments, 1);
  assert.equal(list.length, 2);
});

test('243-6: пристрій B має ту саму ОЧ без cloudId (та сама дата створення), перейменував до першого pull → push не створює другий рядок', async () => {
  const { cloud } = await synced(); // A уже вставив рядок «Предмет А»
  const B = device(cloud, 'B', { insts: [{ name: 'Предмет А', initialAmount: 5000, dueDay: 5, createdAt: '2026-09-01T10:00:00.000Z', updatedAt: tick() }] });
  rename(B, 0, 'Предмет Б');
  await B.pullInstallmentAccountsCore();
  await B.pushInstallmentAccountsPilot();
  assert.equal(live(cloud).length, 1, 'очікується один рядок; зараз ' + live(cloud).length + ' (' + live(cloud).map(function(r){ return r.name; }).join(' / ') + ')');
});

test('243-7: пристрій без серверного зліпка (після відновлення) правкою суми не повертає стару назву на сервер', async () => {
  const { cloud, A } = await synced();
  const B = device(cloud, 'B', { insts: [A.restoreStripServerState(Object.assign({}, A.installmentAccounts[0]))] }); // як після відновлення з копії
  B.installmentAccounts[0].syncedUpdatedAt = B.installmentAccounts[0].updatedAt;
  rename(A, 0, 'Предмет Б'); await A.pushInstallmentAccountsPilot(); // A перейменував
  B.installmentAccounts[0].initialAmount = 5001; B.installmentAccounts[0].updatedAt = tick(); // B (стара назва) правив суму
  await B.pushInstallmentAccountsPilot();
  assert.equal(live(cloud)[0].name, 'Предмет Б', 'назва із сервера не затирається чужою застарілою копією');
  assert.equal(live(cloud)[0].initial_amount, 5001);
});

test('244-1: перепис id (keepId): рядка нема на сервері → id лишається за записом і рядок піднімається тим самим id', async () => {
  const { cloud, A } = await synced();
  const id = A.installmentAccounts[0].cloudId;
  cloud.tables.installment_accounts.splice(0, 1);
  cloud.tables.installment_accounts.push({ id: 'other', family_id: 'fam', name: 'Інша', initial_amount: 1, created_at: '2026-01-01T00:00:00.000Z', updated_at: tick() }); // порожній перепис вважається збоєм сесії
  await A.reconcileInstallmentAccountsCensus();
  assert.equal(A.installmentAccounts[0].cloudId, null);
  assert.equal(A.installmentAccounts[0].clientId, id);
  await A.pushInstallmentAccountsPilot();
  assert.equal(live(cloud).filter(function(r){ return r.name === 'Предмет А'; }).length, 1);
  assert.equal(live(cloud).filter(function(r){ return r.id === id; }).length, 1);
});

test('244-2: pull: рядок із id, що збігається з clientId запису (вставка дійшла, підтвердження не збереглось), зв\'язується без дубля', async () => {
  const { cloud, A } = await synced();
  const id = A.installmentAccounts[0].cloudId;
  A.installmentAccounts[0].cloudId = null; A.installmentAccounts[0].clientId = id; delete A.installmentAccounts[0].syncedUpdatedAt;
  await A.pullInstallmentAccountsCore();
  assert.equal(A.installmentAccounts.length, 1);
  assert.equal(A.installmentAccounts[0].cloudId, id);
  assert.equal(A.installmentAccounts[0].clientId, undefined);
});

test('244-3: неоднозначні записи не вантажать таблицю повторно в тому ж сеансі', async () => {
  const { cloud, A } = await synced();
  const r0 = rows(cloud)[0];
  rows(cloud).push(Object.assign({}, r0, { id: 'dup2' }));
  const B = device(cloud, 'B', { insts: [{ name: 'Предмет В', initialAmount: 5000, createdAt: r0.created_at, updatedAt: tick() }] });
  await B.pushInstallmentAccountsPilot();
  const t0 = cloud.stats.touched.length;
  await B.pushInstallmentAccountsPilot();
  assert.equal(cloud.stats.touched.length, t0, 'другий прохід не робить запитів');
});

test('244-4: міграція, один кандидат-надгробок — прив\'язати й прийняти видалення, нового рядка нема', async () => {
  const { cloud, A } = await synced();
  const r0 = rows(cloud)[0];
  r0.deleted_at = tick(); // видалено на сервері
  const B = device(cloud, 'B', { insts: [{ name: 'Предмет Б', initialAmount: 5000, createdAt: r0.created_at, updatedAt: tick() }] });
  const removed = [];
  B.pullAccountTombstone = async function(kind, row){ removed.push([kind, row.id]); B.installmentAccounts.splice(0, 1); return true; }; // як applyAccountRemovalLocally: запис іде в кошик
  await B.pushInstallmentAccountsPilot();
  assert.equal(rows(cloud).length, 1, 'нового рядка нема');
  assert.equal(live(cloud).length, 0);
  assert.deepEqual(JSON.parse(JSON.stringify(removed)), [['installment', r0.id]]);
});

test('244-5: міграція, надгробок і живий рядок з однаковим ключем — два кандидати, нічого не чіпається', async () => {
  const { cloud } = await synced();
  const r0 = rows(cloud)[0];
  rows(cloud).push(Object.assign({}, r0, { id: 'dead1', deleted_at: tick() }));
  const B = device(cloud, 'B', { insts: [{ name: 'Предмет Б', initialAmount: 5000, createdAt: r0.created_at, updatedAt: tick() }] });
  await B.pushInstallmentAccountsPilot();
  assert.equal(rows(cloud).length, 2);
  assert.equal(B.installmentAccounts[0].cloudId, undefined);
});
