// Rev 2.32.175 (DUP-NAME) — попередження про однакову назву картки/ОЧ при створенні й перейменуванні.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildSandbox } = require('./extract');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const h = buildSandbox({}, ['accountNameKey', 'accountNameTaken', 'accountDuplicateMessage']);

test('збіг: без урахування регістру й пробілів по краях; лише живі записи того ж типу; порожня назва — без збігу', function(){
  const list = [{ name: 'Моно Окуляри 2' }, { name: 'ПУМБ Dyson' }];
  assert.equal(h.accountNameTaken(list, 'Моно Окуляри 2'), true);
  assert.equal(h.accountNameTaken(list, '  моно окуляри 2  '), true, 'регістр і пробіли по краях');
  assert.equal(h.accountNameTaken(list, 'пумб DYSON'), true);
  assert.equal(h.accountNameTaken(list, 'Моно Окуляри 3'), false, 'немає збігу');
  assert.equal(h.accountNameTaken(list, 'Моно  Окуляри 2'), false, 'внутрішні пробіли — інша назва');
  assert.equal(h.accountNameTaken(list, ''), false); assert.equal(h.accountNameTaken(list, '   '), false); assert.equal(h.accountNameTaken([], 'x'), false); assert.equal(h.accountNameTaken(null, 'x'), false);
});
test('видалена не враховується (deletedAt); перейменування не збігається саме із собою (exceptIdx), але з іншим записом — так', function(){
  const list = [{ name: 'Дубль', deletedAt: '2026-10-01' }, { name: 'Інша' }, { name: 'Третя' }];
  assert.equal(h.accountNameTaken(list, 'дубль'), false, 'видалений запис не рахується');
  assert.equal(h.accountNameTaken(list, 'інша', 1), false, 'сам запис при перейменуванні (лише регістр)');
  assert.equal(h.accountNameTaken(list, 'інша', 2), true, 'інший запис із такою назвою');
});
test('тексти діалогу: ОЧ — «ОЧ з такою назвою вже є. Створити ще одну?», картка — «Картка з такою назвою вже є. Створити ще одну?»', function(){
  assert.equal(h.accountDuplicateMessage('installment'), 'ОЧ з такою назвою вже є. Створити ще одну?');
  assert.equal(h.accountDuplicateMessage('card'), 'Картка з такою назвою вже є. Створити ще одну?');
});

