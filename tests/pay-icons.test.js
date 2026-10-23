// Rev 2.32.160 (PAY-ICONS) — картка «Найближчі платежі»: значки рядків, підписи без дати, рядок «ОЧ без дати», підсвічений день, адаптивні рядки.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildSandbox } = require('./extract');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const j = v => JSON.parse(JSON.stringify(v));
const c = buildSandbox({}, ['ppPad', 'ppDaysInMonth', 'ppAddDays', 'ppDayDiff', 'ppNextMonth', 'ppClampDate', 'ppModeAmount', 'expectedPaymentForCard', 'installmentExpectedPayment', 'installmentPaidFull', 'installmentDuePassed', 'upcomingPayments', 'pluralUa', 'PAY_MONTHS_SHORT', 'PAY_DOW', 'PAY_MONTHS_GEN', 'payDow', 'payDateShort', 'payFmt', 'payAmountText', 'pickCardVariant', 'payCompactAmount', 'payAmountShortText', 'payNextLadder', 'payNamesParts', 'payPartsText', 'payUnconfirmedParts', 'payUnconfirmedLadder', 'payNoDayParts', 'payDaySoon', 'paymentsCardModel']);
const I = (name, dueDay) => ({ name, dueDay });
const D = (name, month, extra) => Object.assign({ kind: 'installment', name, month, monthlyPayment: 100, balance: 9 }, extra || {});
function model(o, remind){
  const today = o.today || '2026-10-15';
  const r = c.upcomingPayments(Object.assign({ today, horizonDays: 7, installments: [], cards: [], debtsByMonth: [], expenses: [], hidden: {} }, o));
  return j(c.paymentsCardModel(r, today, (o.installments || []).length + (o.cards || []).length > 0, remind));
}

