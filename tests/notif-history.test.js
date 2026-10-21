// Rev 2.32.96 (NOTIF-1 Rev 3): журнал сповіщень як історія: стани, видалення одного, тап по обробленому.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildSandbox } = require('./extract');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const j = v => JSON.parse(JSON.stringify(v));
const pure = buildSandbox({}, ['notifBatchKey', 'groupInboxBatches', 'notifRowState', 'notifProcessedTarget', 'isDailyReminderRow', 'kyivDateKey', 'reminderPending']);
const B1 = '2026-10-16T05:00:00.123456+00:00', B2 = '2026-10-16T05:10:00.000000+00:00';
const N = (id, at, extra) => Object.assign({ id, type: 'mono-inbox', title: 'Monobank', body: 'x', data: { type: 'mono-inbox' }, created_at: at, read_at: null }, extra || {});

test('notifRowState: три стани разом; пачка з кількох — «Нове», доки не оброблена вся; пачки без рядків — «Оброблено»', function(){
  const batches = pure.groupInboxBatches([
    { notified_at: B1, status: 'added', expense_id: 'x1' }, { notified_at: B1, status: 'new', expense_id: null },   // пачка 1: оброблено 1 з 2
    { notified_at: B2, status: 'added', expense_id: 'x2' },                                                         // пачка 2: уся оброблена
  ]);
  assert.equal(pure.notifRowState(N('a', B1), batches, true), 'new');
  assert.equal(pure.notifRowState(N('a', B1, { read_at: '2026-10-16T06:00:00Z' }), batches, true), 'read');
  assert.equal(pure.notifRowState(N('b', B2), batches, true), 'processed');
  assert.equal(pure.notifRowState(N('b', B2, { read_at: '2026-10-16T06:00:00Z' }), batches, true), 'processed');
  assert.equal(pure.notifRowState(N('c', '2026-10-01T00:00:00+00:00'), batches, true), 'processed', 'рядків пачки вже немає');
  assert.equal(pure.notifRowState({ id: 'o', type: 'backup-reminder', created_at: B2, read_at: null }, batches, true), 'new');
  assert.equal(pure.notifRowState({ id: 'o', type: 'backup-reminder', created_at: B2, read_at: 'x' }, batches, true), 'read');
  assert.equal(pure.notifRowState(N('b', B2), {}, false), 'new', 'запит стану не вдався — «Оброблено» не вигадується');
  assert.equal(pure.notifRowState(N('z', B1, { read_at: 'x', data: undefined, type: undefined }), batches, true), 'read');
});
test('notifProcessedTarget: одна додана → Журнал; кілька → «Додані»; лише пропущені → «Пропущені»; видалена/немає → gone', function(){
  const ex = [{ id: 'x1', date: '2026-10-10' }, { id: 'x3', date: '2026-10-11', deletedAt: '2026-10-12' }];
  assert.deepEqual(j(pure.notifProcessedTarget([{ status: 'added', expense_id: 'x1' }], ex)), { kind: 'journal', expenseId: 'x1', date: '2026-10-10' });
  assert.deepEqual(j(pure.notifProcessedTarget([{ status: 'added', expense_id: 'x3' }], ex)), { kind: 'gone' });
  assert.deepEqual(j(pure.notifProcessedTarget([{ status: 'added', expense_id: 'nope' }], ex)), { kind: 'gone' });
  assert.deepEqual(j(pure.notifProcessedTarget([{ status: 'added', expense_id: 'x1' }, { status: 'added', expense_id: 'x2' }], ex)), { kind: 'inbox', tab: 'added' });
  assert.deepEqual(j(pure.notifProcessedTarget([{ status: 'ignored' }, { status: 'skipped' }], ex)), { kind: 'inbox', tab: 'skipped' });
  assert.deepEqual(j(pure.notifProcessedTarget([{ status: 'added', expense_id: 'x1' }, { status: 'ignored' }], ex)), { kind: 'journal', expenseId: 'x1', date: '2026-10-10' });
  assert.deepEqual(j(pure.notifProcessedTarget(undefined, ex)), { kind: 'gone' });
  assert.deepEqual(j(pure.notifProcessedTarget([], ex)), { kind: 'gone' });
});

