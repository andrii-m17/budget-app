// Rev 2.32.28 (MB-4) — «Вхідні» Monobank: чисті функції, екранування, source/externalId, ідемпотентність додавання.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildSandbox } = require('./extract');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const j = function(v){ return JSON.parse(JSON.stringify(v)); };
const base = ['MONO_MONTHS_GEN', 'MONO_CARD_TYPES', 'monoAccountLabel', 'monoAccountDetail', 'MONO_SKIP_LABELS', 'skipReasonLabel', 'monoFmtUah', 'monoNewOpsLabel', 'monoOpsAcc', 'groupInboxByDay', 'inboxRowModel', 'addAllCandidates', 'monoAcceptOutcome'];
const c = buildSandbox({}, base);
const T = function(d, h, m){ return new Date(2026, 9, d, h, m).toISOString(); };
const ACC = [{ mono_account_id: 'm1', masked_pan: '537541******1234', account_type: 'black' }];
const R = function(id, extra){ return Object.assign({ id: id, mono_account_id: 'm1', tx_time: T(12, 14, 32), description: 'Кафе', hold: false, amount_uah: 353, status: 'new', skip_reason: null, suggested_category: 'Харчування', suggested_subcategory: null }, extra || {}); };

test('I1: groupInboxByDay — Сьогодні/Вчора/дата, від новіших, рядки всередині від новіших', function(){
  const now = new Date(2026, 9, 12, 18, 0);
  const g = j(c.groupInboxByDay([R('a', { tx_time: T(11, 19, 10) }), R('b', { tx_time: T(12, 8, 0) }), R('c', { tx_time: T(12, 14, 32) }), R('d', { tx_time: T(5, 9, 0) })], now));
  assert.deepEqual(g.map(function(x){ return x.label; }), ['Сьогодні', 'Вчора', '5 жовтня']);
  assert.deepEqual(g[0].rows.map(function(r){ return r.id; }), ['c', 'b']);
});
test('I1: skipReasonLabel — усі причини; причини в моделі рядка пропущених/ігнорованих', function(){
  assert.equal(c.skipReasonLabel('income_or_refund'), 'Поповнення чи повернення');
  assert.equal(c.skipReasonLabel('cash'), 'Готівка');
  assert.equal(c.skipReasonLabel('transfer'), 'Переказ');
  assert.equal(c.skipReasonLabel('too_small'), 'Менше 1 ₴');
  assert.equal(c.skipReasonLabel('zero'), 'Нульова сума');
  assert.equal(c.inboxRowModel(R('x', { status: 'skipped', skip_reason: 'cash' }), ACC).reason, 'Готівка');
  assert.equal(c.inboxRowModel(R('x', { status: 'ignored' }), ACC).reason, 'Ігноровано');
  assert.equal(c.inboxRowModel(R('x'), ACC).reason, '');
});
test('inboxRowModel: мітка категорії/підкатегорії, «Оберіть категорію», в обробці, мета з карткою, сума', function(){
  const m = j(c.inboxRowModel(R('x', { suggested_category: 'Транспорт', suggested_subcategory: 'Таксі', hold: true }), ACC));
  assert.equal(m.chip, 'Транспорт · Таксі'); assert.equal(m.hasCategory, true); assert.equal(m.pending, true);
  assert.match(m.meta, /^\d{2}:\d{2} · •••• 1234$/);
  assert.match(m.amount, /^−353\s₴$/);
  const n = j(c.inboxRowModel(R('y', { suggested_category: null }), ACC));
  assert.equal(n.chip, 'Оберіть категорію'); assert.equal(n.hasCategory, false);
  assert.equal(c.inboxRowModel(R('z', { skip_reason: 'too_small', amount_uah: null, status: 'skipped' }), ACC).amount, 'менше 1 ₴');
});
test('I2: addAllCandidates — лише нові зі suggested_category і без hold', function(){
  const rows = [R('a'), R('b', { hold: true }), R('c', { suggested_category: null }), R('d', { status: 'added' }), R('e', { suggested_category: '' })];
  assert.deepEqual(j(c.addAllCandidates(rows).map(function(r){ return r.id; })), ['a']);
});
test('I2: monoAcceptOutcome — 23505 / 22023 / P0002 / мережа / успіх', function(){
  assert.equal(c.monoAcceptOutcome(null).kind, 'ok');
  const a = j(c.monoAcceptOutcome({ code: '23505' })); assert.equal(a.toast, 'Цю операцію вже розглянуто'); assert.equal(a.refresh, true);
  assert.equal(c.monoAcceptOutcome({ code: '22023' }).openPicker, true);
  assert.equal(c.monoAcceptOutcome({ code: 'P0002' }).kind, 'notfound');
  assert.equal(c.monoAcceptOutcome({ message: 'Failed to fetch' }).toast, 'Немає зв\'язку, спробуйте пізніше');
});
test('I2: monoOpsAcc — «Додати N операцій як витрати?» з правильним відмінком', function(){
  assert.equal(c.monoOpsAcc(1), 'операцію'); assert.equal(c.monoOpsAcc(2), 'операції'); assert.equal(c.monoOpsAcc(5), 'операцій'); assert.equal(c.monoOpsAcc(12), 'операцій'); assert.equal(c.monoOpsAcc(21), 'операцію');
});
test('I3: monoNewOpsLabel — відмінювання', function(){
  assert.equal(c.monoNewOpsLabel(1), '· 1 нова операція');
  assert.equal(c.monoNewOpsLabel(3), '· 3 нові операції');
  assert.equal(c.monoNewOpsLabel(5), '· 5 нових операцій');
  assert.equal(c.monoNewOpsLabel(11), '· 11 нових операцій');
  assert.equal(c.monoNewOpsLabel(21), '· 21 нова операція');
});

