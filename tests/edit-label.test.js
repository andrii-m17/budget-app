// Rev 2.32.6 (X) — тест edit-label: підпис поля «Назва» в редагуванні запису (три варіанти).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ex = require('./extract');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
function ctxFor(variant){
  return ex.buildSandbox({ getVariant: () => variant }, ['editLabelVariant', 'editNameLabelHtml', 'editNameAriaAttr']);
}
test('варіанти: current — label for «Назва»; no-for — span без for + aria-label; reword — label for «Витрата»; невідомий → no-for', () => {
  let c = ctxFor('current');
  assert.equal(c.editNameLabelHtml('X'), '<label for="edtfielda1-X">Назва</label>');
  assert.equal(c.editNameAriaAttr(), '');
  c = ctxFor('no-for');
  assert.equal(c.editNameLabelHtml('X'), '<span class="fld-label-like">Назва</span>');
  assert.equal(c.editNameAriaAttr(), ' aria-label="Назва витрати"');
  c = ctxFor('reword');
  assert.equal(c.editNameLabelHtml('X'), '<label for="edtfielda1-X">Витрата</label>');
  assert.equal(c.editNameAriaAttr(), '');
  c = ctxFor(null);
  assert.match(c.editNameLabelHtml('X'), /fld-label-like/);
});
test('розкладка однакова: .fld-label-like має ті самі стилі, що .field label (в обох правилах)', () => {
  assert.match(SRC, /\.field label, \.field \.fld-label-like\{ display:block; font-size:11px;/);
  assert.match(SRC, /#view-vytraty \.field label, #view-vytraty \.field \.fld-label-like\{/);
});
test('id поля чистий у всіх варіантах; новий підпис не додає полів вводу', () => {
  const i = SRC.indexOf('const editPanelHtml = isEditing'), code = SRC.slice(i, i + 900);
  assert.match(code, /id="edtfielda1-\$\{e\.id\}"\$\{editNameAriaAttr\(\)\}/);
  ['edtfielda1'].forEach(id => assert.ok(!/name|phone|tel|mail|addr|user|login|first|last|fio|contact/i.test(id)));
  assert.ok(!/id="[^"]*(name|mail)[^"]*"/i.test(code.replace(/aria-label="[^"]*"/g, '')), 'у фрагменті розмітки панелі немає id з name/mail');
});
test('реєстр: edit-label — 3 варіанти, типовий no-for, повний запис; input-focus-audit має fieldLabelFor і labelVariant', () => {
  const c = ex.buildSandbox({}, ['TEST_VARIANTS']);
  const reg = JSON.parse(ex.evalInSandbox(c, 'JSON.stringify(TEST_VARIANTS)'));
  const t = reg.find(x => x.id === 'edit-label');
  assert.ok(t);
  assert.deepEqual(t.variants.map(v => v.key), ['current', 'no-for', 'reword']);
  assert.equal(t.defaultVariant, 'no-for');
  ['title', 'what', 'addedIn', 'cleanupBy'].forEach(f => assert.ok(t[f]));
  assert.ok(t.checkSteps.length >= 2 && t.checkSteps.length <= 3);
  assert.match(SRC, /fieldLabelFor: !!\(t\.id && document\.querySelector\('label\[for=/);
  assert.match(SRC, /labelVariant: getVariant\('edit-label'\)/);
  ['fieldLabelFor', 'labelVariant'].forEach(f => assert.match(SRC, new RegExp("DEBUG_EVENT_ALLOWLIST = \\[[\\s\\S]*'" + f + "'")));
});
test('правило про автозаповнення лишається в CLAUDE.md, ROADMAP.md і TESTING.md', () => {
  const r = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
  assert.match(r('CLAUDE.md'), /Автозаповнити контакт/);
  assert.match(r('CLAUDE.md'), /`fld` \+ код \+ число/);
  assert.match(r('docs/ROADMAP.md'), /Правила проєкту/);
  assert.match(r('docs/TESTING.md'), /нових текстових полів/);
});
