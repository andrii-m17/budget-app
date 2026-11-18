// Rev 2.32.388 (DS-5c-1): картка «Деталізація витрат» і кільця — чисті функції (розбивка, donutModel, колір, відсоток) та охоронні перевірки. Суми й назви вигадані. F9: відсотки від витрат місяця.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ex = require('./extract');
const SRC = ex.readIndexWithCss();
const HTML = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const ctx = ex.buildSandbox({ escapeHtml: esc, balCatData: null }, ['tileForName', 'splitLeadingEmoji', 'catBreakdown', 'donutModel', 'catPctText', 'catColorIndex', 'catColor', 'catRowHtml', 'stripLeadingEmoji', 'escapeAttr', 'fmt', 'DONUT_LABEL_MIN', 'DONUT_R', 'DONUT_SHADES']);
const j = code => JSON.parse(ex.evalInSandbox(ctx, 'JSON.stringify(' + code + ')'));
const exps = [
  { amount: 6900, category: '🛒 Продукти', subcategory: '' }, { amount: 4800, category: '🛒 Продукти', subcategory: '🏪 Супермаркет' }, { amount: 2100, category: '🛒 Продукти', subcategory: '🥬 Ринок' },
  { amount: 1900, category: '🍔 Харчування', subcategory: '☕️ Кафе' }, { amount: 1000, category: '🍔 Харчування', subcategory: '🍕 Доставка' }, { amount: 500, category: '🚌 Транспорт', subcategory: '' }
];

test('іконка позиції — за правилом «Структури» (tileForName): емодзі з початку назви, без емодзі — перша літера; крапки «•» немає', () => {
  const b = j('catBreakdown(' + JSON.stringify([{ amount: 100, category: '🛒 Продукти', subcategory: '☕️ Кафе' }, { amount: 90, category: 'Інше', subcategory: 'пальне' }, { amount: 80, category: '', subcategory: '' }]) + ')');
  assert.equal(b.cats.find(c => c.name === 'Продукти').icon, '🛒'); assert.equal(b.cats.find(c => c.name === 'Інше').icon, 'І', 'без емодзі — перша літера (велика)');
  assert.equal(b.subs.find(c => c.name === 'Кафе').icon, '☕️'); assert.equal(b.subs.find(c => c.name === 'пальне').icon, 'П');
  assert.equal(b.subs.find(c => c.key === 'n:').icon, 'Б', '«Без підкатегорії» — літера Б'); assert.ok(b.cats.every(c => c.icon && c.icon !== '•') && b.subs.every(c => c.icon !== '•'));
  const SRC_JS = SRC.slice(SRC.indexOf('===== Rev 2.32.388 (DS-5c-1)'));
  assert.ok(!/'•'/.test(SRC_JS.slice(0, SRC_JS.indexOf("(window.__MT_FILES"))), 'символу «•» як іконки в коді картки немає');
});

