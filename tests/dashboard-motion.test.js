// Rev 2.25.0 (M2) — дашборди «оживають»: чисті функції й охоронні тести (ROADMAP 32.43).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ex = require('./extract');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const NAMES = ['motionDuration', 'staggerDelay', 'countStep', 'chartSignature', 'dashboardQueueSize', 'shouldAnimateDashboard'];
const CONSTS = ['MOTION_BASE_MS', 'MOTION_REDUCED_MAX_MS', 'DASH_MAX_QUEUE', 'DASH_STAGGER_MS', 'DASH_MAX_COUNTERS', 'DASH_MAX_TOTAL_MS', 'DASH_COUNTER_IDS'];
const ctx = ex.buildSandbox({}, CONSTS.concat(NAMES));
const j = code => JSON.parse(ex.evalInSandbox(ctx, 'JSON.stringify(' + code + ')'));

test('staggerDelay: 40 мс × k на елемент, обмежено розміром черги; хибні вхідні → безпечно', () => {
  assert.equal(j('staggerDelay(0,1,8)'), 0);
  assert.equal(j('staggerDelay(3,1,8)'), 120);
  assert.equal(j('staggerDelay(7,1,8)'), 280);
  assert.equal(j('staggerDelay(20,1,8)'), 280, 'не далі за max-1');
  assert.equal(j('staggerDelay(3,1.35,8)'), 162);
  assert.equal(j('staggerDelay(3,0.6,8)'), 72);
  assert.equal(j('staggerDelay(-2,1,8)'), 0);
  assert.equal(j('staggerDelay(2,undefined,0)'), 0);
});

test('countStep: завжди ціле, монотонне від from до to, t=1 дає точно to, t≤0 — from', () => {
  [[0, 123456], [0, -7890], [5000, 3210], [-300, 4000], [77, 77], [0, 1], [1000000, 0]].forEach(([from, to]) => {
    let prev = from;
    assert.equal(j(`countStep(${from},${to},0)`), from);
    assert.equal(j(`countStep(${from},${to},1)`), to);
    assert.equal(j(`countStep(${from},${to},1.7)`), to);
    for(let i = 0; i <= 200; i++){
      const t = i / 200;
      const v = j(`countStep(${from},${to},${t})`);
      assert.ok(Number.isInteger(v), `ціле: ${v} (t=${t})`);
      if(to >= from){ assert.ok(v >= prev && v >= from && v <= to, `монотонно вгору ${prev}→${v}`); }
      else { assert.ok(v <= prev && v <= from && v >= to, `монотонно вниз ${prev}→${v}`); }
      prev = v;
    }
  });
});

test('chartSignature: однакові дані → однаковий підпис; округлення до цілих; зміна даних → інший підпис', () => {
  const a = j('chartSignature([[100,200.2],[300,400]])');
  assert.equal(a, j('chartSignature([[100.4,200],[300.1,400.3]])'));
  assert.notEqual(a, j('chartSignature([[100,201],[300,400]])'));
  assert.notEqual(j('chartSignature([[1,1],[2,0]])'), j('chartSignature([[1,1],[2,1]])'), 'прапорець actual змінює підпис');
  assert.equal(j('chartSignature([])'), '[]');
});

test('dashboardQueueSize: ≤8 елементів і сумарно ≤900 мс при будь-якому k', () => {
  [0.6, 1, 1.35].forEach(k => {
    for(let count = 0; count <= 14; count++){
      const n = j(`dashboardQueueSize(${count},${k},8,900)`);
      assert.ok(n <= 8 && n <= count);
      if(n > 1){
        const total = j(`staggerDelay(${n - 1},${k},${n})`) + j(`motionDuration('m',${k},false)`);
        assert.ok(total <= 900, `k=${k} n=${n} total=${total}`);
      }
    }
  });
  assert.equal(j('dashboardQueueSize(8,1,8,900)'), 8, 'k=1: вся черга влазить (280+320=600)');
  assert.ok(j('dashboardQueueSize(8,1.35,8,900)') <= 8);
});

test('shouldAnimateDashboard: перший показ, зміна місяця, візит, фоновий ре-рендер, прихована сторінка, reduced, неактивна вкладка', () => {
  const base = { hidden: false, reduced: false, active: true, played: false, sameMonth: true };
  const s = o => j('shouldAnimateDashboard(' + JSON.stringify(Object.assign({}, base, o)) + ')');
  assert.deepEqual(s({ trigger: 'first' }), { play: true, repeat: false });
  assert.deepEqual(s({ trigger: 'first', played: true }), { play: false, repeat: false }, 'вдруге "first" не буває');
  assert.deepEqual(s({ trigger: 'month', played: true, sameMonth: false }), { play: true, repeat: false });
  assert.deepEqual(s({ trigger: 'visit', played: false }), { play: true, repeat: false });
  assert.deepEqual(s({ trigger: 'visit', played: true, sameMonth: true }), { play: true, repeat: true });
  assert.deepEqual(s({ trigger: 'visit', played: true, sameMonth: false }), { play: true, repeat: false }, 'інший місяць — повна');
  assert.equal(s({ trigger: 'render', played: true }).play, false, 'фоновий ре-рендер (синхронізація/Realtime) не анімується');
  assert.equal(s({ trigger: 'render', played: false }).play, false);
  assert.equal(s({ trigger: 'first', hidden: true }).play, false);
  assert.equal(s({ trigger: 'first', reduced: true }).play, false, 'reduced-motion: кінцевий стан одразу');
  assert.equal(s({ trigger: 'visit', active: false, played: true }).play, false);
  assert.equal(j('shouldAnimateDashboard(null)').play, false);
});

