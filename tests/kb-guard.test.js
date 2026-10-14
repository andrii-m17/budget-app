// Rev 2.32.52 (G) — безпечні виклики клавіатурного модуля: без винятків, коли kbMode/focusCardField недоступні (вони всередині initApp-IIFE).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildSandbox } = require('./extract');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
function env(ios, extra){
  const log = { focus: 0, select: 0, events: [] };
  const input = { focus: function(){ log.focus++; }, select: function(){ log.select++; } };
  const g = Object.assign({ kbGuardSkipped: 0, IS_IOS_RUNTIME: ios, debugRecordingActive: true, debugRecordingStartedAt: 0, performance: { now: function(){ return 7; } }, pushDebugEvent: function(e){ log.events.push(e); } }, extra || {});
  const c = buildSandbox(g, ['kbGuardNote', 'kbSheetUsesProxy', 'focusCardFieldSafe']);
  return { c: c, input: input, log: log };
}
test('десктоп без модуля: шторка отримує звичайний focus()+select(), без винятків; подія kb-guard з лічильником', function(){
  const e = env(false);
  assert.doesNotThrow(function(){ e.c.focusCardFieldSafe(e.input); });
  assert.equal(e.log.focus, 1); assert.equal(e.log.select, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(e.log.events)), [{ t: 7, type: 'kb-guard', skipped: 1 }]);
  assert.equal(e.c.kbSheetUsesProxy(true), false); // десктоп: focusFirstIn як раніше
});
test('iOS без модуля: фокус не ставиться (як було), без винятку; автофокус картки «Структури» пропускається як і раніше', function(){
  const e = env(true);
  assert.doesNotThrow(function(){ e.c.focusCardFieldSafe(e.input); });
  assert.equal(e.log.focus, 0);
  assert.equal(e.c.kbSheetUsesProxy(true), true); assert.equal(e.c.kbSheetUsesProxy(false), false);
});
test('модуль доступний: виклики виконуються як раніше (iOS always → проміжне поле; інакше звичайний шлях)', function(){
  let called = 0;
  const e = env(true, { focusCardField: function(){ called++; }, kbMode: function(){ return { mode: 'always' }; } });
  e.c.focusCardFieldSafe(e.input); assert.equal(called, 1); assert.equal(e.c.kbSheetUsesProxy(true), true);
  const e2 = env(true, { kbMode: function(){ return { mode: 'resize' }; } }); assert.equal(e2.c.kbSheetUsesProxy(true), false);
  assert.equal(e.log.events.length, 0, 'без пропусків подій немає');
});
test('охоронні: у глобальному коді немає безумовних викликів focusCardField/kbMode поза IIFE-обгортками', function(){
  const head = SRC.slice(0, SRC.indexOf('(async function initApp(){'));
  const calls = head.replace(/\/\/[^\n]*/g, '').match(/\b(focusCardField|kbMode)\(/g) || [];
  const wrapped = head.replace(/\/\/[^\n]*/g, '').match(/typeof (focusCardField|kbMode) === 'function'|typeof (focusCardField|kbMode) !== 'function'/g) || [];
  assert.ok(wrapped.length >= 2);
  // дозволені лише виклики всередині гілок після typeof-перевірки: ці два місця
  assert.equal(calls.length, 2, 'по одному виклику focusCardField( і kbMode( — обидва за typeof-перевіркою в обгортках');
});