test('catBreakdown: суми категорій і підкатегорій (разом із «Без підкатегорії») збігаються з сумою витрат; батько — категорія з більшою сумою', () => {
  const b = j('catBreakdown(' + JSON.stringify(exps) + ')');
  const total = exps.reduce((s, e) => s + e.amount, 0);
  assert.equal(b.total, total);
  assert.equal(b.cats.reduce((s, c) => s + c.sum, 0), total); assert.equal(b.subs.reduce((s, c) => s + c.sum, 0), total, 'підкатегорії + «Без підкатегорії» = усі витрати');
  assert.deepEqual(b.cats.map(c => c.name), ['Продукти', 'Харчування', 'Транспорт']); assert.deepEqual(b.cats.map(c => c.sum), [13800, 2900, 500]);
  const none = b.subs.find(s => s.key === 'n:'); assert.equal(none.name, 'Без підкатегорії'); assert.equal(none.sum, 7400, '6 900 + 500 без підкатегорії');
  assert.equal(b.subs.find(s => s.name === 'Кафе').parent, '🍔 Харчування'); assert.equal(b.subs.find(s => s.name === 'Кафе').icon, '☕️');
  // підкатегорія під двома категоріями: батько — та, де більше
  const two = j('catBreakdown(' + JSON.stringify([{ amount: 100, category: 'A', subcategory: 'X' }, { amount: 900, category: 'B', subcategory: 'X' }]) + ')');
  assert.equal(two.subs[0].parent, 'B');
});
test('catBreakdown: порожньо, суми ≤ 0 і нечислові ігноруються, без категорії — «Без категорії»', () => {
  assert.deepEqual(j('catBreakdown([])'), { total: 0, cats: [], subs: [] }); assert.deepEqual(j('catBreakdown(undefined)'), { total: 0, cats: [], subs: [] });
  const b = j('catBreakdown(' + JSON.stringify([{ amount: 0, category: 'A' }, { amount: -5, category: 'A' }, { amount: 'x', category: 'A' }, { amount: 700, category: '', subcategory: '' }]) + ')');
  assert.equal(b.total, 700); assert.equal(b.cats.length, 1); assert.equal(b.cats[0].name, 'Без категорії'); assert.equal(b.subs.length, 1); assert.equal(b.subs[0].name, 'Без підкатегорії');
});

test('donutModel: частки в сумі 100 %, відсортовано, межа підпису 7 %, дуги без перекриття', () => {
  const items = [['a', 5000], ['b', 3000], ['c', 1000], ['d', 700], ['e', 300]].map(([k, s]) => ({ key: k, name: k, sum: s }));
  const m = j('donutModel(' + JSON.stringify(items) + ')');
  assert.equal(m.empty, false); assert.equal(m.total, 10000); assert.equal(m.count, 5); assert.equal(m.segs.length, 5);
  assert.ok(Math.abs(m.segs.reduce((s, x) => s + x.share, 0) - 100) < 1e-9);
  assert.deepEqual(m.segs.map(s => s.pct), [50, 30, 10, 7, 3]);
  assert.deepEqual(m.segs.map(s => s.label), [true, true, true, true, false], '7 % уже з підписом, 3 % — без');
  assert.ok(Math.abs(m.segs[0].offset + 0.4) < 1e-9, 'перший сектор: зсув −0,4 (півзазору)');
  for (let i = 1; i < m.segs.length; i++) assert.ok(m.segs[i].offset < m.segs[i - 1].offset, 'зсуви зростають за модулем');
  m.segs.forEach(s => assert.ok(Math.abs(Math.hypot(s.lx - 104, s.ly - 104) - 80.9) < 1e-6, 'підпис на радіусі 80,9'));
  const edge = j('donutModel([{key:"x",name:"x",sum:693},{key:"y",name:"y",sum:9307}])'); // 6,93 % і 93,07 %
  assert.equal(edge.segs.find(s => s.key === 'x').label, false, '6,93 % < 7 %');
  assert.equal(j('donutModel([{key:"x",name:"x",sum:70},{key:"y",name:"y",sum:930}])').segs.find(s => s.key === 'x').label, true, 'рівно 7 %');
});
test('donutModel: топ-5 + «Решта» (у «Решті» щонайменше дві позиції); шоста сама лишається під назвою; частки = 100', () => {
  const mk = n => Array.from({ length: n }, (_, i) => ({ key: 'k' + i, name: 'n' + i, sum: 1000 - i * 10 }));
  const six = j('donutModel(' + JSON.stringify(mk(6)) + ')'); assert.equal(six.segs.length, 6); assert.equal(six.segs.some(s => s.other), false, 'в «Решті» була б одна позиція — лишаємо назву');
  const seven = j('donutModel(' + JSON.stringify(mk(7)) + ')'); assert.equal(seven.segs.length, 6); const o = seven.segs[5];
  assert.equal(o.other, true); assert.equal(o.key, '__other'); assert.equal(o.name, 'Решта'); assert.deepEqual(o.restKeys, ['k5', 'k6']); assert.equal(o.sum, (1000 - 50) + (1000 - 60));
  assert.ok(Math.abs(seven.segs.reduce((s, x) => s + x.share, 0) - 100) < 1e-9); assert.equal(seven.count, 7);
  const many = j('donutModel(' + JSON.stringify(mk(40)) + ')'); assert.equal(many.segs.length, 6); assert.equal(many.segs[5].restKeys.length, 35);
  // багато дрібних: усі дрібні в «Решта»
  const tiny = j('donutModel(' + JSON.stringify([{ key: 'big', name: 'big', sum: 10000 }].concat(Array.from({ length: 8 }, (_, i) => ({ key: 't' + i, name: 't', sum: 10 })))) + ')');
  assert.equal(tiny.segs[0].key, 'big'); assert.ok(tiny.segs.some(s => s.other));
});
test('donutModel: порожньо, нульові й від\'ємні суми, одна категорія (суцільне кільце без зазору)', () => {
  assert.deepEqual(j('donutModel([])'), { total: 0, count: 0, empty: true, segs: [] }); assert.equal(j('donutModel(undefined).empty'), true);
  assert.equal(j('donutModel([{key:"a",name:"a",sum:0},{key:"b",name:"b",sum:-5}]).empty'), true);
  const one = j('donutModel([{key:"a",name:"a",sum:1234}])'); assert.equal(one.segs.length, 1); assert.equal(one.segs[0].pct, 100); assert.equal(one.segs[0].dash, 100, 'без зазору'); assert.equal(one.segs[0].offset, 0); assert.equal(one.segs[0].label, true);
  const tinyOne = j('donutModel([{key:"a",name:"a",sum:99999},{key:"b",name:"b",sum:1}])'); assert.ok(tinyOne.segs[1].dash >= 0.3, 'мінімальна дуга 0,3');
});

