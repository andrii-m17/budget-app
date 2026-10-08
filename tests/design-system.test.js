// Rev 2.26.0 (M3) — дизайн-система: відповідність клас→варіант, контраст, зона натискання, охоронні тести CSS (docs/DESIGN_SYSTEM.md).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ex = require('./extract');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const CSS = [...SRC.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m => m[1]).join('\n').replace(/\/\*[\s\S]*?\*\//g, '');
const NAMES = ['buttonVariantOf', 'meetsMinTarget', 'parseCssColor', 'compositeColor', 'relativeLuminance', 'contrastRatio'];
const ctx = ex.buildSandbox({}, ['BUTTON_VARIANT_MAP', 'BUTTON_MODIFIER_CLASSES'].concat(NAMES));
const j = code => JSON.parse(ex.evalInSandbox(ctx, 'JSON.stringify(' + code + ')'));

test('contrastRatio: еталонні значення WCAG; прозорий fg композититься над bg', () => {
  assert.equal(j("contrastRatio('#000000','#ffffff')"), 21);
  assert.equal(j("contrastRatio('#ffffff','#ffffff')"), 1);
  assert.ok(Math.abs(j("contrastRatio('#777777','#ffffff')") - 4.48) < 0.02);
  assert.ok(j("contrastRatio('rgb(255,255,255)','rgb(34,197,94)')") < 2.4, 'білий на #22C55E не проходить AA');
  assert.ok(j("contrastRatio('rgba(0,0,0,0.5)','#ffffff')") < j("contrastRatio('#000000','#ffffff')"));
  assert.equal(j("contrastRatio('нісенітниця','#fff')"), 0);
});

test('meetsMinTarget: ≥44 за обома вимірами; власний мінімум', () => {
  assert.equal(j('meetsMinTarget(44,44)'), true);
  assert.equal(j('meetsMinTarget(43.9,60)'), false);
  assert.equal(j('meetsMinTarget(60,40)'), false);
  assert.equal(j('meetsMinTarget(30,30,24)'), true);
});

test('buttonVariantOf: комбінації класів і батьківські контейнери', () => {
  const v = (c, p) => j(`buttonVariantOf(${JSON.stringify(c)},${JSON.stringify(p || '')})`);
  assert.equal(v('submit-btn'), 'primary');
  assert.equal(v('submit-btn pill income'), 'primary');
  assert.equal(v('submit-btn secondary'), 'secondary');
  assert.equal(v('submit-btn secondary journal-empty-reset'), 'secondary');
  assert.equal(v('submit-btn danger-outline hidden'), 'danger');
  assert.equal(v('submit-btn danger'), 'danger');
  assert.equal(v('struct-tab-btn active'), 'segment');
  assert.equal(v('trash-chip'), 'chip');
  assert.equal(v('', 'n-days'), 'chip');
  assert.equal(v('', 'tabbar-glass'), 'reference');
  assert.equal(v('gear-btn update-btn'), 'icon');
  assert.equal(v('невідомий-клас'), null);
  assert.equal(v(''), null);
});

