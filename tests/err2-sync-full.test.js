// Rev 2.32.424 (ERR-2): `runSyncCheck` — збій відправки «брудних» записів після повної звірки (виняток, failed > 0, null) лишає syncDirtyPending: наступна звичайна перевірка повторює відправку (без повної звірки), успіх знімає, запобіжник 3 спроби. Збій ЗАВАНТАЖЕННЯ (pull*Core) лишає needFull. Маркер purged_at і 24-годинне правило без змін. Лише синтетичні дані.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildSandbox } = require('./extract');
const SRC = require('./extract').readIndexWithCss();
const j = v => JSON.parse(JSON.stringify(v));
const names = ['SYNC_FULL_INTERVAL_MS', 'SYNC_MIN_CHECK_MS', 'SYNC_TABLE_ORDER', 'SYNC_DEPENDENTS', 'SYNC_DIRTY_RETRY_MAX', 'emptySyncSeen', 'purgedAtValue', 'purgedAtChanged', 'syncHeadsComplete', 'planSync', 'applySyncResult', 'runSyncCheck'];
const FAM = 'fam-1';
function headsOf(over){ const tables = {}; ['categories', 'subcategories', 'dictionary', 'bank_accounts', 'installment_accounts', 'hidden_entities', 'expenses', 'incomes', 'debts'].forEach(t => { tables[t] = 't1'; }); return Object.assign({ tables, purged_at: null, members_hash: 'm', family_hash: 'f', unread_notifications: 0 }, over || {}); }
function mk(opts){
  opts = opts || {};
  const log = { pulls: [], stale: [], saved: [] };
  const g = { syncFullDirty: false, syncDirtyPending: false, syncDirtyFails: 0, syncSeenState: null, cloudFamilyId: FAM, monoState: { connectionKnown: true }, monoLoadConnection(){}, syncDiag(){}, applyHeadsCounters(){}, refreshSyncProfiles: async () => true, recErr(){},
    fetchSyncHeadsShared: async () => opts.heads || headsOf(), loadSyncSeen: () => c.syncSeenState, saveSyncSeen: s => log.saved.push(j(s)), nameDomainsHaveDirty: () => false, syncNameDomainsOnConnect: async () => {}, refreshAfterSyncAtStart(){}, flushOtherActorEventsAsToasts(){}, flushOtherActorEventsAsSummary(){}, shadowDiffReport(){},
    runSyncPulls: async (tables, results, o) => { log.pulls.push(o && o.full ? 'full' : 'delta'); tables.forEach(t => { results[t] = true; }); if(o && o.full && opts.dirtyOnFull) c.syncFullDirty = true; return []; },
    autoSyncStale: async (reason) => { log.stale.push(reason); const r = opts.stale ? opts.stale(log.stale.length) : { pending: 1, pushed: 1, failed: 0 }; if(r instanceof Error) throw r; return r; } };
  const c = buildSandbox(g, names);
  return { c, g: c, log };
}
const NOW = 5000000000;
async function check(t, now, o){ t.c.Date = { now: () => now }; return t.c.runSyncCheck('focus', o || {}); }
function warm(t){ t.g.syncSeenState = t.c.emptySyncSeen(FAM); Object.assign(t.g.syncSeenState, { lastFullAt: NOW - 1000, purgedAt: null, membersHash: 'm', familyHash: 'f', needFull: null }); Object.keys(headsOf().tables).forEach(k => { t.g.syncSeenState.tables[k] = 't1'; }); }
const cold = t => { warm(t); t.g.syncSeenState.lastFullAt = 0; };

