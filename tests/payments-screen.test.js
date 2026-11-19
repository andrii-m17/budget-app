// Rev 2.32.68 (P4) — екран «Платежі» і дії.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildSandbox } = require('./extract');
const SRC = require('./extract').readIndexWithCss();
const j = function(v){ return JSON.parse(JSON.stringify(v)); };
const names = ['ppPad', 'ppDaysInMonth', 'ppAddDays', 'ppDayDiff', 'ppNextMonth', 'ppClampDate', 'ppModeAmount', 'expectedPaymentForCard', 'installmentExpectedPayment', 'installmentPaidFull', 'installmentDuePassed', 'OCH_OVALS_MAX', 'installmentStandardPayment', 'installmentPaymentsLeft', 'installmentPayAmount', 'installmentTypicalPay', 'ppPad', 'ppNextMonth', 'ochMonthIndex', 'ochPlannedPaymentsBefore', 'ochOpeningBalance', 'installmentChainCalc', 'installmentStartMonth', 'installmentStartMonthFor', 'cardCreatedMonth', 'upcomingPayments', 'findAccountMonthDebt', 'pluralUa', 'PAY_MONTHS_SHORT', 'PAY_DOW', 'PAY_MONTHS_GEN', 'payDow', 'payDateShort', 'payFmt', 'payAmountText', 'payPlural', 'payRelative', 'PAY_MONTHS_NOM', 'payWeekEnd', 'payMonthLast', 'paySum', 'paySumText', 'payRowModel', 'payDayLabel', 'payDayGroups', 'payTilesModel', 'ochOvalsModel', 'paymentsScreenModel', 'payActionModel'];
const c = buildSandbox({}, names);
const I = function(name, dueDay){ return { name: name, dueDay: dueDay }; };
const D = function(name, month, extra){ return Object.assign({ kind: 'installment', name: name, month: month }, extra || {}); };
function model(o){
  const today = o.today || '2026-10-15';
  const r = c.upcomingPayments(Object.assign({ today: today, horizonDays: 14, installments: [], cards: [], debtsByMonth: [], expenses: [], hidden: {} }, o));
  return j(c.paymentsScreenModel(r, today));
}
const DATA = { installments: [I('ПУМБ Dyson', 4), I('ПУМБ iPhone', 17), I('Моно Ноутбук1', 20), I('Моно Ноутбук2', 26), I('ПУМБ Ноутбук', 30)], cards: [{ name: 'Приват Банк' }, { name: 'Моно Банк', paymentDay: 24 }],
  debtsByMonth: [D('ПУМБ Dyson', '2026-09', { monthlyPayment: 2000, balance: 9 }), D('ПУМБ iPhone', '2026-09', { monthlyPayment: 5000, balance: 9 }), D('Моно Ноутбук1', '2026-09', { monthlyPayment: 4940, balance: 9 }), D('Моно Ноутбук2', '2026-09', { monthlyPayment: 7865, balance: 9 }), D('ПУМБ Ноутбук', '2026-09', { monthlyPayment: 3200, balance: 9 }),
    { kind: 'card', name: 'Приват Банк', month: '2026-10', minPayment: 37775 }, { kind: 'card', name: 'Моно Банк', month: '2026-10', minPayment: 16449 }] };