function envDelete(over){
  const log = [];
  const g = Object.assign({
    notifArchive: { rows: [N('n1', B1), N('n2', B2, { read_at: 'x' }), N('n3', B2)], unread: 2, busy: false },
    safeId: x => String(x).replace(/[^0-9A-Za-z_-]/g, ''), blockedByReadOnly: () => false, monoReady: () => true,
    updateNotifBell: () => log.push('bell'), renderNotifArchive: () => log.push('render'), refreshNotifUnread: () => log.push('refresh'),
    showTextToast: (t, k) => log.push('toast:' + k + ':' + t),
    getSupabaseClient: () => ({ rpc: async (name, args) => { log.push(name + ':' + args.p_id); return { error: null }; } }),
  }, over || {});
  g.notifDeletedIds = g.notifDeletedIds || new Set();
  const c = buildSandbox(g, ['deleteNotificationRow']);
  return { c, log, g };
}
test('видалення одного: оптимістично, RPC delete_notification, лічильник −1 для непрочитаного', async function(){
  const e = envDelete();
  await e.c.deleteNotificationRow('n1');
  assert.deepEqual(e.g.notifArchive.rows.map(r => r.id), ['n2', 'n3']);
  assert.equal(e.g.notifArchive.unread, 1);
  assert.ok(e.log.includes('delete_notification:n1') && e.log.includes('refresh'));
  const e2 = envDelete();
  await e2.c.deleteNotificationRow('n2'); // прочитане: лічильник не змінюється
  assert.equal(e2.g.notifArchive.unread, 2);
});
test('видалення: помилка сервера — рядок повертається на те саме місце з явною помилкою, лічильник відновлюється', async function(){
  const e = envDelete({ getSupabaseClient: () => ({ rpc: async () => ({ error: { message: 'x' } }) }) });
  await e.c.deleteNotificationRow('n1');
  assert.deepEqual(e.g.notifArchive.rows.map(r => r.id), ['n1', 'n2', 'n3']);
  assert.equal(e.g.notifArchive.unread, 2);
  assert.ok(e.log.some(l => /^toast:error:Не вдалося видалити сповіщення/.test(l)));
  const e2 = envDelete({ getSupabaseClient: () => ({ rpc: async () => { throw new Error('network'); } }) });
  await e2.c.deleteNotificationRow('n3');
  assert.deepEqual(e2.g.notifArchive.rows.map(r => r.id), ['n1', 'n2', 'n3']);
});
test('видалення: офлайн — повідомлення, список без змін, запиту немає; режим «лише перегляд» — тихий пропуск', async function(){
  const e = envDelete({ monoReady: () => false });
  await e.c.deleteNotificationRow('n1');
  assert.equal(e.g.notifArchive.rows.length, 3);
  assert.ok(e.log.includes("toast:error:Немає зв'язку, спробуйте пізніше"));
  assert.ok(!e.log.some(l => /^delete_notification/.test(l)));
  const e2 = envDelete({ blockedByReadOnly: () => true });
  await e2.c.deleteNotificationRow('n1');
  assert.equal(e2.g.notifArchive.rows.length, 3);
  const e3 = envDelete();
  await e3.c.deleteNotificationRow('немає'); assert.equal(e3.g.notifArchive.rows.length, 3);
});

