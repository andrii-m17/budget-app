// Rev 2.32.67 (P3) — картка «Найближчі платежі»: модель станів А–Ж і охоронні перевірки.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildSandbox } = require('./extract');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const j = function(v){ return JSON.parse(JSON.stringify(v)); };
const c = buildSandbox({}, ['ppPad', 'ppDaysInMonth', 'ppAddDays', 'ppDayDiff', 'ppNextMonth', 'ppClampDate', 'ppModeAmount', 'upcomingPayments', 'pluralUa', 'PAY_MONTHS_SHORT', 'PAY_DOW', 'PAY_MONTHS_GEN', 'payDow', 'payDateShort', 'payFmt', 'payAmountText', 'payPlural', 'paymentsCardModel']);
const I = function(name, dueDay){ return { name: name, dueDay: dueDay }; };
const D = function(name, month, extra){ return Object.assign({ kind: 'installment', name: name, month: month }, extra || {}); };
function model(o){
  const today = o.today || '2026-10-15';
  const r = c.upcomingPayments(Object.assign({ today: today, horizonDays: 7, installments: [], cards: [], debtsByMonth: [], expenses: [], hidden: {} }, o));
  return j(c.paymentsCardModel(r, today, (o.installments || []).length + (o.cards || []).length > 0));
}
test('приховано, якщо немає жодної ОЧ і картки', function(){ assert.equal(model({}).hidden, true); });
test('А: очікувані суми (≈), 7 днів, заголовок і рядки', function(){
  const m = model({ installments: [I('ПУМБ iPhone', 17), I('Моно Ноутбук1', 20)], debtsByMonth: [D('ПУМБ iPhone', '2026-09', { monthlyPayment: 5000, balance: 9 }), D('Моно Ноутбук1', '2026-09', { monthlyPayment: 4940, balance: 9 })] });
  assert.equal(m.state, 'week'); assert.equal(m.hidden, false); assert.match(m.big, /^≈ 9\s940\s₴$/); assert.equal(m.sub, '2 платежі до 21 жовтня');
  assert.equal(m.days.length, 7); assert.equal(m.days[0].today, true); assert.equal(m.days[0].dow, 'Чт');
  assert.deepEqual(m.days.filter(function(d){ return d.has; }).map(function(d){ return d.day + ':' + d.sum; }), ['17:5000', '20:4940']);
  assert.deepEqual(m.rows.map(function(r){ return r.label; }), ['Сб 17 жов · ПУМБ iPhone', 'Вт 20 жов · Моно Ноутбук1']);
  assert.match(m.rows[0].amount, /^≈ 5\s000\s₴$/);
});
test('Б: підтверджені суми (є запис місяця) — без «≈»', function(){
  const m = model({ installments: [I('A', 17), I('B', 20)], debtsByMonth: [D('A', '2026-10', { monthlyPayment: 5000, balance: 9 }), D('B', '2026-10', { monthlyPayment: 4940, balance: 9 })] });
  assert.match(m.big, /^9\s940\s₴$/); assert.ok(!/≈/.test(m.rows[0].amount));
});
test('В: платіж без позначки — окремий рядок із нейтральним формулюванням', function(){
  const m = model({ installments: [I('ПУМБ Dyson', 4), I('A', 17)], debtsByMonth: [D('ПУМБ Dyson', '2026-10', { monthlyPayment: 100, balance: 9 }), D('A', '2026-10', { monthlyPayment: 5, balance: 9 })] });
  assert.deepEqual(m.unconfirmed, { title: '1 платіж без позначки', sub: 'ПУМБ Dyson · 4 жов' });
  assert.ok(!/прострочен|борг/i.test(JSON.stringify(m)));
});
test('Г: картки без дати — окремий рядок із кількістю й сумою', function(){
  const m = model({ installments: [I('A', 17)], cards: [{ name: 'K1' }, { name: 'K2' }, { name: 'K3' }], debtsByMonth: [D('A', '2026-10', { monthlyPayment: 5, balance: 9 }), { kind: 'card', name: 'K1', month: '2026-10', minPayment: 100 }, { kind: 'card', name: 'K2', month: '2026-10', minPayment: 200 }, { kind: 'card', name: 'K3', month: '2026-10', minPayment: 300 }] });
  assert.equal(m.cards.title, 'Картки · 3 платежі'); assert.equal(m.cards.sub, 'Дату платежу не задано'); assert.match(m.cards.amount, /^600\s₴$/);
});
test('Д: ОЧ без дня платежу — підказка', function(){
  const m = model({ installments: [I('A', 17), I('X', null), I('Y', null)], debtsByMonth: [D('A', '2026-10', { monthlyPayment: 5, balance: 9 }), D('X', '2026-10', { monthlyPayment: 1, balance: 9 }), D('Y', '2026-10', { monthlyPayment: 1, balance: 9 })] });
  assert.equal(m.noDay, '2 ОЧ без дня платежу: вони не потрапляють у календар. Додайте день у «Обліку».');
});
test('Е: у найближчі 7 днів платежів немає, наступний у цьому місяці', function(){
  const m = model({ today: '2026-10-05', installments: [I('ПУМБ iPhone', 17)], debtsByMonth: [D('ПУМБ iPhone', '2026-10', { monthlyPayment: 5000, balance: 9 })] });
  assert.equal(m.state, 'empty'); assert.equal(m.big, 'Найближчі 7 днів без платежів'); assert.equal(m.showStrip, true);
  assert.match(m.next, /^Наступний: Сб 17 жов · ПУМБ iPhone · 5\s000\s₴$/);
});
test('Ж: усе сплачено цього місяця — без смуги; наступний платіж наступного місяця', function(){
  const m = model({ today: '2026-10-25', installments: [I('ПУМБ Dyson', 4)], debtsByMonth: [D('ПУМБ Dyson', '2026-09', { monthlyPayment: 2000, balance: 9 }), D('ПУМБ Dyson', '2026-10', { monthlyPayment: 2000, balance: 9 })], expenses: [{ date: '2026-10-04', linkedInstallment: 'ПУМБ Dyson', amount: 2000 }] });
  assert.equal(m.state, 'allpaid'); assert.equal(m.big, 'Усе сплачено цього місяця'); assert.equal(m.showStrip, false);
  assert.match(m.next, /^Наступний: 4 лис · ПУМБ Dyson · ≈ 2\s000\s₴$/);
});
test('невідома сума: «Сума невідома», рядок із «сума невідома»; частково невідома — «· N без суми»', function(){
  const m = model({ installments: [I('A', 17)], debtsByMonth: [D('A', '2026-10', { balance: 9 })] });
  assert.equal(m.big, 'Сума невідома'); assert.equal(m.rows[0].amount, 'сума невідома');
  const m2 = model({ installments: [I('A', 17), I('B', 18)], debtsByMonth: [D('A', '2026-10', { monthlyPayment: 100, balance: 9 }), D('B', '2026-10', { balance: 9 })] });
  assert.match(m2.sub, /· 1 без суми$/);
});
test('перехід місяця: смуга 29 жовтня → 4 листопада, лист у «до» і день', function(){
  const m = model({ today: '2026-10-29', installments: [I('N', 2)], debtsByMonth: [D('N', '2026-11', { monthlyPayment: 10, balance: 9 })] });
  assert.equal(m.days[0].date, '2026-10-29'); assert.equal(m.days[6].date, '2026-11-04'); assert.equal(m.sub, '1 платіж до 4 листопада');
});
test('охоронні: у картці немає емодзі, назви через textContent, нейтральні тексти, картка в renderAll, прихована без даних, елементи — кнопки', function(){
  const fn = SRC.slice(SRC.indexOf('function renderPaymentsCard'), SRC.indexOf('function typicalMonthlyPayment'));
  assert.ok(!/innerHTML\s*=/.test(fn.replace(/chev\.innerHTML = PAY_CHEV_SVG/, '')), 'дані не йдуть через innerHTML');
  assert.ok(!/\p{Extended_Pictographic}/u.test(SRC.slice(SRC.indexOf('/* ============ Картка «Найближчі платежі»'), SRC.indexOf('function typicalMonthlyPayment'))), 'без емодзі');
  assert.match(SRC, /safeCall\(renderPaymentsCard, 'renderPaymentsCard'\);/);
  assert.match(SRC, /<section class="pay-card hidden" id="payments-card"/);
  assert.ok(!/прострочено/.test(SRC.slice(SRC.indexOf('function paymentsCardModel'), SRC.indexOf('function renderPaymentsCard'))));
  assert.match(fn, /payEl\('button', 'pay-row'/); assert.match(fn, /payEl\('button', 'pay-day'/); assert.match(fn, /payEl\('button', 'pay-all'\)/);
  assert.match(SRC, /\.pay-day\{ flex:1; min-width:0; min-height:64px;/); assert.match(SRC, /\.pay-row\{[^}]*min-height:44px/); assert.match(SRC, /\.pay-all\{[^}]*min-height:48px/);
});
