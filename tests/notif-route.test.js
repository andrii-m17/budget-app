// Rev 2.32.161 (NOTIF-ROUTE) — єдине правило тапу по сповіщенню Monobank (системне й рядок журналу), без запасного «підсвітити всі нові».
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildSandbox } = require('./extract');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const j = v => JSON.parse(JSON.stringify(v));
const B1 = '2026-10-16T05:00:00.123456+00:00', B2 = '2026-10-16T05:10:00.000000+00:00', B3 = '2026-10-16T06:00:00.000000+00:00';
const EXP = [{ id: 'x1', date: '2026-10-10' }, { id: 'x2', date: '2026-10-11' }, { id: 'xd', date: '2026-10-12', deletedAt: '2026-10-13' }];

// мок: рядки mono_inbox; журнал викликів інтерфейсу
function env(inbox, o){
  const opts = o || {}; const log = [];
  const db = { from(t){ return { select(){ const q = { f: {}, gte(c, v){ q.f.gte = v; return q; }, lte(c, v){ q.f.lte = v; return q; }, eq(c, v){ q.f.eq = v; return q; },
    limit(){ if(opts.fail) return Promise.resolve({ error: { message: 'x' } });
      let rows = inbox; if(q.f.eq) rows = rows.filter(r => r.status === q.f.eq);
      if(q.f.gte) rows = rows.filter(r => r.notified_at && Date.parse(r.notified_at) >= Date.parse(q.f.gte) && Date.parse(r.notified_at) <= Date.parse(q.f.lte));
      return Promise.resolve({ data: j(rows), error: null }); } }; return q; } }; } };
  const g = {
    expenses: EXP, safeId: String, getSupabaseClient: () => db, awaitCloudGate: async () => opts.offline ? 'offline' : 'ready',
    showTextToast: (t) => log.push('toast:' + t), closeOpenSheetsForPush: () => log.push('close'), performSwitchTab: t => log.push('tab:' + t),
    document: { body: { classList: { remove(){} } } }, openMonoInbox: async o => log.push('inbox:' + o.tab), openExpenseInJournal: (id, d) => log.push('journal:' + id + ':' + d),
    highlightMonoRows: ids => log.push('hl:' + (ids || []).join(',')),
  };
  const c = buildSandbox(g, ['monoSameBatch', 'monoBatchRows', 'monoNotifTarget', 'monoFetchBatch', 'monoHasNew', 'routeMonoNotification']);
  return { c, log };
}
const R = (id, status, at, expense_id) => ({ id, status, notified_at: at, expense_id: expense_id || null });
const tap = (inbox, o, opts) => { const e = env(inbox, opts); return e.c.routeMonoNotification(o).then(() => e.log); };

