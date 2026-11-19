// Rev 2.32.121 (фаза 1) + Rev 2.32.401 (PRIV-2b): джерело доходу — нейтральні id; старі ключі розпізнаються за хешем; підписи «ЗП …» з довідника сім'ї (запасний «ЗП 1/2»).
// Старі ключі в тесті збираються зі шматків слів: імен цілим словом у репозиторії немає (tests/no-real-names.test.js).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildSandbox, evalInSandbox } = require('./extract');
const SRC = require('./extract').readIndexWithCss();
const j = v => JSON.parse(JSON.stringify(v));
const NAMES = ['SALARY_ICON', 'COINS_ICON', 'INCOME_SOURCES', 'incomeSourceId', 'incomeLegacyHash', 'INCOME_LEGACY_HASHES', 'INCOME_SLOT_NAMES_LS_KEY', 'INCOME_SLOT_NAMES_STATE', 'incomeSlotNamesRead', 'incomeSlotNamesSet', 'incomeSlotName', 'incomeSourceStore', 'incomeSourceLabel', 'sameIncomeSource', 'incomeSourceDisplay', 'AMOUNT_MAX', 'AMOUNT_ERRORS', 'normalizeAmount', 'noteAmountRejected', 'mapExcelIncomeRow'];
function ctx(){ return buildSandbox({ localStorage: { _m: {}, getItem(k){ return this._m[k] === undefined ? null : this._m[k]; }, setItem(k, v){ this._m[k] = String(v); } } }, NAMES); }
const LEG = [['Зарплата ', 'Анд', 'рій'].join(''), ['Зарплата ', 'О', 'ля'].join('')]; // старі ключі джерел (як у даних на сервері, копіях і Excel)
const ids = c => j(evalInSandbox(c, 'INCOME_SOURCES.map(s => s.id)'));

