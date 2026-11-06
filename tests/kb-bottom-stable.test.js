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
