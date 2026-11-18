// Rev 2.32.385 (DS-5a): картка «Сімейний баланс» — чисті функції F1 (смуга днів), F2 («на той самий день»), F3 («≈ на день») і охоронні перевірки розмітки. Усі суми вигадані.
// Формули підтверджено в docs/reports/DS-5-step0.md («Рішення 18.11»).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const ex = require('./extract');
const SRC = ex.readIndexWithCss();
const NAMES = ['daysInMonthKey', 'balancePosition', 'roundSym', 'dayBarModel', 'sumUpToDay', 'sameDayLimits', 'percentChange', 'daysLeftCount', 'freePerDay', 'balanceRest', 'dayWord', 'monthsWord'];
const ctx = ex.buildSandbox({}, NAMES);
const j = code => JSON.parse(ex.evalInSandbox(ctx, 'JSON.stringify(' + code + ')'));

test('daysInMonthKey: 28/29/30/31, високосний рік і межі року', () => {
  assert.equal(j("daysInMonthKey('2026-02')"), 28);
  assert.equal(j("daysInMonthKey('2028-02')"), 29);
  assert.equal(j("daysInMonthKey('2100-02')"), 28, '2100 не високосний');
  assert.equal(j("daysInMonthKey('2026-04')"), 30);
  assert.equal(j("daysInMonthKey('2026-12')"), 31);
  assert.equal(j("daysInMonthKey('2027-01')"), 31);
  assert.equal(j("daysInMonthKey('мотлох')"), 30, 'хибний ключ — безпечне значення');
});

test('balancePosition: поточний (T — день), минулий (T = N), наступний (T = 0); перехід через рік', () => {
  assert.deepEqual(j("balancePosition('2026-11','2026-11-16')"), { N: 30, T: 16, phase: 'current' });
  assert.deepEqual(j("balancePosition('2026-11','2026-11-01')"), { N: 30, T: 1, phase: 'current' });
  assert.deepEqual(j("balancePosition('2026-12','2026-12-31')"), { N: 31, T: 31, phase: 'current' }, '31-ше: T = N');
  assert.deepEqual(j("balancePosition('2026-02','2026-02-28')"), { N: 28, T: 28, phase: 'current' });
  assert.deepEqual(j("balancePosition('2026-10','2026-11-16')"), { N: 31, T: 31, phase: 'past' });
  assert.deepEqual(j("balancePosition('2025-12','2026-01-01')"), { N: 31, T: 31, phase: 'past' }, 'грудень минулого року');
  assert.deepEqual(j("balancePosition('2026-12','2026-11-16')"), { N: 31, T: 0, phase: 'future' });
  assert.deepEqual(j("balancePosition('2027-01','2026-12-31')"), { N: 31, T: 0, phase: 'future' }, 'січень наступного року');
});

test('roundSym: симетричне округлення до 100 і 10; без «−0»', () => {
  assert.equal(j('roundSym(1250,100)'), 1300);
  assert.equal(j('roundSym(-1250,100)'), -1300, 'дзеркально (Math.round(-12.5) дало б -12)');
  assert.equal(j('roundSym(49,100)'), 0);
  assert.equal(j('Object.is(roundSym(-49,100), -0)'), false);
  assert.equal(j('roundSym(1113,10)'), 1110);
  assert.equal(j('roundSym(1115,10)'), 1120);
  assert.equal(j('roundSym(undefined,100)'), 0);
});

test('F1: приклад зі звіту — дохід 42 000, витрати 23 600, N 30, T 16 → S 16,857; різниця +1 200', () => {
  const m = j("dayBarModel(23600,42000,{N:30,T:16,phase:'current'})");
  assert.ok(Math.abs(m.S - 16.857142857) < 1e-6);
  assert.equal(m.diff, 1200);
  assert.equal(m.tone, 'ahead');
  assert.equal(m.spentPct, 56);
  assert.equal(m.fills.length, 30);
  assert.equal(m.fills.slice(0, 16).every(f => f === 1), true, '16 повних сегментів');
  assert.ok(Math.abs(m.fills[16] - 0.857142857) < 1e-6, 'сімнадцятий — частково');
  assert.equal(m.fills.slice(17).every(f => f === 0), true);
  assert.ok(Math.abs(m.lineFrac - 16 / 30) < 1e-9);
});

test('F1: витрати менші за темп → «behind» зі знаком мінус; «у ногу» при |diff| < 50', () => {
  const b = j("dayBarModel(10000,42000,{N:30,T:16,phase:'current'})");
  assert.equal(b.diff, -12400); assert.equal(b.tone, 'behind');
  const e = j("dayBarModel(22420,42000,{N:30,T:16,phase:'current'})"); // 42000*16/30 = 22400, різниця 20
  assert.equal(e.diff, 0); assert.equal(e.tone, 'even');
  assert.equal(j("Object.is(dayBarModel(22420,42000,{N:30,T:16,phase:'current'}).diff, -0)"), false);
});

