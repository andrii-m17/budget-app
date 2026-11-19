// Rev 2.32.419 (DS-PAYLIST Rev 2, клас C): внесення платежу ОЧ через витрату — дата форми, округлення, блок прив'язки, чернетка, схожа витрата, вибраний місяць. Лише синтетичні дані.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildSandbox } = require('./extract');
const SRC = require('./extract').readIndexWithCss();
const j = v => JSON.parse(JSON.stringify(v));
const common = ['ppPad', 'ppDaysInMonth', 'ppAddDays', 'ppDayDiff', 'ppNextMonth', 'ppPrevMonth', 'ppClampDate', 'ppModeAmount', 'expectedPaymentForCard', 'installmentExpectedPayment', 'installmentPaidFull', 'installmentDuePassed', 'OCH_OVALS_MAX', 'installmentStandardPayment', 'installmentPaymentsLeft', 'installmentPayAmount', 'installmentTypicalPay', 'ochMonthIndex', 'ochPlannedPaymentsBefore', 'ochOpeningBalance', 'installmentChainCalc', 'installmentStartMonth', 'installmentStartMonthFor', 'cardCreatedMonth', 'upcomingPayments', 'findAccountMonthDebt', 'pluralUa', 'PAY_MONTHS_SHORT', 'PAY_DOW', 'payDow', 'payDateShort', 'payFmt', 'ochOvalsModel'];
const c = buildSandbox({}, common.concat(['payFormDate', 'payPrefillAmount', 'payFormDirty', 'payFindSimilar', 'payLinkText']));
const I = (name, dueDay, extra) => Object.assign({ name, dueDay }, extra || {});
const D = (name, month, extra) => Object.assign({ kind: 'installment', name, month, monthlyPayment: 1000, balance: 9 }, extra || {});

