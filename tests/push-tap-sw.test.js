// PUSH-1 (Rev 2.32.257): тап по сповіщенню Monobank в Service Worker. У кожному стані вікон дія «Вхідні» має дійти до застосунку:
// або наявне вікно сфокусовано й отримало push-action, або відкрито нове вікно з ?pushAction=mono-inbox.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const SW = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');

function makeClient(name, o){
  const c = { name, visibilityState: o.visibilityState, focused: false, messages: [] };
  c.focus = function(){ if(o.focusRejects) return Promise.reject(new Error('InvalidAccessError')); c.focused = true; return Promise.resolve(c); };
  c.postMessage = function(m){ c.messages.push(m); };
  return c;
}
function runClick(clients, opts){
  opts = opts || {};
  const handlers = {}; const opened = []; const waits = [];
  // IndexedDB недоступна (як у приватному режимі): запис «очікуваної дії» й діагностика мовчки пропускаються, решта має працювати
  const indexedDB = { open(){ const r = {}; setTimeout(function(){ r.error = new Error('no idb'); r.onerror && r.onerror(); }, 0); return r; } };
  const sandbox = { self: null, caches: { keys: async () => [], delete: async () => true }, console: { log(){}, warn(){}, error(){} }, Promise, indexedDB, setTimeout, clearTimeout, Date };
  sandbox.self = {
    addEventListener(n, fn){ handlers[n] = fn; }, registration: { showNotification(){ return Promise.resolve(); } }, skipWaiting(){},
    clients: { matchAll: async () => clients, claim: async () => {}, openWindow(u){ opened.push(u); return opts.openWindowFails ? Promise.reject(new Error('x')) : Promise.resolve({}); } },
  };
  vm.createContext(sandbox);
  vm.runInContext(SW, sandbox);
  const data = { type: 'mono-inbox', batch_ts: '2026-10-16T05:00:00.000000+00:00', push_id: 'pid-1' };
  handlers.notificationclick({ notification: { close(){}, data: Object.assign({}, data), tag: 'mono-inbox' }, waitUntil(p){ waits.push(p); } });
  return Promise.allSettled(waits).then(function(){ return { opened, clients }; });
}
const gotAction = c => c.messages.some(m => m.type === 'push-action' && m.action && m.action.type === 'mono-inbox');
const openedInbox = r => r.opened.some(u => /pushAction=mono-inbox/.test(u));

test('PUSH-1: вікна немає — відкривається нове вікно з pushAction=mono-inbox', async () => {
  const r = await runClick([]);
  assert.ok(openedInbox(r));
});
test('PUSH-1: вікно відкрите й видиме — фокус і push-action у нього, нове вікно не відкривається', async () => {
  const a = makeClient('a', { visibilityState: 'visible' });
  const r = await runClick([a]);
  assert.ok(a.focused && gotAction(a));
  assert.equal(r.opened.length, 0);
});
test('PUSH-1: вікно згорнуте, фокус відхилено — «Вхідні» все одно відкриваються (запасне нове вікно)', async () => {
  const a = makeClient('a', { visibilityState: 'hidden', focusRejects: true });
  const r = await runClick([a]);
  assert.ok(openedInbox(r), 'після відхиленого focus() потрібен openWindow');
});
test('PUSH-1: два вікна, перше застаріле (приховане, focus відхиляється), друге видиме — дія доходить до видимого й воно сфокусоване', async () => {
  const stale = makeClient('stale', { visibilityState: 'hidden', focusRejects: true });
  const live = makeClient('live', { visibilityState: 'visible' });
  const r = await runClick([stale, live]);
  assert.ok(live.focused, 'видиме вікно сфокусовано');
  assert.ok(gotAction(live), 'видиме вікно отримало push-action');
  assert.equal(r.opened.length, 0, 'нове вікно не потрібне, коли є жива');
});
test('PUSH-1: вікно згорнуте, focus() проходить — дія надіслана вікну (і чекає у вікна на повернення)', async () => {
  const a = makeClient('a', { visibilityState: 'hidden' });
  const r = await runClick([a]);
  assert.ok(a.focused && gotAction(a));
  assert.equal(r.opened.length, 0);
});
