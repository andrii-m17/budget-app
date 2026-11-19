// Rev 2.32.418 (DS-PAYLIST Rev 1): модель екрана «Платежі» — плитки (набори не перетинаються, суми сходяться зі списком), групи за днями, «Пізніше», «k з n», межі дат. Лише синтетичні дані.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildSandbox } = require('./extract');
const SRC = require('./extract').readIndexWithCss();
const j = v => JSON.parse(JSON.stringify(v));
const names = ['ppPad', 'ppDaysInMonth', 'ppAddDays', 'ppDayDiff', 'ppNextMonth', 'ppPrevMonth', 'ppClampDate', 'ppModeAmount', 'expectedPaymentForCard', 'installmentExpectedPayment', 'installmentPaidFull', 'installmentDuePassed', 'OCH_OVALS_MAX', 'installmentStandardPayment', 'installmentPaymentsLeft', 'installmentPayAmount', 'installmentTypicalPay', 'ochMonthIndex', 'ochPlannedPaymentsBefore', 'ochOpeningBalance', 'installmentChainCalc', 'installmentStartMonth', 'installmentStartMonthFor', 'cardCreatedMonth', 'upcomingPayments', 'findAccountMonthDebt', 'pluralUa', 'PAY_MONTHS_SHORT', 'PAY_DOW', 'PAY_MONTHS_GEN', 'PAY_MONTHS_NOM', 'payDow', 'payDateShort', 'payFmt', 'payAmountText', 'payPlural', 'payWeekEnd', 'payMonthLast', 'paySum', 'paySumText', 'payRowModel', 'payDayLabel', 'payDayGroups', 'payTilesModel', 'ochOvalsModel', 'paymentsScreenModel'];
const c = buildSandbox({}, names);
const I = (name, dueDay, extra) => Object.assign({ name, dueDay }, extra || {});
const D = (name, month, extra) => Object.assign({ kind: 'installment', name, month, monthlyPayment: 1000, balance: 9 }, extra || {});
function build(today, installments, debts, cards){
  const r = c.upcomingPayments({ today, horizonDays: 14, installments, cards: cards || [], debtsByMonth: debts || [], expenses: [], hidden: {} });
  return { r: j(r), m: j(c.paymentsScreenModel(r, today)) };
}
// ОЧ з платежами в кожен день місяця (1…28) — щільний набір для меж
function dense(months){
  const ins = [], debts = [];
  for(let d = 1; d <= 28; d++){ const n = 'ОЧ' + d; ins.push(I(n, d)); months.forEach(mo => debts.push(D(n, mo, { monthlyPayment: 100 + d }))); }
  return { ins, debts };
}
const total = rows => rows.reduce((a, x) => a + (x.amount || 0), 0);
const allRows = m => [].concat(m.wait, m.window ? m.window.days.reduce((a, d) => a.concat(d.rows), []) : [], m.later.reduce((a, x) => a.concat(x.days.reduce((b, d) => b.concat(d.rows), [])), []));

