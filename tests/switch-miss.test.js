// Rev 2.32.304 (KB-SWITCH, A): діагностика промаху перехоплення дотику всередині відкритої шторки і стану перед scrollTo у pan-comp. Поведінка не змінюється.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
test('switch-miss: тип і ключі дозволені, причини proxy/same/moved/long, гілка лише при відкритій шторці й полі шторки', () => {
  const ti = SRC.indexOf('const REC_ALLOWED_TYPES = ['), ki = SRC.indexOf('const REC_ALLOWED_KEYS = [');
  assert.ok(SRC.slice(ti, SRC.indexOf('];', ti)).includes("'switch-miss'"));
  const keys = SRC.slice(ki, SRC.indexOf('];', ki));
  for (const k of ['vvTopBefore', 'scrollYBefore', 'distPx', 'reason', 'durationMs']) assert.ok(keys.includes("'" + k + "'"), k);
  const i = SRC.indexOf("captureDebugGeometry('switch-miss'");
  assert.ok(i > 0);
  const ctx = SRC.slice(i - 400, i + 520);
  assert.match(ctx, /else if\(kbSheetActive && target && isTapTargetField\(target\) && isFieldInsideDrawer\(target\)\)/);
  for (const r of ["'proxy'", "'same'", "'moved'", "'long'"]) assert.ok(ctx.includes(r), r);
});
test('pan-comp: vvTopBefore і scrollYBefore знімаються в rAF ДО scrollTo(0, 0)', () => {
  const a = SRC.indexOf('const preTop = window.visualViewport'), b = SRC.indexOf('window.scrollTo(0, 0); if(IS_IOS_RUNTIME && panShift > 1) kbMotionPan(panShift, preTop, preSy)');
  assert.ok(a > 0 && b > a, 'значення беруться раніше за scrollTo');
  assert.match(SRC, /vvTopBefore: preTop, scrollYBefore: preSy/);
});
test('Rev 2.32.305 (KB-SWITCH-X): native-focus і активне поле на touchstart/touchend у switch-miss; ключі дозволені', () => {
  const ti = SRC.indexOf('const REC_ALLOWED_TYPES = ['), ki = SRC.indexOf('const REC_ALLOWED_KEYS = [');
  assert.ok(SRC.slice(ti, SRC.indexOf('];', ti)).includes("'native-focus'"));
  const keys = SRC.slice(ki, SRC.indexOf('];', ki));
  for (const k of ['prevTabindex', 'targetTabindex', 'sinceTouchEnd', 'enterHop', 'activeStart', 'activeEnd', 'sinceIntercept']) assert.ok(keys.includes("'" + k + "'"), k);
  assert.match(SRC, /captureDebugGeometry\('native-focus', \{ from:/);
  assert.match(SRC, /activeId: active \? \(active\.id \|\| active\.tagName\) : null/); // Rev 2.32.307: запис дотику за identifier
  assert.match(SRC, /activeStart: start\.activeId \|\| null, activeEnd: active \?/);
});
test('Rev 2.32.307 (KB-SWITCH-FINAL): перехоплення на touchstart (passive:false, capture), облік за identifier, phase:start, touch-cancel', () => {
  assert.match(SRC, /const kbTouches = new Map\(\);/);
  assert.ok(!/(let|const|var) kbTapStart|kbTapStart = /.test(SRC), 'одного глобального стану дотику більше немає');
  assert.match(SRC, /kbTouches\.set\(t\.identifier, entry\);\n  \}\n\}, \{ passive: false, capture: true \}\);/);
  assert.match(SRC, /if\(e\.cancelable\) e\.preventDefault\(\);/);
  assert.match(SRC, /switchKind: 'tap', phase: phase, latencyMs: /);
  assert.match(SRC, /captureDebugGeometry\('touch-cancel', \{ to:/);
  assert.match(SRC, /if\(start\.scrolling \|\| moved \|\| !kbSheetActive \|\| kbProxyActive \|\| !drawerEl \|\| target === active\) return;/);
  assert.ok(!/shouldInterceptSwitchTap\(\{ target: rawTarget/.test(SRC), 'старий вибір переходу на touchend прибрано');
  assert.ok(SRC.slice(SRC.indexOf('const REC_ALLOWED_TYPES = ['), SRC.indexOf('];', SRC.indexOf('const REC_ALLOWED_TYPES = ['))).includes("'touch-cancel'"));
});
