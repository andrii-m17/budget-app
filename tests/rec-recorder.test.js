// REC-1 (Rev 2.32.260): бортовий самописець — буфер 2 хв, білі списки (приватність), обмеження частоти, надсилання частинами, офлайн-черга, детектори аномалій.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildSandbox, evalInSandbox } = require('./extract');
const HTML = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const PURE = ['REC_WINDOW_MS', 'REC_MAX_EVENTS', 'REC_CHUNK_BYTES', 'REC_CHUNK_EVENTS', 'REC_MAX_REPORT_BYTES', 'REC_RATE_TYPE_MS', 'REC_RATE_PER_DAY', 'REC_QUEUE_MAX', 'REC_MIRROR_KEY', 'REC_QUEUE_KEY', 'REC_RATE_KEY', 'REC_SENT_KEY', 'REC_ALLOWED_TYPES', 'REC_ALLOWED_KEYS',
  'recSanitizeValue', 'recSanitizeEvent', 'recTrim', 'recLimitReport', 'recChunk', 'recReportCode', 'recRateCheck', 'recQueueAdd', 'recDetectSheetJump', 'recFieldHidden'];
function pure(){ return buildSandbox({}, PURE); }
const J = (ctx, expr) => JSON.parse(JSON.stringify(evalInSandbox(ctx, expr)));

