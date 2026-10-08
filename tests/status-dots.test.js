// Rev 2.31.5 (B2-lite) — крапка-статус на картці «Борги по картках» (та сама, що біля KPI «Борг» і кільця).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const POP = id => { const a = SRC.indexOf('id="' + id + '"'); return SRC.slice(a, SRC.indexOf('</div>\n          </div>', a)); };

test('картка «Борги по картках» має ту саму розмітку крапки й попапа, що KPI «Борг» і кільце (data-status + dot + popover + title/text/hint/action)', () => {
  const norm = h => h.replace(/id="[^"]+"/, '').replace(/<!--[\s\S]*?-->/g, '').replace(/\s+/g, ' ');
  const kpi = norm(POP('kpi-debt-asof')), card = norm(POP('debts-card-asof'));
  assert.equal(card, kpi, 'розмітка ідентична (різниться лише id)');
  assert.match(SRC, /<div class="card table-card has-data-status">/);
  assert.match(SRC, /\.table-card\.has-data-status\{ position:relative; \}/);
});

test('статус — спільний: debtUiStatusNow рендериться в три крапки тим самим renderDataStatusDot; наявні виклики KPI й кільця не змінились', () => {
  assert.match(SRC, /renderDataStatusDot\('kpi-debt-asof', debtUiStatusNow, month\);/);
  assert.match(SRC, /renderDataStatusDot\('debts-card-asof', debtUiStatusNow, month\);/);
  assert.match(SRC, /renderDataStatusDot\('debt-donut-asof', debtUiStatusNow, month\);|renderDataStatusDot\('debt-donut-asof', debtStatus, month\);/);
  assert.equal((SRC.match(/const debtUiStatusNow = debtUiStatus\(cardAsOf, month, 'card'\);/g) || []).length, 1, 'один розрахунок статусу на всі крапки');
});

test('логіка статусу не змінювалась: debtUiStatus/missingCardDebtsForMonth/renderDataStatusDot — ті самі правила (none/actual → без крапки; прихована картка не рахується)', () => {
  const st = SRC.slice(SRC.indexOf('function debtUiStatus('), SRC.indexOf('function missingCardDebtsForMonth'));
  assert.match(st, /if\(!asOfInfo\.hasData\) return \{ status:'none' \};/);
  assert.match(st, /if\(asOfInfo\.isCurrent\) return \{ status:'actual' \};/);
  assert.match(st, /if\(kindHasActualForMonth\(kind, month\)\) return \{ status:'incomplete', asOfMonth: asOfInfo\.asOfMonth \};/);
  assert.match(SRC, /\.filter\(function\(x\)\{ return !isHiddenForMonth\(x\.name, 'card', month\); \}\)/);
  const r = SRC.slice(SRC.indexOf('function renderDataStatusDot'), SRC.indexOf('function renderDataStatusDot') + 400);
  assert.match(r, /if\(!uiStatus \|\| uiStatus\.status==='actual' \|\| uiStatus\.status==='none'\)\{\s*wrap\.classList\.add\('hidden'\);/, 'повні дані → крапка прихована');
});

test('числа й підписи картки «Борги по картках» не змінились (заголовок, шапка таблиці, тіло, футер)', () => {
  assert.match(SRC, /<div class="table-card-title">Борги по картках<\/div>\s*<div class="table-header t-row-2col" id="debts-header"><span class="t-name">Картка<\/span><span class="t-amt">Сума<\/span><\/div>\s*<div id="debts-body"><\/div>/);
  assert.ok(!/debts-body[^\n]*data-status/.test(SRC));
});

test('рекордер: status-dots (tab, dots, reasons) при відкритті «Аналітики», лише кількості/статус', () => {
  assert.match(SRC, /function onDashboardVisit\(\)\{\s*dashRun\('visit', selectedMonth, dashIsActive\(\)\);\s*recordStatusDots\(\);\s*\}/);
  const a = SRC.indexOf('function recordStatusDots');
  const f = SRC.slice(a, SRC.indexOf('\nfunction ', a + 10));
  assert.match(f, /type: 'status-dots', tab: 'analytics', dots: dots, reasons: \{ status: st\.status, missingCards: missingCardDebtsForMonth\(selectedMonth\)\.length \}/);
  assert.ok(!/\.name|\.balance/.test(f.slice(f.indexOf('pushDebugEvent'), f.indexOf('pushDebugEvent') + 300)), 'без назв і сум');
  ['tab', 'dots', 'reasons'].forEach(k => assert.match(SRC, new RegExp("DEBUG_EVENT_ALLOWLIST = \\[[\\s\\S]*'" + k + "'")));
});
