// Rev 2.23.28 (6D.197, G3) — "пуш лише змінених" для карток і ОЧ: мок Cloud із семантикою тригера G0,
// каскад дітей (борги, витрати, hidden_entities) без "пуш усього".
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
      select(cols){ st.cols = cols; return api; },
      insert(p){ st.op = 'insert'; st.p = p; return api; },
      update(p){ st.op = 'update'; st.p = p; return api; },
      delete(){ st.op = 'delete'; return api; },
      upsert(p){ st.op = 'upsert'; st.p = p; return api; },
      eq(c, v){ st.f.push(function(r){ return r[c] === v; }); return api; },
      in(c, arr){ st.f.push(function(r){ return arr.indexOf(r[c]) !== -1; }); return api; },
      gte(c, v){ st.f.push(function(r){ return r[c] >= v; }); return api; },
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
      return { data: hit.map(function(r){ return Object.assign({}, r); }), error: null };
    }
    return api;
  }
  return { tables: tables, stats: stats, from: from };
}
const NAMES = ['LS_KEY_SYNC_MARKERS', 'loadSyncMarkers', 'getSyncMarker', 'setSyncMarker', 'applySyncMarker', 'updateSyncMarkerFromAllRows',
  'saveBankAccountsLocal', 'saveInstallmentAccountsLocal', 'pushBankAccountsPilot', 'reconcileBankAccountCloudId', 'pullBankAccountsCore',
  'pushInstallmentAccountsPilot', 'reconcileInstallmentAccountCloudId', 'pullInstallmentAccountsCore',
  'TEST_IGNORE_LS_KEY', 'isTestRecordName', 'syncNameOf', 'shouldIgnoreForSync', 'isTestHiddenKey', 'testIgnoreFlag', 'isTestSyncIgnored', 'syncableRecords', 'filterTestRows', 'isDirty', 'applyCensus', 'fetchCloudIdCensus', 'planCategoriesPush', 'planBankAccountsPush', 'planInstallmentAccountsPush',
  'reconcileBankAccountsCensus', 'reconcileInstallmentAccountsCensus', 'reconcileAccountsCensusFor', 'invalidateAccountChildren', 'cleanupOrphanedHiddenEntities',
  'pushHiddenEntitiesPilot', 'monthToDate', 'hideKey'];
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
async function seeded(){
  const cloud = makeCloud();
  const A = device(cloud, 'A', {
    banks: [{ name: 'Картка1', creditLimit: 1000, createdAt: tick(), updatedAt: tick() }, { name: 'Картка2', creditLimit: 2000, createdAt: tick(), updatedAt: tick() }],
    insts: [{ name: 'ОЧ1', initialAmount: 5000, dueDay: 5, createdAt: tick(), updatedAt: tick() }],
    debts: [{ kind: 'card', name: 'Картка1', syncedUpdatedAt: 'x', updatedAt: 'x' }, { kind: 'installment', name: 'ОЧ1', syncedUpdatedAt: 'x', updatedAt: 'x' }],
    expenses: [{ linkedInstallment: 'ОЧ1', syncedUpdatedAt: 'x', updatedAt: 'x' }, { syncedUpdatedAt: 'y', updatedAt: 'y' }],
  });
  await A.pushBankAccountsPilot(); await A.pushInstallmentAccountsPilot();
  // перше створення рахунків (cloudId null → новий) за дизайном інвалідує дітей; для тестів повертаємо їх у «синхронізовані»
  A.debts.forEach(function(d){ d.syncedUpdatedAt = 'x'; }); A.expenses.forEach(function(e, i){ e.syncedUpdatedAt = i === 0 ? 'x' : 'y'; });
  A.nameDomainChildren = 0; A.__events.length = 0;
  return { cloud: cloud, A: A };
}
const cnt = function(c){ return j({ u: c.stats.updates, i: c.stats.inserts }); };

test('G3-1: збереження без правок — 0 UPDATE/INSERT; push-dirty показує entries=0, children=0', async () => {
  const { cloud, A } = await seeded();
  const c0 = cnt(cloud), h0 = JSON.stringify(cloud.tables.bank_accounts.map(function(r){ return [r.id, r.updated_at]; }));
  await A.pushBankAccountsPilot(); await A.pushInstallmentAccountsPilot();
  assert.deepEqual(cnt(cloud), c0);
  assert.equal(JSON.stringify(cloud.tables.bank_accounts.map(function(r){ return [r.id, r.updated_at]; })), h0);
  const pd = A.__events.filter(function(e){ return e[0] === 'push-dirty'; }).slice(-2).map(function(e){ return [e[1].entries, e[1].skipped, e[1].children]; });
  assert.deepEqual(pd, [[0, 2, 0], [0, 1, 0]]);
});

