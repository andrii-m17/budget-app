// Rev 2.32.2 (E1) — єдина дія редагування: чисті функції менеджера та охоронні тести підключення.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ex = require('./extract');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const ctx = ex.buildSandbox({}, ['EDIT_CLOSE_TRIGGERS', 'shouldCloseEdit', 'editFieldsChanged']);
const j = code => JSON.parse(ex.evalInSandbox(ctx, 'JSON.stringify(' + code + ')'));

test('shouldCloseEdit: без змін — close, зі змінами — confirm, невідомий тригер — none', () => {
  ['new-expense-focus', 'add-expense', 'open-other-edit', 'tab-switch', 'open-journal', 'open-trash', 'open-drawer'].forEach(t => {
    assert.equal(j(`shouldCloseEdit('${t}',false)`), 'close', t);
    assert.equal(j(`shouldCloseEdit('${t}',true)`), 'confirm', t);
  });
  assert.equal(j("shouldCloseEdit('zzz',true)"), 'none');
  assert.equal(j("shouldCloseEdit(undefined,false)"), 'none');
});
test('editFieldsChanged: порівнює всі поля; пробіли в сумі й навколо назви не рахуються змінами; відсутні дані — не зміна', () => {
  const base = { name: 'Кава', amount: '1 250', date: '2026-10-01', cat: 'Їжа', sub: 'Кафе', inst: '' };
  const C = (b, o) => j(`editFieldsChanged(${JSON.stringify(b)},${JSON.stringify(o)})`);
  assert.equal(C(base, base), false);
  assert.equal(C(base, Object.assign({}, base, { name: ' Кава ' })), false);
  assert.equal(C(base, Object.assign({}, base, { amount: '1250' })), false);
  assert.equal(C(base, Object.assign({}, base, { amount: '1 300' })), true);
  ['name', 'date', 'cat', 'sub', 'inst'].forEach(f => assert.equal(C(base, Object.assign({}, base, { [f]: 'x' })), true, f));
  assert.equal(j('editFieldsChanged(null,{name:"a"})'), false);
});
test('менеджер: одне редагування — один editingRecordKey; вибір/відкриття іншого запису йде через requestCloseEdit', () => {
  assert.match(SRC, /function startEditRecord[\s\S]*?requestCloseEdit\('open-other-edit'/);
  assert.match(SRC, /function toggleRecordSelect[\s\S]*?requestCloseEdit\('open-other-edit'/);
  assert.equal((SRC.match(/^let editingRecordKey/gm) || []).length, 1);
});
test('тригери: фокус у «Новій витраті», «Додати витрату», вкладки, Журнал, «Видалені дані», шторки — через guardEditOpener/focusin', () => {
  assert.match(SRC, /document\.addEventListener\('focusin', onEditGuardFocusIn, true\)/);
  assert.match(SRC, /closest\('\.vytraty-form-col'\)/);
  ['openJournal', 'openTrashScreen', 'switchTab', 'addExpense', 'openSettings', 'openIncomeEditor', 'openInstallmentEditor', 'openCardDebtEditor', 'openTestingDrawer', 'openNotificationsDrawer'].forEach(n => {
    assert.match(SRC, new RegExp("'" + n + "'"), n);
    assert.match(SRC, new RegExp('(async )?function ' + n + '\\('), n + ' існує');
  });
});
test('діалог: заголовок, пояснення, кнопки без хрестика; будь-яке закриття, крім «Скасувати зміни», повертає фокус у поле редагування', () => {
  const i = SRC.indexOf('function showEditCancelConfirm'), code = SRC.slice(i, SRC.indexOf('// Початок введення нової витрати', i));
  assert.match(code, /Скасувати редагування запису\?/);
  assert.match(code, /Зміни не буде збережено/);
  assert.match(code, /Продовжити редагування/);
  assert.match(code, /Скасувати зміни/);
  assert.match(code, /danger-outline/);
  assert.match(code, /lastFocusedBeforeDialog = field/);
  assert.match(code, /lastFocusedBeforeDialog = null/);
  assert.ok(!/×|✕|close-btn/.test(code));
});
test('збереження редагування не змінено: saveRecordEdit лишає editingRecordKey=null і pushExpenseRecordPilot; поле назви те саме', () => {
  const i = SRC.indexOf('async function saveRecordEdit'), code = SRC.slice(i, SRC.indexOf('function categoryOptionsHtml', i));
  assert.match(code, /pushExpenseRecordPilot\(rec\);\s*editingRecordKey = null;/);
  assert.match(code, /getElementById\('edtfielda1-'\+id\)/);
});
test('рекордер: edit-session (event/reason/dirty) у allowlist, без значень полів', () => {
  ['event', 'reason', 'dirty'].forEach(f => assert.match(SRC, new RegExp("DEBUG_EVENT_ALLOWLIST = \\[[\\s\\S]*'" + f + "'")));
  const i = SRC.indexOf('function recordEditSessionEvent'), code = SRC.slice(i, SRC.indexOf('function closeActiveEdit', i));
  assert.match(code, /type: 'edit-session', event: event, reason: reason, dirty: !!dirty/);
  assert.ok(!/\.value/.test(code));
});
test('клавіатурна логіка не чіпалась: focus() лише preventScroll і лише для поля, на яке перейшов користувач', () => {
  const i = SRC.indexOf('function onEditGuardFocusIn'), code = SRC.slice(i, SRC.indexOf('// Відкриття Журналу', i));
  assert.match(code, /focus\(\{ preventScroll: true \}\)/);
  assert.ok(!/blur\(\)/.test(code));
});
test('document-click «тап поза карткою» не закриває редагування під час діалогу, після «Скасувати зміни» в тому ж click і на кнопках самого діалогу', () => {
  const i = SRC.indexOf("document.addEventListener('click', function(e){\n  if(!selectedRecordKey) return;"), code = SRC.slice(i, i + 700);
  assert.match(code, /editGuardPending\(\) \|\| editGuardShield/);
  assert.match(code, /closest\('#app-modal, #modal-backdrop'\)/);
  assert.match(SRC, /editGuardShield = true;\s*setTimeout\(function\(\)\{ editGuardShield = false; \}, 0\);/);
});
