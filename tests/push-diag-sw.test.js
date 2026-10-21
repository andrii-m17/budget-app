// Rev 2.32.103 (NOTIF-3 Rev 2): розширена діагностика сповіщень у воркері (режим розробника): вимкнено = нічого не пише; увімкнено = події без тексту; ніколи не блокує показ.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const SW = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');

// Фейковий IndexedDB: бази за іменем, сховища за іменем; add/get/put/getAll/getAllKeys/delete; open може «зависати».
function makeIdb(opts){
  opts = opts || {};
  const dbs = {};
  const log = { opens: [] };
  const later = fn => setTimeout(fn, 0);
  function storeApi(data, tx, cfg){
    let seq = data.__seq || 0;
    return {
      add(v){ const r = {}; later(() => { const k = cfg.auto ? ++seq : v[cfg.keyPath]; data.__seq = seq; if(cfg.auto && cfg.keyPath) v[cfg.keyPath] = k; data[k] = v; r.result = k; r.onsuccess && r.onsuccess(); }); return r; },
      put(v, key){ const r = {}; later(() => { data[key !== undefined ? key : v[cfg.keyPath]] = v; r.onsuccess && r.onsuccess(); }); return r; },
      get(key){ const r = {}; later(() => { r.result = data[key]; r.onsuccess && r.onsuccess(); }); return r; },
      getAll(){ const r = {}; later(() => { r.result = Object.keys(data).filter(k => k !== '__seq').map(k => data[k]); r.onsuccess && r.onsuccess(); }); return r; },
      getAllKeys(){ const r = {}; later(() => { r.result = Object.keys(data).filter(k => k !== '__seq').map(Number).filter(n => !isNaN(n)); r.onsuccess && r.onsuccess(); }); return r; },
      delete(k){ later(() => { delete data[k]; }); },
    };
  }
  const idb = {
    _dbs: dbs, _log: log,
    open(name){
      log.opens.push(name);
      const req = {};
      if(opts.hang === name || opts.hang === true) return req;
      later(() => {
        const fresh = !dbs[name];
        dbs[name] = dbs[name] || { stores: {}, cfg: {} };
        const db = dbs[name];
        const api = {
          objectStoreNames: { contains(n){ return !!db.stores[n]; } },
          createObjectStore(n, c){ db.stores[n] = {}; db.cfg[n] = { auto: !!(c && c.autoIncrement), keyPath: c && c.keyPath }; },
          transaction(n){ const tx = {}; tx.objectStore = () => storeApi(db.stores[Array.isArray(n) ? n[0] : n], tx, db.cfg[Array.isArray(n) ? n[0] : n]); later(() => later(() => later(() => { tx.oncomplete && tx.oncomplete(); }))); return tx; },
          close(){},
        };
        req.result = api;
        if(fresh && req.onupgradeneeded) req.onupgradeneeded();
        req.onsuccess && req.onsuccess();
      });
      return req;
    },
  };
  return idb;
}
function runSw(opts){
  const handlers = {}; const shown = [];
  const idb = opts.idb || makeIdb();
  const sandbox = { self: null, caches: { keys: async () => [], delete: async () => true }, console: { log(){}, warn(){}, error(){} }, Promise, indexedDB: idb, setTimeout, clearTimeout, Date };
  sandbox.self = { addEventListener(n, fn){ handlers[n] = fn; }, registration: { showNotification(t, o){ shown.push([t, o]); return Promise.resolve(); } },
    clients: opts.clients || { matchAll: async () => [{ visibilityState: 'visible' }, { visibilityState: 'hidden' }], claim: async () => {} }, skipWaiting(){} };
  vm.createContext(sandbox);
  vm.runInContext(SW, sandbox);
  return { handlers, shown, idb, sandbox };
}
async function push(env, payload){
  let waited = null;
  env.handlers.push({ data: { json(){ return payload; } }, waitUntil(p){ waited = p; } });
  await Promise.resolve(waited).catch(function(){});
}
const events = env => { const d = env.idb._dbs['budget-app-push-diag']; return d ? Object.keys(d.stores.events).filter(k => k !== '__seq').map(k => d.stores.events[k]) : []; };
const setFlag = (env, on) => { env.idb._dbs['budget-app-push-diag'] = env.idb._dbs['budget-app-push-diag'] || { stores: { flag: {}, events: {} }, cfg: { flag: {}, events: { auto: true, keyPath: 'id' } } }; env.idb._dbs['budget-app-push-diag'].stores.flag.enabled = on; };
const P = { title: 'СЕКРЕТНИЙ заголовок', body: 'СЕКРЕТНЕ тіло −999 ₴', data: { type: 'mono-inbox', batch_ts: '2026-10-16T05:00:00.000000+00:00', push_id: 'pid-1', seq: 2, series_id: 's-1' } };