test('таблиця: є нові → «Нові», підсвічені лише ці рядки', async function(){
  assert.deepEqual(await tap([R('a', 'new', B1), R('b', 'new', B1), R('c', 'new', B2)], { batchTs: B1 }), ['close', 'tab:service', 'inbox:new', 'hl:a,b']);
});
test('таблиця: пачка оброблена — одна додана → Журнал; кілька → «Додані» з підсвіткою пачки; усе пропущено → «Пропущені» з підсвіткою', async function(){
  assert.deepEqual(await tap([R('a', 'added', B1, 'x1')], { batchTs: B1 }), ['close', 'journal:x1:2026-10-10']);
  assert.deepEqual(await tap([R('a', 'added', B1, 'x1'), R('b', 'added', B1, 'x2')], { batchTs: B1 }), ['close', 'tab:service', 'inbox:added', 'hl:a,b']);
  assert.deepEqual(await tap([R('a', 'skipped', B1), R('b', 'ignored', B1)], { batchTs: B1 }), ['close', 'tab:service', 'inbox:skipped', 'hl:a,b']);
});
test('таблиця: рядків пачки немає або витрату видалено/немає → тост «Запис уже недоступний», без навігації й підсвітки', async function(){
  assert.deepEqual(await tap([R('a', 'new', B2)], { batchTs: B1 }), ['toast:Запис уже недоступний']);
  assert.deepEqual(await tap([R('a', 'added', B1, 'xd')], { batchTs: B1 }), ['toast:Запис уже недоступний'], 'витрату видалено');
  assert.deepEqual(await tap([R('a', 'added', B1, 'нема')], { batchTs: B1 }), ['toast:Запис уже недоступний']);
  assert.deepEqual(await tap([], { batchTs: B1 }), ['toast:Запис уже недоступний']);
});
test('таблиця: щоденне нагадування — «Нові» без підсвітки; нових немає → «Вже оброблено»', async function(){
  assert.deepEqual(await tap([R('a', 'new', B1)], { daily: true }), ['close', 'tab:service', 'inbox:new']);
  assert.deepEqual(await tap([R('a', 'added', B1, 'x1')], { daily: true }), ['toast:Вже оброблено']);
  assert.deepEqual(await tap([], { daily: true }), ['toast:Вже оброблено']);
  assert.deepEqual(await tap([R('a', 'new', B1)], { daily: true, batchTs: B1 }), ['close', 'tab:service', 'inbox:new'], 'навіть із batch_ts нагадування без підсвітки');
});
test('пачка частково оброблена: підсвічені лише необроблені (не оброблені й не чужі)', async function(){
  const log = await tap([R('a', 'added', B1, 'x1'), R('b', 'new', B1), R('c', 'skipped', B1), R('d', 'new', B1), R('e', 'new', B2)], { batchTs: B1 });
  assert.deepEqual(log, ['close', 'tab:service', 'inbox:new', 'hl:b,d']);
});
test('дві пачки підряд: кожне сповіщення веде до своєї пачки; обробка першої не впливає на другу', async function(){
  const inbox = [R('a', 'new', B1), R('b', 'new', B1), R('c', 'new', B2)];
  assert.deepEqual(await tap(inbox, { batchTs: B1 }), ['close', 'tab:service', 'inbox:new', 'hl:a,b']);
  assert.deepEqual(await tap(inbox, { batchTs: B2 }), ['close', 'tab:service', 'inbox:new', 'hl:c']);
  const after = [R('a', 'added', B1, 'x1'), R('b', 'skipped', B1), R('c', 'new', B2)]; // перша оброблена
  assert.deepEqual(await tap(after, { batchTs: B1 }), ['close', 'journal:x1:2026-10-10']);
  assert.deepEqual(await tap(after, { batchTs: B2 }), ['close', 'tab:service', 'inbox:new', 'hl:c']);
  assert.deepEqual(await tap(after, { batchTs: B3 }), ['toast:Запис уже недоступний']);
});
test('сповіщення без batch_ts: пачка за created_at; різний формат мітки (мікросекунди) збігається; «усіх нових» не підсвічується ніколи', async function(){
  const inbox = [R('a', 'new', B1), R('z', 'new', B2)];
  const e = env(inbox); await e.c.routeMonoNotification({ batchTs: '2026-10-16T05:00:00.123Z' }); assert.deepEqual(e.log, ['close', 'tab:service', 'inbox:new', 'hl:a']);
  const none = await tap(inbox, {}); // системне сповіщення без batch_ts і без тега: пачку не визначити
  assert.deepEqual(none, ['close', 'tab:service', 'inbox:new']); assert.ok(!none.some(x => x.startsWith('hl:')));
  const old = await tap(inbox, { batchTs: '2020-01-01T00:00:00+00:00' }); assert.ok(!old.some(x => x.startsWith('hl:')));
  assert.ok(!/status === 'new'; \}\)\.map\(function\(r\)\{ return safeId/.test(SRC));
});
test('тап офлайн / помилка запиту: «Вхідні» «Нові» без підсвітки й без тостів (стан невідомий)', async function(){
  const inbox = [R('a', 'new', B1)];
  assert.deepEqual(await tap(inbox, { batchTs: B1 }, { offline: true }), ['close', 'tab:service', 'inbox:new']);
  assert.deepEqual(await tap(inbox, { batchTs: B1 }, { fail: true }), ['close', 'tab:service', 'inbox:new']);
  assert.deepEqual(await tap(inbox, { daily: true }, { offline: true }), ['close', 'tab:service', 'inbox:new'], 'нагадування офлайн: ведемо у «Вхідні»');
  assert.deepEqual(await tap(inbox, { daily: true }, { fail: true }), ['close', 'tab:service', 'inbox:new']);
});

