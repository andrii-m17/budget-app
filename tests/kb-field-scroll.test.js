// KB-11 (Rev 2.32.264): прокрутка до поля разом з підйомом листа: чисті функції (ціль прокрутки, крива) і охорона інтеграції.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildSandbox, evalInSandbox } = require('./extract');
const HTML = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const ctx = buildSandbox({}, ['kbBezier', 'computeFieldScrollTarget']);
const num = expr => evalInSandbox(ctx, expr);
test('kbBezier: початок 0, кінець 1, монотонна, швидкий старт для кривої підйому (0.22, 0.9, 0.3, 1)', () => {
  assert.equal(num('kbBezier(0.22, 0.9, 0.3, 1, 0)'), 0);
  assert.equal(num('kbBezier(0.22, 0.9, 0.3, 1, 1)'), 1);
  let prev = 0;
  for(let i = 1; i <= 20; i++){ const v = num('kbBezier(0.22, 0.9, 0.3, 1, ' + (i / 20) + ')'); assert.ok(v >= prev - 1e-9, 'монотонність на ' + i); prev = v; }
  assert.ok(num('kbBezier(0.22, 0.9, 0.3, 1, 0.1)') > 0.2, 'ease-out: за 10% часу вже понад 20% шляху');
  assert.ok(Math.abs(num('kbBezier(0, 0, 1, 1, 0.5)') - 0.5) < 0.01, 'лінійна крива');
});
test('computeFieldScrollTarget: цифри зі звіту MT-1107-3790/1889 (лист 498, блок кнопок 147, поле 343–391 у вмісті)', () => {
  // поле під блоком кнопок: потрібна прокрутка, щоб низ поля став на 10 пт над верхом блоку (498 − 147 − 10 = 341)
  assert.equal(num('computeFieldScrollTarget({ fieldTop: 343, fieldBottom: 391, scrollTop: 0, scrollH: 581, finalClientH: 498, barH: 147 })'), 50);
  // поле вже над блоком — прокрутки не треба
  assert.equal(num('computeFieldScrollTarget({ fieldTop: 200, fieldBottom: 248, scrollTop: 0, scrollH: 581, finalClientH: 498, barH: 147 })'), 0);
  // без блоку кнопок межа — низ листа
  assert.equal(num('computeFieldScrollTarget({ fieldTop: 500, fieldBottom: 548, scrollTop: 0, scrollH: 900, finalClientH: 498, barH: 0 })'), 54);
  // не більше максимуму прокрутки
  assert.equal(num('computeFieldScrollTarget({ fieldTop: 500, fieldBottom: 548, scrollTop: 0, scrollH: 520, finalClientH: 498, barH: 0 })'), 22);
  // поле вище верху видимої частини: прокрутка вгору
  assert.equal(num('computeFieldScrollTarget({ fieldTop: 100, fieldBottom: 148, scrollTop: 200, scrollH: 900, finalClientH: 498, barH: 0 })'), 96);
});
test('KB-11: прокрутка стартує в kbPipeAnimate до beginSheetMoving; курсор чекає прокрутку й анімації листа; подія field-scroll з початком, кінцем і величиною', () => {
  assert.match(HTML, /kbStartFieldScroll\(kbSheetDrawerEl, [^;]*\);[^\n]*\n\s*beginSheetMoving\(kbSheetDrawerEl, 'open', null, kbPipeField\);/);
  assert.match(HTML, /if\(kbScrollAnimActive \|\| kbLiftActive\)\{ kbScrollWaiters\.push\(function\(\)\{ finish\(true\); \}\); return; \}/);
  assert.match(HTML, /getAnimations\(\)\.filter\(function\(a\)\{ return a\.playState === 'running'; \}\)/);
  assert.match(HTML, /captureDebugGeometry\('field-scroll', \{[^}]*scrollFrom: Math\.round\(from\), scrollTo: Math\.round\(to\)[^}]*\}\)/);
});
test('KB-13/C → KB-18/D: закриття веде kbCloseScroll — scrollTop у 0 одним кроком + FLIP тією ж кривою; без rAF-прокрутки', () => {
  assert.match(HTML, /function kbCloseScroll\(drawerEl, field\)/);
  assert.match(HTML, /kbCloseScroll\(drawerEl, lastFieldAtClose\);/);
  assert.match(HTML, /kbFlipScroll\(sc, function\(\)\{ sc\.scrollTop = 0; \}, KB_MOTION_DUR, KB_MOTION_EASING\);/);
  assert.doesNotMatch(HTML, /kbScrollRaf|kbCloseScrollRaf/, 'покадрової (rAF) прокрутки більше немає');
});
