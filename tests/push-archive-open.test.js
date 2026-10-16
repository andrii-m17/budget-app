// Rev 2.32.41 (F) — тап по сповіщенню, коли застосунок відкритий: архів дзвіночка закривається, дія виконується один раз.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildSandbox } = require('./extract');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
function run(type, archiveOpen){
  const calls = [], events = [];
  const rec = function(name){ return function(){ calls.push(name); }; };
  const g = {
    document: { activeElement: { blur: rec('blur') }, body: { classList: { remove: rec('kb') } }, visibilityState: 'visible', querySelector: function(){ return null; }, querySelectorAll: function(){ return []; }, getElementById: function(){ return null; } },
    debugRecordingActive: true, debugRecordingStartedAt: 0, performance: { now: function(){ return 5; } }, pushDebugEvent: function(e){ events.push(e); },
    closeNotifArchive: function(){ calls.push('closeArchive'); }, performSwitchTab: rec('tab'), openMonoInbox: rec('inbox'), highlightMonoBatch: function(){}, openJournal: rec('journal'), latestTouchedRecordMonth: function(){ return '2026-10'; },
    switchAccountingTab: rec('acc'), setTimeout: function(){}, captureDebugGeometry: function(){}, captureFocusAudit: function(){},
    monoState: { loaded: false }, installmentAccounts: [], cloudAuthInitInFlight: null,
  };
  const ctx = buildSandbox(g, ['routeForPushType', 'monoNotifGroupVisible', 'pushApplyDiag', 'closeOpenSheetsForPush', 'handlePushAction']);
  return ctx.handlePushAction({ type: type }).then(function(){ return { calls: calls, events: events }; });
}
test('F: екран архіву закривається ПЕРЕД переходом (усі маршрути), потім відкривається ціль', async function(){
  for (const t of ['mono-inbox', 'backup-reminder', 'daily-expense-reminder', 'other-actor-summary']) {
    const r = await run(t);
    assert.ok(r.calls.indexOf('closeArchive') !== -1, t);
    assert.ok(r.calls.indexOf('closeArchive') < r.calls.indexOf('tab'), t + ': закриття раніше переходу');
  }
});
test('F: невідомий тип — нічого не закриває, у діагностиці причина no-route з видимістю', async function(){
  const r = await run('невідомий');
  assert.equal(r.calls.indexOf('closeArchive'), -1);
  assert.deepEqual(JSON.parse(JSON.stringify(r.events)), [{ t: 5, type: 'push-apply', result: 'skipped', reason: 'no-route', pushType: 'невідомий', visibility: 'visible' }]);
});
test('F: діагностика push-apply завжди з видимістю; пропуски (duplicate/stale/expired/error/no-route) мають причину', function(){
  assert.match(SRC, /function pushApplyDiag\(result, reason, pushType\)\{[^}]*visibility: document\.visibilityState/);
  ['duplicate', 'stale', 'expired', 'error', 'no-route'].forEach(function(r){ assert.ok(SRC.indexOf("pushApplyDiag('skipped', '" + r + "'") !== -1, r); });
  assert.match(SRC, /pushApplyDiag\('opened', reason, p\.action\.type\)/);
});
test('F: тап по рядку архіву закриває екран і веде за типом (закриття раніше handlePushAction)', function(){
  const fn = SRC.slice(SRC.indexOf('async function openNotificationRow'), SRC.indexOf('async function markAllNotificationsRead'));
  assert.ok(fn.indexOf('closeNotifArchive()') < fn.indexOf('await handlePushAction'));
});
