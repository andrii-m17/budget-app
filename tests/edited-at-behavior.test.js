// Rev 2.32.93 (EDITED-1, доробка за spec-reviewer): поведінкові тести push (запис і пакет) та saveRecordEdit.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildSandbox } = require('./extract');

const stamp = '2026-10-15T10:00:00.000Z';
const rec = over => Object.assign({ id: 'e1', name: 'Кава', amount: 100, date: '2026-10-10', category: 'К', subcategory: '', createdAt: stamp, updatedAt: stamp }, over || {});

function makePush(){
  const upserts = [];
  const client = { from(table){ return { upsert(payload){ upserts.push(JSON.parse(JSON.stringify(payload))); return Promise.resolve({ error: null }); } }; } };
  const g = { CLOUD_ENV: { env: 'mock' }, isCloudSessionReady: () => true, getSupabaseClient: () => client, cloudSession: { user: { id: 'u1' } }, cloudFamilyId: 'fam',
    saveExpenses: async function(){}, pullExpensesCore: async function(){}, installmentAccounts: [] };
  const c = buildSandbox(g, ['AMOUNT_MAX', 'isSyncableAmount', 'monoSourcePayload', 'editedAtPayload', 'expenseEditedAtValue', 'isCloudWriteReady', 'isWriteBlocked', 'pushExpenseRecordPilot', 'pushExpensesBatch']);
  c.__upserts = upserts; return c;
}
test('push (запис і пакет): editedAt потрапляє в payload, без нього поля немає (upsert не затре серверне)', async function(){
  const c = makePush();
  await c.pushExpenseRecordPilot(rec({ editedAt: '2026-10-15T11:00:00.000Z' }), { suppressPull: true });
  await c.pushExpenseRecordPilot(rec({ id: 'e2' }), { suppressPull: true });
  await c.pushExpensesBatch([rec({ id: 'e3', editedAt: '2026-10-15T11:00:00.000Z' }), rec({ id: 'e4' })]);
  assert.equal(c.__upserts[0].edited_at, '2026-10-15T11:00:00.000Z');
  assert.ok(!('edited_at' in c.__upserts[1]));
  assert.equal(c.__upserts[2][0].edited_at, '2026-10-15T11:00:00.000Z');
  assert.ok(!('edited_at' in c.__upserts[2][1]));
});
test('старе локальне edited:true: у payload edited_at = updatedAt, після успіху запис отримує editedAt (одноразово); синхронізований запис без змін не пушиться, тож не переноситься', async function(){
  const c = makePush();
  const r = rec({ edited: true });
  await c.pushExpenseRecordPilot(r, { suppressPull: true });
  assert.equal(c.__upserts[0].edited_at, stamp);
  assert.equal(r.editedAt, stamp);
  const b = rec({ id: 'e9', edited: true });
  await c.pushExpensesBatch([b]);
  assert.equal(b.editedAt, stamp);
});

function makeEdit(vals, over){
  const els = {};
  const el = v => ({ value: v });
  els['edtfielda1-e1'] = el(vals.name); els['edit-amount-e1'] = el(vals.amount); els['edit-date-e1'] = el(vals.date); els['edit-cat-e1'] = el(vals.cat); els['edit-sub-e1'] = el(vals.sub);
  const pushed = [];
  const g = Object.assign({ expenses: [rec()], document: { getElementById: id => els[id] || null }, flashField: function(){},
    readPositiveAmount: el => Number(el.value), saveExpenses: async function(){}, reportSaveResult: function(){}, pushExpenseRecordPilot: function(r){ pushed.push(r.id); },
    editingRecordKey: 'x', populateMonths: function(){}, renderAll: function(){} }, over || {});
  const c = buildSandbox(g, ['expenseEditChanged', 'saveRecordEditCore']);
  c.__pushed = pushed; return c;
}
test('saveRecordEdit: зміна суми ставить editedAt і updatedAt однаковою міткою; пушить', async function(){
  const c = makeEdit({ name: 'Кава', amount: '150', date: '2026-10-10', cat: 'К', sub: '' });
  assert.equal(await c.saveRecordEditCore('e1'), true);
  const r = c.expenses[0];
  assert.equal(r.amount, 150);
  assert.ok(r.editedAt && r.editedAt === r.updatedAt);
  assert.deepEqual(c.__pushed, ['e1']);
});
test('saveRecordEdit: збереження без змін editedAt не ставить (позначка лише за справжньої зміни); існуюча позначка лишається', async function(){
  const c = makeEdit({ name: 'Кава', amount: '100', date: '2026-10-10', cat: 'К', sub: '' });
  await c.saveRecordEditCore('e1');
  assert.equal(c.expenses[0].editedAt, undefined);
  const d = makeEdit({ name: 'Кава', amount: '100', date: '2026-10-10', cat: 'К', sub: '' }, { expenses: [rec({ editedAt: '2026-10-01T00:00:00.000Z' })] });
  await d.saveRecordEditCore('e1');
  assert.equal(d.expenses[0].editedAt, '2026-10-01T00:00:00.000Z');
});
test('saveRecordEdit: редагування й повернення значень назад позначку лишає (рішення чату)', async function(){
  const c = makeEdit({ name: 'Кава', amount: '150', date: '2026-10-10', cat: 'К', sub: '' });
  await c.saveRecordEditCore('e1');
  const first = c.expenses[0].editedAt;
  c.document.getElementById('edit-amount-e1').value = '100';
  await c.saveRecordEditCore('e1');
  assert.ok(c.expenses[0].editedAt && c.expenses[0].editedAt >= first);
  assert.equal(c.expenses[0].amount, 100);
});