function envOpen(batches, expenses){
  const log = [];
  const g = {
    notifArchive: { batches: batches, batchesOk: true }, expenses: expenses || [], document: { body: { classList: { remove(){} } } },
    showTextToast: (t, k) => log.push('toast:' + k + ':' + t), closeNotifArchive: () => log.push('close'), performSwitchTab: t => log.push('tab:' + t),
    openMonoInbox: async o => log.push('inbox:' + o.tab), highlightMonoBatch: b => log.push('hl:' + b), openExpenseInJournal: (id, d) => log.push('journal:' + id + ':' + d),
  };
  const c = buildSandbox(g, ['notifBatchKey', 'notifProcessedTarget', 'openProcessedNotification']);
  return { c, log };
}
test('тап по обробленому: «Запис уже недоступний» без навігації, коли пачки/витрати немає', async function(){
  const e = envOpen({}, []);
  await e.c.openProcessedNotification(N('a', B1));
  assert.deepEqual(e.log, ["toast:info:Запис уже недоступний"]);
  const b = pure.groupInboxBatches([{ notified_at: B1, status: 'added', expense_id: 'x1' }]);
  const e2 = envOpen(b, [{ id: 'x1', date: '2026-10-10', deletedAt: '2026-10-12' }]);
  await e2.c.openProcessedNotification(N('a', B1));
  assert.deepEqual(e2.log, ["toast:info:Запис уже недоступний"]);
});
test('тап по обробленому: одна додана → Журнал; кілька → «Додані»; пропущені → «Пропущені» з підсвіткою пачки', async function(){
  const one = envOpen(pure.groupInboxBatches([{ notified_at: B1, status: 'added', expense_id: 'x1' }]), [{ id: 'x1', date: '2026-10-10' }]);
  await one.c.openProcessedNotification(N('a', B1));
  assert.deepEqual(one.log, ['close', 'journal:x1:2026-10-10']);
  const many = envOpen(pure.groupInboxBatches([{ notified_at: B1, status: 'added', expense_id: 'x1' }, { notified_at: B1, status: 'added', expense_id: 'x2' }]), []);
  await many.c.openProcessedNotification(N('a', B1, { data: { type: 'mono-inbox', batch_ts: B1 } }));
  assert.deepEqual(many.log, ['close', 'tab:service', 'inbox:added', 'hl:' + B1]);
  const skip = envOpen(pure.groupInboxBatches([{ notified_at: B2, status: 'ignored' }]), []);
  await skip.c.openProcessedNotification(N('a', B2));
  assert.deepEqual(skip.log, ['close', 'tab:service', 'inbox:skipped', 'hl:' + B2]);
});
test('fetchNotifBatches: один запит на 100+ сповіщень, діапазон за created_at; помилка або неповна відповідь → ok=false; нічого не присвоює', async function(){
  const calls = [];
  const rows = []; for(let i = 0; i < 120; i++) rows.push(N('n' + i, new Date(Date.UTC(2026, 9, 16, 5, 0, i)).toISOString()));
  const mk = reply => buildSandbox({ notifArchive: { batches: { x: 1 }, batchesOk: true }, getSupabaseClient: () => ({ from: t => ({ select: cols => ({ gte: (c, v) => ({ lte: (c2, v2) => ({ limit: n => { calls.push({ t, cols, v, v2, n }); return reply(); } }) }) }) }) }) }, ['notifBatchKey', 'groupInboxBatches', 'fetchNotifBatches', 'isDailyReminderRow', 'kyivDateKey']);
  const ok = mk(async () => ({ data: [{ notified_at: rows[0].created_at, status: 'added', expense_id: 'x' }], error: null }));
  const res = await ok.fetchNotifBatches(rows);
  assert.equal(calls.length, 1); assert.equal(calls[0].t, 'mono_inbox'); assert.equal(calls[0].cols, 'notified_at,status,expense_id');
  assert.equal(calls[0].v, rows[0].created_at); assert.equal(calls[0].v2, rows[119].created_at);
  assert.equal(res.ok, true); assert.deepEqual(Object.keys(j(res.batches)).length, 1);
  assert.deepEqual(j(ok.notifArchive), { batches: { x: 1 }, batchesOk: true }, 'стан екрана не чіпається (атомарне присвоєння в loadNotifArchive)');
  assert.equal((await mk(async () => ({ data: null, error: { message: 'x' } })).fetchNotifBatches(rows)).ok, false);
  assert.equal((await mk(async () => ({ data: new Array(1000).fill({ notified_at: rows[0].created_at, status: 'added' }), error: null })).fetchNotifBatches(rows)).ok, false);
  const none = await mk(async () => { throw new Error('не мав викликатись'); }).fetchNotifBatches([{ id: 'o', type: 'backup-reminder', created_at: B1 }]);
  assert.equal(none.ok, true);
});

