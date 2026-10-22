// Rev 2.32.121 (PRIV-1 п. 2, INCOME_SOURCES, фаза 1): нормалізація джерела доходу на читанні; запис лишається старими ключами.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildSandbox, evalInSandbox } = require('./extract');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const j = v => JSON.parse(JSON.stringify(v));
const NAMES = ['SALARY_ICON', 'COINS_ICON', 'INCOME_SOURCES', 'incomeSourceId', 'sameIncomeSource', 'incomeSourceDisplay', 'AMOUNT_MAX', 'AMOUNT_ERRORS', 'normalizeAmount', 'noteAmountRejected', 'mapExcelIncomeRow'];
function ctx(){ return buildSandbox({}, NAMES); }
const keys = c => j(evalInSandbox(c, 'INCOME_SOURCES.map(s => ({ id: s.id, key: s.key }))'));

test('три джерела мають нейтральні id (salary_1, salary_2, other); ключі запису лишились старими', () => {
  const c = ctx(); const k = keys(c);
  assert.deepEqual(k.map(x => x.id), ['salary_1', 'salary_2', 'other']);
  assert.equal(k[2].key, 'Інші доходи');
  k.forEach(x => assert.ok(x.key && x.key !== x.id));
});
test('incomeSourceId: старі ключі й нейтральні id → той самий id; пробіли; невідоме, порожнє, не рядок → null', () => {
  const c = ctx(); const k = keys(c);
  k.forEach(x => { assert.equal(c.incomeSourceId(x.key), x.id); assert.equal(c.incomeSourceId(x.id), x.id); assert.equal(c.incomeSourceId('  ' + x.key + ' '), x.id); });
  ['', '   ', null, undefined, 42, {}, 'Довільне джерело', 'SALARY_1'].forEach(v => assert.equal(c.incomeSourceId(v), null, String(v)));
});
test('sameIncomeSource: старий ключ і нейтральний id того самого джерела збігаються, різні джерела ні; невідомі порівнюються як рядки; порожні однакові', () => {
  const c = ctx(); const k = keys(c);
  assert.equal(c.sameIncomeSource(k[0].key, k[0].id), true); assert.equal(c.sameIncomeSource(k[0].id, k[0].key), true);
  assert.equal(c.sameIncomeSource(k[0].key, k[1].key), false); assert.equal(c.sameIncomeSource(k[0].id, k[1].key), false);
  assert.equal(c.sameIncomeSource(k[2].key, 'other'), true, '«Інші доходи» ↔ other');
  assert.equal(c.sameIncomeSource('Своє', 'Своє'), true); assert.equal(c.sameIncomeSource('Своє', 'Інше своє'), false);
  assert.equal(c.sameIncomeSource('Своє', k[0].key), false);
  assert.equal(c.sameIncomeSource('', null), true); assert.equal(c.sameIncomeSource(undefined, ''), true);
});
test('incomeSourceDisplay: для відомого id той самий текст, що показувався раніше (старий ключ): вигляд не змінюється; невідоме без змін', () => {
  const c = ctx(); const k = keys(c);
  k.forEach(x => { assert.equal(c.incomeSourceDisplay(x.id), x.key); assert.equal(c.incomeSourceDisplay(x.key), x.key); });
  assert.equal(c.incomeSourceDisplay('Своє'), 'Своє'); assert.equal(c.incomeSourceDisplay(''), ''); assert.equal(c.incomeSourceDisplay(null), null);
});
test('імпорт Excel: аркуш «Історія» дає кандидатів зі СТАРИМИ ключами (запис не змінюється) для обох джерел і «Інші доходи»; порожні/нульові колонки пропускаються', () => {
  const c = ctx(); const k = keys(c);
  const out = j(c.mapExcelIncomeRow(['січень 2026', 20000, 15000, 3000], '2026-01'));
  assert.deepEqual(out.map(x => x.source), [k[0].key, k[1].key, k[2].key]);
  assert.deepEqual(out.map(x => x.amount), [20000, 15000, 3000]); assert.ok(out.every(x => x.date === '2026-01-01'));
  assert.deepEqual(j(c.mapExcelIncomeRow(['січень 2026', null, 0, 500], '2026-01')).map(x => x.source), [k[2].key]);
});
test('імпорт Excel: дубль визначається однаково для старого й нейтрального ключа (повторний імпорт не дублює запис, збережений з будь-яким ключем)', () => {
  const c = ctx(); const k = keys(c);
  const existing = [{ source: k[0].id, date: '2026-01-05' }, { source: k[1].key, date: '2026-01-07' }];
  const cands = j(c.mapExcelIncomeRow(['січень 2026', 20000, 15000, 3000], '2026-01'));
  const dup = cands.map(cn => existing.some(inc => c.sameIncomeSource(inc.source, cn.source) && inc.date.slice(0, 7) === '2026-01'));
  assert.deepEqual(dup, [true, true, false], 'перші два вже є (один із нейтральним id), «Інші доходи» ні');
  assert.ok(SRC.includes('sameIncomeSource(inc.source, c.source) && monthKey(inc.date)===monthKeyVal'), 'імпорт використовує нормалізацію');
});
test('джерело: усі порівняння джерела йдуть через sameIncomeSource; пошук місячного запису в редакторі/переліку теж; показ через incomeSourceDisplay; запис нового доходу старим ключем', () => {
  assert.equal((SRC.match(/sameIncomeSource\(inc\.source, s\.key\) && monthKey\(inc\.date\)===selectedMonth/g) || []).length, 4);
  assert.ok(!/inc\.source===s\.key/.test(SRC) && !/inc\.source===c\.source/.test(SRC), 'прямих порівнянь за ключем не лишилось');
  assert.ok(SRC.includes("sameIncomeSource(i.source, rec.source)"), 'відновлення з копії');
  ['label: incomeSourceDisplay(inc.source)', "kind==='income' ? incomeSourceDisplay(rec.source)", "title: incomeSourceDisplay(e.source)", "incomeSourceDisplay(rec.source), rec.amount"].forEach(x => assert.ok(SRC.includes(x), x));
  assert.ok(SRC.includes("source:s.key, amount, createdAt: nowISO, updatedAt: nowISO"), 'новий дохід пишеться старим ключем (фаза 1)');
});
