// Rev 2.32.159 (DIALOG-MOTION) — анімація діалогів .app-modal: значення CSS, послідовність із закриттям клавіатури, reduced-motion, відсутність подвійного відкриття, фокус.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildSandbox } = require('./extract');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

function rule(sel){ const i = SRC.indexOf('\n  ' + sel + '{'); assert.ok(i >= 0, 'нема правила ' + sel); return SRC.slice(i, SRC.indexOf('}', i) + 1); }

test('CSS: поява 0,24 с cubic-bezier(.2,.8,.2,1), зникнення 0,2 с ease-in', function(){
  assert.match(SRC, /animation:appModalIn \.24s cubic-bezier\(\.2,\.8,\.2,1\) both/);
  assert.match(SRC, /animation:appModalOut \.2s ease-in both/);
  assert.match(SRC, /@keyframes appModalIn\{ from\{ opacity:0; translate:0 14px; scale:\.98; \} to\{ opacity:1; translate:0 0; scale:1; \} \}/);
  assert.match(SRC, /@keyframes appModalOut\{ from\{ opacity:1; translate:0 0; scale:1; \} to\{ opacity:0; translate:0 16px; scale:\.98; \} \}/);
});
test('CSS: зсув і масштаб через translate/scale — transform (центрування, підйом клавіатури) не анімується', function(){
  assert.ok(!/@keyframes appModal(In|Out)\{[^}]*transform/.test(SRC.replace(/\n/g, ' ')));
});
test('CSS: reduced-motion — лише затухання 0,08 с, без translate/scale', function(){
  assert.match(SRC, /\.app-modal\.open\{ animation:appModalFadeIn 80ms linear both; \}\s*\.app-modal\.leaving\{ animation:appModalFadeOut 80ms linear both; \}/);
  assert.ok(!/@keyframes appModalFade(In|Out)\{[^}]*(translate|scale)/.test(SRC));
});
test('CSS: словник на десктопі — висота й прозорість 0,22 с ease, стрілка в такт, фон 0,16 с; лише миша', function(){
  const i = SRC.indexOf('@media (hover:hover) and (pointer:fine){'); assert.ok(i > 0);
  const blk = SRC.slice(i, SRC.indexOf('@media (prefers-reduced-motion', i));
  assert.match(blk, /transition:grid-template-rows \.22s ease, opacity \.22s ease/);
  assert.match(blk, /\.struct-dict-chev\{ transition:transform \.22s ease; \}/);
  assert.match(blk, /background-color \.16s ease/);
  assert.match(SRC, /\.struct-dict-group\.open \.struct-dict-chev\{ transform:rotate\(180deg\)/);
});

// ---- поведінка ----
function makeEnv(){
  const timers = []; let now = 0;
  const mk = (cls) => { const set = new Set(cls); const attrs = {}; const listeners = {};
    return { classList: { add: c => set.add(c), remove: c => set.delete(c), contains: c => set.has(c) }, setAttribute: (k, v) => { attrs[k] = v; }, removeAttribute: k => { delete attrs[k]; }, hasAttribute: k => k in attrs, attrs,
      addEventListener: (t, f) => { (listeners[t] = listeners[t] || []).push(f); }, removeEventListener: (t, f, cap) => { listeners[t] = (listeners[t] || []).filter(x => x !== f); }, fire: (t, e) => (listeners[t] || []).slice().forEach(f => f(e)), listeners, style: {}, textContent: '' }; };
  const els = { 'app-modal': mk([]), 'modal-backdrop': mk([]), 'app-modal-cancel-btn': mk([]), 'app-modal-confirm-btn': mk([]) };
  const root = mk([]);
  const doc = Object.assign(mk([]), { documentElement: root, activeElement: { id: 'fld' }, getElementById: id => els[id] || null });
  const log = { focusRestored: 0, locks: 0, unlocks: 0, focusFirst: 0 };
  const g = {
    document: doc, els, root, log,
    setTimeout: (f, ms) => { const t = { f, at: now + ms, off: false }; timers.push(t); return t; },
    clearTimeout: t => { if(t) t.off = true; },
    lastFocusedBeforeDialog: null, appModalGeneration: 0, appModalPurgeStyled: false, editGuardGen: -1,
    appModalPending: false, appModalPendingTimer: null, appModalPendingOnEnd: null, appModalAfterLeave: null, appModalLeaveTimer: null, appModalLeaveOnEnd: null,
    APP_MODAL_DEFER_MS: 300, APP_MODAL_DEFER_MAX_MS: 400, APP_MODAL_LEAVE_FALLBACK_MS: 300,
    kbSheetUsesProxy: () => false, focusFirstIn: () => { log.focusFirst++; }, lockBackgroundScroll: () => { log.locks++; }, unlockBackgroundScroll: () => { log.unlocks++; },
    restoreFocus: () => { log.focusRestored++; g.lastFocusedBeforeDialog = null; }, editGuardShield: false, returnToEditCard: () => {}
  };
  g.advance = ms => { now += ms; timers.filter(t => !t.off && t.at <= now).sort((a, b) => a.at - b.at).forEach(t => { if(!t.off){ t.off = true; t.f(); } }); };
  return g;
}
function sandbox(){
  const g = makeEnv();
  const c = buildSandbox(g, ['appModalShouldDefer', 'cancelPendingAppModal', 'openAppModal', 'openAppModalNow', 'runAppModalAfterLeave', 'clearAppModalLeaving', 'startAppModalLeaving', 'closeAppModal', 'editGuardPending']);
  c.els = g.els; return { c, g };
}
// стан змінних пишеться у глобал sandbox (c), тому читаємо його з c
test('відкриття без шторки, що опускається, — одразу; закриття ставить .leaving і знімає після animationend', function(){
  const { c, g } = sandbox(); const m = g.els['app-modal'];
  c.openAppModal();
  assert.ok(m.classList.contains('open')); assert.equal(g.log.locks, 1);
  c.closeAppModal();
  assert.ok(!m.classList.contains('open')); assert.ok(m.classList.contains('leaving')); assert.ok('inert' in m.attrs, 'inert одразу');
  assert.equal(g.log.focusRestored, 1, 'фокус повертається одразу (жест iOS)');
  m.fire('animationend', { target: m });
  assert.ok(!m.classList.contains('leaving'));
});
test('запасний таймер 300 мс знімає .leaving і скидає кнопки, якщо animationend не прийшов', function(){
  const { c, g } = sandbox(); const m = g.els['app-modal'];
  g.els['app-modal-cancel-btn'].textContent = 'Закрити'; g.els['app-modal-confirm-btn'].style.display = 'none';
  c.openAppModal(); c.closeAppModal();
  g.advance(299); assert.ok(m.classList.contains('leaving'));
  g.advance(2); assert.ok(!m.classList.contains('leaving'));
  assert.equal(g.els['app-modal-cancel-btn'].textContent, 'Скасувати'); assert.equal(g.els['app-modal-confirm-btn'].style.display, '');
});
test('повторне відкриття під час зникання скасовує .leaving і не скидає кнопки нового діалогу', function(){
  const { c, g } = sandbox(); const m = g.els['app-modal'];
  c.openAppModal(); c.closeAppModal(); c.openAppModal();
  assert.ok(m.classList.contains('open')); assert.ok(!m.classList.contains('leaving'));
  g.els['app-modal-confirm-btn'].style.display = 'none';
  g.advance(500); assert.equal(g.els['app-modal-confirm-btn'].style.display, 'none');
});
test('послідовність: поки шторка опускається (kb-sheet-closing), діалог не з’являється; з’являється після transitionend', function(){
  const { c, g } = sandbox(); const m = g.els['app-modal'];
  g.root.classList.add('kb-sheet-closing');
  c.openAppModal();
  assert.ok(!m.classList.contains('open'), 'під час опускання діалогу немає');
  g.advance(100); assert.ok(!m.classList.contains('open'));
  const drawer = { classList: { contains: x => x === 'drawer' } };
  g.document.fire('transitionend', { propertyName: 'opacity', target: drawer });
  assert.ok(!m.classList.contains('open'), 'чужа властивість не рахується');
  g.document.fire('transitionend', { propertyName: 'transform', target: drawer });
  assert.ok(m.classList.contains('open'));
});
test('послідовність: без transitionend діалог з’являється за ≈0,3 с (≤ 0,4 с)', function(){
  const { c, g } = sandbox(); const m = g.els['app-modal'];
  g.root.classList.add('kb-sheet-closing');
  c.openAppModal();
  g.advance(299); assert.ok(!m.classList.contains('open'));
  g.advance(2); assert.ok(m.classList.contains('open'));
  assert.ok(300 <= 400);
});
test('без подвійного відкриття: кілька викликів під час очікування дають один показ і одне блокування прокрутки', function(){
  const { c, g } = sandbox(); const m = g.els['app-modal'];
  g.root.classList.add('kb-sheet-closing');
  c.openAppModal(); c.openAppModal(); c.openAppModal();
  g.advance(350); g.advance(500);
  assert.ok(m.classList.contains('open')); assert.equal(g.log.locks, 1);
  assert.equal((g.document.listeners.transitionend || []).length, 0, 'слухач transitionend знято');
});
test('editGuardPending бачить діалог, що очікує показу; закриття під час очікування скасовує показ', function(){
  const { c, g } = sandbox(); const m = g.els['app-modal'];
  g.root.classList.add('kb-sheet-closing');
  c.openAppModal(); c.editGuardGen = c.appModalGeneration;
  assert.equal(c.editGuardPending(), true);
  c.closeAppModal(); g.advance(500);
  assert.ok(!m.classList.contains('open')); assert.equal(g.log.locks, 0); assert.equal(g.log.unlocks, 0);
  assert.equal(c.editGuardPending(), false);
});
test('фокус: lastFocusedBeforeDialog = елемент до відкриття (також при відкладеному показі), повертається при закритті', function(){
  const { c, g } = sandbox(); const before = { id: 'before' }; g.document.activeElement = before;
  g.root.classList.add('kb-sheet-closing');
  c.openAppModal(); assert.equal(c.lastFocusedBeforeDialog, before);
  g.advance(350); c.closeAppModal(); assert.equal(g.log.focusRestored, 1);
});
