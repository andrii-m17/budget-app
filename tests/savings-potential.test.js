// Rev 2.32.390 (DS-5c-2): картка «Потенціал економії» — чинна формула потенціалу (F7) без змін і типовий місяць (F8). Суми й назви вигадані.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ex = require('./extract');
const SRC = ex.readIndexWithCss();
const HTML = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const ctx = ex.buildSandbox({}, ['savingsPotential', 'potLevel', 'typicalMonth', 'potentialWindowMonths', 'shiftMonth', 'roundSym', 'DEFAULT_SUBCATEGORY_PRIORITY', 'tileForName', 'splitLeadingEmoji', 'stripLeadingEmoji', 'catPctText']);
const j = code => JSON.parse(ex.evalInSandbox(ctx, 'JSON.stringify(' + code + ')'));

test('F8: типовий місяць — приклад зі звіту: 6 місяців без найбільшого й найменшого → 5 000, на рік 60 000', () => {
  const r = j('typicalMonth([4200,5100,7900,4600,4900,5400])');
  assert.equal(r.typical, 5000); assert.equal(r.year, 60000); assert.equal(r.n, 6); assert.equal(r.few, false); assert.equal(r.trimmed, true);
});
test('F8: 5 місяців — теж без найбільшого й найменшого; 3–4 — просте середнє; < 3 — просте середнє з «мало даних»; 0 — немає', () => {
  assert.equal(j('typicalMonth([1000,5000,5200,5400,20000])').typical, 5200, '5: (5000+5200+5400)/3');
  const f4 = j('typicalMonth([4000,5000,6000,9000])'); assert.equal(f4.typical, 6000); assert.equal(f4.trimmed, false); assert.equal(f4.few, false); assert.equal(f4.n, 4);
  const f3 = j('typicalMonth([4000,5000,9000])'); assert.equal(f3.typical, 6000, '3: просте середнє, без відкидання'); assert.equal(f3.few, false);
  const f2 = j('typicalMonth([4000,9000])'); assert.equal(f2.typical, 6500); assert.equal(f2.few, true); assert.equal(f2.year, 78000);
  const f1 = j('typicalMonth([3300])'); assert.equal(f1.typical, 3300); assert.equal(f1.few, true); assert.equal(f1.year, 39600);
  assert.equal(j('typicalMonth([])'), null); assert.equal(j('typicalMonth(undefined)'), null); assert.equal(j('typicalMonth(null)'), null);
});
test('F8: округлення до 100 (симетричне), нулі рахуються (місяць із записами без позначених підкатегорій = 0), нечислові значення ігноруються, дрібні суми', () => {
  assert.equal(j('typicalMonth([5050,5050])').typical, 5100); assert.equal(j('typicalMonth([5049,5049])').typical, 5000); assert.equal(j('typicalMonth([49])').typical, 0); assert.equal(j('Object.is(typicalMonth([-49]).typical, -0)'), false);
  assert.equal(j('typicalMonth([0,0,0,3000]).typical'), 800, 'нулі входять у середнє (3000/4 = 750 → 800)');
  assert.equal(j('typicalMonth([1000,"x",null,2000,undefined]).n'), 3, 'null → 0 (Number(null)), «x» й undefined відкинуто');
  assert.equal(j('typicalMonth([100,200,300,400,500,600,700]).trimmed'), true, 'понад 6 — теж із відкиданням');
  assert.equal(j('typicalMonth([0,0,0,0,0,0]).year'), 0);
});

