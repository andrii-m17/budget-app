// Rev 2.32.87 (FIX-UI-1b): «Скасувати» у підтвердженні видалення лишає шторку деталей відкритою.
const test = require('node:test'); const assert = require('node:assert');
const fs = require('fs'); const path = require('path');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
function body(name){ const i = SRC.indexOf('function ' + name + '('); assert.ok(i >= 0, name); return SRC.slice(i, i + 6000); }
test('шторки деталей не закриваються до підтвердження видалення', function(){
  assert.ok(!/function deleteInstallmentFromDrawer\(\)\{\s*const i = editingInstallmentIdx;\s*closeInstallmentEditor\(\);/.test(SRC));
  assert.match(SRC, /removeInstallmentAccount\(editingInstallmentIdx, closeInstallmentEditor\)/);
  assert.match(SRC, /removeBankAccount\(editingBankIdx, closeCardDebtEditor\)/);
  assert.match(SRC, /sf-delete'\)\.onclick = function\(\)\{ cfg\.del\.onDelete\(closeStructForm\); \}/);
});
test('onDone викликається всередині підтвердженої дії (категорія, підкатегорія, слово, ОЧ, картка)', function(){
  ['deleteCategory', 'deleteSubcategory', 'deleteDictionaryEntry', 'removeInstallmentAccount', 'removeBankAccount'].forEach(function(n){
    const b = body(n); const end = b.indexOf('\n}\n'); assert.ok(/if\(onDone\) onDone\(\);/.test(b.slice(0, end)), n);
  });
});
