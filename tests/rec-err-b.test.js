// Rev 2.32.423 (ERR-1b): слід перехоплених помилок у копіях/IndexedDB, сповіщеннях і підписці, Monobank + два місця з 1a. Лише запис: потік і return не змінені.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildSandbox } = require('./extract');
const SRC = require('./extract').readIndexWithCss();
const j = v => JSON.parse(JSON.stringify(v));
// код місця → функції верхнього рівня, де він стоїть (по одній на входження)
const SITES = {
  'bk-status': ['renderBackupStatus'], 'bk-restore-open': ['openRestoreSheet'], 'bk-undo-get': ['rsUndo'], 'bk-undo-parse': ['rsUndo'], 'bk-before-restore': ['performRestore'], 'idb-remove': ['clearLocalAccountData'],
  'rcpt-delete': ['pushReceiptsDelete'], 'rcpt-add': ['pushReceiptAddIfAbsent'], 'rcpt-bump': ['pushReceiptsBump'], 'rcpt-fail': ['pushReceiptFail'], 'rcpt-tap': ['pushReceiptFromTap'], 'rcpt-flush': ['requestPushSubscription'],
  'push-sub-delete': ['revokeDevicePushSubscription'], 'push-sub-revoke': ['revokeDevicePushSubscription'], 'notif-queue-write': ['notifQueueWrite'], 'notif-unread': ['refreshNotifUnread'], 'notif-mark-read': ['markPushNotificationsRead'],
  'push-sub-refresh': ['refreshPushSubscription'], 'push-sub-request': ['refreshPushSubscription'], 'notif-rt-teardown': ['teardownNotifRealtime'],
  'push-pending': ['runPendingPushAction'], 'push-pending-idb': ['checkPendingPushFromIdb'], 'push-pending-start': ['forceResyncViewportOffsetAfterRotation', 'forceResyncViewportOffsetAfterRotation'], 'push-pending-resume': ['forceResyncViewportOffsetAfterRotation'],
  'push-toast-open': ['pushToastReceive'], 'notif-flush-tap': ['markNotifRowsRead'], 'notif-after-action': ['monoAfterChange', 'onNotifRealtimeChange'],
  'notif-flush-refresh': ['notifFlush'], 'notif-unread-refresh': ['notifFlush'], 'notif-flush-timer': ['notifFlush'], 'notif-flush-online': ['notifFlush'], 'notif-flush-visible': ['notifFlush'], 'notif-flush-start': ['notifFlush'],
  'mono-refund': ['monoRefundSignal'], 'mono-toast': ['monoNewToastCheck'], 'mono-count': ['refreshMonoNewCount'], 'mono-conn': ['monoLoadConnection'], 'mono-suggest': ['loadMonoSuggestRows'],
  'idmig-wait': ['idMigrateUnlinked'], 'heads-error': ['fetchSyncHeadsShared'],
};
test('місця виклику: кожен код `at` стоїть у потрібній функції верхнього рівня, у catch/.catch (лише запис)', function(){
  const funcs = []; const re = /\n(?:async )?function ([A-Za-z0-9_$]+)\(/g; let m;
  while((m = re.exec(SRC))) funcs.push([m.index, m[1]]);
  const fnAt = pos => { let r = '?'; for(const f of funcs){ if(f[0] <= pos) r = f[1]; else break; } return r; };
  Object.keys(SITES).forEach(at => {
    const found = []; const r2 = new RegExp("recErr\\('" + at + "', (?:e|e2|r\\.error)\\)", 'g'); let k;
    while((k = r2.exec(SRC))) found.push(fnAt(k.index));
    assert.deepEqual(found, SITES[at], at);
  });
  assert.equal(Object.keys(SITES).length, 40);
});
test('поведінкове (копії/IndexedDB): renderBackupStatus — відмова abCurrent → одна подія bk-status, текст не змінюється, виняток не пробивається', async function(){
  const ev = [], el = { textContent: '', getAttribute: () => null, removeAttribute(){} };
  const c = buildSandbox({ document: { getElementById: () => el }, indexedDB: {}, recErr: (at, e) => ev.push([at, e.message]) }, ['renderBackupStatus']);
  c.abCurrent = async () => { throw new Error('IDB закрита'); }; // перекриває справжню (підтягується екстрактором)
  await c.renderBackupStatus();
  assert.deepEqual(ev, [['bk-status', 'IDB закрита']]); assert.equal(el.textContent, '');
});
test('поведінкове (сповіщення): notifQueueWrite — відмова localStorage → одна подія notif-queue-write, виняток не пробивається; успішний запис — без подій', function(){
  const ev = []; let stored = null;
  const mk = ls => buildSandbox({ localStorage: ls, notifQueueUid: () => 'u1', LS_KEY_NOTIF_READ_QUEUE: 'k', recErr: (at) => ev.push(at) }, ['notifQueueWrite']);
  assert.doesNotThrow(() => mk({ setItem(){ throw new Error('QuotaExceeded'); }, removeItem(){} }).notifQueueWrite(['a']));
  assert.deepEqual(ev, ['notif-queue-write']);
  ev.length = 0; mk({ setItem(k, v){ stored = v; }, removeItem(){} }).notifQueueWrite(['a']); assert.deepEqual(ev, []); assert.deepEqual(j(JSON.parse(stored)), { uid: 'u1', ids: ['a'] });
});
test('поведінкове (Monobank): refreshMonoNewCount — відмова запиту → одна подія mono-count; успіх оновлює лічильник без подій', async function(){
  const ev = [], monoInbox = { newCount: 0, countsKnown: false, autoReviewCount: 0 };
  const mk = f => buildSandbox({ monoReady: () => true, fetchSyncHeadsShared: f, monoInbox, updateMonoBadges(){}, monoRefundSignal(){}, recErr: (at) => ev.push(at) }, ['refreshMonoNewCount']);
  await mk(async () => { throw new Error('offline'); }).refreshMonoNewCount(); assert.deepEqual(ev, ['mono-count']); assert.equal(monoInbox.newCount, 0);
  ev.length = 0; await mk(async () => ({ mono_new: 3 })).refreshMonoNewCount(); assert.deepEqual(ev, []); assert.equal(monoInbox.newCount, 3);
});
test('fetchSyncHeadsShared: відповідь із r.error (без винятку) → подія heads-error з текстом помилки, повертається null як і раніше', async function(){
  const ev = [];
  const mk = rpc => buildSandbox({ headsInFlight: null, getSupabaseClient: () => ({ rpc }), recErr: (at, e) => ev.push([at, e && e.message]) }, ['fetchSyncHeadsShared']);
  assert.equal(await mk(async () => ({ data: null, error: { message: 'permission denied for function sync_heads' } })).fetchSyncHeadsShared(), null);
  assert.deepEqual(ev, [['heads-error', 'permission denied for function sync_heads']]);
  ev.length = 0; assert.deepEqual(j(await mk(async () => ({ data: { a: 1 }, error: null })).fetchSyncHeadsShared()), { a: 1 }); assert.deepEqual(ev, []);
});
test('idMigrateUnlinked: збій попередньої міграції тієї ж таблиці → подія idmig-wait; потік (повторний цикл) без змін (за вихідним текстом)', function(){
  assert.match(SRC, /while\(run\[spec\.table\]\)\{ try\{ await run\[spec\.table\]; \}catch\(e\)\{ recErr\('idmig-wait', e\); \} \}/);
});