test('значки: календар (Наступний), жовте «!», нейтральні коло з календарем ₴ і з карткою; вбудовані SVG тих самих форм, що в bankIcon (EMPTY_STATE_ICONS)', function(){
  assert.match(SRC, /function payIconFor\(kind\)\{[\s\S]*?kind === 'unconfirmed' \? 'warn' : kind === 'next' \? 'plain' : 'neutral'/);
  assert.match(SRC, /kind === 'unconfirmed' \? PAY_BANG_SVG : kind === 'next' \? PAY_CAL_SVG : kind === 'cards' \? EMPTY_STATE_ICONS\.card : EMPTY_STATE_ICONS\.calendar/);
  assert.match(SRC, /\.pay-ico\.neutral\{ background:var\(--color-surface-hover\); color:var\(--color-text-secondary\); \}/);
  assert.match(SRC, /\.pay-ico\.warn\{ background:var\(--color-warning\); \}/);
  assert.match(SRC, /\.pay-ico svg\{ width:58%; height:58%/); // як .bank-badge-generic svg
  assert.match(SRC, /EMPTY_STATE_ICONS = \{[\s\S]*?calendar: '[^']*₴/); // календар із гривнею
  assert.ok(!/PAY_CAL_SVG = '[^']*₴/.test(SRC), 'у «Наступний» календар без ₴');
  assert.match(SRC, /row\.appendChild\(payIconFor\(x\.kind\)\)/);
});
test('кольори підписів: «N без позначки» warning, назви у приглушеному токені; токен існує', function(){
  assert.match(SRC, /\.pay-msg\.amber \.l \.head\{ color:var\(--color-warning\); \}/);
  assert.match(SRC, /\.pay-msg \.l \.tail\{ color:var\(--color-text-tertiary\); \}/);
  assert.ok(/--color-text-tertiary:#94A3B8/.test(SRC) && /--color-text-tertiary:#7C8BA3/.test(SRC));
});
test('«без позначки»: без дати, лише назви через кому; заголовок і перелік окремо', function(){
  const m = model({ installments: [I('Стара А', 4), I('Стара Б', 5), I('Ок', 17)], debtsByMonth: [D('Стара А', '2026-10'), D('Стара Б', '2026-10'), D('Ок', '2026-10')] });
  const u = m.messages[0];
  assert.equal(u.kind, 'unconfirmed'); assert.equal(u.text, '2 без позначки · Стара А, Стара Б');
  assert.deepEqual(u.parts[0], { h: '2 без позначки', t: 'Стара А, Стара Б' });
  assert.ok(u.ladder.every(x => !/жов|\d{1,2} (січ|лют|бер|кві|тра|чер|лип|сер|вер|лис|гру)/.test(x)), 'дати немає');
});
test('рядок «ОЧ без дати · N · назви»: є лише для видимих ОЧ без dueDay; закриті й приховані не враховуються; суми немає', function(){
  const base = { installments: [I('Ок', 17), I('Без1', null), I('Без2', null)], debtsByMonth: [D('Ок', '2026-10'), D('Без1', '2026-10'), D('Без2', '2026-10')] };
  const m = model(base); const n = m.messages.find(x => x.kind === 'noday');
  assert.equal(n.text, 'ОЧ без дати · 2 · Без1, Без2'); assert.equal(n.amount, undefined);
  assert.equal(model({ installments: [I('Ок', 17)], debtsByMonth: [D('Ок', '2026-10')] }).messages.find(x => x.kind === 'noday'), undefined, 'немає ОЧ без дня — немає рядка');
  const closed = model({ installments: [I('Ок', 17), I('Без1', null)], debtsByMonth: [D('Ок', '2026-10'), D('Без1', '2026-10', { balance: 0 })] });
  assert.equal(closed.messages.find(x => x.kind === 'noday'), undefined, 'закрита не враховується');
  const hid = model(Object.assign({}, base, { hidden: { 'installment:Без1': '2026-01', 'installment:Без2': '2026-01' } }));
  assert.equal(hid.messages.find(x => x.kind === 'noday'), undefined, 'приховані не враховуються');
});
test('день найближчого платежу: лише один день виділено; звичайний — info, «скоро» (≤ N днів) — warning', function(){
  const o = { today: '2026-10-15', installments: [I('А', 17), I('Б', 20)], debtsByMonth: [D('А', '2026-10'), D('Б', '2026-10')] };
  const m = model(o, 2); const nx = m.days.filter(d => d.next);
  assert.equal(nx.length, 1); assert.equal(nx[0].day, 17); assert.equal(nx[0].soon, true); // 2 дні ≤ 2
  assert.equal(model(o, 1).days.filter(d => d.next)[0].soon, false);
  assert.equal(model(o, 1).days.filter(d => d.next).length, 1);
  assert.equal(c.payDaySoon(0, 2), true); assert.equal(c.payDaySoon(3, 2), false); assert.equal(c.payDaySoon(-1, 2), false);
  assert.equal(model({ today: '2026-10-05', installments: [I('А', 17)], debtsByMonth: [D('А', '2026-10')] }, 2).days.filter(d => d.next).length, 0, 'платежу у смузі немає');
});
test('сплачений повністю платіж не підсвічується; частковий — так', function(){
  const o = { today: '2026-10-15', installments: [I('А', 17), I('Б', 20)], debtsByMonth: [D('А', '2026-10', { monthlyPayment: 1000 }), D('Б', '2026-10', { monthlyPayment: 500 })] };
  const paid = model(Object.assign({ expenses: [{ date: '2026-10-10', amount: 1000, linkedInstallment: 'А' }] }, o), 2);
  assert.equal(paid.days.find(d => d.next).day, 20, 'А сплачено — підсвічується наступний Б');
  const part = model(Object.assign({ expenses: [{ date: '2026-10-10', amount: 300, linkedInstallment: 'А' }] }, o), 2);
  assert.equal(part.days.find(d => d.next).day, 17, 'часткова не сплачена повністю');
});
test('aria-label підсвіченого дня: «Наступний платіж: <дата>, <сума>»; решта днів лишаються aria-hidden', function(){
  const m = model({ today: '2026-10-15', installments: [I('А', 17)], debtsByMonth: [D('А', '2026-10', { monthlyPayment: 5000 })] }, 2);
  assert.match(m.days.find(d => d.next).label, /^Наступний платіж: 17 жовтня, 5\s000\s₴$/);
  assert.match(SRC, /if\(d\.next && d\.label\)\{ b\.setAttribute\('aria-label', d\.label\); \} else b\.setAttribute\('aria-hidden', 'true'\)/);
});
test('CSS пілюлі: backdrop-filter помірний, рамка info, сяйво; «скоро» — warning', function(){
  assert.match(SRC, /\.pay-day\.next\{[^}]*backdrop-filter:blur\(10px\)[^}]*border:1px solid var\(--color-info\)[^}]*box-shadow:0 0 10px color-mix\(in srgb, var\(--color-info\)/);
  assert.match(SRC, /\.pay-day\.next\.soon\{ border-color:var\(--color-warning\); box-shadow:0 0 10px color-mix\(in srgb, var\(--color-warning\)/);
});
test('адаптивні рядки 320/390/440: спершу падає хвіст переліку з «+K», потім перелік, заголовок лишається; без «…»', function(){
  const names = ['Телефон Один', 'Ноутбук Два', 'Пилосос Три', 'Холодильник Чотири'];
  const ladder = c.payUnconfirmedLadder(names);
  assert.deepEqual(j(ladder), ['4 без позначки · Телефон Один, Ноутбук Два, Пилосос Три, Холодильник Чотири', '4 без позначки · Телефон Один, Ноутбук Два, Пилосос Три +1', '4 без позначки · Телефон Один, Ноутбук Два +2', '4 без позначки · Телефон Один +3', '4 без позначки']);
  const chosen = {};
  [320, 390, 440].forEach(function(w){
    const avail = w - 28 - 20 - 8 - 20; // картка: поля 14+14, значок 20 + зазор 8, запас
    const idx = c.pickCardVariant(i => ladder[i].length * 6.4 <= avail, ladder.length);
    chosen[w] = idx; assert.ok(!/…/.test(ladder[idx])); assert.ok(ladder[idx].startsWith('4 без позначки'));
  });
  assert.ok(chosen[320] >= chosen[390] && chosen[390] >= chosen[440], JSON.stringify(chosen));
  assert.ok(chosen[320] > chosen[440], 'на вужчому екрані скорочується більше');
  const nd = c.payNoDayParts(['А', 'Б']).map(c.payPartsText);
  assert.deepEqual(j(nd), ['ОЧ без дати · 2 · А, Б', 'ОЧ без дати · 2 · А +1', 'ОЧ без дати · 2']);
});
test('вимірювальна логіка fitPaymentsCard підтримує пари { h, t } (payRenderParts) без зміни вибору сходинок', function(){
  assert.match(SRC, /const put = function\(i\)\{ if\(el\._payParts\) payRenderParts\(el, el\._payParts\[i\]\); else el\.textContent = ladder\[i\]; \};/);
});