test('REC: подія поза списком типів відкидається; ключі лише з білого списку', () => {
  const c = pure();
  c.__ev = { type: 'fields-census', fields: ['x'] };
  assert.equal(evalInSandbox(c, 'recSanitizeEvent(__ev, 1)'), null);
  c.__ev = { type: 'vv-resize', vvH: 479.04, amount: 1234, description: 'кава', email: 'a@b.ua', password: 'x', token: 't', note: 'n', value: '12', fieldValue: 'v' };
  const o = J(c, 'recSanitizeEvent(__ev, 5)');
  assert.deepEqual(o, { type: 'vv-resize', vvH: 479, wall: 5 });
});
test('REC: приватність — очищення рядків (email, uuid, довгі числа) і відсутність заборонених імен ключів', () => {
  const c = pure();
  c.__ev = { type: 'js-error', message: 'Помилка для test.user@mail.com id 3beb9124-9ea8-4cda-a1b8-c6a3fd336367 сума 1 234 567,89', source: 'index.html:10', tab: 'vytraty', count: 1 };
  const o = J(c, 'recSanitizeEvent(__ev, 1)');
  assert.ok(!/@/.test(o.message) && !/3beb9124/.test(o.message) && !/1 234 567/.test(o.message), o.message);
  const keys = J(c, 'REC_ALLOWED_KEYS');
  keys.forEach(k => { if(k === 'message') return; assert.ok(!/amount|sum|descr|name|email|pass|token|note|comment|title|label|placeholder|value|text|secret|phone/i.test(k), 'заборонений ключ: ' + k); });
  const types = J(c, 'REC_ALLOWED_TYPES');
  ['fields-census', 'fields-snapshot', 'suggest-pick', 'suggest-render', 'expense', 'income', 'debt', 'mono-keyword', 'category-rename', 'ui-audit'].forEach(t => assert.ok(types.indexOf(t) === -1, 'тип з даними: ' + t));
  c.__ev = { type: 'sheet-anim', samples: [[0, 780], [16, 790]], rect: { x: 'не дозволено' } };
  const s = J(c, 'recSanitizeEvent(__ev, 1)');
  assert.deepEqual(s.samples, [[0, 780], [16, 790]]);
  assert.ok(!('rect' in s));
});
test('REC: буфер тримає лише останні 2 хв і не більше REC_MAX_EVENTS', () => {
  const c = pure();
  const now = 10000000;
  c.__buf = [{ type: 'vv-resize', wall: now - 130000 }, { type: 'vv-resize', wall: now - 119000 }, { type: 'vv-resize', wall: now - 1000 }];
  assert.equal(evalInSandbox(c, `recTrim(__buf, ${now}, REC_WINDOW_MS, REC_MAX_EVENTS).length`), 2);
  c.__big = Array.from({ length: 2000 }, (_, i) => ({ type: 'touch', wall: now - 100 + i % 50 }));
  assert.equal(evalInSandbox(c, `recTrim(__big, ${now}, REC_WINDOW_MS, REC_MAX_EVENTS).length`), 1200);
  assert.equal(evalInSandbox(c, 'REC_WINDOW_MS'), 120000);
});
test('REC: великий пакет ділиться на частини в межах ліміту рядка БД; порядок і склад збережено', () => {
  const c = pure();
  c.__ev = Array.from({ length: 2400 }, (_, i) => ({ type: 'sheet-anim', wall: i, samples: Array.from({ length: 20 }, (_, k) => [k, 700 + k]), n: i }));
  const parts = J(c, 'recChunk(recLimitReport(__ev, 100000000), REC_CHUNK_BYTES, REC_CHUNK_EVENTS)');
  assert.ok(parts.length > 1, 'частин: ' + parts.length);
  parts.forEach(p => { assert.ok(JSON.stringify(p).length <= 150000, 'розмір ' + JSON.stringify(p).length); assert.ok(p.length <= 600); });
  assert.equal(parts.reduce((n, p) => n + p.length, 0), 2400);
  assert.equal(parts[0][0].n, 0); assert.equal(parts[parts.length - 1].slice(-1)[0].n, 2399);
  const lim = J(c, 'recLimitReport(__ev, REC_MAX_REPORT_BYTES)');
  assert.ok(JSON.stringify(lim).length <= 450000);
  assert.equal(lim[lim.length - 1].n, 2399, 'лишаються найновіші');
});
test('REC: код звіту MT-ММДД-NNNN', () => {
  const c = pure();
  c.__d = new Date(2026, 10, 6);
  assert.equal(evalInSandbox(c, 'recReportCode(__d, 193)'), 'MT-1106-0193');
  assert.match(evalInSandbox(c, 'recReportCode(__d, 4294967295)'), /^MT-1106-\d{4}$/);
});
test('REC: обмеження частоти — один звіт кожного типу за 10 хв і не більше 20 на добу', () => {
  const c = pure();
  const T = 1e9;
  let r = J(c, `recRateCheck([], 'js-error', ${T}, REC_RATE_TYPE_MS, REC_RATE_PER_DAY)`);
  assert.equal(r.allow, true);
  c.__log = r.log;
  assert.equal(J(c, `recRateCheck(__log, 'js-error', ${T + 599000}, REC_RATE_TYPE_MS, REC_RATE_PER_DAY)`).allow, false);
  assert.equal(J(c, `recRateCheck(__log, 'sync-error', ${T + 1000}, REC_RATE_TYPE_MS, REC_RATE_PER_DAY)`).allow, true);
  assert.equal(J(c, `recRateCheck(__log, 'js-error', ${T + 601000}, REC_RATE_TYPE_MS, REC_RATE_PER_DAY)`).allow, true);
  c.__full = Array.from({ length: 20 }, (_, i) => ({ type: 't' + i, at: T - 1000 * i }));
  assert.equal(J(c, `recRateCheck(__full, 'new', ${T + 1}, REC_RATE_TYPE_MS, REC_RATE_PER_DAY)`).allow, false);
  assert.equal(J(c, `recRateCheck(__full, 'new', ${T + 86400001}, REC_RATE_TYPE_MS, REC_RATE_PER_DAY)`).allow, true, 'через добу ліміт скинуто');
});
test('REC: черга звітів — обмежена, без дублікатів за кодом', () => {
  const c = pure();
  c.__q = [{ code: 'A' }, { code: 'B' }];
  assert.deepEqual(J(c, "recQueueAdd(__q, { code: 'B', x: 1 }, 5).map(r => r.code)"), ['A', 'B']);
  c.__q = Array.from({ length: 5 }, (_, i) => ({ code: 'C' + i }));
  assert.deepEqual(J(c, "recQueueAdd(__q, { code: 'N' }, 5).map(r => r.code)"), ['C1', 'C2', 'C3', 'C4', 'N']);
});
test('REC: детектор стрибка листа — відскок >20 пт і назад за 600 мс, а не плавний рух', () => {
  const c = pure();
  const ev = (w, b) => ({ type: 'vv-resize', wall: w, drawerId: 'profile-drawer', drawerBottom: b });
  c.__jump = [ev(0, 780), ev(16, 886), ev(60, 700)]; // реальний запис 2.32.259: 780 → 886 → вгору
  assert.equal(evalInSandbox(c, 'recDetectSheetJump(__jump)'), 'sheet-jump');
  c.__smooth = [ev(0, 780), ev(16, 760), ev(32, 735), ev(48, 700), ev(64, 660)];
  assert.equal(evalInSandbox(c, 'recDetectSheetJump(__smooth)'), null);
  c.__other = [ev(0, 780), { type: 'vv-resize', wall: 16, drawerId: 'other-drawer', drawerBottom: 886 }, ev(60, 700)];
  assert.equal(evalInSandbox(c, 'recDetectSheetJump(__other)'), null);
});
test('REC: поле під клавіатурою', () => {
  const c = pure();
  assert.equal(evalInSandbox(c, 'recFieldHidden(500, 479, 0, 2)'), true);
  assert.equal(evalInSandbox(c, 'recFieldHidden(470, 479, 0, 2)'), false);
  assert.equal(evalInSandbox(c, 'recFieldHidden(900, 479, 330, 2)'), true);
});

