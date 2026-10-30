// Rev 2.32.132 (BUG-INPUT): підказка назви приймається лише явним дотиком по ній самій; дотик поза списком лише закриває; після вибору список не відкривається знову сам.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildSandbox, evalInSandbox } = require('./extract');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const NAMES = ['NAME_SUGGEST_MIN', 'NAME_SUGGEST_MAX', 'SUGGEST_TOUCH_WINDOW_MS', 'nameSuggestionsFor', 'updateNameSuggestions', 'SUGGEST_HIDE_DELAY_MS', 'SUGGEST_TOUCH_MAX_HOLD_MS', 'suggestClearList', 'scheduleHideNameSuggestions', 'suggestListTouchEnd', 'hideNameSuggestions', 'selectNameSuggestion', 'handleSuggestionPick', 'pickSuggestionNow',
  'SUGGEST_TAP_HOLD_MS', 'SUGGEST_TAP_MOVE_PX', 'suggestTouchId', 'suggestCancelTapTimer', 'handleSuggestionTouchMove', 'handleSuggestionTouchCancel', 'handleSuggestionTouchStart', 'handleSuggestionTouchEnd', 'suggestTapAccepted', 'suggestMouseAllowed', 'suggestShouldClose', 'onNameInput', 'debugSuggestRender', 'debugSuggestPick'];

function mk(){
  const el = id => ({ id, value: '', classList: { _s: new Set(), add(c){ this._s.add(c); }, remove(c){ this._s.delete(c); }, contains(c){ return this._s.has(c); }, toggle(){} }, innerHTML: '', dataset: {}, focus(){}, textContent: '' });
  const els = { 'name-suggest-list': el('name-suggest-list'), expfielda7: el('expfielda7'), 'f-amount': el('f-amount') };
  const g = {
    document: { getElementById: id => els[id] || el(id), querySelectorAll: () => [] },
    nameHistoryMap: { 'Вел': { count: 1, lastDate: '2026-09-01' }, 'Велмарт': { count: 5, lastDate: '2026-10-01', lastCategory: 'Харчування' }, 'Велика покупка': { count: 2, lastDate: '2026-10-02' } },
    nameSuggestions: [], activeNameSuggestIdx: -1, suggestGen: 0, suggestSuppressed: false, suggestLastTouchAt: 0, lastSuggestionPickAt: 0, suggestTouchStart: null,
    debugRecordingActive: false, saveExpenseDraft(){}, autocategorize: () => null, setCategorySelect(){}, setSubcategorySelect(){}, updateInstallmentLinkDetection(){}, catSelStub: null,
    escapeHtml: s => String(s), stripLeadingEmoji: s => s,
  };
  // onNameInput читає DOM-елементи форми: підставляємо мінімальні заглушки
  els['auto-hint'] = el('auto-hint'); els['auto-hint-text'] = el('auto-hint-text'); els['f-category'] = el('f-category'); els['f-subcategory'] = el('f-subcategory'); els['cat-fields-wrap'] = el('cat-fields-wrap');
  els['f-category'].classList.toggle = () => {}; els['cat-fields-wrap'].classList.toggle = () => {};
  const ctx = buildSandbox(g, NAMES);
  return { ctx, els, get: expr => evalInSandbox(ctx, expr) };
}
const touchEv = (type, x, y, cur) => ({ type, touches: type === 'touchend' ? [] : [{ clientX: x, clientY: y }], changedTouches: [{ clientX: x, clientY: y }], currentTarget: cur, preventDefault(){ this.prevented = true; } });
const item = (l, t, r, b) => ({ isConnected: true, getBoundingClientRect: () => ({ left: l, top: t, right: r, bottom: b }) });

