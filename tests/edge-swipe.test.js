// Rev 2.31.1 (C) — свайп із лівого краю закриває «Видалені дані» тим самим жестом, що й Журнал (спільна реалізація).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ex = require('./extract');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const ctx = ex.buildSandbox({}, ['EDGE_SWIPE_ZONE', 'EDGE_SWIPE_THRESHOLD', 'shouldCloseBySwipe']);
const j = code => JSON.parse(ex.evalInSandbox(ctx, 'JSON.stringify(' + code + ')'));
const IMPL = SRC.slice(SRC.indexOf('const EDGE_SWIPE_ZONE'), SRC.indexOf('function shiftJournalMonth('));

test('shouldCloseBySwipe: вправо > 60px і переважно горизонтально; вліво, коротко, діагональ/вертикаль — ні', () => {
  const C = (dx, dy, th) => j(`shouldCloseBySwipe(${dx},${dy},${th === undefined ? 'undefined' : th})`);
  assert.equal(C(61, 0), true);
  assert.equal(C(60, 0), false, 'поріг строго більше');
  assert.equal(C(100, 40), true);
  assert.equal(C(100, 100), false, '|dy| < dx');
  assert.equal(C(100, -120), false);
  assert.equal(C(-100, 0), false, 'вліво (дії рядка) — не закриття');
  assert.equal(C(30, 0), false);
  assert.equal(C(30, 0, 20), true, 'власний поріг');
  assert.equal(j('EDGE_SWIPE_ZONE'), 40);
  assert.equal(j('EDGE_SWIPE_THRESHOLD'), 60);
});

test('єдина реалізація: і Журнал, і «Видалені дані» використовують installEdgeSwipeClose (без копіювання); у Журналі поведінка збережена (blockScroll)', () => {
  assert.equal((IMPL.match(/function installEdgeSwipeClose/g) || []).length, 1);
  assert.match(IMPL, /installEdgeSwipeClose\(overlay, function\(\)\{ return isJournalOpen; \}, closeJournal, \{ blockScroll: true \}\);/);
  assert.match(IMPL, /installEdgeSwipeClose\(document\.getElementById\('trash-screen'\), function\(\)\{ return isTrashOpen; \}, closeTrashScreen, \{\s*blockScroll: false,/);
  // жест стартує лише із зони краю й лише з одного пальця
  assert.match(IMPL, /active = t\.clientX <= EDGE_SWIPE_ZONE;/);
  assert.match(IMPL, /if\(!isOpen\(\) \|\| e\.touches\.length !== 1\) return;/);
  assert.match(IMPL, /if\(shouldCloseBySwipe\(dx, dy\)\)/);
});

test('не конфліктує зі свайпом рядка й прокруткою: на «Видалених даних» preventDefault не викликається, горизонтальні панування блокує touch-action:pan-y лише на цьому шарі', () => {
  const move = IMPL.slice(IMPL.indexOf("el.addEventListener('touchmove'"), IMPL.indexOf("el.addEventListener('touchend'"));
  assert.match(move, /if\(o\.blockScroll && e\.cancelable\) e\.preventDefault\(\);/);
  assert.match(SRC, /\.trash-screen\{ touch-action:pan-y; \}/);
  // свайп рядка вліво має власні обробники (document-рівня) і CSS touch-action:pan-y на рядку
  assert.match(SRC, /\.expense-row\{[^}]*touch-action:pan-y/);
  assert.ok(!/trash-screen[^\n]*overflow-x/.test(SRC.slice(SRC.indexOf('.trash-screen{ position:fixed'), SRC.indexOf('.trash-screen{ position:fixed') + 400)));
});

test('закриття свайпом = закриття «назад»: closeTrashScreen без фокусу кнопок/клавіатури; без transform/анімації на body/html; рекордер trash-swipe-close (ms, dx)', () => {
  const trash = SRC.slice(SRC.indexOf('function closeTrashScreen'), SRC.indexOf('function showTrashToast'));
  assert.ok(!/\.focus\(/.test(trash), 'без focus()');
  assert.match(trash, /restoreFocus\(\);/);
  assert.match(IMPL, /type: 'trash-swipe-close', ms: ms, dx: dx/);
  assert.match(SRC, /DEBUG_EVENT_ALLOWLIST = \[[\s\S]*'dx'/);
  assert.ok(!/document\.body\.animate|documentElement\.animate/.test(IMPL));
});

test('зона краю не заважає кнопці «назад»: тап (без руху) лишається кліком — стартовий touchstart passive, закриття лише після руху >60px', () => {
  assert.match(IMPL, /el\.addEventListener\('touchstart', function\(e\)\{[\s\S]*?\}, \{passive:true, capture:true\}\);/);
  assert.match(SRC, /<button type="button" class="journal-back-btn" onclick="closeTrashScreen\(\)"/);
});
