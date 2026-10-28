// Rev 2.32.199 (PAY-CLOSED, клас C): закрита й прихована ОЧ не показується у «Платежах» (upcomingPayments); приховування — спільним читачем (id, назва, accountName); завершеність — з ланцюжка.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildSandbox } = require('./extract');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const j = v => JSON.parse(JSON.stringify(v));
const BASE_NAMES = ['upcomingPayments', 'ppPad', 'ppDaysInMonth', 'ppAddDays', 'ppDayDiff', 'ppNextMonth', 'ppClampDate', 'expectedPaymentForCard', 'installmentChainCalc', 'installmentDuePassed', 'installmentStartMonth',
  'installmentPayAmount', 'installmentExpectedPayment', 'installmentPaidFull', 'isHiddenForMonth', 'hiddenEntryFor', 'hiddenEntryKey', 'hideKey', 'hideKeyLegacy', 'hideKeyForAccount'];
function sandbox(globals){
  let miss = [];
  for(let i = 0; i < 60; i++){
    try{ return buildSandbox(globals, BASE_NAMES.concat(miss)); }
    catch(e){ const m = /(\w+) is not defined/.exec(e.message); if(!m) throw e; miss.push(m[1]); }
  }
  throw new Error('не вдалось зібрати sandbox');
}
const inst = (over) => Object.assign({ name: 'Тест-ОЧ', cloudId: 'cid1', initialAmount: 1000, termMonths: 10, startDate: '2025-11-08', firstMonth: '2025-11', dueDay: 8, payment: 100 }, over || {});
const mkDebt = (m, bal, pay) => ({ kind: 'installment', name: 'Тест-ОЧ', month: m, balance: bal, monthlyPayment: pay });
const linked = (months, name) => months.map((m, i) => ({ id: 'e' + i + m, linkedInstallment: name || 'Тест-ОЧ', date: m + '-08', amount: 100 }));
// ОЧ закрита: платежі травень–серпень прив'язаними витратами, залишок на початок серпня = платіж → після нього 0
const closedDebts = [['2026-05', 400], ['2026-06', 300], ['2026-07', 200], ['2026-08', 100]].map(([m, b]) => mkDebt(m, b, 100));
const closedExp = linked(['2026-05', '2026-06', '2026-07', '2026-08']);
function run(opts, globals){
  const hidden = (opts && opts.hidden) || {};
  const c = sandbox(Object.assign({ installmentStandardPayment: a => a.payment, ochOpeningBalance: () => ({ balance: 1000, scheduled: true }), installmentTypicalPay: () => 100, linkedOwnerAccount: () => null, hiddenFrom: hidden, installmentAccounts: (opts && opts.accounts) || [inst()] }, globals || {}));
  const r = j(c.upcomingPayments(Object.assign({ today: '2026-10-28', horizonDays: 14, installments: [inst()], cards: [], debtsByMonth: closedDebts, expenses: closedExp, isHidden: c.isHiddenForMonth }, opts || {})));
  return { r, c };
}
const counts = r => [r.unconfirmed.length, r.items.length, r.later.length];

