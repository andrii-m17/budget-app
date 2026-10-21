// Rev 2.32.108 (INPUT-16): текстові поля й select у формах і шторках мають font-size ≥ 16 px (iOS масштабує сторінку при фокусі на менших) і висоту ≥ 44 pt.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const CSS = SRC.slice(SRC.indexOf('<style'), SRC.indexOf('</style>'));
const rule = sel => { const i = CSS.indexOf(sel + '{ '); assert.ok(i >= 0, 'правило ' + sel); return CSS.slice(i, CSS.indexOf('}', i)); };

test('поля Журналу, редагування запису й select діалогу: 16 px, висота ≥ 44', () => {
  assert.match(rule('.journal-search-input-wrap input'), /font-size:16px/); assert.match(rule('.journal-search-input-wrap input'), /height:44px/);
  assert.match(rule('.journal-search-category'), /font-size:16px/); assert.match(rule('.journal-search-category'), /height:44px/);
  assert.match(rule('.record-edit-panel select'), /font-size:16px/); assert.match(rule('.record-edit-panel select'), /height:44px/);
  assert.match(rule('.app-modal-select-wrap select'), /font-size:16px/);
  assert.match(rule('.add-bank-row input'), /font-size:16px/);
});
test('охоронний: правила input/select/textarea з font-size < 16 px лише з переліку винятків (вибір місяця в шапці/бічній колонці, стилі .sf-*/діагностики, настільні медіа-запити)', () => {
  const EXEMPT = ['.month-pill select', '.month-picker select', '.bank-debt-row input.bdr-amount', '#view-vytraty .field input, #view-vytraty .field select'];
  const found = [];
  const css = CSS.replace(/\/\*[\s\S]*?\*\//g, '');
  const re = /([^{}]+)\{([^{}]*)\}/g; let m;
  const isField = part => /(?:^|[\s>+~])(?:input|select|textarea)(?:[.:#\[][^\s]*)*$/.test(part.trim());
  while((m = re.exec(css))){
    const sel = m[1].trim(); const f = m[2].match(/(?:^|[;\s])font-size:\s*([\d.]+)px/);
    if(f && parseFloat(f[1]) < 16 && sel.split(',').some(isField)) found.push(sel);
  }
  const bad = found.filter(sel => !EXEMPT.some(e => sel === e || sel.endsWith(e)));
  assert.deepEqual(bad, [], 'нові поля з шрифтом < 16 px: підніміть до 16 px або додайте виняток з причиною');
});
test('user-scalable=no лишається (рішення: масштабування не змінюємо)', () => {
  assert.match(SRC, /<meta name="viewport" content="[^"]*maximum-scale=1, user-scalable=no[^"]*">/);
});
