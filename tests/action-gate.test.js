// Rev 2.32.20 (D, A1-8) — захист від подвійного виклику: addExpense / saveRecordEdit / runTrashPurge.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildSandbox } = require('./extract');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

test('actionGateEnter: під час виконання і ACTION_GATE_HOLD_MS після — відмова; потім знову дозволено', function(){
  const g = buildSandbox({ actionGateState: {} }, ['ACTION_GATE_HOLD_MS', 'actionGateEnter', 'actionGateLeave']);
  assert.equal(g.actionGateEnter('k', 1000), true);
  assert.equal(g.actionGateEnter('k', 1001), false);       // виконується
  g.actionGateLeave('k', true, 1100);
  assert.equal(g.actionGateEnter('k', 1200), false);       // у вікні після
  assert.equal(g.actionGateEnter('k', 1100 + 400), true);  // вікно минуло
  assert.equal(g.actionGateEnter('other', 1000), true);    // інший ключ незалежний
});
test('actionGateLeave(hold=false): невдала валідація не відкриває вікно', function(){
  const g = buildSandbox({ actionGateState: {} }, ['ACTION_GATE_HOLD_MS', 'actionGateEnter', 'actionGateLeave']);
  g.actionGateEnter('k', 1000);
  g.actionGateLeave('k', false, 1001);
  assert.equal(g.actionGateEnter('k', 1002), true);
});

function addExpenseSandbox(){
  const fields = { expfielda7: { value: 'Кава' }, 'f-amount': { value: '50' }, 'f-date': { value: '2026-10-10' }, 'f-category': { value: '' }, 'f-subcategory': { value: '' } };
  const ctx = buildSandbox({
    actionGateState: {}, document: { getElementById: function(id){ return fields[id]; } },
    expenses: [], installmentAccounts: [], confirmedInstallmentLinkIdx: -1,
    parseAmount: function(v){ return parseFloat(v); }, autocategorize: function(){ return null; },
    generateUUID: (function(){ let n = 0; return function(){ return 'id-' + (++n); }; })(),
    localDateISO: function(){ return '2026-10-10'; },
    reportSaveResult: function(){}, saveExpenses: function(){ return new Promise(function(r){ setTimeout(function(){ r({ success: true }); }, 5); }); },
    pushExpenseRecordPilot: function(){}, resetExpenseForm: function(){}, populateMonths: function(){}, renderAll: function(){}, flashField: function(){},
  }, ['ACTION_GATE_HOLD_MS', 'actionGateEnter', 'actionGateLeave', 'addExpense', 'addExpenseCore']);
  return { ctx, fields };
}
test('addExpense: два виклики поспіль дають одну витрату', async function(){
  const { ctx } = addExpenseSandbox();
  await Promise.all([ctx.addExpense(), ctx.addExpense()]);
  assert.equal(ctx.expenses.length, 1);
});
test('addExpense: невдала валідація не блокує негайне виправлення і повтор', async function(){
  const { ctx, fields } = addExpenseSandbox();
  fields['f-amount'].value = '';
  await ctx.addExpense();
  assert.equal(ctx.expenses.length, 0);
  fields['f-amount'].value = '50';
  await ctx.addExpense();
  assert.equal(ctx.expenses.length, 1);
});
test('addExpense: серія різних витрат з паузою працює (D2)', async function(){
  const { ctx } = addExpenseSandbox();
  await ctx.addExpense();
  ctx.actionGateState.addExpense.doneAt -= 500; // минуло вікно утримання
  await ctx.addExpense();
  assert.equal(ctx.expenses.length, 2);
});
test('saveRecordEdit і runTrashPurge мають захист у коді', function(){
  assert.match(SRC, /async function saveRecordEdit\(id\)\{\n  if\(!actionGateEnter\('saveRecordEdit:' \+ id\)\) return;/);
  assert.match(SRC, /async function runTrashPurge\(item\)\{\n  if\(!actionGateEnter\('purge:' \+ item\.key\)\) return;/);
});