test('закрита ОЧ (залишок на початок місяця 0, останній запис має balance = платіж): ні в «Потребує уваги», ні в «Найближчі», ні в «Пізніше»', () => {
  const { r, c } = run();
  assert.deepEqual(counts(r), [0, 0, 0]);
  const spec = { initial: 1000, firstMonth: '2026-05', std: 100, termMonths: 10, startDate: '2025-11-08', recs: closedDebts, linked: { '2026-05': 100, '2026-06': 100, '2026-07': 100, '2026-08': 100 } };
  assert.deepEqual(['2026-08', '2026-09', '2026-10'].map(m => { const x = j(c.installmentChainCalc(spec, m)); return [x.before, x.balance]; }), [[100, 0], [0, 0], [0, 0]], 'ланцюжок без змін');
});
test('прихована ОЧ не показується: ключ за #id, за назвою (старий) і за #id зі старим id (accountName)', () => {
  const open = { expenses: [], debtsByMonth: [] }; // без завершення: показалась би, якби не приховування
  assert.deepEqual(counts(run(Object.assign({ hidden: {} }, open)).r).slice(0, 2).join(), '1,1', 'контроль: без приховування показується');
  [{ 'installment:#cid1': { month: '2026-09', accountName: 'Тест-ОЧ' } }, { 'installment:Тест-ОЧ': { month: '2026-09' } }, { 'installment:#old-id': { month: '2026-09', accountName: 'Тест-ОЧ' } }].forEach((h, i) => {
    assert.deepEqual(counts(run(Object.assign({ hidden: h }, open)).r), [0, 0, 0], 'варіант ' + i);
  });
  assert.equal(counts(run({ hidden: { 'installment:#cid1': { month: '2026-09', accountName: 'Тест-ОЧ', deletedAt: '2026-10-01T00:00:00Z' } }, expenses: [], debtsByMonth: [] }).r)[1], 1, 'повернута (deletedAt) показується');
  assert.deepEqual(counts(run({ hidden: { 'installment:#cid1': { month: '2026-11', accountName: 'Тест-ОЧ' } }, expenses: [], debtsByMonth: [] }).r), [1, 0, 0], 'прихована з наступного місяця: жовтень у «Потребує уваги», листопад прихований');
});
test('ОЧ з триваючим графіком показується як зараз: останній платіж у наступному місяці; частково погашена; без боргів і витрат', () => {
  // платежі до вересня включно: залишок на початок жовтня 100 (600 мінус п'ять платежів по 100) → у жовтні ще платіж; після нього листопад закритий
  const debts = [['2026-05', 600], ['2026-06', 500], ['2026-07', 400], ['2026-08', 300], ['2026-09', 200]].map(([m, b]) => mkDebt(m, b, 100));
  const exp = linked(['2026-05', '2026-06', '2026-07', '2026-08', '2026-09']);
  const a = run({ debtsByMonth: debts, expenses: exp, installments: [inst({ firstMonth: '2026-05', initialAmount: 600 })] }, { ochOpeningBalance: () => ({ balance: 600, scheduled: true }) });
  assert.deepEqual(counts(a.r), [1, 1, 0], 'жовтневий платіж ще не внесений (увага), листопадовий у «Найближчих»: графік триває');
  const paid = run({ debtsByMonth: debts, expenses: exp.concat([{ id: 'q', linkedInstallment: 'Тест-ОЧ', date: '2026-10-05', amount: 100 }]), installments: [inst({ firstMonth: '2026-05', initialAmount: 600 })] }, { ochOpeningBalance: () => ({ balance: 600, scheduled: true }) });
  assert.deepEqual(counts(paid.r), [0, 0, 0], 'жовтневий (останній) внесено: залишок 0, листопад закритий');
  // частково погашена в поточному місяці (витрата менша за очікуваний платіж): лишається в списку
  const part = run({ debtsByMonth: debts, expenses: exp.concat([{ id: 'p', linkedInstallment: 'Тест-ОЧ', date: '2026-10-05', amount: 30 }]), installments: [inst({ firstMonth: '2026-05', initialAmount: 600 })] }, { ochOpeningBalance: () => ({ balance: 600, scheduled: true }) });
  assert.deepEqual(counts(part.r), [1, 1, 0], 'частково погашена: жовтень лишається в «Потребує уваги», листопад у «Найближчих»');
  // без боргів і витрат: ланцюжок від початкової суми, нуль не вигадується
  const empty = run({ debtsByMonth: [], expenses: [] });
  assert.deepEqual(counts(empty.r), [1, 1, 0], 'без записів ОЧ показується як зараз');
});
test('джерело: upcomingPayments не читає hiddenFrom напряму; computeUpcomingNow передає спільний читач; завершеність із ланцюжка, не з balance останнього запису', () => {
  const up = SRC.slice(SRC.indexOf('function upcomingPayments('), SRC.indexOf('function kyivTodayISO'));
  assert.ok(!/withBal/.test(up) && !/lastRec\.balance/.test(up.replace(/lastRec\.monthlyPayment/g, '')));
  assert.match(up, /if\(chainBefore === 0\) return;/);
  assert.match(SRC, /hidden: hiddenFrom, isHidden: isHiddenForMonth \}\);/);
  assert.match(up, /const hiddenReader = typeof o\.isHidden === 'function'/);
});