// колишня логіка потенціалу з renderDashboard (до Rev 2.32.390) — еталон для порівняння
const OLD = `(function(monthExp, SUBCATEGORY_PRIORITY){
  const bySub = {};
  monthExp.forEach(e=>{ if(!e.subcategory) return; bySub[e.subcategory] = (bySub[e.subcategory]||0) + e.amount; });
  const scored = Object.entries(bySub)
    .map(function(pair){ return { name: pair[0], sum: pair[1], priority: SUBCATEGORY_PRIORITY[pair[0]] }; })
    .filter(function(r){ return !!r.priority; })
    .map(function(r){ return Object.assign({}, r, { weighted: r.sum * r.priority.score }); })
    .sort(function(a,b){ return b.weighted-a.weighted; })
    .slice(0,5);
  return { items: scored, total: scored.reduce((s,r)=>s+r.sum,0) };
})`;
test('F7: чинна формула потенціалу дає ті самі числа, що й до зміни (еталон — колишній код) на випадкових даних', () => {
  let seed = 7; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const subs = Object.keys(JSON.parse(ex.evalInSandbox(ctx, 'JSON.stringify(DEFAULT_SUBCATEGORY_PRIORITY)'))).concat(['🧩 Без позначки', '🧩 Інша', 'без емодзі']);
  for (let t = 0; t < 40; t++){
    const exps = Array.from({ length: Math.floor(rnd() * 60) }, () => ({ amount: Math.floor(rnd() * 3000) - 50, category: 'K', subcategory: rnd() < 0.2 ? '' : subs[Math.floor(rnd() * subs.length)] }));
    const want = ex.evalInSandbox(ctx, OLD + '(' + JSON.stringify(exps) + ', DEFAULT_SUBCATEGORY_PRIORITY)');
    const got = ex.evalInSandbox(ctx, 'savingsPotential(' + JSON.stringify(exps) + ', DEFAULT_SUBCATEGORY_PRIORITY)');
    assert.deepEqual(JSON.parse(JSON.stringify(got)), JSON.parse(JSON.stringify(want)), 'випадок ' + t);
  }
});
test('F7: топ-5 за сума × коефіцієнт (1 / 0,65 / 0,25), потенціал = Σ сум п\'яти; без позначки не рахується; без підкатегорії не рахується', () => {
  const P = { 'Кава': { label: 'Високий', score: 1 }, 'Обід': { label: 'Середній', score: 0.65 }, 'Футбол': { label: 'Низький', score: 0.25 }, 'Таксі': { label: 'Високий', score: 1 }, 'Пиво': { label: 'Високий', score: 1 }, 'Догляд': { label: 'Середній', score: 0.65 } };
  const exps = [['Кава', 1000], ['Обід', 2000], ['Футбол', 8000], ['Таксі', 300], ['Пиво', 200], ['Догляд', 500], ['Дім', 99999]].map(([s, a]) => ({ amount: a, category: 'K', subcategory: s })).concat([{ amount: 777, category: 'K', subcategory: '' }]);
  const r = j('savingsPotential(' + JSON.stringify(exps) + ',' + JSON.stringify(P) + ')');
  // зважені: Футбол 2000, Обід 1300, Кава 1000, Догляд 325, Таксі 300, Пиво 200 → топ-5 без Пива
  assert.deepEqual(r.items.map(x => x.name), ['Футбол', 'Обід', 'Кава', 'Догляд', 'Таксі']); assert.equal(r.total, 8000 + 2000 + 1000 + 500 + 300);
  assert.equal(j('savingsPotential([],{}).total'), 0); assert.deepEqual(j('savingsPotential(undefined,undefined)'), { items: [], total: 0 });
  assert.equal(j('savingsPotential([{amount:500,subcategory:"X"}],{}).items.length'), 0, 'підкатегорія без позначки не входить');
});
test('рівень за коефіцієнтом: ≥ 1 високий, ≥ 0,5 середній, інакше низький', () => {
  [[1, 'high'], [0.65, 'mid'], [0.5, 'mid'], [0.25, 'low'], [0, 'low'], [undefined, 'low'], [1.5, 'high']].forEach(([sc, lv]) => assert.equal(j('potLevel({score:' + (sc === undefined ? 'undefined' : sc) + '})'), lv, String(sc)));
  assert.equal(j('potLevel(undefined)'), 'low');
});
test('розмітка й охоронне: картка після деталізації, перед «Звичкою»; стара таблиця й розгортання рядів прибрано; екранування; кольори рівнів; «мало даних»; «≈ на рік» від typicalMonth', () => {
  ['card-reducible', 'reducible-body', 'reducible-trigger', 'reducible-header', 'ov-row3'].forEach(id => assert.ok(!HTML.includes('id="' + id + '"'), id));
  ['applyCardExpandState', 'updateRow3GridColumns', 'toggleCardExpand', 'expandedRow4Key'].forEach(n => assert.ok(!SRC.includes(n + '(') && !SRC.includes('let ' + n), n + ' прибрано'));
  const iCat = HTML.indexOf('id="bal-cat-card"'), iPot = HTML.indexOf('id="bal-pot-card"'), iHab = HTML.indexOf('class="ov-kpistrip"');
  assert.ok(iCat > 0 && iCat < iPot && iPot < iHab, 'порядок: Деталізація → Потенціал → решта');
  assert.ok(/id="kpi-pot" role="img"/.test(HTML) && /aria-expanded="false" aria-controls="bal-pot-more"/.test(HTML));
  const m = SRC.slice(SRC.indexOf('function renderPotentialCard'), SRC.indexOf('function togglePotCard'));
  assert.ok(/escapeHtml\(tileForName\(r\.name\)\.text\)/.test(m) && /escapeHtml\(stripLeadingEmoji\(r\.name\)\)/.test(m), 'назви й іконки екрановано');
  assert.ok(/· мало даних/.test(m) && /ctx\.typ\.few/.test(m) && /!ctx\.typ/.test(m), '«мало даних» і відсутність «на рік»');
  assert.ok(/typ: typicalMonth\(potWindow\)/.test(SRC) && /if\(me\.length\) potWindow\.push\(savingsPotential\(me, SUBCATEGORY_PRIORITY\)\.total\)/.test(SRC), 'вікно — місяці з записами, показник той самий');
  assert.ok(/Необов’язкові витрати цього місяця/.test(HTML) && !/Можна скоротити/.test(HTML), 'підпис із погодженого макета (рішення 18.11)');
  const css = ex.readAppCss(); assert.ok(/\.bal-plvl\.high\{ color:var\(--income-text\); \}/.test(css) && /\.bal-plvl\.mid\{ color:var\(--debt-text\); \}/.test(css) && /\.bal-plvl\.low\{ color:var\(--text-3\); \}/.test(css));
});

