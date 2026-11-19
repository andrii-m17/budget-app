// Rev 2.32.424 (ERR-2): `runSyncCheck` — збій відправки «брудних» записів після повної звірки лишає позначку needFull: наступна звичайна перевірка знову повна. Успіх — позначка знята. Маркер purged_at і 24-годинне правило без змін. Лише синтетичні дані.
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
  const g = { syncFullDirty: false, syncDirtyFails: 0, syncSeenState: null, cloudFamilyId: FAM, monoState: { connectionKnown: true }, monoLoadConnection(){}, syncDiag(){}, applyHeadsCounters(){}, refreshSyncProfiles: async () => true, recErr(){},
    fetchSyncHeadsShared: async () => opts.heads || headsOf(), loadSyncSeen: () => c.syncSeenState, saveSyncSeen: s => log.saved.push(j(s)), nameDomainsHaveDirty: () => false, syncNameDomainsOnConnect: async () => {}, refreshAfterSyncAtStart(){}, flushOtherActorEventsAsToasts(){}, flushOtherActorEventsAsSummary(){}, shadowDiffReport(){},
    runSyncPulls: async (tables, results, o) => { log.pulls.push(o && o.full ? 'full' : 'delta'); tables.forEach(t => { results[t] = true; }); if(o && o.full && opts.dirtyOnFull) c.syncFullDirty = true; return []; },
    autoSyncStale: async (reason) => { log.stale.push(reason); const r = opts.stale ? opts.stale(log.stale.length) : { pending: 1, pushed: 1, failed: 0 }; if(r instanceof Error) throw r; return r; } };
  const c = buildSandbox(g, names);
  return { c, g: c, log };
}
const NOW = 5000000000;
async function check(t, now, o){ t.c.Date = { now: () => now }; return t.c.runSyncCheck('focus', o || {}); }
// стан після успішної повної звірки (щоб наступні перевірки були «дельтою»)
function warm(t){ t.g.syncSeenState = t.c.emptySyncSeen(FAM); Object.assign(t.g.syncSeenState, { lastFullAt: NOW - 1000, purgedAt: null, membersHash: 'm', familyHash: 'f', needFull: null }); Object.keys(headsOf().tables).forEach(k => { t.g.syncSeenState.tables[k] = 't1'; }); }

test('збій відправки після повної звірки (виняток) → needFull лишається; наступна звичайна перевірка знову повна', async function(){
  const t = mk({ dirtyOnFull: true, stale: () => new Error('network') }); warm(t); t.g.syncSeenState.lastFullAt = 0; // холодний старт → повна
  const r1 = await check(t, NOW); assert.ok(r1.plan.full, 'перша перевірка повна');
  assert.equal(t.g.syncSeenState.needFull, 'dirty-push'); assert.deepEqual(t.log.stale, ['full-reconcile']);
  const r2 = await check(t, NOW + 31000); assert.ok(r2.plan.full, 'наступна перевірка знову повна, не чекає 24 год: ' + JSON.stringify(r2.plan.full));
  assert.deepEqual(t.log.pulls, ['full', 'full']);
});
test('збій відправки без винятку (failed > 0) діє так само', async function(){
  const t = mk({ dirtyOnFull: true, stale: () => ({ pending: 2, pushed: 0, failed: 2 }) }); warm(t); t.g.syncSeenState.lastFullAt = 0;
  await check(t, NOW); assert.equal(t.g.syncSeenState.needFull, 'dirty-push');
  assert.ok((await check(t, NOW + 31000)).plan.full);
});
test('успіх: прапорець скинуто, needFull знято, наступна перевірка — дельта', async function(){
  const t = mk({ dirtyOnFull: true }); warm(t); t.g.syncSeenState.lastFullAt = 0;
  const r1 = await check(t, NOW); assert.ok(r1.plan.full); assert.equal(t.g.syncSeenState.needFull, null); assert.equal(t.g.syncFullDirty, false); assert.equal(t.g.syncDirtyFails, 0);
  const r2 = await check(t, NOW + 31000); assert.equal(r2.plan.full, null, 'повторної повної немає'); assert.deepEqual(t.log.pulls, ['full', 'delta']);
});
test('немає «брудних» після повної звірки: autoSyncStale не викликається, needFull не ставиться', async function(){
  const t = mk({ dirtyOnFull: false }); warm(t); t.g.syncSeenState.lastFullAt = 0;
  await check(t, NOW); assert.deepEqual(t.log.stale, []); assert.equal(t.g.syncSeenState.needFull, null);
});
test('запобіжник: не більше SYNC_DIRTY_RETRY_MAX підряд невдалих спроб (3); далі — звичайна періодична звірка; успіх скидає лічильник', async function(){
  let fail = true;
  const t = mk({ dirtyOnFull: true, stale: () => fail ? new Error('down') : { pending: 1, pushed: 1, failed: 0 } }); warm(t); t.g.syncSeenState.lastFullAt = 0;
  const fulls = []; let now = NOW;
  for(let i = 0; i < 6; i++){ const r = await check(t, now); fulls.push(!!r.plan.full); now += 31000; }
  assert.deepEqual(fulls, [true, true, true, true, false, false], 'холодна + 3 повтори, далі дельта (запит-сплеск обмежено)');
  assert.equal(t.g.syncSeenState.needFull, null);
  // успіх після відновлення: лічильник скидається, нова повна звірка знову має 3 спроби
  fail = false; t.g.syncSeenState.lastFullAt = 0; await check(t, now); assert.equal(t.g.syncDirtyFails, 0);
});
test('число перевірок не змінилось: повторна повна — не власний цикл (жодних таймерів/циклів у runSyncCheck), лише наступна звичайна перевірка', function(){
  const body = SRC.slice(SRC.indexOf('async function runSyncCheck'), SRC.indexOf('// syncCheck(reason, opts)'));
  assert.ok(!/setTimeout|setInterval|while\s*\(|for\s*\(/.test(body.replace(/\/\/[^\n]*/g, '')), 'у runSyncCheck немає циклів і таймерів');
  assert.match(SRC, /const SYNC_MIN_CHECK_MS = 30 \* 1000;/);
});
test('маркер purged_at і 24-годинне правило без змін; needFull → повна; без причин — дельта', function(){
  const t = mk(); const pl = (seen, heads, now) => j(t.c.planSync(heads || headsOf(), seen, now || NOW, {}));
  const base = () => { const s = t.c.emptySyncSeen(FAM); Object.assign(s, { lastFullAt: NOW - 1000, purgedAt: null, membersHash: 'm', familyHash: 'f' }); Object.keys(headsOf().tables).forEach(k => { s.tables[k] = 't1'; }); return s; };
  assert.equal(pl(base()).full, null, 'без причин — дельта');
  assert.equal(pl(base(), headsOf({ purged_at: '2026-01-01T00:00:00Z' })).full, 'purged');
  const old = base(); old.lastFullAt = NOW - 25 * 3600 * 1000; assert.equal(pl(old).full, 'periodic');
  const young = base(); young.lastFullAt = NOW - 23 * 3600 * 1000; assert.equal(pl(young).full, null, 'до 24 годин — не періодична');
  const nf = base(); nf.needFull = 'dirty-push'; assert.equal(pl(nf).full, 'error');
  assert.match(SRC, /const SYNC_FULL_INTERVAL_MS = 24 \* 60 \* 60 \* 1000;/);
});
