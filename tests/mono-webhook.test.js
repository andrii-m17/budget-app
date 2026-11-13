// MONO-ACC: тести mono-webhook (стійкість до зміни рахунку, добір пропущеного) на моках бази й банку.
// Логіка живе в supabase/functions/_shared/*.ts; Node виконує .ts напряму. Лише синтетичні дані.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { makeWorld, json, stmtItem, NOW0, SECRET, TOKEN } = require('./mono-mock.js');

const SHARED = path.join(__dirname, '..', 'supabase', 'functions', '_shared');
const HOOK = 'ab'.repeat(32);
const HASH = crypto.createHash('sha256').update(HOOK).digest('hex');
const OLD = 'ACC-OLD-0001', NEW = 'ACC-NEW-0002', PAN = '1111********2222';
let W, M;
test.before(async function () {
  W = await import(pathToFileURL(path.join(SHARED, 'webhook.ts')).href);
  M = await import(pathToFileURL(path.join(SHARED, 'mono.ts')).href);
});

async function world(o) {
  const ct = await M.encryptToken(TOKEN, 'user-1', SECRET);
  const w = makeWorld(Object.assign({ ct: ct, hash: HASH }, o || {}));
  w.addAccount(OLD);
  return w;
}
function ev(account, id, o) {
  return { type: 'StatementItem', data: { account: account, statementItem: stmtItem(id, o) } };
}
function req(body, method, hook) {
  const init = { method: method || 'POST' };
  if (init.method === 'POST') init.body = typeof body === 'string' ? body : JSON.stringify(body);
  return new Request('https://x.test/functions/v1/mono-webhook/' + (hook || HOOK), init);
}
function clientInfo(accounts) { return function () { return json({ accounts: accounts, jars: [] }); }; }
const sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };

test('M1: звичайна подія: 1 звернення до бази, 0 до банку, 200', async function () {
  const w = await world();
  const res = await W.handleWebhook(req(ev(OLD, 'T1')), w.deps());
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { result: 'new' });
  assert.equal(w.calls.length, 1);
  assert.equal(w.fetches.length, 0);
  assert.equal(w.bg.length, 0);
  assert.equal(w.notified, 1);
});

test('нове число тієї самої картки: зараховано, перемикач успадковано, M4/M5/M2', async function () {
  const w = await world();
  ['S1', 'S2', 'S3', 'S4', 'S5'].forEach(function (t) { w.addInbox(t, OLD); });
  let release; const gate = new Promise(function (r) { release = r; });
  w.bank.clientInfo = async function () { await gate; return json({ accounts: [{ id: NEW, maskedPan: [PAN], type: 'black', currencyCode: 980 }], jars: [] }); };
  w.bank.statement = function () { return json([stmtItem('N1'), stmtItem('B1'), stmtItem('B2')]); };
  const first = await Promise.race([W.handleWebhook(req(ev(NEW, 'N1')), w.deps()), sleep(1000).then(function () { return 'slow'; })]);
  assert.notEqual(first, 'slow', 'M5: відповідь вебхука не чекає банк');
  assert.equal(first.status, 200);
  assert.equal(w.fetchCount('/personal/statement/'), 0, 'до відповіді банк ще не питали про виписку');
  release(); await w.drain();
  assert.equal(w.fetchCount('/personal/client-info'), 1);
  assert.equal(w.fetches[0].token, TOKEN, 'токен розшифровано правильно');
  assert.deepEqual(w.calls.map(function (c) { return c.name; }), ['mono_webhook_ingest', 'mono_apply_accounts', 'mono_webhook_ingest', 'mono_ingest_batch']);
  assert.equal(w.calls[1].args.p_mark_backfill, false);
  assert.equal(w.calls[2].args.p_after_refresh, true);
  assert.equal(w.accounts.has(OLD), false, 'старий запис видалено');
  assert.equal(w.accounts.get(NEW).tracked, true, 'перемикач успадковано');
  assert.equal(w.notified, 1, 'сповіщення про подію одне; добір без сповіщень');
  assert.equal(w.inbox.size, 5 + 3, 'старі рядки «Вхідних» лишились, додано N1, B1, B2');
  assert.equal(w.fetchCount('/personal/statement/' + NEW), 1, 'M3: одна виписка');
  assert.equal(w.conn.last_error, null);
  assert.equal(w.accounts.get(NEW).backfill_from, null);
});

