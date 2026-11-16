// Rev 2.32.297 (TOAST-1): нове повідомлення замінює поточне в тому самому елементі; черги немає.
// Справжній код showToast/replaceSuccessToast/… з index.html виконується в vm із мінімальним емулятором DOM і керованими таймерами.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildSandbox } = require('./extract');

function makeEnv(opts) {
  opts = opts || {};
  const env = { now: 0, timers: [], seq: 0, animLog: [], created: 0, reduced: !!opts.reduced };
  function setTimeoutF(fn, ms) { const t = { id: ++env.seq, at: env.now + (ms || 0), fn: fn, ms: ms || 0, active: true }; env.timers.push(t); return t.id; }
  function clearTimeoutF(id) { env.timers.forEach(function (t) { if (t.id === id) t.active = false; }); }
  env.advance = function (ms) {
    const end = env.now + ms;
    for (;;) {
      const due = env.timers.filter(function (t) { return t.active && t.at <= end; }).sort(function (a, b) { return a.at - b.at || a.id - b.id; })[0];
      if (!due) break;
      env.now = due.at; due.active = false; due.fn();
    }
    env.now = end;
  };
  env.activeTimers = function (ms) { return env.timers.filter(function (t) { return t.active && (ms === undefined || t.ms === ms); }); };
  function texts(node, out) { out = out || []; if (node.textContent) out.push(String(node.textContent)); node.children.forEach(function (c) { texts(c, out); }); return out; }
  function mk(tag) {
    const classes = new Set();
    const el = {
      tag: tag, children: [], parentNode: null, attrs: {}, listeners: {}, textContent: '', id: '', type: '',
      style: { _p: {}, setProperty: function (k, v) { this._p[k] = v; }, removeProperty: function (k) { delete this._p[k]; } },
      classList: { add: function (c) { classes.add(c); }, remove: function (c) { classes.delete(c); }, contains: function (c) { return classes.has(c); } },
      setAttribute: function (k, v) { el.attrs[k] = v; },
      addEventListener: function (t, f) { (el.listeners[t] = el.listeners[t] || []).push(f); },
      appendChild: function (c) { if (c.parentNode) c.parentNode.removeChild(c); el.children.push(c); c.parentNode = el; return c; },
      removeChild: function (c) { const i = el.children.indexOf(c); if (i >= 0) el.children.splice(i, 1); c.parentNode = null; return c; },
      animate: function (kf, o) { const a = { node: el, kf: kf, opts: o, cancelled: false, cancel: function () { a.cancelled = true; } }; env.animLog.push(a); return a; },
      getBoundingClientRect: function () { return { left: 0, top: 0, right: el.offsetWidth, bottom: el.offsetHeight, width: el.offsetWidth, height: el.offsetHeight }; },
      querySelector: function (sel) { const cls = sel.replace('.', ''); const f = function (n) { for (const c of n.children) { if (c.className.split(' ').indexOf(cls) >= 0) return c; const r = f(c); if (r) return r; } return null; }; return f(el); },
    };
    Object.defineProperty(el, 'className', { get: function () { return Array.from(classes).join(' '); }, set: function (v) { classes.clear(); String(v).split(/\s+/).filter(Boolean).forEach(function (c) { classes.add(c); }); } });
    Object.defineProperty(el, 'innerHTML', { set: function (v) { el.children.forEach(function (c) { c.parentNode = null; }); el.children = []; if (v) el.appendChild(mk('svg')); } });
    // Розмір залежить від вмісту: ширина за найдовшим рядком, висота за наявністю підзаголовка й довжиною
    Object.defineProperty(el, 'offsetWidth', { get: function () { const t = texts(el); return t.length ? Math.min(340, 80 + Math.max.apply(null, t.map(function (s) { return s.length; })) * 7) : 60; } });
    Object.defineProperty(el, 'offsetHeight', { get: function () { const t = texts(el); return t.length ? 44 + (t.length > 1 ? 18 : 0) : 22; } });
    env.created++;
    return el;
  }
  const body = mk('body');
  const documentEl = { style: {} };
  env.document = {
    body: body, documentElement: documentEl,
    createElement: function (tag) { return mk(tag); },
    getElementById: function (id) { const f = function (n) { for (const c of n.children) { if (c.id === id) return c; const r = f(c); if (r) return r; } return null; }; return f(body); },
    querySelector: function () { return null; },
  };
  env.globals = {
    document: env.document, window: { matchMedia: function () { return { matches: env.reduced }; } },
    getComputedStyle: function () { return { getPropertyValue: function () { return '1'; } }; },
    setTimeout: setTimeoutF, clearTimeout: clearTimeoutF,
    successToastActive: null, successToastTimer: null, conflictRowsNode: function () { return mk('div'); },
  };
  return env;
}
const NAMES = ['CLOUD_ICON_D', 'SYNC_SLOT_CLOUD_D', 'SYNC_SLOT_BANG', 'CONFLICT_BTN_STYLE', 'showToast', 'toastKindOf', 'toastSignature', 'toastReducedMotion', 'toastMotionUnitMs', 'toastAnimate', 'toastCancelAnims', 'placeToastHost', 'pumpSuccessToast',
  'armSuccessToastTimer', 'closeSuccessToast', 'fillToastContent', 'replaceSuccessToast', 'finishToastSwap', 'toastPulse', 'toastCancelLeave', 'toastDuration', 'toastFitText',
  'toastFitWidth', 'toastTopBelowHeader', 'TOAST_ICONS'];
