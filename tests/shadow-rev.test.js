// Rev 2.32.192 (SHADOW-REV, клас C): тіньовий облік серверної версії: серверний рядок без втрати мікросекунд; правка під час push не губиться; нове й старе правило збігаються в стандартних сценаріях;
// міграція 0/0 і 1/0; завершальний pull не запускається без реальної зміни; нових запитів немає; діагностика rev-diff вимкнена за замовчуванням.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildSandbox } = require('./extract');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const j = v => JSON.parse(JSON.stringify(v));
const T0 = '2026-10-15T10:00:00.000Z', T1 = '2026-10-15T11:00:00.000Z';
const SRV = '2026-10-28T12:04:12.961234+00:00'; // мікросекунди сервера

test('міграція: «чисті» за старим правилом отримують 0/0, решта 1/0; ніколи не синхронізований запис у save не чіпається', () => {
  const c = buildSandbox({}, []);
  const clean = { id: 'a', updatedAt: T0, syncedUpdatedAt: T0 }, dirty = { id: 'b', updatedAt: T1, syncedUpdatedAt: T0 }, fresh = { id: 'c', updatedAt: T0 };
  c.shadowNormalize(clean); c.shadowNormalize(dirty);
  assert.deepEqual([clean.localRev, clean.syncedRev, dirty.localRev, dirty.syncedRev], [0, 0, 1, 0]);
  const list = [{ id: 'x', updatedAt: T0 }]; c.shadowNormalizeList(list);
  assert.deepEqual(j(list), [{ id: 'x', updatedAt: T0 }], 'без синхронізації сховище не змінюється');
  c.shadowNormalize(fresh); assert.deepEqual([fresh.localRev, fresh.syncedRev], [1, 0], 'перший push нормалізує');
  const m = { k: { month: '2026-10', updatedAt: T0, syncedUpdatedAt: T0 }, n: { month: '2026-10', updatedAt: T0 } }; c.shadowNormalizeMap(m);
  assert.equal(m.k.localRev, 0); assert.equal(m.n.localRev, undefined);
});
test('локальна правка збільшує localRev; прийняття рядка з сервера (pull) вирівнює syncedRev і записує серверну версію; повторна нормалізація нічого не змінює', () => {
  const c = buildSandbox({}, []);
  const r = { updatedAt: T0, syncedUpdatedAt: T0 }; c.shadowNormalize(r);
  r.updatedAt = T1; c.shadowNormalize(r);
  assert.deepEqual([r.localRev, r.syncedRev], [1, 0]); c.shadowNormalize(r); assert.equal(r.localRev, 1, 'ідемпотентно');
  r.updatedAt = SRV; r.syncedUpdatedAt = SRV; c.shadowNormalize(r); // pull прийняв серверний рядок
  assert.deepEqual([r.localRev, r.syncedRev, r.serverUpdatedAt], [1, 1, SRV]);
});
test('серверний updated_at зберігається рядком без втрати мікросекунд; не-рядок і порожнє ігнорується; пакет шукає за id', () => {
  const c = buildSandbox({}, []); const r = {};
  c.shadowSetServer(r, SRV); assert.equal(r.serverUpdatedAt, SRV); assert.ok(r.serverUpdatedAt.includes('.961234'));
  c.shadowSetServer(r, null); c.shadowSetServer(r, 123); c.shadowSetServer(r, ''); assert.equal(r.serverUpdatedAt, SRV);
  assert.equal(c.shadowServerAt([{ id: 'a', updated_at: SRV }, { id: 'b', updated_at: 'x' }], 'a'), SRV); assert.equal(c.shadowServerAt(null, 'a'), null); assert.equal(c.shadowServerAt([], 'a'), null);
  const roundTrip = JSON.parse(JSON.stringify(r)); assert.equal(roundTrip.serverUpdatedAt, SRV);
});
test('правка під час push не губиться: syncedRev не доганяє, поки localRev змінився після знімка', () => {
  const c = buildSandbox({}, []);
  const r = { updatedAt: T0 }; // новий запис
  const snap = c.shadowSnap(r); assert.equal(snap, 1);
  r.updatedAt = T1; // користувач правив під час запиту
  c.shadowAfterPush(r, snap);
  assert.deepEqual([r.localRev, r.syncedRev], [2, 0], 'нова правка лишається «брудною» за новим правилом');
  const ok = { updatedAt: T0 }; const s2 = c.shadowSnap(ok); c.shadowAfterPush(ok, s2); assert.deepEqual([ok.localRev, ok.syncedRev], [1, 1]);
});
// --- справжні push-функції на фейковому сервері: нове й старе правило збігаються, серверна версія зберігається, нових запитів немає ---
function pushSandbox(){
  const calls = []; let n = 0;
  const client = { from(table){ return { upsert(payload){ calls.push({ table, selected: null });
    const rows = (Array.isArray(payload) ? payload : [payload]).map(p => ({ id: p.id, updated_at: SRV.replace('961234', String(961234 + (++n))) }));
    const res = { data: rows, error: null }; const q = { select(cols){ calls[calls.length - 1].selected = cols; return Promise.resolve(res); }, then(f, r){ return Promise.resolve(res).then(f, r); } }; return q; } }; } };
  const g = { CLOUD_ENV: { env: 'mock' }, isCloudSessionReady: () => true, getSupabaseClient: () => client, cloudSession: { user: { id: 'u1' } }, cloudFamilyId: 'fam', saveExpenses: async function(){}, pullExpensesCore: async function(){ calls.push({ table: 'PULL' }); }, installmentAccounts: [] };
  const c = buildSandbox(g, ['AMOUNT_MAX', 'isSyncableAmount', 'monoSourcePayload', 'editedAtPayload', 'expenseEditedAtValue', 'isCloudWriteReady', 'isWriteBlocked', 'pushExpenseRecordPilot', 'linkedOwnerAccount', 'pushExpensesBatch']);
  c.__calls = calls; return c;
}
const rec = over => Object.assign({ id: 'e1', name: 'Кава', amount: 100, date: '2026-10-10', category: 'К', subcategory: '', createdAt: T0, updatedAt: T0 }, over || {});
test('push витрати (запис і пакет): серверна версія (з мікросекундами) збережена, syncedRev = localRev, старе й нове правило «чисте»; той самий один запит (select лише колонки)', async () => {
  const c = pushSandbox(); const a = rec(), b = rec({ id: 'e2' }), d = rec({ id: 'e3' });
  await c.pushExpenseRecordPilot(a, { suppressPull: true }); await c.pushExpensesBatch([b, d]);
  [a, b, d].forEach(r => { assert.ok(/\.9612\d\d\+00:00$/.test(r.serverUpdatedAt), r.id + ' ' + r.serverUpdatedAt); assert.equal(r.localRev, r.syncedRev); assert.equal(c.shadowDirtyNew(r), c.shadowDirtyOld(r)); assert.equal(c.shadowDirtyNew(r), false); });
  assert.equal(c.__calls.length, 2, 'два запити (запис і пакет), нових немає'); assert.ok(c.__calls.every(x => x.selected === 'id,updated_at'));
  assert.deepEqual(j(c.shadowDiffCounts()), {}, 'розбіжностей немає');
});
test('push: фейк-клієнт без select (як у наявних тестах) працює; завершальний pull не викликається при suppressPull і без помилки не додає запитів', async () => {
  const upserts = []; const client = { from(){ return { upsert(p){ upserts.push(p); return Promise.resolve({ error: null }); } }; } };
  const c = buildSandbox({ CLOUD_ENV: { env: 'mock' }, isCloudSessionReady: () => true, getSupabaseClient: () => client, cloudSession: { user: { id: 'u1' } }, cloudFamilyId: 'fam', saveExpenses: async function(){}, pullExpensesCore: async function(){ throw new Error('pull не мав викликатись'); }, installmentAccounts: [] },
    ['AMOUNT_MAX', 'isSyncableAmount', 'monoSourcePayload', 'editedAtPayload', 'expenseEditedAtValue', 'isCloudWriteReady', 'isWriteBlocked', 'pushExpenseRecordPilot', 'linkedOwnerAccount']);
  const r = rec(); await c.pushExpenseRecordPilot(r, { suppressPull: true });
  assert.equal(upserts.length, 1); assert.equal(r.serverUpdatedAt, undefined); assert.equal(r.syncedUpdatedAt, r.updatedAt);
  assert.match(SRC, /if\(!anyError && localChanged\) await pullCategoriesCore\(\);/, 'завершальний pull лише якщо щось справді надсилалось (Rev 2.32.115 не змінено)');
  assert.equal((SRC.match(/if\(!anyError && localChanged\) await pull[A-Za-z]+Core\(\);/g) || []).length, 6);
});
test('нове й старе правило збігаються для 9 доменів: усі push-місця беруть серверну версію з відповіді (select id,updated_at), а рішення лишаються за часом', () => {
  assert.equal((SRC.match(/shadowAfterPush\(/g) || []).length >= 13, true, 'визначення + 12 push-місць (5 довідників, приховані, 3 записи, 3 пакети) викликають shadowAfterPush');
  ['categories', 'subcategories', 'dictionary', 'bank_accounts', 'installment_accounts'].forEach(t => assert.ok(new RegExp("from\\('" + t + "'\\)\\.update\\(\\{[^\\n]*\\.select\\('id,updated_at'\\)").test(SRC), t));
  ['expenses', 'incomes', 'debts', 'hidden_entities'].forEach(t => assert.ok(new RegExp("shadowRet\\(client\\.from\\('" + t + "'\\)\\.upsert\\(").test(SRC), t));
  assert.ok(!/serverUpdatedAt/.test(SRC.slice(SRC.indexOf('function isDirty('), SRC.indexOf('function isDirty(') + 200)), 'isDirty лишається за часом');
  assert.match(SRC, /function isStaleRecord\(r\)\{ return r\.syncedUpdatedAt !== r\.updatedAt; \}/);
  assert.match(SRC, /function isDirty\(entry\)\{\n  return !entry\.cloudId \|\| entry\.syncedUpdatedAt !== entry\.updatedAt;/);
  assert.ok(!/localTime\s*[<>]=?\s*cloudTime[^\n]*(localRev|syncedRev)/.test(SRC), 'рішення LWW за часом не чіпано');
});
test('діагностика rev-diff: за замовчуванням вимкнена; без увімкнення нічого не пише; лічильники лише за доменами (без id, назв, сум)', () => {
  const events = [];
  const g = { expenses: [{ id: 'a', updatedAt: T1, syncedUpdatedAt: T1, localRev: 5, syncedRev: 0, revAt: T1 }], incomes: [], debts: [], CATEGORIES: [], SUBCATEGORIES: [], DICTIONARY: [], bankAccounts: [], installmentAccounts: [], hiddenFrom: {}, syncDiag: (t, d) => events.push([t, d]) };
  const off = buildSandbox(Object.assign({ jsErrPersistOn: false, debugRecordingActive: true }, g), []);
  off.shadowDiffReport('x'); assert.deepEqual(events, []);
  const noRec = buildSandbox(Object.assign({ jsErrPersistOn: true, debugRecordingActive: false }, g), []); noRec.shadowDiffReport('x'); assert.deepEqual(events, []);
  const on = buildSandbox(Object.assign({ jsErrPersistOn: true, debugRecordingActive: true }, g), []); on.shadowDiffReport('sync-resume');
  assert.deepEqual(j(events), [['rev-diff', { diffTable: 'expenses', diffCount: 1, diffReason: 'sync-resume' }]]);
  const none = buildSandbox(Object.assign({ jsErrPersistOn: true, debugRecordingActive: true }, g, { expenses: [{ id: 'a', updatedAt: T1, syncedUpdatedAt: T1, localRev: 0, syncedRev: 0, revAt: T1 }] }), []); events.length = 0; none.shadowDiffReport('x'); assert.deepEqual(events, []);
  assert.ok(SRC.includes("'diffTable', 'diffCount', 'diffReason'"), 'поля в allowlist запису діагностики');
  assert.match(SRC, /shadowDiffReport\('sync-' \+ reason\);/); assert.match(SRC, /shadowDiffReport\('autosync'\);/);
});
