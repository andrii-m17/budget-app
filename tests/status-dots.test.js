// Rev 2.31.5 (B2-lite) — крапка-статус на картці «Борги по картках» (та сама, що біля KPI «Борг» і кільця).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SRC = require('./extract').readIndexWithCss();
const POP = id => { const a = SRC.indexOf('id="' + id + '"'); return SRC.slice(a, SRC.indexOf('</div>\n          </div>', a)); };

test('плитки «Борг» і «ОЧ» мають ту саму розмітку крапки й попапа (data-status + dot + popover + title/text/hint/action), що колись KPI «Борг»', () => {
  const norm = h => h.replace(/id="[^"]+"/, '').replace(/<!--[\s\S]*?-->/g, '').replace(/\s+/g, ' ');
  const a = norm(POP('bal-debt-asof')), b = norm(POP('bal-inst-asof'));
  assert.equal(a, b, 'розмітка ідентична (різниться лише id)');
  assert.match(a, /data-status-dot[\s\S]*data-status-popover[\s\S]*dsp-title[\s\S]*dsp-text[\s\S]*dsp-hint[\s\S]*dsp-action/);
  ['kpi-debt-asof', 'debts-card-asof', 'debt-donut-asof'].forEach(id => assert.ok(!SRC.includes('id="' + id + '"'), id + ' прибрано разом зі старими картками'));
});

test('статус боргу — той самий renderDataStatusDot із єдиним debtUiStatusNow (Rev 2.32.386, DS-5b: одна крапка на плитці «Борг»); крапка «ОЧ» — renderInstDot', () => {
  assert.match(SRC, /renderDataStatusDot\('bal-debt-asof', c\.status, c\.month\);/);
  assert.match(SRC, /status: debtUiStatusNow \}\);/);
  assert.equal((SRC.match(/const debtUiStatusNow = debtUiStatus\(cardAsOf, month, 'card'\);/g) || []).length, 1, 'один розрахунок статусу');
  assert.match(SRC, /function renderInstDot\(\)\{[\s\S]*incompleteInstalmentsNow\(\)[\s\S]*goToInstallmentsTab/);
});

test('логіка статусу не змінювалась: debtUiStatus/missingCardDebtsForMonth/renderDataStatusDot — ті самі правила (none/actual → без крапки; прихована картка не рахується)', () => {
  const st = SRC.slice(SRC.indexOf('function debtUiStatus('), SRC.indexOf('function missingCardDebtsForMonth'));
  assert.match(st, /if\(!asOfInfo\.hasData\) return \{ status:'none' \};/);
  assert.match(st, /if\(asOfInfo\.isCurrent\) return \{ status:'actual' \};/);
  assert.match(st, /if\(kindHasActualForMonth\(kind, month\)\) return \{ status:'incomplete', asOfMonth: asOfInfo\.asOfMonth \};/);
  assert.match(SRC, /\.filter\(function\(x\)\{ return !isAccountHiddenForMonth\(x\.name, 'card', month\); \}\)/);
  const r = SRC.slice(SRC.indexOf('function renderDataStatusDot'), SRC.indexOf('function renderDataStatusDot') + 400);
  assert.match(r, /if\(!uiStatus \|\| uiStatus\.status==='actual' \|\| uiStatus\.status==='none'\)\{\s*wrap\.classList\.add\('hidden'\);/, 'повні дані → крапка прихована');
});

test('рекордер: status-dots (tab, dots, reasons) при відкритті «Аналітики», лише кількості/статус; крапки — bal-debt-asof, bal-inst-asof (DS-5b)', () => {
  assert.match(SRC, /function onDashboardVisit\(\)\{\s*dashRun\('visit', selectedMonth, dashIsActive\(\)\);\s*recordStatusDots\(\);\s*\}/);
  const a = SRC.indexOf('function recordStatusDots');
  const f = SRC.slice(a, SRC.indexOf('\nfunction ', a + 10));
  assert.match(f, /type: 'status-dots', tab: 'analytics', dots: dots, reasons: \{ status: st\.status, missingCards: missingCardDebtsForMonth\(selectedMonth\)\.length \}/);
  assert.ok(!/\.name|\.balance/.test(f.slice(f.indexOf('pushDebugEvent'), f.indexOf('pushDebugEvent') + 300)), 'без назв і сум');
  ['tab', 'dots', 'reasons'].forEach(k => assert.match(SRC, new RegExp("DEBUG_EVENT_ALLOWLIST = \\[[\\s\\S]*'" + k + "'")));
});
