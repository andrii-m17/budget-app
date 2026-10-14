// Rev 2.32.53 (J) — помилки JavaScript у рекордері.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildSandbox } = require('./extract');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const j = function(v){ return JSON.parse(JSON.stringify(v)); };
function env(extra){
  const g = Object.assign({ jsErrorList: [], jsErrorEvents: {}, JS_ERROR_BUFFER_MAX: 20, lastActiveTab: 'structure', debugRecordingActive: false, debugRecordingStartedAt: 0, performance: { now: function(){ return 50; } }, debugEventBuffer: [], updateJsErrorsRow: function(){}, pushDebugEvent: function(e){ g.debugEventBuffer.push(e); } }, extra || {});
  const c = buildSandbox(g, ['scrubJsErrorText', 'jsErrorSource', 'jsErrorStackTop', 'jsErrorKey', 'recordJsError', 'jsErrorBacklogLines']);
  return { c: c, g: g };
}
test('scrubJsErrorText: обрізає до 160, прибирає email і довгі числа', function(){
  const c = env().c;
  assert.equal(c.scrubJsErrorText('a'.repeat(300)).length, 160);
  assert.equal(c.scrubJsErrorText('помилка для olya@example.com тел 380501234567'), 'помилка для <email> тел <num>');
  assert.equal(c.scrubJsErrorText('kbMode is not defined'), 'kbMode is not defined');
});
test('jsErrorSource: файл і рядок без параметрів запиту й хешу', function(){
  const c = env().c;
  assert.equal(c.jsErrorSource('https://x.github.io/budget-app/index.html?token=abc#h', 22435), 'index.html:22435');
  assert.equal(c.jsErrorSource('', 5), ''); assert.equal(c.jsErrorSource('sw.js', 0), 'sw.js');
});
test('jsErrorStackTop: імена перших 3 кадрів (V8 і Safari), без шляхів', function(){
  const c = env().c;
  assert.deepEqual(j(c.jsErrorStackTop('ReferenceError: x\n    at focusCardFieldSafe (https://a/index.html:1:2)\n    at HTMLElement.<anonymous> (https://a/index.html:3:4)\n    at b (https://a/i.js:1:1)\n    at c (https://a/i.js:1:1)')), ['focusCardFieldSafe', 'HTMLElement.<anonymous>', 'b']);
  assert.deepEqual(j(c.jsErrorStackTop('openAppModal@https://a/index.html:5:6\nglobal code@https://a/index.html:9:9')), ['openAppModal'] /* «global code» без імені функції пропускається */);
  assert.deepEqual(j(c.jsErrorStackTop('')), []);
});
test('recordJsError: пише подію js-error під час запису; дублікат лише збільшує count (та сама подія); значень користувача немає', function(){
  const e = env({ debugRecordingActive: true });
  const info = { message: 'kbMode is not defined', filename: 'https://a/index.html?x=1', lineno: 21349, stack: 'ReferenceError\n at openAppModal (https://a/index.html:1:1)' };
  e.c.recordJsError(info); e.c.recordJsError(info); e.c.recordJsError(info);
  assert.equal(e.g.debugEventBuffer.length, 1);
  assert.deepEqual(j(e.g.debugEventBuffer[0]), { t: 50, type: 'js-error', message: 'kbMode is not defined', source: 'index.html:21349', stackTop: ['openAppModal'], tab: 'structure', count: 3 });
  assert.equal(e.g.jsErrorList.length, 1);
  assert.deepEqual(j(e.c.jsErrorBacklogLines(e.g.jsErrorList)), ['kbMode is not defined @ index.html:21349 ×3']);
});
test('recordJsError: поза записом — лише буфер; буфер ≤ 20 унікальних (найстаріші витісняються)', function(){
  const e = env();
  for(let i = 0; i < 25; i++) e.c.recordJsError({ message: 'err ' + i, filename: 'a.js', lineno: 1 });
  assert.equal(e.g.debugEventBuffer.length, 0);
  assert.equal(e.g.jsErrorList.length, 20); assert.equal(e.g.jsErrorList[0].message, 'err 5'); assert.equal(e.g.jsErrorList[19].message, 'err 24');
});
test('recordJsError не кидає винятків навіть без службових змінних (TDZ у ранніх помилках)', function(){
  const c = buildSandbox({ jsErrorList: [], jsErrorEvents: {}, JS_ERROR_BUFFER_MAX: 20 }, ['scrubJsErrorText', 'jsErrorSource', 'jsErrorStackTop', 'jsErrorKey', 'recordJsError']);
  assert.doesNotThrow(function(){ c.recordJsError({ message: 'x', filename: 'a.js', lineno: 1 }); c.recordJsError(null); });
});
test('охоронні: слухачі error/unhandledrejection на початку скрипта; backlog при старті; ключі в allowlist; рядок у «Тестуванні»', function(){
  assert.ok(SRC.indexOf("window.addEventListener('error'") < SRC.indexOf('/* ============ Довідники'), 'слухач встановлено до решти коду');
  assert.match(SRC, /window\.addEventListener\('unhandledrejection'/);
  assert.match(SRC, /if\(e && e\.target && e\.target !== window\) return;/);
  assert.match(SRC, /type: 'js-error-backlog', count: jsErrorList\.length, errors: jsErrorBacklogLines\(jsErrorList\)/);
  assert.match(SRC, /'message', 'source', 'stackTop', 'tab', 'errors'/);
  assert.match(SRC, /id="js-errors-btn"[^>]*onclick="showJsErrors\(\)">Помилок за сеанс: 0</);
  assert.match(SRC, /jsErrorList\.slice\(-5\)\.reverse\(\)/);
});
