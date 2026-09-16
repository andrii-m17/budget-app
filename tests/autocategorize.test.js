// Rev 2.14.0 — тест словникового автовизначення категорії (autocategorize),
// того самого механізму, що працює під час вводу назви витрати. Знайдено
// під час інвентаризації (крок 1 Rev 2.14.0) як додатковий чистий кандидат
// поза початковим списком у завданні.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildSandbox } = require('./extract');

function sandbox({ dictionary, categories }){
  return buildSandbox(
    { DICTIONARY: dictionary || [], CATEGORIES: categories || [] },
    ['autocategorize', 'getCategoryType']
  );
}

test('autocategorize: збіг ключового слова → повертає категорію й підкатегорію словника', () => {
  const ctx = sandbox({
    dictionary: [{ kw: 'таксі', cat: '🚗 Транспорт', sub: '🚕 Таксі' }],
    categories: [{ name: '🚗 Транспорт', type: 'Гнучка', active: true }],
  });
  // Порівнюємо поля окремо, а не через assert.deepEqual(result, {...}) —
  // об'єкт створений усередині vm.Context (інший "реалм"), Node вважає його
  // іншим типом навіть при однаковій структурі полів.
  const result = ctx.autocategorize('Таксі додому');
  assert.equal(result.cat, '🚗 Транспорт');
  assert.equal(result.sub, '🚕 Таксі');
});

test('autocategorize: немає збігу жодного ключового слова → null', () => {
  const ctx = sandbox({ dictionary: [{ kw: 'таксі', cat: '🚗 Транспорт', sub: '🚕 Таксі' }] });
  assert.equal(ctx.autocategorize('Переїзд на нову квартиру'), null);
});

test('autocategorize: категорію зі словника видалено (немає в CATEGORIES) → запис пропускається', () => {
  const ctx = sandbox({
    dictionary: [{ kw: 'таксі', cat: '🚗 Транспорт', sub: '🚕 Таксі' }],
    categories: [], // категорія видалена
  });
  assert.equal(ctx.autocategorize('Таксі додому'), null);
});
