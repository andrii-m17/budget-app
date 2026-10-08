// Rev 2.29.1 — діагностика стрілок клавіатури на формі «Витрати»: лише запис у рекордер, жодних змін поведінки форми.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ex = require('./extract');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const ctx = ex.buildSandbox({}, ['focusNeighborsOf', 'shouldSkipTabTransition']);
const j = code => JSON.parse(ex.evalInSandbox(ctx, 'JSON.stringify(' + code + ')'));
const DIAG = SRC.slice(SRC.indexOf('// ===== Rev 2.29.1 — діагностика стрілок'), SRC.indexOf('function attachDebugRecorderListeners'));

test('focusNeighborsOf: найближчі придатні сусіди; непридатні (disabled/hidden) пропускаються; краї → -1', () => {
  const N = (items, i) => j('focusNeighborsOf(' + JSON.stringify(items) + ',' + i + ')');
  const e = b => ({ eligible: b });
  assert.deepEqual(N([e(true), e(true), e(true)], 1), { prev: 0, next: 2 });
  assert.deepEqual(N([e(true), e(false), e(true)], 0), { prev: -1, next: 2 }, 'непридатний пропускається');
  assert.deepEqual(N([e(true), e(true), e(false)], 1), { prev: 0, next: -1 }, 'далі нікого придатного — стрілки вниз нема');
  assert.deepEqual(N([e(true)], 0), { prev: -1, next: -1 });
  assert.deepEqual(N(null, 0), { prev: -1, next: -1 });
});

test('діагностика лише читає: жодних focus/blur/setAttribute/classList/style-записів і preventDefault у обробнику', () => {
  const h = DIAG.slice(DIAG.indexOf('function onExpenseFocusNeighbors'));
  assert.ok(!/\.focus\(|\.blur\(|setAttribute|removeAttribute|classList\.(add|remove|toggle)|\.style\.|preventDefault|innerHTML/.test(h));
  assert.match(h, /pushDebugEvent\(\{/);
  assert.match(h, /type: 'expense-focus-neighbors'/);
});

test('обробник реєструється лише на час запису (через on() рекордера), реагує тільки на поля форми «Витрати»', () => {
  assert.match(SRC, /on\(document, 'focusin', onExpenseFocusNeighbors, true\);/);
  assert.match(DIAG, /t\.closest\('#vytraty-default-view \.expense-entry'\)/);
});

test('подія пише fieldId/prevId/nextId/nextDisabled/nextHidden/msSinceTab і контекст переходу (transitioning, viewPe, viewOpacity); поля в allowlist', () => {
  ['fieldId', 'prevId', 'nextId', 'nextDisabled', 'nextHidden', 'msSinceTab', 'transitioning', 'viewPe', 'viewOpacity', 'nextRawId', 'orderIds'].forEach(f => {
    assert.match(DIAG, new RegExp('\\b' + f + '\\b'));
    assert.match(SRC, new RegExp("DEBUG_EVENT_ALLOWLIST = \\[[\\s\\S]*'" + f + "'"));
  });
  assert.match(SRC, /lastTabSwitchAt = tSwitch0;/);
});

test('розмітка форми «Витрати» не змінювалась діагностикою: порядок полів і ids лишаються', () => {
  const a = SRC.indexOf('<div class="vytraty-form-col">'), b = SRC.indexOf('<div class="vytraty-recent-col">');
  const form = SRC.slice(a, b);
  const ids = [...form.matchAll(/<(?:input|select|button)\b[^>]*?(?:id="([^"]+)")?[^>]*>/g)].map(m => m[1] || '·');
  assert.ok(form.indexOf('id="expfielda7"') < form.indexOf('id="f-amount"') && form.indexOf('id="f-amount"') < form.indexOf('id="f-date"') && form.indexOf('id="f-date"') < form.indexOf('id="f-category"'));
  assert.ok(ids.length >= 8);
});

// ---------- Rev 2.30.1: перехід на «Витрати» з автофокусом без M1-анімації ----------
const PST = SRC.slice(SRC.indexOf('function performSwitchTab'), SRC.indexOf('/* ============ "Liquid Glass" таббар'));

test('shouldSkipTabTransition: лише «Витрати» з автофокусом; інші вкладки й «Витрати» без автофокусу (noFocus) — анімуються', () => {
  const K = (r, a) => j(`shouldSkipTabTransition(${JSON.stringify(r)},${a})`);
  assert.equal(K('vytraty', true), true);
  assert.equal(K('vytraty', false), false, 'зі сповіщення (noFocus) — анімація як раніше');
  ['analytics', 'accounting', 'structure', 'service'].forEach(t => { assert.equal(K(t, true), false, t); assert.equal(K(t, false), false, t); });
  assert.equal(K(undefined, true), false);
});

test('performSwitchTab: автофокус на «Назві» ⇒ animateSwitch=false (без .tab-transitioning, inline opacity/transform, pointer-events:none); focus() викликається синхронно, як у 2.23.21', () => {
  assert.match(PST, /const willAutofocus = tab === 'vytraty' && !\(opts && opts\.noFocus\);/);
  assert.match(PST, /const skipForAutofocus = shouldSkipTabTransition\(tab, willAutofocus\);/);
  assert.match(PST, /const animateSwitch = switching && tabAnimEnabled && document\.visibilityState === 'visible' && !skipForAutofocus/);
  assert.match(PST, /try\{ target\.focus\(\{preventScroll:true\}\); \}catch\(e\)\{ target\.focus\(\); \}/);
  // beginTabTransition (який ставить .tab-transitioning й opacity:0) викликається лише коли animateSwitch
  assert.match(PST, /const tabCtx = animateSwitch \? beginTabTransition\(/);
});

test('діагностика: tab-switch з skipped:"autofocus" і expense-arrows-state через 450 мс (prevId/nextId/nextDisabled/transitioning/viewOpacity/viewPe); expense-focus-neighbors лишився', () => {
  assert.match(PST, /kind: 'tab-switch', from: prevTab, to: tab, skipped: 'autofocus'/);
  assert.match(PST, /setTimeout\(function\(\)\{ if\(debugRecordingActive\) recordExpenseArrowsState\(target\); \}, 450\)/);
  const h = SRC.slice(SRC.indexOf('function recordExpenseArrowsState'), SRC.indexOf('function attachDebugRecorderListeners'));
  ['prevId', 'nextId', 'nextDisabled', 'transitioning', 'viewOpacity', 'viewPe'].forEach(f => assert.match(h, new RegExp(f + ': info\\.' + f)));
  assert.match(h, /type: 'expense-arrows-state'/);
  assert.ok(!/\.focus\(|\.blur\(|setAttribute|classList|\.style\./.test(h), 'лише читання');
  assert.match(SRC, /on\(document, 'focusin', onExpenseFocusNeighbors, true\)/);
});

test('розмітка/атрибути полів форми «Витрати» не змінювались (без tabindex=-1)', () => {
  const a = SRC.indexOf('<div class="vytraty-form-col">'), b = SRC.indexOf('<div class="vytraty-recent-col">');
  const form = SRC.slice(a, b);
  assert.ok(!/tabindex/.test(form));
  assert.ok(form.indexOf('id="expfielda7"') < form.indexOf('id="f-amount"'));
});
