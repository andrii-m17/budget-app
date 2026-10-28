// Rev 2.32.186 (AUTHOR-FRAME) — рамка автора без ручної синхронізації. Синтетичні ідентифікатори.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildSandbox } = require('./extract');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

function addSandbox(extra){
  const fields = { expfielda7: { value: 'Кава' }, 'f-amount': { value: '50' }, 'f-date': { value: '2026-10-10' }, 'f-category': { value: '' }, 'f-subcategory': { value: '' } };
  const saved = [];
  const ctx = buildSandbox(Object.assign({
    actionGateState: {}, debugRecordingActive: false, document: { getElementById: function(id){ return fields[id]; } },
    expenses: [], installmentAccounts: [], confirmedInstallmentLinkIdx: -1,
    readPositiveAmount: function(el){ return parseFloat(el.value); }, autocategorize: function(){ return null; },
    generateUUID: function(){ return 'id-1'; }, localDateISO: function(){ return '2026-10-10'; },
    reportSaveResult: function(){}, saveExpenses: function(){ saved.push(JSON.stringify(ctxRef.expenses)); return Promise.resolve({ success: true }); },
    resetExpenseForm: function(){}, populateMonths: function(){}, renderAll: function(){}, flashField: function(){},
    pushExpenseRecordPilot: function(){},
  }, extra || {}), ['ACTION_GATE_HOLD_MS', 'actionGateEnter', 'actionGateLeave', 'addExpense', 'addExpenseCore', 'localAuthorId', 'debugAddResult']);
  const ctxRef = ctx;
  return { ctx, saved };
}
test('додавання на слабкому зв\'язку: push не відповідає (зависає) — автор є одразу й записаний у локальне сховище (переживе перезапуск)', async function(){
  const { ctx, saved } = addSandbox({ cloudSession: { user: { id: 'user-A' } }, pushExpenseRecordPilot: function(){ return new Promise(function(){}); } });
  await ctx.addExpense();
  assert.equal(ctx.expenses[0].createdBy, 'user-A');
  assert.equal(JSON.parse(saved[0])[0].createdBy, 'user-A', 'у збереженому JSON (після перезапуску) автор є');
});
test('додавання при невдалій відповіді сервера (push відхилено): автор лишається', async function(){
  const { ctx } = addSandbox({ cloudSession: { user: { id: 'user-A' } }, pushExpenseRecordPilot: function(){ return Promise.resolve({ success: false, error: 'timeout' }); } });
  await ctx.addExpense();
  assert.equal(ctx.expenses[0].createdBy, 'user-A');
});
test('без сесії автор не вигадується; запис створюється як раніше', async function(){
  const { ctx } = addSandbox({ cloudSession: null });
  await ctx.addExpense();
  assert.equal(ctx.expenses.length, 1); assert.ok(!('createdBy' in ctx.expenses[0]));
});

test('рамка: довідник порожній (слабкий зв\'язок), але стать у кеші → колір є; довідник є → як раніше; невідомий автор → без рамки', function(){
  const key = (SRC.match(/const AUTHOR_GENDERS_LS_KEY = '([^']+)'/) || [])[1];
  assert.ok(key, 'ключ кешу статі');
  const mk = (users, genders) => { const store = { [key]: JSON.stringify(genders || {}) }; return buildSandbox({ familyUsersById: users, AUTHOR_GENDERS_LS_KEY: key, localStorage: { getItem: k => (k in store ? store[k] : null) } }, ['AUTHOR_GENDER_COLORS', 'AUTHOR_NEUTRAL', 'normalizeAuthorGender', 'cachedAuthorGender', 'authorInfoFor', 'authorFrameColorVar']); };
  assert.equal(mk({}, { 'user-A': 'f' }).authorFrameColorVar('user-A'), '--color-accent-pink');
  assert.equal(mk({}, { 'user-A': 'm' }).authorFrameColorVar('user-A'), '--color-info');
  assert.equal(mk({ 'user-A': { name: 'Автор А', gender: 'f' } }, {}).authorFrameColorVar('user-A'), '--color-accent-pink');
  assert.equal(mk({}, {}).authorFrameColorVar('user-A'), null);
  assert.equal(mk({}, { 'user-A': 'f' }).authorFrameColorVar(null), null);
});
test('Журнал: рамка береться через authorFrameColorVar; вигляд і кольори не змінено (ті самі змінні CSS)', function(){
  assert.match(SRC, /const frameVar = !isIncome \? authorFrameColorVar\(e\.createdBy\) : null;/);
  assert.match(SRC, /m: \{ colorVar: '--color-info', bgVar: '--color-info-bg' \}/);
  assert.match(SRC, /f: \{ colorVar: '--color-accent-pink', bgVar: '--color-accent-pink-bg' \}/);
});

function backfillSandbox(expenses, rows){
  const store = {}; const calls = [];
  const ctx = buildSandbox({ expenses, localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = v; } },
    isCloudSessionReady: () => true, getSupabaseClient: () => ({}), saveExpenses: async function(){ calls.push('save'); return { success: true }; }, renderAll: function(){ calls.push('render'); },
    fetchRowsByIds: async function(c, table, cols, ids){ calls.push('fetch:' + ids.length); return rows === null ? null : rows; } }, ['LS_KEY_AUTHOR_BACKFILL', 'backfillExpenseAuthors']);
  return { ctx, store, calls };
}
test('старт: записи без автора донаповнюються один раз, лише потрібними id (без повного перезавантаження)', async function(){
  const exps = [{ id: 'a', createdBy: 'user-A' }, { id: 'b' }, { id: 'c' }];
  const { ctx, store, calls } = backfillSandbox(exps, [{ id: 'b', created_by: 'user-B' }]);
  const r = await ctx.backfillExpenseAuthors();
  assert.equal(r.filled, 1); assert.equal(exps[1].createdBy, 'user-B'); assert.ok(!exps[2].createdBy);
  assert.deepEqual(calls, ['fetch:2', 'save', 'render']);
  assert.equal(store.budget_author_backfill_v1, '1');
  calls.length = 0;
  await ctx.backfillExpenseAuthors();
  assert.deepEqual(calls, [], 'удруге нічого не робиться');
});
test('старт: збій мережі — прапорець не ставиться (повтор при наступному вході), дані не чіпаються; нічого донаповнювати — запиту нема', async function(){
  const exps = [{ id: 'b' }];
  const { ctx, store } = backfillSandbox(exps, null);
  const r = await ctx.backfillExpenseAuthors();
  assert.equal(r.skipped, true); assert.ok(!store.budget_author_backfill_v1); assert.ok(!exps[0].createdBy);
  const e2 = backfillSandbox([{ id: 'a', createdBy: 'user-A' }], []);
  const r2 = await e2.ctx.backfillExpenseAuthors();
  assert.deepEqual(e2.calls, []); assert.equal(r2.checked, 0); assert.equal(e2.store.budget_author_backfill_v1, '1');
});
test('охоронні: нових полів у push нема (created_by не шлеться), нових колонок нема; прапорець очищається при виході', function(){
  const push = SRC.slice(SRC.indexOf('async function pushExpenseRecordPilot'), SRC.indexOf('async function pushExpenseRecordPilot') + 3500).replace(/\/\/[^\n]*/g, '');
  assert.ok(!/created_by\s*:/.test(push));
  const fn = SRC.match(/function accountLocalStorageKeys\(\)\{([\s\S]*?)\n\}/)[1];
  assert.match(fn, /LS_KEY_AUTHOR_BACKFILL/);
  assert.match(SRC, /backfillExpenseAuthors\(\); \/\/ Rev 2\.32\.186/);
});
