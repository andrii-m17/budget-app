// Rev 2.32.193 (MERGE-EXP, клас C+B): злиття поле за полем для витрат на фальшивому сервері й 2–3 «пристроях» із годинником ±1 доба.
// Різні поля зливаються мовчки; те саме поле лишає серверне значення й дає запис журналу конфліктів; видалення проти правки; правка під час push не губиться; мікросекунди; кількість запитів.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildSandbox } = require('./extract');
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
function device(server, userId, skewMs){
  const SkewDate = class extends Date { constructor(...a){ if(a.length) super(...a); else super(Date.now() + skewMs); } static now(){ return Date.now() + skewMs; } };
  const toasts = [];
  const g = { CLOUD_ENV: { env: 'mock' }, Date: SkewDate, isCloudSessionReady: () => true, getSupabaseClient: () => server.client, cloudSession: { user: { id: userId } }, cloudFamilyId: 'fam',
    expenses: [], installmentAccounts: [], saveExpenses: async function(){}, getSyncMarker: () => null, setSyncMarker: function(){}, applySyncMarker: q => q, pushOtherActorEvent: function(){}, recentlyPulledExpenseState: new Map(),
    RECORD_SYNC_PULSE_MS: 1, RECORD_SYNC_PULSE_COUNT: 1, RECORD_SYNC_DONE_MS: 1, populateMonths: function(){}, renderAll: function(){}, editingRecordKey: null,
    authorInfoFor: id => id === 'u2' ? { name: 'Оля', gender: 'f' } : (id === 'u1' ? { name: 'Андрій', gender: 'm' } : null), showToast: o => toasts.push(o), updateNotifBell: function(){}, openNotifArchive: function(){}, isNotifArchiveOpen: false,
    renderNotifArchive: function(){}, pluralUa: (n, f) => (n % 10 === 1 && n % 100 !== 11) ? f[0] : ((n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14)) ? f[1] : f[2]), fmt: n => n + ' ₴', isoToUaDateText: s => s.split('-').reverse().join('.'),
    document: { activeElement: null, querySelector: () => null }, localStorage: { getItem: () => null, setItem: function(){} }, authorFilled: false, NOTIF_ICON_SVG: { journal: ['ic-blue', '<svg></svg>'] }, escapeHtml: s => String(s), escapeAttr: s => String(s), safeId: s => String(s) };
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
    assert.equal(m.title, 'Оля вже змінила суму');
    assert.deepEqual(j(m.rows), [['Зараз у записі', '150 ₴', ''], ['Ваше значення', '120 ₴', 'не збережено']]); assert.equal(m.body, '');
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