test('Rev 2.32.418 (DS-PAYLIST): модель — плитки, «Чекає внесення», групи 14 днів, «Пізніше» по місяцях, картки без дати', function(){
  const m = model(DATA);
  assert.deepEqual(m.tiles.map(t => t.key), ['wait', 'week', 'rest']);
  assert.equal(m.wait.length, 1); assert.equal(m.wait[0].name, 'ПУМБ Dyson'); assert.equal(m.wait[0].text, 'Платіж 4 жов ще не внесено у витрати'); assert.equal(m.wait[0].action, 'Внести платіж');
  assert.equal(m.window.title, 'Найближчі 14 днів'); assert.equal(m.window.count, 4);
  assert.deepEqual(m.later.map(x => x.key), ['2026-10', '2026-11']); assert.equal(m.later[0].title, 'Жовтень'); assert.equal(m.later[1].title, 'Листопад');
  assert.equal(m.undated.length, 1); assert.equal(m.undated[0].name, 'Приват Банк');
});
test('рядки: «ОЧ», сума з сірим «≈» лише для очікуваних; слова «Прострочено» немає', function(){
  const m = model(DATA);
  const w = m.wait[0]; assert.equal(w.approx, true); assert.match(w.amountText, /^≈ 2\s000\s₴$/); assert.match(w.amountPlain, /^2\s000\s₴$/);
  assert.equal(m.window.days[0].rows[0].name, 'ПУМБ iPhone'); assert.equal(m.window.days[0].rows[0].sub, 'ОЧ');
  assert.ok(!/прострочен/i.test(JSON.stringify(m)));
});
test('картки без дати — окремі рядки з підписом-поясненням; сума без «≈»', function(){
  const m = model(DATA);
  assert.equal(m.undated[0].name, 'Приват Банк'); assert.match(m.undated[0].amountText, /^37\s775\s₴$/); assert.equal(m.undated[0].date, null); assert.equal(m.undated[0].approx, false);
  assert.match(m.undatedCaption, /Додайте день платежу в картці/);
  assert.equal(m.caption, 'Суми з «≈» очікувані за попередніми місяцями. Торкніться платежу, щоб внести його й зафіксувати факт.');
});
test('порожній екран', function(){ const e = model({}); assert.equal(e.empty, true); assert.equal(e.wait.length, 0); assert.equal(e.window, null); });
test('дії: ОЧ — «Внести платіж» (форма витрати), картка — «Позначити сплаченим» (не витрата); тексти як у макеті', function(){
  const a = j(c.payActionModel({ kind: 'installment', name: 'ПУМБ iPhone', date: '2026-10-17', amount: 5000, estimated: true }));
  assert.equal(a.primary, 'Внести платіж'); assert.match(a.sub, /^17 жовтня · ≈ 5\s000\s₴$/); assert.equal(a.note, 'Відкриється форма витрати з підставленими сумою, датою й ОЧ. Збереження лише вашим дотиком.');
  const b = j(c.payActionModel({ kind: 'card', name: 'Приват Банк', date: null, amount: 37775 }));
  assert.equal(b.primary, 'Позначити сплаченим'); assert.equal(b.note, 'Це не витрата: змінюється лише позначка в «Обліку».'); assert.match(b.sub, /^Мінімальний платіж · 37\s775\s₴$/);
});
test('payRelative: Сьогодні, Завтра, Через N днів з відмінюванням', function(){
  assert.equal(c.payRelative('2026-10-15', '2026-10-15'), 'Сьогодні'); assert.equal(c.payRelative('2026-10-16', '2026-10-15'), 'Завтра');
  assert.equal(c.payRelative('2026-10-17', '2026-10-15'), 'Через 2 дні'); assert.equal(c.payRelative('2026-10-20', '2026-10-15'), 'Через 5 днів'); assert.equal(c.payRelative('2026-11-05', '2026-10-15'), 'Через 21 день');
});
test('upcomingPayments: undatedList містить картки без дня з сумою', function(){
  const r = j(c.upcomingPayments({ today: '2026-10-15', horizonDays: 14, installments: [], cards: [{ name: 'A' }], debtsByMonth: [{ kind: 'card', name: 'A', month: '2026-10', minPayment: 300 }], expenses: [], hidden: {} }));
  assert.deepEqual(r.undatedList, [{ kind: 'card', name: 'A', month: '2026-10', amount: 300, date: null }]);
});
test('«Позначити сплаченим»: лише minPaymentDone + updatedAt, збереження й push; витрата не створюється', async function(){
  const calls = [];
  const debts = [{ kind: 'card', name: 'Приват Банк', month: '2026-10', minPayment: 100, minPaymentDone: false, updatedAt: 'old' }];
  const ctx = buildSandbox({ debts: debts, monthKey2: function(m){ return m; }, saveDebts: async function(){ calls.push('save'); return {}; }, reportSaveResult: function(){}, pushDebtRecordPilot: function(r){ calls.push('push:' + r.name); }, closePayAction: function(){ calls.push('close'); }, renderAll: function(){ calls.push('render'); }, showToast: function(){ calls.push('toast'); }, showTextToast: function(){}, expenses: [], saveExpenses: async function(){ calls.push('SAVE-EXPENSES'); } }, ['markCardMinPaid']);
  await ctx.markCardMinPaid({ kind: 'card', name: 'Приват Банк', month: '2026-10' });
  assert.equal(debts[0].minPaymentDone, true); assert.notEqual(debts[0].updatedAt, 'old');
  assert.deepEqual(calls, ['save', 'push:Приват Банк', 'close', 'render', 'toast']);
});
test('охоронні: «Внести платіж» не зберігає витрату сам; екран закривається при перемиканні вкладки; під таббаром; назви через textContent; перерахунок у renderAll', function(){
  const fn = SRC.slice(SRC.indexOf('let payLinkInfo'), SRC.indexOf('async function markCardMinPaid'));
  assert.ok(!/addExpense\(|saveExpenses\(|expenses\.push/.test(fn), 'автоматичного створення витрат немає');
  assert.match(fn, /rolloverState\.dateManual = date !== localDateISO\(\);/); assert.match(fn, /confirmedInstallmentLinkIdx = i;/);
  assert.match(SRC, /if\(isPaymentsOpen\) closePaymentsScreen\(\); \/\/ Rev 2\.32\.68 \(P4\)/);
  assert.match(SRC, /if\(isPaymentsOpen\) safeCall\(renderPaymentsScreen, 'renderPaymentsScreen'\);/);
  assert.match(SRC, /<div class="mono-screen hidden" id="payments-screen"/); assert.ok(!/id="payments-screen"[^>]*mono-inbox-screen/.test(SRC));
  const rs = SRC.slice(SRC.indexOf('function renderPaymentsScreen'), SRC.indexOf('function openPaymentsScreen'));
  assert.ok(!/innerHTML\s*=/.test(rs.replace(/ch\.innerHTML = PAY_CHEV_SVG/, '')));
  assert.ok(!/\p{Extended_Pictographic}/u.test(rs));
  assert.match(SRC, /\.pay-line\{[^}]*min-height:60px/);
  assert.match(SRC, /installEdgeSwipeClose\(document\.getElementById\('payments-screen'\)/);
});
test('картка «Найближчі платежі» відкриває екран: openPaymentsScreen(date) викликається з тапу по дню і «Усі платежі»', function(){
  assert.match(SRC, /const openAll = function\(date\)\{ if\(typeof openPaymentsScreen === 'function'\) openPaymentsScreen\(date\); \};/);
  assert.match(SRC, /function openPaymentsScreen\(date\)/);
});

// Rev 2.32.152 (OCH-DUE) + Rev 2.32.396 (FIX-PAY): пільговий день (dueDate+1) — ОЧ лишається у «Найближчих» зі СПРАВЖНЬОЮ датою й позначкою overdue (не переноситься на сьогодні), у навантаженні; не в «Потребує уваги»; «без позначки» лише з дати+2
test('пільговий день dueDate+1: ОЧ у «Найближчих» зі справжньою датою й overdue, у навантаженні; не в «Потребує уваги»', function(){
  const mk = (today) => c.upcomingPayments({ today: today, horizonDays: 14, installments: [I('X', 15)], debtsByMonth: [D('X', '2026-10', { monthlyPayment: 5000 })], expenses: [] });
  const g = mk('2026-10-16');
  assert.equal(g.unconfirmed.length, 0); assert.equal(g.items.length, 1);
  assert.equal(g.items[0].date, '2026-10-15', 'справжня дата, не «сьогодні»'); assert.equal(g.items[0].overdue, true);
  assert.equal(g.load.total, 5000); assert.equal(g.load.count, 1);
  const m = j(c.paymentsScreenModel(g, '2026-10-16'));
  assert.ok(!/Через -\d/.test(JSON.stringify(m)), 'жодного від\'ємного «Через -1 дні»');
  assert.equal(m.wait.length, 0, 'пільговий день — не в «Чекає внесення»'); assert.equal(m.window.days[0].title, 'Вчора'); assert.equal(m.window.days[0].date, '2026-10-15');
  const d2 = mk('2026-10-17'); assert.equal(d2.unconfirmed.length, 1); assert.equal(d2.items.length, 0);
});
