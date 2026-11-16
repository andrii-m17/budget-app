// Rev 2.32.9 (B) — підйом над клавіатурою лише на пристроях з екранною клавіатурою.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ex = require('./extract');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const ctx = ex.buildSandbox({}, ['usesOnScreenKeyboard']);
const U = env => JSON.parse(ex.evalInSandbox(ctx, `JSON.stringify(usesOnScreenKeyboard(${JSON.stringify(env)}))`));
test('usesOnScreenKeyboard: iPhone/Android → always; десктоп з мишею → never; iPad із трекпадом і сенсорний ноутбук → resize', () => {
  assert.equal(U({ maxTouchPoints: 5, pointerCoarse: true, anyPointerFine: false, hoverHover: false }).mode, 'always', 'iPhone');
  assert.equal(U({ maxTouchPoints: 10, pointerCoarse: true, anyPointerFine: false, hoverHover: false }).mode, 'always', 'Android');
  assert.equal(U({ maxTouchPoints: 0, pointerCoarse: false, anyPointerFine: true, hoverHover: true }).mode, 'never', 'десктоп');
  assert.equal(U({ maxTouchPoints: 5, pointerCoarse: true, anyPointerFine: true, hoverHover: true }).mode, 'resize', 'iPad з апаратною клавіатурою/трекпадом');
  assert.equal(U({ maxTouchPoints: 10, pointerCoarse: false, anyPointerFine: true, hoverHover: true }).mode, 'resize', 'сенсорний ноутбук');
  assert.equal(U({}).mode, 'never');
  assert.equal(U(null).mode, 'never');
});
test('підключення: focusin/focusout/touchstart/touchend шторок і перехоплення тапів працюють лише в режимі always; гібрид — за стисненням visualViewport', () => {
  assert.match(SRC, /if\(kbMode\(\)\.mode !== 'always'\) return; \/\/ Rev 2\.32\.9 \(B\)/);
  assert.match(SRC, /km === 'never' \|\| \(km === 'resize' && !kbSheetActive\)/);
  assert.match(SRC, /if\(!IS_IOS_RUNTIME \|\| kbMode\(\)\.mode !== 'always'\) return;/);
  assert.match(SRC, /if\(!IS_IOS_RUNTIME \|\| !kbTapStart \|\| kbMode\(\)\.mode !== 'always'\) return;/);
  assert.match(SRC, /kbMode\(\)\.mode !== 'resize' \|\| kbSheetActive/);
  assert.match(SRC, /isKeyboardOpen\(getBaseViewportHeight\(\), window\.visualViewport\.height\)\) handleKeyboardFieldFocusIn\(a\)/);
});
test('мобільний шлях не змінено: enterKbSheet/handleKeyboardFieldFocusIn/beginKbFocusProxy без гілок за kbMode всередині', () => {
  const i = SRC.indexOf('function enterKbSheet'), j = SRC.indexOf('function exitKbSheet');
  assert.ok(!/kbMode\(/.test(SRC.slice(i, j)));
  const k = SRC.indexOf('function beginKbFocusProxy'), l = SRC.indexOf('function startKbFramesSampler');
  assert.ok(!/kbMode\(/.test(SRC.slice(k, l)));
});
test('рекордер: kb-env при старті запису й при зміні режиму', () => {
  assert.match(SRC, /recordKbEnv\(\); \/\/ Rev 2\.32\.9 \(B\)/);
  assert.match(SRC, /type: 'kb-env', usesKeyboard: m\.mode !== 'never', pointer: /);
  ['usesKeyboard', 'pointer', 'hover', 'maxTouchPoints'].forEach(f => assert.match(SRC, new RegExp("DEBUG_EVENT_ALLOWLIST = \\[[\\s\\S]*'" + f + "'")));
  assert.match(SRC, /addEventListener\('change', function\(\)\{ if\(kbMode\(\)\.mode !== kbLastEnvMode\) recordKbEnv\(\); \}\)/);
});
