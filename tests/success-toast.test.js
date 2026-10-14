// Rev 2.32.37 (T) — спливаюче підтвердження успіху.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildSandbox } = require('./extract');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const c = buildSandbox({}, ['MONO_MONTHS_GEN', 'monoFmtUah', 'pluralUa', 'successToastModel', 'shouldShowToast']);
test('successToastModel: додано N витрат · з Monobank · сума; відмінювання', function(){
  assert.deepEqual(JSON.parse(JSON.stringify(c.successToastModel('mono-added', { count: 3, amountUah: 412 }))), { title: 'Додано 3 витрати', subtitle: 'з Monobank · 412 ₴', actionLabel: 'Журнал', action: 'journal' });
  assert.equal(c.successToastModel('mono-added', { count: 1, amountUah: 50 }).title, 'Додано 1 витрату');
  assert.equal(c.successToastModel('mono-added', { count: 5, amountUah: 50 }).title, 'Додано 5 витрат');
});
test('successToastModel: повернення — частково й повністю; невідомий вид → null', function(){
  const m = c.successToastModel('refund', { name: 'Bolt самокат', oldAmount: 40, newAmount: 15 });
  assert.equal(m.title, 'Повернення враховано'); assert.equal(m.subtitle, 'Bolt самокат · 40 ₴ → 15 ₴');
  assert.equal(c.successToastModel('refund', { name: 'Bolt', oldAmount: 25, deleted: true }).subtitle, 'Bolt · 25 ₴ → видалено');
  assert.equal(c.successToastModel('x', {}), null);
});
test('shouldShowToast: не над клавіатурою й шторкою', function(){
  assert.equal(c.shouldShowToast({ inputFocused: false, sheetOpen: false }), true);
  assert.equal(c.shouldShowToast({ inputFocused: true, sheetOpen: false }), false);
  assert.equal(c.shouldShowToast({ inputFocused: false, sheetOpen: true }), false);
});
test('охоронні: reduced-motion вимикає малювання; черга й очікування; стек над оновленням; тексти через textContent', function(){
  assert.match(SRC, /@media \(prefers-reduced-motion: reduce\)\{ \.success-toast\{ animation:none; \} \.success-toast-icon circle, \.success-toast-icon path\{ animation:none; stroke-dashoffset:0; \} \}/);
  assert.match(SRC, /if\(successToastActive \|\| !successToastQueue\.length\) return;/);
  assert.match(SRC, /if\(!shouldShowToast\(successToastEnv\(\)\)\)\{ setTimeout\(pumpSuccessToast, 400\)/);
  assert.match(SRC, /above-update/);
  const a = SRC.indexOf('function pumpSuccessToast'), b = SRC.indexOf('function openJournalFromToast');
  const body = SRC.slice(a, b);
  assert.equal((body.match(/innerHTML/g) || []).length, 1); // лише статичний svg-значок
  assert.match(body, /t\.textContent = o\.title/); assert.match(body, /sb\.textContent = o\.subtitle/);
  const keyframes = SRC.match(/@keyframes stDraw[^\n]*\n[^\n]*@keyframes stPop[^\n]*/)[0];
  assert.ok(!/width|height|top|left|margin/.test(keyframes));
});
