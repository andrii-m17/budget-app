// KB-19 (Rev 2.32.273): охорона єдиного модуля руху форм з клавіатурою (kbMotion) і тандему з iOS.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const HTML = fs.readFileSync(require('node:path').join(__dirname, '..', 'index.html'), 'utf8');
const b = HTML.indexOf('// KB-MOTION-BEGIN'), e = HTML.indexOf('// KB-MOTION-END');
const OUT = HTML.slice(0, b) + HTML.slice(e);
test('KB-19: модуль руху існує, межі впорядковані', () => { assert.ok(b > 0 && e > b); });
test('KB-19: --sheet-lift / --sheet-max-h / --sheet-lift-target пишуться лише в модулі (поза ним — kbMotionVar)', () => {
  assert.doesNotMatch(OUT, /setProperty\(\s*'--sheet-(lift|max-h|lift-target)'/);
});
test('KB-19: transform листа анімує лише модуль (kbSheetDrawerEl.animate / style.transform поза ним немає)', () => {
  assert.doesNotMatch(OUT, /kbSheetDrawerEl\.(animate\(|style\.(transform|maxHeight))/);
});
test('KB-19/D: у полях листів немає scrollIntoView і голого focus() для переходу між полями (тандем з iOS: лише preventScroll, прокрутка через kbMotionReveal)', () => {
  assert.doesNotMatch(HTML, /drawer\.contains\(a\) && typeof a\.scrollIntoView/);
  assert.match(HTML, /next\.focus\(\{ preventScroll: true \}\)/);
});
test('KB-19: крива й тривалість в JS збігаються з CSS-змінними (одна на відкриття, зміну висоти, прокрутку, закриття)', () => {
  const dur = Number(/const KB_MOTION_DUR = (\d+);/.exec(HTML)[1]);
  const c = /const KB_MOTION_CURVE = \[([^\]]+)\];/.exec(HTML)[1].split(',').map(x => x.trim()).join(', ');
  assert.match(HTML, new RegExp(':root\\{ --kb-dur:' + dur + 'ms; --kb-ease:cubic-bezier\\(' + c.replace(/\./g, '\\.') + '\\); \\}'));
  assert.doesNotMatch(HTML, /kbFlipScroll\([^)]*cubic-bezier/);
});
test('KB-19: без LEAD-таймера й перекриття ніг: стара нога скасовується в тому ж завданні', () => {
  assert.doesNotMatch(HTML, /KB_LIFT_LEAD_MS|startTime = tl\.currentTime \+/);
});
