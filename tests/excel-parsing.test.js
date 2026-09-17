// Rev 2.14.0 — тести базових кейсів парсингу Excel-імпорту: excelDateToISO()
// (перетворення значення клітинки на ISO-дату) і parseUaMonth() (розбір
// підпису місяця "березень 2026" на ключ "2026-03"). Обидві — чисті функції,
// що не читають DOM; excelDateToISO() лише для числового шляху потребує
// глобальної бібліотеки XLSX (SheetJS) — тут вона підмінена мінімальною
// заглушкою SSF.parse_date_code, реальний парсинг Excel-серійних дат не
// перевіряється (це логіка самої SheetJS, не застосунку).
//
// Rev #26.4 — Stage 5, п.26.4 (останній пункт "не вдалось ізолювати"):
// mapExcelExpenseRow/mapExcelIncomeRow/mapExcelDebtColumnsRow/
// mapExcelInstallmentDetailRow — "рядок Excel → внутрішній об'єкт", винесені
// з циклів парсингу handleImportFile(). Самé читання файлу (XLSX.read),
// FileReader і DOM-прев'ю результату СВІДОМО лишились у handleImportFile()
// і тут не тестуються — не рефакторинг, а межа скоупу цього кроку.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildSandbox, evalInSandbox } = require('./extract');

const UA_MONTHS = ['січень','лютий','березень','квітень','травень','червень','липень','серпень','вересень','жовтень','листопад','грудень'];

// Rev #26.4 — значення, повернуті з vm.Context, живуть в ІНШОМУ реалмі
// (їхній Array/Object.prototype — не той самий, що в головному процесі),
// тому assert.deepEqual/strict падає навіть на структурно однакових
// масивах/об'єктах (задокументовано вже в tests/journal-month.test.js і
// tests/installment-match.test.js для масивів). JSON-round-trip перебудовує
// значення як звичайні дані головного реалму — працює і для масивів, і для
// (вкладених) об'єктів однаково.
function plain(x){ return JSON.parse(JSON.stringify(x)); }

function sandbox(){
  const XLSX = { SSF: { parse_date_code: (val) => {
    // Мінімальна заглушка: у тестах використовуємо лише один умовний серійний
    // номер (46000) → фіксована дата, реальний алгоритм конвертації в SheetJS.
    if(val === 46000) return { y: 2025, m: 12, d: 12 };
    return null;
  } } };
  return buildSandbox({ XLSX }, [
    'excelDateToISO', 'parseUaMonth', 'UA_MONTHS',
    'mapExcelExpenseRow', 'mapExcelIncomeRow', 'mapExcelDebtColumnsRow', 'mapExcelInstallmentDetailRow'
  ]);
}

test('excelDateToISO: об\'єкт Date (локальна північ) → коректна ISO-дата без зсуву на добу', () => {
  const ctx = sandbox();
  // Функція перевіряє "val instanceof Date" — Date з ГОЛОВНОГО реалму Node НЕ
  // пройде цю перевірку всередині vm.Context (інший реалм має власний Date),
  // тому конструюємо об'єкт виразом, виконаним прямо в контексті (evalInSandbox).
  const d = evalInSandbox(ctx, 'new Date(2026, 2, 15)'); // 15 березня 2026, локальна північ
  assert.equal(ctx.excelDateToISO(d), '2026-03-15');
});

test('excelDateToISO: рядок у форматі ISO → перші 10 символів', () => {
  const ctx = sandbox();
  assert.equal(ctx.excelDateToISO('2026-03-15T10:30:00.000Z'), '2026-03-15');
});

test('excelDateToISO: числовий Excel-серійний номер → делегує SSF.parse_date_code', () => {
  const ctx = sandbox();
  assert.equal(ctx.excelDateToISO(46000), '2025-12-12');
});

test('excelDateToISO: невпізнаний формат (рядок довільного тексту) → null', () => {
  const ctx = sandbox();
  assert.equal(ctx.excelDateToISO('не дата'), null);
});

