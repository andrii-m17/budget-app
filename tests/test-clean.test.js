// TEST-CLEAN (Rev 2.32.432): завершені експерименти прибрано разом із кодом; шторка «Для розробника» має структуру Самописець → Діагностика → Дані → (Експерименти); механізм варіантів лишився.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ex = require('./extract');
const SRC = ex.readIndexWithCss();
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const store = {};
const ls = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } };
const NAMES = ['TEST_VARIANTS_LS_KEY', 'TEST_VARIANTS', 'readTestVariantsMap', 'writeTestVariantsMap', 'findTestVariant', 'getVariant', 'setVariant', 'resetVariant', 'resetVariants', 'pruneVariants', 'getVariantsSnapshot'];
const c = ex.buildSandbox({ localStorage: ls }, NAMES);

test('реєстр експериментів: лише kb-resume (Rev 2.32.433); autofill-guard і login-arrows прибрано разом із кодом', function(){
  assert.deepEqual(JSON.parse(ex.evalInSandbox(c, 'JSON.stringify(TEST_VARIANTS)')).map(function(t){ return t.id; }), ['kb-resume']);
  ['id: \'autofill-guard\'', 'id: \'login-arrows\'', 'getVariant(\'autofill-guard\')', 'getVariant(\'login-arrows\')', 'autofillGuardVariant', 'autofillGuardFlags', 'applyAutofillGuard', 'toSearchField', 'mountCloudLoginFields', 'unmountCloudLoginFields', 'cloudLoginFieldsTemplate', 'data-autofill-guard', 'loginRoActive', 'loginRoSet', 'LOGIN_RO_IDS', 'data-login-ro'].forEach(function(w){ assert.equal(SRC.indexOf(w), -1, w); });
  assert.equal(SRC.indexOf('login-lab'), -1, 'сторінка й посилання «Лабораторія входу» прибрано');
  assert.equal(fs.existsSync(path.join(__dirname, '..', 'login-lab.html')), false);
});
test('самописець: типи login-ro і ключ autofillGuard прибрано, решта на місці', function(){
  const D = read('js/diag.js');
  assert.doesNotMatch(D, /'login-ro'/); assert.doesNotMatch(D, /autofillGuard/);
  ['login-lock', 'login-fill', 'login-submit', 'err', 'suggest-tap', 'push-toast', 'kb-early', 'echo-skip'].forEach(function(t){ assert.match(D, new RegExp("const REC_ALLOWED_TYPES = \\[[^\\]]*'" + t + "'")); });
  assert.match(D, /'fieldsCount', 'fields', 'formsCount', 'hasLoginFields'/);
});
test('механізм варіантів лишився: типове значення, невідомі ключі зникають (pruneVariants), snapshot лише kb-resume', function(){
  store['budget_variants_v1'] = JSON.stringify({ 'login-arrows': 'readonly', 'autofill-guard': 'combined' });
  c.pruneVariants();
  assert.equal(store['budget_variants_v1'], undefined, 'залишки вибору завершених експериментів прибираються зі сховища');
  assert.equal(c.getVariant('login-arrows'), null);
  assert.deepEqual(JSON.parse(JSON.stringify(c.getVariantsSnapshot())), { 'kb-resume': 'control' });
  assert.match(read('js/diag.js'), /variants: getVariantsSnapshot\(\)/);
});
test('шторка «Для розробника»: групи Самописець → Діагностика → Дані → Експерименти (за активних експериментів) → Середовище; рядок «Повідомити про проблему»; без «Лабораторії входу»', function(){
  const a = SRC.indexOf('id="testing-drawer"'), b = SRC.indexOf('id="rec-report-backdrop"', a);
  const drawer = SRC.slice(a, b);
  const labels = Array.from(drawer.matchAll(/<div class="chk-label[^"]*"[^>]*>([^<]+)<\/div>/g)).map(function(m){ return m[1]; });
  assert.deepEqual(labels, ['Самописець', 'Діагностика', 'Дані', 'Експерименти', 'Середовище']);
  assert.match(drawer, /id="testing-variants-label"/); assert.match(drawer, /class="chk-label hidden" id="testing-variants-label"/);
  assert.match(drawer, /id="rec-report-row" onclick="openRecReport\(\)"[\s\S]*?Повідомити про проблему/);
  assert.match(SRC, /lab\.classList\.toggle\('hidden', !TEST_VARIANTS\.length\)/);
});
