// Rev 2.32.127: кнопка поп-апа про дії іншого учасника веде за змістом (видалення → «Видалені дані», борги → «Борги»); нейтральний автор — нейтральний колір аватара.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildSandbox } = require('./extract');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const c = buildSandbox({}, ['toastActionTarget', 'toastActionForEvents', 'toastModel']);
const j = v => JSON.parse(JSON.stringify(v));
test('toastActionTarget: видалення будь-якого домену → trash; борги → debts; решта й невідомий домен → journal', function(){
  ['expenses', 'incomes', 'debts', 'hiddenEntities'].forEach(d => assert.equal(c.toastActionTarget(d, 'delete').action, 'trash', d));
  assert.deepEqual(j(c.toastActionTarget('debts', 'edit')), { label: 'Борги', action: 'debts' });
  assert.equal(c.toastActionTarget('debts', 'add').action, 'debts');
  assert.equal(c.toastActionTarget('expenses', 'add').action, 'journal');
  assert.equal(c.toastActionTarget('incomes', 'edit').action, 'journal');
  assert.deepEqual(j(c.toastActionTarget(undefined, undefined)), { label: 'Журнал', action: 'journal' });
});
test('toastActionForEvents: усі події в одне місце → воно; змішані, порожні, не масив → журнал', function(){
  assert.equal(c.toastActionForEvents([{ domain: 'expenses', action: 'delete' }, { domain: 'incomes', action: 'delete' }]).action, 'trash');
  assert.equal(c.toastActionForEvents([{ domain: 'debts', action: 'edit' }, { domain: 'debts', action: 'add' }]).action, 'debts');
  assert.equal(c.toastActionForEvents([{ domain: 'debts', action: 'edit' }, { domain: 'expenses', action: 'add' }]).action, 'journal');
  assert.equal(c.toastActionForEvents([]).action, 'journal'); assert.equal(c.toastActionForEvents(null).action, 'journal');
});
test('toastModel: other-actor і sync-summary несуть ціль; без домену лишається «Журнал»', function(){
  assert.deepEqual([j(c.toastModel('other-actor', { actorName: 'A', verbText: 'видалив витрату', name: 'X', amount: 5, domain: 'expenses', action: 'delete' }))].map(m => [m.actionLabel, m.action])[0], ['Видалені', 'trash']);
  assert.equal(c.toastModel('other-actor', { actorName: 'A', verbText: 'вніс борг', domain: 'debts', action: 'add' }).action, 'debts');
  assert.deepEqual([c.toastModel('other-actor', {}).actionLabel, c.toastModel('other-actor', {}).action], ['Журнал', 'journal']);
  assert.equal(c.toastModel('sync-summary', { text: 't', events: [{ domain: 'expenses', action: 'delete' }] }).action, 'trash');
  assert.equal(c.toastModel('sync-summary', { text: 't' }).action, 'journal');
});
test('виклики: кнопки ведуть через openToastTarget(m.action); аватар без даних про автора нейтральний', function(){
  assert.equal((SRC.match(/onAction: function\(\)\{ openToastTarget\(m\.action\); \}/g) || []).length, 2);
  assert.match(SRC, /else if\(action === 'debts'\)\{ goToCardDebtsTab\(\); \}/);
  assert.match(SRC, /\(myAuthorInfo \|\| AUTHOR_NEUTRAL\)\.colorVar/);
});
