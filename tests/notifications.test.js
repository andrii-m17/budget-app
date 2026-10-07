// Rev 2.23.29 (6D.198) — маршрутизація сповіщень, екран "Сповіщення" (чисті функції), фокус/hover-аудит.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildSandbox } = require('./extract');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const j = function(v){ return JSON.parse(JSON.stringify(v)); };
const pure = buildSandbox({ pluralUa: undefined }, ['routeForPushType', 'notificationSettingsDefaults', 'validateQuietHours', 'permissionStatusLabel', 'mergeSettingsGroupState', 'notificationsRowState', 'describeDeliveryRow', 'shouldReleaseKbOpen', 'pushTypeLabel', 'PUSH_TYPE_LABELS']);

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
  assert.deepEqual(j(pure.notificationSettingsDefaults()), { notifications_enabled: true, other_actor_changes: true, other_actor_deletions: true, daily_reminder: true, installment_deadline: true, installment_days: 2, month_start: true, weekly_summary: false, month_end: false, quiet_enabled: false, quiet_start: '22:00', quiet_end: '07:00' });
});

test('validateQuietHours: формат, початок≠кінець, через північ дозволено', () => {
  assert.equal(pure.validateQuietHours('22:00', '07:00').ok, true);
  assert.equal(pure.validateQuietHours('08:00', '09:30').ok, true);
  assert.equal(pure.validateQuietHours('22:00', '22:00').ok, false);
  ['', '7:00', '24:00', '12:60', 'ab:cd', null, undefined].forEach(function(bad){ assert.equal(pure.validateQuietHours(bad, '07:00').ok, false, String(bad)); assert.equal(pure.validateQuietHours('22:00', bad).ok, false, String(bad)); });
  assert.ok(pure.validateQuietHours('22:00', '22:00').error);
});

test('permissionStatusLabel: усі стани', () => {
  assert.equal(pure.permissionStatusLabel({ supported: false }).key, 'unsupported');
  assert.equal(pure.permissionStatusLabel({ supported: false }).text, 'Додайте застосунок на головний екран');
  assert.equal(pure.permissionStatusLabel({ supported: true, permission: 'granted' }).text, 'Сповіщення дозволені');
  assert.equal(pure.permissionStatusLabel({ supported: true, permission: 'denied' }).text, 'Сповіщення вимкнені в Параметрах iPhone');
  assert.equal(pure.permissionStatusLabel({ supported: true, permission: 'denied' }).canRequest, false);
  const d = pure.permissionStatusLabel({ supported: true, permission: 'default' });
  assert.equal(d.key, 'default'); assert.equal(d.canRequest, true);
  assert.equal(pure.permissionStatusLabel().key, 'unsupported');
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
test('mergeSettingsGroupState: вимкнений головний тумблер приглушує групи, значення не стираються', () => {
  const groups = { daily_reminder: true, installment_days: 3, quiet_enabled: true };
  const off = j(pure.mergeSettingsGroupState(false, groups));
  assert.equal(off.groupsDisabled, true);
  assert.deepEqual(off.values, groups);
  const on = j(pure.mergeSettingsGroupState(true, groups));
  assert.equal(on.groupsDisabled, false);
  assert.deepEqual(on.values, groups);
  assert.equal(pure.mergeSettingsGroupState(undefined, groups).groupsDisabled, false, 'невідомий стан не глушить');
});
test('notificationsRowState: Увімкнено / Вимкнено / Вимкнено в iPhone / Не налаштовано / невідомо', () => {
  const granted = { supported: true, permission: 'granted' };
  assert.equal(pure.notificationsRowState({ notifications_enabled: true }, granted), 'Увімкнено');
  assert.equal(pure.notificationsRowState({ notifications_enabled: false }, granted), 'Вимкнено');
  assert.equal(pure.notificationsRowState({ notifications_enabled: true }, { supported: true, permission: 'denied' }), 'Вимкнено в iPhone');
  assert.equal(pure.notificationsRowState({ notifications_enabled: true }, { supported: true, permission: 'default' }), 'Не налаштовано');
  assert.equal(pure.notificationsRowState(null, granted), '');
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
