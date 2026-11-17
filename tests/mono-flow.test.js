// Rev 2.32.331 (MONO-FLOW): модель лапки, варіанти категорій, «Додати всі», група автододаних, охоронні перевірки розмітки. Дані вигадані.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildSandbox } = require('./extract');
const SRC = require('./extract').readIndexWithCss();
const j = function(v){ return JSON.parse(JSON.stringify(v)); };
const c = buildSandbox({}, ['monoFmtUah', 'monoNetUah', 'monoRefundedUah', 'monoHeaderModel', 'monoSuggestOptions', 'monoCatLabel', 'addAllCandidates', 'monoAutoGroupModel', 'MONO_AUTO_DAYS']);
const R = function(extra){ return Object.assign({ id: 'x', tx_time: new Date(2026, 10, 12, 9, 5).toISOString(), description: 'Тест', amount_uah: 50, status: 'new' }, extra || {}); };

test('лапка: число = mono_new; лише автододані = крапка; обидва нулі, без банку чи сесії = прихована', function(){
  assert.deepEqual(j(c.monoHeaderModel(true, 3, 0, true)), { visible: true, count: '3', dot: false, label: 'Monobank, нових: 3' });
  assert.equal(c.monoHeaderModel(true, 12, 2, true).count, '9+');
  const d = j(c.monoHeaderModel(true, 0, 2, true)); assert.equal(d.visible, true); assert.equal(d.count, ''); assert.equal(d.dot, true);
  assert.equal(c.monoHeaderModel(true, 0, 0, true).visible, false);
  assert.equal(c.monoHeaderModel(false, 5, 1, true).visible, false);
  assert.equal(c.monoHeaderModel(true, 5, 1, false).visible, false);
  assert.equal(c.monoHeaderModel(true, 'x', null, true).visible, false);
});
test('варіанти категорій: suggestions (до 3, без дублів), запасний suggested_category, інакше порожньо', function(){
  const o = j(c.monoSuggestOptions(R({ suggestions: [{ c: 'Їжа', s: 'Обіди' }, { c: 'Їжа', s: 'Обіди' }, { c: 'Їжа', s: '' }, { c: 'А', s: 'б' }, { c: 'Б', s: 'в' }], suggested_category: 'Інше' })));
  assert.deepEqual(o, [{ c: 'Їжа', s: 'Обіди' }, { c: 'Їжа', s: '' }, { c: 'А', s: 'б' }]);
  assert.deepEqual(j(c.monoSuggestOptions(R({ suggestions: [], suggested_category: 'Покупки', suggested_subcategory: 'Одяг' }))), [{ c: 'Покупки', s: 'Одяг' }]);
  assert.deepEqual(j(c.monoSuggestOptions(R({ suggestions: null }))), []);
  assert.deepEqual(j(c.monoSuggestOptions(R({ suggestions: [{ c: 5 }, null, { c: '' }] }))), []);
  assert.equal(c.monoCatLabel({ c: 'Їжа', s: 'Обіди' }), 'Їжа · Обіди'); assert.equal(c.monoCatLabel({ c: 'Їжа', s: '' }), 'Їжа');
});
test('«Додати всі»: лише рівно один варіант; 2–3 варіанти й без варіантів не додаються; нульова чиста сума теж', function(){
  const one = R({ id: 'a', suggestions: [{ c: 'Їжа', s: '' }] }), legacy = R({ id: 'b', suggested_category: 'Їжа' });
  const many = R({ id: 'c', suggestions: [{ c: 'Їжа', s: '' }, { c: 'Дім', s: '' }] }), none = R({ id: 'd' }), zero = R({ id: 'e', suggestions: [{ c: 'Їжа', s: '' }], net_uah: 0 });
  assert.deepEqual(c.addAllCandidates([one, legacy, many, none, zero]).map(function(r){ return r.id; }), ['a', 'b']);
});
test('група «Додано автоматично»: з локальної витрати; немає — suggested_* і чиста сума; видалену в Журналі не показувати', function(){
  const rows = [R({ id: 'a', expense_id: 'e1', suggested_category: 'Стара' }), R({ id: 'b', expense_id: 'e2', suggested_category: 'Транспорт', suggested_subcategory: 'Самокат', net_uah: 23 }), R({ id: 'd', expense_id: 'e3' })];
  const exps = [{ id: 'e1', category: 'Нова', subcategory: 'Під', amount: 77, name: 'Своя назва' }, { id: 'e3', deletedAt: '2026-11-12', category: 'К', amount: 1 }];
  const g = j(c.monoAutoGroupModel(rows, exps));
  assert.equal(g.length, 2);
  assert.equal(g[0].name, 'Своя назва'); assert.equal(g[0].sub, 'Нова · Під · 09:05'); assert.match(g[0].amount, /^−77\s₴$/);
  assert.equal(g[1].sub, 'Транспорт · Самокат · 09:05'); assert.match(g[1].amount, /^−23\s₴$/);
});
test('охоронні: банера немає, лапка й пункт бічної панелі, нові RPC з правильними параметрами, група за 3 дні', function(){
  assert.doesNotMatch(SRC, /id="mono-banner"|mono-banner-text/);
  assert.match(SRC, /id="mono-paw-btn" onclick="openMonoInbox\(\{ tab: 'new' \}\)" aria-label="Monobank"/);
  assert.match(SRC, /id="mono-side-tab"/);
  assert.match(SRC, /rpc\('mono_auto_review', \{ p_ids: null \}|monoAutoRpc\('mono_auto_review', \{ p_ids: null \}\)/);
  assert.match(SRC, /monoAutoRpc\('mono_recategorize', \{ p_inbox_id: row\.id, p_category: o\.c, p_subcategory: o\.s \|\| null \}\)/);
  assert.match(SRC, /monoAutoRpc\('mono_auto_revert', \{ p_inbox_id: row\.id \}\)/);
  assert.match(SRC, /rpc\('mono_set_auto_add', \{ p_on: next \}\)/);
  assert.match(SRC, /\.eq\('status', 'added'\)\.eq\('auto_added', true\)\.is\('reviewed_at', null\)\.gt\('decided_at', since\)/);
  assert.match(SRC, /MONO_AUTO_DAYS = 3/);
  assert.match(SRC, /const o1 = monoSuggestOptions\(row\)\[0\];[^]*?monoAcceptRow\(row, o1\.c, o1\.s,/); // «Додати всі» бере категорію з єдиного варіанта (suggestions або suggested_category)
  assert.match(SRC, /Супермаркети завжди чекають вашого вибору\./);
  assert.match(SRC, /heads\.mono_auto_review/);
  assert.match(SRC, /\.mono-cat-btn::after\{[^}]*height:44px/);
});
