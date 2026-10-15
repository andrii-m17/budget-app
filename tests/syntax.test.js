// Rev 2.32.80: охоронний тест — усі вбудовані <script> з index.html і dev/mock-cloud.js компілюються без синтаксичних помилок
// (рядкова заміна колись закоментувала хвіст рядка й «поклала» сторінку, а решта тестів вирізають лише окремі функції).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
test('index.html: кожен вбудований скрипт компілюється', function(){
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const re = /<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/g; let m, n = 0;
  while((m = re.exec(html))){
    if(/type="(?!text\/javascript|module)/.test(m[1])) continue; // json/інші типи
    n++;
    assert.doesNotThrow(function(){ new vm.Script(m[2], { filename: 'index.html#script' + n }); }, 'script #' + n);
  }
  assert.ok(n >= 1);
});
test('dev/mock-cloud.js і sw.js компілюються', function(){
  ['dev/mock-cloud.js', 'sw.js'].forEach(function(f){ assert.doesNotThrow(function(){ new vm.Script(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'), { filename: f }); }, f); });
});
