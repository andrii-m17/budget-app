// Rev 2.32.24 (R, A2-12) — перейменування категорії/підкатегорії доходить до іншого пристрою (мок двох пристроїв).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildSandbox } = require('./extract');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

const helpers = buildSandbox({ expenseCountWord: function(n){ return n === 1 ? 'витрата' : 'витрат'; } }, ['renameRecordsStamp', 'countActiveWithName', 'renameConfirmText']);

function deviceA(){
  const cloud = new Map();
  const g = {
    navigator: { onLine: true }, cloud, timers: [], autoSyncRunning: false, autoSyncRetryStep: 0, autoSyncTimer: null,
    expenses: [], incomes: [], debts: [], debugRecordingActive: false, pushDebugEvent: function(){}, debugRecordingStartedAt: 0,
    performance: { now: function(){ return 0; } }, setTimeout: function(){ return 1; }, clearTimeout: function(){},
    isCloudSessionReady: function(){ return true; }, syncableRecords: function(l){ return l; }, populateMonths: function(){}, renderAll: function(){},
    pullExpensesCore: async function(){}, pullIncomesCore: async function(){}, pullDebtsCore: async function(){},
    pushExpensesBatched: async function(list){ list.forEach(function(r){ cloud.set(r.id, { id: r.id, category: r.category, subcategory: r.subcategory, updatedAt: r.updatedAt }); r.syncedUpdatedAt = r.updatedAt; }); return { pushed: list.length, failed: 0 }; },
    pushIncomesBatched: async function(){ return { pushed: 0, failed: 0 }; }, pushDebtsBatched: async function(){ return { pushed: 0, failed: 0 }; },
  };
  const c = buildSandbox(g, ['AUTOSYNC_RETRY_MS', 'isStaleRecord', 'autoSyncPlan', 'autoSyncStale']);
  return c;
}
const T0 = '2026-10-01T10:00:00.000Z';
const mk = function(id, cat, sub, extra){ return Object.assign({ id: id, name: 'X' + id, amount: 10, category: cat, subcategory: sub, createdAt: T0, updatedAt: T0, syncedUpdatedAt: T0 }, extra || {}); };

test('R1: перейменування категорії -> усі витрати (і з Корзини) стають «не синхронізованими» й доходять до Cloud', async function(){
  const a = deviceA();
  a.expenses.push(mk('1', 'Їжа', 'Кафе'), mk('2', 'Їжа', ''), mk('3', 'Одяг', ''), mk('4', 'Їжа', '', { deletedAt: T0 }));
  assert.equal(a.autoSyncPlan({ expenses: a.expenses, incomes: [], debts: [] }).pending, 0);
  const now = '2026-10-10T10:00:00.000Z';
  const n = helpers.renameRecordsStamp(a.expenses, 'category', 'Їжа', now);
  a.expenses.forEach(function(e){ if(e.category === 'Їжа') e.category = 'Харчування'; });
  assert.equal(n, 3);
  assert.equal(a.autoSyncPlan({ expenses: a.expenses, incomes: [], debts: [] }).pending, 3);
  const r = await a.autoSyncStale('rename');
  assert.equal(r.pushed, 3);
  // пристрій B: pull з Cloud
  const B = [mk('1', 'Їжа', 'Кафе'), mk('2', 'Їжа', ''), mk('3', 'Одяг', '')];
  B.forEach(function(e){ const row = a.cloud.get(e.id); if(row && row.updatedAt > e.updatedAt){ e.category = row.category; e.updatedAt = row.updatedAt; } });
  assert.deepEqual(B.map(function(e){ return e.category; }), ['Харчування', 'Харчування', 'Одяг']);
  assert.equal(a.cloud.has('3'), false); // не зачеплена інша категорія
});
test('R1: підкатегорія — так само; зміна лише тієї підкатегорії', async function(){
  const a = deviceA();
  a.expenses.push(mk('1', 'Їжа', 'Кафе'), mk('2', 'Їжа', 'Ресторан'));
  const n = helpers.renameRecordsStamp(a.expenses, 'subcategory', 'Кафе', '2026-10-10T10:00:00.000Z');
  a.expenses[0].subcategory = 'Кав\'ярні';
  assert.equal(n, 1);
  await a.autoSyncStale('rename');
  assert.equal(a.cloud.get('1').subcategory, 'Кав\'ярні');
  assert.equal(a.cloud.has('2'), false);
});
test('R: підтвердження «Буде оновлено N витрат» рахує лише живі', function(){
  const list = [mk('1', 'Їжа', ''), mk('2', 'Їжа', '', { deletedAt: T0 })];
  assert.equal(helpers.countActiveWithName(list, 'category', 'Їжа'), 1);
  assert.match(helpers.renameConfirmText(5), /Буде оновлено 5 витрат/);
});
test('R2: словник і автовизначення не змінено; перейменування викликає afterRenameSync і подію category-rename', function(){
  assert.match(SRC, /afterRenameSync\(renamedCount\)/);
  assert.match(SRC, /type: 'category-rename', records: count/);
  assert.match(SRC, /DICTIONARY\.forEach\(function\(d\)\{ if\(d\.cat===oldName\) d\.cat = newName; \}\);/);
});
