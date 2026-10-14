// Rev 2.32.37 (T) — спливаюче підтвердження успіху.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildSandbox } = require('./extract');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const c = buildSandbox({}, ['MONO_MONTHS_GEN', 'monoFmtUah', 'pluralUa', 'successToastModel', 'shouldShowToast', 'successToastPlacement']);
test('successToastModel: додано N витрат · з Monobank · сума; відмінювання', function(){
  assert.deepEqual(JSON.parse(JSON.stringify(c.successToastModel('mono-added', { count: 3, amountUah: 412 }))), { title: 'Додано 3 витрати', subtitle: 'з Monobank · 412 ₴', actionLabel: 'Журнал', action: 'journal' });
  assert.equal(c.successToastModel('mono-added', { count: 1, amountUah: 50 }).title, 'Додано 1 витрату');
  assert.equal(c.successToastModel('mono-added', { count: 5, amountUah: 50 }).title, 'Додано 5 витрат');
});
test('successToastModel: повернення — частково й повністю; невідомий вид → null', function(){
  const m = c.successToastModel('refund', { name: 'Bolt самокат', oldAmount: 40, newAmount: 15 });
  assert.equal(m.title, 'Повернення враховано'); assert.equal(m.subtitle, 'Bolt самокат · 40 ₴ → 15 ₴');
  assert.equal(c.successToastModel('refund', { name: 'Bolt', oldAmount: 25, deleted: true }).subtitle, 'Bolt · 25 ₴ → видалено');
  assert.equal(c.successToastModel('x', {}), null);
});
test('shouldShowToast: зверху показується незалежно від шторок і клавіатури; successToastPlacement — зверху з safe-area', function(){
  assert.equal(c.shouldShowToast({ inputFocused: true, sheetOpen: true }), true);
  const p = JSON.parse(JSON.stringify(c.successToastPlacement()));
  assert.match(p.top, /env\(safe-area-inset-top/); assert.equal(p.side, 16);
});
test('охоронні (T2): позиція від верху, обгортка без дотиків, свайп угору, reduced-motion, черга, оновлення внизу без змін', function(){
  const host = SRC.match(/\.success-toast-host\{([^}]*)\}/)[1];
  assert.match(host, /top:calc\(env\(safe-area-inset-top, 0px\) \+ 8px\)/); assert.ok(!/bottom:/.test(host)); assert.match(host, /pointer-events:none/);
  assert.match(SRC, /\.success-toast\{ pointer-events:auto;/);
  assert.match(SRC, /@keyframes stIn\{ from\{ opacity:0; transform:translateY\(-16px\);/);
  assert.match(SRC, /@media \(prefers-reduced-motion: reduce\)\{ \.success-toast\{ animation:stFade/);
  assert.match(SRC, /\.success-toast-icon circle, \.success-toast-icon path\{ animation:none; stroke-dashoffset:0; \}/);
  assert.match(SRC, /if\(dy < -30\)\{ close\(\); return; \}/); assert.match(SRC, /touchstart[^\n]*clearTimeout\(successToastTimer\)/);
  assert.match(SRC, /if\(successToastActive \|\| !successToastQueue\.length\) return;/);
  assert.ok(!/successToastEnv|above-update|setTimeout\(pumpSuccessToast/.test(SRC));
  assert.match(SRC, /\.update-banner\{ position:fixed; left:50%; bottom:calc\(env\(safe-area-inset-bottom, 0px\) \+ 104px\)/);
  const body = SRC.slice(SRC.indexOf('function pumpSuccessToast'), SRC.indexOf('function openJournalFromToast'));
  assert.equal((body.match(/innerHTML/g) || []).length, 1);
  assert.match(body, /t\.textContent = o\.title/);
});
