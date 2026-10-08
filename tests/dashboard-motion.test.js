// Rev 2.25.0 (M2) / Rev 2.27.0 (M2.1) — дашборди «оживають»: чисті функції й охоронні тести (ROADMAP 32.43, 32.45).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ex = require('./extract');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const NAMES = ['chartsBelowFold', 'revealDecision', 'shouldDeferChart', 'motionDuration', 'staggerDelay', 'countStep', 'chartSignature', 'cardRevealTiming', 'chartDuration', 'bezierEase', 'shouldReplaceChart', 'dashboardQueueSize', 'dashboardReplayMode'];
const CONSTS = ['CHART_REVEAL_DWELL_MS', 'CHART_REVEAL_RATIO', 'MOTION_BASE_MS', 'MOTION_REDUCED_MAX_MS', 'DASH_MAX_QUEUE', 'DASH_STAGGER_MS', 'DASH_MAX_COUNTERS', 'DASH_MAX_TOTAL_MS', 'DASH_COUNTER_IDS', 'CARD_REVEAL_TABLE', 'DASH_REPLAY_SCALE', 'DASH_UPDATE_SCALE'];
const ctx = ex.buildSandbox({}, CONSTS.concat(NAMES));
const j = code => JSON.parse(ex.evalInSandbox(ctx, 'JSON.stringify(' + code + ')'));
const MODULE = SRC.slice(SRC.indexOf('// ===== Rev 2.25.0 (M2) / Rev 2.27.0 (M2.1)'), SRC.indexOf('// ===== Rev 2.29.0 (A) — поява «Обліку»')); // лише «Аналітика»; «Облік» — tests/account-motion.test.js

test('staggerDelay: крок × k, обмежено розміром черги; власний крок; хибні вхідні → безпечно', () => {
  assert.equal(j('staggerDelay(0,1,8)'), 0);
  assert.equal(j('staggerDelay(3,1,8)'), 120);
  assert.equal(j('staggerDelay(20,1,8)'), 280, 'не далі за max-1');
  assert.equal(j('staggerDelay(3,1.35,8)'), 162);
  assert.equal(j('staggerDelay(4,1,12,30)'), 120, 'стовпчики 30 мс');
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
      const v = j(`countStep(${from},${to},${i / 200})`);
      assert.ok(Number.isInteger(v));
      if(to >= from){ assert.ok(v >= prev && v >= from && v <= to); } else { assert.ok(v <= prev && v <= from && v >= to); }
      prev = v;
    }
  });
});

test('chartSignature: той самий підпис для тих самих даних (округлення), рядки-місяці враховуються', () => {
  assert.equal(j('chartSignature([[100,200.2],[300,400]])'), j('chartSignature([[100.4,200],[300.1,400.3]])'));
  assert.notEqual(j('chartSignature([["2026-09",1,2]])'), j('chartSignature([["2026-10",1,2]])'), 'інший місяць — інший підпис');
  assert.notEqual(j('chartSignature([[1,1],[2,0]])'), j('chartSignature([[1,1],[2,1]])'));
});

test('shouldReplaceChart: той самий підпис вузол НЕ замінює; нема підпису/змінився — замінює', () => {
  assert.equal(j("shouldReplaceChart('[1,2]','[1,2]')"), false);
  assert.equal(j("shouldReplaceChart('[1,2]','[1,3]')"), true);
  assert.equal(j('shouldReplaceChart(undefined,"[1]")'), true);
  assert.equal(j('shouldReplaceChart(null,"[1]")'), true);
});

