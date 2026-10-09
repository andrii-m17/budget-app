// Rev 2.32.23 (N, A2-13 / A2-11) — єдиний нормалізатор сум.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildSandbox } = require('./extract');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const events = [];
const c = buildSandbox({ noteAmountRejected: function(r){ events.push(r); } }, ['AMOUNT_MAX', 'AMOUNT_ERRORS', 'normalizeAmount', 'fromMinorUnits', 'parseAmount', 'isSyncableAmount']);
const NBSP = ' ';
// [ввід, очікуване значення | null, причина]
const TABLE = [
  ['99.99', 100], ['99,99', 100], ['1 250,50', 1251], ['1,250.50', 1251], ['1.250,50', 1251], ['1250', 1250],
  ['0,4', null, 'too-small'], ['0,5', 1], ['0.49', null, 'too-small'], ['0', null, 'zero'], ['00', null, 'zero'],
  ['-5', null, 'negative'], ['−5', null, 'negative'], ['1e3', null, 'non-numeric'], ['1E3', null, 'non-numeric'],
  ['2147483647', 2147483647], ['2147483648', null, 'too-big'], ['99999999999999999999', null, 'too-big'], ['2,5e21', null, 'non-numeric'],
  ['1' + NBSP + '250', 1250], ['1 250', 1250], ['1250 ₴', 1250], ['₴ 1250', 1250], ['1 250 грн', 1250], ['1250 грн.', 1250],
  ['', null, 'non-numeric'], ['   ', null, 'non-numeric'], ['abc', null, 'non-numeric'], ['🛒', null, 'non-numeric'], ['12abc', null, 'non-numeric'],
  ['  42  ', 42], ['1,250,000', 1250000], ['1.250.000', 1250000], ['1..5', null, 'non-numeric'], [',', null, 'non-numeric'], ['+7', 7],
  ['007', 7], ['12,4', 12], ['12,5', 13],
];
TABLE.forEach(function(row){
  test('N1: normalizeAmount(' + JSON.stringify(row[0]) + ') → ' + (row[1] == null ? row[2] : row[1]), function(){
    const r = c.normalizeAmount(row[0]);
    if(row[1] != null){ assert.equal(r.ok, true); assert.equal(r.value, row[1]); }
    else{ assert.equal(r.ok, false); assert.equal(r.reason, row[2]); assert.ok(r.error); }
  });
});
test('N1: числа (клітинки Excel): half up, межі, від\'ємні', function(){
  assert.equal(c.normalizeAmount(1250.5).value, 1251);
  assert.equal(c.normalizeAmount(99.99).value, 100);
  assert.equal(c.normalizeAmount(0.4).reason, 'too-small');
  assert.equal(c.normalizeAmount(-1).reason, 'negative');
  assert.equal(c.normalizeAmount(2.5e21).reason, 'too-big');
  assert.equal(c.normalizeAmount(NaN).reason, 'non-numeric');
  assert.equal(c.normalizeAmount(Infinity).reason, 'non-numeric');
});
test('N1: allowZero — нуль і <0,5 дають 0 (поля боргу/ліміту)', function(){
  assert.equal(c.normalizeAmount('0', { allowZero: true }).value, 0);
  assert.equal(c.normalizeAmount('0,3', { allowZero: true }).value, 0);
  assert.equal(c.normalizeAmount('-1', { allowZero: true }).ok, false);
});
test('N1: fromMinorUnits — копійки → цілі гривні half up; < 1 ₴ → null', function(){
  assert.equal(c.fromMinorUnits(12345), 123);
  assert.equal(c.fromMinorUnits(12350), 124);
  assert.equal(c.fromMinorUnits(50), 1);
  assert.equal(c.fromMinorUnits(49), null);
  assert.equal(c.fromMinorUnits(0), null);
  assert.equal(c.fromMinorUnits(-100), null);
  assert.equal(c.fromMinorUnits(214748364800), null);
});
test('N2: parseAmount — вставлене 99.99 дає 100, а не 9999; відмови йдуть у рекордер', function(){
  assert.equal(c.parseAmount('99.99'), 100);
  events.length = 0;
  assert.ok(isNaN(c.parseAmount('-5'))); assert.ok(isNaN(c.parseAmount('1e3')));
  assert.ok(isNaN(c.parseAmount('')));
  assert.deepEqual(events, ['negative', 'non-numeric']);
});
test('N3: isSyncableAmount — запис поза межами Cloud не відправляється', function(){
  assert.equal(c.isSyncableAmount(10), true);
  assert.equal(c.isSyncableAmount(-1), false);
  assert.equal(c.isSyncableAmount(2147483648), false);
  assert.equal(c.isSyncableAmount(2.5e21), false);
  assert.equal(c.isSyncableAmount(1.5), false);
});
test('N охорона: жодне поле суми не має власного фільтра/парсера — лише normalizeAmount/parseAmount', function(){
  // власний parseFloat допустимий тільки в Excel-стовпцях боргів/ОЧ (дозволені від'ємні залишки) і data-атрибутах очікуваних значень
  const hits = SRC.split('\n').filter(function(l){ return /Math\.round\(parseFloat\(/.test(l) && !/^\s*\/\//.test(l); });
  assert.equal(hits.length, 4, hits.join('\n'));
  assert.ok(/const r = normalizeAmount\(str, \{ allowZero: true \}\)/.test(SRC));
  assert.ok(/const amount = readPositiveAmount\(document\.getElementById\('f-amount'\)\)/.test(SRC));
  assert.ok(/const amount = readPositiveAmount\(amountInput\)/.test(SRC));
  assert.ok(!/replace\(\/\[\^\\d\\s\\u00A0\]\/g, ''\)/.test(SRC), 'старий фільтр, що склеював «99.99» у 9999');
  assert.match(SRC, /addEventListener\('paste'/);
});
test('N4: рекордер — подія amount-rejected без значень', function(){
  assert.match(SRC, /type: 'amount-rejected', reason: reason/);
});
