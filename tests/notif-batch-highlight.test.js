// Rev 2.32.95 (NOTIF-1 Rev 2): підсвітка рядків пачки Monobank у «Вхідних» за batch_ts / created_at.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildSandbox } = require('./extract');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const SW = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');
const j = v => JSON.parse(JSON.stringify(v));

const c0 = buildSandbox({ safeId: function(x){ return String(x); } }, ['monoSameBatch', 'monoBatchRowIds']);
const B1 = '2026-10-16T05:00:00.123456+00:00', B2 = '2026-10-16T05:10:00.000000+00:00';
const rows = [
  { id: 'a', status: 'new', notified_at: B1 }, { id: 'b', status: 'new', notified_at: '2026-10-16T05:00:00.123+00:00' },
  { id: 'c', status: 'new', notified_at: B2 }, { id: 'd', status: 'new', notified_at: null }, { id: 'e', status: 'added', notified_at: B1 },
];
test('monoSameBatch: за моментом часу (мс), формат і мікросекунди не заважають; порожнє — ні', function(){
  assert.equal(c0.monoSameBatch(B1, '2026-10-16T05:00:00.123Z'), true);
  assert.equal(c0.monoSameBatch(B1, B1), true);
  assert.equal(c0.monoSameBatch(B1, B2), false);
  assert.equal(c0.monoSameBatch(null, B1), false);
  assert.equal(c0.monoSameBatch(B1, ''), false);
  assert.equal(c0.monoSameBatch('не-дата', B1), false);
});
test('monoBatchRowIds: рядки пачки; без мітки — усі нові; пачка вже оброблена або невідома — порожньо', function(){
  assert.deepEqual(j(c0.monoBatchRowIds(rows, B1)), ['a', 'b', 'e']);
  assert.deepEqual(j(c0.monoBatchRowIds(rows, B2)), ['c']);
  assert.deepEqual(j(c0.monoBatchRowIds(rows, null)), ['a', 'b', 'c', 'd']);
  assert.deepEqual(j(c0.monoBatchRowIds(rows, '2020-01-01T00:00:00+00:00')), []);
  assert.deepEqual(j(c0.monoBatchRowIds(null, B1)), []);
});

function classList(){ const s = new Set(); return { add: x => s.add(x), remove: x => s.delete(x), has: x => s.has(x) }; }
function dom(ids){
  const wraps = ids.map(function(id){
    const row = { classList: classList(), scrolled: 0, scrollIntoView: function(){ this.scrolled++; } };
    return { getAttribute: () => id, querySelector: () => row, row: row };
  });
  return { wraps: wraps, document: { querySelectorAll: () => wraps } };
}
test('highlightMonoBatch: клас just-notified лише на рядках пачки, прокрутка до першого, зняття через 3 с', function(){
  const d = dom(['a', 'b', 'c', 'd', 'e']);
  const timers = [];
  const c = buildSandbox({ safeId: String, document: d.document, monoInbox: { rows: rows }, motionReduced: () => true, setTimeout: function(fn, ms){ timers.push([fn, ms]); } }, ['monoSameBatch', 'monoBatchRowIds', 'highlightMonoBatch']);
  assert.equal(c.highlightMonoBatch(B1), 3);
  assert.deepEqual(d.wraps.map(w => w.row.classList.has('just-notified')), [true, true, false, false, true]);
  assert.equal(d.wraps[0].row.scrolled, 1); assert.equal(d.wraps[1].row.scrolled, 0);
  assert.deepEqual(timers.map(t => t[1]), [3000, 3000, 3000]);
  timers.forEach(t => t[0]());
  assert.ok(d.wraps.every(w => !w.row.classList.has('just-notified')));
  assert.equal(c.highlightMonoBatch('2020-01-01T00:00:00+00:00'), 0);
});
test('handlePushAction(mono-inbox): після відкриття «Вхідних» підсвічує пачку з batch_ts (пуш) або batchTs (query)', async function(){
  const calls = [];
  const mk = () => buildSandbox({
    document: { activeElement: { blur(){} }, body: { classList: { remove(){} } }, visibilityState: 'visible', querySelector: () => null, querySelectorAll: () => [], getElementById: () => null },
    debugRecordingActive: false, closeNotifArchive(){}, closeAppModal(){}, performSwitchTab(){}, openMonoInbox: async function(o){ calls.push('open' + (o && o.fromPush ? ':push' : '')); }, openMonoScreen(){ calls.push('monoScreen'); },
    highlightMonoBatch: function(b){ calls.push('hl:' + b); }, monoState: { loaded: false }, captureDebugGeometry(){}, captureFocusAudit(){}, setTimeout(){}, cloudAuthInitInFlight: null,
  }, ['routeForPushType', 'monoNotifGroupVisible', 'pushApplyDiag', 'closeOpenSheetsForPush', 'handlePushAction']);
  await mk().handlePushAction({ type: 'mono-inbox', batch_ts: B1 });
  await mk().handlePushAction({ type: 'mono-inbox', batchTs: B2 });
  await mk().handlePushAction({ type: 'mono-inbox' });
  assert.deepEqual(calls, ['open:push', 'hl:' + B1, 'open:push', 'hl:' + B2, 'open:push', 'hl:null']);
});
test('охоронні: notified_at у запиті «Вхідних»; з архіву передається created_at; холодний старт: batchTs у URL (sw.js) і query; клас у CSS', function(){
  assert.match(SRC, /suggested_subcategory,suggested_installment_id,expense_id,notified_at'\)/);
  assert.match(SRC, /batch_ts: isDailyReminderRow\(row\) \? undefined : \(\(row\.data && row\.data\.batch_ts\) \|\| row\.created_at\)/);
  assert.match(SW, /notifData\.batch_ts\) url \+= '&batchTs=' \+ encodeURIComponent\(notifData\.batch_ts\)/);
  assert.match(SRC, /batchTs: pushActionParams\.get\('batchTs'\) \|\| undefined/);
  assert.match(SRC, /\.expense-row\.just-notified\{ background:var\(--color-info-bg\); animation:cardBlink/);
});