test('вимкнений рахунок зі списку банку: untracked, без запитів до банку', async function () {
  const w = await world();
  w.addAccount('ACC-FOP-0003', { tracked: false, type: 'fop' });
  const res = await W.handleWebhook(req(ev('ACC-FOP-0003', 'F1')), w.deps());
  assert.deepEqual(await res.json(), { result: 'untracked' });
  assert.equal(w.calls.length, 1); assert.equal(w.fetches.length, 0);
  assert.equal(w.conn.last_error, null);
  assert.equal(w.conn.last_event_at, new Date(NOW0 - 4 * 86400000).toISOString(), 'точка добору не зсунулась');
});

test('чужий рахунок: last_error, наступний client-info не раніше ніж за 60 хв', async function () {
  const w = await world();
  w.bank.clientInfo = clientInfo([{ id: OLD, maskedPan: [PAN], type: 'black', currencyCode: 980 }]);
  await W.handleWebhook(req(ev('ACC-ALIEN-0009', 'A1')), w.deps()); await w.drain();
  assert.equal(w.conn.last_error, 'unknown_account');
  assert.equal(w.fetchCount('/personal/client-info'), 1);
  w.now += 10 * 60000;
  await W.handleWebhook(req(ev('ACC-ALIEN-0009', 'A2')), w.deps()); await w.drain();
  assert.equal(w.fetchCount('/personal/client-info'), 1, 'M2: не частіше разу на годину');
  w.now += 61 * 60000;
  await W.handleWebhook(req(ev('ACC-ALIEN-0009', 'A3')), w.deps()); await w.drain();
  assert.equal(w.fetchCount('/personal/client-info'), 2);
});

test('last_error знімається, коли рахунок з’явився', async function () {
  const w = await world();
  w.conn.last_error = 'unknown_account';
  const res = await W.handleWebhook(req(ev(OLD, 'T9')), w.deps());
  assert.equal(res.status, 200);
  assert.equal(w.conn.last_error, null);
});

test('одночасність: дві події з невідомого рахунку дають один client-info', async function () {
  const w = await world();
  w.bank.clientInfo = clientInfo([{ id: NEW, maskedPan: [PAN], type: 'black', currencyCode: 980 }]);
  w.bank.statement = function () { return json([stmtItem('C1'), stmtItem('C2')]); };
  const rs = await Promise.all([W.handleWebhook(req(ev(NEW, 'C1')), w.deps()), W.handleWebhook(req(ev(NEW, 'C2')), w.deps())]);
  assert.deepEqual(rs.map(function (r) { return r.status; }), [200, 200]);
  await w.drain();
  assert.equal(w.fetchCount('/personal/client-info'), 1);
  assert.equal(w.fetchCount('/personal/statement/'), 1, 'один добір');
  assert.ok(w.inbox.has('C1') && w.inbox.has('C2'), 'обидві операції в тому числі друга, дібрана виписком');
});

test('добір: 30 операцій, 5 уже є: додано 25, 0 сповіщень, повтор додає 0', async function () {
  const w = await world();
  w.accounts.get(OLD).backfill_from = new Date(NOW0 - 4 * 86400000).toISOString();
  const items = []; for (let i = 0; i < 30; i++) items.push(stmtItem('G' + i));
  for (let i = 0; i < 5; i++) w.addInbox('G' + i, OLD);
  w.bank.statement = function () { return json(items); };
  await W.handleWebhook(req(ev(OLD, 'G0')), w.deps()); await w.drain();
  const batch = w.calls.filter(function (c) { return c.name === 'mono_ingest_batch'; });
  assert.equal(batch.length, 1);
  assert.equal(w.inbox.size, 30);
  assert.equal(w.notified, 0);
  assert.equal(w.fetchCount('/personal/statement/'), 1);
  await W.handleWebhook(req(ev(OLD, 'G1')), w.deps()); await w.drain();
  assert.equal(w.fetchCount('/personal/statement/'), 1, 'повторний запуск не питає банк');
  assert.equal(w.inbox.size, 30);
});

