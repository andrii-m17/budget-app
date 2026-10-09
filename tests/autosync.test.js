// Rev 2.32.21 (O, A1-6) — автосинхронізація офлайн-записів на імітованому Cloud.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildSandbox } = require('./extract');

function make(opts){
  const o = opts || {};
  const cloud = new Map();        // id -> стан рядка в "Cloud"
  const timers = [];
  const state = { online: true, calls: 0, failOnCall: o.failOnCall || 0 };
  const g = {
    navigator: { get onLine(){ return state.online; } },
    cloud, timers, state, autoSyncRunning: false, autoSyncRetryStep: 0, autoSyncTimer: null,
    expenses: [], incomes: [], debts: [],
    debugRecordingActive: false, pushDebugEvent: function(){}, debugRecordingStartedAt: 0,
    isCloudSessionReady: function(){ return true; },
    syncableRecords: function(l){ return l; },
    populateMonths: function(){}, renderAll: function(){},
    setTimeout: function(fn){ timers.push(fn); return timers.length; }, clearTimeout: function(){},
    performance: { now: function(){ return 0; } },
    pullExpensesCore: async function(){}, pullIncomesCore: async function(){}, pullDebtsCore: async function(){},
    pushExpensesBatched: async function(list){
      state.calls++;
      if(state.failOnCall && state.calls === state.failOnCall) return { pushed: 0, failed: list.length };
      list.forEach(function(r){ cloud.set(r.id, { id: r.id, name: r.name, deleted: !!r.deletedAt, amount: r.amount }); r.syncedUpdatedAt = r.updatedAt; });
      return { pushed: list.length, failed: 0 };
    },
    pushIncomesBatched: async function(){ return { pushed: 0, failed: 0 }; },
    pushDebtsBatched: async function(){ return { pushed: 0, failed: 0 }; },
  };
  const ctx = buildSandbox(g, ['AUTOSYNC_RETRY_MS', 'isStaleRecord', 'autoSyncPlan', 'autoSyncStale']);
  return ctx;
}
const rec = function(id, name, extra){ return Object.assign({ id: id, name: name, amount: 10, date: '2026-10-10', updatedAt: '2026-10-10T10:00:00.000Z' }, extra || {}); };

test('autoSyncPlan: stale = syncedUpdatedAt !== updatedAt (нові, змінені, видалені)', function(){
  const ctx = make();
  const done = rec('a', 'ok', { syncedUpdatedAt: '2026-10-10T10:00:00.000Z' });
  const edited = rec('b', 'edit', { syncedUpdatedAt: '2026-10-09T10:00:00.000Z' });
  const fresh = rec('c', 'new');
  const del = rec('d', 'del', { deletedAt: '2026-10-10T11:00:00.000Z', syncedUpdatedAt: '2026-10-09T10:00:00.000Z' });
  const plan = ctx.autoSyncPlan({ expenses: [done, edited, fresh, del], incomes: [], debts: [] });
  assert.equal(plan.pending, 3);
});
test('O1/O2: 3 офлайн-витрати + правка + видалення → після online рівно 3 стани в Cloud, без дублів; повторний запуск нічого не шле', async function(){
  const ctx = make();
  ctx.expenses.push(rec('1', 'A'), rec('2', 'B'), rec('3', 'C'));
  ctx.expenses[1].name = 'B-правка'; ctx.expenses[1].updatedAt = '2026-10-10T10:05:00.000Z';
  ctx.expenses[2].deletedAt = '2026-10-10T10:06:00.000Z'; ctx.expenses[2].updatedAt = '2026-10-10T10:06:00.000Z';
  ctx.state.online = false;
  assert.equal(await ctx.autoSyncStale('online'), null);   // офлайн — нічого
  assert.equal(ctx.cloud.size, 0);
  ctx.state.online = true;
  const r = await ctx.autoSyncStale('online');
  assert.equal(r.pushed, 3);
  assert.equal(ctx.cloud.size, 3);
  assert.equal(ctx.cloud.get('2').name, 'B-правка');
  assert.equal(ctx.cloud.get('3').deleted, true);
  const again = await ctx.autoSyncStale('resume');
  assert.equal(again.pending, 0);
  assert.equal(ctx.cloud.size, 3);
});
test('O1: обрив посеред синхронізації → запис лишається в черзі, планується повтор, повтор доставляє без дублів', async function(){
  const ctx = make({ failOnCall: 1 });
  ctx.expenses.push(rec('1', 'A'), rec('2', 'B'));
  const r1 = await ctx.autoSyncStale('online');
  assert.equal(r1.failed, 2);
  assert.equal(ctx.cloud.size, 0);
  assert.equal(ctx.timers.length, 1);                       // повтор заплановано
  ctx.timers[0](); for(let i = 0; i < 5; i++) await new Promise(function(r){ setImmediate(r); }); // спрацював таймер
  assert.equal(ctx.cloud.size, 2);
  assert.equal(ctx.autoSyncPlan({ expenses: ctx.expenses, incomes: [], debts: [] }).pending, 0);
});
test('single-flight: паралельні запуски не шлють двічі', async function(){
  const ctx = make();
  ctx.expenses.push(rec('1', 'A'));
  const [a, b] = await Promise.all([ctx.autoSyncStale('online'), ctx.autoSyncStale('resume')]);
  assert.equal(ctx.state.calls, 1);
  assert.ok(a === null || b === null);
});
