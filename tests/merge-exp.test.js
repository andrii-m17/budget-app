// Rev 2.32.193 (MERGE-EXP, клас C+B): злиття поле за полем для витрат на фальшивому сервері й 2–3 «пристроях» із годинником ±1 доба.
// Різні поля зливаються мовчки; те саме поле лишає серверне значення й дає запис журналу конфліктів; видалення проти правки; правка під час push не губиться; мікросекунди; кількість запитів.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildSandbox, evalInSandbox } = require('./extract');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const j = v => JSON.parse(JSON.stringify(v));
const T0 = '2026-10-15T10:00:00.000Z';

// ---- фальшивий сервер: updated_at ставить лише він (мікросекунди), тригер піднімає його лише за справжньої зміни ----
function makeServer(){
  let tick = 0; const rows = {}; const log = [];
  const stamp = () => '2026-10-28T12:00:00.' + String(100000 + (++tick)).padStart(6, '0') + '+00:00';
  const COLS = ['amount', 'expense_date', 'category', 'subcategory', 'note', 'linked_installment_id', 'deleted_at', 'edited_at', 'updated_by'];
  const srv = { rows, log, onUpdate: null };
  function builder(kind, payload){
    const filters = []; let sel = null, lim = null;
    const run = () => {
      const matched = Object.values(rows).filter(r => filters.every(([c, v]) => c === 'family_id' || r[c] === v));
      if(kind === 'select'){ log.push('select'); return { data: j(lim ? matched.slice(0, lim) : matched), error: null }; }
      log.push('update');
      if(srv.onUpdate){ const f = srv.onUpdate; srv.onUpdate = null; f(); }
      const out = matched.map(r => { const before = JSON.stringify(COLS.map(c => r[c])); Object.keys(payload).forEach(k => { r[k] = payload[k]; }); if(JSON.stringify(COLS.map(c => r[c])) !== before) r.updated_at = stamp(); return { id: r.id, updated_at: r.updated_at }; });
      return { data: out, error: null };
    };
    const q = { eq(c, v){ filters.push([c, v]); return q; }, limit(n){ lim = n; return q; }, select(cols){ sel = cols; return q; }, then(f, r){ return Promise.resolve(run()).then(f, r); } };
    return q;
  }
  srv.client = { from(table){ assert.equal(table, 'expenses'); return {
    select(cols){ return builder('select'); },
    update(p){ return builder('update', p); },
    upsert(p){ log.push('upsert'); const list = Array.isArray(p) ? p : [p]; const data = list.map(x => { const old = rows[x.id]; const nr = Object.assign({}, old || {}, x); delete nr.id; nr.id = x.id; const ch = !old || COLS.some(c => (old[c] === undefined ? null : old[c]) !== (x[c] === undefined ? null : x[c]) && c in x); if(ch || !old) nr.updated_at = stamp(); else nr.updated_at = old.updated_at; rows[x.id] = nr; return { id: x.id, updated_at: nr.updated_at }; });
      const res = { data, error: null }; const q = { select(){ return q; }, then(f, r){ return Promise.resolve(res).then(f, r); } }; return q; },
  }; } };
  srv.stamp = stamp; return srv;
}
const NAMES = ['recordKey', 'AMOUNT_MAX', 'isSyncableAmount', 'monoSourcePayload', 'editedAtPayload', 'expenseEditedAtValue', 'editedAtDiffers', 'isCloudWriteReady', 'isWriteBlocked', 'pushExpenseRecordPilot', 'linkedOwnerAccount', 'pushExpensesBatch', 'pullExpensesCore'];
function device(server, userId, skewMs, extra){
  const SkewDate = class extends Date { constructor(...a){ if(a.length) super(...a); else super(Date.now() + skewMs); } static now(){ return Date.now() + skewMs; } };
  const toasts = [];
  const g = { CLOUD_ENV: { env: 'mock' }, Date: SkewDate, isCloudSessionReady: () => true, getSupabaseClient: () => server.client, cloudSession: { user: { id: userId } }, cloudFamilyId: 'fam',
    expenses: [], installmentAccounts: [], saveExpenses: async function(){}, getSyncMarker: () => null, setSyncMarker: function(){}, applySyncMarker: q => q, pushOtherActorEvent: function(){}, recentlyPulledExpenseState: new Map(),
    RECORD_SYNC_PULSE_MS: 1, RECORD_SYNC_PULSE_COUNT: 1, RECORD_SYNC_DONE_MS: 1, populateMonths: function(){}, renderAll: function(){}, editingRecordKey: null,
    authorInfoFor: id => id === 'u2' ? { name: 'Оля', gender: 'f' } : (id === 'u1' ? { name: 'Андрій', gender: 'm' } : null), showToast: o => toasts.push(o), updateNotifBell: function(){}, openNotifArchive: function(){}, isNotifArchiveOpen: false,
    renderNotifArchive: function(){}, pluralUa: (n, f) => (n % 10 === 1 && n % 100 !== 11) ? f[0] : ((n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14)) ? f[1] : f[2]), fmt: n => n + ' ₴', isoToUaDateText: s => s.split('-').reverse().join('.'),
    document: { activeElement: null, querySelector: () => null }, localStorage: { getItem: () => null, setItem: function(){} }, authorFilled: false, NOTIF_ICON_SVG: { journal: ['ic-blue', '<svg></svg>'] }, escapeHtml: s => String(s), escapeAttr: s => String(s), safeId: s => String(s) };
  Object.assign(g, extra || {});
  const c = buildSandbox(g, NAMES.concat(['conflictResolve']));
  c.__toasts = toasts; return c;
}
async function seedSynced(server, devs, id){
  // запис, створений на першому пристрої й підтягнутий іншими
  const [a, ...rest] = devs;
  const first = { id, name: 'Футбол', amount: 100, date: '2026-10-10', category: 'Спорт', subcategory: '', createdAt: T0, updatedAt: T0 };
  a.expenses.push(first);
  await a.pushExpenseRecordPilot(first, { suppressPull: true });
  for(const d of rest) await d.pullExpensesCore();
}
function edit(dev, id, patch){ const r = dev.expenses.find(e => e.id === id); Object.assign(r, patch); let at = new dev.Date().toISOString(); if(at <= r.updatedAt) at = new dev.Date(Date.parse(r.updatedAt) + 1).toISOString(); r.updatedAt = at; return r; }

