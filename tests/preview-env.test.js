// Rev 2.32.75 (K3) — середовище (робоче / мок / лише читання), захисник запису, isWriteBlocked, очищення «голів» при виході.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildSandbox } = require('./extract');

const NAMES = ['WORK_ORIGINS', 'SS_KEY_PREVIEW_REALDB', 'WRITE_BLOCKED_MESSAGE', 'SESSION_EXPIRED_HINT', 'detectCloudEnv', 'classifyBlockedRequest', 'noteWriteBlocked', 'noteSessionExpiredHint',
  'isWriteBlocked', 'isCloudWriteReady', 'countingFetch', 'classifyNetRequest', 'countNetRequest', 'NET_STATS', 'LS_KEY_SYNC_MARKERS', 'LS_KEY_SYNC_HEADS', 'clearSyncMarkers'];
const PROD = 'https://andrii-m17.github.io';
const BASE = 'https://x.supabase.co';

function make(env, over){
  const calls = { fetch: [], mock: [], events: [], toasts: [] };
  const store = new Map([['budget_sync_markers_v1', '{}'], ['budget_sync_heads_v1', '{}']]);
  const g = Object.assign({
    CLOUD_ENV: env, sessionHintAt: 0,
    fetch: function(u, i){ calls.fetch.push([u, i && i.method]); return Promise.resolve({ status: 200 }); },
    window: { MockCloud: { fetch: function(u, i){ calls.mock.push([u, i && i.method]); return Promise.resolve({ status: 200 }); } }, dispatchEvent: function(e){ calls.events.push(e.detail.kind); } },
    CustomEvent: function(n, o){ this.type = n; this.detail = o.detail; },
    showTextToast: function(t){ calls.toasts.push(t); },
    isCloudSessionReady: function(){ return true; },
    localStorage: { getItem: function(k){ return store.has(k) ? store.get(k) : null; }, setItem: function(k, v){ store.set(k, v); }, removeItem: function(k){ store.delete(k); } },
    debugRecordingActive: false,
  }, over || {});
  const ctx = buildSandbox(g, NAMES);
  ctx.__calls = calls; ctx.__store = store;
  return ctx;
}
const ro = { env: 'readonly', label: 'Реальна база · лише читання' };

