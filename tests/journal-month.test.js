// Rev 2.18.0 — тести для повноекранного Журналу (навігація по місяцях):
// shiftMonth() (арифметика місяців, включно з переходом через межу року) і
// recordsForMonth() (чиста фільтрація записів за місяцем, винесена окремо з
// renderJournalView() саме для цього тесту). Сам рендер (buildRecordGroupsHtml)
// НЕ ізольований — це побудова DOM-розмітки (.expense-row/.journal-day-group),
// той самий клас функцій, що вже задокументований як невідʼємний від DOM у
// tests/och-model.test.js (populateInstallmentTable) — тестуємо лише чисту
// логіку, якою він живиться.
// Rev 2.19.0 — додано findRecordIdForDate() (календар Журналу, Крок 2 ROADMAP
// п.38): чистий пошук першого запису (витрата/дохід) на точну дату, що
// повертає той самий DOM-id, який buildRecordGroupsHtml (не чіпали) вже
// проставляє на рядок — використовується для flashDiagnosticTarget після
// вибору дати в календарі.
// Rev 2.20.0 — додано filterJournalRecords() (текст+категорія, по ВСІЙ
// історії, Крок 5/фінальний ROADMAP п.38) і journalCategoryOptions()
// (категорії, що реально зустрічаються серед витрат — не хардкод CATEGORIES).
// Rev 2.20.1 BugFix — текстовий пошук перевіряв лише name, ігноруючи
// subcategory (те, що фактично показано чипом на рядку) — доповнено тестом.
// Rev 2.20.2 — додано ОКРЕМИЙ фільтр підкатегорії (журнал-панель, 4-й
// параметр filterJournalRecords) і journalSubcategoryOptions() (каскадно
// звужені під обрану категорію, аналогічно journalCategoryOptions).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildSandbox } = require('./extract');

function sandbox({ expenses, incomes } = {}){
  return buildSandbox(
    { expenses: expenses || [], incomes: incomes || [] },
    ['shiftMonth', 'monthKey', 'recordsForMonth', 'findRecordIdForDate', 'filterJournalRecords', 'journalCategoryOptions', 'journalSubcategoryOptions',
      // Rev #30 (6D.43) — findRecordIdForDate() тепер сканує activeExpenses()/activeIncomes(), не сирі масиви.
      'activeExpenses', 'activeIncomes',
      // Rev #30 (6D.51) — compareRecordsForDisplay(): детермінований порядок Журналу.
      'compareRecordsForDisplay']
  );
}

test('shiftMonth: вперед у межах року', () => {
  const ctx = sandbox();
  assert.equal(ctx.shiftMonth('2026-03', 1), '2026-04');
});

test('shiftMonth: назад у межах року', () => {
  const ctx = sandbox();
  assert.equal(ctx.shiftMonth('2026-03', -1), '2026-02');
});

test('shiftMonth: грудень → січень наступного року', () => {
  const ctx = sandbox();
  assert.equal(ctx.shiftMonth('2026-12', 1), '2027-01');
});

test('shiftMonth: січень → грудень попереднього року', () => {
  const ctx = sandbox();
  assert.equal(ctx.shiftMonth('2026-01', -1), '2025-12');
});

test('shiftMonth: delta більший за 12 — теж коректно переносить рік', () => {
  const ctx = sandbox();
  assert.equal(ctx.shiftMonth('2026-06', 8), '2027-02');
});

test('recordsForMonth: лишає тільки записи обраного місяця', () => {
  const ctx = sandbox();
  const records = [
    { date: '2026-08-31', name: 'Серпень' },
    { date: '2026-09-01', name: 'Вересень 1' },
    { date: '2026-09-15', name: 'Вересень 2' },
    { date: '2026-10-01', name: 'Жовтень' },
  ];
  const result = ctx.recordsForMonth(records, '2026-09');
  assert.equal(result.length, 2);
  assert.deepEqual(result.map(r => r.name), ['Вересень 1', 'Вересень 2']);
});

