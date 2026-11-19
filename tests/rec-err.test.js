// Rev 2.32.422 (ERR-1a): recErr — слід перехоплених помилок у самописці (подія «err»): ліміти, обрізання, приватність, білі списки, місця виклику. Лише запис: поведінка місць не змінена.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildSandbox } = require('./extract');
const SRC = require('./extract').readIndexWithCss();
const j = v => JSON.parse(JSON.stringify(v));
function mk(opts){
  opts = opts || {};
  const ev = [], clock = { t: 1000000 };
  const ctx = buildSandbox({ recOn: () => opts.off ? false : true, pushDebugEvent: e => ev.push(e), debugRecordingActive: false, debugRecordingStartedAt: 0, performance: { now: () => 5 }, Date: { now: () => clock.t } },
    ['scrubJsErrorText', 'jsErrorStackTop', 'REC_ERR_PER_MIN', 'REC_ERR_TOTAL', 'REC_ERR_STATE', 'recErrAt', 'recErrMessage', 'recErr']);
  return { ctx, ev, clock };
}
test('подія err: тип, код місця, повідомлення, імена кадрів стека, лічильник', function(){
  const { ctx, ev } = mk(); const e = new TypeError('Failed to fetch'); e.stack = 'TypeError: Failed to fetch\n    at pushExpensesBatch (https://x.test/a/b/index.html?v=1:5287:9)\n    at async runSyncCheck (https://x.test/index.html:9163:5)\n    at foo (file.js:1:1)\n    at bar (file.js:2:2)';
  ctx.recErr('push-batch-exp', e);
  assert.equal(ev.length, 1); const x = j(ev[0]);
  assert.equal(x.type, 'err'); assert.equal(x.at, 'push-batch-exp'); assert.equal(x.message, 'TypeError · Failed to fetch'); assert.equal(x.count, 1);
  assert.deepEqual(x.stackTop, ['pushExpensesBatch', 'runSyncCheck', 'foo'], '3 імена, без шляхів');
  assert.ok(!/https?:|index\.html|\//.test(JSON.stringify(x)), 'шляхів немає');
});
test('повідомлення ≤ 80, обрізається до першого «:» або «(» (помилки Supabase), без email і довгих чисел', function(){
  const { ctx, ev } = mk();
  ctx.recErr('a', new Error('duplicate key value violates unique constraint "x": Key (name)=(Кава) already exists'));
  ctx.recErr('b', { message: 'invalid input (user@example.com) 1234567890' });
  ctx.recErr('c', new Error('Ж'.repeat(300)));
  ctx.recErr('d', 'просто рядок 12 345 678 грн');
  assert.equal(ev[0].message, 'duplicate key value violates unique constraint "x"', 'до першого «:»');
  assert.ok(!/Кава/.test(ev[0].message));
  assert.equal(ev[1].message, 'invalid input'); // обрізано до «(»: email у дужках не потрапляє
  assert.ok(ev[2].message.length <= 80);
  assert.ok(!/12 345 678|@/.test(ev[3].message), 'довге число прибрано: ' + ev[3].message);
  ev.forEach(x => assert.ok(x.message.length <= 80));
  const emailTest = mk(); emailTest.ctx.recErr('e', new Error('x@y.test failed')); assert.ok(!/@/.test(emailTest.ev[0].message));
});
test('код місця: ≤ 24 символи, [a-z0-9-], порожній → unknown', function(){
  const { ctx } = mk();
  assert.equal(ctx.recErrAt('Push Batch/Exp!!'), 'pushbatchexp'); assert.equal(ctx.recErrAt('a'.repeat(40)).length, 24); assert.equal(ctx.recErrAt(''), 'unknown'); assert.equal(ctx.recErrAt(null), 'unknown');
});
test('ліміт: не більше 3 однакових за хвилину (count росте), після хвилини знову; загалом 30 за сеанс', function(){
  const { ctx, ev, clock } = mk();
  for(let i = 0; i < 10; i++) ctx.recErr('same', new Error('boom'));
  assert.equal(ev.length, 3, 'не більше 3 за хвилину');
  clock.t += 61000; ctx.recErr('same', new Error('boom'));
  assert.equal(ev.length, 4); assert.equal(ev[3].count, 11, 'лічильник враховує й відкинуті');
  const t = mk();
  for(let i = 0; i < 100; i++){ t.clock.t += 61000; t.ctx.recErr('k' + (i % 50), new Error('m' + i)); }
  assert.equal(t.ev.length, 30, 'загалом 30 за сеанс');
});
test('самописець вимкнено — нічого не пишеться; помилка в самому записі не кидає', function(){
  const off = mk({ off: true }); off.ctx.recErr('x', new Error('a')); assert.equal(off.ev.length, 0);
  const { ctx } = mk(); assert.doesNotThrow(() => ctx.recErr('x', { get message(){ throw new Error('вибух'); } }));
  assert.doesNotThrow(() => ctx.recErr(undefined, undefined));
});
test('safeCall: помилка не пробивається, слід у самописці (safe-<мітка>), поведінка та сама', function(){
  const ev = [];
  const c = buildSandbox({ recErr: (at, e) => ev.push([at, e && e.message]), console: { error(){} } }, ['safeCall']);
  let ran = 0; assert.doesNotThrow(() => c.safeCall(() => { ran++; throw new Error('збій'); }, 'renderX'));
  assert.equal(ran, 1); assert.deepEqual(ev, [['safe-renderX', 'збій']]);
  c.safeCall(() => { ran++; }, 'ok'); assert.equal(ev.length, 1, 'без помилки подій немає');
});
test('білі списки: err у REC_ALLOWED_TYPES, at у REC_ALLOWED_KEYS і DEBUG_EVENT_ALLOWLIST (message, stackTop, count вже є)', function(){
  const list = name => { const i = SRC.indexOf('const ' + name + ' = ['); return new Set((SRC.slice(i, SRC.indexOf('];', i)).match(/'([^']+)'/g) || []).map(x => x.slice(1, -1))); };
  assert.ok(list('REC_ALLOWED_TYPES').has('err'));
  ['REC_ALLOWED_KEYS', 'DEBUG_EVENT_ALLOWLIST'].forEach(n => ['at', 'message', 'stackTop', 'count'].forEach(k => assert.ok(list(n).has(k), n + ': ' + k)));
});
test('місця виклику: кожен код `at` стоїть у catch потрібної функції; catch лише додає запис (return/потік не змінено)', function(){
  const sites = [['idmig-cat', 'pullCategoriesCore'], ['idmig-sub', 'pullSubcategoriesCore'], ['idmig-dict', 'pullDictionaryCore'], ['idmig-bank', 'pullBankAccountsCore'], ['idmig-inst', 'pullInstallmentAccountsCore'],
    ['exp-casc-cat', 'expApplyPushedRow'], ['exp-render-cat', 'expApplyPushedRow'], ['exp-casc-sub', 'expApplyPushedRow'], ['exp-render-sub', 'expApplyPushedRow'],
    ['push-batch-exp', 'pushExpensesBatch'], ['push-batch-inc', 'pushIncomesBatch'], ['push-batch-debt', 'pushDebtsBatch'], ['heads-fetch', 'fetchSyncHeadsShared'], ['sync-names', 'runSyncCheck'], ['sync-full', 'runSyncCheck'], ['import-bank-push', 'handleImportFile']];
  sites.forEach(([at, fn]) => {
    const needle = "recErr('" + at + "', e)";
    assert.equal(SRC.split(needle).length - 1, 1, at + ' рівно один раз');
    const pos = SRC.indexOf(needle), fi = Math.max(SRC.lastIndexOf('function ' + fn + '(', pos), -1);
    assert.ok(fi >= 0, at + ' у функції ' + fn + '?');
    const between = SRC.slice(fi, pos);
    assert.ok(!/\n(?:async )?function [A-Za-z0-9_]+\(/.test(between.slice(between.indexOf('\n'))), at + ': між оголошенням ' + fn + ' і місцем немає іншої функції верхнього рівня');
  });
  // поведінка: «push-batch» усе ще падає у fallback, sync-full усе ще скидає прапорець ДО спроби (зміна — ERR-2), heads-fetch усе ще повертає null
  assert.match(SRC, /syncFullDirty = false; try\{ await autoSyncStale\('full-reconcile'\); \}catch\(e\)\{ recErr\('sync-full', e\); \} \}/);
  assert.match(SRC, /\}catch\(e\)\{ recErr\('heads-fetch', e\); return null; \}/);
  assert.match(SRC, /recErr\('push-batch-exp', e\); \/\* провал пакету/);
});

// ----- поведінкові перевірки місць (помилка з мока → одна подія err, результат той самий, що й до ERR-1a) -----
test('pushExpensesBatch: збій пакету → одна подія push-batch-exp, далі fallback поштучно, результат {pushed, failed, firstError} той самий', async function(){
  const ev = [], singles = [];
  const c = buildSandbox({ isCloudWriteReady: () => true, mdBatchCas: async () => null, cloudSession: { user: { id: 'u1' } }, isSyncableAmount: () => true, cloudFamilyId: 'f1', monoSourcePayload: () => ({}), editedAtPayload: () => ({}), expSyncBegin(){}, expSyncEnd(){},
    getSupabaseClient: () => ({ from(){ throw new TypeError('Failed to fetch'); } }), shadowSnap: () => null, expSnap: () => null, shadowRet: x => x, linkedOwnerAccount: () => null,
    pushExpenseRecordPilot: async (rec) => { singles.push(rec.id); return { success: true }; }, recErr: (at, e) => ev.push([at, e && e.message]) }, ['pushExpensesBatch']);
  const r = j(await c.pushExpensesBatch([{ id: 'a', amount: 10, date: '2026-10-01' }, { id: 'b', amount: 20, date: '2026-10-02' }]));
  assert.deepEqual(r, { pushed: 2, failed: 0, firstError: null });
  assert.deepEqual(singles, ['a', 'b']); assert.deepEqual(ev, [['push-batch-exp', 'Failed to fetch']]);
});
test('pushExpensesBatch: успішний пакет — подій err немає', async function(){
  const ev = [];
  const c = buildSandbox({ isCloudWriteReady: () => true, mdBatchCas: async () => null, cloudSession: { user: { id: 'u1' } }, isSyncableAmount: () => true, cloudFamilyId: 'f1', monoSourcePayload: () => ({}), editedAtPayload: () => ({}), expSyncBegin(){}, expSyncEnd(){},
    getSupabaseClient: () => ({ from: () => ({ upsert: async () => ({ data: [], error: null }) }) }), shadowSnap: () => null, expSnap: () => null, shadowRet: x => x, shadowSetServer(){}, shadowAfterPush(){}, shadowServerAt: () => null, shadowServerDeleted: () => false, shadowAdoptDeleted(){}, saveExpenses: async () => ({}), linkedOwnerAccount: () => null,
    pushExpenseRecordPilot: async () => ({ success: true }), recErr: (at) => ev.push(at) }, ['pushExpensesBatch']);
  const r = j(await c.pushExpensesBatch([{ id: 'a', amount: 10, date: '2026-10-01' }]));
  assert.equal(r.pushed, 1); assert.deepEqual(ev, []);
});
test('fetchSyncHeadsShared: виняток запиту → null і одна подія heads-fetch; відповідь із даними — дані без подій', async function(){
  const ev = [];
  const mkc = rpc => buildSandbox({ headsInFlight: null, getSupabaseClient: () => ({ rpc }), recErr: (at) => ev.push(at) }, ['fetchSyncHeadsShared']);
  assert.equal(await mkc(async () => { throw new Error('offline'); }).fetchSyncHeadsShared(), null); assert.deepEqual(ev, ['heads-fetch']);
  ev.length = 0; assert.deepEqual(j(await mkc(async () => ({ data: { a: 1 }, error: null })).fetchSyncHeadsShared()), { a: 1 }); assert.deepEqual(ev, []);
});
