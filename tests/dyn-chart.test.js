// Rev 2.32.392 (DS-5d-1): картка «Динаміка за 6 місяців» — F10 (крок осі й підписи, лише відображення) і охоронні перевірки. Суми вигадані.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ex = require('./extract');
const SRC = ex.readIndexWithCss();
const HTML = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const ctx = ex.buildSandbox({}, ['niceAxisStep', 'axisModel', 'axisLabel', 'dynBarPath', 'DYN_STEPS']);
const j = code => JSON.parse(ex.evalInSandbox(ctx, 'JSON.stringify(' + code + ')'));

test('F10: niceAxisStep — перший крок із 5k/10k/20k/25k/40k/50k, при якому не більше 4 інтервалів', () => {
  [[1, 5000], [4800, 5000], [20000, 5000], [20001, 10000], [40000, 10000], [40001, 20000], [80000, 20000], [80001, 25000], [100000, 25000], [100001, 40000], [160000, 40000], [160001, 50000], [200000, 50000]].forEach(([m, st]) => assert.equal(j('niceAxisStep(' + m + ')'), st, String(m)));
  assert.equal(j('niceAxisStep(200001)'), 100000, 'понад — далі ×10'); assert.equal(j('niceAxisStep(1e9)'), 250000000);
});
test('F10: нуль, від\'ємне й нечислове → 5000 без NaN', () => {
  [0, -5, NaN].forEach(v => assert.equal(j('niceAxisStep(' + v + ')'), 5000)); assert.equal(j('niceAxisStep(undefined)'), 5000); assert.equal(j('niceAxisStep(null)'), 5000); assert.equal(j('niceAxisStep("x")'), 5000); assert.equal(j('niceAxisStep(Infinity)'), 5000);
});
test('axisModel: верх кратний кроку й ≥ одного кроку, поділки 0…верх, ≤ 4 інтервалів; нулі без ділення на 0', () => {
  assert.deepEqual(j('axisModel(51000)'), { step: 20000, top: 60000, ticks: [0, 20000, 40000, 60000] });
  assert.deepEqual(j('axisModel(9000)'), { step: 5000, top: 10000, ticks: [0, 5000, 10000] });
  assert.deepEqual(j('axisModel(0)'), { step: 5000, top: 5000, ticks: [0, 5000] }, 'порожньо: вісь до одного кроку, не NaN');
  assert.deepEqual(j('axisModel(-3)'), { step: 5000, top: 5000, ticks: [0, 5000] });
  for (let m = 1; m < 400000; m += 7919){ const a = j('axisModel(' + m + ')'); assert.ok(a.top >= m, m + ': верх не нижчий за максимум'); assert.ok(a.top / a.step <= 4, m + ': ≤ 4 інтервалів'); assert.equal(a.ticks.length, a.top / a.step + 1); assert.equal(a.top % a.step, 0); }
});
test('axisLabel: «Nk» від 1 000, менше — число; нуль — «0»', () => {
  [[0, '0'], [400, '400'], [999, '999'], [1000, '1k'], [1499, '1k'], [1500, '2k'], [25000, '25k'], [51000, '51k'], [-2500, '-3k'], [undefined, '0'], ['x', '0']].forEach(([v, w]) => assert.equal(j('axisLabel(' + JSON.stringify(v === undefined ? null : v) + ')'), w, String(v)));
});
test('розмітка й охоронне: одна картка замість двох графіків; сегмент; 212 pt; pan-y; розриви боргу лише за фактом; порожні стани; «зменшити рух»', () => {
  ['chart-income-expense', 'chart-debt-line', 'ov-row2', 'gm-chart-card'].forEach(id => assert.ok(!HTML.includes('id="' + id + '"') && !HTML.includes('class="' + id + '"'), id));
  const iPot = HTML.indexOf('id="bal-pot-card"'), iDyn = HTML.indexOf('id="bal-dyn-card"'), iIns = HTML.indexOf('id="bal-ins-card"');
  assert.ok(iPot > 0 && iPot < iDyn && iDyn < iIns, 'порядок: Потенціал → Динаміка → Висновки');
  assert.ok(/id="bal-dyn-seg"/.test(HTML) && /data-k="io"/.test(HTML) && /data-k="debt"/.test(HTML));
  const m = SRC.slice(SRC.indexOf('function balAcChart'), SRC.indexOf('function dynLegendHtml'));
  assert.ok(/H = 212/.test(m), 'висота 212 pt'); assert.ok(/chartScrub\(host/.test(m), 'дотик і ведення через спільний chartScrub');
  const r = SRC.slice(SRC.indexOf('function renderDynCard'), SRC.indexOf('function setDynMode'));
  assert.ok(/ok = !!c\.startMonth && m >= c\.startMonth && d\.actual/.test(r), 'точка боргу лише з фактом (carry-forward не малюється)');
  assert.ok(/kindHasActualForMonth\('card', m\)/.test(SRC.slice(SRC.indexOf('renderDynCard({ month'), SRC.indexOf('renderDynCard({ month') + 700)));
  assert.ok(/Ще немає даних про доходи й витрати/.test(r) && /Немає фактичних записів боргу/.test(r) && /Ще немає даних\. Додай борги/.test(r), 'порожні стани');
  const css = ex.readAppCss(); assert.ok(/\.bal-ac\{[^}]*touch-action:pan-y/.test(css), 'вертикальна прокрутка лишається сторінці');
  assert.ok(/\.bal-ac \.bar, \.bal-ac text\.vt, \.bal-ac \.ln, \.bal-ac circle\{ animation:none; \}/.test(css), '«зменшити рух»');
  assert.ok(/e\.target\.closest\('button\[data-k\]'\)/.test(SRC) && !/onclick=/.test(r), 'делегування, без inline-обробників з даними');
  assert.ok(/escapeHtml\(s\.label\)/.test(m) && /escapeAttr\(o\.aria\)/.test(m), 'екранування');
});

test('DS-5d-2: «Висновки» — картка з контурними піктограмами без кольорових кружків; логіка висновків не змінена; порожньо — пояснення', () => {
  assert.ok(/id="bal-ins-card"[\s\S]*id="summary-container"/.test(HTML), 'контейнер висновків у новій картці');
  ['ov-row4', 'summary-card', 'insights-row', 'Висновки місяця'].forEach(x => assert.ok(!HTML.includes(x), x + ' прибрано'));
  const m = SRC.slice(SRC.indexOf("const summaryEl = document.getElementById('summary-container')"), SRC.indexOf('dashAfterRender(month);'));
  assert.ok(!SRC.includes('INSIGHT_COLORS') && !m.includes('insight-icon') && !m.includes('background:${c.bg}'), 'кольорових кружків немає');
  assert.ok(/class="bal-ili"><span class="bal-ii">\$\{INSIGHT_ICONS\[i\.icon\]\}<\/span><span class="bal-itx"><b>\$\{i\.title\}<\/b><span>\$\{i\.desc\}<\/span>/.test(m), 'піктограма, заголовок, опис');
  assert.ok(/insights\.length \? insights\.map/.test(m) && /Ще немає висновків за цей місяць/.test(m), 'порожній стан');
  // та сама логіка: п'ять висновків і ті самі умови
  ['Фінансовий результат', 'Найбільша витрата', 'Звичка місяця', 'Оплати частинами', 'Чудова робота!', 'Борг зростає', 'Потрібен факт за поточний і попередній місяць'].forEach(t => assert.ok(m.includes(t), t));
  assert.ok(/if\(!hasDebtData\)\{[\s\S]*?\}else if\(!cardDeltaKnown\)\{/.test(m), 'дельта боргу лише за фактом обох місяців (FINANCIAL_RULES §3.1)');
  const css = ex.readAppCss(); assert.ok(/\.bal-ii\{ display:block; width:20px; height:20px; flex:none; color:var\(--text-3\); \}/.test(css));
});

test('dynBarPath: правильний шлях стовпчика (числа, а не конкатенація рядків: рядкові аргументи не дають NaN)', () => {
  const a = j('dynBarPath(10, 20, 13, 50, 4)'), b = j('dynBarPath("10.0","20.0","13.0","50.0",4)');
  assert.equal(a, 'M10 70V24Q10 20 14 20H19Q23 20 23 24V70Z'); assert.equal(b, a, 'рядкові числа дають той самий шлях');
  assert.ok(!/NaN/.test(j('dynBarPath("179.2","188.0","13.0","0.0",4)')), 'нульова висота без NaN');
  assert.equal(j('dynBarPath(1, 2, 3, 0, 4)'), 'M1 2V2Q1 2 1 2H4Q4 2 4 2V2Z', 'висота 0: r обмежено висотою');
});
