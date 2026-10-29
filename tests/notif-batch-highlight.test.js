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

const c0 = buildSandbox({ safeId: function(x){ return String(x); } }, ['monoSameBatch', 'monoBatchRows']);
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
test('monoBatchRows (Rev 2.32.161): лише рядки з notified_at = мітка пачки; без мітки або невідома — порожньо (запасного «усі нові» немає)', function(){
  assert.deepEqual(j(c0.monoBatchRows(rows, B1)).map(r => r.id), ['a', 'b', 'e']);
  assert.deepEqual(j(c0.monoBatchRows(rows, B2)).map(r => r.id), ['c']);
  assert.deepEqual(j(c0.monoBatchRows(rows, null)), []);
  assert.deepEqual(j(c0.monoBatchRows(rows, undefined)), []);
  assert.deepEqual(j(c0.monoBatchRows(rows, '2020-01-01T00:00:00+00:00')), []);
  assert.deepEqual(j(c0.monoBatchRows(null, B1)), []);
});

function classList(){ const s = new Set(); return { add: x => s.add(x), remove: x => s.delete(x), has: x => s.has(x) }; }
function dom(ids){
  const wraps = ids.map(function(id){
    const row = { classList: classList(), scrolled: 0, scrollIntoView: function(){ this.scrolled++; } };
    return { getAttribute: () => id, querySelector: () => row, row: row };
  });
  return { wraps: wraps, document: { querySelectorAll: () => wraps } };
}
test('highlightMonoRows: клас just-notified лише на рядках зі списку id, прокрутка до першого, зняття через 3 с; порожній список — нічого', function(){
  const d = dom(['a', 'b', 'c', 'd', 'e']);
  const timers = [];
  const c = buildSandbox({ document: d.document, motionReduced: () => true, setTimeout: function(fn, ms){ timers.push([fn, ms]); } }, ['highlightMonoRows']);
  assert.equal(c.highlightMonoRows(['a', 'b', 'e']), 3);
  assert.deepEqual(d.wraps.map(w => w.row.classList.has('just-notified')), [true, true, false, false, true]);
  assert.equal(d.wraps[0].row.scrolled, 1); assert.equal(d.wraps[1].row.scrolled, 0);
  assert.deepEqual(timers.map(t => t[1]), [3000], 'одне вікно підсвітки 3 с (спільна логіка pushHighlightStart)');
  timers.forEach(t => t[0]());
  assert.ok(d.wraps.every(w => !w.row.classList.has('just-notified')));
  assert.equal(c.highlightMonoRows([]), 0); assert.equal(c.highlightMonoRows(null), 0);
  assert.ok(!/r\.status === 'new'; \}\)\.map/.test(SRC), 'запасного варіанта «усі нові» немає');
});
test('handlePushAction(mono-inbox): віддає batch_ts (пуш) або batchTs (query) і ознаку щоденного нагадування єдиному routeMonoNotification', async function(){
  const calls = [];
  const mk = () => buildSandbox({
    document: { activeElement: { blur(){} }, body: { classList: { remove(){} } }, visibilityState: 'visible', querySelector: () => null, querySelectorAll: () => [], getElementById: () => null },
    debugRecordingActive: false, closeNotifArchive(){}, closeAppModal(){}, performSwitchTab(){}, routeMonoNotification: async function(o){ calls.push(JSON.stringify(o)); }, openMonoScreen(){ calls.push('monoScreen'); },
    monoState: { loaded: false }, captureDebugGeometry(){}, captureFocusAudit(){}, setTimeout(){}, cloudAuthInitInFlight: null,
  }, ['routeForPushType', 'monoNotifGroupVisible', 'pushApplyDiag', 'closeOpenSheetsForPush', 'handlePushAction']);
  await mk().handlePushAction({ type: 'mono-inbox', batch_ts: B1 });
  await mk().handlePushAction({ type: 'mono-inbox', batchTs: B2 });
  await mk().handlePushAction({ type: 'mono-inbox' });
  await mk().handlePushAction({ type: 'mono-inbox', tag: 'daily-expense-reminder' });
  assert.deepEqual(calls, [JSON.stringify({ batchTs: B1, daily: false }), JSON.stringify({ batchTs: B2, daily: false }), JSON.stringify({ batchTs: null, daily: false }), JSON.stringify({ batchTs: null, daily: true })]);
});
test('охоронні: notified_at у запиті «Вхідних»; з архіву передається created_at; холодний старт: batchTs у URL (sw.js) і query; клас у CSS', function(){
  assert.match(SRC, /suggested_subcategory,suggested_installment_id,expense_id,notified_at'\)/);
  assert.match(SRC, /batch_ts: isDailyReminderRow\(row\) \? undefined : \(\(row\.data && row\.data\.batch_ts\) \|\| row\.created_at\)/);
  assert.match(SW, /notifData\.tag\) url \+= '&tag=' \+ encodeURIComponent\(notifData\.tag\)/);
  assert.match(SRC, /tag: pushActionParams\.get\('tag'\) \|\| undefined/);
  assert.match(SW, /notifData\.batch_ts\) url \+= '&batchTs=' \+ encodeURIComponent\(notifData\.batch_ts\)/);
  assert.match(SRC, /batchTs: pushActionParams\.get\('batchTs'\) \|\| undefined/);
  assert.match(SRC, /\.expense-row\.just-notified\{ background:var\(--color-info-bg\); animation:cardBlink/);
});
