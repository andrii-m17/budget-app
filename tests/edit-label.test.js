// Rev 2.32.8 (A) — тест edit-label завершено: лишено no-for (span-підпис без for + aria-label), реєстр порожній.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ex = require('./extract');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
test('підпис поля «Назва» в редагуванні: span без for + aria-label; гілок current/reword і getVariant(edit-label) у коді немає', () => {
  const c = ex.buildSandbox({}, ['editNameLabelHtml', 'editNameAriaAttr']);
  assert.equal(c.editNameLabelHtml('X'), '<span class="fld-label-like">Назва</span>');
  assert.equal(c.editNameAriaAttr(), ' aria-label="Назва витрати"');
  assert.ok(!/getVariant\('edit-label'\)|editLabelVariant|labelVariant|id: 'edit-label'/.test(SRC.replace(/\/\/[^\n]*/g, '')), 'гілки тесту прибрано');
  assert.match(SRC, /const TEST_VARIANTS = \[\];/);
});
test('розкладка однакова: .fld-label-like має ті самі стилі, що .field label (в обох правилах)', () => {
  assert.match(SRC, /\.field label, \.field \.fld-label-like\{ display:block; font-size:11px;/);
  assert.match(SRC, /#view-vytraty \.field label, #view-vytraty \.field \.fld-label-like\{/);
});
test('id поля чистий; input-focus-audit лишає fieldLabelFor, без labelVariant', () => {
  const i = SRC.indexOf('const editPanelHtml = isEditing'), code = SRC.slice(i, i + 900);
  assert.match(code, /id="edtfielda1-\$\{e\.id\}"\$\{editNameAriaAttr\(\)\}/);
  assert.match(SRC, /fieldLabelFor: !!\(t\.id && document\.querySelector\('label\[for=/);
  assert.match(SRC, /DEBUG_EVENT_ALLOWLIST = \[[\s\S]*'fieldLabelFor'/);
});
test('правило про автозаповнення лишається в CLAUDE.md, ROADMAP.md і TESTING.md', () => {
  const r = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
  assert.match(r('CLAUDE.md'), /Автозаповнити контакт/);
  assert.match(r('CLAUDE.md'), /`fld` \+ код \+ число/);
  assert.match(r('docs/ROADMAP.md'), /Правила проєкту/);
  assert.match(r('docs/TESTING.md'), /нових текстових полів/);
});
