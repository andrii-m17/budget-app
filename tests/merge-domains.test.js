// Rev 2.32.201 (MERGE-DOMAINS, клас C): злиття поле за полем для доходів і боргів на фальшивому сервері з 2–3 «пристроями» (годинник ±1 доба): різні поля, те саме поле, видалення проти правки, правка під час push, мікросекунди, розбіжність назви боргу ОЧ.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildSandbox, evalInSandbox } = require('./extract');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const j = v => JSON.parse(JSON.stringify(v));
const T0 = '2026-10-15T10:00:00.000Z';
const TRIG = { incomes: ['amount', 'income_date', 'note', 'deleted_at'], debts: ['balance', 'monthly_payment', 'min_payment', 'min_payment_done', 'month', 'deleted_at', 'name'] };

function makeServer(){
  let tick = 0; const tables = { incomes: {}, debts: {} }; const log = [];
  const stamp = () => '2026-10-28T12:00:00.' + String(100000 + (++tick)).padStart(6, '0') + '+00:00';
  const srv = { tables, log, onUpdate: null, stamp };
  const bump = (table, r, before) => { if(JSON.stringify(TRIG[table].map(c => r[c])) !== before) r.updated_at = stamp(); };
  srv.client = { from(table){
    const rows = tables[table];
    const builder = (kind, payload) => {
      const filters = []; let lim = null;
      const run = () => {
        const matched = Object.values(rows).filter(r => filters.every(([c, v]) => c === 'family_id' || r[c] === v));
        if(kind === 'select'){ log.push('select:' + table); return { data: j(lim ? matched.slice(0, lim) : matched), error: null }; }
        log.push('update:' + table);
        if(srv.onUpdate){ const f = srv.onUpdate; srv.onUpdate = null; f(); }
        return { data: matched.map(r => { const before = JSON.stringify(TRIG[table].map(c => r[c])); Object.assign(r, payload); bump(table, r, before); return { id: r.id, updated_at: r.updated_at }; }), error: null };
      };
      const q = { eq(c, v){ filters.push([c, v]); return q; }, limit(n){ lim = n; return q; }, select(){ return q; }, then(f, r){ return Promise.resolve(run()).then(f, r); } };
      return q;
    };
    return {
      select(){ return builder('select'); }, update(p){ return builder('update', p); },
      upsert(p){ log.push('upsert:' + table); const list = Array.isArray(p) ? p : [p]; const data = list.map(x => { const old = rows[x.id]; const nr = Object.assign({}, old || {}, x); const before = old ? JSON.stringify(TRIG[table].map(c => old[c])) : ''; rows[x.id] = nr; if(!old) nr.updated_at = stamp(); else bump(table, nr, before); return { id: x.id, updated_at: nr.updated_at }; });
        const res = { data, error: null }; const q = { select(){ return q; }, then(f, r){ return Promise.resolve(res).then(f, r); } }; return q; },
    };
  } };
  return srv;
}
const NAMES = ['recordKey', 'isCloudWriteReady', 'isWriteBlocked', 'pushIncomeRecordPilot', 'pushIncomesBatch', 'pullIncomesCore', 'pushDebtRecordPilot', 'pushDebtsBatch', 'pullDebtsCore', 'debtOwnerAccount', 'dateToMonth', 'incomeSourceDisplay', 'conflictResolve', 'conflictModel', 'conflictValueText', 'CONFLICT_FIELD_ACC'];
function device(server, userId, skewMs){
  const SkewDate = class extends Date { constructor(...a){ if(a.length) super(...a); else super(Date.now() + skewMs); } static now(){ return Date.now() + skewMs; } };
  const g = { CLOUD_ENV: { env: 'mock' }, Date: SkewDate, isCloudSessionReady: () => true, getSupabaseClient: () => server.client, cloudSession: { user: { id: userId } }, cloudFamilyId: 'fam',
    incomes: [], debts: [], expenses: [], bankAccounts: [{ name: 'Картка-1', cloudId: 'bank1' }], installmentAccounts: [{ name: 'ОЧ-1', cloudId: 'inst1' }],
    saveIncomes: async function(){}, saveDebts: async function(){}, saveExpenses: async function(){}, getSyncMarker: () => null, setSyncMarker: function(){}, updateSyncMarkerFromAllRows: function(){}, applySyncMarker: q => q,
    pushOtherActorEvent: function(){}, recentlyPulledExpenseState: new Map(), recentlyPulledIncomeState: new Map(), RECORD_SYNC_PULSE_MS: 1, RECORD_SYNC_PULSE_COUNT: 1, RECORD_SYNC_DONE_MS: 1, populateMonths: function(){}, renderAll: function(){}, editingRecordKey: null,
    authorInfoFor: id => id === 'u2' ? { name: 'Оля', gender: 'f' } : null, showToast: function(){}, updateNotifBell: function(){}, openNotifArchive: function(){}, isNotifArchiveOpen: false, renderNotifArchive: function(){},
    fmt: n => n + ' ₴', isoToUaDateText: s => s.split('-').reverse().join('.'), document: { querySelectorAll: () => [], querySelector: () => null, activeElement: null }, localStorage: { getItem: () => null, setItem: function(){} },
    pluralUa: () => '', pushDebtRecordPilotX: 0, incomeSourceDisplay: s => s };
  const c = buildSandbox(g, NAMES); return c;
}
const edit = (dev, list, id, patch) => { const r = dev[list].find(e => e.id === id); Object.assign(r, patch); let at = new dev.Date().toISOString(); if(at <= r.updatedAt) at = new dev.Date(Date.parse(r.updatedAt) + 1).toISOString(); r.updatedAt = at; return r; };

