// Rev 2.32.405 (BUG-PUSH-OPEN): дотик до сповіщення завжди веде на його екран у кожному стані застосунку; повтор пропускається лише для тієї самої події кліку (мітка _at), а не для отримання й не для відкладеного запуску.
// Причина (самописець власника 19.11): push-msg source=idb-pageshow → push-apply reason=duplicate. Запис з IndexedDB (pageshow) ставив дію в чергу, але сторінка ще була hidden: дію не виконано, а мітка вже занесена в handledPushStamps. Повідомлення від SW (message) з тією ж міткою відсікалося як «дубль» без спроби виконати очікувану дію. Далі нічого не запускало (visibilitychange уже минув).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildSandbox } = require('./extract');
const j = v => JSON.parse(JSON.stringify(v));
const NAMES = ['PUSH_PENDING_TTL_MS', 'pushApplyDiag', 'createPendingPush', 'pendingPushState', 'shouldRunPendingPush', 'isDuplicatePushStamp', 'queuePushAction', 'runPendingPushAction', 'checkPendingPushFromIdb'];

function env(opts){
  const o = opts || {};
  const handled = [], diag = [], rafQueue = [], timers = [];
  const doc = { visibilityState: o.visibility || 'visible', activeElement: null };
  const g = {
    document: doc, handled, diag, rafQueue, pendingPush: null, handledPushStamps: [], debugRecordingActive: false,
    performance: { now: () => 0 }, requestAnimationFrame: fn => { rafQueue.push(fn); }, setTimeout: fn => { timers.push(fn); return timers.length; },
    handlePushAction: async a => { handled.push(a.type + (a.tag ? ':' + a.tag : '')); }, syncCheck(){},
    debugRecordingStartedAt: 0, recOn: () => true, pushDebugEvent: e => { diag.push(e); },
    readAndClearPendingPushAction: () => Promise.resolve(o.idb || null),
    markPushNotificationsRead(){},
  };
  const c = buildSandbox(g, NAMES);
  c.flush = async function(){ for(let i = 0; i < 4; i++){ rafQueue.splice(0).forEach(f => f()); timers.splice(0).forEach(f => f()); await new Promise(r => setImmediate(r)); } };
  return c;
}
const stamp = () => String(Date.now());

test('відкрите застосунок: клік приходить повідомленням від SW → виконується один раз', async () => {
  const c = env(); const at = stamp();
  c.queuePushAction({ type: 'other-actor-summary', _at: at }, 'message'); await c.flush();
  assert.deepEqual(j(c.handled), ['other-actor-summary']);
});
test('відкрите застосунок: запис з IndexedDB (pageshow) прийшов, коли сторінка ще hidden, потім message з тією ж міткою → виконується один раз (було: «duplicate», нічого не відкрито)', async () => {
  const c = env({ visibility: 'hidden' }); const at = stamp();
  c.queuePushAction({ type: 'other-actor-summary', _at: at }, 'idb-pageshow'); await c.flush();
  assert.equal(c.handled.length, 0, 'поки hidden — чекає');
  c.document.visibilityState = 'visible';
  c.queuePushAction({ type: 'other-actor-summary', _at: at }, 'message'); await c.flush();
  assert.deepEqual(j(c.handled), ['other-actor-summary'], 'той самий клік у видимій сторінці має виконатися');
  c.queuePushAction({ type: 'other-actor-summary', _at: at }, 'message'); c.runPendingPushAction('visible'); await c.flush();
  assert.equal(c.handled.length, 1, 'після виконання повтор того самого кліку пропускається');
});
test('у фоні: message, поки сторінка hidden → виконується при visible один раз', async () => {
  const c = env({ visibility: 'hidden' });
  c.queuePushAction({ type: 'mono-inbox', _at: stamp() }, 'message'); await c.flush();
  assert.equal(c.handled.length, 0);
  c.document.visibilityState = 'visible'; c.runPendingPushAction('visible'); c.runPendingPushAction('pageshow'); await c.flush();
  assert.deepEqual(j(c.handled), ['mono-inbox']);
});
test('закрите: холодний старт з IndexedDB (idb-start) → виконується; повторний запис тієї ж мітки — ні', async () => {
  const at = stamp(); const c = env();
  assert.equal(c.queuePushAction({ type: 'other-actor-deleted', _at: at }, 'idb-start'), true); await c.flush();
  assert.equal(c.queuePushAction({ type: 'other-actor-deleted', _at: at }, 'idb-pageshow'), false); await c.flush();
  assert.deepEqual(j(c.handled), ['other-actor-deleted']);
});
test('після сну: pageshow (hidden) → IndexedDB; visibilitychange (visible) → виконується один раз', async () => {
  const at = stamp(); const c = env({ visibility: 'hidden', idb: { type: 'other-actor-summary', _at: at } });
  c.checkPendingPushFromIdb('pageshow'); await c.flush();
  assert.equal(c.handled.length, 0);
  c.document.visibilityState = 'visible'; c.runPendingPushAction('visible'); await c.flush();
  assert.deepEqual(j(c.handled), ['other-actor-summary']);
});
test('отримання не є дотиком: без мітки кліку (_at) нічого не помічається обробленим; новий дотик (нова мітка) того ж типу виконується', async () => {
  const c = env();
  c.queuePushAction({ type: 'other-actor-summary', _at: String(Date.now() - 1) }, 'message'); await c.flush();
  c.queuePushAction({ type: 'other-actor-summary', _at: String(Date.now()) }, 'message'); await c.flush();
  assert.equal(c.handled.length, 2, 'кожен дотик (своя мітка) веде на екран, навіть якщо тип і push_id ті самі');
});
test('повтор «у роботі» (сторінка ще чекає rAF) не запускає дію вдруге', async () => {
  const c = env(); const at = stamp();
  c.queuePushAction({ type: 'mono-inbox', _at: at }, 'message');
  c.queuePushAction({ type: 'mono-inbox', _at: at }, 'idb-visible'); await c.flush();
  assert.equal(c.handled.length, 1);
});
test('діагностика: відкладений повтор пишеться як push-apply result=retry, справжній дубль — skipped/duplicate', async () => {
  const c = env({ visibility: 'hidden' }); const at = stamp();
  c.queuePushAction({ type: 'other-actor-summary', _at: at }, 'idb-pageshow'); await c.flush();
  c.document.visibilityState = 'visible';
  c.queuePushAction({ type: 'other-actor-summary', _at: at }, 'message'); await c.flush();
  c.queuePushAction({ type: 'other-actor-summary', _at: at }, 'message'); await c.flush();
  const apply = c.diag.filter(e => e.type === 'push-apply').map(e => e.result + ':' + e.reason);
  assert.ok(apply.some(x => /^retry:/.test(x)), apply.join(' | '));
  assert.ok(apply.includes('skipped:duplicate'), apply.join(' | '));
});
