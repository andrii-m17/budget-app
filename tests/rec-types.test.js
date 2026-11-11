// Автоматична перевірка за кодом (KB-27б, Rev 2.32.283): кожен тип події, який код передає в самописець (captureDebugGeometry('тип') і pushDebugEvent({ type: 'тип' })), має бути у білому списку REC_ALLOWED_TYPES — інакше подія мовчки відкидається й у звіті її нема (так 2.32.282 не показала arrow-preempt). Типи з REC_EXEMPT — старі події лише ручного запису діагностики (знімок на момент додавання правила); нова подія РАЗОМ із записом у білий список, а не у виняток.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const REC_EXEMPT = ['account-purge', 'add-button', 'amount-rejected', 'autocat-edit', 'backup-export', 'baseline-census', 'category-rename', 'day-rollover', 'dict-dup-adopt', 'edit-session', 'expense-arrows-state', 'expense-scroll-top', 'fields-census', 'fields-snapshot', 'focus-audit', 'incomplete-dots', 'input-focus-audit', 'journal-filters-reset', 'js-error-backlog', 'kb-env', 'longtask', 'mark', 'merge-silent', 'mono-connect', 'mono-disconnect', 'mono-inbox', 'mono-keyword', 'mono-refund', 'notif-archive', 'push-dirty', 'restore-filtered', 'scroll', 'slow-interaction', 'start', 'status-dots', 'stop', 'suggest-edit', 'suggest-evt', 'suggest-pick', 'suggest-render', 'taxonomy-purge', 'touchend', 'touchstart', 'trash-open', 'trash-purge', 'trash-reconcile', 'trash-restore', 'trash-swipe-close', 'xss-audit'];
test('кожен тип події, що передається в самописець, є в білому списку (або в знімку винятків)', () => {
  const i = SRC.indexOf('const REC_ALLOWED_TYPES = [');
  const allowed = new Set((SRC.slice(i, SRC.indexOf('];', i)).match(/'([^']+)'/g) || []).map(x => x.slice(1, -1)));
  const used = new Set();
  (SRC.match(/captureDebugGeometry\('([^']+)'/g) || []).forEach(x => used.add(/'([^']+)'/.exec(x)[1]));
  (SRC.match(/pushDebugEvent\(\{[^}]*?type: '([^']+)'/g) || []).forEach(x => used.add(/type: '([^']+)'/.exec(x)[1]));
  const missing = [...used].filter(t => !allowed.has(t) && REC_EXEMPT.indexOf(t) === -1);
  assert.deepEqual(missing, [], 'типи не у білому списку REC_ALLOWED_TYPES: ' + missing.join(', '));
  for(const t of ['switch-trace', 'pan-comp', 'kb-heights', 'deeplink', 'app-visible-sync', 'inbox-new-toast']) assert.ok(allowed.has(t), t + ' має бути у білому списку');
});
