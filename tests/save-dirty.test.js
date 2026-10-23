// Rev 2.32.144 (SAVE-DIRTY): «Зберегти» неактивна без змін у формах редагування наявного запису.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildSandbox } = require('./extract');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
function fakeDoc(vals){
  return { getElementById: id => (id in vals ? (typeof vals[id] === 'boolean' ? { checked: vals[id] } : { value: vals[id] }) : null) };
}
function mk(vals){ return buildSandbox({ document: fakeDoc(vals || {}) }, ['SAVE_GATE_FIELDS', 'saveGateNorm', 'readSaveGateFields', 'saveFormChanged', 'setSaveGate']); }
function btn(){ const a = {}; const cls = new Set(); return { attrs: a, cls, classList: { add: c => cls.add(c) }, setAttribute: (k, v) => { a[k] = String(v); }, removeAttribute: k => { delete a[k]; } }; }

test('без змін — неактивна; одна зміна — активна; повернення до початкового — знову неактивна (дохід)', function(){
  const v = { 'ind-amount': '12 500' };
  const c = mk(v);
  const init = c.readSaveGateFields('income');
  assert.equal(c.saveFormChanged(init, c.readSaveGateFields('income'), false), false);
  v['ind-amount'] = '12 600'; assert.equal(c.saveFormChanged(init, c.readSaveGateFields('income'), false), true);
  v['ind-amount'] = '12500'; assert.equal(c.saveFormChanged(init, c.readSaveGateFields('income'), false), false, 'форматування пробілами — не зміна');
});
test('картка: кожне поле окремо дає зміну; назва з пробілами по краях — не зміна; галочка — зміна', function(){
  const base = { cddfielda1: 'Банк', 'cdd-limit': '50 000', 'cdd-payday': '15', 'cdd-balance': '1 000', 'cdd-minpay': '100', 'cdd-paid': false };
  ['cddfielda1', 'cdd-limit', 'cdd-payday', 'cdd-balance', 'cdd-minpay', 'cdd-paid'].forEach(function(k){
    const v = Object.assign({}, base); const c = mk(v); const init = c.readSaveGateFields('card');
    assert.equal(c.saveFormChanged(init, c.readSaveGateFields('card'), false), false, k + ' без змін');
    v[k] = typeof base[k] === 'boolean' ? true : base[k] + '1';
    assert.equal(c.saveFormChanged(init, c.readSaveGateFields('card'), false), true, k + ' змінено');
  });
  const v = Object.assign({}, base); const c = mk(v); const init = c.readSaveGateFields('card');
  v.cddfielda1 = '  Банк '; assert.equal(c.saveFormChanged(init, c.readSaveGateFields('card'), false), false);
});
test('ОЧ (Rev 2.32.171): назва, загальна сума, місяців, дата створення, платіж, залишок за банком', function(){
  const base = { iddfielda1: 'ОЧ', 'idd-initial': '10 000', 'idd-term': '10', 'idd-start': '2026-05-05', 'idd-balance': '8 000', 'idd-pay': '1 000' };
  Object.keys(base).forEach(function(k){
    const v = Object.assign({}, base); const c = mk(v); const init = c.readSaveGateFields('inst');
    v[k] = base[k] + '0'; assert.equal(c.saveFormChanged(init, c.readSaveGateFields('inst'), false), true, k);
    v[k] = base[k]; assert.equal(c.saveFormChanged(init, c.readSaveGateFields('inst'), false), false, k + ' повернення');
  });
});
test('відсутній запис за місяць (forceChange) — зміна навіть із «0» і без редагування; «0» проти порожнього — зміна', function(){
  const v = { 'idd-balance': '0', 'idd-pay': '0', iddfielda1: 'ОЧ', 'idd-initial': '1000', 'idd-start': '' };
  const c = mk(v); const init = c.readSaveGateFields('inst');
  assert.equal(c.saveFormChanged(init, c.readSaveGateFields('inst'), true), true);
  assert.equal(c.saveFormChanged(init, c.readSaveGateFields('inst'), false), false);
  const w = { 'cdd-balance': '' }; const d = mk(w); const i2 = d.readSaveGateFields('card'); w['cdd-balance'] = '0';
  assert.equal(d.saveFormChanged(i2, d.readSaveGateFields('card'), false), true);
});
test('setSaveGate: неактивна = aria-disabled + tabindex=-1; активна знімає обидва', function(){
  const c = mk(); const b = btn();
  c.setSaveGate(b, false); assert.equal(b.attrs['aria-disabled'], 'true'); assert.equal(b.attrs.tabindex, '-1'); assert.ok(b.cls.has('save-gated'));
  c.setSaveGate(b, true); assert.ok(!('aria-disabled' in b.attrs)); assert.ok(!('tabindex' in b.attrs));
});
test('розмітка і CSS: витрата за замовчуванням неактивна; 38%, без press-анімації; глобальний capture-гасник кліку (Enter/Space/програмний)', function(){
  assert.match(SRC, /<button type="button" class="rce-save save-gated" aria-disabled="true" tabindex="-1" onclick="saveRecordEdit\('\$\{safeId\(e\.id\)\}'\)">Зберегти<\/button>/);
  const css = SRC.match(/html:root \.save-gated\[aria-disabled="true"\]\{([^}]*)\}/)[1];
  assert.match(css, /opacity:\.38/); assert.match(css, /pointer-events:none/); assert.match(css, /transform:none/);
  const blk = SRC.match(/\(function initSaveGates\(\)\{[\s\S]*?\n\}\)\(\);/)[0];
  assert.match(blk, /\.save-gated\[aria-disabled="true"\]/); assert.match(blk, /stopImmediatePropagation/);
});
test('підключення: шторки дохід/картка/ОЧ і «Структура» (лише edit) фіксують початок; saveRecordEdit не змінено', function(){
  assert.match(SRC, /beginSaveGate\('income', false\)/); assert.match(SRC, /beginSaveGate\('card', !existing\)/); assert.match(SRC, /beginSaveGate\('inst', false\)/);
  assert.match(SRC, /if\(cfg\.edit\) setSaveGate\(save, false\)/);
  assert.match(SRC, /refreshSaveGates\(\); \/\/ Rev 2\.32\.144 \(SAVE-DIRTY\)/);
  const f = SRC.match(/async function saveRecordEdit\(id\)\{[\s\S]*?\n\}/)[0];
  assert.ok(!/save-gated|aria-disabled/.test(f));
});
test('«Скасувати» (витрата) закриває без підтвердження: cancelEditRecord не викликає діалог', function(){
  const f = SRC.match(/function cancelEditRecord\(\)\{[\s\S]*?\n\}/)[0];
  assert.ok(!/showEditCancelConfirm|requestCloseEdit/.test(f));
});