// ---- модалка створення ----
function modalEnv(){
  const els = {}; const get = id => (els[id] = els[id] || { value: '', textContent: '', style: {}, onclick: null });
  const log = [];
  const g = {
    document: { getElementById: get }, formatThousands: v => String(v == null ? '' : v), parseAmount: v => Number(String(v).replace(/\s/g, '')), flashField: id => log.push('flash:' + id),
    presentAppModal: () => log.push('present'), closeAppModal: () => log.push('close'), focusCardFieldSafe: () => {}, setTimeout: () => 0,
    showConfirmModal: (msg, onConfirm, label, variant) => { log.push('confirm:' + msg + '|' + label + '|' + variant); g.__confirm = onConfirm; },
  };
  const c = buildSandbox(g, ['showInstallmentModal']);
  return { c, get, log, g };
}
const DUP = (list, kind) => ({ exists: n => list.some(a => a.name.trim().toLowerCase() === n.trim().toLowerCase()), message: kind === 'card' ? 'Картка з такою назвою вже є. Створити ще одну?' : 'ОЧ з такою назвою вже є. Створити ще одну?' });
test('створення зі збігом: показується підтвердження, нічого не зберігається, доки не «Створити»; «Скасувати» — ніщо не змінено', async function(){
  const e = modalEnv(); const saved = [];
  e.c.showInstallmentModal('Нова ОЧ:', '', '', async (n, a, force) => { saved.push([n, a, !!force]); }, undefined, DUP([{ name: 'Моно Окуляри 2' }]));
  e.get('app-modal-input').value = '  моно окуляри 2 '; e.get('app-modal-amount-input').value = '3 000';
  await e.get('app-modal-confirm-btn').onclick();
  assert.deepEqual(saved, [], 'до підтвердження нічого не створено');
  assert.ok(e.log.includes('confirm:ОЧ з такою назвою вже є. Створити ще одну?|Створити|primary'), e.log.join(' | '));
  assert.ok(!e.log.includes('close'), 'вікно не закрито мовчки');
  // «Скасувати» = кнопка діалогу просто закриває (onConfirm не викликається): збережень нема
  assert.deepEqual(saved, []);
});
test('«Створити» створює ще одну (force); без збігу діалогу нема й створення звичайне', async function(){
  const e = modalEnv(); const saved = [];
  e.c.showInstallmentModal('Нова ОЧ:', '', '', async (n, a, force) => { saved.push([n, a, !!force]); }, undefined, DUP([{ name: 'Моно Окуляри 2' }]));
  e.get('app-modal-input').value = 'Моно Окуляри 2'; e.get('app-modal-amount-input').value = '3 000';
  await e.get('app-modal-confirm-btn').onclick(); await e.g.__confirm();
  assert.deepEqual(saved, [['Моно Окуляри 2', 3000, true]]);
  const f = modalEnv(); const saved2 = [];
  f.c.showInstallmentModal('Нова ОЧ:', '', '', async (n, a, force) => { saved2.push([n, a, !!force]); }, undefined, DUP([{ name: 'Моно Окуляри 2' }]));
  f.get('app-modal-input').value = 'Приват iPhone'; f.get('app-modal-amount-input').value = '9 000';
  await f.get('app-modal-confirm-btn').onclick();
  assert.deepEqual(saved2, [['Приват iPhone', 9000, false]]); assert.ok(!f.log.some(x => x.startsWith('confirm:'))); assert.ok(f.log.includes('close'));
});
test('картка: те саме з текстом «Картка з такою назвою вже є…»; видалена не враховується; підключення в openAdd*Modal', async function(){
  const e = modalEnv(); const saved = [];
  e.c.showInstallmentModal('Новий банк/картка:', '', '', async (n, a, force) => { saved.push(!!force); }, 'Кредитний ліміт', DUP([{ name: 'Моно Чорна' }], 'card'));
  e.get('app-modal-input').value = 'МОНО ЧОРНА'; e.get('app-modal-amount-input').value = '50 000';
  await e.get('app-modal-confirm-btn').onclick();
  assert.ok(e.log.includes('confirm:Картка з такою назвою вже є. Створити ще одну?|Створити|primary'));
  assert.match(SRC, /exists: function\(n\)\{ return accountNameTaken\(installmentAccounts, n\); \}, message: accountDuplicateMessage\('installment'\)/);
  assert.match(SRC, /exists: function\(n\)\{ return accountNameTaken\(bankAccounts, n\); \}, message: accountDuplicateMessage\('card'\)/);
  assert.match(SRC, /async function addInstallmentAccount\(name, amount, allowDuplicate\)\{[\s\S]*?if\(!allowDuplicate && installmentAccounts\.some/);
  assert.match(SRC, /async function addBankAccount\(name, creditLimit, allowDuplicate\)\{[\s\S]*?if\(!allowDuplicate && bankAccounts\.some/);
});
test('перейменування: збіг із іншим записом → той самий діалог (ОЧ і картка), «Створити» повторює збереження з підтвердженням; нічого не змінюється до підтвердження', function(){
  const inst = SRC.slice(SRC.indexOf('async function saveInstallmentDrawer(confirmedDup){'), SRC.indexOf('async function saveInstallmentDrawer(confirmedDup){') + 3200);
  assert.match(inst, /newName !== oldName && !confirmedDup && accountNameTaken\(installmentAccounts, newName, editingInstallmentIdx\)\)\{ showConfirmModal\(accountDuplicateMessage\('installment'\), function\(\)\{ saveInstallmentDrawer\(true\); \}, 'Створити', 'primary'\); return; \}/);
  assert.ok(inst.indexOf('accountNameTaken(installmentAccounts') < inst.indexOf('cascadeInstallmentRename(acc, oldName, newName)'), 'діалог до будь-яких змін даних');
  const card = SRC.slice(SRC.indexOf('async function saveCardDebtDrawer(confirmedDup){'), SRC.indexOf('async function saveCardDebtDrawer(confirmedDup){') + 2600);
  assert.match(card, /newName !== oldName && !confirmedDup && accountNameTaken\(bankAccounts, newName, editingBankIdx\)\)\{ showConfirmModal\(accountDuplicateMessage\('card'\), function\(\)\{ saveCardDebtDrawer\(true\); \}, 'Створити', 'primary'\); return; \}/);
  assert.match(SRC, /showConfirmModal\(dup\.message, async function\(\)\{ await onSave\(name, amount, true\); \}, 'Створити', 'primary'\)/, 'діалог у стилі інших підтверджень (showConfirmModal, основна кнопка)');
});
