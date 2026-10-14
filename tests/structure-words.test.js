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
test('рядок слова (варіант A): слово 17 пт, підпис під ним 13 пт, ›; немає «без підкатегорії» й значків праворуч; підпис екранований', function(){
  const fn = SRC.slice(SRC.indexOf('function structDictWordRow'), SRC.indexOf('function renderStructureDictionary'));
  assert.ok(!/без підкатегорії/.test(SRC.slice(SRC.indexOf('function wordRowModel'), SRC.indexOf('function renderStructureDictionary'))));
  assert.match(fn, /escapeHtml\(m\.badge\.name\)/); assert.match(fn, /escapeHtml\(m\.badge\.emoji\)/); assert.match(fn, /struct-word-sub/); assert.match(fn, /struct-row-chev/);
  assert.ok(!/struct-badge/.test(SRC), 'значків із 2.32.56 немає');
  assert.match(SRC, /\.struct-word-text\{ font-size:17px;/); assert.match(SRC, /\.struct-word-sub\{ font-size:13px; line-height:1\.25; color:var\(--color-text-secondary\);/);
  assert.match(SRC, /\.struct-dict-inner \.struct-row\{ min-height:52px; \}/); assert.match(SRC, /\.struct-dict-inner \.struct-row:has\(\.struct-word-sub\)\{ min-height:64px; \}/);
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
