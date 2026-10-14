// Rev 2.32.31 (A) — розширений охоронний тест: «сильні» слова (укр./англ.) заборонені й у placeholder, aria-label та тексті підписів текстових полів,
// а не лише в id/name; плюс перепис полів для діагностики (без значень).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { fields } = require('../scripts/fields-audit');
const { buildSandbox } = require('./extract');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

// Явні винятки (id → чому безпечно). Лише поле входу в Cloud: type="email" з autocomplete="username" — це справжня форма входу, де
// панель паролів/контактів очікувана і потрібна; id абстрактний (cldfielda1).
const STRONG_EXCEPTIONS = { cldfielda1: 'форма входу в Cloud (type=email, autocomplete=username): підказка логіну очікувана' };

test('A: у розмітці й createElement знайдено повний перелік полів', () => {
  const list = fields();
  assert.ok(list.length >= 24, 'полів: ' + list.length);
  assert.ok(list.some(f => f.id === 'fldmono1') && list.some(f => f.id === 'fldmono4'));
});
test('A: жодне текстове поле не має «сильних» слів у id/name/placeholder/aria-label/підписі (крім явних винятків)', () => {
  const bad = fields().filter(f => f.class.level === 'сильне' && !STRONG_EXCEPTIONS[f.id]).map(f => `${f.id || '(без id)'} рядок ${f.line}: ${f.class.words.join(',')}`);
  assert.deepEqual(bad, []);
  assert.deepEqual(Object.keys(STRONG_EXCEPTIONS), ['cldfielda1']);
});
test('A: поле токена Monobank — без автокорекції; усі нові поля мають autocomplete=off або абстрактні id', () => {
  const t = fields().find(f => f.id === 'fldmono1');
  assert.equal(t.autocomplete, 'off'); assert.equal(t.type, 'text');
  ['fldmono1', 'fldmono4'].forEach(id => assert.equal(fields().find(f => f.id === id).autocomplete, 'off'));
});
test('A: класифікатор ловить «сильні» слова українською й англійською', () => {
  const { classify } = require('../scripts/fields-audit');
  assert.equal(classify({ placeholder: "Ім'я" }).level, 'сильне');
  assert.equal(classify({ label: 'Телефон' }).level, 'сильне');
  assert.equal(classify({ aria: 'Contact' }).level, 'сильне');
  assert.equal(classify({ id: 'fldmono1', label: 'Токен' }).level, 'середнє');
  assert.equal(classify({ label: 'Назва витрати' }).level, 'слабке');
  assert.equal(classify({ id: 'fldx1', label: 'Сума' }).level, 'немає');
});
test('A2: перепис полів — лише атрибути й статичні підписи, без значень; подія fields-census у allowlist; кнопка в «Тестуванні»', () => {
  const c = buildSandbox({}, ['fieldCensusLine']);
  assert.equal(c.fieldCensusLine({ id: 'fldmono1', type: 'text', autocomplete: 'off', placeholder: 'Вставте з буфера', label: 'Токен', visible: true }), 'fldmono1|text||off||ph=Вставте з буфера|aria=|lbl=Токен|vis');
  assert.equal(c.fieldCensusLine({}), '—|text||||ph=|aria=|lbl=|hid');
  const fn = SRC.slice(SRC.indexOf('function fieldsCensusNow()'), SRC.indexOf('function recordFieldsCensus()'));
  assert.ok(!/\.value\b/.test(fn), 'перепис не читає значення полів');
  assert.match(SRC, /DEBUG_EVENT_ALLOWLIST = \[[\s\S]*'fieldsCount', 'fields'/);
  assert.match(SRC, /id="fields-census-btn"[^>]*onclick="recordFieldsCensusFromTesting\(\)"/);
  assert.match(SRC, /type: 'fields-census', fieldsCount: lines\.length/);
});
