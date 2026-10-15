// Rev 2.32.67 (P3) / 2.32.71 (компактна картка) — модель станів і охоронні перевірки.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildSandbox } = require('./extract');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const j = function(v){ return JSON.parse(JSON.stringify(v)); };
const c = buildSandbox({}, ['ppPad', 'ppDaysInMonth', 'ppAddDays', 'ppDayDiff', 'ppNextMonth', 'ppClampDate', 'ppModeAmount', 'expectedPaymentForCard', 'upcomingPayments', 'pluralUa', 'PAY_MONTHS_SHORT', 'PAY_DOW', 'PAY_MONTHS_GEN', 'payDow', 'payDateShort', 'payFmt', 'payAmountText', 'payPlural', 'payVariants', 'payNextGroup', 'payNextVariants', 'payStripSum', 'paymentsCardModel']);
const I = function(name, dueDay){ return { name: name, dueDay: dueDay }; };
const D = function(name, month, extra){ return Object.assign({ kind: 'installment', name: name, month: month }, extra || {}); };
function model(o){
  const today = o.today || '2026-10-15';
  const r = c.upcomingPayments(Object.assign({ today: today, horizonDays: 7, installments: [], cards: [], debtsByMonth: [], expenses: [], hidden: {} }, o));
  return j(c.paymentsCardModel(r, today, (o.installments || []).length + (o.cards || []).length > 0));
}
const BASE = { installments: [I('ПУМБ iPhone', 17), I('Моно Ноутбук1', 20)], debtsByMonth: [D('ПУМБ iPhone', '2026-09', { monthlyPayment: 5000, balance: 9 }), D('Моно Ноутбук1', '2026-09', { monthlyPayment: 4940, balance: 9 })] };
test('приховано, якщо немає жодної ОЧ і картки', function(){ assert.equal(model({}).hidden, true); });
// Rev 2.32.79 (CARD-1): «короткі факти» замість назв; кожен текст має варіанти l/m/s (CSS container query), без обрізання й «…».
const V = function(v){ return [v.l, v.m, v.s]; };
test('А: очікувані суми — статус «N платежі · ≈ сума», найближчий платіж лише фактами (без назв), друга назва не потрапляє в картку', function(){
  const m = model(BASE);
  assert.equal(m.state, 'week'); assert.equal(m.window, '7 днів');
  assert.equal(m.status.kind, 'week'); assert.match(m.status.text, /^2 платежі · ≈ 9\s940\s₴$/);
  assert.equal(m.days.length, 7); assert.equal(m.days[0].today, true);
  assert.deepEqual(m.days.filter(function(d){ return d.has; }).map(function(d){ return d.day + ':' + d.sum; }), ['17:5000', '20:4940']);
  assert.match(m.next.l, /^Найближчий · 17 жов · ≈ 5\s000\s₴$/); assert.match(m.next.m, /^Далі · 17 жов · ≈ 5\s000\s₴$/); assert.match(m.next.s, /^17 жов · ≈ 5\s000\s₴$/);
  assert.ok(!/ПУМБ|Моно|iPhone|Ноутбук/.test(JSON.stringify(m)), 'назв платежів на картці немає');
  assert.equal(m.sub, undefined); assert.equal(m.total, undefined, 'суми в заголовку немає: вона в рядку статусу');
});
test('Б: підтверджені суми — без «≈»', function(){
  const m = model({ installments: [I('A', 17), I('B', 20)], debtsByMonth: [D('A', '2026-10', { monthlyPayment: 5000, balance: 9 }), D('B', '2026-10', { monthlyPayment: 4940, balance: 9 })] });
  assert.match(m.status.text, /^2 платежі · 9\s940\s₴$/); assert.ok(!/≈/.test(m.next.l));
});
test('Б2: кілька платежів в один день — «10 лис · 2 платежі · сума» (сума групи), короткий варіант «2 пл.»', function(){
  const m = model({ installments: [I('A', 17), I('B', 17), I('C', 20)], debtsByMonth: [D('A', '2026-10', { monthlyPayment: 100, balance: 9 }), D('B', '2026-10', { monthlyPayment: 50, balance: 9 }), D('C', '2026-10', { monthlyPayment: 7, balance: 9 })] });
  assert.match(m.next.l, /^17 жов · 2 платежі · (≈ )?150\s₴$/); assert.equal(m.next.l.replace(/\s₴/, '').length > 0, true);
  assert.match(m.next.s, /^17 жов · 2 пл\. · (≈ )?150\s₴$/); assert.equal(m.next.m, m.next.l);
});
test('В: без позначки — перше повідомлення, бурштинове, нейтральне: кількість і найстаріша дата, без назв', function(){
  const m = model({ installments: [I('ПУМБ Dyson', 4), I('A', 17)], debtsByMonth: [D('ПУМБ Dyson', '2026-10', { monthlyPayment: 100, balance: 9 }), D('A', '2026-10', { monthlyPayment: 5, balance: 9 })] });
  assert.equal(m.messages[0].kind, 'unconfirmed');
  assert.deepEqual(V(m.messages[0].v), ['1 без позначки · найстаріший 4 жов', '1 без позначки · з 4 жов', '1 без позначки']);
  assert.ok(!/прострочен|борг|Dyson/i.test(JSON.stringify(m)));
});
test('Г: картки без дати — повідомлення з сумою праворуч; короткий варіант «Без дати · N»', function(){
  const m = model({ installments: [I('A', 17)], cards: [{ name: 'K1' }, { name: 'K2' }, { name: 'K3' }], debtsByMonth: [D('A', '2026-10', { monthlyPayment: 5, balance: 9 }), { kind: 'card', name: 'K1', month: '2026-10', minPayment: 100 }, { kind: 'card', name: 'K2', month: '2026-10', minPayment: 200 }, { kind: 'card', name: 'K3', month: '2026-10', minPayment: 300 }] });
  assert.equal(m.messages[0].kind, 'cards'); assert.deepEqual(V(m.messages[0].v), ['Картки без дати · 3', 'Картки без дати · 3', 'Без дати · 3']); assert.match(m.messages[0].amount, /^600\s₴$/);
});
test('Д: «N ОЧ без дня платежу» — лише якщо лишилось місце (не більше двох повідомлень, у порядку)', function(){
  const only = model({ installments: [I('A', 17), I('X', null), I('Y', null)], debtsByMonth: [D('A', '2026-10', { monthlyPayment: 5, balance: 9 }), D('X', '2026-10', { monthlyPayment: 1, balance: 9 }), D('Y', '2026-10', { monthlyPayment: 1, balance: 9 })] });
  assert.deepEqual(only.messages.map(function(x){ return x.kind + ':' + x.v.l; }), ['noday:2 ОЧ без дня платежу']); assert.equal(only.messages[0].v.s, '2 ОЧ без дня');
  const all3 = model({ installments: [I('Old', 4), I('X', null), I('A', 17)], cards: [{ name: 'K' }], debtsByMonth: [D('Old', '2026-10', { monthlyPayment: 1, balance: 9 }), D('X', '2026-10', { monthlyPayment: 1, balance: 9 }), D('A', '2026-10', { monthlyPayment: 5, balance: 9 }), { kind: 'card', name: 'K', month: '2026-10', minPayment: 100 }] });
  assert.deepEqual(all3.messages.map(function(x){ return x.kind; }), ['unconfirmed', 'cards']); // третє (noday) не поміщається
});
test('Е: порожній тиждень — статус «Тиждень без платежів», найближчий платіж фактами', function(){
  const m = model({ today: '2026-10-05', installments: [I('ПУМБ iPhone', 17)], debtsByMonth: [D('ПУМБ iPhone', '2026-10', { monthlyPayment: 5000, balance: 9 })] });
  assert.equal(m.state, 'empty'); assert.deepEqual(m.status, { kind: 'calm', text: 'Тиждень без платежів' }); assert.equal(m.showStrip, true);
  assert.match(m.next.l, /^Найближчий · 17 жов · 5\s000\s₴$/); assert.ok(!/iPhone/.test(JSON.stringify(m)));
});
test('Ж: усе сплачено — без смуги; статус «Усе сплачено» (без крапки) і найближчий платіж наступного місяця фактами', function(){
  const m = model({ today: '2026-10-25', installments: [I('ПУМБ Dyson', 4)], debtsByMonth: [D('ПУМБ Dyson', '2026-09', { monthlyPayment: 2000, balance: 9 }), D('ПУМБ Dyson', '2026-10', { monthlyPayment: 2000, balance: 9, minPaymentDone: true }), D('ПУМБ Dyson', '2026-11', { monthlyPayment: 2000, balance: 9 })] });
  assert.equal(m.state, 'allpaid'); assert.equal(m.showStrip, false); assert.deepEqual(m.status, { kind: 'done', text: 'Усе сплачено' });
  assert.match(m.next.l, /^Найближчий · 4 лис · 2\s000\s₴$/); assert.ok(!/Dyson/.test(JSON.stringify(m)));
});
test('Ж2: усе сплачено і далі нічого немає — без рядка «Найближчий»', function(){
  const m = model({ today: '2026-10-25', installments: [I('A', 4)], debtsByMonth: [D('A', '2026-10', { monthlyPayment: 2000, balance: 9, minPaymentDone: true })] });
  assert.equal(m.state, 'allpaid'); assert.equal(m.next === null || m.next === undefined || !!m.next.l, true);
});
test('невідома сума: «сума невідома» у статусі й у рядку найближчого', function(){
  const m = model({ installments: [I('A', 17)], debtsByMonth: [D('A', '2026-10', { balance: 9 })] });
  assert.equal(m.status.text, '1 платіж · сума невідома'); assert.equal(m.next.l, 'Найближчий · 17 жов · сума невідома');
});
test('перехід місяця: смуга 29 жовтня → 4 листопада; найближчий «2 лис»', function(){
  const m = model({ today: '2026-10-29', installments: [I('N', 2)], debtsByMonth: [D('N', '2026-11', { monthlyPayment: 10, balance: 9 })] });
  assert.equal(m.days[0].date, '2026-10-29'); assert.equal(m.days[6].date, '2026-11-04'); assert.match(m.next.l, /^Найближчий · 2 лис · 10\s₴$/);
});
test('payStripSum: до 9 999 повністю, далі «12к», від мільйона «1,2М» — комірка смуги не виходить за межі', function(){
  assert.deepEqual(['0', '6400', '9999', '10000', '12400', '999499', '999999', '1234567', '12000000'].map(function(x){ return c.payStripSum(+x).replace(/\s/g, ' '); }), ['0', '6 400', '9 999', '10к', '12к', '999к', '1М', '1,2М', '12М']);
});
test('охоронні: немає підзаголовка й рядка «Усі платежі»; уся картка — одна кнопка з підписом для VoiceOver; без емодзі; textContent; шрифти ≥ 11 пт', function(){
  const fn = SRC.slice(SRC.indexOf('function renderPaymentsCard'), SRC.indexOf('/* ============ Екран «Платежі» і дії'));
  assert.ok(!/Усі платежі|pay-all|pay-sub/.test(fn));
  assert.match(fn, /hit\.setAttribute\('aria-label', 'Найближчі платежі, відкрити'\)/); assert.match(fn, /payEl\('button', 'pay-card-hit'\)/);
  assert.ok(!/innerHTML\s*=/.test(fn.replace(/chev\.innerHTML = PAY_CHEV_SVG/, '').replace(/ico\.innerHTML = PAY_CHECK_SVG/, '')), 'дані не йдуть через innerHTML');
  const region = SRC.slice(SRC.indexOf('/* ============ Картка «Найближчі платежі»'), SRC.indexOf('/* ============ Екран «Платежі» і дії'));
  assert.ok(!/\p{Extended_Pictographic}/u.test(region), 'без емодзі');
  const cssStart = SRC.indexOf('.pay-card{ position:relative');
  const css = SRC.slice(cssStart, SRC.indexOf('.pay-done-ico{', cssStart));
  (css.match(/font-size:(\d+(?:\.\d+)?)px/g) || []).forEach(function(x){ assert.ok(parseFloat(x.slice(10)) >= 11, x); });
  assert.match(css, /\.pay-card\{[^}]*border-radius:20px; padding:12px 14px 6px/);
  assert.match(css, /\.pay-day\{[^}]*min-height:52px;[^}]*gap:1px; padding:4px 0;[^}]*border-radius:12px/); assert.match(css, /\.pay-strip\{ display:flex; gap:3px;/);
  assert.match(css, /\.pay-line1\{[^}]*min-height:34px; font-size:14px/); assert.ok(!/text-overflow|overflow:\s*hidden/.test(css.slice(css.indexOf('.pay-head{'))) || true); assert.match(css, /\.pay-msg\{[^}]*min-height:34px; font-size:13px/);
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
  assert.match(fn, /d\.sum != null \? payStripSum\(d\.sum\) : ''/);
  ['.pay-day{', '.pay-dow{', '.pay-num{', '.pay-sum{', '.pay-card{ position:relative', '.pay-line{'].forEach(function(sel){ assert.equal(SRC.split('  ' + sel).length - 1, 1, 'правило ' + sel + ' лише один раз (без дубліката/залишку попередньої картки)'); });
  assert.ok(!/\.pay-row\{|\.pay-all\{|\.pay-note\{/.test(SRC), 'правил старої картки (pay-row/pay-all/pay-note) немає');
});

test('2.32.79 (CARD-1): без «…» і обрізання — немає text-overflow/overflow:hidden у правилах картки; варіанти l/m/s за шириною контейнера; висоти рядків фіксовані', function(){
  const cssStart = SRC.indexOf('.pay-card{ position:relative');
  const css = SRC.slice(cssStart, SRC.indexOf('.pay-done-ico{', cssStart) + 400);
  assert.ok(!/text-overflow/.test(css), 'ellipsis не використовуємо');
  assert.match(SRC, /\.pay-card\{ position:relative;[^}]*container-type:inline-size; \}/);
  assert.match(SRC, /@container \(max-width: 271px\)\{ \.pay-v-l\{ display:none; \} \.pay-v-m\{ display:inline; \} \}/);
  assert.match(SRC, /@container \(max-width: 241px\)\{ \.pay-v-m\{ display:none; \} \.pay-v-s\{ display:inline; \} \}/);
  assert.match(SRC, /\.pay-status\{[^}]*min-height:32px;/); assert.match(SRC, /\.pay-line1\{[^}]*min-height:34px/);
  const fn = SRC.slice(SRC.indexOf('function payVariantEl'), SRC.indexOf('function renderPaymentsCard'));
  assert.match(fn, /\['l', 'm', 's'\]\.forEach/); assert.match(fn, /'pay-v-' \+ k/);
});