test('режим вимкнено (за замовчуванням): показ є, у журнал діагностики нічого не пишеться', async () => {
  const env = runSw({});
  await push(env, P);
  assert.equal(env.shown.length, 1);
  assert.equal(events(env).length, 0);
  assert.ok(env.idb._log.opens.indexOf('budget-app-push-diag') !== -1, 'прапорець читається (локально, без мережі)');
});
test('режим увімкнено: push-received + show-ok з type/tag/batch_ts/push_id/seq/series_id, тривалістю й кількістю видимих вікон; БЕЗ тексту', async () => {
  const env = runSw({}); setFlag(env, true);
  await push(env, P);
  const ev = events(env);
  assert.deepEqual(ev.map(e => e.ev), ['push-received', 'show-ok']);
  assert.equal(ev[0].type, 'mono-inbox'); assert.equal(ev[0].tag, 'mono-inbox'); assert.equal(ev[0].push_id, 'pid-1');
  assert.equal(ev[0].seq, '2'); assert.equal(ev[0].series_id, 's-1'); assert.equal(ev[0].vis, 1);
  assert.equal(typeof ev[1].dur, 'number'); assert.ok(/^budget-app-v/.test(ev[0].sw));
  const dump = JSON.stringify(ev);
  assert.ok(!/СЕКРЕТН|999/.test(dump), 'жодного тексту сповіщення чи сум');
});
test('режим увімкнено, показ відхилено: show-retry-ok або show-error у журналі', async () => {
  const env = runSw({}); setFlag(env, true);
  let n = 0; env.sandbox.self.registration.showNotification = function(t){ n++; return n === 1 ? Promise.reject(new Error('boom')) : Promise.resolve(); };
  await push(env, P);
  assert.deepEqual(events(env).map(e => e.ev), ['push-received', 'show-retry-ok']);
  assert.ok(/show:/.test(events(env)[1].err));
});
test('режим увімкнено, виняток у тілі обробника: handler-error + показ мінімального сповіщення', async () => {
  const env = runSw({}); setFlag(env, true);
  let waited = null;
  env.handlers.push({ data: { json(){ return { title: 'x', data: { type: 'a', get tag(){ throw new Error('bad tag'); } } }; } }, waitUntil(p){ waited = p; } });
  await Promise.resolve(waited).catch(function(){});
  assert.equal(env.shown.length, 1); assert.equal(env.shown[0][0], 'Money Tree');
  assert.ok(events(env).some(e => e.ev === 'handler-error' && /handler:/.test(e.err)));
});
test('кільцевий журнал: не більше 200 подій, найстаріші відкидаються', async () => {
  const env = runSw({}); setFlag(env, true);
  for(let i = 0; i < 105; i++) await push(env, { title: 't', data: { type: 'x', seq: i } });
  const ev = events(env);
  assert.equal(ev.length, 200);
  assert.ok(ev.every(e => e.ev), 'події цілі');
});
test('IndexedDB діагностики не відповідає: показ відбувся, завершення за тайм-аутом, воркер не зависає', async () => {
  const env = runSw({ idb: makeIdb({ hang: 'budget-app-push-diag' }) });
  const t0 = Date.now();
  await push(env, P);
  assert.equal(env.shown.length, 1);
  assert.ok(Date.now() - t0 < 4000);
});
test('click, closed, subscription-change, activate пишуться лише в режимі розробника', async () => {
  const off = runSw({});
  const note = { close(){}, data: { type: 'mono-inbox', push_id: 'p2' }, tag: 'mono-inbox' };
  let w1 = null;
  off.handlers.notificationclick({ notification: note, waitUntil(p){ w1 = p; } });
  await Promise.resolve(w1).catch(function(){});
  off.handlers.notificationclose({ notification: note, waitUntil(p){ w1 = p; } }); await Promise.resolve(w1);
  off.handlers.pushsubscriptionchange({ waitUntil(p){ w1 = p; } }); await Promise.resolve(w1);
  await new Promise(r => setTimeout(r, 30));
  assert.equal(events(off).length, 0, 'вимкнено: нічого');
  const on = runSw({}); setFlag(on, true);
  on.handlers.notificationclick({ notification: note, waitUntil(p){ w1 = p; } }); await Promise.resolve(w1).catch(function(){});
  on.handlers.notificationclose({ notification: note, waitUntil(p){ w1 = p; } }); await Promise.resolve(w1);
  on.handlers.pushsubscriptionchange({ waitUntil(p){ w1 = p; } }); await Promise.resolve(w1);
  on.handlers.activate({ waitUntil(p){ w1 = p; } }); await Promise.resolve(w1);
  await new Promise(r => setTimeout(r, 30));
  assert.deepEqual(events(on).map(e => e.ev).sort(), ['activate', 'click', 'closed', 'subscription-change']);
  assert.ok(events(on).every(e => !('title' in e) && !('body' in e)));
});
