// Rev 2.32.386 (DS-5b): плитки «Борг» і «ОЧ» та шторки — чисті функції F5 (частка ОЧ), F6 («% використано»), «погашено %», підпис дельти боргу й охоронні перевірки розмітки. Суми вигадані.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ex = require('./extract');
const SRC = ex.readIndexWithCss();
const HTML = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const ctx = ex.buildSandbox({}, ['ochPaidFraction', 'cardUsageModel', 'debtPaidModel', 'debtDeltaCaption', 'activeWord', 'monthLabel', 'monthGenitive', 'fmt', 'UA_MONTHS']);
const j = code => JSON.parse(ex.evalInSandbox(ctx, 'JSON.stringify(' + code + ')'));

test('F5: частка ОЧ — Σ(початкова − залишок) / Σ початкова лише по активних ОЧ із відомою початковою сумою', () => {
  // дві ОЧ: початкова 10 000, залишок 4 000 (сплачено 6 000); початкова 5 000, залишок 5 000 (0) → 6 000 / 15 000 = 0,4
  const r = j('ochPaidFraction([{initial:10000,balance:4000},{initial:5000,balance:5000}])');
  assert.ok(Math.abs(r.fraction - 0.4) < 1e-9); assert.equal(r.used, 2); assert.equal(r.skipped, 0); assert.equal(r.active, 2); assert.equal(r.base, 15000);
  assert.equal(Math.round(r.fraction * 100), 40);
});
test('F5: межі — без початкової суми, завершені, залишок > початкової, порожньо', () => {
  const noIni = j('ochPaidFraction([{initial:null,balance:3000},{initial:0,balance:100},{initial:"",balance:5}])');
  assert.equal(noIni.fraction, null); assert.equal(noIni.skipped, 3); assert.equal(noIni.active, 3); assert.equal(noIni.used, 0);
  const mixed = j('ochPaidFraction([{initial:8000,balance:2000},{initial:null,balance:900}])');
  assert.ok(Math.abs(mixed.fraction - 0.75) < 1e-9, 'ОЧ без початкової виключено з чисельника й знаменника'); assert.equal(mixed.skipped, 1);
  const done = j('ochPaidFraction([{initial:8000,balance:0},{initial:5000,balance:-10}])');
  assert.equal(done.fraction, null); assert.equal(done.active, 0, 'завершені (залишок ≤ 0) не активні і не входять у знаменник');
  const over = j('ochPaidFraction([{initial:1000,balance:1500}])');
  assert.equal(over.fraction, 0, 'залишок більший за початкову (хибні дані): внесок 0, не від\'ємний');
  assert.equal(j('ochPaidFraction([])').fraction, null); assert.equal(j('ochPaidFraction(undefined).fraction'), null);
  assert.equal(j('ochPaidFraction([{initial:1000,balance:1}]).fraction') <= 1, true);
});

test('F6: «% використано» = борг / ліміт; смуга до 100 %, текст — реальний; ліміт не вказано — без смуги', () => {
  assert.deepEqual(j('cardUsageModel(41200,60000)').hasLimit, true);
  assert.equal(j('cardUsageModel(30000,60000).pct'), 50); assert.equal(j('cardUsageModel(30000,60000).fill'), 0.5);
  assert.equal(j('cardUsageModel(41200,60000).pct'), 69, '68,67 → 69');
  const over = j('cardUsageModel(66000,60000)'); assert.equal(over.pct, 110); assert.equal(over.fill, 1); assert.equal(over.over, true, 'борг більший за ліміт: смуга повна, червона');
  const zero = j('cardUsageModel(0,60000)'); assert.equal(zero.zero, true); assert.equal(zero.pct, 0); assert.equal(zero.fill, 0);
  [null, undefined, 0, '', -5, 'x'].forEach(l => { const m = j('cardUsageModel(5000,' + JSON.stringify(l === undefined ? null : l) + ')'); assert.equal(m.hasLimit, false); assert.equal(m.pct, null); assert.equal(m.fill, 0); });
  assert.equal(j('cardUsageModel(undefined,1000).zero'), true);
});

test('«погашено %» боргу — (старт − зараз) / старт, як у колишнього кільця; борг зріс — grew', () => {
  const a = j('debtPaidModel(126800,96400)'); assert.equal(a.pct, 24); assert.ok(Math.abs(a.fill - 0.2397) < 1e-3); assert.equal(a.grew, false);
  const b = j('debtPaidModel(100000,0)'); assert.equal(b.pct, 100); assert.equal(b.fill, 1);
  const c = j('debtPaidModel(100000,120000)'); assert.equal(c.pct, -20); assert.equal(c.fill, 0); assert.equal(c.grew, true);
  assert.equal(j('debtPaidModel(0,5000).has'), false); assert.equal(j('debtPaidModel(undefined,5000).pct'), null);
  assert.equal(j('debtPaidModel(100000,100000).pct'), 0); assert.equal(j('debtPaidModel(100000,100000).grew'), false);
});

