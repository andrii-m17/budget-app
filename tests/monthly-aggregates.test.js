// Rev 2.14.0 — тести підрахунку доходів/витрат/залишку за місяць
// (monthAggregates) і композиції "Обов'язкові платежі" / "Після обов'язкових"
// (KPI на Дашборді).
//
// ВАЖЛИВО: сама композиція mandatory/freeMoney НЕ є окремою функцією — вона
// порахована інлайн усередині renderDashboard() (index.html), величезної
// DOM-рендер функції, яку не можна викликати без готового DOM (getElementById
// по десятках id). Тест нижче ("Обов'язкові платежі...") викликає РЕАЛЬНІ
// ізольовані functions (monthAggregates + getCategoryType) і відтворює лише
// фінальний filter/reduce одним рядком — так само задокументовано як
// прогалина для Stage 5 (винести розрахунок KPI окремо від рендеру).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildSandbox } = require('./extract');

function sandbox({ expenses, incomes, categories }){
  return buildSandbox(
    { expenses: expenses || [], incomes: incomes || [], monthKey: (d) => (d ? d.slice(0,7) : ''), CATEGORIES: categories || [] },
    ['monthAggregates', 'getCategoryType']
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

test('Обов\'язкові платежі / Після обов\'язкових: композиція monthAggregates+getCategoryType', () => {
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
  const mandatory = monthExp
    .filter(e => ctx.getCategoryType(e.category) === "Обов'язкова")
    .reduce((s, e) => s + e.amount, 0);
  const freeMoney = totalIncome - mandatory;
  assert.equal(mandatory, 8000);
  assert.equal(freeMoney, 12000);
});
