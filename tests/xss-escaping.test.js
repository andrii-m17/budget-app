// Rev 2.32.19 (X, A1-5) — екранування тексту з даних у HTML.
// 1) Охоронний сканер джерела: у шаблонних підстановках `${…}` значення з назвами (name/kw/cat/sub/category/…) мусить пройти
//    escapeHtml/escapeAttr; явні винятки — нижче, з поясненням, чому безпечно.
// 2) Функціональні перевірки на 8 небезпечних рядках для чистих функцій, що повертають HTML.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildSandbox } = require('./extract');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

const DATA_PROPS = /(^|\.)(name|kw|cat|sub|category|subcategory|source|note|label|title|desc|text|type|chipText|names|labels)$/;
// Винятки: вираз → чому безпечно.
const ALLOWED = {
  'c.title': 'заголовки діагностичних перевірок — константи в коді',
  'i.title': 'заголовки інсайтів — константи; поля з даних у desc екрановані в місці побудови',
  'i.desc': 'тексти інсайтів: числа/константи, а назви категорій обгорнуті escapeHtml у місці побудови',
  'r.priority.label': 'підпис пріоритету — константа SUBCATEGORY_PRIORITY_OPTIONS',
  'p.label': 'підпис пріоритету — константа',
  'title': 'порожній стан Журналу: текст з monthLabel/констант',
  'sub': 'порожній стан Журналу: текст з monthLabel/констант',
  'names': 'вже зібраний фрагмент з escapeHtml (список «Не внесено»)',
  'labels': 'числа/константи (тренд, підписи графіка)',
};
function scanUnescaped(source){
  const bad = [];
  const re = /\$\{([^}]*)\}/g;
  source.split('\n').forEach(function(line, idx){
    if(line.indexOf('${') === -1) return;
    // Текстові контексти (не HTML): showConfirmModal пише через textContent, console.* та внутрішні рядки label — безпечно.
    if(/showConfirmModal\(|console\.|^\s*label = `|^\s*[?:] `[^<]*$/.test(line)) return;
    let m;
    re.lastIndex = 0;
    while((m = re.exec(line))){
      const expr = m[1].trim();
      if(!/^[A-Za-z_][\w.]*(\s*\|\|\s*[A-Za-z_][\w.]*)*$/.test(expr)) continue; // складні вирази (виклики, порівняння) — окремо через escape*
      const parts = expr.split(/\s*\|\|\s*/);
      parts.forEach(function(p){
        if(DATA_PROPS.test(p) && !ALLOWED[p]) bad.push({ line: idx + 1, expr: expr });
      });
    }
  });
  return bad;
}
test('X: у шаблонах немає неекранованих підстановок назв (охоронний сканер)', function(){
  const bad = scanUnescaped(SRC);
  assert.deepEqual(bad, [], 'неекрановано: ' + bad.map(function(b){ return b.line + ':' + b.expr; }).join(', '));
});
test('X: сканер справді ловить навмисно зламаний приклад', function(){
  const sample = 'el.innerHTML = `<span class="s-name">${c.name}</span><span>${d.sub || d.cat}</span>`;';
  assert.equal(scanUnescaped(sample).length, 3);
  assert.equal(scanUnescaped('el.innerHTML = `<b>${escapeHtml(c.name)}</b>`;').length, 0);
});
test('X: рядки-обробники з id проходять safeId', function(){
  assert.ok(SRC.indexOf("editDictionaryEntry('${safeId(d.id)}')") !== -1);
  assert.ok(SRC.indexOf("startEditRecord('${e.kind}','${safeId(e.id)}')") !== -1);
  assert.ok(!/onclick="[^"]*'\$\{e\.id\}'/.test(SRC), 'є onclick із сирим e.id');
});

// ---------- функціональні перевірки ----------
const PAYLOADS = [
  '<img src=x onerror=alert(1)>',
  '"><svg onload=alert(1)>',
  "A'B & C",
  'javascript:alert(1)',
  'Д'.repeat(5000),
  '🛒🔥👨‍👩‍👧',
  '</script><script>alert(1)</script>',
  '{{7*7}}',
];
function esc(s){ return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
const ctx = buildSandbox({
  escapeHtml: esc,
  escapeAttr: function(s){ return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); },
  CATEGORIES: [], SUBCATEGORIES: [],
}, ['categoryOptionsHtml', 'subcategoryOptionsHtml', 'safeId']);
function noRawTags(html){ return !/<(img|svg|script)\b/i.test(html) && !/"\s*>\s*<svg/i.test(html); }
PAYLOADS.forEach(function(p, i){
  test('X: список категорій/підкатегорій — payload #' + i + ' лишається текстом', function(){
    ctx.CATEGORIES.length = 0; ctx.SUBCATEGORIES.length = 0;
    ctx.CATEGORIES.push({ name: p, active: true, type: 'Гнучка' });
    ctx.SUBCATEGORIES.push({ name: p, category: p, active: true });
    const a = ctx.categoryOptionsHtml(p), b = ctx.subcategoryOptionsHtml(p, p);
    assert.ok(noRawTags(a) && noRawTags(b));
    // атрибут value не розривається лапкою
    assert.equal((a.match(/value="/g) || []).length, 2);
    assert.equal((b.match(/value="/g) || []).length, 2);
  });
});
test('X: safeId відсікає все, крім безпечних символів', function(){
  assert.equal(ctx.safeId("a1'); alert(1);//"), 'a1alert1');
  assert.equal(ctx.safeId('11111111-1111-4111-8111-111111111111'), '11111111-1111-4111-8111-111111111111');
});