// ---- надсилання частинами й черга ----
const RUNTIME = PURE.concat(['recSendParts', 'recSentList', 'recSentSet', 'recDeliver', 'recFlushQueue', 'recQueueLoad', 'recQueueSave', 'recStoreGet', 'recStoreSet']);
function runtime(opts){
  opts = opts || {};
  const store = {}; const idb = {};
  const ls = { getItem: k => Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null, setItem: (k, v) => { store[k] = String(v); } };
  const state = { canSend: !!opts.canSend, rows: [], failAt: opts.failAt == null ? -1 : opts.failAt };
  const ctx = buildSandbox({ localStorage: ls, idbAdapterGet: async k => idb[k], idbAdapterSet: async (k, v) => { idb[k] = v; },
    recCanSend: () => state.canSend, recFlushing: false,
    recInsertRow: async row => { if(state.failAt === state.rows.length){ state.failAt = -1; return { error: new Error('fail') }; } state.rows.push(row); return { error: null }; } }, RUNTIME);
  return { ctx, state, idb, store };
}
function bigReport(code){
  const events = Array.from({ length: 1600 }, (_, i) => ({ type: 'sheet-anim', wall: i, samples: Array.from({ length: 10 }, (_, k) => [k, i]) }));
  return { code: code || 'MT-1106-0001', trigger: 'manual', wall: 1, appVersion: '2.32.260', device: { platform: 'x' }, events, next: 0 };
}
test('REC: надсилання частинами — усі частини з одним кодом, нумерація, scenario incident', async () => {
  const { ctx, state } = runtime({ canSend: true });
  ctx.__r = bigReport();
  const st = await evalInSandbox(ctx, 'recDeliver(__r)');
  assert.equal(st, 'sent');
  assert.ok(state.rows.length > 1);
  state.rows.forEach((r, i) => { assert.equal(r.scenario, 'incident'); assert.equal(r.device.report.code, 'MT-1106-0001'); assert.equal(r.device.report.part, i + 1); assert.equal(r.device.report.parts, state.rows.length); assert.ok(JSON.stringify(r.events).length <= 150000); });
  assert.equal(state.rows.reduce((n, r) => n + r.events.length, 0), 1600);
  assert.equal(J(ctx, 'recSentList()')[0].status, 'sent');
});
test('REC: збій на другій частині — звіт у черзі з позицією; після відновлення дошле лише решту', async () => {
  const { ctx, state, idb } = runtime({ canSend: true, failAt: 1 });
  ctx.__r = bigReport('MT-1106-0002');
  assert.equal(await evalInSandbox(ctx, 'recDeliver(__r)'), 'queued');
  assert.equal(state.rows.length, 1);
  const q = JSON.parse(idb['budget-rec-queue-v1']);
  assert.equal(q.length, 1); assert.equal(q[0].next, 1);
  await evalInSandbox(ctx, 'recFlushQueue()');
  assert.ok(state.rows.length > 1);
  assert.equal(state.rows[1].device.report.part, 2, 'першу частину повторно не шлемо');
  assert.deepEqual(JSON.parse(idb['budget-rec-queue-v1']), []);
  assert.equal(J(ctx, 'recSentList()')[0].status, 'sent');
});
test('REC: без мережі звіт стає в чергу, нічого не шлеться; після появи мережі черга відправляється', async () => {
  const { ctx, state, idb } = runtime({ canSend: false });
  ctx.__r = bigReport('MT-1106-0003');
  assert.equal(await evalInSandbox(ctx, 'recDeliver(__r)'), 'queued');
  assert.equal(state.rows.length, 0);
  assert.equal(JSON.parse(idb['budget-rec-queue-v1']).length, 1);
  assert.equal(J(ctx, 'recSentList()')[0].status, 'queued');
  state.canSend = true;
  await evalInSandbox(ctx, 'recFlushQueue()');
  assert.ok(state.rows.length > 1);
  assert.equal(JSON.parse(idb['budget-rec-queue-v1']).length, 0);
});