test('виписка рівно з 500 записів: усе передано одним пакетом, partial у журналі', async function () {
  const w = await world();
  w.accounts.get(OLD).backfill_from = new Date(NOW0 - 86400000).toISOString();
  const items = []; for (let i = 0; i < 500; i++) items.push(stmtItem('P' + i));
  w.bank.statement = function () { return json(items); };
  await W.handleWebhook(req(ev(OLD, 'P0')), w.deps()); await w.drain();
  const b = w.calls.find(function (c) { return c.name === 'mono_ingest_batch'; });
  assert.equal(b.args.p_items.length, 500);
  assert.ok(w.events.some(function (e) { return e.kind === 'backfill' && /^partial/.test(e.result); }));
  assert.equal(w.inbox.size, 500);
});

test('невірні дані: 200, запис у журналі, без винятків і без запитів до банку', async function () {
  const bodies = ['', '{bad', JSON.stringify({ type: 'Other' }), JSON.stringify({ type: 'StatementItem', data: { statementItem: stmtItem('X1') } }),
    JSON.stringify(ev(OLD, 'X2', { amount: 'abc' })), JSON.stringify({ type: 'StatementItem', data: { account: OLD, statementItem: 'str' } })];
  for (const b of bodies) {
    const w = await world();
    const res = await W.handleWebhook(req(b), w.deps());
    assert.equal(res.status, 200, 'тіло: ' + b.slice(0, 20));
    assert.equal(w.calls.length, 1); assert.equal(w.fetches.length, 0); assert.equal(w.bg.length, 0);
    assert.equal(w.events.length, 1); assert.equal(w.events[0].result, 'invalid');
  }
});

test('невідома адреса: 404 без звернень до банку; сміття в шляху: 404 без звернень до бази; GET-перевірка: 200', async function () {
  const w = await world();
  const r1 = await W.handleWebhook(req(ev(OLD, 'T1'), 'POST', 'cd'.repeat(32)), w.deps());
  assert.equal(r1.status, 404); assert.equal(w.fetches.length, 0);
  const r2 = await W.handleWebhook(req(ev(OLD, 'T1'), 'POST', 'not-a-hash'), w.deps());
  assert.equal(r2.status, 404); assert.equal(w.calls.length, 1);
  const r3 = await W.handleWebhook(req(null, 'GET'), w.deps());
  assert.equal(r3.status, 200);
  assert.deepEqual(w.calls[w.calls.length - 1].args.p_item, { probe: true });
  assert.deepEqual(w.events[w.events.length - 1], { kind: 'probe', result: 'ok', tail: '' });
  const r3b = await W.handleWebhook(req(null, 'GET', 'cd'.repeat(32)), w.deps());
  assert.equal(r3b.status, 404, 'GET невідомого хеша');
  const before = w.events.length;
  const r3c = await W.handleWebhook(req({ type: 'StatementItem', data: { account: OLD, statementItem: Object.assign(stmtItem('PR1'), { probe: true }) } }), w.deps());
  assert.equal(r3c.status, 200);
  assert.notEqual(w.calls[w.calls.length - 1].args.p_item.probe, true, 'probe у тілі POST не проходить');
  assert.equal(w.events[before].kind, 'statement');
  const r4 = await W.handleWebhook(req(null, 'DELETE'), w.deps());
  assert.equal(r4.status, 405);
});

test('помилка бази: 500, щоб банк повторив', async function () {
  const w = await world(); w.failRpc.mono_webhook_ingest = true;
  const res = await W.handleWebhook(req(ev(OLD, 'T1')), w.deps());
  assert.equal(res.status, 500);
});

