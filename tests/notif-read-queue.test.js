// Rev 2.32.147 (NOTIF-READ-QUEUE) — черга «до прочитання»: офлайн-тап, перезапуск, повернення мережі, помилка сервера (кількість запитів через NET_STATS),
// два пристрої, чужий акаунт, «лише перегляд», холодний старт. Імітований сервер; ніяких реальних даних.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildSandbox, evalInSandbox } = require('./extract');

const NAMES = ['LS_KEY_NOTIF_READ_QUEUE', 'NOTIF_READ_QUEUE_MAX', 'NOTIF_FLUSH_DELAYS_MS', 'NOTIF_FLUSH_MAX_FAILURES', 'NOTIF_FLUSH_STOPPED_MIN_GAP_MS', 'NOTIF_FLUSH_STATE',
  'notifQueueUid', 'notifQueueParse', 'notifQueueMerge', 'notifEffectiveUnread', 'notifApplyQueueOverlay', 'notifFlushAllowed', 'notifFlushDelayMs',
  'notifQueueIds', 'notifQueueWrite', 'notifQueueAdd', 'notifQueueRemove', 'notifQueueLen', 'notifFlush', 'deleteNotificationRow', 'runClearNotifArchive', 'loadNotifArchive',
  'classifyNetRequest', 'countNetRequest', 'NET_STATS', 'openNotificationRow', 'markAllNotificationsRead', 'isDailyReminderRow', 'kyivDateKey', 'reminderPending', 'notifRowState', 'notifBatchKey'];
const j = function(v){ return JSON.parse(JSON.stringify(v)); };
const N = function(id, read){ return { id: id, type: '', title: 't', body: 'b', created_at: '2026-10-12T08:00:00Z', read_at: read || null, data: {} }; };

// Спільний сервер: id → read_at. rpc ідемпотентний (відсутні й прочитані ігнорує).
function makeServer(ids){
  const read = new Map(ids.map(function(i){ return [i, null]; }));
  return { read, fail: false, reqs: [], unread: function(){ let n = 0; read.forEach(function(v){ if(!v) n++; }); return n; } };
}
function makeDevice(server, opts){
  opts = opts || {};
  const store = opts.store || new Map();
  const clock = opts.clock || { t: Date.parse('2026-10-15T10:00:00Z') };
  class FakeDate extends Date { static now(){ return clock.t; } }
  const timers = [];
  const g = {
    Date: FakeDate, clock, timers, toasts: [], refreshes: 0, online: opts.online !== false, writeBlocked: !!opts.writeBlocked,
    localStorage: { getItem: function(k){ return store.has(k) ? store.get(k) : null; }, setItem: function(k, v){ if(opts.storeFull) throw new Error('quota'); store.set(k, String(v)); }, removeItem: function(k){ if(opts.storeFull) throw new Error('quota'); store.delete(k); } },
    cloudSession: { user: { id: opts.uid || 'u1' } },
    monoReady: function(){ return ctx.online; }, isWriteBlocked: function(){ return ctx.writeBlocked; }, blockedByReadOnly: function(){ return ctx.writeBlocked; }, // ctx, не g: sandbox копіює globals, тест міняє поля ctx
    getSupabaseClient: function(){ return { rpc: async function(name, args){
      ctx.countNetRequest('https://x.supabase.co/rest/v1/rpc/' + name, 'POST');
      server.reqs.push({ name, args });
      if(server.fail) return { error: { message: 'x' }, data: null };
      const ids = (args && args.p_ids) || Array.from(server.read.keys());
      ids.forEach(function(i){ if(server.read.has(i) && !server.read.get(i)) server.read.set(i, 'srv'); });
      return { data: null, error: null };
    } }; },
    setTimeout: function(fn, ms){ timers.push({ fn: fn, ms: ms, live: true }); return timers.length; },
    clearTimeout: function(h){ if(timers[h - 1]) timers[h - 1].live = false; },
    refreshNotifUnread: async function(){ ctx.refreshes++; },
    notifArchive: { rows: (opts.rows || []).map(function(r){ return Object.assign({}, r); }), unread: opts.unread || 0, busy: false, loaded: true, batches: {}, batchesOk: false },
    safeId: function(x){ return String(x).replace(/[^0-9A-Za-z_-]/g, ''); }, updateNotifBell: function(){}, renderNotifArchive: function(){},
    showTextToast: function(t){ g.toasts.push(t); }, closeNotifArchive: function(){}, handlePushAction: async function(){}, debugRecordingActive: false,
    openProcessedNotification: async function(){}, notifDeletedIds: new Set(), notifLoadSeq: 0, performance: { now: function(){ return 0; } },
  };
  const ctx = buildSandbox(g, NAMES);
  ctx.advance = function(ms){ clock.t += ms; };
  ctx.fireTimers = async function(){ const due = timers.filter(function(t){ return t.live; }); for(const t of due){ t.live = false; await t.fn(); await new Promise(function(r){ setImmediate(r); }); } }; // колбек таймера не повертає проміс відправки: даємо їй завершитись
  ctx.store = store;
  return ctx;
}
const rpcCount = function(c){ return evalInSandbox(c, "NET_STATS.byType['RPC mark_notifications_read'] || 0"); };
const netTotal = function(c){ return evalInSandbox(c, 'NET_STATS.total'); };
const flushState = function(c){ return evalInSandbox(c, 'NOTIF_FLUSH_STATE'); };

