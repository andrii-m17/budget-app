// KB-33 (Rev 2.32.288), A: короткі коливання висоти клавіатури не рухають форму.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildSandbox, evalInSandbox } = require('./extract');
function sb(over){
  const timers = [], applied = [];
  const vv = { height: 479 };
  const c = buildSandbox(Object.assign({
    window: { visualViewport: vv }, performance: { now: () => 1000 }, KB_PIPE: { state: 'settled' }, kbLiftActive: false,
    KB_LIVE: { stableH: 479, dbTimer: null, kindUntil: 0 }, KB_LIFT_SETTLE_MS: 120, kbSheetActive: true,
    setTimeout: (f, ms) => { timers.push({ f, ms }); return timers.length; }, clearTimeout: () => {}, applyLiveSheetLift: () => { applied.push(vv.height); },
  }, over || {}), ['kbHDebounce']);
  return { c, vv, timers, applied };
}
test('479 → 506 → 479: перша зміна відкладається на 120 мс, повернення до 479 (±2) — без руху', () => {
  const { c, vv, timers, applied } = sb();
  vv.height = 506; assert.equal(evalInSandbox(c, 'kbHDebounce()'), true); assert.equal(timers.length, 1); assert.equal(timers[0].ms, 120);
  vv.height = 479; assert.equal(evalInSandbox(c, 'kbHDebounce()'), true); // повернулась
  timers[0].f(); assert.deepEqual(applied, [], 'таймер не рухає: висота вже стабільна');
});
test('зміна, що не повернулась: рух після 120 мс', () => {
  const { c, vv, timers, applied } = sb();
  vv.height = 506; evalInSandbox(c, 'kbHDebounce()'); timers[0].f(); assert.deepEqual(applied, [506]);
});
test('не діє: відкриття (не settled), триваючий рух, зміна типу клавіатури', () => {
  for(const over of [{ KB_PIPE: { state: 'animating' } }, { kbLiftActive: true }, { KB_LIVE: { stableH: 479, dbTimer: null, kindUntil: 5000 } }]){
    const { c, vv, timers } = sb(over); vv.height = 506;
    assert.equal(evalInSandbox(c, 'kbHDebounce()'), false); assert.equal(timers.length, 0);
  }
});
