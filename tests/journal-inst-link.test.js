// Rev 2.32.140 (JOURNAL-INST): позначка прив'язки витрати до ОЧ у Журналі.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildSandbox } = require('./extract');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
function mk(accs){ return buildSandbox({ escapeHtml: esc, escapeAttr: esc, installmentAccounts: accs }, ['INST_LINK_ICON_SVG', 'installmentLinkBadgeHtml']); }
test('з прив\'язкою: значок і назва, aria-label', function(){
  const h = mk([{ name: 'Ноутбук1' }]).installmentLinkBadgeHtml({ kind: 'expense', linkedInstallment: 'Ноутбук1' });
  assert.match(h, /class="exp-inst-link"/); assert.match(h, /<svg/); assert.match(h, /<span>Ноутбук1<\/span>/);
  assert.match(h, /aria-label="Прив'язано до ОЧ: Ноутбук1"/);
});
test('без прив\'язки і для доходу — порожньо', function(){
  const c = mk([{ name: 'A' }]);
  assert.equal(c.installmentLinkBadgeHtml({ kind: 'expense' }), '');
  assert.equal(c.installmentLinkBadgeHtml({ kind: 'income', linkedInstallment: 'A' }), '');
});
test('ОЧ не знайдена: лише значок без назви', function(){
  const h = mk([]).installmentLinkBadgeHtml({ kind: 'expense', linkedInstallment: 'Зникла' });
  assert.match(h, /<svg/); assert.ok(!/<span>/.test(h.replace(/^<span[^>]*>/, ''))); assert.ok(!/Зникла/.test(h));
});
test('назва екранується', function(){
  const h = mk([{ name: '<b>x</b>' }]).installmentLinkBadgeHtml({ kind: 'expense', linkedInstallment: '<b>x</b>' });
  assert.ok(!/<b>/.test(h)); assert.match(h, /&lt;b&gt;/);
});
test('довга назва і висота: рядок nowrap, назва без «…», значок не стискається; нових кольорів немає', function(){
  assert.match(SRC, /\.exp-meta\.has-inst\{ flex-wrap:nowrap; \}/);
  const css = SRC.match(/\.exp-inst-link\{[^}]*\}/)[0];
  assert.match(css, /white-space:nowrap/); assert.match(css, /overflow:hidden/); assert.match(css, /var\(--color-accent-purple\)/);
  assert.match(SRC, /\.exp-inst-link > span\{[^}]*text-overflow:clip/);
  assert.match(SRC, /\.exp-inst-link svg\{[^}]*width:13px; height:13px/);
  assert.match(SRC, /\$\{instLinkHtml\}<\/div>/);
});
