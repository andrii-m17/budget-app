// Rev 2.32.22 (W, A1-1 / A1-4) — вихід з акаунта чистить пристрій; бекап не воскрешає видалене назавжди. Імітований Cloud/сховище.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildSandbox } = require('./extract');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

function fakeStorage(init){
  const m = new Map(Object.entries(init || {}));
  return { getItem: function(k){ return m.has(k) ? m.get(k) : null; }, setItem: function(k, v){ m.set(k, String(v)); }, removeItem: function(k){ m.delete(k); }, _m: m };
}

// ---------- чисті рішення ----------
test('shouldOfferBackupBeforeSignOut: порожньо / старіше 7 днів / зламана дата — пропонуємо; свіжа — ні', function(){
  const c = buildSandbox({}, ['BACKUP_STALE_DAYS', 'shouldOfferBackupBeforeSignOut', 'signOutConfirmText']);
  const now = Date.parse('2026-10-10T12:00:00Z');
  assert.equal(c.shouldOfferBackupBeforeSignOut(null, now), true);
  assert.equal(c.shouldOfferBackupBeforeSignOut('нісенітниця', now), true);
  assert.equal(c.shouldOfferBackupBeforeSignOut('2026-10-02T12:00:00Z', now), true);
  assert.equal(c.shouldOfferBackupBeforeSignOut('2026-10-05T12:00:00Z', now), false);
  assert.match(c.signOutConfirmText(false), /у хмарі вони лишаються/);
  assert.match(c.signOutConfirmText(true), /копі/);
});

