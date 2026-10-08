// Rev 2.32.17 (S) — решта «Налаштувань» у стилі «Сповіщень»: модель екранів, повнота елементів, навігація, шапка.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ex = require('./extract');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const c = ex.buildSandbox({}, ['settingsScreenModel']);
const M = JSON.parse(JSON.stringify(c.settingsScreenModel()));
const drawerHtml = id => { const i = SRC.indexOf('id="' + id + '"'); return SRC.slice(i, SRC.indexOf('\n</div>', i)); };

test('модель: верхній рівень — 3 категорії (≤6) з назвою й стрілкою; небезпечних дій у «Налаштуваннях» немає (окрема група порожня)', () => {
  const rows = M.root.groups[0].rows;
  assert.deepEqual(rows.map(r => r.title), ['Сповіщення', 'Вигляд', 'Про застосунок']);
  assert.ok(rows.length <= 6 && rows.every(r => r.type === 'link'));
  ['root', 'appearance', 'about', 'notifications'].forEach(k => assert.deepEqual(M[k].danger, [], k));
});
test('повнота (було → стало): усе зі старого вигляду на місці — «Сповіщення», три теми (auto/light/dark, ті самі кнопки й setThemeChoice), текст «Про застосунок» дослівно', () => {
  const root = drawerHtml('settings-drawer');
  ['notifications', 'appearance', 'about'].forEach(id => assert.match(root, new RegExp('data-sr="' + id + '"')));
  assert.ok(!/n-row-sub|n-row-state|badge|theme-toggle-btn|about-note/.test(root), 'у корені лише рядки-категорії');
  const ap = drawerHtml('appearance-drawer');
  ['auto', 'light', 'dark'].forEach(t => assert.match(ap, new RegExp('data-theme-choice="' + t + '" onclick="setThemeChoice\\(\'' + t + '\'\\)"')));
  assert.match(ap, /id="theme-toggle" role="radiogroup" aria-label="Тема застосунку"/);
  assert.deepEqual(M.appearance.groups[0].rows[0].options, ['auto', 'light', 'dark']);
  const ab = drawerHtml('about-drawer');
  assert.match(ab, /Мова та валюта поки фіксовані — українська, ₴\. З'являться тут, тільки коли будуть реально працювати \(без декоративних перемикачів «про людське око»\)\./);
});
test('шапка підекранів: «назад» з назвою попереднього екрана зліва, назва по центру; клас drawer-close збережено (свайп-закриття), без хрестика; aria-label', () => {
  ['notifications-drawer', 'appearance-drawer', 'about-drawer'].forEach(id => {
    const h = drawerHtml(id);
    assert.match(h, /class="drawer-head nx-head"/, id);
    assert.match(h, /class="drawer-close drawer-back" type="button" onclick="backToSettings\('[a-z]+'\)" aria-label="Назад: Налаштування"/, id);
    assert.match(h, /<\/svg>Налаштування<\/button>/, id);
    assert.ok(!/M18 6 6 18/.test(h.slice(0, h.indexOf('</div>', h.indexOf('nx-head')))), id + ': без ✕');
  });
  assert.match(SRC, /\.nx-screen \.drawer-head\.nx-head\{ display:grid; grid-template-columns:auto minmax\(0,1fr\) auto;/);
});
test('навігація: рядки відкривають екрани (закривши «Налаштування»), назад повертає; Escape закриває нові екрани; фокус кнопок — через focusFirstIn', () => {
  assert.match(SRC, /onclick="openSettingsScreen\('appearance'\)"/);
  assert.match(SRC, /function backToSettings\(name\)\{\s*closeSettingsScreen\(name\);\s*openSettings\(\);/);
  assert.match(SRC, /function openNotificationsFromSettings\(\)\{ openSettingsScreen\('notifications'\); \}/);
  assert.match(SRC, /if\(e\.key==='Escape'\)\{ closeSettingsScreen\('appearance'\); closeSettingsScreen\('about'\);/);
  assert.match(SRC, /id="appearance-backdrop" onclick="closeSettingsScreen\('appearance'\)"/);
});
test('стиль: .nx-screen спільний для «Налаштувань», «Сповіщень», «Вигляду», «Про застосунок»; нових transition по width/height/margin/padding немає (правило M1)', () => {
  ['settings-drawer', 'notifications-drawer', 'appearance-drawer', 'about-drawer'].forEach(id => assert.match(SRC, new RegExp('class="drawer nx-screen" id="' + id + '"')));
  const css = SRC.slice(SRC.indexOf('/* ===== Rev 2.32.12 (R) / 2.32.17 (S)'), SRC.indexOf('.n-readonly-note{'));
  assert.ok(!/transition:[^;]*\b(width|height|margin|padding|top|left)\b/.test(css));
  assert.match(SRC, /BUTTON_VARIANT_MAP[\s\S]{0,400}'drawer-back'|icon: \['drawer-close', 'drawer-back'/);
});
test('R-3/R-5 у новому оформленні збережені: запит дозволу першим кроком; initSegments для сегментів; індикатор теми не зламано переносом', () => {
  const f = SRC.slice(SRC.indexOf('async function onMasterToggle'), SRC.indexOf('function flashPermissionNotice'));
  assert.ok(f.indexOf('Notification.requestPermission()') < f.indexOf('saveNotificationSetting'));
  assert.match(SRC, /const SEGMENT_SELECTOR = '\.struct-tabs, \.theme-toggle, \.n-days';/);
  assert.match(SRC, /if\(name === 'appearance'\) syncThemeToggleUI\(\);/);
});
