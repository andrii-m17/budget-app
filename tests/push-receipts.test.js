// Rev 2.32.298 (PUSH-RCPT): отримання сповіщень. Сторінка: черга (успіх прибирає, помилка лишає, ≤ 50, ≤ 7 днів, без дублів), подія push-receipt-fail,
// запасний шлях для декларативного формату (тап). Воркер: запис отримання після показу (sw.js у vm із фейковим IndexedDB).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { buildSandbox } = require('./extract');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const SW = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');

const NOW = Date.parse('2026-11-13T12:00:00Z');
const DAY = 86400000;
const uuid = function (n) { return '00000000-0000-4000-8000-' + String(n).padStart(12, '0'); };
const item = function (n, ageMs, o) { return Object.assign({ push_id: uuid(n), received_at: new Date(NOW - (ageMs || 0)).toISOString(), shown_at: new Date(NOW - (ageMs || 0) + 900).toISOString(), cold_start: true, idle_s: 5, app_state: 'closed' }, o || {}); };

function pageEnv(o) {
  o = o || {};
  const env = { queue: (o.queue || []).slice(), deleted: [], bumped: [], rpcCalls: [], events: [], added: [], lookups: [] };
  const globals = {
    isCloudWriteReady: function () { return o.ready !== false; },
    navigator: { onLine: o.online !== false },
    Date: Date,
    pushReceiptsLoad: async function () { return env.queue.slice(); },
    pushReceiptsBump: async function (ids) { env.bumped.push.apply(env.bumped, ids); env.queue.forEach(function (x) { if (ids.indexOf(x.push_id) >= 0) x.tries = (x.tries || 0) + 1; }); },
    awaitCloudGate: async function () { return o.gate || 'ready'; },
    pushReceiptsDelete: async function (ids) { env.deleted.push.apply(env.deleted, ids); env.queue = env.queue.filter(function (x) { return ids.indexOf(x.push_id) === -1; }); },
    pushReceiptAddIfAbsent: async function (it) { env.added.push(it); env.queue.push(it); },
    getSupabaseClient: function () {
      return {
        rpc: async function (name, args) { env.rpcCalls.push({ name: name, args: args }); if (o.throwRpc) throw new Error('сеть впала'); return o.rpcError ? { error: o.rpcError } : { data: args.p_items.length, error: null }; },
        from: function (table) {
          const q = { _f: null, select: function () { return q; }, eq: function (c, v) { env.lookups.push({ table: table, col: c, val: v }); return q; }, order: function () { return q; },
            limit: function () { return Promise.resolve(o.lookupResult || { data: [], error: null }); } };
          return q;
        },
      };
    },
    recOn: function () { return o.rec !== false; },
    pushDebugEvent: function (e) { env.events.push(e); },
    debugRecordingStartedAt: 0,
    performance: { now: function () { return 1000; } },
  };
  env.c = buildSandbox(globals, ['PUSH_RCPT_LIMIT', 'PUSH_RCPT_MAX_AGE_MS', 'PUSH_RCPT_UUID_RE', 'pushReceiptTrim', 'pushReceiptItem', 'PUSH_RCPT_MAX_TRIES', 'pushReceiptFail', 'flushPushReceipts', 'pushReceiptFromTap']);
  vm.runInContext('var pushReceiptsFlushing = false; var navigator = this.navigator;', env.c);
  return env;
}
const j = function (v) { return JSON.parse(JSON.stringify(v)); };

test('черга: успіх прибирає надіслане; один виклик report_push_receipts з усіма елементами', async function () {
  const env = pageEnv({ queue: [item(1, 1000), item(2, 2000)] });
  const r = j(await env.c.flushPushReceipts());
  assert.equal(r.sent, 2);
  assert.equal(env.rpcCalls.length, 1);
  assert.equal(env.rpcCalls[0].name, 'report_push_receipts');
  assert.deepEqual(j(env.rpcCalls[0].args.p_items.map(function (x) { return x.push_id; }).sort()), [uuid(1), uuid(2)]);
  assert.equal(env.queue.length, 0);
  assert.equal(env.events.length, 0);
});

