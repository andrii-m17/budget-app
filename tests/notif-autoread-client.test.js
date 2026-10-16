// Rev 2.32.92 (NOTIF-1 Rev 1): клієнт після дій по події оновлює дзвіночок; Realtime слухає INSERT і UPDATE.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildSandbox } = require('./extract');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

function make(over){
  const log = [];
  const g = Object.assign({
    headsInFlight: null, isNotifArchiveOpen: false,
    monoReady: function(){ return true; },
    refreshNotifUnread: function(){ log.push('unread'); return Promise.resolve(); },
    loadNotifArchive: function(){ log.push('loadArchive'); return Promise.resolve(); },
    renderNotifArchive: function(){ log.push('render'); }, notifRealtimeTimer: null, setTimeout: setTimeout,
  }, over || {});
  const c = buildSandbox(g, ['refreshNotifAfterAction', 'onNotifRealtimeChange']);
  return { c: c, log: log, g: g };
}

test('після дії: лічильник оновлюється; архів закритий — список не вантажиться', async function(){
  const m = make();
  await m.c.refreshNotifAfterAction();
  assert.deepEqual(m.log, ['unread']);
});
test('після дії: архів відкритий — перезавантажується й малюється', async function(){
  const m = make({ isNotifArchiveOpen: true });
  await m.c.refreshNotifAfterAction();
  assert.deepEqual(m.log, ['unread', 'loadArchive', 'render']);
});
test('офлайн/без сесії: нічого не робить (лічильник лишається останнім відомим)', async function(){
  const m = make({ monoReady: function(){ return false; }, isNotifArchiveOpen: true });
  await m.c.refreshNotifAfterAction();
  assert.deepEqual(m.log, []);
});
test('«голови» вже летять (почались до дії): спершу чекаємо їх, потім свіжий запит', async function(){
  let done = false;
  const inflight = new Promise(function(r){ setTimeout(function(){ done = true; r(); }, 20); });
  const m = make({ headsInFlight: inflight, refreshNotifUnread: function(){ m.log.push(done ? 'unread-after-inflight' : 'unread-too-early'); return Promise.resolve(); } });
  await m.c.refreshNotifAfterAction();
  assert.deepEqual(m.log, ['unread-after-inflight']);
});
test('Realtime-обробник: серія з 10 подій (напр. «Прочитати всі») зливається в одне оновлення; після нього наступна подія знову обробляється', async function(){
  const timers = [];
  const m = make({ notifRealtimeTimer: null, setTimeout: function(fn){ timers.push(fn); return timers.length; }, isNotifArchiveOpen: true });
  for(let i = 0; i < 10; i++) m.c.onNotifRealtimeChange();
  assert.equal(timers.length, 1, 'один таймер на серію');
  timers[0](); await new Promise(function(r){ setTimeout(r, 5); });
  assert.deepEqual(m.log, ['unread', 'loadArchive', 'render'], 'один раз: лічильник + список');
  m.c.onNotifRealtimeChange();
  assert.equal(timers.length, 2, 'нова подія після оновлення планує нове');
});
test('Realtime-обробник: чекає «голови», що вже летять (застарілий лічильник не лишається)', async function(){
  let done = false;
  const inflight = new Promise(function(r){ setTimeout(function(){ done = true; r(); }, 20); });
  const timers = [];
  const m = make({ notifRealtimeTimer: null, setTimeout: function(fn){ timers.push(fn); return 1; }, headsInFlight: inflight, refreshNotifUnread: function(){ m.log.push(done ? 'fresh' : 'stale'); return Promise.resolve(); } });
  m.c.onNotifRealtimeChange(); timers[0](); await new Promise(function(r){ setTimeout(r, 60); });
  assert.deepEqual(m.log, ['fresh']);
});
test('підписка Realtime: INSERT і UPDATE з фільтром власного user_id, обидва на onNotifRealtimeChange; monoAfterChange викликає оновлення', function(){
  assert.match(SRC, /event: 'INSERT', schema: 'public', table: 'user_notifications', filter: 'user_id=eq\.' \+ cloudSession\.user\.id \}, onNotifRealtimeChange\)/);
  assert.match(SRC, /event: 'UPDATE', schema: 'public', table: 'user_notifications', filter: 'user_id=eq\.' \+ cloudSession\.user\.id \}, onNotifRealtimeChange\)/);
  const i = SRC.indexOf('async function monoAfterChange(){');
  assert.match(SRC.slice(i, i + 500), /refreshNotifAfterAction\(\)/);
});
test('100+ сповіщень: групування зберігає всі рядки (список до 200)', function(){
  const c = buildSandbox({}, ['MONO_MONTHS_GEN', 'groupNotificationsByDay']);
  const now = new Date(2026, 9, 16, 12, 0);
  const rows = [];
  for(let i = 0; i < 150; i++) rows.push({ id: 'n' + i, created_at: new Date(2026, 9, 16 - (i % 5), 10, i % 60).toISOString(), read_at: null });
  const groups = c.groupNotificationsByDay(rows, now);
  assert.equal(groups.reduce(function(n, gr){ return n + gr.rows.length; }, 0), 150);
});