// ---------- екранування ----------
test('екранування: опис, коментар і категорія з банку проходять escapeHtml/escapeAttr/safeId (<img onerror> не потрапляє в розмітку)', function(){
  const esc = function(s){ return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); };
  const ctx = buildSandbox({
    escapeHtml: esc, escapeAttr: function(s){ return esc(s).replace(/"/g, '&quot;'); }, safeId: function(x){ return String(x).replace(/[^0-9A-Za-z_-]/g, ''); },
    monoState: { accounts: ACC },
  }, base.concat(['monoInboxRowHtml']));
  const evil = '<img src=x onerror=alert(1)>';
  const html = ctx.monoInboxRowHtml(R('abc', { description: evil, suggested_category: evil, suggested_subcategory: '"><svg onload=1>' }));
  assert.ok(!/<img|<svg/i.test(html), html);
  assert.ok(html.indexOf('&lt;img') !== -1);
  const bad = ctx.monoInboxRowHtml(R('a"onmouseover="x', {}));
  assert.ok(bad.indexOf('data-mono-row="aonmouseoverx"') !== -1);
  // деталі — через textContent
  const det = SRC.slice(SRC.indexOf('function openMonoDetail(id)'), SRC.indexOf('function closeMonoDetail()'));
  assert.ok(!/innerHTML\s*=[^;]*(description|comment)/.test(det));
  assert.match(det, /b\.textContent = value/);
});

// ---------- I4: source/externalId ----------
test('I4: витрата з банку: source/externalId при pull (нова й оновлена) і push; не затираються в null; для звичайних витрат payload без цих колонок', function(){
  const ctx = buildSandbox({}, ['monoSourcePayload']);
  assert.deepEqual(j(ctx.monoSourcePayload({ source: 'mono', externalId: 'tx1' })), { source: 'mono', external_id: 'tx1' });
  assert.deepEqual(j(ctx.monoSourcePayload({ source: 'mono' })), { source: 'mono', external_id: null });
  assert.deepEqual(j(ctx.monoSourcePayload({ name: 'Кава' })), {});
  assert.match(SRC, /select\('id,amount,expense_date,category,subcategory,note,linked_installment_id,deleted_at,created_at,updated_at,created_by,updated_by,source,external_id'\)/);
  assert.match(SRC, /if\(row\.source\)\{ rec\.source = row\.source; rec\.externalId = row\.external_id \|\| null; \}/);
  assert.match(SRC, /if\(row\.source\)\{ local\.source = row\.source; local\.externalId = row\.external_id \|\| null; \}/);
  assert.equal((SRC.match(/\.\.\.monoSourcePayload\(rec\)/g) || []).length, 2); // одиночний і пакетний push
});
test('I4: редагування витрати з банку не обнуляє source/externalId; мітка «з банку» в Журналі', function(){
  const edit = SRC.match(/async function saveRecordEditCore\(id\)\{([\s\S]*?)\n\}/)[1];
  assert.ok(!/\.source\s*=|externalId\s*=/.test(edit));
  assert.match(SRC, /e\.source === 'mono' \? '<span class="exp-source">з банку<\/span>'/);
});

// ---------- I2: ідемпотентність додавання ----------
test('I2: повторне додавання тієї ж операції не створює другу витрату (мок повертає 23505)', async function(){
  const accepted = new Set(); const expensesCreated = [];
  const g = {
    getSupabaseClient: function(){ return { rpc: async function(name, args){
      if(name !== 'mono_accept') return { error: { message: 'unexpected' } };
      if(accepted.has(args.p_inbox_id)) return { error: { code: '23505' } };
      accepted.add(args.p_inbox_id); expensesCreated.push(args.p_inbox_id); return { data: 'exp-id', error: null };
    } }; },
  };
  const ctx = buildSandbox(g, base.concat(['monoAcceptRow']));
  const row = R('inbox-1');
  const first = await ctx.monoAcceptRow(row, 'Харчування', null, 'Кафе');
  const second = await ctx.monoAcceptRow(row, 'Харчування', null, 'Кафе');
  assert.equal(first.kind, 'ok'); assert.equal(second.kind, 'already');
  assert.equal(expensesCreated.length, 1);
});
test('I2: «Додати всі» — діалог, ≤ 3 паралельних, береться addAllCandidates, підсумковий тост «Додано N»', async function(){
  let active = 0, maxActive = 0; const accepted = [];
  const rows = [R('1'), R('2'), R('3'), R('4'), R('5'), R('6', { hold: true }), R('7', { suggested_category: null })];
  const g = {
    monoInbox: { rows: rows, busy: false }, toasts: [],
    showTrashToast: function(t){ g.toasts.push(t); },
    monoAfterChange: async function(){},
    monoAcceptRow: async function(row){ active++; maxActive = Math.max(maxActive, active); await new Promise(function(r){ setTimeout(r, 5); }); active--; accepted.push(row.id); return { kind: 'ok' }; },
  };
  const ctx = buildSandbox(g, base.concat(['runMonoAddAll']));
  await ctx.runMonoAddAll();
  assert.equal(accepted.length, 5);
  assert.ok(maxActive <= 3 && maxActive >= 2, 'паралельність ' + maxActive);
  assert.ok(accepted.indexOf('6') === -1 && accepted.indexOf('7') === -1);
  assert.deepEqual(j(g.toasts), ['Додано 5']);
  assert.match(SRC, /showConfirmModal\('Додати ' \+ n \+ ' ' \+ monoOpsAcc\(n\)/);
});

// ---------- id полів, точки входу ----------
test('id полів «Вхідні» чисті; точки входу: банер лише коли є нові, лічильники, закриття при перемиканні вкладки', function(){
  ['fldmono2', 'fldmono3', 'fldmono4'].forEach(function(id){ assert.ok(!/(name|phone|tel|mail|addr|user|login|first|last|fio|contact)/i.test(id)); assert.ok(SRC.indexOf('id="' + id + '"') !== -1); });
  assert.match(SRC, /banner\.classList\.toggle\('hidden', !n\)/);
  assert.match(SRC, /id="mono-banner" onclick="openMonoInbox\(\)"/);
  assert.match(SRC, /if\(isMonoInboxOpen\) closeMonoInbox\(\);/);
  assert.match(SRC, /'mono-inbox-badge'|id: 'mono-inbox-badge'|badgeId: 'mono-inbox-badge'/);
  const mi = SRC.slice(SRC.indexOf("type: 'mono-inbox'"), SRC.indexOf("type: 'mono-inbox'") + 200);
  assert.ok(!/description|amount/.test(mi));
});