test('черга: помилка виклику лишає елементи й пише подію push-receipt-fail (код, текст, кількість); виняток теж', async function () {
  const env = pageEnv({ queue: [item(1, 1000), item(2, 2000), item(3, 3000)], rpcError: { code: '42501', message: 'new row violates row-level security policy for table "push_receipts"' } });
  const r = j(await env.c.flushPushReceipts());
  assert.equal(r.failed, 3);
  assert.equal(env.queue.length, 3, 'елементи лишились');
  assert.equal(env.events.length, 1);
  const e = env.events[0];
  assert.equal(e.type, 'push-receipt-fail'); assert.equal(e.errorCode, '42501'); assert.equal(e.count, 3);
  assert.match(e.message, /row-level security/);
  const env2 = pageEnv({ queue: [item(1, 1000)], throwRpc: true });
  assert.equal(j(await env2.c.flushPushReceipts()).failed, 1);
  assert.equal(env2.queue.length, 1); assert.equal(env2.events[0].errorCode, 'Error');
  const env3 = pageEnv({ queue: [item(1, 1000)], rpcError: { code: '42501', message: 'x' }, rec: false });
  await env3.c.flushPushReceipts(); assert.equal(env3.events.length, 0, 'самописець вимкнений: без події, але елементи лишились'); assert.equal(env3.queue.length, 1);
});

test('черга: не більше 50 найновіших, старші за 7 днів і невалідні відкидаються, один push_id не дублюється', async function () {
  const q = [];
  for (let i = 1; i <= 55; i++) q.push(item(i, i * 1000)); // i=1 найновіший
  q.push(item(100, 8 * DAY)); // старий
  q.push(item(101, 7 * DAY - 5000)); // ще в межах 7 днів
  q.push({ push_id: 'не-uuid', received_at: new Date(NOW).toISOString() }); // невалідний
  q.push(Object.assign(item(1, 500), { app_state: 'tap' })); // дубль push_id 1
  const env = pageEnv({ queue: q });
  const r = j(await env.c.flushPushReceipts());
  const sentIds = env.rpcCalls[0].args.p_items.map(function (x) { return x.push_id; });
  assert.equal(sentIds.length, 50);
  assert.equal(new Set(sentIds).size, 50, 'без дублів');
  assert.ok(sentIds.indexOf(uuid(100)) === -1, 'старіший за 7 днів відкинуто');
  assert.ok(sentIds.indexOf(uuid(55)) === -1 && sentIds.indexOf(uuid(1)) >= 0, 'залишились найновіші');
  assert.ok(env.deleted.indexOf('не-uuid') >= 0 && env.deleted.indexOf(uuid(100)) >= 0, 'відкинуте прибрано зі сховища');
  assert.ok(r.dropped >= 6);
  const t = j(env.c.pushReceiptTrim([item(1, 1000), item(1, 2000)], NOW));
  assert.equal(t.length, 1, 'повтор того самого push_id не дублює');
});

test('«отруєний» елемент: після 5 невдалих відправок відкидається, а не блокує чергу вічно; лічильник спроб росте лише при помилці', async function () {
  const env = pageEnv({ queue: [item(1, 1000), item(2, 2000)], rpcError: { code: 'XX', message: 'invalid input' } });
  for (let i = 0; i < 5; i++) await env.c.flushPushReceipts();
  assert.equal(env.rpcCalls.length, 5);
  assert.equal(env.events.length, 5, 'кожна невдача фіксується');
  assert.deepEqual(j(env.queue.map(function (x) { return x.tries; })), [5, 5]);
  const r = j(await env.c.flushPushReceipts());
  assert.equal(env.rpcCalls.length, 5, 'після п’яти невдач запиту більше немає');
  assert.equal(r.sent, 0); assert.ok(env.deleted.indexOf(uuid(1)) >= 0 && env.deleted.indexOf(uuid(2)) >= 0, 'відкинуті прибрано зі сховища');
  const ok = pageEnv({ queue: [item(1, 1000, { tries: 2 })] }); assert.equal(j(await ok.c.flushPushReceipts()).sent, 1); assert.equal(ok.bumped.length, 0, 'успіх спроб не рахує');
});

test('черга: без сесії, мережі чи запису нічого не відправляється й не прибирається', async function () {
  const a = pageEnv({ queue: [item(1, 1000)], ready: false }); assert.equal(j(await a.c.flushPushReceipts()).skipped, 'not-ready'); assert.equal(a.rpcCalls.length, 0); assert.equal(a.queue.length, 1);
  const b = pageEnv({ queue: [item(1, 1000)], online: false }); assert.equal(j(await b.c.flushPushReceipts()).skipped, 'not-ready'); assert.equal(b.rpcCalls.length, 0);
  const c = pageEnv({ queue: [] }); assert.equal(j(await c.c.flushPushReceipts()).sent, 0); assert.equal(c.rpcCalls.length, 0, 'порожня черга: запиту немає');
});

