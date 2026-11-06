// KB-5b (Rev 2.32.259): поки фокус у полі, кадри «клавіатура закрита» не опускають лист і не знімають kb-open; затримки 250 мс більше нема.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const HTML = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
test('KB-5b: константи KB_CLOSE_CONFIRM_MS і setTimeout закриття немає', () => {
  assert.ok(!/const KB_CLOSE_CONFIRM_MS/.test(HTML));
  assert.ok(!/\}, KB_CLOSE_CONFIRM_MS\)/.test(HTML));
});
test('KB-5b: запобіжник visualViewport resize виходить, коли фокус у полі', () => {
  assert.match(HTML, /if\(kbFocusInTextField\(\)\)\{ kbHiddenSince = 0;[^}]*\} return; \}/);
  assert.match(HTML, /function kbFocusInTextField\(\)/);
});
test('KB-5b: updateKbSheetGeometry ігнорує закритий кадр за фокуса в полі після появи клавіатури', () => {
  assert.match(HTML, /if\(!isKeyboardOpen\(baseVh, vvH\) && kbSheetNewF && \(KB_PIPE\.state === 'animating' \|\| KB_PIPE\.state === 'settled'\) && kbFocusInTextField\(\)\) return;/);
});