test('дельта боргу лише за фактом обох місяців (FINANCIAL_RULES §3.1): перенесене — «Станом на», без прев — «немає даних», без боргів — «Боргів немає»', () => {
  const base = { hasDebtData: true, hasData: true, isCurrent: true, asOfMonth: '2026-11', deltaKnown: true, delta: 8200, month: '2026-11', prevMonth: '2026-10' };
  const q = o => j('debtDeltaCaption(' + JSON.stringify(Object.assign({}, base, o)) + ')');
  assert.deepEqual(q({}), { text: '−' + j('fmt(8200)') + ' від жовтня', tone: 'good' });
  assert.deepEqual(q({ delta: -3000 }), { text: '+' + j('fmt(3000)') + ' від жовтня', tone: 'bad' });
  assert.deepEqual(q({ delta: 0 }), { text: 'без змін від жовтня', tone: '' });
  assert.deepEqual(q({ deltaKnown: false, delta: 8200 }), { text: 'немає даних за жовтень', tone: '' }, 'дельта з carry-forward не показується як факт');
  assert.deepEqual(q({ isCurrent: false, asOfMonth: '2026-08' }), { text: 'Станом на серпень 2026', tone: '' });
  assert.deepEqual(q({ hasData: false }), { text: 'Боргів немає', tone: '' });
  assert.deepEqual(q({ hasDebtData: false }), { text: 'Боргів немає', tone: '' });
  assert.deepEqual(q({ month: '2027-01', prevMonth: '2026-12' }).text, '−' + j('fmt(8200)') + ' від грудня', 'перехід року');
});

test('activeWord: відмінки', () => { [[1, 'активна'], [2, 'активні'], [4, 'активні'], [5, 'активних'], [11, 'активних'], [21, 'активна'], [12, 'активних']].forEach(([n, w]) => assert.equal(j('activeWord(' + n + ')'), w, String(n))); });

test('розмітка: плитки замість KPI «Борг», кільця й карток; старі id прибрано; крапки; шторки без полів і з «×» для фокуса', () => {
  ['debt-donut', 'debt-donut-asof', 'kpi-debt-asof', 'debts-card-asof', 'debts-body', 'installments-body', 'kpi-debtchange', 'trend-debt', 'spark-debt', 'ov-row3-secondary', 'debts-trigger', 'installments-trigger'].forEach(id => assert.ok(!HTML.includes('id="' + id + '"') && !HTML.includes("class=\"" + id + "\""), id));
  const iPair = HTML.indexOf('id="bal-pair"'), iKpi = HTML.indexOf('id="bal-cat-card"'), iPay = HTML.indexOf('id="payments-card"'), iBody = HTML.indexOf('id="analytics-body"');
  assert.ok(iPay > 0 && iPay < iBody && iBody < iPair && iPair < iKpi, 'порядок: платежі → плитки → решта');
  ['kpi-debt', 'kpi-och', 'bal-debt-asof', 'bal-inst-asof', 'bal-debt-cap', 'bal-debt-fill', 'bal-inst-fill', 'bal-sheet-debt-body', 'bal-sheet-inst-body'].forEach(id => assert.ok(HTML.includes('id="' + id + '"'), id));
  assert.ok(/id="kpi-debt" role="img"/.test(HTML) && /id="kpi-och" role="img"/.test(HTML));
  assert.ok(/onclick="openDebtSheet\(\)"/.test(HTML) && /onclick="openInstSheet\(\)"/.test(HTML));
  ['bal-sheet-debt', 'bal-sheet-inst'].forEach(id => {
    const a = HTML.indexOf('id="' + id + '" role="dialog"'); const d = HTML.slice(a, HTML.indexOf('</div>\n<', a + 10));
    assert.ok(/aria-modal="true" inert>/.test(d.slice(0, 200)), id + ': діалог');
    assert.ok(!/<(input|textarea|select)\b/.test(d), id + ': без полів вводу');
  });
  const closers = ex.evalInSandbox(ex.buildSandbox({}, []), '1') && fs.readFileSync(path.join(__dirname, '..', 'js', 'sheets.js'), 'utf8');
  assert.ok(/'bal-sheet-debt': 'closeDebtSheet'/.test(closers) && /'bal-sheet-inst': 'closeInstSheet'/.test(closers), 'свайп/Esc через SHEET_CLOSERS');
  ['openDebtSheet', 'closeDebtSheet', 'openInstSheet', 'closeInstSheet'].forEach(f => assert.ok(SRC.includes('function ' + f + '('), f));
});

test('охоронне: у шторках усі дані екрановано; тіло шторки перемальовується при відкритті й зміні даних', () => {
  const m = SRC.slice(SRC.indexOf('function debtSheetHtml'), SRC.indexOf('function renderBalSheet'));
  assert.ok(/escapeHtml\(stripLeadingEmoji\(d\.name\)\)/.test(m) && !/\$\{d\.name\}/.test(m));
  assert.ok(!/innerHTML\s*=\s*[^;]*\bd\.name\b/.test(m), 'назви лише через escapeHtml');
  assert.ok(/function refreshBalSheets\(\)/.test(SRC) && /refreshBalSheets\(\);\n\}/.test(SRC), 'renderDebtOchTiles оновлює відкриту шторку');
  assert.ok(/function openDebtSheet\(\)\{ renderBalSheet\('debt'\); balSheetOpen/.test(SRC));
});

test('Rev 2.32.387: смуга «борг / ліміт» — колір боргу, суми шторок — основним шрифтом з tabular-nums, не моноширинним', () => {
  const m = SRC.slice(SRC.indexOf('function debtSheetHtml'), SRC.indexOf('function instSheetHtml'));
  assert.ok(/u\.over \? 'over' : 'debt'/.test(m) && !/'income'/.test(m.replace(/bal-strack"><div class="bal-fill income"/, '')), 'смуги карток — debt/over; «погашено» в шапці лишається income');
  const css = ex.readAppCss();
  assert.ok(/\.bal-fill\.debt\{ background:var\(--debt\); \}/.test(css));
  const mono = css.match(/\.bal-mono\{[^}]*\}/)[0];
  assert.ok(/font-variant-numeric:tabular-nums/.test(mono) && !/JetBrains|monospace/.test(mono));
});
