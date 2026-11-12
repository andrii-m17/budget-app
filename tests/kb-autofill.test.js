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
  const c = buildSandbox({ performance: { now: () => t }, kbAutofillEvidenceAt: -1e9, kbAutofillGroup: null, kbValBase: null, kbNoTouchUntil: 0, kbLastKeyAt: 0, kbLastFocusoutAt: 0, document: { activeElement: null }, isKeyboardField: () => true, kbSheetDrawerEl: null,
    setTimeout: (f, ms) => { timers.push({ f, ms, id: timers.length + 1 }); return timers.length; }, clearTimeout: id => { const x = timers.find(y => y.id === id); if(x) x.dead = true; },
    captureDebugGeometry: (type, extra) => events.push(Object.assign({ type }, extra)) }, ['kbAutofillEvidence', 'kbArrowCandidate', 'kbSnapValues', 'kbValuesChanged']);
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
  assert.match(HTML, /kbPipeEarlyStart\(drawerEl, fieldEl, vvEstimate, naturalHeight, \{/);
  assert.match(HTML, /const earlyOk = IS_IOS_RUNTIME && !kbProxyActive && Date\.now\(\) - kbLastInterceptAt <= 400/);
  assert.match(HTML, /if\(!kbPanPending\)\{ kbPanPending = true; requestAnimationFrame/);
});

// KB-36 (Rev 2.32.291), 3: звіт MT-1112-9754: автозаповнення без input з inputType, клавіатура закрилась за ≈95 мс від першого focusin → autofill (by: closed), не arrow-direct; зміна значень двох полів без клавіш → autofill (by: values); без значень у події.
test('KB-36: клавіатура закрилась за 120 мс від focusin без input — autofill by closed, arrow-direct немає', () => {
  const { c, events, run } = sb();
  c.kbLastFocusoutAt = Date.now() + 120; c.document.activeElement = null;
  c.__a = 'cldfielda1'; c.__b = 'cloud-password'; evalInSandbox(c, 'kbArrowCandidate(__a, __b)'); run(); run();
  const t = events.map(e => e.type); assert.equal(t.includes('arrow-direct'), false); assert.equal(events.find(e => e.type === 'autofill').by, 'closed');
});
test('KB-36: значення двох полів змінились без клавіш — autofill by values; одне поле або була клавіша — arrow-direct; значення в події немає', () => {
  const mk = (a, b) => [[{ value: a[0] }, a[1], a[2]], [{ value: b[0] }, b[1], b[2]]];
  const { c, events, run } = sb();
  c.kbValBase = { t: 500, items: mk(['', 0, false], ['', 0, false]) }; c.kbValBase.items[0][0].value = 'secret1'; c.kbValBase.items[1][0].value = 'secret2';
  c.__a = 'cldfielda1'; c.__b = 'cloud-password'; evalInSandbox(c, 'kbArrowCandidate(__a, __b)'); run(); run();
  const af = events.find(e => e.type === 'autofill'); assert.equal(af.by, 'values'); assert.equal(JSON.stringify(events).includes('secret'), false);
  const one = sb(); one.c.kbValBase = { t: 500, items: mk(['', 0, false], ['x', 1, true]) }; one.c.kbValBase.items[0][0].value = 'v';
  one.c.__a = 'a'; one.c.__b = 'b'; evalInSandbox(one.c, 'kbArrowCandidate(__a, __b)'); one.run();
  assert.deepEqual(one.events.map(e => e.type), ['arrow-direct']);
  const keyed = sb(); keyed.c.kbValBase = { t: 500, items: mk(['', 0, false], ['', 0, false]) }; keyed.c.kbValBase.items.forEach(i => { i[0].value = 'v'; }); keyed.c.kbLastKeyAt = 900;
  keyed.c.__a = 'a'; keyed.c.__b = 'b'; evalInSandbox(keyed.c, 'kbArrowCandidate(__a, __b)'); keyed.run();
  assert.deepEqual(keyed.events.map(e => e.type), ['arrow-direct'], 'були натискання клавіш — не автозаповнення');
});
test('KB-36: kb-early у білому списку типів і ключів; по закритій формі kbRealLift/kbHoldOn/KB_EARLY_FACTOR присутні', () => {
  const i = HTML.indexOf('const REC_ALLOWED_TYPES = ['); assert.ok(HTML.slice(i, HTML.indexOf('];', i)).includes("'kb-early'"));
  const k = HTML.indexOf('const REC_ALLOWED_KEYS = ['); const keys = HTML.slice(k, HTML.indexOf('];', k));
  ['by', 'expected', 'src', 'factor', 'target'].forEach(x => assert.ok(keys.includes("'" + x + "'"), x));
  assert.match(HTML, /const wasClosing = !!\(kbClosingEl && kbClosingEl === drawerEl/);
  assert.match(HTML, /const factor = \(info\.src === 'session' && !loginField\) \? 1 : KB_EARLY_FACTOR;/);
});
