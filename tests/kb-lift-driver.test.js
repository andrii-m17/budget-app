// KB-12 (Rev 2.32.265): детермінована перевірка закону руху підйому листа (kbSetLift/kbLiftTick) при зміні цілі посеред руху: послідовності зі звіту MT-1107-5492
// (клавіатура 415 → 388 через 40 мс; Face ID 415 → 311). Годинник і rAF керовані тестом (кадр 16,67 мс), код — справжній з index.html.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildSandbox, evalInSandbox } = require('./extract');
function make(){
  const st = { now: 0, raf: [], style: {}, classes: new Set() };
  const ctx = buildSandbox({
    performance: { now: () => st.now },
    requestAnimationFrame: fn => { st.raf.push(fn); return st.raf.length; },
    cancelAnimationFrame: () => { st.raf = []; },
    document: { documentElement: { style: { setProperty: (k, v) => { st.style[k] = v; }, getPropertyValue: k => st.style[k] || '' }, classList: { add: c => st.classes.add(c), remove: c => st.classes.delete(c), contains: c => st.classes.has(c) } }, activeElement: null, body: {} },
    kbSheetCurrentLift: 0, kbScrollAnimActive: false, kbScrollWaiters: [], kbSheetDrawerEl: null,
    isKeyboardField: () => false, kbStartFieldScroll: () => {},
  }, ['kbBezier', 'KB_LIFT_DEFAULT_CURVE', 'kbLiftState', 'kbLiftFinish', 'kbLiftTick', 'kbLiftStop', 'kbSetLift']);
  evalInSandbox(ctx, 'var kbLiftAnim = null, kbLiftRaf = 0, kbLiftActive = false;');
  return { ctx, st };
}
// Програє: events = [{ at: мс, lift }], повертає ряд [t, lift] щокадру до кінця
function replay(events, totalMs){
  const { ctx, st } = make(); const out = []; const FR = 1000 / 60;
  for(let t = 0; t <= totalMs; t += FR){
    st.now = t;
    events.filter(e => e.at <= t && !e.done).forEach(e => { e.done = true; ctx.__l = e.lift; evalInSandbox(ctx, 'kbSetLift(__l)'); });
    const q = st.raf; st.raf = []; q.forEach(fn => fn(t));
    out.push([t, parseFloat(st.style['--sheet-lift'] || '0')]);
  }
  return out;
}
function speeds(series){ const v = []; for(let i = 1; i < series.length; i++) v.push((series[i][1] - series[i - 1][1]) / (series[i][0] - series[i - 1][0])); return v; }
test('KB-12: 415 → 388 через 40 мс — підйом без плато, зворотного кроку й повторного прискорення', () => {
  const s = replay([{ at: 0, lift: 217 }, { at: 40, lift: 196 }], 600);
  const v = speeds(s);
  assert.ok(v.every(x => x >= -1e-6), 'лише в один бік (lift росте)');
  const moving = v.filter((x, i) => Math.abs(s[i + 1][1] - 196) > 3);
  assert.ok(moving.every(x => x > 0.05), 'жодного кадру без руху до кінця: ' + moving.map(x => x.toFixed(2)).join(' '));
  const peakAt = v.indexOf(Math.max(...v));
  for(let i = peakAt + 1; i < v.length; i++) assert.ok(v[i] <= v[i - 1] * 1.03 + 1e-6, 'після піку швидкість не зростає (кадр ' + i + ': ' + v[i - 1].toFixed(3) + ' → ' + v[i].toFixed(3) + ')');
  assert.ok(Math.abs(s[s.length - 1][1] - 196) < 0.2, 'сходиться до нової цілі');
});
test('KB-12: неперервність швидкості в момент зміни цілі — миттєва швидкість до і після відрізняється ≤ 10 %', () => {
  for(const [l1, l2, at] of [[217, 196, 40], [217, 196, 60], [300, 270, 35]]){
    const { ctx, st } = make();
    st.now = 0; ctx.__a = l1; evalInSandbox(ctx, 'kbSetLift(__a)');
    for(let t = 0; t <= at; t += 1000 / 60){ st.now = t; const q = st.raf; st.raf = []; q.forEach(fn => fn(t)); }
    st.now = at;
    const before = evalInSandbox(ctx, 'kbLiftState(performance.now())');
    ctx.__b = l2; evalInSandbox(ctx, 'kbSetLift(__b)');
    const after = evalInSandbox(ctx, 'kbLiftState(performance.now())');
    assert.ok(Math.abs(after.pos - before.pos) < 0.01, 'положення неперервне');
    assert.ok(Math.abs(after.vel - before.vel) / Math.abs(before.vel) <= 0.1, l1 + '→' + l2 + ' на ' + at + ' мс: швидкість до ' + before.vel.toFixed(3) + ', після ' + after.vel.toFixed(3));
  }
});
test('KB-12: Face ID 415 → 311 (ціль у протилежний бік) — один розворот, без кадру без руху і без дрижання', () => {
  const s = replay([{ at: 0, lift: 217 }, { at: 140, lift: 139 }], 700);
  const v = speeds(s);
  let flips = 0; for(let i = 1; i < v.length; i++) if(Math.abs(v[i]) > 1e-3 && Math.abs(v[i - 1]) > 1e-3 && Math.sign(v[i]) !== Math.sign(v[i - 1])) flips++;
  assert.equal(flips, 1, 'рівно один розворот');
  assert.ok(Math.abs(s[s.length - 1][1] - 139) < 0.2, 'сходиться до нової цілі');
  const mid = v.filter((x, i) => Math.abs(s[i + 1][1] - 139) > 3 && Math.abs(x) < 1e-3);
  assert.ok(mid.length <= 1, 'кадрів без руху: ' + mid.length);
});
test('KB-12: без зміни цілі рух іде тією самою кривою cubic-bezier(0.22, 0.9, 0.3, 1) за 280 мс (перша нога не змінена)', () => {
  const s = replay([{ at: 0, lift: 200 }], 400);
  assert.ok(Math.abs(s[s.length - 1][1] - 200) < 0.2);
  const mid = s.find(r => r[0] >= 140)[1]; // за половину часу ease-out вже ≈ 0.9 шляху
  assert.ok(mid > 150 && mid < 200, 'на 140 мс: ' + mid);
});
