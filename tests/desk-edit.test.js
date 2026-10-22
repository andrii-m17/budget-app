// Rev 2.32.142 (DESK-EDIT): редагування витрати кліком/Enter/Space для миші, без подвійного відкриття на дотику.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildSandbox } = require('./extract');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
function mk(mouse){ return buildSandbox({ escapeAttr: esc, window: { matchMedia: () => ({ matches: mouse }) } }, ['ROW_EDIT_TOUCH_GUARD_MS', 'isMouseDevice', 'rowEditAttrs', 'shouldOpenRowEdit']); }
const base = { kind: 'expense', mouse: true, sinceTouchMs: 99999, interactiveTarget: false, hasSelection: false, swipeOpen: false, alreadyEditing: false, viaKeyboard: false };
test('клік мишею відкриває редагування витрати', function(){
  assert.equal(mk(true).shouldOpenRowEdit(base), true);
});
test('Enter/Space (з клавіатури): відкриває, навіть із виділенням і недавнім дотиком; не з вкладеної кнопки', function(){
  const c = mk(true);
  assert.equal(c.shouldOpenRowEdit(Object.assign({}, base, { viaKeyboard: true, hasSelection: true, sinceTouchMs: 10 })), true);
  assert.equal(c.shouldOpenRowEdit(Object.assign({}, base, { viaKeyboard: true, interactiveTarget: true })), false);
});
test('дотик: синтетичний click після touchstart (<800 мс) не відкриває вдруге; пристрій без миші — ніколи', function(){
  const c = mk(true);
  assert.equal(c.shouldOpenRowEdit(Object.assign({}, base, { sinceTouchMs: 120 })), false);
  assert.equal(c.shouldOpenRowEdit(Object.assign({}, base, { mouse: false })), false);
  assert.equal(mk(false).isMouseDevice(), false);
});
test('не відкриває: кнопка/поле всередині, вже редагується (бо toggle закрив би), відкритий свайп, виділення тексту, дохід', function(){
  const c = mk(true);
  ['interactiveTarget', 'alreadyEditing', 'swipeOpen', 'hasSelection'].forEach(function(k){
    const o = Object.assign({}, base); o[k] = true; assert.equal(c.shouldOpenRowEdit(o), false, k);
  });
  assert.equal(c.shouldOpenRowEdit(Object.assign({}, base, { kind: 'income' })), false);
});
test('розмітка: tabindex/role/aria-label лише для витрат на пристрої з мишею; назва екранується', function(){
  assert.equal(mk(false).rowEditAttrs({ kind: 'expense', name: 'x' }), '');
  assert.equal(mk(true).rowEditAttrs({ kind: 'income', name: 'x' }), '');
  const a = mk(true).rowEditAttrs({ kind: 'expense', name: '<b>' });
  assert.match(a, /tabindex="0"/); assert.match(a, /role="button"/); assert.match(a, /data-rec-kind="expense"/); assert.ok(!/<b>/.test(a));
  assert.match(SRC, /data-rec-id="\$\{safeId\(e\.id\)\}"\$\{authorStyle\}\$\{rowEditAttrs\(e\)\}/);
});
test('слухачі: click і keydown (Enter/Space) делеговані, touchstart фіксує дотик; свайпова логіка не змінена', function(){
  const blk = SRC.match(/\(function initRowEditPointer\(\)\{[\s\S]*?\n\}\)\(\);/)[0];
  assert.match(blk, /addEventListener\('touchstart'/); assert.match(blk, /addEventListener\('click'/); assert.match(blk, /addEventListener\('keydown'/);
  assert.match(blk, /e\.key !== 'Enter' && e\.key !== ' '/);
  assert.match(SRC, /document\.addEventListener\('touchstart', onTouchStart, \{passive:true\}\);/);
});
