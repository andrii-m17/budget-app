// Rev 2.32.56 (W) — рядки слів (підпис-значок підкатегорії) і скидання стану «Словника».
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildSandbox } = require('./extract');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const j = function(v){ return JSON.parse(JSON.stringify(v)); };
const c = buildSandbox({}, ['splitLeadingEmoji', 'wordRowModel']);
test('wordRowModel: підпис лише при наявній підкатегорії (емодзі + назва); без підкатегорії — null', function(){
  assert.deepEqual(j(c.wordRowModel({ kw: 'кава', sub: '☕ Кава' }, [])), { text: 'кава', badge: { emoji: '☕', name: 'Кава' } });
  assert.deepEqual(j(c.wordRowModel({ kw: 'суші', sub: null }, [])), { text: 'суші', badge: null });
  assert.deepEqual(j(c.wordRowModel({ kw: 'x', sub: '' }, [])), { text: 'x', badge: null });
  assert.deepEqual(j(c.wordRowModel({ kw: 'y', sub: 'Без емодзі' }, [])), { text: 'y', badge: { emoji: '', name: 'Без емодзі' } });
});
test('охоронні: немає тексту «без підкатегорії»; підпис екранований; другого розкриття немає; стилі значка за макетом', function(){
  assert.ok(!/без підкатегорії/.test(SRC.slice(SRC.indexOf('function wordRowModel'), SRC.indexOf('function onStructDictSearch'))));
  const fn = SRC.slice(SRC.indexOf('function structDictWordRow'), SRC.indexOf('function onStructDictSearch'));
  assert.match(fn, /escapeHtml\(m\.badge\.name\)/); assert.match(fn, /escapeHtml\(m\.badge\.emoji\)/);
  const css = SRC.match(/\.struct-badge\{([^}]*)\}/)[1];
  assert.match(css, /height:28px/); assert.match(css, /border-radius:14px/); assert.match(css, /max-width:50%/); assert.match(css, /font-size:14px/); assert.match(css, /rgba\(255,255,255,\.07\)/);
  assert.match(SRC, /:root\[data-theme="light"\] \.struct-badge\{ background:rgba\(0,0,0,\.06\); \}/);
  assert.match(SRC, /\.struct-badge-text\{ min-width:0; overflow:hidden; text-overflow:ellipsis; \}/);
});
test('скидання: вхід/вихід із сегмента й вихід із вкладки скидають групи, пошук і прокрутку; повернення з фону — ні', function(){
  assert.match(SRC, /const wasDictionary = !document\.getElementById\('struct-tab-panel-dictionary'\)\.classList\.contains\('hidden'\);/);
  assert.match(SRC, /mc\.scrollTop = 0; \}/);
  assert.match(SRC, /if\(switching && prevTab === 'structure' && typeof structDictLeave === 'function'\) structDictLeave\(fromScroll\);/);
  assert.match(SRC, /tabScrollPositions\['structure'\] = 0;/);
  assert.match(SRC, /function structDictReset\(\)\{\n  structDict = \{ openId: null, query: '' \};\n  const inp = document\.getElementById\('fldstr2'\); if\(inp\) inp\.value = '';/);
  // жодного обробника visibilitychange/pageshow/focus не викликає скидання словника
  const handlers = SRC.match(/addEventListener\('(visibilitychange|pageshow|focus)'[\s\S]{0,300}?\}\);/g) || [];
  assert.ok(handlers.every(function(h){ return !/structDict(Reset|Leave)/.test(h); }));
});
