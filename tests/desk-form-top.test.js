// Rev 2.32.153 (DESK-FORM-TOP): ліва колонка «Нова витрата» не розтягується на висоту правої й не центрується; мобільна розкладка не змінена.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const media = (function(){ const i = SRC.indexOf('#vytraty-default-view{ display:grid;'); const st = SRC.lastIndexOf('@media (min-width:768px){', i); return SRC.slice(st, SRC.indexOf('#vytraty-default-view .vytraty-recent-col', i)); })();
test('desktop (≥768px): колонка форми align-self:start, картка без margin:auto; сітка двоколонкова', function(){
  assert.match(media, /#vytraty-default-view\{ display:grid; grid-template-columns:minmax\(280px,420px\) 1fr; gap:24px; align-items:stretch; \}/);
  assert.match(media, /#vytraty-default-view \.vytraty-form-col\{ display:flex; flex-direction:column; align-self:start; \}/);
  assert.match(media, /\.vytraty-form-col \.entry-card\{ margin-top:0; margin-bottom:0; \}/);
  assert.ok(!/entry-card\{ margin-top:auto/.test(media), 'розтягування/центрування по висоті прибрано');
  assert.ok(!/vytraty-form-col\{[^}]*height:\s*100%/.test(media), 'висоту колонки не розтягуємо');
});
test('порядок і клас колонок: .vytraty-form-col першою, .vytraty-recent-col другою у #vytraty-default-view; заголовок «Нова витрата» зверху колонки', function(){
  const v = SRC.slice(SRC.indexOf('<div id="vytraty-default-view">'));
  assert.ok(v.indexOf('class="vytraty-form-col"') > -1 && v.indexOf('class="vytraty-form-col"') < v.indexOf('vytraty-recent-col'));
  assert.ok(v.indexOf('vytraty-form-title">Нова витрата') < v.indexOf('class="card entry-card expense-entry'));
});
test('мобільна розкладка не змінена: правило align-self для колонки лише всередині @media (min-width:768px)', function(){
  const rule = 'align-self:start';
  const all = [...SRC.matchAll(/\.vytraty-form-col\{[^}]*align-self:start[^}]*\}/g)];
  assert.equal(all.length, 1);
  assert.ok(media.includes(rule));
  assert.match(SRC, /\.vytraty-form-col\{ min-width:0; \}/); // базове правило без змін
});