test('різні поля зливаються мовчки: моя сума й чужа назва → обидві на сервері, конфліктів нема; push лише моє поле', async () => {
  const s = makeServer(); const A = device(s, 'u1', 0), B = device(s, 'u2', 0);
  await seedSynced(s, [A, B], 'e1');
  edit(A, 'e1', { amount: 120 }); // офлайн
  edit(B, 'e1', { name: 'Футбол-2' }); await B.pushExpenseRecordPilot(B.expenses[0], { suppressPull: true });
  s.log.length = 0;
  await A.pullExpensesCore();
  assert.equal(A.conflictLog.length, 0, 'конфліктів нема');
  assert.equal(A.expenses[0].name, 'Футбол-2'); assert.equal(A.expenses[0].amount, 120);
  assert.deepEqual(s.log, ['select', 'update'], 'один pull і один умовний update');
  assert.equal(s.rows.e1.amount, 120); assert.equal(s.rows.e1.note, 'Футбол-2');
  assert.equal(A.shadowDirtyNew(A.expenses[0]), false, 'після push запис чистий');
});
for(const skew of [86400000, -86400000]){
  test('те саме поле (годинник першого ±1 доба = ' + skew + '): лишається значення, що раніше потрапило на сервер; у журналі моє значення; «Повернути моє» застосовує як нову правку', async () => {
    const s = makeServer(); const A = device(s, 'u1', skew), B = device(s, 'u2', 0);
    await seedSynced(s, [A, B], 'e1');
    edit(A, 'e1', { amount: 120 }); // офлайн, мій годинник зсунуто
    edit(B, 'e1', { amount: 150 }); await B.pushExpenseRecordPilot(B.expenses[0], { suppressPull: true });
    s.log.length = 0;
    await A.pullExpensesCore();
    assert.equal(A.expenses[0].amount, 150, 'порядок визначає сервер, а не годинник');
    assert.equal(s.rows.e1.amount, 150); assert.ok(!s.log.includes('update') && !s.log.includes('upsert'), 'нічого не перезаписано');
    assert.equal(A.conflictLog.length, 1);
    const e = A.conflictLog[0];
    assert.deepEqual([e.kind, e.field, e.mine, e.theirs, e.status, e.actor], ['field', 'amount', 120, 150, 'open', 'Оля']);
    const m = A.conflictModel(e);
    assert.equal(m.title, 'Футбол: Оля вже змінила суму');
    assert.deepEqual(j(m.rows), [['Зараз у записі', '150 ₴'], ['Ваше значення', '120 ₴']]); assert.equal(m.body, '');
    assert.deepEqual([m.primary, m.secondary], ['Повернути моє', 'Лишити 150 ₴']);
    await A.conflictResolve(e.id, 'mine');
    assert.equal(e.status, 'mine'); assert.equal(A.expenses[0].amount, 120); assert.equal(A.conflictDoneModel(e).title, 'Футбол: ви повернули 120 ₴');
    await new Promise(r => setTimeout(r, 5)); // push, запущений без await
    assert.equal(s.rows.e1.amount, 120, 'моє значення — нова звичайна правка на сервері');
  });
}
test('«Лишити 150 ₴» закриває конфлікт без змін; запис, змінений ще раз, не перезаписується («Запис уже змінено»)', async () => {
  const s = makeServer(); const A = device(s, 'u1', 0), B = device(s, 'u2', 0);
  await seedSynced(s, [A, B], 'e1');
  edit(A, 'e1', { amount: 120 }); edit(B, 'e1', { amount: 150 }); await B.pushExpenseRecordPilot(B.expenses[0], { suppressPull: true });
  await A.pullExpensesCore();
  const e = A.conflictLog[0];
  await A.conflictResolve(e.id, 'kept'); assert.equal(e.status, 'kept'); assert.equal(A.expenses[0].amount, 150); assert.equal(A.conflictDoneModel(e).title, 'Футбол: лишили 150 ₴');
  // другий конфлікт, потім запис змінюють ще раз
  edit(A, 'e1', { amount: 90 }); edit(B, 'e1', { amount: 200 }); await B.pushExpenseRecordPilot(B.expenses[0], { suppressPull: true }); await A.pullExpensesCore();
  const e2 = A.conflictLog[1]; assert.equal(e2.mine, 90);
  A.expenses[0].amount = 777; A.expenses[0].updatedAt = new A.Date().toISOString(); // змінено ще раз
  await A.conflictResolve(e2.id, 'mine');
  assert.equal(e2.status, 'changed'); assert.equal(A.expenses[0].amount, 777);
  assert.equal(A.conflictDoneModel(e2).title, 'Запис «Футбол» уже змінено'); assert.equal(A.conflictDoneModel(e2).body, 'Ваше значення 90 ₴ не застосовано, бо запис змінили ще раз.');
});
test('видалення іншою людиною проти моєї правки: запис видалений, є сповіщення; «Відновити» знімає видалення й застосовує правку; «Лишити видаленим» закриває', async () => {
  const s = makeServer(); const A = device(s, 'u1', 0), B = device(s, 'u2', 0);
  await seedSynced(s, [A, B], 'e1');
  edit(A, 'e1', { amount: 120 });
  edit(B, 'e1', { deletedAt: new B.Date().toISOString() }); await B.pushExpenseRecordPilot(B.expenses[0], { suppressPull: true });
  await A.pullExpensesCore();
  assert.ok(A.expenses[0].deletedAt, 'видалення застосовано локально');
  const e = A.conflictLog[0]; assert.equal(e.kind, 'deleted');
  const m = A.conflictModel(e);
  assert.deepEqual([m.title, m.body, m.primary, m.secondary], ['Оля видалила запис «Футбол»', 'Ви змінювали його без мережі. Можна відновити запис із вашою правкою.', 'Відновити', 'Лишити видаленим']);
  await A.conflictResolve(e.id, 'mine'); await new Promise(r => setTimeout(r, 5));
  assert.equal(A.expenses[0].deletedAt, undefined); assert.equal(A.expenses[0].amount, 120);
  assert.equal(s.rows.e1.deleted_at, null); assert.equal(s.rows.e1.amount, 120);
  // інший запис: лишити видаленим
  await seedSynced(s, [A, B], 'e2'); edit(A, 'e2', { amount: 5 }); edit(B, 'e2', { deletedAt: new B.Date().toISOString() }); await B.pushExpenseRecordPilot(B.expenses.find(x => x.id === 'e2'), { suppressPull: true }); await A.pullExpensesCore();
  const e2 = A.conflictLog.find(x => x.rid === 'e2'); await A.conflictResolve(e2.id, 'kept'); assert.equal(e2.status, 'kept'); assert.ok(A.expenses.find(x => x.id === 'e2').deletedAt);
});
test('звичайна правка без додаткових запитів: рівно один update; серверна версія з мікросекундами використовується в умові наступного push', async () => {
  const s = makeServer(); const A = device(s, 'u1', 0); await seedSynced(s, [A], 'e1'); s.log.length = 0;
  edit(A, 'e1', { amount: 130 }); await A.pushExpenseRecordPilot(A.expenses[0], { suppressPull: true });
  assert.deepEqual(s.log, ['update']);
  assert.equal(A.expenses[0].serverUpdatedAt, s.rows.e1.updated_at); assert.ok(/\.\d{6}\+00:00$/.test(A.expenses[0].serverUpdatedAt));
  edit(A, 'e1', { amount: 140 }); await A.pushExpenseRecordPilot(A.expenses[0], { suppressPull: true });
  assert.deepEqual(s.log, ['update', 'update']); assert.equal(s.rows.e1.amount, 140);
});
test('конфлікт при push: один GET цього рядка, потрійне злиття, повторний push решти (update, select, update)', async () => {
  const s = makeServer(); const A = device(s, 'u1', 0), B = device(s, 'u2', 0);
  await seedSynced(s, [A, B], 'e1');
  edit(B, 'e1', { name: 'Інша назва' }); await B.pushExpenseRecordPilot(B.expenses[0], { suppressPull: true }); // A про це ще не знає
  s.log.length = 0;
  edit(A, 'e1', { amount: 125 }); const r = await A.pushExpenseRecordPilot(A.expenses[0], { suppressPull: true });
  assert.equal(r.success, true); assert.deepEqual(s.log, ['update', 'select', 'update'], 'один зайвий GET лише при конфлікті');
  assert.equal(s.rows.e1.amount, 125); assert.equal(s.rows.e1.note, 'Інша назва'); assert.equal(A.expenses[0].name, 'Інша назва'); assert.equal(A.conflictLog.length, 0);
});
test('правка під час push не губиться: зліпок = що надіслано, наступний push шле лише нову правку', async () => {
  const s = makeServer(); const A = device(s, 'u1', 0); await seedSynced(s, [A], 'e1');
  edit(A, 'e1', { amount: 130 });
  s.onUpdate = () => edit(A, 'e1', { name: 'Нова назва' }); // користувач править, поки йде запит
  await A.pushExpenseRecordPilot(A.expenses[0], { suppressPull: true });
  const r = A.expenses[0];
  assert.equal(A.shadowDirtyNew(r), true, 'нова правка лишається брудною');
  assert.equal(r.serverBase.amount, 130); assert.equal(r.serverBase.name, 'Футбол', 'зліпок — те, що реально надіслано');
  s.log.length = 0; await A.pushExpenseRecordPilot(r, { suppressPull: true });
  assert.deepEqual(s.log, ['update']); assert.equal(s.rows.e1.note, 'Нова назва'); assert.equal(s.rows.e1.amount, 130); assert.equal(A.shadowDirtyNew(r), false);
});
test('три пристрої: Андрій і Оля правлять різне, третій приєднується; сервер у кінці має всі зміни, конфліктів нема', async () => {
  const s = makeServer(); const A = device(s, 'u1', 86400000), B = device(s, 'u2', -86400000), C = device(s, 'u1', 0);
  await seedSynced(s, [A, B, C], 'e1');
  edit(A, 'e1', { amount: 111 }); edit(B, 'e1', { category: 'Освіта' }); edit(C, 'e1', { date: '2026-10-12' });
  for(const d of [B, A, C]){ await d.pullExpensesCore(); await d.pushExpensesBatch(d.expenses.filter(r => d.shadowDirtyNew(r))); }
  for(const d of [A, B, C]) await d.pullExpensesCore();
  assert.deepEqual([s.rows.e1.amount, s.rows.e1.category, s.rows.e1.expense_date], [111, 'Освіта', '2026-10-12']);
  [A, B, C].forEach(d => { assert.equal(d.conflictLog.length, 0); assert.deepEqual([d.expenses[0].amount, d.expenses[0].category, d.expenses[0].date], [111, 'Освіта', '2026-10-12']); });
});
test('сценарій Rev 187 і завершальний pull: «чистий» запис із «новішим» годинником приймає серверний рядок, pull чистого запису нічого не надсилає', async () => {
  const s = makeServer(); const A = device(s, 'u1', 86400000), B = device(s, 'u2', 0);
  await seedSynced(s, [A, B], 'e1');
  edit(B, 'e1', { amount: 150 }); await B.pushExpenseRecordPilot(B.expenses[0], { suppressPull: true });
  const r = A.expenses[0]; r.updatedAt = '2099-01-01T00:00:00.000Z'; r.syncedUpdatedAt = r.updatedAt; // надіслана версія з «майбутнім» годинником
  s.log.length = 0; await A.pullExpensesCore();
  assert.equal(r.amount, 150); assert.deepEqual(s.log, ['select'], 'лише читання, без push');
  s.log.length = 0; await A.pullExpensesCore(); assert.deepEqual(s.log, ['select']);
});
test('нові записи й записи без зліпка (старий формат) ідуть попереднім шляхом upsert: нових запитів немає', async () => {
  const s = makeServer(); const A = device(s, 'u1', 0);
  A.expenses.push({ id: 'n1', name: 'Нова', amount: 10, date: '2026-10-10', category: '', subcategory: '', createdAt: T0, updatedAt: T0 });
  await A.pushExpenseRecordPilot(A.expenses[0], { suppressPull: true }); assert.deepEqual(s.log, ['upsert']);
  assert.ok(A.expenses[0].serverBase && A.expenses[0].serverUpdatedAt);
  const legacy = { id: 'o1', name: 'Стара', amount: 5, date: '2026-10-10', category: '', subcategory: '', createdAt: T0, updatedAt: T0, syncedUpdatedAt: T0 }; // є syncedUpdatedAt, зліпка нема
  s.log.length = 0; A.expenses.push(legacy); await A.pushExpenseRecordPilot(legacy, { suppressPull: true }); assert.deepEqual(s.log, ['upsert']);
});
test('журнал конфліктів: 14 днів, чиста міграція зліпка, групова картка, відкладення за відкритого редагування', async () => {
  const s = makeServer(); const A = device(s, 'u1', 0);
  const now = Date.now();
  A.conflictLog.push({ id: 'old', at: now - 15 * 86400000, status: 'open' }, { id: 'fresh', at: now - 13 * 86400000, status: 'open' });
  A.conflictPrune(now); assert.deepEqual(j(A.conflictLog.map(x => x.id)), ['fresh']);
  const clean = { id: 'c', name: 'Х', amount: 1, date: '2026-10-10', category: '', subcategory: '', updatedAt: T0, syncedUpdatedAt: T0 };
  A.expenses.push(clean); A.expMigrateBase(); assert.equal(clean.serverBase.amount, 1); assert.equal(clean.serverUpdatedAt, T0);
  // групова картка
  A.conflictLog.length = 0; A.conflictAnnounce.length = 0;
  A.conflictLog.push({ id: 'k1', rid: 'a', kind: 'field', field: 'amount', mine: 1, theirs: 2, name: 'П', actor: 'Оля', gender: 'f', at: now, status: 'open' }, { id: 'k2', rid: 'b', kind: 'field', field: 'name', mine: 'а', theirs: 'б', name: 'Р', actor: 'Оля', gender: 'f', at: now, status: 'open' });
  A.conflictAnnounce.push('k1', 'k2');
  A.editingRecordKey = 'x'; A.conflictFlushCards(); assert.equal(A.__toasts.length, 0, 'відкрите редагування не перебиваємо');
  A.editingRecordKey = null; A.conflictFlushCards();
  assert.equal(A.__toasts.length, 1); assert.equal(A.__toasts[0].title, 'Оля змінила 2 записи, які ви теж правили'); assert.equal(A.__toasts[0].subtitle, 'Ваші значення не збережено, їх можна повернути в сповіщеннях.');
  assert.deepEqual(j(A.__toasts[0].actions.map(a => a.label)), ['Переглянути']); assert.equal(A.__toasts[0].sticky, true);
  assert.equal(A.conflictOpenCount(), 2);
  // кнопки журналу лише поки не оброблено
  assert.ok(/data-conflict-act="mine"/.test(A.conflictSectionHtml()));
  A.conflictLog.forEach(x => { x.status = 'kept'; }); assert.ok(!/data-conflict-act/.test(A.conflictSectionHtml()));
});
test('джерело: умовний update лише змінених полів з умовою на серверний updated_at, без нових запитів поза конфліктом; журнал очищається при виході; значок рахує відкриті конфлікти', () => {
  assert.match(SRC, /client\.from\('expenses'\)\.update\(payload\)\.eq\('id', rec\.id\)\.eq\('updated_at', rec\.serverUpdatedAt\)\.select\('id,updated_at'\)/);
  assert.match(SRC, /accountLocalStorageKeys[\s\S]{0,400}LS_KEY_CONFLICTS/);
  assert.match(SRC, /unreadBadge\(unreadAll\)/);
  assert.ok(!/localTime\s*[<>]=?\s*cloudTime[^\n]*(localRev|syncedRev)/.test(SRC));
  assert.ok(!/conflict[A-Za-z]*\([^)]*\)[^\n]*(backdrop-filter)/.test(SRC), 'без нових стилів і скла');
});

