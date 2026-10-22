// Rev 2.32.149 (OCH-WARN): «!» (частковий платіж) біля платежу ОЧ прибрано; внесений платіж реальний незалежно від типового.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildSandbox } = require('./extract');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const c = buildSandbox({}, ['installmentRowPaid']);
test('платіж менший, більший, рівний типовому — внесено (галочка), «!» немає; не внесено — без бейджа', function(){
  assert.equal(c.installmentRowPaid(3000), true);  // менший за типовий 5000
  assert.equal(c.installmentRowPaid(7000), true);  // більший
  assert.equal(c.installmentRowPaid(5000), true);  // рівний
  assert.equal(c.installmentRowPaid(0), false);    // не внесено
  assert.equal(c.installmentRowPaid(null), false); assert.equal(c.installmentRowPaid(undefined), false);
});
test('розмітка рядка ОЧ: немає жовтого бейджа/«!», немає класу partial, галочка лише при paid; формули typicalMonthlyPayment/estimateInstallment не змінені', function(){
  const row = SRC.slice(SRC.indexOf('const paid = installmentRowPaid(linkedSum)'), SRC.indexOf('const dueSub'));
  assert.ok(!/partial|WARNING/.test(row));
  assert.match(row, /paid \? `<span class="cdr-paid-badge" aria-hidden="true">\$\{CHECK\}<\/span>` : ''/);
  assert.ok(!/cdr-paid-badge\.partial|cdr-minpay\.partial/.test(SRC));
  assert.match(SRC, /const pay = linkedSum > 0 \? linkedSum : typicalPay;/);
  assert.match(SRC, /function typicalMonthlyPayment\(name, kind, beforeMonth\)/);
});
