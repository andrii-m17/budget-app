// Rev 2.32.406 (PUSH-TOAST, клас B): вибір тоста «Переглянути», коли застосунок відкритий і на екрані (чиста функція pushToastPlan) і обробка повідомлення від SW.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildSandbox, evalInSandbox } = require('./extract');
const SRC = require('./extract').readIndexWithCss();
const j = v => JSON.parse(JSON.stringify(v));
const NAMES = ['PUSH_TOAST_MS', 'PUSH_TOAST_SETTING', 'PUSH_TOAST_STATE', 'pushToastQuietNow', 'pushToastPlan', 'pushToastRec', 'pushToastReceive', 'pushToastOpen', 'routeForPushType'];
function mk(extra){
  const toasts = [], rec = [], opened = [];
  const g = Object.assign({ toasts, rec, opened, document: { visibilityState: 'visible' }, notificationSettings: null,
    pushToastCurrentScreen: () => '', showToast: o => { toasts.push(o); }, pushDebugEvent: e => { rec.push(e); },
    handlePushAction: async a => { opened.push(a.type); return true; }, markPushNotificationsRead: async () => {},
    notifArchive: { loaded: true, rows: [] }, notifRowsForPush: () => [], loadNotifArchive: async () => {} }, extra || {});
  const c = buildSandbox(g, NAMES);
  Object.keys(extra || {}).forEach(k => { c[k] = extra[k]; }); // функції-залежності екстрактор підтягує сам: підміняємо після збірки
  return c;
}
const msg = (type, extra) => ({ title: 'Money Tree', body: 'Нові зміни в бюджеті', data: Object.assign({ type: type, push_id: 'p-' + type }, extra || {}) });
const plan = (c, m, ctx) => j(c.pushToastPlan(m, Object.assign({ visible: true, settings: null, now: new Date('2026-11-19T10:00:00Z'), screen: '' }, ctx || {})));

