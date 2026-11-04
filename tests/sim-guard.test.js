// SIM-3: підміна режиму клавіатури в автотестах симулятора — лише інструмент: у застосунку її нема, у тестовому коді вона діє тільки на локальній адресі.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const LIB = fs.readFileSync(path.join(__dirname, '..', 'e2e', 'ios', 'lib.mjs'), 'utf8');
const APP = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const SW = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');

test('SIM-3: у застосунку й service worker немає жодного сліду підміни режиму клавіатури', () => {
  assert.ok(!/__simMatchMediaPatched|setKbMode|applyKbMode|simprobe|simcal/.test(APP));
  assert.ok(!/__simMatchMediaPatched/.test(SW));
});
test('SIM-3: підміна matchMedia в тестовому коді стоїть за перевіркою адреси (location.origin) і зупиняє прогін, якщо адреса не локальна', () => {
  const i = LIB.indexOf('window.matchMedia = function');
  const guard = LIB.lastIndexOf("location.origin !== origin", i);
  assert.ok(guard > 0 && guard < i, 'перевірка адреси йде ДО підміни');
  assert.match(LIB, /ЗУПИНКА: підміну режиму клавіатури заблоковано/);
  assert.match(LIB, /export const ORIGIN = 'http:\/\/localhost:'/);
});
test('SIM-3: прогін перевіряє, що режим клавіатури справді відповідає конфігурації (kb-env), інакше сесія не стартує', () => {
  const RUN = fs.readFileSync(path.join(__dirname, '..', 'e2e', 'ios', 'run.mjs'), 'utf8');
  assert.match(RUN, /reason\.indexOf\(cfg\.kbMode \+ ':'\) !== 0/);
  assert.match(RUN, /id: 'ipad-trackpad-portrait'[^}]*kbMode: 'resize'/);
  assert.match(RUN, /id: 'iphone-portrait'[^}]*kbMode: 'always'/);
});
