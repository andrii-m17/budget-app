// Rev 2.32.223 (PUSH-READ): які рядки журналу відповідають push.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildSandbox } = require('./extract');
const g = buildSandbox({}, ['notifIdSet', 'notifRowsForPush', 'isDailyReminderRow']);
const row = (id, type, data) => ({ id, type, data: Object.assign({ type }, data), created_at: 't' + id });
const ids = (rows) => JSON.parse(JSON.stringify(rows)).map(r => r.id);

test('за push_id: лише свій рядок', function(){
  const rows = [row('a', 'backup-reminder', { push_id: 'p1' }), row('b', 'backup-reminder', { push_id: 'p2' })];
  assert.deepEqual(ids(g.notifRowsForPush(rows, { type: 'backup-reminder', pushId: 'p1' })), ['a']);
});
test('група: пачка за batch_ts і щоденні нагадування; інша пачка й інший тип не чіпаються', function(){
  const rows = [row('a', 'mono-inbox', { batch_ts: 'B1' }), row('b', 'mono-inbox', { batch_ts: 'B1' }), row('c', 'mono-inbox', { batch_ts: 'B2' }), row('d', 'mono-inbox', { tag: 'daily-expense-reminder' }), row('e', 'weekly-summary', {})];
  assert.deepEqual(ids(g.notifRowsForPush(rows, { type: 'mono-inbox', batchTs: 'B1' })), ['a', 'b']);
  assert.deepEqual(ids(g.notifRowsForPush(rows, { type: 'mono-inbox', tag: 'daily-expense-reminder' })), ['d']);
});
test('без push_id і без спільних id — нічого; за спільними id записів того ж типу — лише збіги', function(){
  const rows = [row('a', 'other-actor-added', { ids: { expenses: ['x1'] } }), row('b', 'other-actor-added', { ids: { expenses: ['x2'] } })];
  assert.deepEqual(ids(g.notifRowsForPush(rows, { type: 'other-actor-added' })), []);
  assert.deepEqual(ids(g.notifRowsForPush(rows, { type: 'other-actor-added', idsParam: 'e:x2' })), ['b']);
});
