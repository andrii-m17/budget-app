// PUSH-2 (Rev 2.32.278): чисті частини переходу за адресою #mono/<id>, запису стану для сервера й запасного повідомлення.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildSandbox, evalInSandbox } = require('./extract');
const HTML = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const SW = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');
const ctx = buildSandbox({}, ['parseMonoDeepLink', 'shouldSyncAppVisible', 'monoNewToastPlan']);
const ev = e => evalInSandbox(ctx, e);
test('маршрут: #mono/<id> → id; чужі й небезпечні адреси → null', () => {
  assert.equal(ev("parseMonoDeepLink('#mono/0f3a-9b_2C')"), '0f3a-9b_2C');
  for(const bad of ['', '#', '#mono', '#mono/', '#mono/a b', '#mono/../x', '#mono/a/b', '#other/1', 'mono/1', '#mono/' + 'x'.repeat(65), "#mono/<script>"]) assert.equal(ev('parseMonoDeepLink(' + JSON.stringify(bad) + ')'), null, bad);
  assert.equal(ev('parseMonoDeepLink(null)'), null);
});
test('стан для сервера пишеться лише при зміні (true/false), не при повторі й не для не-булевих', () => {
  assert.equal(ev('shouldSyncAppVisible(null, true)'), true);
  assert.equal(ev('shouldSyncAppVisible(true, true)'), false);
  assert.equal(ev('shouldSyncAppVisible(true, false)'), true);
  assert.equal(ev('shouldSyncAppVisible(false, false)'), false);
  assert.equal(ev("shouldSyncAppVisible(true, 'x')"), false);
});
test('запасне повідомлення: лише нові (status new) після останнього відкриття «Вхідних» і ще не показані', () => {
  const rows = [{ id: 'a', status: 'new', notified_at: '2026-11-10T10:00:00.000Z' }, { id: 'b', status: 'new', notified_at: '2026-11-10T11:00:00.000Z' }, { id: 'c', status: 'added', notified_at: '2026-11-10T12:00:00.000Z' }, { id: 'd', status: 'new', notified_at: '2026-11-10T08:00:00.000Z' }];
  ctx.__o = { rows, seenAt: '2026-11-10T09:00:00.000Z', shownUpTo: '' };
  let p = ev('monoNewToastPlan(__o)'); assert.equal(p.count, 2); assert.equal(p.title, 'Нових витрат: 2'); assert.equal(p.id, null); assert.equal(p.upTo, '2026-11-10T11:00:00.000Z');
  ctx.__o = { rows, seenAt: '2026-11-10T09:00:00.000Z', shownUpTo: '2026-11-10T10:30:00.000Z' };
  p = ev('monoNewToastPlan(__o)'); assert.equal(p.count, 1); assert.equal(p.title, 'Нова витрата Monobank'); assert.equal(p.id, 'b');
  ctx.__o = { rows, seenAt: '2026-11-10T09:00:00.000Z', shownUpTo: '2026-11-10T11:00:00.000Z' };
  assert.equal(ev('monoNewToastPlan(__o)'), null, 'уже показані');
  ctx.__o = { rows: [], seenAt: '', shownUpTo: '' }; assert.equal(ev('monoNewToastPlan(__o)'), null);
});
test('охорона: sw.js — обробники push і notificationclick на місці (PUSH-2 їх не чіпає); стан пишеться з visibilitychange/pageshow/pagehide без таймерів', () => {
  assert.match(SW, /addEventListener\('push'/); assert.match(SW, /addEventListener\('notificationclick'/);
  const b = HTML.slice(HTML.indexOf('async function syncAppVisible'), HTML.indexOf('const MONO_SEEN_KEY'));
  assert.doesNotMatch(b.replace(/Promise\.race[^\n]*\n/, ''), /setInterval/);
  assert.match(HTML, /window\.addEventListener\('pagehide', function\(\)\{ syncAppVisible\(false\); \}\)/);
  assert.match(HTML, /if\(typeof monoActiveSync === 'function'\) monoActiveSync\(\); \}\); \/\/ Rev 2\.32\.278/);
  assert.match(HTML, /history\.replaceState\(history\.state, '', location\.pathname \+ location\.search\)/);
});