test('чисті: злиття без дублів і з лімітом; лічильник = max(0, серверне − черга); накладка прочитує лише поставлені', function(){
  const c = makeDevice(makeServer([]));
  assert.deepEqual(j(c.notifQueueMerge(['a', 'b'], ['b', 'c', '', 5], 500)), ['a', 'b', 'c']);
  assert.deepEqual(j(c.notifQueueMerge(['a', 'b', 'c'], ['d'], 3)), ['b', 'c', 'd']);
  assert.equal(c.notifEffectiveUnread(5, 2), 3); assert.equal(c.notifEffectiveUnread(1, 4), 0); assert.equal(c.notifEffectiveUnread(undefined, 2), 0);
  const rows = [N('a'), N('b'), N('c', 'x')];
  assert.equal(c.notifApplyQueueOverlay(rows, ['b', 'c'], 'S'), 1);
  assert.equal(rows[0].read_at, null); assert.equal(rows[1].read_at, 'S'); assert.equal(rows[2].read_at, 'x');
});

test('холодний старт: порожня черга — notifFlush(start) не створює жодного запиту', async function(){
  const s = makeServer(['n1']); const c = makeDevice(s);
  assert.equal(await c.notifFlush('start'), false);
  assert.equal(netTotal(c), 0); assert.equal(s.reqs.length, 0); assert.equal(c.timers.length, 0);
});

test('офлайн-тап: id у черзі, рядок прочитаний локально, лічильник −1, запитів немає; сховище містить лише uid та id', async function(){
  const s = makeServer(['n1', 'n2']); const c = makeDevice(s, { online: false, rows: [N('n1'), N('n2')], unread: 2 });
  await c.openNotificationRow('n1');
  assert.ok(c.notifArchive.rows[0].read_at); assert.equal(c.notifArchive.unread, 1);
  assert.deepEqual(j(c.notifQueueIds()), ['n1']);
  assert.equal(netTotal(c), 0); assert.equal(s.reqs.length, 0);
  assert.deepEqual(JSON.parse(c.store.get('budget_notif_read_queue_v1')), { uid: 'u1', ids: ['n1'] });
  assert.equal(c.notifEffectiveUnread(2, c.notifQueueLen()), 1); // серверний лічильник 2 − черга 1
});

test('перезапуск → повернення мережі: черга пережила перезапуск, одна відправка p_ids, черга порожня', async function(){
  const s = makeServer(['n1', 'n2']); const store = new Map();
  const a = makeDevice(s, { online: false, store: store, rows: [N('n1'), N('n2')], unread: 2 });
  await a.openNotificationRow('n1'); await a.openNotificationRow('n2');
  const b = makeDevice(s, { online: false, store: store }); // «перезапуск»: нова пам'ять, те саме сховище
  assert.deepEqual(j(b.notifQueueIds()), ['n1', 'n2']);
  assert.equal(await b.notifFlush('start'), false); assert.equal(rpcCount(b), 0); // ще офлайн: без спроб і без невдач
  assert.equal(flushState(b).failures, 0);
  b.online = true;
  assert.equal(await b.notifFlush('online'), true);
  assert.equal(rpcCount(b), 1); assert.deepEqual(j(s.reqs[0].args), { p_ids: ['n1', 'n2'] });
  assert.equal(b.notifQueueLen(), 0); assert.equal(store.get('budget_notif_read_queue_v1'), undefined);
  assert.equal(s.unread(), 0); assert.equal(b.refreshes, 1);
});

