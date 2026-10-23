// Rev 2.32.157 (ICON-NEUTRAL): bankIcon — логотип лише для відомих банків, інакше нейтральне коло з іконкою картки (борги) чи календаря з гривнею (ОЧ).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildSandbox } = require('./extract');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const c = buildSandbox({ __bankIconSeq: 0, stripLeadingEmoji: function(x){ return x; } }, ['EMPTY_STATE_ICONS', 'bankIcon']);
test('відомі банки (Приват, Моно, ПУМБ, Sense, Райффайзен) — логотип, не нейтральне коло; незалежно від виду й регістру', function(){
  ['Приватбанк', 'ПриватБанк 2', 'Монобанк', 'моно чорна', 'ПУМБ', 'Sense Bank', 'Райффайзен', 'Raiffeisen'].forEach(function(n){
    ['card', 'installment'].forEach(function(k){
      const h = c.bankIcon(n, 38, true, k);
      assert.match(h, /^<svg/, n); assert.ok(!/bank-badge-generic/.test(h), n);
    });
  });
});
test('невідомий банк: нейтральне коло з іконкою картки (борги) / календаря з гривнею (ОЧ), розмір із параметра', function(){
  const card = c.bankIcon('Картка 1', 38, true, 'card');
  assert.match(card, /class="bank-badge bank-badge-generic"/); assert.match(card, /width:38px; height:38px;/);
  assert.match(card, /<rect x="2\.5" y="5" width="19" height="14" rx="2\.5"\/>/); assert.ok(!/₴/.test(card));
  const inst = c.bankIcon('Розстрочка 1', 38, true, 'installment');
  assert.match(inst, /class="bank-badge bank-badge-generic"/); assert.match(inst, />₴<\/text>/); assert.ok(!/<rect x="2\.5" y="5"/.test(inst));
  assert.match(c.bankIcon('Невідомий', 22), /width:22px; height:22px;/);
  assert.ok(!/РО|КА|[А-Яа-я]{2}<\/span>/.test(card.replace(/aria-hidden[^>]*>/, '>')), 'літер-ініціалів більше немає');
  assert.match(card, /aria-hidden="true"/);
});
test('без виду — за замовчуванням картка; порожня й не-рядкова назва — нейтральне коло (не падає)', function(){
  assert.match(c.bankIcon('Щось', 34, true), /<rect x="2\.5" y="5"/);
  ['', null, undefined, '   ', '🏦'].forEach(function(n){
    const h = c.bankIcon(n, 38, true, 'installment');
    assert.match(h, /bank-badge-generic/); assert.match(h, />₴<\/text>/);
  });
});
test('виклики: рядки й шторки передають вид (борги — card, ОЧ — installment); CSS: фон і колір токенами, коло, іконка 58%', function(){
  assert.equal((SRC.match(/bankIcon\([^)]*'installment'\)/g) || []).length, 4);
  assert.equal((SRC.match(/bankIcon\([^)]*'card'\)/g) || []).length, 4);
  assert.ok(!/bankIcon\(d\.name\)/.test(SRC) && !/bankIcon\(name, 3[48], true\)/.test(SRC));
  assert.match(SRC, /\.bank-badge\.bank-badge-generic\{ background:var\(--color-surface-hover\); color:var\(--color-text-secondary\); border-radius:50%;/);
  assert.match(SRC, /width:58%; height:58%/);
});
