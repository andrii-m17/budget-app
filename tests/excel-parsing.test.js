// Rev 2.14.0 — тести базових кейсів парсингу Excel-імпорту: excelDateToISO()
// (перетворення значення клітинки на ISO-дату) і parseUaMonth() (розбір
// підпису місяця "березень 2026" на ключ "2026-03"). Обидві — чисті функції,
// що не читають DOM; excelDateToISO() лише для числового шляху потребує
// глобальної бібліотеки XLSX (SheetJS) — тут вона підмінена мінімальною
// заглушкою SSF.parse_date_code, реальний парсинг Excel-серійних дат не
// перевіряється (це логіка самої SheetJS, не застосунку).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildSandbox, evalInSandbox } = require('./extract');

const UA_MONTHS = ['січень','лютий','березень','квітень','травень','червень','липень','серпень','вересень','жовтень','листопад','грудень'];

function sandbox(){
  const XLSX = { SSF: { parse_date_code: (val) => {
    // Мінімальна заглушка: у тестах використовуємо лише один умовний серійний
    // номер (46000) → фіксована дата, реальний алгоритм конвертації в SheetJS.
    if(val === 46000) return { y: 2025, m: 12, d: 12 };
    return null;
  } } };
  return buildSandbox({ XLSX }, ['excelDateToISO', 'parseUaMonth', 'UA_MONTHS']);
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
