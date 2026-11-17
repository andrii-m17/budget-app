// DS-2: охоронний тест «сирі значення й старі назви в css/app.css не зростають». Кожна ревізія DS-2 (a→d) зменшує числа нижче; збільшувати їх не можна.
// Лічильники (без коментарів): hex і rgba( поза tokens.css; px у border-radius; посилання var(--color-…), var(--ui-…), var(--radius-…).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const APP = fs.readFileSync(path.join(__dirname, '..', 'css', 'app.css'), 'utf8');
const TOK = fs.readFileSync(path.join(__dirname, '..', 'css', 'tokens.css'), 'utf8');
const strip = (s) => s.replace(/\/\*[^]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
function counts(src){
  const nc = strip(src);
  let radiusPx = 0; (nc.match(/border(?:-(?:top|bottom)-(?:left|right))?-radius\s*:[^;}]*/g) || []).forEach((d) => { radiusPx += (d.match(/(?<![\w.#-])\d*\.?\d+px/g) || []).length; });
  const refs = (re) => (nc.match(re) || []).length;
  return { hex: refs(/#[0-9a-fA-F]{3,8}\b/g), rgba: refs(/rgba?\(/g), radiusPx, refColor: refs(/var\(\s*--color-/g), refUi: refs(/var\(\s*--ui-/g), refRadius: refs(/var\(\s*--radius-/g) };
}
// Базові числа: стан після останньої ревізії DS-2 (Rev 2.32.336, DS-2b)
const BASE = { hex: 31, rgba: 35, radiusPx: 61, refColor: 568, refUi: 97, refRadius: 57 };
test('DS-2: сирі hex/rgba(, px у border-radius і посилання на старі назви не зростають', function(){
  const c = counts(APP);
  Object.keys(BASE).forEach(function(k){ assert.ok(c[k] <= BASE[k], k + ': ' + c[k] + ' > ' + BASE[k] + ' (число можна лише зменшувати; нові значення — через токени з css/tokens.css)'); });
});
