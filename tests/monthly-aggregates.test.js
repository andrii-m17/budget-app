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
    ['monthAggregates', 'getCategoryType', 'mandatoryPaymentsSummary', 'activeExpenses', 'activeIncomes']
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

/* ============ debtTotalsForMonth: BugFix — колізія назв card/installment ============
   Термінове розслідування (вересень 2026): ОЧ "Приват Банк Оля" (та сама
   назва, що картка "Приват Банк Оля") зникала з Дашборду, хоч і лишалась
   видимою в "Обліку". Причина — byName-мапа в debtTotalsForMonth()
   ключувалась ЛИШЕ за `name`, без `kind`: два debts-записи з однаковою
   назвою, різний kind, той самий/пізніший місяць → один тихо перезаписував
   інший. Фікс — ключ `kind:name` (hideKey()), той самий патерн, що вже
   в коді. populateInstallmentTable() ("Облік") НЕ постраждала — вона й так
   фільтрує debts.find() за name+kind разом, тому окремого регресійного
   тесту на неї не потрібно (не чіпалась, "не робимо" з боку специфікації). */

function debtSandbox(){
  return buildSandbox(
    { debts: [], hiddenFrom: {}, expenses: [] },
    ['debtTotalsForMonth', 'hideKey', 'isHiddenForMonth',
      // Rev #30 (6D.44) — debtTotalsForMonth() тепер сканує activeDebts(), не сирий debts.
      'activeDebts',
      // Rev 2.22.75 (6D.148) — debtTotalsForMonth() тепер для installment-
      // записів кличе resolveInstallmentFact() (пріоритет прив'язаної
      // витрати над ручним фактом) — весь ланцюжок залежностей мусить бути
      // в sandbox, інакше ReferenceError усередині extracted-коду.
      'resolveInstallmentFact', 'estimateInstallment', 'linkedExpensesSum',
      'lastKnownBalance', 'typicalMonthlyPayment', 'activeExpenses', 'monthKey']
  );
}

test('debtTotalsForMonth: BugFix — картка й ОЧ з ОДНАКОВОЮ назвою, той самий місяць → ОБИДВА присутні в result.list', () => {
  const ctx = debtSandbox();
  ctx.debts = [
    { id: 'd1', name: 'Приват Банк Оля', kind: 'card', month: '2026-05', balance: 1000 },
    { id: 'd2', name: 'Приват Банк Оля', kind: 'installment', month: '2026-05', balance: 2000 },
  ];
  const result = ctx.debtTotalsForMonth('2026-05');
  assert.equal(result.list.length, 2);
  assert.ok(result.list.some(d => d.kind === 'card' && d.balance === 1000));
  assert.ok(result.list.some(d => d.kind === 'installment' && d.balance === 2000));
  assert.equal(result.total, 1000); // "Борг" — лише картки
  assert.equal(result.totalInstallment, 2000); // ОЧ — окремо, до фіксу тут був би 0
});

test('debtTotalsForMonth: колізія назв, РІЗНІ місяці (installment пізніший) → обидва присутні, кожен свій найсвіжіший запис', () => {
  const ctx = debtSandbox();
  ctx.debts = [
    { id: 'd1', name: 'Приват Банк Оля', kind: 'card', month: '2026-04', balance: 500 },
    { id: 'd2', name: 'Приват Банк Оля', kind: 'installment', month: '2026-05', balance: 2000 },
  ];
  const result = ctx.debtTotalsForMonth('2026-05');
  assert.equal(result.list.length, 2);
  assert.equal(result.total, 500);
  assert.equal(result.totalInstallment, 2000);
});

test('debtTotalsForMonth: без колізії (різні назви) — поведінка незмінна, дедуплікація за найсвіжішим місяцем і далі працює', () => {
  const ctx = debtSandbox();
  ctx.debts = [
    { id: 'd1', name: 'Приват Банк', kind: 'card', month: '2026-03', balance: 1000 },
    { id: 'd2', name: 'Приват Банк', kind: 'card', month: '2026-05', balance: 1500 }, // новіший — має перемогти
  ];
  const result = ctx.debtTotalsForMonth('2026-05');
  assert.equal(result.list.length, 1);
  assert.equal(result.list[0].balance, 1500);
  assert.equal(result.total, 1500);
});