test('cardRevealTiming: таблиця варіантів × k; невідомий ключ → стандартний; значення в межах', () => {
  const T = (v, k) => j(`cardRevealTiming(${JSON.stringify(v)},${k})`);
  assert.deepEqual(T('fast', 1), { duration: 260, stagger: 25 });
  assert.deepEqual(T('standard', 1), { duration: 420, stagger: 40 });
  assert.deepEqual(T('slow', 1), { duration: 650, stagger: 60 });
  assert.deepEqual(T('veryslow', 1), { duration: 900, stagger: 80 });
  assert.deepEqual(T('zzz', 1), { duration: 420, stagger: 40 });
  assert.deepEqual(T('constructor', 1), { duration: 420, stagger: 40 });
  assert.deepEqual(T('slow', 1.35), { duration: 878, stagger: 81 });
  assert.deepEqual(T('fast', 0.6), { duration: 156, stagger: 15 });
  ['fast', 'standard', 'slow', 'veryslow'].forEach(v => [0.6, 1, 1.35].forEach(k => {
    const t = T(v, k); assert.ok(t.duration >= 100 && t.duration <= 1300 && t.stagger >= 10 && t.stagger <= 110, v + k);
  }));
});

test('chartDuration: лінії/кільце 900, стовпчики 700 (× k); reduced ≤ 80', () => {
  assert.equal(j("chartDuration('lines',1,false)"), 900);
  assert.equal(j("chartDuration('ring',1,false)"), 900);
  assert.equal(j("chartDuration('bars',1,false)"), 700);
  assert.equal(j("chartDuration('lines',1.35,false)"), 1215);
  assert.ok(j("chartDuration('lines',1,true)") <= 80 && j("chartDuration('bars',1,true)") <= 80);
});

test('bezierEase(.22,1,.36,1): 0→0, 1→1, монотонна, швидкий старт (ease-out)', () => {
  assert.equal(j('bezierEase(0)'), 0);
  assert.equal(j('bezierEase(1)'), 1);
  let prev = 0;
  for(let i = 1; i <= 100; i++){ const v = j(`bezierEase(${i / 100})`); assert.ok(v >= prev - 1e-9 && v <= 1 + 1e-9); prev = v; }
  assert.ok(j('bezierEase(0.2)') > 0.5, 'ease-out: за 20% часу пройдено більше половини');
});

test('dashboardQueueSize: ≤8 і сумарно в бюджеті для всіх варіантів card-reveal і k', () => {
  ['fast', 'standard', 'slow', 'veryslow'].forEach(v => [0.6, 1, 1.35].forEach(k => {
    const timing = j(`cardRevealTiming('${v}',${k})`);
    for(let count = 0; count <= 12; count++){
      const n = j(`dashboardQueueSize(${count},${JSON.stringify(timing)},8,2200)`);
      assert.ok(n <= 8 && n <= count);
      if(n > 1) assert.ok((n - 1) * timing.stagger + timing.duration <= 2200, `${v} k=${k} n=${n}`);
    }
  }));
  assert.equal(j('dashboardQueueSize(8,cardRevealTiming("standard",1),8,2200)'), 8);
  assert.equal(j('dashboardQueueSize(8,cardRevealTiming("veryslow",1.35),8,2200)') <= 8, true);
});

test('dashboardReplayMode (M4c: «Щоразу» — єдина поведінка): візит → replay завжди; перший показ/місяць — full; update лише при зміні; фон — none; reduced/hidden — none з причиною', () => {
  const base = { hidden: false, reduced: false, active: true, played: true, sameMonth: true, changed: false };
  const m = o => j('dashboardReplayMode(' + JSON.stringify(Object.assign({}, base, o)) + ')');
  assert.deepEqual(m({ trigger: 'visit' }), { mode: 'replay', skipped: null });
  assert.deepEqual(m({ trigger: 'visit', changed: true }), { mode: 'replay', skipped: null });
  assert.deepEqual(m({ trigger: 'first', played: false }), { mode: 'full', skipped: null });
  assert.deepEqual(m({ trigger: 'visit', played: false }), { mode: 'full', skipped: null });
  assert.deepEqual(m({ trigger: 'month', sameMonth: false }), { mode: 'full', skipped: null });
  assert.deepEqual(m({ trigger: 'visit', sameMonth: false }), { mode: 'full', skipped: null });
  assert.equal(m({ trigger: 'first' }).mode, 'none', 'повторний "first" не буває');
  assert.deepEqual(m({ trigger: 'update', changed: true }), { mode: 'update', skipped: null });
  assert.deepEqual(m({ trigger: 'update', changed: false }), { mode: 'none', skipped: 'no-change' });
  assert.deepEqual(m({ trigger: 'render', changed: true }), { mode: 'none', skipped: 'no-change' });
  assert.deepEqual(m({ trigger: 'visit', reduced: true }), { mode: 'none', skipped: 'reduced' });
  assert.deepEqual(m({ trigger: 'first', played: false, hidden: true }), { mode: 'none', skipped: 'hidden' });
  assert.deepEqual(m({ trigger: 'visit', active: false }), { mode: 'none', skipped: 'hidden' });
  assert.equal(j('dashboardReplayMode(null)').mode, 'none');
});

