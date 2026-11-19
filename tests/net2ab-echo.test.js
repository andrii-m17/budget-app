// Rev 2.32.426 (NET-2ab): одна дія з доходом або боргом = один запит: повний рядок у відповіді на запис (без негайного pull), гасіння Realtime-луни власного запису (чужий пристрій і чужий користувач проходять). Фальшивий сервер із тригером updated_at/штампом видалення. Лише синтетичні дані.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildSandbox } = require('./extract');
const SRC = require('./extract').readIndexWithCss();
const j = v => JSON.parse(JSON.stringify(v));
const T0 = '2026-11-14T08:00:00.000Z';
const ME = 'u1';

function makeServer(opts){
  opts = opts || {};
  const rows = { incomes: {}, debts: {} }, log = []; let tick = 0;
  const stamp = () => '2026-11-14T10:00:00.' + String(100000 + (++tick)).padStart(6, '0') + '+00:00';
  const FIELDS = { incomes: ['amount', 'income_date', 'note', 'deleted_at'], debts: ['balance', 'month', 'min_payment', 'min_payment_done', 'monthly_payment', 'deleted_at', 'name'] };
  const triggers = (table, old, nr) => {
    if(nr.deleted_at && !(old && old.deleted_at)) nr.deleted_at = '2026-11-14T09:59:59.500000+00:00';
    if(!old) nr.created_by = nr.created_by || ME;
    if(opts.alterBalance && table === 'debts') nr.balance = opts.alterBalance;
    if(!old || FIELDS[table].some(c => String(old[c] == null ? null : old[c]) !== String(nr[c] == null ? null : nr[c]))) nr.updated_at = stamp();
  };
  const COLS = { incomes: 'id,amount,income_date,note,deleted_at,created_at,updated_at,created_by,updated_by', debts: 'id,bank_account_id,installment_account_id,name,kind,month,balance,min_payment,min_payment_done,monthly_payment,deleted_at,created_at,updated_at,created_by,updated_by' };
  const proj = (table, r, cols) => { if(!cols) return { id: r.id, updated_at: r.updated_at }; const out = {}; cols.split(',').forEach(c => { out[c] = r[c] === undefined ? null : r[c]; }); if(opts.partial) return { id: r.id, updated_at: r.updated_at, deleted_at: out.deleted_at }; return out; };
  const srv = { rows, log, COLS };
  const finish = (run) => { let sel = null; const q = { select(c){ sel = c; return q; }, then(f, r){ return Promise.resolve(run(sel)).then(f, r); } }; return q; };
  srv.client = { from(table){
    return {
      upsert(p){ return finish(sel => { log.push('upsert ' + table); const old = rows[table][p.id]; const nr = Object.assign({}, old || {}, p); triggers(table, old, nr); rows[table][p.id] = nr; return { data: [proj(table, nr, sel)], error: null }; }); },
      update(p){ const filters = []; const q = finish(sel => { log.push('update ' + table); const hit = Object.values(rows[table]).filter(r => filters.every(([c, v]) => r[c] === v)); const out = hit.map(r => { const nr = Object.assign({}, r, p); triggers(table, r, nr); rows[table][r.id] = nr; return proj(table, nr, sel); }); return { data: out, error: null }; }); q.eq = (c, v) => { filters.push([c, v]); return q; }; return q; },
      select(cols){ const filters = []; let lim = null; const q = { eq(c, v){ filters.push([c, v]); return q; }, limit(n){ lim = n; return q; }, then(f, r){ log.push('select ' + table); const hit = Object.values(rows[table]).filter(x => filters.every(([c, v]) => x[c] === v)).slice(0, lim || 999); return Promise.resolve({ data: hit.map(x => proj(table, x, cols)), error: null }).then(f, r); } }; return q; },
    };
  } };
  return srv;
}
const NAMES = ['recordKey', 'isCloudWriteReady', 'isWriteBlocked', 'pushIncomeRecordPilot', 'pushDebtRecordPilot', 'debtOwnerAccount', 'dateToMonth', 'INC_ROW_COLS', 'DEBT_ROW_COLS'];
function device(server, extra){
  const st = { pulls: [], scheduled: 0, events: [] };
  const g = { CLOUD_ENV: { env: 'mock' }, isCloudSessionReady: () => true, getSupabaseClient: () => server.client, cloudSession: { user: { id: ME } }, cloudFamilyId: 'fam',
    incomes: [], debts: [], bankAccounts: [{ name: 'Картка А', cloudId: 'bank-1' }], installmentAccounts: [{ name: 'ОЧ А', cloudId: 'inst-1' }], expenses: [], CATEGORIES: [],
    sameIncomeSource: (a, b) => String(a || '') === String(b || ''), incomeSourceStore: v => v, incomeSourceDisplay: v => v, // справжні (потребують довідника джерел) покриті tests/merge-domains.test.js
    saveIncomes: async function(){}, saveDebts: async function(){}, saveBankAccountsLocal: async function(){}, saveInstallmentAccountsLocal: async function(){},
    pullIncomesCore: async function(){ st.pulls.push('incomes'); }, pullDebtsCore: async function(){ st.pulls.push('debts'); }, renderAfterSync: function(){}, populateMonths: function(){}, renderAll: function(){},
    scheduleRealtimeSyncCheck: function(){ st.scheduled++; }, recOn: () => true, pushDebugEvent: e => st.events.push(e), debugRecordingStartedAt: 0, editingRecordKey: null,
    applySyncMarker: q => q, getSyncMarker: () => null, setSyncMarker: function(){} };
  Object.assign(g, extra || {});
  const c = buildSandbox(g, NAMES); c.__st = st; return c;
}
const inc = o => Object.assign({ id: 'i1111111-aaaa-bbbb-cccc-000000000001', date: '2026-11-14', source: 'Зарплата', amount: 1000, createdAt: T0, updatedAt: T0 }, o || {});
const debt = o => Object.assign({ id: 'd1111111-aaaa-bbbb-cccc-000000000001', kind: 'card', name: 'Картка А', month: '2026-11', balance: 5000, createdAt: T0, updatedAt: T0 }, o || {});
const echo = (table, row, by, type) => ({ eventType: type || 'UPDATE', table, new: Object.assign({}, row, { updated_by: by === undefined ? ME : by }), old: {} });

