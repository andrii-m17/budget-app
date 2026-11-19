// Rev 2.32.414 (FIX-1119 п.9): підказка повернення Monobank — компактна позначка в рядку назви, детальний текст за дотиком.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildSandbox } = require('./extract');
const SRC = require('./extract').readIndexWithCss();
const base = ['MONO_MONTHS_GEN', 'MONO_CARD_TYPES', 'monoAccountLabel', 'monoAccountDetail', 'MONO_SKIP_LABELS', 'skipReasonLabel', 'monoFmtUah', 'monoNewOpsLabel', 'monoOpsAcc', 'groupInboxByDay', 'inboxRowModel', 'monoNetUah', 'monoRefundedUah', 'monoShortMonth', 'monoSuggestLabelText', 'monoSuggestOptions', 'monoCatLabel', 'monoAutoGroupModel', 'MONO_AUTO_DAYS', 'addAllCandidates', 'monoAcceptOutcome', 'monoShowsInstRow', 'monoInstById', 'monoEffectiveInstId', 'monoInstLabelModel', 'monoInstToggleNext', 'stripLeadingEmoji'];
const esc = function(s){ return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); };
function ctxWith(open){
  return buildSandbox({ escapeHtml: esc, escapeAttr: function(s){ return esc(s).replace(/"/g, '&quot;'); }, safeId: function(x){ return String(x).replace(/[^0-9A-Za-z_-]/g, ''); },
    monoState: { accounts: [] }, monoInbox: { instPick: {}, suggestRows: { ch1: { id: 'ch1', tx_time: '2026-11-12T10:00:00Z', amount_uah: -1200 } }, refundOpen: open || {} }, installmentAccounts: [], monoBadgeHtml: function(){ return ''; } }, base.concat(['monoInboxRowHtml']));
}
const ROW = { id: 'r1', status: 'skipped', skip_reason: 'income_or_refund', refund_suggest: 'ch1', amount_uah: 1200, description: 'Кава', tx_time: '2026-11-19T10:00:00Z', mono_account_id: 'a' };
test('підказка повернення: у рядку назви компактна позначка, повної мітки під рядком за замовчуванням немає', function(){
  const h = ctxWith().monoInboxRowHtml(ROW);
  assert.match(h, /<div class="exp-name mono-name-row"><span class="mono-name-txt">Кава<\/span><button type="button" class="mono-chip-refund" data-mono-refund-toggle="1" aria-expanded="false"/);
  assert.ok(!/class="mono-refund-label"/.test(h), 'велика мітка прихована');
  assert.ok(!/Повернення до витрати/.test(h), 'детальний текст прихований');
});
test('за дотиком (refundOpen) показується детальний текст як кнопка вибору; позначка aria-expanded=true', function(){
  const h = ctxWith({ r1: true }).monoInboxRowHtml(ROW);
  assert.match(h, /aria-expanded="true"/);
  assert.match(h, /<button type="button" class="mono-refund-label" data-mono-refund-pick="1"><span>↩ Повернення до витрати 12 лис, 1\s200\s₴/);
});
test('рядок без підказки: назва як було, позначки немає', function(){
  const h = ctxWith().monoInboxRowHtml(Object.assign({}, ROW, { status: 'new', skip_reason: null, refund_suggest: null, amount_uah: -50 }));
  assert.ok(!/mono-chip-refund/.test(h)); assert.match(h, /<div class="exp-name">Кава<\/div>/);
});
test('обробник: дотик по позначці перемикає monoInbox.refundOpen за safeId і перемальовує; стилі: ціль ≥ 44 pt, клас у реєстрі кнопок', function(){
  assert.match(SRC, /data-mono-refund-toggle\]'\)\)\{ e\.stopPropagation\(\); monoInbox\.refundOpen = monoInbox\.refundOpen \|\| \{\}; if\(monoInbox\.refundOpen\[id\]\) delete monoInbox\.refundOpen\[id\]; else monoInbox\.refundOpen\[id\] = true; renderMonoInbox\(\); return; \}/);
  assert.match(SRC, /\.mono-chip-refund::before\{ content:''; position:absolute; inset:-14px -6px; \}/);
  assert.match(SRC, /chip: \['trash-chip', 'mono-inst-label', 'mono-refund-label', 'mono-chip-refund'/);
});
