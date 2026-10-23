// Rev 2.32.64 (P2) — чиста логіка «Найближчі платежі».
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildSandbox } = require('./extract');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const j = function(v){ return JSON.parse(JSON.stringify(v)); };
const c = buildSandbox({}, ['ppPad', 'ppDaysInMonth', 'ppAddDays', 'ppDayDiff', 'ppNextMonth', 'ppClampDate', 'ppModeAmount', 'expectedPaymentForCard', 'installmentExpectedPayment', 'installmentPaidFull', 'installmentDuePassed', 'upcomingPayments', 'kyivTodayISO']);
const U = function(o){ return j(c.upcomingPayments(Object.assign({ today: '2026-10-15', horizonDays: 7, installments: [], cards: [], debtsByMonth: [], expenses: [], hidden: {} }, o))); };
const I = function(name, dueDay, extra){ return Object.assign({ name: name, dueDay: dueDay }, extra || {}); };
const D = function(kind, name, month, extra){ return Object.assign({ kind: kind, name: name, month: month }, extra || {}); };

test('дати: кінець місяця, лютий (звичайний і високосний), перехід року', function(){
  assert.equal(c.ppClampDate('2026-02', 30), '2026-02-28'); assert.equal(c.ppClampDate('2028-02', 30), '2028-02-29'); assert.equal(c.ppClampDate('2026-04', 31), '2026-04-30'); assert.equal(c.ppClampDate('2026-10', 5), '2026-10-05');
  assert.equal(c.ppAddDays('2026-10-30', 3), '2026-11-02'); assert.equal(c.ppAddDays('2026-12-30', 3), '2027-01-02'); assert.equal(c.ppNextMonth('2026-12'), '2027-01'); assert.equal(c.ppDayDiff('2026-10-15', '2026-10-21'), 6);
});
test('ppModeAmount: мода останніх 6, тай-брейк — новіша; порожньо → null', function(){
  assert.equal(c.ppModeAmount([]), null); assert.equal(c.ppModeAmount([100, 200, 100]), 100); assert.equal(c.ppModeAmount([100, 200]), 200);
  assert.equal(c.ppModeAmount([9, 9, 9, 1, 2, 3, 3, 3, 3, 3, 3]), 3); // враховуються лише останні 6
});
test('ОЧ: платіж у вікні 7 днів із точною сумою з запису місяця (без «≈»)', function(){
  const r = U({ installments: [I('Телефон', 18)], debtsByMonth: [D('installment', 'Телефон', '2026-10', { monthlyPayment: 1200, balance: 5000 })] });
  assert.deepEqual(r.items.map(function(x){ return [x.name, x.date, x.amount, x.estimated]; }), [['Телефон', '2026-10-18', 1200, false]]);
  assert.deepEqual(r.load, { total: 1200, count: 1, estimated: false, unknown: 0 });
});
test('ОЧ: без запису місяця — мода історії з «≈»; без історії — сума невідома', function(){
  const hist = [D('installment', 'Х', '2026-07', { monthlyPayment: 500, balance: 9 }), D('installment', 'Х', '2026-08', { monthlyPayment: 500, balance: 8 }), D('installment', 'Х', '2026-09', { monthlyPayment: 700, balance: 7 })];
  const r = U({ installments: [I('Х', 17)], debtsByMonth: hist });
  assert.equal(r.items[0].amount, 500); assert.equal(r.items[0].estimated, true); assert.equal(r.load.estimated, true);
  const r2 = U({ installments: [I('Y', 17)], debtsByMonth: [D('installment', 'Y', '2026-10', { balance: 100 })] });
  assert.equal(r2.items[0].amount, null); assert.equal(r2.load.unknown, 1); assert.equal(r2.load.total, 0);
});
test('«≈» лише при оцінці: точна й оцінена суми разом дають estimated=true, лише точні — false', function(){
  const r = U({ installments: [I('A', 16), I('B', 17)], debtsByMonth: [D('installment', 'A', '2026-10', { monthlyPayment: 100, balance: 9 }), D('installment', 'B', '2026-09', { monthlyPayment: 200, balance: 9 })] });
  assert.equal(r.load.total, 300); assert.equal(r.load.estimated, true);
  const r2 = U({ installments: [I('A', 16)], debtsByMonth: [D('installment', 'A', '2026-10', { monthlyPayment: 100, balance: 9 })] });
  assert.equal(r2.load.estimated, false);
});
test('короткі місяці: due_day 31 у листопаді → 30; 30 у лютому → 28; перехід місяця 1 листопада', function(){
  const r = U({ today: '2026-11-24', horizonDays: 7, installments: [I('Z', 31, { })], debtsByMonth: [D('installment', 'Z', '2026-11', { monthlyPayment: 10, balance: 5 })] });
  assert.equal(r.items[0].date, '2026-11-30');
  const r2 = U({ today: '2027-02-20', horizonDays: 14, installments: [I('F', 30)], debtsByMonth: [D('installment', 'F', '2027-02', { monthlyPayment: 10, balance: 5 })] });
  assert.equal(r2.items[0].date, '2027-02-28');
  const r3 = U({ today: '2026-10-29', horizonDays: 7, installments: [I('N', 2)], debtsByMonth: [D('installment', 'N', '2026-11', { monthlyPayment: 10, balance: 5 })] });
  assert.equal(r3.items[0].date, '2026-11-02'); // вікно перетинає межу місяців
  const r4 = U({ today: '2026-11-01', horizonDays: 7, installments: [I('N', 1)], debtsByMonth: [D('installment', 'N', '2026-11', { monthlyPayment: 10, balance: 5 })] });
  assert.equal(r4.items[0].date, '2026-11-01'); // сьогодні входить у вікно
});
test('приховані (hiddenFrom ≤ місяць) і видалені ОЧ пропускаються; розкрита (deletedAt) — ні', function(){
  const base = { installments: [I('H', 17)], debtsByMonth: [D('installment', 'H', '2026-10', { monthlyPayment: 5, balance: 9 })] };
  assert.equal(U(Object.assign({ hidden: { 'installment:H': { month: '2026-10' } } }, base)).items.length, 0);
  assert.equal(U(Object.assign({ hidden: { 'installment:H': { month: '2026-11' } } }, base)).items.length, 1); // приховано лише з листопада
  assert.equal(U(Object.assign({ hidden: { 'installment:H': { month: '2026-10', deletedAt: 'x' } } }, base)).items.length, 1);
  assert.equal(U({ installments: [I('H', 17, { deletedAt: 'x' })], debtsByMonth: base.debtsByMonth }).items.length, 0);
});
test('завершені ОЧ (останній відомий залишок ≤ 0) пропускаються', function(){
  const r = U({ installments: [I('E', 17)], debtsByMonth: [D('installment', 'E', '2026-09', { monthlyPayment: 5, balance: 0 })] });
  assert.equal(r.items.length, 0); assert.equal(r.noDay.length, 0);
});
test('ОЧ без дня платежу — у noDay (не в items)', function(){
  const r = U({ installments: [I('NoDay', null)], debtsByMonth: [D('installment', 'NoDay', '2026-10', { monthlyPayment: 5, balance: 9 })] });
  assert.deepEqual(r.noDay, ['NoDay']); assert.equal(r.items.length, 0);
});
test('сплачено прив\'язаною витратою цього місяця — платіж не показується; витрата іншого місяця чи видалена не рахується', function(){
  const base = { installments: [I('P', 17)], debtsByMonth: [D('installment', 'P', '2026-10', { monthlyPayment: 5, balance: 9 })] };
  assert.equal(U(Object.assign({ expenses: [{ date: '2026-10-03', linkedInstallment: 'P', amount: 5 }] }, base)).items.length, 0);
  assert.equal(U(Object.assign({ expenses: [{ date: '2026-09-28', linkedInstallment: 'P', amount: 5 }] }, base)).items.length, 1);
  assert.equal(U(Object.assign({ expenses: [{ date: '2026-10-03', linkedInstallment: 'P', amount: 5, deletedAt: 'x' }] }, base)).items.length, 1);
  assert.equal(U(Object.assign({ expenses: [{ date: '2026-10-03', linkedInstallment: 'Інша', amount: 5 }] }, base)).items.length, 1);
});
test('картки: мінімальний платіж із днем — датований, без «≈»', function(){
  const r = U({ cards: [{ name: 'Приват', paymentDay: 20 }], debtsByMonth: [D('card', 'Приват', '2026-10', { minPayment: 800, balance: 9000 })] });
  assert.deepEqual(r.items.map(function(x){ return [x.kind, x.date, x.amount, x.estimated]; }), [['card', '2026-10-20', 800, false]]);
});
test('картки без дня — у undatedCards (кількість і сума), не в items', function(){
  const r = U({ cards: [{ name: 'A', paymentDay: null }, { name: 'B' }], debtsByMonth: [D('card', 'A', '2026-10', { minPayment: 300 }), D('card', 'B', '2026-10', { minPayment: 200 })] });
  assert.deepEqual(r.undatedCards, { count: 2, total: 500 }); assert.equal(r.items.length, 0);
});
test('картки: мінімальний платіж 0 / відсутній / внесений (min_payment_done) — не показується', function(){
  const cards = [{ name: 'Z', paymentDay: 20 }];
  assert.equal(U({ cards: cards, debtsByMonth: [D('card', 'Z', '2026-10', { minPayment: 0 })] }).items.length, 0);
  assert.equal(U({ cards: cards, debtsByMonth: [D('card', 'Z', '2026-10', {})] }).items.length, 0);
  assert.equal(U({ cards: cards, debtsByMonth: [D('card', 'Z', '2026-10', { minPayment: 500, minPaymentDone: true })] }).items.length, 0);
  const r = U({ cards: [{ name: 'Z' }], debtsByMonth: [D('card', 'Z', '2026-10', { minPayment: 500, minPaymentDone: true })] });
  assert.deepEqual(r.undatedCards, { count: 0, total: 0 });
});
test('картка: день 31 у короткому місяці, прихована й видалена картки', function(){
  const r = U({ today: '2026-11-24', cards: [{ name: 'C', paymentDay: 31 }], debtsByMonth: [D('card', 'C', '2026-11', { minPayment: 100 })] });
  assert.equal(r.items[0].date, '2026-11-30');
  assert.equal(U({ cards: [{ name: 'C', paymentDay: 20 }], debtsByMonth: [D('card', 'C', '2026-10', { minPayment: 100 })], hidden: { 'card:C': { month: '2026-10' } } }).items.length, 0);
  assert.equal(U({ cards: [{ name: 'C', paymentDay: 20, deletedAt: 'x' }], debtsByMonth: [D('card', 'C', '2026-10', { minPayment: 100 })] }).items.length, 0);
});
test('краї вікна: 7 днів — сьогодні+6 входить, +7 — у «пізніше»; 14 днів — +13 входить, +14 — пізніше', function(){
  const mk = function(day){ return { installments: [I('E', day)], debtsByMonth: [D('installment', 'E', '2026-10', { monthlyPayment: 5, balance: 9 })] }; };
  assert.equal(U(Object.assign({ horizonDays: 7 }, mk(21))).items.length, 1);  // 15+6
  const r = U(Object.assign({ horizonDays: 7 }, mk(22))); assert.equal(r.items.length, 0); assert.equal(r.later[0].date, '2026-10-22'); // далі — ще й платіж наступного місяця
  assert.equal(U(Object.assign({ horizonDays: 14 }, mk(28))).items.length, 1); // 15+13
  const r2 = U(Object.assign({ horizonDays: 14 }, mk(29))); assert.equal(r2.items.length, 0); assert.equal(r2.later[0].date, '2026-10-29');
  assert.equal(U(Object.assign({ horizonDays: 7 }, mk(15))).items.length, 1); // сьогодні входить
});
test('без позначки: дата в минулому в поточному місяці й не сплачено → unconfirmed (не в items і не в later)', function(){
  const r = U({ installments: [I('Old', 10)], debtsByMonth: [D('installment', 'Old', '2026-10', { monthlyPayment: 300, balance: 9 })] });
  assert.equal(r.items.length, 0); assert.deepEqual(r.unconfirmed.map(function(x){ return [x.name, x.date, x.amount]; }), [['Old', '2026-10-10', 300]]);
  const r2 = U({ installments: [I('Old', 10)], debtsByMonth: [D('installment', 'Old', '2026-10', { monthlyPayment: 300, balance: 9 })], expenses: [{ date: '2026-10-11', linkedInstallment: 'Old', amount: 300 }] });
  assert.equal(r2.unconfirmed.length, 0);
  const r3 = U({ cards: [{ name: 'K', paymentDay: 5 }], debtsByMonth: [D('card', 'K', '2026-10', { minPayment: 100 })] });
  assert.equal(r3.unconfirmed.length, 1);
});
test('наступний місяць: платіж 5-го наступного місяця — у «пізніше», якщо поза вікном', function(){
  const r = U({ installments: [I('Next', 5)], debtsByMonth: [D('installment', 'Next', '2026-10', { monthlyPayment: 5, balance: 9 }), D('installment', 'Next', '2026-11', { monthlyPayment: 6, balance: 8 })], expenses: [{ date: '2026-10-05', linkedInstallment: 'Next', amount: 5 }] });
  assert.equal(r.later.length, 1); assert.equal(r.later[0].date, '2026-11-05'); assert.equal(r.later[0].amount, 6);
});
test('сортування: за датою, потім за назвою; сума навантаження — лише датовані платежі у вікні', function(){
  const r = U({ installments: [I('Б', 20), I('А', 20), I('В', 17)], cards: [{ name: 'К', paymentDay: 19 }], debtsByMonth: [
    D('installment', 'Б', '2026-10', { monthlyPayment: 10, balance: 9 }), D('installment', 'А', '2026-10', { monthlyPayment: 20, balance: 9 }), D('installment', 'В', '2026-10', { monthlyPayment: 30, balance: 9 }), D('card', 'К', '2026-10', { minPayment: 40 })] });
  assert.deepEqual(r.items.map(function(x){ return x.name; }), ['В', 'К', 'А', 'Б']); assert.equal(r.load.total, 100); assert.equal(r.load.count, 4);
});
test('входи не мутуються; функція детермінована (без Date.now)', function(){
  const inst = [I('Т', 18)], debts = [D('installment', 'Т', '2026-10', { monthlyPayment: 1, balance: 5 })];
  const a = JSON.stringify(inst) + JSON.stringify(debts);
  const r1 = U({ installments: inst, debtsByMonth: debts }), r2 = U({ installments: inst, debtsByMonth: debts });
  assert.equal(a, JSON.stringify(inst) + JSON.stringify(debts)); assert.deepEqual(r1, r2);
  const body = SRC.slice(SRC.indexOf('function upcomingPayments'), SRC.indexOf('function kyivTodayISO'));
  assert.ok(!/Date\.now\(|new Date\(\)/.test(body), 'без Date.now/new Date() усередині');
});
test('kyivTodayISO: київська дата навколо опівночі (UTC 21:30 → вже наступний день у Києві взимку 22:30, влітку 00:30)', function(){
  assert.equal(c.kyivTodayISO(new Date('2026-10-14T21:30:00Z')), '2026-10-15'); // літній час UTC+3
  assert.equal(c.kyivTodayISO(new Date('2026-12-14T21:30:00Z')), '2026-12-14'); // зимовий UTC+2 → 23:30
  assert.equal(c.kyivTodayISO(new Date('2026-12-14T22:30:00Z')), '2026-12-15');
});
test('збіг із серверними нагадуваннями: прив\'язана витрата місяця, hiddenFrom ≤ місяць, останній день коротшого місяця — ті самі правила', function(){
  // сервер: due_day = day(target) або (day(target)=останній день і due_day > останній день); not hidden_from_month <= tmonth; not exists linked expense у tmonth
  assert.equal(c.ppClampDate('2026-02', 31), '2026-02-28');
  const r = U({ today: '2026-02-25', horizonDays: 7, installments: [I('S', 31)], debtsByMonth: [D('installment', 'S', '2026-02', { monthlyPayment: 1, balance: 5 })] });
  assert.equal(r.items[0].date, '2026-02-28');
  assert.equal(U({ today: '2026-02-25', installments: [I('S', 31)], debtsByMonth: [D('installment', 'S', '2026-02', { monthlyPayment: 1, balance: 5 })], hidden: { 'installment:S': { month: '2026-02' } } }).items.length, 0);
});
test('hidden у старому форматі (рядок-місяць) підтримується', function(){
  assert.equal(U({ installments: [I('O', 17)], debtsByMonth: [D('installment', 'O', '2026-10', { monthlyPayment: 1, balance: 5 })], hidden: { 'installment:O': '2026-10' } }).items.length, 0);
});