test('КОЖЕН клас кнопки в розмітці/шаблонах має варіант; жоден клас не належить двом варіантам', () => {
  const found = new Set();
  const add = str => str.split(/\s+/).filter(Boolean).forEach(c => found.add(c));
  for(const m of SRC.matchAll(/<button\b[^>]*?class=["']([^"']+)["']/g)) add(m[1]);
  for(const m of SRC.matchAll(/testingEl\('button',\s*'([^']+)'/g)) add(m[1]);
  const modifiers = new Set(j('BUTTON_MODIFIER_CLASSES'));
  const missing = [...found].filter(c => !modifiers.has(c) && j(`buttonVariantOf(${JSON.stringify(c)})`) === null)
    // класи, що самі по собі модифікатори стану/кольору
    .filter(c => !['hidden', 'active', 'danger', 'secondary', 'debt', 'expense', 'income', 'pill', 'btn-loading', 'tab-vytraty'].includes(c));
  assert.deepEqual(missing, [], 'без варіанта: ' + missing.join(', '));
  const map = j('BUTTON_VARIANT_MAP');
  const seen = {};
  Object.entries(map).forEach(([variant, list]) => list.forEach(c => { assert.ok(!seen[c], `${c} у двох варіантах: ${seen[c]} і ${variant}`); seen[c] = variant; }));
  assert.ok(found.size >= 50, 'знайдено класів: ' + found.size);
});

// ---- CSS охорона ----
const CSS_ALL = [...SRC.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m => m[1]).join('\n');
const M3_START = SRC.lastIndexOf('/*', SRC.indexOf('Rev 2.26.0 (M3) — токени дизайн-системи'));
const M3_END = SRC.lastIndexOf('/*', SRC.indexOf('Rev 2.30.0 (M4b) — решта компонентів у стилі'));
const M4B_START = M3_END;
const M4B_END = SRC.lastIndexOf('/*', SRC.indexOf('Rev 2.30.0 (M4b) — вміст колишніх другого й третього'));
const M4B = SRC.slice(M4B_START, M4B_END).replace(/\/\*[\s\S]*?\*\//g, '');
const M3 = SRC.slice(M3_START, M3_END).replace(/\/\*[\s\S]*?\*\//g, '');

test('backdrop-filter — лише таббар і scroll-top (на кнопках M3 його немає)', () => {
  const sels = [];
  const re = /([^{}]+)\{([^{}]*)\}/g; let m;
  while((m = re.exec(CSS))){ if(/(^|[;\s])(-webkit-)?backdrop-filter\s*:/.test(m[2])) sels.push(m[1].trim()); }
  assert.ok(sels.length >= 2);
  sels.forEach(sel => assert.ok(/^(\.tabbar-glass|\.scroll-top-btn)$/.test(sel), 'backdrop-filter на ' + sel));
  assert.ok(!/backdrop-filter/.test(M3), 'у блоці M3 немає backdrop-filter');
});

test('нові правила M3/M4b: радіуси лише зі шкали --ui-r-*, переходи без дорогих властивостей, без !important', () => {
  const css = M3 + '\n' + M4B;
  assert.ok(M3.length > 2000 && M4B.length > 1000, 'блоки знайдено');
  const radii = [...css.matchAll(/border-radius\s*:\s*([^;}]+)/g)].map(r => r[1].trim());
  assert.ok(radii.length >= 14, 'радіусів: ' + radii.length);
  radii.forEach(r => assert.ok(/^(var\(--ui-r-(container|control|small|pill)\)|min\(var\(--ui-r-control\), 50%\)|inherit)$/.test(r), 'радіус поза шкалою: ' + r));
  const trans = [...css.matchAll(/transition\s*:\s*([^;}]+)/g)].map(r => r[1]);
  assert.ok(trans.length >= 3);
  trans.forEach(x => assert.ok(!/(^|,)\s*(all|width|height|top|left|margin|padding|box-shadow|filter|backdrop-filter)\b/.test(x), 'дорогий transition: ' + x));
  assert.ok(!/!important/.test(css));
});

test('M4b: «Скло» — єдиний стиль: жодних data-ui/data-fill, тест button-style прибрано, префікс html:root', () => {
  assert.ok(!/data-ui|data-fill|anti-fouc-data-ui|glass-vivid|button-style['"]/.test(SRC.replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, '')), 'гілки data-ui лишились');
  assert.ok(!/applyButtonStyle/.test(SRC));
  assert.ok((M3.match(/html:root /g) || []).length >= 30);
});

test('M4b: !important лишився лише в блоці prefers-reduced-motion (свідоме перевизначення авторських переходів); другого <style> немає', () => {
  const noComments = CSS_ALL.replace(/\/\*[\s\S]*?\*\//g, '');
  const lines = noComments.split('\n').filter(l => /!important/.test(l));
  assert.equal(lines.length, 3, lines.join(' | '));
  lines.forEach(l => assert.ok(/transition-duration:80ms !important|animation:none !important/.test(l), l));
  assert.equal((SRC.match(/^\s*<style>\s*$/gm) || []).length, 1, 'один блок <style>');
  assert.ok(!/margin-right:0 !important|color:transparent !important|caret-color:transparent !important/.test(SRC));
});

test('M4b: swipe-restore/purge і заливки кнопок мають білий текст ≥4.5:1; тумблер/картки/поля/тости/модалки використовують токени (без хардкоду радіусів)', () => {
  const C = (a, b) => j(`contrastRatio(${JSON.stringify(a)},${JSON.stringify(b)})`);
  assert.match(M4B, /\.swipe-restore-btn\{ background:var\(--ui-success-strong\); \}/);
  assert.match(M4B, /\.swipe-purge-btn\{ background:var\(--ui-danger-strong\); \}/);
  assert.ok(C('#FFFFFF', '#15803D') >= 4.5 && C('#FFFFFF', '#DC2626') >= 4.5);
  ['.n-switch-input', '.live-toast', '.app-modal', '.field input', '.card-debt-compact-row', '.service-tile'].forEach(sel => assert.ok(M4B.includes(sel), sel));
  assert.ok(!/backdrop-filter/.test(M4B), 'на нових компонентах розмиття немає');
  assert.match(M4B, /background-color:var\(--ui-glass\)/, 'поля: background-color, щоб не скидати стрілку select');
  assert.ok(!/id=|\bname=|autocomplete|readonly/.test(M4B), 'поля: id/атрибути не змінюються в CSS-блоці');
});

test('M4b: bdr-icon-btn — асиметрична зона (45pt по ширині, 41pt по висоті = найменший крок рядків) без перекриття; виняток по висоті задокументований', () => {
  assert.match(SRC, /html:root \.bdr-icon-btn\{ --ui-hit-y:8\.5px; --ui-hit-l:20px; --ui-hit-r:1px; \}/);
  assert.match(SRC, /html:root \.bdr-icon-btn\.danger\{ --ui-hit-l:1px; --ui-hit-r:20px; \}/);
  assert.match(SRC, /const UI_AUDIT_SMALL_EXEMPT = \[[^\]]*\];/);
});
