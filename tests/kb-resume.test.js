// KB-RESUME / -2 / -4 / -5 (Rev 2.32.436): вибір гілки за варіантом і document.hasFocus(); страховки 400/300 мс; класифікація дотику по полю піднятої шторки; реєстр (control, proxy-tap, keep-lift; ro-tap і await-focus прибрано); білі списки самописця; keep-lift: умови входу/виходу; control при hasFocus true не відрізняється від поточної поведінки.
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
const c = ex.buildSandbox({ localStorage: ls }, ['TEST_VARIANTS_LS_KEY', 'TEST_VARIANTS', 'readTestVariantsMap', 'writeTestVariantsMap', 'findTestVariant', 'getVariant', 'setVariant', 'resetVariant', 'pruneVariants', 'KB_KEEP_FOCUS_MS', 'KB_KEEP_DRAG_PX', 'kbKeepTouchKind', 'kbKeepOutcome', 'kbKeepCenterPlan', 'kbKeepUngrown', 'kbKeepEntryBy', 'kbKeepPickKbH', 'kbKeepLiftPlan', 'kbKeepShieldMs']);
const j = v => JSON.parse(JSON.stringify(v));

test('страховки: keep-lift (очікування focusin після touchend) 300 мс, межа тягнення 10 pt', function(){
  assert.equal(ex.evalInSandbox(c, 'KB_KEEP_FOCUS_MS'), 300); assert.equal(ex.evalInSandbox(c, 'KB_KEEP_DRAG_PX'), 10);
  assert.match(SRC, /kbKeep\.waitTimer = setTimeout\(function\(\)\{[^\n]*\}, KB_KEEP_FOCUS_MS\);/);
});
test('самописець: тип kb-resume і ключі variant, branch, hasFocusStart, hasFocusEnd, intercept, transferMs, kbShownMs, panMax, jumpMax, keptLift, liftTarget, fieldTopAtTouch, released, by у білих списках; подія — лише числа, булеві й назви', function(){
  const D = read('js/diag.js');
  assert.match(D, /const REC_ALLOWED_TYPES = \[[^\]]*'kb-resume'[^\]]*\]/);
  const keys = D.slice(D.indexOf('const REC_ALLOWED_KEYS = ['), D.indexOf('];', D.indexOf('const REC_ALLOWED_KEYS = [')));
  ['variant', 'branch', 'hasFocusStart', 'hasFocusEnd', 'kbShownMs', 'panMax', 'intercept', 'transferMs', 'jumpMax', 'keptLift', 'liftTarget', 'centerTarget', 'fieldCenterAtTouch', 'liftMore', 'liftClamped', 'eligibleBy', 'blurToHiddenMs', 'kbKind', 'kbHSource', 'kbHUsed', 'liftAnimMs', 'touchDuringLift', 'visibleToTouchMs', 'fieldTopAtTouch', 'released', 'releaseAt', 'moveMax', 'docScrollH'].forEach(function(k){ assert.match(keys, new RegExp("'" + k + "'"), k); });
  assert.match(SRC, /pushDebugEvent\(Object\.assign\(rec\.variant \? \{ variant: rec\.variant \} : \{\}, \{ type: 'kb-resume', branch: rec\.branch, hasFocusStart: rec\.hasFocusStart, hasFocusEnd: rec\.hasFocusEnd, intercept: rec\.intercept, transferMs: rec\.transferMs, kbShownMs: rec\.kbShownMs, panMax: rec\.panMax, jumpMax: rec\.jumpMax, keptLift: rec\.keptLift, liftTarget: rec\.liftTarget, centerTarget: rec\.centerTarget, fieldCenterAtTouch: rec\.fieldCenterAtTouch, liftMore: rec\.liftMore, liftClamped: rec\.liftClamped, eligibleBy: rec\.eligibleBy, blurToHiddenMs: rec\.blurToHiddenMs, kbKind: rec\.kbKind, kbHSource: rec\.kbHSource, kbHUsed: rec\.kbHUsed, liftAnimMs: rec\.liftAnimMs, touchDuringLift: rec\.touchDuringLift, visibleToTouchMs: rec\.visibleToTouchMs, released: rec\.released, releaseAt: rec\.releaseAt, moveMax: rec\.moveMax, docScrollH: rec\.docScrollH, innerH: rec\.innerH, scrollY: rec\.scrollY, fieldTopAtTouch: rec\.fieldTopAtTouch \}\)/);
  ['keep-enter', 'keep-release'].forEach(function(b){ assert.ok(SRC.indexOf("'" + b + "'") !== -1, b); });
  ['tap-field', 'tap-other', 'drag', 'close', 'reset'].forEach(function(r){ assert.ok(SRC.indexOf("kbKeepRelease('" + r + "'") !== -1, r); });
  assert.ok(SRC.indexOf('kbKeepOutcome(mv, false)') !== -1, 'tap-miss через kbKeepOutcome');
});
test('keep-lift: вхід лише з visibilitychange hidden, варіант keep-lift, .drawer з підйомом і відкритою клавіатурою; охоронці скидання (геометрія, focusout, vv resize, settle) вимкнені, поки kbKeep; ro-tap і await-focus прибрано з коду', function(){
  assert.match(SRC, /if\(why === 'hidden'\)\{[^\n]*\n\s*const info = kbKeepDecide\(\);\n\s*if\(info\.by !== 'none'\)\{ kbKeepEnter\(info\); return; \}/);
  assert.match(SRC, /function kbKeepEligible\(\)\{[\s\S]{0,700}classList\.contains\('drawer'\)[\s\S]{0,400}isKeyboardOpen\(getBaseViewportHeight\(\), vv\.height\)[\s\S]{0,120}kbSheetCurrentLift > 1/);
  assert.match(SRC, /function updateKbSheetGeometry\(\)\{\s*if\(!kbSheetActive \|\| !window\.visualViewport\) return;\s*if\(kbKeep\) return;/);
  assert.match(SRC, /function handleKeyboardFieldFocusSettle\(\)\{\s*if\(kbKeep\) return;/);
  assert.match(SRC, /document\.addEventListener\('focusout', function\(e\)\{\s*if\(!isKeyboardField\(e\.target\)\) return;[^\n]*\n\s*if\(kbBlurSnap && e\.target === kbBlurSnap\.field && document\.hasFocus\(\)\) kbBlurSnap = null;[^\n]*\n\s*if\(kbKeep\) return;/);
  assert.match(SRC, /function exitKbSheet\(removeKbOpen\)\{\s*kbBlurSnap = null; kbKeepShieldOff\(\);[^\n]*\n\s*kbKeepGrowClear\(\);[^\n]*\n\s*if\(!kbSheetActive\) return;\s*if\(kbKeep\) kbKeepRelease\('close', true\);/);
  assert.match(SRC, /function handleKeyboardFieldFocusIn\(target\)\{\s*globalThis\.__kbSt[^\n]*\n\s*if\(kbKeep\) kbKeepRelease\('tap-field', true\);/);
  assert.match(SRC, /html\.kb-keep \.drawer\.open\{ box-shadow:var\(--shadow-lg\), 0 calc\(var\(--sheet-lift, 0\) \* \.25px\) 0 0 var\(--surface\), [^\n]*\* 1px\) 0 0 var\(--surface\); \}/);
  ['kbResumeRoPrepare', 'kbResumeRoArm', 'data-kb-resume-ro', 'KB_RESUME_RO_MS', "'ro-click'", "'ro-focus'", "'ro-timeout'", 'kbResumeAwaitFocus', 'KB_RESUME_AWAIT_MS', "'await-ok'", "'await-miss'"].forEach(function(w){ assert.equal(SRC.indexOf(w), -1, w + ' прибрано'); });
});
test('обробники: гілки лише в блоці «клавіатура закрита» touchstart і в kbTapEnd; оригінальний вираз intercept без змін; нативні гілки без preventDefault', function(){
  assert.doesNotMatch(SRC.replace(/\/\/[^\n]*/g, ''), /kbResumeDecide|kbResumeVariant|kbResumeProxy|KB_RESUME_PROXY_MS|resumeMode|nativeProxy|proxy-tap|proxy-focus|proxy-miss/, 'Rev 2.32.440: гілки proxy-tap і перемикач варіанта прибрано з коду');
  assert.match(SRC, /if\(resumeTap && shouldInterceptFirstFocus\(\{ field: field, kbSheetOpen: false, moved: false, durationMs: 0 \}\)\)\{/);
  assert.match(SRC, /const intercept = \(start\.first && !!target\) \? true : shouldInterceptFirstFocus\(\{/);
  assert.match(SRC, /if\(start\.keepNative\)\{ kbKeepTouchEnd\(start\); return; \}/);
  assert.match(SRC, /if\(en && en\.keepNative\)\{ const dk = [^\n]*en\.moveMax = dk; \}/, 'на touchmove лише міряємо рух (без опускання)');
  assert.match(SRC, /if\(kbKeepAcceptUntil && performance\.now\(\) < kbKeepAcceptUntil\) return;/);
  assert.match(SRC, /if\(kbSheetActive && !kbProxyActive && !kbKeep\)\{/);
  const a2 = SRC.indexOf('let kbKeep = null'), b2 = SRC.indexOf("window.addEventListener('orientationchange'");
  const sa = SRC.indexOf('function kbKeepShieldOn'), sb = SRC.indexOf('function kbKeepEndRest');
  const rest = SRC.slice(a2, b2).replace(SRC.slice(sa, sb), '');
  assert.doesNotMatch(rest, /preventDefault/, 'keep-lift: без preventDefault (крім щита)');
  assert.doesNotMatch(SRC.slice(sa, sb).match(/addEventListener\('touchstart'[^\n]*/)[0], /preventDefault/, 'щит: touchstart без preventDefault');
  assert.match(SRC.slice(sa, sb), /addEventListener\('touchend', function\(e\)\{ e\.stopPropagation\(\); if\(e\.cancelable\) e\.preventDefault\(\); \}, \{ passive: false \}\)/, 'щит: touchend гасить синтетичний click');
  assert.equal((rest.match(/\bsetTimeout\(/g) || []).length, 2, 'keep-lift: таймери — очікування focusin і завершення щита');
});
test('класифікація дотику по полю піднятої шторки: рух 0 / 6 / 10 / 12 pt; з focusin і без (KB-RESUME-5)', function(){
  assert.equal(c.kbKeepTouchKind(0), 'tap'); assert.equal(c.kbKeepTouchKind(6), 'tap'); assert.equal(c.kbKeepTouchKind(10), 'tap', 'рівно 10 — ще дотик'); assert.equal(c.kbKeepTouchKind(12), 'drag'); assert.equal(c.kbKeepTouchKind(undefined), 'tap');
  assert.equal(c.kbKeepOutcome(0, true), 'tap-field'); assert.equal(c.kbKeepOutcome(6, true), 'tap-field');
  assert.equal(c.kbKeepOutcome(6, false), 'tap-miss', 'без focusin за 300 мс — звичайне опускання');
  assert.equal(c.kbKeepOutcome(12, true), 'drag'); assert.equal(c.kbKeepOutcome(12, false), 'drag');
});
test('ціль підйому за законом центрування iOS (KB-RESUME-6): поле нижче центру, вище центру, обмеження зверху', function(){
  // innerH 894, kbH 389 -> vvH 505, ціль центру = 252.5 - 2 = 250.5
  const lo = c.kbKeepCenterPlan({ innerH: 894, kbH: 389, fieldCenter: 571, drawerTop: 400, minTop: 59 });
  assert.equal(lo.centerTarget, 250.5); assert.equal(Math.round(lo.extra), 321); assert.equal(lo.clamped, false);
  const hi = c.kbKeepCenterPlan({ innerH: 894, kbH: 389, fieldCenter: 200, drawerTop: 100, minTop: 59 });
  assert.equal(hi.extra, 0, 'поле вище цілі - додатково не піднімаємо'); assert.equal(hi.clamped, false);
  const cl = c.kbKeepCenterPlan({ innerH: 894, kbH: 389, fieldCenter: 571, drawerTop: 120, minTop: 59 });
  assert.equal(cl.extra, 61); assert.equal(cl.clamped, true, 'не вміщується: піднято наскільки можна');
  const eq = c.kbKeepCenterPlan({ innerH: 894, kbH: 389, fieldCenter: 300, drawerTop: 200, minTop: 59 });
  assert.equal(Math.round(eq.extra), 50);
});
test('вхід у keep-lift (KB-RESUME-7): зараз / за знімком; межі віку знімка 0 / 2999 / 3000 / 3001 мс', function(){
  const base = { kbOpenNow: false, snapAgeMs: 500, sameDrawer: true, drawerOpen: true, fieldConnected: true, sameOrientation: true, lift: 275 };
  assert.equal(c.kbKeepEntryBy(Object.assign({}, base, { kbOpenNow: true, snapAgeMs: -1 })), 'now');
  assert.equal(c.kbKeepEntryBy(base), 'blur-snap');
  [[0, 'blur-snap'], [2999, 'blur-snap'], [3000, 'none'], [3001, 'none'], [-1, 'none']].forEach(function(x){ assert.equal(c.kbKeepEntryBy(Object.assign({}, base, { snapAgeMs: x[0] })), x[1], 'вік ' + x[0]); });
  ['sameDrawer', 'drawerOpen', 'fieldConnected', 'sameOrientation'].forEach(function(k){ const o = Object.assign({}, base); o[k] = false; assert.equal(c.kbKeepEntryBy(o), 'none', k); });
  assert.equal(c.kbKeepEntryBy(Object.assign({}, base, { lift: 0 })), 'none', 'без підйому нема чого лишати');
  assert.equal(c.kbKeepEntryBy(Object.assign({}, base, { kbOpenNow: true, drawerOpen: false })), 'none');
});
test('вибір kbH (KB-RESUME-7): store за видом -> store text -> знімок; < 150 або нема — invalid', function(){
  assert.deepEqual(j(c.kbKeepPickKbH({ storeKind: 389, storeText: 388, snapshot: 400 })), { kbH: 389, source: 'store-kind' });
  assert.deepEqual(j(c.kbKeepPickKbH({ storeKind: null, storeText: 388, snapshot: 400 })), { kbH: 388, source: 'store-text' });
  assert.deepEqual(j(c.kbKeepPickKbH({ storeKind: null, storeText: null, snapshot: 391 })), { kbH: 391, source: 'snapshot' });
  assert.equal(c.kbKeepPickKbH({ storeKind: null, storeText: null, snapshot: 0 }).source, 'invalid');
  assert.equal(c.kbKeepPickKbH({ storeKind: 120, storeText: 388, snapshot: 400 }).source, 'invalid', 'менше 150 — не вмикаємо');
  assert.equal(c.kbKeepPickKbH({}).kbH, 0);
});
test('план підйому і щит (KB-RESUME-7): від 0 до цілі; без анімації при відкритій клавіатурі, іншій орієнтації чи закритій шторці; щит <= 500 мс', function(){
  const ok = { kbOpenNow: false, lift: 275, sameOrientation: true, drawerOpen: true };
  assert.deepEqual(j(c.kbKeepLiftPlan(ok)), { animate: true, from: 0, to: 275 });
  assert.equal(c.kbKeepLiftPlan(Object.assign({}, ok, { kbOpenNow: true })).animate, false);
  assert.equal(c.kbKeepLiftPlan(Object.assign({}, ok, { sameOrientation: false })).animate, false, 'orientationchange скасовує');
  assert.equal(c.kbKeepLiftPlan(Object.assign({}, ok, { drawerOpen: false })).animate, false);
  assert.equal(c.kbKeepShieldMs(250), 300); assert.equal(c.kbKeepShieldMs(0), 50); assert.equal(c.kbKeepShieldMs(1000), 500); assert.equal(c.kbKeepShieldMs(undefined), 50);
  assert.match(SRC, /capTimer: setTimeout\(kbKeepShieldOff, kbKeepShieldMs\(1000\)\)/, 'страховка щита 500 мс');
});
test('охоронці keep-lift (KB-RESUME-7): kbNoteKbH, applyLiveSheetLift, scheduleLiveSheetLift, kbVvTopCloseFollow; знімок скидається на window focus, orientationchange, закриття; щит знімається на pagehide/hidden', function(){
  ['function kbNoteKbH\\(kbH\\)\\{\\n  if\\(kbKeep\\) return;', 'function applyLiveSheetLift\\(\\)\\{\\n  KB_LIVE\\.raf = 0;\\n  if\\(kbKeep\\) return;', 'function scheduleLiveSheetLift\\(\\)\\{\\n  if\\(kbKeep\\) return;', 'function kbVvTopCloseFollow\\(gen\\)\\{\\n  if\\(kbKeep\\) return;'].forEach(function(r){ assert.match(SRC, new RegExp(r)); });
  assert.match(SRC, /window\.addEventListener\('focus', function\(\)\{\n  kbBlurSnap = null;/);
  assert.match(SRC, /window\.addEventListener\('orientationchange', function\(\)\{ kbBlurSnap = null; kbKeepShieldOff\(\);/);
  assert.match(SRC, /function exitKbSheet\(removeKbOpen\)\{\n  kbBlurSnap = null; kbKeepShieldOff\(\);/);
  assert.match(SRC, /function kbResetOnBackground\(why\)\{\n  try\{\n    if\(kbKeep\)\{ if\(why === 'hidden'\) kbKeepBackAgain\(\); else kbKeepShieldOff\(\); return; \}/);
  assert.match(SRC, /kbBlurSnapNote\(\); kbWinDiag\('kb-vv-resize'\)/);
  assert.match(SRC, /function kbBlurSnapNote\(\)\{\s*try\{\s*if\(kbKeep \|\| !kbSheetActive \|\| !kbSheetDrawerEl \|\| kbProxyActive\) return;/, 'знімок без перемикача варіанта (Rev 2.32.440)');
});

test('Rev 2.32.439 (KB-RESUME-8): повторний вхід зі збільшенням 46 — план від звичайної висоти: liftMore 46 (не 0), центр після входу = ціль ±1; стабільно 3 рази', () => {
  // геометрія телефона: innerH 894, kbH 389, поле стоїть у цілі (251) при застосованому збільшенні 46
  let grow = 46, center = 251;
  for(let i = 0; i < 3; i++){
    const um = c.kbKeepUngrown({ fieldCenter: center, drawerTop: 120, growBefore: grow });
    assert.equal(um.fieldCenter, center + grow); assert.equal(um.drawerTop, 120 + grow);
    const plan = c.kbKeepCenterPlan({ innerH: 894, kbH: 389, fieldCenter: um.fieldCenter, drawerTop: um.drawerTop, minTop: 59 });
    assert.ok(Math.abs(plan.extra - 46) <= 1, 'цикл ' + (i + 1) + ': liftMore ≈ 46, не 0');
    assert.ok(Math.abs(um.fieldCenter - plan.extra - 251) <= 1, 'центр після входу');
    grow = plan.extra; center = um.fieldCenter - plan.extra; // поле у цілі при новому збільшенні
  }
  assert.deepEqual({ ...c.kbKeepUngrown({ fieldCenter: 300, drawerTop: 90, growBefore: 0 }) }, { fieldCenter: 300, drawerTop: 90 });
  assert.equal(c.kbKeepUngrown({ fieldCenter: 300, drawerTop: 90, growBefore: -5 }).fieldCenter, 300);
});

test('Rev 2.32.440 (KB-RESUME-8): експеримент kb-resume прибрано — реєстр порожній, збережений варіант ігнорується й прибирається, keep-lift без перемикача', function(){
  assert.deepEqual(JSON.parse(ex.evalInSandbox(c, 'JSON.stringify(TEST_VARIANTS)')), []);
  assert.equal(c.getVariant('kb-resume'), null);
  ['control', 'proxy-tap', 'keep-lift'].forEach(function(v){
    store['budget_variants_v1'] = JSON.stringify({ 'kb-resume': v });
    assert.equal(c.getVariant('kb-resume'), null, v);
    c.pruneVariants();
    assert.equal(store['budget_variants_v1'], undefined, 'ключ ' + v + ' прибрано зі сховища');
  });
  assert.match(SRC, /function kbResetOnBackground\(why\)\{[\s\S]{0,900}if\(why === 'hidden'\)\{[^\n]*\n\s*const info = kbKeepDecide\(\);/);
  assert.match(SRC, /id="testing-variants-label"/); assert.match(SRC, /lab\.classList\.toggle\('hidden', !TEST_VARIANTS\.length\)/);
  assert.doesNotMatch(read('js/diag.js'), /kb-resume'\)/);
});