test('помилка сервера: паузи 30/60/120 с, 4 невдачі зупиняють; кількість запитів через NET_STATS; далі лише online/visible не частіше раз на хвилину', async function(){
  const s = makeServer(['n1']); s.fail = true;
  const c = makeDevice(s, { rows: [N('n1')], unread: 1 });
  await c.openNotificationRow('n1');                       // тап → спроба 1
  assert.equal(rpcCount(c), 1); assert.equal(flushState(c).failures, 1);
  assert.equal(c.notifQueueLen(), 1);                      // id лишився в черзі
  assert.equal(c.notifArchive.rows[0].read_at !== null, true); // і не відкотився
  await c.notifFlush('refresh'); assert.equal(rpcCount(c), 1); // пауза 30 с
  c.advance(30000); await c.fireTimers();                  // спроба 2
  assert.equal(rpcCount(c), 2);
  await c.notifFlush('refresh'); assert.equal(rpcCount(c), 2); // пауза 60 с
  c.advance(60000); await c.fireTimers();                  // спроба 3
  assert.equal(rpcCount(c), 3);
  c.advance(120000); await c.fireTimers();                 // спроба 4 → зупинка
  assert.equal(rpcCount(c), 4); assert.equal(flushState(c).failures, 4);
  assert.equal(c.timers.filter(function(t){ return t.live; }).length, 0, 'таймера повтору більше немає');
  c.advance(600000);
  await c.notifFlush('timer'); await c.notifFlush('refresh'); await c.notifFlush('start');
  assert.equal(rpcCount(c), 4, 'фонові тригери не пробивають зупинку');
  await c.notifFlush('visible'); assert.equal(rpcCount(c), 5);   // явний тригер після ≥ 1 хв
  await c.notifFlush('online'); assert.equal(rpcCount(c), 5);    // але не частіше раз на хвилину
  s.fail = false; c.advance(61000);
  assert.equal(await c.notifFlush('online'), true); assert.equal(rpcCount(c), 6);
  assert.equal(c.notifQueueLen(), 0); assert.equal(flushState(c).failures, 0);
});

test('два пристрої: той самий акаунт, ті самі id у двох чергах — обидві відправки успішні, на сервері прочитано один раз, помилок немає', async function(){
  const s = makeServer(['n1', 'n2']);
  const a = makeDevice(s, { online: false, rows: [N('n1'), N('n2')], unread: 2 });
  const b = makeDevice(s, { online: false, rows: [N('n1'), N('n2')], unread: 2 });
  await a.openNotificationRow('n1'); await b.openNotificationRow('n1'); await b.openNotificationRow('n2');
  a.online = true; b.online = true;
  assert.equal(await a.notifFlush('online'), true);
  assert.equal(s.read.get('n1'), 'srv'); assert.equal(s.read.get('n2'), null);
  assert.equal(await b.notifFlush('online'), true); // n1 вже прочитано: сервер ігнорує, помилки немає
  assert.equal(s.unread(), 0); assert.equal(flushState(a).failures + flushState(b).failures, 0);
  assert.equal(a.notifQueueLen() + b.notifQueueLen(), 0);
});

test('чужий акаунт: черга іншого uid не відправляється, не рахується в лічильнику й прибирається', async function(){
  const s = makeServer(['n1']); const store = new Map();
  const a = makeDevice(s, { online: false, store: store, uid: 'u1', rows: [N('n1')], unread: 1 });
  await a.openNotificationRow('n1');
  assert.ok(store.get('budget_notif_read_queue_v1'));
  const other = makeDevice(s, { store: store, uid: 'u2' });
  assert.equal(other.notifQueueLen(), 0);
  assert.equal(store.get('budget_notif_read_queue_v1'), undefined, 'чужу чергу прибрано');
  assert.equal(await other.notifFlush('start'), false); assert.equal(s.reqs.length, 0);
  const none = makeDevice(s, { store: new Map() }); none.cloudSession = null;
  assert.equal(none.notifQueueLen(), 0); none.notifQueueAdd(['x']); assert.equal(none.store.size, 0, 'без сесії у чергу не пишемо');
});

test('«лише перегляд»: тап не ставить у чергу, відправка не створює запитів', async function(){
  const s = makeServer(['n1']); const store = new Map([['budget_notif_read_queue_v1', JSON.stringify({ uid: 'u1', ids: ['n1'] })]]);
  const c = makeDevice(s, { store: store, writeBlocked: true, rows: [N('n1')], unread: 1 });
  await c.openNotificationRow('n1');
  assert.equal(c.notifArchive.rows[0].read_at, null); assert.equal(c.notifArchive.unread, 1);
  assert.equal(await c.notifFlush('start'), false); assert.equal(netTotal(c), 0); assert.equal(flushState(c).failures, 0);
  assert.equal(c.notifQueueLen(), 1, 'черга не втрачена');
});

