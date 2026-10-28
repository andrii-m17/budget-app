// Rev 2.32.100 (PAGING-1 Rev B, доробка за spec-reviewer): інтеграція runSyncCheck з повною звіркою, мітка не назад, pullOnce.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildSandbox } = require('./extract');
const j = v => JSON.parse(JSON.stringify(v));

const NAMES = ['SYNC_TABLE_ORDER', 'SYNC_DEPENDENTS', 'SYNC_FULL_INTERVAL_MS', 'emptySyncSeen', 'purgedAtValue', 'purgedAtChanged', 'normalizeSyncSeen', 'syncHeadsComplete', 'planSync', 'applySyncResult',
  'PULL_DOMAINS', 'pullOnce', 'pullTableForSync', 'runSyncPulls', 'nameDomainsHaveDirty', 'runSyncCheck'];
function make(over){
  const calls = [];
  const stub = name => function(o){ calls.push({ name, full: !!(o && o.full) }); return Promise.resolve(stubState.results[name] || { added: 0, updated: 0 }); };
  const stubState = { results: {} };
  const heads = { tables: {}, members_hash: 'm', family_hash: 'f', unread_notifications: 0, mono_new: 0, purged_at: null };
  ['bank_accounts', 'categories', 'debts', 'dictionary', 'expenses', 'hidden_entities', 'incomes', 'installment_accounts', 'subcategories'].forEach(t => heads.tables[t] = '2026-10-01T00:00:00+00:00');
  const g = Object.assign({
    calls, stubState, heads, autoSyncCalls: [], saved: [], syncDirtySetBy: null,
    cloudFamilyId: 'fam', pullInFlightByDomain: {}, syncSeenState: null, syncLastCheckAt: 0, syncCheckInFlight: null,
    pullCategoriesCore: stub('categories'), pullSubcategoriesCore: stub('subcategories'), pullDictionaryCore: stub('dictionary'), pullBankAccountsCore: stub('bank_accounts'),
    pullInstallmentAccountsCore: stub('installment_accounts'), pullHiddenEntitiesCore: stub('hidden_entities'), pullExpensesCore: stub('expenses'), pullIncomesCore: stub('incomes'), pullDebtsCore: stub('debts'),
    fetchSyncHeadsShared: async () => JSON.parse(JSON.stringify(heads)), loadSyncSeen: () => g.emptySeen(), saveSyncSeen: s => g.saved.push(JSON.parse(JSON.stringify(s))),
    applyHeadsCounters: () => {}, syncDiag: () => {}, refreshSyncProfiles: async () => true, syncNameDomainsOnConnect: async () => {}, nameDomainDirtyBreakdown: () => ({}), refreshAfterSyncAtStart: () => {},
    flushOtherActorEventsAsToasts: () => {}, flushOtherActorEventsAsSummary: () => {}, autoSyncStale: async r => { g.autoSyncCalls.push(r); },
    CATEGORIES: [], SUBCATEGORIES: [], DICTIONARY: [], bankAccounts: [], installmentAccounts: [], hiddenFrom: {}, categoriesByNameMap: () => ({}), isDirty: () => false, isSubcategoryDirty: () => false,
    Date: Date,
  }, over || {});
  const ctx = buildSandbox(g, NAMES);
  g.emptySeen = () => ctx.emptySyncSeen('fam');
  return { ctx, g };
}
async function runCheck(e, reason, o){
  e.ctx.syncSeenState = e.ctx.emptySyncSeen('fam');
  e.ctx.syncSeenState.lastFullAt = Date.now() - 1000;  // недавня повна звірка: звичайна перевірка = дельта
  return e.ctx.runSyncCheck(reason, o || {});
}