test('M4c: dashboard-replay завершено — жодних гілок first/changes/variant, запису реєстру і dashVariant(\'dashboard-replay\') у коді', () => {
  const code = SRC.replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, '');
  assert.ok(!/dashboard-replay|replayV|replayVariant|variant === 'first'|variant === 'changes'|none\('variant'\)/.test(code));
  assert.ok(!/id: 'dashboard-replay'/.test(SRC));
});

// ---------- охоронні ----------
test('SVG лінії боргу: кожен сегмент — окремий path (pathLength="1"); розриви не з\'єднуються', () => {
  const sb = ex.buildSandbox({ monthLabelShort: m => m }, ['svgLineChart']);
  const run = data => ex.evalInSandbox(sb, 'svgLineChart(' + JSON.stringify(data) + ',6)');
  const mk = arr => arr.map((a, i) => ({ m: '2026-0' + (i + 1), total: a[0], actual: !!a[1] }));
  const svg = run(mk([[1000, 1], [900, 1], [0, 0], [700, 1], [600, 1], [500, 1]]));
  const segs = [...svg.matchAll(/<path data-draw pathLength="1" d="([^"]+)"/g)].map(m => m[1]);
  assert.equal(segs.length, 2);
  segs.forEach(d => assert.equal((d.match(/M/g) || []).length, 1));
  const xs = d => [...d.matchAll(/[ML]([\d.]+) /g)].map(m => parseFloat(m[1]));
  assert.ok(Math.max(...xs(segs[0])) < Math.min(...xs(segs[1])));
  assert.equal([...run(mk([[1000, 1], [0, 0], [800, 1], [0, 0], [600, 1], [500, 1]])).matchAll(/<path data-draw/g)].length, 1);
});

test('сонячний рендер: data-final з тієї ж змінної, що й текст; лічильників ≤ 6', () => {
  const pairs = { 'kpi-income': 'totalIncome', 'kpi-expense': 'totalExpense', 'kpi-savings': 'savings', 'kpi-mandatory': 'mandatory', 'kpi-free': 'freeMoney' };
  Object.entries(pairs).forEach(([id, v]) => {
    assert.ok(SRC.includes(`document.getElementById('${id}').textContent = fmt(${v});`));
    assert.ok(SRC.includes(`setDashFinal('${id}', ${v})`));
  });
  assert.ok(SRC.includes("setDashFinal('kpi-debt', hasDebtData ? debtNow.total : null)"));
  assert.ok(j('DASH_COUNTER_IDS').length <= j('DASH_MAX_COUNTERS'));
});

