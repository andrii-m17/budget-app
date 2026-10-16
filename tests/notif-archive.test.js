// Rev 2.32.38 (B) — дзвіночок і архів сповіщень.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildSandbox } = require('./extract');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const j = function(v){ return JSON.parse(JSON.stringify(v)); };
const base = ['MONO_MONTHS_GEN', 'NOTIF_ICON_BY_TYPE', 'notificationIcon', 'notificationRowStyle', 'unreadBadge', 'groupNotificationsByDay', 'notifTimeLabel'];
const c = buildSandbox({}, base);
const T = function(d, h, m){ return new Date(2026, 9, d, h, m).toISOString(); };
const N = function(id, at, extra){ return Object.assign({ id: id, type: 'mono-inbox', title: 'Нова операція', body: 'Uklon', data: { type: 'mono-inbox' }, created_at: at, read_at: null }, extra || {}); };

test('unreadBadge: «9+» для 10 і більше, порожньо без непрочитаних', function(){
  assert.equal(c.unreadBadge(0), ''); assert.equal(c.unreadBadge(null), ''); assert.equal(c.unreadBadge(1), '1');
  assert.equal(c.unreadBadge(9), '9'); assert.equal(c.unreadBadge(10), '9+'); assert.equal(c.unreadBadge(120), '9+');
});
test('notificationIcon: усі типи мають іконку, невідомий — дзвіночок', function(){
  const exp = { 'mono-inbox': 'mono', 'daily-expense-reminder': 'expenses', 'installment-deadline': 'accounting', 'monthly-debt-reminder': 'accounting', 'backup-reminder': 'backup', 'other-actor-summary': 'journal', 'other-actor-deleted': 'journal', 'weekly-summary': 'analytics', 'month-end': 'analytics' };
  Object.keys(exp).forEach(function(k){ assert.equal(c.notificationIcon(k), exp[k], k); });
  assert.equal(c.notificationIcon('щось-нове'), 'bell'); assert.equal(c.notificationIcon(''), 'bell'); assert.equal(c.notificationIcon('toString'), 'bell');
  ['mono', 'expenses', 'accounting', 'analytics', 'backup', 'journal', 'bell'].forEach(function(k){ assert.match(SRC, new RegExp('\\n  ' + k + ': \\[')); });
});
test('notificationRowStyle: непрочитані й прочитані різняться вагою, кольором, іконкою й фоном', function(){
  assert.deepEqual(j(c.notificationRowStyle(true)), { weight: 600, color: 'primary', iconOpacity: 1, background: true });
  assert.deepEqual(j(c.notificationRowStyle(false)), { weight: 400, color: 'muted', iconOpacity: 0.45, background: false });
});
test('V: значок лічильника поза кнопкою, ідеальна пілюля без border; прочитані приглушені з контрастом', function(){
  const wrap = SRC.slice(SRC.indexOf('<span class="notif-bell-wrap">'), SRC.indexOf('<!-- Rev 2.32.38 (B): дзвіночок зліва від шестерні -->'));
  assert.ok(wrap.indexOf('</button>') < wrap.indexOf('id="notif-bell-count"'), 'значок після закриття кнопки');
  const css = SRC.match(/\.notif-bell-count\{([^}]*)\}/)[1];
  assert.match(css, /min-width:16px; height:16px; padding:0 4px; box-sizing:border-box; border-radius:8px/);
  assert.match(css, /display:inline-flex; align-items:center; justify-content:center/); assert.match(css, /line-height:1;/);
  assert.match(css, /box-shadow:0 0 0 1\.5px var\(--color-bg\)/); assert.ok(!/border:/.test(css)); assert.match(css, /pointer-events:none/);
  assert.match(SRC, /--notif-muted:#7C8699/);
  const lum = function(h){ const v = [1, 3, 5].map(function(i){ const x = parseInt(h.substr(i, 2), 16) / 255; return x <= .03928 ? x / 12.92 : Math.pow((x + .055) / 1.055, 2.4); }); return .2126 * v[0] + .7152 * v[1] + .0722 * v[2]; };
  const ratio = function(a, b){ const x = lum(a), y = lum(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };
  assert.ok(ratio('#7C8699', '#161B26') >= 4.5, 'темна'); assert.ok(ratio('#5F6B7D', '#FFFFFF') >= 4.5, 'світла');
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
    notifArchive: { rows: rows, loaded: true, offline: false, unread: unread, busy: false, batches: {}, batchesOk: false }, calls: calls, handled: [], closed: 0,
    safeId: function(x){ return String(x).replace(/[^0-9A-Za-z_-]/g, ''); },
    updateNotifBell: function(){}, renderNotifArchive: function(){ rendered.push(1); }, refreshNotifUnread: function(){},
    debugRecordingActive: false, showTextToast: function(){},
    closeNotifArchive: function(){ g.closed++; },
    handlePushAction: async function(a){ g.handled.push(a); },
    getSupabaseClient: function(){ return { rpc: async function(name, args){ calls.push({ name: name, args: args }); return { error: null }; } }; },
  };
  const ctx = buildSandbox(g, ['openNotificationRow', 'markAllNotificationsRead', 'runClearNotifArchive', 'notifRowState', 'notifBatchKey']);
  return { ctx, g, calls };
}
test('тап по сповіщенню: mark_notifications_read([id]), лічильник −1, перехід за типом', async function(){
  const e = env([N('n1', T(12, 8, 0), { data: { type: 'mono-inbox', target: 'x' } })], 1);
  await e.ctx.openNotificationRow('n1');
  assert.deepEqual(j(e.calls), [{ name: 'mark_notifications_read', args: { p_ids: ['n1'] } }]);
  assert.equal(e.g.notifArchive.unread, 0); assert.ok(e.g.notifArchive.rows[0].read_at);
  assert.deepEqual(j(e.g.handled), [{ type: 'mono-inbox', target: 'x', batch_ts: T(12, 8, 0) }]); // Rev 2.32.95: пачка за created_at, якщо batch_ts немає
   assert.equal(e.g.closed, 1);
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
  assert.match(SRC, /h\.unread_notifications[\s\S]{0,80}notifArchive\.unread = h\.unread_notifications/); // Rev 2.32.74: лічильник із sync_heads, окремого HEAD немає
  assert.doesNotMatch(SRC, /from\('user_notifications'\)\.select\('id', \{ count: 'exact', head: true \}\)/);
  assert.ok(SRC.indexOf('id="notif-bell-btn"') < SRC.indexOf('onclick="openSettings()" aria-label="Налаштування"'));
  assert.ok(!/from\('user_notifications'\)\.(insert|update|upsert|delete)/.test(SRC));
  // Rev 2.32.98 (NOTIF-1 Rev 3): крапка стану (заповнена «Нове», порожня решта) повернена за макетом; раніше (Rev 2.32.40) була заборона крапок
  assert.match(SRC, /<span class="notif-dot" aria-hidden="true"><\/span>/);
});
test('шапка без круглої іконки оновлення; екрани «Вхідні» й «Сповіщення» під таббаром (z-index < таббара)', function(){
  assert.ok(!/<button[^>]*id="update-btn-top"/.test(SRC));
  assert.match(SRC, /id="update-btn-side"/);
  const tabZ = Number(SRC.match(/nav\.tabbar\{[\s\S]*?z-index:(\d+)/)[1]);
  assert.ok(Number(SRC.match(/\.mono-screen\{[^}]*z-index:(\d+)/)[1]) < tabZ);
  assert.ok(Number(SRC.match(/\.mono-inbox-screen\{ z-index:(\d+)/)[1]) < tabZ);
  assert.ok(!/id="notif-archive-screen"[^>]*mono-inbox-screen|mono-inbox-screen[^>]*id="notif-archive-screen"/.test(SRC));
});
