// Rev 2.32.312 (UI-SELECT, B): текст інтерфейсу не виділяється; поля введення лишають виділення й вставку.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
test('body: user-select none і без системного меню touch-callout; input/textarea/[contenteditable]: user-select text і touch-callout default', () => {
  assert.match(SRC, /\n  body\{ -webkit-user-select:none; user-select:none; -webkit-touch-callout:none; \}\n/);
  assert.match(SRC, /\n  input, textarea, \[contenteditable\]\{ -webkit-user-select:text; user-select:text; -webkit-touch-callout:default; \}\n/);
});
test('інших винятків немає: у CSS немає user-select:all, а user-select:none лише в правилі body (і коментар проксі-поля)', () => {
  const css = SRC.slice(SRC.indexOf('<style'), SRC.indexOf('</style>'));
  assert.ok(!/user-select\s*:\s*all/.test(css), 'user-select:all прибрано (код звіту копіюється кнопкою)');
  const none = css.match(/user-select\s*:\s*none/g) || [];
  assert.equal(none.length, 2, 'унікальне none: -webkit-user-select і user-select у правилі body');
  assert.match(SRC, /id="rec-report-copy" onclick="copyRecCode\(\)"/, 'кнопка копіювання коду звіту лишилась');
});
test('проксі-поле клавіатури лишається без user-select:none (відомий баг WebKit)', () => {
  const i = SRC.indexOf('function proxyCaretStyle()'); const fn = SRC.slice(i, SRC.indexOf('\n}', i));
  assert.ok(!/user-select/.test(fn));
});
