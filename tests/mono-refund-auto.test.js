// Rev 2.32.330 (MONO-REFUND): автоматичне зіставлення повернень Monobank — чиста модель рядка, вкладки, діалог вибору, план тостів. Суми й назви вигадані.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildSandbox } = require('./extract');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const j = function(v){ return JSON.parse(JSON.stringify(v)); };
const c = buildSandbox({}, ['MONO_MONTHS_GEN', 'MONO_CARD_TYPES', 'monoAccountLabel', 'monoAccountDetail', 'MONO_SKIP_LABELS', 'skipReasonLabel', 'monoFmtUah', 'inboxRowModel', 'monoNetUah', 'monoRefundedUah', 'monoShortMonth', 'monoSuggestLabelText', 'monoSuggestOptions', 'monoCatLabel', 'monoAutoGroupModel', 'MONO_AUTO_DAYS', 'addAllCandidates', 'refundRowActions', 'monoOptionsSorted', 'monoRefundApplyCall', 'monoRefundToastPlan']);
const T = new Date(2026, 10, 12, 9, 13).toISOString();
const R = function(extra){ return Object.assign({ id: 'c1', mono_account_id: 'm1', tx_time: T, description: 'Тест', amount_uah: 50, status: 'new', suggested_category: 'Транспорт' }, extra || {}); };

