// PUSH-LOSS: send-push-notification пише push_delivery_log на кожному виході, з push_id і причиною, і читає помилку вставки.
// Логіка в supabase/functions/_shared/push.ts (Node виконує .ts напряму); база й web-push замінені моками. Лише синтетичні дані.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

let P;
test.before(async function () {
  P = await import(pathToFileURL(path.join(__dirname, '..', 'supabase', 'functions', '_shared', 'push.ts')).href);
});

const PID = '11111111-2222-4333-8444-555555555555';
const SUB = { id: 's1', endpoint: 'https://push.test/e1', p256dh: 'k', auth: 'a', app_visible: false };

function mk(o) {
  o = o || {};
  const w = { logs: [], sends: [], deleted: [] };
  w.deps = {
    verifySecret: o.verify || (async function () { return { data: true, error: null }; }),
    getSubs: o.getSubs || (async function () { return { data: [SUB], error: null }; }),
    deleteSub: async function (id) { w.deleted.push(id); },
    send: o.send || (async function (s, m) { w.sends.push({ s: s, m: m }); return { statusCode: 201 }; }),
    insertLog: o.insertLog || (async function (row) { w.logs.push(row); return { error: null }; }),
    declarativeUsers: new Set(),
    appUrl: 'https://app.test/index.html',
  };
  return w;
}
function req(body, secret, method) {
  const init = { method: method || 'POST', headers: { 'x-push-secret': secret || 's' } };
  if (init.method === 'POST') init.body = typeof body === 'string' ? body : JSON.stringify(body);
  return new Request('https://x.test/functions/v1/send-push-notification', init);
}
const BODY = { user_id: 'u1', title: 'T', body: 'B', data: { type: 'installment-deadline', tag: 'installment-deadline', push_id: PID } };

test('успіх: один запис журналу з push_id, відповідь без log_error', async function () {
  const w = mk();
  const res = await P.handlePush(req(BODY), w.deps);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { sent: 1, failed: 0 });
  assert.equal(w.logs.length, 1);
  assert.equal(w.logs[0].push_id, PID);
  assert.equal(w.logs[0].sent, 1);
  assert.equal(w.logs[0].statuses[0].ok, true);
});

test('«немає підписок»: журнал пишеться з причиною no_subscriptions', async function () {
  const w = mk({ getSubs: async function () { return { data: [], error: null }; } });
  const res = await P.handlePush(req(BODY), w.deps);
  assert.equal(res.status, 200);
  assert.equal(w.logs.length, 1);
  assert.equal(w.logs[0].statuses[0].reason, 'no_subscriptions');
  assert.equal(w.logs[0].push_id, PID);
  assert.equal(w.logs[0].subscriptions, 0);
});

test('помилка читання підписок: 500, журнал subs_read_error', async function () {
  const w = mk({ getSubs: async function () { return { data: null, error: { message: 'db down' } }; } });
  const res = await P.handlePush(req(BODY), w.deps);
  assert.equal(res.status, 500);
  assert.equal(w.logs.length, 1);
  assert.equal(w.logs[0].statuses[0].reason, 'subs_read_error');
  assert.equal(w.logs[0].failed, 1);
});

test('збій перевірки секрету (RPC error): 401, журнал auth_check_error', async function () {
  const w = mk({ verify: async function () { return { data: null, error: { message: 'rpc timeout' } }; } });
  const res = await P.handlePush(req(BODY), w.deps);
  assert.equal(res.status, 401);
  assert.equal(w.logs.length, 1);
  assert.equal(w.logs[0].statuses[0].reason, 'auth_check_error');
  assert.equal(w.logs[0].push_id, PID);
  assert.equal(w.sends.length, 0);
});

test('невірний секрет: 401 і журнал НЕ пишеться (захист від засмічення)', async function () {
  const w = mk({ verify: async function () { return { data: false, error: null }; } });
  const res = await P.handlePush(req(BODY, 'bad'), w.deps);
  assert.equal(res.status, 401);
  assert.equal(w.logs.length, 0);
  assert.equal(w.sends.length, 0);
});

test('непередбачений виняток (getSubs кидає): 500, журнал exception', async function () {
  const w = mk({ getSubs: async function () { throw new Error('boom'); } });
  const res = await P.handlePush(req(BODY), w.deps);
  assert.equal(res.status, 500);
  assert.equal(w.logs.length, 1);
  assert.equal(w.logs[0].statuses[0].reason, 'exception');
});

