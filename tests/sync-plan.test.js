// Rev 2.32.73 (S) — планувальник синхронізації: чисті функції planSync / applySyncResult / shouldCheckHeads / syncDeltaFrom.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildSandbox, evalInSandbox } = require('./extract');
const ev = evalInSandbox;

const NAMES = ['SYNC_TABLE_ORDER', 'SYNC_DEPENDENTS', 'SYNC_FULL_INTERVAL_MS', 'SYNC_MIN_CHECK_MS', 'SYNC_REALTIME_DELAY_MS', 'SYNC_DELTA_OVERLAP_MS', 'LS_KEY_SYNC_HEADS', 'LS_KEY_SYNC_MARKERS',
  'syncDeltaFrom', 'emptySyncSeen', 'purgedAtValue', 'purgedAtChanged', 'normalizeSyncSeen', 'loadSyncSeen', 'saveSyncSeen', 'syncHeadsComplete', 'planSync', 'applySyncResult', 'shouldCheckHeads',
  'clearSyncMarkers', 'loadSyncMarkers', 'getSyncMarker', 'setSyncMarker', 'applySyncMarker',
  'NET_STATS', 'classifyNetRequest', 'countNetRequest'];
function mkStorage(){ const m = new Map(); return { getItem: function(k){ return m.has(k) ? m.get(k) : null; }, setItem: function(k, v){ m.set(k, String(v)); }, removeItem: function(k){ m.delete(k); }, _m: m }; }
function make(){ const localStorage = mkStorage(); const ctx = buildSandbox({ localStorage: localStorage }, NAMES); ctx.__ls = localStorage; return ctx; }

const T0 = Date.parse('2026-10-15T10:00:00Z');
const FAM = 'fam-1';
function heads(over){
  const base = { tables: { bank_accounts: null, categories: 'c1', debts: 'd1', dictionary: 'w1', expenses: 'e1', hidden_entities: null, incomes: 'i1', installment_accounts: null, subcategories: 's1' },
    members_hash: 'm1', family_hash: 'f1', unread_notifications: 5, mono_new: 3, server_time: '2026-10-15T10:00:00Z' };
  const h = JSON.parse(JSON.stringify(base));
  Object.keys(over || {}).forEach(function(k){ if(k === 'tables') Object.assign(h.tables, over.tables); else h[k] = over[k]; });
  return h;
}
function synced(ctx, at){
  const hd = heads();
  const seen = ctx.emptySyncSeen(FAM);
  const plan = ctx.planSync(hd, seen, at, {});
  const res = {}; plan.tables.forEach(function(t){ res[t] = true; }); res.profiles = true;
  return ctx.applySyncResult(seen, hd, plan, res, at);
}

