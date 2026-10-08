// Rev 2.24.0 (M1) — фундамент руху: чисті функції та охоронні тести CSS (docs/DESIGN_SYSTEM.md, ROADMAP 32.41).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ex = require('./extract');

const NAMES = ['motionDuration', 'tabDirection', 'shouldReleasePress', 'motionIntensityK'];
const CONSTS = ['MOTION_BASE_MS', 'MOTION_REDUCED_MAX_MS', 'TAB_ORDER', 'MOTION_INTENSITY_K'];
function sandbox(){ return ex.buildSandbox({}, CONSTS.concat(NAMES)); }
const j = (ctx, code) => JSON.parse(ex.evalInSandbox(ctx, 'JSON.stringify(' + code + ')'));

test('motionDuration: базові значення, масштабування на k, reduced ≤ 80 мс, невідомий токен → 0', () => {
  const ctx = sandbox();
  assert.equal(j(ctx, "motionDuration('micro',1,false)"), 120);
  assert.equal(j(ctx, "motionDuration('s',1,false)"), 200);
  assert.equal(j(ctx, "motionDuration('m',1,false)"), 320);
  assert.equal(j(ctx, "motionDuration('l',1,false)"), 480);
  assert.equal(j(ctx, "motionDuration('count',1,false)"), 1000); // Rev 2.27.0 (M2.1)
  assert.equal(j(ctx, "motionDuration('chart',1,false)"), 900);
  assert.equal(j(ctx, "motionDuration('bars',1,false)"), 700);
  assert.equal(j(ctx, "motionDuration('card',1,false)"), 420);
  assert.equal(j(ctx, "motionDuration('s',0.6,false)"), 120);
  assert.equal(j(ctx, "motionDuration('s',1.35,false)"), 270);
  ['micro', 's', 'm', 'l', 'count', 'chart', 'bars', 'card'].forEach(t => {
    [0.6, 1, 1.35].forEach(k => assert.ok(j(ctx, `motionDuration('${t}',${k},true)`) <= 80, t + ' reduced'));
  });
  assert.equal(j(ctx, "motionDuration('zzz',1,false)"), 0);
  assert.equal(j(ctx, "motionDuration('s',-3,false)"), 200, 'хибний k → 1');
  assert.equal(j(ctx, "motionDuration('s',undefined,false)"), 200);
});

test('tabDirection: усі пари вкладок за порядком таббару; та сама/невідома → 0', () => {
  const ctx = sandbox();
  const order = j(ctx, 'TAB_ORDER');
  assert.deepEqual(order, ['analytics', 'accounting', 'vytraty', 'structure', 'service']);
  order.forEach((a, i) => order.forEach((b, n) => {
    const want = i === n ? 0 : (n > i ? 1 : -1);
    assert.equal(j(ctx, `tabDirection('${a}','${b}')`), want, a + '→' + b);
  }));
  assert.equal(j(ctx, "tabDirection('x','analytics')"), 0);
  assert.equal(j(ctx, "tabDirection('analytics','x')"), 0);
  assert.equal(j(ctx, "tabDirection('b','a',['a','b'])"), -1, 'власний порядок');
});

test('shouldReleasePress: не раніше мінімальної тривалості', () => {
  const ctx = sandbox();
  assert.equal(j(ctx, 'shouldReleasePress(1000,1079,80)'), false);
  assert.equal(j(ctx, 'shouldReleasePress(1000,1080,80)'), true);
  assert.equal(j(ctx, 'shouldReleasePress(1000,1500,80)'), true);
  assert.equal(j(ctx, 'shouldReleasePress(1000,1000,0)'), true);
});

test('motionIntensityK: calm/standard/bold; невідомий ключ і прототипні імена → 1', () => {
  const ctx = sandbox();
  assert.equal(j(ctx, "motionIntensityK('calm')"), 0.6);
  assert.equal(j(ctx, "motionIntensityK('standard')"), 1);
  assert.equal(j(ctx, "motionIntensityK('bold')"), 1.35);
  assert.equal(j(ctx, "motionIntensityK('zzz')"), 1);
  assert.equal(j(ctx, "motionIntensityK('constructor')"), 1);
});