test('F1: різниця — та сама, що (витрачено/дохід − T/N) × дохід, округлена до 100', () => {
  [[23600, 42000, 30, 16], [5000, 31000, 31, 7], [0, 10000, 28, 28], [9999, 12345, 31, 1], [200000, 1000, 29, 15]].forEach(([sp, inc, N, T]) => {
    const want = (() => { const x = (sp / inc - T / N) * inc; const r = Math.round(Math.abs(x) / 100) * 100; return r === 0 ? 0 : (x < 0 ? -r : r); })();
    assert.equal(j(`dayBarModel(${sp},${inc},{N:${N},T:${T},phase:'current'}).diff`), want, [sp, inc, N, T].join('/'));
  });
});

test('F1: межі — дохід 0 / немає, витрати більші за дохід, 0 витрат, минулий і наступний місяць, T = N', () => {
  const none = j("dayBarModel(5000,0,{N:30,T:16,phase:'current'})");
  assert.equal(none.tone, 'noincome'); assert.equal(none.hasIncome, false); assert.equal(none.diff, null); assert.equal(none.spentPct, null);
  assert.equal(none.fills.every(f => f === 0), true, 'смуга без заповнення');
  assert.equal(JSON.stringify(none).includes('null,null'), false);
  assert.equal(j("dayBarModel(0,0,{N:30,T:16,phase:'current'}).tone"), 'noincome');
  assert.equal(j("dayBarModel(0,undefined,{N:30,T:16,phase:'current'}).hasIncome"), false);
  const over = j("dayBarModel(60000,42000,{N:30,T:16,phase:'current'})");
  assert.equal(over.tone, 'over'); assert.equal(over.over, 18000); assert.equal(over.fills.every(f => f === 1), true, 'усі N заповнені (S > N)');
  const zero = j("dayBarModel(0,42000,{N:30,T:16,phase:'current'})");
  assert.equal(zero.tone, 'behind'); assert.equal(zero.diff, -22400); assert.equal(zero.fills.every(f => f === 0), true);
  const past = j("dayBarModel(23600,42000,{N:31,T:31,phase:'past'})");
  assert.equal(past.tone, 'done'); assert.equal(past.lineFrac, null, 'без риски «сьогодні»'); assert.equal(past.diff, null); assert.equal(past.spentPct, 56);
  const pastOver = j("dayBarModel(50000,42000,{N:31,T:31,phase:'past'})");
  assert.equal(pastOver.tone, 'over');
  const fut = j("dayBarModel(1000,42000,{N:31,T:0,phase:'future'})");
  assert.equal(fut.tone, 'future'); assert.equal(fut.lineFrac, null); assert.equal(fut.fills.every(f => f === 0), true);
  const last = j("dayBarModel(42000,42000,{N:31,T:31,phase:'current'})");
  assert.equal(last.tone, 'even', 'T = N, витрачено весь дохід: у ногу'); assert.equal(last.lineFrac, 1);
  assert.equal(j("dayBarModel(1,1e12,{N:30,T:1,phase:'current'}).fills.length"), 30, 'великий дохід не ламає');
});

test('F2: sumUpToDay — лише записи місяця до дня включно; чужі місяці, без дати й хибні суми ігноруються', () => {
  const recs = [{ date: '2026-11-01', amount: 100 }, { date: '2026-11-16', amount: 200 }, { date: '2026-11-17', amount: 400 }, { date: '2026-10-05', amount: 800 }, { date: '', amount: 5 }, { amount: 7 }, { date: '2026-11-02', amount: 'x' }, null];
  const run = (month, day) => JSON.parse(ex.evalInSandbox(ctx, `JSON.stringify(sumUpToDay(${JSON.stringify(recs)},'${month}',${day}))`));
  assert.equal(run('2026-11', 16), 300);
  assert.equal(run('2026-11', 1), 100);
  assert.equal(run('2026-11', 31), 700);
  assert.equal(run('2026-10', 31), 800);
  assert.equal(run('2026-12', 31), 0);
  assert.equal(run('2026-11', 0), 0);
});

