// Rev 2.32.126: значок синхронізації на аватарі в боковій панелі (десктоп): гліф не повинен розтягуватись правилом .side button.side-tab svg (18px), крапка менша за мобільну пропорційно аватару.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
test('бокова панель: крапка 8px з кільцем кольору тла, гліф 70% (специфічність вища за .side button.side-tab svg)', function(){
  assert.match(SRC, /\.side button\.side-tab \.avatar-status-dot\{ width:8px; height:8px; border-width:1\.5px; border-color:var\(--color-bg\);/);
  assert.match(SRC, /\.side button\.side-tab \.avatar-status-dot svg\{ width:70%; height:70%; \}/);
  const generic = SRC.indexOf('.side button.side-tab svg{ width:18px');
  assert.ok(generic > 0 && SRC.indexOf('.side button.side-tab .avatar-status-dot svg{') > generic, 'правило для крапки має йти після загального');
});
test('мобільна крапка (11px у 36px аватарі) не змінена', function(){
  assert.match(SRC, /\.avatar-status-dot\{ position:absolute; bottom:-1px; right:-1px; width:11px; height:11px;/);
});