test('банк недоступний під час оновлення: вебхук 200, другого ingest немає, подія не зникає з журналу', async function () {
  const cases = [
    ['429', function () { return json({}, 429); }, 'refresh_bank_429'],
    ['5xx', function () { return json({}, 503); }, 'refresh_bank_5xx'],
    ['timeout', function () { throw new DOMException('x', 'AbortError'); }, 'refresh_bank_timeout'],
    ['empty', function () { return json({ accounts: [], jars: [] }); }, 'refresh_empty'],
  ];
  for (const c of cases) {
    const w = await world(); w.bank.clientInfo = c[1];
    const res = await W.handleWebhook(req(ev(NEW, 'N1')), w.deps());
    assert.equal(res.status, 200, c[0]);
    await w.drain();
    assert.deepEqual(w.calls.map(function (x) { return x.name; }), ['mono_webhook_ingest'], c[0]);
    assert.ok(w.logs.indexOf(c[2]) >= 0, c[0] + ' ' + w.logs.join());
    assert.equal(w.accounts.has(OLD), true, 'нічого не видалено');
  }
});

test('банк недоступний під час добору: позначку повернуто, повтор на наступній події', async function () {
  const bf = new Date(NOW0 - 3 * 86400000).toISOString();
  const cases = [['429', function () { return json({}, 429); }, 'bank_429'], ['5xx', function () { return json({}, 502); }, 'bank_5xx'],
    ['timeout', function () { throw new DOMException('x', 'AbortError'); }, 'bank_timeout'], ['not-array', function () { return json({ errorDescription: 'x' }); }, 'bank_bad_response']];
  for (const c of cases) {
    const w = await world(); w.accounts.get(OLD).backfill_from = bf; w.bank.statement = c[1];
    const res = await W.handleWebhook(req(ev(OLD, 'R1')), w.deps());
    assert.equal(res.status, 200, c[0]);
    await w.drain();
    const rel = w.calls.filter(function (x) { return x.name === 'mono_backfill_release'; });
    assert.equal(rel.length, 1, c[0]);
    assert.equal(rel[0].args.p_reason, c[2]);
    assert.equal(rel[0].args.p_from, bf);
    assert.equal(w.count('mono_ingest_batch'), 0);
    assert.equal(w.accounts.get(OLD).backfill_from, bf, 'позначка повернулась');
    w.bank.statement = function () { return json([stmtItem('R1'), stmtItem('R2')]); };
    await W.handleWebhook(req(ev(OLD, 'R3')), w.deps()); await w.drain();
    assert.equal(w.count('mono_ingest_batch'), 1, 'повтор на наступній події: ' + c[0]);
    assert.equal(w.accounts.get(OLD).backfill_from, null);
  }
});

test('помилка розшифрування токена й помилка пакетного запису повертають позначку', async function () {
  const bf = new Date(NOW0 - 3 * 86400000).toISOString();
  const w = await world(); w.accounts.get(OLD).backfill_from = bf; w.conn.token_ciphertext = 'v1.AAAA.BBBB';
  await W.handleWebhook(req(ev(OLD, 'D1')), w.deps()); await w.drain();
  assert.equal(w.calls.find(function (x) { return x.name === 'mono_backfill_release'; }).args.p_reason, 'decrypt_error');
  assert.equal(w.fetches.length, 0);
  const w2 = await world(); w2.accounts.get(OLD).backfill_from = bf; w2.failRpc.mono_ingest_batch = true;
  w2.bank.statement = function () { return json([stmtItem('D2')]); };
  await W.handleWebhook(req(ev(OLD, 'D3')), w2.deps()); await w2.drain();
  assert.equal(w2.calls.find(function (x) { return x.name === 'mono_backfill_release'; }).args.p_reason, 'db_error');
  assert.equal(w2.accounts.get(OLD).backfill_from, bf);
});

