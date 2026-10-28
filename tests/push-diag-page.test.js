// Rev 2.32.103 (NOTIF-3 Rev 2): розширена діагностика сповіщень на боці сторінки: за замовчуванням вимкнено, без тексту, лише за дотиком.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildSandbox } = require('./extract');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const NAMES = ['pushDiagLineText', 'pushEndpointHash', 'readPushDiagFlag', 'pushDiagOpen', 'sendPushDiagLog', 'refreshPushSubscription', 'PUSH_DIAG_DB', 'buildPushSeriesPlan', 'startPushTestSeries', 'PUSH_SERIES_PATTERNS', 'PUSH_SERIES_TAGS'];

test('pushDiagLineText: рядок події без тексту сповіщення; поля type/№/мс/вікон/помилка', () => {
  const c = buildSandbox({}, NAMES);
  const t = new Date(2026, 9, 16, 11, 52, 8).getTime();
  assert.equal(c.pushDiagLineText({ ts: t, ev: 'push-received', type: 'mono-inbox', vis: 0 }), '16.10 11:52:08 · push-received · mono-inbox · вікон 0');
  assert.equal(c.pushDiagLineText({ ts: t, ev: 'show-ok', dur: 42, seq: '3' }), '16.10 11:52:08 · show-ok · №3 · 42 мс');
  assert.equal(c.pushDiagLineText({ ts: t, ev: 'show-error', err: 'show: x' }), '16.10 11:52:08 · show-error · show: x');
});
test('pushEndpointHash: перші 8 hex SHA-256 (стабільно), без ендпоінта; збій crypto → unavailable', async () => {
  const c = buildSandbox({ crypto: require('node:crypto').webcrypto, TextEncoder }, NAMES);
  const h = await c.pushEndpointHash('https://example.invalid/abc');
  assert.match(h, /^[0-9a-f]{8}$/);
  assert.equal(h, await c.pushEndpointHash('https://example.invalid/abc'));
  assert.notEqual(h, await c.pushEndpointHash('https://example.invalid/abd'));
  assert.equal(await buildSandbox({ crypto: undefined, TextEncoder }, NAMES).pushEndpointHash('x'), 'unavailable');
});
test('прапорець за замовчуванням вимкнено; недоступний IndexedDB = вимкнено', async () => {
  const c = buildSandbox({ indexedDB: { open(){ throw new Error('нема'); } } }, NAMES);
  assert.equal(await c.readPushDiagFlag(), false);
});
test('sendPushDiagLog: без Cloud-сесії нічого не шле; у «лише перегляд» блокується; payload без id подій, scenario push-diag', async () => {
  const toasts = [];
  const none = buildSandbox({ isCloudSessionReady: () => false, showTextToast: (t, k) => toasts.push(t) }, NAMES);
  await none.sendPushDiagLog();
  assert.deepEqual(toasts, ['Немає Cloud-сесії']);
  let inserted = null;
  const evs = [{ id: 7, ts: 1, ev: 'push-received', type: 'mono-inbox' }];
  const ok = buildSandbox({
    isCloudSessionReady: () => true, blockedByReadOnly: () => false, showTextToast: (t) => toasts.push(t), APP_VERSION: '2.32.103', cloudFamilyId: 'fam', cloudSession: { user: { id: 'u' } },
    DEBUG_LOG_MAX_EVENTS_FOR_SEND: 3000, DEBUG_LOG_MAX_BYTES_FOR_SEND: 600000, trimEventsForSizeLimit: (e) => e,
    readPushDiagEvents: async () => evs, jsErrReadAll: async () => [], jsErrToLogEvents: () => [], buildPushDiagSnapshot: async () => ({ permission: 'granted' }), document: { getElementById: () => null },
    getSupabaseClient: () => ({ from: (t) => ({ insert: async (row) => { inserted = { t, row }; return { error: null }; } }) }),
  }, NAMES);
  await ok.sendPushDiagLog();
  assert.deepEqual(toasts.slice(1), ['Лог сповіщень надіслано']);
  assert.equal(inserted.t, 'client_debug_logs'); assert.equal(inserted.row.scenario, 'push-diag');
  assert.ok(!('id' in inserted.row.events[0])); assert.equal(inserted.row.device.permission, 'granted');
  const blocked = buildSandbox({ isCloudSessionReady: () => true, blockedByReadOnly: () => true, getSupabaseClient: () => { throw new Error('не мав викликатись'); } }, NAMES);
  await blocked.sendPushDiagLog();
});
test('refreshPushSubscription: без дозволу, без сесії і в «лише перегляд» підписку НЕ чіпає', async () => {
  const toasts = [];
  const base = { showTextToast: t => toasts.push(t), navigator: { serviceWorker: { get ready(){ throw new Error('не мав викликатись'); } } }, PushManager: function(){}, document: { getElementById: () => null } };
  const g = Object.assign({}, base, { window: { PushManager: function(){} }, Notification: { permission: 'denied' }, isCloudSessionReady: () => true, isWriteBlocked: () => false });
  await buildSandbox(g, NAMES).refreshPushSubscription();
  const ro = Object.assign({}, g, { Notification: { permission: 'granted' }, isWriteBlocked: () => true, blockedByReadOnly: () => true });
  await buildSandbox(ro, NAMES).refreshPushSubscription();
  assert.ok(toasts.length >= 1);
});
test('джерело: режим розробника не вмикається сам; діагностика не пише при старті; кнопки лише в увімкненому режимі; жодного тексту сповіщення в подіях', () => {
  assert.match(SRC, /id="push-diag-btn"[^>]*role="switch" aria-checked="false"[^>]*onclick="togglePushDiag\(\)"/); // Rev 2.32.189 (CHECKS-1): перемикач; вимкнено за замовчуванням
  assert.match(SRC, /id="push-diag-label">Розширена діагностика</);
  assert.equal((SRC.match(/writePushDiagFlag\(/g) || []).length, 2, 'лише визначення і togglePushDiag');
  const open = SRC.slice(SRC.indexOf('function openTestingDrawer(){'), SRC.indexOf('function closeTestingDrawer'));
  assert.match(open, /renderPushDiag\(\)/);
  const render = SRC.slice(SRC.indexOf('async function renderPushDiag'), SRC.indexOf('async function togglePushDiag'));
  assert.ok(render.indexOf('if(!on) return;') < render.indexOf("mk('push-diag-send-btn'"), 'кнопки лише при увімкненому режимі');
  assert.match(render, /mk\('push-diag-refresh-btn'/);
  const sw = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');
  const meta = sw.slice(sw.indexOf('function diagMeta'), sw.indexOf('function diagVisible'));
  assert.ok(!/title|body/.test(meta), 'у метаданих подій немає тексту');
  assert.ok(!/fetch\(/.test(sw.slice(sw.indexOf('const DIAG_DB_NAME'), sw.indexOf('// Rev 2.32.101 (NOTIF-3 Rev 1)'))), 'діагностика воркера не робить мережевих запитів');
});

// ===== Rev 2.32.104 (NOTIF-3 Rev 3): серія тестових push =====
test('buildPushSeriesPlan: кількість 1–10, інтервали ≥ 60 с, схема mix добивається останнім, tag лише відомий', () => {
  const c = buildSandbox({}, NAMES);
  const j = v => JSON.parse(JSON.stringify(v));
  assert.deepEqual(j(c.buildPushSeriesPlan('6', 'mix', 'mono-inbox')), { ok: true, count: 6, intervals_s: [60, 60, 300, 600, 600], tag: 'mono-inbox' });
  assert.deepEqual(j(c.buildPushSeriesPlan(3, 'p5', 'test')), { ok: true, count: 3, intervals_s: [300, 300], tag: 'test' });
  assert.deepEqual(j(c.buildPushSeriesPlan(1, 'p1', 'mono-inbox')).intervals_s, []);
  assert.deepEqual(j(c.buildPushSeriesPlan(10, 'mix', 'mono-inbox')).intervals_s, [60, 60, 300, 600, 600, 600, 600, 600, 600]);
  ['0', '11', '2.5', 'x', ''].forEach(n => assert.equal(c.buildPushSeriesPlan(n, 'p1', 'mono-inbox').ok, false, String(n)));
  assert.equal(c.buildPushSeriesPlan(3, 'toString', 'mono-inbox').ok, false);
  assert.equal(c.buildPushSeriesPlan(3, 'p1', 'evil').ok, false);
  ['p1', 'p2', 'p5', 'p10', 'mix'].forEach(k => assert.ok(c.buildPushSeriesPlan(10, k, 'test').intervals_s.every(x => x >= 60), 'інтервал ≥ 1 хв: ' + k));
});
test('startPushTestSeries: RPC з p_count/p_intervals_s/p_tag; помилка series already running → повідомлення; без сесії й у «лише перегляд» не викликає; без клієнтських таймерів', async () => {
  const toasts = [], calls = [];
  const els = { fldpush1: { value: '4' }, fldpush2: { value: 'mix' }, fldpush3: { value: 'mono-inbox' }, 'push-diag-result': { textContent: '' }, 'push-series-start-btn': { disabled: false } };
  const mk = (over, reply) => buildSandbox(Object.assign({ document: { getElementById: id => els[id] || null }, showTextToast: t => toasts.push(t), isCloudSessionReady: () => true, blockedByReadOnly: () => false,
    getSupabaseClient: () => ({ rpc: async (n, a) => { calls.push({ n, a }); return reply(); } }) }, over), NAMES);
  await mk({}, () => ({ data: 'sid', error: null })).startPushTestSeries();
  assert.deepEqual(JSON.parse(JSON.stringify(calls)), [{ n: 'start_test_push_series', a: { p_count: 4, p_tag: 'mono-inbox', p_intervals_s: [60, 60, 300] } }]);
  assert.match(els['push-diag-result'].textContent, /Серію запущено.*заблокуйте телефон/);
  await mk({}, () => ({ error: { message: 'series already running' } })).startPushTestSeries();
  assert.ok(toasts.indexOf('Серія вже запущена') !== -1);
  calls.length = 0;
  await mk({ isCloudSessionReady: () => false }, () => ({})).startPushTestSeries();
  await mk({ blockedByReadOnly: () => true }, () => ({})).startPushTestSeries();
  assert.equal(calls.length, 0);
  els.fldpush1.value = '99';
  await mk({}, () => ({})).startPushTestSeries();
  assert.equal(calls.length, 0, 'невалідна форма не викликає RPC');
  const body = SRC.slice(SRC.indexOf('async function startPushTestSeries'), SRC.indexOf('function pushSeriesSelect'));
  assert.ok(!/setTimeout|setInterval/.test(body), 'без клієнтських таймерів');
  const form = SRC.slice(SRC.indexOf('function pushSeriesSelect'), SRC.indexOf('async function renderPushDiag'));
  assert.ok(!/createElement\('input'\)|<input/.test(form), 'форма без текстових полів');
  assert.ok(SRC.indexOf("mk('push-diag-send-btn'") < SRC.indexOf("mk('push-series-start-btn'"), 'форма серії лише в увімкненому режимі (після if(!on) return)');
});

test('refreshPushSubscription: помилка claim (supabase повертає {error}) не маскується під успіх; після зняття підписки робиться спроба відновити', async () => {
  const toasts = [], steps = [];
  const out = { textContent: '' };
  const sub = { endpoint: 'https://example.invalid/x', toJSON: () => ({ keys: { p256dh: 'a', auth: 'b' } }), unsubscribe: async () => { steps.push('unsubscribe'); } };
  const mk = (claimReply) => buildSandbox({
    showTextToast: t => toasts.push(t), isCloudSessionReady: () => true, isWriteBlocked: () => false, blockedByReadOnly: () => false,
    Notification: { permission: 'granted' }, window: { PushManager: function(){} }, PushManager: function(){}, VAPID_PUBLIC_KEY: 'AAAA', urlBase64ToUint8Array: () => new Uint8Array(1),
    crypto: require('node:crypto').webcrypto, TextEncoder, document: { getElementById: id => id === 'push-diag-result' ? out : null },
    requestPushSubscription: async () => { steps.push('recover'); },
    navigator: { serviceWorker: { ready: Promise.resolve({ pushManager: { getSubscription: async () => sub, subscribe: async () => { steps.push('subscribe'); return sub; } } }) } },
    getSupabaseClient: () => ({ rpc: async () => claimReply }),
  }, NAMES);
  await mk({ error: { message: 'rls' } }).refreshPushSubscription();
  assert.deepEqual(steps, ['unsubscribe', 'subscribe', 'recover']);
  assert.ok(toasts.indexOf('Підписку оновлено') === -1); assert.ok(toasts.indexOf('Не вдалося оновити підписку') !== -1);
  assert.match(out.textContent, /Не вдалося оновити підписку на сервері/);
  steps.length = 0; toasts.length = 0;
  await mk({ error: null }).refreshPushSubscription();
  assert.deepEqual(steps, ['unsubscribe', 'subscribe']); assert.deepEqual(toasts, ['Підписку оновлено']);
  assert.match(out.textContent, /^Підписку оновлено: [0-9a-f]{8} → [0-9a-f]{8}$/);
});
