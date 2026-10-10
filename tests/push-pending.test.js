// Rev 2.32.30 (P) — надійна доставка дії зі сповіщення, коли PWA у фоні: життєвий цикл «очікуваної дії», один раз у кожному стані.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { buildSandbox } = require('./extract');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const j = function(v){ return JSON.parse(JSON.stringify(v)); };

const pure = buildSandbox({}, ['PUSH_PENDING_TTL_MS', 'createPendingPush', 'pendingPushState', 'shouldRunPendingPush', 'isDuplicatePushStamp']);
test('P2: createPendingPush/pendingPushState — ready → used; через 2 хв — expired; відсутня — none', function(){
  const p = pure.createPendingPush({ type: 'mono-inbox' }, 1000);
  assert.equal(pure.pendingPushState(p, 1000), 'ready');
  assert.equal(pure.pendingPushState(p, 1000 + 119000), 'ready');
  assert.equal(pure.pendingPushState(p, 1000 + 121000), 'expired');
  p.used = true; assert.equal(pure.pendingPushState(p, 1001), 'used');
  assert.equal(pure.pendingPushState(null, 1), 'none');
});
test('P1: shouldRunPendingPush — лише коли готова й сторінка видима', function(){
  const p = pure.createPendingPush({ type: 'x' }, 1000);
  assert.equal(pure.shouldRunPendingPush(p, 1001, 'hidden'), false);
  assert.equal(pure.shouldRunPendingPush(p, 1001, 'visible'), true);
  assert.equal(pure.shouldRunPendingPush(p, 1000 + 200000, 'visible'), false);
});
test('P2: isDuplicatePushStamp — та сама мітка кліку відсікається', function(){
  assert.equal(pure.isDuplicatePushStamp(['111'], 111), true);
  assert.equal(pure.isDuplicatePushStamp(['111'], 222), false);
  assert.equal(pure.isDuplicatePushStamp([], null), false);
});

