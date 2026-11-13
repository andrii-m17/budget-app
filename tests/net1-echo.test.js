// Rev 2.32.300 (NET-1): одна дія з витратою = один запит. Повний рядок у відповіді на запис (без негайного pull), гасіння Realtime-луни власного запису
// (в т.ч. події, що прийшла до відповіді), діагностика echo-skip / pull-skip. Фальшивий сервер із тригерами (updated_at, штамп видалення, alias категорії, created_by).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildSandbox, evalInSandbox } = require('./extract');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const j = v => JSON.parse(JSON.stringify(v));
const T0 = '2026-11-14T08:00:00.000Z';

function makeServer(o) {
  o = o || {};
  const rows = {}, log = []; let tick = 0;
  const stamp = () => '2026-11-14T10:00:00.' + String(100000 + (++tick)).padStart(6, '0') + '+00:00';
  const FIELDS = ['amount', 'expense_date', 'category', 'subcategory', 'note', 'linked_installment_id', 'deleted_at', 'edited_at'];
  const proj = (r, cols) => { if (!cols) return { id: r.id, updated_at: r.updated_at }; const out = {}; cols.split(',').forEach(c => { out[c] = r[c] === undefined ? null : r[c]; }); return o.partial ? { id: r.id, updated_at: r.updated_at, deleted_at: r.deleted_at === undefined ? null : r.deleted_at } : out; };
  const triggers = (old, nr) => {
    if (o.aliases && o.aliases[nr.category]) nr.category = o.aliases[nr.category];
    if (nr.deleted_at && !(old && old.deleted_at)) nr.deleted_at = '2026-11-14T09:59:59.500000+00:00';
    if (!old) nr.created_by = nr.created_by || 'u1';
    if (!old || FIELDS.some(c => String(old[c] == null ? null : old[c]) !== String(nr[c] == null ? null : nr[c]))) nr.updated_at = stamp();
  };
  const srv = { rows, log, hook: null, stamp };
  const finish = (sel, kind, run) => { const q = { select(c) { sel = c; return q; }, then(f, r) { return Promise.resolve(run(sel)).then(f, r); } }; return q; };
  srv.client = { from(table) {
    assert.equal(table, 'expenses');
    return {
      upsert(p) { return finish(null, 'upsert', sel => { log.push('upsert'); if (o.error) return { data: null, error: { message: 'boom', code: '500' } }; const old = rows[p.id]; const nr = Object.assign({}, old || {}, p); triggers(old, nr); rows[p.id] = nr; if (srv.hook) { const f = srv.hook; srv.hook = null; f(nr); } return { data: sel ? [proj(nr, sel)] : null, error: null }; }); },
      update(p) {
        const filters = [];
        const q = finish(null, 'update', sel => { log.push('update'); const hit = Object.values(rows).filter(r => filters.every(([c, v]) => r[c] === v)); const out = hit.map(r => { const nr = Object.assign({}, r, p); triggers(r, nr); rows[r.id] = nr; if (srv.hook) { const f = srv.hook; srv.hook = null; f(nr); } return proj(nr, sel); }); return { data: out, error: null }; });
        q.eq = (c, v) => { filters.push([c, v]); return q; }; return q;
      },
      select(cols) { const filters = []; let lim = null; const q = { eq(c, v) { filters.push([c, v]); return q; }, limit(n) { lim = n; return q; }, then(f, r) { log.push('select'); const hit = Object.values(rows).filter(x => filters.every(([c, v]) => x[c] === v)); return Promise.resolve({ data: j(lim ? hit.slice(0, lim) : hit), error: null }).then(f, r); } }; return q; },
    };
  } };
  return srv;
}
const NAMES = ['recordKey', 'AMOUNT_MAX', 'isSyncableAmount', 'monoSourcePayload', 'editedAtPayload', 'expenseEditedAtValue', 'editedAtDiffers', 'isCloudWriteReady', 'isWriteBlocked', 'pushExpenseRecordPilot', 'linkedOwnerAccount', 'pushExpensesBatch'];
function device(server, extra) {
  const st = { pulls: 0, renders: 0, scheduled: 0, events: [] };
  const g = { CLOUD_ENV: { env: 'mock' }, isCloudSessionReady: () => true, getSupabaseClient: () => server.client, cloudSession: { user: { id: 'u1' } }, cloudFamilyId: 'fam',
    expenses: [], installmentAccounts: [], saveExpenses: async function () {}, pullExpensesCore: async function () { st.pulls++; }, populateMonths: function () {}, renderAll: function () { st.renders++; }, document: { activeElement: null, querySelector: () => null },
    scheduleRealtimeSyncCheck: function () { st.scheduled++; }, recOn: () => true, pushDebugEvent: e => st.events.push(e), debugRecordingStartedAt: 0, editingRecordKey: null,
    recentlyPulledExpenseState: new Map(), pushOtherActorEvent: function () {}, applySyncMarker: q => q, getSyncMarker: () => null, setSyncMarker: function () {} };
  Object.assign(g, extra || {});
  const c = buildSandbox(g, NAMES); c.__st = st; return c;
}
const rec = o => Object.assign({ id: 'e1111111-aaaa-bbbb-cccc-000000000001', name: 'Кава', amount: 100, date: '2026-11-14', category: 'Старе', subcategory: '', createdAt: T0, updatedAt: T0 }, o || {});
const echoPayload = (row, eventType, by) => ({ eventType: eventType || 'UPDATE', new: Object.assign({}, row, { updated_by: by === undefined ? 'u1' : by }), old: {} });
const toZ = s => s.replace('+00:00', 'Z');