// ---------- охоронні тести CSS ----------
const SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const CSS = [...SRC.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m => m[1]).join('\n').replace(/\/\*[\s\S]*?\*\//g, '');
const BANNED = ['width', 'height', 'top', 'left', 'right', 'bottom', 'margin', 'padding', 'box-shadow', 'filter', 'backdrop-filter', 'grid-template-columns', 'background-position'];
// ЯВНИЙ перелік винятків: селектор → властивості, що дозволені в transition попри список вище. Порожній — виняткових випадків немає.
const EXCEPTIONS = {};
function transitionRules(){
  const out = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while((m = re.exec(CSS))){
    const decls = m[2];
    const t = /(?:^|;|\s)transition\s*:\s*([^;]+)/.exec(decls);
    const tp = /(?:^|;|\s)transition-property\s*:\s*([^;]+)/.exec(decls);
    if(t) out.push({ sel: m[1].trim(), value: t[1], kind: 'transition' });
    if(tp) out.push({ sel: m[1].trim(), value: tp[1], kind: 'transition-property' });
  }
  return out;
}
function propsOf(rule){
  // розбір списку "prop dur easing, prop dur easing" без розриву cubic-bezier(a,b,c,d)/var(...)
  const parts = []; let depth = 0, cur = '';
  for(const ch of rule.value){
    if(ch === '(') depth++; if(ch === ')') depth--;
    if(ch === ',' && depth === 0){ parts.push(cur); cur = ''; } else cur += ch;
  }
  parts.push(cur);
  return parts.map(p => p.trim().split(/\s+/)[0]).filter(Boolean);
}
test('CSS: жоден transition не анімує дорогі властивості (перелік винятків явний), transition:all немає', () => {
  const rules = transitionRules();
  assert.ok(rules.length > 20, 'правил transition знайдено: ' + rules.length);
  const bad = [];
  rules.forEach(r => {
    propsOf(r).forEach(p => {
      if(p === 'all') bad.push(r.sel + ' → transition: all');
      if(BANNED.includes(p) && !(EXCEPTIONS[r.sel] || []).includes(p)) bad.push(r.sel + ' → ' + p);
    });
  });
  assert.deepEqual(bad, []);
});
test('CSS: жоден @keyframes не анімує background-position/дорогі властивості', () => {
  const kf = [...CSS.matchAll(/@keyframes\s+([\w-]+)\s*\{((?:[^{}]*\{[^{}]*\})*)\s*\}/g)];
  assert.ok(kf.length >= 8);
  const bad = [];
  kf.forEach(m => BANNED.forEach(p => { if(new RegExp('(^|[{;\\s])' + p + '\\s*:').test(m[2])) bad.push(m[1] + ' → ' + p); }));
  assert.deepEqual(bad, []);
});
test('CSS: є блок prefers-reduced-motion; шторки (.drawer) з нього виключені; токени руху на :root', () => {
  assert.match(CSS, /@media \(prefers-reduced-motion: reduce\)/);
  const block = CSS.slice(CSS.indexOf('@media (prefers-reduced-motion: reduce)'));
  assert.match(block, /:not\(\.drawer\)/);
  ['--motion-k', '--motion-micro', '--motion-s', '--motion-m', '--motion-l', '--motion-count', '--ease-standard', '--ease-out', '--ease-spring'].forEach(v => assert.ok(CSS.includes(v + ':'), v));
});
test('JS: перехід вкладок не вішає transform на body/html/nav.tabbar; motion-perf у білому списку рекордера', () => {
  const i = SRC.indexOf('function beginTabTransition'), k = SRC.indexOf('// --- Реакція на натискання');
  const code = SRC.slice(i, k);
  assert.ok(!/document\.body\.animate|documentElement\.animate|tabbar[^\n]*\.animate/.test(code));
  assert.match(code, /getElementById\('view-'/);
  ['kind', 'intensity', 'reduced', 'holdMs', 'pressLeak', 'frames', 'maxGapMs', 'durationMs', 'from', 'to'].forEach(f => assert.match(SRC, new RegExp("DEBUG_EVENT_ALLOWLIST = \\[[\\s\\S]*'" + f + "'")));
});