test('recordsForMonth: місяць без жодного запису → порожній масив', () => {
  const ctx = sandbox();
  const records = [{ date: '2026-08-31', name: 'Серпень' }];
  assert.deepEqual(ctx.recordsForMonth(records, '2026-09'), []);
});

test('recordsForMonth: порожній вхідний масив → порожній результат', () => {
  const ctx = sandbox();
  assert.deepEqual(ctx.recordsForMonth([], '2026-09'), []);
});

test('findRecordIdForDate: знаходить витрату на точну дату', () => {
  const ctx = sandbox({
    expenses: [
      { id: 'e1', name: 'Кава', date: '2026-09-14' },
      { id: 'e2', name: 'Хліб', date: '2026-09-15' },
    ],
  });
  assert.equal(ctx.findRecordIdForDate('2026-09-15'), 'journal-row-expense-1');
});

test('findRecordIdForDate: витрата пріоритетніша за дохід на ту саму дату', () => {
  const ctx = sandbox({
    expenses: [{ id: 'e1', name: 'Кава', date: '2026-09-15' }],
    incomes: [{ id: 'i1', source: 'Зарплата Андрій', date: '2026-09-15' }],
  });
  assert.equal(ctx.findRecordIdForDate('2026-09-15'), 'journal-row-expense-0');
});

test('findRecordIdForDate: без витрат на цю дату — шукає серед доходів', () => {
  const ctx = sandbox({
    expenses: [{ id: 'e1', name: 'Кава', date: '2026-09-14' }],
    incomes: [{ id: 'i1', source: 'Зарплата Андрій', date: '2026-09-15' }],
  });
  assert.equal(ctx.findRecordIdForDate('2026-09-15'), 'journal-row-income-0');
});

test('findRecordIdForDate: жодного запису на цю дату → null (не помилка)', () => {
  const ctx = sandbox({
    expenses: [{ id: 'e1', name: 'Кава', date: '2026-09-14' }],
  });
  assert.equal(ctx.findRecordIdForDate('2026-09-20'), null);
});

test('filterJournalRecords: текстовий пошук — contains, регістронезалежно', () => {
  const ctx = sandbox();
  const records = [
    { kind: 'expense', name: 'Кава в дорозі', category: '🍔 Їжа' },
    { kind: 'expense', name: 'Хліб', category: '🍔 Їжа' },
    { kind: 'expense', name: 'КАВА зі знижкою', category: '🏠 Побут' },
  ];
  const result = ctx.filterJournalRecords(records, 'кава', '');
  assert.deepEqual(result.map(r => r.name), ['Кава в дорозі', 'КАВА зі знижкою']);
});

test('filterJournalRecords: текстовий пошук коректно працює з кирилицею (різний регістр)', () => {
  const ctx = sandbox();
  const records = [
    { kind: 'expense', name: 'Черешня', category: '🍔 Їжа' },
    { kind: 'expense', name: 'Груша', category: '🍔 Їжа' },
  ];
  assert.equal(ctx.filterJournalRecords(records, 'ЧЕРЕШНЯ', '').length, 1);
});

test('filterJournalRecords: фільтр категорії лишає лише витрати цієї категорії', () => {
  const ctx = sandbox();
  const records = [
    { kind: 'expense', name: 'Кава', category: '🍔 Їжа' },
    { kind: 'expense', name: 'Бензин', category: '🚗 Транспорт' },
  ];
  const result = ctx.filterJournalRecords(records, '', '🍔 Їжа');
  assert.deepEqual(result.map(r => r.name), ['Кава']);
});

test('filterJournalRecords: категорія "__none__" — витрати без категорії', () => {
  const ctx = sandbox();
  const records = [
    { kind: 'expense', name: 'Кава', category: '🍔 Їжа' },
    { kind: 'expense', name: 'Щось', category: null },
  ];
  const result = ctx.filterJournalRecords(records, '', '__none__');
  assert.deepEqual(result.map(r => r.name), ['Щось']);
});

