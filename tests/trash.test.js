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
  'trashSortKey', 'trashTabOf', 'isMonthRecordType', 'restoreBlockedReasonForMonthRecord', 'buildTrashItems', 'trashCount', 'filterTrashItems', 'restoreBlockedReason',
  'TRASH_PURGEABLE_TYPES', 'canPurge', 'purgeBlockedReason', 'purgeConfirmText', 'trashTombstonesForReconcile', 'reconcilePlan', 'fmt',
  'pluralUa', 'pluralizeRecords', 'trashCascadeNote', 'formatTrashShortDate', 'formatTrashDeletedAt',
]);
const SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
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
test('filterTrashItems: Усі / Витрати / Борги / ОЧ / Інше (доходи лише в «Інше»)', () => {
  const items = ctx.buildTrashItems(baseState());
  const n = function(f){ return j(ctx.filterTrashItems(items, f)).length; };
  assert.equal(n('all'), 7);
  assert.equal(n('expenses'), 1);
  assert.equal(n('debts'), 1);          // прихована картка
  assert.equal(n('installments'), 1);   // прихована ОЧ
  assert.equal(n('other'), 4);          // дохід, слово, категорія, підкатегорія
  assert.equal(n('expenses') + n('debts') + n('installments') + n('other'), n('all'), 'лічильник = сума чипів');
  assert.equal(j(items.filter(function(i){ return i.type === 'income'; }))[0].group, 'other');
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
test('джерело: події trash-* без назв і сум, не використовується закритий view', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert.equal(src.indexOf('hidden_entities_readable'), -1, 'view закритий у Фазі 0 — клієнт його не використовує');
  const evts = src.match(/captureDebugGeometry\('trash-(open|restore|reconcile|purge)'[^;]*;/g) || [];
  assert.ok(evts.length >= 8);
  evts.forEach(function(e){ assert.equal(/title|name|amount|kw/.test(e.replace(/trashType/, '')), false, e); });
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

// ===== Rev 2.23.24 (6D.193, Ревізія E): "Видалити назавжди" і реконсиляція =====
test('canPurge: лише витрати, доходи й слова-tombstone; категорії/підкатегорії/картки/ОЧ — ні', () => {
  assert.equal(ctx.canPurge({ type: 'expense', deletedAt: 'x' }), true);
  assert.equal(ctx.canPurge({ type: 'income', deletedAt: 'x' }), true);
  assert.equal(ctx.canPurge({ type: 'word', deletedAt: 'x' }), true);
  ['category', 'subcategory', 'card', 'installment', 'debt'].forEach(function(t){
    assert.equal(ctx.canPurge({ type: t, deletedAt: 'x' }), false, t);
  });
  assert.equal(ctx.canPurge({ type: 'expense' }), false, 'живий запис — не tombstone');
  assert.equal(ctx.canPurge({ type: 'word', deletedAt: 'x', deletedVia: 'category' }), false, 'каскадне слово — лише разом із категорією');
  assert.equal(ctx.canPurge(null), false);
});
test('purgeBlockedReason: офлайн і непридатні типи заборонені, онлайн для витрати/доходу/слова — ні', () => {
  assert.equal(ctx.purgeBlockedReason({ offline: false, type: 'expense' }), null);
  assert.equal(ctx.purgeBlockedReason({ offline: false, type: 'income' }), null);
  assert.equal(ctx.purgeBlockedReason({ offline: false, type: 'word' }), null);
  assert.ok(ctx.purgeBlockedReason({ offline: true, type: 'expense' }));
  assert.ok(ctx.purgeBlockedReason({ offline: false, type: 'category' }));
  assert.ok(ctx.purgeBlockedReason({ offline: false, type: 'card' }));
  assert.ok(ctx.purgeBlockedReason());
});
test('purgeConfirmText: "Кава · 74 ₴ · 30 вер. буде видалено назавжди. Це неможливо скасувати"', () => {
  const t = ctx.purgeConfirmText({ type: 'expense', title: 'Кава', amount: 74, recordDate: '2026-09-30' });
  assert.equal(t.replace(/\u00a0/g, ' '), 'Кава · 74 ₴ · 30 вер. буде видалено назавжди. Це неможливо скасувати');
  assert.equal(ctx.purgeConfirmText({ type: 'word', title: 'кава' }), 'Слово «кава» буде видалено назавжди. Це неможливо скасувати');
});
test('trashTombstonesForReconcile: synced за syncedUpdatedAt / cloudId; каскадні слова не беруться', () => {
  const list = j(ctx.trashTombstonesForReconcile({
    expenses: [{ id: 'e1', deletedAt: 'd', syncedUpdatedAt: 's' }, { id: 'e2', deletedAt: 'd' }, { id: 'e3' }],
    incomes: [{ id: 'i1', deletedAt: 'd', syncedUpdatedAt: 's' }],
    dictionary: [{ id: 'w1', deletedAt: 'd', cloudId: 'c1' }, { id: 'w2', deletedAt: 'd' }, { id: 'w3', deletedAt: 'd', deletedVia: 'category', cloudId: 'c3' }],
  }));
  assert.deepEqual(list, [
    { key: 'expense:e1', type: 'expense', cloudId: 'e1', synced: true },
    { key: 'expense:e2', type: 'expense', cloudId: 'e2', synced: false },
    { key: 'income:i1', type: 'income', cloudId: 'i1', synced: true },
    { key: 'word:w1', type: 'word', cloudId: 'c1', synced: true },
    { key: 'word:w2', type: 'word', cloudId: null, synced: false },
  ]);
});
test('reconcilePlan: відсутній у Cloud → прибрати; живий/tombstone у Cloud → лишити; ніколи не синхронізований → пропустити', () => {
  const local = [
    { key: 'expense:e1', type: 'expense', cloudId: 'e1', synced: true },   // немає в Cloud
    { key: 'expense:e2', type: 'expense', cloudId: 'e2', synced: true },   // tombstone у Cloud
    { key: 'income:i1', type: 'income', cloudId: 'i1', synced: true },     // живий у Cloud
    { key: 'expense:e3', type: 'expense', cloudId: 'e3', synced: false },  // ніколи не синхронізувався
    { key: 'word:w1', type: 'word', cloudId: 'c1', synced: true },         // немає в Cloud
    { key: 'word:w2', type: 'word', cloudId: null, synced: false },
  ];
  const cloud = [
    { type: 'expense', id: 'e2', deleted_at: '2026-10-01' },
    { type: 'income', id: 'i1', deleted_at: null },
    { type: 'income', id: 'e1', deleted_at: null }, // той самий id в ІНШІЙ таблиці не рятує витрату e1
  ];
  assert.deepEqual(j(ctx.reconcilePlan(local, cloud)), {
    removeLocal: ['expense:e1', 'word:w1'],
    keep: ['expense:e2', 'income:i1'],
    skip: ['expense:e3', 'word:w2'],
    restoredElsewhere: ['income:i1'],
  });
});
test('reconcilePlan: збій запиту (null) → нічого не прибирати, усе пропущено', () => {
  const local = [{ key: 'expense:e1', type: 'expense', cloudId: 'e1', synced: true }, { key: 'word:w1', type: 'word', cloudId: 'c1', synced: true }];
  [null, undefined, 'err'].forEach(function(bad){
    assert.deepEqual(j(ctx.reconcilePlan(local, bad)), { removeLocal: [], keep: [], skip: ['expense:e1', 'word:w1'], restoredElsewhere: [] });
  });
  assert.deepEqual(j(ctx.reconcilePlan([], [])), { removeLocal: [], keep: [], skip: [], restoredElsewhere: [] });
});
test('джерело (E): DELETE лише для tombstone, порціями по 100, без нових міграцій і без викликів send-push-notification', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert.ok(/\.delete\(\)\.eq\('id', id\)\.eq\('family_id', cloudFamilyId\)\.not\('deleted_at', 'is', null\)/.test(src), 'DELETE лише рядків-tombstone');
  assert.ok(src.indexOf('i += 100') !== -1);
  assert.equal(/\.delete\(\)[^;]*from\('(categories|subcategories|bank_accounts|installment_accounts|debts|hidden_entities)'/.test(src), false);
  assert.equal(/functions\.invoke\(['"]send-push-notification/.test(src), false);
});

// ===== Rev 2.23.31 (6D.200): «Видалені дані» — Борги / ОЧ, місячні записи =====
test('trashTabOf: розподіл усіх типів по чипах', () => {
  const m = { expense: 'expenses', card: 'debts', debtMonth: 'debts', installment: 'installments', installmentMonth: 'installments', income: 'other', word: 'other', category: 'other', subcategory: 'other' };
  Object.keys(m).forEach(function(t){ assert.equal(ctx.trashTabOf({ type: t }), m[t], t); });
  assert.equal(ctx.trashTabOf(null), 'other');
});
function debtsState(){
  const st = baseState();
  st.debts = [
    { id: 'd1', kind: 'card', name: 'Моно', month: '2026-10', balance: 1200, deletedAt: '2026-10-05T10:00:00Z', updatedBy: 'u1' },
    { id: 'd2', kind: 'installment', name: 'ПУМБ Dyson', month: '2026-10', balance: 8000, monthlyPayment: 1250, deletedAt: '2026-10-06T10:00:00Z' },
    { id: 'd3', kind: 'card', name: 'Моно', month: '2026-09', balance: 500 },            // живий — не показується
    { id: 'd4', kind: 'other', name: 'X', month: '2026-09', deletedAt: '2026-10-01T00:00:00Z' }, // невідомий вид
  ];
  return st;
}
test('buildTrashItems: видалені місячні борги карток і ОЧ входять у «Борги» / «ОЧ»; живі й невідомі — ні', () => {
  const items = j(ctx.buildTrashItems(debtsState()));
  const d1 = items.find(function(i){ return i.key === 'debtMonth:d1'; });
  const d2 = items.find(function(i){ return i.key === 'installmentMonth:d2'; });
  assert.equal(d1.group, 'debts'); assert.equal(d1.amount, 1200); assert.equal(d1.month, '2026-10'); assert.equal(d1.deletedBy, 'u1');
  assert.equal(d2.group, 'installments'); assert.equal(d2.amount, 1250, 'для ОЧ — платіж');
  assert.equal(items.some(function(i){ return /d3|d4/.test(i.key); }), false);
  const all = items.length;
  const parts = ['expenses', 'debts', 'installments', 'other'].map(function(f){ return j(ctx.filterTrashItems(items, f)).length; });
  assert.equal(parts.reduce(function(a, b){ return a + b; }, 0), all, 'лічильник «Усі» = сума чипів');
  assert.equal(ctx.trashCount(debtsState()), all);
});
test('restoreBlockedReasonForMonthRecord: дубль живого запису того ж рахунку й місяця блокує, інакше ні', () => {
  const st = debtsState();
  const item = j(ctx.buildTrashItems(st)).find(function(i){ return i.key === 'debtMonth:d1'; });
  assert.equal(ctx.restoreBlockedReason(item, st), null);
  st.debts.push({ id: 'd9', kind: 'card', name: 'Моно', month: '2026-10', balance: 1 });
  assert.equal(ctx.restoreBlockedReason(item, st), 'Запис за цей місяць уже існує');
  assert.equal(ctx.restoreBlockedReasonForMonthRecord(item, st), 'Запис за цей місяць уже існує');
  const inst = j(ctx.buildTrashItems(debtsState())).find(function(i){ return i.key === 'installmentMonth:d2'; });
  assert.equal(ctx.restoreBlockedReason(inst, st), null, 'інша картка/вид не конфліктує');
  st.debts.push({ id: 'd8', kind: 'installment', name: 'ПУМБ Dyson', month: '2026-10', balance: 1, deletedAt: '2026-10-07T00:00:00Z' });
  assert.equal(ctx.restoreBlockedReason(inst, st), null, 'tombstone не конфліктує');
});
test('канPurge для місячних боргів/ОЧ немає (незворотного видалення для боргів, ОЧ і прихованих немає)', () => {
  const ctx2 = require('./extract').buildSandbox({}, ['TRASH_PURGEABLE_TYPES', 'canPurge']);
  assert.equal(ctx2.canPurge({ type: 'debtMonth', deletedAt: 'x' }), false);
  assert.equal(ctx2.canPurge({ type: 'installmentMonth', deletedAt: 'x' }), false);
  assert.equal(ctx2.canPurge({ type: 'card', deletedAt: 'x' }), false);
});
test('trashTombstonesForReconcile: місячні борги/ОЧ звіряються з Cloud (привиди), каскадні слова — ні', () => {
  const ctx3 = require('./extract').buildSandbox({}, ['trashTombstonesForReconcile']);
  const list = j(ctx3.trashTombstonesForReconcile({ debts: [{ id: 'd1', kind: 'card', deletedAt: 'x', syncedUpdatedAt: 's' }, { id: 'd2', kind: 'installment', deletedAt: 'x' }, { id: 'd3', kind: 'card' }] }));
  assert.deepEqual(list, [
    { key: 'debtMonth:d1', type: 'debtMonth', cloudId: 'd1', synced: true },
    { key: 'installmentMonth:d2', type: 'installmentMonth', cloudId: 'd2', synced: false },
  ]);
});
test('джерело (6D.200): чипи «Борги»/«ОЧ», немає чипа «Доходи»; відновлення 23505 відкочується з точним тостом', () => {
  assert.ok(/data-filter="debts"[^>]*>Борги/.test(SRC) && /data-filter="installments"[^>]*>ОЧ/.test(SRC));
  assert.equal(/data-filter="incomes"/.test(SRC), false);
  assert.ok(/res\.code === '23505'/.test(SRC) && /Запис за цей місяць уже існує/.test(SRC));
});
// restoreTrashMonthRecord: успіх знімає deletedAt і пушить; 23505 → відкат до tombstone й точна помилка (без збою синхронізації).
test('restoreTrashMonthRecord: успіх / 23505 відкочує / не знайдено', async () => {
  const mk = function(pushResult){
    const debtsArr = [{ id: 'd1', kind: 'card', name: 'Моно', month: '2026-10', balance: 5, deletedAt: '2026-10-05T10:00:00Z', updatedAt: '2026-10-05T10:00:00Z', syncedUpdatedAt: '2026-10-05T10:00:00Z' }];
    const c = require('./extract').buildSandbox({ debts: debtsArr, saveDebts: async function(){ return { success: true }; }, reportSaveResult: function(){}, populateMonths: function(){}, renderAll: function(){}, populateBankDebtTable: function(){}, populateInstallmentTable: function(){}, pushDebtRecordPilot: async function(){ return pushResult; } }, ['restoreTrashMonthRecord']);
    return { c: c, debts: debtsArr };
  };
  let m = mk({ success: true });
  let r = await m.c.restoreTrashMonthRecord('d1');
  assert.equal(r.success, true); assert.equal(m.debts[0].deletedAt, undefined);
  m = mk({ success: false, code: '23505', error: 'duplicate key' });
  r = await m.c.restoreTrashMonthRecord('d1');
  assert.equal(r.success, false); assert.equal(r.exact, true); assert.equal(r.error, 'Запис за цей місяць уже існує');
  assert.equal(m.debts[0].deletedAt, '2026-10-05T10:00:00Z', 'tombstone повернуто');
  assert.equal(m.debts[0].syncedUpdatedAt, '2026-10-05T10:00:00Z', 'не позначено як несинхронізований');
  r = await m.c.restoreTrashMonthRecord('нема');
  assert.equal(r.success, false);
});
// Rev 2.23.32 (6D.201): порожня відповідь Cloud без помилки (мертва сесія/RLS) не стирає локальні tombstone-и.
test('reconcileTrash: порожня відповідь при "мертвому" Cloud → нічого не прибираємо; при живому Cloud — прибираємо; збій запиту → нічого', async () => {
  const run = async function(rowsResult, alive){
    const removed = [];
    const c = require('./extract').buildSandbox({
      isTrashOffline: function(){ return false; }, trashStateNow: function(){ return {}; }, trashSyncBusy: 0, updateTrashSyncLine: function(){},
      trashTombstonesForReconcile: function(){ return [{ key: 'expense:e1', type: 'expense', cloudId: 'e1', synced: true }]; },
      fetchTrashCloudRows: async function(){ return rowsResult; }, cloudLooksAlive: async function(){ return alive; },
      removeTrashLocally: async function(keys){ removed.push.apply(removed, keys); }, captureDebugGeometry: function(){},
    }, ['reconcilePlan', 'reconcileTrash']);
    const r = await c.reconcileTrash();
    return { r: r, removed: removed };
  };
  let o = await run([], false);
  assert.equal(o.r, null); assert.deepEqual(o.removed, []);
  o = await run([], true);
  assert.deepEqual(o.removed, ['expense:e1']);
  o = await run(null, true);
  assert.equal(o.r, null); assert.deepEqual(o.removed, []);
});