test('planSync: холодний старт (немає lastFullAt) → повна звірка з усіма таблицями у FK-порядку', function(){
  const ctx = make();
  const plan = ctx.planSync(heads(), ctx.emptySyncSeen(FAM), T0, {});
  assert.equal(plan.full, 'cold');
  assert.deepEqual(Array.from(plan.tables), ['categories', 'subcategories', 'dictionary', 'bank_accounts', 'installment_accounts', 'hidden_entities', 'expenses', 'incomes', 'debts']);
  assert.equal(plan.profiles, true);
});
test('planSync: нічого не змінилось → порожній план (0 завантажень)', function(){
  const ctx = make();
  const seen = synced(ctx, T0);
  const plan = ctx.planSync(heads(), seen, T0 + 60000, {});
  assert.equal(plan.full, null);
  assert.deepEqual(Array.from(plan.tables), []);
  assert.equal(plan.profiles, false);
  assert.equal(plan.counters.unread, 5);
  assert.equal(plan.counters.monoNew, 3);
});
test('planSync: змінилась лише expenses → лише expenses; null → значення теж зміна', function(){
  const ctx = make();
  const seen = synced(ctx, T0);
  assert.deepEqual(Array.from(ctx.planSync(heads({ tables: { expenses: 'e2' } }), seen, T0 + 60000, {}).tables), ['expenses']);
  // «батько» тягне «дітей» (skippedFk): картка → борги й приховані; ОЧ → борги, витрати, приховані; категорія → підкатегорії, слова
  assert.deepEqual(Array.from(ctx.planSync(heads({ tables: { bank_accounts: 'b1' } }), seen, T0 + 60000, {}).tables), ['bank_accounts', 'hidden_entities', 'debts']);
  assert.deepEqual(Array.from(ctx.planSync(heads({ tables: { installment_accounts: 'n1' } }), seen, T0 + 60000, {}).tables), ['installment_accounts', 'hidden_entities', 'expenses', 'debts']);
  assert.deepEqual(Array.from(ctx.planSync(heads({ tables: { categories: 'c2' } }), seen, T0 + 60000, {}).tables), ['categories', 'subcategories', 'dictionary']);
});
test('planSync: голова МЕНШЕ за збережену (остаточно видалено найновіший рядок) теж зміна', function(){
  const ctx = make();
  const seen = synced(ctx, T0);
  seen.tables.expenses = 'e9';
  assert.deepEqual(Array.from(ctx.planSync(heads(), seen, T0 + 60000, {}).tables), ['expenses']);
});
test('planSync: профілі — лише при зміні members_hash / family_hash', function(){
  const ctx = make();
  const seen = synced(ctx, T0);
  assert.equal(ctx.planSync(heads({ members_hash: 'm2' }), seen, T0 + 1000, {}).profiles, true);
  assert.equal(ctx.planSync(heads({ family_hash: 'f2' }), seen, T0 + 1000, {}).profiles, true);
  assert.equal(ctx.planSync(heads(), seen, T0 + 1000, {}).profiles, false);
});
test('planSync: повна звірка — раз на 24 години, ручна, після входу, після помилки, при неповній відповіді', function(){
  const ctx = make();
  const seen = synced(ctx, T0);
  assert.equal(ctx.planSync(heads(), seen, T0 + 24 * 3600 * 1000 - 1, {}).full, null);
  assert.equal(ctx.planSync(heads(), seen, T0 + 24 * 3600 * 1000, {}).full, 'periodic');
  assert.equal(ctx.planSync(heads(), seen, T0 + 1000, { fullReason: 'manual' }).full, 'manual');
  assert.equal(ctx.planSync(heads(), seen, T0 + 1000, { fullReason: 'login' }).full, 'login');
  const bad = JSON.parse(JSON.stringify(seen)); bad.needFull = 'error';
  assert.equal(ctx.planSync(heads(), bad, T0 + 1000, {}).full, 'error');
  const partial = heads(); delete partial.tables.debts;
  assert.equal(ctx.planSync(partial, seen, T0 + 1000, {}).full, 'mismatch');
  const future = JSON.parse(JSON.stringify(seen)); future.lastFullAt = T0 + 99999;
  assert.equal(ctx.planSync(heads(), future, T0, {}).full, 'cold'); // годинник пристрою відкотився
});
test('planSync: немає відповіді сервера → ok:false (нічого не робимо)', function(){
  const ctx = make();
  assert.equal(ctx.planSync(null, ctx.emptySyncSeen(FAM), T0, {}).ok, false);
});
test('applySyncResult: успіх повної звірки ставить lastFullAt і запам\'ятовує голови; невдала таблиця лишається «зміненою»', function(){
  const ctx = make();
  const hd = heads();
  const seen0 = ctx.emptySyncSeen(FAM);
  const plan = ctx.planSync(hd, seen0, T0, {});
  const res = {}; plan.tables.forEach(function(t){ res[t] = t !== 'debts'; }); res.profiles = true;
  const seen1 = ctx.applySyncResult(seen0, hd, plan, res, T0);
  assert.equal(seen1.lastFullAt, 0);              // не всі вдалися
  assert.equal(seen1.needFull, 'error');          // наступна перевірка знову повна
  assert.equal(seen1.tables.expenses, 'e1');
  assert.equal(seen1.tables.debts, undefined);
  res.debts = true;
  const seen2 = ctx.applySyncResult(seen0, hd, plan, res, T0);
  assert.equal(seen2.lastFullAt, T0);
  assert.equal(seen2.needFull, null);
  assert.equal(seen2.membersHash, 'm1');
});
test('applySyncResult: частковий (не повний) план не чіпає lastFullAt і не виставляє needFull', function(){
  const ctx = make();
  const seen = synced(ctx, T0);
  const hd = heads({ tables: { expenses: 'e2' } });
  const plan = ctx.planSync(hd, seen, T0 + 60000, {});
  const next = ctx.applySyncResult(seen, hd, plan, { expenses: false }, T0 + 60000);
  assert.equal(next.lastFullAt, T0);
  assert.equal(next.needFull, null);
  assert.equal(next.tables.expenses, 'e1');       // не оновлено → піде знову
  const ok = ctx.applySyncResult(seen, hd, plan, { expenses: true }, T0 + 60000);
  assert.equal(ok.tables.expenses, 'e2');
});
test('shouldCheckHeads: мінімальний інтервал 30 с, силована перевірка завжди', function(){
  const ctx = make();
  assert.equal(ctx.shouldCheckHeads(T0, 0, false), true);
  assert.equal(ctx.shouldCheckHeads(T0 + 29999, T0, false), false);
  assert.equal(ctx.shouldCheckHeads(T0 + 30000, T0, false), true);
  assert.equal(ctx.shouldCheckHeads(T0 + 1, T0, true), true);
  assert.equal(ctx.shouldCheckHeads(T0 - 5, T0, false), true);   // годинник відкотився
});
test('syncDeltaFrom: мітка − 2 с; без мітки / некоректна — без змін', function(){
  const ctx = make();
  assert.equal(ctx.syncDeltaFrom('2026-10-15T10:00:05.000Z'), '2026-10-15T10:00:03.000Z');
  assert.equal(ctx.syncDeltaFrom('2026-10-15T10:00:01.500+00:00'), '2026-10-15T09:59:59.500Z');
  assert.equal(ctx.syncDeltaFrom(null), null);
  assert.equal(ctx.syncDeltaFrom('сміття'), 'сміття');
});
test('applySyncMarker: .gte від мітки − 2 с', function(){
  const ctx = make();
  ctx.setSyncMarker('expenses', '2026-10-15T10:00:05.000Z');
  let got = null;
  const q = { gte: function(c, v){ got = [c, v]; return q; } };
  ctx.applySyncMarker(q, 'expenses');
  assert.deepEqual(got, ['updated_at', '2026-10-15T10:00:03.000Z']);
  got = null; ctx.applySyncMarker(q, 'incomes');
  assert.equal(got, null);                          // немає мітки — повний запит
});
test('normalizeSyncSeen / сховище: чужа сім\'я або сміття → порожній стан (повна звірка)', function(){
  const ctx = make();
  const seen = synced(ctx, T0);
  ctx.saveSyncSeen(seen);
  assert.equal(ctx.loadSyncSeen(FAM).lastFullAt, T0);
  assert.equal(ctx.loadSyncSeen('other').lastFullAt, 0);
  ctx.__ls.setItem(ev(ctx, 'LS_KEY_SYNC_HEADS'), '{зламано');
  assert.equal(ctx.loadSyncSeen(FAM).lastFullAt, 0);
});
test('вихід з акаунта: clearSyncMarkers чистить і маркери, і «голови»', function(){
  const ctx = make();
  ctx.setSyncMarker('expenses', '2026-10-15T10:00:05.000Z');
  ctx.saveSyncSeen(synced(ctx, T0));
  assert.ok(ctx.__ls.getItem(ev(ctx, 'LS_KEY_SYNC_HEADS')));
  ctx.clearSyncMarkers();
  assert.equal(ctx.__ls.getItem(ev(ctx, 'LS_KEY_SYNC_HEADS')), null);
  assert.equal(ctx.getSyncMarker('expenses'), null);
});
test('лічильник запитів: класифікація без значень користувача', function(){
  const ctx = make();
  assert.equal(ctx.classifyNetRequest('https://x.supabase.co/rest/v1/expenses?select=id&family_id=eq.123', 'GET'), 'GET expenses');
  assert.equal(ctx.classifyNetRequest('https://x.supabase.co/rest/v1/mono_inbox?select=id&status=eq.new', 'head'), 'HEAD mono_inbox');
  assert.equal(ctx.classifyNetRequest('https://x.supabase.co/rest/v1/rpc/sync_heads', 'POST'), 'RPC sync_heads');
  assert.equal(ctx.classifyNetRequest('https://x.supabase.co/auth/v1/token?grant_type=refresh_token', 'POST'), 'auth');
  ctx.countNetRequest('https://x.supabase.co/rest/v1/debts?x=1', 'GET'); ctx.countNetRequest('https://x.supabase.co/rest/v1/debts', 'GET');
  assert.equal(ev(ctx, 'NET_STATS.total'), 2);
  assert.equal(ev(ctx, "NET_STATS.byType['GET debts']"), 2);
});