test('K3 середовище: робочий origin = prod; усе інше (localhost, інший хост, file) = мок; перемикач = лише читання', function(){
  const c = make({ env: 'prod' });
  assert.equal(c.detectCloudEnv(PROD, null).env, 'prod');
  assert.equal(c.detectCloudEnv(PROD, '1').env, 'prod');            // на робочому origin перемикач нічого не змінює
  ['http://localhost:8934', 'http://127.0.0.1:8934', 'https://other.github.io', 'https://andrii-m17.github.io.evil.test', 'null', ''].forEach(function(o){
    assert.equal(c.detectCloudEnv(o, null).env, 'mock', o);
  });
  assert.equal(c.detectCloudEnv('http://localhost:8934', '1').env, 'readonly');
  assert.equal(c.detectCloudEnv('http://localhost:8934', '0').env, 'mock');
  assert.equal(c.detectCloudEnv('http://localhost:8934', null).label, 'Мок');
  assert.equal(c.detectCloudEnv(PROD, null).label, '');
});
test('K3 захисник: кожен тип запису блокується, читання й sync_heads проходять', function(){
  const c = make(ro);
  const k = function(u, m){ return c.classifyBlockedRequest(BASE + u, m); };
  assert.equal(k('/rest/v1/expenses?select=id', 'POST'), 'rest-post');
  assert.equal(k('/rest/v1/expenses?id=eq.1', 'PATCH'), 'rest-patch');
  assert.equal(k('/rest/v1/expenses?id=eq.1', 'PUT'), 'rest-put');
  assert.equal(k('/rest/v1/hidden_entities?id=eq.1', 'DELETE'), 'rest-delete');
  ['claim_push_subscription', 'clear_notifications', 'mark_notifications_read', 'mono_accept', 'mono_apply_refund', 'mono_ignore', 'mono_refund_candidates'].forEach(function(f){
    assert.equal(k('/rest/v1/rpc/' + f, 'POST'), 'rpc', f);
  });
  assert.equal(k('/functions/v1/mono-connect', 'POST'), 'function');
  assert.equal(k('/functions/v1/send-test-push', 'POST'), 'function');
  assert.equal(k('/auth/v1/token?grant_type=refresh_token', 'POST'), 'auth-refresh');
  assert.equal(k('/auth/v1/user', 'PUT'), 'auth');
  assert.equal(k('/auth/v1/signup', 'POST'), 'auth');
  assert.equal(k('/other/thing', 'POST'), 'other');
  // дозволено
  assert.equal(k('/rest/v1/expenses?select=id', 'GET'), null);
  assert.equal(k('/rest/v1/expenses?select=id', 'HEAD'), null);
  assert.equal(k('/rest/v1/rpc/sync_heads', 'POST'), null);
  assert.equal(k('/auth/v1/user', 'GET'), null);
  assert.equal(k('/auth/v1/token?grant_type=password', 'POST'), null);
  assert.equal(k('/auth/v1/logout', 'POST'), null);
});
test('K3 countingFetch у «лише читанні»: запис — мережева помилка (не відповідь), на сервер нічого не йде, подія write-blocked', async function(){
  const c = make(ro);
  await assert.rejects(function(){ return c.countingFetch(BASE + '/rest/v1/expenses', { method: 'POST' }); }, function(e){ return e.message === 'Запис заблоковано (preview)'; });
  await assert.rejects(function(){ return c.countingFetch(BASE + '/auth/v1/token?grant_type=refresh_token', { method: 'POST' }); }, /Запис заблоковано/);
  assert.equal(c.__calls.fetch.length, 0);
  assert.equal(c.__calls.mock.length, 0);
  assert.deepEqual(Array.from(c.__calls.events), ['rest-post', 'auth-refresh']);
  assert.equal(c.__calls.toasts.length, 1);                                         // підказка про закінчену сесію
  assert.match(c.__calls.toasts[0], /Сесія для читання закінчилась/);
  const r = await c.countingFetch(BASE + '/rest/v1/rpc/sync_heads', { method: 'POST' });
  assert.equal(r.status, 200);
  await c.countingFetch(BASE + '/rest/v1/expenses?select=id');
  assert.equal(c.__calls.fetch.length, 2);
});
test('K3 countingFetch у моку: запит ніколи не йде в мережу; без емулятора — помилка (fail-closed)', async function(){
  const c = make({ env: 'mock' });
  await c.countingFetch(BASE + '/rest/v1/expenses', { method: 'POST' });
  assert.equal(c.__calls.fetch.length, 0);
  assert.equal(c.__calls.mock.length, 1);
  const bare = make({ env: 'mock' }, { window: {} });
  await assert.rejects(function(){ return bare.countingFetch(BASE + '/rest/v1/expenses'); }, /Мок Cloud недоступний/);
  assert.equal(bare.__calls.fetch.length, 0);
});
test('K3 робоче середовище не зачеплене: захисника немає, запис іде в мережу як раніше, isWriteBlocked=false', async function(){
  const c = make({ env: 'prod' });
  assert.equal(c.isWriteBlocked(), false);
  assert.equal(c.isCloudWriteReady(), true);
  await c.countingFetch(BASE + '/rest/v1/expenses', { method: 'POST' });
  await c.countingFetch(BASE + '/rest/v1/rpc/mono_accept', { method: 'POST' });
  await c.countingFetch(BASE + '/auth/v1/token?grant_type=refresh_token', { method: 'POST' });
  assert.equal(c.__calls.fetch.length, 3);
  assert.equal(c.__calls.mock.length, 0);
  assert.equal(c.__calls.events.length, 0);
});
test('K3 isWriteBlocked/isCloudWriteReady: лише «читання» блокує push; мок дозволяє (запис іде в емулятор)', function(){
  assert.equal(make(ro).isWriteBlocked(), true);
  assert.equal(make(ro).isCloudWriteReady(), false);
  assert.equal(make({ env: 'mock' }).isWriteBlocked(), false);
  assert.equal(make({ env: 'mock' }).isCloudWriteReady(), true);
  assert.equal(make({ env: 'mock' }, { isCloudSessionReady: function(){ return false; } }).isCloudWriteReady(), false);
});
test('K3 вихід з акаунта: clearSyncMarkers очищає і мітки, і «голови» (разом із purged_at)', function(){
  const c = make({ env: 'prod' });
  c.clearSyncMarkers();
  assert.equal(c.__store.has('budget_sync_markers_v1'), false);
  assert.equal(c.__store.has('budget_sync_heads_v1'), false);
});
test('K3 лише читання: push-функції й autoSyncStale тихо нічого не роблять — без запитів, повторів і помилок', async function(){
  const { buildSandbox: bs } = require('./extract');
  let touched = 0;
  const timers = [];
  const g = { CLOUD_ENV: ro, navigator: { onLine: true }, isCloudSessionReady: function(){ return true; }, getSupabaseClient: function(){ touched++; throw new Error('не мав викликатись'); },
    setTimeout: function(){ timers.push(1); }, clearTimeout: function(){}, autoSyncRunning: false };
  const c = bs(g, ['isWriteBlocked', 'isCloudWriteReady', 'pushExpensesBatch', 'pushHiddenEntitiesPilot', 'autoSyncStale']);
  assert.deepEqual(JSON.parse(JSON.stringify(await c.pushExpensesBatch([{ id: 'x' }]))), { pushed: 0, failed: 0 });
  assert.deepEqual(JSON.parse(JSON.stringify(await c.pushHiddenEntitiesPilot())), { success: true });
  assert.equal(await c.autoSyncStale('resume'), null);
  assert.equal(touched, 0);
  assert.equal(timers.length, 0);
});
