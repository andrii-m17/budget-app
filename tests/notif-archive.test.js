// Rev 2.32.38 (B) — дзвіночок і архів сповіщень.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildSandbox } = require('./extract');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const j = function(v){ return JSON.parse(JSON.stringify(v)); };
const base = ['MONO_MONTHS_GEN', 'NOTIF_REMINDER_TYPES', 'notificationIcon', 'unreadBadge', 'groupNotificationsByDay', 'notifTimeLabel'];
const c = buildSandbox({}, base);
const T = function(d, h, m){ return new Date(2026, 9, d, h, m).toISOString(); };
const N = function(id, at, extra){ return Object.assign({ id: id, type: 'mono-inbox', title: 'Нова операція', body: 'Uklon', data: { type: 'mono-inbox' }, created_at: at, read_at: null }, extra || {}); };

test('unreadBadge: «9+» для 10 і більше, порожньо без непрочитаних', function(){
  assert.equal(c.unreadBadge(0), ''); assert.equal(c.unreadBadge(null), ''); assert.equal(c.unreadBadge(1), '1');
  assert.equal(c.unreadBadge(9), '9'); assert.equal(c.unreadBadge(10), '9+'); assert.equal(c.unreadBadge(120), '9+');
});
test('notificationIcon: Monobank, резервна копія, нагадування, інше', function(){
  assert.equal(c.notificationIcon('mono-inbox'), 'mono'); assert.equal(c.notificationIcon('backup-reminder'), 'backup');
  assert.equal(c.notificationIcon('daily-expense-reminder'), 'reminder'); assert.equal(c.notificationIcon('other-actor-added'), 'other'); assert.equal(c.notificationIcon(''), 'other');
});
test('groupNotificationsByDay: Сьогодні/Вчора/Раніше, від новіших, порожні групи не повертаються', function(){
  const now = new Date(2026, 9, 12, 18, 0);
  const g = j(c.groupNotificationsByDay([N('a', T(11, 19, 0)), N('b', T(12, 8, 0)), N('c', T(12, 14, 32)), N('d', T(5, 9, 0))], now));
  assert.deepEqual(g.map(function(x){ return x.label; }), ['Сьогодні', 'Вчора', 'Раніше']);
  assert.deepEqual(g[0].rows.map(function(r){ return r.id; }), ['c', 'b']);
  assert.deepEqual(j(c.groupNotificationsByDay([N('z', T(12, 8, 0))], now)).map(function(x){ return x.key; }), ['today']);
  assert.deepEqual(j(c.groupNotificationsByDay([], now)), []);
});
test('notifTimeLabel: час для сьогодні/вчора, дата для раніше', function(){
  const now = new Date(2026, 9, 12, 18, 0);
  assert.equal(c.notifTimeLabel(T(12, 14, 5), now), '14:05'); assert.equal(c.notifTimeLabel(T(11, 9, 30), now), '09:30'); assert.equal(c.notifTimeLabel(T(5, 9, 0), now), '5 жовтня');
});

