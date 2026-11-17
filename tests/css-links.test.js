// Rev 2.32.334 (DS-1): посилання на стилі в <head> несуть мітку ?v=<APP_VERSION> (розбиває кеш браузера й SW); токени підключено перед app.css; sw.js шукає стилі в кеші з ignoreSearch; псевдоніми нових назв ведуть на існуючі змінні.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { cssLinks } = require('./extract');
const root = path.join(__dirname, '..');
const INDEX = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const SW = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
const TOK = fs.readFileSync(path.join(root, 'css', 'tokens.css'), 'utf8');
const APP = fs.readFileSync(path.join(root, 'css', 'app.css'), 'utf8');
const VERSION = (INDEX.match(/const APP_VERSION = '([^']+)'/) || [])[1];

test('мітка версії в посиланнях на стилі збігається з APP_VERSION; tokens.css перед app.css', function(){
  const tags = INDEX.match(/<link rel="stylesheet" href="\.\/css\/[a-z0-9-]+\.css[^"]*">/g) || [];
  assert.equal(tags.length, 2);
  tags.forEach(function(t){ assert.ok(t.indexOf('?v=' + VERSION + '"') !== -1, t + ' має містити ?v=' + VERSION); });
  assert.deepEqual(cssLinks(INDEX), ['css/tokens.css', 'css/app.css']);
  assert.ok(INDEX.indexOf('css/tokens.css') < INDEX.indexOf('css/app.css'));
});
test('sw.js: tokens.css і app.css в APP_SHELL; офлайн-пошук стилів з ignoreSearch', function(){
  assert.match(SW, /'\.\/css\/tokens\.css'/); assert.match(SW, /'\.\/css\/app\.css'/);
  assert.match(SW, /caches\.match\(req, \{ ignoreSearch: true \}\)/);
});
test('tokens.css: усі блоки змінних на :root, app.css не оголошує змінних на :root', function(){
  assert.match(TOK, /:root\[data-theme="dark"\]\{/);
  assert.ok(!/^  :root\s*\{/m.test(APP), 'у app.css немає блоків :root{ верхнього рівня (лишився лише :root у @media prefers-reduced-motion, свідомо: перевизначає токени руху)');
  assert.ok(!/^  :root\[data-theme="dark"\]\{/m.test(APP));
  assert.match(TOK, /--kb-dur:250ms/);
});
test('нові назви DS-PLAN §1: псевдоніми ведуть на змінні, оголошені в tokens.css; решта має значення', function(){
  const declared = new Set((TOK.replace(/\/\*[^]*?\*\//g, '').match(/--[a-zA-Z0-9-]+(?=\s*:)/g) || []));
  const aliases = (TOK.replace(/\/\*[^]*?\*\//g, '').match(/(--[a-z0-9-]+):\s*var\((--[a-z0-9-]+)\)/g) || []).map(function(x){ const m = x.match(/(--[a-z0-9-]+):\s*var\((--[a-z0-9-]+)\)/); return [m[1], m[2]]; });
  const newNames = ['--bg', '--surface', '--surface-2', '--line', '--line-strong', '--text', '--text-2', '--text-3', '--accent', '--accent-text', '--accent-bg', '--accent-line', '--income', '--expense', '--debt', '--inst', '--glass', '--glass-press', '--glass-edge', '--glass-edge-2', '--glass-shadow', '--r-s', '--r-m', '--r-pill', '--t-micro', '--t-s', '--t-m', '--t-l', '--t-count'];
  newNames.forEach(function(n){ const a = aliases.filter(function(x){ return x[0] === n; })[0]; assert.ok(a, n + ': є псевдонім'); assert.ok(declared.has(a[1]), n + ' → ' + a[1] + ' існує'); });
  ['--r-l', '--r-xl', '--stagger', '--cat-bar', '--sub-bar', '--k1', '--k2', '--k3', '--k4', '--k5', '--k6'].forEach(function(n){ assert.ok(declared.has(n), n + ' оголошено'); });
  // DS-2 (Rev 2.32.335+): нові назви вже вживаються в app.css; --income/--expense/--debt/--inst свідомо ні (збіг лише за значенням, не за змістом)
  assert.ok(!/var\(--(income|expense|debt|inst)\)/.test(APP));
});
