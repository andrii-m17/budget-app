// Rev 2.23.29 (6D.198) — маршрутизація сповіщень, екран "Сповіщення" (чисті функції), фокус/hover-аудит.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildSandbox } = require('./extract');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const j = function(v){ return JSON.parse(JSON.stringify(v)); };
const pure = buildSandbox({ pluralUa: undefined }, ['routeForPushType', 'notificationSettingsDefaults', 'validateQuietHours', 'permissionNotice', 'toggleOutcome', 'shouldRecordBackupDate', 'dimmedState', 'notificationRows', 'describeDeliveryRow', 'shouldReleaseKbOpen', 'pushTypeLabel', 'PUSH_TYPE_LABELS']);

test('routeForPushType: усі типи контракту й невідомий', () => {
  assert.deepEqual(j(pure.routeForPushType('other-actor-summary')), { screen: 'journal' });
  assert.deepEqual(j(pure.routeForPushType('other-actor-added')), { screen: 'journal' });
  assert.deepEqual(j(pure.routeForPushType('other-actor-deleted')), { screen: 'trash' });
  assert.deepEqual(j(pure.routeForPushType('daily-expense-reminder')), { screen: 'vytraty', noFocus: true });
  assert.deepEqual(j(pure.routeForPushType('monthly-debt-reminder')), { screen: 'debts' });
  assert.deepEqual(j(pure.routeForPushType('installment-deadline', { installmentId: 'x' })), { screen: 'installments', installmentId: 'x' });
  assert.deepEqual(j(pure.routeForPushType('installment-deadline', {})), { screen: 'installments', installmentId: null });
  assert.deepEqual(j(pure.routeForPushType('weekly-summary')), { screen: 'analytics' });
  assert.deepEqual(j(pure.routeForPushType('month-end')), { screen: 'analytics' });
  ['test', 'something-new', '', undefined, null].forEach(function(t){ assert.deepEqual(j(pure.routeForPushType(t)), { screen: null }, String(t)); });
});

test('notificationSettingsDefaults збігаються з типовими значеннями таблиці', () => {
  assert.deepEqual(j(pure.notificationSettingsDefaults()), { notifications_enabled: true, other_actor_changes: true, other_actor_deletions: true, daily_reminder: true, installment_deadline: true, installment_days: 2, month_start: true, weekly_summary: false, month_end: false, quiet_enabled: false, quiet_start: '22:00', quiet_end: '07:00', backup_reminder: true });
});

test('validateQuietHours: формат, початок≠кінець, через північ дозволено', () => {
  assert.equal(pure.validateQuietHours('22:00', '07:00').ok, true);
  assert.equal(pure.validateQuietHours('08:00', '09:30').ok, true);
  assert.equal(pure.validateQuietHours('22:00', '22:00').ok, false);
  ['', '7:00', '24:00', '12:60', 'ab:cd', null, undefined].forEach(function(bad){ assert.equal(pure.validateQuietHours(bad, '07:00').ok, false, String(bad)); assert.equal(pure.validateQuietHours('22:00', bad).ok, false, String(bad)); });
  assert.ok(pure.validateQuietHours('22:00', '22:00').error);
});

test('permissionNotice (R): виняток лише коли немає дозволу iOS чи застосунок не на головному екрані; решта — null', () => {
  assert.equal(pure.permissionNotice({ supported: false }).key, 'not-pwa');
  assert.equal(pure.permissionNotice({ supported: false }).text, 'Додайте застосунок на головний екран, щоб отримувати сповіщення.');
  assert.equal(pure.permissionNotice({ supported: true, permission: 'denied' }).key, 'denied');
  assert.equal(pure.permissionNotice({ supported: true, permission: 'denied' }).text, 'Сповіщення вимкнені на iPhone. Щоб увімкнути: Параметри → Money Tree → Сповіщення.');
  assert.equal(pure.permissionNotice({ supported: true, permission: 'granted' }), null, 'усе гаразд — жодного повідомлення');
  assert.equal(pure.permissionNotice({ supported: true, permission: 'default' }), null, 'ще не запитувався — не показуємо');
  assert.equal(pure.permissionNotice().key, 'not-pwa');
});

