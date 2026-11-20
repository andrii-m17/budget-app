// KB-RESUME (Rev 2.32.433): вибір гілки за варіантом і document.hasFocus(); реєстр; білі списки самописця; control при hasFocus true не відрізняється від поточної поведінки.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ex = require('./extract');
const SRC = ex.readIndexWithCss();
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const store = {};
const ls = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } };
const c = ex.buildSandbox({ localStorage: ls }, ['TEST_VARIANTS_LS_KEY', 'TEST_VARIANTS', 'readTestVariantsMap', 'writeTestVariantsMap', 'findTestVariant', 'getVariant', 'setVariant', 'resetVariant', 'kbResumeVariant', 'kbResumeDecide', 'shouldInterceptFirstFocus', 'shouldInterceptTap', 'isTapTargetField', 'isFieldInsideDrawer']);
const j = v => JSON.parse(JSON.stringify(v));

test('kbResumeDecide: hasFocus true або control — без змін; false: win-focus → window.focus(), native → не перехоплювати', function(){
  const none = { focusWindow: false, skipIntercept: false };
  ['control', 'win-focus', 'native', 'щось'].forEach(function(v){ assert.deepEqual(j(c.kbResumeDecide(v, true)), none, v + ' + hasFocus true'); assert.deepEqual(j(c.kbResumeDecide(v, undefined)), none); });
  assert.deepEqual(j(c.kbResumeDecide('control', false)), none);
  assert.deepEqual(j(c.kbResumeDecide('щось', false)), none);
  assert.deepEqual(j(c.kbResumeDecide('win-focus', false)), { focusWindow: true, skipIntercept: false });
  assert.deepEqual(j(c.kbResumeDecide('native', false)), { focusWindow: false, skipIntercept: true });
});
test('варіант: типово control; перемикання зберігається; невідоме значення → control; є в реєстрі з трьома варіантами', function(){
  assert.equal(c.kbResumeVariant(), 'control');
  assert.equal(c.setVariant('kb-resume', 'native'), true); assert.equal(c.kbResumeVariant(), 'native');
  assert.equal(c.setVariant('kb-resume', 'x'), false); assert.equal(c.kbResumeVariant(), 'native');
  c.resetVariant('kb-resume'); assert.equal(c.kbResumeVariant(), 'control');
  const t = j(c.findTestVariant('kb-resume'));
  assert.deepEqual(t.variants.map(v => v.key), ['control', 'win-focus', 'native']); assert.equal(t.defaultVariant, 'control');
  assert.equal(t.title, 'Клавіатура після повернення в застосунок (експеримент)');
});
test('shouldInterceptFirstFocus: noFocus не перехоплює; без noFocus — як раніше (поле у шторці, клавіатура закрита, без руху)', function(){
  const field = { tagName: 'INPUT', type: 'text', getAttribute: () => null, closest: () => ({}) };
  assert.equal(c.shouldInterceptFirstFocus(null), false);
  assert.equal(c.shouldInterceptFirstFocus({ field: field, kbSheetOpen: false, moved: false, durationMs: 0, noFocus: true }), false);
});
test('самописець: тип kb-resume і ключі variant, hasFocusStart, hasFocusEnd, kbShownMs, panMax, intercept у білих списках; подія несе лише числа й булеві', function(){
  const D = read('js/diag.js');
  assert.match(D, /const REC_ALLOWED_TYPES = \[[^\]]*'kb-resume'[^\]]*\]/);
  const keys = D.slice(D.indexOf('const REC_ALLOWED_KEYS = ['), D.indexOf('];', D.indexOf('const REC_ALLOWED_KEYS = [')));
  ['variant', 'hasFocusStart', 'hasFocusEnd', 'kbShownMs', 'panMax', 'intercept'].forEach(function(k){ assert.match(keys, new RegExp("'" + k + "'"), k); });
  assert.match(SRC, /pushDebugEvent\(\{ type: 'kb-resume', variant: rec\.variant, hasFocusStart: rec\.hasFocusStart, hasFocusEnd: rec\.hasFocusEnd, intercept: rec\.intercept, kbShownMs: rec\.kbShownMs, panMax: rec\.panMax \}\)/);
});
test('обробники: гілка kb-resume лише в блоці «клавіатура закрита» touchstart і в kbTapEnd; оригінальний вираз intercept без змін; touchend не перехоплює при noFocus', function(){
  assert.match(SRC, /const resumeDec = resumeTap \? kbResumeDecide\(kbResumeVariant\(\), document\.hasFocus\(\)\) : null;/);
  assert.match(SRC, /if\(resumeTap && !\(resumeDec && resumeDec\.skipIntercept\) && shouldInterceptFirstFocus\(\{ field: field, kbSheetOpen: false, moved: false, durationMs: 0 \}\)\)\{/);
  assert.match(SRC, /const intercept = \(start\.first && !!target\) \? true : shouldInterceptFirstFocus\(\{/);
  assert.match(SRC, /noFocus: !!start\.noFocus,/);
  assert.match(SRC, /if\(start\.rec\) kbResumeEnd\(start\.rec, !!start\.intercept && !start\.noFocus\);/);
});
