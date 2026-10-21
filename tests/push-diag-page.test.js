// Rev 2.32.103 (NOTIF-3 Rev 2): розширена діагностика сповіщень на боці сторінки: за замовчуванням вимкнено, без тексту, лише за дотиком.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildSandbox } = require('./extract');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const NAMES = ['pushDiagLineText', 'pushEndpointHash', 'readPushDiagFlag', 'pushDiagOpen', 'sendPushDiagLog', 'refreshPushSubscription', 'PUSH_DIAG_DB'];

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
    readPushDiagEvents: async () => evs, buildPushDiagSnapshot: async () => ({ permission: 'granted' }), document: { getElementById: () => null },
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
  assert.match(SRC, /id="push-diag-btn"[^>]*onclick="togglePushDiag\(\)">Розширена діагностика: вимкнено</);
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
