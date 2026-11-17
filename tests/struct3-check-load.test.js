// STRUCT-3a (Rev 2.32.346): захисна перевірка порядку завантаження й цілісності підключення (scripts/struct3-check-load.js). Реальний репозиторій — без порушень; кожну з чотирьох умов навмисно ламаємо на синтетичних даних і перевіряємо, що вона падає.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { checkFiles, checkRepo } = require('../scripts/struct3-check-load.js');
const GOOD = function(){ return {
  index: '<head><link rel="stylesheet" href="./css/a.css?v=1"></head><script src="./js/a.js?v=1"></script>\n<script src="./js/b.js?v=1"></script>\n<script>\nconst APP_VERSION = \'1\';\nfunction main(){ return f() + A; }\nmain();\n</script>',
  sw: "const APP_SHELL = [\n  './', './css/a.css', './js/a.js', './js/b.js'\n];",
  js: { 'a.js': "const A = 1;\nfunction f(){ return A; }\n(window.__MT_FILES = window.__MT_FILES || []).push('a.js');\n", 'b.js': "const B = f() + A;\nfunction g(){ return B; }\n(window.__MT_FILES = window.__MT_FILES || []).push('b.js');\n" } }; };
test('реальний репозиторій: порядок завантаження, унікальність імен, APP_SHELL і мітки ?v= — без порушень', function(){
  assert.deepEqual(checkRepo(), []);
});
test('еталонний синтетичний набір без порушень', function(){ assert.deepEqual(checkFiles(GOOD()), []); });
test('умова 1: ініціалізатор у файлі звертається до імені з файлу, підключеного пізніше', function(){
  const f = GOOD(); f.js['a.js'] = "const A = g();\n(window.__MT_FILES = window.__MT_FILES || []).push('a.js');\n"; // g оголошена в b.js (пізніше)
  const r = checkFiles(f); assert.ok(r.some(x => /^1\)/.test(x) && /«g»/.test(x)), r.join('\n'));
  const f2 = GOOD(); f2.js['a.js'] = "const A = main();\nfunction f(){}\n(window.__MT_FILES = window.__MT_FILES || []).push('a.js');\n"; // main — з основного inline-скрипта
  assert.ok(checkFiles(f2).some(x => /^1\)/.test(x) && /«main»/.test(x)));
  const f3 = GOOD(); f3.js['b.js'] = "const B = C + 1;\nconst C = 2;\nfunction g(){}\n(window.__MT_FILES = window.__MT_FILES || []).push('b.js');\n"; // const нижче за себе в тому ж файлі
  assert.ok(checkFiles(f3).some(x => /^1\)/.test(x) && /нижче за себе/.test(x)));
});
test('умова 2: глобальне ім\'я оголошене двічі (у двох файлах, у файлі й inline)', function(){
  const f = GOOD(); f.js['b.js'] = f.js['b.js'].replace("function g(){ return B; }", "function g(){ return B; }\nfunction f(){ return 2; }");
  assert.ok(checkFiles(f).some(x => /^2\)/.test(x) && /«f»/.test(x)));
  const f2 = GOOD(); f2.index = f2.index.replace('function main(){', 'const A = 5;\nfunction main(){');
  assert.ok(checkFiles(f2).some(x => /^2\)/.test(x) && /«A»/.test(x)));
});
test('умова 3: js/*.js (і css), підключений в index.html, відсутній в APP_SHELL', function(){
  const f = GOOD(); f.sw = f.sw.replace(", './js/b.js'", '');
  assert.ok(checkFiles(f).some(x => /^3\)/.test(x) && /js\/b\.js/.test(x)));
  const f2 = GOOD(); f2.sw = f2.sw.replace(", './css/a.css'", '');
  assert.ok(checkFiles(f2).some(x => /^3\)/.test(x) && /css\/a\.css/.test(x)));
});
test('умова 4: мітка ?v= не дорівнює APP_VERSION (скрипт, стиль, відсутня мітка)', function(){
  const f = GOOD(); f.index = f.index.replace('./js/b.js?v=1', './js/b.js?v=2');
  assert.ok(checkFiles(f).some(x => /^4\)/.test(x) && /js\/b\.js/.test(x)));
  const f2 = GOOD(); f2.index = f2.index.replace('./css/a.css?v=1', './css/a.css?v=0');
  assert.ok(checkFiles(f2).some(x => /^4\)/.test(x) && /css\/a\.css/.test(x)));
  const f3 = GOOD(); f3.index = f3.index.replace('./js/a.js?v=1', './js/a.js');
  assert.ok(checkFiles(f3).some(x => /^4\)/.test(x) && /немає/.test(x)));
});
test('ключ об\'єкта й тіло відкладеної функції не вважаються зверненнями під час завантаження', function(){
  const f = GOOD(); f.js['a.js'] = "const A = { main: 1, g: function(){ return main(); } };\nfunction f(){}\n(window.__MT_FILES = window.__MT_FILES || []).push('a.js');\n"; // main як ключ і всередині відкладеної функції
  assert.deepEqual(checkFiles(f), []);
});
test('умова 5: останній рядок js/X.js має бути позначкою завантаження', function(){
  const f = GOOD(); // еталонні файли вже мають позначки
  assert.deepEqual(checkFiles(f).filter(function(x){ return /^5\)/.test(x); }), []);
  const g = JSON.parse(JSON.stringify(f)); g.js['b.js'] = g.js['b.js'].replace("push('b.js')", "push('a.js')"); // чужа назва
  assert.ok(checkFiles(g).some(function(x){ return /^5\)/.test(x) && /js\/b\.js/.test(x); }));
  const h = JSON.parse(JSON.stringify(f)); h.js['a.js'] += "const Z = 1;\n"; // після позначки є код
  assert.ok(checkFiles(h).some(function(x){ return /^5\)/.test(x) && /js\/a\.js/.test(x); }));
  const k = JSON.parse(JSON.stringify(f)); k.js['a.js'] = k.js['a.js'].replace(/\(window[^\n]*\n/, ''); // позначки немає
  assert.ok(checkFiles(k).some(function(x){ return /^5\)/.test(x) && /js\/a\.js/.test(x); }));
});