// ---------- охоронні тести ----------
test('SVG лінії боргу: кожен сегмент між фактичними точками — окремий path; розриви не з\'єднуються', () => {
  const sb = ex.buildSandbox({ monthLabelShort: m => m }, ['svgLineChart']);
  const run = data => ex.evalInSandbox(sb, 'svgLineChart(' + JSON.stringify(data) + ',6)');
  const mk = (arr) => arr.map((a, i) => ({ m: '2026-0' + (i + 1), total: a[0], actual: !!a[1] }));
  const svg = run(mk([[1000, 1], [900, 1], [0, 0], [700, 1], [600, 1], [500, 1]]));
  const segs = [...svg.matchAll(/<path data-draw d="([^"]+)"/g)].map(m => m[1]);
  assert.equal(segs.length, 2, 'два сегменти: до і після пропуску');
  segs.forEach(d => assert.equal((d.match(/M/g) || []).length, 1, 'у сегменті один "M"'));
  assert.equal((segs[0].match(/L/g) || []).length, 1);
  assert.equal((segs[1].match(/L/g) || []).length, 2);
  // x кінця першого сегмента < x початку другого (між ними слот без точки)
  const xs = d => [...d.matchAll(/[ML]([\d.]+) /g)].map(m => parseFloat(m[1]));
  assert.ok(Math.max(...xs(segs[0])) < Math.min(...xs(segs[1])));
  // одиночна фактична точка між розривами не дає сегмента (як і раніше), лише коло
  const svg2 = run(mk([[1000, 1], [0, 0], [800, 1], [0, 0], [600, 1], [500, 1]]));
  assert.equal([...svg2.matchAll(/<path data-draw/g)].length, 1);
  assert.equal([...svg2.matchAll(/<circle data-late/g)].length, 4);
});

test('кінцеві значення: data-final ставиться з тієї самої змінної, що й текст fmt(); лічильників ≤ 6', () => {
  const pairs = { 'kpi-income': 'totalIncome', 'kpi-expense': 'totalExpense', 'kpi-savings': 'savings', 'kpi-mandatory': 'mandatory', 'kpi-free': 'freeMoney' };
  Object.entries(pairs).forEach(([id, v]) => {
    assert.ok(SRC.includes(`document.getElementById('${id}').textContent = fmt(${v});`), id + ' текст');
    assert.ok(SRC.includes(`setDashFinal('${id}', ${v})`), id + ' data-final з тієї ж змінної');
  });
  assert.ok(SRC.includes("document.getElementById('kpi-debt').textContent = hasDebtData ? fmt(debtNow.total) : '—';"));
  assert.ok(SRC.includes("setDashFinal('kpi-debt', hasDebtData ? debtNow.total : null)"), '"—" без data-final → не анімується');
  assert.ok(j('DASH_COUNTER_IDS').length <= j('DASH_MAX_COUNTERS'));
});

test('анімація не змінює дані: лічильник пише лише fmt(countStep(...)) і фінальне fmt(data-final); без transform на body/html/nav.tabbar; без блокування дотиків', () => {
  const i = SRC.indexOf('function playDashboard'), k = SRC.indexOf('function renderDashboard(){');
  const code = SRC.slice(i, k);
  assert.match(code, /fmt\(countStep\(c\.from, Number\(c\.el\.dataset\.final\), t\)\)/);
  assert.match(code, /c\.el\.textContent = fmt\(Number\(c\.el\.dataset\.final\)\)/);
  assert.ok(!/pointer-?[Ee]vents/.test(code), 'pointer-events не чіпаємо');
  assert.ok(!/document\.body\.animate|documentElement\.animate|nav\.tabbar[^\n]*animate|\.tabbar[^\n]*\.animate/.test(code));
  assert.ok(!/setTimeout/.test(code), 'жодних штучних затримок: усе в rAF/WAAPI');
  // анімація запускається лише через рішення shouldAnimateDashboard (reduced/hidden/background → без анімації)
  const am = SRC.slice(SRC.indexOf('function dashAfterRender'), SRC.indexOf('function finishDashboard'));
  assert.equal((am.match(/shouldAnimateDashboard\(/g) || []).length, 2);
  assert.match(am, /reduced: motionReduced\(\)/);
  assert.match(am, /if\(!decision\.play\)/);
});

test('рендер: dashAfterRender викликається один раз наприкінці renderDashboard (не на порожньому стані); allowlist рекордера', () => {
  assert.equal((SRC.match(/dashAfterRender\(month\);/g) || []).length, 1);
  ['tab', 'elements', 'counters', 'charts', 'repeat'].forEach(f => assert.match(SRC, new RegExp("DEBUG_EVENT_ALLOWLIST = \\[[\\s\\S]*'" + f + "'")));
  assert.match(SRC, /\.kpi-value, \.ksi-value\{ font-variant-numeric:tabular-nums; \}/);
});
