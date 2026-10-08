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
const M3_START = SRC.lastIndexOf('/*', SRC.indexOf('Rev 2.26.0 (M3) — токени дизайн-системи'));
const M3_END = SRC.lastIndexOf('/*', SRC.indexOf('Rev 2.24.0 (M1) — prefers-reduced-motion'));
const M3 = SRC.slice(M3_START, M3_END).replace(/\/\*[\s\S]*?\*\//g, '');

test('backdrop-filter — лише таббар і scroll-top (на кнопках M3 його немає)', () => {
  const sels = [];
  const re = /([^{}]+)\{([^{}]*)\}/g; let m;
  while((m = re.exec(CSS))){ if(/(^|[;\s])(-webkit-)?backdrop-filter\s*:/.test(m[2])) sels.push(m[1].trim()); }
  assert.ok(sels.length >= 2);
  sels.forEach(sel => assert.ok(/^(\.tabbar-glass|\.scroll-top-btn)$/.test(sel), 'backdrop-filter на ' + sel));
  assert.ok(!/backdrop-filter/.test(M3), 'у блоці M3 немає backdrop-filter');
});

test('нові правила M3: радіуси лише зі шкали --ui-r-*, переходи без дорогих властивостей, без !important', () => {
  assert.ok(M3.length > 2000, 'блок M3 знайдено');
  const radii = [...M3.matchAll(/border-radius\s*:\s*([^;}]+)/g)].map(r => r[1].trim());
  assert.ok(radii.length >= 10, "радіусів у блоці M3: " + radii.length);
  radii.forEach(r => assert.ok(/^(var\(--ui-r-(container|control|small|pill)\)|min\(var\(--ui-r-control\), 50%\)|inherit)$/.test(r), 'радіус поза шкалою: ' + r));
  const trans = [...M3.matchAll(/transition\s*:\s*([^;}]+)/g)].map(r => r[1]);
  assert.ok(trans.length >= 2);
  trans.forEach(t => assert.ok(!/(^|,)\s*(all|width|height|top|left|margin|padding|box-shadow|filter|backdrop-filter)\b/.test(t), 'дорогий transition: ' + t));
  assert.ok(!/!important/.test(M3));
});

test('контраст токенів кнопок ≥ 4.5:1 в обох темах (композит скла над поверхнею)', () => {
  const C = (a, b) => j(`contrastRatio(${JSON.stringify(a)},${JSON.stringify(b)})`);
  const over = (fg, bg) => j(`compositeColor(${JSON.stringify(fg)},${JSON.stringify(bg)})`);
  const themes = {
    light: { surface: '#FFFFFF', text: '#101828', text2: '#64748B', accentText: '#166534', dangerText: '#B91C1C', glass: 'rgba(255,255,255,.52)' },
    dark: { surface: '#151B26', text: '#F1F4F8', text2: '#94A0B4', accentText: '#34D673', dangerText: '#F87171', glass: 'rgba(21,27,38,.62)' }
  };
  Object.entries(themes).forEach(([name, t]) => {
    const glass = over(t.glass, t.surface);
    assert.ok(C(t.text, glass) >= 4.5, name + ' текст на склі');
    assert.ok(C(t.text2, glass) >= 4.5, name + ' текст-2 на склі');
    assert.ok(C(t.accentText, over('rgba(34,197,94,.16)', t.surface)) >= 4.5, name + ' акцент-текст на акцент-фоні (сегмент/чип)');
    assert.ok(C(t.dangerText, over('rgba(239,68,68,.08)', t.surface)) >= 4.5, name + ' небезпека-текст на червоній підкладці');
  });
  ['#15803D', '#DC2626', '#B45309'].forEach(bg => assert.ok(C('#FFFFFF', bg) >= 4.5, 'білий на ' + bg));
});

test('тестовий варіант button-style у реєстрі; data-ui виставляється до першого малювання (anti-FOUC), стилі лише під [data-ui="glass"]', () => {
  assert.match(SRC, /id: 'button-style'[\s\S]*?defaultVariant: 'glass'/);
  assert.match(SRC, /<anti-fouc-data-ui>[\s\S]*?setAttribute\('data-ui', ui\)/);
  // усі правила в блоці M3 (крім токенів :root, .seg-indicator{display:none}, reduced-motion) — під html[data-ui="glass"]
  const rules = [...M3.matchAll(/([^{}]+)\{[^{}]*\}/g)].map(m => m[1].trim()).filter(Boolean);
  rules.forEach(sel => assert.ok(/^(:root|html\[data-ui="glass"\]|\.seg-indicator\{|\.seg-indicator$|@media)/.test(sel.replace(/\s+/g, ' ')) || /^:root\[data-theme="dark"\]/.test(sel) || sel.startsWith('html[data-ui="glass"]'), 'правило поза glass: ' + sel.slice(0, 80)));
});
