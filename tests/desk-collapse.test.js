// Rev 2.32.148 (DESK-COLLAPSE): згортання відкритого редагування витрати кліком мишею (заголовок / поза рядком), діалог лише зі змінами.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildSandbox } = require('./extract');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const c = buildSandbox({}, ['ROW_EDIT_TOUCH_GUARD_MS', 'editCollapseDecision']);
const base = { mouse: true, editing: true, sinceTouchMs: 99999, hasSelection: false, modalOpen: false, interactiveTarget: false, region: 'header' };
const d = function(o){ return c.editCollapseDecision(Object.assign({}, base, o)); };

test('повторний клік по заголовку відкритої витрати згортає; клік поза витратою згортає', function(){
  assert.equal(d({}), 'header');
  assert.equal(d({ region: 'outside' }), 'outside');
});
test('клік по полю/панелі, кнопці, іншому рядку, шторці не згортає; виділений текст не згортає', function(){
  assert.equal(d({ region: 'panel' }), null);
  assert.equal(d({ interactiveTarget: true }), null);
  assert.equal(d({ region: 'otherRow' }), null);
  assert.equal(d({ region: 'overlay' }), null);
  assert.equal(d({ hasSelection: true }), null);
  assert.equal(d({ modalOpen: true, region: 'outside' }), null);
});
test('дотик не змінений: пристрій без миші, синтетичний click після touchstart, немає відкритого редагування', function(){
  assert.equal(d({ mouse: false }), null);
  assert.equal(d({ sinceTouchMs: 100 }), null);
  assert.equal(d({ editing: false }), null);
  assert.equal(c.editCollapseDecision(null), null);
});

// requestCloseEdit: зі змінами — діалог, без змін — згортання одразу
const NAMES = ['EDIT_CLOSE_TRIGGERS', 'shouldCloseEdit', 'requestCloseEdit'];
function closer(dirty){
  const log = [];
  const g = { editingRecordKey: 'expense:1', activeEditDirty: function(){ return dirty; }, closeActiveEdit: function(t){ log.push('close:' + t); }, showEditCancelConfirm: function(t){ log.push('dialog:' + t); } };
  return { ctx: buildSandbox(g, NAMES), log };
}
test('зі змінами → діалог «Скасувати редагування запису?» (showEditCancelConfirm), без згортання', function(){
  const k = closer(true); assert.equal(k.ctx.requestCloseEdit('collapse-click', null), false);
  assert.deepEqual(k.log, ['dialog:collapse-click']);
});
test('без змін → згортається одразу, без діалогу', function(){
  const k = closer(false); assert.equal(k.ctx.requestCloseEdit('collapse-click', null), true);
  assert.deepEqual(k.log, ['close:collapse-click']);
});
test('охоронні: слухач click лише для миші, не діє на клік, що відкрив редагування, і при відкритих модалці/шторці; DESK-EDIT позначає свій клік', function(){
  const st = SRC.indexOf('(function initEditCollapsePointer'); const body = SRC.slice(st, SRC.indexOf('// Rev #30 (6D.123)', st));
  assert.match(body, /!isMouseDevice\(\) \|\| e\.__rowEditOpened/);
  assert.match(body, /requestCloseEdit\('collapse-click', null\)/);
  assert.match(body, /downInPanel/); assert.match(body, /addEventListener\('mousedown'/);
  assert.match(body, /\.drawer\.open/); assert.match(body, /#app-modal|getElementById\('app-modal'\)/);
  assert.match(SRC, /e\.__rowEditOpened = true; startEditRecord/);
});