test('числовий номер рахунку в події теж добирається; невдале повернення позначки логується', async function () {
  const w = await world(); w.addAccount('12345'); w.accounts.get('12345').backfill_from = new Date(NOW0 - 86400000).toISOString();
  w.bank.statement = function () { return json([stmtItem('Z1')]); };
  const body = { type: 'StatementItem', data: { account: 12345, statementItem: stmtItem('Z0') } };
  await W.handleWebhook(req(body), w.deps()); await w.drain();
  assert.equal(w.fetches[0].path.indexOf('/personal/statement/12345/'), 0);
  assert.equal(w.count('mono_ingest_batch'), 1);
  const w2 = await world(); w2.accounts.get(OLD).backfill_from = new Date(NOW0 - 86400000).toISOString();
  w2.bank.statement = function () { return json({}, 429); }; w2.failRpc.mono_backfill_release = true;
  await W.handleWebhook(req(ev(OLD, 'Z2')), w2.deps()); await w2.drain();
  assert.ok(w2.logs.indexOf('release_failed') >= 0);
});

test('виняток у фоні між отриманням позначки й запитом виписки: release викликано рівно один раз', async function () {
  const bf = new Date(NOW0 - 2 * 86400000).toISOString();
  // (а) виняток у d.now() (до запиту виписки)
  const w = await world(); w.accounts.get(OLD).backfill_from = bf;
  w.bank.statement = function () { return json([]); };
  const d = w.deps(); d.now = function () { throw new Error('boom'); };
  await W.handleWebhook(req(ev(OLD, 'E1')), d); await w.drain();
  assert.equal(w.count('mono_backfill_release'), 1);
  assert.equal(w.calls.find(function (x) { return x.name === 'mono_backfill_release'; }).args.p_reason, 'exception');
  assert.equal(w.fetches.length, 0); assert.equal(w.count('mono_ingest_batch'), 0);
  assert.equal(w.accounts.get(OLD).backfill_from, bf);
  // (б) виняток після оновлення рахунків: позначку повернув повторний ingest, а fetch виписки кидає виняток
  const w2 = await world();
  w2.bank.clientInfo = clientInfo([{ id: NEW, maskedPan: [PAN], type: 'black', currencyCode: 980 }]);
  w2.bank.statement = function () { throw new Error('boom'); };
  w2.fetch = async function (url, init) { if (String(url).indexOf('/statement/') > 0) throw new TypeError('network'); return w2.bank.clientInfo(); };
  const d2 = w2.deps(); d2.fetch = w2.fetch;
  await W.handleWebhook(req(ev(NEW, 'E2')), d2); await w2.drain();
  assert.equal(w2.count('mono_backfill_release'), 1);
  assert.ok(w2.accounts.get(NEW).backfill_from, 'позначка повернута на рахунок');
  // (в) виняток самого rpc виписки (пакетний запис кидає) теж повертає позначку
  const w3 = await world(); w3.accounts.get(OLD).backfill_from = bf; w3.bank.statement = function () { return json([stmtItem('E3')]); };
  const d3 = w3.deps(); const orig = d3.rpc; d3.rpc = function (n, a) { if (n === 'mono_ingest_batch') throw new Error('boom'); return orig(n, a); };
  await W.handleWebhook(req(ev(OLD, 'E4')), d3); await w3.drain();
  assert.equal(w3.count('mono_backfill_release'), 1);
});

test('межі часу: початок на 1 год раніше позначки, не старше 2 682 000 с; to = зараз', async function () {
  const nowSec = Math.floor(NOW0 / 1000);
  const recent = new Date(NOW0 - 4 * 86400000).toISOString();
  assert.deepEqual(M.statementWindow(recent, NOW0), { from: Math.floor(Date.parse(recent) / 1000) - 3600, to: nowSec });
  const old = new Date(NOW0 - 40 * 86400000).toISOString();
  assert.deepEqual(M.statementWindow(old, NOW0), { from: nowSec - 2682000, to: nowSec });
  const edge = new Date(NOW0 - 2682000 * 1000 + 600 * 1000).toISOString();
  assert.equal(M.statementWindow(edge, NOW0).from, nowSec - 2682000, 'позначка − 1 год вийшла б за максимум');
  assert.equal(M.statementWindow('not-a-date', NOW0), null);
  const w = await world(); w.accounts.get(OLD).backfill_from = old;
  w.bank.statement = function () { return json([]); };
  await W.handleWebhook(req(ev(OLD, 'W1')), w.deps()); await w.drain();
  assert.equal(w.fetches[0].path, '/personal/statement/' + OLD + '/' + (nowSec - 2682000) + '/' + nowSec);
});