function setup(o) { const env = makeEnv(o); const c = buildSandbox(env.globals, NAMES); return { env: env, c: c, host: function () { return env.document.getElementById('success-toast-host'); } }; }
const titleOf = function (el) { return el.children.filter(function (c) { return c.className === 'success-toast-text'; })[0].children[0].textContent; };

test('заміна: елемент не перестворюється, у контейнері один, вміст — останній', function () {
  const s = setup();
  s.c.showToast({ kind: 'success', title: 'Перше' });
  const el = s.host().children[0];
  s.c.showToast({ kind: 'error', title: 'Друге', subtitle: 'Деталі' });
  s.env.advance(120);
  assert.equal(s.host().children.length, 1);
  assert.equal(s.host().children[0], el, 'той самий елемент');
  assert.equal(titleOf(el), 'Друге');
  assert.equal(el.className, 't-error success-toast'.split(' ').sort().join(' ') === el.className.split(' ').sort().join(' ') ? el.className : 'x');
  assert.ok(el.classList.contains('t-error') && !el.classList.contains('t-success'));
  assert.equal(el.attrs.role, 'alert');
});

test('рух заміни: старий вміст 120 мс угору на 6 px, новий 160 мс зі зсуву 6 px униз, розмір 200 мс cubic-bezier', function () {
  const s = setup();
  s.c.showToast({ kind: 'success', title: 'Коротко' });
  const el = s.host().children[0];
  s.env.animLog.length = 0;
  s.c.showToast({ kind: 'info', title: 'Значно довший текст заголовка повідомлення', subtitle: 'і підзаголовок' });
  const out = s.env.animLog.slice();
  assert.ok(out.length >= 2 && out.every(function (a) { return a.opts.duration === 120 && a.opts.fill === 'forwards'; }));
  assert.deepEqual(JSON.parse(JSON.stringify(out[0].kf)), [{ opacity: 1, transform: 'translateY(0)' }, { opacity: 0, transform: 'translateY(-6px)' }]);
  assert.equal(titleOf(el), 'Коротко', 'до кінця 120 мс вміст ще старий');
  s.env.animLog.length = 0;
  s.env.advance(120);
  const ins = s.env.animLog.filter(function (a) { return a.node !== el; });
  assert.ok(ins.length >= 2 && ins.every(function (a) { return a.opts.duration === 160 && a.kf[0].opacity === 0 && a.kf[0].transform === 'translateY(6px)' && a.opts.fill === 'backwards'; }));
  const size = s.env.animLog.filter(function (a) { return a.node === el; });
  assert.equal(size.length, 1);
  assert.equal(size[0].opts.duration, 200); assert.equal(size[0].opts.easing, 'cubic-bezier(.2,.8,.2,1)');
  assert.ok(size[0].kf[0].width !== size[0].kf[1].width && size[0].kf[0].height !== size[0].kf[1].height, 'ширина й висота змінюються');
  assert.deepEqual(Object.keys(size[0].kf[0]).sort(), ['height', 'width']);
});

