// Rev 2.32.151 (OCH-STATE): стан платежу ОЧ у місяці — ✓, ½, «скоро», «!» (installmentPaymentState / installmentExpectedPayment / installmentPaidFull).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildSandbox } = require('./extract');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const NAMES = ['ppPad', 'ppDaysInMonth', 'ppAddDays', 'ppDayDiff', 'ppNextMonth', 'ppClampDate', 'ppPrevMonth', 'installmentExpectedPayment', 'installmentPaidFull', 'installmentDuePassed', 'installmentPaymentState',
  'installmentStateView', 'installmentProgressFraction', 'installmentProgressRingHtml', 'installmentRemindDays', 'PAY_MONTHS_SHORT', 'payDateShort', 'payFmt', 'OCH_OVALS_MAX', 'installmentStandardPayment', 'installmentPaymentsLeft', 'installmentPayAmount', 'installmentTypicalPay', 'ppPad', 'ppNextMonth', 'ochMonthIndex', 'ochPlannedPaymentsBefore', 'ochOpeningBalance', 'installmentChainCalc', 'upcomingPayments', 'expectedPaymentForCard', 'INSTALLMENT_BANG_SVG'];
const c = buildSandbox({ escapeAttr: function(v){ return String(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'); } }, NAMES);
const j = v => JSON.parse(JSON.stringify(v));
// сьогодні 2026-10-10, дата платежу 15 жов (диф 5); expected 5000
const base = { linked: 0, expected: 5000, dueDay: 15, month: '2026-10', today: '2026-10-10', days: 2 };
const K = (o) => c.installmentPaymentState(Object.assign({}, base, o)).kind;

test('✓: сума ≥ очікуваного (допуск max(2 ₴, 1%)); «внесено більше» лише коли більше за допуск', function(){
  assert.equal(K({ linked: 5000 }), 'paid'); assert.equal(K({ linked: 4950 }), 'paid'); // 1% = 50
  assert.equal(K({ linked: 4949 }), 'partial');
  assert.equal(c.installmentStateView(c.installmentPaymentState(Object.assign({}, base, { linked: 5000 }))).text, null);
  assert.equal(c.installmentStateView(c.installmentPaymentState(Object.assign({}, base, { linked: 5050 }))).text, null); // у межах допуску
  const more = c.installmentPaymentState(Object.assign({}, base, { linked: 6000 }));
  assert.equal(more.kind, 'paid'); assert.equal(c.installmentStateView(more).text, 'внесено більше');
  assert.equal(K({ linked: 98, expected: 100 }), 'paid'); // мінімальний допуск 2 ₴
  assert.equal(K({ linked: 97, expected: 100 }), 'partial');
});
test('½ далеко від дати: «Частково: X з Y ₴», спокійний значок; нічого не внесено — без значка', function(){
  const st = c.installmentPaymentState(Object.assign({}, base, { linked: 2000 }));
  assert.equal(st.kind, 'partial');
  const v = c.installmentStateView(st);
  assert.equal(v.badge, 'half'); assert.equal(v.accent, false); assert.match(v.text, /^Частково: 2\D*000 ₴ з 5\D*000 ₴$/);
  assert.equal(K({ linked: 0 }), 'none'); assert.equal(c.installmentStateView(c.installmentPaymentState(Object.assign({}, base))).badge, null);
});
test('«скоро»: межа N (диф = N) і N−1; на N+1 ще ні', function(){
  // N=2: платіж 15-го → сьогодні 13 (диф 2) і 14 (диф 1) — «скоро»; 12 (диф 3) — ні
  assert.equal(K({ today: '2026-10-13' }), 'soon'); assert.equal(K({ today: '2026-10-14' }), 'soon'); assert.equal(K({ today: '2026-10-12' }), 'none');
  assert.equal(K({ today: '2026-10-12', linked: 1000 }), 'partial');
  assert.equal(K({ today: '2026-10-15' }), 'soon'); // у день платежу
  assert.equal(K({ today: '2026-10-16' }), 'soon'); // дата+1 ще не «!»
  const v0 = c.installmentStateView(c.installmentPaymentState(Object.assign({}, base, { today: '2026-10-13' })));
  assert.equal(v0.text, 'Платіж до 15 жов'); assert.equal(v0.accent, true); assert.equal(v0.badge, null);
  const v1 = c.installmentStateView(c.installmentPaymentState(Object.assign({}, base, { today: '2026-10-13', linked: 1000 })));
  assert.match(v1.text, /^Частково: 1\D*000 ₴ з 5\D*000 ₴ · до 15 жов$/);
});
test('«!»: дата+1 — ще «скоро», дата+2 — «!» (прострочено); не повністю включно з нулем; повний не «!»', function(){
  assert.equal(K({ today: '2026-10-16' }), 'soon'); assert.equal(K({ today: '2026-10-17' }), 'overdue');
  assert.equal(K({ today: '2026-10-17', linked: 2000 }), 'overdue');
  assert.equal(K({ today: '2026-10-17', linked: 5000 }), 'paid');
  const v = c.installmentStateView(c.installmentPaymentState(Object.assign({}, base, { today: '2026-10-20' })));
  assert.equal(v.badge, 'bang'); assert.equal(v.text, 'Платіж до 15 жов');
});
test('попередній місяць: завжди «!» якщо не повністю; старіший — лише ✓/½; майбутній — без значків', function(){
  assert.equal(K({ month: '2026-09', today: '2026-10-01' }), 'overdue'); assert.equal(K({ month: '2026-09', linked: 5000 }), 'paid');
  assert.equal(K({ month: '2026-08' }), 'none'); assert.equal(K({ month: '2026-08', linked: 5000 }), 'paid'); // Rev 2.32.154: ✓ і ½ для старих місяців
  assert.equal(K({ month: '2026-11' }), 'none'); assert.equal(K({ month: '2026-11', linked: 5000 }), 'none');
  assert.equal(K({ month: '2025-12', today: '2026-01-05' }), 'overdue'); // січень↔грудень
});
test('без dueDay: ні «скоро», ні «!» (лише ½ при частковому); невідомий очікуваний: будь-яка сума = ✓', function(){
  assert.equal(K({ dueDay: null, today: '2026-10-30' }), 'none'); assert.equal(K({ dueDay: null, linked: 100 }), 'partial');
  assert.equal(K({ dueDay: null, month: '2026-09' }), 'none');
  assert.equal(K({ expected: null, linked: 10 }), 'paid'); assert.equal(K({ expected: null, linked: 0, today: '2026-10-14' }), 'soon');
  assert.equal(K({ expected: null, linked: 0, today: '2026-10-20' }), 'overdue');
});
test('N=0 і N=7 із налаштування сповіщень', function(){
  assert.equal(K({ days: 0, today: '2026-10-14' }), 'none'); assert.equal(K({ days: 0, today: '2026-10-15' }), 'soon');
  assert.equal(K({ days: 7, today: '2026-10-08' }), 'soon'); assert.equal(K({ days: 7, today: '2026-10-07' }), 'none');
  const g = buildSandbox({ notificationSettings: { installment_days: 7 } }, ['installmentRemindDays']);
  assert.equal(g.installmentRemindDays(), 7);
  assert.equal(buildSandbox({ notificationSettings: null }, ['installmentRemindDays']).installmentRemindDays(), 2);
  assert.equal(buildSandbox({ notificationSettings: { installment_days: 0 } }, ['installmentRemindDays']).installmentRemindDays(), 0);
  assert.equal(buildSandbox({ notificationSettings: { installment_days: 'x' } }, ['installmentRemindDays']).installmentRemindDays(), 2);
});
test('очікуваний платіж: «Платіж на місяць» → останній відомий; останній платіж = залишок, якщо менший; не typicalMonthlyPayment', function(){
  assert.equal(c.installmentExpectedPayment({ monthPay: 3000, lastPay: 2500, prevBalance: 10000 }), 3000);
  assert.equal(c.installmentExpectedPayment({ monthPay: null, lastPay: 2500, prevBalance: 10000 }), 2500);
  assert.equal(c.installmentExpectedPayment({ monthPay: 0, lastPay: 2500, prevBalance: null }), 2500);
  assert.equal(c.installmentExpectedPayment({ monthPay: 3000, lastPay: null, prevBalance: 1200 }), 1200); // останній платіж
  assert.equal(c.installmentExpectedPayment({ monthPay: 3000, lastPay: null, prevBalance: 0 }), 3000);
  assert.equal(c.installmentExpectedPayment({ monthPay: null, lastPay: null, prevBalance: 500 }), null);
  assert.equal(K({ expected: c.installmentExpectedPayment({ monthPay: 3000, prevBalance: 1200 }), linked: 1200 }), 'paid');
});
test('кілька внесків: сума прив\'язаних витрат (у рядку це linkedExpensesSum); «Найближчі платежі» зараховує повні й лишає часткові', function(){
  assert.equal(K({ linked: 2000 + 3000 }), 'paid');
  const mk = (amounts) => c.upcomingPayments({ today: '2026-10-10', horizonDays: 7, installments: [{ name: 'X', dueDay: 12 }],
    debtsByMonth: [{ kind: 'installment', name: 'X', month: '2026-10', monthlyPayment: 5000, balance: 20000 }],
    expenses: amounts.map(a => ({ linkedInstallment: 'X', date: '2026-10-05', amount: a })) });
  assert.equal(mk([2000, 3000]).items.length, 0);   // повністю
  assert.equal(mk([5000]).items.length, 0);
  assert.equal(mk([2000]).items.length, 1);         // частково — лишається
  assert.equal(mk([]).items.length, 1);
  assert.equal(mk([4960]).items.length, 0);         // у межах допуску
});
test('приховані ОЧ не потрапляють у «Найближчі платежі» навіть при частковому платежі', function(){
  const r = c.upcomingPayments({ today: '2026-10-10', horizonDays: 7, installments: [{ name: 'X', dueDay: 12 }], hidden: { 'installment:X': '2026-10' },
    debtsByMonth: [{ kind: 'installment', name: 'X', month: '2026-10', monthlyPayment: 5000 }], expenses: [{ linkedInstallment: 'X', date: '2026-10-05', amount: 100 }] });
  assert.equal(r.items.length + r.later.length + r.unconfirmed.length, 0);
});
test('розмітка рядка ОЧ: значки ✓/½/«!» за станом, «!» лише для overdue, typicalMonthlyPayment у рядку не використовується для статусу; формули оцінки не змінені', function(){
  const row = SRC.slice(SRC.indexOf('const pst = installmentPaymentState('), SRC.indexOf('const paidOff = installmentPaidOffOffer(name)'));
  assert.match(row, /days: installmentRemindDays\(\)/); assert.ok(!/typicalMonthlyPayment/.test(row));
  assert.match(row, /pview\.badge === 'bang'/); assert.match(row, /pview\.badge === 'half'/);
  assert.match(SRC, /const pay = linkedSum > 0 \? linkedSum : typicalPay;/);
  assert.ok(!/cdr-paid-badge\.partial|cdr-minpay\.partial/.test(SRC));
});

// ---- Rev 2.32.152 (OCH-DUE): єдине визначення «дата минула» для «!» у рядку й «N без позначки» ----
test('installmentDuePassed: дата, дата+1 — ні; дата+2 — так; попередній місяць завжди; майбутній ніколи; кінець місяця й року', function(){
  const P = (month, due, today) => c.installmentDuePassed(month, due, today);
  assert.equal(P('2026-10', '2026-10-15', '2026-10-15'), false);
  assert.equal(P('2026-10', '2026-10-15', '2026-10-16'), false);
  assert.equal(P('2026-10', '2026-10-15', '2026-10-17'), true);
  assert.equal(P('2026-09', '2026-09-30', '2026-10-01'), true);
  assert.equal(P('2026-11', '2026-11-05', '2026-10-31'), false);
  assert.equal(P('2026-11', '2026-11-30', '2026-12-01'), true);  // дата+1 через кордон місяця: сьогодні вже грудень → листопад «попередній», завжди минулий
  assert.equal(P('2026-12', '2026-12-31', '2027-01-01'), true);   // інший місяць (попередній) — завжди
  assert.equal(P('2026-10', null, '2026-10-17'), false);
});
test('«!» у рядку і «без позначки» в «Найближчих» збігаються в КОЖЕН день місяця (дата 15-го, не сплачено, N=2)', function(){
  for(let d = 1; d <= 31; d++){
    const today = '2026-10-' + String(d).padStart(2, '0');
    const row = c.installmentPaymentState({ linked: 0, expected: 5000, dueDay: 15, month: '2026-10', today: today, days: 2 }).kind === 'overdue';
    const r = c.upcomingPayments({ today: today, horizonDays: 7, installments: [{ name: 'X', dueDay: 15 }],
      debtsByMonth: [{ kind: 'installment', name: 'X', month: '2026-10', monthlyPayment: 5000, balance: 20000 }], expenses: [] });
    const unconf = r.unconfirmed.some(function(x){ return x.name === 'X' && x.month === '2026-10'; });
    assert.equal(unconf, row, today);
  }
});
test('межі в «Найближчих»: дата — у списку, дата+1 (пільга) — ще не «без позначки» і лишається в списку, дата+2 — «без позначки»', function(){
  const at = (today) => c.upcomingPayments({ today: today, horizonDays: 7, installments: [{ name: 'X', dueDay: 15 }],
    debtsByMonth: [{ kind: 'installment', name: 'X', month: '2026-10', monthlyPayment: 5000 }], expenses: [] });
  ['2026-10-15', '2026-10-16'].forEach(function(t){ const r = at(t); assert.equal(r.unconfirmed.length, 0, t); assert.equal(r.items.length, 1, t); });
  const r = at('2026-10-17'); assert.equal(r.unconfirmed.length, 1); assert.equal(r.items.length, 0);
});
test('часткова сума: те саме правило (дата+1 — не «без позначки», дата+2 — так); повна сума — ніде; картки без змін (дата < сьогодні)', function(){
  const at = (today, amt) => c.upcomingPayments({ today: today, horizonDays: 7, installments: [{ name: 'X', dueDay: 15 }],
    cards: [{ name: 'C', paymentDay: 15 }],
    debtsByMonth: [{ kind: 'installment', name: 'X', month: '2026-10', monthlyPayment: 5000 }, { kind: 'card', name: 'C', month: '2026-10', minPayment: 300 }],
    expenses: amt ? [{ linkedInstallment: 'X', date: '2026-10-05', amount: amt }] : [] });
  assert.equal(at('2026-10-16', 1000).unconfirmed.filter(x => x.kind === 'installment').length, 0);
  assert.equal(at('2026-10-17', 1000).unconfirmed.filter(x => x.kind === 'installment').length, 1);
  assert.equal(at('2026-10-17', 5000).unconfirmed.filter(x => x.kind === 'installment').length, 0);
  assert.equal(at('2026-10-16', 0).unconfirmed.filter(x => x.kind === 'card').length, 1); // картка: дата < сьогодні, як і було
});

// ---- Rev 2.32.154 (OCH-STATE-ALL): ✓ і ½ для будь-якого місяця від firstMonth до поточного; «скоро»/«!» лише поточний і попередній ----
test('старий місяць: ✓ (повний і «внесено більше»), ½ (частково, з «Частково: X з Y ₴» без дати); нічого — без значка', function(){
  const old = { month: '2026-07', today: '2026-10-23' };
  assert.equal(K(Object.assign({ linked: 5000 }, old)), 'paid');
  const more = c.installmentStateView(c.installmentPaymentState(Object.assign({}, base, old, { linked: 7000 })));
  assert.equal(more.badge, 'check'); assert.equal(more.text, 'внесено більше');
  const half = c.installmentStateView(c.installmentPaymentState(Object.assign({}, base, old, { linked: 2000 })));
  assert.equal(half.badge, 'half'); assert.match(half.text, /^Частково: 2\D*000 ₴ з 5\D*000 ₴$/); assert.equal(half.accent, false);
  assert.equal(K(Object.assign({ linked: 0 }, old)), 'none');
});
test('«!» і «скоро» не в старому місяці (навіть якщо дата давно минула чи «скоро»)', function(){
  ['2026-06', '2026-07', '2026-08'].forEach(function(m){
    [0, 2000].forEach(function(l){ const k = K({ month: m, linked: l, today: '2026-10-15' }); assert.ok(k !== 'overdue' && k !== 'soon', m + ' ' + l + ' ' + k); });
  });
  assert.equal(K({ month: '2026-08', linked: 0, dueDay: 31, today: '2026-10-23' }), 'none');
});
test('майбутній місяць і місяць до початку ОЧ (firstMonth): без значків навіть із внесками', function(){
  assert.equal(K({ month: '2026-11', linked: 5000 }), 'none'); assert.equal(K({ month: '2027-01', linked: 100 }), 'none');
  assert.equal(K({ month: '2026-05', firstMonth: '2026-06', linked: 5000 }), 'none');
  assert.equal(K({ month: '2026-06', firstMonth: '2026-06', linked: 5000 }), 'paid'); // перший місяць уже з значком
  assert.equal(K({ month: '2026-06', firstMonth: '2026-06', linked: 100 }), 'partial');
});
test('без очікуваного платежу в старому місяці: будь-яка внесена сума = ✓, нічого — без значка; очікуване береться з того місяця (останній відомий до нього)', function(){
  assert.equal(K({ month: '2026-07', expected: null, linked: 10 }), 'paid'); assert.equal(K({ month: '2026-07', expected: null, linked: 0 }), 'none');
  assert.equal(c.installmentExpectedPayment({ monthPay: 3000, lastPay: 2500, prevBalance: 10000 }), 3000);   // «Платіж на місяць» того місяця
  assert.equal(c.installmentExpectedPayment({ monthPay: null, lastPay: 2500, prevBalance: 10000 }), 2500);   // останній відомий до цього місяця
  const row = SRC.slice(SRC.indexOf('const lastRec = activeDebts().filter(function(d){ return d.kind === \'installment\''), SRC.indexOf('const pview = installmentStateView(pst)'));
  assert.match(row, /monthKey2\(d\.month\) <= selectedMonth/); assert.match(row, /firstMonth: acc\.firstMonth \|\| null/);
});

// ---- Rev 2.32.155 (OCH-RING): кільце прогресу замість «½» ----
test('частка: 0..100%, межі, перевищення обрізається, очікуване невідоме → null', function(){
  const F = c.installmentProgressFraction;
  assert.equal(F(0, 5000), 0); assert.equal(F(1250, 5000), 0.25); assert.equal(F(2500, 5000), 0.5); assert.equal(F(5000, 5000), 1);
  assert.equal(F(9000, 5000), 1); assert.equal(F(null, 5000), 0); assert.equal(F(-5, 5000), 0);
  assert.equal(F(100, null), null); assert.equal(F(100, 0), null); assert.equal(F(100, undefined), null);
});
test('стан partial повертає frac; ✓ і «скоро»/«!» без кільця; підпис «Частково: X з Y ₴» без змін', function(){
  const v = c.installmentStateView(c.installmentPaymentState(Object.assign({}, base, { linked: 2000 })));
  assert.equal(v.badge, 'half'); assert.equal(v.frac, 0.4); assert.match(v.text, /^Частково: 2\D*000 ₴ з 5\D*000 ₴$/);
  assert.equal(c.installmentStateView(c.installmentPaymentState(Object.assign({}, base, { linked: 5000 }))).badge, 'check');
  assert.equal(c.installmentStateView(c.installmentPaymentState(Object.assign({}, base, { linked: 2000, today: '2026-10-14' }))).badge, null);
  assert.equal(c.installmentStateView(c.installmentPaymentState(Object.assign({}, base, { linked: 2000, today: '2026-10-20' }))).badge, 'bang');
});
test('кільце: 18 px, доріжка нейтральна, заповнення warning, довжина дуги за часткою, aria-label екранується', function(){
  const circ = 2 * Math.PI * 7;
  const h = c.installmentProgressRingHtml(0.25, 'Частково: 1 ₴ з 4 ₴');
  assert.match(h, /width="18" height="18"/); assert.match(h, /class="ring-track"/); assert.match(h, /stroke="var\(--color-warning\)"/);
  assert.match(h, /role="img" aria-label="Частково: 1 ₴ з 4 ₴"/);
  const m = h.match(/stroke-dasharray="([\d.]+) ([\d.]+)"/);
  assert.ok(Math.abs(+m[1] - circ * 0.25) < 0.02 && Math.abs(+m[2] - circ) < 0.02);
  assert.match(c.installmentProgressRingHtml(0, 'x'), /stroke-dasharray="0 /);
  assert.match(c.installmentProgressRingHtml(1.7, 'x'), new RegExp('stroke-dasharray="' + (Math.round(circ * 100) / 100)));
  assert.match(c.installmentProgressRingHtml(null, 'x'), /stroke-dasharray="0 /); // очікуване невідоме: лише доріжка
  assert.ok(!/<script|"onerror/.test(c.installmentProgressRingHtml(0.5, '"><script>')), 'підпис екранується');
});
test('рядок ОЧ: для «½» використовується кільце (aria-label із підписом стану), «½» як текст прибрано', function(){
  const row = SRC.slice(SRC.indexOf('const paidBadge = pview.badge === \'check\''), SRC.indexOf('const dueSub'));
  assert.match(row, /installmentProgressRingHtml\(pview\.frac, pview\.text/); assert.ok(!/>½</.test(row));
  assert.ok(!/cdr-paid-badge\.half/.test(SRC));
});

test('контраст доріжки (Rev 2.32.156): світла тема — вторинний текст з низькою непрозорістю, темна тема — як було (--color-border-strong)', function(){
  assert.match(SRC, /\.ring-track\{ stroke:rgba\(100,116,139,\.4\); \}/);
  assert.match(SRC, /:root\[data-theme="dark"\] \.ring-track\{ stroke:var\(--color-border-strong\); \}/);
  assert.ok(!/class="ring-track"[^>]*stroke="/.test(c.installmentProgressRingHtml(0.5, 'x')), 'колір доріжки лише з CSS (інакше атрибут конфліктував би з темою)');
});
