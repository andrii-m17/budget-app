// Rev 2.32.10 (C) — картки введення «Структури» (#app-modal з полями) підключені до спільної клавіатурної логіки шторок.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ex = require('./extract');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
test('хост клавіатурної логіки: .drawer і .app-modal через одну функцію kbSheetHostOf; isFieldInsideDrawer і вибір drawerEl користуються нею', () => {
  assert.match(SRC, /el\.closest\('\.drawer, \.app-modal'\)/);
  assert.match(SRC, /function isFieldInsideDrawer\(el\)\{\s*return !!kbSheetHostOf\(el\);/);
  assert.match(SRC, /const drawerEl = isFieldInsideDrawer\(target\) \? kbSheetHostOf\(target\) : null;/);
  assert.match(SRC, /const drawerEl = kbSheetHostOf\(target\);/);
  const c = ex.buildSandbox({}, ['kbSheetHostOf', 'kbSheetLabel']);
  const fake = { id: 'app-modal', getAttribute: k => k === 'data-sheet-id' ? 'sheet-category' : null };
  assert.equal(c.kbSheetLabel(fake), 'sheet-category');
  assert.equal(c.kbSheetLabel({ id: 'income-drawer', getAttribute: () => null }), 'income-drawer');
  assert.equal(c.kbSheetLabel({ id: 'x' }), 'x');
  assert.equal(c.kbSheetLabel(null), null);
});
test('картки з полями зареєстровані з sheetId; модалки без полів (підтвердження, вибір місяця, діагностика) — ні', () => {
  const m = SRC.match(/presentAppModal\(\{[^}]*\}\)/g) || [];
  const withIds = m.filter(x => /sheetId:/.test(x));
  assert.deepEqual(withIds.map(x => x.match(/sheetId: '([^']+)'/)[1]).sort(), ['sheet-account', 'sheet-category', 'sheet-dictionary', 'sheet-subcategory']);
  assert.ok(m.every(x => !/input: true/.test(x) || /sheetId:/.test(x)), 'кожна картка з input має sheetId');
  assert.ok(!/presentAppModal\(\);[\s\S]{0,0}sheetId/.test(SRC));
  assert.match(SRC, /function showConfirmModal[\s\S]*?presentAppModal\(\);/);
  assert.match(SRC, /modalEl\.removeAttribute\('data-sheet-id'\)/);
});
test('CSS: підйом #app-modal — transform центрування мінус --sheet-lift, ті самі переходи, що в шторок; без клавіатури вигляд не змінюється (правила лише під html.kb-sheet)', () => {
  assert.match(SRC, /html\.kb-sheet \.app-modal\.open\{[^}]*translate3d\(-50%, calc\(-50% - 1px \* var\(--sheet-lift, 0\)\), 0\) scale\(1\)/);
  assert.match(SRC, /html\.kb-sheet\.kb-sheet-closing \.app-modal\.open\{ transition:transform 250ms/);
  assert.match(SRC, /html\.kb-sheet\.kb-sheet-switching \.app-modal\.open\{ transition:transform 220ms/);
  assert.match(SRC, /html\.kb-sheet-moving #app-modal input/);
  assert.match(SRC, /\.app-modal\.open\{ opacity:1; pointer-events:auto; transform:translate\(-50%,-50%\) scale\(1\); \}/);
});
test('поля карток: чисті id (правило проєкту), нових полів немає; рекордер ті самі події (sheet-open/focus-proxy/…), id картки через data-sheet-id', () => {
  ['app-modal-input', 'app-modal-amount-input'].forEach(id => assert.ok(!/name|phone|tel|mail|addr|user|login|first|last|fio|contact/i.test(id.replace('app-modal-', 'fld-')), id));
  assert.match(SRC, /captureDebugGeometry\('sheet-open', \{ drawerId: kbSheetLabel\(drawerEl\) \}\)/);
  assert.match(SRC, /captureDebugGeometry\('focus-proxy', \{ drawerId: kbSheetLabel\(drawerEl\)/);
});
test('десктоп: логіка не застосовується (режим never із B) і мобільний enterKbSheet без гілок за kbMode', () => {
  assert.match(SRC, /if\(kbMode\(\)\.mode !== 'always'\) return; \/\/ Rev 2\.32\.9 \(B\)/);
  const i = SRC.indexOf('function enterKbSheet'), j = SRC.indexOf('function exitKbSheet');
  assert.ok(!/kbMode\(/.test(SRC.slice(i, j)));
});
