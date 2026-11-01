// Rev 2.32.234 (HIDDEN-ORPHANS): одноразове локальне прибирання залишків приховування за назвою для відсутніх ОЧ/карток.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildSandbox } = require('./extract');
const J = (x) => JSON.parse(JSON.stringify(x));

function dev(over){
  const ls = {}; const saves = [];
  const g = buildSandbox(Object.assign({
    localStorage: { getItem: k => Object.prototype.hasOwnProperty.call(ls, k) ? ls[k] : null, setItem: (k, v) => { ls[k] = String(v); } },
    bankAccounts: [{ name: 'Картка А', cloudId: 'b1' }], installmentAccounts: [{ name: 'Предмет Б', cloudId: 'i1' }],
    hiddenFrom: {},
    saveHiddenFromLocal: async function(){ saves.push(1); return { success: true }; },
  }, over || {}), ['cleanupOrphanHiddenOnce']);
  return { g, ls, saves };
}
test('старий запис за назвою для відсутньої ОЧ зникає; живі (за назвою й за id), записи зі зв\'язком із сервером і картки лишаються; без запису на сервер', async () => {
  const d = dev({ hiddenFrom: {
    'installment:Предмет А': { month: '2026-09', updatedAt: 'x' },          // ОЧ відсутня — прибрати
    'installment:Предмет Б': { month: '2026-09', updatedAt: 'x' },          // жива за назвою
    'installment:#i1': { month: '2026-09', updatedAt: 'x' },                // за id
    'installment:Предмет В': { month: '2026-09', updatedAt: 'x', serverUpdatedAt: 's' }, // пов'язаний із сервером
    'card:Картка А': { month: '2026-09', updatedAt: 'x' },                  // жива картка
    'card:Картка Г': { month: '2026-09', updatedAt: 'x' },                  // картки нема — прибрати
  } });
  assert.equal(await d.g.cleanupOrphanHiddenOnce(), 2);
  assert.deepEqual(Object.keys(J(d.g.hiddenFrom)).sort(), ['card:Картка А', 'installment:#i1', 'installment:Предмет Б', 'installment:Предмет В']);
  assert.equal(d.saves.length, 1, 'один локальний запис, push не викликається');
});
test('повторний запуск нічого не змінює (маркер); без завантажених рахунків нічого не видаляється, але маркер ставиться', async () => {
  const d = dev({ hiddenFrom: { 'installment:Предмет А': { month: '2026-09' } } });
  assert.equal(await d.g.cleanupOrphanHiddenOnce(), 1);
  d.g.hiddenFrom['installment:Предмет А'] = { month: '2026-09' };
  assert.equal(await d.g.cleanupOrphanHiddenOnce(), 0, 'за маркером'); assert.ok(d.g.hiddenFrom['installment:Предмет А']);
  const e = dev({ bankAccounts: [], installmentAccounts: [], hiddenFrom: { 'installment:Предмет А': { month: '2026-09' } } });
  assert.equal(await e.g.cleanupOrphanHiddenOnce(), 0); assert.ok(e.g.hiddenFrom['installment:Предмет А'], 'списки порожні — не чіпаємо');
});
test('м\'яко видалена ОЧ (deletedAt) не рахується живою', async () => {
  const d = dev({ installmentAccounts: [{ name: 'Предмет Б' }, { name: 'Предмет А', deletedAt: '2026-10-23T00:00:00.000Z' }], hiddenFrom: { 'installment:Предмет А': { month: '2026-09' } } });
  assert.equal(await d.g.cleanupOrphanHiddenOnce(), 1);
});
