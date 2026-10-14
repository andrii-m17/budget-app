// Rev 2.32.47 (AG) — експеримент autofill-guard: чотири варіанти, лише розмітка; клавіатурна логіка й id без змін.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ex = require('./extract');
const buildSandbox = ex.buildSandbox;
const SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const j = function(v){ return JSON.parse(JSON.stringify(v)); };
const reg = JSON.parse(ex.evalInSandbox(buildSandbox({}, ['TEST_VARIANTS']), 'JSON.stringify(TEST_VARIANTS)'));
const c = buildSandbox({}, ['autofillGuardFlags', 'toSearchField']);

test('реєстр: autofill-guard з чотирма варіантами, типовий control, повний запис', function(){
  const t = reg.filter(function(x){ return x.id === 'autofill-guard'; })[0]; assert.ok(t);
  assert.equal(t.id, 'autofill-guard'); assert.equal(t.defaultVariant, 'control');
  assert.deepEqual(t.variants.map(function(v){ return v.key; }), ['control', 'cloud-lazy', 'search-type', 'combined']);
  ['title', 'what', 'addedIn', 'cleanupBy'].forEach(function(f){ assert.ok(t[f] && t[f].trim(), f); });
  assert.ok(t.checkSteps.length >= 3); assert.match(t.checkSteps.join(' '), /ПОВНІСТЮ закрийте/);
});
test('autofillGuardFlags: control — нічого; lazy/search/combined — відповідні прапорці', function(){
  assert.deepEqual(j(c.autofillGuardFlags('control')), { cloudLazy: false, searchType: false });
  assert.deepEqual(j(c.autofillGuardFlags('cloud-lazy')), { cloudLazy: true, searchType: false });
  assert.deepEqual(j(c.autofillGuardFlags('search-type')), { cloudLazy: false, searchType: true });
  assert.deepEqual(j(c.autofillGuardFlags('combined')), { cloudLazy: true, searchType: true });
});
test('toSearchField: лише input[type=text] → search з autocomplete=off, autocorrect=off, spellcheck=false; email/password і inputmode не чіпає', function(){
  const mk = function(type, extra){ const a = Object.assign({ type: type }, extra || {}); return { tagName: 'INPUT', attrs: a, getAttribute: function(k){ return k in this.attrs ? this.attrs[k] : null; }, setAttribute: function(k, v){ this.attrs[k] = String(v); } }; };
  const t = mk('text', { inputmode: 'numeric' }); c.toSearchField(t);
  assert.equal(t.attrs.type, 'search'); assert.equal(t.attrs.autocomplete, 'off'); assert.equal(t.attrs.autocorrect, 'off'); assert.equal(t.attrs.spellcheck, 'false'); assert.equal(t.attrs.inputmode, 'numeric');
  const e = mk('email'); c.toSearchField(e); assert.equal(e.attrs.type, 'email');
  const p = mk('password'); c.toSearchField(p); assert.equal(p.attrs.type, 'password');
  c.toSearchField({ tagName: 'DIV' }); c.toSearchField(null);
});
test('охоронні: поля входу в обгортці й створюються на вимогу; поле суми розпізнається і як search; CSS ховає лупу й хрестик; id чисті', function(){
  assert.match(SRC, /<div id="cloud-login-fields">[\s\S]*?id="cldfielda1"[\s\S]*?id="cloud-password"[\s\S]*?<\/div>\s*<div class="import-status" id="cloud-auth-error"/);
  assert.match(SRC, /function openProfileLoginDrawer\(\)\{\n  mountCloudLoginFields\(\);/);
  assert.match(SRC, /unlockBackgroundScroll\(\);\n  unmountCloudLoginFields\(\);/);
  assert.match(SRC, /if\(!emailEl \|\| !pwEl\) return;/);
  assert.match(SRC, /\(el\.type === 'text' \|\| el\.type === 'search'\) && el\.getAttribute\('inputmode'\) === 'numeric'/);
  assert.match(SRC, /::-webkit-search-cancel-button[^}]*display:none/); assert.match(SRC, /-webkit-appearance:none; appearance:none; \}/);
  assert.match(SRC, /\napplyAutofillGuard\(\);/);
  ['cldfielda1', 'cloud-password'].forEach(function(id){ assert.equal((SRC.match(new RegExp('id="' + id + '"', 'g')) || []).length, 1); });
});
test('охоронні: перепис полів додає formsCount, hasLoginFields, autofillGuard (без значень); клавіатурні файли не чіпались', function(){
  assert.match(SRC, /formsCount: document\.querySelectorAll\('form'\)\.length, hasLoginFields: !!document\.querySelector\([^)]*\), autofillGuard: autofillGuardVariant\(\)/);
  assert.match(SRC, /'formsCount', 'hasLoginFields', 'autofillGuard'/);
  assert.match(SRC, /function configureKbProxy\(proxyEl, targetInput\)\{\n  const attrs = proxyAttrsFor\(targetInput\);\n  proxyEl\.type = attrs\.type;/);
});