test('utcMicros: Z і +00:00, 3 і 6 знаків — один рядок; інші зони зсуваються; не розібралось або без зони → null', function () {
  const c = buildSandbox({}, ['utcMicros']);
  const u = v => c.utcMicros(v);
  assert.equal(u('2026-11-14T10:00:00.123456+00:00'), '2026-11-14T10:00:00.123456Z');
  assert.equal(u('2026-11-14T10:00:00.123456Z'), u('2026-11-14T10:00:00.123456+00:00'));
  assert.equal(u('2026-11-14T10:00:00.123Z'), '2026-11-14T10:00:00.123000Z');
  assert.equal(u('2026-11-14T10:00:00.123Z'), u('2026-11-14T10:00:00.123000+00:00'));
  assert.equal(u('2026-11-14T10:00:00Z'), '2026-11-14T10:00:00.000000Z');
  assert.equal(u('2026-11-14 10:00:00.5+00'), '2026-11-14T10:00:00.500000Z', 'пробіл замість T, зона без хвилин');
  assert.equal(u('2026-11-14T12:30:00.000001+02:30'), '2026-11-14T10:00:00.000001Z');
  assert.equal(u('2026-11-14T05:00:00.000001-0500'), '2026-11-14T10:00:00.000001Z');
  ['', null, undefined, 'abc', '2026-11-14', '2026-11-14T10:00:00', '2026-13-14T10:00:00Z', '2026-11-14T25:00:00Z', '2026-11-14T10:00:00.1234567Z'].forEach(v => assert.equal(u(v), null, String(v)));
});

test('гасіння луни: власний запис гаситься один раз, в обох форматах часу; подія пишеться без сум і назв', function () {
  const d = device(makeServer());
  const row = { id: 'abcdef12-0000-0000-0000-000000000009', updated_at: '2026-11-14T10:00:00.123456+00:00' };
  d.selfEchoBegin(row.id); d.selfEchoFinish(row.id, row.updated_at);
  assert.equal(d.selfEchoCheck(echoPayload(row)), 'skip');
  assert.equal(d.selfEchoCheck(echoPayload(row)), 'pass', 'одноразово');
  assert.deepEqual(j(d.__st.events.map(e => [e.type, e.table, e.idShort, e.kind])), [['echo-skip', 'expenses', 'abcdef12', 'UPDATE']]);
  assert.ok(!JSON.stringify(d.__st.events).match(/amount|note|name|Кава|100/));
  // «Z» проти «+00:00» і 3 проти 6 знаків
  d.selfEchoBegin('r2'); d.selfEchoFinish('r2', '2026-11-14T10:00:00.123Z');
  assert.equal(d.selfEchoCheck(echoPayload({ id: 'r2', updated_at: '2026-11-14T10:00:00.123000+00:00' })), 'skip');
  d.selfEchoBegin('r3'); d.selfEchoFinish('r3', '2026-11-14T10:00:00.654321+00:00');
  assert.equal(d.selfEchoCheck(echoPayload({ id: 'r3', updated_at: '2026-11-14T10:00:00.654321Z' })), 'skip');
});

