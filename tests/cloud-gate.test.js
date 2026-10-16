// Rev 2.32.89 (SYNCUI-1): шлюз «відновлення сесії» для «Вхідних», «Monobank» і архіву сповіщень.
const test = require('node:test'); const assert = require('node:assert');
const { buildSandbox } = require('./extract');
const NAMES = ['CLOUD_GATE_TIMEOUT_MS', 'cloudGateState', 'cloudGateNote', 'awaitCloudGate'];
function make(over){
  const g = Object.assign({ cloudAuthInitInFlight: null, cloudAuthSettled: false, cloudAuthSdkFailed: false, navigator: { onLine: true }, setTimeout: setTimeout, Date: Date, Promise: Promise, escapeHtml: function(x){ return String(x).replace(/&/g,'&amp;').replace(/</g,'&lt;'); },
    isCloudSessionReady: function(){ return false; } }, over || {});
  return buildSandbox(g, NAMES);
}
test('cloudGateState: усі стани', function(){
  const c = make();
  assert.equal(c.cloudGateState({ sessionReady: true, online: true }), 'ready');
  assert.equal(c.cloudGateState({ sessionReady: true, online: false }), 'offline');
  assert.equal(c.cloudGateState({ restoring: true, online: true }), 'restoring');
  assert.equal(c.cloudGateState({ restoring: true, timedOut: true, online: true }), 'timeout');
  assert.equal(c.cloudGateState({ online: false }), 'offline');
  assert.equal(c.cloudGateState({ online: true, sdkFailed: true }), 'offline');
  assert.equal(c.cloudGateState({ online: true }), 'no-session');
});
test('cloudGateNote: «увійдіть» лише для no-session; offline/timeout з «Повторити»', function(){
  const c = make();
  assert.match(c.cloudGateNote('no-session', 'x', 'Спершу увійдіть у Cloud'), /Спершу увійдіть у Cloud/);
  assert.ok(!/data-cloud-retry/.test(c.cloudGateNote('no-session', 'x', 'y')));
  assert.match(c.cloudGateNote('offline', 'Архів лише онлайн.', 'y'), /Немає зв'язку\. Архів лише онлайн\./);
  assert.match(c.cloudGateNote('timeout', 'a', 'y'), /data-cloud-retry/);
  assert.match(c.cloudGateNote('restoring', 'a', 'y'), /Завантаження…/);
  assert.ok(!/увійдіть/i.test(c.cloudGateNote('offline', 'a', 'Спершу увійдіть')));
});
test('awaitCloudGate: сесія вже є — одразу ready; немає й відновлення завершено — no-session', async function(){
  assert.equal(await make({ isCloudSessionReady: function(){ return true; } }).awaitCloudGate(), 'ready');
  assert.equal(await make({ cloudAuthSettled: true }).awaitCloudGate(), 'no-session');
  assert.equal(await make({ cloudAuthSettled: true, navigator: { onLine: false } }).awaitCloudGate(), 'offline');
});
test('awaitCloudGate: чекає відновлення, потім ready (гонка холодного старту)', async function(){
  let ready = false;
  const c = make({ cloudAuthInitInFlight: {}, isCloudSessionReady: function(){ return ready; } });
  setTimeout(function(){ ready = true; }, 250);
  assert.equal(await c.awaitCloudGate(), 'ready');
});
test('awaitCloudGate: тайм-аут → timeout (підроблений годинник, без реального очікування)', async function(){
  let now = 1000;
  const FakeDate = { now: function(){ return now; } };
  const c = make({ cloudAuthInitInFlight: {}, Date: FakeDate, setTimeout: function(fn, ms){ now += ms; fn(); } });
  assert.equal(await c.awaitCloudGate(), 'timeout');
});
test('екрани підключені до шлюзу, «увійдіть» не показується напряму', function(){
  const SRC = require('fs').readFileSync(require('path').join(__dirname, '..', 'index.html'), 'utf8');
  assert.match(SRC, /monoInbox\.gate = await awaitCloudGate\(\)/);
  assert.match(SRC, /monoState\.gate = await awaitCloudGate\(\)/);
  assert.match(SRC, /const gate = await awaitCloudGate\(\); \/\/ Rev 2\.32\.89[\s\S]{0,120}notifArchive\.gate = gate/);
  assert.match(SRC, /cloudAuthSettled = true/);
  assert.match(SRC, /reloadOpenCloudScreensNow\(false\)/);
  assert.ok(!/isCloudSessionReady\(\) \? 'Немає зв\\'язку\. «Вхідні»/.test(SRC));
});

// Rev 2.32.91 (SYNCUI-1 fix): повтор відновлення сесії, коли SDK не завантажився (холодний старт офлайн).
function makeReload(over){
  const calls = [];
  const g = Object.assign({ cloudAuthSdkFailed: false, cloudAuthSettled: true, cloudAuthInitInFlight: null, navigator: { onLine: true },
    isCloudSessionReady: function(){ return false; },
    isMonoInboxOpen: true, isMonoOpen: false, isNotifArchiveOpen: false,
    monoInbox: { offline: true, loaded: true }, monoState: { offline: false, loaded: true }, notifArchive: { offline: false, loaded: true, rows: [] },
    renderMonoInbox: function(){}, renderMonoScreen: function(){}, renderNotifArchive: function(){},
    loadMonoInbox: function(){ calls.push('loadInbox'); return Promise.resolve(); }, loadMonoState: function(){ calls.push('loadMono'); return Promise.resolve(); }, loadNotifArchive: function(){ calls.push('loadArchive'); return Promise.resolve(); },
    initCloudAuthUI: function(){ calls.push('init'); return Promise.resolve(); } }, over || {});
  const c = buildSandbox(g, ['reloadOpenCloudScreens', 'reloadOpenCloudScreensNow']);
  return { c: c, calls: calls, g: g };
}
test('reloadOpenCloudScreens: SDK не завантажився → спершу initCloudAuthUI, потім перезавантаження', async function(){
  const m = makeReload({ cloudAuthSdkFailed: true });
  m.c.reloadOpenCloudScreens(true);
  await new Promise(function(r){ setTimeout(r, 20); });
  assert.deepEqual(m.calls, ['init', 'loadInbox']);
});
test('reloadOpenCloudScreens: без збою SDK — одразу перезавантаження; не-offline екрани не чіпає; loaded=false без force пропускається', async function(){
  const m = makeReload();
  m.c.reloadOpenCloudScreens(false);
  assert.deepEqual(m.calls, ['loadInbox']);
  const m2 = makeReload({ monoInbox: { offline: true, loaded: false } });
  m2.c.reloadOpenCloudScreens(false);
  assert.deepEqual(m2.calls, []);
  m2.c.reloadOpenCloudScreens(true);
  assert.deepEqual(m2.calls, ['loadInbox']);
  const m3 = makeReload({ monoInbox: { offline: false, loaded: true } });
  m3.c.reloadOpenCloudScreens(true);
  assert.deepEqual(m3.calls, []);
});
test('reloadOpenCloudScreens: повтор відновлення не запускається під час відновлення, офлайн чи коли сесія готова (немає циклу)', function(){
  [{ cloudAuthInitInFlight: {} }, { navigator: { onLine: false } }, { isCloudSessionReady: function(){ return true; } }].forEach(function(o){
    const m = makeReload(Object.assign({ cloudAuthSdkFailed: true }, o));
    m.c.reloadOpenCloudScreens(false);
    assert.ok(m.calls.indexOf('init') === -1);
  });
});
