// Rev 2.32.178 (ID-BIND-1) — прив'язка за id, етап 1: лише читання (accountId / linkedInstallmentId) + діагностика дублів назв. Синтетичні дані.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildSandbox } = require('./extract');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const fn = (name) => { const i = SRC.indexOf('function ' + name); assert.ok(i >= 0, name); return SRC.slice(i, SRC.indexOf('\n}\n', i) + 3); };

function sandbox(bankAccounts, installmentAccounts){
  return buildSandbox({ bankAccounts, installmentAccounts }, ['accountNameKey', 'findDuplicateAccountNames']);
}
test('діагностика дублів: однакові назви живих карток/ОЧ (без урахування регістру й пробілів) → по одному запису на групу', function(){
  const c = sandbox([{ name: 'Картка А' }, { name: ' картка а ' }, { name: 'Картка Б' }], [{ name: 'ОЧ 1' }, { name: 'ОЧ 1' }, { name: 'ОЧ 1' }, { name: 'ОЧ 2' }]);
  const r = c.findDuplicateAccountNames();
  assert.equal(r.length, 2);
  assert.ok(r.some(i => i.date === 'Картка' && /: 2 /.test(i.reason) && i.target.type === 'debt' && i.target.kind === 'card'));
  assert.ok(r.some(i => i.date === 'ОЧ' && /: 3 /.test(i.reason) && i.target.type === 'installment'));
});
test('діагностика дублів: видалені/приховані записи й порожні назви не рахуються; унікальні — порожньо', function(){
  const c = sandbox([{ name: 'А' }, { name: 'А', deletedAt: '2026-01-01' }, { name: '' }, { name: '' }], [{ name: 'Б' }]);
  assert.equal(c.findDuplicateAccountNames().length, 0);
});
test('діагностика підключена до звіту', function(){
  assert.match(fn('buildDiagnosticsReport'), /Картки й ОЧ: однакові назви', issues: findDuplicateAccountNames\(\)/);
});
test('pull боргів: accountId береться з рядка сервера (картка — bank_account_id, ОЧ — installment_account_id), у нових і наявних записах', function(){
  const src = fn('pullDebtsCore');
  assert.match(src, /const resolvedAccountId = row\.kind === 'card' \? row\.bank_account_id : row\.installment_account_id;/);
  assert.match(src, /local\.accountId = resolvedAccountId/);
  assert.match(src, /const rec = \{ id: row\.id, accountId: resolvedAccountId \|\| undefined,/);
});
test('pull витрат: linkedInstallmentId = linked_installment_id; знімається, коли прив\'язки в сервера нема', function(){
  const src = fn('pullExpensesCore');
  assert.match(src, /local\.linkedInstallmentId = row\.linked_installment_id/);
  assert.match(src, /delete local\.linkedInstallmentId/);
  assert.match(src, /rec\.linkedInstallmentId = row\.linked_installment_id/);
});
test('поведінка не змінена: пошук рахунку/ОЧ далі за cloudId (pull) і назвою (push); нові поля ніде не читаються як ключ', function(){
  const withoutComments = SRC.replace(/\/\/[^\n]*/g, '');
  assert.ok(!/\.find\(function\(\w+\)\{ return \w+\.(id|cloudId) === \w+\.accountId/.test(withoutComments));
  const uses = (withoutComments.match(/\.accountId\b/g) || []).length;
  assert.equal(uses, 3, 'лише 3 записи: pull (наявний), push борг, і порівняння у pull; жодного читання для пошуку');
  const lu = (withoutComments.match(/\.linkedInstallmentId\b/g) || []).length;
  assert.ok(lu >= 5 && lu <= 10, 'linkedInstallmentId лише записується в pull/push (' + lu + ')');
});
test('рядки для сервера будуються явно: accountId/linkedInstallmentId у upsert не потрапляють', function(){
  const withoutComments = SRC.replace(/\/\/[^\n]*/g, '');
  assert.ok(!/upsert\(\{[^}]*accountId/.test(withoutComments));
  assert.ok(!/upsert\(\{[^}]*linkedInstallmentId:/.test(withoutComments));
});