function env(rows, unread){
  const calls = [], rendered = [];
  const g = {
    notifArchive: { rows: rows, loaded: true, offline: false, unread: unread, busy: false }, calls: calls, handled: [], closed: 0,
    safeId: function(x){ return String(x).replace(/[^0-9A-Za-z_-]/g, ''); },
    updateNotifBell: function(){}, renderNotifArchive: function(){ rendered.push(1); }, refreshNotifUnread: function(){},
    debugRecordingActive: false, showTrashToast: function(){},
    closeNotifArchive: function(){ g.closed++; },
    handlePushAction: async function(a){ g.handled.push(a); },
    getSupabaseClient: function(){ return { rpc: async function(name, args){ calls.push({ name: name, args: args }); return { error: null }; } }; },
  };
  const ctx = buildSandbox(g, ['openNotificationRow', 'markAllNotificationsRead', 'runClearNotifArchive']);
  return { ctx, g, calls };
}
test('тап по сповіщенню: mark_notifications_read([id]), лічильник −1, перехід за типом', async function(){
  const e = env([N('n1', T(12, 8, 0), { data: { type: 'mono-inbox', target: 'x' } })], 1);
  await e.ctx.openNotificationRow('n1');
  assert.deepEqual(j(e.calls), [{ name: 'mark_notifications_read', args: { p_ids: ['n1'] } }]);
  assert.equal(e.g.notifArchive.unread, 0); assert.ok(e.g.notifArchive.rows[0].read_at);
  assert.deepEqual(j(e.g.handled), [{ type: 'mono-inbox', target: 'x' }]); assert.equal(e.g.closed, 1);
});
test('тап по вже прочитаному не викликає RPC, але веде за типом', async function(){
  const e = env([N('n1', T(12, 8, 0), { read_at: T(12, 9, 0) })], 0);
  await e.ctx.openNotificationRow('n1');
  assert.equal(e.calls.length, 0); assert.equal(e.g.handled.length, 1);
});
test('«Прочитати всі» викликає RPC без p_ids; «Очистити» — clear_notifications', async function(){
  const e = env([N('a', T(12, 8, 0)), N('b', T(12, 9, 0))], 2);
  await e.ctx.markAllNotificationsRead();
  assert.equal(e.calls.length, 1); assert.equal(e.calls[0].name, 'mark_notifications_read'); assert.equal(e.calls[0].args, undefined); // без p_ids
  assert.equal(e.g.notifArchive.unread, 0); assert.ok(e.g.notifArchive.rows.every(function(r){ return r.read_at; }));
  await e.ctx.runClearNotifArchive();
  assert.equal(e.calls[1].name, 'clear_notifications'); assert.equal(e.g.notifArchive.rows.length, 0);
});
test('охоронні: не позначає прочитаним при відкритті; тексти екрановані; порожній стан; Realtime INSERT; дзвіночок зліва від шестерні', function(){
  const open = SRC.slice(SRC.indexOf('async function openNotifArchive'), SRC.indexOf('function closeNotifArchive'));
  assert.ok(!/mark_notifications_read|markAllNotificationsRead/.test(open));
  const row = SRC.slice(SRC.indexOf('function notifRowHtml'), SRC.indexOf('function renderNotifArchive'));
  assert.match(row, /escapeHtml\(row\.title/); assert.match(row, /escapeHtml\(row\.body/); assert.match(row, /escapeAttr\(safeId\(row\.id\)\)/);
  assert.match(SRC, /Сповіщень немає/);
  assert.match(SRC, /event: 'INSERT', schema: 'public', table: 'user_notifications', filter: 'user_id=eq\./);
  assert.match(SRC, /select\('id', \{ count: 'exact', head: true \}\)\.is\('read_at', null\)/);
  assert.ok(SRC.indexOf('id="notif-bell-btn"') < SRC.indexOf('onclick="openSettings()" aria-label="Налаштування"'));
  assert.ok(!/from\('user_notifications'\)\.(insert|update|upsert|delete)/.test(SRC));
  assert.ok(!/class="notif-row-dot|notif-dot/.test(SRC)); // без крапок
});
test('шапка без круглої іконки оновлення; екрани «Вхідні» й «Сповіщення» під таббаром (z-index < таббара)', function(){
  assert.ok(!/<button[^>]*id="update-btn-top"/.test(SRC));
  assert.match(SRC, /id="update-btn-side"/);
  const tabZ = Number(SRC.match(/nav\.tabbar\{[\s\S]*?z-index:(\d+)/)[1]);
  assert.ok(Number(SRC.match(/\.mono-screen\{[^}]*z-index:(\d+)/)[1]) < tabZ);
  assert.ok(Number(SRC.match(/\.mono-inbox-screen\{ z-index:(\d+)/)[1]) < tabZ);
  assert.ok(!/id="notif-archive-screen"[^>]*mono-inbox-screen|mono-inbox-screen[^>]*id="notif-archive-screen"/.test(SRC));
});
