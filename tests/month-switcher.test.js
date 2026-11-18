// Rev 2.32.356 (DS-3e): перемикач місяця — перелік, межі стрілок, перехід через рік, розмітка списку
const test = require('node:test');
const assert = require('node:assert');
const { buildSandbox } = require('./extract');
const DOC = { createElement: function(){ let v = ''; return { set textContent(s){ v = String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }, get innerHTML(){ return v; } }; } }; // мінімальна заглушка DOM для escapeHtml
const c = buildSandbox({ document: DOC }, ['monthPickerList', 'monthStepTarget', 'monthShortName', 'monthMenuHTML', 'shiftMonth', 'escapeHtml', 'escapeAttr', 'UA_MONTHS']);
test('перелік: без даних — лише поточний; майбутні ігноруються; невалідні ключі відкидаються', function(){
  assert.deepEqual(Array.from(c.monthPickerList([], '2026-11')), ['2026-11']);
  assert.deepEqual(Array.from(c.monthPickerList(undefined, '2026-11')), ['2026-11']);
  assert.deepEqual(Array.from(c.monthPickerList(['2026-12', '2027-01'], '2026-11')), ['2026-11'], 'лише майбутні дані → поточний');
  assert.deepEqual(Array.from(c.monthPickerList(['2026-11', 'abc', null, '2026-13x'], '2026-11')), ['2026-11']);
});
test('перелік: один місяць; неперервний діапазон від першого з даних; перехід через рік', function(){
  assert.deepEqual(Array.from(c.monthPickerList(['2026-11'], '2026-11')), ['2026-11']);
  assert.deepEqual(Array.from(c.monthPickerList(['2026-09', '2026-11'], '2026-11')), ['2026-09', '2026-10', '2026-11'], 'порожній проміжний місяць лишається');
  const l = Array.from(c.monthPickerList(['2025-11', '2026-02'], '2026-02'));
  assert.deepEqual(l, ['2025-11', '2025-12', '2026-01', '2026-02']);
  assert.equal(c.monthPickerList(['2024-01'], '2026-11').length, 35);
});
test('стрілки: межі — перший місяць з даними і поточний; крок через рік', function(){
  const l = ['2025-11', '2025-12', '2026-01', '2026-02'];
  assert.equal(c.monthStepTarget(l, '2025-11', -1), null, '‹ неактивна на першому');
  assert.equal(c.monthStepTarget(l, '2026-02', 1), null, '› неактивна на поточному');
  assert.equal(c.monthStepTarget(l, '2025-12', 1), '2026-01');
  assert.equal(c.monthStepTarget(l, '2026-01', -1), '2025-12', 'перехід через рік назад');
  assert.equal(c.monthStepTarget(l, '2025-12', -1), '2025-11');
  const one = ['2026-11']; assert.equal(c.monthStepTarget(one, '2026-11', -1), null); assert.equal(c.monthStepTarget(one, '2026-11', 1), null);
  assert.equal(c.monthStepTarget(l, '2026-05', -1), '2026-02', 'вибраного немає в списку (програмний перехід): найближчий назад');
  assert.equal(c.monthStepTarget(l, '2026-05', 1), null, 'майбутній місяць: уперед немає');
  assert.equal(c.monthStepTarget([], '2026-05', 1), null);
});
test('назва: велика літера, рік лише для іншого року', function(){
  assert.equal(c.monthShortName('2026-11', '2026-11'), 'Листопад');
  assert.equal(c.monthShortName('2025-12', '2026-11'), 'Грудень 2025');
});
test('розмітка списку: від поточного назад, заголовки років, «поточний», галочка й aria-checked на вибраному', function(){
  const l = ['2025-12', '2026-01', '2026-02'];
  const h = c.monthMenuHTML(l, '2026-01', '2026-02');
  assert.ok(h.indexOf('data-m="2026-02"') < h.indexOf('data-m="2026-01"') && h.indexOf('data-m="2026-01"') < h.indexOf('data-m="2025-12"'));
  assert.equal((h.match(/class="yh"/g) || []).length, 2); assert.ok(h.indexOf('>2026<') < h.indexOf('>2025<'));
  assert.equal((h.match(/<small>поточний<\/small>/g) || []).length, 1);
  assert.equal((h.match(/aria-checked="true"/g) || []).length, 1); assert.equal((h.match(/role="menuitemradio"/g) || []).length, 3);
  assert.equal((h.match(/<svg/g) || []).length, 1, 'галочка лише на вибраному');
  const evil = c.monthMenuHTML(['2026-01"><script>'], 'x', '2026-02'); assert.ok(!/<script/.test(evil), 'ключ екранується');
});
