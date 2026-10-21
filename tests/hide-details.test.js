// Rev 2.32.109 (HIDE-1): «Приховувати суми й назви на екрані блокування» (notification_settings.hide_details): читання, запис, типове значення, місце в екрані.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildSandbox, evalInSandbox } = require('./extract');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const j = v => JSON.parse(JSON.stringify(v));
const NAMES = ['NOTIFICATION_SETTING_FIELDS', 'loadNotificationSettings', 'saveNotificationSetting', 'notificationSettingsDefaults', 'notificationRows', 'monoNotifGroupVisible'];

test('типово вимкнено; рядок «Приховувати…» одразу після головного тумблера, перемикач без групи', () => {
  const c = buildSandbox({}, NAMES);
  assert.equal(c.notificationSettingsDefaults().hide_details, false);
  const rows = j(c.notificationRows(c.notificationSettingsDefaults(), { supported: true, permission: 'granted' }));
  assert.equal(rows[0].id, 'master'); assert.equal(rows[1].id, 'hide-details');
  assert.deepEqual([rows[1].type, rows[1].group, rows[1].field, rows[1].value, rows[1].visible], ['switch', null, 'hide_details', false, true]);
  assert.equal(rows[1].title, 'Приховувати суми й назви на екрані блокування');
  assert.equal(j(c.notificationRows(Object.assign({}, c.notificationSettingsDefaults(), { hide_details: true }), {}))[1].value, true);
});
test('читання: hide_details з рядка таблиці; відсутнє/null → false', async () => {
  const mk = row => buildSandbox({
    notificationSettings: null, notificationSettingsReadOnly: true, isCloudSessionReady: () => true, isWriteBlocked: () => false, cloudSession: { user: { id: 'u' } }, cloudFamilyId: 'f', navigator: { onLine: true },
    getSupabaseClient: () => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: row, error: null }) }) }) }) }),
  }, NAMES);
  for(const [row, want] of [[{ hide_details: true }, true], [{ hide_details: false }, false], [{ hide_details: null }, false], [{}, false]]){
    const c = mk(row); await c.loadNotificationSettings();
    assert.equal(evalInSandbox(c, 'notificationSettings.hide_details'), want, JSON.stringify(row));
  }
});
test('запис: upsert лише з { hide_details } і власними user_id/family_id; помилка → відкат і тост', async () => {
  const calls = [], toasts = [];
  const mk = err => buildSandbox({
    notificationSettingsReadOnly: false, notificationSettings: { hide_details: false }, cloudSession: { user: { id: 'u' } }, cloudFamilyId: 'f', renderNotificationsDrawer(){}, showTextToast: t => toasts.push(t),
    getSupabaseClient: () => ({ from: t => ({ upsert: async (row, opts) => { calls.push({ t, row, opts }); return { error: err }; } }) }),
  }, NAMES);
  const ok = mk(null);
  assert.equal(await ok.saveNotificationSetting({ hide_details: true }), true);
  assert.deepEqual(j(calls[0]), { t: 'notification_settings', row: { user_id: 'u', family_id: 'f', hide_details: true }, opts: { onConflict: 'user_id' } });
  const bad = mk({ message: 'x' });
  assert.equal(await bad.saveNotificationSetting({ hide_details: true }), false);
  assert.deepEqual(toasts, ['Не вдалося зберегти налаштування']);
});
test('джерело: поле в NOTIFICATION_SETTING_FIELDS; перемикач у картці головного тумблера; підказка; недоступний при вимкненому головному й у режимі читання', () => {
  assert.match(SRC, /const NOTIFICATION_SETTING_FIELDS = \[[^\]]*'hide_details'\]/);
  const r = SRC.slice(SRC.indexOf('function renderNotificationsDrawer'), SRC.indexOf('let notificationDiagOpen'));
  assert.ok(r.includes("const hideRow = notifRow(hide.title, null, hide.value, function(v){ saveNotificationSetting({ hide_details: v }); }, ro || master.value === false);"));
  assert.ok(r.includes("hideRow.classList.add('n-row-wrap');") && r.includes('gm.appendChild(hideRow);'));
  assert.ok(SRC.includes('#notifications-drawer .n-row.n-row-wrap .n-row-title{ white-space:normal; }'));
  assert.match(r, /На екрані блокування сповіщення показують загальний текст\. Деталі видно в застосунку\./);
  assert.match(r, /rows\.slice\(2\)\.forEach/);
});