test('parseUaMonth: "березень 2026" → "2026-03"', () => {
  const ctx = sandbox();
  assert.equal(ctx.parseUaMonth('березень 2026'), '2026-03');
});

test('parseUaMonth: регістр і зайві пробіли не заважають розпізнаванню', () => {
  const ctx = sandbox();
  assert.equal(ctx.parseUaMonth('  ГРУДЕНЬ   2025 '), '2025-12');
});

test('parseUaMonth: невідома назва місяця → null', () => {
  const ctx = sandbox();
  assert.equal(ctx.parseUaMonth('марчук 2026'), null);
});

test('parseUaMonth: відсутній рік або порожній вхід → null', () => {
  const ctx = sandbox();
  assert.equal(ctx.parseUaMonth('березень'), null);
  assert.equal(ctx.parseUaMonth(''), null);
  assert.equal(ctx.parseUaMonth(null), null);
});

/* ============ mapExcelExpenseRow (аркуш "Витрати") ============ */

test('mapExcelExpenseRow: валідний рядок → повний внутрішній об\'єкт', () => {
  const ctx = sandbox();
  const row = { 'Витрата': 'Кава', 'Сума': '65.4', 'Дата': '2026-03-15', 'Категорія': '🍔 Їжа', 'Підкатегорія': 'Кафе', 'Статус автоматизації': 'вручну' };
  assert.deepEqual(plain(ctx.mapExcelExpenseRow(row)), {
    date: '2026-03-15', name: 'Кава', amount: 65,
    category: '🍔 Їжа', subcategory: 'Кафе', manual: true
  });
});

test('mapExcelExpenseRow: відсутня колонка "Витрата" (назва) → null', () => {
  const ctx = sandbox();
  assert.equal(ctx.mapExcelExpenseRow({ 'Сума': 100, 'Дата': '2026-03-15' }), null);
});

test('mapExcelExpenseRow: порожнє значення суми → null', () => {
  const ctx = sandbox();
  assert.equal(ctx.mapExcelExpenseRow({ 'Витрата': 'Кава', 'Сума': '', 'Дата': '2026-03-15' }), null);
  assert.equal(ctx.mapExcelExpenseRow({ 'Витрата': 'Кава', 'Сума': null, 'Дата': '2026-03-15' }), null);
});

test('mapExcelExpenseRow: нестандартний формат дати (не розпізнана excelDateToISO) → null', () => {
  const ctx = sandbox();
  assert.equal(ctx.mapExcelExpenseRow({ 'Витрата': 'Кава', 'Сума': 65, 'Дата': 'не дата' }), null);
});

test('mapExcelExpenseRow: "Категорія"/"Підкатегорія" відсутні → порожній рядок, не undefined', () => {
  const ctx = sandbox();
  const mapped = ctx.mapExcelExpenseRow({ 'Витрата': 'Кава', 'Сума': 65, 'Дата': '2026-03-15' });
  assert.equal(mapped.category, '');
  assert.equal(mapped.subcategory, '');
});

test('mapExcelExpenseRow: "Статус автоматизації" === "авто" → manual:false, будь-що інше → true', () => {
  const ctx = sandbox();
  const base = { 'Витрата': 'Кава', 'Сума': 65, 'Дата': '2026-03-15' };
  assert.equal(ctx.mapExcelExpenseRow({ ...base, 'Статус автоматизації': 'Авто' }).manual, false);
  assert.equal(ctx.mapExcelExpenseRow({ ...base, 'Статус автоматизації': 'вручну' }).manual, true);
  assert.equal(ctx.mapExcelExpenseRow(base).manual, false); // колонка взагалі відсутня
});

/* ============ mapExcelIncomeRow (аркуш "Історія", колонки B/C/D) ============ */

