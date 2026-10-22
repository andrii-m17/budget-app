// Rev 2.32.146 (JOURNAL-RESET): «Скинути · N» лише з фільтрами категорії/підкатегорії.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildSandbox } = require('./extract');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
function ui(st){
  const btn = { hidden: true, text: '', attrs: {}, classList: { toggle(c, on){ btn.hidden = !!on; } }, setAttribute(k, v){ btn.attrs[k] = v; }, set textContent(v){ btn.text = v; }, get textContent(){ return btn.text; } };
  const input = { value: st.query };
  const els = { 'journal-reset-btn': btn, 'journal-search-input': input, 'journal-overlay': { scrollTop: 9 }, 'main-col': { scrollTop: 9 } };
  const events = [];
  const ctx = buildSandbox({ document: { getElementById: id => els[id] || null }, journalSearchQuery: st.query, journalSearchCategory: st.category, journalSearchSubcategory: st.sub, journalMonth: '2026-09',
    renderJournalView(){ ctx.updateJournalResetButton(); }, killMainColMomentumScroll(){}, captureDebugGeometry(t, e){ events.push(e); } },
    ['activeFilterCount', 'categoryFilterCount', 'resetFilters', 'journalFilterState', 'updateJournalResetButton', 'resetJournalFilters', 'resetJournalCategoryFilters']);
  ctx.updateJournalResetButton();
  return { ctx, btn, input, events };
}
test('без фільтрів: кнопки немає', function(){ const u = ui({ query: '', category: '', sub: '' }); assert.equal(u.btn.hidden, true); assert.equal(u.btn.text, ''); });
test('лише текст: кнопки немає (текст у лічильник не входить)', function(){ const u = ui({ query: 'кава', category: '', sub: '' }); assert.equal(u.btn.hidden, true); });
test('лише категорія: «Скинути · 1»', function(){ const u = ui({ query: '', category: 'Їжа', sub: '' }); assert.equal(u.btn.hidden, false); assert.equal(u.btn.text, 'Скинути · 1'); });
test('категорія й підкатегорія: «Скинути · 2»', function(){ const u = ui({ query: '', category: 'Їжа', sub: 'Кафе' }); assert.equal(u.btn.text, 'Скинути · 2'); });
test('текст і категорія: «Скинути · 1»', function(){ const u = ui({ query: 'кава', category: 'Їжа', sub: '' }); assert.equal(u.btn.text, 'Скинути · 1'); });
test('скидання: категорія й підкатегорія очищені, текст і поле не чіпаємо, кнопка ховається, угору', function(){
  const u = ui({ query: 'кава', category: 'Їжа', sub: 'Кафе' });
  u.ctx.resetJournalCategoryFilters();
  assert.equal(u.ctx.journalSearchCategory, ''); assert.equal(u.ctx.journalSearchSubcategory, '');
  assert.equal(u.ctx.journalSearchQuery, 'кава'); assert.equal(u.input.value, 'кава');
  assert.equal(u.btn.hidden, true);
  assert.deepEqual(JSON.parse(JSON.stringify(u.events)), [{ count: 2, scope: 'category' }]);
});
test('порожня видача: «Скинути фільтри» лишається й скидає все, включно з текстом', function(){
  assert.match(SRC, /journal-empty-reset" onclick="resetJournalFilters\(\)">Скинути фільтри/);
  const u = ui({ query: 'кава', category: 'Їжа', sub: '' });
  u.ctx.resetJournalFilters();
  assert.equal(u.ctx.journalSearchQuery, ''); assert.equal(u.ctx.journalSearchCategory, ''); assert.equal(u.input.value, '');
});
test('розкладка: обгортка пошуку flex:1, кнопка display:none при hidden (рядок не зсувається); кнопка в рядку викликає скидання категорій; без focus()', function(){
  assert.match(SRC, /\.journal-search-row \.journal-search-input-wrap\{ flex:1 1 auto; min-width:0; \}/);
  assert.match(SRC, /\.journal-reset-btn\.hidden\{ display:none; \}/);
  assert.match(SRC, /id="journal-reset-btn" onclick="resetJournalCategoryFilters\(\)"/);
  const fn = SRC.match(/function resetJournalCategoryFilters\(\)\{[\s\S]*?\n\}/)[0];
  assert.ok(!/\.focus\(|journal-search-input|clearJournalSearchText/.test(fn));
});