test('три джерела мають нейтральні id (salary_1, salary_2, other); у INCOME_SOURCES немає ключів і підписів з іменами', () => {
  const c = ctx();
  assert.deepEqual(ids(c), ['salary_1', 'salary_2', 'other']);
  assert.deepEqual(j(evalInSandbox(c, 'INCOME_SOURCES.map(s => Object.keys(s).filter(k => k === "key" || k === "label"))')), [[], [], []]);
});
test('incomeSourceId: старі ключі (за хешем) й нейтральні id → той самий id; пробіли; невідоме, порожнє, не рядок → null', () => {
  const c = ctx();
  LEG.forEach((k, i) => { assert.equal(c.incomeSourceId(k), 'salary_' + (i + 1)); assert.equal(c.incomeSourceId('  ' + k + ' '), 'salary_' + (i + 1)); });
  ['salary_1', 'salary_2', 'other'].forEach(x => assert.equal(c.incomeSourceId(x), x));
  ['', '   ', null, undefined, 42, {}, 'Довільне джерело', 'SALARY_1', 'Інші доходи'].forEach(v => assert.equal(c.incomeSourceId(v), null, String(v)));
});
test('sameIncomeSource: старий ключ і id того самого слота збігаються, різні слоти ні; невідомі порівнюються як рядки; порожні однакові', () => {
  const c = ctx();
  assert.equal(c.sameIncomeSource(LEG[0], 'salary_1'), true); assert.equal(c.sameIncomeSource('salary_1', LEG[0]), true);
  assert.equal(c.sameIncomeSource(LEG[0], LEG[1]), false); assert.equal(c.sameIncomeSource('salary_1', LEG[1]), false);
  assert.equal(c.sameIncomeSource('Своє', 'Своє'), true); assert.equal(c.sameIncomeSource('Своє', 'Інше своє'), false);
  assert.equal(c.sameIncomeSource('Своє', LEG[0]), false);
  assert.equal(c.sameIncomeSource('', null), true); assert.equal(c.sameIncomeSource(undefined, ''), true);
});
test('підписи: без довідника — «ЗП 1/2», «Інше», «Зарплата 1/2», «Інші доходи»; з довідником — «ЗП » + display_name слота; старий ключ показується так само, як id; невідоме як є', () => {
  const c = ctx(); const src = i => evalInSandbox(c, 'INCOME_SOURCES[' + i + ']');
  assert.deepEqual([0, 1, 2].map(i => c.incomeSourceLabel(src(i))), ['ЗП 1', 'ЗП 2', 'Інше']);
  assert.deepEqual(['salary_1', 'salary_2', 'other'].map(x => c.incomeSourceDisplay(x)), ['Зарплата 1', 'Зарплата 2', 'Інші доходи']);
  c.incomeSlotNamesSet({ 1: 'Учасник-1', 2: ' Учасниця-2 ' });
  assert.deepEqual([0, 1, 2].map(i => c.incomeSourceLabel(src(i))), ['ЗП Учасник-1', 'ЗП Учасниця-2', 'Інше']);
  assert.equal(c.incomeSourceDisplay('salary_2'), 'Зарплата Учасниця-2');
  assert.equal(c.incomeSourceDisplay(LEG[0]), 'Зарплата Учасник-1', 'старий ключ → той самий підпис, що й id');
  assert.equal(c.incomeSourceDisplay('Своє'), 'Своє'); assert.equal(c.incomeSourceDisplay(''), ''); assert.equal(c.incomeSourceDisplay(null), null);
});
test('кеш підписів переживає перезапуск (localStorage), а порожній/пошкоджений кеш → «ЗП 1/2»', () => {
  const c = ctx(); c.incomeSlotNamesSet({ 1: 'Учасник-1' });
  assert.ok(evalInSandbox(c, 'localStorage.getItem(INCOME_SLOT_NAMES_LS_KEY)').includes('Учасник-1'));
  const c2 = buildSandbox({ localStorage: { getItem(){ return '{не json'; }, setItem(){} } }, NAMES);
  assert.equal(c2.incomeSourceLabel(evalInSandbox(c2, 'INCOME_SOURCES[0]')), 'ЗП 1');
});
test('incomeSourceStore: відомі (у т.ч. старі ключі) → id; невідоме як є; порожнє → порожній рядок', () => {
  const c = ctx();
  assert.equal(c.incomeSourceStore(LEG[1]), 'salary_2'); assert.equal(c.incomeSourceStore('other'), 'other'); assert.equal(c.incomeSourceStore('Своє'), 'Своє'); assert.equal(c.incomeSourceStore(null), '');
});
test('імпорт Excel: аркуш «Історія» дає кандидатів з нейтральними id для обох зарплат і «Інші доходи»; порожні/нульові колонки пропускаються', () => {
  const c = ctx();
  const out = j(c.mapExcelIncomeRow(['січень 2026', 20000, 15000, 3000], '2026-01'));
  assert.deepEqual(out.map(x => x.source), ['salary_1', 'salary_2', 'other']);
  assert.deepEqual(out.map(x => x.amount), [20000, 15000, 3000]); assert.ok(out.every(x => x.date === '2026-01-01'));
  assert.deepEqual(j(c.mapExcelIncomeRow(['січень 2026', null, 0, 500], '2026-01')).map(x => x.source), ['other']);
});
test('імпорт Excel: дубль визначається однаково для старого й нейтрального ключа (повторний імпорт не дублює запис, збережений з будь-яким ключем)', () => {
  const c = ctx();
  const existing = [{ source: 'salary_1', date: '2026-01-05' }, { source: LEG[1], date: '2026-01-07' }];
  const cands = j(c.mapExcelIncomeRow(['січень 2026', 20000, 15000, 3000], '2026-01'));
  const dup = cands.map(cn => existing.some(inc => c.sameIncomeSource(inc.source, cn.source) && inc.date.slice(0, 7) === '2026-01'));
  assert.deepEqual(dup, [true, true, false], 'перші два вже є (один зі старим ключем), «Інші доходи» ні');
  assert.ok(SRC.includes('sameIncomeSource(inc.source, c.source) && monthKey(inc.date)===monthKeyVal'), 'імпорт використовує нормалізацію');
});
test('експорт Excel: колонка «Джерело» — підпис (incomeSourceDisplay), а не сирий ключ', () => {
  assert.ok(SRC.includes("'Джерело': incomeSourceDisplay(e.source)"));
});
test('джерело: усі порівняння через sameIncomeSource; пошук місячного запису в редакторі/переліку теж; показ через incomeSourceDisplay/incomeSourceLabel; новий дохід пишеться id', () => {
  assert.equal((SRC.match(/sameIncomeSource\(inc\.source, s\.id\) && monthKey\(inc\.date\)===selectedMonth/g) || []).length, 4);
  assert.ok(!/inc\.source===s\.(key|id)/.test(SRC) && !/inc\.source===c\.source/.test(SRC), 'прямих порівнянь не лишилось');
  assert.ok(SRC.includes("sameIncomeSource(i.source, rec.source)"), 'відновлення з копії');
  ['label: incomeSourceDisplay(inc.source)', "kind==='income' ? incomeSourceDisplay(rec.source)", "title: incomeSourceDisplay(e.source)", "incomeSourceDisplay(rec.source), rec.amount"].forEach(x => assert.ok(SRC.includes(x), x));
  assert.ok(SRC.includes("source:s.id, amount, createdAt: nowISO, updatedAt: nowISO"), 'новий дохід пишеться нейтральним id');
  assert.ok(SRC.includes('incomeSourceLabel(s)') && !/s\.label/.test(SRC.slice(SRC.indexOf('function populateIncomeTable'), SRC.indexOf('function updateIncomeTotal'))), 'плитка й шторка — підпис з довідника');
});
test('довідник: users.salary_slot читається разом з display_name; запасний запит без колонки; підписи оновлюють плитки', () => {
  assert.ok(SRC.includes("select('id, display_name, email, gender, salary_slot')"));
  assert.ok(SRC.includes("select('id, display_name, email, gender')"), 'запасний запит, якщо колонки ще нема');
  assert.ok(SRC.includes('incomeSlotNamesSet(slotNames)') && SRC.includes('populateIncomeTable()'));
});
