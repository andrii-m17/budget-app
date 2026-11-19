// Rev 2.32.409 (FIX-1119 п.1): одометр — проміжок групи тисяч окремим елементом, цифри однакової ширини.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildSandbox } = require('./extract');
const fakeDoc = { createElement: function(){ const d = { innerHTML: '' }; Object.defineProperty(d, 'textContent', { set: function(v){ d.innerHTML = String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\u00a0/g, '&nbsp;'); } }); return d; } };
const c = buildSandbox({ document: fakeDoc, motionReduced: function(){ return true; } }, ['odoRender', 'escapeHtml']);
function fakeEl(){
  const el = { dataset: {}, attrs: {}, html: '', setAttribute: function(k, v){ this.attrs[k] = v; }, querySelector: function(){ return null; }, querySelectorAll: function(){ return []; }, offsetWidth: 0 };
  Object.defineProperty(el, 'innerHTML', { get: function(){ return this.html; }, set: function(v){ this.html = v; } });
  return el;
}
test('«−9 159 ₴» і «13 183 ₴»: між цифрами тисяч — .odg, перед ₴ — звичайний символ; aria-label зберігає текст', function(){
  ['−9 159 ₴', '13 183 ₴', '1 234 567 ₴'].forEach(function(t){
    const el = fakeEl(); c.odoRender(el, t, false);
    const groups = (t.match(/\d[\s ]\d/g) || []).length;
    assert.equal((el.html.match(/odx odg/g) || []).length, groups, t);
    assert.equal(el.attrs['aria-label'], t);
    assert.equal((el.html.match(/class="od"/g) || []).length, (t.match(/\d/g) || []).length, 'стовпчик на кожну цифру');
    assert.ok(/<span class="odx">[  ]<\/span><span class="odx">₴<\/span>$/.test(el.html), 'пробіл перед ₴ лишається символом');
  });
});
test('без груп тисяч (999 ₴, «—») .odg немає', function(){
  const a = fakeEl(); c.odoRender(a, '999 ₴', false); assert.ok(!/odg/.test(a.html));
  const b = fakeEl(); c.odoRender(b, '—', false); assert.ok(!/odg/.test(b.html));
});
test('CSS: tabular-nums на .odo, .odg фіксованої ширини, цифри по центру стовпчика', function(){
  const css = fs.readFileSync(path.join(__dirname, '..', 'css', 'app.css'), 'utf8');
  assert.match(css, /\.odo\{[^}]*font-variant-numeric:tabular-nums/);
  assert.match(css, /\.odg\{[^}]*width:\.3em/);
  assert.match(css, /\.odc\{[^}]*text-align:center/);
});