test('дата форми: поточний місяць — сьогодні; наступний і вибраний минулий — дата платежу', function(){
  assert.equal(c.payFormDate('2026-10', '2026-10-25', '2026-10-15'), '2026-10-15');
  assert.equal(c.payFormDate('2026-10', '2026-10-05', '2026-10-15'), '2026-10-15'); // невнесений платіж поточного місяця — теж сьогодні
  assert.equal(c.payFormDate('2026-11', '2026-11-04', '2026-10-15'), '2026-11-04');
  assert.equal(c.payFormDate('2026-09', '2026-09-20', '2026-10-15'), '2026-09-20');
  assert.equal(c.payFormDate('2027-01', '2027-01-03', '2026-12-31'), '2027-01-03');
});
test('сума: цілі гривні (999,5 → 1000, 1000,4 → 1000); порожня/невідома → null', function(){
  assert.equal(c.payPrefillAmount(999.5), 1000); assert.equal(c.payPrefillAmount(1000.4), 1000); assert.equal(c.payPrefillAmount(1000.5), 1001); assert.equal(c.payPrefillAmount(0), 0);
  assert.equal(c.payPrefillAmount(null), null); assert.equal(c.payPrefillAmount(''), null); assert.equal(c.payPrefillAmount(undefined), null); assert.equal(c.payPrefillAmount('abc'), null);
});
test('блок прив\'язки: «Платіж k з n» (k+1 від сплачених); без терміну рядок «Платіж» не показується; останній платіж k = n', function(){
  assert.equal(c.payLinkText({ name: 'Банк А Телефон', k: 6, n: 10, date: '2026-10-17' }), 'Прив\'язано до ОЧ · Банк А Телефон · Платіж 6 з 10 · за 17 жов');
  assert.equal(c.payLinkText({ name: 'Банк А Телефон', k: null, n: null, date: '2026-10-17' }), 'Прив\'язано до ОЧ · Банк А Телефон · за 17 жов');
  const mk = dbts => j(c.upcomingPayments({ today: '2026-10-15', horizonDays: 14, installments: [I('А', 20, { termMonths: 10, payment: 1000, initialAmount: 10000 })], cards: [], debtsByMonth: dbts, expenses: [], hidden: {} })).items[0];
  const mid = mk([D('А', '2026-09', { balance: 5000 })]); assert.equal(mid.k, 6); assert.equal(mid.n, 10);
  const last = mk([D('А', '2026-10', { balance: 1000, monthlyPayment: 1000 })]); assert.equal(last.k, 10); assert.equal(last.n, 10);
  const noTerm = j(c.upcomingPayments({ today: '2026-10-15', horizonDays: 14, installments: [I('А', 20, { payment: 1000 })], cards: [], debtsByMonth: [D('А', '2026-09', { balance: 5000 })], expenses: [], hidden: {} })).items[0];
  assert.equal(noTerm.k, null); assert.equal(c.payLinkText({ name: 'А', k: noTerm.k, n: noTerm.n, date: noTerm.date }).indexOf('Платіж'), -1);
});
test('схожа витрата: за сумою (±1 ₴), за назвою ОЧ; чужий місяць, прив\'язана й видалена не рахуються; найновіша', function(){
  const ex = [
    { name: 'Щось', amount: 1000.4, date: '2026-10-03' },
    { name: 'Інше', amount: 999, date: '2026-10-09' },
    { name: 'Платіж Банк А Телефон', amount: 5, date: '2026-10-07' },
    { name: 'Щось', amount: 1000, date: '2026-09-28' },
    { name: 'Щось', amount: 1000, date: '2026-10-12', linkedInstallment: 'X' },
    { name: 'Щось', amount: 1000, date: '2026-10-13', deletedAt: 'x' },
  ];
  const f = q => j(c.payFindSimilar(ex, q));
  assert.deepEqual(f({ month: '2026-10', amount: 1000, label: 'Банк А Телефон' }), { date: '2026-10-09', amount: 999 }, 'найновіша зі збігів (сума ±1)');
  assert.deepEqual(f({ month: '2026-10', amount: 5000, label: 'Банк А Телефон' }), { date: '2026-10-07', amount: 5 }, 'за назвою ОЧ');
  assert.equal(f({ month: '2026-10', amount: 5000, label: 'Нічого' }), null);
  assert.deepEqual(f({ month: '2026-09', amount: 1000, label: '' }), { date: '2026-09-28', amount: 1000 }, 'інший місяць — лише свій');
  assert.equal(f({ month: '2026-11', amount: 1000, label: 'Банк А Телефон' }), null, 'витрата з іншого місяця не вважається схожою');
  assert.equal(f({ month: '2026-10', amount: null, label: 'аб' }), null, 'коротка назва (< 3) не збігається');
});
test('чернетка: порожня форма — підстановка одразу; є дані — підтвердження «Замінити чернетку?»; «Так» замінює, «Ні» лишає без змін', function(){
  const mkCtx = (nameVal, amountVal) => {
    const calls = [], modal = {}, els = { expfielda7: { value: nameVal }, 'f-amount': { value: amountVal }, 'app-modal-cancel-btn': { textContent: 'Скасувати' } };
    const ctx = buildSandbox({ installmentAccounts: [{ name: 'Тест ОЧ' }], document: { getElementById: id => els[id] || null }, payApplyPrefill: (item, i) => calls.push(['apply', item.name, i]),
      showConfirmModal: (msg, onConfirm, label, variant) => { modal.msg = msg; modal.onConfirm = onConfirm; modal.label = label; modal.variant = variant; } }, ['payFormDirty', 'payInstallmentPrefill']);
    return { ctx, calls, modal, els };
  };
  let t = mkCtx('', ''); t.ctx.payInstallmentPrefill({ name: 'Тест ОЧ' }); assert.deepEqual(t.calls, [['apply', 'Тест ОЧ', 0]]); assert.equal(t.modal.msg, undefined, 'порожня форма — без запитання');
  t = mkCtx('Кава', ''); t.ctx.payInstallmentPrefill({ name: 'Тест ОЧ' });
  assert.equal(t.modal.msg, 'Замінити чернетку?'); assert.equal(t.modal.label, 'Так'); assert.equal(t.els['app-modal-cancel-btn'].textContent, 'Ні'); assert.deepEqual(t.calls, [], 'до відповіді нічого не змінено («Ні» = закрити без дії)');
  t.modal.onConfirm(); assert.deepEqual(t.calls, [['apply', 'Тест ОЧ', 0]], '«Так» замінює');
  t = mkCtx('', '500'); t.ctx.payInstallmentPrefill({ name: 'Тест ОЧ' }); assert.equal(t.modal.msg, 'Замінити чернетку?', 'лише сума теж чернетка');
  t = mkCtx('', ''); t.ctx.payInstallmentPrefill({ name: 'Немає такої' }); assert.deepEqual(t.calls, [], 'невідома ОЧ — нічого');
  assert.equal(c.payFormDirty(' ', ' '), false); assert.equal(c.payFormDirty('а', ''), true);
});
test('підстановка: дата, ціла сума, прив\'язка, блок; витрата не створюється й не зберігається', function(){
  const mk = (today) => {
    const els = { expfielda7: { value: '' }, 'f-amount': { value: '' }, 'f-date': { value: '' }, 'auto-hint': { classList: { toggle(){} } }, 'auto-hint-text': { textContent: '' } };
    const log = { expenses: 0, links: [] };
    const ctx = buildSandbox({ installmentAccounts: [{ name: 'Банк А Телефон' }], document: { getElementById: id => els[id] || null }, closePaymentsScreen(){}, switchTab(){}, kyivTodayISO: () => today, localDateISO: () => today, rolloverState: { dateManual: false }, updateDateCaption(){},
      CATEGORIES: [{ active: true, name: '🏦 Оплати Частинами' }], setCategorySelect(){}, confirmedInstallmentLinkIdx: -1, pendingInstallmentMatchIndices: [1], renderInstallmentLinkHint(){}, activeExpenses: () => [], formatThousands: n => String(n), stripLeadingEmoji: x => x,
      setTimeout(){}, addExpense(){ log.expenses++; }, saveExpenses(){ log.expenses++; } }, ['payFormDate', 'payPrefillAmount', 'payFindSimilar', 'payLinkText', 'payApplyPrefill', 'payDateShort', 'payFmt', 'PAY_MONTHS_SHORT']);
    return { ctx, els, log };
  };
  let t = mk('2026-10-15'); t.ctx.payApplyPrefill({ name: 'Банк А Телефон', month: '2026-10', date: '2026-10-10', amount: 999.5, k: 6, n: 10 }, 0);
  assert.equal(t.els['f-date'].value, '2026-10-15'); assert.equal(t.els['f-amount'].value, '1000'); assert.equal(t.els.expfielda7.value, 'Банк А Телефон'); assert.equal(t.ctx.confirmedInstallmentLinkIdx, 0); assert.equal(t.log.expenses, 0);
  t = mk('2026-10-15'); t.ctx.payApplyPrefill({ name: 'Банк А Телефон', month: '2026-11', date: '2026-11-04', amount: 1000.4 }, 0);
  assert.equal(t.els['f-date'].value, '2026-11-04'); assert.equal(t.els['f-amount'].value, '1000');
  t = mk('2026-10-15'); t.ctx.payApplyPrefill({ name: 'Банк А Телефон', month: '2026-09', date: '2026-09-20', amount: null }, 0);
  assert.equal(t.els['f-date'].value, '2026-09-20', 'вибраний минулий місяць — дата платежу'); assert.equal(t.els['f-amount'].value, '', 'сума невідома — порожньо, нічого не вигадується');
});
test('upcomingPayments(opts.month): за замовчуванням минулий місяць не показується; після переходу на нього — невнесені платежі того місяця в unconfirmed; поточний і наступний без змін', function(){
  const base = { today: '2026-10-15', horizonDays: 14, installments: [I('А', 10), I('Б', 20)], cards: [], debtsByMonth: [D('А', '2026-09'), D('Б', '2026-09'), D('А', '2026-10', { monthlyPayment: 500 }), D('Б', '2026-10', { monthlyPayment: 700 })], expenses: [], hidden: {} };
  const def = j(c.upcomingPayments(base)), cur = j(c.upcomingPayments(Object.assign({}, base, { month: '2026-10' }))), fut = j(c.upcomingPayments(Object.assign({}, base, { month: '2026-11' })));
  assert.ok(!def.unconfirmed.some(x => x.month === '2026-09'), 'у поточному місяці платіж попереднього не показується');
  assert.deepEqual(cur, def, 'вибраний = поточний: як було'); assert.deepEqual(fut, def, 'вибраний майбутній: як було');
  const past = j(c.upcomingPayments(Object.assign({}, base, { month: '2026-09' })));
  assert.deepEqual(past.unconfirmed.filter(x => x.month === '2026-09').map(x => x.name), ['А', 'Б'], 'після переходу на попередній — його невнесені платежі');
  assert.deepEqual(past.items, def.items); assert.deepEqual(past.later, def.later);
  assert.deepEqual(past.unconfirmed.filter(x => x.month === '2026-10').map(x => x.name), def.unconfirmed.map(x => x.name), 'невнесені поточного місяця лишаються');
  // сплачений у минулому місяці платіж (прив'язана витрата) не показується
  const paid = j(c.upcomingPayments(Object.assign({}, base, { month: '2026-09', expenses: [{ linkedInstallment: 'А', date: '2026-09-10', amount: 1000 }] })));
  assert.deepEqual(paid.unconfirmed.filter(x => x.month === '2026-09').map(x => x.name), ['Б']);
  // noDay не залежить від вибраного місяця
  const nd = Object.assign({}, base, { installments: base.installments.concat([I('В', null)]), debtsByMonth: base.debtsByMonth.concat([D('В', '2026-09'), D('В', '2026-10')]) });
  assert.deepEqual(j(c.upcomingPayments(Object.assign({}, nd, { month: '2026-09' }))).noDay, j(c.upcomingPayments(nd)).noDay);
});
test('охоронні: екран передає вибраний місяць; ОЧ без проміжної шторки; блок і підказка — не поля; перемальовування в renderAll', function(){
  assert.match(SRC, /computeUpcomingNow\(14, typeof selectedMonth === 'string' \? selectedMonth : null\)/);
  assert.match(SRC, /else if\(r\.kind === 'installment'\) payInstallmentPrefill\(r\); else openPayAction\(r\);/);
  assert.match(SRC, /const act = function\(\)\{ if\(r\.kind === 'installment'\) payInstallmentPrefill\(r\); else openPayAction\(r\); \};/); // Rev 2.32.420: рядок і кнопка «Внести» — та сама дія
  assert.match(SRC, /<div class="field installment-link-hint pay-link-block" id="pay-link-block" role="status"><\/div>/);
  assert.ok(!/<input[^>]*pay-(link|similar)/.test(SRC));
  assert.match(SRC, /if\(isPaymentsOpen\) safeCall\(renderPaymentsScreen, 'renderPaymentsScreen'\);/);
  assert.ok(!/confirm\(/.test(SRC.slice(SRC.indexOf('function payInstallmentPrefill'), SRC.indexOf('async function markCardMinPaid'))), 'нативний confirm не використовується');
});
