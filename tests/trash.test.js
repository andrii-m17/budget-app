// Rev 2.23.23 (6D.192, Ревізія D) — "Видалені дані": чисті функції списку,
// лічильника, сортування, блокування колізій, відмінювання.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildSandbox } = require('./extract');

const ctx = buildSandbox({}, [
  'TRASH_HIDDEN_LEGACY_EPOCH', 'TRASH_MONTHS_SHORT',
  'trashSortKey', 'buildTrashItems', 'trashCount', 'filterTrashItems', 'restoreBlockedReason',
  'pluralUa', 'pluralizeRecords', 'trashCascadeNote', 'formatTrashShortDate', 'formatTrashDeletedAt',
]);
const j = function(v){ return JSON.parse(JSON.stringify(v)); };

function baseState(){
  return {
    expenses: [
      { id: 'e1', name: 'Кава', amount: 74, date: '2026-09-30', category: 'Їжа', subcategory: 'Кафе', createdBy: 'u1', updatedBy: 'u2', deletedAt: '2026-10-01T06:20:00Z' },
      { id: 'e2', name: 'Живий', amount: 5, date: '2026-09-30' },
    ],
    incomes: [
      { id: 'i1', source: 'Зарплата Оля', amount: 1000, date: '2026-09-25', createdBy: 'u2', updatedBy: 'u2', deletedAt: '2026-10-02T08:00:00Z' },
    ],
    dictionary: [
      { id: 'w1', kw: 'кава', cat: 'Їжа', sub: 'Кафе', deletedAt: '2026-10-01T07:00:00Z' },                       // видалене окремо
      { id: 'w2', kw: 'чай', cat: 'Їжа', sub: 'Кафе', deletedAt: '2026-10-01T07:05:00Z', deletedVia: 'category' }, // каскад категорії
      { id: 'w3', kw: 'сік', cat: 'Їжа', sub: 'Кафе', deletedAt: '2026-10-01T07:06:00Z', deletedVia: 'subcategory' }, // каскад підкатегорії
      { id: 'w4', kw: 'жива', cat: 'Їжа', sub: '' },
    ],
    categories: [
      { name: 'Їжа', active: true, updatedAt: '2026-01-01T00:00:00Z' },
      { name: 'Старе', active: false, updatedAt: '2026-10-03T09:00:00Z' },
    ],
    subcategories: [
      { name: 'Кафе', category: 'Їжа', active: false, updatedAt: '2026-10-01T07:06:00Z' },                       // видалена окремо, категорія активна → показується
      { name: 'Каскадна', category: 'Старе', active: false, deactivatedVia: 'category', updatedAt: '2026-10-03T09:00:00Z' }, // каскад → ні
      { name: 'Сирота', category: 'Старе', active: false, updatedAt: '2026-10-03T09:00:00Z' },                    // категорія неактивна → ні
      { name: 'Жива', category: 'Їжа', active: true },
    ],
    hiddenFrom: {
      'card:Приват Банк': { month: '2026-10', updatedAt: '2026-10-04T10:00:00.000Z' },
      'installment:iPhone': { month: '2026-09', updatedAt: '1970-01-01T00:00:00.000Z' },                           // легасі: дати нема
      'card:Показана назад': { month: '2026-08', updatedAt: '2026-10-01T00:00:00Z', deletedAt: '2026-10-05T00:00:00Z' }, // tombstone = показано назад
    },
    bankAccounts: [{ name: 'Приват Банк' }, { name: 'Показана назад' }],
    installmentAccounts: [{ name: 'iPhone' }],
    debts: [{ id: 'd1', name: 'Борг', deletedAt: '2026-10-06T00:00:00Z' }], // борги НЕ показуються
  };
}

