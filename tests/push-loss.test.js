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

test('push_id: з data.push_id; з v18 верхній push_id (повтор) має пріоритет, невалідний ігнорується', async function () {
  const w = mk();
  await P.handlePush(req({ user_id: 'u1', title: 'T', push_id: PID, data: { type: 'test' } }), w.deps);
  assert.equal(w.logs[0].push_id, PID);
  await P.handlePush(req({ user_id: 'u1', title: 'T', push_id: 'не-uuid', data: { type: 'test' } }), w.deps);
  assert.equal(w.logs[2 - 1].push_id, null);
  await P.handlePush(req({ user_id: 'u1', title: 'T', data: { type: 'test', push_id: PID } }), w.deps);
  assert.equal(w.logs[2].push_id, PID);
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
  assert.deepEqual(w.logs[0].statuses, [{ ok: false, status: null, reason: 'config_missing', missing: ['VAPID_SUBJECT'], transient: false }]);
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

// PUSH-RETRY (v18): sub_id і transient у statuses, attempt у журналі, only_subs/sub_gone, той самий push_id, виняток після початку відправки.
const SUB2 = { id: 's2', endpoint: 'https://push.test/e2', p256dh: 'k2', auth: 'a2', app_visible: false };
const err = function (code) { const e = new Error('push ' + code); if (code !== null) e.statusCode = code; return e; };

test('PUSH-RETRY: у statuses кожної підписки sub_id (не endpoint), ok без transient, збій з transient за межами; attempt типово 1', async function () {
  const w = mk({ getSubs: async function () { return { data: [SUB, SUB2], error: null }; }, send: async function (s) { if (s.endpoint === SUB2.endpoint) throw err(503); return { statusCode: 201 }; } });
  const res = await P.handlePush(req(BODY), w.deps);
  assert.deepEqual(await res.json(), { sent: 1, failed: 1 });
  assert.equal(w.logs[0].attempt, 1);
  const st = w.logs[0].statuses;
  assert.equal(st[0].sub_id, 's1'); assert.equal(st[0].ok, true);
  assert.equal(st[1].sub_id, 's2'); assert.equal(st[1].transient, true); assert.equal(st[1].status, 503);
  assert.doesNotMatch(JSON.stringify(w.logs), /push\.test|"k2"|"a2"/, 'endpoint і ключі в журнал не потрапляють');
});
test('PUSH-RETRY: transient для кожного коду (429, 500, 503, 408, без статусу — так; 400, 401, 403, 404, 410, 413, 422 — ні)', async function () {
  const yes = [429, 500, 502, 503, 408, null], no = [400, 401, 403, 404, 410, 413, 422];
  for (const code of yes.concat(no)) {
    const w = mk({ send: async function () { throw err(code); } });
    await P.handlePush(req(BODY), w.deps);
    assert.equal(w.logs[0].statuses[0].transient, yes.indexOf(code) !== -1, String(code));
    assert.equal(w.logs[0].statuses[0].reason, 'send_failed');
  }
  assert.equal(P.isTransientStatus(undefined), true);
});
test('PUSH-RETRY: only_subs шле лише вказаним, attempt і push_id з тіла у журналі; чужі/відсутні id — sub_gone без відправки, у failed не рахуються', async function () {
  const w = mk({ getSubs: async function () { return { data: [SUB, SUB2], error: null }; } });
  const res = await P.handlePush(req(Object.assign({}, BODY, { push_id: PID, attempt: 2, only_subs: ['s2', 'нема-такої'] })), w.deps);
  assert.equal(res.status, 200); assert.deepEqual(await res.json(), { sent: 1, failed: 0 });
  assert.equal(w.sends.length, 1); assert.equal(w.sends[0].s.endpoint, SUB2.endpoint);
  assert.equal(w.logs[0].attempt, 2); assert.equal(w.logs[0].push_id, PID);
  assert.deepEqual(w.logs[0].statuses.map(function (x) { return [x.sub_id, x.ok, x.reason || null]; }), [['s2', true, null], ['нема-такої', false, 'sub_gone']]);
  assert.equal(w.logs[0].statuses[1].transient, false);
});
test('PUSH-RETRY: усі вказані підписки зникли (410 раніше) — 200, нічого не шлемо, журнал sub_gone, без повтору', async function () {
  const w = mk({ getSubs: async function () { return { data: [SUB], error: null }; } });
  const res = await P.handlePush(req(Object.assign({}, BODY, { attempt: 3, only_subs: ['втрачена'] })), w.deps);
  assert.equal(res.status, 200); assert.equal(w.sends.length, 0);
  assert.equal(w.logs[0].statuses[0].reason, 'sub_gone'); assert.equal(w.logs[0].failed, 0); assert.equal(w.logs[0].attempt, 3);
});
test('PUSH-RETRY: attempt < 1 або не число — 1, більше 3 — 3; 410 видаляє підписку й transient false', async function () {
  assert.equal(P.attemptOf(0), 1); assert.equal(P.attemptOf(4), 3); assert.equal(P.attemptOf(99), 3); assert.equal(P.attemptOf('x'), 1); assert.equal(P.attemptOf(2), 2); assert.equal(P.attemptOf('3'), 3);
  const w = mk({ send: async function () { throw err(410); } });
  await P.handlePush(req(Object.assign({}, BODY, { attempt: 99 })), w.deps);
  assert.equal(w.deleted[0], 's1'); assert.equal(w.logs[0].attempt, 3); assert.equal(w.logs[0].statuses[0].transient, false);
});
test('PUSH-RETRY: ранні виходи — subs_read_error і auth_check_error transient true; no_subscriptions і config_missing false; attempt пишеться скрізь', async function () {
  let w = mk({ getSubs: async function () { return { data: null, error: { message: 'db' } }; } });
  await P.handlePush(req(Object.assign({}, BODY, { attempt: 2 })), w.deps);
  assert.equal(w.logs[0].statuses[0].transient, true); assert.equal(w.logs[0].attempt, 2);
  w = mk({ verify: async function () { throw new Error('rpc'); } });
  await P.handlePush(req(BODY), w.deps);
  assert.equal(w.logs[0].statuses[0].reason, 'auth_check_error'); assert.equal(w.logs[0].statuses[0].transient, true);
  w = mk({ getSubs: async function () { return { data: [], error: null }; } });
  await P.handlePush(req(BODY), w.deps);
  assert.equal(w.logs[0].statuses[0].transient, false);
});
test('PUSH-RETRY exception: виняток ПІСЛЯ початку відправки — у statuses sub_id уже відправлених (ok true), exception transient; повтор не дублює їх', async function () {
  let n = 0;
  const w = mk({ getSubs: async function () { return { data: [SUB, SUB2], error: null }; }, send: function (s) { n++; if (n === 2) throw new Error('boom'); return Promise.resolve({ statusCode: 201 }); } });
  const res = await P.handlePush(req(BODY), w.deps);
  assert.equal(res.status, 500);
  const st = w.logs[0].statuses;
  assert.deepEqual(st[0], { ok: true, status: 201, format: 'legacy', sub_id: 's1' });
  assert.equal(st[st.length - 1].reason, 'exception'); assert.equal(st[st.length - 1].transient, true);
  assert.equal(w.logs[0].sent, 1);
});
test('PUSH-RETRY exception: виняток ДО відправки — у statuses лише exception без sub_id (повтор усім підпискам)', async function () {
  const w = mk({ getSubs: async function () { throw new Error('rpc down'); } });
  const res = await P.handlePush(req(BODY), w.deps);
  assert.equal(res.status, 500);
  assert.equal(w.logs[0].statuses.length, 1);
  assert.equal(w.logs[0].statuses[0].reason, 'exception'); assert.equal('sub_id' in w.logs[0].statuses[0], false); assert.equal(w.logs[0].statuses[0].transient, true);
});
test('PUSH-RETRY: відсутня колонка attempt (Postgres 42703 і PostgREST PGRST204) — запис без неї; без push_id і attempt — обидві знімаються; інша помилка вставки — log_error без повтору', async function () {
  const mkLog = function (msgFor) { const rows = []; return { rows, fn: async function (row) { rows.push(Object.assign({}, row)); const m = msgFor(row); return m ? { error: m } : { error: null }; } }; };
  let L = mkLog(function (r) { return 'attempt' in r ? { message: 'column "attempt" of relation "push_delivery_log" does not exist', code: '42703' } : null; });
  let w = mk({ insertLog: L.fn });
  let res = await P.handlePush(req(BODY), w.deps);
  assert.equal(L.rows.length, 2); assert.equal('attempt' in L.rows[1], false); assert.equal(L.rows[1].push_id, PID); assert.equal('log_error' in (await res.json()), false);
  L = mkLog(function (r) { return 'attempt' in r ? { message: "Could not find the 'attempt' column of 'push_delivery_log' in the schema cache", code: 'PGRST204' } : null; });
  w = mk({ insertLog: L.fn }); await P.handlePush(req(BODY), w.deps);
  assert.equal(L.rows.length, 2); assert.equal('attempt' in L.rows[1], false);
  L = mkLog(function (r) { if ('attempt' in r) return { message: 'column "attempt" does not exist' }; if ('push_id' in r) return { message: 'column "push_id" does not exist' }; return null; });
  w = mk({ insertLog: L.fn }); res = await P.handlePush(req(BODY), w.deps);
  assert.equal(L.rows.length, 3); assert.equal('push_id' in L.rows[2], false); assert.equal('attempt' in L.rows[2], false); assert.equal('log_error' in (await res.json()), false);
  L = mkLog(function () { return { message: 'permission denied for table push_delivery_log (attempt)', code: '42501' }; });
  w = mk({ insertLog: L.fn }); res = await P.handlePush(req(BODY), w.deps);
  assert.equal(L.rows.length, 1, 'не «колонки нема» — повтору вставки немає'); assert.match((await res.json()).log_error, /permission denied/);
});
test('PUSH-RETRY: only_subs не масив (рядок, число, об\'єкт) — 400, нічого не шлемо й не пишемо; порожній масив — нікому; null — як не заданий', async function () {
  for (const bad of ['s1', 5, { a: 1 }]) {
    const w = mk(); const res = await P.handlePush(req(Object.assign({}, BODY, { only_subs: bad })), w.deps);
    assert.equal(res.status, 400); assert.equal(w.sends.length, 0); assert.equal(w.logs.length, 0);
  }
  let w = mk(); let res = await P.handlePush(req(Object.assign({}, BODY, { only_subs: [] })), w.deps);
  assert.equal(res.status, 200); assert.equal(w.sends.length, 0);
  w = mk(); res = await P.handlePush(req(Object.assign({}, BODY, { only_subs: null })), w.deps);
  assert.equal(w.sends.length, 1);
});
test('PUSH-RETRY exception: синхронний виняток send посеред списку — не дійшли підписки позначені unsent (sub_id, transient true), відправлені лишаються ok', async function () {
  let n = 0; const S3 = { id: 's3', endpoint: 'https://push.test/e3', p256dh: 'k3', auth: 'a3', app_visible: false };
  const w = mk({ getSubs: async function () { return { data: [SUB, SUB2, S3], error: null }; }, send: function () { n++; if (n === 2) throw new Error('boom'); return Promise.resolve({ statusCode: 201 }); } });
  const res = await P.handlePush(req(BODY), w.deps);
  assert.equal(res.status, 500);
  const st = w.logs[0].statuses;
  assert.deepEqual(st.map(function (x) { return [x.sub_id || null, x.ok, x.reason || null]; }), [['s1', true, null], ['s2', false, 'unsent'], ['s3', false, 'unsent'], [null, false, 'exception']]);
  assert.equal(st[1].transient, true); assert.equal(w.logs[0].sent, 1);
});

