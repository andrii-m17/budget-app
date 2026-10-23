// Rev 2.32.145 (DESK-UPDATE): на десктопі лишається лише плашка «Доступне оновлення» з кнопкою «Оновити».
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildSandbox } = require('./extract');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const NOCOMMENT = SRC.replace(/<!--[\s\S]*?-->/g, '');
test('пункт у боковій панелі відсутній, плашка з кнопкою «Оновити» є', function(){
  assert.ok(!/id="update-btn-side"/.test(NOCOMMENT));
  const side = NOCOMMENT.match(/<nav class="side-panel"[\s\S]*?<\/nav>/)[0];
  assert.ok(!/Доступне оновлення/.test(side));
  assert.match(NOCOMMENT, /<div class="update-banner" id="update-banner" role="status"><span>Доступне оновлення<\/span><button type="button" onclick="applyAppUpdate\(\)">Оновити<\/button><\/div>/);
});
test('плашка однакова на всіх пристроях: без @media/платформних умов у її правилах; showUpdateAvailable не звертається до бічного пункту', function(){
  assert.ok(!/@media[^{]*\{[^{}]*\.update-banner/.test(SRC));
  assert.ok(!/update-btn-side/.test(SRC.match(/function showUpdateAvailable\(\)\{[\s\S]*?\n\}/)[0].replace(/\/\/.*$/gm, '')));
});
test('повернення плашки: ховається під шторкою/модалкою/полем/клавіатурою й повертається після (спільна логіка refreshUpdateBanner)', function(){
  const c = buildSandbox({}, ['isSafeToReload', 'shouldShowUpdateBanner']);
  assert.equal(c.shouldShowUpdateBanner({ waiting: true }), true);
  ['drawerOpen', 'modalOpen', 'inputFocused', 'kbOpen'].forEach(function(k){
    const st = { waiting: true }; st[k] = true; assert.equal(c.shouldShowUpdateBanner(st), false, k);
  });
  assert.equal(c.shouldShowUpdateBanner({ waiting: false }), false);
  assert.match(SRC, /setInterval\(refreshUpdateBanner, 1500\)/);
});