test('catPctText: ціле, «<1%» для дуже малих, порожньо без витрат; частка від суми витрат (F9), а не доходу', () => {
  assert.equal(j('catPctText(6900,23600)'), '29%'); assert.equal(j('catPctText(1,10000)'), '<1%'); assert.equal(j('catPctText(10,0)'), ''); assert.equal(j('catPctText(23600,23600)'), '100%');
  const m = SRC.slice(SRC.indexOf('function catRowHtml'), SRC.indexOf('function syncCatSegs'));
  assert.ok(/catPctText\(item\.sum, balCatData\.total\)/.test(m) && !/totalIncome/.test(m));
});

test('колір: категорії --k1…--k5 за рангом, «Решта» й решта --k6; підкатегорія — відтінок кольору категорії 100/64/42 %; без батька --k6', () => {
  assert.equal(j('catColorIndex(0)'), 1); assert.equal(j('catColorIndex(4)'), 5); assert.equal(j('catColorIndex(5)'), 6); assert.equal(j('catColorIndex(30)'), 6);
  const cats = [{ key: 'c:A' }, { key: 'c:B' }], subs = [{ key: 's:1', parent: 'A' }, { key: 's:2', parent: 'A' }, { key: 's:3', parent: 'A' }, { key: 's:4', parent: 'A' }, { key: 's:5', parent: 'B' }, { key: 's:6', parent: '' }];
  const c = (it, mode) => j('catColor(' + JSON.stringify(it) + ',"' + mode + '",' + JSON.stringify(cats) + ',' + JSON.stringify(subs) + ')');
  assert.equal(c({ key: 'c:A' }, 'cat'), 'var(--k1)'); assert.equal(c({ key: 'c:B' }, 'cat'), 'var(--k2)'); assert.equal(c({ key: '__other', other: true }, 'cat'), 'var(--k6)');
  assert.equal(c({ key: 's:1', parent: 'A' }, 'sub'), 'color-mix(in srgb, var(--k1) 100%, var(--surface))');
  assert.equal(c({ key: 's:2', parent: 'A' }, 'sub'), 'color-mix(in srgb, var(--k1) 64%, var(--surface))');
  assert.equal(c({ key: 's:3', parent: 'A' }, 'sub'), 'color-mix(in srgb, var(--k1) 42%, var(--surface))'); assert.equal(c({ key: 's:4', parent: 'A' }, 'sub'), 'color-mix(in srgb, var(--k1) 42%, var(--surface))', 'четверта й далі — 42 %');
  assert.equal(c({ key: 's:5', parent: 'B' }, 'sub'), 'color-mix(in srgb, var(--k2) 100%, var(--surface))'); assert.equal(c({ key: 's:6', parent: '' }, 'sub'), 'var(--k6)');
});

