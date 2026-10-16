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
test('awaitCloudGate: тайм-аут → timeout', async function(){
  const c = make({ cloudAuthInitInFlight: {} });
  const r = await Promise.race([c.awaitCloudGate(), new Promise(function(res){ setTimeout(function(){ res('too-slow'); }, 9500); })]);
  assert.equal(r, 'timeout');
});
test('екрани підключені до шлюзу, «увійдіть» не показується напряму', function(){
  const SRC = require('fs').readFileSync(require('path').join(__dirname, '..', 'index.html'), 'utf8');
  assert.match(SRC, /monoInbox\.gate = await awaitCloudGate\(\)/);
  assert.match(SRC, /monoState\.gate = await awaitCloudGate\(\)/);
  assert.match(SRC, /notifArchive\.gate = await awaitCloudGate\(\)/);
  assert.match(SRC, /cloudAuthSettled = true/);
  assert.match(SRC, /reloadOpenCloudScreens\(false\); \/\/ Rev 2.32.89/);
  assert.ok(!/isCloudSessionReady\(\) \? 'Немає зв\\'язку\. «Вхідні»/.test(SRC));
});
