// Rev 2.32.57 (P) — підсвічування рядків-списків при натисканні (поверх M1).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
test('усі інтерактивні елементи «Структури», «Сповіщень» і Monobank охоплені реакцією натискання (button у PRESS_SELECTOR), без винятків', function(){
  const sel = SRC.match(/const PRESS_SELECTOR = '([^']*)'/)[1];
  assert.ok(/(^|, )button(,|$)/.test(sel));
  const excl = SRC.match(/const PRESS_EXCLUDE = '([^']*)'/)[1];
  ['struct-row', 'struct-dict-head', 'struct-delete-row', 'notif-row', 'mono-row', 'struct-tab-btn', 'submit-btn'].forEach(function(c){ assert.ok(excl.indexOf(c) === -1, c + ' не виключено'); });
});
test('рядки-списки мають фон на час .is-pressed (токен поверхні), без нових обробників', function(){
  const rule = SRC.match(/\.struct-row\.is-pressed, [^{]*\{([^}]*)\}/);
  assert.ok(rule); assert.match(rule[0], /\.struct-dict-head\.is-pressed/); assert.match(rule[0], /\.notif-row\.is-pressed/); assert.match(rule[0], /\.mono-row\.is-pressed/);
  assert.match(rule[1], /background:var\(--color-surface-hover\)/);
  assert.equal((SRC.match(/function initPressFeedback/g) || []).length, 1);
});
