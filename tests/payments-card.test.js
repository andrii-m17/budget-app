// Rev 2.32.67 (P3) / 2.32.71 (компактна картка) — модель станів і охоронні перевірки.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildSandbox } = require('./extract');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const j = function(v){ return JSON.parse(JSON.stringify(v)); };
const c = buildSandbox({}, ['ppPad', 'ppDaysInMonth', 'ppAddDays', 'ppDayDiff', 'ppNextMonth', 'ppClampDate', 'ppModeAmount', 'expectedPaymentForCard', 'upcomingPayments', 'pluralUa', 'PAY_MONTHS_SHORT', 'PAY_DOW', 'PAY_MONTHS_GEN', 'payDow', 'payDateShort', 'payFmt', 'payAmountText', 'payPlural', 'paymentsCardModel']);
const I = function(name, dueDay){ return { name: name, dueDay: dueDay }; };
const D = function(name, month, extra){ return Object.assign({ kind: 'installment', name: name, month: month }, extra || {}); };
function model(o){
  const today = o.today || '2026-10-15';
  const r = c.upcomingPayments(Object.assign({ today: today, horizonDays: 7, installments: [], cards: [], debtsByMonth: [], expenses: [], hidden: {} }, o));
  return j(c.paymentsCardModel(r, today, (o.installments || []).length + (o.cards || []).length > 0));
}
const BASE = { installments: [I('ПУМБ iPhone', 17), I('Моно Ноутбук1', 20)], debtsByMonth: [D('ПУМБ iPhone', '2026-09', { monthlyPayment: 5000, balance: 9 }), D('Моно Ноутбук1', '2026-09', { monthlyPayment: 4940, balance: 9 })] };
test('приховано, якщо немає жодної ОЧ і картки', function(){ assert.equal(model({}).hidden, true); });
test('А: очікувані суми — сума в заголовку з «≈», один найближчий платіж одним рядком, друга не показується', function(){
  const m = model(BASE);
  assert.equal(m.state, 'week'); assert.match(m.total, /^≈ 9\s940\s₴$/); assert.equal(m.window, '7 днів');
  assert.equal(m.days.length, 7); assert.equal(m.days[0].today, true);
  assert.deepEqual(m.days.filter(function(d){ return d.has; }).map(function(d){ return d.day + ':' + d.sum; }), ['17:5000', '20:4940']);
  assert.equal(m.next.label, 'Наступний · Сб 17 · ПУМБ iPhone'); assert.match(m.next.amount, /^≈ 5\s000\s₴$/);
  assert.ok(!JSON.stringify(m).includes('Моно Ноутбук1'), 'другий платіж у картці не показується');
  assert.equal(m.sub, undefined, 'підзаголовка «N платежі до дати» немає');
});
test('Б: підтверджені суми — без «≈»', function(){
  const m = model({ installments: [I('A', 17), I('B', 20)], debtsByMonth: [D('A', '2026-10', { monthlyPayment: 5000, balance: 9 }), D('B', '2026-10', { monthlyPayment: 4940, balance: 9 })] });
  assert.match(m.total, /^9\s940\s₴$/); assert.ok(!/≈/.test(m.next.amount));
});
test('В: без позначки — перше повідомлення, бурштинове, нейтральне («N без позначки · назва, дата»)', function(){
  const m = model({ installments: [I('ПУМБ Dyson', 4), I('A', 17)], debtsByMonth: [D('ПУМБ Dyson', '2026-10', { monthlyPayment: 100, balance: 9 }), D('A', '2026-10', { monthlyPayment: 5, balance: 9 })] });
  assert.deepEqual(m.messages[0], { kind: 'unconfirmed', text: '1 без позначки · ПУМБ Dyson, 4 жов' });
  assert.ok(!/прострочен|борг/i.test(JSON.stringify(m)));
});
test('Г: картки без дати — повідомлення з сумою праворуч', function(){
  const m = model({ installments: [I('A', 17)], cards: [{ name: 'K1' }, { name: 'K2' }, { name: 'K3' }], debtsByMonth: [D('A', '2026-10', { monthlyPayment: 5, balance: 9 }), { kind: 'card', name: 'K1', month: '2026-10', minPayment: 100 }, { kind: 'card', name: 'K2', month: '2026-10', minPayment: 200 }, { kind: 'card', name: 'K3', month: '2026-10', minPayment: 300 }] });
  assert.equal(m.messages[0].kind, 'cards'); assert.equal(m.messages[0].text, 'Картки без дати · 3'); assert.match(m.messages[0].amount, /^600\s₴$/);
});
test('Д: «N ОЧ без дня платежу» — лише якщо лишилось місце (не більше двох повідомлень, у порядку)', function(){
  const only = model({ installments: [I('A', 17), I('X', null), I('Y', null)], debtsByMonth: [D('A', '2026-10', { monthlyPayment: 5, balance: 9 }), D('X', '2026-10', { monthlyPayment: 1, balance: 9 }), D('Y', '2026-10', { monthlyPayment: 1, balance: 9 })] });
  assert.deepEqual(only.messages.map(function(x){ return x.kind + ':' + x.text; }), ['noday:2 ОЧ без дня платежу']);
  const all3 = model({ installments: [I('Old', 4), I('X', null), I('A', 17)], cards: [{ name: 'K' }], debtsByMonth: [D('Old', '2026-10', { monthlyPayment: 1, balance: 9 }), D('X', '2026-10', { monthlyPayment: 1, balance: 9 }), D('A', '2026-10', { monthlyPayment: 5, balance: 9 }), { kind: 'card', name: 'K', month: '2026-10', minPayment: 50 }] });
  assert.deepEqual(all3.messages.map(function(x){ return x.kind; }), ['unconfirmed', 'cards']); // третє (noday) не поміщається
});
test('Е: порожній тиждень — без суми в заголовку, «Тиждень без платежів», рядок «Наступний · дата · назва» із сумою', function(){
  const m = model({ today: '2026-10-05', installments: [I('ПУМБ iPhone', 17)], debtsByMonth: [D('ПУМБ iPhone', '2026-10', { monthlyPayment: 5000, balance: 9 })] });
  assert.equal(m.state, 'empty'); assert.equal(m.total, null); assert.equal(m.calm, 'Тиждень без платежів'); assert.equal(m.showStrip, true);
  assert.equal(m.next.label, 'Наступний · Сб 17 жов · ПУМБ iPhone'); assert.match(m.next.amount, /^5\s000\s₴$/);
});
test('Ж: усе сплачено — без смуги й суми; «Усе сплачено.» + «Наступний · 4 лис · назва»', function(){
  const m = model({ today: '2026-10-25', installments: [I('ПУМБ Dyson', 4)], debtsByMonth: [D('ПУМБ Dyson', '2026-09', { monthlyPayment: 2000, balance: 9 }), D('ПУМБ Dyson', '2026-10', { monthlyPayment: 2000, balance: 9 })], expenses: [{ date: '2026-10-04', linkedInstallment: 'ПУМБ Dyson', amount: 2000 }] });
  assert.equal(m.state, 'allpaid'); assert.equal(m.showStrip, false); assert.equal(m.total, null); assert.deepEqual(m.done, { title: 'Усе сплачено.', next: 'Наступний · 4 лис · ПУМБ Dyson' });
});
test('невідома сума: «Сума невідома» в заголовку', function(){
  const m = model({ installments: [I('A', 17)], debtsByMonth: [D('A', '2026-10', { balance: 9 })] });
  assert.equal(m.total, 'Сума невідома'); assert.equal(m.next.amount, 'сума невідома');
});
test('перехід місяця: смуга 29 жовтня → 4 листопада', function(){
  const m = model({ today: '2026-10-29', installments: [I('N', 2)], debtsByMonth: [D('N', '2026-11', { monthlyPayment: 10, balance: 9 })] });
  assert.equal(m.days[0].date, '2026-10-29'); assert.equal(m.days[6].date, '2026-11-04'); assert.equal(m.next.label, 'Наступний · Пн 2 · N');
});
test('охоронні: немає підзаголовка й рядка «Усі платежі»; уся картка — одна кнопка з підписом для VoiceOver; без емодзі; textContent; шрифти ≥ 11 пт', function(){
  const fn = SRC.slice(SRC.indexOf('function renderPaymentsCard'), SRC.indexOf('/* ============ Екран «Платежі» і дії'));
  assert.ok(!/Усі платежі|pay-all|pay-sub/.test(fn));
  assert.match(fn, /hit\.setAttribute\('aria-label', 'Найближчі платежі, відкрити'\)/); assert.match(fn, /payEl\('button', 'pay-card-hit'\)/);
  assert.ok(!/innerHTML\s*=/.test(fn.replace(/chev\.innerHTML = PAY_CHEV_SVG/, '').replace(/ico\.innerHTML = PAY_CHECK_SVG/, '')), 'дані не йдуть через innerHTML');
  const region = SRC.slice(SRC.indexOf('/* ============ Картка «Найближчі платежі»'), SRC.indexOf('/* ============ Екран «Платежі» і дії'));
  assert.ok(!/\p{Extended_Pictographic}/u.test(region), 'без емодзі');
  const cssStart = SRC.indexOf('.pay-card{ position:relative');
  const css = SRC.slice(cssStart, SRC.indexOf('.pay-done span.m{', cssStart));
  (css.match(/font-size:(\d+(?:\.\d+)?)px/g) || []).forEach(function(x){ assert.ok(parseFloat(x.slice(10)) >= 11, x); });
  assert.match(css, /\.pay-card\{[^}]*border-radius:20px; padding:12px 14px 6px/);
  assert.match(css, /\.pay-day\{[^}]*min-height:52px;[^}]*gap:1px; padding:4px 0;[^}]*border-radius:12px/); assert.match(css, /\.pay-strip\{ display:flex; gap:3px;/);
  assert.match(css, /\.pay-line1\{[^}]*min-height:34px; font-size:14px/); assert.match(css, /\.pay-msg\{[^}]*min-height:34px; font-size:13px/);
});
test('тап по комірці з платежем відкриває «Платежі» на даті; уся картка — без дати; картка в renderAll; прихована без даних', function(){
  assert.match(SRC, /if\(d\.has\) b\.addEventListener\('click', function\(ev\)\{ ev\.stopPropagation\(\); openAll\(d\.date\); \}\);/);
  assert.match(SRC, /hit\.addEventListener\('click', function\(\)\{ openAll\(null\); \}\);/);
  assert.match(SRC, /safeCall\(renderPaymentsCard, 'renderPaymentsCard'\);/); assert.match(SRC, /<section class="pay-card hidden" id="payments-card"/);
});
test('2.32.72: комірка смуги — три окремі елементи в порядку «день тижня, число, сума» (не в одному рядку); висоти рядків 12/17/12; місце під суму зарезервоване; CSS без дублікатів старої картки', function(){
  const fn = SRC.slice(SRC.indexOf('function renderPaymentsCard'), SRC.indexOf('/* ============ Екран «Платежі» і дії'));
  const a = fn.indexOf("b.appendChild(payEl('span', 'pay-dow', d.dow))"), b = fn.indexOf("b.appendChild(payEl('span', 'pay-num', String(d.day)))"), s2 = fn.indexOf("b.appendChild(payEl('span', 'pay-sum',");
  assert.ok(a > 0 && a < b && b < s2, 'порядок: день тижня, число, сума');
  assert.ok(!/pay-dn/.test(SRC), 'обгортки «день тижня + число в одному рядку» немає');
  assert.match(SRC, /\.pay-dow\{ font-size:11px; line-height:12px;/); assert.match(SRC, /\.pay-num\{ font-size:15px; line-height:17px;/); assert.match(SRC, /\.pay-sum\{ font-size:11px; height:12px; line-height:12px;/);
  assert.match(fn, /d\.sum != null \? new Intl\.NumberFormat\('uk-UA', \{ maximumFractionDigits: 0 \}\)\.format\(d\.sum\) : ''/);
  ['.pay-day{', '.pay-dow{', '.pay-num{', '.pay-sum{', '.pay-card{ position:relative', '.pay-line{'].forEach(function(sel){ assert.equal(SRC.split('  ' + sel).length - 1, 1, 'правило ' + sel + ' лише один раз (без дубліката/залишку попередньої картки)'); });
  assert.ok(!/\.pay-row\{|\.pay-all\{|\.pay-note\{/.test(SRC), 'правил старої картки (pay-row/pay-all/pay-note) немає');
});