test('списання з частковим поверненням: сума чиста, стара закреслена, мітка «Повернено N із M»', function(){
  const m = j(c.inboxRowModel(R({ refunded_minor: 2700, net_uah: 23 }), []));
  assert.match(m.amount, /^−23\s₴$/);
  assert.match(m.oldAmount, /^−50\s₴$/);
  assert.match(m.refundLabel, /^↩ Повернено 27\s₴ із 50\s₴$/);
});
test('старі рядки без нових полів: як раніше, без мітки й старої суми', function(){
  const m = j(c.inboxRowModel(R(), []));
  assert.match(m.amount, /^−50\s₴$/); assert.equal(m.oldAmount, ''); assert.equal(m.refundLabel, ''); assert.equal(m.suggest, false); assert.equal(m.canUndo, false);
});
test('monoNetUah: net_uah, запасна amount_uah, refunded_full — початкова сума', function(){
  assert.equal(c.monoNetUah(R({ net_uah: 23 })), 23);
  assert.equal(c.monoNetUah(R()), 50);
  assert.equal(c.monoNetUah(R({ net_uah: 0, status: 'skipped', skip_reason: 'refunded_full' })), 50);
  assert.equal(c.monoNetUah(null), null);
});
test('refunded_full: підпис «Повернено повністю» у «Пропущених»', function(){
  assert.equal(c.skipReasonLabel('refunded_full'), 'Повернено повністю');
  assert.equal(c.inboxRowModel(R({ status: 'skipped', skip_reason: 'refunded_full', net_uah: 0, refunded_minor: 5000 }), []).reason, 'Повернено повністю');
});
test('«Додати всі» пропускає списання з нульовою чистою сумою', function(){
  assert.equal(c.addAllCandidates([R({ net_uah: 0 }), R({ id: 'c2', net_uah: 23 }), R({ id: 'c3' })]).length, 2);
});
test('рядок-підказка: «+», мітка з датою й сумою списання, дії refund + ignore, не у причинах', function(){
  const row = R({ id: 'r1', status: 'skipped', skip_reason: 'income_or_refund', amount_uah: 400, refund_suggest: 'c1' });
  const m = j(c.inboxRowModel(row, [], { c1: { id: 'c1', tx_time: new Date(2026, 10, 12, 10, 0).toISOString(), amount_uah: 1200 } }));
  assert.match(m.amount, /^\+400\s₴$/); assert.equal(m.suggest, true); assert.equal(m.reason, '');
  assert.match(m.suggestLabel, /^↩ Повернення до витрати 12 лис, 1\s?200\s₴\s›$/);
  assert.deepEqual(Array.from(c.refundRowActions(row)), ['refund', 'ignore']);
  assert.equal(j(c.inboxRowModel(row, [], {})).suggestLabel, '↩ Повернення до витрати\u00a0›'); // списання не знайдено: без дати й суми
});
test('refunded: автоматичне й ручне підписи, «Скасувати зіставлення» лише з refund_of', function(){
  const base = { id: 'r', status: 'refunded', amount_uah: 27, tx_time: T };
  assert.equal(c.inboxRowModel(Object.assign({ refund_auto: true, refund_of: 'c1' }, base), []).reason, 'Повернення враховано автоматично');
  assert.equal(c.inboxRowModel(Object.assign({ refund_auto: false }, base), []).reason, 'Повернення враховано');
  assert.equal(c.inboxRowModel(Object.assign({ refund_of: 'c1' }, base), []).canUndo, true);
  assert.equal(c.inboxRowModel(base, []).canUndo, false);
});
test('діалог вибору: запропоноване перше, порядок решти збережено; виклик за статусом списання', function(){
  const o = j(c.monoOptionsSorted([{ expense_id: 'e1' }, { expense_id: 'e2', suggested: true }, { expense_id: 'e3' }]));
  assert.deepEqual(o.map(function(x){ return x.expense_id; }), ['e2', 'e1', 'e3']);
  assert.deepEqual(j(c.monoRefundApplyCall({ id: 'r' }, { status: 'new', charge_inbox_id: 'c9', expense_id: null })), { fn: 'mono_apply_refund_inbox', args: { p_inbox_id: 'r', p_charge_inbox_id: 'c9' } });
  assert.deepEqual(j(c.monoRefundApplyCall({ id: 'r' }, { status: 'added', charge_inbox_id: 'c9', expense_id: 'e5' })), { fn: 'mono_apply_refund', args: { p_inbox_id: 'r', p_expense_id: 'e5' } });
});
test('план тостів: лише коли витрату додано, один раз на id, без повторів; повне повернення → видалено', function(){
  const ch = { c1: { description: 'Тест', net_uah: 23, amount_uah: 50 }, c2: { description: 'Інше', net_uah: 0, amount_uah: 40 } };
  const rows = [{ id: 'a', amount_minor: 2700, refund_of: 'c1', expense_id: 'e1' }, { id: 'b', amount_minor: 4000, refund_of: 'c2', expense_id: 'e2' }, { id: 'n', amount_minor: 100, refund_of: 'c1', expense_id: null }, { id: 'd', amount_minor: 100, refund_of: 'c1', expense_id: 'e3' }];
  const p = j(c.monoRefundToastPlan(rows, ch, ['d']));
  assert.deepEqual(p.map(function(x){ return x.id; }), ['a', 'b']);
  assert.deepEqual(p[0], { id: 'a', name: 'Тест', refundUah: 27, oldAmount: 50, newAmount: 23, deleted: false });
  assert.equal(p[1].deleted, true);
});
test('охоронні: вкладки «Нові»/«Пропущені», нові колонки, тост info без кнопки, сигнал mono_refund_at', function(){
  assert.match(SRC, /status\.eq\.new,and\(status\.eq\.skipped,refund_suggest\.not\.is\.null\)/);
  assert.match(SRC, /notified_at,refunded_minor,net_uah,refund_of,refund_auto,refund_suggest,auto_added,reviewed_at,suggestions'/);
  assert.match(SRC, /kind === 'mono-refund-auto'\)\{[^]*?kind: 'info'[^]*?actionLabel: '', action: null/);
  assert.match(SRC, /rpc\('mono_refund_options'/); assert.match(SRC, /rpc\('mono_refund_undo'/);
  assert.match(SRC, /heads\.mono_refund_at/); assert.match(SRC, /eq\('refund_auto', true\)\.gt\('decided_at', prev\)/);
  assert.doesNotMatch(SRC, /rpc\('mono_refund_candidates'/);
});
