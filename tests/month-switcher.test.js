// Rev 2.32.356 (DS-3e): перемикач місяця — перелік, межі стрілок, перехід через рік, розмітка списку
const test = require('node:test');
const assert = require('node:assert');
const { buildSandbox } = require('./extract');
const DOC = { createElement: function(){ let v = ''; return { set textContent(s){ v = String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }, get innerHTML(){ return v; } }; } }; // мінімальна заглушка DOM для escapeHtml
const c = buildSandbox({ document: DOC }, ['monthPickerList', 'monthStepTarget', 'monthShortName', 'monthMenuHTML', 'shiftMonth', 'escapeHtml', 'escapeAttr', 'UA_MONTHS']);
test('перелік: без даних — поточний і наступний; майбутні дані (далі за наступний) ігноруються; невалідні ключі відкидаються', function(){
  assert.deepEqual(Array.from(c.monthPickerList([], '2026-11')), ['2026-11', '2026-12']);
  assert.deepEqual(Array.from(c.monthPickerList(undefined, '2026-11')), ['2026-11', '2026-12']);
  assert.deepEqual(Array.from(c.monthPickerList(['2026-12', '2027-03'], '2026-11')), ['2026-11', '2026-12'], 'дані лише в майбутньому: початок — поточний, кінець — наступний');
  assert.deepEqual(Array.from(c.monthPickerList(['2026-11', 'abc', null, '2026-13x'], '2026-11')), ['2026-11', '2026-12']);
});
test('перелік: один місяць; неперервний діапазон від першого з даними до наступного; порожніх місяців до першого немає', function(){
  assert.deepEqual(Array.from(c.monthPickerList(['2026-11'], '2026-11')), ['2026-11', '2026-12']);
  assert.deepEqual(Array.from(c.monthPickerList(['2026-09', '2026-11'], '2026-11')), ['2026-09', '2026-10', '2026-11', '2026-12'], 'порожній проміжний місяць лишається');
  assert.equal(c.monthPickerList(['2026-09'], '2026-11')[0], '2026-09', 'раніше першого з даними нічого немає');
  assert.equal(c.monthPickerList(['2024-01'], '2026-11').length, 36);
});
test('перехід через рік: грудень → наступний січень; назад через рік', function(){
  assert.deepEqual(Array.from(c.monthPickerList(['2026-11'], '2026-12')), ['2026-11', '2026-12', '2027-01'], 'сьогодні грудень: наступний — січень наступного року');
  const l = Array.from(c.monthPickerList(['2025-11', '2026-02'], '2026-02'));
  assert.deepEqual(l, ['2025-11', '2025-12', '2026-01', '2026-02', '2026-03']);
  const d = Array.from(c.monthPickerList(['2026-10'], '2026-12'));
  assert.equal(c.monthStepTarget(d, '2026-12', 1), '2027-01'); assert.equal(c.monthStepTarget(d, '2027-01', 1), null, '› неактивна на наступному'); assert.equal(c.monthStepTarget(d, '2027-01', -1), '2026-12');
});
test('стрілки: ‹ неактивна на першому місяці з даними, › доходить до наступного й там неактивна', function(){
  const l = ['2025-11', '2025-12', '2026-01', '2026-02', '2026-03'];
  assert.equal(c.monthStepTarget(l, '2025-11', -1), null, '‹ неактивна на першому');
  assert.equal(c.monthStepTarget(l, '2026-02', 1), '2026-03', '› з поточного веде до наступного');
  assert.equal(c.monthStepTarget(l, '2026-03', 1), null, '› неактивна на наступному');
  assert.equal(c.monthStepTarget(l, '2025-12', 1), '2026-01');
  assert.equal(c.monthStepTarget(l, '2026-01', -1), '2025-12', 'перехід через рік назад');
  const none = ['2026-11', '2026-12']; assert.equal(c.monthStepTarget(none, '2026-11', -1), null); assert.equal(c.monthStepTarget(none, '2026-11', 1), '2026-12');
  assert.equal(c.monthStepTarget(l, '2026-07', -1), '2026-03', 'вибраного немає в списку (програмний перехід): найближчий назад');
  assert.equal(c.monthStepTarget(l, '2026-07', 1), null);
  assert.equal(c.monthStepTarget([], '2026-05', 1), null);
});
test('назва: велика літера, рік лише для іншого року', function(){
  assert.equal(c.monthShortName('2026-11', '2026-11'), 'Листопад');
  assert.equal(c.monthShortName('2025-12', '2026-11'), 'Грудень 2025');
  assert.equal(c.monthShortName('2027-01', '2026-12'), 'Січень 2027', 'наступний місяць іншого року показує рік');
  assert.equal(c.monthShortName('2026-12', '2026-12'), 'Грудень');
  assert.equal(c.monthShortName('2024-03', '2026-11'), 'Березень 2024');
});
test('розмітка списку: від наступного вниз, заголовки років, «наступний», «поточний», галочка й aria-checked на вибраному', function(){
  const l = ['2025-12', '2026-01', '2026-02', '2026-03'];
  const h = c.monthMenuHTML(l, '2026-01', '2026-02');
  const pos = (m) => h.indexOf('data-m="' + m + '"');
  assert.ok(pos('2026-03') < pos('2026-02') && pos('2026-02') < pos('2026-01') && pos('2026-01') < pos('2025-12'), 'порядок: наступний, поточний, назад');
  assert.equal((h.match(/class="yh"/g) || []).length, 2); assert.ok(h.indexOf('>2026<') < h.indexOf('>2025<'));
  assert.equal((h.match(/<small>поточний<\/small>/g) || []).length, 1); assert.equal((h.match(/<small>наступний<\/small>/g) || []).length, 1);
  assert.ok(h.indexOf('наступний') < h.indexOf('поточний'), '«наступний» над «поточним»');
  assert.equal((h.match(/aria-checked="true"/g) || []).length, 1); assert.equal((h.match(/role="menuitemradio"/g) || []).length, 4);
  assert.equal((h.match(/<svg/g) || []).length, 1, 'галочка лише на вибраному');
  // грудень → січень: заголовок наступного року над заголовком поточного
  const y = c.monthMenuHTML(['2026-11', '2026-12', '2027-01'], '2026-12', '2026-12');
  assert.ok(y.indexOf('>2027<') < y.indexOf('>2026<')); assert.ok(y.indexOf('Січень <small>наступний') !== -1 || y.indexOf('наступний') !== -1);
  const evil = c.monthMenuHTML(['2026-01"><script>'], 'x', '2026-02'); assert.ok(!/<script/.test(evil), 'ключ екранується');
});
