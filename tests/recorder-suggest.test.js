// Rev 2.32.129 (BUG-INPUT): розширення рекордера — suggest-render, suggest-pick, add-button, ціль touchstart/touchend. Лише під час запису; без тексту назв (довжини й хеші).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildSandbox } = require('./extract');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const j = v => JSON.parse(JSON.stringify(v));
const NAMES = ['DEBUG_EVENT_ALLOWLIST', 'sanitizeDebugEvent', 'ringBufferPush', 'pushDebugEvent', 'debugRectOf', 'debugTextHash', 'debugTargetInfo', 'debugSuggestRender', 'debugSuggestPick', 'debugAddResult', 'onDebugAddButtonPointer'];
function mk(active){
  const timers = [];
  const ctx = buildSandbox({ debugRecordingActive: active !== false, debugRecordingStartedAt: 0, debugEventBuffer: [], DEBUG_RECORDING_MAX_EVENTS: 2000, performance: { now: () => 100 },
    debugAddBtnState: { down: false, gotClick: false, timer: null }, setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; }, clearTimeout: () => {} }, NAMES);
  return { ctx, timers, ev: () => j(vm(ctx, 'debugEventBuffer')) };
}
const vm = (ctx, expr) => require('node:vm').runInContext(expr, ctx);
const rectEl = r => ({ getBoundingClientRect: () => ({ left: r[0], top: r[1], width: r[2], height: r[3] }) });
const NAME_A = 'Велмарт секретна назва';

