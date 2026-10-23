// Rev 2.32.68 (P4) — екран «Платежі» і дії.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildSandbox } = require('./extract');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const j = function(v){ return JSON.parse(JSON.stringify(v)); };
const names = ['ppPad', 'ppDaysInMonth', 'ppAddDays', 'ppDayDiff', 'ppNextMonth', 'ppClampDate', 'ppModeAmount', 'expectedPaymentForCard', 'installmentExpectedPayment', 'installmentPaidFull', 'installmentDuePassed', 'OCH_OVALS_MAX', 'installmentStandardPayment', 'installmentPaymentsLeft', 'installmentPayAmount', 'installmentTypicalPay', 'ppPad', 'ppNextMonth', 'installmentChainCalc', 'upcomingPayments', 'pluralUa', 'PAY_MONTHS_SHORT', 'PAY_DOW', 'PAY_MONTHS_GEN', 'payDow', 'payDateShort', 'payFmt', 'payAmountText', 'payPlural', 'payRelative', 'paymentsScreenModel', 'payActionModel'];
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
test('секції: Потребує уваги, Найближчі 14 днів, Пізніше, Картки без дати — із кількістю й порядком', function(){
  const m = model(DATA);
  assert.deepEqual(m.sections.map(function(s){ return s.key + ':' + s.rows.length; }), ['attention:1', 'window:4', 'later:6', 'cards:1']); // «Пізніше» — до кінця наступного місяця: 30 жов і весь листопад
  assert.equal(m.sections[0].title, 'Потребує уваги');
});
test('рядки: плитка дати, підпис «Через N днів», сума з «≈», «Не позначено сплаченим» для уваги', function(){
  const m = model(DATA);
  const att = m.sections[0].rows[0]; assert.equal(att.name, 'ПУМБ Dyson'); assert.equal(att.sub, 'Не позначено сплаченим'); assert.equal(att.day, 4); assert.equal(att.mon, 'жов'); assert.equal(att.amber, true); assert.match(att.amountText, /^≈ 2\s000\s₴$/);
  const win = m.sections[1].rows; assert.equal(win[0].name, 'ПУМБ iPhone'); assert.equal(win[0].sub, 'Через 2 дні'); assert.equal(win[1].sub, 'Через 5 днів');
  assert.ok(!/прострочен/.test(JSON.stringify(m)));
});
test('картки без дати — окрема секція з підписом-поясненням; сума без «≈»', function(){
  const m = model(DATA); const sec = m.sections.filter(function(s){ return s.key === 'cards'; })[0];
  assert.equal(sec.rows[0].name, 'Приват Банк'); assert.match(sec.rows[0].amountText, /^37\s775\s₴$/); assert.equal(sec.rows[0].date, null);
  assert.match(sec.caption, /Додайте день платежу в картці/);
  assert.equal(m.caption, 'Суми з «≈» очікувані за попередніми місяцями. Торкніться платежу, щоб внести його й зафіксувати факт.');
});
test('вікно 14 днів і «Пізніше» (до кінця наступного місяця); порожній екран', function(){
  const m = model(DATA);
  assert.deepEqual(m.sections.filter(function(s){ return s.key === 'later'; })[0].rows.map(function(r){ return r.day + ' ' + r.mon; }).slice(0, 2), ['30 жов', '4 лис']);
  const e = model({}); assert.equal(e.empty, true);
});
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
  const fn = SRC.slice(SRC.indexOf('function payInstallmentPrefill'), SRC.indexOf('async function markCardMinPaid'));
  assert.ok(!/addExpense\(|saveExpenses\(|expenses\.push/.test(fn), 'автоматичного створення витрат немає');
  assert.match(fn, /rolloverState\.dateManual = true;/); assert.match(fn, /confirmedInstallmentLinkIdx = i;/);
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

// Rev 2.32.152 (OCH-DUE): пільговий день (dueDate+1) — ОЧ показується як «Сьогодні», без «Через -1 дні», у load; «без позначки» лише з дати+2
test('пільговий день dueDate+1: ОЧ у «Найближчих» з датою «сьогодні», payRelative «Сьогодні», у навантаженні; не в «Потребує уваги»', function(){
  const mk = (today) => c.upcomingPayments({ today: today, horizonDays: 14, installments: [I('X', 15)], debtsByMonth: [D('X', '2026-10', { monthlyPayment: 5000 })], expenses: [] });
  const g = mk('2026-10-16');
  assert.equal(g.unconfirmed.length, 0); assert.equal(g.items.length, 1);
  assert.equal(g.items[0].date, '2026-10-16'); assert.equal(c.payRelative(g.items[0].date, '2026-10-16'), 'Сьогодні');
  assert.equal(g.load.total, 5000); assert.equal(g.load.count, 1);
  const m = c.paymentsScreenModel(g, '2026-10-16');
  assert.ok(!/Через -\d/.test(JSON.stringify(m)), 'жодного від\'ємного «Через -1 дні»');
  const d2 = mk('2026-10-17'); assert.equal(d2.unconfirmed.length, 1); assert.equal(d2.items.length, 0);
});
