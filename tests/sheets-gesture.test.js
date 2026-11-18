// Rev 2.32.371 (DS-4a): жест закриття шторок — пороги макета, карта закривачів, CSS-змінна зсуву, Esc лише верхньої, самописець
const test = require('node:test');
const assert = require('node:assert');
const { buildSandbox, readAppCss } = require('./extract');
const SRC = require('./extract').readIndexWithCss(), CSS = readAppCss();
const c = buildSandbox({}, ['sheetSwipeDecision', 'SHEET_SWIPE_CLOSE_PX', 'SHEET_SWIPE_FAST_PX', 'SHEET_SWIPE_FAST_V']);
test('пороги макета: зсув > 110 pt закриває; швидкий (> 0,6 px/мс) при зсуві > 30 pt закриває; повільний короткий — ні', function(){
  assert.equal(c.sheetSwipeDecision(111, 2000).close, true); assert.equal(c.sheetSwipeDecision(110, 2000).close, false, 'рівно 110 — ще ні');
  assert.equal(c.sheetSwipeDecision(40, 50).close, true, '40 pt за 50 мс = 0,8 px/мс'); assert.equal(c.sheetSwipeDecision(31, 50).close, true);
  assert.equal(c.sheetSwipeDecision(30, 10).close, false, 'зсув ≤ 30 — ні навіть швидко');
  assert.equal(c.sheetSwipeDecision(60, 700).close, false, 'повільний короткий повертається'); assert.equal(c.sheetSwipeDecision(40, 70).close, false, '0,57 px/мс < 0,6');
  assert.equal(c.sheetSwipeDecision(-50, 10).close, false, 'угору — ні'); assert.equal(c.sheetSwipeDecision(80, 0).close, true, 'dt=0 не ділить на нуль');
  assert.ok(Math.abs(c.sheetSwipeDecision(120, 100).vel - 1.2) < 1e-9);
});
test('карта закривачів покриває всі 14 шторок і app-modal; усі функції існують', function(){
  const ids = Array.from(SRC.matchAll(/<div class="drawer[^"]*" id="([a-z-]+-drawer)"/g), m => m[1]);
  const map = SRC.slice(SRC.indexOf('const SHEET_CLOSERS = {'), SRC.indexOf('};', SRC.indexOf('const SHEET_CLOSERS = {')));
  assert.ok(ids.length >= 14, 'шторок у розмітці: ' + ids.length);
  ids.forEach(id => { assert.ok(map.indexOf("'" + id + "'") !== -1, 'немає закривача для ' + id); });
  assert.ok(map.indexOf("'app-modal': 'closeAppModal'") !== -1);
  Array.from(map.matchAll(/: '(close[A-Za-z]+)'/g), m => m[1]).forEach(fn => assert.ok(new RegExp('function ' + fn + '\\(').test(SRC), 'функція ' + fn));
});
test('зона жесту — смужка, заголовок, .sf-title; вміст ні; захоплення вказівника лише після руху; зсув у --sheet-drag, без інлайн transform', function(){
  assert.ok(/const SHEET_SWIPE_ZONE = '\.drawer-handle, \.drawer-head, \.sf-title';/.test(SRC));
  const s0 = SRC.indexOf('(function initDrawerSwipeToDismiss()'); const js = SRC.slice(s0, SRC.indexOf("push('sheets.js')", s0));
  assert.ok(/setProperty\('--sheet-drag'/.test(js) && !/style\.transform\s*=/.test(js), 'інлайн transform не ставиться');
  assert.ok(js.indexOf('setPointerCapture') > js.indexOf('SHEET_SWIPE_SLOP'), 'захоплення — після порога руху');
  assert.ok(!/addEventListener\('touch(start|move|end|cancel)'/.test(js), 'без дублювання touch+pointer');
  assert.ok(/t\.closest\('button, a, input, select, textarea, label'\)/.test(js), '«×» і кнопки — звичайні дотики');
});
test('CSS: .drawer.open береться зсув із --sheet-drag; правило клавіатури незмінне; смужка 5 px; заголовок touch-action:none', function(){
  assert.ok(/\.drawer\.open\{ transform:translateY\(var\(--sheet-drag, 0px\)\); bottom:var\(--drawer-bottom-base\); \}/.test(CSS));
  assert.ok(/html\.kb-sheet \.drawer\.open\{[^}]*transform:translate3d\(0, calc\(-1px \* var\(--sheet-lift, 0\)\), 0\);/.test(CSS), 'підйом клавіатури не чіпали');
  assert.ok(/\.drawer-handle::before\{ content:''; width:36px; height:5px;/.test(CSS));
  assert.ok(/\.drawer-head, \.sf-title\{ touch-action:none;/.test(CSS));
});
test('Esc закриває лише верхню шторку чи діалог (closeTopSheet), решта — як було; самописець sheet-swipe у білих списках', function(){
  assert.ok(/if\(e\.key==='Escape'\)\{ if\(closeTopSheet\(\)\) return;/.test(SRC));
  assert.ok(/function closeTopSheet\(\)/.test(SRC) && /function openSheetsTopFirst\(\)/.test(SRC));
  const ti = SRC.indexOf('const REC_ALLOWED_TYPES = ['); assert.ok(SRC.slice(ti, SRC.indexOf('];', ti)).indexOf("'sheet-swipe'") !== -1);
  const ki = SRC.indexOf('const REC_ALLOWED_KEYS = ['); const keys = SRC.slice(ki, SRC.indexOf('];', ki)); ['drawerId', 'delta', 'vel', 'closed', 'why'].forEach(k => assert.ok(keys.indexOf("'" + k + "'") !== -1, k));
});

// Rev 2.32.375 (DS-4b): шторки без видимої «×» (< 1280), видима на ≥ 1280; «Закрити» для «Структури»
test('DS-4b: «×» sr-only лише < 1280 (не display:none, видима при :focus-visible); у ОЧ власний розмір перекрито; висота заголовка не змінюється', function(){
  const m = CSS.match(/@media \(max-width:1279px\)\{\s*\.drawer-head\{ min-height:32px; \}\s*html:root \.drawer-close:not\(:focus-visible\)\{([^}]*)\}/);
  assert.ok(m, 'правило sr-only у media (max-width:1279px)');
  assert.ok(/position:absolute;/.test(m[1]) && /width:1px; height:1px;/.test(m[1]) && /clip:rect\(0 0 0 0\)/.test(m[1]) && /overflow:hidden;/.test(m[1]));
  assert.ok(!/display:\s*none|visibility:\s*hidden/.test(m[1]), 'не display:none (інакше focusFirstIn віддав би фокус полю)');
  assert.ok(/html:root #installment-drawer \.drawer-close:not\(:focus-visible\)\{ width:1px; height:1px; \}/.test(CSS));
});
test('DS-4b: усі 13 шторок із «×» мають aria-label «Закрити»; у «Структури» прихована кнопка .sr-close в кінці розмітки (порядок фокусу: першим лишається поле)', function(){
  const btns = SRC.match(/<button class="drawer-close"[^>]*>/g) || [];
  assert.equal(btns.length, 13); btns.forEach(b => assert.ok(/aria-label="Закрити"/.test(b), b));
  const s0 = SRC.indexOf('<div class="drawer struct-form" id="struct-drawer"'); const d = SRC.slice(s0, SRC.indexOf('id="card-debt-backdrop"', s0));
  assert.ok(/<button type="button" class="sr-close" onclick="closeStructForm\(\)" aria-label="Закрити">Закрити<\/button>[^]*<\/div>\s*$/.test(d.trim() + '\n') || d.indexOf('class="sr-close"') > d.indexOf('sf-delete-wrap'), 'sr-close після вмісту');
  assert.ok(/\.sr-close:not\(:focus-visible\)\{ position:absolute; width:1px; height:1px;/.test(CSS) && /\.sr-close:focus-visible\{ display:block;/.test(CSS));
});
