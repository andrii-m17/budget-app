// Rev 2.23.33 (6D.202) — «Скинути фільтри» у повному Журналі витрат.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildSandbox } = require('./extract');

const j = function(v){ return JSON.parse(JSON.stringify(v)); };
const SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const pure = buildSandbox({}, ['activeFilterCount', 'resetFilters']);

test('activeFilterCount: кожен фільтр окремо й разом; пробіли в пошуку не рахуються; місяць не фільтр', () => {
  assert.equal(pure.activeFilterCount({ query: '', category: '', subcategory: '', month: '2026-10' }), 0);
  assert.equal(pure.activeFilterCount({ query: 'кава' }), 1);
  assert.equal(pure.activeFilterCount({ query: '   ' }), 0);
  assert.equal(pure.activeFilterCount({ category: 'Їжа' }), 1);
  assert.equal(pure.activeFilterCount({ subcategory: 'Кафе' }), 1);
  assert.equal(pure.activeFilterCount({ query: 'к', category: 'Їжа' }), 2);
  assert.equal(pure.activeFilterCount({ query: 'к', category: 'Їжа', subcategory: 'Кафе', month: '2026-09' }), 3);
  assert.equal(pure.activeFilterCount(null), 0);
  assert.equal(pure.activeFilterCount(undefined), 0);
});
test('resetFilters: повертає значення за замовчуванням і лишає місяць', () => {
  assert.deepEqual(j(pure.resetFilters({ query: 'к', category: 'Їжа', subcategory: 'Кафе', month: '2026-09' })), { query: '', category: '', subcategory: '', month: '2026-09' });
  const orig = { query: 'к', category: 'Їжа', subcategory: '', month: '2026-08' };
  pure.resetFilters(orig);
  assert.equal(orig.query, 'к', 'вхідний об\'єкт не мутується');
});
function ui(initial){
  const els = {
    'journal-reset-btn': { hidden: true, text: '', attrs: {}, classList: { toggle(c, on){ els['journal-reset-btn'].hidden = !!on; } }, setAttribute(k, v){ this.attrs[k] = v; }, set textContent(v){ this.text = v; }, get textContent(){ return this.text; } },
    'journal-search-input': { value: initial.query },
    'journal-search-clear': { cls: false, classList: { add(){ els['journal-search-clear'].cls = true; } } },
    'journal-overlay': { scrollTop: 50 }, 'main-col': { scrollTop: 80 },
  };
  const events = [];
  const ctx = buildSandbox({
    document: { getElementById(id){ return els[id] || null; } },
    journalSearchQuery: initial.query, journalSearchCategory: initial.category, journalSearchSubcategory: initial.subcategory, journalMonth: '2026-09',
    renderJournalView(){ ctx.updateJournalResetButton(); }, killMainColMomentumScroll(){}, captureDebugGeometry(t, e){ events.push([t, e]); },
  }, ['activeFilterCount', 'resetFilters', 'journalFilterState', 'updateJournalResetButton', 'resetJournalFilters']);
  return { ctx, els, events };
}
test('кнопка: при 0 фільтрів прихована, при активних з лічильником і aria-label (F1)', () => {
  let u = ui({ query: '', category: '', subcategory: '' });
  u.ctx.updateJournalResetButton();
  assert.equal(u.els['journal-reset-btn'].hidden, true); assert.equal(u.els['journal-reset-btn'].text, '');
  u = ui({ query: 'кава', category: 'Їжа', subcategory: '' });
  u.ctx.updateJournalResetButton();
  assert.equal(u.els['journal-reset-btn'].hidden, false);
  assert.equal(u.els['journal-reset-btn'].text, 'Скинути · 2');
  assert.equal(u.els['journal-reset-btn'].attrs['aria-label'], 'Скинути фільтри, активних: 2');
});
test('натискання (F2): скидає всі фільтри, місяць лишається, список угору, подія лише з кількістю', () => {
  const u = ui({ query: 'кава', category: 'Їжа', subcategory: 'Кафе' });
  u.ctx.resetJournalFilters();
  assert.equal(u.ctx.journalSearchQuery, ''); assert.equal(u.ctx.journalSearchCategory, ''); assert.equal(u.ctx.journalSearchSubcategory, '');
  assert.equal(u.ctx.journalMonth, '2026-09', 'місяць не чіпаємо');
  assert.equal(u.els['journal-search-input'].value, '');
  assert.equal(u.els['journal-overlay'].scrollTop, 0); assert.equal(u.els['main-col'].scrollTop, 0);
  assert.equal(u.els['journal-reset-btn'].hidden, true, 'після скидання кнопка ховається');
  assert.deepEqual(j(u.events), [['journal-filters-reset', { count: 3 }]]);
});
test('джерело (F3/F4): кнопка у порожньому результаті, жодного focus() у скиданні, немає перемикача за типом запису в Журналі', () => {
  assert.ok(/journal-empty-reset" onclick="resetJournalFilters\(\)">Скинути фільтри/.test(SRC));
  const fn = SRC.slice(SRC.indexOf('function resetJournalFilters()'), SRC.indexOf('function isJournalSearchActive()'));
  assert.equal(/\.focus\(/.test(fn), false);
  const header = SRC.slice(SRC.indexOf('id="journal-overlay"'), SRC.indexOf('id="journal-list"'));
  assert.equal(/data-kind|journal-type|Доходи|Витрати\s*<\/button>/.test(header), false, 'залишку фільтра за типом запису немає');
  assert.ok(/aria-label="Скинути фільтри"/.test(SRC));
});