function runHandle(action){
  const calls = [];
  const rec = function(name){ return function(){ calls.push([name].concat(Array.prototype.slice.call(arguments))); }; };
  const doc = { activeElement: { blur: rec('blur') }, body: { classList: { remove: rec('kb-remove') } }, getElementById: function(){ return null; } };
  const ctx = buildSandbox({
    document: doc, setTimeout: function(){}, cloudAuthInitInFlight: null, installmentAccounts: [{ cloudId: 'inst-1' }],
    performSwitchTab: rec('performSwitchTab'), switchAccountingTab: rec('switchAccountingTab'), openJournal: rec('openJournal'), latestTouchedRecordMonth: function(){ return '2026-10'; },
    openTrashScreen: rec('openTrashScreen'), goToCardDebtsTab: rec('goToCardDebtsTab'), captureDebugGeometry: rec('capture'),
    captureFocusAudit: function(){}, highlightInstallmentRow: rec('highlight'),
    allMonths: function(){ return ['2026-09', '2026-10']; }, selectedMonth: '2026-09', performMonthChange: rec('performMonthChange'),
  }, ['routeForPushType', 'handlePushAction']);
  return ctx.handlePushAction(action).then(function(){ return calls; });
}
test('handlePushAction: daily-expense-reminder → вкладка без фокусу, blur, kb-open знято, жодного focus()', async () => {
  const calls = await runHandle({ type: 'daily-expense-reminder' });
  const names = calls.map(function(c){ return c[0]; });
  assert.ok(names.includes('blur') && names.includes('kb-remove'));
  const sw = calls.find(function(c){ return c[0] === 'performSwitchTab'; });
  assert.equal(sw[1], 'vytraty'); assert.equal(sw[2].noFocus, true);
  assert.ok(!names.includes('focus'));
});
test('handlePushAction: інші типи ведуть куди слід', async () => {
  let c = await runHandle({ type: 'other-actor-deleted' });
  assert.ok(c.some(function(x){ return x[0] === 'openTrashScreen'; }));
  c = await runHandle({ type: 'monthly-debt-reminder' });
  assert.ok(c.some(function(x){ return x[0] === 'goToCardDebtsTab'; }));
  c = await runHandle({ type: 'installment-deadline', installmentId: 'inst-1' });
  assert.ok(c.some(function(x){ return x[0] === 'switchAccountingTab' && x[1] === 'installments'; }));
  assert.ok(c.some(function(x){ return x[0] === 'highlight' && x[1] === 0; }));
  assert.ok(!c.some(function(x){ return x[0] === 'openJournal'; }), 'боргові типи не відкривають Журнал');
  c = await runHandle({ type: 'other-actor-summary' });
  assert.ok(c.some(function(x){ return x[0] === 'openJournal' && x[1] === '2026-10'; }));
  c = await runHandle({ type: 'test' });
  assert.deepEqual(c, [], 'тип test/невідомий — лише відкрити застосунок');
  c = await runHandle({ type: 'невідомий' });
  assert.deepEqual(c, []);
});

test('focusFirstIn: кнопка → фокус на контейнері; поле вводу → як раніше', () => {
  const mk = function(tag, visible){ const e = { tagName: tag, offsetParent: visible === false ? null : {}, disabled: false, focused: 0, focus: function(){ e.focused++; } }; return e; };
  const run = function(candidates){
    const container = { attrs: {}, focused: 0, querySelectorAll: function(){ return candidates; }, hasAttribute: function(a){ return a in container.attrs; }, setAttribute: function(a, v){ container.attrs[a] = v; }, focus: function(){ container.focused++; } };
    buildSandbox({}, ['focusFirstIn']).focusFirstIn(container);
    return container;
  };
  const btn = mk('BUTTON'), input = mk('INPUT');
  let c = run([mk('BUTTON', false), btn, input]);
  assert.equal(btn.focused, 0); assert.equal(c.focused, 1); assert.equal(c.attrs.tabindex, '-1');
  const inp2 = mk('INPUT');
  c = run([inp2, btn]);
  assert.equal(inp2.focused, 1); assert.equal(c.focused, 0);
});

