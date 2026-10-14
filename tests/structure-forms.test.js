// Rev 2.32.58 (F1) — форми «Структури» у компоненті .drawer: компактні рядки, пара кнопок, видалення текстом, без .app-modal--sheet.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildSandbox } = require('./extract');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const j = function(v){ return JSON.parse(JSON.stringify(v)); };
const c = buildSandbox({}, ['splitLeadingEmoji', 'tileForName', 'selectRowValue']);
test('tileForName: емодзі з початку назви, інакше перша літера, порожня — «?»', function(){
  assert.deepEqual(j(c.tileForName('🍕 Піца')), { text: '🍕', isEmoji: true });
  assert.deepEqual(j(c.tileForName('Піца')), { text: 'П', isEmoji: false });
  assert.deepEqual(j(c.tileForName('')), { text: '?', isEmoji: false });
  assert.deepEqual(j(c.tileForName('  кава')), { text: 'К', isEmoji: false });
});
test('selectRowValue: підпис вибраного варіанта, а не значення; порожньо, якщо нема', function(){
  const opts = [{ value: '', label: 'Без підкатегорії' }, { value: 'a', label: 'Дуже довга назва підкатегорії' }];
  assert.equal(c.selectRowValue({ options: opts, value: '' }), 'Без підкатегорії');
  assert.equal(c.selectRowValue({ options: opts, value: 'a' }), 'Дуже довга назва підкатегорії');
  assert.equal(c.selectRowValue({ options: opts, value: 'zzz' }), ''); assert.equal(c.selectRowValue(null), '');
});
test('форми «Структури» відкриваються в .drawer і не використовують .app-modal--sheet', function(){
  assert.match(SRC, /<div class="drawer struct-form" id="struct-drawer" role="dialog"/);
  assert.ok(!/app-modal--sheet/.test(SRC), 'модифікатор прибрано');
  ['showCategoryModal', 'showSubcategoryModal', 'showDictionaryModal'].forEach(function(f){
    const body = SRC.match(new RegExp('function ' + f + '\\(.*?\\n\\}\\n', 's'))[0];
    assert.match(body, /openStructForm\(/); assert.ok(!/presentAppModal|app-modal/.test(body), f);
  });
  assert.match(SRC, /#income-drawer\.open, #card-debt-drawer\.open, #installment-drawer\.open, #struct-drawer\.open\{/); // те саме положення, що й у Доході/Борзі/ОЧ/картки
  assert.match(SRC, /html\.kb-sheet-moving #struct-drawer input/);
});
test('заголовки в один рядок (без ✕ у формах «Структури»); назви за режимом', function(){
  assert.match(SRC, /:is\(#struct-drawer, #mono-detail-drawer\) \.sf-title\{[^}]*white-space:nowrap/);
  const drawer = SRC.match(/<div class="drawer struct-form" id="struct-drawer"[\s\S]*?<\/div>\n<\/div>\n/)[0];
  assert.ok(!/drawer-close/.test(drawer), 'без ✕');
  assert.match(SRC, /category: \['Нова категорія', 'Категорія'\], subcategory: \['Нова підкатегорія', 'Підкатегорія'\], word: \['Нове слово', 'Слово'\]/);
  assert.match(SRC, /save\.textContent = cfg\.edit \? 'Зберегти' : 'Додати';/);
});
test('рядки 48 пт, підпис ліворуч і значення праворуч; select прозорий поверх рядка; текст значення окремо з ellipsis', function(){
  assert.match(SRC, /:is\(#struct-drawer, #mono-detail-drawer\) \.sf-row\{[^}]*min-height:48px/);
  assert.match(SRC, /:is\(#struct-drawer, #mono-detail-drawer\) \.sf-input\{[^}]*height:48px/);
  assert.match(SRC, /:is\(#struct-drawer, #mono-detail-drawer\) \.sf-select\{ position:absolute; inset:0; width:100%; height:100%; opacity:0;/);
  assert.match(SRC, /:is\(#struct-drawer, #mono-detail-drawer\) \.sf-value\{[^}]*text-overflow:ellipsis/);
  assert.match(SRC, /:is\(#struct-drawer, #mono-detail-drawer\) \.sf-group\{[^}]*border-radius:18px/);
  assert.ok(!/class="sf-label-top"|text-transform:uppercase[^}]*sf-/.test(SRC.slice(SRC.indexOf(':is(#struct-drawer, #mono-detail-drawer) .sf-title'), SRC.indexOf(':is(#struct-drawer, #mono-detail-drawer) .sf-delete-wrap .struct-caption'))), 'підписів зверху немає');
  assert.match(SRC, /sel\.addEventListener\('change', function\(\)\{ api\.refresh\(\);/);
  assert.match(SRC, /\{ value: '', label: 'Без підкатегорії' \}/);
});
test('плитка-перегляд оновлюється під час набору; підпис про емодзі; тип категорії сегментами', function(){
  assert.match(SRC, /input\.addEventListener\('input', upd\); upd\(\);/);
  assert.match(SRC, /const STRUCT_NAME_CAPTION = 'Емодзі на початку назви стає іконкою\. Без емодзі іконкою буде перша літера\.';/);
  assert.match(SRC, /'Тип категорії'/); assert.match(SRC, /state\.type = t;/);
});
test('кнопки знизу парою в один рядок; «Скасувати» обведена; «Видалити …» червоним текстом під парою лише при редагуванні, з підписом', function(){
  assert.match(SRC, /:is\(#struct-drawer, #mono-detail-drawer\) \.sf-actions\{ display:flex; gap:10px;/);
  assert.match(SRC, /:is\(#struct-drawer, #mono-detail-drawer\) \.sf-actions \.submit-btn\{ flex:1 1 0; min-height:50px; \}/);
  assert.match(SRC, /submit-btn\.secondary\{ background:transparent; border:1\.5px solid var\(--color-border-strong\)/);
  assert.match(SRC, /id="sf-delete" class|<button type="button" class="cdd-delete-link" id="sf-delete">/);
  assert.match(SRC, /if\(cfg\.del\)\{/); assert.match(SRC, /dw\.style\.display = 'none';/);
  assert.match(SRC, /Витрати цієї категорії не видаляються\. Видалена категорія потрапляє у «Видалені дані»\./);
});
test('клавіатурна логіка не змінена: фокус через focusFirstIn, data-sheet-id для рекордера, id поля чистий (fldstr3), значення через textContent/Option', function(){
  const fn = SRC.slice(SRC.indexOf('function openStructForm'), SRC.indexOf('function closeStructForm'));
  assert.match(fn, /focusFirstIn\(drawer\);/); assert.match(fn, /lockBackgroundScroll\(\);/); assert.match(fn, /input\.id = 'fldstr3'/);
  assert.ok(!/innerHTML\s*=\s*[^;]*(cfg|value|label)/.test(fn.replace(/chev\.innerHTML = SF_CHEV_SVG/, '')), 'дані не йдуть через innerHTML');
  assert.match(SRC, /new Option\(o\.label, o\.value\)/);
  assert.match(SRC, /closeProfileLoginDrawer\(\); closeStructForm\(\);/); // Escape
  assert.match(SRC, /if\(structDrawer && structDrawer\.classList\.contains\('open'\)\) trapTabKey\(e, structDrawer\);/);
});
test('перейменування: повідомлення-підтвердження — окремим рядком у формі', function(){
  assert.match(SRC, /function setAppModalNotice\(text\)\{\n  const n = document\.getElementById\('sf-notice'\);\n  if\(structForm && n\)/);
  assert.equal((SRC.match(/setAppModalNotice\(renameConfirmText\(activeN\)\)/g) || []).length, 2);
});
