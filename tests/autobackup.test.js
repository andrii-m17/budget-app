// Rev 2.32.235 (RESTORE-SOURCES): автоматичні копії на пристрої — раз на день, 7 днів, «Перед відновленням» 14 діб, ліміт розміру.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildSandbox } = require('./extract');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const J = (x) => JSON.parse(JSON.stringify(x));

function fakeStore(){
  const metas = {}, blobs = {};
  return { metas, blobs,
    list: async () => J(Object.values(metas)), put: async (m, j) => { metas[m.id] = J(m); blobs[m.id] = j; }, get: async (id) => blobs[id], del: async (id) => { delete metas[id]; delete blobs[id]; } };
}
function env(rows){
  const exp = rows || 3;
  return buildSandbox({
    LS_KEY_EXP: 'e', LS_KEY_DEBT: 'd',
    buildBackupPayloadData: () => ({ e: JSON.stringify(Array.from({ length: exp }, (_, i) => ({ id: 'x' + i }))), d: JSON.stringify([{ id: 'd1' }, { id: 'd2', deletedAt: 'x' }]) }),
  }, ['abDailyOnce', 'abBeforeRestore', 'abCreate', 'abPlanPrune']);
}
const D = (s) => new Date(s);

test('щоденна копія: раз на день і не частіше; нова доба — нова копія; лічильники без видалених', async () => {
  const g = env(), st = fakeStore();
  const m1 = await g.abDailyOnce(st, D('2026-10-20T09:00:00'));
  assert.equal(m1.kind, 'daily'); assert.deepEqual(J(m1.counts), { expenses: 3, debts: 1 });
  assert.equal(await g.abDailyOnce(st, D('2026-10-20T18:30:00')), null, 'повторно того ж дня — ні');
  assert.equal(Object.keys(st.metas).length, 1);
  assert.ok(await g.abDailyOnce(st, D('2026-10-21T08:00:00')), 'наступного дня — так');
  assert.equal(Object.keys(st.metas).length, 2);
  assert.ok(JSON.parse(st.blobs[m1.id]).e, 'тіло — той самий формувач, що файл копії');
});
test('зберігається 7 останніх днів: восьма копія витісняє найстарішу', async () => {
  const g = env(), st = fakeStore();
  for(let d = 1; d <= 9; d++) await g.abDailyOnce(st, D('2026-10-0' + d + 'T09:00:00'));
  const days = Object.values(st.metas).map(m => m.dayKey).sort();
  assert.equal(days.length, 7); assert.equal(days[0], '2026-10-03'); assert.equal(days[6], '2026-10-09');
});
test('«Перед відновленням» створюється завжди й живе 14 діб, щоденні не чіпає', async () => {
  const g = env(), st = fakeStore();
  await g.abDailyOnce(st, D('2026-10-20T09:00:00'));
  const b = await g.abBeforeRestore(st, D('2026-10-20T10:00:00')); const b2 = await g.abBeforeRestore(st, D('2026-10-20T10:05:00'));
  assert.equal(b.kind, 'before'); assert.ok(b2); assert.equal(Object.keys(st.metas).length, 3);
  await g.abDailyOnce(st, D('2026-11-02T09:00:00')); // +13 діб від «Перед відновленням»
  assert.ok(st.metas[b.id], '13 діб — ще живе');
  await g.abDailyOnce(st, D('2026-11-03T11:00:00')); // +14 діб
  assert.ok(!st.metas[b.id] && !st.metas[b2.id], '14 діб — прибрано');
});
test('обмеження розміру: найстаріші щоденні йдуть першими, найновіша щоденна лишається; завелика копія не зберігається', () => {
  const g = env();
  const m = (id, kind, at, bytes) => ({ id, kind, at, dayKey: at.slice(0, 10), bytes });
  const metas = [m('a', 'daily', '2026-10-18T09:00:00.000Z', 10), m('b', 'daily', '2026-10-19T09:00:00.000Z', 10), m('c', 'daily', '2026-10-20T09:00:00.000Z', 10), m('z', 'before', '2026-10-20T10:00:00.000Z', 10)];
  assert.deepEqual(J(g.abPlanPrune(metas, D('2026-10-20T12:00:00Z'), 25)).sort(), ['a', 'b']);
  assert.deepEqual(J(g.abPlanPrune(metas, D('2026-10-20T12:00:00Z'), 5)).sort(), ['a', 'b', 'z'], 'найновіша щоденна не видаляється навіть понад ліміт');
  const big = buildSandbox({ LS_KEY_EXP: 'e', LS_KEY_DEBT: 'd', buildBackupPayloadData: () => ({ e: 'x'.repeat(31 * 1024 * 1024), d: '[]' }) }, ['abCreate']);
  return big.abCreate(fakeStore(), 'daily', new Date()).then(r => assert.equal(r, null));
});
test('форматування: дата, лічильники, відмінки, строк «зберігається до»', () => {
  const g = env(), now = D('2026-10-31T12:00:00');
  assert.equal(g.abDateText('2026-10-31T09:12:00', now), 'Сьогодні, 09:12');
  assert.equal(g.abDateText('2026-10-31T09:12:00', now, true), 'сьогодні, 09:12');
  assert.equal(g.abDateText('2026-10-30T09:01:00', now), '30 жовтня, 09:01');
  assert.equal(g.abCountsText({ expenses: 1166, debts: 71 }), '1 166 витрат · 71 борг');
  assert.equal(g.abCountsText({ expenses: 1151, debts: 69 }), '1 151 витрата · 69 боргів');
  assert.equal(g.abCountsText({ expenses: 2, debts: 3 }), '2 витрати · 3 борги');
  assert.equal(g.abExpiryText({ at: D('2026-10-31T14:20:00').toISOString() }), '14 листопада');
});
test('джерело: щоденний запуск після синхронізації й запасний таймер; сховище — IndexedDB, не localStorage; плитка веде в лист', () => {
  assert.match(SRC, /abDailySafe\(\); \/\/ Rev 2\.32\.235/);
  assert.match(SRC, /indexedDB\.open\(AB_DB, 1\)/);
  const block = SRC.slice(SRC.indexOf('function abStore()'), SRC.indexOf('function abDayKey'));
  assert.ok(!/localStorage/.test(block));
  assert.match(SRC, /class="service-tile" onclick="openRestoreSheet\(\)"/);
  assert.match(SRC, /Автоматичні копії з’являться після першого дня використання/);
  assert.match(SRC, /'Повернуто ' \+ sm\.total/);
});