// ---------- Rev 2.32.75 (K3): маркер purged_at ----------
test('K3 purged_at: null → значення = одна повна звірка (причина purged), значення запам\'ятовується лише після успіху', function(){
  const ctx = make();
  const seen = synced(ctx, T0);
  const hd = heads({ purged_at: '2026-10-15T10:00:00+00:00' });
  const plan = ctx.planSync(hd, seen, T0 + 1000, {});
  assert.equal(plan.full, 'purged');
  const res = {}; plan.tables.forEach(function(t){ res[t] = true; }); res.profiles = true;
  const next = ctx.applySyncResult(seen, hd, plan, res, T0 + 1000);
  assert.equal(next.purgedAt, '2026-10-15T10:00:00+00:00');
  assert.equal(ctx.planSync(hd, next, T0 + 2000, {}).full, null);   // те саме значення — повної немає
  const failed = ctx.applySyncResult(seen, hd, plan, Object.assign({}, res, { debts: false }), T0 + 1000);
  assert.equal(failed.purgedAt, null);                                // збій → наступна знову повна
  assert.equal(failed.needFull, 'error');
});
test('K3 purged_at: порівняння нормалізоване (Z і +00:00 — те саме), зміна значення → повна', function(){
  const ctx = make();
  const seen = synced(ctx, T0); seen.purgedAt = '2026-10-15T10:00:00+00:00';
  assert.equal(ctx.planSync(heads({ purged_at: '2026-10-15T10:00:00Z' }), seen, T0 + 1000, {}).full, null);
  assert.equal(ctx.planSync(heads({ purged_at: '2026-10-15T10:00:00.000Z' }), seen, T0 + 1000, {}).full, null);
  assert.equal(ctx.planSync(heads({ purged_at: '2026-10-16T10:00:00Z' }), seen, T0 + 1000, {}).full, 'purged');
  assert.equal(ctx.planSync(heads({ purged_at: null }), synced(ctx, T0), T0 + 1000, {}).full, null);
});
test('K3 purged_at: зберігається в normalizeSyncSeen; вихід (clearSyncMarkers) очищає «голови» разом із маркером', function(){
  const ctx = make();
  const seen = ctx.normalizeSyncSeen({ familyId: FAM, tables: {}, purgedAt: '2026-10-15T10:00:00Z' }, FAM);
  assert.equal(seen.purgedAt, '2026-10-15T10:00:00Z');
  assert.equal(ctx.normalizeSyncSeen({ familyId: FAM }, FAM).purgedAt, null);
  assert.equal(ctx.emptySyncSeen(FAM).purgedAt, null);
});
