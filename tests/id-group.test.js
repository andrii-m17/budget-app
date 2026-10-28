// Rev 2.32.184 (ID-BIND-2, Етап 2) — групування боргів ОЧ за id (запасний варіант — назва) і каскад перейменування з pull. Лише синтетичні дані («Предмет А/Б»).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildSandbox, evalInSandbox } = require('./extract');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const j = v => JSON.parse(JSON.stringify(v));
const NAMES = ['debtTotalsForMonth', 'debtAccount', 'debtAccountKey', 'debtDisplayName', 'cascadeInstallmentRename', 'hideKey', 'isHiddenForMonth', 'isAccountHiddenForMonth', 'isCardVisibleForMonth', 'cardCreatedMonth', 'activeDebts', 'resolveInstallmentFact', 'OCH_OVALS_MAX', 'installmentStandardPayment', 'installmentPaymentsLeft', 'installmentPayAmount', 'installmentTypicalPay', 'ppPad', 'ppNextMonth', 'ochMonthIndex', 'ochPlannedPaymentsBefore', 'ochOpeningBalance', 'installmentChainCalc', 'installmentStartMonth', 'installmentStartMonthFor', 'installmentChainSpec', 'installmentBalanceBefore', 'estimateInstallment', 'linkedExpensesSum', 'lastKnownBalance', 'typicalMonthlyPayment', 'activeExpenses', 'monthKey'];
const app = (debts, expenses, accounts, extra) => buildSandbox(Object.assign({ debts, expenses, hiddenFrom: {}, ignoredDivergences: {}, bankAccounts: [], installmentAccounts: accounts }, extra || {}), NAMES);
const A = (name, id, extra) => Object.assign({ name, cloudId: id, initialAmount: 12000 }, extra || {});
const D = (name, month, balance, extra) => Object.assign({ id: 'd-' + name + month, name, kind: 'installment', month, balance, monthlyPayment: 1000 }, extra || {});
const rows = (c, m) => j(evalInSandbox(c, "debtTotalsForMonth('" + m + "')")).list.filter(d => d.kind === 'installment');

