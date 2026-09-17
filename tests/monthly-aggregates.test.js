// Rev 2.14.0 — тести підрахунку доходів/витрат/залишку за місяць
// (monthAggregates) і композиції "Обов'язкові платежі" / "Після обов'язкових"
// (KPI на Дашборді).
//
// Rev #26.3 — mandatory/freeMoney тепер реальна окрема функція
// (mandatoryPaymentsSummary(monthExp, totalIncome), index.html) — раніше
// рахувалась інлайн усередині renderDashboard(), тест відтворював формулу
// вручну (задокументовано як прогалина для Stage 5, п.26). renderDashboard()
// тепер лише викликає mandatoryPaymentsSummary() і рендерить результат.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildSandbox } = require('./extract');

function sandbox({ expenses, incomes, categories }){
  return buildSandbox(
    { expenses: expenses || [], incomes: incomes || [], monthKey: (d) => (d ? d.slice(0,7) : ''), CATEGORIES: categories || [] },
    ['monthAggregates', 'getCategoryType', 'mandatoryPaymentsSummary']
  );
}

test('monthAggregates: рахує дохід/витрати/залишок лише за обраний місяць', () => {
  const expenses = [
    { date: '2026-03-05', amount: 500 },
    { date: '2026-03-20', amount: 300 },
    { date: '2026-02-15', amount: 999 }, // інший місяць — не має враховуватись
  ];
  const incomes = [
    { date: '2026-03-01', amount: 20000 },
  ];
  const ctx = sandbox({ expenses, incomes });
  const agg = ctx.monthAggregates('2026-03');
  assert.equal(agg.totalExpense, 800);
  assert.equal(agg.totalIncome, 20000);
  assert.equal(agg.savings, 19200);
  assert.equal(agg.monthExp.length, 2);
});

test('monthAggregates: місяць без жодного запису → нулі, а не помилка', () => {
  const ctx = sandbox({ expenses: [], incomes: [] });
  const agg = ctx.monthAggregates('2026-05');
  assert.equal(agg.totalExpense, 0);
  assert.equal(agg.totalIncome, 0);
  assert.equal(agg.savings, 0);
});

test('getCategoryType: повертає роль активної категорії за назвою', () => {
  const categories = [
    { name: "🏠 Житло", type: "Обов'язкова", active: true },
    { name: "🎮 Розваги", type: "Гнучка", active: true },
  ];
  const ctx = sandbox({ categories });
  assert.equal(ctx.getCategoryType("🏠 Житло"), "Обов'язкова");
  assert.equal(ctx.getCategoryType("🎮 Розваги"), "Гнучка");
  assert.equal(ctx.getCategoryType("Неіснуюча категорія"), null);
});

test('mandatoryPaymentsSummary: обов\'язкові платежі та вільні гроші після них', () => {
  const categories = [
    { name: "🏠 Житло", type: "Обов'язкова", active: true },
    { name: "🎮 Розваги", type: "Гнучка", active: true },
  ];
  const expenses = [
    { date: '2026-03-01', amount: 8000, category: "🏠 Житло" },
    { date: '2026-03-10', amount: 1500, category: "🎮 Розваги" },
  ];
  const incomes = [{ date: '2026-03-01', amount: 20000 }];
  const ctx = sandbox({ expenses, incomes, categories });
  const { monthExp, totalIncome } = ctx.monthAggregates('2026-03');
  const { mandatory, freeMoney } = ctx.mandatoryPaymentsSummary(monthExp, totalIncome);
  assert.equal(mandatory, 8000);
  assert.equal(freeMoney, 12000);
});
