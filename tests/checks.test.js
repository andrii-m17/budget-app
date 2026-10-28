// Rev 2.32.189 (CHECKS-1): «Перевірки»: показуються лише кроки без відповіді; «Ок» прибирає крок і створює один запис журналу; «Не ок» без причини не підтверджується;
// відповідь переживає перезапуск; без відповіді крок повертається; неналіт надісланого повторюється; лише читання нічого не шле; макет-дані дослівно.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildSandbox, evalInSandbox } = require('./extract');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const MOCK = fs.readFileSync(path.join(__dirname, '..', 'docs', 'ui', 'mockups', 'checks-mockup.html'), 'utf8');
const j = v => JSON.parse(JSON.stringify(v));
const NAMES = ['CHECKS_STATE_KEY', 'CHECKS', 'CHECK_RESULTS', 'checksReadState', 'checksWriteState', 'checksOwn', 'checksPending', 'checksAnswered', 'checksAnswer', 'checksSendAnswer', 'flushChecksQueue'];
function device(store, over){
  const ls = store || {}; const inserts = []; const state = { fail: false, writable: true };
  const g = Object.assign({
    localStorage: { getItem: k => Object.prototype.hasOwnProperty.call(ls, k) ? ls[k] : null, setItem: (k, v) => { ls[k] = String(v); } },
    APP_VERSION: '2.32.189', cloudFamilyId: 'fam', cloudSession: { user: { id: 'u1' } },
    isCloudWriteReady: () => state.writable, buildDebugLogDevice: () => ({}),
    getSupabaseClient: () => ({ from: table => ({ insert: async row => { if(state.fail) return { error: { message: 'x' } }; inserts.push({ table, row }); return { error: null }; } }) }),
    checksSending: false,
  }, over || {});
  const ctx = buildSandbox(g, NAMES);
  return { ctx, ls, inserts, state };
}
const CH = c => j(evalInSandbox(c, 'CHECKS')); // const не виставляється на контекст
const ids = c => CH(c).map(x => x.id);