// ---- доходи ----
const inc = () => ({ id: 'i1', source: 'Джерело-А', amount: 1000, date: '2026-10-05', createdAt: T0, updatedAt: T0 });
async function seedIncome(server, devs){
  const [a, ...rest] = devs; const r = inc(); a.incomes.push(r); await a.pushIncomeRecordPilot(r, { suppressPull: true });
  for(const d of rest) await d.pullIncomesCore();
}
test('доходи: різні поля зливаються мовчки (моя сума, чуже джерело), push лише моє поле; мікросекунди зберігаються', async () => {
  const s = makeServer(); const A = device(s, 'u1', 0), B = device(s, 'u2', 0);
  await seedIncome(s, [A, B]);
  assert.ok(/\.\d{6}\+00:00$/.test(A.incomes[0].serverUpdatedAt), 'серверний рядок без втрати мікросекунд');
  edit(A, 'incomes', 'i1', { amount: 1200 });
  edit(B, 'incomes', 'i1', { source: 'Джерело-Б' }); await B.pushIncomeRecordPilot(B.incomes[0], { suppressPull: true });
  s.log.length = 0; await A.pullIncomesCore();
  assert.equal(A.conflictLog.length, 0); assert.equal(A.incomes[0].source, 'Джерело-Б'); assert.equal(A.incomes[0].amount, 1200);
  assert.deepEqual(s.log, ['select:incomes', 'update:incomes']);
  assert.deepEqual([s.tables.incomes.i1.amount, s.tables.incomes.i1.note], [1200, 'Джерело-Б']); assert.equal(A.shadowDirtyNew(A.incomes[0]), false);
});
for(const skew of [86400000, -86400000]){
  test('доходи: те саме поле (годинник ' + skew + '): лишається серверне, у журналі моє; «Повернути моє» — нова правка на сервері', async () => {
    const s = makeServer(); const A = device(s, 'u1', skew), B = device(s, 'u2', 0);
    await seedIncome(s, [A, B]);
    edit(A, 'incomes', 'i1', { amount: 1200 }); edit(B, 'incomes', 'i1', { amount: 1500 }); await B.pushIncomeRecordPilot(B.incomes[0], { suppressPull: true });
    s.log.length = 0; await A.pullIncomesCore();
    assert.equal(A.incomes[0].amount, 1500); assert.ok(!s.log.some(x => x.startsWith('update') || x.startsWith('upsert')), 'нічого не перезаписано');
    const e = A.conflictLog[0]; assert.deepEqual([e.dom, e.kind, e.field, e.mine, e.theirs, e.actor, e.name], ['incomes', 'field', 'amount', 1200, 1500, 'Оля', 'Джерело-А']);
    assert.equal(A.conflictModel(e).title, 'Джерело-А: Оля вже змінила суму');
    await A.conflictResolve(e.id, 'mine'); await new Promise(r => setTimeout(r, 5));
    assert.equal(e.status, 'mine'); assert.equal(A.incomes[0].amount, 1200); assert.equal(s.tables.incomes.i1.amount, 1200);
  });
}
test('доходи: видалення іншою людиною проти моєї правки — запис видалений, «Відновити» знімає видалення й застосовує правку', async () => {
  const s = makeServer(); const A = device(s, 'u1', 0), B = device(s, 'u2', 0); await seedIncome(s, [A, B]);
  edit(A, 'incomes', 'i1', { amount: 1300 }); edit(B, 'incomes', 'i1', { deletedAt: new B.Date().toISOString() }); await B.pushIncomeRecordPilot(B.incomes[0], { suppressPull: true });
  await A.pullIncomesCore(); assert.ok(A.incomes[0].deletedAt); const e = A.conflictLog[0]; assert.equal(e.kind, 'deleted');
  await A.conflictResolve(e.id, 'mine'); await new Promise(r => setTimeout(r, 5));
  assert.equal(A.incomes[0].deletedAt, undefined); assert.equal(s.tables.incomes.i1.deleted_at, null); assert.equal(s.tables.incomes.i1.amount, 1300);
});
test('доходи: правка під час push не губиться; звичайна правка — один update; конфлікт при push — update, select, update; відкритий запис не змінюється', async () => {
  const s = makeServer(); const A = device(s, 'u1', 0), B = device(s, 'u2', 0); await seedIncome(s, [A, B]); s.log.length = 0;
  edit(A, 'incomes', 'i1', { amount: 1100 }); s.onUpdate = () => edit(A, 'incomes', 'i1', { source: 'Нове джерело' });
  await A.pushIncomeRecordPilot(A.incomes[0], { suppressPull: true });
  assert.deepEqual(s.log, ['update:incomes']); assert.equal(A.shadowDirtyNew(A.incomes[0]), true, 'нова правка лишається брудною'); assert.equal(A.incomes[0].serverBase.source, 'Джерело-А', 'зліпок = надіслане');
  s.log.length = 0; await A.pushIncomeRecordPilot(A.incomes[0], { suppressPull: true }); assert.equal(s.tables.incomes.i1.note, 'Нове джерело'); assert.equal(s.tables.incomes.i1.amount, 1100);
  // конфлікт при push
  edit(B, 'incomes', 'i1', { date: '2026-10-09' }); await B.pullIncomesCore(); await B.pushIncomeRecordPilot(B.incomes[0], { suppressPull: true });
  s.log.length = 0; edit(A, 'incomes', 'i1', { amount: 1111 }); await A.pushIncomeRecordPilot(A.incomes[0], { suppressPull: true });
  assert.deepEqual(s.log, ['update:incomes', 'select:incomes', 'update:incomes']); assert.equal(s.tables.incomes.i1.amount, 1111); assert.equal(s.tables.incomes.i1.income_date, '2026-10-09');
  // відкритий для редагування запис
  await B.pullIncomesCore(); edit(B, 'incomes', 'i1', { amount: 2000 }); await B.pushIncomeRecordPilot(B.incomes[0], { suppressPull: true });
  A.editingRecordKey = 'income:i1'; await A.pullIncomesCore(); assert.equal(A.incomes[0].amount, 1111, 'не змінено під руками'); A.editingRecordKey = null; await A.pullIncomesCore(); assert.equal(A.incomes[0].amount, 2000);
});
test('доходи: «відлуння» власного запису не рендерить і не підсвічує', async () => {
  const s = makeServer(); let renders = 0; const A = device(s, 'u1', 0); A.getSyncMarker = () => 'm'; A.renderAll = () => { renders++; };
  const r = inc(); A.incomes.push(r); await A.pushIncomeRecordPilot(r, { suppressPull: true }); renders = 0;
  await A.pullIncomesCore(); assert.equal(renders, 0); assert.equal(A.recentlyPulledIncomeState.size, 0);
});