test('доходи: додати / змінити / видалити — по одному запиту, без GET і pull; рядок із відповіді застосовано (updated_at сервера, штамп видалення)', async function(){
  const srv = makeServer(), c = device(srv), r = inc();
  assert.equal((await c.pushIncomeRecordPilot(r)).success, true);
  assert.deepEqual(srv.log, ['upsert incomes']); assert.deepEqual(c.__st.pulls, []);
  assert.ok(r.serverUpdatedAt && r.serverUpdatedAt === r.updatedAt && r.syncedUpdatedAt === r.updatedAt && r.createdBy === ME && r.updatedBy === ME, 'рядок застосовано');
  r.amount = 1100; r.updatedAt = '2026-11-14T08:05:00.000Z'; assert.equal((await c.pushIncomeRecordPilot(r)).success, true);
  r.deletedAt = '2026-11-14T08:06:00.000Z'; r.updatedAt = '2026-11-14T08:06:00.000Z'; assert.equal((await c.pushIncomeRecordPilot(r)).success, true);
  assert.deepEqual(srv.log, ['upsert incomes', 'update incomes', 'update incomes'], 'один запит на дію, без select');
  assert.deepEqual(c.__st.pulls, []); assert.equal(r.deletedAt, '2026-11-14T09:59:59.500000+00:00', 'штамп видалення від сервера');
});
test('борги: додати / змінити / видалити — по одному запиту, без GET і pull; рахунок за cloudId', async function(){
  const srv = makeServer(), c = device(srv), r = debt();
  assert.equal((await c.pushDebtRecordPilot(r)).success, true);
  assert.deepEqual(srv.log, ['upsert debts']); assert.deepEqual(c.__st.pulls, []); assert.equal(r.accountId, 'bank-1'); assert.ok(r.serverUpdatedAt && r.createdBy === ME);
  r.balance = 5100; r.updatedAt = '2026-11-14T08:05:00.000Z'; assert.equal((await c.pushDebtRecordPilot(r)).success, true);
  r.deletedAt = '2026-11-14T08:06:00.000Z'; r.updatedAt = r.deletedAt; assert.equal((await c.pushDebtRecordPilot(r)).success, true);
  assert.deepEqual(srv.log, ['upsert debts', 'update debts', 'update debts']); assert.deepEqual(c.__st.pulls, []);
});
test('борг ОЧ: ОЧ за cloudId, ті самі правила', async function(){
  const srv = makeServer(), c = device(srv), r = debt({ kind: 'installment', name: 'ОЧ А', balance: 9000 });
  assert.equal((await c.pushDebtRecordPilot(r)).success, true); assert.deepEqual(srv.log, ['upsert debts']); assert.deepEqual(c.__st.pulls, []); assert.equal(r.accountId, 'inst-1');
});
test('луна власного запису гаситься один раз (доходи, борги); чужий пристрій (інший updated_at) і чужий користувач проходять; DELETE не гаситься', async function(){
  for(const [table, push, mk] of [['incomes', 'pushIncomeRecordPilot', inc], ['debts', 'pushDebtRecordPilot', debt]]){
    const srv = makeServer(), c = device(srv), r = mk();
    await c[push](r);
    const row = srv.rows[table][r.id];
    assert.equal(c.selfEchoCheck(echo(table, row)), 'skip', table + ': власна луна гаситься');
    assert.equal(c.selfEchoCheck(echo(table, row)), 'pass', 'другий раз уже ні (одноразово)');
    await c[push](Object.assign(r, table === 'incomes' ? { amount: 1 } : { balance: 1 }, { updatedAt: '2026-11-14T08:10:00.000Z' }));
    const row2 = srv.rows[table][r.id];
    assert.equal(c.selfEchoCheck(echo(table, Object.assign({}, row2, { updated_at: '2026-11-14T10:59:00.000000+00:00' }))), 'pass', 'інший пристрій того ж користувача: інший updated_at');
    assert.equal(c.selfEchoCheck(echo(table, row2, 'other-user')), 'pass', 'чужий користувач');
    assert.equal(c.selfEchoCheck(echo(table, row2, ME, 'DELETE')), 'pass', 'DELETE');
    assert.ok(c.__st.events.some(e => e.type === 'echo-skip' && e.table === table), 'подія echo-skip з таблицею ' + table);
  }
});
test('подія Realtime ДО відповіді запису затримується й гаситься після неї (доходи)', async function(){
  const srv = makeServer(); let resolveUp; const c = device(srv);
  const realFrom = srv.client.from; const gate = new Promise(r => { resolveUp = r; });
  srv.client.from = function(t){ const f = realFrom(t); const up = f.upsert; f.upsert = function(p){ const q = up(p); const th = q.then; q.then = function(a, b){ return gate.then(() => th.call(q, a, b)); }; return q; }; return f; };
  const r = inc(); const pr = c.pushIncomeRecordPilot(r);
  await new Promise(x => setTimeout(x, 5));
  assert.equal(c.selfEchoCheck(echo('incomes', { id: r.id, updated_at: '2026-11-14T10:00:00.100001+00:00' })), 'held', 'запис ще в польоті → затримано');
  resolveUp(); await pr;
  assert.equal(c.__st.scheduled, 0, 'затримана луна збіглась і погашена: перевірку не заплановано');
});
test('запобіжники: неповна відповідь, правка під час запиту, сервер змінив значення (залишок боргу) → лишається звичайний pull', async function(){
  const s1 = makeServer({ partial: true }), c1 = device(s1); await c1.pushIncomeRecordPilot(inc()); assert.deepEqual(c1.__st.pulls, ['incomes'], 'неповна відповідь → pull');
  const s2 = makeServer({ alterBalance: 7777 }), c2 = device(s2); await c2.pushDebtRecordPilot(debt()); assert.deepEqual(c2.__st.pulls, ['debts'], 'сервер переписав залишок → pull');
  const s3 = makeServer(), c3 = device(s3), r3 = inc(); const p = c3.pushIncomeRecordPilot(r3); r3.amount = 5; r3.updatedAt = '2026-11-14T09:00:00.000Z'; await p; assert.deepEqual(c3.__st.pulls, ['incomes'], 'правка під час запиту → pull, правка не губиться'); assert.equal(r3.amount, 5);
});
test('помилка запису й офлайн (isCloudWriteReady = false): поведінка як раніше (без застосування, без пропуску pull)', async function(){
  const off = device(makeServer()); off.isCloudWriteReady = () => false; const r = inc(); assert.deepEqual(j(await off.pushIncomeRecordPilot(r)), { success: true }); assert.equal(r.serverUpdatedAt, undefined);
  const s = makeServer(); s.client.from = () => ({ upsert: () => ({ select: () => Promise.resolve({ data: null, error: { message: 'boom', code: '500' } }), then: (f, g) => Promise.resolve({ data: null, error: { message: 'boom', code: '500' } }).then(f, g) }) });
  const c = device(s); const res = await c.pushIncomeRecordPilot(inc()); assert.equal(res.success, false); assert.equal(res.error, 'boom'); assert.deepEqual(c.__st.pulls, []);
});
test('suppressPull (пакети/цикли): рядок застосовується, pull не робиться; пакетні шляхи (pushIncomesBatch/pushDebtsBatch) не змінені — беруть лише id,updated_at,deleted_at', async function(){
  const srv = makeServer(), c = device(srv), r = inc(); await c.pushIncomeRecordPilot(r, { suppressPull: true }); assert.deepEqual(c.__st.pulls, []); assert.ok(r.serverUpdatedAt);
  assert.match(SRC, /async function pushIncomesBatch[\s\S]*?shadowRet\(client\.from\('incomes'\)\.upsert\(payloads, \{ onConflict: 'id' \}\)\)/);
  assert.match(SRC, /async function pushDebtsBatch[\s\S]*?shadowRet\(client\.from\('debts'\)\.upsert\(/);
});