test('G3-2: зміна ліміту картки — рівно один UPDATE; борги/витрати не чіпаються', async () => {
  const { cloud, A } = await seeded();
  const c0 = cnt(cloud);
  A.bankAccounts[0].creditLimit = 1500; A.bankAccounts[0].updatedAt = tick();
  await A.pushBankAccountsPilot();
  assert.equal(cloud.stats.updates.bank_accounts - c0.u.bank_accounts, 1);
  assert.equal(cloud.tables.bank_accounts[0].credit_limit, 1500);
  assert.ok(A.debts.every(function(d){ return d.syncedUpdatedAt === 'x'; }), 'каскад не спрацював без зміни cloudId');
  assert.ok(!cloud.stats.touched.includes('debts'));
});

test('G3-3: перейменування картки з боргами / зміна initial_amount і due_day ОЧ — по одному UPDATE, діти не чіпаються', async () => {
  const { cloud, A } = await seeded();
  const c0 = cnt(cloud);
  A.debts.forEach(function(d){ if(d.name === 'Картка1') d.name = 'Картка1-нова'; });
  A.bankAccounts[0].name = 'Картка1-нова'; A.bankAccounts[0].updatedAt = tick();
  A.installmentAccounts[0].initialAmount = 6000; A.installmentAccounts[0].dueDay = 12; A.installmentAccounts[0].updatedAt = tick();
  await A.pushBankAccountsPilot(); await A.pushInstallmentAccountsPilot();
  assert.equal(cloud.stats.updates.bank_accounts - c0.u.bank_accounts, 1);
  assert.equal(cloud.stats.updates.installment_accounts - c0.u.installment_accounts, 1);
  assert.equal(cloud.tables.bank_accounts[0].name, 'Картка1-нова');
  assert.equal(cloud.tables.installment_accounts[0].due_day, 12);
  assert.equal(A.expenses[0].syncedUpdatedAt, 'x');
});

test('G3-4: видалений у Cloud рахунок → перепис, повторне створення з новим id; приховані записи переходять на новий id, осиротілий рядок видалено; діти dirty', async () => {
  const { cloud, A } = await seeded();
  const oldId = A.bankAccounts[1].cloudId;
  // 'Картка2' прихована (стан синхронізований під старим id)
  A.hiddenFrom['card:Картка2'] = { month: '2026-10', updatedAt: tick(), syncedUpdatedAt: null };
  A.hiddenFrom['card:Картка2'].syncedUpdatedAt = A.hiddenFrom['card:Картка2'].updatedAt;
  cloud.tables.hidden_entities.push({ id: 'h0', family_id: 'fam', entity_type: 'bank', entity_id: oldId, hidden_from_month: '2026-10-01' });
  A.debts.push({ kind: 'card', name: 'Картка2', syncedUpdatedAt: 'x', updatedAt: 'x' });
  cloud.tables.bank_accounts.splice(1, 1); // Картка2 видалено в Cloud (діти в Cloud відсутні, FK не заважає)
  assert.deepEqual(j(await A.reconcileBankAccountsCensus()), { reset: 1, dropped: 0 });
  await A.pushBankAccountsPilot();
  await A.pushHiddenEntitiesPilot(); // останній крок syncNameDomainsOnConnect
  const newId = A.bankAccounts[1].cloudId;
  assert.ok(newId && newId !== oldId);
  assert.equal(cloud.tables.bank_accounts.filter(function(r){ return r.name === 'Картка2'; }).length, 1);
  assert.deepEqual(j(cloud.stats.hiddenDeletes), [[oldId]]);
  assert.deepEqual(j(cloud.tables.hidden_entities.map(function(r){ return r.entity_id; })), [newId]);
  assert.equal(A.debts[2].syncedUpdatedAt, undefined, 'борг Картка2 став dirty');
  assert.equal(A.debts[0].syncedUpdatedAt, 'x', 'борг Картка1 не чіпали');
  const pd = A.__events.filter(function(e){ return e[0] === 'push-dirty' && e[1].children !== undefined; }).pop();
  assert.equal(pd[1].entries, 1);
  assert.equal(A.nameDomainChildren >= 2, true); // борг + прихований запис (інвалідовано переписом)
});

