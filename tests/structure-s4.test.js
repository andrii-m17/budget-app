// Rev 2.32.51 (S4) — шторки додавання/редагування «Структури» (категорія, підкатегорія, слово).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
test('модифікатор .app-modal--sheet — лише для викликів «Структури»; Облік, картки, ОЧ, підтвердження не мають sheet', function(){
  const calls = SRC.match(/presentAppModal\(\{[^}]*\}\)/g) || [];
  const sheetCalls = calls.filter(function(x){ return /sheet: true/.test(x); });
  assert.deepEqual(sheetCalls.map(function(x){ return x.match(/sheetId: '([^']+)'/)[1]; }).sort(), ['sheet-category', 'sheet-dictionary', 'sheet-subcategory']);
  assert.ok(!/sheet-account[^}]*sheet: true/.test(SRC));
  assert.match(SRC, /mEl\.classList\.toggle\('app-modal--sheet', !!sheet\);/); // скидається для всіх інших викликів
  const css = SRC.match(/html:root \.app-modal\.app-modal--sheet\{[^}]*\}/)[0];
  assert.match(css, /display:grid/); assert.match(css, /grid-template-areas:"cancel title save" "body body body"/);
});
test('розкладка: «Скасувати» ліворуч, назва по центру, «Зберегти» праворуч акцентним; кнопки без заливки (специфічність через #app-modal)', function(){
  assert.match(SRC, /\.app-modal--sheet \.app-modal-actions\{ display:contents; \}/);
  assert.match(SRC, /html:root #app-modal\.app-modal--sheet #app-modal-cancel-btn\{ grid-area:cancel; justify-self:start;/);
  assert.match(SRC, /html:root #app-modal\.app-modal--sheet #app-modal-confirm-btn\{ grid-area:save; justify-self:end; color:var\(--color-primary-text, var\(--color-primary\)\); font-weight:700; \}/);
  assert.match(SRC, /\.app-modal--sheet \.app-modal-text\{ grid-area:title;/);
  assert.match(SRC, /html:root #app-modal\.app-modal--sheet \.app-modal-actions \.submit-btn\{ background:none;/);
});
test('поля: id без змін; тип категорії сегментами синхронізує прихований select; select 56px; поле 56px; мітка поля через data-label', function(){
  ['app-modal-input', 'app-modal-select', 'app-modal-select2', 'app-modal-amount-input'].forEach(function(id){ assert.equal((SRC.match(new RegExp('id="' + id + '"', 'g')) || []).length, 1, id); });
  assert.match(SRC, /const segOpts = \{ items: CATEGORY_TYPES, value: select\.value, onPick: function\(t\)\{ select\.value = t; \} \};/);
  assert.match(SRC, /select: false, sheetId: 'sheet-category', del: del, sheet: true, inputLabel: 'Назва', seg: segOpts/);
  assert.match(SRC, /html:root \.app-modal--sheet \.app-modal-select-wrap select\{ height:56px; min-height:56px;[^}]*line-height:1\.35;/);
  assert.match(SRC, /html:root \.app-modal--sheet \.app-modal-input-wrap input\{ height:56px;/);
  assert.match(SRC, /\.app-modal--sheet \.app-modal-input-wrap::before\{ content:attr\(data-label\);/);
  assert.match(SRC, /inputLabel: 'Слово' \}\)/);
});
test('видалення: червоний рядок «Видалити …» з підписом для категорії, підкатегорії й слова; у додаванні його немає; підтвердження з підрахунком — як було', function(){
  assert.match(SRC, /\.struct-delete-row\{[^}]*color:var\(--color-error\)/);
  ['Видалити категорію', 'Видалити підкатегорію', 'Видалити слово'].forEach(function(l){ assert.ok(SRC.indexOf("label: '" + l + "'") !== -1, l); });
  assert.match(SRC, /function setAppModalDelete\(del\)\{\n  const wrap = document\.getElementById\('app-modal-delete-wrap'\);\n  if\(!wrap\) return;\n  if\(!del\)\{ wrap\.style\.display = 'none'; return; \}/);
  assert.match(SRC, /closeAppModal\(\); del\.onDelete\(\);/);
});
test('перейменування: повідомлення-підтвердження у шторці — окремим рядком, не в заголовку; заголовки без двокрапки', function(){
  assert.match(SRC, /function setAppModalNotice\(text\)\{[\s\S]*?if\(sheet && n\)/);
  assert.equal((SRC.match(/setAppModalNotice\(renameConfirmText\(activeN\)\)/g) || []).length, 2);
  assert.equal((SRC.match(/title\.replace\(\/:\$\/, ''\)/g) || []).length, 3);
});
test('клавіатурна логіка не змінена: data-sheet-id, фокус через focusCardField, ті самі id; зміни лише CSS-розкладка й додаткові необов\'язкові елементи', function(){
  assert.match(SRC, /setTimeout\(\(\)=>\{ focusCardField\(input\); \}, 60\);/);
  assert.match(SRC, /modalEl\.setAttribute\('data-sheet-id', sheetId\)/);
  assert.ok(!/fldstr[34]/.test(SRC), 'нових полів вводу в S4 немає');
});