test('усі типи з маршрутом дають тост із кнопкою «Переглянути», 6 с', () => {
  const c = mk();
  for(const t of ['other-actor-summary', 'other-actor-deleted', 'daily-expense-reminder', 'installment-deadline', 'monthly-debt-reminder', 'backup-reminder', 'weekly-summary', 'month-end']){
    const p = plan(c, msg(t)); assert.equal(p.show, true, t); assert.equal(p.actionLabel, 'Переглянути', t);
  }
  assert.equal(evalInSandbox(c, 'PUSH_TOAST_MS'), 6000);
});
test('без маршруту (ops-alert, test, невідомий) і без типу — тоста немає, є причина', () => {
  const c = mk();
  assert.deepEqual(plan(c, msg('ops-alert')), { show: false, reason: 'no-route' });
  assert.deepEqual(plan(c, msg('test')), { show: false, reason: 'no-route' });
  assert.deepEqual(plan(c, { title: 'x', data: {} }), { show: false, reason: 'no-type' });
  assert.deepEqual(plan(c, null), { show: false, reason: 'no-type' });
});
test('Monobank лишається своїм тостом: mono-inbox не дає другого', () => {
  assert.deepEqual(plan(mk(), msg('mono-inbox', { tag: 'mono-inbox' })), { show: false, reason: 'mono' });
});
test('сторінка не видима — тоста немає', () => {
  assert.deepEqual(plan(mk(), msg('other-actor-summary'), { visible: false }), { show: false, reason: 'hidden' });
});
test('вимкнений тип і головний вимикач — тоста немає; увімкнений — є', () => {
  const c = mk(); const s = { notifications_enabled: true, other_actor_changes: false, daily_reminder: true, installment_deadline: true, other_actor_deletions: true, quiet_enabled: false };
  assert.deepEqual(plan(c, msg('other-actor-summary'), { settings: s }), { show: false, reason: 'disabled' });
  assert.equal(plan(c, msg('daily-expense-reminder'), { settings: s }).show, true);
  assert.deepEqual(plan(c, msg('installment-deadline'), { settings: Object.assign({}, s, { notifications_enabled: false }) }), { show: false, reason: 'disabled' });
});
test('тихі години за Києвом (з переходом через північ): у них тоста немає, поза ними є', () => {
  const c = mk(); const s = { notifications_enabled: true, quiet_enabled: true, quiet_start: '22:00', quiet_end: '07:00' };
  // 2026-11-19 20:30 UTC = 22:30 Київ (зима UTC+2) — тиха година
  assert.deepEqual(plan(c, msg('other-actor-summary'), { settings: s, now: new Date('2026-11-19T20:30:00Z') }), { show: false, reason: 'quiet' });
  assert.equal(plan(c, msg('other-actor-summary'), { settings: s, now: new Date('2026-11-19T10:00:00Z') }).show, true);
  assert.equal(c.pushToastQuietNow({ quiet_enabled: false, quiet_start: '22:00', quiet_end: '07:00' }, new Date('2026-11-19T20:30:00Z')), false);
  assert.equal(c.pushToastQuietNow({ quiet_enabled: true, quiet_start: '09:00', quiet_end: '09:00' }, new Date()), false);
  assert.equal(c.pushToastQuietNow({ quiet_enabled: true, quiet_start: '12:00', quiet_end: '14:00' }, new Date('2026-11-19T11:00:00Z')), true, '13:00 Київ у 12–14');
});
test('той самий екран: тост без кнопки (дані й так оновлюються), інший екран — з кнопкою', () => {
  const c = mk();
  const same = plan(c, msg('other-actor-summary'), { screen: 'journal' }); assert.equal(same.show, true); assert.equal(same.actionLabel, null); assert.equal(same.same, true);
  assert.equal(plan(c, msg('other-actor-summary', { target: 'debts' }), { screen: 'journal' }).actionLabel, 'Переглянути');
  assert.equal(plan(c, msg('daily-expense-reminder'), { screen: 'vytraty' }).actionLabel, null);
});
test('текст: нейтральний (hide_details «Money Tree» + нейтральне тіло) або заголовок + тіло; довге обрізається', () => {
  const c = mk();
  assert.equal(plan(c, msg('other-actor-summary')).title, 'Нові зміни в бюджеті');
  const p = plan(c, { title: 'Учасник 2 вніс 12 витрат', body: 'Журнал: 12 нових записів', data: { type: 'other-actor-summary' } });
  assert.equal(p.title, 'Учасник 2 вніс 12 витрат'); assert.equal(p.subtitle, 'Журнал: 12 нових записів');
  assert.ok(plan(c, { title: 'x'.repeat(300), data: { type: 'other-actor-summary' } }).title.length <= 90);
  assert.equal(plan(c, { data: { type: 'other-actor-summary' } }).title, 'Нове сповіщення');
});
test('pushToastReceive: показує один тост, пише push-toast; кілька підряд — кожне йде в showToast (заміна вмісту — правило TOAST-1); те саме push_id двічі — один раз', () => {
  const c = mk();
  c.pushToastReceive(msg('other-actor-summary', { push_id: 'a' }));
  c.pushToastReceive(msg('other-actor-summary', { push_id: 'a' }));
  assert.equal(c.toasts.length, 1);
  c.pushToastReceive(msg('installment-deadline', { push_id: 'b' }));
  assert.equal(c.toasts.length, 2, 'другий тост замінює перший у showToast (TOAST-1)');
  assert.deepEqual(j(c.rec.map(e => [e.type, e.pushType, e.shown, e.reason])), [['push-toast', 'other-actor-summary', true, 'ok'], ['push-toast', 'installment-deadline', true, 'ok']]);
  const o = c.toasts[1]; assert.equal(o.kind, 'info'); assert.equal(o.durationMs, 6000); assert.equal(o.actionLabel, 'Переглянути');
});
test('pushToastReceive: тост без маршруту/Monobank — запис shown=false з причиною, тоста немає', () => {
  const c = mk();
  c.pushToastReceive(msg('ops-alert')); c.pushToastReceive(msg('mono-inbox'));
  assert.equal(c.toasts.length, 0);
  assert.deepEqual(j(c.rec.map(e => [e.pushType, e.shown, e.reason])), [['ops-alert', false, 'no-route'], ['mono-inbox', false, 'mono']]);
});
test('«Переглянути»: handlePushAction з даними сповіщення, запис tapped, позначка прочитаним', async () => {
  const marks = [];
  const c = mk({ markPushNotificationsRead: async d => { marks.push(d.push_id); } });
  c.pushToastReceive(msg('daily-expense-reminder', { push_id: 'z' }));
  await c.toasts[0].onAction(); await new Promise(r => setImmediate(r));
  assert.deepEqual(j(c.opened), ['daily-expense-reminder']);
  assert.deepEqual(marks, ['z']);
  assert.ok(c.rec.some(e => e.tapped === true && e.pushType === 'daily-expense-reminder'));
});
test('sw.js: push шле видимим вікнам push-received (title/body/data), крім test; показ сповіщення не залежить від цього', () => {
  const sw = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');
  assert.match(sw, /function swNotifyVisibleClients\(msg\)/);
  assert.match(sw, /type: 'push-received', title: title\.slice\(0, 120\), body: options\.body\.slice\(0, 200\), data: inner/);
  assert.match(sw, /inner\.type !== 'test'/);
  assert.match(SRC, /event\.data\.type === 'push-received'/);
});
