// PUSH-3 (Rev 2.32.280): самовідновлення підписки: при запуску з дозволом на сповіщення клієнт щоразу викликає claim_push_subscription (upsert за endpoint), тож рядок, видалений на сервері, з'являється знову; після цього стан «на екрані» пишеться заново.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildSandbox, evalInSandbox } = require('./extract');
function run(over){
  const calls = [], syncs = [];
  const sub = { endpoint: 'https://push.example/abcdefghijklmnopqrstuvwxyz', toJSON(){ return { keys: { p256dh: 'p', auth: 'a' } }; } };
  const ctx = buildSandbox(Object.assign({
    window: { PushManager: {} },
    navigator: { serviceWorker: { ready: Promise.resolve({ pushManager: { getSubscription: async () => sub, subscribe: async () => sub } }) } },
    Notification: { permission: 'granted', requestPermission: async () => 'granted' },
    cloudSession: { user: { id: 'u1' } }, cloudFamilyId: 'f1', VAPID_PUBLIC_KEY: 'AAAA',
    isWriteBlocked: () => false,
    getSupabaseClient: () => ({ rpc: async (name, args) => { calls.push([name, args.p_endpoint]); return {}; } }),
    appVisibleLast: true, syncAppVisible: (v) => { syncs.push(v); },
    document: { visibilityState: 'visible' },
  }, over || {}), ['requestPushSubscription', 'urlBase64ToUint8Array']);
  return { ctx, calls, syncs };
}
test('PUSH-3: підписка є в браузері, а на сервері рядка нема → запуск викликає claim (upsert) і заново пише стан «на екрані»', async () => {
  const { ctx, calls, syncs } = run();
  await evalInSandbox(ctx, 'requestPushSubscription()');
  assert.equal(calls.length, 1); assert.equal(calls[0][0], 'claim_push_subscription');
  assert.deepEqual(syncs, [true]);
  assert.equal(evalInSandbox(ctx, 'appVisibleLast'), null, 'кеш скинуто: наступний запис піде в базу');
});
test('PUSH-3: без дозволу, без сесії чи в режимі лише читання — нічого не пишеться', async () => {
  for(const over of [{ Notification: { permission: 'denied', requestPermission: async () => 'denied' } }, { cloudSession: null }, { isWriteBlocked: () => true }]){
    const { ctx, calls, syncs } = run(over);
    await evalInSandbox(ctx, 'requestPushSubscription()');
    assert.equal(calls.length, 0); assert.equal(syncs.length, 0);
  }
});