test('гасіння луни: чуже або сумнівне не гаситься (інший updated_by, інший час, DELETE, прострочене, нерозібраний час, інший id)', function () {
  const d = device(makeServer());
  const ts = '2026-11-14T10:00:00.123456+00:00';
  const arm = () => { d.selfEchoBegin('x1'); d.selfEchoFinish('x1', ts); };
  arm(); assert.equal(d.selfEchoCheck(echoPayload({ id: 'x1', updated_at: ts }, 'UPDATE', 'u2')), 'pass', 'інший автор');
  assert.equal(d.selfEchoCheck(echoPayload({ id: 'x1', updated_at: '2026-11-14T10:00:00.123457+00:00' })), 'pass', 'інший час (на мікросекунду)');
  assert.equal(d.selfEchoCheck(echoPayload({ id: 'x1', updated_at: ts }, 'DELETE')), 'pass', 'DELETE');
  assert.equal(d.selfEchoCheck(echoPayload({ id: 'x2', updated_at: ts })), 'pass', 'інший id');
  assert.equal(d.selfEchoCheck(echoPayload({ id: 'x1', updated_at: 'не час' })), 'pass', 'нерозібраний час');
  assert.equal(d.selfEchoCheck({ eventType: 'UPDATE', new: { id: 'x1', updated_at: ts } }), 'pass', 'без updated_by');
  assert.equal(d.selfEchoCheck(null), 'pass'); assert.equal(d.selfEchoCheck({ eventType: 'UPDATE' }), 'pass');
  assert.equal(d.selfEchoCheck(echoPayload({ id: 'x1', updated_at: ts })), 'skip', 'справжнє відлуння після всіх відмов досі діє');
  arm(); evalInSandbox(d, "SELF_ECHO.recent.get('x1').at = Date.now() - 16000");
  assert.equal(d.selfEchoCheck(echoPayload({ id: 'x1', updated_at: ts })), 'pass', 'старше 15 с');
  d.selfEchoBegin('x3'); d.selfEchoFinish('x3', 'не час');
  assert.equal(d.selfEchoCheck(echoPayload({ id: 'x3', updated_at: ts })), 'pass', 'нерозібраний час відповіді: не гасимо');
});

test('подія до відповіді запису затримується: збіг гаситься, чужий час або невдалий запис запускають перевірку', function () {
  const d = device(makeServer());
  const ts = '2026-11-14T10:00:00.200000+00:00';
  d.selfEchoBegin('h1');
  assert.equal(d.selfEchoCheck(echoPayload({ id: 'h1', updated_at: ts })), 'held');
  d.selfEchoFinish('h1', toZ(ts));
  assert.equal(d.__st.scheduled, 0, 'збіг: перевірки немає'); assert.equal(d.__st.events.filter(e => e.type === 'echo-skip').length, 1);
  d.selfEchoBegin('h2');
  assert.equal(d.selfEchoCheck(echoPayload({ id: 'h2', updated_at: '2026-11-14T10:00:00.300000+00:00' })), 'held', 'подія іншого мого пристрою');
  d.selfEchoFinish('h2', ts);
  assert.equal(d.__st.scheduled, 1, 'час інший: звичайна перевірка');
  d.selfEchoBegin('h3'); d.selfEchoCheck(echoPayload({ id: 'h3', updated_at: ts })); d.selfEchoFinish('h3', null);
  assert.equal(d.__st.scheduled, 2, 'запис не вдався: перевірка');
  d.selfEchoBegin('h4'); d.selfEchoBegin('h4'); d.selfEchoCheck(echoPayload({ id: 'h4', updated_at: ts }));
  d.selfEchoFinish('h4', ts); assert.equal(d.__st.scheduled, 2, 'два записи в польоті: рішення чекає останнього');
  d.selfEchoFinish('h4', ts); assert.equal(d.__st.scheduled, 2, 'збіг: перевірки немає');
});