// ---------- W1/W2: вихід A -> вхід B ----------
const LS = {
  LS_KEY_EXP: 'budget_expenses_v1', LS_KEY_INC: 'budget_incomes_v1', LS_KEY_DEBT: 'budget_debts_v1', LS_KEY_BANKS: 'budget_bankaccounts_v1',
  LS_KEY_INSTALLMENTS: 'budget_installmentaccounts_v1', LS_KEY_HIDDEN: 'budget_debthidden_v1', LS_KEY_CATEGORIES: 'budget_categories_v1',
  LS_KEY_SUBCATEGORIES: 'budget_subcategories_v1', LS_KEY_SUBCATEGORY_PRIORITY: 'budget_subcategory_priority_v1', LS_KEY_DICTIONARY: 'budget_dictionary_v1',
  LS_KEY_SCHEMA_VERSION: 'budget_schema_version_v1', LS_KEY_IGNORED_DIVERGENCES: 'budget_ignored_divergences_v1',
  LS_KEY_DRAFT: 'budget_expense_draft_v1', LS_KEY_PURGED_TAXONOMY: 'budget_purged_taxonomy_v1', LS_KEY_PURGED_ACCOUNTS: 'budget_purged_accounts_v1',
  LS_KEY_PURGED_RECORDS: 'budget_purged_records_v1', LS_KEY_SYNC_MARKERS: 'budget_sync_markers_v1', LS_KEY_CLOUD_FAMILY_ID: 'budget_cloud_family_id_v1',
};
function signOutSandbox(opts){
  const o = opts || {};
  const calls = [];
  const storage = fakeStorage(Object.fromEntries(Object.values(LS).map(function(k){ return [k, '"данi A"']; })));
  storage.setItem('budget_theme_v1', 'dark'); storage.setItem('budget_migration_status_v1', '{"categories":true}');
  const idbRemoved = [];
  const DOMAIN_MIGRATION_KEYS = { categories: [LS.LS_KEY_CATEGORIES], expenses: [LS.LS_KEY_EXP] };
  const globals = Object.assign({
    localStorage: storage, DOMAIN_MIGRATION_KEYS, calls, idbRemoved,
    isDomainMigrated: function(d){ return d === 'categories'; },
    idbAdapterRemove: async function(k){ idbRemoved.push(k); },
    BACKUP_LS_KEYS: [LS.LS_KEY_EXP, LS.LS_KEY_INC, LS.LS_KEY_DEBT, LS.LS_KEY_BANKS, LS.LS_KEY_INSTALLMENTS, LS.LS_KEY_HIDDEN, LS.LS_KEY_CATEGORIES, LS.LS_KEY_SUBCATEGORIES, LS.LS_KEY_SUBCATEGORY_PRIORITY, LS.LS_KEY_DICTIONARY, LS.LS_KEY_SCHEMA_VERSION, LS.LS_KEY_IGNORED_DIVERGENCES],
    navigator: { onLine: true, serviceWorker: undefined },
    cloudSession: { user: { id: 'A' } },
    debugRecordingActive: false, performance: { now: function(){ return 0; } },
    showTrashToast: function(t){ calls.push('toast'); },
    location: { reload: function(){ calls.push('reload'); } },
    getSupabaseClient: function(){
      return {
        auth: {
          signOut: async function(){ calls.push('signOut'); },
          getSession: async function(){ return { data: { session: o.stillSignedIn ? { user: { id: 'A' } } : null } }; },
        },
      };
    },
  }, Object.fromEntries(Object.entries(LS)));
  const c = buildSandbox(globals, ['accountLocalStorageKeys', 'clearLocalAccountData', 'revokeDevicePushSubscription', 'performSignOut']);
  return { c, storage, calls, idbRemoved };
}
test('W1: clearLocalAccountData прибирає всі ключі акаунта, лишає тему й статус міграції, чистить IndexedDB мігрованих доменів', async function(){
  const { c, storage, idbRemoved } = signOutSandbox();
  await c.clearLocalAccountData();
  Object.values(LS).forEach(function(k){ assert.equal(storage.getItem(k), null, k); });
  assert.equal(storage.getItem('budget_theme_v1'), 'dark');
  assert.equal(storage.getItem('budget_migration_status_v1'), '{"categories":true}');
  assert.deepEqual(idbRemoved, [LS.LS_KEY_CATEGORIES]);
});
test('W1: performSignOut — порядок: підписка → signOut → очищення → перезапуск; сесія лишилась — нічого не чиститься', async function(){
  const ok = signOutSandbox();
  await ok.c.performSignOut();
  assert.deepEqual(ok.calls, ['signOut', 'reload']);
  assert.equal(ok.storage.getItem(LS.LS_KEY_EXP), null);
  const fail = signOutSandbox({ stillSignedIn: true });
  await fail.c.performSignOut();
  assert.deepEqual(fail.calls, ['signOut', 'toast']);
  assert.notEqual(fail.storage.getItem(LS.LS_KEY_EXP), null); // нічого не очищено, якщо вийти не вдалось
});
test('W2: усі LS_KEY_* (крім теми й статусу міграції) входять у список очищення', function(){
  const keys = [...SRC.matchAll(/const (LS_KEY_[A-Z_]+) = '/g)].map(function(m){ return m[1]; }).filter(function(k){ return k !== 'LS_KEY_THEME' && k !== 'LS_KEY_MIGRATION_STATUS'; });
  const fn = SRC.match(/function accountLocalStorageKeys\(\)\{([\s\S]*?)\n\}/)[1];
  const bk = SRC.match(/const BACKUP_LS_KEYS = \[([\s\S]*?)\];/)[1];
  keys.forEach(function(k){ assert.ok(fn.indexOf(k) !== -1 || bk.indexOf(k) !== -1, 'ключ не очищається при виході: ' + k); });
});
test('W2: вхід B — підписка через claim_push_subscription (не прямий upsert), чужі дані A не лишаються', function(){
  const m = SRC.match(/async function requestPushSubscription\(\)\{([\s\S]*?)\n\}/)[1];
  assert.match(m, /rpc\('claim_push_subscription', \{ p_endpoint: sub\.endpoint, p_p256dh: keys\.p256dh, p_auth: keys\.auth \}\)/);
  assert.ok(!/from\('push_subscriptions'\)\.upsert/.test(m));
});

// ---------- W3: бекап не воскрешає видалене назавжди ----------
function restoreSandbox(purged, localExpenses){
  const storage = fakeStorage(purged ? { budget_purged_records_v1: JSON.stringify(purged) } : {});
  const pushed = [];
  const g = {
    localStorage: storage, expenses: localExpenses || [], incomes: [], pushed,
    restoreFilteredCount: 0, LS_KEY_PURGED_RECORDS: 'budget_purged_records_v1', PURGED_RECORDS_LIMIT: 3000,
    isCloudSessionReady: function(){ return false; },
    UUID_FORMAT_RE: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    saveExpenses: async function(){ return { success: true }; }, saveIncomes: async function(){ return { success: true }; },
    ensureExpenseIdentity: async function(){}, ensureIncomeIdentity: async function(){},
    pushExpensesBatched: async function(l){ l.forEach(function(r){ pushed.push(r.id); }); return { pushed: l.length, failed: 0 }; },
    pushIncomesBatched: async function(l){ l.forEach(function(r){ pushed.push(r.id); }); return { pushed: l.length, failed: 0 }; },
    pullExpensesCore: async function(){}, pullIncomesCore: async function(){},
  };
  const c = buildSandbox(g, ['filterPurgedRecords', 'readPurgedRecords', 'rememberPurgedRecord', 'dropPurgedFromBackup', 'restoreExpensesFromBackup', 'restoreIncomesFromBackup']);
  return c;
}
const ID1 = '11111111-1111-4111-8111-111111111111', ID2 = '22222222-2222-4222-8222-222222222222';
const rec = function(id, extra){ return Object.assign({ id: id, date: '2026-09-01', name: 'X', amount: 100, createdAt: '2026-09-01T10:00:00Z', updatedAt: '2026-09-01T10:00:00Z' }, extra || {}); };
test('W3: витрата з журналу видалених назавжди не повертається з бекапу і не пушиться; інші додаються', async function(){
  const c = restoreSandbox([{ kind: 'expense', id: ID1 }]);
  const res = await c.restoreExpensesFromBackup(JSON.stringify([rec(ID1), rec(ID2)]));
  assert.equal(res.added, 1);
  assert.deepEqual(c.pushed, [ID2]);
  assert.equal(c.restoreFilteredCount, 1);
});
test('W3: те саме для доходів; журнал іншого виду (word) витрату не чіпає', async function(){
  const c = restoreSandbox([{ kind: 'income', id: ID1 }, { kind: 'word', id: ID2 }]);
  const r1 = await c.restoreIncomesFromBackup(JSON.stringify([rec(ID1)]));
  assert.equal(r1.added, 0);
  const r2 = await c.restoreExpensesFromBackup(JSON.stringify([rec(ID2)]));
  assert.equal(r2.added, 1);
});
test('W3: запис у Корзині (tombstone) не повертається в живі навіть новішим бекапом', async function(){
  const local = [rec(ID1, { deletedAt: '2026-09-02T10:00:00Z', updatedAt: '2026-09-02T10:00:00Z' })];
  const c = restoreSandbox(null, local);
  const res = await c.restoreExpensesFromBackup(JSON.stringify([rec(ID1, { updatedAt: '2026-09-05T10:00:00Z' })]));
  assert.equal(res.updated, 0);
  assert.ok(c.expenses[0].deletedAt);
});
test('W3: слово видаляється за id або cloudId; бекап з тим самим cloudId відсікається', function(){
  const c = restoreSandbox([{ kind: 'word', id: 'w-local', cloudId: 'cw-1' }]);
  const kept = c.filterPurgedRecords([{ id: 'x1', cloudId: 'cw-1' }, { id: 'w-local' }, { id: 'ok' }], c.readPurgedRecords(), 'word');
  assert.deepEqual(kept.map(function(r){ return r.id; }), ['ok']);
});
test('W3: removeTrashLocally запам\'ятовує expense/income/word (і чуже видалення при reconcile)', function(){
  assert.match(SRC, /rememberPurgedRecord\(type, arr\[at\]\.id, arr\[at\]\.cloudId\)/);
});