// ---- інтеграція в index.html (текстова охорона) ----
test('REC: pushDebugEvent у фоновому режимі веде в буфер самописця; джерела подій використовують recOn()', () => {
  assert.match(HTML, /if\(!debugRecordingActive\)\{ if\(recBgOn\) recPush\(raw\); return; \}/);
  assert.match(HTML, /function syncDiag\(type, data\)\{\s*\n\s*if\(!recOn\(\)\) return;/);
  assert.match(HTML, /recBgStart\(\); \}\); else recBgStart\(\);/);
  assert.match(HTML, /recTrigger\('push-no-open'\)/);
  assert.match(HTML, /recTrigger\('sync-error'\)/);
  assert.match(HTML, /recTrigger\('js-error'\)/);
  assert.match(HTML, /recTrigger\('field-hidden'\)/);
});

test('REC (spec-reviewer): js-error — у звіт іде лише клас помилки, текст з назвами й сумами відкидається', () => {
  const c = pure();
  c.__ev = { type: 'js-error', message: "TypeError: Cannot read properties of undefined (reading 'Кава у Сільпо') 1500", source: 'index.html:10', stackTop: ['fn'], count: 1 };
  const o = J(c, 'recSanitizeEvent(__ev, 1)');
  assert.equal(o.message, 'TypeError');
  c.__ev = { type: 'js-error', message: 'Сума 1500 грн не вдалась', source: 'a.js:1' };
  assert.equal(J(c, 'recSanitizeEvent(__ev, 1)').message, 'Error');
  c.__ev = { type: 'js-error', message: 'Unhandled rejection: Кава', source: '' };
  assert.equal(J(c, 'recSanitizeEvent(__ev, 1)').message, 'Unhandled rejection');
});
test('REC (spec-reviewer): ліміт частоти має запас у пам\'яті, кнопка обмежена, вихід очищає самописець', () => {
  assert.match(HTML, /recRateMem = rl\.log;/);
  assert.match(HTML, /recRateCheck\(\(recStoreGet\(REC_RATE_KEY\) \|\| \[\]\)\.concat\(recRateMem\)\.filter\(function\(r\)\{ return r\.type === 'manual'; \}\), 'manual', Date\.now\(\), 15000, 30\)/);
  assert.match(HTML, /try\{ recClearOnSignOut\(\); \}catch\(e\)\{\}/);
});
test('REC (KB-9): kb-geometry з vv-settled / rest-settled — висота й положення листа, без значень полів', () => {
  const c = pure();
  c.__ev = { type: 'kb-geometry', kbgWhy: 'vv-settled', devClass: 'iPhone', sheetTop: 0, sheetBottom: 498, sheetHeight: 498, fieldTop: 380, fieldBottom: 420, kbHeightCalc: 388, drawerId: 'mono-detail-drawer', drawerScrollHeight: 575, drawerClientHeight: 498, viewportMeta: 'width=device-width', inputValue: '1234' };
  const o = J(c, 'recSanitizeEvent(__ev, 1)');
  assert.equal(o.type, 'kb-geometry'); assert.equal(o.sheetHeight, 498); assert.equal(o.drawerScrollHeight, 575); assert.equal(o.kbgWhy, 'vv-settled');
  assert.ok(!('viewportMeta' in o) && !('inputValue' in o));
  assert.match(HTML, /recordKbGeometry\('vv-settled'\)/);
  assert.match(HTML, /recordKbGeometry\('rest-settled'\)/);
});
test('REC (KB-10): kb-geometry несе положення прокрутки листа й блоку прикріплених кнопок', () => {
  const c = pure();
  c.__ev = { type: 'kb-geometry', kbgWhy: 'vv-settled', drawerId: 'mono-detail-drawer', drawerScrollHeight: 581, drawerClientHeight: 498, drawerScrollTop: 148, actionsTop: 360, actionsBottom: 498 };
  const o = J(c, 'recSanitizeEvent(__ev, 1)');
  assert.equal(o.drawerScrollTop, 148); assert.equal(o.actionsTop, 360); assert.equal(o.actionsBottom, 498);
  assert.match(HTML, /kbStickyBarOf\(d\)/);
});
test('REC (KB-12): sheet-anim close несе покадрові семпли scrollTop, таб-бару й підложки (samplesExt)', () => {
  const c = pure();
  c.__ev = { type: 'sheet-anim', phase: 'close', drawerId: 'mono-detail-drawer', samples: [[0, 365], [16, 402]], samplesExt: [[0, 48, 798, 0, 100], [16, 48, 798, 0, 92]] };
  const o = J(c, 'recSanitizeEvent(__ev, 1)');
  assert.deepEqual(o.samplesExt, [[0, 48, 798, 0, 100], [16, 48, 798, 0, 92]]);
  assert.match(HTML, /samplesExt: phase === 'close' \? downsampleSheetAnimPairs\(samplesExt, 30\) : undefined/);
});