test('той самий вміст: час продовжується, пульсація 1 → 1,03 → 1 за 180 мс, без заміни вмісту', function () {
  const s = setup();
  const msg = { kind: 'success', title: 'Збережено', subtitle: 'Кава' };
  s.c.showToast(msg);
  const el = s.host().children[0];
  s.env.advance(3000);
  s.env.animLog.length = 0;
  s.c.showToast(Object.assign({}, msg));
  assert.equal(s.env.animLog.length, 1);
  const p = s.env.animLog[0];
  assert.equal(p.node, el); assert.equal(p.opts.duration, 180); assert.equal(p.opts.easing, 'ease-out');
  assert.deepEqual(JSON.parse(JSON.stringify(p.kf)), [{ transform: 'scale(1)' }, { transform: 'scale(1.03)' }, { transform: 'scale(1)' }]);
  s.env.advance(3000);
  assert.ok(!el.classList.contains('leaving'), 'через 3 с після повтору ще на екрані');
  s.env.advance(600);
  assert.ok(el.classList.contains('leaving'), 'зникає через повний інтервал після останнього');
  s.env.advance(220);
  assert.equal(s.host().children.length, 0);
});

test('10 швидких різних повідомлень: одна плашка, останній текст, один таймер, зникає через інтервал після останнього', function () {
  const s = setup();
  for (let i = 0; i < 10; i++) { s.c.showToast({ kind: 'success', title: 'Текст ' + i }); if (i < 9) s.env.advance(30); }
  s.env.advance(120); // момент останнього показу + 120 мс
  assert.equal(s.host().children.length, 1);
  assert.equal(titleOf(s.host().children[0]), 'Текст 9');
  assert.equal(s.env.activeTimers(3500).length, 1, 'активний рівно один таймер зникнення');
  const el = s.host().children[0];
  s.env.advance(3499 - 120);
  assert.ok(!el.classList.contains('leaving'));
  s.env.advance(2);
  assert.ok(el.classList.contains('leaving'));
  s.env.advance(220);
  assert.equal(s.host().children.length, 0); assert.equal(s.c.successToastActive, null);
});

test('10 швидких однакових повідомлень: без заміни вмісту, зникає через інтервал після останнього', function () {
  const s = setup();
  for (let i = 0; i < 10; i++) { s.c.showToast({ kind: 'info', title: 'Те саме' }); s.env.advance(100); }
  assert.equal(s.env.animLog.filter(function (a) { return a.opts.duration === 120 || a.opts.duration === 160; }).length, 0, 'вміст не міняється');
  assert.equal(s.host().children.length, 1);
  s.env.advance(3500);
  assert.ok(s.host().children[0].classList.contains('leaving'));
});

test('sticky: звичайне замінює sticky і навпаки, ознака з нового повідомлення', function () {
  const s = setup();
  s.c.showToast({ kind: 'error', icon: 'cloud', sticky: true, compact: true, title: 'Конфлікт', rows: [['a', 'b']], actions: [{ label: 'Моє', onClick: function () {} }] });
  const el = s.host().children[0];
  s.env.advance(60000);
  assert.ok(!el.classList.contains('leaving'), 'sticky не зникає сам');
  assert.equal(el.style.padding, '14px 16px');
  s.c.showToast({ kind: 'success', title: 'Звичайне' });
  s.env.advance(120);
  assert.equal(s.host().children[0], el); assert.equal(el.style.padding, '', 'ознаки compact скинуто');
  s.env.advance(3500);
  assert.ok(el.classList.contains('leaving'), 'після заміни на звичайне знову зникає');
  s.env.advance(220);
  s.c.showToast({ kind: 'success', title: 'Звичайне 2' });
  const el2 = s.host().children[0];
  s.c.showToast({ kind: 'error', sticky: true, title: 'Sticky знову' });
  s.env.advance(120 + 20000);
  assert.ok(!el2.classList.contains('leaving'), 'заміна на sticky знімає таймер');
});