test('fetchNotifBatches (NOTIF-2): для нагадування окремий запит нових операцій за tx_time; доби по Києву; помилка → pendingOk=false, пачки не страждають', async function(){
  const calls = [];
  const client = { from: t => ({ select: cols => { const q = { _f: [], eq(c, v){ this._f.push(['eq', c, v]); return this; }, gte(c, v){ this._f.push(['gte', c, v]); return this; }, lte(c, v){ this._f.push(['lte', c, v]); return this; },
    limit(n){ calls.push({ t, cols, f: this._f }); return Promise.resolve(globalThis.__reply ? globalThis.__reply(cols) : { data: [], error: null }); } }; return q; } }) };
  const c = buildSandbox({ getSupabaseClient: () => client }, ['notifBatchKey', 'groupInboxBatches', 'fetchNotifBatches', 'isDailyReminderRow', 'kyivDateKey']);
  globalThis.__reply = cols => cols === 'tx_time' ? { data: [{ tx_time: '2026-10-16T20:30:00+00:00' }, { tx_time: '2026-10-16T21:30:00+00:00' }], error: null } : { data: [], error: null };
  const res = await c.fetchNotifBatches([REM(), N('p', B1)]);
  assert.equal(calls.length, 2);
  const q = calls.find(x => x.cols === 'tx_time');
  assert.equal(q.t, 'mono_inbox'); assert.ok(q.f.some(f => f[0] === 'eq' && f[1] === 'status' && f[2] === 'new'));
  assert.deepEqual([...res.pendingDays].sort(), ['2026-10-16', '2026-10-17'], '21:30 UTC влітку — вже наступна київська доба');
  assert.equal(res.pendingOk, true); assert.equal(res.ok, true);
  globalThis.__reply = cols => cols === 'tx_time' ? { data: null, error: { message: 'x' } } : { data: [], error: null };
  const bad = await c.fetchNotifBatches([REM(), N('p', B1)]);
  assert.equal(bad.pendingOk, false); assert.equal(bad.ok, true);
  globalThis.__reply = null;
  calls.length = 0;
  await c.fetchNotifBatches([N('p', B1)]);
  assert.equal(calls.length, 1, 'без нагадувань другого запиту немає');
});

