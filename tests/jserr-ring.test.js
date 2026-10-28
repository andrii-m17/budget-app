// Rev 2.32.123 (JSERR-1): кільцевий журнал помилок JS в IndexedDB лише в режимі розробника (вимкнено за замовчуванням); ≤ 50, ліміт частоти, без чутливих даних, у «Надіслати лог».
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildSandbox, evalInSandbox } = require('./extract');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const j = v => JSON.parse(JSON.stringify(v));
const NAMES = ['JSERR_DB_NAME', 'JSERR_STORE', 'JSERR_RING_MAX', 'JSERR_RATE_MAX', 'JSERR_RATE_WINDOW_MS', 'jsErrOpen', 'jsErrRateAllow', 'jsErrPersist', 'jsErrReadAll', 'jsErrClear', 'jsErrEntryLine', 'jsErrToLogEvents'];

// Мінімальний фейковий IndexedDB: одна база, одне сховище з autoIncrement keyPath 'id'; getAll/add/put/delete/clear; транзакція завершується після черги запитів.
function fakeIdb(opts){
  const o = opts || {}; const rows = new Map(); let seq = 0; const log = { opens: 0 };
  return { _rows: rows, _log: log, open(){
    log.opens++;
    const req = {};
    if(o.fail){ setTimeout(() => { req.error = new Error('idb'); req.onerror && req.onerror(); }, 0); return req; }
    setTimeout(() => {
      const db = { objectStoreNames: { contains: () => true }, createObjectStore(){}, close(){},
        transaction(){ const tx = {}; const store = {
          getAll(){ const r = {}; setTimeout(() => { r.result = [...rows.values()].map(x => Object.assign({}, x)); r.onsuccess && r.onsuccess(); setTimeout(() => setTimeout(() => tx.oncomplete && tx.oncomplete(), 0), 0); }, 0); return r; },
          add(v){ const id = ++seq; rows.set(id, Object.assign({}, v, { id })); }, put(v){ rows.set(v.id, Object.assign({}, v)); }, delete(id){ rows.delete(id); }, clear(){ rows.clear(); setTimeout(() => tx.oncomplete && tx.oncomplete(), 0); },
        }; tx.objectStore = () => store; return tx; } };
      req.result = db; req.onupgradeneeded && req.onupgradeneeded(); req.onsuccess && req.onsuccess();
    }, 0); return req;
  } };
}
function mk(on, idb, now){
  const c = buildSandbox({ indexedDB: idb, Date: class extends Date { static now(){ return c.__now(); } }, jsErrPersistOn: on, jsErrRateLog: [], __now: now || (() => 1700000000000) }, NAMES);
  return c;
}
const REC = (key, over) => Object.assign({ key, message: 'Помилка ' + key, source: 'app.js:10', stackTop: ['fnA', 'fnB'], tab: 'service', count: 1 }, over || {});
const rows = idb => [...idb._rows.values()];

