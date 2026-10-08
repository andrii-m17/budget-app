// Rev 2.29.1 — діагностика стрілок клавіатури на формі «Витрати»: лише запис у рекордер, жодних змін поведінки форми.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ex = require('./extract');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const ctx = ex.buildSandbox({}, ['focusNeighborsOf']);
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