test('runSyncCheck: примусова повна звірка → усі таблиці з { full:true }; без неї → без full', async function(){
  const e = make();
  await runCheck(e, 'manual', { fullReason: 'manual', profilesLoaded: true });
  assert.equal(e.g.calls.length, 9);
  assert.ok(e.g.calls.every(c => c.full), 'усі 9 викликів із full');
  const e2 = make();
  e2.ctx.syncSeenState = e2.ctx.emptySyncSeen('fam'); e2.ctx.syncSeenState.lastFullAt = Date.now() - 1000;
  e2.ctx.syncSeenState.tables = j(e2.g.heads.tables); e2.ctx.syncSeenState.tables.expenses = '2026-09-01T00:00:00+00:00'; // змінилась лише таблиця витрат
  e2.ctx.syncSeenState.membersHash = 'm'; e2.ctx.syncSeenState.familyHash = 'f';
  await e2.ctx.runSyncCheck('realtime', { profilesLoaded: true });
  assert.deepEqual(j(e2.g.calls), [{ name: 'expenses', full: false }], 'Realtime/звичайна дельта: одна змінена таблиця, без повної звірки');
});
test('runSyncCheck: F1-помилка таблиці (pull пропущено) → повна звірка НЕ вважається виконаною (needFull, lastFullAt не рухається)', async function(){
  const e = make();
  e.g.stubState.results.expenses = { skipped: true };
  const before = Date.now() - 1000;
  e.ctx.syncSeenState = e.ctx.emptySyncSeen('fam'); e.ctx.syncSeenState.lastFullAt = before;
  await e.ctx.runSyncCheck('manual', { fullReason: 'manual', profilesLoaded: true });
  const seen = e.g.saved[e.g.saved.length - 1];
  assert.equal(seen.needFull, 'error');
  assert.equal(seen.lastFullAt, before);
});
test('runSyncCheck: syncFullDirty після повної звірки → рівно один autoSyncStale(\'full-reconcile\'); без нього — жодного', async function(){
  const e1 = make({ pullExpensesCore: function(o){ e1.g.calls.push({ name: 'expenses', full: !!(o && o.full) }); e1.ctx.syncFullDirty = true; return Promise.resolve({}); } });
  await runCheck(e1, 'manual', { fullReason: 'manual', profilesLoaded: true });
  assert.deepEqual(j(e1.g.autoSyncCalls), ['full-reconcile']);
  const clean = make();
  await runCheck(clean, 'manual', { fullReason: 'manual', profilesLoaded: true });
  assert.deepEqual(j(clean.g.autoSyncCalls), []);
});
test('pullOnce: повна звірка не підміняється звичайним pull, що вже летить, а чекає на нього; звичайний під час повного лишається спільним', async function(){
  const order = []; let release;
  const slow = new Promise(r => { release = r; });
  const e = make({ pullExpensesCore: function(o){ order.push(o && o.full ? 'full' : 'delta'); return (o && o.full) ? Promise.resolve({ ok: 1 }) : slow.then(() => ({ ok: 0 })); } });
  const first = e.ctx.pullOnce('expenses');
  const full = e.ctx.pullOnce('expenses', { full: true });
  await new Promise(r => setTimeout(r, 5));
  assert.deepEqual(order, ['delta'], 'повна ще чекає на звичайний');
  release(); await first; const fr = await full;
  assert.deepEqual(order, ['delta', 'full']);
  assert.equal(fr.ok, 1);
  assert.equal(Object.keys(e.ctx.pullInFlightByDomain).length, 0, 'після завершення нічого не залипає');
});
test('мітка синхронізації не відсувається назад (повна звірка віддає лише відмінні рядки зі старим updated_at); вперед рухається; скидання лише через clearSyncMarkers', function(){
  const store = {};
  const g = { localStorage: { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = v; }, removeItem: k => { delete store[k]; } }, LS_KEY_SYNC_MARKERS: 'm', LS_KEY_SYNC_HEADS: 'h' };
  const c = buildSandbox(g, ['loadSyncMarkers', 'setSyncMarker', 'getSyncMarker', 'clearSyncMarkers']);
  c.setSyncMarker('expenses', '2026-10-10T00:00:00+00:00');
  c.setSyncMarker('expenses', '2026-10-05T00:00:00.000Z');
  assert.equal(c.getSyncMarker('expenses'), '2026-10-10T00:00:00+00:00', 'назад не рухається');
  c.setSyncMarker('expenses', '2026-10-12T00:00:00.000Z');
  assert.equal(c.getSyncMarker('expenses'), '2026-10-12T00:00:00.000Z');
  c.setSyncMarker('expenses', '2026-10-12T00:00:00+00:00');
  assert.equal(c.getSyncMarker('expenses'), '2026-10-12T00:00:00+00:00', 'той самий момент у іншому форматі приймається');
  c.clearSyncMarkers();
  assert.equal(c.getSyncMarker('expenses'), null);
});