// ---- Rev 2.32.97: гонки (зауваження spec-reviewer D1–D4) ----
function envLoad(over){
  const g = Object.assign({
    notifArchive: { rows: [], batches: {}, batchesOk: true, loaded: false, offline: false, gate: 'ready' }, notifLoadSeq: 0, notifDeletedIds: new Set(),
    safeId: x => String(x).replace(/[^0-9A-Za-z_-]/g, ''), awaitCloudGate: async () => 'ready',
    getSupabaseClient: () => ({ from: () => ({ select: () => ({ order: () => ({ limit: async () => ({ data: [N('n1', B1), N('n2', B2)], error: null }) }) }) }) }),
    fetchNotifBatches: async () => ({ batches: { b: 1 }, ok: true }),
  }, over || {});
  return { c: buildSandbox(g, ['loadNotifArchive']), g };
}
test('гонка: рядок, видалений до відповіді запиту, не воскресає; rows/batches/batchesOk присвоюються разом', async function(){
  const snaps = [];
  const arch = { rows: [], batches: {}, batchesOk: true, loaded: false, offline: false, gate: 'ready' };
  const e = envLoad({ notifArchive: arch, notifDeletedIds: new Set(['n1']), fetchNotifBatches: async function(){ snaps.push(j(arch)); return { batches: { b: 1 }, ok: false }; } });
  await e.c.loadNotifArchive();
  assert.deepEqual(arch.rows.map(r => r.id), ['n2']);
  assert.equal(arch.batchesOk, false); assert.deepEqual(j(arch.batches), { b: 1 });
  assert.deepEqual(snaps[0].rows, [], 'до відповіді стан екрана не змінювався (немає вікна «усе Оброблено»)');
  assert.equal(snaps[0].batchesOk, true);
});
test('гонка: відповідь застосовується лише від найновішого запиту (старіший, що закінчився пізніше, ігнорується)', async function(){
  let n = 0; const resolvers = [];
  const e = envLoad({ getSupabaseClient: () => ({ from: () => ({ select: () => ({ order: () => ({ limit: () => new Promise(res => { resolvers.push(res); n++; }) }) }) }) }) });
  const p1 = e.c.loadNotifArchive(); await new Promise(r => setTimeout(r, 5));
  const p2 = e.c.loadNotifArchive(); await new Promise(r => setTimeout(r, 5));
  assert.equal(n, 2);
  resolvers[1]({ data: [N('new', B2)], error: null }); await p2;
  resolvers[0]({ data: [N('old', B1)], error: null }); await p1;
  assert.deepEqual(e.g.notifArchive.rows.map(r => r.id), ['new']);
});
test('відкат видалення не створює дубль, якщо список за цей час уже перезавантажено; успішне видалення лишає id в notifDeletedIds', async function(){
  const e = envDelete({ getSupabaseClient: () => ({ rpc: async function(){ e.g.notifArchive.rows.splice(0, 0, N('n1', B1)); return { error: { message: 'x' } }; } }) });
  await e.c.deleteNotificationRow('n1');
  assert.equal(e.g.notifArchive.rows.filter(r => r.id === 'n1').length, 1, 'без дубля');
  assert.ok(!e.g.notifDeletedIds.has('n1'), 'після відкату id знову дозволений');
  const ok = envDelete();
  await ok.c.deleteNotificationRow('n1');
  assert.ok(ok.g.notifDeletedIds.has('n1'));
});
test('охоронні: розмітка рядка (свайп-обгортка, кнопка 84 pt, role=button, кошик з aria-label), підтвердження «Очистити», вкладка у openMonoInbox, data-rec-id у Журналі', function(){
  assert.match(SRC, /class="expense-row-swipe notif-swipe"/);
  assert.match(SRC, /\.notif-swipe \.expense-row-actions button\{ width:84px; \}/);
  assert.match(SRC, /role="button" tabindex="0" data-notif-id=/);
  assert.equal((SRC.match(/aria-label="Видалити сповіщення"/g) || []).length, 2);
  assert.match(SRC, /showConfirmModal\('Видалити всі сповіщення\? Це не можна скасувати\.', runClearNotifArchive, 'Видалити'\)/);
  // Rev 2.32.102 (NOTIF-2): вигляд 2.32.95: «Очистити архів» знизу списку, «Прочитати всі» у шапці, без пілюль, крапок і підпису «джерело · час»
  assert.match(SRC, /data-notif-clear="1"><span>Очистити архів/);
  assert.match(SRC, /id="notif-readall-btn" onclick="markAllNotificationsRead\(\)">Прочитати всі</);
  assert.ok(!/notif-clear-btn|notif-pill|notif-row-source|notif-dot|NOTIF_STATE_LABEL/.test(SRC));
  assert.match(SRC, /<span class="notif-row-time">' \+ escapeHtml\(notifTimeLabel\(row\.created_at/);
  assert.match(SRC, /monoInbox\.tab = \(opts && opts\.tab\) \|\| 'new'/);
  assert.match(SRC, /data-rec-id="\$\{safeId\(e\.id\)\}"/);
  assert.match(SRC, /rpc\('delete_notification', \{ p_id: row\.id \}\)/);
});

// ===== NOTIF-2: щоденне нагадування відрізняється від пачки =====
const REM = (extra) => N('r1', '2026-10-16T17:00:03.000000+00:00', Object.assign({ data: { type: 'mono-inbox', tag: 'daily-expense-reminder' } }, extra || {}));
test('isDailyReminderRow: лише mono-inbox з data.tag daily-expense-reminder; пачка (batch_ts) — ні', function(){
  assert.equal(pure.isDailyReminderRow(REM()), true);
  assert.equal(pure.isDailyReminderRow(N('a', B1, { data: { type: 'mono-inbox', batch_ts: B1 } })), false);
  assert.equal(pure.isDailyReminderRow({ type: 'backup-reminder', data: { tag: 'daily-expense-reminder' } }), false);
  assert.equal(pure.isDailyReminderRow({ type: 'mono-inbox' }), false);
});
test('kyivDateKey: доба по Києву (21:30 UTC влітку вже наступний день)', function(){
  assert.equal(pure.kyivDateKey('2026-10-16T17:00:03+00:00'), '2026-10-16');
  assert.equal(pure.kyivDateKey('2026-07-16T21:30:00+00:00'), '2026-07-17');
  assert.equal(pure.kyivDateKey('не-дата'), '');
});
test('notifRowState (нагадування, Rev 2.32.106): вигляд лише за read_at (як у решти); reminderPending лише для переходу при тапі', function(){
  const days = new Set(['2026-10-16']);
  assert.equal(pure.notifRowState(REM(), {}, true, days, true), 'new');
  assert.equal(pure.notifRowState(REM({ read_at: '2026-10-16T18:00:00Z' }), {}, true, days, true), 'read', 'прочитане (тап чи «Прочитати всі») більше не жирне, хоч нові операції є');
  assert.equal(pure.notifRowState(REM(), {}, true, new Set(), true), 'new', 'непрочитане лишається «новим» і без нових операцій');
  assert.equal(pure.reminderPending(REM(), days, true), true);
  assert.equal(pure.reminderPending(REM(), new Set(['2026-10-15']), true), false);
  assert.equal(pure.reminderPending(REM(), new Set(), true), false);
  assert.equal(pure.reminderPending(REM(), undefined, false), null, 'невідомо');
  assert.equal(pure.reminderPending(REM({ created_at: 'не-дата' }), days, true), null);
  // пачка без рядків у mono_inbox і далі «оброблено»
  assert.equal(pure.notifRowState(N('a', B1), {}, true, new Set(['2026-10-16']), true), 'processed');
});