// ---- борги ----
const debt = () => ({ id: 'd1', accountId: 'bank1', name: 'Картка-1', kind: 'card', month: '2026-10', balance: 5000, minPayment: 300, createdAt: T0, updatedAt: T0 });
async function seedDebt(server, devs){
  const [a, ...rest] = devs; const r = debt(); a.debts.push(r); await a.pushDebtRecordPilot(r, { suppressPull: true });
  for(const d of rest) await d.pullDebtsCore();
}
test('борги: різні поля зливаються мовчки (мій залишок, чужий мінімальний платіж); те саме поле — картка «<Назва>: Оля вже змінила залишок», «Повернути моє»', async () => {
  const s = makeServer(); const A = device(s, 'u1', 86400000), B = device(s, 'u2', -86400000); await seedDebt(s, [A, B]);
  assert.equal(A.debts[0].serverBase.balance, 5000); assert.ok(/\.\d{6}\+00:00$/.test(A.debts[0].serverUpdatedAt));
  edit(A, 'debts', 'd1', { balance: 4500 }); edit(B, 'debts', 'd1', { minPayment: 350 }); await B.pushDebtRecordPilot(B.debts[0], { suppressPull: true });
  s.log.length = 0; await A.pullDebtsCore();
  assert.equal(A.conflictLog.length, 0); assert.equal(A.debts[0].minPayment, 350); assert.equal(A.debts[0].balance, 4500); assert.deepEqual(s.log, ['select:debts', 'update:debts']);
  assert.equal(s.tables.debts.d1.balance, 4500); assert.equal(s.tables.debts.d1.min_payment, 350);
  // те саме поле
  await new Promise(r => setTimeout(r, 10)); await B.pullDebtsCore(); edit(A, 'debts', 'd1', { balance: 4000 }); edit(B, 'debts', 'd1', { balance: 4200 }); await B.pushDebtRecordPilot(B.debts[0], { suppressPull: true });
  await A.pullDebtsCore(); assert.equal(A.debts[0].balance, 4200);
  const e = A.conflictLog[0]; assert.deepEqual([e.dom, e.field, e.mine, e.theirs], ['debts', 'balance', 4000, 4200]); assert.equal(A.conflictModel(e).title, 'Картка-1: Оля вже змінила залишок');
  await A.conflictResolve(e.id, 'mine'); await new Promise(r => setTimeout(r, 5)); assert.equal(s.tables.debts.d1.balance, 4000);
});
test('борги: видалення іншою людиною проти правки; правка під час push не губиться; звичайна правка — один update', async () => {
  const s = makeServer(); const A = device(s, 'u1', 0), B = device(s, 'u2', 0); await seedDebt(s, [A, B]); s.log.length = 0;
  edit(A, 'debts', 'd1', { balance: 4900 }); await A.pushDebtRecordPilot(A.debts[0], { suppressPull: true }); assert.deepEqual(s.log, ['update:debts']);
  s.onUpdate = () => edit(A, 'debts', 'd1', { minPayment: 310 }); edit(A, 'debts', 'd1', { balance: 4800 }); await A.pushDebtRecordPilot(A.debts[0], { suppressPull: true });
  assert.equal(A.shadowDirtyNew(A.debts[0]), true); assert.equal(A.debts[0].serverBase.minPayment, 300);
  await A.pushDebtRecordPilot(A.debts[0], { suppressPull: true }); assert.equal(s.tables.debts.d1.min_payment, 310);
  await B.pullDebtsCore(); edit(A, 'debts', 'd1', { balance: 4700 }); edit(B, 'debts', 'd1', { deletedAt: new B.Date().toISOString() }); await B.pushDebtRecordPilot(B.debts[0], { suppressPull: true });
  await A.pullDebtsCore(); assert.ok(A.debts[0].deletedAt); const e = A.conflictLog[0]; assert.equal(e.kind, 'deleted');
  await A.conflictResolve(e.id, 'mine'); await new Promise(r => setTimeout(r, 5)); assert.equal(s.tables.debts.d1.deleted_at, null); assert.equal(s.tables.debts.d1.balance, 4700);
});
test('борги ОЧ: сервер перейменував борг (назва ОЧ змінилась), я змінив залишок офлайн — зливається мовчки; назва береться з ОЧ, не з локального запису', async () => {
  const s = makeServer(); const A = device(s, 'u1', 0);
  const d = Object.assign(debt(), { accountId: 'inst1', name: 'ОЧ-1', kind: 'installment', monthlyPayment: 1000 }); delete d.minPayment;
  A.debts.push(d); await A.pushDebtRecordPilot(d, { suppressPull: true });
  edit(A, 'debts', 'd1', { balance: 4400 }); // офлайн
  // ОЧ перейменована: пристрій A уже має нову назву рахунку, сервер (trg_sync_debt_names) перейменував рядок боргу
  A.installmentAccounts[0].name = 'ОЧ-1 нова'; const row = s.tables.debts.d1; row.name = 'ОЧ-1 нова'; row.installment_account_id = 'inst1'; row.updated_at = s.stamp();
  s.log.length = 0; await A.pullDebtsCore();
  assert.equal(A.conflictLog.length, 0, 'різні поля: мовчки'); assert.equal(A.debts[0].name, 'ОЧ-1 нова', 'назва з ОЧ'); assert.equal(A.debts[0].balance, 4400);
  assert.deepEqual(s.log, ['select:debts', 'update:debts']); assert.equal(s.tables.debts.d1.balance, 4400); assert.equal(s.tables.debts.d1.name, 'ОЧ-1 нова', 'назва в payload не надсилається, лишається серверна');
  // моя локальна назва ніколи не потрапляє в умовний update
  assert.ok(!/name:/.test(evalInSandbox(A, 'MERGE_DOMAINS.debts.payloadField.toString()')), 'payload поля боргу не містить name');
});
test('джерело: доходи й борги мають слот індикатора/обгортки push, спільне злиття (mdPullDirty/mdPushCas) без копій; видалених конфліктів вид `dom` у записі журналу', () => {
  assert.equal((SRC.match(/mdPullDirty\(MERGE_DOMAINS\.(expenses|incomes|debts)/g) || []).length, 3);
  assert.equal((SRC.match(/mdPushCas\(MERGE_DOMAINS\.(incomes|debts)/g) || []).length, 2);
  assert.match(SRC, /async function pushIncomeRecordPilot\(rec, opts\)\{\n  const id = rec && rec\.id;\n  expSyncBegin\(id\);/);
  assert.match(SRC, /async function pushDebtRecordPilot\(rec, opts\)\{\n  const id = rec && rec\.id;\n  expSyncBegin\(id\);/);
  assert.match(SRC, /dom: dom\.key, kind: kind/);
});
