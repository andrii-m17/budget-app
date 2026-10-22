// Rev 2.32.128 (MONO-INST): прив'язка платежу Mono до ОЧ — пропозиція сервера, мітка в «Нових», перемикання «Без ОЧ», рядок «ОЧ» у шторці, p_installment_id у mono_accept. Дані синтетичні.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildSandbox } = require('./extract');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const j = function(v){ return JSON.parse(JSON.stringify(v)); };
const NAMES = ['MONO_SKIP_LABELS', 'skipReasonLabel', 'monoAcceptOutcome', 'monoShowsInstRow', 'monoInstById', 'monoEffectiveInstId', 'monoInstLabelModel', 'monoInstToggleNext', 'stripLeadingEmoji', 'monoAcceptRow'];
const INST = [{ name: 'ОЧ Альфа', cloudId: 'i1' }, { name: 'ОЧ Бета', cloudId: 'i2' }, { name: 'Без хмари' }];
const R = function(extra){ return Object.assign({ id: 'r1', status: 'new', description: 'Кафе', skip_reason: null, suggested_installment_id: null }, extra || {}); };
function mk(globals){ return buildSandbox(Object.assign({ installmentAccounts: INST }, globals || {}), NAMES); }

test('рядок «ОЧ» у шторці: лише «Щомісячний платіж …» (без урахування регістру, з початку), переказ або є пропозиція; решта — ні', function(){
  const c = mk();
  assert.equal(c.monoShowsInstRow(R({ description: 'Щомісячний платіж за розстрочку' })), true);
  assert.equal(c.monoShowsInstRow(R({ description: '  ЩОМІСЯЧНИЙ ПЛАТІЖ Альфа ' })), true);
  assert.equal(c.monoShowsInstRow(R({ description: 'Оплата: щомісячний платіж' })), false); // не з початку
  assert.equal(c.monoShowsInstRow(R({ description: 'Кафе' })), false);
  assert.equal(c.monoShowsInstRow(R({ description: 'Кафе', suggested_installment_id: 'i1' })), true);
  assert.equal(c.monoShowsInstRow(R({ status: 'skipped', skip_reason: 'transfer', description: 'Переказ' })), true); // «Пропущені» з переказом
  assert.equal(c.monoShowsInstRow(R({ status: 'skipped', skip_reason: 'cash' })), false);
  assert.equal(c.monoShowsInstRow(null), false); assert.equal(c.monoShowsInstRow(R({ description: null })), false);
});
test('мітка: є пропозиція — «🔗 Платіж за ОЧ «назва»»; немає пропозиції — мітки нема; невідома локально ОЧ — мітки нема; не «Нові» — мітки нема', function(){
  const c = mk();
  assert.deepEqual(j(c.monoInstLabelModel(R({ suggested_installment_id: 'i1' }), {}, INST)), { on: true, name: 'ОЧ Альфа' });
  assert.equal(c.monoInstLabelModel(R(), {}, INST), null);
  assert.equal(c.monoInstLabelModel(R({ suggested_installment_id: 'x9' }), {}, INST), null);
  assert.equal(c.monoInstLabelModel(R({ status: 'added', suggested_installment_id: 'i1' }), {}, INST), null);
  assert.equal(c.monoInstLabelModel(R({ suggested_installment_id: 'i1' }), {}, []), null);
});
test('перемикання мітки: пропозиція → «Без ОЧ» → назад; без пропозиції нічого не повертається', function(){
  const c = mk();
  const row = R({ suggested_installment_id: 'i1' });
  const picks = {};
  assert.equal(c.monoEffectiveInstId(row, picks, INST), 'i1');
  picks[row.id] = c.monoInstToggleNext(row, picks, INST);
  assert.equal(picks[row.id], '');
  assert.equal(c.monoEffectiveInstId(row, picks, INST), null);
  assert.deepEqual(j(c.monoInstLabelModel(row, picks, INST)), { on: false, name: '' }); // мітка «Без ОЧ»
  picks[row.id] = c.monoInstToggleNext(row, picks, INST);
  assert.equal(picks[row.id], 'i1');
  assert.equal(c.monoInstToggleNext(R(), {}, INST), null);
});
test('зміна ОЧ у деталях і «Без ОЧ»: вибір користувача переважає пропозицію, його видно в мітці', function(){
  const c = mk();
  const row = R({ description: 'Щомісячний платіж', suggested_installment_id: 'i1' });
  assert.equal(c.monoEffectiveInstId(row, { r1: 'i2' }, INST), 'i2');
  assert.equal(c.monoInstLabelModel(row, { r1: 'i2' }, INST).name, 'ОЧ Бета');
  assert.equal(c.monoEffectiveInstId(row, { r1: '' }, INST), null);
  const noSug = R({ description: 'Щомісячний платіж' });
  assert.equal(c.monoEffectiveInstId(noSug, {}, INST), null); // нічого не додається автоматично
  assert.equal(c.monoEffectiveInstId(noSug, { r1: 'i2' }, INST), 'i2');
  assert.equal(c.monoEffectiveInstId(noSug, { r1: 'x9' }, INST), null); // невідомий id не передається
});
test('mono_accept: p_installment_id передається лише коли показано прив\'язку; без неї параметра нема', async function(){
  const calls = [];
  const c = mk({ isWriteBlocked: () => false, getSupabaseClient: () => ({ rpc: async (name, args) => { calls.push({ name, args }); return { error: null }; } }) });
  await c.monoAcceptRow(R(), 'Кат', null, 'нотатка', 'i1');
  await c.monoAcceptRow(R(), 'Кат', null, 'нотатка');
  await c.monoAcceptRow(R(), 'Кат', null, 'нотатка', null);
  assert.equal(calls[0].name, 'mono_accept');
  assert.equal(calls[0].args.p_installment_id, 'i1');
  assert.ok(!('p_installment_id' in calls[1].args) && !('p_installment_id' in calls[2].args));
});
test('охоронні: запит «Вхідних» читає suggested_installment_id; свайп, «Додати всі» і шторка передають ефективний id; мітка екранована; рядок ОЧ — select без нових текстових полів', function(){
  assert.match(SRC, /suggested_subcategory,suggested_installment_id,expense_id,notified_at'\)/);
  assert.equal((SRC.match(/monoEffectiveInstId\(row, monoInbox\.instPick, installmentAccounts\)\)/g) || []).length >= 3, true);
  assert.match(SRC, /'🔗 Платіж за ОЧ «' \+ escapeHtml\(lm\.name\) \+ '»'/);
  assert.match(SRC, /<select id="fldmono5" class="sf-select" aria-label="ОЧ"/);
  assert.ok(!/<input[^>]*fldmono5/.test(SRC));
});
test('мітка в рядку «Нових»: рендер через monoInboxRowHtml; ОЧ з HTML у назві екранується', function(){
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const ctx = buildSandbox({ escapeHtml: esc, escapeAttr: s => esc(s).replace(/"/g, '&quot;'), safeId: x => String(x).replace(/[^0-9A-Za-z_-]/g, ''), monoState: { accounts: [] }, monoBadgeHtml: () => '',
    monoInbox: { instPick: {} }, installmentAccounts: [{ name: '<b>ОЧ</b>', cloudId: 'i1' }] },
    ['MONO_MONTHS_GEN', 'MONO_CARD_TYPES', 'monoAccountLabel', 'monoAccountDetail', 'MONO_SKIP_LABELS', 'skipReasonLabel', 'monoFmtUah', 'groupInboxByDay', 'inboxRowModel', 'monoInstById', 'monoEffectiveInstId', 'monoInstLabelModel', 'stripLeadingEmoji', 'monoInboxRowHtml']);
  const html = ctx.monoInboxRowHtml(Object.assign(R({ suggested_installment_id: 'i1' }), { tx_time: '2026-10-12T10:00:00Z', amount_uah: 100, mono_account_id: 'm' }));
  assert.match(html, /data-mono-inst-toggle="1"/);
  assert.ok(html.indexOf('&lt;b&gt;ОЧ&lt;/b&gt;') !== -1 && !/<b>/.test(html));
  assert.ok(!/data-mono-inst-toggle/.test(ctx.monoInboxRowHtml(Object.assign(R(), { tx_time: '2026-10-12T10:00:00Z', amount_uah: 100, mono_account_id: 'm' }))));
});
