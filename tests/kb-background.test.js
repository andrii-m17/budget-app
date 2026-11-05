// KB-5a (Rev 2.32.258): згортання застосунку скидає фокус поля й клавіатурний конвеєр (текстова охорона; поведінку перевіряє npm run e2e:ios:bg).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
test('KB-5a: visibilitychange:hidden і pagehide викликають kbResetOnBackground', function(){
  assert.match(SRC, /document\.addEventListener\('visibilitychange', function\(\)\{ if\(document\.visibilityState === 'hidden'\) kbResetOnBackground\('hidden'\); \}\);/);
  assert.match(SRC, /window\.addEventListener\('pagehide', function\(\)\{ kbResetOnBackground\('pagehide'\); \}\);/);
});
test('KB-5a: скидання знімає фокус і закриває конвеєр тим самим шляхом, що звичайний focusout', function(){
  const i = SRC.indexOf('function kbResetOnBackground');
  const body = SRC.slice(i, SRC.indexOf('document.addEventListener(\'visibilitychange\', function(){ if(document.visibilityState === \'hidden\')', i));
  assert.match(body, /a\.blur\(\)/);
  assert.match(body, /handleKeyboardFieldFocusSettle\(\)/);
  assert.match(body, /clearTimeout\(kbCloseConfirmTimer\)/);
});
test('KB-5a: функція живе всередині initApp поруч із handleKeyboardFieldFocusSettle (та сама область видимості)', function(){
  const init = SRC.indexOf('(async function initApp(){');
  assert.ok(init !== -1 && SRC.indexOf('function kbResetOnBackground') > init);
  assert.ok(SRC.indexOf('function handleKeyboardFieldFocusSettle') > init);
});