test('suggest-render: лише кількість, довжини й підсвічений індекс; тексту назв нема', function(){
  const { ctx, ev } = mk();
  ctx.debugSuggestRender('new', [NAME_A, 'Вел'], 1);
  const e = ev()[0];
  assert.deepEqual(e, { t: 100, type: 'suggest-render', ctx: 'new', count: 2, lens: [NAME_A.length, 3], activeIdx: 1 });
  assert.ok(!JSON.stringify(ev()).includes('Велмарт'));
});
test('suggest-pick: індекс, довжина й хеш обраної, довжина тексту до/після; тексту нема; хеш стабільний', function(){
  const { ctx, ev } = mk();
  ctx.debugSuggestPick('edit', 2, NAME_A, 3, NAME_A.length);
  const e = ev()[0];
  assert.equal(e.type, 'suggest-pick'); assert.equal(e.pickIdx, 2); assert.equal(e.pickLen, NAME_A.length); assert.equal(e.textLenBefore, 3); assert.equal(e.textLenAfter, NAME_A.length);
  assert.match(e.pickHash, /^[0-9a-f]{6}$/); assert.equal(e.pickHash, ctx.debugTextHash(NAME_A)); assert.notEqual(ctx.debugTextHash('a'), ctx.debugTextHash('b'));
  assert.ok(!JSON.stringify(ev()).includes('Велмарт'));
});
test('без запису нічого не пишеться', function(){
  const { ctx, ev } = mk(false);
  ctx.debugSuggestRender('new', ['x'], 0); ctx.debugSuggestPick('new', 0, 'x', 0, 1); ctx.debugAddResult('added');
  ctx.onDebugAddButtonPointer({ type: 'pointerdown', target: { closest: () => rectEl([1, 2, 3, 4]) } });
  assert.deepEqual(ev(), []);
});
test('add-button: pointerdown → pointerup → click із прямокутником кнопки; «pointerup без click» через 400 мс; click гасить таймер-подію', function(){
  const { ctx, timers, ev } = mk();
  const btn = rectEl([20, 700, 300, 50]);
  const E = type => ({ type, pointerType: 'touch', target: { closest: sel => (sel === 'button.submit-btn.expense' ? btn : null) } });
  ctx.onDebugAddButtonPointer(E('pointerdown')); ctx.onDebugAddButtonPointer(E('pointerup'));
  assert.equal(timers.length, 1); assert.equal(timers[0].ms, 400);
  timers[0].fn(); // click не прийшов
  let list = ev();
  assert.deepEqual(list.map(e => e.phase), ['pointerdown', 'pointerup', 'no-click']);
  assert.deepEqual(list[0].rect, { left: 20, top: 700, width: 300, height: 50 }); assert.equal(list[0].pointerType, 'touch');
  assert.equal(list[2].gotClick, false);
  const b = mk();
  b.ctx.onDebugAddButtonPointer(E('pointerdown')); b.ctx.onDebugAddButtonPointer(E('pointerup')); b.ctx.onDebugAddButtonPointer(E('click'));
  b.timers[0].fn();
  list = b.ev();
  assert.deepEqual(list.map(e => e.phase), ['pointerdown', 'pointerup', 'click']); assert.equal(list[2].gotClick, true);
});
test('add-button: клік поза кнопкою ігнорується; результат addExpense: added / rejected+причина / deferred', function(){
  const { ctx, ev } = mk();
  ctx.onDebugAddButtonPointer({ type: 'pointerdown', target: { closest: () => null } });
  ctx.debugAddResult('rejected', 'name-empty'); ctx.debugAddResult('added'); ctx.debugAddResult('deferred', 'edit-guard');
  assert.deepEqual(ev().map(e => [e.phase, e.result, e.reason]), [['result', 'rejected', 'name-empty'], ['result', 'added', null], ['result', 'deferred', 'edit-guard']]);
});
test('ціль дотику: id (uuid замасковано), тег, клас, прямокутник', function(){
  const { ctx } = mk();
  const el = Object.assign(rectEl([5, 6, 7, 8]), { id: 'x-123e4567-e89b-12d3-a456-426614174000', tagName: 'DIV', className: 'name-suggest-item active' });
  assert.deepEqual(j(ctx.debugTargetInfo(el)), { targetTag: 'DIV', targetId: 'x-<uuid>', targetClasses: 'name-suggest-item active', targetRect: { left: 5, top: 6, width: 7, height: 8 } });
  assert.deepEqual(j(ctx.debugTargetInfo(null)), { targetTag: null, targetId: null, targetClasses: null, targetRect: null });
});
test('allowlist пропускає нові поля, але не текст/значення; охоронні: виклики на місцях, слухачі capture, touch-ціль', function(){
  const { ctx } = mk();
  const out = j(ctx.sanitizeDebugEvent({ type: 'suggest-pick', pickLen: 3, text: 'секрет', value: 'секрет', name: 'секрет', lens: [1], rect: { left: 1 } }));
  assert.deepEqual(out, { type: 'suggest-pick', pickLen: 3, lens: [1], rect: { left: 1 } });
  assert.match(SRC, /debugSuggestRender\('new', matches, activeNameSuggestIdx\)/);
  assert.match(SRC, /debugSuggestRender\('edit', matches, -1\)/);
  assert.match(SRC, /debugSuggestPick\('new', i, name, lenBefore, name\.length\)/);
  assert.match(SRC, /debugSuggestPick\('edit', i, name, editLenBefore, name\.length\)/);
  assert.match(SRC, /\['pointerdown', 'pointerup', 'click'\]\.forEach\(function\(ev\)\{ on\(document, ev, onDebugAddButtonPointer, true\); \}\)/);
  assert.match(SRC, /targetRect: debugRectOf\(target\)/);
  assert.match(SRC, /targetRect: ti\.targetRect/);
  assert.match(SRC, /debugAddResult\('rejected', 'gate'\)/);
  assert.match(SRC, /debugAddResult\('rejected', !name \? 'name-empty' : 'amount-invalid'\)/);
  assert.match(SRC, /if\(ok\) debugAddResult\('added'\)/);
  assert.match(SRC, /if\(name === 'addExpense'\) debugAddResult\('deferred', 'edit-guard'\)/);
});
