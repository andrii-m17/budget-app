// Rev 2.32.11 — «дригання» першого закриття карток «Структури»: шар заздалегідь, фіксація положення, прямий шлях через проміжне поле, діагностика.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ex = require('./extract');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const c = ex.buildSandbox({}, ['CARD_LAYER_RELEASE_MS', 'shouldPromoteLayer', 'settledPosition']);
test('shouldPromoteLayer: картка — при відкритті й закритті, ~400 мс після закриття; потім ні; шторки — ніколи', () => {
  assert.equal(c.shouldPromoteLayer({ isCard: true, phase: 'open' }), true);
  assert.equal(c.shouldPromoteLayer({ isCard: true, phase: 'closing' }), true);
  assert.equal(c.shouldPromoteLayer({ isCard: true, phase: 'closed', sinceCloseMs: 399 }), true);
  assert.equal(c.shouldPromoteLayer({ isCard: true, phase: 'closed', sinceCloseMs: 400 }), false);
  assert.equal(c.shouldPromoteLayer({ isCard: true, phase: 'closed' }), false);
  assert.equal(c.shouldPromoteLayer({ isCard: true, phase: 'idle' }), false);
  assert.equal(c.shouldPromoteLayer({ isCard: false, phase: 'open' }), false);
  assert.equal(c.shouldPromoteLayer(null), false);
});
test('settledPosition: після закриття — спокійне положення незалежно від підйому/кадру; на піднятій — rest мінус підйом', () => {
  assert.equal(c.settledPosition('close', 628, 155), 628);
  assert.equal(c.settledPosition('close', 628, 0), 628);
  assert.equal(c.settledPosition('open', 628, 155), 473);
  assert.equal(c.settledPosition('open', undefined, undefined), 0);
});
test('will-change: ставиться при відкритті картки (enterKbSheet), sampler його не скидає для карток, знімається ~400 мс після закриття; для шторок поведінка стара', () => {
  const enter = SRC.slice(SRC.indexOf('function enterKbSheet'), SRC.indexOf('function exitKbSheet'));
  assert.match(enter, /shouldPromoteLayer\(\{ isCard: drawerEl\.classList && drawerEl\.classList\.contains\('app-modal'\), phase: 'open' \}\)/);
  assert.match(enter, /drawerEl\.style\.willChange = 'transform'/);
  const exit = SRC.slice(SRC.indexOf('function exitKbSheet'), SRC.indexOf('function handleKeyboardFieldFocusIn'));
  assert.match(exit, /setTimeout\(function\(\)\{\s*cardLayerReleaseTimer = null;\s*if\(!kbSheetActive && drawerEl\.style\) drawerEl\.style\.willChange = '';\s*\}, CARD_LAYER_RELEASE_MS\)/);
  assert.match(SRC, /if\(!isCard\) drawerEl\.style\.willChange = 'auto';/);
});
test('кінцевий стан: kb-sheet знімається лише після transitionend або запасного таймера (320 мс); --sheet-lift:0 — ціль переходу; явний вимір положення через 350 мс', () => {
  const exit = SRC.slice(SRC.indexOf('function exitKbSheet'), SRC.indexOf('function handleKeyboardFieldFocusIn'));
  assert.match(exit, /e\.propertyName !== 'transform'/);
  assert.match(exit, /\}, 320\);/);
  assert.match(exit, /--sheet-lift', '0'/);
  assert.match(SRC, /\}, 350\);/);
});
test('діагностика sheet-anim: firstOfKind, settledY, settleDeltaPx у allowlist і в події карток; для шторок подія синхронна як раніше', () => {
  ['firstOfKind', 'settledY', 'settleDeltaPx'].forEach(f => assert.match(SRC, new RegExp("DEBUG_EVENT_ALLOWLIST = \\[[\\s\\S]*'" + f + "'")));
  assert.match(SRC, /firstOfKind: firstOfKind,/);
  assert.match(SRC, /emit\(\{ settledY: y, settleDeltaPx: lastY === null \? null : Math\.abs\(y - lastY\) \}\)/);
  assert.match(SRC, /\}else\{\s*emit\(\);\s*\}/);
});
test('прямий шлях відкриття картки: на iOS з екранною клавіатурою — проміжне поле (focusCardField → beginKbFocusProxy), автофокус openAppModal пропускається; решта платформ як було', () => {
  assert.match(SRC, /function focusCardField\(input\)\{[\s\S]*?beginKbFocusProxy\(input, modal, select\);/);
  assert.equal((SRC.match(/setTimeout\(\(\)=>\{ focusCardField\(input\); \}, 60\);/g) || []).length, 4);
  assert.match(SRC, /if\(!\(IS_IOS_RUNTIME && kbMode\(\)\.mode === 'always' && document\.getElementById\('app-modal'\)\.hasAttribute\('data-sheet-id'\)\)\) focusFirstIn/);
  assert.match(SRC, /function beginKbFocusProxy\(target, drawerEl, onTransferred\)/);
  assert.match(SRC, /if\(typeof onTransferred === 'function'\) onTransferred\(\);/);
});
test('вимір спокійного положення: для .app-modal без впливу scale(.96), для шторок — getBoundingClientRect як було', () => {
  const c2 = ex.buildSandbox({}, ['kbRestBottomOf']);
  const drawer = { classList: { contains: () => false }, offsetHeight: 200, getBoundingClientRect: () => ({ top: 100, bottom: 300, height: 200 }) };
  assert.deepEqual(JSON.parse(JSON.stringify(c2.kbRestBottomOf(drawer))), { bottom: 300, height: 200 });
  const modal = { classList: { contains: k => k === 'app-modal' }, offsetHeight: 200, getBoundingClientRect: () => ({ top: 106, bottom: 294, height: 188 }) };
  assert.deepEqual(JSON.parse(JSON.stringify(c2.kbRestBottomOf(modal))), { bottom: 300, height: 200 });
});
