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
  const newNames = ['--income', '--expense', '--debt', '--inst', '--r-s', '--r-m', '--r-pill', '--t-micro', '--t-s', '--t-m', '--t-l', '--t-count'];
  newNames.forEach(function(n){ const a = aliases.filter(function(x){ return x[0] === n; })[0]; assert.ok(a, n + ': є псевдонім'); assert.ok(declared.has(a[1]), n + ' → ' + a[1] + ' існує'); });
  // DS-N1 (Rev 2.32.339): палітра має власні значення нових назв; старі назви — псевдоніми на них
  ['--bg', '--surface', '--surface-2', '--line', '--line-strong', '--text', '--text-2', '--text-3', '--accent', '--accent-text', '--accent-bg', '--accent-line', '--glass', '--glass-press', '--glass-edge', '--glass-edge-2', '--glass-shadow'].forEach(function(n){ assert.ok(declared.has(n) && !aliases.some(function(a){ return a[0] === n; }), n + ': власне значення, не псевдонім'); });
  assert.ok(/--color-bg:var\(--bg\)/.test(TOK) && /--color-border-strong:var\(--line-strong\)/.test(TOK) && /--shadow-glass:var\(--glass-shadow\)/.test(TOK), 'старі назви ведуть на нові');
  ['--r-l', '--r-xl', '--stagger', '--cat-bar', '--sub-bar', '--k1', '--k2', '--k3', '--k4', '--k5', '--k6'].forEach(function(n){ assert.ok(declared.has(n), n + ' оголошено'); });
  // DS-2 (Rev 2.32.335+): нові назви вже вживаються в app.css; --income/--expense/--debt/--inst свідомо ні (збіг лише за значенням, не за змістом)
  // Rev 2.32.385 (DS-5a): картка «Сімейний баланс» вперше вживає --income/--expense/--debt/--inst за змістом (DS-PLAN §1, «Зміст»); колишню заборону знято, лічильник DS-2 (hex/rgba/старі назви) лишається в ds-guard.
  assert.ok(/var\(--income\)/.test(APP) && /var\(--inst\)/.test(APP), 'DS-5a: токени змісту вживаються');
});
test('STRUCT-2 (Rev 2.32.345): js/util-*.js підключено звичайними <script src> з ?v=<APP_VERSION> перед основним <script>; у APP_SHELL sw.js; функцій у index.html більше немає', function(){
  const tags = INDEX.match(/<script src="\.\/js\/[a-z0-9-]+\.js[^"]*"><\/script>/g) || [];
  const jsNames = tags.map(function(t){ return t.match(/js\/([a-z0-9-]+\.js)/)[1]; });
  assert.deepEqual(jsNames.slice(0, 4), ['util-format.js', 'util-date.js', 'util-safe.js', 'util-misc.js']); // далі — файли областей (STRUCT-3) у порядку з docs/reports/STRUCT-3-step0.md §5
  const AREAS = ['structure-data.js', 'storage.js', 'cloud-auth.js', 'sync.js', 'diag.js', 'shell.js', 'structure.js', 'analytics.js', 'payments.js', 'sheets.js', 'sheets-forms.js', 'monobank.js', 'notif-push.js', 'accounting.js', 'service.js', 'expenses.js'];
  const idx = jsNames.slice(4).map(function(n){ return AREAS.indexOf(n); }); assert.ok(idx.every(function(i, k){ return i !== -1 && (k === 0 || i > idx[k - 1]); }), 'файли областей підключено в порядку плану: ' + jsNames.slice(4).join(', '));
  tags.forEach(function(t){ assert.ok(t.indexOf('?v=' + VERSION + '"') !== -1, t + ' має містити ?v=' + VERSION); });
  const last = INDEX.lastIndexOf('<script src="./js/'); const main = INDEX.indexOf('\n<script>\n', last);
  assert.ok(last !== -1 && main > last && !/\n<script>\n/.test(INDEX.slice(last, main)), 'основний <script> іде після util-скриптів');
  tags.forEach(function(t){ const f = t.match(/js\/([a-z0-9-]+\.js)/)[1]; assert.match(SW, new RegExp("'\\./js/" + f.replace('.', '\\.') + "'")); assert.ok(fs.existsSync(path.join(root, 'js', f)), f); });
  assert.ok(SW.indexOf(String.raw`\/(css|js)\/[^/]+\.(css|js)(\?|$)/.test(req.url)`) !== -1, 'sw.js: network-first і для js/*.js');
  ['function fmt(', 'function escapeHtml(', 'function monthKey(', 'function localDateISO(', 'const UA_MONTHS', 'function safeId(', 'function parseCssColor('].forEach(function(m){ assert.equal(INDEX.indexOf(m), -1, m + ' має жити в js/util-*.js'); });
  const util = tags.map(function(t){ return fs.readFileSync(path.join(root, 'js', t.match(/js\/([a-z0-9-]+\.js)/)[1]), 'utf8'); }).join('\n');
  ['function fmt(', 'function escapeHtml(', 'function monthKey(', 'function localDateISO(', 'const UA_MONTHS', 'function safeId(', 'function parseCssColor('].forEach(function(m){ assert.ok(util.indexOf(m) !== -1, m); });
});
