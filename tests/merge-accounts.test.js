// Rev 2.32.226 (MERGE-ACCOUNTS): картки й ОЧ на спільному злитті.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildSandbox } = require('./extract');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const g = buildSandbox({}, ['accSetField', 'ACC_NULLABLE_FIELDS', 'mdMerge', 'mdFieldEq', 'hiddenDecisionParts']);
const J = (x) => JSON.parse(JSON.stringify(x));

test('accSetField: порожнє значення nullable-поля стає null, а числа/назви лишаються', function(){
  const r = { creditLimit: 1, paymentDay: 5, name: 'x', payment: 10 };
  g.accSetField(r, 'paymentDay', ''); g.accSetField(r, 'payment', 2000); g.accSetField(r, 'name', '');
  assert.equal(r.paymentDay, null); assert.equal(r.payment, 2000); assert.equal(r.name, '');
});
test('різні поля зливаються, те саме поле — сервер і конфлікт (для картки в журнал), name — тихе поле', function(){
  const dom = { fields: ['creditLimit', 'paymentDay', 'name'] };
  const base = { creditLimit: 100, paymentDay: 5, name: 'А' };
  const diff = g.mdMerge(dom, base, { creditLimit: 200, paymentDay: 5, name: 'А' }, { creditLimit: 100, paymentDay: 9, name: 'А' });
  assert.deepEqual(J(diff.values), { creditLimit: 200, paymentDay: 9, name: 'А' }); assert.equal(diff.conflicts.length, 0);
  const same = g.mdMerge(dom, base, { creditLimit: 200, paymentDay: 5, name: 'Б' }, { creditLimit: 300, paymentDay: 5, name: 'В' });
  assert.deepEqual(J(same.values), { creditLimit: 300, paymentDay: 5, name: 'В' }); assert.deepEqual(J(same.conflicts).map(c => c.field), ['creditLimit', 'name']);
});
test('джерело: домени рахунків, тихі поля, зліпок після старого шляху, перейменування сервером іде в каскад', function(){
  assert.match(SRC, /bankAccounts: \{\n    key: 'bankAccounts', table: 'bank_accounts', fields: \['creditLimit', 'paymentDay', 'name'\], optional: \[\], silentFields: \['name'\]/);
  assert.match(SRC, /installmentAccounts: \{\n    key: 'installmentAccounts', table: 'installment_accounts', fields: \['initialAmount', 'dueDay', 'termMonths', 'startDate', 'firstPayment', 'payMode', 'payment', 'name'\]/);
  assert.match(SRC, /afterMerge: function\(rec, oldName\)\{[\s\S]*cascadeInstallmentRename\(rec, oldName, rec\.name\)/);
  assert.match(SRC, /mdPullDirty\(MERGE_DOMAINS\.bankAccounts, byCloudId, row/);
  assert.match(SRC, /mdPullDirty\(MERGE_DOMAINS\.installmentAccounts, byCloudId, row/);
  assert.match(SRC, /mdPushCas\(MERGE_DOMAINS\.bankAccounts, acc/);
  assert.match(SRC, /mdPushCas\(MERGE_DOMAINS\.installmentAccounts, acc/);
  assert.match(SRC, /dom\.silentFields && merged\.conflicts\.length/);
});