test('filterJournalRecords: категорія фільтрує лише витрати — доходи завжди проходять', () => {
  const ctx = sandbox();
  const records = [
    { kind: 'expense', name: 'Кава', category: '🍔 Їжа' },
    { kind: 'income', name: 'Зарплата Андрій' },
  ];
  const result = ctx.filterJournalRecords(records, '', '🚗 Транспорт');
  assert.deepEqual(result.map(r => r.name), ['Зарплата Андрій']);
});

test('filterJournalRecords: текст і категорія разом — обидві умови', () => {
  const ctx = sandbox();
  const records = [
    { kind: 'expense', name: 'Кава', category: '🍔 Їжа' },
    { kind: 'expense', name: 'Кавоварка', category: '🏠 Побут' },
    { kind: 'expense', name: 'Хліб', category: '🍔 Їжа' },
  ];
  const result = ctx.filterJournalRecords(records, 'кав', '🍔 Їжа');
  assert.deepEqual(result.map(r => r.name), ['Кава']);
});

test('filterJournalRecords: без запиту й категорії — повертає все як є', () => {
  const ctx = sandbox();
  const records = [{ kind: 'expense', name: 'Кава', category: '🍔 Їжа' }];
  assert.deepEqual(ctx.filterJournalRecords(records, '', ''), records);
});

// Rev 2.21.13 — текстовий пошук за підкатегорією (Rev 2.20.1) прибрано за
// проханням користувача (неправильно розпізнане завдання — малась на увазі
// лише окрема ФІЛЬТР-опція за підкатегорією, journalSearchSubcategory,
// не чіпали). Пошук тепер знову лише за НАЗВОЮ.
test('filterJournalRecords: текстовий пошук шукає лише за назвою, НЕ за підкатегорією', () => {
  const ctx = sandbox();
  const records = [
    { kind: 'expense', name: 'Латте на виніс', category: '🍔 Їжа', subcategory: 'Кафе' },
    { kind: 'expense', name: 'Хліб і молоко', category: '🍔 Їжа', subcategory: 'Продукти' },
  ];
  const result = ctx.filterJournalRecords(records, 'кафе', '');
  assert.deepEqual(result, []);
});

test('filterJournalRecords: запис без підкатегорії не падає (undefined subcategory)', () => {
  const ctx = sandbox();
  const records = [{ kind: 'income', name: 'Зарплата Андрій' }];
  assert.deepEqual(ctx.filterJournalRecords(records, 'зарплата', ''), records);
});

// Rev 2.20.0 — journalCategoryOptions() будує результат через Array.from(set)
// ВСЕРЕДИНІ vm.Context — сам масив лишається "чужого" реалму, і
// assert.deepEqual (=deepStrictEqual в node:assert/strict) на такому масиві
// проти звичайного літералу падає з "same structure but not reference-equal"
// (той самий клас cross-realm пасток, що вже задокументований у
// tests/och-model.test.js для instanceof Date) — Array.from(...) у ГОЛОВНОМУ
// реалмі нормалізує масив перед порівнянням.
test('journalCategoryOptions: лише унікальні категорії, що реально зустрічаються, відсортовані', () => {
  const ctx = sandbox();
  const expenses = [
    { name: 'Кава', category: '🍔 Їжа' },
    { name: 'Бензин', category: '🚗 Транспорт' },
    { name: 'Хліб', category: '🍔 Їжа' },
  ];
  assert.deepEqual(Array.from(ctx.journalCategoryOptions(expenses)), ['🍔 Їжа', '🚗 Транспорт']);
});

test('journalCategoryOptions: "__none__" в кінці, лише якщо є витрата без категорії', () => {
  const ctx = sandbox();
  const expenses = [
    { name: 'Кава', category: '🍔 Їжа' },
    { name: 'Щось', category: null },
  ];
  assert.deepEqual(Array.from(ctx.journalCategoryOptions(expenses)), ['🍔 Їжа', '__none__']);
});

test('journalCategoryOptions: без витрат → порожній список', () => {
  const ctx = sandbox();
  assert.deepEqual(Array.from(ctx.journalCategoryOptions([])), []);
});

