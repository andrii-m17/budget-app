// Rev #30 (6D.52) — термінове розслідування двох UI-багів на мобільних
// (окрема категорія, не пов'язана із sync-роботою). Баг 2: WebKit дозволяє
// сховати системну клавіатуру (кнопка-шеврон/жест) БЕЗ зміни
// document.activeElement — існуючий focusout-обробник (isKeyboardField,
// Rev 2.3.9) у такому разі ніколи не спрацьовує, і body.kb-open лишається
// назавжди (таббар зникає й не з'являється, доки фокус не перейде на ІНШЕ
// поле по-справжньому).
//
// isKeyboardLikelyClosed() — чиста арифметична перевірка, винесена окремо
// від самого visualViewport.resize-обробника (той, як і сам
// focusin/focusout-код поруч, DOM/browser-API-залежний і тут не
// ізолюється, той самий принцип, що вже задокументований у
// tests/journal-month.test.js для buildRecordGroupsHtml).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildSandbox } = require('./extract');

function sandbox(){
  return buildSandbox({}, ['isKeyboardLikelyClosed']);
}

test('isKeyboardLikelyClosed: висота viewport майже дорівнює висоті вікна (клавіатура закрита) → true', () => {
  const ctx = sandbox();
  assert.equal(ctx.isKeyboardLikelyClosed(800, 800), true);
});

test('isKeyboardLikelyClosed: невелика розбіжність (адресний рядок/safe-area, не клавіатура) → лишається true', () => {
  const ctx = sandbox();
  assert.equal(ctx.isKeyboardLikelyClosed(800, 750), true);
});

test('isKeyboardLikelyClosed: суттєве стиснення (клавіатура відкрита, ~300px) → false', () => {
  const ctx = sandbox();
  assert.equal(ctx.isKeyboardLikelyClosed(800, 500), false);
});

test('isKeyboardLikelyClosed: рівно на межі порогу (100px) → ще НЕ вважається закритою', () => {
  const ctx = sandbox();
  assert.equal(ctx.isKeyboardLikelyClosed(800, 700), false);
});

test('isKeyboardLikelyClosed: щойно під порогом (99px) → вважається закритою', () => {
  const ctx = sandbox();
  assert.equal(ctx.isKeyboardLikelyClosed(800, 701), true);
});