test('pushReceiptItem: форма елемента RPC (app_state ≤ 24, ціле idle_s, null для відсутніх)', function () {
  const env = pageEnv();
  const r = j(env.c.pushReceiptItem({ push_id: uuid(7).toUpperCase(), received_at: 'x', shown_at: null, cold_start: 'так', idle_s: 12.6, app_state: 'a'.repeat(40) }));
  assert.equal(r.push_id, uuid(7)); assert.equal(r.shown_at, null); assert.equal(r.cold_start, null); assert.equal(r.idle_s, 13); assert.equal(r.app_state.length, 24);
  assert.equal(j(env.c.pushReceiptItem({ push_id: uuid(8), received_at: 'x' })).app_state, null);
});

test('декларативний формат: тап шукає push_id за inbox_id і ставить запис app_state=tap; без знахідки чи для «latest» нічого', async function () {
  const env = pageEnv({ lookupResult: { data: [{ data: { push_id: uuid(9), inbox_id: 'abc' } }], error: null } });
  await env.c.pushReceiptFromTap('abc');
  assert.deepEqual(j(env.lookups), [{ table: 'user_notifications', col: 'data->>inbox_id', val: 'abc' }]);
  assert.equal(env.added.length, 1);
  assert.equal(env.added[0].push_id, uuid(9)); assert.equal(env.added[0].app_state, 'tap'); assert.equal(env.added[0].received_at, env.added[0].shown_at);
  assert.equal(env.rpcCalls.length, 1, 'після запису черга одразу відправляється');
  const none = pageEnv({ lookupResult: { data: [], error: null } });
  await none.c.pushReceiptFromTap('latest'); assert.equal(none.added.length, 0); assert.equal(none.rpcCalls.length, 0);
  const off = pageEnv({ ready: false }); await off.c.pushReceiptFromTap('abc'); assert.equal(off.lookups.length, 0, 'без сесії запиту немає');
  const cold = pageEnv({ gate: 'signed-out' }); await cold.c.pushReceiptFromTap('abc'); assert.equal(cold.lookups.length, 0, 'шлюз не готовий (немає входу): запиту немає');
});

test('холодний старт за тапом: тап чекає готовності сесії (awaitCloudGate) і лише тоді шукає push_id', async function () {
  const order = [];
  const env = pageEnv({ lookupResult: { data: [{ data: { push_id: uuid(11) } }], error: null } });
  env.c.awaitCloudGate = async function () { order.push('gate'); await new Promise(function (r) { setTimeout(r, 15); }); order.push('ready'); return 'ready'; };
  const p = env.c.pushReceiptFromTap('abc');
  assert.equal(env.lookups.length, 0, 'до готовності сесії запиту немає');
  await p;
  assert.deepEqual(order, ['gate', 'ready']); assert.equal(env.lookups.length, 1); assert.equal(env.added[0].push_id, uuid(11));
});

test('дублі в черзі: лишається найновіший', function () {
  const env = pageEnv();
  const r = j(env.c.pushReceiptTrim([item(1, 5000, { app_state: 'old' }), item(1, 1000, { app_state: 'new' })], NOW));
  assert.equal(r.length, 1); assert.equal(r[0].app_state, 'new');
});

