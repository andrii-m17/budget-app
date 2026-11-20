// LOGIN-ARROWS (Rev 2.32.430): варіант login-arrows (control | readonly): реєстр, типове значення, перемикання, потрапляння у variants звітів, білий список самописця, обробники лише для полів входу.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ex = require('./extract');
const SRC = ex.readIndexWithCss();
const store = {};
const ls = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } };
const NAMES = ['TEST_VARIANTS_LS_KEY', 'TEST_VARIANTS', 'readTestVariantsMap', 'writeTestVariantsMap', 'findTestVariant', 'getVariant', 'setVariant', 'resetVariant', 'getVariantsSnapshot', 'loginRoActive'];
const c = ex.buildSandbox({ localStorage: ls }, NAMES);

test('реєстр: login-arrows із control (типовий) і readonly, повний запис, підпис за ТЗ', function(){
  const t = JSON.parse(ex.evalInSandbox(c, 'JSON.stringify(findTestVariant("login-arrows"))'));
  assert.equal(t.id, 'login-arrows'); assert.equal(t.title, 'Вхід: друге поле лише для читання (експеримент)');
  assert.deepEqual(t.variants.map(v => v.key), ['control', 'readonly']); assert.equal(t.defaultVariant, 'control');
  assert.ok(t.checkSteps.length >= 2 && t.checkSteps.length <= 3 && t.cleanupBy && t.addedIn);
});
test('типове значення control; readonly лише після вибору; невідоме значення → control; скидання', function(){
  assert.equal(c.getVariant('login-arrows'), 'control'); assert.equal(c.loginRoActive(), false);
  assert.equal(c.setVariant('login-arrows', 'readonly'), true); assert.equal(c.getVariant('login-arrows'), 'readonly'); assert.equal(c.loginRoActive(), true);
  assert.equal(c.setVariant('login-arrows', 'щось'), false); assert.equal(c.getVariant('login-arrows'), 'readonly');
  c.resetVariant('login-arrows'); assert.equal(c.getVariant('login-arrows'), 'control');
  store[c.TEST_VARIANTS_LS_KEY] = JSON.stringify({ 'login-arrows': 'bogus' }); assert.equal(c.getVariant('login-arrows'), 'control');
  delete store[c.TEST_VARIANTS_LS_KEY];
});
test('потрапляє у device.variants звітів (getVariantsSnapshot) і лишається локальною преференцією пристрою (не в резервній копії)', function(){
  c.setVariant('login-arrows', 'readonly');
  assert.equal(JSON.parse(JSON.stringify(c.getVariantsSnapshot()))['login-arrows'], 'readonly');
  c.resetVariants && c.resetVariants();
  assert.doesNotMatch(SRC.slice(SRC.indexOf('const BACKUP_LS_KEYS'), SRC.indexOf('const BACKUP_LS_KEYS') + 600), /budget_variants_v1/);
  assert.match(fs.readFileSync(path.join(__dirname, '..', 'js', 'diag.js'), 'utf8'), /variants: getVariantsSnapshot\(\)/);
});
test('самописець: тип login-ro у білому списку; ключі ev і field уже дозволені', function(){
  const D = fs.readFileSync(path.join(__dirname, '..', 'js', 'diag.js'), 'utf8');
  assert.match(D, /const REC_ALLOWED_TYPES = \[[^\]]*'login-ro'[^\]]*\]/);
  const keys = D.slice(D.indexOf('const REC_ALLOWED_KEYS = ['), D.indexOf('];', D.indexOf('const REC_ALLOWED_KEYS = [')));
  assert.match(keys, /'ev'/); assert.match(keys, /'field'/);
  ['set', 'unset-touch', 'unset-return', 'unset-autofill'].forEach(function(v){ assert.ok(SRC.indexOf("'" + v + "'") !== -1, v); });
});
test('обробники: лише #cldfielda1 і #cloud-password, делеговані (capture, passive), без kbNavLock і правок клавіатурного модуля; варіант за замовчуванням нічого не ставить', function(){
  assert.match(SRC, /const LOGIN_RO_IDS = \['cldfielda1', 'cloud-password'\];/);
  const a = SRC.indexOf('const LOGIN_RO_IDS'), b = SRC.indexOf('// Rev 2.32.326 (LOGIN-FORM, C): форма входу й вхід за автозаповненням.');
  const mod = SRC.slice(a, b);
  assert.doesNotMatch(mod, /kbNavLock|kbSheet|kbAutofillEvidence|tabindex/);
  assert.match(mod, /const on = loginRoActive\(\) && Date\.now\(\) >= loginRoHoldUntil/); // control → on=false → усі позначки знімаються
  assert.match(mod, /LOGIN_RO_AUTOFILL_MS = 2000/);
});