test('suggestTapAccepted: лише той самий рендер, у межах елемента, без протяжки', function(){
  const { ctx } = mk();
  const ok = { connected: true, startGen: 3, currentGen: 3, dx: 2, dy: 3, point: { x: 50, y: 50 }, rect: { left: 10, top: 40, right: 300, bottom: 90 } };
  assert.equal(ctx.suggestTapAccepted(ok), true);
  assert.equal(ctx.suggestTapAccepted(Object.assign({}, ok, { currentGen: 4 })), false, 'список перемалювався між touchstart і touchend');
  assert.equal(ctx.suggestTapAccepted(Object.assign({}, ok, { connected: false })), false);
  assert.equal(ctx.suggestTapAccepted(Object.assign({}, ok, { dy: 30 })), false);
  assert.equal(ctx.suggestTapAccepted(Object.assign({}, ok, { dx: -30 })), false, 'горизонтальна протяжка теж не вибір');
  assert.equal(ctx.suggestTapAccepted(Object.assign({}, ok, { point: { x: 400, y: 50 } })), false, 'палець зійшов з елемента');
  assert.equal(ctx.suggestTapAccepted(Object.assign({}, ok, { startGen: null })), false, 'touchend без touchstart на елементі');
});
test('suggestMouseAllowed / suggestShouldClose: синтетичний mousedown після дотику ігнорується; дотик поза списком і полем закриває, усередині — ні', function(){
  const { ctx } = mk();
  assert.equal(ctx.suggestMouseAllowed(1000, 0), true); assert.equal(ctx.suggestMouseAllowed(1500, 1000), false); assert.equal(ctx.suggestMouseAllowed(2000, 1000), true);
  assert.equal(ctx.suggestShouldClose(true, false, false), true);
  assert.equal(ctx.suggestShouldClose(true, true, false), false); assert.equal(ctx.suggestShouldClose(true, false, true), false); assert.equal(ctx.suggestShouldClose(false, false, false), false);
});
test('вибір короткої підказки явним дотиком: у полі коротка назва, список закрито й НЕ відкривається знову (фокус на полі, onNameInput без вводу користувача)', function(){
  const m = mk();
  m.els.expfielda7.value = 'Ве';
  m.ctx.updateNameSuggestions('Ве');
  const names = m.get('nameSuggestions').slice();
  const idx = names.indexOf('Вел');
  assert.ok(idx >= 0 && names.indexOf('Велмарт') >= 0, 'є і коротка, і довша: ' + names);
  const it = item(10, 40, 300, 90);
  m.ctx.handleSuggestionTouchStart(touchEv('touchstart', 50, 60, it));
  m.ctx.handleSuggestionTouchEnd(touchEv('touchend', 52, 61, it), idx);
  assert.equal(m.els.expfielda7.value, 'Вел');
  assert.equal(m.els['name-suggest-list'].classList.contains('show'), false);
  assert.equal(m.get('suggestSuppressed'), true);
  // повторне програмне відкриття (фокус на полі) не відкриває список: умова з onfocus
  assert.equal(/onfocus="if\(!suggestSuppressed\) updateNameSuggestions/.test(SRC), true);
  // програмний onNameInput без події не відкриває список, навіть якщо є довші збіги
  m.ctx.onNameInput();
  assert.equal(m.els['name-suggest-list'].classList.contains('show'), false);
  // справжній ввід користувача знову дозволяє підказки
  m.ctx.onNameInput({ type: 'input' });
  assert.equal(m.get('suggestSuppressed'), false);
  assert.equal(m.els['name-suggest-list'].classList.contains('show'), true);
});
test('перемальований список між touchstart і touchend: підміни довшою нема, вибору нема', function(){
  const m = mk();
  m.els.expfielda7.value = 'Ве';
  m.ctx.updateNameSuggestions('Ве');
  const it = item(10, 40, 300, 90);
  m.ctx.handleSuggestionTouchStart(touchEv('touchstart', 50, 60, it));
  m.ctx.updateNameSuggestions('Вел'); // автокорекція/ввід перемалювали список
  m.ctx.handleSuggestionTouchEnd(touchEv('touchend', 50, 60, it), 0);
  assert.equal(m.els.expfielda7.value, 'Ве', 'нічого не підставлено');
});
test('touchend із іншого місця (дотик по «Додати», не по підказці): вибору немає; синтетичний mousedown після дотику ігнорується', function(){
  const m = mk();
  m.els.expfielda7.value = 'Ве';
  m.ctx.updateNameSuggestions('Ве');
  const it = item(10, 40, 300, 90);
  m.ctx.handleSuggestionTouchEnd(touchEv('touchend', 50, 600, it), 0); // без touchstart на елементі
  assert.equal(m.els.expfielda7.value, 'Ве');
  m.ctx.handleSuggestionTouchStart(touchEv('touchstart', 50, 60, it));
  m.ctx.handleSuggestionTouchEnd(touchEv('touchend', 50, 600, it), 0); // палець опинився поза елементом
  assert.equal(m.els.expfielda7.value, 'Ве');
  m.ctx.updateNameSuggestions('Ве'); evalInSandbox(m.ctx, 'suggestLastTouchAt = Date.now()');
  m.ctx.handleSuggestionPick({ preventDefault(){} }, 0); // mousedown одразу після дотику
  assert.equal(m.els.expfielda7.value, 'Ве');
  evalInSandbox(m.ctx, 'suggestLastTouchAt = 0');
  m.ctx.handleSuggestionPick({ preventDefault(){} }, 0); // справжня миша: працює
  assert.notEqual(m.els.expfielda7.value, 'Ве');
});
test('охоронні: слухачі поза списком не гасять подію; поле назви: oninput(event); у блоці немає kb-*', function(){
  const blk = SRC.slice(SRC.indexOf("document.addEventListener('touchstart', function(){ suggestLastTouchAt"), SRC.indexOf('// Rev 2.22.67 (6D.138) BugFix — onExpenseNameFocus()'));
  assert.ok(!/stopPropagation|preventDefault/.test(blk), 'слухачі дотику/закриття не гасять подію: клік по «Додати» доходить до кнопки');
  assert.ok(/passive: true/.test(blk));
  assert.match(SRC, /oninput="onNameInput\(event\)"/);
  const sugg = SRC.slice(SRC.indexOf('let lastSuggestionPickAt = 0;'), SRC.indexOf('function updateNameSuggestions('));
  assert.ok(!/kb-|kbSheet|focusCardFieldSafe/.test(sugg.split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n')), 'клавіатурна логіка не чіпалась');
});
