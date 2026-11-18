// Rev 2.32.365 (DS-3f): капсула «Аналітика · місяць · залишок» — умова показу, джерело залишку, спільний слухач, CSS макета
const test = require('node:test');
const assert = require('node:assert');
const { buildSandbox, readAppCss } = require('./extract');
const SRC = require('./extract').readIndexWithCss(), CSS = readAppCss();
const c = buildSandbox({}, ['miniHeadShouldShow', 'MINI_HEAD_SHOW_Y']);
const ok = { tab: 'analytics', y: 200, max: 2000, kb: false, drawer: false };
test('показ: лише «Аналітика», понад 150 pt, без клавіатури й шторки, сторінка не коротка', function(){
  assert.equal(c.miniHeadShouldShow(ok), true);
  assert.equal(c.miniHeadShouldShow(Object.assign({}, ok, { y: 150 })), false, 'рівно 150 — ще ні');
  assert.equal(c.miniHeadShouldShow(Object.assign({}, ok, { y: 151 })), true);
  assert.equal(c.miniHeadShouldShow(Object.assign({}, ok, { tab: 'accounting' })), false);
  assert.equal(c.miniHeadShouldShow(Object.assign({}, ok, { kb: true })), false); assert.equal(c.miniHeadShouldShow(Object.assign({}, ok, { drawer: true })), false);
  assert.equal(c.miniHeadShouldShow(Object.assign({}, ok, { max: 40 })), false, 'коротка сторінка');
  assert.equal(c.miniHeadShouldShow(), false);
});
test('капсула підключена до спільного слухача (subscribeMainScroll), нового слухача прокрутки немає; залишок — те саме значення, що #kpi-savings', function(){
  assert.ok(/subscribeMainScroll\(miniHeadOnScroll\)/.test(SRC));
  assert.equal((SRC.match(/mainColEl\.addEventListener\('scroll', /g) || []).length, 1);
  assert.ok(!/getElementById\('main-col'\)\.addEventListener\('scroll'/.test(SRC));
  assert.ok(/const \{ monthExp, monthInc, totalIncome, totalExpense, savings \} = monthAggregates\(month\);\n\s+lastDashSavings = savings; miniHeadPaint\(\);/.test(SRC), 'значення з monthAggregates(month).savings');
  assert.ok(/document\.getElementById\('kpi-savings'\)\.textContent = fmt\(savings\);/.test(SRC) && /b\.textContent = \(typeof lastDashSavings === 'number' && isFinite\(lastDashSavings\)\) \? fmt\(lastDashSavings\)/.test(SRC), 'формат fmt() як у KPI');
  assert.ok(/monthShortName\(selectedMonth, monthKey\(localDateISO\(\)\)\)/.test(SRC), 'місяць із роком, як на пігулці');
});
test('на «Аналітиці» кнопку «вгору» замінює капсула; запасний варіант без розмиття — константа', function(){
  assert.ok(/mainColEl\.scrollTop > SCROLL_TOP_BTN_THRESHOLD && lastActiveTab !== 'analytics'/.test(SRC));
  assert.ok(/const MINI_HEAD_BLUR = true;/.test(SRC) && /if\(!MINI_HEAD_BLUR\) el\.classList\.add\('mh-noblur'\);/.test(SRC));
  assert.ok(/const MINI_HEAD_SHOW_Y = 150;/.test(SRC));
});
test('CSS: розміри макета (h40, 0 16, pill, gap 8), fixed під safe-area, лише opacity/transform, blur лише у видимому стані, reduced-motion', function(){
  const r = (CSS.match(/\.mini-head\{[^}]*\}/) || [''])[0];
  assert.ok(/position:fixed;/.test(r) && /top:calc\(env\(safe-area-inset-top, 0px\) \+ 10px\)/.test(r) && /height:40px;/.test(r) && /padding:0 var\(--sp-4\);/.test(r) && /border-radius:var\(--r-pill\);/.test(r) && /gap:var\(--sp-2\);/.test(r));
  assert.ok(/transform:translate\(-50%, -14px\) scale\(\.94\)/.test(r) && /opacity:0;/.test(r) && !/backdrop-filter/.test(r), 'у прихованому стані розмиття немає');
  assert.ok(/\.mini-head\.on\{[^}]*opacity:1;[^}]*transform:translate\(-50%, 0\) scale\(1\);/.test(CSS));
  assert.ok(/\.mini-head:not\(\.mh-noblur\)\.on\{ -webkit-backdrop-filter:blur\(24px\) saturate\(180%\)/.test(CSS));
  assert.ok(/\.mini-head\.mh-noblur\{ background:var\(--surface\); \}/.test(CSS));
  assert.ok(/prefers-reduced-motion: reduce\)\{ \.mini-head, \.mini-head\.on\{ transition:none; \} \}/.test(CSS));
});
test('фон капсули щільніший за таббар: --glass-press (не --glass), розмиття лишилось (Rev 2.32.367)', function(){
  const r = (CSS.match(/\.mini-head\{[^}]*\}/) || [''])[0];
  assert.ok(/background:var\(--glass-press\);/.test(r) && !/background:var\(--glass\)/.test(r));
  assert.ok(/\.mini-head:not\(\.mh-noblur\)\.on\{ -webkit-backdrop-filter:blur\(24px\) saturate\(180%\)/.test(CSS));
});
test('розмітка: кнопка з aria-label «Повернутися нагору»', function(){
  assert.ok(/<button type="button" class="mini-head" id="mini-head" aria-label="Повернутися нагору"/.test(SRC));
});
