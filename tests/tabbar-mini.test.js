// Rev 2.32.364 (DS-3c): стиснення таббару — пороги макета, пружний відскок, кінець і коротка сторінка, блокування, один слухач, CSS макета
const test = require('node:test');
const assert = require('node:assert');
const { buildSandbox, readAppCss } = require('./extract');
const SRC = require('./extract').readIndexWithCss(), CSS = readAppCss();
const c = buildSandbox({}, ['tabbarMiniNext', 'TABBAR_MINI_STEP', 'TABBAR_MINI_EDGE']);
const n = (o) => c.tabbarMiniNext(Object.assign({ y: 0, max: 2000, lastY: 0, mini: false, blocked: '', user: true }, o));
test('пороги: стиснути — крок вниз > 6 і від верху > 24; крок ≤ 6 не стискає', function(){
  assert.equal(n({ y: 100, lastY: 0 }).mini, true);
  assert.equal(n({ y: 106, lastY: 100 }).mini, false, 'крок рівно 6 — ні');
  assert.equal(n({ y: 107, lastY: 100 }).mini, true, 'крок 7 — так');
  assert.equal(n({ y: 20, lastY: 0 }).mini, false, 'від верху ≤ 24 — ні, навіть при кроці 20');
  assert.equal(n({ y: 24, lastY: 0 }).mini, true); assert.equal(n({ y: 23, lastY: 0 }).mini, false);
});
test('пороги: розгорнути — крок вгору > 6, ближче 24 до верху', function(){
  assert.equal(n({ y: 94, lastY: 100, mini: true }).mini, true, 'крок 6 — лишається стиснутим');
  assert.equal(n({ y: 93, lastY: 100, mini: true }).mini, false, 'крок 7 вгору — розгорнути');
  assert.equal(n({ y: 10, lastY: 12, mini: true }).mini, false, 'ближче 24 до верху — розгорнути');
});
test('кінець сторінки (< 24 до кінця) розгортає; пружний відскок iOS (за межі) — межа', function(){
  assert.equal(n({ y: 1990, lastY: 1900, mini: true }).mini, false);
  assert.equal(n({ y: 1977, lastY: 1900 }).mini, false, 'далі за max − 24 = 1976 — кінець');
  assert.equal(n({ y: 1976, lastY: 1900 }).mini, true);
  // y за межами приводить слухач до [0, max] (clamp у runMainScroll): y = max → кінець, y = 0 → верх
  assert.equal(n({ y: 2000, lastY: 1990, mini: true }).mini, false); assert.equal(n({ y: 0, lastY: 500, mini: true }).mini, false);
});
test('коротка сторінка ніколи не стискається; заблокований стан (клавіатура, шторка, iPad) розгортає', function(){
  assert.equal(n({ y: 30, max: 40, lastY: 0 }).mini, false); assert.equal(n({ y: 30, max: 48, lastY: 0, mini: true }).why, 'short');
  const b = n({ y: 500, lastY: 0, blocked: 'kb', mini: true }); assert.equal(b.mini, false); assert.equal(b.why, 'kb');
  assert.equal(n({ y: 500, lastY: 0, blocked: 'drawer' }).mini, false); assert.equal(n({ y: 500, lastY: 0, blocked: 'ipad' }).mini, false);
});
test('lastY оновлюється лише при кроці > 6 (як у макеті); why лише при зміні стану', function(){
  assert.equal(n({ y: 103, lastY: 100 }).lastY, 100); assert.equal(n({ y: 110, lastY: 100 }).lastY, 110);
  assert.equal(n({ y: 300, lastY: 0 }).why, 'down'); assert.equal(n({ y: 310, lastY: 300, mini: true }).why, '');
});
test('один слухач прокрутки #main-col (rAF, passive) для капсули «вгору» й стиснення; підписники для DS-3f', function(){
  assert.equal((SRC.match(/mainColEl\.addEventListener\('scroll', /g) || []).length, 1);
  assert.ok(/mainColEl\.addEventListener\('scroll', onMainColScroll, \{passive:true\}\)/.test(SRC));
  assert.ok(!/addEventListener\('scroll', updateScrollTopBtn/.test(SRC));
  assert.ok(/function subscribeMainScroll\(fn\)/.test(SRC) && /requestAnimationFrame\(function\(\)\{ mainScrollRaf = 0; runMainScroll\(\); \}\)/.test(SRC));
  assert.ok(/Math\.min\(Math\.max\(el\.scrollTop, 0\), max\)/.test(SRC), 'відскок iOS → межа');
});
test('CSS макета: .mini — translateY(8px) scale(.8), підписи opacity 0, іконки translateY(9px) scale(1.14), «+» translateY(20px) scale(.9); лише transform/opacity; reduced-motion без переходу', function(){
  assert.ok(/nav\.tabbar\.mini\{ transform:scale\(\.8\); \}/.test(CSS), 'Rev 2.32.368: лише scale від нижнього краю (без translateY, що опускало капсулу)');
  assert.ok(!/nav\.tabbar\.mini[^{]*\{[^}]*translateY\(8px\)/.test(CSS));
  assert.ok(/nav\.tabbar\.mini \.lb\{ opacity:0; \}/.test(CSS));
  assert.ok(/nav\.tabbar\.mini button:not\(\.tab-vytraty\) \.tbx > svg\{ transform:translateY\(9px\) scale\(1\.14\); \}/.test(CSS));
  assert.ok(!/nav\.tabbar\.mini button\.tab-vytraty \.tb-icon-wrap\{/.test(CSS), '«+» зменшується разом із панеллю, без власного зсуву');
  assert.ok(/nav\.tabbar\{ --tb-mini-t:420ms; transform-origin:50% 100%; transition:transform var\(--tb-mini-t\) var\(--ease-standard\); \}/.test(CSS), 'перехід 420 мс однією змінною, м\'яка крива');
  assert.ok(/nav\.tabbar, nav\.tabbar \.lb, nav\.tabbar button \.tbx > svg\{ transition:none; \}/.test(CSS));
  assert.ok(!/\.tabbar-glass\{[^}]*\bmin-height:\s*(?!75px)/.test(CSS), 'висоту капсули не змінено');
});
test('самописець: тип tab-mini і ключ mini у білих списках', function(){
  const ti = SRC.indexOf('const REC_ALLOWED_TYPES = ['); assert.ok(SRC.slice(ti, SRC.indexOf('];', ti)).indexOf("'tab-mini'") !== -1);
  const ki = SRC.indexOf('const REC_ALLOWED_KEYS = ['); assert.ok(SRC.slice(ki, SRC.indexOf('];', ki)).indexOf("'mini'") !== -1);
});

test('Rev 2.32.368 (DS-3c2): програмна прокрутка (user=false) не стискає, лише переставляє точку відліку; біля верху/кінця розгортає', function(){
  const a = n({ y: 1211, lastY: 0, user: false }); assert.equal(a.mini, false); assert.equal(a.lastY, 1211, 'точка відліку = нова позиція');
  assert.equal(n({ y: 1211, lastY: 0, user: false, mini: true }).mini, true, 'стиснений лишається, поки користувач не гортає');
  assert.equal(n({ y: 5, lastY: 900, user: false, mini: true }).mini, false); assert.equal(n({ y: 5, lastY: 900, user: false, mini: true }).why, 'top');
  assert.equal(n({ y: 1990, lastY: 900, user: false, mini: true }).why, 'end');
  assert.equal(n({ y: 300, lastY: 1211, user: false }).lastY, 300);
  // після переставлення точки відліку наступний крок користувача рахується від нової позиції
  assert.equal(n({ y: 1230, lastY: 1211, user: true }).mini, true); assert.equal(n({ y: 1215, lastY: 1211, user: true }).mini, false);
});
test('ознака користувача: дотик із рухом > 4 px, колесо, клавіші; скидається при зміні вкладки; запис byUser', function(){
  assert.ok(/const MAIN_USER_SCROLL_MS = 3000;/.test(SRC) && /const MAIN_USER_MOVE_PX = 4;/.test(SRC));
  assert.ok(/mc\.addEventListener\('wheel'/.test(SRC) && /ArrowUp\|ArrowDown\|PageUp\|PageDown\|Home\|End/.test(SRC));
  assert.ok(/function tabbarMiniExpand\(why\)\{ tabbarMiniLastY = 0; if\(why === 'tab'\) mainUserReset\(\);/.test(SRC));
  assert.ok(/recTabMini\(\{ mini: on, why: why \|\| '', scrollY: [^}]*byUser: !!byUser \}\)/.test(SRC));
  const ki = SRC.indexOf('const REC_ALLOWED_KEYS = ['); assert.ok(SRC.slice(ki, SRC.indexOf('];', ki)).indexOf("'byUser'") !== -1);
});
