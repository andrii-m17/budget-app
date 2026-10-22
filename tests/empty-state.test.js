// Rev 2.32.139 (EMPTY-1): порожній стан «Облік» → «Борги» / «ОЧ» за затвердженим макетом.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildSandbox } = require('./extract');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const c = buildSandbox({}, ['EMPTY_STATE_ICONS', 'emptyStateHtml']);

test('картки: іконка картки, заголовок, пояснення й кнопка «+ Додати картку» (openAddBankModal)', function(){
  const h = c.emptyStateHtml('card');
  assert.match(h, /empty-state-title">Ще немає карток</);
  assert.match(h, /empty-state-text">Додайте першу картку, щоб вести борг по місяцях\.</);
  assert.match(h, /class="add-trigger-btn" onclick="openAddBankModal\(\)">\+ Додати картку</);
  assert.ok(h.includes('<rect x="2.5" y="5" width="19" height="14" rx="2.5"/>'), 'іконка кредитної картки');
});
test('ОЧ: іконка календаря з гривнею, заголовок, пояснення й кнопка «+ Додати ОЧ» (openAddInstallmentModal)', function(){
  const h = c.emptyStateHtml('installment');
  assert.match(h, /empty-state-title">Ще немає ОЧ</);
  assert.match(h, /empty-state-text">Додайте першу ОЧ, щоб бачити платежі й залишок\.</);
  assert.match(h, /onclick="openAddInstallmentModal\(\)">\+ Додати ОЧ</);
  assert.ok(h.includes('₴'), 'гривня в календарі');
});
test('порожній стан замінює старі тексти; панелі перемикаються класом .is-empty; підсумкова картка, підпис і нижня кнопка у порожньому стані сховані', function(){
  assert.ok(!/innerHTML = `<div class="empty-hint">(Немає активних карток|Ще немає жодної ОЧ)/.test(SRC), 'старі тексти в розмітці прибрано');
  assert.match(SRC, /setAcctPanelEmpty\('acct-tab-panel-debts', visible\.length===0\);/);
  assert.match(SRC, /setAcctPanelEmpty\('acct-tab-panel-installments', visible\.length===0\);/);
  assert.match(SRC, /\.acct-panel\.is-empty > \.card-summary, \.acct-panel\.is-empty > \.section-label, \.acct-panel\.is-empty > \.add-trigger-btn\{ display:none; \}/);
  assert.match(SRC, /<div class="struct-tab-panel acct-panel hidden" id="acct-tab-panel-debts">/);
  assert.match(SRC, /<div class="struct-tab-panel acct-panel hidden" id="acct-tab-panel-installments">/);
  assert.match(SRC, /\.empty-state-title\{ font-size:16px; font-weight:700;/);
  assert.match(SRC, /\.empty-state-text\{ max-width:230px;[^}]*font-size:13px;/);
});
test('є картки/ОЧ — списки без змін (порожній стан лише при visible.length===0); тексти без даних користувача', function(){
  assert.match(SRC, /setAcctPanelEmpty\('acct-tab-panel-debts', visible\.length===0\);[^\n]*\n  if\(visible\.length===0\)\{\n    el\.innerHTML = emptyStateHtml\('card'\);/);
  assert.ok(!/\$\{|escapeHtml/.test(c.emptyStateHtml('card')), 'константи, без підстановок');
});
