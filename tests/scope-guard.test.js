// Rev 2.32.54 (A) — охорона від класу помилок «функція оголошена всередині initApp-IIFE, а викликається з глобального коду» (так kbMode/focusCardField кидали ReferenceError, див. 2.32.52).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
function strip(t){ return t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/(?<![:'"])\/\/[^\n]*/g, ''); }
const a = SRC.indexOf('(async function initApp(){'), b = SRC.indexOf('\n})();', a);
const inner = SRC.slice(a, b), outer = strip(SRC.slice(0, a) + SRC.slice(b));
const names = new Set([].concat(
  Array.from(inner.matchAll(/^(?:async )?function ([A-Za-z_$][\w$]*)\(/gm), function(m){ return m[1]; }),
  Array.from(inner.matchAll(/^(?:let|const|var) ([A-Za-z_$][\w$]*)/gm), function(m){ return m[1]; })));
function outsideRefs(n){ return (outer.match(new RegExp('(?<![\\w$.])' + n.replace(/\$/g, '\\$') + '(?![\\w$])', 'g')) || []).length; }
// Відомі звернення ЗЗОВНІ (кожне — лише за перевіркою typeof … === 'function'; див. 2.32.52 і 2.32.55). Нове звернення зовні до імені з IIFE зламає тест: або винесіть оголошення назовні, або додайте сюди свідомо.
const KNOWN_OUTSIDE = { kbMode: 2, focusCardField: 2, recordKbEnv: 2 };
test('жодна функція/змінна з initApp-IIFE не використовується в глобальному коді (крім відомих, захищених typeof)', function(){
  assert.ok(names.size > 50, 'знайдено оголошень: ' + names.size);
  const leaks = {};
  names.forEach(function(n){ const c = outsideRefs(n); if(c) leaks[n] = c; });
  assert.deepEqual(leaks, KNOWN_OUTSIDE);
});
test('відомі звернення зовні — лише за typeof-перевіркою (виклик без перевірки недопустимий)', function(){
  Object.keys(KNOWN_OUTSIDE).forEach(function(n){
    const calls = (outer.match(new RegExp('(?<![\\w$.])' + n + '\\(', 'g')) || []).length;
    const guards = (outer.match(new RegExp("typeof " + n + " [!=]== 'function'", 'g')) || []).length;
    assert.equal(guards, 1, n + ': рівно одна typeof-перевірка');
    assert.equal(calls, 1, n + ': рівно один виклик, і він за перевіркою');
  });
});
test('recordKbEnv виставлена у window (інакше kb-env у рекордері не записується; 2.32.55)', function(){
  assert.match(SRC, /\n\}\n\/\/ Rev 2\.32\.55: recordKbEnv[^\n]*\nwindow\.recordKbEnv = recordKbEnv;/);
});
