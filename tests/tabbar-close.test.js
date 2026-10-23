// Rev 2.32.158 (TABBAR-CLOSE): тап по вкладці таб-бару/бокової панелі закриває відкриту накладку, потім перемикає вкладку.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const body = (function(){ const i = SRC.indexOf('function performSwitchTab(tab, opts){'); return SRC.slice(i, SRC.indexOf('\n}\n', i)); })();
// Таблиця накладок: [прапорець, закриття, відкриття]; кожна має installEdgeSwipeClose (єдиний патерн «накладка поверх вкладки»)
const OVERLAYS = [['isJournalOpen', 'closeJournal', 'openJournal'], ['isTrashOpen', 'closeTrashScreen', 'openTrashScreen'], ['isMonoOpen', 'closeMonoScreen', 'openMonoScreen'],
  ['isMonoInboxOpen', 'closeMonoInbox', 'openMonoInbox'], ['isPaymentsOpen', 'closePaymentsScreen', 'openPaymentsScreen'], ['isNotifArchiveOpen', 'closeNotifArchive', 'openNotifArchive']];

test('таблиця накладок: кожну накладку з installEdgeSwipeClose перемикання вкладки закриває (журнал, видалені, Monobank, Вхідні, Платежі, журнал сповіщень)', function(){
  OVERLAYS.forEach(function(o){
    assert.match(body, new RegExp('if\\(' + o[0] + '\\) ' + o[2 - 1] + '\\('), o[0]);
    assert.match(SRC, new RegExp('function ' + o[2] + '\\(|async function ' + o[2] + '\\('), o[2] + ' існує');
  });
  // охорона від нової накладки: кожен прапорець із installEdgeSwipeClose(…, function(){ return isXOpen; }, closeX …) є в таблиці
  const found = [...SRC.matchAll(/installEdgeSwipeClose\([^;]*?function\(\)\{ return (is\w+Open); \}, (\w+)/g)].map(m => [m[1], m[2]]);
  assert.ok(found.length >= OVERLAYS.length, 'знайдено накладок: ' + found.length);
  found.forEach(function(f){ assert.ok(OVERLAYS.some(o => o[0] === f[0] && o[1] === f[1]), 'накладка не охоплена таблицею: ' + f.join('/')); });
});
test('закриття накладок іде ДО переходу на вкладку (до показу нової в performSwitchTab) і повторний тап по активній вкладці теж проходить цим шляхом', function(){
  const posArchive = body.indexOf('if(isNotifArchiveOpen) closeNotifArchive()');
  assert.ok(posArchive > 0);
  assert.ok(body.indexOf('lastActiveTab = tab') > posArchive, 'закриття накладки раніше за фіксацію нової вкладки');
  assert.ok(body.indexOf("classList.toggle('hidden'") > posArchive, 'закриття накладки раніше за показ нової вкладки');
  assert.ok(!/prevTab !== tab[^)]*\)\s*\{[^}]*closeNotifArchive/.test(body), 'закриття не залежить від того, що вкладка інша');
  assert.match(SRC, /function switchTab\(tab, opts\)\{\s*performSwitchTab\(tab, opts\);/);
});
test('усі вкладки таб-бару й бокової панелі (5 + 5) викликають switchTab', function(){
  ['analytics', 'accounting', 'vytraty', 'structure', 'service'].forEach(function(t){
    assert.equal((SRC.match(new RegExp('data-tab="' + t + '" onclick="switchTab\\(\'' + t + '\'\\)"', 'g')) || []).length, 2, t);
  });
});
test('незбережені зміни/редагування: switchTab обгорнуто guardEditOpener (діалог «Скасувати редагування запису?»), закриття накладки не обходить його', function(){
  assert.match(SRC, /\['switchTab'\]\.forEach\(function\(n\)\{ guardEditOpener\(n, 'tab-switch'\); \}\);/);
  assert.match(SRC, /title\.textContent = 'Скасувати редагування запису\?';/);
});
test('анімацію закриття, свайп і стрілку не чіпали: closeNotifArchive без змін, installEdgeSwipeClose для архіву на місці', function(){
  assert.match(SRC, /function closeNotifArchive\(\)\{\s*if\(!isNotifArchiveOpen\) return;\s*isNotifArchiveOpen = false;/);
  assert.match(SRC, /installEdgeSwipeClose\(document\.getElementById\('notif-archive-screen'\), function\(\)\{ return isNotifArchiveOpen; \}, closeNotifArchive, \{ blockScroll: false \}\);/);
});