test('збій відправки (410): підписку видалено, журнал send_failed зі статусом', async function () {
  const w = mk({ send: async function () { const e = new Error('gone'); e.statusCode = 410; throw e; } });
  const res = await P.handlePush(req(BODY), w.deps);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { sent: 0, failed: 1 });
  assert.deepEqual(w.deleted, ['s1']);
  assert.equal(w.logs[0].statuses[0].status, 410);
  assert.equal(w.logs[0].statuses[0].reason, 'send_failed');
});

test('помилка вставки журналу читається й повертається як log_error (не мовчить)', async function () {
  const w = mk({ insertLog: async function () { return { error: { message: 'insert denied' } }; } });
  const res = await P.handlePush(req(BODY), w.deps);
  assert.equal(res.status, 200);
  const j = await res.json();
  assert.equal(j.sent, 1);
  assert.match(j.log_error, /insert denied/);
});

test('кидання insertLog не ламає відповідь', async function () {
  const w = mk({ insertLog: async function () { throw new Error('net'); } });
  const res = await P.handlePush(req(BODY), w.deps);
  assert.equal(res.status, 200);
  assert.match((await res.json()).log_error, /net/);
});

test('колонки push_id ще нема: повтор вставки без неї, запис не губиться', async function () {
  const rows = [];
  const w = mk({
    insertLog: async function (row) {
      rows.push(Object.assign({}, row));
      return 'push_id' in row ? { error: { message: 'column "push_id" does not exist' } } : { error: null };
    },
  });
  const res = await P.handlePush(req(BODY), w.deps);
  assert.deepEqual(await res.json(), { sent: 1, failed: 0 });
  assert.equal(rows.length, 2);
  assert.equal('push_id' in rows[1], false);
});

test('два одночасні виклики для двох користувачів: обидва мають запис журналу', async function () {
  const w = mk({
    getSubs: async function (u) { await new Promise(function (r) { setTimeout(r, u === 'u1' ? 20 : 5); }); return { data: [SUB], error: null }; },
  });
  const b2 = Object.assign({}, BODY, { user_id: 'u2', data: Object.assign({}, BODY.data, { push_id: '99999999-2222-4333-8444-555555555555' }) });
  const rs = await Promise.all([P.handlePush(req(BODY), w.deps), P.handlePush(req(b2), w.deps)]);
  assert.deepEqual(rs.map(function (r) { return r.status; }), [200, 200]);
  assert.deepEqual(w.logs.map(function (l) { return l.user_id; }).sort(), ['u1', 'u2']);
  assert.equal(w.sends.length, 2);
});

test('push_id невалідний або відсутній: null, запис усе одно є', async function () {
  const w = mk();
  await P.handlePush(req({ user_id: 'u1', title: 'T', data: { type: 'test', push_id: 'x; drop' } }), w.deps);
  assert.equal(w.logs[0].push_id, null);
});

test('GET: 405; відсутній user_id/title: 400 без запису', async function () {
  const w = mk();
  assert.equal((await P.handlePush(req('', 's', 'GET'), w.deps)).status, 405);
  assert.equal((await P.handlePush(req({ title: 'T' }), w.deps)).status, 400);
  assert.equal(w.logs.length, 0);
});

test('формат: декларативний лише mono-inbox + пілот + застосунок на екрані (поведінку збережено)', function () {
  const u = new Set(['u1']);
  assert.equal(P.pickFormat('mono-inbox', 'u1', true, u), 'declarative');
  assert.equal(P.pickFormat('mono-inbox', 'u2', true, u), 'legacy');
  assert.equal(P.pickFormat('installment-deadline', 'u1', true, u), 'legacy');
  assert.equal(P.inboxTarget({ inbox_id: 'a-b_1' }), 'a-b_1');
  assert.equal(P.inboxTarget({ inbox_id: '../x' }), 'latest');
});

test('push_id читається лише з data.push_id, верхній рівень тіла ігнорується', async function () {
  const w = mk();
  await P.handlePush(req({ user_id: 'u1', title: 'T', push_id: PID, data: { type: 'test' } }), w.deps);
  assert.equal(w.logs[0].push_id, null);
  await P.handlePush(req({ user_id: 'u1', title: 'T', data: { type: 'test', push_id: PID } }), w.deps);
  assert.equal(w.logs[1].push_id, PID);
});