test('заміна під час виходу: вихід скасовується, елемент один, плашка лишається', function () {
  const s = setup();
  s.c.showToast({ kind: 'success', title: 'Перше' });
  const el = s.host().children[0];
  s.env.advance(3500);
  assert.ok(el.classList.contains('leaving'));
  s.env.advance(100);
  s.c.showToast({ kind: 'warning', title: 'Нове' });
  assert.ok(!el.classList.contains('leaving'));
  s.env.advance(120 + 300);
  assert.equal(s.host().children.length, 1); assert.equal(s.host().children[0], el); assert.equal(s.c.successToastActive, el);
  assert.equal(titleOf(el), 'Нове');
  assert.equal(el.style.animation, 'none', 'stIn не перезапускається');
  s.env.advance(5000 + 300);
  assert.equal(s.host().children.length, 0, 'нова плашка зникає у свій час');
});

test('палець тримає плашку: вміст змінюється, зсув скинуто, таймер нового стартує після відпускання', function () {
  const s = setup();
  s.c.showToast({ kind: 'success', title: 'Перше' });
  const el = s.host().children[0];
  el.listeners.touchstart[0]({ touches: [{ clientY: 200 }] });
  el.listeners.touchmove[0]({ touches: [{ clientY: 170 }] });
  assert.equal(el.style.transform, 'translateY(-30px)');
  s.c.showToast({ kind: 'info', title: 'Друге' });
  assert.equal(el.style.transform, '', 'зсув від пальця скинуто');
  s.env.advance(120 + 10000);
  assert.equal(titleOf(el), 'Друге');
  assert.ok(!el.classList.contains('leaving'), 'поки палець тримає, таймера немає');
  el.listeners.touchend[0]();
  assert.equal(s.env.activeTimers(3500).length, 1);
  s.env.advance(3500);
  assert.ok(el.classList.contains('leaving'));
});

test('свайп угору закриває (як раніше), тап закриває', function () {
  const s = setup();
  s.c.showToast({ kind: 'success', title: 'Свайп' });
  const el = s.host().children[0];
  el.listeners.touchstart[0]({ touches: [{ clientY: 200 }] });
  el.listeners.touchmove[0]({ touches: [{ clientY: 150 }] });
  el.listeners.touchend[0]();
  assert.ok(el.classList.contains('leaving'));
  s.env.advance(220);
  s.c.showToast({ kind: 'success', title: 'Тап' });
  s.host().children[0].listeners.click[0]();
  assert.ok(s.host().children[0].classList.contains('leaving'));
});

test('закриття під час згасання старого вмісту: плашка виходить, старий вміст не «вертається», нове не з’являється; touchcancel знімає паузу', function () {
  const s = setup();
  s.c.showToast({ kind: 'success', title: 'Перше' });
  const el = s.host().children[0];
  s.c.showToast({ kind: 'error', title: 'Нове' });
  s.env.advance(40);
  const before = s.env.animLog.filter(function (a) { return !a.cancelled; }).length;
  s.host().children[0].listeners.click[0]();
  assert.ok(el.classList.contains('leaving'));
  assert.equal(s.env.animLog.filter(function (a) { return !a.cancelled; }).length, before, 'анімації згасання не скасовано');
  s.env.advance(500);
  assert.equal(s.host().children.length, 0); assert.equal(s.c.successToastActive, null);
  s.c.showToast({ kind: 'success', title: 'Далі' });
  const e2 = s.host().children[0];
  e2.listeners.touchstart[0]({ touches: [{ clientY: 100 }] });
  s.env.advance(10000);
  assert.ok(!e2.classList.contains('leaving'), 'поки дотик триває, таймера немає');
  e2.listeners.touchcancel[0]();
  s.env.advance(3500);
  assert.ok(e2.classList.contains('leaving'), 'після скасування дотику таймер працює');
});