test('restoreFocus не фокусує кнопки', () => {
  const src = SRC.slice(SRC.indexOf('function restoreFocus()'), SRC.indexOf('function restoreFocus()') + 700);
  assert.ok(/el\.tagName === 'BUTTON'/.test(src));
});

test('CSS-аудит: жодного :hover поза @media (hover:hover) and (pointer:fine); performSwitchTab має noFocus', () => {
  const a = SRC.indexOf('<style'), b = SRC.indexOf('</style>', a);
  const css = SRC.slice(a, b).replace(/\/\*[\s\S]*?\*\//g, function(m){ return m.replace(/[^\n]/g, ' '); });
  const stack = []; let buf = ''; const bad = [];
  for(const ch of css){
    if(ch === '{'){ const head = buf.trim(); buf = ''; stack.push(head);
      if(!head.startsWith('@') && head.includes(':hover') && !stack.slice(0, -1).some(function(h){ return /hover:hover\)\s*and\s*\(pointer:fine\)/.test(h.replace(/\s+/g, ' ').replace(/\( /g, '(')); })) bad.push(head.slice(0, 80));
    }else if(ch === '}'){ stack.pop(); buf = ''; }
    else if(ch === ';' && !stack.length){ buf = ''; }
    else buf += ch;
  }
  assert.deepEqual(bad, []);
  assert.ok(SRC.indexOf("if(tab === 'vytraty' && !(opts && opts.noFocus))") !== -1);
});

test('джерело: клієнт не викликає send-push-notification; тестове — лише send-test-push; weekly/month_end сховано', () => {
  assert.equal(/functions\.invoke\(['"]send-push-notification/.test(SRC), false);
  assert.ok(/functions\.invoke\('send-test-push'\)/.test(SRC));
  assert.ok(/const NOTIFICATIONS_STAGE2_ENABLED = false;/.test(SRC));
});

// ===== Rev 2.23.30 (6D.199) =====
test('dimmedState (R): вимкнений головний тумблер — ~38 % і недоступно; решта (і невідоме) — як є', () => {
  assert.deepEqual(j(pure.dimmedState(false)), { dimmed: true, interactive: false, opacity: 0.38 });
  assert.deepEqual(j(pure.dimmedState(true)), { dimmed: false, interactive: true, opacity: 1 });
  assert.equal(pure.dimmedState(undefined).dimmed, false);
});
const ENV_OK = { supported: true, permission: 'granted' };
const rowsOf = (settings, env) => j(pure.notificationRows(settings, env || ENV_OK));
const idsVisible = rows => rows.filter(r => r.visible).map(r => r.id);
test('notificationRows (R): порядок, групи й ключі даних за макетом', () => {
  const rows = rowsOf(pure.notificationSettingsDefaults());
  assert.deepEqual(rows.map(r => r.id), ['master', 'changes', 'deletions', 'daily', 'installments', 'days', 'month-start', 'backup', 'quiet', 'quiet-start', 'quiet-end', 'test']);
  assert.deepEqual(rows.map(r => r.field), ['notifications_enabled', 'other_actor_changes', 'other_actor_deletions', 'daily_reminder', 'installment_deadline', 'installment_days', 'month_start', 'backup_reminder', 'quiet_enabled', 'quiet_start', 'quiet_end', null]);
  assert.deepEqual(rows.map(r => r.group), [null, 'family', 'family', 'reminders', 'reminders', 'reminders', 'reminders', 'reminders', 'quiet', 'quiet', 'quiet', null]);
  assert.equal(rows.find(r => r.id === 'daily').valueText, '20:00');
  assert.equal(rows.find(r => r.id === 'backup').valueText, 'кінець місяця');
  assert.equal(rows.find(r => r.id === 'deletions').title, 'Видалені записи');
});
test('notificationRows (R): «Нагадувати за» лише при «Платежі за ОЧ»; «З/До» лише при ввімкнених тихих годинах', () => {
  const d = pure.notificationSettingsDefaults();
  assert.ok(idsVisible(rowsOf(d)).includes('days'));
  assert.ok(!idsVisible(rowsOf(Object.assign({}, d, { installment_deadline: false }))).includes('days'));
  assert.ok(!idsVisible(rowsOf(d)).includes('quiet-start') && !idsVisible(rowsOf(d)).includes('quiet-end'));
  const q = idsVisible(rowsOf(Object.assign({}, d, { quiet_enabled: true })));
  assert.ok(q.includes('quiet-start') && q.includes('quiet-end'));
  // значення зберігаються, коли рядок прихований
  assert.equal(rowsOf(Object.assign({}, d, { installment_deadline: false, installment_days: 3 })).find(r => r.id === 'days').value, 3);
});
test('notificationRows (R): головний тумблер показує «вимкнено», коли iOS заборонив; значення груп не змінюються при вимкненому тумблері', () => {
  const d = pure.notificationSettingsDefaults();
  assert.equal(rowsOf(d, { supported: true, permission: 'denied' })[0].value, false);
  assert.equal(rowsOf(d, ENV_OK)[0].value, true);
  assert.equal(rowsOf(d, { supported: false })[0].value, true, 'не PWA: показуємо збережене значення, виняток окремо');
  const off = rowsOf(Object.assign({}, d, { notifications_enabled: false, daily_reminder: true, installment_days: 3 }));
  assert.equal(off[0].value, false);
  assert.equal(off.find(r => r.id === 'daily').value, true);
  assert.equal(off.find(r => r.id === 'days').value, 3);
});
test('describeDeliveryRow: Прийнято Apple / Помилка код / без підписок', () => {
  assert.deepEqual(j(pure.describeDeliveryRow({ statuses: [{ ok: true, status: 201 }] })), { label: 'Прийнято Apple', ok: true });
  assert.deepEqual(j(pure.describeDeliveryRow({ statuses: [{ ok: true, status: 201 }, { ok: true, status: 201 }] })), { label: 'Прийнято Apple', ok: true });
  assert.deepEqual(j(pure.describeDeliveryRow({ statuses: [{ ok: false, status: 410 }] })), { label: 'Помилка 410', ok: false });
  assert.deepEqual(j(pure.describeDeliveryRow({ statuses: [{ ok: true, status: 201 }, { ok: false, status: 404 }] })), { label: 'Помилка 404', ok: false });
  assert.deepEqual(j(pure.describeDeliveryRow({ statuses: [{ ok: false, msg: 'x' }] })), { label: 'Помилка', ok: false });
  assert.deepEqual(j(pure.describeDeliveryRow({ statuses: [], subscriptions: 0 })), { label: 'Немає підписок', ok: false });
  assert.deepEqual(j(pure.describeDeliveryRow({})), { label: 'Без відповіді', ok: false });
});
test('екран «Сповіщення» (R): рядок у «Налаштуваннях» без підпису/стану; головний тумблер, групи, виняток, діагностика у «Тестуванні», чисті id часу', () => {
  const row = SRC.slice(SRC.indexOf('id="settings-notifications-row"'), SRC.indexOf('</button>', SRC.indexOf('id="settings-notifications-row"')));
  assert.ok(!/n-row-sub|n-row-state|settings-notifications-state|badge/.test(row));
  assert.match(row, /<span class="n-row-title">Сповіщення<\/span>/);
  const r = SRC.slice(SRC.indexOf('function renderNotificationsDrawer'), SRC.indexOf('let notificationDiagOpen'));
  assert.match(r, /dimWrap\.setAttribute\('inert', ''\)/);
  assert.match(r, /n-dimmed/);
  assert.ok(!/Діагностика доставки|diag/i.test(r), 'діагностика не на екрані «Сповіщення»');
  assert.ok(!/status\.className|n-status|Сповіщення дозволені/.test(r), 'жодного повідомлення про стан без винятку');
  assert.match(r, /'ntffielda1'/); assert.match(r, /'ntffielda2'/);
  ['ntffielda1', 'ntffielda2'].forEach(id => assert.ok(!/name|phone|tel|mail|addr|user|login|first|last|fio|contact/i.test(id), id));
  assert.match(SRC.slice(SRC.indexOf('function notifRow'), SRC.indexOf('function notifGroup')), /setAttribute\('role', 'switch'\); input\.setAttribute\('aria-label', titleText\)/);
  assert.match(SRC, /id="testing-diag-btn"[^>]*toggleDeliveryDiagFromTesting\(\)/);
  assert.match(SRC, /function toggleDeliveryDiagFromTesting/);
  assert.match(SRC, /Зміни прийдуть одним зведенням після завершення тихих годин\./);
  assert.match(SRC, /@media \(prefers-reduced-motion: reduce\)\{ .nx-screen \.nx-appear\{ animation:none; \} \}/);
  assert.ok(!/nx-appear[^}]*(height|max-height)/.test(SRC.slice(SRC.indexOf('@keyframes nxAppear'), SRC.indexOf('@keyframes nxAppear') + 400)), 'анімація без висоти');
});
test('shouldReleaseKbOpen: <700мс — ні; ≥700 і vvH ≥ baseVh-100 — так; клавіатура є — ні', () => {
  assert.equal(pure.shouldReleaseKbOpen(894, 894, 699), false);
  assert.equal(pure.shouldReleaseKbOpen(894, 894, 700), true);
  assert.equal(pure.shouldReleaseKbOpen(800, 894, 800), true);
  assert.equal(pure.shouldReleaseKbOpen(794, 894, 800), true);
  assert.equal(pure.shouldReleaseKbOpen(793, 894, 800), false);
  assert.equal(pure.shouldReleaseKbOpen(520, 894, 1000), false);
});

// Охоронний тест (S4): обробник push у sw.js для КОЖНОГО входу викликає showNotification — запускаємо справжній sw.js у vm.
function runPush(opts){
  const vm = require('node:vm');
  const handlers = {}; const shown = [];
  const sandbox = {
    self: null, caches: {}, console: { log(){}, warn(){}, error(){} }, Promise: Promise,
    indexedDB: opts.idb === 'fail' ? { open(){ throw new Error('idb недоступна'); } } : (function(){
      const store = [];
      return { open(){ const req = {}; setTimeout(function(){
        const db = { objectStoreNames: { contains(){ return true; } }, transaction(){ const tx = { objectStore(){ return {
          add(e){ const r = {}; setTimeout(function(){ e.id = store.length + 1; store.push(e); r.result = e.id; r.onsuccess && r.onsuccess(); }, 0); return r; },
          getAllKeys(){ const r = {}; setTimeout(function(){ r.result = store.map(function(x){ return x.id; }); r.onsuccess && r.onsuccess(); setTimeout(function(){ tx.oncomplete && tx.oncomplete(); }, 0); }, 0); return r; },
          delete(){}, get(id){ const r = {}; setTimeout(function(){ r.result = store.find(function(x){ return x.id === id; }); r.onsuccess && r.onsuccess(); setTimeout(function(){ tx.oncomplete && tx.oncomplete(); }, 0); }, 0); return r; }, put(v){ Object.assign(store.find(function(x){ return x.id === v.id; }) || {}, v); },
        }; } }; return tx; }, close(){} };
        req.result = db; req.onsuccess && req.onsuccess(); }, 0); return req; }, _store: store };
    })(),
    setTimeout: setTimeout,
  };
  sandbox.self = { addEventListener(name, fn){ handlers[name] = fn; }, registration: { showNotification(title, options){ if(opts.showFails) return Promise.reject(new Error('iOS відмовив')); shown.push([title, options]); return Promise.resolve(); } }, clients: {}, skipWaiting(){} };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8'), sandbox);
  let waited = null;
  const event = { data: opts.data, waitUntil(p){ waited = p; } };
  handlers.push(event);
  return Promise.resolve(waited).catch(function(){}).then(function(){ return { shown: shown, idb: sandbox.indexedDB }; });
}
const mkData = function(v){ return { json(){ if(v instanceof Error) throw v; return v; } }; };
test('sw.js push (S4): showNotification викликається для КОЖНОГО входу, жодної умови-винятку', async () => {
  const cases = [
    { name: 'валідний payload', data: mkData({ title: 'Привіт', body: 'Тіло', data: { type: 'daily-expense-reminder', tag: 't1' } }) },
    { name: 'не JSON', data: mkData(new Error('Unexpected token')) },
    { name: 'немає event.data', data: null },
    { name: 'порожній об\'єкт', data: mkData({}) },
    { name: 'data.data = null', data: mkData({ title: 'X', data: null }) },
    { name: 'payload — рядок', data: mkData('просто текст') },
    { name: 'payload — null', data: mkData(null) },
    { name: 'журнал (IndexedDB) недоступний', data: mkData({ title: 'Y' }), idb: 'fail' },
  ];
  for(const c of cases){
    const r = await runPush({ data: c.data, idb: c.idb });
    assert.equal(r.shown.length, 1, c.name);
    assert.equal(typeof r.shown[0][0], 'string', c.name);
  }
  const ok = await runPush({ data: mkData({ title: 'Привіт', data: { type: 'x', tag: 'abc' } }) });
  assert.equal(ok.shown[0][1].tag, 'abc'); assert.equal(ok.shown[0][1].renotify, false);
  assert.equal((await runPush({ data: mkData({}) })).shown[0][0], 'Money Tree');
});
test('sw.js push: журнал отримання пишеться до showNotification і позначається shown; без умов "вікно видиме"', async () => {
  const r = await runPush({ data: mkData({ title: 'Лог', data: { type: 'test' } }) });
  const log = r.idb._store;
  assert.equal(log.length, 1); assert.equal(log[0].type, 'test'); assert.equal(log[0].shown, true);
  const failed = await runPush({ data: mkData({ title: 'Лог' }), showFails: true });
  assert.equal(failed.idb._store[0].shown, false); assert.ok(/show:/.test(failed.idb._store[0].error));
  const src = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');
  const handler = src.slice(src.indexOf("self.addEventListener('push'"), src.indexOf("// Rev 2.22.25 (6D.93) — клік по сповіщенню"));
  assert.equal(/matchAll|visibilityState|\.visible|focused/.test(handler), false, 'жодних перевірок видимості вікна');
  assert.equal((handler.match(/showNotification\(/g) || []).length, 1);
});
test('джерело (6D.199): «Сповіщення» немає в Сервісі, є в Налаштуваннях; тема й опис мови лишились', () => {
  const svc = SRC.slice(SRC.indexOf('id="view-service"'), SRC.indexOf('id="view-service"') + 40000);
  assert.equal(svc.includes('id="notifications-btn"'), false);
  const st = SRC.slice(SRC.indexOf('id="settings-drawer"'), SRC.indexOf('id="settings-drawer"') + 6000);
  assert.ok(st.includes('settings-notifications-row') && st.includes('id="theme-toggle"') && st.includes('Мова та валюта поки фіксовані'));
  ['auto', 'light', 'dark'].forEach(function(t){ assert.ok(st.includes("setThemeChoice('" + t + "')"), t); });
});

// ===== Rev 2.23.31 (6D.200): target зведення і Журнал лише з витратами =====
test('routeForPushType: other-actor-summary за data.target (journal / accounting / debts / відсутній / невідомий)', () => {
  assert.deepEqual(j(pure.routeForPushType('other-actor-summary', { target: 'accounting' })), { screen: 'accounting' });
  assert.deepEqual(j(pure.routeForPushType('other-actor-summary', { target: 'debts' })), { screen: 'debts' });
  assert.deepEqual(j(pure.routeForPushType('other-actor-summary', { target: 'journal' })), { screen: 'journal' });
  assert.deepEqual(j(pure.routeForPushType('other-actor-summary', {})), { screen: 'journal' });
  assert.deepEqual(j(pure.routeForPushType('other-actor-summary', { target: 'щось' })), { screen: 'journal' });
  assert.deepEqual(j(pure.routeForPushType('other-actor-summary')), { screen: 'journal' });
});
test('handlePushAction: summary → accounting відкриває «Облік → Доходи» з місяцем найновішого доходу; debts → Борги; journal → Журнал', async () => {
  let c = await runHandle({ type: 'other-actor-summary', target: 'accounting' });
  assert.ok(c.some(function(x){ return x[0] === 'performSwitchTab' && x[1] === 'accounting'; }));
  assert.ok(c.some(function(x){ return x[0] === 'switchAccountingTab' && x[1] === 'data'; }));
  assert.ok(c.some(function(x){ return x[0] === 'performMonthChange' && x[1] === '2026-10'; }));
  assert.ok(!c.some(function(x){ return x[0] === 'openJournal'; }), 'доходи не ведуть у Журнал');
  c = await runHandle({ type: 'other-actor-summary', target: 'debts' });
  assert.ok(c.some(function(x){ return x[0] === 'goToCardDebtsTab'; }) && !c.some(function(x){ return x[0] === 'openJournal'; }));
  c = await runHandle({ type: 'other-actor-summary' });
  assert.ok(c.some(function(x){ return x[0] === 'openJournal'; }));
});
test('охоронний (J1): Журнал (короткий список і повний) не містить доходів; latestTouchedRecordMonth розрізняє вид', () => {
  const rr = SRC.slice(SRC.indexOf('function renderRecords()'), SRC.indexOf('function renderRecords()') + 3500);
  const rj = SRC.slice(SRC.indexOf('function renderJournalView()'), SRC.indexOf('function renderJournalView()') + 2500);
  assert.equal(/activeIncomes\(\)\.map/.test(rr), false);
  assert.equal(/activeIncomes\(\)\.map/.test(rj), false);
  const lt = SRC.slice(SRC.indexOf('function latestTouchedRecordMonth'), SRC.indexOf('function latestTouchedRecordMonth') + 900);
  assert.ok(/kind === 'income'/.test(lt));
});

test('toggleOutcome (A): default → системний запит; granted → зберегти true й підписка; denied/unsupported → без запиту, лише підсвітка; вимкнення завжди зберігає false', () => {
  assert.deepEqual(j(pure.toggleOutcome('default', 'on')), { request: true, subscribe: false, save: null, flash: false });
  assert.deepEqual(j(pure.toggleOutcome('granted', 'on')), { request: false, subscribe: true, save: true, flash: false });
  assert.deepEqual(j(pure.toggleOutcome('denied', 'on')), { request: false, subscribe: false, save: null, flash: true });
  assert.deepEqual(j(pure.toggleOutcome('unsupported', 'on')), { request: false, subscribe: false, save: null, flash: true });
  ['default', 'granted', 'denied', 'unsupported'].forEach(p => assert.deepEqual(j(pure.toggleOutcome(p, 'off')), { request: false, subscribe: false, save: false, flash: false }, p));
  // відповідь на запит: «Дозволити» → як granted, «Не дозволяти» → як denied
  assert.equal(pure.toggleOutcome('granted', 'on').save, true);
  assert.equal(pure.toggleOutcome('denied', 'on').save, null);
});
test('onMasterToggle (A): системний запит — перший await (жест), без шторки «Як увімкнути»; підсвітка лише opacity', () => {
  const f = SRC.slice(SRC.indexOf('async function onMasterToggle'), SRC.indexOf('function flashPermissionNotice'));
  assert.ok(f.indexOf('Notification.requestPermission()') < f.indexOf('saveNotificationSetting'), 'запит до будь-якого мережевого await');
  assert.ok(f.indexOf('const perm = currentPermissionState()') < f.indexOf('await Notification.requestPermission()'));
  assert.ok(!/await/.test(f.slice(f.indexOf('const perm = currentPermissionState()'), f.indexOf('await Notification.requestPermission()'))), 'перед запитом немає жодного await');
  assert.match(f, /out\.flash\) flashPermissionNotice\(\)/);
  assert.ok(!/Як увімкнути|settings-link|app-settings:/.test(SRC.slice(SRC.indexOf('function renderNotificationsDrawer'), SRC.indexOf('let notificationDiagOpen'))));
  assert.match(SRC, /@keyframes nxFlash\{ 0%,100%\{ opacity:1; \} 30%\{ opacity:\.25; \} 60%\{ opacity:1; \} \}/);
  assert.ok(!/nxFlash[^}]*(height|margin|padding)/.test(SRC.slice(SRC.indexOf('@keyframes nxFlash'), SRC.indexOf('@keyframes nxFlash') + 200)));
});

test('Z: routeForPushType(backup-reminder) → екран резервної копії; shouldRecordBackupDate лише при успіху, мережі й сесії', () => {
  assert.deepEqual(j(pure.routeForPushType('backup-reminder')), { screen: 'backup' });
  assert.equal(pure.shouldRecordBackupDate({ ok: true, online: true, hasSession: true }), true);
  [{ ok: false, online: true, hasSession: true }, { ok: true, online: false, hasSession: true }, { ok: true, online: true, hasSession: false }, {}, null].forEach(st => assert.equal(pure.shouldRecordBackupDate(st), false, JSON.stringify(st)));
});
test('Z: маршрут backup без focus() і клавіатури; невдалий експорт не пише дату; експорт не блокується; перемикач «Резервна копія» у групі «Нагадування» з тим самим збереженням', () => {
  const h = SRC.slice(SRC.indexOf("}else if(route.screen === 'backup'){"), SRC.indexOf("captureDebugGeometry('push-route'", SRC.indexOf("}else if(route.screen === 'backup'){")));
  assert.match(h, /performSwitchTab\('service'\)/);
  assert.match(h, /classList\.remove\('kb-open'\)/);
  assert.ok(!/\.focus\(/.test(h));
  const e = SRC.slice(SRC.indexOf('function exportBackup'), SRC.indexOf('function exportBackup') + 500);
  assert.match(e, /recordBackupDate\(ok\); \/\/ не блокує експорт/);
  assert.ok(!/await/.test(e));
  const rec = SRC.slice(SRC.indexOf('async function recordBackupDate'), SRC.indexOf('function exportBackup'));
  assert.match(rec, /shouldRecordBackupDate\(\{ ok: ok, online: navigator\.onLine, hasSession: isCloudSessionReady\(\) \}\)/);
  assert.match(rec, /last_backup_at: new Date\(\)\.toISOString\(\)/);
  assert.match(rec, /type: 'backup-export', ok: !!ok, recorded: recorded/);
  assert.match(SRC, /sw\('backup', 'reminders', 'backup_reminder', 'Резервна копія', 'кінець місяця'\)/);
  assert.match(SRC, /id="backup-export-tile" onclick="exportBackup\(\)"/);
});

test('R (пакет): R-3 і R-5 збережені в редизайні — запит дозволу першим кроком, індикатор сегментів (у т.ч. для рядка, що з’являється пізніше); жовтий текст виняток ≥4,5:1', () => {
  const f = SRC.slice(SRC.indexOf('async function onMasterToggle'), SRC.indexOf('function flashPermissionNotice'));
  assert.ok(!/await/.test(f.slice(f.indexOf('const perm = currentPermissionState()'), f.indexOf('await Notification.requestPermission()'))));
  const r = SRC.slice(SRC.indexOf('function renderNotificationsDrawer'), SRC.indexOf('let notificationDiagOpen'));
  assert.match(r, /body\.appendChild\(gt\);[\s\S]*?initSegments\(\);/);
  assert.match(SRC, /\{ silent: true \}/);
  // контраст: світла тема #B45309 на білому ≥ 4,5; темна #F59E0B на темному тлі ≥ 4,5
  const lum = h => { const c = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255).map(v => v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
  const cr = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  assert.ok(cr('#B45309', '#FFFFFF') >= 4.5, 'світла');
  assert.ok(cr('#F59E0B', '#161B26') >= 4.5, 'темна');
  assert.match(SRC, /--ui-warning-text:#B45309/);
  assert.match(SRC, /--ui-warning-text:#F59E0B/);
  assert.match(SRC, /\.nx-screen \.nx-notice\{ font-size:13px; line-height:1\.4; color:var\(--ui-warning-text\)/);
});