// ---------- стани: рівно один раз ----------
function env(opts){
  const o = opts || {};
  const handled = [];
  const rafQueue = [];
  const doc = { visibilityState: o.visibility || 'visible', activeElement: null };
  const g = {
    document: doc, handled, rafQueue, pendingPush: null, handledPushStamps: [], debugRecordingActive: false,
    performance: { now: function(){ return 0; } },
    requestAnimationFrame: function(fn){ rafQueue.push(fn); }, setTimeout: function(){ return 0; },
    handlePushAction: async function(a){ handled.push(a.type); },
    readAndClearPendingPushAction: function(){ return Promise.resolve(o.idb || null); },
  };
  const c = buildSandbox(g, ['PUSH_PENDING_TTL_MS', 'createPendingPush', 'pendingPushState', 'shouldRunPendingPush', 'isDuplicatePushStamp', 'queuePushAction', 'runPendingPushAction', 'checkPendingPushFromIdb']);
  c.flush = async function(){ for(let i = 0; i < 4; i++){ const q = rafQueue.splice(0); q.forEach(function(f){ f(); }); await new Promise(function(r){ setImmediate(r); }); } };
  return c;
}
test('P1/P2: сторінка видима — дія виконується після двох rAF рівно один раз; повторні тригери нічого не додають', async function(){
  const c = env();
  c.queuePushAction({ type: 'mono-inbox', _at: String(Date.now()) }, 'message');
  assert.equal(c.handled.length, 0, 'не синхронно — після відновлення (rAF)');
  await c.flush();
  assert.deepEqual(j(c.handled), ['mono-inbox']);
  c.runPendingPushAction('visible'); c.runPendingPushAction('focus'); c.runPendingPushAction('pageshow'); await c.flush();
  assert.equal(c.handled.length, 1);
});
test('P1: сторінка прихована (заморожена) — чекає visible, потім виконується один раз', async function(){
  const c = env({ visibility: 'hidden' });
  c.queuePushAction({ type: 'backup-reminder' }, 'message');
  await c.flush(); assert.equal(c.handled.length, 0);
  c.document.visibilityState = 'visible';
  c.runPendingPushAction('visible'); c.runPendingPushAction('pageshow'); await c.flush();
  assert.deepEqual(j(c.handled), ['backup-reminder']);
});
test('P1: дія, що не дочекалась видимості 2 хвилини, відкидається', async function(){
  const c = env({ visibility: 'hidden' });
  c.queuePushAction({ type: 'mono-inbox' }, 'message');
  c.pendingPush.at -= 130000;
  c.document.visibilityState = 'visible';
  c.runPendingPushAction('visible'); await c.flush();
  assert.equal(c.handled.length, 0);
});
test('P2: message + IndexedDB + query з однієї події кліку (одна мітка _at) дають одне виконання', async function(){
  const at = String(Date.now());
  const c = env({ idb: { type: 'mono-inbox', _at: at } });
  c.queuePushAction({ type: 'mono-inbox', _at: at }, 'message');
  c.checkPendingPushFromIdb('visible');
  await c.flush();
  c.queuePushAction({ type: 'mono-inbox', _at: at }, 'query');
  await c.flush();
  assert.equal(c.handled.length, 1);
});
test('P1: IndexedDB як резерв, якщо message не дійшло: свіжа з _at виконується, стара й без _at — ні', async function(){
  const fresh = env({ idb: { type: 'mono-inbox', _at: String(Date.now()) } });
  fresh.checkPendingPushFromIdb('visible'); await fresh.flush(); await fresh.flush();
  assert.equal(fresh.handled.length, 1);
  const old = env({ idb: { type: 'mono-inbox', _at: String(Date.now() - 300000) } });
  old.checkPendingPushFromIdb('visible'); await old.flush(); assert.equal(old.handled.length, 0);
  const legacy = env({ idb: { type: 'mono-inbox' } });
  legacy.checkPendingPushFromIdb('visible'); await legacy.flush(); assert.equal(legacy.handled.length, 0);
});
test('P1: застарілий клік за міткою не ставиться в чергу (холодний старт зі старим записом)', function(){
  const c = env();
  assert.equal(c.queuePushAction({ type: 'mono-inbox', _at: String(Date.now() - 200000) }, 'idb-start'), false);
  assert.equal(c.handled.length, 0);
});
test('P4: усі типи сповіщень проходять той самий шлях (один раз, після rAF)', async function(){
  for(const t of ['backup-reminder', 'other-actor-summary', 'installment-deadline', 'daily-expense-reminder', 'monthly-debt-reminder', 'mono-inbox']){
    const c = env(); c.queuePushAction({ type: t, _at: String(Date.now()) }, 'message'); await c.flush();
    assert.deepEqual(j(c.handled), [t], t);
  }
});