test('F2: sameDayLimits — поточний min(T, днів минулого), минулий — повний з повним, наступний — без порівняння', () => {
  assert.deepEqual(j("sameDayLimits({N:30,T:16,phase:'current'},'2026-10')"), { curDay: 16, prevDay: 16, full: false });
  assert.deepEqual(j("sameDayLimits({N:31,T:31,phase:'current'},'2026-02')"), { curDay: 31, prevDay: 28, full: false }, '31 березня → кінець лютого');
  assert.deepEqual(j("sameDayLimits({N:31,T:31,phase:'current'},'2028-02')"), { curDay: 31, prevDay: 29, full: false }, 'високосний лютий');
  assert.deepEqual(j("sameDayLimits({N:31,T:1,phase:'current'},'2026-12')"), { curDay: 1, prevDay: 1, full: false }, '1 січня → 1 грудня');
  assert.deepEqual(j("sameDayLimits({N:30,T:30,phase:'past'},'2026-10')"), { curDay: 30, prevDay: 31, full: true }, 'минулий: повний місяць, навіть 31-й день попереднього');
  assert.equal(j("sameDayLimits({N:31,T:0,phase:'future'},'2026-11')"), null);
});

test('F2: percentChange — приклад зі звіту; минулий 0 → null; зниження й нуль', () => {
  assert.equal(j('percentChange(23600,27100)'), -13);
  assert.equal(j('percentChange(42000,39500)'), 6);
  assert.equal(j('percentChange(100,100)'), 0);
  assert.equal(j('percentChange(0,500)'), -100);
  assert.equal(j('percentChange(500,0)'), null);
  assert.equal(j('percentChange(0,0)'), null);
  assert.equal(j('percentChange(500,undefined)'), null);
});

test('F3: «≈ на день» = вільні / (N − T + 1), до 10; лише поточний місяць і вільні > 0', () => {
  assert.equal(j("daysLeftCount({N:30,T:16,phase:'current'})"), 15, 'знаменник з сьогодні');
  assert.equal(j("freePerDay(16700,{N:30,T:16,phase:'current'})"), 1110, '16 700 / 15 = 1 113 → 1 110');
  assert.equal(j("daysLeftCount({N:31,T:31,phase:'current'})"), 1, 'останній день: знаменник 1');
  assert.equal(j("freePerDay(5000,{N:31,T:31,phase:'current'})"), 5000);
  assert.equal(j("freePerDay(3100,{N:31,T:1,phase:'current'})"), 100, '1-ше: 3100 / 31');
  assert.equal(j("freePerDay(3,{N:30,T:16,phase:'current'})"), 0, 'менше 10 → 0 (картка напише «менше 10 ₴»)');
  assert.equal(j("freePerDay(0,{N:30,T:16,phase:'current'})"), null);
  assert.equal(j("freePerDay(-500,{N:30,T:16,phase:'current'})"), null, 'перевитрата — без «на день»');
  assert.equal(j("freePerDay(16700,{N:30,T:30,phase:'past'})"), null);
  assert.equal(j("freePerDay(16700,{N:31,T:0,phase:'future'})"), 540, 'наступний місяць: решта / N');
  assert.equal(j("daysLeftCount({N:31,T:0,phase:'future'})"), 31);
  assert.equal(j("daysLeftCount({N:30,T:30,phase:'past'})"), null);
});

test('F3 (виправлено 18.11): решта = вільні − витрачене на необов\'язкове = дохід − витрати; обов\'язкові віднімаються один раз', () => {
  // дохід 30 000, обов'язкові 9 000, витрачено 40 000 → вільні 21 000, необов'язкові 31 000, решта −10 000 → «Перевищено» (вигадані числа)
  const o = j('balanceRest(30000,40000,9000)');
  assert.deepEqual(o, { free: 21000, nonMand: 31000, rest: -10000, over: 10000, fill: 1 });
  assert.equal(j("freePerDay(-10000,{N:30,T:15,phase:'current'})"), null, 'перевищено — без «на день»');
  // дохід 42 000, обов'язкові 15 000, усього витрачено 23 600 → вільні 27 000, необов'язкові 8 600, решта 18 400 (= дохід − витрати), смуга 8 600 / 27 000
  const k = j('balanceRest(42000,23600,15000)');
  assert.equal(k.free, 27000); assert.equal(k.nonMand, 8600); assert.equal(k.rest, 18400); assert.equal(k.over, 0);
  assert.ok(Math.abs(k.fill - 8600 / 27000) < 1e-9);
  assert.equal(j("freePerDay(18400,{N:30,T:16,phase:'current'})"), 1230, '18 400 / 15 = 1 226,7 → 1 230');
  // решта завжди = дохід − витрати (без подвійного врахування обов'язкових)
  [[30000, 40000, 9000], [42000, 23600, 15000], [0, 5000, 0], [10000, 0, 0], [10000, 10000, 10000], [5000, 8000, 8000], [1e9, 123, 100]].forEach(([i, s, m]) => assert.equal(j(`balanceRest(${i},${s},${m}).rest`), i - s, [i, s, m].join('/')));
  // межі
  assert.deepEqual(j('balanceRest(10000,10000,10000)'), { free: 0, nonMand: 0, rest: 0, over: 0, fill: 1 }, 'вільних 0: смуга повна, решта 0');
  const m = j('balanceRest(5000,8000,8000)'); assert.equal(m.free, -3000); assert.equal(m.rest, -3000); assert.equal(m.over, 3000); assert.equal(m.fill, 1, 'обов\'язкові більші за дохід');
  const z = j('balanceRest(0,0,0)'); assert.equal(z.rest, 0); assert.equal(z.fill, 1);
  assert.equal(j('balanceRest(10000,0,0).fill'), 0, 'нічого не витрачено — смуга порожня');
  assert.equal(j('balanceRest(10000,3000,undefined).rest'), 7000);
  // минулий місяць: решта без «на день»
  assert.equal(j("freePerDay(7000,{N:30,T:30,phase:'past'})"), null);
});

