// Rev 2.32.63 (P1) — «День платежу» картки.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildSandbox } = require('./extract');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const j = function(v){ return JSON.parse(JSON.stringify(v)); };
const c = buildSandbox({}, ['normalizePaymentDay', 'paymentDayPayload']);
test('normalizePaymentDay: 1…31 — число; порожнє/0/32/нечисло/дріб — null', function(){
  [1, 15, 31, '7', '31'].forEach(function(v){ assert.equal(c.normalizePaymentDay(v), Number(v)); });
  [null, undefined, '', 0, '0', 32, '32', -1, 1.5, 'abc', NaN].forEach(function(v){ assert.equal(c.normalizePaymentDay(v), null, String(v)); });
});
test('paymentDayPayload: значення відоме → payment_day (null для «Не задано»); undefined → поля немає (не затирає Cloud)', function(){
  assert.deepEqual(j(c.paymentDayPayload({ paymentDay: 12 })), { payment_day: 12 });
  assert.deepEqual(j(c.paymentDayPayload({ paymentDay: null })), { payment_day: null });
  assert.deepEqual(j(c.paymentDayPayload({ paymentDay: 40 })), { payment_day: null });
  assert.deepEqual(j(c.paymentDayPayload({})), {}); assert.deepEqual(j(c.paymentDayPayload(null)), {});
});
test('синхронізація: payment_day у трьох місцях push і в select/pull (оновлення, зв\'язування за назвою, нові рядки)', function(){
  assert.equal((SRC.match(/\.\.\.paymentDayPayload\(acc\)/g) || []).length, 3);
  assert.match(SRC, /select\('id,name,credit_limit,payment_day,created_at,updated_at,deleted_at'\)/);
  assert.match(SRC, /\(byCloudId\.paymentDay \?\? null\) !== \(row\.payment_day \?\? null\)/);
  assert.match(SRC, /byCloudId\.paymentDay = row\.payment_day \?\? null;/);
  assert.match(SRC, /byName\.paymentDay = row\.payment_day \?\? null;/);
  assert.match(SRC, /bankAccounts\.push\(\{ name: row\.name, creditLimit: row\.credit_limit, paymentDay: row\.payment_day \?\? null,/);
});
test('форма картки: «День платежу» — числове поле поруч із кредитним лімітом (як у ОЧ); порожнє = null; 0/32 блокують збереження; перейменування/ліміт не стирають значення', function(){
  assert.match(SRC, /<label for="cdd-payday">День платежу<\/label>/);
  assert.match(SRC, /<input type="text" inputmode="numeric" class="cdd-amount-input" id="cdd-payday" placeholder="—" maxlength="2"/);
  assert.ok(!/<select id="cdd-payday"|pick-box|fillPaydaySelect|updatePaydayVal/.test(SRC), 'випадаючого списку більше немає');
  const rowHtml = SRC.slice(SRC.indexOf('<label for="cdd-limit">') - 80, SRC.indexOf('id="cdd-payday"') + 400);
  assert.match(rowHtml, /<div class="row-2">/); assert.ok(rowHtml.indexOf('cdd-limit') < rowHtml.indexOf('cdd-payday'));
  const save = SRC.slice(SRC.indexOf('async function saveCardDebtDrawer'), SRC.indexOf('async function saveCardDebtDrawer') + 3200);
  assert.match(save, /const paydayFromInput = rawPayday \? normalizePaymentDay\(rawPayday\) : null;/);
  assert.match(save, /if\(rawPayday && paydayFromInput === null\)\{ flashField\('cdd-payday'\); return; \}/);
  assert.ok(save.indexOf('paydayFromInput === null') < save.indexOf('acc.name = newName'), 'перевірка до будь-яких змін');
  assert.ok(save.indexOf('acc.paymentDay = paydayFromInput;') < save.indexOf('acc.updatedAt = new Date().toISOString();'), 'день платежу входить у той самий штамп оновлення');
  assert.match(SRC, /document\.getElementById\('cdd-payday'\)\.value = acc\.paymentDay \|\| '';/);
});
test('резервна копія: поле переноситься (merge копіює всі ключі), клавіатурні файли не чіпались', function(){
  assert.match(SRC, /Object\.keys\(rec\)\.forEach\(function\(key\)\{\n\s*if\(key === 'cloudId'\) return;/);
  assert.ok(!/cdd-payday[^\n]*kb-/.test(SRC));
});
