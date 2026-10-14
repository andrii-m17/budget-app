// Rev 2.32.36 (L) — значок Monobank: лише для source='mono', aria-label, один <symbol>, без зовнішніх ресурсів, мінус U+2212.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildSandbox } = require('./extract');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const c = buildSandbox({}, ['monoBadgeHtml']);
test('значок з\'являється лише для source = mono; є role і aria-label', function(){
  assert.equal(c.monoBadgeHtml(undefined), ''); assert.equal(c.monoBadgeHtml('manual'), '');
  const h = c.monoBadgeHtml('mono');
  assert.match(h, /role="img"/); assert.match(h, /aria-label="Monobank"/); assert.match(h, /<use href="#monoicon"\/>/);
});
test('у розмітці один <symbol id="monoicon">; унікальні id градієнта й clipPath; без зовнішніх ресурсів і скриптів', function(){
  assert.equal((SRC.match(/<symbol /g) || []).length, 1);
  const sym = SRC.match(/<symbol id="monoicon"[\s\S]*?<\/symbol>/)[0];
  assert.equal((SRC.match(/id="monoGrad"/g) || []).length, 1); assert.equal((SRC.match(/id="monoClip"/g) || []).length, 1);
  assert.ok(!/http|<script|<style|href=|xlink/.test(sym));
  assert.ok(!/clip0_2045_1375|paint0_linear_2045_1375/.test(SRC));
});
test('«з банку» текстом більше немає; сума в «Вхідних» і Журналі — з типографським мінусом U+2212, без дефіса', function(){
  assert.ok(!/class="exp-source"/.test(SRC));
  assert.match(SRC, /\(inflow \? '\+' : '−'\)/);
  assert.match(SRC, /const sign = isIncome \? '\+' : '−';/);
});
