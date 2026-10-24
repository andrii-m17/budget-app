// Rev 2.32.180 (TOAST-GAPS) — симетричні відступи поп-апа: 18 px від краю пілюлі до іконки й до кінця найдовшого рядка / кнопки, проміжок 12 px.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildSandbox } = require('./extract');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const c = buildSandbox({}, ['toastFitWidth']);
const rule = (sel) => { const i = SRC.indexOf('\n  ' + sel + '{'); assert.ok(i >= 0, sel); return SRC.slice(i, SRC.indexOf('}', i) + 1); };

test('toastFitWidth: ширина блоку = найдовший рядок; блок без слабини не змінюється; порожні виміри — повна ширина', function(){
  assert.equal(c.toastFitWidth(100, 300, [180, 250, 220]), 150);
  assert.equal(c.toastFitWidth(100, 300, [300]), 200);
  assert.equal(c.toastFitWidth(100, 300, [350]), 200, 'не більше блоку');
  assert.equal(c.toastFitWidth(100, 300, []), 200);
  assert.equal(c.toastFitWidth(100, 100, [150]), 0);
});
test('CSS: пілюля fit-content, відступи 17 px + рамка 1 px = 18, проміжок 12 px, без min-width і зайвих резервів', function(){
  const r = rule('.success-toast');
  assert.match(r, /width:fit-content/); assert.match(r, /gap:12px/); assert.match(r, /padding:11px 17px/); assert.match(r, /border:1px solid/);
  assert.ok(!/min-width|margin/.test(r));
  assert.ok(!/margin|padding/.test(rule('.success-toast-text')));
});
test('іконка 22×22 без внутрішніх полів: viewBox "4 4 22 22" у всіх видів, жодного "0 0 30 30"', function(){
  assert.match(rule('.success-toast-icon'), /width:22px; height:22px; flex:none/);
  const i = SRC.indexOf('const TOAST_ICONS'), blk = SRC.slice(i, SRC.indexOf('};', i));
  assert.equal((blk.match(/viewBox="4 4 22 22"/g) || []).length, 5);
  assert.ok(!/viewBox="0 0 30 30"/.test(blk));
});
test('підгонка тексту викликається після додавання поп-апа в DOM; кнопка без додаткових відступів, проміжок із текстом 12 px (gap)', function(){
  assert.match(SRC, /host\.appendChild\(el\);\s*\n\s*toastFitText\(el\);/);
  assert.ok(!/margin/.test(rule('.success-toast-action')));
});
test('Rev 2.32.181: коло галочки обертається навколо власного центру (transform-box: fill-box), інакше зі зсунутим viewBox воно «зривається» вгору й обрізається', function(){
  const r = rule('.success-toast-icon circle');
  assert.match(r, /transform:rotate\(-90deg\); transform-box:fill-box; transform-origin:center;/);
  assert.ok(!/transform-origin:50% 50%/.test(r));
});
test('Rev 2.32.182: плашка «Доступне оновлення» — відступ 17 px + рамка 1 px = 18 px з обох боків, проміжок 12 px', function(){
  const r = rule('.update-banner');
  assert.match(r, /gap:12px/); assert.match(r, /padding:9px 17px;/); assert.match(r, /border:1px solid/);
  assert.ok(!/padding:9px 10px/.test(r));
});