test('mapExcelIncomeRow: усі три джерела з позитивними сумами → три кандидати', () => {
  const ctx = sandbox();
  const row = [null, '20000', '18000', '500'];
  assert.deepEqual(plain(ctx.mapExcelIncomeRow(row, '2026-03')), [
    { source: 'Зарплата Андрій', amount: 20000, date: '2026-03-01' },
    { source: 'Зарплата Оля', amount: 18000, date: '2026-03-01' },
    { source: 'Інші доходи', amount: 500, date: '2026-03-01' },
  ]);
});

test('mapExcelIncomeRow: порожні/нульові/від\'ємні колонки не потрапляють у результат', () => {
  const ctx = sandbox();
  const row = [null, '20000', null, 0];
  assert.deepEqual(plain(ctx.mapExcelIncomeRow(row, '2026-03')), [
    { source: 'Зарплата Андрій', amount: 20000, date: '2026-03-01' },
  ]);
});

test('mapExcelIncomeRow: жодного валідного джерела → порожній масив', () => {
  const ctx = sandbox();
  assert.deepEqual(plain(ctx.mapExcelIncomeRow([null, null, null, null], '2026-03')), []);
});

/* ============ mapExcelDebtColumnsRow (аркуш "Історія", колонки банків) ============ */

test('mapExcelDebtColumnsRow: значення лише в частині колонок → лише валідні кандидати, з idx', () => {
  const ctx = sandbox();
  const debtCols = [
    { idx: 15, name: '🟩 Приват Банк', kind: 'card' },
    { idx: 16, name: '⬛️ Моно Банк', kind: 'card' },
  ];
  const row = []; row[15] = '5000'; row[16] = null;
  assert.deepEqual(plain(ctx.mapExcelDebtColumnsRow(row, '2026-03', debtCols)), [
    { name: '🟩 Приват Банк', kind: 'card', month: '2026-03', balance: 5000, idx: 15 },
  ]);
});

test('mapExcelDebtColumnsRow: нечислове значення в колонці → пропущено (не NaN у результаті)', () => {
  const ctx = sandbox();
  const debtCols = [{ idx: 15, name: '🟩 Приват Банк', kind: 'card' }];
  const row = []; row[15] = 'н/д';
  assert.deepEqual(plain(ctx.mapExcelDebtColumnsRow(row, '2026-03', debtCols)), []);
});

test('mapExcelDebtColumnsRow: порожній список колонок → порожній результат', () => {
  const ctx = sandbox();
  assert.deepEqual(plain(ctx.mapExcelDebtColumnsRow([], '2026-03', [])), []);
});

/* ============ mapExcelInstallmentDetailRow (аркуш "Фінанси", ОЧ детально) ============ */

test('mapExcelInstallmentDetailRow: валідний рядок з усіма значеннями', () => {
  const ctx = sandbox();
  const row = []; row[1] = ' ПУМБ '; row[5] = '3500'; row[6] = '24000'; row[8] = '10000';
  assert.deepEqual(plain(ctx.mapExcelInstallmentDetailRow(row)), {
    baseName: 'ПУМБ', monthlyPay: 3500, creditSum: 24000, balance: 10000
  });
});

test('mapExcelInstallmentDetailRow: "Залишок" порожній, є "Сума кредиту" → balance = creditSum (Rev 2.1.36)', () => {
  const ctx = sandbox();
  const row = []; row[1] = 'ПУМБ'; row[5] = '3500'; row[6] = '24000'; row[8] = null;
  const mapped = ctx.mapExcelInstallmentDetailRow(row);
  assert.equal(mapped.balance, 24000);
});

test('mapExcelInstallmentDetailRow: і "Залишок", і "Сума кредиту" відсутні → null', () => {
  const ctx = sandbox();
  const row = []; row[1] = 'ПУМБ'; row[5] = '3500'; row[6] = null; row[8] = null;
  assert.equal(ctx.mapExcelInstallmentDetailRow(row), null);
});