// ---- однаковий результат: системне сповіщення (закрите/згорнуте/відкрите) і рядок журналу ----
async function viaPush(inbox, action, opts){
  const e = env(inbox, opts); const log = e.log;
  const ctx = buildSandbox({
    expenses: EXP, safeId: String, getSupabaseClient: () => ({ from(){ return { select(){ const q = { f: {}, gte(c, v){ q.f.gte = v; return q; }, lte(c, v){ q.f.lte = v; return q; }, eq(c, v){ q.f.eq = v; return q; }, limit(){ let rows = inbox; if(q.f.eq) rows = rows.filter(r => r.status === q.f.eq); if(q.f.gte) rows = rows.filter(r => r.notified_at && Date.parse(r.notified_at) >= Date.parse(q.f.gte) && Date.parse(r.notified_at) <= Date.parse(q.f.lte)); return Promise.resolve({ data: j(rows), error: null }); } }; return q; } }; } }),
    awaitCloudGate: async () => 'ready', showTextToast: t => log.push('toast:' + t), closeOpenSheetsForPush: () => log.push('close'), performSwitchTab: t => log.push('tab:' + t),
    document: { body: { classList: { remove(){} } } }, openMonoInbox: async o => log.push('inbox:' + o.tab), openExpenseInJournal: (id, d) => log.push('journal:' + id + ':' + d), highlightMonoRows: ids => log.push('hl:' + (ids || []).join(',')),
    monoState: { loaded: false }, captureDebugGeometry(){}, captureFocusAudit(){}, setTimeout(){}, cloudAuthInitInFlight: null, pushApplyDiag(){},
  }, ['monoSameBatch', 'monoBatchRows', 'monoNotifTarget', 'monoFetchBatch', 'monoHasNew', 'routeMonoNotification', 'routeForPushType', 'monoNotifGroupVisible', 'handlePushAction']);
  await ctx.handlePushAction(action); return log;
}
async function viaRow(inbox, row, opts){
  const log = [];
  const ctx = buildSandbox({
    expenses: EXP, safeId: String, notifArchive: { rows: [row], unread: 0, batches: {}, batchesOk: false }, updateNotifBell(){}, renderNotifArchive(){}, monoReady: () => true, notifQueueUid: () => 'u', notifQueueAdd(){}, notifFlush: async () => true, debugRecordingActive: false,
    getSupabaseClient: () => ({ from(){ return { select(){ const q = { f: {}, gte(c, v){ q.f.gte = v; return q; }, lte(c, v){ q.f.lte = v; return q; }, eq(c, v){ q.f.eq = v; return q; }, limit(){ let rows = inbox; if(q.f.eq) rows = rows.filter(r => r.status === q.f.eq); if(q.f.gte) rows = rows.filter(r => r.notified_at && Date.parse(r.notified_at) >= Date.parse(q.f.gte) && Date.parse(r.notified_at) <= Date.parse(q.f.lte)); return Promise.resolve({ data: j(rows), error: null }); } }; return q; } }; } }),
    awaitCloudGate: async () => 'ready', showTextToast: t => log.push('toast:' + t), closeOpenSheetsForPush: () => log.push('close'), closeNotifArchive: () => log.push('archive'), performSwitchTab: t => log.push('tab:' + t),
    document: { body: { classList: { remove(){} } } }, openMonoInbox: async o => log.push('inbox:' + o.tab), openExpenseInJournal: (id, d) => log.push('journal:' + id + ':' + d), highlightMonoRows: ids => log.push('hl:' + (ids || []).join(',')),
    monoState: { loaded: false }, captureDebugGeometry(){}, captureFocusAudit(){}, setTimeout(){}, cloudAuthInitInFlight: null, pushApplyDiag(){}, isWriteBlocked: () => false,
  }, ['monoSameBatch', 'monoBatchRows', 'monoNotifTarget', 'monoFetchBatch', 'monoHasNew', 'routeMonoNotification', 'routeForPushType', 'monoNotifGroupVisible', 'handlePushAction', 'isDailyReminderRow', 'openNotificationRow']);
  await ctx.openNotificationRow(row.id); return log;
}
test('системне сповіщення (повідомлення/холодний старт → handlePushAction) і рядок журналу дають однаковий результат для кожного випадку таблиці', async function(){
  const cases = [
    { name: 'нові', inbox: [R('a', 'new', B1), R('b', 'new', B1)], batch: B1 },
    { name: 'частково', inbox: [R('a', 'added', B1, 'x1'), R('b', 'new', B1)], batch: B1 },
    { name: 'одна додана', inbox: [R('a', 'added', B1, 'x1')], batch: B1 },
    { name: 'кілька доданих', inbox: [R('a', 'added', B1, 'x1'), R('b', 'added', B1, 'x2')], batch: B1 },
    { name: 'пропущено', inbox: [R('a', 'skipped', B1)], batch: B1 },
    { name: 'немає пачки', inbox: [R('a', 'new', B2)], batch: B1 },
    { name: 'видалена витрата', inbox: [R('a', 'added', B1, 'xd')], batch: B1 },
    { name: 'нагадування, є нові', inbox: [R('a', 'new', B1)], daily: true },
    { name: 'нагадування, нових немає', inbox: [R('a', 'added', B1, 'x1')], daily: true },
  ];
  for(const c of cases){
    const action = c.daily ? { type: 'mono-inbox', tag: 'daily-expense-reminder' } : { type: 'mono-inbox', batch_ts: c.batch };
    const row = { id: 'n1', type: 'mono-inbox', title: 't', body: 'b', created_at: B1, read_at: null, data: c.daily ? { type: 'mono-inbox', tag: 'daily-expense-reminder' } : { type: 'mono-inbox', batch_ts: c.batch } };
    const sys = await viaPush(c.inbox, action), jr = await viaRow(c.inbox, row);
    assert.deepEqual(sys, jr, c.name); assert.ok(sys.length > 0, c.name);
  }
  // рядок без batch_ts: пачка за created_at = те саме, що системне з batch_ts = created_at
  const inbox = [R('a', 'new', B1)];
  const row = { id: 'n2', type: 'mono-inbox', title: 't', body: 'b', created_at: B1, read_at: null, data: { type: 'mono-inbox' } };
  assert.deepEqual(await viaRow(inbox, row), await viaPush(inbox, { type: 'mono-inbox', batch_ts: B1 }));
});
test('«Вже оброблено» й «Запис уже недоступний» не закривають журнал сповіщень і шторки (без навігації)', async function(){
  const gone = await tap([], { batchTs: B1 }); assert.ok(!gone.includes('close'));
  const done = await tap([R('a', 'added', B1, 'x1')], { daily: true }); assert.ok(!done.includes('close'));
});
test('охоронні: усі шляхи (системне й рядок) йдуть через routeMonoNotification; тег нагадування доходить до холодного старту', function(){
  assert.match(SRC, /routeMonoNotification\(\{ batchTs: action\.batch_ts \|\| action\.batchTs \|\| null, daily: action\.tag === 'daily-expense-reminder' \}\)/);
  assert.ok(!/reminderPending\(row, notifArchive/.test(SRC) && !/openProcessedNotification/.test(SRC) && !/highlightMonoBatch/.test(SRC), 'старі окремі гілки прибрано');
});