test('запис, відкритий для редагування, не змінюється під руками: маркер не просувається, після закриття рядок прийде знову', async () => {
  const s = makeServer(); const A = device(s, 'u1', 0), B = device(s, 'u2', 0);
  let marker = 'none'; A.setSyncMarker = function(){ marker = 'set'; };
  await seedSynced(s, [A, B], 'e1');
  edit(B, 'e1', { amount: 150 }); await B.pushExpenseRecordPilot(B.expenses[0], { suppressPull: true });
  A.editingRecordKey = 'expense:e1'; marker = 'none';
  await A.pullExpensesCore();
  assert.equal(A.expenses[0].amount, 100, 'не змінено'); assert.equal(marker, 'none', 'маркер не просунуто');
  A.editingRecordKey = null; await A.pullExpensesCore(); assert.equal(A.expenses[0].amount, 150);
});

// ---- Rev 2.32.195 (SYNC-SLOT): індикатор у слоті, відлуння, фази pull без повторного рендера ----
function fakeSlot(id){
  const attrs = { 'data-sync-id': id, 'data-s': '' }; const cls = new Set();
  return { innerHTML: '', attrs, cls, getAttribute: k => (k in attrs ? attrs[k] : null), setAttribute(k, v){ attrs[k] = String(v); }, removeAttribute(k){ delete attrs[k]; }, classList: { add: c => cls.add(c), remove: c => cls.delete(c), contains: c => cls.has(c) } };
}
function timers(){
  let now = 0; const q = []; let n = 0;
  return { now: () => now, setTimeout(f, ms){ q.push({ at: now + ms, f, id: ++n }); return n; }, clearTimeout(id){ const i = q.findIndex(x => x.id === id); if(i >= 0) q.splice(i, 1); },
    advance(ms){ const to = now + ms; for(;;){ q.sort((a, b) => a.at - b.at); if(!q.length || q[0].at > to) break; const x = q.shift(); now = x.at; x.f(); } now = to; } };
}
function slotEnv(rows){
  const tm = timers(); const slot = fakeSlot('e1'); const rowsEls = rows || {};
  const document = { querySelectorAll: sel => (sel.indexOf('e1') >= 0 ? [slot] : []), querySelector: sel => { const m = sel.match(/data-rec-id="([^"]+)"/); return m ? rowsEls[m[1]] || null : null; } };
  const c = buildSandbox({ document, setTimeout: tm.setTimeout, clearTimeout: tm.clearTimeout, recentlyPulledExpenseState: new Map(), expSyncEntries: new Map() }, []);
  return { c, tm, slot };
}
test('індикатор: syncing не раніше 400 мс, pending не раніше 3 с; слот той самий вузол; після відповіді done → тримається 1,2 с → зникає 0,3 с', () => {
  const { c, tm, slot } = slotEnv();
  c.expSyncBegin('e1'); tm.advance(399); assert.equal(slot.getAttribute('data-s'), '', 'до 400 мс нічого');
  tm.advance(1); assert.equal(slot.getAttribute('data-s'), 'syncing');
  tm.advance(2599); assert.equal(slot.getAttribute('data-s'), 'syncing', 'pending не раніше 3 с');
  tm.advance(1); assert.equal(slot.getAttribute('data-s'), 'pending'); assert.equal(slot.getAttribute('aria-label'), 'Не синхронізовано');
  c.expSyncEnd('e1', true); assert.equal(slot.getAttribute('data-s'), 'done'); assert.equal(slot.getAttribute('aria-label'), 'Синхронізовано');
  tm.advance(1199); assert.equal(slot.getAttribute('data-fade'), null); tm.advance(1); assert.equal(slot.getAttribute('data-fade'), '1');
  tm.advance(300); assert.equal(slot.getAttribute('data-s'), ''); assert.equal(slot.innerHTML, '', 'вузол не перебудовується: SVG у слоті статичний');
});
test('індикатор: швидкий запит (до 400 мс) не блимає; syncing показується щонайменше 600 мс; невдача → pending', () => {
  const a = slotEnv(); a.c.expSyncBegin('e1'); a.tm.advance(200); a.c.expSyncEnd('e1', true); a.tm.advance(5000);
  assert.equal(a.slot.getAttribute('data-s'), '', 'без станів');
  const b = slotEnv(); b.c.expSyncBegin('e1'); b.tm.advance(400); assert.equal(b.slot.getAttribute('data-s'), 'syncing'); b.c.expSyncEnd('e1', true);
  assert.equal(b.slot.getAttribute('data-s'), 'syncing', 'ще не 600 мс'); b.tm.advance(599); assert.equal(b.slot.getAttribute('data-s'), 'syncing'); b.tm.advance(1); assert.equal(b.slot.getAttribute('data-s'), 'done');
  const f = slotEnv(); f.c.expSyncBegin('e1'); f.tm.advance(500); f.c.expSyncEnd('e1', false); assert.equal(f.slot.getAttribute('data-s'), 'pending', 'невдача: кільце зникає, pending');
});
test('похідний стан при рендері: «брудний» запис без запиту → pending лише після 3 с або офлайн; чистий — порожньо; слот завжди в розмітці', () => {
  const { c } = slotEnv(); const old = new Date(Date.now() - 10000).toISOString(), fresh = new Date().toISOString();
  c.cloudSession = { user: { id: 'u' } };
  assert.equal(c.expSyncStateFor({ id: 'e1', localRev: 2, syncedRev: 1, updatedAt: old }), 'pending');
  assert.equal(c.expSyncStateFor({ id: 'e1', localRev: 2, syncedRev: 1, updatedAt: fresh }), '', 'менше 3 с');
  assert.equal(c.expSyncStateFor({ id: 'e1', localRev: 1, syncedRev: 1, updatedAt: old }), '');
  const html = c.expSyncSlotHtml({ id: 'e1', localRev: 2, syncedRev: 1, updatedAt: old });
  assert.match(html, /class="sync-slot" data-sync-id="e1" data-s="pending" role="img" aria-label="Не синхронізовано"/);
  assert.match(c.expSyncSlotHtml({ id: 'e1', localRev: 1, syncedRev: 1, updatedAt: old }), /class="sync-slot" data-sync-id="e1" data-s=""><svg/);
});
test('геометрія індикатора: одна хмаринка з контура CLOUD_ICON_SVG для pending і syncing; кільце, коло й заливка концентричні (12,12 r 11); без transform-атрибутів; три дуги', () => {
  const { c } = slotEnv(); const svg = evalInSandbox(c, 'SYNC_SLOT_SVG.slot');
  const cloudD = SRC.match(/const CLOUD_ICON_SVG = '[^']*<path d="([^"]+)"/)[1];
  assert.equal(evalInSandbox(c, 'SYNC_SLOT_CLOUD_D'), cloudD, 'той самий контур, що в індикаторі профілю');
  assert.equal((svg.match(new RegExp('d="' + cloudD.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '"', 'g')) || []).length, 1, 'одна хмаринка на всі стани (масштаб і колір — CSS)');
  ['sl-fill', 'sl-close', 'sl-ring'].forEach(k => assert.match(svg, new RegExp('<circle class="' + k + '" cx="12" cy="12" r="11"')));
  assert.ok(!/ transform=/.test(svg), 'без атрибута transform');
  assert.match(svg, /stroke-dasharray="14 9\.03"/); assert.ok(Math.abs(3 * (14 + 9.03) - 2 * Math.PI * 11) < 0.05);
  assert.match(svg, /stroke-dasharray="69\.1"/); assert.match(svg, /d="M7\.2 12\.6l3\.2 3\.2 6\.2-6\.8" stroke="#fff" stroke-width="2\.2" stroke-dasharray="16"/);
  assert.match(svg, /viewBox="0 0 24 24"/);
});
test('«відлуння» власного запису: pull із тим самим updated_at не рендерить рядок, не підсвічує й не стартує індикатор; чужа зміна — один рендер, фази без renderAll', async () => {
  const s = makeServer(); let renders = 0; const tm = timers();
  const mk = (id, skew) => device(s, id, skew, { getSyncMarker: () => 'm', renderAll: () => { renders++; }, setTimeout: tm.setTimeout, clearTimeout: tm.clearTimeout });
  const A = mk('u1', 0), B = mk('u2', 0);
  const first = { id: 'e1', name: 'Футбол', amount: 100, date: '2026-10-10', category: 'Спорт', subcategory: '', createdAt: T0, updatedAt: T0 };
  A.expenses.push(first); await A.pushExpenseRecordPilot(first, { suppressPull: true });
  renders = 0; await A.pullExpensesCore(); // відлуння
  assert.equal(renders, 0, 'рядок не рендериться'); assert.equal(A.recentlyPulledExpenseState.size, 0, 'підсвітки нема'); assert.equal(A.shadowDirtyNew(first), false);
  await B.pullExpensesCore(); // новий запис на другому пристрої: один рендер, підсвітка
  assert.equal(B.recentlyPulledExpenseState.get('e1'), 'syncing');
  const r0 = renders; tm.advance(800 * 3 + 600 + 2000);
  assert.equal(renders, r0, 'фази підсвітки не рендерять список повторно');
  assert.equal(B.recentlyPulledExpenseState.size, 0);
});
test('джерело: слот лише для витрат, reduced-motion, токени, переходи за макетом, картка без «не збережено»', () => {
  assert.match(SRC, /\$\{isIncome \? justPulledBadgeHtml : expSyncSlotHtml\(e\)\}/);
  assert.match(SRC, /@media \(prefers-reduced-motion: reduce\)\{ \.sync-slot \.sl-ring\{ animation:none; \}/);
  const css = SRC.slice(SRC.indexOf('.sync-slot{ display:inline-flex'), SRC.indexOf('/* ===== Rev 2.32.189 (CHECKS-1)'));
  assert.ok(!/#[0-9a-fA-F]{3,6}\b/.test(css), 'лише токени'); assert.match(css, /width:20px; height:20px/);
  assert.match(css, /animation:syncRing 1\.1s linear infinite/); assert.match(css, /transform:scale\(\.55\)/); assert.match(css, /stroke:var\(--color-error\)/); assert.match(css, /fill:var\(--color-success\)/); assert.match(css, /stroke:var\(--color-text-secondary\)/);
  assert.match(css, /transition:transform \.28s cubic-bezier\(\.3,1\.4,\.5,1\) \.2s/); assert.match(css, /transition:stroke-dashoffset \.35s ease/); assert.match(css, /transition:stroke-dashoffset \.26s ease \.38s/);
  assert.match(css, /\.sl-close\{[^}]*transform:rotate\(-90deg\)/); assert.match(css, /transform-box:fill-box; transform-origin:center/);
  assert.ok(!/dashed|dotted/.test(css));
  assert.ok(!/не збережено/.test(SRC.slice(SRC.indexOf('function conflictModel'), SRC.indexOf('function conflictDoneModel'))));
  const b = SRC.slice(SRC.indexOf('function conflictRowsHtml'), SRC.indexOf('function conflictRowsNode')); assert.match(b, /min-height:44px/);
  assert.match(SRC, /kind: 'error', icon: 'cloud', sticky: true, compact: true/); assert.match(SRC, /el\.style\.padding = '14px 16px'/);
});

// bbox контура хмаринки: семплінг дуг SVG (endpoint → center параметризація)
function pathBBox(d){
  const tok = d.match(/[A-Za-z]|-?\d*\.?\d+/g); let i = 0, x = 0, y = 0, cmd = ''; const pts = [];
  const num = () => parseFloat(tok[i++]);
  while(i < tok.length){
    if(/[A-Za-z]/.test(tok[i])) cmd = tok[i++];
    if(cmd === 'M' || cmd === 'L'){ x = num(); y = num(); pts.push([x, y]); }
    else if(cmd === 'A'){
      const rx = num(), ry = num(), rot = num(), fa = num(), fs = num(), ex = num(), ey = num(); const r = rx;
      const mx = (x - ex) / 2, my = (y - ey) / 2, d2 = mx * mx + my * my; let co = Math.sqrt(Math.max(0, r * r / d2 - 1)); if(fa === fs) co = -co;
      const cx = (x + ex) / 2 + co * my, cy = (y + ey) / 2 - co * mx;
      let a0 = Math.atan2(y - cy, x - cx), a1 = Math.atan2(ey - cy, ex - cx); if(fs && a1 < a0) a1 += 2 * Math.PI; if(!fs && a1 > a0) a1 -= 2 * Math.PI;
      for(let k = 0; k <= 200; k++){ const a = a0 + (a1 - a0) * k / 200; pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
      x = ex; y = ey;
    }else if(cmd === 'Z') break;
  }
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
}
test('знак оклику: x = x-центр хмаринки (±0,1), висота ≈45 % висоти хмаринки, оптично по центру з підйомом, зазор крапка–нижній край ≥ 2,5; контур у pending і syncing той самий', () => {
  const { c } = slotEnv();
  const d = evalInSandbox(c, 'SYNC_SLOT_CLOUD_D'), bang = evalInSandbox(c, 'SYNC_SLOT_BANG');
  const bb = pathBBox(d); const cx = (bb.x0 + bb.x1) / 2, h = bb.y1 - bb.y0;
  const bar = bang.match(/M([\d.]+) ([\d.]+)v([\d.]+)/), dot = bang.match(/M([\d.]+) ([\d.]+)h\.01/);
  assert.ok(Math.abs(Number(bar[1]) - cx) <= 0.1, 'x рисочки = ' + cx); assert.ok(Math.abs(Number(dot[1]) - cx) <= 0.1, 'x крапки');
  const top = Number(bar[2]), dotY = Number(dot[2]); const total = dotY - top; // довжина по осі штриху
  assert.ok(Math.abs(total / h - 0.45) < 0.03, 'висота знака ≈ 45 %: ' + (total / h));
  const mid = (top + dotY) / 2, bodyMid = (bb.y0 + bb.y1) / 2; assert.ok(Math.abs((bodyMid - mid) - 0.5) < 0.1, 'підйом ≈ 0,5');
  const gap = (bb.y1 - 1.9 / 2) - (dotY + 1.9 / 2); assert.ok(gap >= 2.5, 'зазор ' + gap);
  const slot = evalInSandbox(c, 'SYNC_SLOT_SVG.slot'), pending = evalInSandbox(c, 'SYNC_SLOT_SVG.pending');
  assert.ok(slot.includes('d="' + d + '"') && pending.includes('d="' + d + '"'), 'один контур');
  assert.ok(slot.includes(bang) && pending.includes(bang), 'одне джерело розмітки знака (слот і картка конфлікту)');
  assert.match(SRC, /<path d="' \+ SYNC_SLOT_CLOUD_D \+ '"\/>' \+ SYNC_SLOT_BANG \+ '<\/svg>',\n  journal/, 'тост конфлікту бере той самий SYNC_SLOT_BANG');
});