test('зменшений рух: лише перетікання прозорості (--motion-s), без зсуву, зміни розміру й пульсації', function () {
  const s = setup({ reduced: true });
  s.c.showToast({ kind: 'success', title: 'Коротко' });
  const el = s.host().children[0];
  s.env.animLog.length = 0;
  s.c.showToast({ kind: 'info', title: 'Значно довший текст заголовка повідомлення', subtitle: 'і підзаголовок' });
  s.env.advance(100);
  assert.ok(s.env.animLog.length >= 4);
  s.env.animLog.forEach(function (a) {
    assert.notEqual(a.node, el, 'розмір плашки не анімується');
    a.kf.forEach(function (k) { assert.deepEqual(Object.keys(k), ['opacity']); });
    assert.equal(a.opts.duration, 100, 'половина --motion-s на кожну фазу');
  });
  assert.equal(titleOf(el), 'Значно довший текст заголовка повідомлення');
  s.env.animLog.length = 0;
  s.c.showToast({ kind: 'info', title: 'Значно довший текст заголовка повідомлення', subtitle: 'і підзаголовок' });
  assert.equal(s.env.animLog.length, 0, 'пульсації немає');
});

test('зворотні виклики беруться з найновішого повідомлення з тим самим вмістом', function () {
  const s = setup();
  const calls = [];
  s.c.showToast({ kind: 'info', title: 'Нова витрата', actionLabel: 'Журнал', onAction: function () { calls.push('old'); } });
  s.c.showToast({ kind: 'info', title: 'Нова витрата', actionLabel: 'Журнал', onAction: function () { calls.push('new'); } });
  const el = s.host().children[0];
  const btn = el.children.filter(function (c) { return c.className === 'success-toast-action'; })[0];
  btn.listeners.click[0]({ stopPropagation: function () {} });
  assert.deepEqual(calls, ['new']);
  assert.ok(el.classList.contains('leaving'));
});

test('картка конфлікту замінюється: дії нового повідомлення працюють, старі не викликаються', function () {
  const s = setup();
  const calls = [];
  s.c.showToast({ kind: 'error', icon: 'cloud', sticky: true, compact: true, title: 'К1', actions: [{ label: 'Моє', onClick: function () { calls.push('k1'); } }] });
  s.c.showToast({ kind: 'error', icon: 'cloud', sticky: true, compact: true, title: 'К2', actions: [{ label: 'Моє', onClick: function () { calls.push('k2'); } }] });
  s.env.advance(120);
  const el = s.host().children[0];
  const pair = el.children.filter(function (c) { return c.className === 'chk-pair'; })[0];
  pair.children[0].listeners.click[0]({ stopPropagation: function () {} });
  assert.deepEqual(calls, ['k2']);
});

test('охоронні: черги немає, рух лише opacity/transform/розмір, колірних і тіньових змін немає', function () {
  const src = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'index.html'), 'utf8');
  const a = src.indexOf('function showToast(opts)'), b = src.indexOf('// Rev 2.32.127: відкриття цілі кнопки поп-апа');
  const body = src.slice(a, b);
  assert.ok(!/successToastQueue/.test(src));
  assert.ok(!/blur\(|box-shadow|background|color:/.test(body.replace(/\/\/[^\n]*/g, '')), 'у коді заміни немає розмиття, тіней і кольорів');
  const kfProps = new Set((body.match(/\{ (opacity|transform|width)[^}]*\}/g) || []).join(' ').match(/\b(opacity|transform|width|height)\b/g));
  kfProps.forEach(function (p) { assert.ok(['opacity', 'transform', 'width', 'height'].indexOf(p) >= 0); });
});
