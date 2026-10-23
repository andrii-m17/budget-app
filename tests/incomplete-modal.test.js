// Rev 2.32.130: модалка «Дані заповнені неповністю» за макетом — заголовок (назва), підзаголовок, рядки «що бракує» (іконка, підпис, значення справа); кнопки без змін.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildSandbox } = require('./extract');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const j = v => JSON.parse(JSON.stringify(v));
const c = buildSandbox({}, ['INCOMPLETE_LABELS', 'INCOMPLETE_FIELDS', 'incompleteRowModel', 'incompleteFieldId']);
test('підписи й значення справа за таблицею макета (картка та ОЧ)', function(){
  assert.deepEqual(j(c.incompleteRowModel('card', 'limit')), { label: 'Кредитний ліміт', value: 'не вказано' });
  assert.deepEqual(j(c.incompleteRowModel('card', 'dueDay')), { label: 'День платежу', value: 'не вказано' });
  assert.deepEqual(j(c.incompleteRowModel('card', 'minPayment')), { label: 'Мінімальний платіж', value: 'не вказано' });
  assert.deepEqual(j(c.incompleteRowModel('card', 'balance')), { label: 'Борг за цей місяць', value: 'немає даних' });
  assert.deepEqual(j(c.incompleteRowModel('installment', 'initialAmount')), { label: 'Початкова сума', value: 'не вказано' });
  assert.deepEqual(j(c.incompleteRowModel('installment', 'payment')), { label: 'Платіж на місяць', value: 'не вказано' });
  assert.deepEqual(j(c.incompleteRowModel('installment', 'dueDay')), { label: 'Дата платежу', value: 'не вказано' });
  assert.deepEqual(j(c.incompleteRowModel('installment', 'balance')), { label: 'Залишок за цей місяць', value: 'немає даних' });
});
test('невідома причина не ламає модалку: підпис із запасного списку, значення порожнє', function(){
  assert.deepEqual(j(c.incompleteRowModel('card', 'x')), { label: 'x', value: '' });
});
test('розмітка: тексти через textContent (назва банку з банку/користувача не інтерпретується як HTML), кнопки «Закрити» і «Заповнити» збережено, стилі зі змінними токенів', function(){
  const fn = SRC.slice(SRC.indexOf('function showIncompleteInfo('), SRC.indexOf('// «Заповнити»: відкриває шторку'));
  assert.match(fn, /title\.textContent = stripLeadingEmoji\(acc\.name\)/);
  assert.match(fn, /sub\.textContent = 'Дані заповнені неповністю'/);
  assert.match(fn, /lb\.textContent = m\.label/); assert.match(fn, /vl\.textContent = m\.value/);
  assert.ok(!/innerHTML\s*=[^;]*acc\.name/.test(fn));
  assert.match(fn, /'Заповнити', 'primary'/); assert.match(fn, /cancelBtn\.textContent = 'Закрити'/);
  assert.match(SRC, /\.inc-list\{[^}]*border-top:1px solid var\(--color-border\)/); // розділювач над першим рядком, як у макеті
  assert.match(SRC, /INCOMPLETE_WARN_SVG = '<svg[^']*<circle cx="15" cy="15" r="10"\/>/); // коло зі знаком оклику
  assert.match(SRC, /\.inc-row\{[^}]*min-height:44px/); assert.match(SRC, /\.inc-icon\{[^}]*color:var\(--color-warning\)/);
  assert.match(SRC, /\.inc-value\{[^}]*white-space:nowrap/); assert.match(SRC, /\.inc-label\{[^}]*overflow-wrap:normal/);
});

test('Rev 2.32.135: умовні поля (мін. платіж / платіж ОЧ) при невідомому борзі/залишку — «залежить від боргу/залишку»', function(){
  assert.deepEqual(j(c.incompleteRowModel('card', 'minPayment', true)), { label: 'Мінімальний платіж', value: 'залежить від боргу' });
  assert.deepEqual(j(c.incompleteRowModel('installment', 'payment', true)), { label: 'Платіж на місяць', value: 'залежить від залишку' });
  assert.deepEqual(j(c.incompleteRowModel('card', 'minPayment', false)), { label: 'Мінімальний платіж', value: 'не вказано' });
});
test('Rev 2.32.135: поля шторки для «Заповнити»: день платежу картки — cdd-payday, залишок ОЧ — idd-balance, решта як раніше', function(){
  assert.equal(c.incompleteFieldId('card', 'dueDay'), 'cdd-payday'); assert.equal(c.incompleteFieldId('installment', 'dueDay'), 'idd-start');
  assert.equal(c.incompleteFieldId('installment', 'balance'), 'idd-balance'); assert.equal(c.incompleteFieldId('card', 'balance'), 'cdd-balance');
  assert.equal(c.incompleteFieldId('card', 'limit'), 'cdd-limit'); assert.equal(c.incompleteFieldId('installment', 'payment'), 'idd-pay');
  ['cdd-payday', 'idd-balance'].forEach(id => assert.ok(SRC.includes('id="' + id + '"'), id + ' існує'));
});
test('Rev 2.32.135: модалка будується з details (усі причини з dependent), «Заповнити» отримує всі коди; вигляд рядків без змін', function(){
  const fn = SRC.slice(SRC.indexOf('function showIncompleteInfo('), SRC.indexOf('// «Заповнити»: відкриває шторку'));
  assert.match(fn, /const details = kind === 'card' \? cardIncompleteDetails\(acc\) : installmentIncompleteDetails\(acc\);/);
  assert.match(fn, /incompleteRowModel\(kind, d\.code, d\.dependent\)/);
  assert.match(fn, /fillIncomplete\(kind, i, details\.map\(function\(d\)\{ return d\.code; \}\)\)/);
  assert.match(SRC, /\.inc-row\{[^}]*min-height:44px/);
});