test('filterJournalRecords: фільтр підкатегорії лишає лише витрати цієї підкатегорії', () => {
  const ctx = sandbox();
  const records = [
    { kind: 'expense', name: 'Латте', category: '🍔 Їжа', subcategory: 'Кафе' },
    { kind: 'expense', name: 'Хліб', category: '🍔 Їжа', subcategory: 'Продукти' },
  ];
  const result = ctx.filterJournalRecords(records, '', '', 'Кафе');
  assert.deepEqual(result.map(r => r.name), ['Латте']);
});

test('filterJournalRecords: підкатегорія "__none__" — витрати без підкатегорії', () => {
  const ctx = sandbox();
  const records = [
    { kind: 'expense', name: 'Латте', category: '🍔 Їжа', subcategory: 'Кафе' },
    { kind: 'expense', name: 'Щось', category: '🍔 Їжа', subcategory: null },
  ];
  const result = ctx.filterJournalRecords(records, '', '', '__none__');
  assert.deepEqual(result.map(r => r.name), ['Щось']);
});

test('filterJournalRecords: підкатегорія фільтрує лише витрати — доходи завжди проходять', () => {
  const ctx = sandbox();
  const records = [
    { kind: 'expense', name: 'Латте', category: '🍔 Їжа', subcategory: 'Кафе' },
    { kind: 'income', name: 'Зарплата Андрій' },
  ];
  const result = ctx.filterJournalRecords(records, '', '', 'Продукти');
  assert.deepEqual(result.map(r => r.name), ['Зарплата Андрій']);
});

test('filterJournalRecords: категорія і підкатегорія разом — обидві незалежні AND-умови', () => {
  const ctx = sandbox();
  const records = [
    { kind: 'expense', name: 'Латте', category: '🍔 Їжа', subcategory: 'Кафе' },
    { kind: 'expense', name: 'Кавоварка', category: '🏠 Побут', subcategory: 'Техніка' },
    { kind: 'expense', name: 'Печиво', category: '🍔 Їжа', subcategory: 'Продукти' },
  ];
  const result = ctx.filterJournalRecords(records, '', '🍔 Їжа', 'Кафе');
  assert.deepEqual(result.map(r => r.name), ['Латте']);
});

test('journalSubcategoryOptions: без category — усі підкатегорії з усіх витрат, відсортовані', () => {
  const ctx = sandbox();
  const expenses = [
    { name: 'Латте', category: '🍔 Їжа', subcategory: 'Кафе' },
    { name: 'Бензин', category: '🚗 Транспорт', subcategory: 'Паливо' },
  ];
  assert.deepEqual(Array.from(ctx.journalSubcategoryOptions(expenses, '')), ['Кафе', 'Паливо']);
});

test('journalSubcategoryOptions: з category — каскадно звужено лише до цієї категорії', () => {
  const ctx = sandbox();
  const expenses = [
    { name: 'Латте', category: '🍔 Їжа', subcategory: 'Кафе' },
    { name: 'Хліб', category: '🍔 Їжа', subcategory: 'Продукти' },
    { name: 'Бензин', category: '🚗 Транспорт', subcategory: 'Паливо' },
  ];
  assert.deepEqual(Array.from(ctx.journalSubcategoryOptions(expenses, '🍔 Їжа')), ['Кафе', 'Продукти']);
});

test('journalSubcategoryOptions: "__none__" в кінці, лише якщо є витрата без підкатегорії', () => {
  const ctx = sandbox();
  const expenses = [
    { name: 'Латте', category: '🍔 Їжа', subcategory: 'Кафе' },
    { name: 'Щось', category: '🍔 Їжа', subcategory: null },
  ];
  assert.deepEqual(Array.from(ctx.journalSubcategoryOptions(expenses, '')), ['Кафе', '__none__']);
});

test('journalSubcategoryOptions: category без жодної витрати → порожній список', () => {
  const ctx = sandbox();
  const expenses = [{ name: 'Латте', category: '🍔 Їжа', subcategory: 'Кафе' }];
  assert.deepEqual(Array.from(ctx.journalSubcategoryOptions(expenses, '🚗 Транспорт')), []);
});