test('рядок: назви й ключі екрановано (HTML-подібний текст не потрапляє розміткою)', () => {
  const out = ex.evalInSandbox(ctx, "balCatData = { total: 1000 }; catRowHtml({ key: 'c:<img src=x onerror=alert(1)>', name: '<script>x</script>', sum: 500, icon: '<b>', parent: '' }, 500, 'cat', '', false)");
  assert.ok(!/<script>|<img |<b>/.test(out), out); assert.ok(out.includes('&lt;script&gt;')); assert.ok(/data-k="c:&lt;img/.test(out));
});

test('розмітка: картка після плиток і перед «Звичкою», старі таблиці категорій і підкатегорій прибрано; шторка без полів; сегмент і лінії', () => {
  ['card-categories', 'card-subcategories', 'categories-body', 'subcategories-body', 'categories-trigger', 'subcategories-trigger'].forEach(id => assert.ok(!HTML.includes('id="' + id + '"'), id));
  assert.ok(HTML.includes('id="card-reducible"'), '«Потенціал економії» (DS-5c-2) поки на місці');
  const iPair = HTML.indexOf('id="bal-pair"'), iCat = HTML.indexOf('id="bal-cat-card"'), iHab = HTML.indexOf('class="ov-kpistrip"');
  assert.ok(iPair > 0 && iPair < iCat && iCat < iHab, 'порядок: Борг|ОЧ → Деталізація → решта');
  const a = HTML.indexOf('id="bal-sheet-cats" role="dialog"'); const d = HTML.slice(a, HTML.indexOf('</div>\n<', a + 10));
  assert.ok(/aria-modal="true" inert>/.test(d.slice(0, 200)) && !/<(input|textarea|select)\b/.test(d));
  assert.ok(/'bal-sheet-cats': 'closeCatsSheet'/.test(fs.readFileSync(path.join(__dirname, '..', 'js', 'sheets.js'), 'utf8')));
  ['openCatsSheet', 'closeCatsSheet', 'setCatMode', 'renderCatCard', 'renderBalDonut', 'applyCatSel', 'selectCat'].forEach(f => assert.ok(SRC.includes('function ' + f + '('), f));
});
test('охоронне: анімація дуги вимикається при «зменшити рух» (JS і CSS); кільце — окреме для кожного режиму; клік через делегування, без inline-обробників з даними', () => {
  assert.ok(/if\(motionReduced\(\)\) finish\(\);/.test(SRC));
  const css = ex.readAppCss(); assert.ok(/@media \(prefers-reduced-motion: reduce\)\{[^]*\.bal-sg/.test(css.slice(css.indexOf('===== Rev 2.32.388'))) || /\.bal-sg, \.bal-seg2 \.ind\{ transition:none; \}/.test(css));
  const m = SRC.slice(SRC.indexOf('function catRowHtml'), SRC.indexOf('function syncCatSegs')); assert.ok(!/onclick=/.test(m), 'рядок без inline-обробника');
  assert.ok(/const model = donutModel\(items, 5\)|const items = balCatItems\(\), model = donutModel\(items, 5\)/.test(SRC), 'кільце будується з позицій поточного режиму');
});