test('ВИМКНЕНО за замовчуванням: нічого не пишеться й база навіть не відкривається', async () => {
  const idb = fakeIdb(); const c = mk(false, idb);
  assert.equal(await c.jsErrPersist(REC('a')), false);
  assert.equal(idb._log.opens, 0); assert.equal(rows(idb).length, 0);
  assert.ok(SRC.includes('let jsErrPersistOn = false;'), 'типово вимкнено');
});
test('увімкнено: запис без значень користувача; дублікат збільшує count і час, а не додає рядок; поля обрізані', async () => {
  const idb = fakeIdb(); const t = { v: 1700000000000 }; const c = mk(true, idb, () => t.v);
  await c.jsErrPersist(REC('a', { message: 'x'.repeat(500), source: 'y'.repeat(200), stackTop: ['f1', 'f2', 'f3', 'f4'], tab: 't'.repeat(99) }));
  const r = rows(idb)[0];
  assert.ok(r.message.length <= 160 && r.source.length <= 60 && r.stackTop.length === 3 && r.tab.length <= 30);
  assert.deepEqual(Object.keys(r).sort(), ['count', 'id', 'key', 'message', 'source', 'stackTop', 'tab', 'ts'], 'лише службові поля, без даних користувача');
  t.v += 5000; await c.jsErrPersist(REC('a'));
  assert.equal(rows(idb).length, 1); assert.equal(rows(idb)[0].count, 2); assert.equal(rows(idb)[0].ts, t.v);
});
test('кільце ≤ 50: найстаріші витісняються', async () => {
  const idb = fakeIdb(); const t = { v: 1700000000000 }; const c = mk(true, idb, () => t.v);
  for(let i = 0; i < 60; i++){ t.v += 61000; await c.jsErrPersist(REC('k' + i)); } // 61 с між записами: ліміт частоти не заважає
  const rs = rows(idb);
  assert.equal(rs.length, 50);
  assert.ok(!rs.some(r => r.key === 'k0') && rs.some(r => r.key === 'k59'), 'найстаріші видалено, найновіші лишились');
});
test('ліміт частоти: ≤ 10 записів за хвилину, решта відкидається; після вікна знову дозволено', async () => {
  const idb = fakeIdb(); const t = { v: 1700000000000 }; const c = mk(true, idb, () => t.v);
  const res = []; for(let i = 0; i < 15; i++) res.push(await c.jsErrPersist(REC('s' + i)));
  assert.equal(res.filter(Boolean).length, 10); assert.equal(rows(idb).length, 10);
  t.v += 61000; assert.equal(await c.jsErrPersist(REC('after')), true);
});
test('читання відсортоване за часом, очищення; збій IndexedDB не кидає винятків; події для логу без значень', async () => {
  const idb = fakeIdb(); const t = { v: 1700000000000 }; const c = mk(true, idb, () => t.v);
  await c.jsErrPersist(REC('a')); t.v += 1000; await c.jsErrPersist(REC('b'));
  const all = j(await c.jsErrReadAll()); assert.deepEqual(all.map(x => x.key), ['a', 'b']);
  const ev = j(c.jsErrToLogEvents(all)); assert.deepEqual(Object.keys(ev[0]).sort(), ['count', 'ev', 'message', 'source', 'stackTop', 'tab', 'ts']); assert.equal(ev[0].ev, 'js-error');
  assert.ok(c.jsErrEntryLine(all[1]).includes('Помилка b'));
  assert.equal(await c.jsErrClear(), true); assert.equal(rows(idb).length, 0);
  const bad = mk(true, fakeIdb({ fail: true }));
  assert.equal(await bad.jsErrPersist(REC('z')), false); assert.deepEqual(j(await bad.jsErrReadAll()), []); assert.equal(await bad.jsErrClear(), false);
});
test('джерело: основний облік помилок не змінено (лише додатковий виклик у try); перемикач розробника синхронізує прапорець; журнал у «Надіслати лог сповіщень»; кнопки лише в режимі розробника', () => {
  const rec = SRC.slice(SRC.indexOf('function recordJsError'), SRC.indexOf('function updateJsErrorsRow'));
  assert.ok(rec.includes('try{ jsErrPersist(rec); }catch(e){}'));
  assert.ok(rec.includes('rec.count++') && rec.includes("type: 'js-error'") && rec.includes('JS_ERROR_BUFFER_MAX'), 'облік, лічильник і рекордер як раніше');
  assert.ok(SRC.includes('jsErrPersistOn = !on;'));
  assert.ok(SRC.includes('workerEvents.concat(jsErrToLogEvents(await jsErrReadAll()))'));
  const render = SRC.slice(SRC.indexOf('async function renderPushDiag'), SRC.indexOf('async function togglePushDiag'));
  assert.ok(render.indexOf('if(!on) return;') < render.indexOf("'push-diag-errors-clear-btn'"), '«Очистити журнал помилок» лише при увімкненому режимі');
  assert.equal(render.indexOf('push-diag-errors-btn'), -1, 'Rev 2.32.189: окрему кнопку прибрано, журнал відкриває рядок «Журнал помилок JS» (showJsErrorsLog)');
  assert.ok(!/\.from\(|\.insert\(|\.rpc\(/.test(SRC.slice(SRC.indexOf('const JSERR_DB_NAME'), SRC.indexOf('function jsErrorBacklogLines'))), 'журнал без мережі');
});

test('Rev 2.32.131: «Показати журнал помилок JS» завжди щось показує: підказка / «Помилок немає» / список (до 30, новіші вгорі)', function(){
  const { buildSandbox } = require('./extract');
  const c = buildSandbox({}, ['jsErrLogView']);
  const j = v => JSON.parse(JSON.stringify(v));
  assert.equal(c.jsErrLogView(false, []).message, 'Увімкніть розширену діагностику, щоб вести журнал помилок JS');
  assert.equal(c.jsErrLogView(false, [{ ts: 1 }]).message.length > 0, true); // вимкнено — підказка навіть коли записи лишились
  assert.deepEqual(j(c.jsErrLogView(true, [])), { message: 'Помилок немає', rows: [] });
  assert.deepEqual(j(c.jsErrLogView(true, null)), { message: 'Помилок немає', rows: [] });
  const rows = []; for(let i = 1; i <= 40; i++) rows.push({ ts: i });
  const v = j(c.jsErrLogView(true, rows));
  assert.equal(v.message, ''); assert.equal(v.rows.length, 30); assert.equal(v.rows[0].ts, 40); assert.equal(v.rows[29].ts, 11);
});
