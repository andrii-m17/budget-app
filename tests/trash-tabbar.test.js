// Rev 2.32.1 (T1) — таббар видно на екрані «Видалені дані» (охоронні тести CSS/JS).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const rule = sel => { const i = SRC.indexOf(sel + '{ position:fixed'); return SRC.slice(i, SRC.indexOf('}', i)); };

test('T1: .trash-screen лежить під таббаром (z-index менший за nav.tabbar) і має нижній відступ під нього', () => {
  const r = rule('.trash-screen');
  const z = Number((r.match(/z-index:(\d+)/) || [])[1]);
  const tb = SRC.slice(SRC.indexOf('nav.tabbar{'), SRC.indexOf('}', SRC.indexOf('nav.tabbar{')));
  const zt = Number((tb.match(/z-index:(\d+)/) || [])[1]);
  assert.ok(z < zt, `trash ${z} < tabbar ${zt}`);
  assert.match(r, /16px 112px;/, 'відступ як у .main-col (112px)');
  assert.match(SRC, /\.main-col\{[^}]*padding-bottom:112px/);
});
test('T1: шторки, модалки й тости лишаються над таббаром; клавіатура ховає таббар як і раніше', () => {
  const zOf = sel => Number((SRC.slice(SRC.indexOf(sel + '{')).match(/z-index:(\d+)/) || [])[1]);
  const tb = 20;
  assert.ok(zOf('.drawer') > tb && zOf('.app-modal') > tb && zOf('.live-toast-stack') > tb && zOf('.drawer-backdrop') > tb);
  assert.match(SRC, /body\.kb-open nav\.tabbar\{ display:none; \}/);
});
test('T1: тап по вкладці закриває екран (performSwitchTab → closeTrashScreen), екран відкривається лише з «Сервісу»; на таббар не вішається transform', () => {
  assert.match(SRC, /if\(isTrashOpen\) closeTrashScreen\(\);/);
  assert.match(SRC, /performSwitchTab\('service'\);\s*openTrashScreen\(\);/);
  assert.ok(!/nav\.tabbar\s*\{[^}]*transform/.test(SRC));
});
test('T1: аудит повних екранів — єдиний position:fixed inset:0 екран під таббаром це .trash-screen; решта — бекдропи', () => {
  const fixedFull = (SRC.match(/^\s*\.[\w-]+\{ position:fixed; inset:0;[^}]*\}/gm) || []).map(l => l.trim().split('{')[0]);
  assert.deepEqual(fixedFull.filter(n => !/backdrop/.test(n)).sort(), ['.mono-screen', '.trash-screen']); // Rev 2.32.27 (MB-3): ще один підекран Сервісу — «Monobank»
});