// Rev #30 (6D.51) — compareRecordsForDisplay(): детермінований порядок
// Журналу. Раніше тайбрейк при ОДНАКОВІЙ date був фактично no-op (при
// рівності localeCompare вже дає 0) → порядок визначався стабільністю
// .sort() = поточним порядком масиву, який розходиться між пристроями
// (push у кінець при створенні, різна послідовність pull/push) — звідси
// "стрибки" в описі бага.
test('compareRecordsForDisplay: первинно за date, новіші зверху (спадання)', () => {
  const ctx = sandbox();
  const records = [
    { id: 'a', date: '2026-03-01', createdAt: '2026-03-01T10:00:00.000Z' },
    { id: 'b', date: '2026-03-05', createdAt: '2026-03-05T10:00:00.000Z' },
    { id: 'c', date: '2026-03-03', createdAt: '2026-03-03T10:00:00.000Z' },
  ];
  const sorted = records.slice().sort(ctx.compareRecordsForDisplay).map(r => r.id);
  assert.deepEqual(sorted, ['b', 'c', 'a']);
});

test('compareRecordsForDisplay: однакова date → тайбрейк за createdAt (новіший зверху), НЕ за порядком масиву', () => {
  const ctx = sandbox();
  // Записи додані в масив у "неправильному" порядку (старіший createdAt перший) —
  // раніше нестабільний тайбрейк лишив би їх саме в цьому, вхідному, порядку.
  const records = [
    { id: 'old', date: '2026-03-01', createdAt: '2026-03-01T08:00:00.000Z' },
    { id: 'new', date: '2026-03-01', createdAt: '2026-03-01T20:00:00.000Z' },
  ];
  const sorted = records.slice().sort(ctx.compareRecordsForDisplay).map(r => r.id);
  assert.deepEqual(sorted, ['new', 'old']);
});

test('compareRecordsForDisplay: однакова date і createdAt → фінальний тайбрейк за id, детермінований', () => {
  const ctx = sandbox();
  const records = [
    { id: 'bbb', date: '2026-03-01', createdAt: '2026-03-01T08:00:00.000Z' },
    { id: 'aaa', date: '2026-03-01', createdAt: '2026-03-01T08:00:00.000Z' },
  ];
  const sorted1 = records.slice().sort(ctx.compareRecordsForDisplay).map(r => r.id);
  const sorted2 = records.slice().reverse().sort(ctx.compareRecordsForDisplay).map(r => r.id);
  // Незалежно від вхідного порядку — результат однаковий (не залежить від array order).
  assert.deepEqual(sorted1, sorted2);
});

test('compareRecordsForDisplay: редагування (зміна лише updatedAt) не впливає на позицію', () => {
  const ctx = sandbox();
  const records = [
    { id: 'a', date: '2026-03-01', createdAt: '2026-03-01T08:00:00.000Z', updatedAt: '2026-03-01T08:00:00.000Z' },
    { id: 'b', date: '2026-03-02', createdAt: '2026-03-02T08:00:00.000Z', updatedAt: '2026-03-02T08:00:00.000Z' },
  ];
  const before = records.slice().sort(ctx.compareRecordsForDisplay).map(r => r.id);
  records[0].updatedAt = '2026-03-10T00:00:00.000Z'; // редагування "a" пізніше за "b"
  const after = records.slice().sort(ctx.compareRecordsForDisplay).map(r => r.id);
  assert.deepEqual(before, after);
});

test('compareRecordsForDisplay: відсутній createdAt (старий запис) не ламає сортування', () => {
  const ctx = sandbox();
  const records = [
    { id: 'a', date: '2026-03-01' },
    { id: 'b', date: '2026-03-01', createdAt: '2026-03-01T08:00:00.000Z' },
  ];
  assert.doesNotThrow(() => records.slice().sort(ctx.compareRecordsForDisplay));
});