test('порожньо: немає ОЧ і боргів → порожній список, без помилок', function(){
  const c = app([], [], []);
  assert.equal(rows(c, '2026-07').length, 0);
});
test('мало: одна ОЧ, один борг (з id) → один рядок', function(){
  const c = app([D('Предмет А', '2026-07', 9000, { accountId: 'id-a' })], [], [A('Предмет А', 'id-a')]);
  const r = rows(c, '2026-07'); assert.equal(r.length, 1); assert.equal(r[0].name, 'Предмет А');
});
test('«застаріла» назва з id: борги зі старою й новою назвою → один рядок, назва з ОЧ, останній місяць виграє', function(){
  const debts = [D('Предмет А старий', '2026-05', 9000, { accountId: 'id-a' }), D('Предмет А старий', '2026-06', 8000, { accountId: 'id-a' }), D('Предмет А', '2026-07', 7000, { accountId: 'id-a' })];
  const c = app(debts, [], [A('Предмет А', 'id-a')]);
  assert.equal(rows(c, '2026-07').length, 1);
  assert.equal(rows(c, '2026-07')[0].name, 'Предмет А');
  const r6 = rows(c, '2026-06'); assert.equal(r6.length, 1); assert.equal(r6[0].name, 'Предмет А', 'стара назва в червні теж зводиться до ОЧ');
});
test('борг без id: шукає ОЧ за назвою; осиротілий (назви нема ні в кого) — окремий рядок без автозлиття', function(){
  const debts = [D('Предмет А', '2026-07', 7000), D('Предмет Б', '2026-07', 5000), D('Предмет А', '2026-06', 8000, { accountId: 'id-a' })];
  const c = app(debts, [], [A('Предмет А', 'id-a')]);
  const r = rows(c, '2026-07');
  assert.equal(r.length, 2);
  assert.deepEqual(r.map(d => d.name).sort(), ['Предмет А', 'Предмет Б']);
});
test('id без знайденої ОЧ: запасний варіант — назва; інакше осиротілий', function(){
  const c = app([D('Предмет А', '2026-07', 7000, { accountId: 'id-нема' })], [], [A('Предмет А', 'id-a')]);
  assert.equal(rows(c, '2026-07').length, 1);
  const c2 = app([D('Предмет В', '2026-07', 7000, { accountId: 'id-нема' })], [], [A('Предмет А', 'id-a')]);
  assert.equal(rows(c2, '2026-07')[0].name, 'Предмет В');
});
test('два записи ОЧ з однаковою назвою (різні id) → два рядки; борг з id потрапляє у свій', function(){
  const accs = [A('Предмет А', 'id-1'), A('Предмет А', 'id-2')];
  const debts = [D('Предмет А', '2026-07', 7000, { accountId: 'id-1', id: 'x1' }), D('Предмет А', '2026-07', 3000, { accountId: 'id-2', id: 'x2' })];
  const r = rows(app(debts, [], accs), '2026-07');
  assert.equal(r.length, 2);
});
test('багато: 12 ОЧ × 26 місяців, у половини старі назви в частині місяців → рівно 12 рядків, назви з ОЧ', function(){
  const accs = [], debts = [];
  for(let i = 0; i < 12; i++){
    accs.push(A('Предмет ' + i, 'id-' + i));
    for(let m = 0; m < 26; m++){
      const ym = (2025 + Math.floor((9 + m) / 12)) + '-' + String(((9 + m) % 12) + 1).padStart(2, '0');
      debts.push(D(i % 2 && m < 13 ? 'Старий ' + i : 'Предмет ' + i, ym, 20000 - m * 100, { accountId: 'id-' + i, id: 'd' + i + '-' + m }));
    }
  }
  const r = rows(app(debts, [], accs), '2027-10');
  assert.equal(r.length, 12);
  assert.ok(r.every(d => /^Предмет \d+$/.test(d.name)));
});
test('ланцюжок: борги зі старою назвою (з id) і прив\'язані витрати за id входять в одну ОЧ', function(){
  const acc = A('Предмет А', 'id-a', { initialAmount: 10000, firstMonth: '2026-05' });
  const debts = [D('Предмет А старий', '2026-05', 10000, { accountId: 'id-a' })];
  const exp = [{ id: 'e1', date: '2026-05-10', amount: 1000, linkedInstallment: 'Предмет А старий', linkedInstallmentId: 'id-a' }, { id: 'e2', date: '2026-06-10', amount: 1000, linkedInstallment: 'Предмет А', linkedInstallmentId: 'id-a' }];
  const c = app(debts, exp, [acc]);
  const spec = j(evalInSandbox(c, "installmentChainSpec('Предмет А')"));
  assert.equal(spec.recs.length, 1, 'борг зі старою назвою потрапив у ланцюжок');
  assert.deepEqual(spec.linked, { '2026-05': 1000, '2026-06': 1000 });
});
test('ланцюжок: витрата іншої ОЧ з тією самою назвою (інший id) не змішується', function(){
  const accs = [A('Предмет А', 'id-1'), A('Предмет А', 'id-2')];
  const exp = [{ id: 'e1', date: '2026-05-10', amount: 500, linkedInstallment: 'Предмет А', linkedInstallmentId: 'id-2' }];
  const c = app([], exp, accs);
  assert.deepEqual(j(evalInSandbox(c, "installmentChainSpec('Предмет А')")).linked, {}, 'знайдена перша за назвою (id-1); id-2 не її');
});

