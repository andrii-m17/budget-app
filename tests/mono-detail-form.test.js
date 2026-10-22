// Rev 2.32.59 (F2) — деталі операції Monobank: компактні рядки (як у формах «Структури»), прозорий select, текст значення окремо.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const { buildSandbox } = require('./extract');
function env(catVal, catText, subVal, subText){
  const els = { fldmono2: { value: catVal, selectedIndex: 0, options: [{ text: catText }] }, fldmono3: { value: subVal, selectedIndex: 0, options: [{ text: subText }] }, 'mono-val-cat': { textContent: '' }, 'mono-val-sub': { textContent: '' } };
  const c = buildSandbox({ document: { getElementById: function(id){ return els[id]; } } }, ['monoPickRefresh']);
  return { c: c, els: els };
}
test('monoPickRefresh: текст значення береться з підпису вибраного варіанта (довгий не обрізається в даних); порожні — «Не обрано» / «Без підкатегорії»', function(){
  const e = env('🍔 Харчування', '🍔 Харчування', '🫕 Обіди', '🫕 Обіди'); e.c.monoPickRefresh();
  assert.equal(e.els['mono-val-cat'].textContent, '🍔 Харчування'); assert.equal(e.els['mono-val-sub'].textContent, '🫕 Обіди');
  const e2 = env('', '— не визначено —', '', '—'); e2.c.monoPickRefresh();
  assert.equal(e2.els['mono-val-cat'].textContent, 'Не обрано'); assert.equal(e2.els['mono-val-sub'].textContent, 'Без підкатегорії');
});
test('розмітка: category/subcategory — рядки .sf-row з прозорим select (id незмінні), примітка — рядок із полем; підписів зверху немає; колишній .mono-sel прибрано', function(){
  const drawer = SRC.slice(SRC.indexOf('id="mono-detail-drawer"'), SRC.indexOf('id="mono-detail-actions"'));
  assert.match(drawer, /<select id="fldmono2" class="sf-select"[^>]*onchange="onMonoDetailCategoryChange\(\)"/);
  assert.match(drawer, /<select id="fldmono3" class="sf-select"[^>]*onchange="onMonoDetailSubChange\(\)"/);
  assert.match(drawer, /<input type="text" id="fldmono4" class="sf-input"/);
  assert.ok(!/<label for="fldmono/.test(drawer) && !/class="field"/.test(drawer), 'підписів зверху (label for / .field) немає');
  assert.ok(!/mono-sel/.test(SRC));
  assert.match(drawer, /class="drawer-close"/); // ✕ у Monobank лишається
});
test('значення оновлюється всюди: початкове заповнення, ручна зміна, підбір за словом, скидання підбору', function(){
  assert.match(SRC, /monoKwReset\(\); \/\/ Rev 2\.32\.35 \(K\)[^\n]*\n\s*monoInstFill\(row, showInst\);\n\s*monoPickRefresh\(\);/); // Rev 2.32.128: між ними заповнення рядка «ОЧ»
  assert.match(SRC, /function onMonoDetailSubChange\(\)\{[^}]*monoPickRefresh\(\); \}/);
  assert.match(SRC, /subcategoryOptionsHtml\(cat, ''\);\n\s*monoPickRefresh\(\);\n\}/);
  assert.match(SRC, /s\.value = sub \|\| '';\n\s*monoPickRefresh\(\);\n\}/);
});
test('інформаційні рядки (сума, дата й час, картка) — .sf-row із підписом ліворуч і значенням праворуч (textContent); кнопки «Додати» й «Ігнорувати» лишились, друга обведена', function(){
  const fn = SRC.slice(SRC.indexOf('function openMonoDetail'), SRC.indexOf('function closeMonoDetail'));
  assert.match(fn, /r\.className = 'sf-row'/); assert.match(fn, /b\.className = 'sf-value'; b\.textContent = value;/);
  assert.match(SRC, /html:root #mono-detail-drawer \.mono-detail-actions \.submit-btn\.secondary/);
  assert.match(SRC, /id="mono-detail-add" onclick="monoDetailAdd\(\)">Додати</); assert.match(SRC, /id="mono-detail-ignore" onclick="monoDetailIgnore\(\)">Ігнорувати</);
  assert.match(SRC, /flashField\('mono-pick-group'\)/);
});
test('підказка підбору за словом і «Скасувати підбір» збережено; стилі спільні зі «Структурою»; нових полів вводу немає', function(){
  assert.match(SRC, /id="mono-kw-hint"[\s\S]*?Скасувати підбір/);
  assert.match(SRC, /:is\(#struct-drawer, #mono-detail-drawer\) \.sf-row\{[^}]*min-height:48px/);
  assert.ok(!/fldmono[6-9]/.test(SRC)); // Rev 2.32.128: єдиний новий елемент — select fldmono5 («ОЧ»; не текстове поле)
});