test('dayWord / monthsWord: відмінки', () => {
  [[1, 'день'], [2, 'дні'], [4, 'дні'], [5, 'днів'], [11, 'днів'], [12, 'днів'], [14, 'днів'], [21, 'день'], [22, 'дні'], [30, 'днів'], [31, 'день']].forEach(([n, w]) => assert.equal(j(`dayWord(${n})`), w, String(n)));
  [[1, 'місяць'], [2, 'місяці'], [4, 'місяці'], [5, 'місяців'], [6, 'місяців']].forEach(([n, w]) => assert.equal(j(`monthsWord(${n})`), w));
});

test('картка: підпис плитки «Після обов\'язкових» — «решта» чи «Перевищено на», смуга з balanceRest, кольором витрат при перевищенні', () => {
  assert.ok(/setText\('bal-f-pct', rb\.rest < 0 \? 'Перевищено на ' \+ fmt\(rb\.over\) : 'решта ' \+ fmt\(rb\.rest\)\)/.test(SRC));
  assert.ok(/setFill\('bal-f-fill', rb\.fill\)/.test(SRC) && /ff\.classList\.toggle\('over', rb\.rest < 0\)/.test(SRC));
  assert.ok(/\.bal-fill\.income\.over\{ background:var\(--expense\)/.test(ex.readAppCss()));
});

test('розмітка: картка першою на «Аналітиці», перед «Найближчими платежами»; велике число — одометр без textContent-залежності; старі KPI прибрано', () => {
  const html = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'index.html'), 'utf8');
  const iBal = html.indexOf('id="analytics-bal-wrap"'), iPay = html.indexOf('id="payments-card"'), iBody = html.indexOf('id="analytics-body"');
  assert.ok(iBal > 0 && iBal < iPay && iPay < iBody, 'порядок: баланс → платежі → решта');
  assert.ok(/id="kpi-savings" role="img"/.test(html) && /class="bal-big odo"/.test(html));
  ['kpi-income', 'kpi-expense', 'kpi-mandatory', 'kpi-free', 'kpi-ratio-val', 'spark-income', 'spark-expense', 'spark-savings', 'trend-income', 'trend-expense', 'trend-savings', 'kpi-savings-card'].forEach(id => assert.ok(!html.includes('id="' + id + '"'), id + ' прибрано з розмітки'));
  assert.ok(html.includes('id="bal-dbar"') && html.includes('onclick="toggleBalanceCard()"'));
  assert.ok(/id="bal-toggle"[^>]*aria-expanded="false"[^>]*aria-controls="bal-more"/.test(html), 'aria: розгортання');
});

test('охоронне: числа балансу рухає лише transform/opacity; одометр шанує зменшення руху; у картці немає полів вводу', () => {
  const css = ex.readAppCss();
  const block = css.slice(css.indexOf('===== Rev 2.32.385 (DS-5a): картка'));
  assert.ok(/\.odc\{ display:block;[^}]*transition:transform/.test(block.replace(/\s+/g, ' ').replace(/\{ /g, '{ ')) || /\.odc\s*\{[^}]*transition:transform/.test(block));
  assert.ok(!/transition:[^;}]*(?:\bwidth\b|\bheight\b|\btop\b|\bleft\b|margin)/.test(block.replace(/\/\*[^]*?\*\//g, '')), 'жодних layout-властивостей у transition картки (розкриття — grid-template-rows)');
  assert.ok(/@media \(prefers-reduced-motion: reduce\)\{[^]*\.bal-seg/.test(block), 'зменшення руху вимикає анімації картки');
  assert.ok(/const reduced = motionReduced\(\);/.test(SRC) && /if\(!reduced\)\{ col\.classList\.remove\('z'\)/.test(SRC));
  const html = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'index.html'), 'utf8');
  const card = html.slice(html.indexOf('id="analytics-bal-wrap"'), html.indexOf('id="payments-card"'));
  assert.ok(!/<(input|textarea|select)\b/.test(card), 'картка без полів вводу (правила id/автозаповнення не застосовуються)');
});
