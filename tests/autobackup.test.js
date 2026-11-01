// Rev 2.32.235 (RESTORE-SOURCES): лише копія «Перед відновленням» (14 діб, остання, IndexedDB); копій за розкладом немає.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildSandbox } = require('./extract');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const J = (x) => JSON.parse(JSON.stringify(x));
const D = (s) => new Date(s);

function fakeStore(){
  const metas = {}, blobs = {};
  return { metas, blobs, list: async () => J(Object.values(metas)), put: async (m, j) => { metas[m.id] = J(m); blobs[m.id] = j; }, get: async (id) => blobs[id], del: async (id) => { delete metas[id]; delete blobs[id]; } };
}
const env = (json) => buildSandbox({ buildBackupPayloadData: () => ({ e: json || '[1]' }) }, ['abBeforeRestore', 'abCurrent']);

test('«Перед відновленням» створюється перед відновленням і живе 14 діб; лишається лише остання', async () => {
  const g = env(), st = fakeStore();
  const a = await g.abBeforeRestore(st, D('2026-10-20T10:00:00Z'), 'file', 'до 5 жовтня, 09:00');
  assert.equal(a.kind, 'before'); assert.equal(a.source, 'file'); assert.equal(a.label, 'до 5 жовтня, 09:00');
  assert.deepEqual(J(JSON.parse(st.blobs[a.id])), { e: '[1]' }, 'тіло — той самий формувач, що файл копії');
  const b = await g.abBeforeRestore(st, D('2026-10-21T10:00:00Z'), 'undo');
  assert.deepEqual(Object.keys(st.metas), [b.id], 'старіша замінена новішою');
  assert.equal((await g.abCurrent(st, D('2026-11-04T09:59:00Z'))).id, b.id, '13 діб 23 год — ще живе');
  assert.equal(await g.abCurrent(st, D('2026-11-04T10:00:00Z')), null, '14 діб — прибрано');
  assert.deepEqual(Object.keys(st.metas), [], 'прострочена видалена зі сховища');
});
test('обмеження розміру: завелика копія не зберігається', async () => {
  const g = env('x'.repeat(31 * 1024 * 1024)), st = fakeStore();
  st.metas.old = { id: 'old', at: new Date().toISOString() }; st.blobs.old = '[]';
  assert.equal(await g.abBeforeRestore(st, new Date(), 'file'), null); assert.deepEqual(Object.keys(st.metas), [], 'стара копія теж прибрана');
});
test('форматування дат: завжди «число місяць, год:хв», строк = створення + 14 діб', () => {
  const g = buildSandbox({}, []);
  assert.equal(g.abDateText(D('2026-11-01T14:20:00').toISOString()), '1 листопада, 14:20');
  assert.equal(g.abExpiryText({ at: D('2026-11-01T14:20:00').toISOString() }), '15 листопада');
  assert.equal(g.abDateText(D('2026-10-31T09:05:00').toISOString()), '31 жовтня, 09:05');
});
test('копій за розкладом ніде немає: ні щоденних, ні фонового запуску, ні списку, ні рядка «Остання автоматична копія»', () => {
  ['abDailyOnce', 'abDailySafe', 'AB_DAILY_DAYS', 'renderBackupAutoStatus', 'backup-auto-status', 'Інші автоматичні копії', 'Остання автоматична копія', 'rsShowList', 'abPlanPrune'].forEach(w => assert.ok(!SRC.includes(w), w + ' прибрано'));
  assert.ok(!/localStorage/.test(SRC.slice(SRC.indexOf('function abStore()'), SRC.indexOf('const AB_MONTHS'))), 'сховище — IndexedDB, не localStorage');
  assert.match(SRC, /indexedDB\.open\(AB_DB, 1\)/);
});
test('плитка «Відновити» веде в openRestoreSheet; без копії одразу вибір файлу; з копією лист із двома рядками; тексти за макетом', () => {
  assert.match(SRC, /class="service-tile" onclick="openRestoreSheet\(\)"/);
  const body = SRC.slice(SRC.indexOf('async function openRestoreSheet()'), SRC.indexOf('function abPartnerName'));
  assert.match(body, /if\(!cur\)\{ triggerRestoreBackupInput\(\); return; \}/);
  ['Відновити з…', 'Повернути стан до відновлення', 'Файл із пристрою', 'Вибрати власну копію', 'Скасувати'].forEach(t => assert.ok(body.includes(t), t));
  ['Повернути дані до ', 'Повернути дані', 'Не треба', 'Нові й видалені лишаться як є.', 'Поточний стан збережемо на 14 днів: усе можна повернути назад.', 'Змінені відтоді записи стануть такими, як були. ', 'Змінені після створення файлу записи стануть такими, як були. '].forEach(t => assert.ok(SRC.includes(t), t));
  assert.ok(SRC.includes('щоб повернутись, оберіть «Відновити» → «Повернути стан до відновлення».'));
  assert.match(SRC, /'Повернуто ' \+ sm\.total/);
});
