// Rev 2.32.413 (FIX-1119 п.8): «Збережено» після збереження шторки (дохід, картка, ОЧ) — стандартний тост TOAST-1, не дрібний підпис унизу шторки.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const SRC = require('./extract').readIndexWithCss();
test('елементів *-saved-hint у розмітці й посилань на них немає', function(){
  assert.ok(!/(income|banks|installments)-saved-hint/.test(SRC));
});
test('дохід, картка й ОЧ показують showToast({ kind:\'success\', title:\'Збережено\' })', function(){
  const n = (SRC.match(/showToast\(\{ kind: 'success', title: 'Збережено'/g) || []).length;
  assert.equal(n, 3);
  assert.match(SRC, /closeIncomeEditor\(\);\n  renderAll\(\);\n  showToast\(\{ kind: 'success', title: 'Збережено' \}\);/);
  assert.match(SRC, /closeCardDebtEditor\(\);\n  renderAll\(\);\n  showToast\(\{ kind: 'success', title: 'Збережено', subtitle: stripLeadingEmoji\(newName\) \}\);/);
  assert.match(SRC, /offerHidePaidOffInstallment\(newName\); \}, 350\);[^\n]*\n  showToast\(\{ kind: 'success', title: 'Збережено', subtitle: stripLeadingEmoji\(newName\) \}\);/);
});