// ---- каскад перейменування (pull з іншого пристрою) ----
function cascadeEnv(){
  const acc = A('Предмет А', 'id-a'); // після pull: назва вже нова
  const c = app([
    D('Предмет А старий', '2026-06', 9000, { accountId: 'id-a', id: 'm6', updatedAt: '2026-06-30T00:00:00Z' }),
    D('Предмет А старий', '2026-07', 8000, { accountId: 'id-a', id: 'm7', updatedAt: '2026-07-01T00:00:00Z' }),
    D('Предмет А старий', '2026-08', 7000, { id: 'm8', updatedAt: '2026-08-01T00:00:00Z' }),   // без id: за старою назвою
    D('Предмет А старий', '2026-09', 6000, { accountId: 'id-інша', id: 'm9' }),               // чужий id
  ], [
    { id: 'e1', date: '2026-07-02', amount: 100, linkedInstallment: 'Предмет А старий', linkedInstallmentId: 'id-a' },
    { id: 'e2', date: '2026-08-02', amount: 100, linkedInstallment: 'Предмет А старий' },
    { id: 'e3', date: '2026-09-02', amount: 100, linkedInstallment: 'Предмет А старий', linkedInstallmentId: 'id-інша' },
  ], [acc, A('Предмет Ґ', 'id-інша')], { hiddenFrom: { 'installment:Предмет А старий': '2026-12', 'card:Предмет А старий': '2026-01' }, ignoredDivergences: { 'Предмет А старий|2026-07': true, 'Інше|2026-07': true } });
  return { c, acc };
}
test('каскад: борги за id та за старою назвою, витрати, hiddenFrom, ignoredDivergences переносяться; чужі id й картки — ні; updatedAt не змінюється', function(){
  const { c, acc } = cascadeEnv();
  const info = j(c.cascadeInstallmentRename(acc, 'Предмет А старий', 'Предмет А'));
  assert.equal(info.debts, 3); assert.equal(info.expenses, 2); assert.equal(info.hidden, true); assert.equal(info.ignored, true);
  const byId = Object.fromEntries(c.debts.map(d => [d.id, d]));
  assert.equal(byId.m6.name, 'Предмет А'); assert.equal(byId.m7.name, 'Предмет А'); assert.equal(byId.m8.name, 'Предмет А');
  assert.equal(byId.m9.name, 'Предмет А старий', 'борг чужої ОЧ не чіпаємо');
  assert.equal(byId.m6.updatedAt, '2026-06-30T00:00:00Z'); assert.equal(byId.m8.updatedAt, '2026-08-01T00:00:00Z');
  assert.deepEqual(c.expenses.map(e => e.linkedInstallment), ['Предмет А', 'Предмет А', 'Предмет А старий']);
  assert.equal(c.hiddenFrom['installment:Предмет А'], '2026-12'); assert.ok(!('installment:Предмет А старий' in c.hiddenFrom)); assert.equal(c.hiddenFrom['card:Предмет А старий'], '2026-01');
  assert.ok('Предмет А|2026-07' in c.ignoredDivergences); assert.ok(!('Предмет А старий|2026-07' in c.ignoredDivergences)); assert.ok('Інше|2026-07' in c.ignoredDivergences);
});
test('перейменування в місяці 1 при боргах у місяцях 2–3 і межа років: усі місяці отримують нову назву', function(){
  const acc = A('Предмет А', 'id-a');
  const c = app(['2026-12', '2027-01', '2027-02'].map((m, i) => D('Старий', m, 9000 - i * 1000, { accountId: 'id-a', id: 'k' + i })), [], [acc]);
  const info = c.cascadeInstallmentRename(acc, 'Старий', 'Предмет А');
  assert.equal(info.debts, 3); assert.ok(c.debts.every(d => d.name === 'Предмет А'));
  assert.equal(rows(c, '2027-02').length, 1);
});
test('два борги однієї ОЧ за місяць після каскаду: обидва лишаються (не зливаються), місяць повертається в collisions', function(){
  const acc = A('Предмет А', 'id-a');
  const c = app([D('Старий', '2026-07', 9000, { accountId: 'id-a', id: 'p1' }), D('Предмет А', '2026-07', 8000, { accountId: 'id-a', id: 'p2' })], [], [acc]);
  const info = j(c.cascadeInstallmentRename(acc, 'Старий', 'Предмет А'));
  assert.deepEqual(info.collisions, ['2026-07']);
  assert.equal(c.debts.length, 2);
  assert.equal(rows(c, '2026-07').length, 1, 'у таблиці одна ОЧ — один рядок (береться перший запис місяця)');
});
test('друга ОЧ зі старою назвою (дубль назви) — борги без id не переносяться (неоднозначно), з id — так', function(){
  const acc = A('Предмет А', 'id-a');
  const other = A('Старий', 'id-b');
  const c = app([D('Старий', '2026-07', 1, { id: 'n1' }), D('Старий', '2026-07', 2, { accountId: 'id-a', id: 'n2' })], [], [acc, other]);
  c.cascadeInstallmentRename(acc, 'Старий', 'Предмет А');
  const byId = Object.fromEntries(c.debts.map(d => [d.id, d]));
  assert.equal(byId.n1.name, 'Старий'); assert.equal(byId.n2.name, 'Предмет А');
});
test('охоронні: pull ОЧ викликає каскад лише локально (без push і без нового updatedAt); формули залишку не змінено', function(){
  const i = SRC.indexOf('async function pullInstallmentAccountsCore'), src = SRC.slice(i, SRC.indexOf('\nasync function pullInstallmentAccountsPilot', i)).replace(/\/\/[^\n]*/g, '');
  assert.match(src, /cascadeInstallmentRename\(byCloudId, oldAccName, row\.name\)/);
  assert.ok(/saveDebts\(\)/.test(src) && !/pushDebt/.test(src.slice(src.indexOf('renameCascade.debts) await'), src.indexOf('renameCascade.debts) await') + 400)));
  const cascade = SRC.slice(SRC.indexOf('function cascadeInstallmentRename'), SRC.indexOf('function isHiddenForMonth')).replace(/\/\/[^\n]*/g, '');
  assert.ok(!/updatedAt/.test(cascade));
  assert.match(SRC, /function installmentChainCalc\(spec, month\)/);
});
