// ERR-3: performRestore — поточна поведінка успішного відновлення зі страховою копією (фіксується ДО зміни) і поведінка при збої страхової копії (після зміни). Лише синтетичні дані.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildSandbox } = require('./extract');
const SRC = require('./extract').readIndexWithCss();
function mk(opts){
  opts = opts || {};
  const log = [], toasts = [], errs = [], status = { textContent: '' };
  const g = {
    document: { getElementById: id => id === 'backup-status' ? status : null },
    indexedDB: opts.noIdb ? undefined : {},
    lastRestoreSummary: { total: 3, serverNewer: 0 },
    createRestoreSafetySnapshot: () => log.push('snapshot'),
    applyBackupData: async (data) => { log.push(['apply', data && data.k]); if(opts.applyFails) throw new Error('bad data'); return { expenses: { ok: true } }; },
    reportSaveResult: r => log.push(['report', !!(r && r.ok)]),
    showTextToast: (t, kind) => toasts.push([t, kind || null]),
    restoreCountWord: () => 'записів', renderBackupStatus: async () => log.push('status'),
    recErr: (at, e) => errs.push([at, e && e.message]),
  };
  if(opts.typeofIdbUndefined) delete g.indexedDB;
  const c = buildSandbox(g, ['performRestore']);
  c.abBeforeRestore = async (store, now, source, label) => { log.push(['backup', source, label]); if(opts.backupFails) throw new Error('QuotaExceededError'); return {}; }; // перекриває справжню (її підтягує екстрактор)
  return { c, log, toasts, errs, status };
}
test('ПОТОЧНА ПОВЕДІНКА: успішне відновлення — знімок, страхова копія ДО застосування, застосування, звіт, тост «Повернуто N …», статус очищено, статус копії оновлено', async function(){
  const t = mk();
  await t.c.performRestore({ k: 1 }, { source: 'file', label: 'до 1 жов' });
  assert.deepEqual(t.log, ['snapshot', ['backup', 'file', 'до 1 жов'], ['apply', 1], ['report', true], 'status']);
  assert.equal(t.toasts.length, 1); assert.match(t.toasts[0][0], /^Повернуто 3 записи\./); assert.equal(t.status.textContent, '');
  assert.deepEqual(t.errs, []);
});
test('ПОТОЧНА ПОВЕДІНКА: збій самого застосування — «Не вдалося відновити дані», далі не йде (без страхового збою)', async function(){
  const t = mk({ applyFails: true });
  await t.c.performRestore({ k: 1 }, { source: 'file', label: 'x' });
  assert.deepEqual(t.toasts, [['Не вдалося відновити дані', 'error']]); assert.equal(t.status.textContent, 'Не вдалося відновити дані.'); assert.ok(!t.log.some(x => Array.isArray(x) && x[0] === 'report'));
});
test('ПОТОЧНА ПОВЕДІНКА: IndexedDB недоступна (typeof indexedDB === undefined) — страхова копія не пробується, відновлення йде (це не «збій копії»)', async function(){
  const t = mk({ typeofIdbUndefined: true });
  await t.c.performRestore({ k: 2 }, { source: 'undo' });
  assert.ok(!t.log.some(x => Array.isArray(x) && x[0] === 'backup')); assert.ok(t.log.some(x => Array.isArray(x) && x[0] === 'apply'));
});

// ----- ПІСЛЯ ЗМІНИ (Rev 2.32.425, ERR-3) -----
test('збій страхової копії: відновлення НЕ продовжується — дані без змін (applyBackupData не викликано), тост показано, подія restore-no-backup записана, статус очищено', async function(){
  const t = mk({ backupFails: true });
  await t.c.performRestore({ k: 1 }, { source: 'file', label: 'до 1 жов' });
  assert.deepEqual(t.log, ['snapshot', ['backup', 'file', 'до 1 жов']], 'після збою копії нічого не застосовується й не звітується');
  assert.deepEqual(t.toasts, [['Не вдалося зробити страхову копію. Відновлення скасовано, дані не змінені.', 'error']]);
  assert.deepEqual(t.errs, [['restore-no-backup', 'QuotaExceededError']]); assert.equal(t.status.textContent, '');
});
test('збій копії при «Повернути» (undo) теж скасовує', async function(){
  const t = mk({ backupFails: true });
  await t.c.performRestore({ k: 9 }, { source: 'undo' });
  assert.ok(!t.log.some(x => Array.isArray(x) && x[0] === 'apply')); assert.equal(t.errs.length, 1);
});
test('успішна копія — відновлення як раніше (той самий порядок, без подій і тостів помилки)', async function(){
  const t = mk();
  await t.c.performRestore({ k: 1 }, { source: 'file', label: 'x' });
  assert.deepEqual(t.log.map(x => Array.isArray(x) ? x[0] : x), ['snapshot', 'backup', 'apply', 'report', 'status']); assert.deepEqual(t.errs, []); assert.ok(t.toasts.every(x => x[1] !== 'error'));
});
test('охоронне: перевірка стоїть ДО застосування; recErr-код restore-no-backup; сценарій відновлення з файлу не змінено', function(){
  const i = SRC.indexOf('async function performRestore'), body = SRC.slice(i, SRC.indexOf('function handleRestoreBackupFile', i));
  assert.ok(body.indexOf("recErr('restore-no-backup', e)") < body.indexOf('applyBackupData(data)'));
  assert.match(body, /showTextToast\('Не вдалося зробити страхову копію\. Відновлення скасовано, дані не змінені\.', 'error'\);\s*return;/);
});
