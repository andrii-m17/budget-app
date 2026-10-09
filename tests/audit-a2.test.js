// Аудит A2 (docs/AUDIT.md): узгодженість — дати/місяці/часові пояси/суми/імпорт. Код застосунку не змінювався.
// Тести без todo описують поточну поведінку (у т.ч. перевіряють, що дати рахуються правильно); з { todo: true } — документують вади.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildSandbox } = require('./extract');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

const TZS = ['Europe/Kyiv', 'America/Los_Angeles', 'Pacific/Auckland', 'Asia/Tokyo', 'UTC'];
function withTZ(tz, fn){
  const prev = process.env.TZ;
  process.env.TZ = tz;
  try{ return fn(); } finally{ if(prev === undefined) delete process.env.TZ; else process.env.TZ = prev; }
}
function dateCtx(){
  return buildSandbox({}, ['localDateISO', 'shiftDate', 'shiftMonth', 'monthKey', 'weekdayShort']);
}
const pad = function(n){ return String(n).padStart(2, '0'); };
function utcNext(iso, n){ const [y, m, d] = iso.split('-').map(Number); const t = new Date(Date.UTC(y, m - 1, d + n)); return t.getUTCFullYear() + '-' + pad(t.getUTCMonth() + 1) + '-' + pad(t.getUTCDate()); }

// ---------- A2-9: перехід місяця ----------
test('A2-9: localDateISO/monthKey на межі місяця — 23:59:30 31 жовтня і 00:01 1 листопада (Київ)', function(){
  withTZ('Europe/Kyiv', function(){
    const c = dateCtx();
    assert.equal(c.localDateISO(new Date(2026, 9, 31, 23, 59, 30)), '2026-10-31');
    assert.equal(c.localDateISO(new Date(2026, 10, 1, 0, 1, 0)), '2026-11-01');
    assert.equal(c.monthKey(c.localDateISO(new Date(2026, 10, 1, 0, 1, 0))), '2026-11');
  });
});
test('A2-9: відкритий через північ застосунок оновлює дату в формі «Витрати» при поверненні з фону', { todo: true }, function(){
  // Наразі f-date ставиться при старті, у resetExpenseForm та при перемиканні вкладки (resetVytratyDateToToday);
  // на visibilitychange/focus дата НЕ оновлюється — витрата, додана вранці на тій самій вкладці, піде вчорашньою датою.
  const handlers = [...SRC.matchAll(/addEventListener\('visibilitychange', function\(\)\{[^\n]*\}\);/g)].map(function(m){ return m[0]; }).join('\n');
  assert.ok(/resetVytratyDateToToday|refreshTodayDate/.test(handlers));
});

// ---------- A2-10: часові пояси і літній час ----------
['2026-10-25', '2027-03-28', '2027-03-14', '2026-11-01'].forEach(function(day){
  TZS.forEach(function(tz){
    test('A2-10: shiftDate ±1..3 дні без пропусків/дублів навколо ' + day + ' у ' + tz, function(){
      withTZ(tz, function(){
        const c = dateCtx();
        for(let off = -3; off <= 3; off++){
          const from = utcNext(day, off);
          for(const d of [1, -1, 2]) assert.equal(c.shiftDate(from, d), utcNext(from, d), tz + ' ' + from + ' ' + d);
        }
      });
    });
  });
});
test('A2-10: localDateISO о 23:30 і 00:30 у день зміни часу дає ту саму календарну дату (Київ, LA, Окленд)', function(){
  [['Europe/Kyiv', 2026, 9, 25], ['Europe/Kyiv', 2027, 2, 28], ['America/Los_Angeles', 2026, 10, 1], ['Pacific/Auckland', 2026, 8, 27]].forEach(function(a){
    withTZ(a[0], function(){
      const c = dateCtx();
      const exp = a[1] + '-' + pad(a[2] + 1) + '-' + pad(a[3]);
      assert.equal(c.localDateISO(new Date(a[1], a[2], a[3], 0, 30)), exp, a[0]);
      assert.equal(c.localDateISO(new Date(a[1], a[2], a[3], 23, 30)), exp, a[0]);
    });
  });
});
test('A2-10: shiftMonth/monthKey не залежать від часового поясу (чисті рядкові функції)', function(){
  withTZ('Pacific/Auckland', function(){
    const c = dateCtx();
    assert.equal(c.shiftMonth('2026-12', 1), '2027-01');
    assert.equal(c.shiftMonth('2027-01', -1), '2026-12');
    assert.equal(c.monthKey('2026-10-31'), '2026-10');
  });
});
test('A2-10: Excel-експорт рахує місяць через new Date(\'YYYY-MM-DD\') (UTC) + getMonth() (локально) — у поясах західніше за UTC перше число потрапляє у попередній місяць', { todo: true }, function(){
  // демонстрація поведінки вираження з exportToExcel(): const d = new Date(e.date); d.getMonth()
  const label = withTZ('America/Los_Angeles', function(){ const d = new Date('2026-10-01'); return d.getMonth() + 1; });
  assert.equal(label, 10, 'у Los_Angeles 2026-10-01 дає місяць ' + label);
});

