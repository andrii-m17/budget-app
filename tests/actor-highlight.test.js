// Rev 2.32.163 (ACTOR-HL) — підсвітка записів зі сповіщень про дії іншого учасника (data.ids): план, навігація, холодний старт, однаковість push і рядка журналу.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { buildSandbox } = require('./extract');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const SW = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');
const j = v => JSON.parse(JSON.stringify(v));

const NAMES = ['routeForPushType', 'pushApplyDiag', 'closeOpenSheetsForPush', 'ACTOR_IDS_CAP', 'actorIdsNormalize', 'actorIdsFromParam', 'otherActorPlan', 'actorIdsForAction', 'highlightRecIds', 'highlightRowIds', 'afterPaint', 'routeOtherActorNotification', 'handlePushAction'];
const SRCS = [{ key: 'salary', label: 'Зарплата' }, { key: 'other', label: 'Інше' }];
function env(data, opts){
  const o = opts || {}; const log = []; const classed = new Set();
  const mkEl = id => ({ id, classList: { add: c => { classed.add(id); log.push('hl:' + id); }, remove: c => classed.delete(id) }, scrollIntoView: () => log.push('scroll:' + id), getAttribute: () => id });
  const rowEls = {};
  const doc = {
    activeElement: { blur(){} }, body: { classList: { remove(){} } }, querySelector: () => null,
    querySelectorAll: sel => /journal-overlay/.test(sel) ? (o.journalRows || []).map(id => { const e = mkEl(id); e.getAttribute = () => id; return e; }) : [],
    getElementById: id => (o.rows || []).includes(id) ? (rowEls[id] = rowEls[id] || mkEl(id)) : null,
  };
  const lookups = [];
  const g = {
    document: doc, debugRecordingActive: false, setTimeout: () => 0, cloudAuthInitInFlight: null, safeId: String, motionReduced: () => true, requestAnimationFrame: f => f(),
    expenses: data.expenses || [], incomes: data.incomes || [], activeDebts: () => data.debts || [], bankAccounts: data.bankAccounts || [], installmentAccounts: data.installmentAccounts || [],
    INCOME_SOURCES: SRCS, sameIncomeSource: (a, b) => a === b, monthKey: d => d ? d.slice(0, 7) : '', allMonths: () => ['2026-08', '2026-09', '2026-10'], selectedMonth: o.selected || '2026-10',
    performSwitchTab: (t, x) => log.push('tab:' + t), switchAccountingTab: t => log.push('acc:' + t), openJournal: m => log.push('journal:' + m), performMonthChange: m => log.push('month:' + m),
    goToCardDebtsTab: () => { log.push('tab:accounting'); log.push('acc:debts'); }, latestTouchedRecordMonth: k => k === 'income' ? '2026-10' : '2026-10', openTrashScreen: () => log.push('trash'),
    captureDebugGeometry(){}, captureFocusAudit(){}, highlightInstallmentRow(){}, closeAllDataStatusPopovers(){}, showTextToast: t => log.push('toast:' + t),
    awaitCloudGate: async () => o.offline ? 'offline' : 'ready',
    getSupabaseClient: () => ({ from: t => ({ select: () => ({ eq: (c, v) => ({ limit: async () => { lookups.push(t + ':' + c + ':' + v); return { data: o.lookup ? [{ data: o.lookup }] : [], error: null }; } }) }) }) }),
  };
  const c = buildSandbox(g, NAMES);
  return { c, log, lookups };
}
const E = (id, date, extra) => Object.assign({ id, date }, extra || {});
const sum = (ids, target) => ({ type: 'other-actor-summary', target, ids });