test('debtTotalsForMonth: isHiddenForMonth і далі враховує kind окремо для колізії назв (приховано лише card, installment лишається видимим)', () => {
  const ctx = debtSandbox();
  ctx.hiddenFrom = { 'card:Приват Банк Оля': '2026-05' };
  ctx.debts = [
    { id: 'd1', name: 'Приват Банк Оля', kind: 'card', month: '2026-04', balance: 1000 },
    { id: 'd2', name: 'Приват Банк Оля', kind: 'installment', month: '2026-05', balance: 2000 },
  ];
  const result = ctx.debtTotalsForMonth('2026-05');
  assert.equal(result.list.length, 1);
  assert.equal(result.list[0].kind, 'installment');
  assert.equal(result.total, 0);
  assert.equal(result.totalInstallment, 2000);
});

/* ============ debtTotalsForMonth × resolveInstallmentFact (Rev 2.22.75, 6D.148) ============
   Модель C, пріоритет за явним підтвердженням користувача: прив'язана
   витрата ЦЬОГО місяця — авторитетніше джерело для "Платіж/міс"/"Залишок"
   ОЧ, ніж уже введений вручну факт (debts-запис) — саме ця (linkedSum-
   похідна) цифра має бути видна і в дашборді (renderInstallmentsCard читає
   result.list напряму), і в Обліку. Ручний факт лишається пріоритетом лише
   КОЛИ прив'язаної витрати немає цього місяця (попередні тести вище це вже
   покривають — linkedSum=0 за замовчуванням, expenses:[]). */
test('debtTotalsForMonth: є прив\'язана витрата цього місяця → linkedSum ПЕРЕВАЖАЄ вручну збережений monthlyPayment/balance', () => {
  const ctx = debtSandbox();
  ctx.debts = [
    { name: 'ПУМБ Dyson', kind: 'installment', month: '2026-07', balance: 28119, monthlyPayment: 7000 },
    // Rev 2.2.2 — вручну збережено 2000 (стара розбіжність, скрін
    // користувача), хоча прив'язана витрата цього місяця — 2492.
    { name: 'ПУМБ Dyson', kind: 'installment', month: '2026-08', balance: 25619, monthlyPayment: 2000 },
  ];
  ctx.expenses = [
    { linkedInstallment: 'ПУМБ Dyson', date: '2026-08-02', amount: 2492 },
  ];
  const result = ctx.debtTotalsForMonth('2026-08');
  assert.equal(result.list.length, 1);
  // est.balance = prevBal(28119, з липня) - linkedSum(2492) = 25627, НЕ
  // вручну збережені 25619.
  assert.equal(result.list[0].balance, 28119 - 2492);
  assert.equal(result.list[0].monthlyPayment, 2492);
  assert.equal(result.totalInstallment, 28119 - 2492);
  assert.equal(result.totalMonthlyInstallment, 2492);
});

test('debtTotalsForMonth: немає прив\'язаної витрати цього місяця → вручну збережений factor і далі пріоритетний (регресія)', () => {
  const ctx = debtSandbox();
  ctx.debts = [
    { name: 'ПУМБ Dyson', kind: 'installment', month: '2026-08', balance: 25619, monthlyPayment: 2000 },
  ];
  ctx.expenses = [];
  const result = ctx.debtTotalsForMonth('2026-08');
  assert.equal(result.list[0].balance, 25619);
  assert.equal(result.list[0].monthlyPayment, 2000);
});

test('debtTotalsForMonth: linkedSum>0, але НЕМАЄ попереднього факту (est.balance=null) → list[].balance лишається старим d.balance, не null/NaN', () => {
  const ctx = debtSandbox();
  // Єдиний debts-запис — сам за ЦЕЙ місяць (немає ЖОДНОГО попереднього →
  // lastKnownBalance()=null всередині estimateInstallment→est.balance=null).
  ctx.debts = [
    { name: 'Нова ОЧ', kind: 'installment', month: '2026-08', balance: 999, monthlyPayment: 300 },
  ];
  ctx.expenses = [{ linkedInstallment: 'Нова ОЧ', date: '2026-08-05', amount: 500 }];
  const result = ctx.debtTotalsForMonth('2026-08');
  // resolveInstallmentFact.balance=null (немає prevBal) → debtTotalsForMonth
  // явно лишає d.balance замість пробивання null/NaN у суму.
  assert.equal(result.list[0].balance, 999);
  // pay натомість завжди відомий (сам linkedSum, не залежить від prevBal).
  assert.equal(result.list[0].monthlyPayment, 500);
  assert.equal(result.totalInstallment, 999);
});
