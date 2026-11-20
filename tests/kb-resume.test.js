// KB-RESUME / KB-RESUME-2 (Rev 2.32.434): вибір гілки за варіантом і document.hasFocus(); страховки 400/300 мс; реєстр; білі списки самописця; control при hasFocus true не відрізняється від поточної поведінки.
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
const c = ex.buildSandbox({ localStorage: ls }, ['TEST_VARIANTS_LS_KEY', 'TEST_VARIANTS', 'readTestVariantsMap', 'writeTestVariantsMap', 'findTestVariant', 'getVariant', 'setVariant', 'resetVariant', 'KB_RESUME_PROXY_MS', 'KB_RESUME_RO_MS', 'kbResumeVariant', 'kbResumeDecide']);
const j = v => JSON.parse(JSON.stringify(v));

test('kbResumeDecide: hasFocus true або не true — none; control — none; false: proxy-tap / ro-tap; невідомий варіант — none', function(){
  ['control', 'proxy-tap', 'ro-tap', 'щось', 'win-focus', 'native'].forEach(function(v){ assert.equal(c.kbResumeDecide(v, true), 'none', v + ' + hasFocus true'); assert.equal(c.kbResumeDecide(v, undefined), 'none'); });
  assert.equal(c.kbResumeDecide('control', false), 'none');
  assert.equal(c.kbResumeDecide('щось', false), 'none');
  assert.equal(c.kbResumeDecide('win-focus', false), 'none', 'win-focus прибрано');
  assert.equal(c.kbResumeDecide('native', false), 'none', 'native прибрано');
  assert.equal(c.kbResumeDecide('proxy-tap', false), 'proxy-tap');
  assert.equal(c.kbResumeDecide('ro-tap', false), 'ro-tap');
});
test('страховки: proxy-tap 400 мс, ro-tap 300 мс', function(){
  assert.equal(ex.evalInSandbox(c, 'KB_RESUME_PROXY_MS'), 400); assert.equal(ex.evalInSandbox(c, 'KB_RESUME_RO_MS'), 300);
  assert.match(SRC, /timer = setTimeout\(function\(\)\{[\s\S]{0,200}proxy-miss[\s\S]{0,200}\}, KB_RESUME_PROXY_MS\);/);
  assert.match(SRC, /timer = setTimeout\(function\(\)\{ go\('ro-timeout'\); \}, KB_RESUME_RO_MS\);/);
});
test('варіант: типово control; перемикання зберігається; невідоме (зокрема прибрані win-focus/native) → control; у реєстрі control, proxy-tap, ro-tap', function(){
  assert.equal(c.kbResumeVariant(), 'control');
  assert.equal(c.setVariant('kb-resume', 'proxy-tap'), true); assert.equal(c.kbResumeVariant(), 'proxy-tap');
  assert.equal(c.setVariant('kb-resume', 'win-focus'), false); assert.equal(c.setVariant('kb-resume', 'native'), false); assert.equal(c.kbResumeVariant(), 'proxy-tap');
  store['budget_variants_v1'] = JSON.stringify({ 'kb-resume': 'native' }); assert.equal(c.kbResumeVariant(), 'control', 'збережений вибір прибраного варіанта → control');
  delete store['budget_variants_v1'];
  const t = j(c.findTestVariant('kb-resume'));
  assert.deepEqual(t.variants.map(v => v.key), ['control', 'proxy-tap', 'ro-tap']); assert.equal(t.defaultVariant, 'control');
  assert.equal(t.title, 'Клавіатура після повернення в застосунок (експеримент)');
});
test('самописець: тип kb-resume і ключі variant, branch, hasFocusStart, hasFocusEnd, intercept, transferMs, kbShownMs, panMax, jumpMax у білих списках; подія — лише числа, булеві й назви', function(){
  const D = read('js/diag.js');
  assert.match(D, /const REC_ALLOWED_TYPES = \[[^\]]*'kb-resume'[^\]]*\]/);
  const keys = D.slice(D.indexOf('const REC_ALLOWED_KEYS = ['), D.indexOf('];', D.indexOf('const REC_ALLOWED_KEYS = [')));
  ['variant', 'branch', 'hasFocusStart', 'hasFocusEnd', 'kbShownMs', 'panMax', 'intercept', 'transferMs', 'jumpMax'].forEach(function(k){ assert.match(keys, new RegExp("'" + k + "'"), k); });
  assert.match(SRC, /pushDebugEvent\(\{ type: 'kb-resume', variant: rec\.variant, branch: rec\.branch, hasFocusStart: rec\.hasFocusStart, hasFocusEnd: rec\.hasFocusEnd, intercept: rec\.intercept, transferMs: rec\.transferMs, kbShownMs: rec\.kbShownMs, panMax: rec\.panMax, jumpMax: rec\.jumpMax \}\)/);
  ['proxy-focus', 'proxy-miss', 'ro-click', 'ro-focus', 'ro-timeout'].forEach(function(b){ assert.ok(SRC.indexOf("'" + b + "'") !== -1, b); });
});
test('обробники: гілки лише в блоці «клавіатура закрита» touchstart і в kbTapEnd; оригінальний вираз intercept без змін; touchstart/touchend гілок без preventDefault; нативний фокус замінника без proxy.focus()', function(){
  assert.match(SRC, /const resumeMode = resumeTap \? kbResumeDecide\(kbResumeVariant\(\), document\.hasFocus\(\)\) : 'none';/);
  assert.match(SRC, /if\(resumeTap && resumeMode === 'none' && shouldInterceptFirstFocus\(\{ field: field, kbSheetOpen: false, moved: false, durationMs: 0 \}\)\)\{/);
  assert.match(SRC, /const intercept = \(start\.first && !!target\) \? true : shouldInterceptFirstFocus\(\{/);
  assert.match(SRC, /if\(start\.resumeMode\)\{ kbResumeTapEnd\(start, target \|\| start\.resumeField, drawerEl \|\| kbSheetHostOf\(start\.resumeField\), moved\); return; \}/);
  assert.match(SRC, /if\(!nativeProxy\) proxy\.focus\(\{ preventScroll: true \}\);/);
  assert.match(SRC, /if\(en\.resumeMode\) kbResumeCleanup\(en\);/);
  const a = SRC.indexOf('function kbResumeProxyPrepare'), b = SRC.indexOf('function kbResumeTapEnd');
  assert.doesNotMatch(SRC.slice(a, b), /preventDefault/, 'у гілках нативний дотик: preventDefault не викликається');
});
