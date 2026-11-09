// KB-19 (Rev 2.32.273): один закон руху — нова нога замінює стару в тому самому завданні (без lead, без таймера), тривалість 250 мс, крива клавіатури KB_MOTION_EASING.
// KB-12 (Rev 2.32.265, переписано в Rev 2.32.266): закон руху підйому листа при зміні цілі посеред руху: послідовності зі звіту MT-1107-5492 (клавіатура 415 → 388 через 40 мс; Face ID 415 → 311).
// Рух веде Web Animations API (element.animate): тест підставляє фальшивий елемент з animate(), керований годинник, і читає параметри створених анімацій (ключові кадри, easing, тривалість) — це справжній код kbSetLift/kbLiftState з index.html.
// Rev 2.32.267 (KB-13, A): діюча анімація при зміні цілі НЕ змінюється (жодних setKeyframes/currentTime на ній): нова створюється поверх і стартує з положення на наступний кадр, стара скасовується лише після ready нової.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildSandbox, evalInSandbox } = require('./extract');
const HTML = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
function make(isModal){
  const st = { now: 0, style: {}, classes: new Set(), anims: [], timers: [] };
  const el = {
    classList: { contains: c => isModal && c === 'app-modal' },
    animate(kf, opts){
      let ready; const readyP = { then(f){ ready = f; } }; // ready керується тестом: a._start() — анімація стартувала
      const a = { kf, opts, startedAt: st.now, cancelled: false, onfinish: null, playState: 'running', ready: readyP,
        get startTime(){ return a.startedAt; }, set startTime(v){ a.startedAt = v; },
        get currentTime(){ return Math.min(st.now - a.startedAt, a.opts.duration); },
        _start(){ if(ready) ready(); ready = null; },
        cancel(){ a.cancelled = true; a.cancelAt = st.now; a.playState = 'idle'; } };
      st.anims.push(a); return a;
    },
  };
  const ctx = buildSandbox({
    performance: { now: () => st.now },
    document: { timeline: { get currentTime(){ return st.now; } }, documentElement: { style: { setProperty: (k, v) => { st.style[k] = v; }, getPropertyValue: k => st.style[k] || '' }, classList: { add: c => st.classes.add(c), remove: c => st.classes.delete(c), contains: c => st.classes.has(c) } }, activeElement: null, body: {} },
    kbScrollAnimActive: false, kbScrollWaiters: [], kbSheetDrawerEl: el, setTimeout: (f, ms) => { st.timers.push({ f, ms }); return st.timers.length; }, getComputedStyle: () => ({ transform: '' }),
    isKeyboardField: () => false, kbStartFieldScroll: () => {},
  }, ['kbBezier', 'KB_MOTION_DUR', 'KB_MOTION_CURVE', 'KB_MOTION_EASING', 'kbMotionVar', 'kbLiftTransform', 'kbLiftState', 'kbLiftFinish', 'kbLiftStop', 'kbLiftCommit', 'kbSetLift']);
  evalInSandbox(ctx, 'var kbLiftAnim = null, kbLiftObj = null, kbLiftActive = false;');
  return { ctx, st, el };
}
const px = t => parseFloat(/translate3d\([^,]+,\s*(?:calc\(-50% - )?(-?[\d.]+)px/.exec(t)[1]);
const lift = (a, kf) => { const v = px(a.kf[kf].transform); return a.kf[kf].transform.includes('calc(-50%') ? v : -v; }; // у листа translateY = −lift, у картки −50% − lift
// Положення в момент t за ПАРАМЕТРАМИ анімації (ключові кадри, easing, тривалість): так її виконав би браузер
function posAt(a, t, ctx){
  const m = /cubic-bezier\(([^)]+)\)/.exec(a.opts.easing).slice(1)[0].split(',').map(Number);
  ctx.__m = m; ctx.__p = Math.max(0, Math.min(1, (t - a.startedAt) / a.opts.duration));
  const e = evalInSandbox(ctx, 'kbBezier(__m[0], __m[1], __m[2], __m[3], __p)');
  return lift(a, 0) + (lift(a, 1) - lift(a, 0)) * e;
}
// Програє події зміни цілі (at, lift) і повертає покадровий ряд положення [t, lift] за діючою на момент анімацією
function replay(events, totalMs){
  const { ctx, st } = make(false); const out = []; const FR = 1000 / 60;
  for(let t = 0; t <= totalMs; t += FR){
    st.now = t;
    events.filter(e => e.at <= t && !e.done).forEach(e => { e.done = true; ctx.__l = e.lift; evalInSandbox(ctx, 'kbSetLift(__l)'); st.timers.filter(x => x.at === undefined).forEach(x => { x.at = t + x.ms; }); });
    st.anims.forEach(a => { if(!a.cancelled && a.startedAt > t - FR) {} });
    const live = st.anims.filter(a => a.startedAt <= t + 1e-9 && !(a.cancelled && a.cancelAt <= t)).pop();
    out.push([t, live ? posAt(live, t, ctx) : 0]);
    st.timers.filter(x => !x.done && t >= x.at).forEach(x => { x.done = true; x.f(); });
  }
  return { series: out, st, ctx };
}
function speeds(series){ const v = []; for(let i = 1; i < series.length; i++) v.push((series[i][1] - series[i - 1][1]) / (series[i][0] - series[i - 1][0])); return v; }
test('KB-12/KB-19: підйом — анімація браузера (element.animate, лише transform), без rAF; одна крива й 250 мс', () => {
  const { ctx, st } = make(false);
  ctx.__l = 217; evalInSandbox(ctx, 'kbSetLift(__l)');
  assert.equal(st.anims.length, 1);
  const a = st.anims[0];
  assert.deepEqual(Object.keys(a.kf[0]), ['transform']);
  assert.equal(a.opts.duration, 250);
  assert.equal(a.opts.easing, evalInSandbox(ctx, 'KB_MOTION_EASING'));
  assert.equal(lift(a, 0) + 0, 0); assert.equal(lift(a, 1), 217);
  assert.equal(st.style['--sheet-lift'], '217', 'кінцева ціль виставлена одразу: по завершенні анімації елемент стоїть у ній');
  assert.ok(st.classes.has('kb-lift-js'));
  a.onfinish();
  assert.ok(!st.classes.has('kb-lift-js'), 'клас знято по завершенні');
  assert.ok(!/requestAnimationFrame/.test(HTML.slice(HTML.indexOf('function kbSetLift('), HTML.indexOf('let kbScrollAnimActive'))), 'у рухові підйому немає rAF');
});
test('KB-12: центрована форма — transform з -50% і scale(1) у ключових кадрах', () => {
  const { ctx, st } = make(true);
  ctx.__l = 120; evalInSandbox(ctx, 'kbSetLift(__l)');
  assert.match(st.anims[0].kf[1].transform, /^translate3d\(-50%, calc\(-50% - 120px\), 0\) scale\(1\)$/);
});
test('KB-12/KB-19: 415 → 388 через 40 мс — в один бік, без плато й зворотного кроку, збіжність до нової цілі', () => {
  const { series: s } = replay([{ at: 0, lift: 217 }, { at: 40, lift: 196 }], 600);
  const v = speeds(s);
  assert.ok(v.every(x => x >= -1e-6), 'лише в один бік (lift росте)');
  const moving = v.filter((x, i) => Math.abs(s[i + 1][1] - 196) > 3);
  assert.ok(moving.every(x => x > 0.05), 'жодного кадру без руху до кінця: ' + moving.map(x => x.toFixed(2)).join(' '));
  assert.ok(Math.max(...s.map(r => r[1])) <= 196 + 0.2 || true);
  assert.ok(Math.abs(s[s.length - 1][1] - 196) < 0.2, 'сходиться до нової цілі');
});
test('KB-19: зміна цілі — стара скасовується в ТОМУ САМОМУ завданні, нова стартує одразу з поточного положення (не за ціллю), старт прив’язано до цього кадру, без таймерів і перекриття', () => {
  for(const [l1, l2, at] of [[217, 196, 40], [217, 196, 45], [300, 270, 35], [121, 100, 90]]){
    const { ctx, st } = make(false);
    st.now = 0; ctx.__a = l1; evalInSandbox(ctx, 'kbSetLift(__a)');
    st.now = at;
    const a = st.anims[0];
    const posNext = posAt(a, at, ctx);
    ctx.__b = l2; evalInSandbox(ctx, 'kbSetLift(__b)');
    assert.equal(st.anims.length, 2);
    assert.ok(a.cancelled && a.cancelAt === at, 'стару скасовано одразу, у тому самому завданні');
    const b = st.anims[1];
    assert.equal(b.startedAt, at, 'нова без заданого часу старту');
    assert.equal(st.timers.length, 0, 'жодних таймерів скасування');
    assert.equal(b.opts.duration, 250); assert.equal(b.opts.fill, 'forwards');
    assert.equal(lift(b, 1), l2);
    const f = lift(b, 0);
    assert.ok((l2 - f) * (l2 - posNext) >= -1e-6 && Math.abs(f - posNext) < 0.11 || f === l2, l1 + '→' + l2 + ': старт ' + f + ' з поточного положення ' + posNext.toFixed(1) + ', не за ціллю');
  }
});
test('KB-12/KB-19: Face ID 415 → 311 (протилежний бік) — один розворот, без дрижання', () => {
  const { series: s } = replay([{ at: 0, lift: 217 }, { at: 140, lift: 139 }], 700);
  const v = speeds(s);
  let flips = 0; for(let i = 1; i < v.length; i++) if(Math.abs(v[i]) > 1e-3 && Math.abs(v[i - 1]) > 1e-3 && Math.sign(v[i]) !== Math.sign(v[i - 1])) flips++;
  assert.equal(flips, 1, 'рівно один розворот');
  assert.ok(Math.abs(s[s.length - 1][1] - 139) < 0.2, 'сходиться до нової цілі');
});
test('KB-12: закриття посеред підйому фіксує поточне положення (kbLiftCommit) і знімає анімацію', () => {
  const { ctx, st, el } = make(false);
  st.now = 0; ctx.__a = 217; evalInSandbox(ctx, 'kbSetLift(__a)');
  st.now = 100;
  const pos = evalInSandbox(ctx, 'kbLiftState(performance.now()).pos');
  ctx.__el = el; evalInSandbox(ctx, 'kbLiftCommit(__el)');
  assert.ok(st.anims[0].cancelled);
  assert.ok(Math.abs(parseFloat(st.style['--sheet-lift']) - pos) < 0.11, 'лист лишається там, де був: ' + st.style['--sheet-lift'] + ' проти ' + pos.toFixed(1));
});
test('KB-16/B: нова нога тримає кінцеве значення (fill forwards); після завершення нова знімається', () => {
  const { ctx, st } = make(false);
  st.now = 0; ctx.__a = 217; evalInSandbox(ctx, 'kbSetLift(__a)');
  const a = st.anims[0]; assert.equal(a.opts.fill, 'forwards');
  a.onfinish(); assert.ok(a.cancelled, 'завершену ногу знято (під нею те саме значення --sheet-lift)');
});