test('зміна cloudId ОЧ робить dirty її борги, витрати з linkedInstallment і прихований запис', async () => {
  const { A } = await seeded();
  A.hiddenFrom['installment:ОЧ1'] = { month: '2026-10', updatedAt: 'u', syncedUpdatedAt: 'u' };
  const info = await A.invalidateAccountChildren('installment', ['ОЧ1']);
  assert.deepEqual(j(info), { count: 3, hiddenChanged: true });
  assert.equal(A.debts[1].syncedUpdatedAt, undefined);
  assert.equal(A.expenses[0].syncedUpdatedAt, undefined);
  assert.equal(A.expenses[1].syncedUpdatedAt, 'y');
  assert.equal(A.debts[0].syncedUpdatedAt, 'x', 'борг картки не чіпають при kind=installment');
  assert.equal(A.hiddenFrom['installment:ОЧ1'].syncedUpdatedAt, undefined);
});

test('pull byName з іншим cloudId: діти інвалідуються, осиротілий hidden-рядок видаляється (аналог знахідки G2)', async () => {
  const cloud = makeCloud();
  cloud.tables.bank_accounts.push({ id: 'new-id', family_id: 'fam', name: 'Картка1', credit_limit: 1000, created_at: 'c', updated_at: tick(), __ua: 0 });
  cloud.tables.hidden_entities.push({ id: 'h0', family_id: 'fam', entity_type: 'bank', entity_id: 'old-id' });
  const A = device(cloud, 'A', {
    banks: [{ name: 'Картка1', creditLimit: 1000, cloudId: 'old-id', updatedAt: 'U', syncedUpdatedAt: 'U' }],
    debts: [{ kind: 'card', name: 'Картка1', syncedUpdatedAt: 'x', updatedAt: 'x' }],
    hidden: { 'card:Картка1': { month: '2026-10', updatedAt: 'u', syncedUpdatedAt: 'u' } },
  });
  await A.pullBankAccountsCore();
  assert.equal(A.bankAccounts[0].cloudId, 'new-id');
  assert.equal(A.debts[0].syncedUpdatedAt, undefined);
  assert.equal(A.hiddenFrom['card:Картка1'].syncedUpdatedAt === undefined || A.hiddenFrom['card:Картка1'].syncedUpdatedAt === A.hiddenFrom['card:Картка1'].updatedAt, true);
  assert.deepEqual(j(cloud.stats.hiddenDeletes), [['old-id']]);
});

test('G3-5: застарілий пристрій без власних правок не затирає чужу зміну ліміту; несуміжне збереження не робить UPDATE', async () => {
  const { cloud, A } = await seeded();
  const B = device(cloud, 'B', {});
  await B.pullBankAccountsCore(); await B.pullInstallmentAccountsCore();
  assert.equal(B.bankAccounts.length, 2);
  A.bankAccounts[0].creditLimit = 9999; A.bankAccounts[0].updatedAt = tick();
  await A.pushBankAccountsPilot();
  B.bankAccounts.push({ name: 'Нова', creditLimit: 1, createdAt: tick(), updatedAt: tick() });
  const u0 = cloud.stats.updates.bank_accounts;
  await B.pushBankAccountsPilot();
  assert.equal(cloud.stats.updates.bank_accounts - u0, 0);
  assert.equal(cloud.tables.bank_accounts.find(function(r){ return r.name === 'Картка1'; }).credit_limit, 9999);
  assert.equal(B.bankAccounts.find(function(b){ return b.name === 'Картка1'; }).creditLimit, 9999, 'pull-after-push приніс зміну A');
});

test('restore з бекапу: змінений рахунок втрачає syncedUpdatedAt і пушиться', () => {
  const ctx = buildSandbox({}, ['mergeBackupRecordsByCloudIdOrName']);
  const local = [{ name: 'К', creditLimit: 1, updatedAt: '2026-01-01T00:00:00.000Z', cloudId: 'c1', syncedUpdatedAt: '2026-01-01T00:00:00.000Z' }];
  ctx.mergeBackupRecordsByCloudIdOrName(local, [{ name: 'К', creditLimit: 5, updatedAt: '2026-02-01T00:00:00.000Z', cloudId: 'c1', syncedUpdatedAt: '2026-02-01T00:00:00.000Z' }], 'name');
  assert.equal(local[0].creditLimit, 5); assert.equal(local[0].syncedUpdatedAt, undefined); assert.equal(local[0].cloudId, 'c1');
});