test('вузли графіків замінюються лише через setDashChart/clearDashChart/setDonutSvg (за підписом); прямих innerHTML для графіків нема', () => {
  ['spark-income', 'spark-expense', 'spark-savings', 'spark-debt', 'chart-income-expense'].forEach(id => {
    assert.ok(SRC.includes(`setDashChart('${id}'`), id);
    assert.ok(!new RegExp(`getElementById\\('${id}'\\)\\.innerHTML`).test(SRC), id + ' напряму через innerHTML');
  });
  assert.ok(SRC.includes("setDashChart('chart-debt-line'") && SRC.includes("clearDashChart('chart-debt-line'"));
  assert.ok(!/getElementById\('chart-debt-line'\)\.innerHTML/.test(SRC));
  assert.match(SRC, /function setDonutSvg\(sig, html\)\{\s*if\(!shouldReplaceChart\(svg\.dataset\.sig, sig\)/);
  // зміна під час анімації: finish() ДО заміни вузла
  assert.match(MODULE, /function setDashChart[\s\S]*?if\(dashState\.running\)\{ dashState\.updatePending = true; finishDashboard\(\); \}\s*el\.innerHTML = build\(\)/);
});

test('анімація не змінює дані: лічильник пише лише fmt(countStep) і фінальне fmt(data-final); без transform на body/html/nav.tabbar; без блокування дотиків і штучних затримок', () => {
  const i = MODULE.indexOf('function makeDashRunner');
  const code = MODULE.slice(i);
  assert.match(code, /fmt\(countStep\(c\.from, Number\(c\.el\.dataset\.final\), t\)\)/);
  assert.match(code, /c\.el\.textContent = fmt\(Number\(c\.el\.dataset\.final\)\)/);
  assert.ok(!/pointer-?[Ee]vents/.test(code));
  assert.ok(!/document\.body\.animate|documentElement\.animate|nav\.tabbar[^\n]*animate|\.tabbar[^\n]*\.animate/.test(code));
  // setTimeout — лише в короткому «чекаємо, поки зупиниться в області» (CHART_REVEAL_DWELL_MS) і повторі готовності відкладеної картки; не в рішеннях і не в самій хореографії
  assert.ok(!/setTimeout/.test(MODULE.slice(MODULE.indexOf('function dashRun'), MODULE.indexOf('function dashAfterRender'))), 'dashRun без затримок');
  assert.ok(!/setTimeout/.test(MODULE.slice(MODULE.indexOf('function makeDashRunner'), MODULE.indexOf('function onDashCardIntersect'))), 'хореографія без затримок');
  assert.equal((MODULE.match(/setTimeout\(/g) || []).length, 2, 'лише dwell і повтор готовності');
  // початковий стан до малювання кадру: paint(0) синхронно перед стартом циклу
  assert.match(MODULE, /r\.start = function\(\)\{\s*paint\(0\);\s*r\.startedAt/);
});

test('"перший показ" витрачається лише коли анімація стартувала; прихована/невидима сторінка не витрачає його; reduced → кінцевий стан одразу', () => {
  const run = MODULE.slice(MODULE.indexOf('function dashRun'), MODULE.indexOf('function dashAfterRender'));
  assert.match(run, /hidden: !dashStartupReady\(\)/);
  assert.match(run, /reduced: motionReduced\(\)/);
  assert.match(run, /if\(d\.mode === 'none'\)\{[\s\S]*?return;\s*\}\s*playDashboard\(/, 'при none анімація не стартує');
  assert.ok(!/dashState\.played = true/.test(run), 'dashRun сам "played" не ставить');
  assert.match(MODULE, /function dashStartupReady\(\)\{ return document\.visibilityState === 'visible' && document\.readyState === 'complete'; \}/);
  assert.match(MODULE, /window\.addEventListener\('load', dashKick\)/);
  assert.match(MODULE, /visibilitychange', function\(\)\{ if\(document\.visibilityState === 'visible'\) dashKick\(\)/);
  // played ставиться лише у stop() після реального старту та у гілці «нічого анімувати»
  assert.equal((MODULE.match(/dashState\.played = true/g) || []).length, 2);
});

test('фоновий рендер без змін даних не торкається анімації; зміна даних під час анімації → finish → update', () => {
  assert.match(MODULE, /if\(!shouldReplaceChart\(el\.dataset\.sig, sig\) && el\.firstElementChild\) return;/);
  const after = MODULE.slice(MODULE.indexOf('function dashAfterRender'), MODULE.indexOf('function onDashboardVisit'));
  assert.match(after, /if\(dashState\.updatePending\)\{ trigger = 'update'/);
});

test('події: dashboard-enter пише mode/skipped/chartsAnimated/chartsSkipped/pathLenZero/pathLengthAttr/cardVariant; пропуск теж фіксується; allowlist', () => {
  ['mode', 'skipped', 'chartsAnimated', 'chartsSkipped', 'pathLenZero', 'pathLengthAttr', 'cardVariant'].forEach(f => assert.match(SRC, new RegExp("DEBUG_EVENT_ALLOWLIST = \\[[\\s\\S]*'" + f + "'")));
  assert.match(MODULE, /function recordDashSkip\(reason, trigger\)\{\s*recordMotionPerf\(\{ kind: 'dashboard-enter'/);
  assert.match(MODULE, /if\(trigger !== 'render'\) recordDashSkip\(d\.skipped, trigger\)/);
  assert.equal((SRC.match(/dashAfterRender\(month\);/g) || []).length, 1);
  assert.match(SRC, /\.kpi-value, \.ksi-value\{ font-variant-numeric:tabular-nums; \}/);
});

test('реєстр: card-reveal (типовий standard, 4 варіанти) присутній; button-style (M4b) і dashboard-replay (M4c) завершені', () => {
  assert.match(SRC, /id: 'card-reveal'[\s\S]*?defaultVariant: 'standard'/);
  const cr = SRC.slice(SRC.indexOf("id: 'card-reveal'"), SRC.indexOf('];', SRC.indexOf("id: 'card-reveal'")));
  ['fast', 'standard', 'slow', 'veryslow'].forEach(k => assert.ok(cr.includes(`key: '${k}'`)));
  assert.ok(!/id: 'button-style'|glass-vivid/.test(SRC), 'тест button-style прибрано');
});

// ---------- M2.2: відкладене малювання нижче першого екрана ----------
test('chartsBelowFold: лише картки цілком нижче першого екрана (top ≥ висоти вікна); видимі й проскролені — ні', () => {
  const L = o => j('chartsBelowFold(' + JSON.stringify(o) + ')');
  assert.deepEqual(L({ viewportH: 844, cards: [{ id: 0, top: 100, bottom: 300 }, { id: 1, top: 700, bottom: 900 }, { id: 2, top: 844, bottom: 1100 }, { id: 3, top: 1500, bottom: 1800 }, { id: 4, top: -400, bottom: -100 }] }), [2, 3]);
  assert.deepEqual(L({ viewportH: 0, cards: [{ id: 1, top: 5, bottom: 9 }] }), []);
  assert.deepEqual(L(null), []);
  assert.deepEqual(L({ viewportH: 844 }), []);
});

test('revealDecision: draw лише коли ≥25% в області І вистачило часу (dwell); швидке проскакування — wait; вже намальовано/reduced/hidden — skip', () => {
  const R = (e, st) => j('revealDecision(' + JSON.stringify(e) + ',' + JSON.stringify(st) + ')');
  const dwell = j('CHART_REVEAL_DWELL_MS');
  assert.equal(R({ isIntersecting: true, intersectionRatio: 0.5 }, { dwellMs: dwell }), 'draw');
  assert.equal(R({ isIntersecting: true, intersectionRatio: 0.25 }, { dwellMs: dwell + 500 }), 'draw');
  assert.equal(R({ isIntersecting: true, intersectionRatio: 0.5 }, { dwellMs: dwell - 1 }), 'wait', 'швидко проскочила — ще ні');
  assert.equal(R({ isIntersecting: true, intersectionRatio: 0.2 }, { dwellMs: 9999 }), 'wait', 'менше 25%');
  assert.equal(R({ isIntersecting: false, intersectionRatio: 0 }, { dwellMs: 9999 }), 'wait');
  assert.equal(R({ isIntersecting: true, intersectionRatio: 1 }, { dwellMs: 9999, revealed: true }), 'skip', 'раз на візит');
  assert.equal(R({ isIntersecting: true, intersectionRatio: 1 }, { dwellMs: 9999, reduced: true }), 'skip');
  assert.equal(R({ isIntersecting: true, intersectionRatio: 1 }, { dwellMs: 9999, hidden: true }), 'skip');
  assert.equal(j('revealDecision(null,null)'), 'wait');
});

test('shouldDeferChart: лише full/replay, без reduced, і лише з IntersectionObserver (без нього — кінцевий стан одразу)', () => {
  const D = (m, r, o) => j(`shouldDeferChart(${JSON.stringify(m)},${r},${o})`);
  assert.equal(D('full', false, true), true);
  assert.equal(D('replay', false, true), true);
  assert.equal(D('update', false, true), false);
  assert.equal(D('none', false, true), false);
  assert.equal(D('full', true, true), false, 'reduced → кінцевий стан');
  assert.equal(D('full', false, false), false, 'нема IntersectionObserver → кінцевий стан');
});

test('відкладена картка: початковий стан лише opacity+transform (висота не змінюється), IO з порогом 25% і rootMargin -10%, раз на візит', () => {
  const play = MODULE.slice(MODULE.indexOf('function playDashboard'), MODULE.indexOf('function onDashCardIntersect'));
  assert.match(play, /card\.style\.opacity = '0'; card\.style\.transform = 'translateY\('/);
  assert.ok(!/card\.style\.(height|display|visibility|margin|padding|position|top)/.test(MODULE), 'жодних змін розкладки');
  assert.match(play, /rootMargin: '0px 0px -10% 0px', threshold: \[0, CHART_REVEAL_RATIO\]/);
  assert.match(play, /root: document\.getElementById\('main-col'\)/);
  assert.match(play, /if\(mode !== 'update'\)\{ dashClearDeferred\(\)/, 'новий візит/місяць скидає очікування і ставить його знову');
  assert.match(play, /shouldDeferChart\(mode, false, typeof IntersectionObserver === 'function'\)/);
  const reveal = MODULE.slice(MODULE.indexOf('function dashRevealCard'));
  assert.match(reveal, /d\.cards\.delete\(card\);\s*if\(d\.io\) d\.io\.unobserve\(card\)/, 'після малювання спостерігач знімається — раз на візит');
  assert.match(reveal, /card\.style\.removeProperty\('opacity'\)/);
  const clear = MODULE.slice(MODULE.indexOf('function dashClearDeferred'), MODULE.indexOf('function makeDashRunner'));
  assert.match(clear, /d\.io\.disconnect\(\)/);
  assert.match(clear, /card\.style\.removeProperty\('opacity'\); card\.style\.removeProperty\('transform'\)/);
});

test('швидке проскакування не запускає анімацію: таймер dwell скасовується, коли картка вийшла з області', () => {
  const ix = MODULE.slice(MODULE.indexOf('function onDashCardIntersect'), MODULE.indexOf('function dashRevealCard'));
  assert.match(ix, /else if\(!st\.ok && st\.timer\)\{\s*clearTimeout\(st\.timer\); st\.timer = null;/);
  assert.match(ix, /CHART_REVEAL_DWELL_MS/);
  assert.match(MODULE, /function dashRevealCard[\s\S]*?if\(!st \|\| !st\.ok\) return;/);
});

test('події M2.2: chart-reveal пишеться для кожного відкладеного графіка (chart, fromEnterMs, frames, maxGapMs, durationMs); deferredCharts у dashboard-enter; allowlist', () => {
  assert.match(MODULE, /recordMotionPerf\(\{ kind: 'chart-reveal', chart: id, fromEnterMs: enterMs, frames: r\.frames, maxGapMs: Math\.round\(r\.maxGap\), durationMs: Math\.round\(durationMs\)/);
  assert.match(MODULE, /deferredCharts: deferredCharts/);
  ['deferredCharts', 'chart', 'fromEnterMs'].forEach(f => assert.match(SRC, new RegExp("DEBUG_EVENT_ALLOWLIST = \\[[\\s\\S]*'" + f + "'")));
  // нижче першого екрана більше не рахується як chartsSkipped
  assert.ok(!/chartsSkipped\+\+[^\n]*below/.test(MODULE));
});