test('«Прочитати всі»: офлайн ставить явні id завантажених непрочитаних у чергу без запитів і без тосту; сервер не викликається', async function(){
  const s = makeServer(['a', 'b', 'c']);
  const c = makeDevice(s, { online: false, rows: [N('a'), N('b'), N('c', 'old')], unread: 5 });
  await c.markAllNotificationsRead();
  assert.deepEqual(j(c.notifQueueIds()), ['a', 'b']);
  assert.ok(c.notifArchive.rows.every(function(r){ return r.read_at; }));
  assert.equal(c.notifArchive.unread, 3); // серверні 5 − 2 поставлених; невідомі пізніші не зачеплено
  assert.equal(netTotal(c), 0); assert.deepEqual(c.toasts, []); assert.equal(c.notifArchive.busy, false);
});

test('«Прочитати всі»: онлайн із помилкою сервера — тост, черга порожня, рядки не прочитані; успіх — RPC без p_ids', async function(){
  const s = makeServer(['a', 'b']); s.fail = true;
  const c = makeDevice(s, { rows: [N('a'), N('b')], unread: 2 });
  await c.markAllNotificationsRead();
  assert.deepEqual(c.toasts, ['Немає зв\'язку, спробуйте пізніше']);
  assert.equal(c.notifQueueLen(), 0); assert.equal(c.notifArchive.unread, 2);
  assert.ok(c.notifArchive.rows.every(function(r){ return !r.read_at; })); assert.equal(rpcCount(c), 1);
  s.fail = false; await c.markAllNotificationsRead();
  assert.equal(s.reqs[1].args, undefined); assert.equal(c.notifArchive.unread, 0); assert.equal(s.unread(), 0);
});

test('«Прочитати всі» офлайн без завантажених непрочитаних: тост, черга порожня', async function(){
  const s = makeServer([]); const c = makeDevice(s, { online: false, rows: [], unread: 3 });
  await c.markAllNotificationsRead();
  assert.deepEqual(c.toasts, ['Немає зв\'язку, спробуйте пізніше']); assert.equal(c.notifQueueLen(), 0);
});

test('охоронні: черга живе поза блоком Monobank/сповіщень (там сховища заборонені), ключ чиститься при виході, у черзі лише id, зв\'язок із лічильником «голів»', function(){
  const SRC = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'index.html'), 'utf8');
  const monoStart = SRC.indexOf('/* ============ Monobank: екран підключення');
  assert.ok(SRC.indexOf("const LS_KEY_NOTIF_READ_QUEUE =") < monoStart && SRC.indexOf('async function notifFlush(') < monoStart);
  assert.match(SRC.match(/function accountLocalStorageKeys\(\)\{([\s\S]*?)\n\}/)[1], /LS_KEY_NOTIF_READ_QUEUE/);
  assert.match(SRC.match(/function clearSyncMarkers\(\)\{([\s\S]*?)\n\}/)[1], /LS_KEY_NOTIF_READ_QUEUE/);
  assert.match(SRC, /JSON\.stringify\(\{ uid: uid, ids: ids \}\)/);
  assert.match(SRC, /unread = notifEffectiveUnread\(c\.unread, notifQueueLen\(\)\)/);
});

test('збій запису в сховище після успішної відправки — невдача з паузою, а не негайний повтор тих самих id (рев\'ю п.1)', async function(){
  const s = makeServer(['n1']); const store = new Map([['budget_notif_read_queue_v1', JSON.stringify({ uid: 'u1', ids: ['n1'] })]]);
  const c = makeDevice(s, { store: store, storeFull: true });
  assert.equal(await c.notifFlush('start'), false);
  assert.equal(rpcCount(c), 1); assert.equal(flushState(c).failures, 1);
  await c.notifFlush('refresh'); assert.equal(rpcCount(c), 1, 'пауза діє');
});
test('видалення сповіщення й «Очистити» прибирають id з черги (рев\'ю п.4)', async function(){
  const s = makeServer(['a', 'b']); s.read.set('a', null);
  const c = makeDevice(s, { online: false, rows: [N('a'), N('b')], unread: 2 });
  await c.openNotificationRow('a'); await c.openNotificationRow('b');
  assert.equal(c.notifQueueLen(), 2); c.online = true;
  s.fail = false;
  await c.deleteNotificationRow('a');
  assert.deepEqual(j(c.notifQueueIds()), ['b']);
  await c.runClearNotifArchive(); assert.equal(c.notifQueueLen(), 0);
});
test('без сесії (uid немає) тап не позначає прочитаним локально — id не губиться мовчки (рев\'ю п.6)', async function(){
  const s = makeServer(['n1']); const c = makeDevice(s, { online: false, rows: [N('n1')], unread: 1 });
  c.cloudSession = null;
  await c.openNotificationRow('n1');
  assert.equal(c.notifArchive.rows[0].read_at, null); assert.equal(c.notifArchive.unread, 1);
});