test('порожній стан: картка згорнута (клас і aria-expanded), бажана розгорнутість зберігається; підказка веде до «Структура → підкатегорія → Потенціал економії»', () => {
  const m = SRC.slice(SRC.indexOf('function renderPotentialCard'), SRC.indexOf('function togglePotCard'));
  assert.ok(/const showOpen = balPotOpen && !empty;/.test(m) && /card\.classList\.toggle\('open', showOpen\)/.test(m) && /setAttribute\('aria-expanded', showOpen \? 'true' : 'false'\)/.test(m));
  assert.ok(!/if\(empty && balPotOpen\) togglePotCard\(\)/.test(m), 'без виклику, що нічого не робить');
  assert.ok(/«Структура» → підкатегорія → «Потенціал економії»/.test(SRC) && /label: 'Потенціал економії'/.test(SRC), 'підказка збігається з назвою поля форми підкатегорії');
});

test('вікно «на рік»: лише повні місяці — поточний неповний місяць не входить ніколи (зокрема коли вибрано наступний), майбутні теж; поточний/минулий вибраний — 6 місяців', () => {
  assert.deepEqual(j("potentialWindowMonths('2026-11','2026-11')"), ['2026-10', '2026-09', '2026-08', '2026-07', '2026-06', '2026-05'], 'поточний вибраний: 6 повних перед ним');
  assert.deepEqual(j("potentialWindowMonths('2026-12','2026-11')"), ['2026-10', '2026-09', '2026-08', '2026-07', '2026-06'], 'наступний вибраний: поточний неповний (2026-11) виключено');
  assert.equal(j("potentialWindowMonths('2026-12','2026-11')").includes('2026-11'), false);
  assert.deepEqual(j("potentialWindowMonths('2026-05','2026-11')"), ['2026-04', '2026-03', '2026-02', '2026-01', '2025-12', '2025-11'], 'минулий вибраний: 6 місяців, перехід року');
  assert.deepEqual(j("potentialWindowMonths('2027-01','2026-12')"), ['2026-11', '2026-10', '2026-09', '2026-08', '2026-07'], 'наступний місяць іншого року: грудень (поточний) виключено');
  assert.deepEqual(j("potentialWindowMonths('2027-02','2026-12')"), ['2026-11', '2026-10', '2026-09', '2026-08'], 'ще далі в майбутнє: без поточного (2026-12) і майбутніх (2027-01)');
  // типовий місяць наступного не залежить від неповного поточного
  const full = j('typicalMonth([4200,5100,7900,4600,4900])'); assert.equal(full.n, 5);
  assert.ok(/potentialWindowMonths\(month, monthKey\(localDateISO\(\)\)\)\.forEach/.test(SRC), 'renderDashboard бере вікно з potentialWindowMonths');
});