// PUSH-GUARD (v17): обов'язкові секрети VAPID; нема хоча б одного — не шлемо, пишемо config_missing, 503. Лише назви секретів у журналі й відповіді.
const REQUIRED = ['VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'VAPID_SUBJECT'];
function missingOf(env) { return REQUIRED.filter(function (n) { return !String(env[n] == null ? '' : env[n]).trim(); }); }

test('PUSH-GUARD X1: без VAPID_SUBJECT — send не викликається, журнал config_missing з missing, відповідь 503', async function () {
  const w = mk(); w.deps.missingConfig = missingOf({ VAPID_PUBLIC_KEY: 'pub', VAPID_PRIVATE_KEY: 'priv' });
  const res = await P.handlePush(req(BODY), w.deps);
  assert.equal(res.status, 503);
  assert.deepEqual(await res.json(), { error: 'config_missing' });
  assert.equal(w.sends.length, 0);
  assert.equal(w.logs.length, 1);
  assert.equal(w.logs[0].subscriptions, 0); assert.equal(w.logs[0].sent, 0); assert.equal(w.logs[0].failed, 1);
  assert.equal(w.logs[0].push_id, PID);
  assert.deepEqual(w.logs[0].statuses, [{ ok: false, status: null, reason: 'config_missing', missing: ['VAPID_SUBJECT'] }]);
});
test('PUSH-GUARD X2: кожен із трьох секретів (відсутній чи порожній рядок/пробіли) блокує відправку; значення секретів у журнал і відповідь не потрапляють', async function () {
  const full = { VAPID_PUBLIC_KEY: 'pub-secret-value', VAPID_PRIVATE_KEY: 'priv-secret-value', VAPID_SUBJECT: 'mailto:ops@test.invalid' };
  for (const name of REQUIRED) {
    for (const bad of [undefined, '', '   ']) {
      const env = Object.assign({}, full); if (bad === undefined) delete env[name]; else env[name] = bad;
      const w = mk(); w.deps.missingConfig = missingOf(env);
      const res = await P.handlePush(req(BODY), w.deps);
      const txt = await res.text();
      assert.equal(res.status, 503, name + ' ' + JSON.stringify(bad));
      assert.equal(w.sends.length, 0);
      assert.deepEqual(w.logs[0].statuses[0].missing, [name]);
      const all = txt + JSON.stringify(w.logs);
      assert.doesNotMatch(all, /secret-value|ops@test/, 'значень секретів у журналі й відповіді нема');
    }
  }
  const w = mk(); w.deps.missingConfig = missingOf({});
  await P.handlePush(req(BODY), w.deps);
  assert.deepEqual(w.logs[0].statuses[0].missing, REQUIRED);
});
test('PUSH-GUARD: невірний секрет запиту при відсутній конфігурації — 401 без запису (захист журналу); без user_id — 503 без запису', async function () {
  const w = mk({ verify: async function () { return { data: false, error: null }; } }); w.deps.missingConfig = ['VAPID_SUBJECT'];
  const r1 = await P.handlePush(req(BODY), w.deps);
  assert.equal(r1.status, 401); assert.equal(w.logs.length, 0);
  const w2 = mk(); w2.deps.missingConfig = ['VAPID_SUBJECT'];
  const r2 = await P.handlePush(req({ title: 'T' }), w2.deps);
  assert.equal(r2.status, 503); assert.equal(w2.logs.length, 0);
});
test('PUSH-GUARD X3: з усіма секретами (порожній missingConfig) поведінка як раніше', async function () {
  const w = mk(); w.deps.missingConfig = missingOf({ VAPID_PUBLIC_KEY: 'a', VAPID_PRIVATE_KEY: 'b', VAPID_SUBJECT: 'c' });
  const res = await P.handlePush(req(BODY), w.deps);
  assert.equal(res.status, 200); assert.equal(w.sends.length, 1); assert.equal(w.logs[0].statuses[0].ok, true);
});
test('PUSH-GUARD: index.ts — обов\'язкові секрети без запасних значень, setVapidDetails лише коли конфігурація повна', function () {
  const SRCI = require('node:fs').readFileSync(path.join(__dirname, '..', 'supabase', 'functions', 'send-push-notification', 'index.ts'), 'utf8');
  assert.doesNotMatch(SRCI, /noreply@example/);
  assert.match(SRCI, /REQUIRED_SECRETS = \["VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "VAPID_SUBJECT"\]/);
  assert.match(SRCI, /if \(!MISSING_CONFIG\.length\) \{\s*webpush\.setVapidDetails\(/);
  assert.match(SRCI, /missingConfig: MISSING_CONFIG/);
  assert.doesNotMatch(SRCI, /VAPID_SUBJECT"\) \?\?/);
});

