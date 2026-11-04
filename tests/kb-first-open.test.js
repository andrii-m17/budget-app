// Rev 2.32.247 (KB-1): низ шторки для підйому міряється відносно звичайної висоти розмітки, а не стиснутої після панорами iOS (перше відкриття картки боргу в гібридному режимі).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildSandbox } = require('./extract');

const sb = (innerHeight, base) => buildSandbox({ window: { innerHeight: innerHeight }, getBaseViewportHeight: () => base }, ['kbRestBottomOf', 'kbLayoutShrink', 'kbRestBottomLayout']);
const drawer = (bottom, height, cls) => ({ classList: { contains: c => c === cls }, offsetHeight: height, getBoundingClientRect: () => ({ top: bottom - height, bottom: bottom, height: height }) });

test('KB-1: у нормальному стані (innerHeight = база) вимір не змінюється', () => {
  const c = sb(894, 894);
  assert.equal(c.kbRestBottomOf(drawer(780, 468, 'drawer')).bottom, 780);
});
test('KB-1: розмітку стиснуто панорамою iOS (563 з 894): низ шторки відновлюється до спокійного (449 → 780), підйом той самий, що й на тепле відкриття', () => {
  const c = sb(563, 894);
  const cold = c.kbRestBottomOf(drawer(449, 468, 'drawer')).bottom;
  assert.equal(cold, 780);
  const lift = cold - (894 - 389 - 8); // computeSheetLiftLegacy
  assert.equal(lift, 283);
});
test('KB-1: центрована картка (.app-modal) зміщується на половину стиснення', () => {
  const c = sb(563, 894);
  const el = drawer(0, 200, 'app-modal'); el.getBoundingClientRect = () => ({ top: 181.5, bottom: 381.5, height: 200 }); // центр 281,5
  assert.equal(c.kbRestBottomOf(el).bottom, 281.5 + 100 + 165.5);
});
test('KB-1: низ у розмітці (новий конвеєр) рахується від бази, а не від стиснутого innerHeight', () => {
  const c = buildSandbox({ window: { innerHeight: 563 }, getBaseViewportHeight: () => 894, getComputedStyle: () => ({ bottom: '114px' }) }, ['kbRestBottomLayout']);
  assert.equal(c.kbRestBottomLayout({ classList: { contains: x => x === 'drawer' }, offsetHeight: 468, getBoundingClientRect: () => ({ height: 468 }) }).bottom, 780);
});
