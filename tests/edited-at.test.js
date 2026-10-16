// Rev 2.32.90 (EDITED-1): позначка «відредаговано» — синхронізоване поле expenses.edited_at.
const test = require('node:test'); const assert = require('node:assert');
const fs = require('fs'); const path = require('path');
const { buildSandbox } = require('./extract');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const c = buildSandbox({}, ['expenseEditedAtValue', 'editedAtPayload', 'editedAtDiffers', 'expenseEditChanged']);

test('payload: edited_at лише коли значення відоме (upsert без нього не затирає серверне)', function(){
  assert.deepEqual(JSON.parse(JSON.stringify(c.editedAtPayload({ updatedAt: 'x' }))), {});
  assert.deepEqual(JSON.parse(JSON.stringify(c.editedAtPayload({ editedAt: '2026-01-02T10:00:00.000Z' }))), { edited_at: '2026-01-02T10:00:00.000Z' });
});
test('старе локальне edited:true → edited_at = updatedAt при push (одноразове перенесення)', function(){
  assert.equal(c.expenseEditedAtValue({ edited: true, updatedAt: '2026-01-03T00:00:00.000Z' }), '2026-01-03T00:00:00.000Z');
  assert.equal(c.expenseEditedAtValue({ edited: true, editedAt: 'A', updatedAt: 'B' }), 'A');
  assert.equal(c.expenseEditedAtValue({ updatedAt: 'B' }), null);
});
test('editedAtDiffers: порівняння за моментом часу (+00:00 і Z однакові), null із сервера не відрізняється', function(){
  assert.equal(c.editedAtDiffers('2026-01-02T10:00:00.000Z', '2026-01-02T10:00:00+00:00'), false);
  assert.equal(c.editedAtDiffers(undefined, '2026-01-02T10:00:00+00:00'), true);
  assert.equal(c.editedAtDiffers('2026-01-02T10:00:00.000Z', null), false);
  assert.equal(c.editedAtDiffers(undefined, null), false);
});
test('expenseEditChanged: змінилось лише справжнє значення; порожнє й undefined рівні', function(){
  const a = { name: 'A', amount: 5, date: '2026-01-01', category: 'К', subcategory: '', linkedInstallment: undefined };
  assert.equal(c.expenseEditChanged(a, Object.assign({}, a)), false);
  assert.equal(c.expenseEditChanged(a, Object.assign({}, a, { subcategory: undefined, linkedInstallment: '' })), false);
  assert.equal(c.expenseEditChanged(a, Object.assign({}, a, { amount: 6 })), true);
  assert.equal(c.expenseEditChanged(a, Object.assign({}, a, { linkedInstallment: 'ОЧ' })), true);
});
test('охоронні: edited_at у select, payload (запис і пакет), pull; ставить лише saveRecordEdit; доходи без позначки', function(){
  assert.match(SRC, /updated_by,source,external_id,edited_at', 'expenses', opts\)/);
  assert.equal((SRC.match(/\.\.\.editedAtPayload\(rec\)/g) || []).length, 2);
  assert.match(SRC, /if\(row\.edited_at\) local\.editedAt = row\.edited_at/);
  assert.match(SRC, /if\(row\.edited_at\) rec\.editedAt = row\.edited_at/);
  assert.equal((SRC.match(/\.editedAt = editNowISO/g) || []).length, 1);
  assert.ok(!/^\s*rec\.edited = true;/m.test(SRC));
  assert.match(SRC, /\(!isIncome && \(e\.editedAt \|\| e\.edited\)\)/);
});