test('збій відправки після повної звірки (виняток) → syncDirtyPending; наступна звичайна перевірка (дельта, без повної) повторює відправку; успіх знімає', async function(){
  let n = 0; const t = mk({ dirtyOnFull: true, stale: () => ++n === 1 ? new Error('network') : { pending: 1, pushed: 1, failed: 0 } }); cold(t);
  const r1 = await check(t, NOW); assert.ok(r1.plan.full); assert.equal(t.g.syncDirtyPending, true); assert.deepEqual(t.log.stale, ['full-reconcile']);
  const r2 = await check(t, NOW + 31000); assert.equal(r2.plan.full, null, 'повторної повної звірки немає (дорого й не потрібно)');
  assert.deepEqual(t.log.stale, ['full-reconcile', 'full-reconcile'], 'відправку повторено при наступній перевірці');
  assert.equal(t.g.syncDirtyPending, false); assert.equal(t.g.syncDirtyFails, 0); assert.deepEqual(t.log.pulls, ['full', 'delta']);
  await check(t, NOW + 62000); assert.equal(t.log.stale.length, 2, 'успіх: далі повторів немає');
});
test('збій без винятку (failed > 0) і «не виконано» (null) діють так само', async function(){
  for(const bad of [() => ({ pending: 2, pushed: 0, failed: 2 }), () => null]){
    let n = 0; const t = mk({ dirtyOnFull: true, stale: () => ++n === 1 ? bad() : { pending: 0, pushed: 0, failed: 0 } }); cold(t);
    await check(t, NOW); assert.equal(t.g.syncDirtyPending, true);
    await check(t, NOW + 31000); assert.equal(t.log.stale.length, 2); assert.equal(t.g.syncDirtyPending, false);
  }
});
test('успіх одразу: прапорець скинуто, повторів немає; немає «брудних» — autoSyncStale не викликається', async function(){
  const t = mk({ dirtyOnFull: true }); cold(t);
  await check(t, NOW); assert.equal(t.g.syncDirtyPending, false); await check(t, NOW + 31000); assert.equal(t.log.stale.length, 1);
  const t2 = mk({ dirtyOnFull: false }); cold(t2); await check(t2, NOW); assert.deepEqual(t2.log.stale, []);
});
test('запобіжник: стійка відмова — рівно SYNC_DIRTY_RETRY_MAX (3) спроби за сеанс, далі перевірки не чіпають відправку; нова знахідка повної звірки починає спочатку', async function(){
  const t = mk({ dirtyOnFull: true, stale: () => new Error('down') }); cold(t);
  let now = NOW; for(let i = 0; i < 8; i++){ await check(t, now); now += 31000; }
  assert.equal(t.log.stale.length, 3, 'початкова + 2 повтори = 3 спроби');
  t.g.syncSeenState.lastFullAt = 0; t.log.pulls.length = 0; await check(t, now); assert.equal(t.log.stale.length, 4, 'нова повна звірка знову знаходить брудні й пробує');
});
test('запити: повторна відправка не додає повних звірок (повних лише ті, що й були)', async function(){
  let n = 0; const t = mk({ dirtyOnFull: true, stale: () => ++n < 3 ? new Error('x') : { pending: 1, pushed: 1, failed: 0 } }); cold(t);
  let now = NOW; for(let i = 0; i < 5; i++){ await check(t, now); now += 31000; }
  assert.deepEqual(t.log.pulls, ['full', 'delta', 'delta', 'delta', 'delta'], 'одна повна, решта — дельта');
});
test('збій ЗАВАНТАЖЕННЯ змін (pull*Core повернув skipped → results[table] = false) під час повної звірки лишає needFull: наступна перевірка знову повна, а не через 24 години', async function(){
  const t = mk(); cold(t);
  t.g.runSyncPulls = async (tables, results, o) => { t.log.pulls.push(o && o.full ? 'full' : 'delta'); tables.forEach(x => { results[x] = x !== 'expenses'; }); return []; };
  const r1 = await check(t, NOW); assert.ok(r1.plan.full); assert.equal(t.g.syncSeenState.needFull, 'error', 'збій завантаження: needFull');
  t.g.runSyncPulls = async (tables, results, o) => { t.log.pulls.push(o && o.full ? 'full' : 'delta'); tables.forEach(x => { results[x] = true; }); return []; };
  const r2 = await check(t, NOW + 31000); assert.ok(r2.plan.full, 'наступна перевірка повна'); assert.equal(t.g.syncSeenState.needFull, null, 'після успіху знято');
  assert.equal((await check(t, NOW + 62000)).plan.full, null);
});
test('виняток під час завантаження (runSyncPulls кидає): стан синхронізації не змінюється, тож наступна перевірка знову повна (periodic/cold) — позначка не потрібна', async function(){
  const t = mk(); warm(t); t.g.syncSeenState.lastFullAt = NOW - 25 * 3600 * 1000; // періодична
  t.g.runSyncPulls = async () => { throw new Error('boom'); };
  await assert.rejects(() => check(t, NOW), /boom/);
  assert.equal(t.g.syncSeenState.lastFullAt, NOW - 25 * 3600 * 1000, 'lastFullAt не оновлено');
  t.g.runSyncPulls = async (tables, results) => { tables.forEach(x => { results[x] = true; }); return []; };
  assert.equal((await check(t, NOW + 31000)).plan.full, 'periodic');
});
test('у runSyncCheck немає таймерів і циклів; syncCheck не частіше SYNC_MIN_CHECK_MS; усі 9 pull*Core лишають слід recErr у catch', function(){
  const body = SRC.slice(SRC.indexOf('async function runSyncCheck'), SRC.indexOf('// syncCheck(reason, opts)'));
  assert.ok(!/setTimeout|setInterval|while\s*\(|for\s*\(/.test(body.replace(/\/\/[^\n]*/g, '')));
  assert.match(SRC, /const SYNC_MIN_CHECK_MS = 30 \* 1000;/);
  ['cat', 'sub', 'dict', 'exp', 'inc', 'debt', 'bank', 'inst', 'hidden'].forEach(k => assert.ok(SRC.includes("recErr('pull-" + k + "', e);"), 'pull-' + k));
  assert.match(SRC, /runSyncCheck\(reason, o\)\.catch\(function\(e\)\{ recErr\('sync-check', e\); return null; \}\)/);
});
test('маркер purged_at і 24-годинне правило без змін; needFull → повна; без причин — дельта', function(){
  const t = mk(); const pl = (seen, heads, now) => j(t.c.planSync(heads || headsOf(), seen, now || NOW, {}));
  const base = () => { const s = t.c.emptySyncSeen(FAM); Object.assign(s, { lastFullAt: NOW - 1000, purgedAt: null, membersHash: 'm', familyHash: 'f' }); Object.keys(headsOf().tables).forEach(k => { s.tables[k] = 't1'; }); return s; };
  assert.equal(pl(base()).full, null, 'без причин — дельта');
  assert.equal(pl(base(), headsOf({ purged_at: '2026-01-01T00:00:00Z' })).full, 'purged');
  const old = base(); old.lastFullAt = NOW - 25 * 3600 * 1000; assert.equal(pl(old).full, 'periodic');
  const young = base(); young.lastFullAt = NOW - 23 * 3600 * 1000; assert.equal(pl(young).full, null, 'до 24 годин — не періодична');
  const nf = base(); nf.needFull = 'error'; assert.equal(pl(nf).full, 'error');
  assert.match(SRC, /const SYNC_FULL_INTERVAL_MS = 24 \* 60 \* 60 \* 1000;/);
});