// ---------- handlePushAction: стани UI ----------
function runHandle(action, ui){
  const calls = [];
  const rec = function(n){ return function(){ calls.push(n); }; };
  const u = ui || {};
  const doc = {
    activeElement: { blur: rec('blur') }, body: { classList: { remove: rec('kb-remove') } },
    querySelector: function(sel){ return /app-modal/.test(sel) && u.modal ? {} : null; },
    querySelectorAll: function(sel){ return /drawer/.test(sel) && u.drawer ? [{ click: rec('drawer-close') }] : []; },
  };
  const ctx = buildSandbox({
    document: doc, calls, monoState: u.monoState || { loaded: false, offline: false, connection: null },
    performSwitchTab: rec('switchTab'), openMonoInbox: function(o){ calls.push('inbox' + (o && o.fromPush ? ':push' : '')); }, openMonoScreen: rec('monoScreen'),
    captureDebugGeometry: function(){}, captureFocusAudit: function(){}, setTimeout: function(){}, closeAppModal: rec('closeModal'), cloudAuthInitInFlight: null,
  }, ['routeForPushType', 'monoNotifGroupVisible', 'closeOpenSheetsForPush', 'handlePushAction']);
  return ctx.handlePushAction(action).then(function(){ return calls; });
}
test('P1: mono-inbox із незавантаженим monoState — «Вхідні» відкриваються одразу (без очікування мережі), з відкритою шторкою й діалогом вони спершу закриваються', async function(){
  const calls = await runHandle({ type: 'mono-inbox' }, { modal: true, drawer: true });
  assert.deepEqual(calls.filter(function(x){ return x !== 'blur'; }), ['closeModal', 'drawer-close', 'kb-remove', 'switchTab', 'inbox:push']);
  assert.ok(!calls.includes('focus'));
});
test('P1: mono-inbox, коли стан відомий і банк не підключено — екран «Monobank»; підключено — «Вхідні»', async function(){
  const no = await runHandle({ type: 'mono-inbox' }, { monoState: { loaded: true, offline: false, connection: null } });
  assert.ok(no.includes('monoScreen') && !no.includes('inbox:push'));
  const yes = await runHandle({ type: 'mono-inbox' }, { monoState: { loaded: true, offline: false, connection: { status: 'active' } } });
  assert.ok(yes.includes('inbox:push'));
});
test('P1: відкриття зі сповіщення без відомого стану: після завантаження «не підключено» → «Monobank» (код)', function(){
  assert.match(SRC, /opts && opts\.fromPush && monoState\.loaded && !monoState\.offline && !monoNotifGroupVisible\(monoState\.connection\)\)\{ closeMonoInbox\(\); openMonoScreen\(\); \}/);
});

// ---------- sw.js ----------
test('P: sw.js — мітка _at, postMessage + діагностика push-click-info, query at; решта без змін', function(){
  const sw = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');
  assert.match(sw, /if\(notifData\.type\) notifData\._at = Date\.now\(\);/);
  assert.match(sw, /type: 'push-click-info', pushType: notifData\.type, clients: clientsArr\.length, focus: res/);
  assert.match(sw, /url \+= '&at=' \+ encodeURIComponent\(notifData\._at\)/);
  assert.match(sw, /if\(notifData\.type\) c\.postMessage\(\{ type: 'push-action', action: notifData \}\);/);
  assert.match(sw, /self\.clients\.openWindow\(url\)/);
});
test('P: усі три входи (query, IndexedDB, message) йдуть через queuePushAction; події push-msg/push-apply/push-click', function(){
  assert.match(SRC, /queuePushAction\(\{ type: pushActionType,/);
  assert.match(SRC, /queuePushAction\(action, 'idb-start'\)/);
  assert.match(SRC, /queuePushAction\(event\.data\.action, 'message'\)/);
  ['push-msg', 'push-apply', 'push-click'].forEach(function(t){ assert.ok(SRC.indexOf("type: '" + t + "'") !== -1, t); });
  assert.ok(!/handlePushAction\(event\.data\.action\)/.test(SRC));
});

test('P1: сторінку сховали між постановкою в rAF і виконанням — дія не втрачається, виконується при наступному visible', async function(){
  const c = env();
  c.queuePushAction({ type: 'mono-inbox', _at: String(Date.now()) }, 'message');
  c.document.visibilityState = 'hidden';
  await c.flush();                       // rAF спрацював, але сторінка прихована
  assert.equal(c.handled.length, 0);
  c.document.visibilityState = 'visible';
  c.runPendingPushAction('visible'); await c.flush();
  assert.deepEqual(j(c.handled), ['mono-inbox']);
});
test('P1: запасний таймер і rAF разом дають одне виконання', async function(){
  const timers = [];
  const c = env();
  c.setTimeout = function(f){ timers.push(f); return 1; };
  c.queuePushAction({ type: 'mono-inbox' }, 'message');
  timers.forEach(function(f){ f(); }); await c.flush();
  assert.equal(c.handled.length, 1);
});
