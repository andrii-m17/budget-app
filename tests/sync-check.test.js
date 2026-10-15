// Rev 2.32.74 (U) — перевірка змін: syncCheck / runSyncCheck на імітованому сервері (кількість запитів, порядок, збої, Realtime, лічильники).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildSandbox, evalInSandbox } = require('./extract');

const NAMES = ['SYNC_TABLE_ORDER', 'SYNC_DEPENDENTS', 'SYNC_FULL_INTERVAL_MS', 'SYNC_MIN_CHECK_MS', 'SYNC_REALTIME_DELAY_MS', 'SYNC_DELTA_OVERLAP_MS', 'LS_KEY_SYNC_HEADS',
  'emptySyncSeen', 'purgedAtValue', 'purgedAtChanged', 'normalizeSyncSeen', 'loadSyncSeen', 'saveSyncSeen', 'syncHeadsComplete', 'planSync', 'applySyncResult', 'shouldCheckHeads',
  'syncDiag', 'fetchSyncHeadsShared', 'applyHeadsCounters', 'pullTableForSync', 'runSyncPulls', 'runSyncCheck', 'syncCheck', 'scheduleRealtimeSyncCheck', 'resetSyncCheckState'];
const FAM = 'fam-1';
function makeHeads(over){
  const h = { tables: { bank_accounts: null, categories: 'c1', debts: 'd1', dictionary: 'w1', expenses: 'e1', hidden_entities: null, incomes: 'i1', installment_accounts: null, subcategories: 's1' },
    members_hash: 'm1', family_hash: 'f1', unread_notifications: 5, mono_new: 3 };
  Object.keys(over || {}).forEach(function(k){ if(k === 'tables') Object.assign(h.tables, over.tables); else h[k] = over[k]; });
  return h;
}
function make(){
  const store = new Map();
  const clock = { t: Date.parse('2026-10-15T10:00:00Z') };
  class FakeDate extends Date { static now(){ return clock.t; } }
  const timers = [];
  const rec = { rpc: 0, pulls: [], nameDomain: 0, toasts: 0, summary: 0, refresh: 0 };
  const server = { heads: makeHeads(), rpcFail: false, failTables: new Set(), changed: {}, delay: 0 };
  const g = {
    Date: FakeDate, clock, rec, server, timers,
    localStorage: { getItem: function(k){ return store.has(k) ? store.get(k) : null; }, setItem: function(k, v){ store.set(k, String(v)); }, removeItem: function(k){ store.delete(k); } },
    navigator: { onLine: true }, cloudFamilyId: FAM, cloudSession: { user: { id: 'u1' } },
    isCloudSessionReady: function(){ return true; },
    getSupabaseClient: function(){ return { rpc: async function(name){ rec.rpc++; if(server.delay) await new Promise(function(r){ setImmediate(r); }); if(server.rpcFail) return { error: { message: 'x' }, data: null }; return { data: JSON.parse(JSON.stringify(server.heads)), error: null }; } }; },
    PULL_DOMAINS: ['categories', 'subcategories', 'dictionary', 'bank_accounts', 'installment_accounts', 'hidden_entities', 'expenses', 'incomes', 'debts'].map(function(t){ return { key: t + 'K', table: t }; }),
    pullOnce: async function(key){ const t = key.slice(0, -1); rec.pulls.push(t); if(server.failTables.has(t)) return { skipped: true }; return { added: server.changed[t] || 0, updated: 0, linked: 0 }; },
    refreshSyncProfiles: async function(){ rec.profiles = (rec.profiles || 0) + 1; return true; },
    nameDomainsHaveDirty: function(){ return !!rec.dirty; },
    syncNameDomainsOnConnect: async function(){ rec.nameDomain++; },
    flushOtherActorEventsAsToasts: function(){ rec.toasts++; }, flushOtherActorEventsAsSummary: function(){ rec.summary++; },
    refreshAfterSyncAtStart: function(){ rec.refresh++; },
    notifArchive: { unread: 0 }, monoInbox: { newCount: 0 }, updateNotifBell: function(){}, updateMonoBadges: function(){},
    debugRecordingActive: false, pushDebugEvent: function(){}, performance: { now: function(){ return 0; } },
    syncSeenState: null, syncLastCheckAt: 0, syncCheckInFlight: null, syncRecheckPending: null, syncRealtimeTimer: null, headsInFlight: null,
    setTimeout: function(fn, ms){ timers.push({ fn: fn, ms: ms }); return timers.length; }, clearTimeout: function(){},
  };
  const ctx = buildSandbox(g, NAMES);
  ctx.advance = function(ms){ clock.t += ms; };
  ctx.get = function(expr){ return evalInSandbox(ctx, expr); };
  return ctx;
}
const ORDER = ['categories', 'subcategories', 'dictionary', 'bank_accounts', 'installment_accounts', 'hidden_entities', 'expenses', 'incomes', 'debts'];