test('expApplyPushedRow: повний рядок застосовується (alias категорії, created_by, штамп видалення); неповний, правка під час запиту, брудний, чужа ОЧ → null', function () {
  const d = device(makeServer());
  const full = { id: 'e1', amount: 100, expense_date: '2026-11-14', category: 'Нове', subcategory: 'Каса', note: 'Кава', linked_installment_id: null, deleted_at: null, created_at: T0, updated_at: '2026-11-14T10:00:00.111111+00:00', created_by: 'u1', updated_by: 'u1', source: null, external_id: null, edited_at: null };
  const clean = o => Object.assign({ id: 'e1', name: 'Кава', amount: 100, date: '2026-11-14', category: 'Старе', subcategory: '', createdAt: T0, updatedAt: T0, syncedUpdatedAt: T0, revAt: T0, localRev: 1, syncedRev: 1 }, o || {});
  const r = clean();
  const res = d.expApplyPushedRow(r, full, T0);
  assert.deepEqual(j(res), { visible: true });
  assert.equal(r.category, 'Нове'); assert.equal(r.subcategory, 'Каса'); assert.equal(r.createdBy, 'u1'); assert.equal(r.updatedBy, 'u1');
  assert.equal(r.updatedAt, full.updated_at); assert.equal(r.syncedUpdatedAt, full.updated_at); assert.equal(r.serverUpdatedAt, full.updated_at);
  assert.equal(r.serverBase.category, 'Нове'); assert.equal(r.serverBase.deletedAt, '');
  const same = clean({ category: 'Нове', subcategory: 'Каса', updatedAt: full.updated_at, syncedUpdatedAt: full.updated_at, revAt: full.updated_at });
  assert.deepEqual(j(d.expApplyPushedRow(same, full, full.updated_at)), { visible: false }, 'без переписування категорії перемальовування не потрібне');
  const del = Object.assign({}, full, { deleted_at: '2026-11-14T09:59:59.500000+00:00' }); const r2 = Object.assign({}, same, { deletedAt: '2026-11-14T09:00:00.000Z' });
  d.expApplyPushedRow(r2, del, r2.updatedAt); assert.equal(r2.deletedAt, del.deleted_at, 'штамп видалення з сервера');
  const r3 = Object.assign({}, same, { deletedAt: 'x' }); d.expApplyPushedRow(r3, full, r3.updatedAt); assert.equal(r3.deletedAt, undefined, 'відновлення: deleted_at null знімає позначку');
  const partial = { id: 'e1', updated_at: full.updated_at, deleted_at: null };
  assert.equal(d.expApplyPushedRow(clean(), partial, T0), null, 'неповний рядок');
  assert.equal(d.expApplyPushedRow(clean({ updatedAt: '2026-11-14T08:00:05.000Z' }), full, T0), null, 'правка під час запиту');
  assert.equal(d.expApplyPushedRow(clean({ localRev: 5, syncedRev: 1 }), full, T0), null, 'брудний запис');
  assert.equal(d.expApplyPushedRow(clean(), Object.assign({}, full, { linked_installment_id: 'nope' }), T0), null, 'ОЧ ще не синхронізована');
  assert.equal(d.expApplyPushedRow(clean(), Object.assign({}, full, { id: 'other' }), T0), null, 'чужий id');
});

test('додавання: один запис (upsert), pull не викликається, рядок із відповіді застосовано, серверний alias категорії й created_by', async function () {
  const srv = makeServer({ aliases: { 'Старе': 'Нове' } }); const d = device(srv);
  const r = rec(); d.expenses.push(r);
  const res = await d.pushExpenseRecordPilot(r);
  assert.deepEqual(srv.log, ['upsert']);
  assert.equal(d.__st.pulls, 0, 'негайного pull немає'); assert.equal(res.success, true); assert.equal(res.serverAt, srv.rows[r.id].updated_at);
  assert.equal(r.category, 'Нове'); assert.equal(r.createdBy, 'u1'); assert.equal(r.serverUpdatedAt, srv.rows[r.id].updated_at); assert.equal(r.syncedUpdatedAt, r.updatedAt);
  assert.equal(d.__st.renders, 1, 'категорія змінилась: одне перемальовування');
  assert.equal(d.shadowDirtyNew(r), false);
  assert.deepEqual(j(d.__st.events.filter(e => e.type === 'pull-skip').map(e => [e.table, e.source])), [['expenses', 'push']]);
});