test('охоронні: подія є в білому списку самописця; виклики з старту/входу й тапу підключено; нових полів вводу немає', function () {
  assert.match(SRC, /const REC_ALLOWED_TYPES = \[[^\]]*'push-receipt-fail'/);
  assert.match(SRC, /if\(typeof flushPushReceipts === 'function'\) flushPushReceipts\(\)/);
  const rps = SRC.slice(SRC.indexOf('async function requestPushSubscription'), SRC.indexOf('async function requestPushSubscription') + 900);
  assert.ok(rps.indexOf('flushPushReceipts') > 0 && rps.indexOf('flushPushReceipts') < rps.indexOf('Notification.permission'), 'відправка черги не залежить від дозволу й підписки');
  assert.match(SRC, /if\(typeof pushReceiptFromTap === 'function'\) pushReceiptFromTap\(id\)/);
  const rc = SW.slice(SW.indexOf('const RCPT_DB_NAME'), SW.indexOf("self.addEventListener('notificationclick'")).replace(/\/\/[^\n]*/g, '');
  assert.ok(rc.length > 500 && !/\.rpc\(|fetch\(|XMLHttpRequest/.test(rc), 'збір отримань у воркері мережі не торкається (токен сесії лише в сторінці)');
  assert.match(SRC, /rpc\('report_push_receipts', \{ p_items: items \}\)/);
});

// ---------- воркер ----------
function makeIdb(opts) {
  opts = opts || {};
  const dbs = {}; const later = function (fn) { setTimeout(fn, 0); };
  return {
    _dbs: dbs,
    open: function (name) {
      const req = {};
      if (opts.hang === name) return req;
      later(function () {
        const fresh = !dbs[name]; dbs[name] = dbs[name] || { stores: {}, cfg: {} }; const db = dbs[name];
        const api = {
          objectStoreNames: { contains: function (n) { return !!db.stores[n]; } },
          createObjectStore: function (n, c) { db.stores[n] = {}; db.cfg[n] = { keyPath: c && c.keyPath, auto: !!(c && c.autoIncrement) }; },
          transaction: function (n) {
            const tx = {}; const nm = Array.isArray(n) ? n[0] : n; const data = db.stores[nm]; const cfg = db.cfg[nm]; let seq = data.__seq || 0;
            tx.objectStore = function () {
              return {
                add: function (v) { const r = {}; later(function () { const k = cfg.auto ? ++seq : v[cfg.keyPath]; data.__seq = seq; if (cfg.auto && cfg.keyPath) v[cfg.keyPath] = k; if (!cfg.auto && data[k]) { r.error = { name: 'ConstraintError' }; r.onerror && r.onerror({ preventDefault: function () {} }); return; } data[k] = v; r.onsuccess && r.onsuccess(); }); return r; },
                put: function (v, key) { const r = {}; later(function () { data[key !== undefined ? key : v[cfg.keyPath]] = v; r.onsuccess && r.onsuccess(); }); return r; },
                get: function (key) { const r = {}; later(function () { r.result = data[key]; r.onsuccess && r.onsuccess(); }); return r; },
                getAll: function () { const r = {}; later(function () { r.result = Object.keys(data).filter(function (k) { return k !== '__seq'; }).map(function (k) { return data[k]; }); r.onsuccess && r.onsuccess(); }); return r; },
                getAllKeys: function () { const r = {}; later(function () { r.result = Object.keys(data).filter(function (k) { return k !== '__seq'; }).map(Number).filter(function (x) { return !isNaN(x); }); r.onsuccess && r.onsuccess(); }); return r; },
                delete: function (k) { later(function () { delete data[k]; }); },
              };
            };
            later(function () { later(function () { later(function () { later(function () { tx.oncomplete && tx.oncomplete(); }); }); }); });
            return tx;
          },
          close: function () {},
        };
        req.result = api;
        if (fresh && req.onupgradeneeded) req.onupgradeneeded();
        req.onsuccess && req.onsuccess();
      });
      return req;
    },
  };
}
function runSw(o) {
  o = o || {};
  const handlers = {}; const shown = []; const idb = o.idb || makeIdb();
  let nowMs = o.now || NOW;
  const FakeDate = function () { return new Date(nowMs); }; FakeDate.now = function () { return nowMs; }; FakeDate.parse = Date.parse;
  const sandbox = { self: null, caches: { keys: async function () { return []; }, delete: async function () { return true; } }, console: { log() {}, warn() {}, error() {} }, Promise, indexedDB: idb, setTimeout, clearTimeout, Date: Object.assign(function (v) { return v === undefined ? new Date(nowMs) : new Date(v); }, { now: function () { return nowMs; }, parse: Date.parse }) };
  sandbox.self = { addEventListener: function (n, fn) { handlers[n] = fn; }, registration: { showNotification: function (t, op) { shown.push([t, op]); return Promise.resolve(); } },
    clients: o.clients || { matchAll: async function () { return [{ visibilityState: 'hidden' }]; }, claim: async function () {} }, skipWaiting: function () {} };
  vm.createContext(sandbox); vm.runInContext(SW, sandbox);
  return { handlers: handlers, shown: shown, idb: idb, advance: function (ms) { nowMs += ms; }, sandbox: sandbox };
}
async function push(env, payload) {
  let waited = null;
  env.handlers.push({ data: { json: function () { return payload; } }, waitUntil: function (p) { waited = p; } });
  await Promise.resolve(waited).catch(function () {});
  await new Promise(function (r) { setTimeout(r, 30); });
}
const receipts = function (env) { const d = env.idb._dbs['budget-app-push-receipts']; return d ? Object.keys(d.stores.queue).filter(function (k) { return k !== '__seq'; }).map(function (k) { return d.stores.queue[k]; }) : []; };
const P = function (n, extra) { return { title: 'Заголовок', body: 'Текст', data: Object.assign({ type: 'mono-inbox', tag: 'mono-inbox', push_id: uuid(n) }, extra || {}) }; };

test('воркер: показ → запис отримання (received_at ≤ shown_at, cold_start лише для першого push, idle_s, app_state)', async function () {
  const env = runSw();
  await push(env, P(1));
  assert.equal(env.shown.length, 1, 'сповіщення показано');
  let r = receipts(env);
  assert.equal(r.length, 1);
  assert.equal(r[0].push_id, uuid(1));
  assert.ok(Date.parse(r[0].received_at) <= Date.parse(r[0].shown_at));
  assert.equal(r[0].cold_start, true); assert.equal(typeof r[0].idle_s, 'number'); assert.equal(r[0].app_state, 'hidden');
  env.advance(90000);
  await push(env, P(2));
  r = receipts(env).filter(function (x) { return x.push_id === uuid(2); });
  assert.equal(r[0].cold_start, false, 'другий push того самого екземпляра воркера не холодний');
  assert.equal(r[0].idle_s, 90, 'idle_s: секунд від попереднього push');
});

test('воркер: app_state visible/closed; невалідний або відсутній push_id нічого не пише; повтор того самого push_id не дублює', async function () {
  const vis = runSw({ clients: { matchAll: async function () { return [{ visibilityState: 'visible' }, { visibilityState: 'hidden' }]; }, claim: async function () {} } });
  await push(vis, P(3)); assert.equal(receipts(vis)[0].app_state, 'visible');
  const closed = runSw({ clients: { matchAll: async function () { return []; }, claim: async function () {} } });
  await push(closed, P(4)); assert.equal(receipts(closed)[0].app_state, 'closed');
  const bad = runSw();
  await push(bad, P(5, { push_id: 'pid-1' })); await push(bad, { title: 'T', body: 'B', data: { type: 'test' } }); await push(bad, {});
  assert.equal(receipts(bad).length, 0); assert.equal(bad.shown.length, 3, 'сповіщення все одно показуються');
  const dup = runSw();
  await push(dup, P(6)); await push(dup, P(6));
  assert.equal(receipts(dup).length, 1);
});

test('воркер: черга ≤ 50 найновіших, старші за 7 днів відкидаються при записі', async function () {
  const env = runSw();
  await push(env, P(7));
  const db = env.idb._dbs['budget-app-push-receipts'];
  db.stores.queue[uuid(900)] = { push_id: uuid(900), received_at: new Date(NOW - 8 * DAY).toISOString() }; // старий
  for (let i = 0; i < 52; i++) db.stores.queue[uuid(1000 + i)] = { push_id: uuid(1000 + i), received_at: new Date(NOW - 60000 - i * 1000).toISOString() };
  env.advance(1000);
  await push(env, P(8));
  const r = receipts(env);
  assert.equal(r.length, 50);
  assert.ok(!r.some(function (x) { return x.push_id === uuid(900); }), 'старіший за 7 днів прибрано');
  assert.ok(r.some(function (x) { return x.push_id === uuid(8); }), 'новий запис лишився');
});

test('воркер: IndexedDB черги не відповідає: сповіщення показано, обробник завершується за тайм-аутом', async function () {
  const env = runSw({ idb: makeIdb({ hang: 'budget-app-push-receipts' }) });
  const t0 = Date.now();
  let waited = null;
  env.handlers.push({ data: { json: function () { return P(10); } }, waitUntil: function (p) { waited = p; } });
  assert.equal(env.shown.length, 1, 'showNotification викликано синхронно, до будь-якого await');
  await Promise.resolve(waited).catch(function () {});
  assert.ok(Date.now() - t0 < 2500);
});
