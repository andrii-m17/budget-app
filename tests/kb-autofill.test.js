// KB-35 (Rev 2.32.289): автозаповнення iOS (серія focusin без дотику + input insertReplacementText) не arrow-direct; ранній підйом з дотику; одна компенсація на зсув.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildSandbox, evalInSandbox } = require('./extract');
const HTML = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
function sb(){
  const events = [], timers = []; let t = 1000;
  const c = buildSandbox({ performance: { now: () => t }, kbAutofillEvidenceAt: -1e9, kbAutofillGroup: null,
    setTimeout: (f, ms) => { timers.push({ f, ms, id: timers.length + 1 }); return timers.length; }, clearTimeout: id => { const x = timers.find(y => y.id === id); if(x) x.dead = true; },
    captureDebugGeometry: (type, extra) => events.push(Object.assign({ type }, extra)) }, ['kbAutofillEvidence', 'kbArrowCandidate']);
  const run = () => { timers.filter(x => !x.dead && !x.done).forEach(x => { x.done = true; x.f(); }); };
  return { c, events, timers, setT: v => { t = v; }, run };
}
test('без ознак автозаповнення — arrow-direct через 400 мс', () => {
  const { c, events, run } = sb(); c.__a = 'cldfielda1'; c.__b = 'cloud-password'; evalInSandbox(c, 'kbArrowCandidate(__a, __b)'); run();
  assert.deepEqual(events.map(e => e.type), ['arrow-direct']);
});
test('із input insertReplacementText (або без inputType) — autofill (одна подія на серію, кількість полів), без arrow-direct', () => {
  const { c, events, setT, run } = sb();
  c.__ev = { inputType: 'insertReplacementText', target: {} }; evalInSandbox(c, 'kbAutofillEvidence(__ev)');
  c.__a = 'cloud-password'; c.__b = 'cldfielda1'; evalInSandbox(c, 'kbArrowCandidate(__a, __b)');
  setT(1080); c.__a = 'cldfielda1'; c.__b = 'cloud-password'; evalInSandbox(c, 'kbArrowCandidate(__a, __b)');
  run(); run();
  const t = events.map(e => e.type); assert.equal(t.includes('arrow-direct'), false); assert.equal(t.filter(x => x === 'autofill').length, 1);
  assert.equal(events.find(e => e.type === 'autofill').fields, 2);
  const typed = sb(); typed.c.__ev = { inputType: 'insertText', target: {} }; evalInSandbox(typed.c, 'kbAutofillEvidence(__ev)');
  typed.c.__a = 'x'; typed.c.__b = 'y'; evalInSandbox(typed.c, 'kbArrowCandidate(__a, __b)'); typed.run();
  assert.deepEqual(typed.events.map(e => e.type), ['arrow-direct'], 'звичайний набір тексту — не автозаповнення');
});
test('охорона: тип autofill у білому списку; ранній підйом лише за прямим дотиком, оцінка висоти — стартова ціль; одна компенсація pan (kbPanPending)', () => {
  const i = HTML.indexOf('const REC_ALLOWED_TYPES = ['); assert.ok(HTML.slice(i, HTML.indexOf('];', i)).includes("'autofill'"));
  assert.match(HTML, /kbPipeEarlyStart\(drawerEl, fieldEl, vvEstimate, naturalHeight\);/);
  assert.match(HTML, /if\(!IS_IOS_RUNTIME \|\| kbProxyActive \|\| Date\.now\(\) - kbLastInterceptAt > 400\) return;/);
  assert.match(HTML, /if\(!kbPanPending\)\{ kbPanPending = true; requestAnimationFrame/);
});