test('M6: у журналі й відповідях немає токена та повного номера рахунку', async function () {
  const w = await world();
  w.bank.clientInfo = function () { return json({}, 429); };
  const texts = [];
  const r1 = await W.handleWebhook(req(ev(NEW, 'N1')), w.deps()); texts.push(await r1.text());
  const w2 = await world(); w2.accounts.get(OLD).backfill_from = new Date(NOW0 - 86400000).toISOString(); w2.bank.statement = function () { return json({}, 500); };
  const r2 = await W.handleWebhook(req(ev(OLD, 'N2')), w2.deps()); texts.push(await r2.text());
  await w.drain(); await w2.drain();
  const all = texts.concat(w.logs, w2.logs, w.events.map(function (e) { return JSON.stringify(e); }), w2.events.map(function (e) { return JSON.stringify(e); })).join('\n');
  [TOKEN, NEW, OLD, SECRET, HOOK, HASH].forEach(function (s) { assert.equal(all.indexOf(s), -1, 'витік: ' + s.slice(0, 8)); });
});

test('формат шифртексту не змінився: розшифровує те, що зашифрував попередній алгоритм', async function () {
  const aad = 'user-xyz';
  const digest = await crypto.webcrypto.subtle.digest('SHA-256', new TextEncoder().encode(SECRET));
  const key = await crypto.webcrypto.subtle.importKey('raw', digest, 'AES-GCM', false, ['encrypt', 'decrypt']);
  const iv = crypto.webcrypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.webcrypto.subtle.encrypt({ name: 'AES-GCM', iv: iv, additionalData: new TextEncoder().encode(aad) }, key, new TextEncoder().encode(TOKEN)));
  const packed = 'v1.' + Buffer.from(iv).toString('base64') + '.' + Buffer.from(ct).toString('base64');
  assert.equal(await M.decryptToken(packed, aad, SECRET), TOKEN);
  const mine = await M.encryptToken(TOKEN, aad, SECRET);
  assert.match(mine, /^v1\.[A-Za-z0-9+/=]+\.[A-Za-z0-9+/=]+$/);
  assert.equal(await M.decryptToken(mine, aad, SECRET), TOKEN);
  await assert.rejects(M.decryptToken(mine, 'other', SECRET));
  await assert.rejects(M.encryptToken(TOKEN, aad, 'short'));
});

test('buildAccountRows: картки й банки, очищення рядків, порожні id відкидаються', function () {
  const rows = M.buildAccountRows({
    accounts: [{ id: 'A1', maskedPan: ['11<b>11****2222'], type: 'black', currencyCode: 980 }, { id: '', type: 'x' }, { id: 'A2', type: 'fop', currencyCode: 'bad' }],
    jars: [{ id: 'J1', title: 'Jar <x>', currencyCode: 980 }],
  });
  assert.deepEqual(rows[0], { id: 'A1', masked_pan: '11  11****2222', type: 'black', currency_code: 980, is_jar: false });
  assert.deepEqual(rows[1], { id: 'A2', masked_pan: '', type: 'fop', currency_code: null, is_jar: false });
  assert.deepEqual(rows[2], { id: 'J1', masked_pan: 'Jar  x', type: 'jar', currency_code: 980, is_jar: true });
  assert.equal(rows.length, 3);
  assert.deepEqual(M.buildAccountRows(null), []);
});

test('monoFetch: тайм-аут перериває запит', async function () {
  const slow = function (_u, init) { return new Promise(function (_r, rej) { init.signal.addEventListener('abort', function () { rej(new DOMException('x', 'AbortError')); }); }); };
  await assert.rejects(M.monoFetch('/p', TOKEN, undefined, { timeoutMs: 20, fetchImpl: slow }), function (e) { return M.failureReason(e) === 'bank_timeout'; });
  assert.equal(M.failureReason(429), 'bank_429'); assert.equal(M.failureReason(503), 'bank_5xx'); assert.equal(M.failureReason(404), 'bank_404');
});