test('один запис: Журнал відкривається на місяці запису, підсвічується лише він, прокрутка до нього', async function(){
  const e = env({ expenses: [E('x1', '2026-09-10'), E('x2', '2026-10-02')] }, { journalRows: ['x1', 'x2'] });
  await e.c.handlePushAction(sum({ expenses: ['x1'] }, 'journal'));
  assert.deepEqual(e.log, ['tab:vytraty', 'journal:2026-09', 'hl:x1', 'scroll:x1']);
});
test('кілька записів: підсвічено всі зі списку, прокрутка до першого зі списку (не за порядком у DOM)', async function(){
  const e = env({ expenses: [E('a', '2026-10-01'), E('b', '2026-10-02'), E('c', '2026-10-03')] }, { journalRows: ['a', 'b', 'c', 'z'] });
  await e.c.handlePushAction(sum({ expenses: ['c', 'a'] }, 'journal'));
  assert.deepEqual(e.log.filter(x => x.startsWith('hl:')).sort(), ['hl:a', 'hl:c']);
  assert.ok(e.log.includes('journal:2026-10') && !e.log.includes('hl:z') && !e.log.includes('hl:b'));
});
test('змішані види: підсвічується лише те, що показує цільовий екран (витрати → Журнал; борги → «Борги»; доходи → «Доходи»)', async function(){
  const data = { expenses: [E('x1', '2026-10-05')], incomes: [E('i1', '2026-10-06', { source: 'salary' })], debts: [{ id: 'd1', kind: 'card', name: 'К1', month: '2026-10' }], bankAccounts: [{ name: 'К0' }, { name: 'К1' }] };
  const ids = { expenses: ['x1'], incomes: ['i1'], debts: ['d1'] };
  let e = env(data, { journalRows: ['x1'], rows: ['income-row-0', 'bank-debt-row-1'] });
  await e.c.handlePushAction(sum(ids, 'journal')); assert.deepEqual(e.log.filter(x => x.startsWith('hl:')), ['hl:x1']);
  e = env(data, { journalRows: ['x1'], rows: ['income-row-0', 'bank-debt-row-1'] });
  await e.c.handlePushAction(sum(ids, 'debts')); assert.deepEqual(e.log.filter(x => x.startsWith('hl:')), ['hl:bank-debt-row-1']); assert.ok(e.log.includes('acc:debts'));
  e = env(data, { journalRows: ['x1'], rows: ['income-row-0', 'bank-debt-row-1'] });
  await e.c.handlePushAction(sum(ids, 'accounting')); assert.deepEqual(e.log.filter(x => x.startsWith('hl:')), ['hl:income-row-0']); assert.ok(e.log.includes('acc:data'));
});
test('борг-ОЧ: вкладка «ОЧ» і рядок installment-row-N; картки й ОЧ не змішуються', async function(){
  const data = { debts: [{ id: 'd2', kind: 'installment', name: 'Ноут', month: '2026-10' }], installmentAccounts: [{ name: 'А' }, { name: 'Ноут' }], bankAccounts: [{ name: 'Ноут' }] };
  const e = env(data, { rows: ['installment-row-1', 'bank-debt-row-0'] });
  await e.c.handlePushAction(sum({ debts: ['d2'] }, 'debts'));
  assert.ok(e.log.includes('acc:installments')); assert.deepEqual(e.log.filter(x => x.startsWith('hl:')), ['hl:installment-row-1']);
});
test('старе сповіщення без ids: екран відкривається як раніше, без підсвітки й без тосту', async function(){
  for(const t of ['journal', 'accounting', 'debts']){
    const e = env({ expenses: [E('x1', '2026-10-01')] }, { journalRows: ['x1'] });
    await e.c.handlePushAction({ type: 'other-actor-summary', target: t });
    assert.ok(!e.log.some(x => x.startsWith('hl:') || x.startsWith('toast:')), t);
    assert.ok(e.log.some(x => x.startsWith('tab:')), t);
  }
  const bad = env({}, {}); await bad.c.handlePushAction({ type: 'other-actor-summary', target: 'journal', ids: 'сміття' }); assert.ok(!bad.log.some(x => x.startsWith('hl:')));
  const empty = env({}, {}); await empty.c.handlePushAction({ type: 'other-actor-summary', target: 'journal', ids: { expenses: [], incomes: [], debts: [] } }); assert.deepEqual(empty.log, ['tab:vytraty', 'journal:2026-10']);
});
test('запис в іншому місяці: Журнал на місяці першого запису; «Облік» — перемикання вибору місяця; у поточному — без перемикання', async function(){
  let e = env({ expenses: [E('x1', '2026-08-20')] }, { journalRows: ['x1'] });
  await e.c.handlePushAction(sum({ expenses: ['x1'] }, 'journal')); assert.ok(e.log.includes('journal:2026-08'));
  const inc = [E('i1', '2026-08-03', { source: 'salary' })];
  e = env({ incomes: inc }, { rows: ['income-row-0'], selected: '2026-10' });
  await e.c.handlePushAction(sum({ incomes: ['i1'] }, 'accounting')); assert.ok(e.log.includes('month:2026-08')); assert.ok(e.log.includes('hl:income-row-0'));
  e = env({ incomes: [E('i1', '2026-10-03', { source: 'salary' })] }, { rows: ['income-row-0'], selected: '2026-10' });
  await e.c.handlePushAction(sum({ incomes: ['i1'] }, 'accounting')); assert.ok(!e.log.some(x => x.startsWith('month:')));
  e = env({ debts: [{ id: 'd1', kind: 'card', name: 'К', month: '2026-09' }], bankAccounts: [{ name: 'К' }] }, { rows: ['bank-debt-row-0'] });
  await e.c.handlePushAction(sum({ debts: ['d1'] }, 'debts')); assert.ok(e.log.includes('month:2026-09'));
});
test('запис видалено або ще не завантажено: екран відкривається, підсвічується що є, без тосту; місяць — за першим наявним', async function(){
  const data = { expenses: [E('x1', '2026-09-10', { deletedAt: '2026-10-01' }), E('x2', '2026-10-02')] };
  let e = env(data, { journalRows: ['x1', 'x2'] });
  await e.c.handlePushAction(sum({ expenses: ['x1', 'x2', 'нема'] }, 'journal'));
  assert.ok(e.log.includes('journal:2026-10')); assert.deepEqual(e.log.filter(x => x.startsWith('hl:')), ['hl:x2']); assert.ok(!e.log.some(x => x.startsWith('toast:')));
  e = env(data, { journalRows: [] });
  await e.c.handlePushAction(sum({ expenses: ['x1'] }, 'journal')); // лише видалений
  assert.deepEqual(e.log, ['tab:vytraty', 'journal:2026-10']);
});
test('більше 10 записів: сервер дає ≤ 10, клієнт витримує й більше (скільки є), без дублів; ліміт безпеки 200', async function(){
  const rec = []; for(let i = 0; i < 25; i++) rec.push(E('r' + i, '2026-10-01'));
  const ids = rec.map(r => r.id).concat(['r0', 'r1']); // дублі
  const e = env({ expenses: rec }, { journalRows: rec.map(r => r.id) });
  await e.c.handlePushAction(sum({ expenses: ids }, 'journal'));
  assert.equal(e.log.filter(x => x.startsWith('hl:')).length, 25);
  const many = []; for(let i = 0; i < 300; i++) many.push('m' + i);
  assert.equal(e.c.actorIdsNormalize({ expenses: many }).expenses.length, 200);
  assert.equal(e.c.actorIdsNormalize({ expenses: [1, null, '', {}, 'ok'] }).expenses.length, 1);
});
test('холодний старт: коротка форма з URL (e:..;i:..;d:..) розбирається; довгий список — один запит до user_notifications за data->>push_id', async function(){
  const c0 = env({}, {}).c;
  assert.deepEqual(j(c0.actorIdsFromParam('e:a,b;i:c;d:d1,d2')), { expenses: ['a', 'b'], incomes: ['c'], debts: ['d1', 'd2'] });
  assert.equal(c0.actorIdsFromParam('сміття'), null); assert.equal(c0.actorIdsFromParam(''), null); assert.equal(c0.actorIdsFromParam(undefined), null);
  let e = env({ expenses: [E('x1', '2026-10-02')] }, { journalRows: ['x1'] });
  await e.c.handlePushAction({ type: 'other-actor-summary', target: 'journal', idsParam: 'e:x1' }); assert.ok(e.log.includes('hl:x1')); assert.equal(e.lookups.length, 0, 'коротка форма без запиту');
  e = env({ expenses: [E('x1', '2026-10-02')] }, { journalRows: ['x1'], lookup: { ids: { expenses: ['x1'] } } });
  await e.c.handlePushAction({ type: 'other-actor-summary', target: 'journal', pushId: 'pid-9' });
  assert.deepEqual(e.lookups, ['user_notifications:data->>push_id:pid-9']); assert.ok(e.log.includes('hl:x1'));
  e = env({ expenses: [E('x1', '2026-10-02')] }, { journalRows: ['x1'], offline: true });
  await e.c.handlePushAction({ type: 'other-actor-summary', target: 'journal', pushId: 'pid-9' });
  assert.deepEqual(e.log, ['tab:vytraty', 'journal:2026-10'], 'офлайн: екран без підсвітки, без тосту');
  e = env({ expenses: [E('x1', '2026-10-02')] }, { journalRows: ['x1'], lookup: null });
  await e.c.handlePushAction({ type: 'other-actor-summary', target: 'journal', pushId: 'нема' }); assert.ok(!e.log.some(x => x.startsWith('hl:')));
});
test('холодний старт: запис ще не завантажено, поки йде вхід — навігація чекає cloudAuthInitInFlight', async function(){
  const data = { expenses: [] }; let release; const gate = new Promise(r => { release = r; });
  const e = env(data, { journalRows: ['x1'] }); e.c.cloudAuthInitInFlight = gate.then(() => { e.c.expenses.push(E('x1', '2026-10-02')); });
  const p = e.c.handlePushAction(sum({ expenses: ['x1'] }, 'journal'));
  await Promise.resolve(); assert.deepEqual(e.log, []); release(); await p;
  assert.ok(e.log.includes('hl:x1'));
});
test('рядок журналу й системний push дають однаковий результат (handlePushAction з тими самими полями data)', async function(){
  const data = { expenses: [E('x1', '2026-09-10'), E('x2', '2026-09-11')], incomes: [E('i1', '2026-08-03', { source: 'salary' })] };
  const dataPush = { type: 'other-actor-summary', target: 'journal', ids: { expenses: ['x1', 'x2'] }, push_id: 'p1', _at: 1 };
  const row = { id: 'n1', type: 'other-actor-summary', data: { type: 'other-actor-summary', target: 'journal', ids: { expenses: ['x1', 'x2'] }, push_id: 'p1' }, created_at: '2026-10-23T10:00:00Z', read_at: null };
  const a = env(data, { journalRows: ['x1', 'x2'] }), b = env(data, { journalRows: ['x1', 'x2'] });
  await a.c.handlePushAction(dataPush);
  await b.c.handlePushAction(Object.assign({}, row.data, { type: row.type, batch_ts: undefined })); // так рядок журналу викликає handlePushAction (openNotificationRow)
  assert.deepEqual(a.log, b.log);
  assert.match(SRC, /await handlePushAction\(Object\.assign\(\{\}, row\.data \|\| \{\}, \{ type: type,/); // рядок передає весь data (ids, target)
  const inc = { type: 'other-actor-summary', target: 'accounting', ids: { incomes: ['i1'] } };
  const c = env(data, { rows: ['income-row-0'] }), d = env(data, { rows: ['income-row-0'] });
  await c.c.handlePushAction(inc); await d.c.handlePushAction(Object.assign({}, inc, { push_id: 'p2' })); assert.deepEqual(c.log, d.log);
});
test('інші типи без змін: deleted → кошик; monthly-debt-reminder → «Борги»; Monobank не чіпано', async function(){
  const e = env({}, {}); await e.c.handlePushAction({ type: 'other-actor-deleted' }); assert.ok(e.log.includes('trash'));
  const f = env({}, {}); await f.c.handlePushAction({ type: 'monthly-debt-reminder' }); assert.ok(f.log.includes('acc:debts'));
  assert.match(SRC, /routeMonoNotification\(\{ batchTs: action\.batch_ts \|\| action\.batchTs \|\| null, daily: action\.tag === 'daily-expense-reminder' \}\)/);
});

// ---- sw.js: URL холодного старту без розростання ----
function swUrl(notifData){
  let opened = null; const handlers = {};
  const sandbox = { self: null, caches: { keys: async () => [], delete: async () => true }, console: { log(){}, warn(){}, error(){} }, Promise, indexedDB: { open(){ throw new Error('x'); } }, setTimeout, clearTimeout, Date };
  sandbox.self = { addEventListener(n, f){ handlers[n] = f; }, registration: {}, clients: { matchAll: async () => [], claim: async () => {}, openWindow: async u => { opened = u; } }, skipWaiting(){} };
  vm.createContext(sandbox); vm.runInContext(SW, sandbox);
  let w = null; handlers.notificationclick({ notification: { close(){}, data: notifData, tag: 't' }, waitUntil(p){ w = p; } });
  return Promise.resolve(w).catch(() => {}).then(() => opened);
}
test('sw.js: коротка форма ids лише коли вміщається (≤ 330 символів), завжди pushId; довгий список — лише pushId', async function(){
  const u = await swUrl({ type: 'other-actor-summary', target: 'journal', ids: { expenses: ['aaaa-1', 'bbbb-2'], debts: ['dddd-3'] }, push_id: 'pid-1' });
  assert.ok(u.includes('&ids=' + encodeURIComponent('e:aaaa-1,bbbb-2;d:dddd-3'))); assert.ok(u.includes('&pushId=pid-1'));
  const uuid = i => '00000000-0000-4000-8000-' + String(i).padStart(12, '0');
  const ten = []; for(let i = 0; i < 10; i++) ten.push(uuid(i));
  const long = await swUrl({ type: 'other-actor-summary', ids: { expenses: ten, incomes: ten }, push_id: 'pid-2' });
  assert.ok(!long.includes('&ids='), 'довгий список не розростає URL'); assert.ok(long.includes('&pushId=pid-2')); assert.ok(long.length < 400, 'довжина URL ' + long.length);
  const none = await swUrl({ type: 'other-actor-summary' }); assert.ok(!/ids=|pushId=/.test(none));
});
test('охоронні: query читає ids і pushId; підсвітка Monobank (highlightMonoRows, клас) і CSS підсвітки не змінені', function(){
  assert.match(SRC, /idsParam: pushActionParams\.get\('ids'\) \|\| undefined, pushId: pushActionParams\.get\('pushId'\) \|\| undefined/);
  assert.match(SRC, /\.expense-row\.just-notified\{ background:var\(--color-info-bg\); animation:cardBlink \.8s ease-in-out 3; \}/);
  assert.match(SRC, /\.card-debt-compact-row\.just-notified\{ background:var\(--color-info-bg\); animation:cardBlink \.8s ease-in-out 3; \}/);
});