// ---------- A2-11: імпорт Excel ----------
test('A2-11: mapExcelExpenseRow — текстова сума з пробілом/комою читається як 1 (поточна поведінка)', function(){
  const c = buildSandbox({ excelDateToISO: function(){ return '2026-10-01'; } }, ['mapExcelExpenseRow']);
  assert.equal(c.mapExcelExpenseRow({ 'Витрата': 'X', 'Сума': '1 250,50', 'Дата': 1 }).amount, 1);
  assert.equal(c.mapExcelExpenseRow({ 'Витрата': 'X', 'Сума': -100, 'Дата': 1 }).amount, -100);
  assert.equal(c.mapExcelExpenseRow({ 'Витрата': 'X', 'Сума': 0, 'Дата': 1 }).amount, 0);
});
test('A2-11: імпорт відкидає від\'ємні/нульові суми і текстові суми з комою не читає як 1', { todo: true }, function(){
  const c = buildSandbox({ excelDateToISO: function(){ return '2026-10-01'; } }, ['mapExcelExpenseRow']);
  assert.equal(c.mapExcelExpenseRow({ 'Витрата': 'X', 'Сума': -100, 'Дата': 1 }), null);
  assert.equal(c.mapExcelExpenseRow({ 'Витрата': 'X', 'Сума': '1 250,50', 'Дата': 1 }).amount, 1251);
});

// ---------- A2-13: цілі гривні ----------
const amountCtx = buildSandbox({}, ['parseAmount']);
test('A2-13: parseAmount — поточна поведінка на типових вводах', function(){
  assert.equal(amountCtx.parseAmount('1 250'), 1250);
  assert.equal(amountCtx.parseAmount('1 250'), 1250);
  assert.equal(amountCtx.parseAmount('12.4'), 12);
  assert.equal(amountCtx.parseAmount('12.5'), 13);
  assert.ok(isNaN(amountCtx.parseAmount('abc')));
  assert.equal(amountCtx.parseAmount('99,99'), 99);        // кома обрізає дробову частину (за округленням мало б бути 100)
  assert.equal(amountCtx.parseAmount('0,6'), 0);           // 0,6 ₴ -> 0 (за округленням 1)
  assert.equal(amountCtx.parseAmount('1e3'), 1000);
});
test('A2-13: парсинг коми як десяткового роздільника дає округлення до цілих (99,99 -> 100)', { todo: true }, function(){
  assert.equal(amountCtx.parseAmount('99,99'), 100);
});
test('A2-13: фільтр вводу сум не перетворює вставлене «99.99»/«99,99» на 9999 (×100)', { todo: true }, function(){
  const m = SRC.match(/const cleaned = el\.value\.replace\(([^)]*)\);/);
  assert.ok(m);
  // зараз прибираються ВСІ нецифрові символи, включно з крапкою/комою -> «99,99» стає «9999»
  assert.ok(!/\[\^\\d\\s\\u00A0\]/.test(m[1]));
});
test('A2-13: суми поза діапазоном Cloud (integer, amount >= 0) відхиляються до збереження', { todo: true }, function(){
  assert.ok(/2147483647|MAX_AMOUNT/.test(SRC));
});

// ---------- A2-12: каскади ----------
test('A2-12: перейменування категорії оновлює updatedAt змінених витрат, щоб вони дійшли до Cloud', { todo: true }, function(){
  const m = SRC.match(/function editCategory\(i\)\{([\s\S]*?)\n\}/)[1];
  assert.ok(/e\.updatedAt\s*=/.test(m), 'витрати з новою назвою категорії лишаються «синхронізованими» (syncedUpdatedAt === updatedAt) і не пушаться');
});
