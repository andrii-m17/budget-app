// Rev 2.31.2 (A) — автокатегорія при редагуванні запису Журналу (спільний autocategorize, без змін правил збігу).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ex = require('./extract');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const ctx = ex.buildSandbox({}, ['shouldAutoFillOnEdit']);
const j = code => JSON.parse(ex.evalInSandbox(ctx, 'JSON.stringify(' + code + ')'));
const EDIT = SRC.slice(SRC.indexOf('// ===== Rev 2.31.2 (A)'), SRC.indexOf('// Rev 2.1.16 — раніше тут можна було змінити'));

test('shouldAutoFillOnEdit: збіг + відмінні cat/sub + не чіпав користувач → apply; no-match / user-changed / same → skip з причиною', () => {
  const F = o => j('shouldAutoFillOnEdit(' + JSON.stringify(o) + ')');
  const m = { cat: '🚗 Транспорт', sub: 'Таксі' };
  assert.deepEqual(F({ matched: m, currentCat: '🛒 Продукти', currentSub: '', touchedByUser: false }), { apply: true, skipped: null });
  assert.deepEqual(F({ matched: m, currentCat: '🚗 Транспорт', currentSub: '', touchedByUser: false }), { apply: true, skipped: null }, 'категорія та сама, підкатегорія інша → підставити');
  assert.deepEqual(F({ matched: m, currentCat: '🚗 Транспорт', currentSub: 'Таксі', touchedByUser: false }), { apply: false, skipped: 'same' });
  assert.deepEqual(F({ matched: m, currentCat: '🛒 Продукти', currentSub: '', touchedByUser: true }), { apply: false, skipped: 'user-changed' });
  assert.deepEqual(F({ matched: null, currentCat: '🛒 Продукти', currentSub: 'x', touchedByUser: false }), { apply: false, skipped: 'no-match' });
  assert.deepEqual(F({ matched: null, touchedByUser: true }), { apply: false, skipped: 'no-match' }, 'відсутність збігу має пріоритет');
  assert.deepEqual(F({ matched: { cat: 'A', sub: '' }, currentCat: 'A', currentSub: '', touchedByUser: false }), { apply: false, skipped: 'same' }, 'порожня підкатегорія = порожня');
  assert.deepEqual(F(null), { apply: false, skipped: 'no-match' });
});

test('автовизначення лише на ВВЕДЕННЯ в полі назви: oninput на edtfielda1-<id>; при відкритті/рендері панелі категорія не змінюється', () => {
  assert.match(SRC, /id="edtfielda1-\$\{e\.id\}" value="\$\{escapeAttr\(e\.name\)\}" oninput="onRecordNameInput\('\$\{e\.id\}'\)"/);
  const render = SRC.slice(SRC.indexOf('const editPanelHtml = isEditing'), SRC.indexOf('// Rev #30 (6D.123) — свайп-дії'));
  assert.ok(!/onRecordNameInput\(|autocategorize\(/.test(render.replace(/oninput="onRecordNameInput\('\$\{e\.id\}'\)"/, '')), 'рендер панелі не викликає автовизначення');
  const start = SRC.slice(SRC.indexOf('function startEditRecord'), SRC.indexOf('function cancelEditRecord'));
  assert.ok(!/autocategorize|onRecordNameInput/.test(start), 'відкриття редагування не чіпає категорію');
});

test('те саме autocategorize, що й у новій витраті; правила збігу й форма нової витрати без змін', () => {
  assert.match(EDIT, /autocategorize\(nameInput\.value\)/);
  const form = SRC.slice(SRC.indexOf('function onNameInput(){'), SRC.indexOf('// Rev 2.2.2 — Автозв\'язок витрата↔ОЧ'));
  assert.match(form, /const match = name\.trim\(\) \? autocategorize\(name\) : null;/);
  assert.match(form, /if\(!catSel\.classList\.contains\('manual-flag'\)\)\{ setCategorySelect\(match\.cat, false\); \}/);
  const ac = SRC.slice(SRC.indexOf('function autocategorize(name){'), SRC.indexOf('// Rev 2.1.5 — BugFix: якщо текст спершу збігався'));
  assert.match(ac, /if\(entry\.deletedAt\) continue;/, 'tombstone-слова не підказують');
  assert.match(ac, /if\(getCategoryType\(entry\.cat\) === null\) continue;/);
  assert.ok(!/onRecordNameInput|recordEditSession/.test(form), 'форма нової витрати не знає про редагування');
});

test('ручна зміна категорії/підкатегорії в сесії редагування блокує перезапис; нова сесія скидає прапорець', () => {
  assert.match(SRC, /subSel\.innerHTML = subcategoryOptionsHtml\(catSel\.value, ''\);\n  markRecordEditTouched\(id\);/);
  assert.match(SRC, /onchange="onRecordSubcategoryChange\('\$\{e\.id\}'\)"/);
  assert.match(EDIT, /function onRecordSubcategoryChange\(id\)\{ markRecordEditTouched\(id\); \}/);
  assert.match(EDIT, /touchedByUser: recordEditSession\.touched/);
  assert.match(SRC, /editingRecordKey = closing \? null : key;\n  recordEditSession = \{ id: null, touched: false \};/); // Rev 2.32.2 (E1): beginEditRecord
  assert.match(SRC, /function cancelEditRecord\(\)\{\n  editingRecordKey = null;\n  editSnapshot = null;\n  recordEditSession = \{ id: null, touched: false \};/);
});

test('відсутність збігу нічого не стирає (лише ховає підказку); apply виставляє тільки категорію й підкатегорію', () => {
  const h = EDIT.slice(EDIT.indexOf('function onRecordNameInput'), EDIT.indexOf('function focusRecordCategory'));
  const noMatch = h.slice(h.indexOf('}else if(!match && hint){'), h.indexOf('if(debugRecordingActive)'));
  assert.ok(!/catSel\.value|subSel\.|innerHTML|nameInput\.value =/.test(noMatch), 'no-match не чіпає поля');
  assert.match(h, /if\(decision\.apply\)\{\s*catSel\.value = match\.cat;\s*subSel\.innerHTML = subcategoryOptionsHtml\(match\.cat, match\.sub\);/);
  assert.ok(!/amountInput|dateInput|nameInput\.value\s*=|saveRecordEdit|expenses\./.test(h), 'нічого, крім категорії/підкатегорії/підказки');
});

test('підказка «Знайдено автоматично» + «Змінити»; id без підрядка name; подія autocat-edit (matched, applied, skipped) без назв і сум', () => {
  assert.match(SRC, /<div class="field auto-hint" id="edthinta1-\$\{e\.id\}"><span id="edthintb1-\$\{e\.id\}"><\/span><button type="button" class="auto-hint-edit-btn" onclick="focusRecordCategory\('\$\{e\.id\}'\)">Змінити<\/button><\/div>/);
  assert.match(EDIT, /type: 'autocat-edit', matched: !!match, applied: decision\.apply, skipped: decision\.skipped/);
  ['matched', 'applied'].forEach(f => assert.match(SRC, new RegExp("DEBUG_EVENT_ALLOWLIST = \\[[\\s\\S]*'" + f + "'")));
  assert.ok(!/edthinta1.*name|edthintb1.*name/.test('edthinta1 edthintb1'));
});
