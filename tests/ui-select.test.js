// Rev 2.32.407 (UI-SELECT, B; повернення Rev 2.32.312): текст інтерфейсу не виділяється довгим дотиком; поля введення лишають виділення й вставку; код звіту копіюється кнопкою.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const SRC = require('./extract').readIndexWithCss();
test('body: user-select none і без системного меню touch-callout; input/textarea/[contenteditable]: user-select text і touch-callout default', () => {
  assert.match(SRC, /\n  body\{ -webkit-user-select:none; user-select:none; -webkit-touch-callout:none; \}\n/);
  assert.match(SRC, /\n  input, textarea, \[contenteditable\]\{ -webkit-user-select:text; user-select:text; -webkit-touch-callout:default; \}\n/);
});
test('правило полів стоїть ПІСЛЯ правила body і не перекривається пізнішим user-select:none на input/textarea', () => {
  assert.ok(SRC.indexOf('body{ -webkit-user-select:none') < SRC.indexOf('input, textarea, [contenteditable]{ -webkit-user-select:text'));
  const css = SRC.slice(SRC.indexOf('*{ box-sizing:border-box'));
  const rules = css.match(/[^{}]+\{[^{}]*user-select\s*:\s*none[^{}]*\}/g) || [];
  const bad = rules.filter(r => /(^|[\s,])(input|textarea|select|\[contenteditable\])\b/.test(r.split('{')[0]) && !/body/.test(r.split('{')[0]));
  assert.deepEqual(bad, [], 'user-select:none не повинен діяти на поля введення');
});
test('user-select:all прибрано (код звіту копіюється кнопкою), кнопка лишилась', () => {
  assert.ok(!/user-select\s*:\s*all/.test(SRC), 'user-select:all немає');
  assert.match(SRC, /id="rec-report-copy" onclick="copyRecCode\(\)"/);
  assert.match(SRC, /function copyRecCode\(\)\{ if\(recLastCode\) recCopyText\(recLastCode/);
});
test('проксі-поле клавіатури лишається без user-select:none (відомий баг WebKit: input з none не фокусується)', () => {
  const i = SRC.indexOf('function proxyCaretStyle()'); const fn = SRC.slice(i, SRC.indexOf('\n}', i));
  assert.ok(!/user-select/.test(fn));
});