test('кроки дослівно з макета (checks-data) + 2.32.189-1', () => {
  const data = JSON.parse(MOCK.match(/<script type="application\/json" id="checks-data">([\s\S]*?)<\/script>/)[1]);
  const { ctx } = device();
  const mine = CH(ctx).map(c => ({ id: c.id, rev: c.rev, title: c.title, steps: c.steps, expect: c.expect, reasons: c.reasons }));
  const fixed = mine.filter(c => c.id !== '2.32.189-1');
  assert.deepEqual(fixed, data.map(c => ({ id: c.id, rev: c.rev, title: c.title, steps: c.steps, expect: c.expect, reasons: c.reasons })).map(c => Object.assign({}, c, { reasons: c.reasons.map(r => r.replace('’', '’')) })));
  const last = mine[mine.length - 1];
  assert.equal(last.id, '2.32.189-1'); assert.equal(last.title, 'Екран «Перевірки»');
  assert.deepEqual(last.steps, ['Відкрийте «Сервіс» → «Перевірки».', 'Натисніть «Ок» на першому кроці.']);
  assert.equal(last.expect, 'крок закреслюється й зникає, наступний розгортається.');
  assert.deepEqual(last.reasons, ['не закреслився', 'не зник', 'інше']);
});
test('«Ок» прибирає крок зі списку й створює один запис журналу (scenario check, events [{id,result,reason}])', async () => {
  const d = device(); const first = ids(d.ctx)[0];
  assert.deepEqual(j(d.ctx.checksPending({})).map(c => c.id), ids(d.ctx));
  const st = d.ctx.checksAnswer({}, first, 'ok', null); d.ctx.checksWriteState(st);
  assert.ok(!j(d.ctx.checksPending(d.ctx.checksReadState())).some(c => c.id === first), 'крок зник');
  assert.equal(await d.ctx.checksSendAnswer(first), true);
  assert.equal(d.inserts.length, 1);
  assert.equal(d.inserts[0].table, 'client_debug_logs');
  const r = j(d.inserts[0].row);
  assert.equal(r.scenario, 'check'); assert.equal(r.app_version, '2.32.189'); assert.equal(r.family_id, 'fam'); assert.equal(r.user_id, 'u1');
  assert.deepEqual(r.events, [{ id: first, result: 'ok', reason: null }]);
  assert.equal(await d.ctx.checksSendAnswer(first), false, 'повторно той самий запис не шлеться');
  assert.equal(d.inserts.length, 1);
});
test('«Не ок» без причини (або з чужою причиною) не підтверджується; з причиною зі списку — так', () => {
  const d = device(); const c0 = CH(d.ctx)[0];
  assert.deepEqual(j(d.ctx.checksAnswer({}, c0.id, 'no', null)), {});
  assert.deepEqual(j(d.ctx.checksAnswer({}, c0.id, 'no', 'вигадана')), {});
  const st = j(d.ctx.checksAnswer({}, c0.id, 'no', c0.reasons[1]));
  assert.equal(st[c0.id].r, 'no'); assert.equal(st[c0.id].why, c0.reasons[1]); assert.equal(st[c0.id].sent, false);
  assert.deepEqual(j(d.ctx.checksAnswer({}, 'невідомий', 'ok', null)), {}); assert.deepEqual(j(d.ctx.checksAnswer({}, c0.id, 'x', null)), {});
  assert.deepEqual(j(d.ctx.checksAnswer(st, c0.id, 'ok', null))[c0.id].r, 'no', 'дану відповідь не перезаписує');
});
test('«Пропустити» — відповідь skip: крок зникає, запис без причини', async () => {
  const d = device(); const id = ids(d.ctx)[1];
  d.ctx.checksWriteState(d.ctx.checksAnswer({}, id, 'skip', null));
  assert.ok(!j(d.ctx.checksPending(d.ctx.checksReadState())).some(c => c.id === id));
  await d.ctx.checksSendAnswer(id);
  assert.deepEqual(j(d.inserts[0].row).events, [{ id, result: 'skip', reason: null }]);
});
test('відповідь переживає перезапуск (новий сеанс із тим самим сховищем); без відповіді крок повертається', () => {
  const a = device(); const id = ids(a.ctx)[0];
  a.ctx.checksWriteState(a.ctx.checksAnswer({}, id, 'ok', null));
  const b = device(a.ls);
  assert.ok(!j(b.ctx.checksPending(b.ctx.checksReadState())).some(c => c.id === id));
  assert.equal(j(b.ctx.checksAnswered(b.ctx.checksReadState())).length, 1);
  const cleared = device({});
  assert.ok(j(cleared.ctx.checksPending(cleared.ctx.checksReadState())).some(c => c.id === id), 'без відповіді крок повертається');
  const bad = device({ 'budget-checks-v1': '{зіпсовано' }); assert.deepEqual(j(bad.ctx.checksReadState()), {});
  assert.deepEqual(j(device({ 'budget-checks-v1': '[1]' }).ctx.checksReadState()), {});
  assert.deepEqual(j(device({ 'budget-checks-v1': JSON.stringify({ x: { r: 'ok' } }) }).ctx.checksPending(JSON.parse('{"x":{"r":"ok"}}'))).length, ids(a.ctx).length, 'чужі id ігноруються');
});
test('невдалий insert лишає sent:false; flushChecksQueue надсилає при наступному старті; лише читання нічого не шле', async () => {
  const d = device(); const [i0, i1] = ids(d.ctx);
  d.ctx.checksWriteState(d.ctx.checksAnswer(d.ctx.checksAnswer({}, i0, 'ok', null), i1, 'skip', null));
  d.state.fail = true;
  assert.equal(await d.ctx.checksSendAnswer(i0), false);
  assert.equal(d.ctx.checksReadState()[i0].sent, false);
  d.state.fail = false; d.state.writable = false;
  await d.ctx.flushChecksQueue(); assert.equal(d.inserts.length, 0, 'у режимі лише читання — нічого');
  d.state.writable = true;
  const next = device(d.ls); // «наступний старт»
  await next.ctx.flushChecksQueue();
  assert.equal(next.inserts.length, 2); assert.equal(next.ctx.checksReadState()[i0].sent, true); assert.equal(next.ctx.checksReadState()[i1].sent, true);
  await next.ctx.flushChecksQueue(); assert.equal(next.inserts.length, 2, 'вже надіслане не повторюється');
});
test('недоступне сховище не ламає; відповідь без Cloud-сесії лишається в черзі', async () => {
  const boom = device(null, { localStorage: { getItem(){ throw new Error('x'); }, setItem(){ throw new Error('x'); } } });
  assert.deepEqual(j(boom.ctx.checksReadState()), {}); assert.equal(boom.ctx.checksWriteState({}), false);
  const d = device(); const id = ids(d.ctx)[0]; d.ctx.checksWriteState(d.ctx.checksAnswer({}, id, 'ok', null)); d.state.writable = false;
  assert.equal(await d.ctx.checksSendAnswer(id), false); assert.equal(d.ctx.checksReadState()[id].sent, false);
});
test('джерело: два рядки в «Сервісі», старого чекліста й qa.json у клієнті немає, жодного текстового поля, анімація як у макеті', () => {
  assert.match(SRC, /id="checks-btn" onclick="openChecksDrawer\(\)"/); assert.match(SRC, /id="diagnostics-btn" onclick="openTestingDrawer\(\)"/);
  assert.ok(!/Тестування/.test(SRC.replace(/\/\/.*|\/\*[\s\S]*?\*\/|<!--[\s\S]*?-->/g, '')), 'підпис «Тестування» прибрано з інтерфейсу');
  ['qa.json?v=', 'toggleQaChecklist', 'copyQaResult', 'Скопіювати результат', 'Чекліст перевірки', 'budget-qa-state-v1', 'push-diag-errors-btn'].forEach(n => assert.equal(SRC.indexOf(n), -1, n));
  const checks = SRC.slice(SRC.indexOf('// ===== Rev 2.32.189 (CHECKS-1): «Перевірки»'), SRC.indexOf('// Головний тумблер'));
  assert.ok(!/<input|<textarea|<select|innerHTML\s*=\s*[^c]/.test(checks.replace(/w\.innerHTML = html/, '')), 'жодного поля вводу; innerHTML лише для власних сталих SVG');
  assert.match(SRC, /\.chk-it\.gone\{ max-height:0; opacity:0; border-top-width:0; visibility:hidden; transition:max-height \.35s ease/);
  assert.match(SRC, /\.chk-it\.done \.chk-tt\{ text-decoration:line-through/);
  assert.match(SRC, /\(result === 'skip' \|\| reduce\) \? 50 : 600/);
  assert.match(SRC, /@media \(prefers-reduced-motion: reduce\)\{ \.chk-it, \.chk-it\.gone, \.chk-chev, \.chk-tt, \.chk-sent\{ transition:none; \} \}/);
  assert.match(SRC, /flushChecksQueue\(\); \/\/ Rev 2\.32\.189 \(CHECKS-1\)/, 'повторна спроба при старті');
});
