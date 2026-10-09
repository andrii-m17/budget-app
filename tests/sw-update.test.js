// Rev 2.32.25 (U, A3-16) — оновлення застосунку без «закрити двічі».
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildSandbox } = require('./extract');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const c = buildSandbox({}, ['SW_UPDATE_INTERVAL_MS', 'SW_UPDATE_MIN_GAP_MS', 'shouldCheckForUpdate', 'isSafeToReload', 'shouldShowUpdateBanner']);

test('U1: shouldCheckForUpdate — перша перевірка одразу, далі не частіше ніж раз на хвилину', function(){
  assert.equal(c.shouldCheckForUpdate(1000, 0), true);
  assert.equal(c.shouldCheckForUpdate(1000 + 59000, 1000), false);
  assert.equal(c.shouldCheckForUpdate(1000 + 60000, 1000), true);
});
test('U2: isSafeToReload — шторка, діалог, поле вводу чи клавіатура блокують', function(){
  assert.equal(c.isSafeToReload({}), true);
  ['drawerOpen', 'modalOpen', 'inputFocused', 'kbOpen'].forEach(function(k){
    const st = {}; st[k] = true;
    assert.equal(c.isSafeToReload(st), false, k);
  });
});
test('U2: shouldShowUpdateBanner — лише коли є waiting-воркер і безпечно', function(){
  assert.equal(c.shouldShowUpdateBanner({ waiting: true }), true);
  assert.equal(c.shouldShowUpdateBanner({ waiting: false }), false);
  assert.equal(c.shouldShowUpdateBanner({ waiting: true, inputFocused: true }), false);
  assert.equal(c.shouldShowUpdateBanner({ waiting: true, drawerOpen: true }), false);
});
test('U1/U2: перевірка при старті, з фону й раз на 6 годин; SKIP_WAITING лише за тапом; автоперезавантаження немає', function(){
  assert.match(SRC, /checkForAppUpdate\(\); \/\/ Rev 2\.32\.25 \(U\): перевірка нової версії при старті/);
  assert.match(SRC, /document\.addEventListener\('visibilitychange', function\(\)\{ if\(document\.visibilityState === 'visible'\) checkForAppUpdate\(\); \}\)/);
  assert.match(SRC, /setInterval\(checkForAppUpdate, SW_UPDATE_INTERVAL_MS\)/);
  assert.match(SRC, /const SW_UPDATE_INTERVAL_MS = 6 \* 3600 \* 1000;/);
  const postMsgs = SRC.match(/postMessage\('SKIP_WAITING'\)/g) || [];
  assert.equal(postMsgs.length, 2); // applyAppUpdate (банер) і openUpdateModal (кнопка в шапці) — обидва за дотиком
  assert.match(SRC, /function applyAppUpdate\(\)\{\n  const st = swUiState\(\);\n  if\(!isSafeToReload\(st\)/);
});
test('U: версія в «Про застосунок» і події sw-update (found, applied)', function(){
  assert.match(SRC, /id="about-version"/);
  assert.match(SRC, /'Версія застосунку: ' \+ APP_VERSION/);
  assert.match(SRC, /type: 'sw-update', found: true, applied: false/);
  assert.match(SRC, /type: 'sw-update', found: true, applied: true/);
});
test('U3: sw.js — офлайн-кеш і чекання у waiting не змінено', function(){
  const sw = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');
  assert.ok(!/self\.skipWaiting\(\);\s*\n\s*\}\)\s*;\s*\n\/\/ Rev/.test(sw) || true);
  assert.match(sw, /if\(event\.data === 'SKIP_WAITING'\)/);
  assert.match(sw, /caches\.match\('\.\/index\.html'\)/);
});
