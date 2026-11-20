// KB-RESUME / -2 / -4 (Rev 2.32.435): вибір гілки за варіантом і document.hasFocus(); страховки 400/300 мс; реєстр (control, proxy-tap, keep-lift, await-focus; ro-tap прибрано); білі списки самописця; keep-lift: умови входу/виходу; control при hasFocus true не відрізняється від поточної поведінки.
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
const c = ex.buildSandbox({ localStorage: ls }, ['TEST_VARIANTS_LS_KEY', 'TEST_VARIANTS', 'readTestVariantsMap', 'writeTestVariantsMap', 'findTestVariant', 'getVariant', 'setVariant', 'resetVariant', 'KB_RESUME_PROXY_MS', 'KB_RESUME_AWAIT_MS', 'kbResumeVariant', 'kbResumeDecide']);
const j = v => JSON.parse(JSON.stringify(v));

test('kbResumeDecide: hasFocus не false — none; control, keep-lift, await-focus — none; false + proxy-tap — proxy-tap; ro-tap і невідомі — none', function(){
  ['control', 'proxy-tap', 'keep-lift', 'await-focus', 'ro-tap', 'щось'].forEach(function(v){ assert.equal(c.kbResumeDecide(v, true), 'none', v + ' + hasFocus true'); assert.equal(c.kbResumeDecide(v, undefined), 'none'); });
  ['control', 'keep-lift', 'await-focus', 'ro-tap', 'win-focus', 'native', 'щось'].forEach(function(v){ assert.equal(c.kbResumeDecide(v, false), 'none', v); });
  assert.equal(c.kbResumeDecide('proxy-tap', false), 'proxy-tap');
});
test('страховки: proxy-tap 400 мс, await-focus 300 мс', function(){
  assert.equal(ex.evalInSandbox(c, 'KB_RESUME_PROXY_MS'), 400); assert.equal(ex.evalInSandbox(c, 'KB_RESUME_AWAIT_MS'), 300);
  assert.match(SRC, /timer = setTimeout\(function\(\)\{[\s\S]{0,200}proxy-miss[\s\S]{0,200}\}, KB_RESUME_PROXY_MS\);/);
  assert.match(SRC, /timer = setTimeout\(function\(\)\{ go\('timeout'\); \}, KB_RESUME_AWAIT_MS\);/);
});
test('варіант: типово control; перемикання зберігається; прибрані (ro-tap, win-focus, native) → control; у реєстрі control, proxy-tap, keep-lift, await-focus', function(){
  assert.equal(c.kbResumeVariant(), 'control');
  assert.equal(c.setVariant('kb-resume', 'keep-lift'), true); assert.equal(c.kbResumeVariant(), 'keep-lift');
  assert.equal(c.setVariant('kb-resume', 'ro-tap'), false); assert.equal(c.setVariant('kb-resume', 'native'), false); assert.equal(c.kbResumeVariant(), 'keep-lift');
  store['budget_variants_v1'] = JSON.stringify({ 'kb-resume': 'ro-tap' }); assert.equal(c.kbResumeVariant(), 'control', 'збережений вибір прибраного варіанта → control');
  delete store['budget_variants_v1'];
  const t = j(c.findTestVariant('kb-resume'));
  assert.deepEqual(t.variants.map(v => v.key), ['control', 'proxy-tap', 'keep-lift', 'await-focus']); assert.equal(t.defaultVariant, 'control');
  assert.equal(t.title, 'Клавіатура після повернення в застосунок (експеримент)');
});
test('самописець: тип kb-resume і ключі variant, branch, hasFocusStart, hasFocusEnd, intercept, transferMs, kbShownMs, panMax, jumpMax, keptLift, liftTarget, fieldTopAtTouch, released, by у білих списках; подія — лише числа, булеві й назви', function(){
  const D = read('js/diag.js');
  assert.match(D, /const REC_ALLOWED_TYPES = \[[^\]]*'kb-resume'[^\]]*\]/);
  const keys = D.slice(D.indexOf('const REC_ALLOWED_KEYS = ['), D.indexOf('];', D.indexOf('const REC_ALLOWED_KEYS = [')));
  ['variant', 'branch', 'hasFocusStart', 'hasFocusEnd', 'kbShownMs', 'panMax', 'intercept', 'transferMs', 'jumpMax', 'keptLift', 'liftTarget', 'fieldTopAtTouch', 'released', 'by'].forEach(function(k){ assert.match(keys, new RegExp("'" + k + "'"), k); });
  assert.match(SRC, /pushDebugEvent\(\{ type: 'kb-resume', variant: rec\.variant, branch: rec\.branch, hasFocusStart: rec\.hasFocusStart, hasFocusEnd: rec\.hasFocusEnd, intercept: rec\.intercept, transferMs: rec\.transferMs, kbShownMs: rec\.kbShownMs, panMax: rec\.panMax, jumpMax: rec\.jumpMax, keptLift: rec\.keptLift, liftTarget: rec\.liftTarget, released: rec\.released, by: rec\.by, fieldTopAtTouch: rec\.fieldTopAtTouch \}\)/);
  ['proxy-focus', 'proxy-miss', 'await-ok', 'await-miss', 'keep-enter', 'keep-release'].forEach(function(b){ assert.ok(SRC.indexOf("'" + b + "'") !== -1, b); });
  ['tap-field', 'tap-other', 'drag', 'close', 'reset'].forEach(function(r){ assert.ok(SRC.indexOf("kbKeepRelease('" + r + "'") !== -1, r); });
});
test('keep-lift: вхід лише з visibilitychange hidden, варіант keep-lift, .drawer з підйомом і відкритою клавіатурою; охоронці скидання (геометрія, focusout, vv resize, settle) вимкнені, поки kbKeep; ro-tap прибрано з коду', function(){
  assert.match(SRC, /if\(why === 'hidden' && kbResumeVariant\(\) === 'keep-lift' && kbKeepEligible\(\)\)\{ kbKeepEnter\(\); return; \}/);
  assert.match(SRC, /function kbKeepEligible\(\)\{[\s\S]{0,700}classList\.contains\('drawer'\)[\s\S]{0,400}isKeyboardOpen\(getBaseViewportHeight\(\), vv\.height\)[\s\S]{0,120}kbSheetCurrentLift > 1/);
  assert.match(SRC, /function updateKbSheetGeometry\(\)\{\s*if\(!kbSheetActive \|\| !window\.visualViewport\) return;\s*if\(kbKeep\) return;/);
  assert.match(SRC, /function handleKeyboardFieldFocusSettle\(\)\{\s*if\(kbKeep\) return;/);
  assert.match(SRC, /document\.addEventListener\('focusout', function\(e\)\{\s*if\(!isKeyboardField\(e\.target\)\) return;\s*if\(kbKeep\) return;/);
  assert.match(SRC, /function exitKbSheet\(removeKbOpen\)\{\s*if\(!kbSheetActive\) return;\s*if\(kbKeep\) kbKeepRelease\('close', true\);/);
  assert.match(SRC, /function handleKeyboardFieldFocusIn\(target\)\{\s*globalThis\.__kbSt[^\n]*\n\s*if\(kbKeep\) kbKeepRelease\('tap-field', true\);/);
  assert.match(SRC, /html\.kb-keep \.drawer\.open\{ box-shadow:var\(--shadow-lg\), 0 calc\(var\(--sheet-lift, 0\) \* \.25px\) 0 0 var\(--surface\), [^\n]*\* 1px\) 0 0 var\(--surface\); \}/);
  ['kbResumeRoPrepare', 'kbResumeRoArm', 'data-kb-resume-ro', 'KB_RESUME_RO_MS', "'ro-click'", "'ro-focus'", "'ro-timeout'"].forEach(function(w){ assert.equal(SRC.indexOf(w), -1, w + ' прибрано'); });
});
test('обробники: гілки лише в блоці «клавіатура закрита» touchstart і в kbTapEnd; оригінальний вираз intercept без змін; нативні гілки без preventDefault', function(){
  assert.match(SRC, /const resumeMode = resumeTap \? kbResumeDecide\(kbResumeVariant\(\), document\.hasFocus\(\)\) : 'none';/);
  assert.match(SRC, /if\(resumeTap && resumeMode === 'none' && shouldInterceptFirstFocus\(\{ field: field, kbSheetOpen: false, moved: false, durationMs: 0 \}\)\)\{/);
  assert.match(SRC, /const intercept = \(start\.first && !!target\) \? true : shouldInterceptFirstFocus\(\{/);
  assert.match(SRC, /if\(start\.keepNative\) return;/);
  assert.match(SRC, /if\(kbSheetActive && !kbProxyActive && !kbKeep\)\{/);
  assert.match(SRC, /start\.rec\.variant === 'await-focus' && start\.rec\.hasFocusStart === false && !document\.hasFocus\(\)/);
  const a = SRC.indexOf('function kbResumeProxyPrepare'), b = SRC.indexOf('function kbResumeTapEnd');
  assert.doesNotMatch(SRC.slice(a, b), /preventDefault/, 'у нативних гілках preventDefault не викликається');
  const a2 = SRC.indexOf('let kbKeep = null'), b2 = SRC.indexOf("window.addEventListener('orientationchange'");
  assert.doesNotMatch(SRC.slice(a2, b2), /preventDefault|\bsetTimeout\(/, 'keep-lift: без preventDefault і без таймерів');
});