test('холодний старт: 1 RPC + повна звірка (усі 9 таблиць у FK-порядку), «голови» і lastFullAt збережено', async function(){
  const c = make();
  await c.syncCheck('start', { force: true, profilesLoaded: true, refreshAll: false });
  assert.equal(c.rec.rpc, 1);
  assert.deepEqual(c.rec.pulls, ORDER);
  assert.equal(c.rec.profiles, undefined);               // профілі вже завантажено викликачем
  assert.equal(c.rec.summary, 1);
  assert.equal(c.notifArchive.unread, 5);                // лічильники з тієї самої відповіді
  assert.equal(c.monoInbox.newCount, 3);
  const saved = JSON.parse(c.localStorage.getItem('budget_sync_heads_v1'));
  assert.equal(saved.lastFullAt, c.clock.t);
  assert.equal(saved.tables.expenses, 'e1');
});
test('I1: 5 разів фон/повернення без змін (кожне через 31 с) → 5 RPC і 0 завантажень таблиць', async function(){
  const c = make();
  await c.syncCheck('start', { force: true, profilesLoaded: true });
  c.rec.rpc = 0; c.rec.pulls.length = 0;
  for(let i = 0; i < 5; i++){ c.advance(31000); await c.syncCheck('resume'); }
  assert.equal(c.rec.rpc, 5);
  assert.equal(c.rec.pulls.length, 0);
});
test('повернення швидше ніж за 30 с після попередньої перевірки → жодного запиту; силована (push/Realtime) — проходить', async function(){
  const c = make();
  await c.syncCheck('start', { force: true, profilesLoaded: true });
  c.rec.rpc = 0;
  c.advance(10000); await c.syncCheck('resume'); await c.syncCheck('resume');
  assert.equal(c.rec.rpc, 0);
  await c.syncCheck('push', { force: true });
  assert.equal(c.rec.rpc, 1);
});
test('зміна з іншого пристрою (витрати) → завантажується лише expenses; наступна перевірка порожня', async function(){
  const c = make();
  await c.syncCheck('start', { force: true, profilesLoaded: true });
  c.rec.pulls.length = 0; c.rec.toasts = 0;
  c.server.heads = makeHeads({ tables: { expenses: 'e2' } }); c.server.changed.expenses = 1;
  c.advance(40000); await c.syncCheck('realtime', { force: true });
  assert.deepEqual(c.rec.pulls, ['expenses']);
  assert.equal(c.rec.toasts, 1);                          // Realtime → toast, не зведене сповіщення
  c.rec.pulls.length = 0; c.advance(40000); await c.syncCheck('resume');
  assert.deepEqual(c.rec.pulls, []);
});
test('невдале завантаження таблиці не запам\'ятовує її «голову» — піде знову', async function(){
  const c = make();
  await c.syncCheck('start', { force: true, profilesLoaded: true });
  c.rec.pulls.length = 0;
  c.server.heads = makeHeads({ tables: { incomes: 'i2' } }); c.server.failTables.add('incomes');
  c.advance(40000); await c.syncCheck('resume');
  assert.deepEqual(c.rec.pulls, ['incomes']);
  c.server.failTables.clear(); c.rec.pulls.length = 0; c.advance(40000); await c.syncCheck('resume');
  assert.deepEqual(c.rec.pulls, ['incomes']);
});
test('збій повної звірки → наступна перевірка знову повна, доки всі таблиці не вдадуться', async function(){
  const c = make();
  c.server.failTables.add('debts');
  await c.syncCheck('start', { force: true, profilesLoaded: true });
  assert.equal(JSON.parse(c.localStorage.getItem('budget_sync_heads_v1')).needFull, 'error');
  c.server.failTables.clear(); c.rec.pulls.length = 0; c.advance(40000);
  await c.syncCheck('resume');
  assert.deepEqual(c.rec.pulls, ORDER);
  assert.equal(JSON.parse(c.localStorage.getItem('budget_sync_heads_v1')).needFull, null);
});
test('sync_heads недоступний → як раніше всі таблиці, наступна вдала перевірка — повна', async function(){
  const c = make();
  await c.syncCheck('start', { force: true, profilesLoaded: true });
  c.server.rpcFail = true; c.rec.pulls.length = 0; c.advance(40000);
  await c.syncCheck('resume');
  assert.deepEqual(c.rec.pulls, ORDER);
  c.server.rpcFail = false; c.rec.pulls.length = 0; c.advance(40000);
  await c.syncCheck('resume');
  assert.deepEqual(c.rec.pulls, ORDER);                   // повна після помилки
});
test('Realtime: серія подій згортається в одну заплановану перевірку (1,5 с)', async function(){
  const c = make();
  c.scheduleRealtimeSyncCheck(); c.scheduleRealtimeSyncCheck(); c.scheduleRealtimeSyncCheck();
  assert.equal(c.timers.length, 1);
  assert.equal(c.timers[0].ms, 1500);
  await c.timers[0].fn();
  await new Promise(function(r){ setImmediate(r); });
  assert.equal(c.rec.rpc, 1);
});
test('перевірки, що збіглися в часі, діляться одним RPC; силована під час виконання — одна повторна після', async function(){
  const c = make();
  c.server.delay = 1;
  await c.syncCheck('start', { force: true, profilesLoaded: true });
  c.rec.rpc = 0; c.advance(40000);
  const a = c.syncCheck('resume'); const b = c.syncCheck('resume'); const f = c.syncCheck('push', { force: true });
  await Promise.all([a, b, f]);
  await new Promise(function(r){ setTimeout(r, 20); });
  assert.equal(c.rec.rpc, 2);                              // спільний + одна повторна для силованої
});
test('офлайн / немає сесії → нічого не робить', async function(){
  const c = make();
  c.navigator.onLine = false;
  assert.equal(await c.syncCheck('resume'), null);
  assert.equal(c.rec.rpc, 0);
});
test('перепис id/push довідників: у повній звірці завжди; поза нею лише коли є «брудні» записи; на Realtime ніколи', async function(){
  const c = make();
  await c.syncCheck('start', { force: true, profilesLoaded: true });
  assert.equal(c.rec.nameDomain, 1);                       // повна (холодний старт)
  c.advance(40000); await c.syncCheck('resume');
  assert.equal(c.rec.nameDomain, 1);                       // нічого брудного
  c.rec.dirty = true; c.advance(40000); await c.syncCheck('online');
  assert.equal(c.rec.nameDomain, 2);
  c.advance(40000); await c.syncCheck('realtime', { force: true });
  assert.equal(c.rec.nameDomain, 2);
});
test('вихід/зміна сім\'ї: resetSyncCheckState скидає пам\'ять; чужа сім\'я не використовує чужі «голови»', async function(){
  const c = make();
  await c.syncCheck('start', { force: true, profilesLoaded: true });
  c.resetSyncCheckState();
  assert.equal(c.get('syncSeenState'), null);
  assert.equal(c.get('syncLastCheckAt'), 0);
  c.cloudFamilyId = 'fam-2'; c.rec.pulls.length = 0;
  await c.syncCheck('resume', { force: true });
  assert.deepEqual(c.rec.pulls, ORDER);                    // для іншої сім'ї — повна
});
test('ручна повна звірка (fullReason) і зміна відбитків профілів → refreshSyncProfiles', async function(){
  const c = make();
  await c.syncCheck('start', { force: true, profilesLoaded: true });
  c.rec.pulls.length = 0; c.advance(40000);
  c.server.heads = makeHeads({ members_hash: 'm2' });
  await c.syncCheck('resume');
  assert.equal(c.rec.profiles, 1);
  assert.deepEqual(c.rec.pulls, []);
  await c.syncCheck('manual', { fullReason: 'manual' });
  assert.deepEqual(c.rec.pulls, ORDER);
});