test('зміна, видалення й відновлення: по одному PATCH, без GET і pull; штамп видалення з сервера; відновлення знімає його', async function () {
  const srv = makeServer(); const d = device(srv);
  const r = rec({ category: 'Нове' }); d.expenses.push(r); await d.pushExpenseRecordPilot(r);
  srv.log.length = 0; d.__st.pulls = 0;
  const bump = () => { const t = new Date(Date.parse(r.updatedAt) + 1000).toISOString(); r.updatedAt = t; };
  r.amount = 150; bump(); const a = await d.pushExpenseRecordPilot(r);
  assert.deepEqual(srv.log, ['update'], 'зміна'); assert.equal(a.serverAt, srv.rows[r.id].updated_at); assert.equal(srv.rows[r.id].amount, 150);
  r.deletedAt = new Date().toISOString(); bump(); await d.pushExpenseRecordPilot(r);
  assert.deepEqual(srv.log, ['update', 'update'], 'видалення'); assert.equal(r.deletedAt, '2026-11-14T09:59:59.500000+00:00', 'штамп сервера');
  delete r.deletedAt; bump(); await d.pushExpenseRecordPilot(r);
  assert.deepEqual(srv.log, ['update', 'update', 'update'], 'відновлення'); assert.equal(r.deletedAt, undefined); assert.equal(srv.rows[r.id].deleted_at, null);
  assert.equal(d.__st.pulls, 0, 'жодного pull на чотири дії'); assert.equal(d.shadowDirtyNew(r), false);
  assert.equal(d.__st.events.filter(e => e.type === 'pull-skip').length, 4);
});

test('луна власного запису: подія до відповіді затримується й гаситься, після відповіді гаситься; чужа подія тієї ж витрати запускає перевірку', async function () {
  const srv = makeServer(); const d = device(srv);
  const r = rec({ category: 'Нове' }); d.expenses.push(r);
  let during = null;
  srv.hook = row => { during = d.selfEchoCheck(echoPayload(Object.assign({}, row, { updated_at: toZ(row.updated_at) }))); };
  await d.pushExpenseRecordPilot(r);
  assert.equal(during, 'held'); assert.equal(d.__st.scheduled, 0);
  assert.equal(d.__st.events.filter(e => e.type === 'echo-skip').length, 1);
  // другий запис: луна після відповіді
  r.amount = 200; r.updatedAt = new Date(Date.parse(r.updatedAt) + 1000).toISOString();
  await d.pushExpenseRecordPilot(r);
  assert.equal(d.selfEchoCheck(echoPayload(srv.rows[r.id])), 'skip'); assert.equal(d.__st.scheduled, 0);
  // чужа зміна тієї ж витрати (інший автор) — звичайна перевірка
  assert.equal(d.selfEchoCheck(echoPayload(Object.assign({}, srv.rows[r.id], { updated_at: '2026-11-14T10:05:00.000001+00:00' }), 'UPDATE', 'u2')), 'pass');
});

test('запобіжники: неповна відповідь, правка під час запиту й помилка лишаються на старому шляху (pull), без гасіння луни', async function () {
  const p = makeServer({ partial: true }); const dp = device(p); const rp = rec(); dp.expenses.push(rp);
  await dp.pushExpenseRecordPilot(rp);
  assert.equal(dp.__st.pulls, 1, 'неповний рядок: pull як раніше'); assert.equal(dp.__st.events.filter(e => e.type === 'pull-skip').length, 0);
  assert.equal(dp.selfEchoCheck(echoPayload(p.rows[rp.id])), 'pass', 'без застосованого рядка луну не гасимо');
  const e = makeServer({ error: true }); const de = device(e); const re = rec(); de.expenses.push(re);
  const er = await de.pushExpenseRecordPilot(re);
  assert.equal(er.success, false); assert.equal(de.__st.pulls, 0, 'помилка: pull не робиться (як і раніше)');
  const s = makeServer(); const ds = device(s); const rs = rec({ category: 'Нове' }); ds.expenses.push(rs);
  s.hook = () => { rs.amount = 999; rs.updatedAt = '2026-11-14T08:00:07.000Z'; if (typeof rs.localRev === 'number') rs.localRev++; };
  await ds.pushExpenseRecordPilot(rs);
  assert.equal(ds.__st.pulls, 1, 'правка під час запиту: pull зіллє'); assert.equal(rs.amount, 999, 'нова правка не втрачена');
  assert.equal(ds.selfEchoCheck(echoPayload(s.rows[rs.id])), 'pass');
});