test('buildTrashItems: каскадні слова/підкатегорії окремо НЕ показуються; окремі — показуються; борги й "показані назад" картки — ні', () => {
  const items = j(ctx.buildTrashItems(baseState()));
  const keys = items.map(function(i){ return i.key; });
  assert.deepEqual(keys.slice().sort(), [
    'card:Приват Банк', 'category:Старе', 'expense:e1', 'income:i1', 'installment:iPhone', 'subcategory:Їжа|Кафе', 'word:w1',
  ].sort());
  assert.ok(!keys.includes('word:w2') && !keys.includes('word:w3'), 'слова, видалені каскадом, окремо не показуються');
  assert.ok(!keys.some(function(k){ return k.indexOf('Каскадна') !== -1 || k.indexOf('Сирота') !== -1; }), 'каскадна/осиротіла підкатегорії не показуються');
  assert.ok(!keys.some(function(k){ return k.indexOf('Показана назад') !== -1; }), 'hiddenFrom із deletedAt = картку показано назад');
  assert.ok(!items.some(function(i){ return i.title === 'Борг'; }), 'борги не показуються');
});
test('buildTrashItems: лічильник каскаду категорії/підкатегорії, автор і дата витрати, дата легасі-картки = null', () => {
  const items = j(ctx.buildTrashItems(baseState()));
  const cat = items.find(function(i){ return i.key === 'category:Старе'; });
  assert.equal(cat.cascadeSubs, 1);
  assert.equal(cat.cascadeWords, 0);
  const sub = items.find(function(i){ return i.type === 'subcategory'; });
  assert.equal(sub.cascadeWords, 1, 'слово, видалене каскадом підкатегорії');
  const exp = items.find(function(i){ return i.key === 'expense:e1'; });
  assert.equal(exp.deletedBy, 'u2');
  assert.equal(exp.createdBy, 'u1');
  assert.equal(exp.recordDate, '2026-09-30');
  const legacy = items.find(function(i){ return i.key === 'installment:iPhone'; });
  assert.equal(legacy.deletedAt, null, 'epoch-бекфіл = дата невідома');
  assert.equal(legacy.hiddenMonth, '2026-09');
});
test('buildTrashItems: прихована картка/ОЧ, якої вже нема серед рахунків, не показується', () => {
  const st = baseState();
  st.bankAccounts = [];
  const keys = j(ctx.buildTrashItems(st)).map(function(i){ return i.key; });
  assert.ok(!keys.includes('card:Приват Банк'));
  assert.ok(keys.includes('installment:iPhone'));
});
test('trashCount збігається з довжиною списку "Усі" (бейдж у Сервісі = кількість)', () => {
  const st = baseState();
  assert.equal(ctx.trashCount(st), j(ctx.buildTrashItems(st)).length);
  assert.equal(ctx.trashCount({}), 0);
  assert.equal(ctx.trashCount(undefined), 0);
});
test('сортування за датою видалення: найновіші згори, записи без дати — в кінці; trashSortKey', () => {
  const items = j(ctx.buildTrashItems(baseState()));
  const dates = items.map(function(i){ return ctx.trashSortKey(i); });
  const sorted = dates.slice().sort().reverse();
  assert.deepEqual(dates, sorted);
  assert.equal(items[0].key, 'card:Приват Банк');
  assert.equal(items[items.length - 1].key, 'installment:iPhone', 'без дати — останнім');
  assert.equal(ctx.trashSortKey({ deletedAt: '2026-10-01T00:00:00Z' }), '2026-10-01T00:00:00Z');
  assert.equal(ctx.trashSortKey({ deletedAt: null }), '');
});
test('filterTrashItems: Усі / Витрати / Доходи / Інше', () => {
  const items = ctx.buildTrashItems(baseState());
  assert.equal(j(ctx.filterTrashItems(items, 'all')).length, 7);
  assert.equal(j(ctx.filterTrashItems(items, 'expenses')).length, 1);
  assert.equal(j(ctx.filterTrashItems(items, 'incomes')).length, 1);
  assert.equal(j(ctx.filterTrashItems(items, 'other')).length, 5);
});
test('restoreBlockedReason: колізії назв і неактивні батьки блокують; витрати/доходи/картки — ні', () => {
  const st = baseState();
  const find = function(key){ return j(ctx.buildTrashItems(st)).find(function(i){ return i.key === key; }); };
  assert.ok(ctx.restoreBlockedReason(find('word:w1'), st).indexOf('підкатегорію «Кафе» видалено') === 0, 'підкатегорія слова ще видалена');
  st.subcategories[0].active = true;
  assert.equal(ctx.restoreBlockedReason(find('word:w1'), st), null, 'слово без колізії');
  st.dictionary.push({ id: 'w5', kw: 'кава', cat: 'Їжа', sub: '' });
  assert.equal(ctx.restoreBlockedReason(find('word:w1'), st), 'слово «кава» вже існує');
  const st2 = baseState();
  st2.dictionary[0].cat = 'Старе';
  assert.ok(ctx.restoreBlockedReason(j(ctx.buildTrashItems(st2)).find(function(i){ return i.key === 'word:w1'; }), st2).indexOf('категорію «Старе» видалено') === 0);
  const st3 = baseState();
  st3.categories.push({ name: 'Старе', active: true });
  assert.equal(ctx.restoreBlockedReason({ type: 'category', title: 'Старе' }, st3), 'категорія «Старе» вже існує');
  assert.equal(ctx.restoreBlockedReason({ type: 'subcategory', title: 'X', category: 'Старе' }, baseState()), 'категорію «Старе» видалено — спершу відновіть її');
  const st4 = baseState();
  st4.subcategories.push({ name: 'Кафе', category: 'Їжа', active: true });
  assert.equal(ctx.restoreBlockedReason({ type: 'subcategory', title: 'Кафе', category: 'Їжа' }, st4), 'підкатегорія «Кафе» вже існує');
  ['expense', 'income', 'card', 'installment'].forEach(function(t){ assert.equal(ctx.restoreBlockedReason({ type: t, title: 'x' }, baseState()), null, t); });
  assert.equal(ctx.restoreBlockedReason(null, baseState()), 'запис не знайдено');
});
test('pluralizeRecords: 1 запис, 2-4 записи, 5-20 записів, 21 запис, 22-24 записи, 25-30 записів, виняток 11-14', () => {
  const expected = { 0: '0 записів', 1: '1 запис', 2: '2 записи', 3: '3 записи', 4: '4 записи', 5: '5 записів', 10: '10 записів', 11: '11 записів', 12: '12 записів', 13: '13 записів', 14: '14 записів', 15: '15 записів', 20: '20 записів', 21: '21 запис', 22: '22 записи', 24: '24 записи', 25: '25 записів', 30: '30 записів', 101: '101 запис', 111: '111 записів', 112: '112 записів', 121: '121 запис' };
  Object.keys(expected).forEach(function(n){ assert.equal(ctx.pluralizeRecords(Number(n)), expected[n], n); });
});
test('trashCascadeNote: "Буде повернено: N підкатегорій і M слів" з правильним відмінюванням, частини з нулем пропускаються', () => {
  assert.equal(ctx.trashCascadeNote({ cascadeSubs: 2, cascadeWords: 3 }), 'Буде повернено: 2 підкатегорії і 3 слова');
  assert.equal(ctx.trashCascadeNote({ cascadeSubs: 1, cascadeWords: 5 }), 'Буде повернено: 1 підкатегорія і 5 слів');
  assert.equal(ctx.trashCascadeNote({ cascadeSubs: 0, cascadeWords: 1 }), 'Буде повернено: 1 слово');
  assert.equal(ctx.trashCascadeNote({ cascadeSubs: 5, cascadeWords: 0 }), 'Буде повернено: 5 підкатегорій');
  assert.equal(ctx.trashCascadeNote({ cascadeSubs: 0, cascadeWords: 0 }), '');
});
test('формат дат: "30 вер.", "1 жовт., 06:20"', () => {
  assert.equal(ctx.formatTrashShortDate('2026-09-30'), '30 вер.');
  assert.equal(ctx.formatTrashShortDate('2026-10-01'), '1 жовт.');
  assert.equal(ctx.formatTrashShortDate(''), '');
  const local = new Date(2026, 9, 1, 6, 20).toISOString();
  assert.equal(ctx.formatTrashDeletedAt(local), '1 жовт., 06:20');
  assert.equal(ctx.formatTrashDeletedAt(null), '');
});
test('джерело: подія trash-restore без назв і сум (лише trashType/ok), не використовується закритий view, "Видалити назавжди" ще немає (це Ревізія E)', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert.equal(src.indexOf('hidden_entities_readable'), -1, 'view закритий у Фазі 0 — клієнт його не використовує');
  const evts = src.match(/captureDebugGeometry\('trash-(open|restore)'[^;]*;/g) || [];
  assert.ok(evts.length >= 3);
  evts.forEach(function(e){ assert.equal(/title|name|amount|kw/.test(e.replace(/trashType/, '')), false, e); });
  assert.equal(src.indexOf('Видалити назавжди'), -1);
});
// Рев 2.23.23: перша версія цієї ревізії випадково ПЕРЕВИЗНАЧИЛА наявну
// pluralUa(n, forms) іншою сигнатурою (function-декларації в одному <script>
// мовчки перекривають одна одну — зламало б зведене сповіщення синхронізації).
// Охоронний тест: жодна top-level функція index.html не оголошена двічі.
test('index.html: жодна top-level function не оголошена двічі (мовчазне перекриття)', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const names = (src.match(/^(?:async )?function [A-Za-z0-9_]+\(/gm) || []).map(function(m){ return m.replace(/^(?:async )?function /, ''); });
  const seen = new Set(); const dups = new Set();
  names.forEach(function(n){ if(seen.has(n)) dups.add(n); seen.add(n); });
  assert.deepEqual(Array.from(dups), []);
});
