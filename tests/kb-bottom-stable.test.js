// KB-8 (Rev 2.32.261): охорона CSS: низ КОЖНОГО відкритого .drawer не залежить від body.kb-open (звіт MT-1106-6914: стрибок на 106 пт на початку відкриття й закриття).
// Поведінку на справжній розмітці перевіряє e2e/keyboard.spec.js, сценарій 41.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const HTML = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
test('KB-8: правило .drawer.open з низом без var(--drawer-bottom-base) діє для всіх шторок', () => {
  assert.match(HTML, /\.drawer\.open, #income-drawer\.open, #card-debt-drawer\.open, #installment-drawer\.open, #struct-drawer\.open\{\s*bottom:max\(100px, calc\(env\(safe-area-inset-bottom\) \+ 80px\)\);\s*\}/);
});
test('KB-8: body.kb-open і далі змінює базу лише для не-листових елементів (змінна лишилась, листи її не читають у стані open)', () => {
  assert.match(HTML, /body\.kb-open\{ --drawer-bottom-base:8px; \}/);
});
test('KB-14/B: прикріплений блок кнопок не змінює розмітку (padding-top 0, відступ box-shadow-ом, margin-top базовий)', () => {
  assert.match(HTML, /html\.kb-sheet \.drawer\.open :is\(\.mono-detail-actions, \.sf-actions\)\{ position:sticky; bottom:-20px; z-index:2; background:var\(--color-surface\); padding:0 0 20px; margin-bottom:-20px; box-shadow:0 -8px 0 0 var\(--color-surface\); \}/);
  assert.ok(!/html\.kb-sheet \.drawer\.open \.mono-detail-actions\{ margin-top:0; padding-top:8px; \}/.test(HTML), 'padding-top, що додавав висоту, прибрано');
});