test('порожньо: порожній екран, три плитки з нулями, без амбера', function(){
  const { m } = build('2026-10-15', [], []);
  assert.equal(m.empty, true); assert.equal(m.window, null); assert.deepEqual(m.later, []);
  assert.deepEqual(m.tiles.map(t => t.sumText), ['0 ₴', '0 ₴', '0 ₴']); assert.deepEqual(m.tiles.map(t => t.count), [0, 0, 0]); assert.ok(m.tiles.every(t => !t.amber));
});
test('один платіж: плитка, група дня «Завтра», сума дня, без «≈» для фіксованої', function(){
  const { m } = build('2026-10-15', [I('А', 16)], [D('А', '2026-10', { monthlyPayment: 2500 })]);
  assert.equal(m.window.days.length, 1); assert.equal(m.window.days[0].title, 'Завтра'); assert.equal(m.window.days[0].sub, 'Пт, 16 жов');
  assert.match(m.window.days[0].sumText, /^2\s500\s₴$/); assert.equal(m.tiles[1].count, 1); assert.equal(m.tiles[0].count, 0); assert.equal(m.tiles[0].amber, false);
});
test('заголовки днів: Сьогодні, Завтра, Вчора (пільговий день), «<день>, <дата>»', function(){
  const l = (d, t) => j(c.payDayLabel(d, t));
  assert.equal(l('2026-10-15', '2026-10-15').title, 'Сьогодні'); assert.equal(l('2026-10-16', '2026-10-15').title, 'Завтра'); assert.equal(l('2026-10-14', '2026-10-15').title, 'Вчора');
  assert.deepEqual(l('2026-10-20', '2026-10-15'), { title: 'Вт, 20 жов', sub: '' });
});
test('межі тижня: неділя/понеділок (payWeekEnd), 1, 15, 31 число, грудень → січень', function(){
  assert.equal(c.payWeekEnd('2026-10-12'), '2026-10-18'); // пн → неділя того ж тижня
  assert.equal(c.payWeekEnd('2026-10-18'), '2026-10-18'); // неділя: тиждень закінчується сьогодні
  assert.equal(c.payWeekEnd('2026-10-17'), '2026-10-18'); // субота
  assert.equal(c.payWeekEnd('2026-12-31'), '2027-01-03'); // тиждень через межу року: четвер → неділя
  assert.equal(c.payMonthLast('2026-02-10'), '2026-02-28'); assert.equal(c.payMonthLast('2026-10-31'), '2026-10-31'); assert.equal(c.payMonthLast('2028-02-01'), '2028-02-29');
});
test('плитки не перетинаються, а їхні суми сходяться зі списком — на кожному дні місяця й на межах', function(){
  ['2026-10-01', '2026-10-04', '2026-10-05', '2026-10-15', '2026-10-18', '2026-10-31', '2026-11-30', '2026-12-31', '2027-01-01', '2026-02-28'].forEach(function(today){
    const mo = [today.slice(0, 7), c.ppNextMonth(today.slice(0, 7))];
    const { ins, debts } = dense(mo);
    const { r, m } = build(today, ins, debts);
    const key = x => x.name + '|' + x.date;
    const waitK = r.unconfirmed.map(key), weekK = [], restK = [];
    const sun = c.payWeekEnd(today), eom = c.payMonthLast(today);
    r.items.concat(r.later).forEach(x => { if(x.date <= sun) weekK.push(key(x)); else if(x.date <= eom) restK.push(key(x)); });
    const sets = [waitK, weekK, restK];
    for(let a = 0; a < 3; a++) for(let b = a + 1; b < 3; b++) assert.equal(sets[a].filter(k => sets[b].indexOf(k) >= 0).length, 0, 'набори ' + a + '/' + b + ' не перетинаються: ' + today);
    assert.deepEqual(m.tiles.map(t => t.count), [waitK.length, weekK.length, restK.length], today);
    // суми: плитки = Σ списків; усі суми цілі
    const sumOf = ks => r.unconfirmed.concat(r.items, r.later).filter(x => ks.indexOf(key(x)) >= 0).reduce((a, x) => a + Math.round(x.amount || 0), 0);
    [waitK, weekK, restK].forEach((ks, i) => { const t = m.tiles[i]; assert.equal(t.sum.num == null ? 0 : t.sum.num, sumOf(ks), 'сума плитки ' + i + ': ' + today); });
    // сума всіх платежів вікна = сума днів у групах
    if(m.window) assert.equal(m.window.days.reduce((a, d) => a + (d.sum.num || 0), 0), total(r.items.map(x => ({ amount: Math.round(x.amount || 0) }))), 'сума груп вікна: ' + today);
    assert.ok(allRows(m).every(x => x.amount == null || Number.isInteger(x.amount)), 'лише цілі гривні');
  });
});
test('багато платежів (≥ 30 на 3 місяці): групи за днями впорядковані, «Пізніше» — окремий рядок на місяць, лише з дат за межами 14 днів', function(){
  const today = '2026-10-15', mo = ['2026-10', '2026-11', '2026-12'];
  const { ins, debts } = dense(mo); const { r, m } = build(today, ins, debts);
  assert.ok(r.items.length + r.later.length >= 30);
  assert.deepEqual(m.window.days.map(d => d.date), m.window.days.map(d => d.date).slice().sort());
  assert.ok(m.window.days.every(d => d.date <= '2026-10-28'));
  assert.deepEqual(m.later.map(x => x.key), ['2026-11']); // upcomingPayments бере поточний і наступний місяць; жовтневі платежі 1–28 уже в «Чекає»/вікні
  assert.equal(m.later.reduce((a, x) => a + x.count, 0), r.later.length);
  assert.equal(m.later[0].title, 'Листопад');
});
test('межа місяця і року у вікні 14 днів: грудень → січень', function(){
  const today = '2026-12-25', { ins, debts } = dense(['2026-12', '2027-01']); const { m } = build(today, ins, debts);
  const dates = m.window.days.map(d => d.date);
  assert.ok(dates.indexOf('2026-12-28') >= 0 && dates.indexOf('2027-01-01') >= 0 && dates.indexOf('2027-01-07') >= 0 && dates.indexOf('2027-01-08') < 0, 'вікно 25 гру … 7 січ: ' + dates.join(','));
  assert.equal(m.later[0].title, 'Січень');
});
test('«Чекає внесення»: lишається installmentDuePassed (пільговий день не рахується); кілька — окремі картки, сума плитки', function(){
  const { m, r } = build('2026-10-20', [I('А', 10), I('Б', 18), I('В', 19)], [D('А', '2026-10', { monthlyPayment: 100 }), D('Б', '2026-10', { monthlyPayment: 200 }), D('В', '2026-10', { monthlyPayment: 300 })]);
  assert.deepEqual(m.wait.map(x => x.name), ['А', 'Б']); // В (19-те): вчора — пільговий день
  assert.equal(m.tiles[0].count, 2); assert.equal(m.tiles[0].sum.num, 300); assert.equal(m.tiles[0].amber, true);
  assert.equal(m.window.days[0].title, 'Вчора'); assert.equal(m.window.days[0].rows[0].name, 'В');
  assert.equal(m.tiles[1].count, 1, 'вчорашній — у плитці «Цей тиждень»'); assert.equal(r.unconfirmed.length, 2);
});
test('«k з n»: з термін/залишок/платіж — «ОЧ · k з n»; без terмінy або без залишку — лише «ОЧ»; останній платіж: k = n', function(){
  const mk = (extra, dbts) => build('2026-10-15', [I('А', 20, extra)], dbts || [D('А', '2026-09', { balance: 5000 })]).m.window.days[0].rows[0];
  const a = mk({ termMonths: 10, payment: 1000, initialAmount: 10000 }); assert.equal(a.n, 10); assert.equal(a.k, 6); assert.equal(a.sub, 'ОЧ · 6 з 10');
  const noTerm = mk({ payment: 1000 }); assert.equal(noTerm.sub, 'ОЧ'); assert.equal(noTerm.k, null);
  const last = mk({ termMonths: 10, payment: 1000, initialAmount: 10000 }, [D('А', '2026-10', { balance: 1000, monthlyPayment: 1000 })]); assert.equal(last.k, last.n); assert.equal(last.sub, 'ОЧ · 10 з 10');
});
test('ОЧ без суми або графіка: «сума невідома», без «≈» у сірому і без NaN', function(){
  const { m } = build('2026-10-15', [I('А', 17)], [D('А', '2026-09', { monthlyPayment: null, balance: 9 })]);
  const row = m.window.days[0].rows[0];
  assert.equal(row.amountPlain, 'сума невідома'); assert.equal(row.approx, false); assert.equal(m.window.days[0].sumText, 'сума невідома');
  assert.ok(!/NaN|undefined/.test(JSON.stringify(m)));
});
test('сума групи: «≈», якщо хоч одна очікувана або без суми', function(){
  const g = items => j(c.paySum(items));
  assert.deepEqual(g([{ amount: 100 }, { amount: 50 }]), { num: 150, approx: false, count: 2 });
  assert.equal(g([{ amount: 100, estimated: true }, { amount: 50 }]).approx, true);
  assert.deepEqual(g([{ amount: 100 }, { amount: null }]), { num: 100, approx: true, count: 2 });
  assert.equal(c.paySumText(c.paySum([{ amount: null }])), 'сума невідома'); assert.equal(c.paySumText(c.paySum([])), '0 ₴');
});
test('«Прострочено» прибрано скрізь, де це бачить користувач (payments.js, картка «Найближчі платежі»)', function(){
  const fs = require('fs'), path = require('path');
  const js = fs.readFileSync(path.join(__dirname, '..', 'js', 'payments.js'), 'utf8').replace(/\/\/[^\n]*/g, '');
  assert.ok(!/'Прострочено|Прострочено'|Прострочено ·/.test(js), 'у рядках для користувача слова немає');
  const { r } = build('2026-10-16', [I('X', 15)], [D('X', '2026-10', { monthlyPayment: 5000 })]);
  const card = j(c.paymentsCardModel ? c.paymentsCardModel(r, '2026-10-16', true) : {});
  assert.ok(!/Прострочено/.test(JSON.stringify(card)));
});