test('одиничний запис із suppressPull (цикли): рядок застосовується, pull не робиться, луна гаситься; шлях умовного update з правкою під час запиту лишає pull', async function () {
  const srv = makeServer(); const d = device(srv); const r = rec({ category: 'Нове' }); d.expenses.push(r);
  await d.pushExpenseRecordPilot(r, { suppressPull: true });
  assert.equal(d.__st.pulls, 0); assert.equal(d.selfEchoCheck(echoPayload(srv.rows[r.id])), 'skip', 'луна гаситься і для suppressPull: цикл сам робить один pull наприкінці');
  assert.equal(d.__st.events.filter(e => e.type === 'pull-skip').length, 0, 'pull-skip лише коли pull справді був би виконаний');
  // умовний update (mdPushCas) із правкою під час запиту: старий шлях (pull), нова правка не втрачена
  const s2 = makeServer(); const d2 = device(s2); const r2 = rec({ category: 'Нове' }); d2.expenses.push(r2); await d2.pushExpenseRecordPilot(r2); d2.__st.pulls = 0; d2.__st.events.length = 0;
  r2.amount = 150; r2.updatedAt = new Date(Date.parse(r2.updatedAt) + 1000).toISOString();
  s2.hook = () => { r2.amount = 777; r2.updatedAt = new Date(Date.parse(r2.updatedAt) + 1000).toISOString(); if (typeof r2.localRev === 'number') r2.localRev++; };
  const res = await d2.pushExpenseRecordPilot(r2);
  assert.equal(res.success, true); assert.equal(res.serverAt, undefined, 'рядок не застосовано: луну не гасимо');
  assert.equal(d2.__st.pulls, 1, 'pull зіллє'); assert.equal(r2.amount, 777, 'нова правка не втрачена');
  assert.equal(d2.selfEchoCheck(echoPayload(s2.rows[r2.id])), 'pass');
});

test('пакетні шляхи не змінені: pushExpensesBatch бере лише id,updated_at,deleted_at, з suppressPull pull не робиться, луна не гаситься', async function () {
  const srv = makeServer(); const d = device(srv);
  const a = rec({ id: 'b1' }), b = rec({ id: 'b2' });
  await d.pushExpensesBatch([a, b]);
  assert.equal(d.__st.pulls, 0);
  assert.equal(d.selfEchoCheck(echoPayload(srv.rows.b1)), 'pass');
  assert.ok(/shadowRet\(client\.from\('expenses'\)\.upsert\(resolvable\.map/.test(SRC), 'пакет досі через shadowRet');
  assert.ok(SRC.includes("if(applied) selfPullSkip('expenses'); // Rev 2.32.300 (NET-1): рядок уже застосовано з відповіді\n      else await pullExpensesCore();"), 'pull лише якщо рядок не застосовано');
});

test('охоронні: подія самописця в білих списках; Realtime гасить лише витрати; доходи й борги не чіпались', function () {
  assert.match(SRC, /const REC_ALLOWED_TYPES = \[[^\]]*'echo-skip', 'pull-skip'\]/);
  assert.match(SRC, /const REC_ALLOWED_KEYS = \['idShort',/);
  assert.match(SRC, /if\(domain\.table === 'expenses' && selfEchoCheck\(payload\) !== 'pass'\) return;/);
  assert.ok(/if\(!error && !\(opts && opts\.suppressPull\)\) await pullIncomesCore\(\);/.test(SRC) && /if\(!error && !\(opts && opts\.suppressPull\)\) await pullDebtsCore\(\);/.test(SRC), 'NET-2: доходи й борги без змін');
  assert.match(SRC, /selfEchoFinish\(id, res && res\.serverAt \? res\.serverAt : null\);/);
});
