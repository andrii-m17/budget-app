// KB-30 (Rev 2.32.285): розрахунок C для ретрансляторів: C = (innerHeight − kbH0)/2 + поправка; kbH0 — найменша висота клавіатури ≥ 350 у сесії й орієнтації (без підказок/Face ID), запасно 0,434·innerHeight.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildSandbox, evalInSandbox } = require('./extract');
const HTML = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
function sb(over){ return buildSandbox(Object.assign({ window: { innerWidth: 440, innerHeight: 894 }, kbRelayKbMin: {}, kbRelayCorr: {} }, over || {}), ['viewportOrientationKey', 'kbRelayC']); }
test('C: запасне значення без виміряної висоти — (894 − 0,434·894)/2 ≈ 253', () => {
  const c = sb(); const v = evalInSandbox(c, 'kbRelayC()');
  assert.ok(Math.abs(v - 253) < 1, String(v));
});
test('C: найменша висота клавіатури ≥ 350 (389 → C = 252,5), а не 311 з Face ID (хибне 291,5 у KB-27)', () => {
  const c = sb({ kbRelayKbMin: { portrait: 389 } }); const key = evalInSandbox(c, "viewportOrientationKey(440, 894)");
  c.kbRelayKbMin = {}; c.kbRelayKbMin[key] = 389;
  assert.equal(evalInSandbox(c, 'kbRelayC()'), 252.5);
  assert.match(HTML, /if\(v >= 350\)\{ const k = viewportOrientationKey\(window\.innerWidth, window\.innerHeight\); if\(!kbRelayKbMin\[k\]/);
});
test('C: поправка r зменшує C для орієнтації', () => {
  const c = sb(); const key = evalInSandbox(c, "viewportOrientationKey(440, 894)");
  c.kbRelayKbMin = {}; c.kbRelayKbMin[key] = 389; c.kbRelayCorr = {}; c.kbRelayCorr[key] = -10;
  assert.equal(evalInSandbox(c, 'kbRelayC()'), 242.5);
});
test('охорона: ретранслятори прибираються при закритті форми (не клавіатури) й зміні орієнтації; focusin ретранслятора веде в hop; тип relay-hop у білому списку', () => {
  assert.match(HTML, /else if\(kbRelayHost === el\)\{ kbRelaysRemove\(\); kbRelayHost = null; \}/); // закриття форми
  assert.doesNotMatch(HTML.slice(HTML.indexOf('function exitKbSheet'), HTML.indexOf('function exitKbSheet') + 3000), /kbRelaysRemove\(\)/); // закриття клавіатури ретрансляторів не прибирає
  assert.match(HTML, /window\.addEventListener\('orientationchange', kbRelaysRemove\)/);
  assert.match(HTML, /if\(target && target\.__kbRelay\)\{ kbRelayHop\(target\); return; \}/);
  const i = HTML.indexOf('const REC_ALLOWED_TYPES = ['); assert.ok(HTML.slice(i, HTML.indexOf('];', i)).includes("'relay-hop'"));
});
test('KB-31: події relay-state і arrow-direct пишуться й у білому списку; ретранслятор без aria-hidden з opacity 0.01', () => {
  assert.match(HTML, /captureDebugGeometry\('relay-state', \{ relayCount: kbRelays\.length/);
  assert.match(HTML, /if\(!kbRelayHopping\) captureDebugGeometry\('arrow-direct'/);
  const i = HTML.indexOf('const REC_ALLOWED_TYPES = ['); const list = HTML.slice(i, HTML.indexOf('];', i));
  assert.ok(list.includes("'relay-state'") && list.includes("'arrow-direct'"));
  const a = HTML.indexOf('function kbRelaysEnsure'), blk = HTML.slice(a, HTML.indexOf('function kbRelaysUpdate'));
  assert.match(blk, /r\.style\.opacity = '0\.01'/);
  assert.doesNotMatch(blk, /setAttribute\('aria-hidden'/);
});
