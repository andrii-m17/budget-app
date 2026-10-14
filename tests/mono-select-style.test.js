// Rev 2.32.34 (S) — поля вибору шторки «Вхідних»: мінімальна висота й line-height, нативний select, без нових полів вводу.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
test('S: .mono-sel має висоту ≥ 56px, line-height ≥ 1.3, ellipsis, border-box', function(){
  const m = SRC.match(/select\.mono-sel\{([^}]*)\}/);
  assert.ok(m, 'правило .mono-sel');
  const css = m[1];
  assert.ok(Number(css.match(/min-height:(\d+)px/)[1]) >= 56);
  assert.ok(Number(css.match(/line-height:([\d.]+)/)[1]) >= 1.3);
  assert.match(css, /text-overflow:ellipsis/); assert.match(css, /white-space:nowrap/); assert.match(css, /box-sizing:border-box/);
});
test('S: обидва поля лишились нативними <select> з класом mono-sel; нових полів немає', function(){
  assert.match(SRC, /<select id="fldmono2" class="mono-sel"/);
  assert.match(SRC, /<select id="fldmono3" class="mono-sel"/);
  assert.ok(!/id="fldmono5"/.test(SRC));
});
