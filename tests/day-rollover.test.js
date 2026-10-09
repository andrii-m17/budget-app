// Rev 2.32.26 (M, A2-9) — північ: дата форми «Витрати» і вибраний місяць.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildSandbox } = require('./extract');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const c = buildSandbox({}, ['rolloverPlan']);
const j = function(v){ return JSON.parse(JSON.stringify(v)); };

test('M1: опівночі 31.10 → 01.11 без ручних змін: дата форми й місяць стають новими', function(){
  const p = j(c.rolloverPlan({ today: '2026-11-01', lastToday: '2026-10-31', formDate: '2026-10-31', formDateManual: false, selectedMonth: '2026-10', monthManual: false }));
  assert.deepEqual(p, { changed: true, today: '2026-11-01', newFormDate: '2026-11-01', newSelectedMonth: '2026-11' });
});
test('M1: той самий день — нічого не змінюється (повернення з фону вдень)', function(){
  assert.equal(c.rolloverPlan({ today: '2026-10-31', lastToday: '2026-10-31', formDate: '2026-10-31', selectedMonth: '2026-10' }).changed, false);
});
test('M2: ручно змінена дата форми лишається; ручно обраний місяць лишається', function(){
  const p = j(c.rolloverPlan({ today: '2026-11-01', lastToday: '2026-10-31', formDate: '2026-10-15', formDateManual: true, selectedMonth: '2026-09', monthManual: true }));
  assert.equal(p.newFormDate, null); assert.equal(p.newSelectedMonth, null);
});
test('M2: дата не ручна, але відрізняється від «сьогодні» (чернетка з іншою датою) — не чіпаємо; місяць, що не дорівнював поточному, — не чіпаємо', function(){
  const p = j(c.rolloverPlan({ today: '2026-11-01', lastToday: '2026-10-31', formDate: '2026-10-20', formDateManual: false, selectedMonth: '2026-08', monthManual: false }));
  assert.equal(p.newFormDate, null); assert.equal(p.newSelectedMonth, null);
});
test('M3: звичайна північ у середині місяця — дата оновлюється, місяць той самий (renderAll для бейджа)', function(){
  const p = j(c.rolloverPlan({ today: '2026-10-11', lastToday: '2026-10-10', formDate: '2026-10-10', formDateManual: false, selectedMonth: '2026-10', monthManual: false }));
  assert.equal(p.newFormDate, '2026-10-11'); assert.equal(p.newSelectedMonth, null);
});
test('M: перехід через рік 31.12 → 01.01', function(){
  const p = j(c.rolloverPlan({ today: '2027-01-01', lastToday: '2026-12-31', formDate: '2026-12-31', formDateManual: false, selectedMonth: '2026-12', monthManual: false }));
  assert.equal(p.newSelectedMonth, '2027-01');
});
test('M: підключення — resume/focus/таймер, ручні маркери, онлайн-подія рекордера', function(){
  assert.match(SRC, /checkDayRollover\('resume'\)/);
  assert.match(SRC, /window\.addEventListener\('focus', function\(\)\{ checkDayRollover\('focus'\); \}\)/);
  assert.match(SRC, /checkDayRollover\('midnight'\)/);
  assert.match(SRC, /rolloverState\.monthManual = true/);
  assert.match(SRC, /rolloverState\.dateManual = true; \/\/ Rev 2\.32\.26 \(M\)/);
  assert.match(SRC, /type: 'day-rollover'/);
});
test('A2-9 (виправлено в 2.32.26): оновлення дати при поверненні з фону', function(){
  assert.match(SRC, /document\.addEventListener\('visibilitychange', function\(\)\{ if\(document\.visibilityState === 'visible'\)\{ checkDayRollover/);
});
