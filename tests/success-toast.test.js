// Rev 2.32.37 (T) / 2.32.39 (T2) / 2.32.46 (TO) — спільний верхній pop-up: усі види повідомлень.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildSandbox } = require('./extract');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const j = function(v){ return JSON.parse(JSON.stringify(v)); };
const c = buildSandbox({}, ['MONO_MONTHS_GEN', 'monoFmtUah', 'pluralUa', 'pluralToastWord', 'toastActionTarget', 'toastActionForEvents', 'toastModel', 'toastDuration', 'splitToastText', 'shouldShowToast', 'successToastPlacement']);
test('toastModel: додано N витрат · з Monobank · сума; відмінювання', function(){
  assert.deepEqual(j(c.toastModel('mono-added', { count: 3, amountUah: 412 })), { kind: 'success', title: 'Додано 3 витрати', subtitle: 'з Monobank · 412 ₴', actionLabel: '', action: null });
  assert.equal(c.toastModel('mono-added', { count: 1, amountUah: 50 }).title, 'Додано 1 витрату');
  assert.equal(c.toastModel('mono-added', { count: 5, amountUah: 50 }).title, 'Додано 5 витрат');
});
test('toastModel: повернення — частково й повністю; невідомий вид → null', function(){
  const m = c.toastModel('refund', { name: 'Bolt самокат', oldAmount: 40, newAmount: 15 });
  assert.equal(m.title, 'Повернення враховано'); assert.equal(m.subtitle, 'Bolt самокат · 40 ₴ → 15 ₴');
  assert.equal(c.toastModel('refund', { name: 'Bolt', oldAmount: 25, deleted: true }).subtitle, 'Bolt · 25 ₴ → видалено');
  assert.equal(c.toastModel('x', {}), null);
});
test('toastModel: дії другого учасника й зведення — іконка «Журнал» і дія «Журнал»', function(){
  const a = j(c.toastModel('other-actor', { actorName: 'Користувач Б', verbText: 'додала витрату', name: 'Кава', amount: 120 }));
  assert.deepEqual(a, { kind: 'info', icon: 'journal', title: 'Користувач Б додала витрату', subtitle: 'Кава · 120 ₴', actionLabel: 'Журнал', action: 'journal' });
  const s = j(c.toastModel('sync-summary', { text: 'Користувач Б внесла зміни: 3 витрати, поки ви були не в додатку.' }));
  assert.equal(s.icon, 'journal'); assert.equal(s.actionLabel, 'Журнал'); assert.equal(s.title, 'Синхронізація даних');
});
test('toastModel text + splitToastText: короткі тексти — заголовок; довгі діляться на заголовок і підзаголовок; види за тоном', function(){
  assert.deepEqual(j(c.splitToastText('Додано')), { title: 'Додано', subtitle: '' });
  assert.deepEqual(j(c.splitToastText("Не вдалося видалити назавжди: помилка зв'язку з сервером")), { title: 'Не вдалося видалити назавжди', subtitle: "помилка зв'язку з сервером" });
  assert.deepEqual(j(c.splitToastText('Запис відновлено · Кава · 50 ₴')), { title: 'Запис відновлено', subtitle: 'Кава · 50 ₴' });
  assert.equal(c.toastModel('text', { text: 'x', tone: 'error' }).kind, 'error');
  assert.equal(c.toastModel('text', { text: 'x', tone: 'warning' }).kind, 'warning');
  assert.equal(c.toastModel('text', { text: 'x' }).kind, 'success');
});
test('toastDuration: помилки й попередження довше (5 с), решта 3,5 с', function(){
  assert.equal(c.toastDuration('error'), 5000); assert.equal(c.toastDuration('warning'), 5000);
  assert.equal(c.toastDuration('success'), 3500); assert.equal(c.toastDuration('info'), 3500);
});
test('shouldShowToast: зверху показується незалежно від шторок і клавіатури; successToastPlacement — зверху з safe-area', function(){
  assert.equal(c.shouldShowToast({ inputFocused: true, sheetOpen: true }), true);
  const p = j(c.successToastPlacement());
  assert.match(p.top, /env\(safe-area-inset-top/); assert.equal(p.side, 16);
});
test('охоронні (TO): жодного старого тосту; усі види мають іконку; reduced-motion; черга; позиція зверху', function(){
  assert.ok(!/live-toast|attachToastDismiss|dismissLiveToast|showTrashToast|showSuccessToast|successToastModel/.test(SRC.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '')), 'старих тостів немає');
  ['success', 'info', 'warning', 'error', 'journal'].forEach(function(k){ assert.match(SRC, new RegExp('\\n  ' + k + ": '<svg class=\"success-toast-icon")); });
  assert.match(SRC, /@media \(prefers-reduced-motion: reduce\)\{ \.success-toast\{ animation:stFade/);
  assert.match(SRC, /if\(successToastActive \|\| !successToastQueue\.length\) return;/);
  const host = SRC.match(/\.success-toast-host\{([^}]*)\}/)[1];
  assert.match(host, /top:calc\(env\(safe-area-inset-top, 0px\) \+ 8px\)/); assert.ok(!/bottom:/.test(host)); assert.match(host, /pointer-events:none/);
  assert.match(SRC, /if\(dy < -30\)\{ close\(\); return; \}/);
  assert.match(SRC, /\.update-banner\{ position:fixed; left:50%; bottom:calc\(env\(safe-area-inset-bottom, 0px\) \+ 104px\)/);
  const body = SRC.slice(SRC.indexOf('function pumpSuccessToast'), SRC.indexOf('function openJournalFromToast'));
  assert.equal((body.match(/innerHTML/g) || []).length, 1); // лише статичний svg із TOAST_ICONS
  assert.match(body, /t\.textContent = o\.title/); assert.match(body, /sb\.textContent = o\.subtitle/);
});
test('охоронні (TO): помилки показуються як alert, статичні іконки не малюються; «Почати запис» у попередженні перепису', function(){
  assert.match(SRC, /kind === 'error' \|\| kind === 'warning' \? 'alert' : 'status'/);
  assert.match(SRC, /\.success-toast-icon\.static circle, \.success-toast-icon\.static path\{[^}]*animation:none/);
  assert.match(SRC, /showToast\(\{ kind: 'warning', title: 'Спершу почніть запис діагностики', actionLabel: 'Почати запис'/);
  assert.ok(!/showTextToast\('Спершу почніть запис діагностики'/.test(SRC));
});
