// Rev 2.32.189/190 (CHECKS-1/2): «Перевірки»: «Працює» пише ok і прибирає крок; «Не працює» без причини і «Інше» без тексту нічого не пишуть; «Не можу перевірити зараз» + причина переносить крок у кінець і пише defer;
// скасування (повторний дотик, дотик поза кроком, згортання); закінчення терміну (expired); відповідь переживає перезапуск; черга журналу; поле «Інше» з абстрактним id.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildSandbox, evalInSandbox } = require('./extract');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const MOCK = fs.readFileSync(path.join(__dirname, '..', 'docs', 'ui', 'mockups', 'checks-mockup.html'), 'utf8');
const j = v => JSON.parse(JSON.stringify(v));
const NAMES = ['CHECKS_SHARED_KEY', 'CHECKS_SHARED_MIN_MS', 'checksReadShared', 'checksWriteShared', 'checksSharedMap', 'checksRefreshShared', 'checksClosedBy', 'CHECKS_STATE_KEY', 'CHECKS_OUTBOX_KEY', 'CHECKS_OTHER', 'CHECKS_DEFER_REASONS', 'CHECKS_NOTE_MAX', 'CHECKS_EXPIRE_DAYS', 'CHECKS', 'checksReadState', 'checksWriteState', 'checksReadOutbox', 'checksWriteOutbox',
  'checksOwn', 'checksIsFinal', 'checksIsExpired', 'checksPending', 'checksAnswered', 'checksReasonsFor', 'checksNormalize', 'checksAnswer', 'checksCommit', 'flushChecksQueue', 'checksResetItem'];
function device(store, over, version){
  const ls = store || {}; const inserts = []; const state = { fail: false, writable: true };
  const g = Object.assign({
    localStorage: { getItem: k => Object.prototype.hasOwnProperty.call(ls, k) ? ls[k] : null, setItem: (k, v) => { ls[k] = String(v); } },
    APP_VERSION: version || '2.32.190', cloudFamilyId: 'fam', cloudSession: { user: { id: 'u1' } },
    isCloudWriteReady: () => state.writable, buildDebugLogDevice: () => ({}),
    getSupabaseClient: () => ({ from: table => ({ insert: async row => { if(state.fail) return { error: { message: 'x' } }; inserts.push({ table, row }); return { error: null }; } }) }),
    checksSending: false,
  }, over || {});
  return { ctx: buildSandbox(g, NAMES), ls, inserts, state };
}
const CH = c => j(evalInSandbox(c, 'CHECKS')); // const не виставляється на контекст
const ids = c => CH(c).map(x => x.id);
const pend = (d, v) => j(d.ctx.checksPending(d.ctx.checksReadState(), v)).map(x => x.id);
const FRESH = '2.32.189'; // версія, за якої жоден крок ще не прострочений (різниця ≤ 3 від 2.32.186)

test('кроки дослівно з макета v2 (checks-data) без «Інше» + 2.32.189-1; «Інше» додається завжди останнім', () => {
  const data = JSON.parse(MOCK.match(/<script type="application\/json" id="checks-data">([\s\S]*?)<\/script>/)[1]);
  const { ctx } = device();
  const mine = CH(ctx).filter(c => c.id !== '2.32.189-1' && !c.id.startsWith('2.32.193-') && !c.id.startsWith('2.32.196-') && !c.id.startsWith('2.32.200-') && !c.id.startsWith('2.32.202-') && !c.id.startsWith('2.32.203-'));
  assert.deepEqual(mine.map(({ addedOn, ...c }) => c), data.map(c => ({ id: c.id, rev: c.rev, title: c.title, steps: c.steps, expect: c.expect, reasons: c.reasons })));
  CH(ctx).forEach(c => assert.ok(!c.reasons.includes('Інше')));
  const last = CH(ctx).find(c => c.id === '2.32.189-1');
  assert.deepEqual(CH(ctx).filter(c => c.id.startsWith('2.32.193-')).map(c => c.title), ['Різні поля зливаються', 'Те саме поле', 'Повернути моє', 'Відкрита шторка']);
  assert.equal(last.id, '2.32.189-1'); assert.equal(last.title, 'Екран «Перевірки»'); assert.deepEqual(last.reasons, ['Не закреслився', 'Не зник']);
  assert.deepEqual(j(ctx.checksReasonsFor(CH(ctx)[0])), ["Не з'явилась", 'Не той колір', 'Інше']);
  assert.deepEqual(j(evalInSandbox(ctx, 'CHECKS_DEFER_REASONS')), ['Не зрозумів крок', 'Немає змоги зараз', 'Немає часу']);
});
test('«Працює» записує ok, прибирає крок зі списку й шле один insert (scenario check, events [{id,result,reason,note}])', async () => {
  const d = device(null, null, FRESH); const first = ids(d.ctx)[0];
  assert.equal(d.ctx.checksCommit(first, 'ok'), true);
  assert.ok(!pend(d, FRESH).includes(first), 'крок зник');
  assert.equal(d.ctx.checksReadState()[first].r, 'ok');
  assert.equal(await d.ctx.flushChecksQueue(), true);
  assert.equal(d.inserts.length, 1); assert.equal(d.inserts[0].table, 'client_debug_logs');
  const r = j(d.inserts[0].row);
  assert.equal(r.scenario, 'check'); assert.equal(r.app_version, FRESH); assert.equal(r.family_id, 'fam'); assert.equal(r.user_id, 'u1');
  assert.deepEqual(r.events, [{ id: first, result: 'ok', reason: null, note: null }]);
  assert.equal(d.ctx.checksCommit(first, 'ok'), false, 'остаточну відповідь не повторює');
  assert.equal(await d.ctx.flushChecksQueue(), false); assert.equal(d.inserts.length, 1);
});
test('«Не працює» без причини (або з чужою) нічого не пише; з причиною зі списку — пише no + reason', () => {
  const d = device(null, null, FRESH); const c0 = CH(d.ctx)[0];
  [null, undefined, '', 'вигадана'].forEach(r => assert.equal(d.ctx.checksCommit(c0.id, 'no', r), false));
  assert.deepEqual(j(d.ctx.checksReadState()), {}); assert.deepEqual(j(d.ctx.checksReadOutbox()), []);
  assert.equal(d.ctx.checksCommit(c0.id, 'no', c0.reasons[1]), true);
  assert.deepEqual(j(d.ctx.checksReadOutbox()), [{ id: c0.id, result: 'no', reason: c0.reasons[1], note: null }]);
  assert.equal(d.ctx.checksReadState()[c0.id].why, c0.reasons[1]);
});
test('«Інше» без тексту (порожньо, пробіли) не підтверджується; з текстом — пише reason «Інше» і note (обрізаний до 300)', () => {
  const d = device(null, null, FRESH); const id = ids(d.ctx)[0];
  [undefined, null, '', '   \n'].forEach(t => assert.equal(d.ctx.checksCommit(id, 'no', 'Інше', t), false));
  assert.deepEqual(j(d.ctx.checksReadOutbox()), []);
  assert.equal(d.ctx.checksCommit(id, 'no', 'Інше', '  Рамка біла  '), true);
  assert.deepEqual(j(d.ctx.checksReadOutbox()), [{ id, result: 'no', reason: 'Інше', note: 'Рамка біла' }]);
  const d2 = device(null, null, FRESH); d2.ctx.checksCommit(id, 'no', 'Інше', 'я'.repeat(500));
  assert.equal(d2.ctx.checksReadOutbox()[0].note.length, 300);
});
test('«Не можу перевірити зараз» + причина: крок іде в кінець списку, пише defer; без причини/чужа причина — ні; відкладений можна пройти пізніше', async () => {
  const d = device(null, null, FRESH); const [a, b, c] = ids(d.ctx);
  assert.equal(d.ctx.checksCommit(a, 'defer', 'інша'), false); assert.equal(d.ctx.checksCommit(a, 'defer'), false);
  assert.equal(d.ctx.checksCommit(a, 'defer', 'Немає часу'), true);
  assert.deepEqual(pend(d, FRESH), ids(d.ctx).filter(x => x !== a).concat([a]), 'відкладений у кінці');
  assert.equal(d.ctx.checksCommit(b, 'defer', 'Не зрозумів крок'), true);
  const order = pend(d, FRESH); assert.equal(order[order.length - 2], a); assert.equal(order[order.length - 1], b, 'у порядку відкладення');
  assert.equal(await d.ctx.flushChecksQueue(), true);
  assert.deepEqual(d.inserts.map(x => j(x.row).events[0]), [{ id: a, result: 'defer', reason: 'Немає часу', note: null }, { id: b, result: 'defer', reason: 'Не зрозумів крок', note: null }]);
  assert.equal(d.ctx.checksCommit(a, 'ok'), true, 'відкладений крок ще можна пройти');
  assert.ok(!pend(d, FRESH).includes(a)); assert.equal(j(d.ctx.checksAnswered(d.ctx.checksReadState())).length, 1);
  assert.equal(d.ctx.checksCommit(a, 'no', 'Зникла'), false, 'остаточну не перезаписує');
});
function clockDate(ref){ return class extends Date { constructor(...a){ if(a.length) super(...a); else super(ref.now); } static now(){ return ref.now; } }; }
const DAY = 86400000;
test('термін детермінований: addedOn + 7 днів, не залежить від телефону, збірок і першого показу; expired не пишеться', () => {
  const ref = { now: Date.parse('2026-10-29T10:00:00Z') };
  const d = device(null, { Date: clockDate(ref) }, '2.32.202'); const c = CH(d.ctx).find(x => x.id === '2.32.193-1');
  assert.equal(c.addedOn, '2026-10-28');
  assert.equal(d.ctx.checksIsExpired(c, Date.parse('2026-11-03T23:59:59Z')), false, 'до 4 листопада 00:00 живий');
  assert.equal(d.ctx.checksIsExpired(c, Date.parse('2026-11-04T00:00:00Z')), true, '28.10 + 7 днів');
  ref.now = Date.parse('2026-11-04T10:00:00Z'); const late = device(null, { Date: clockDate(ref) }, '2.32.300'); // «новий» телефон і далека збірка — той самий термін
  assert.deepEqual(j(late.ctx.checksPending({}).map(x => x.id)), ['2.32.202-1', '2.32.203-1', '2.32.203-2'], 'усі кроки 28.10 закінчились (4.11 00:00); 202-1 (29.10) ще ні');
  assert.ok(late.ctx.checksAnswered({}).length >= 8, 'закінчені — в «Пройдено»');
  assert.deepEqual(j(late.ctx.checksClosedBy({}, c)), { r: 'expired', why: null }, 'показується як «Не перевірено»');
  assert.equal(late.ctx.checksReadOutbox().length, 0, 'події expired більше не пишуться');
  assert.ok(!/checksExpireStale|firstSeen|CHECKS_SEEN_KEY/.test(SRC.slice(SRC.indexOf('const CHECKS_EXPIRE_DAYS'), SRC.indexOf('function openChecksDrawer'))), 'правило firstSeenAt прибрано');
});
test('записи expired від старого правила ховають крок; кроки 186-2, 188-1, 189-1 не відновлюються (закриті expired у журналі)', () => {
  const ref = { now: Date.parse('2026-10-29T10:00:00Z') }; const d = device(null, { Date: clockDate(ref) });
  const shared = { at: 1, rows: [{ id: '2.32.186-2', result: 'expired' }, { id: '2.32.188-1', result: 'expired' }, { id: '2.32.189-1', result: 'expired' }] };
  const ids = d.ctx.checksPending({}, undefined, shared).map(x => x.id);
  ['2.32.186-2', '2.32.188-1', '2.32.189-1'].forEach(i => assert.ok(!ids.includes(i), i + ' не повертається'));
  assert.ok(ids.includes('2.32.193-1'));
  const own = { '2.32.193-1': { r: 'expired', why: null, note: null, at: '2026-10-28T15:07:00.000Z' } }; assert.ok(!d.ctx.checksPending(own, undefined, { at: 0, rows: [] }).some(x => x.id === '2.32.193-1'), 'власний локальний expired ховає');
});
test('спільний список: відповідь будь-кого з сім\'ї (ok, no, expired) ховає крок; defer особистий; однакові числа в двох членів сім\'ї', () => {
  const ref = { now: Date.parse('2026-10-29T10:00:00Z') };
  const A = device(null, { Date: clockDate(ref) }), B = device(null, { Date: clockDate(ref) });
  const before = A.ctx.checksPending({}).length;
  assert.equal(B.ctx.checksPending({}).length, before, 'до відповідей числа однакові');
  const shared = { at: 1, rows: [{ id: '2.32.193-1', result: 'ok' }, { id: '2.32.193-2', result: 'no' }, { id: '2.32.193-3', result: 'defer' }, { id: '2.32.196-1', result: 'expired' }] };
  const pa = A.ctx.checksPending({}, undefined, shared).map(x => x.id), pb = B.ctx.checksPending({ '2.32.200-1': { r: 'ok', why: null, note: null, at: 'x' } }, undefined, shared).map(x => x.id);
  ['2.32.193-1', '2.32.193-2', '2.32.196-1'].forEach(i => assert.ok(!pa.includes(i), i + ' закрито іншим'));
  assert.ok(pa.includes('2.32.193-3'), 'defer іншого не ховає крок');
  assert.equal(pa.length, before - 3); assert.equal(pb.length, before - 4, 'власна відповідь додається до спільних: числа збігаються після оновлення журналу');
  assert.equal(A.ctx.checksAnswered({}, undefined, shared).length, 3);
  // «Не можу перевірити» особисте: у власному стані крок іде в кінець і лишається відкритим
  const own = { '2.32.193-1': { r: 'defer', why: 'Немає часу', note: null, at: '2026-10-29T09:00:00.000Z' } };
  const po = A.ctx.checksPending(own, undefined, { at: 1, rows: [] }).map(x => x.id); assert.equal(po[po.length - 1], '2.32.193-1');
});
test('оновлення журналу сім\'ї: один GET (events, created_at) за 7 днів зі scenario = check; кеш; не частіше раз на 60 с; без запиту офлайн', async () => {
  const ref = { now: Date.parse('2026-10-29T10:00:00Z') }; const calls = [];
  const client = { from(table){ const q = { table, filters: [], select(cols){ q.cols = cols; return q; }, eq(c, v){ q.filters.push(['eq', c, v]); return q; }, gte(c, v){ q.filters.push(['gte', c, v]); return q; }, then(f, r){ calls.push({ table: q.table, cols: q.cols, filters: q.filters }); return Promise.resolve({ data: [{ events: [{ id: '2.32.193-1', result: 'ok' }], created_at: '2026-10-29T08:00:00Z' }, { events: [{ id: '2.32.193-2', result: 'defer' }], created_at: '2026-10-29T08:01:00Z' }], error: null }).then(f, r); } }; return q; } };
  const d = device(null, { Date: clockDate(ref), getSupabaseClient: () => client, isCloudSessionReady: () => true, checksSharedAt: 0, checksSharedBusy: false, navigator: { onLine: true } });
  const nowSpy = ref.now; assert.equal(await d.ctx.checksRefreshShared(false), true);
  assert.deepEqual(j(calls), [{ table: 'client_debug_logs', cols: 'events,created_at', filters: [['eq', 'scenario', 'check'], ['gte', 'created_at', new Date(nowSpy - 7 * DAY).toISOString()]] }]);
  assert.deepEqual(j(d.ctx.checksSharedMap()), { '2.32.193-1': 'ok' }, 'defer у спільний список не потрапляє');
  assert.equal(await d.ctx.checksRefreshShared(false), false, 'не частіше раз на 60 с'); assert.equal(calls.length, 1);
  assert.equal(await d.ctx.checksRefreshShared(true), true, 'при відкритті «Перевірок» — примусово'); assert.equal(calls.length, 2);
  const off = device(null, { Date: clockDate(ref), getSupabaseClient: () => client, isCloudSessionReady: () => true, checksSharedAt: 0, checksSharedBusy: false, navigator: { onLine: false } });
  assert.equal(await off.ctx.checksRefreshShared(true), false); assert.equal(calls.length, 2);
  assert.match(SRC, /\[2000, 9000, 25000\]\.forEach/); assert.match(SRC, /visibilitychange', function\(\)\{ if\(document\.visibilityState === 'visible'\) checksRefreshShared\(false\)/); assert.ok(!/checksRefreshShared[\s\S]{0,900}realtime/.test(SRC.slice(SRC.indexOf('async function checksRefreshShared'), SRC.indexOf('async function checksRefreshShared') + 1200)));
});
test('скасування: невиручений вибір скидається без запису (таймер, виділення, списки, поле); повторний дотик/дотик поза кроком/згортання ведуть у скидання (код)', () => {
  const cleared = []; let removed = 0, fieldValue = 'текст', errShown = 'block'; const mk = () => ({ classList: { remove(){ removed++; } } });
  const it = { _t: 7, querySelectorAll: sel => (sel === '.sel' ? [mk(), mk()] : sel === '.chk-rz' ? [mk(), mk()] : []), querySelector: sel => sel === '.chk-oth' ? mk() : sel === '.chk-err' ? { style: { set display(v){ errShown = v; } } } : sel === '.chk-fld' ? { set value(v){ fieldValue = v; } } : null };
  const d = device(null, { clearTimeout: t => cleared.push(t) });
  d.ctx.checksResetItem(it);
  assert.deepEqual(cleared, [7]); assert.equal(it._t, null); assert.equal(removed, 5); assert.equal(fieldValue, ''); assert.equal(errShown, 'none');
  assert.deepEqual(j(d.ctx.checksReadOutbox()), [], 'скидання нічого не пише');
  assert.match(SRC, /if\(btn\.classList\.contains\('sel'\)\)\{ checksResetItem\(it\); return; \}/, 'повторний дотик по обраній кнопці');
  assert.match(SRC, /if\(!it\.contains\(e\.target\)\) checksResetItem\(it\);/, 'дотик поза кроком');
  assert.match(SRC, /if\(it\.classList\.contains\('open'\)\) checksResetItem\(it\); \/\/ згортання кроку знімає вибір/);
  assert.match(SRC, /checksFinish\(it, c, 'ok'\); \}, 600\)/, '«Працює» підтверджується через 0,6 с (скасовується таймером)');
});
test('відповідь переживає перезапуск; без відповіді крок повертається; черга журналу: невдалий insert лишається й іде при наступному старті; лише читання нічого не шле', async () => {
  const a = device(null, null, FRESH); const [i0, i1] = ids(a.ctx);
  a.ctx.checksCommit(i0, 'ok'); a.ctx.checksCommit(i1, 'defer', 'Немає часу');
  const b = device(a.ls, null, FRESH);
  assert.ok(!pend(b, FRESH).includes(i0), 'пройдений не повертається'); assert.ok(pend(b, FRESH).includes(i1), 'відкладений лишається в перевірках');
  assert.equal(j(b.ctx.checksReadOutbox()).length, 2, 'невідправлене пережило перезапуск');
  b.state.fail = true; assert.equal(await b.ctx.flushChecksQueue(), false); assert.equal(b.ctx.checksReadOutbox().length, 2);
  b.state.fail = false; b.state.writable = false; await b.ctx.flushChecksQueue(); assert.equal(b.inserts.length, 0, 'лише читання: нічого');
  const c = device(a.ls, null, FRESH); await c.ctx.flushChecksQueue();
  assert.equal(c.inserts.length, 2); assert.deepEqual(j(c.ctx.checksReadOutbox()), []);
  const cleared = device({}, null, FRESH); assert.ok(pend(cleared, FRESH).includes(i0), 'без відповіді крок повертається');
  assert.deepEqual(j(device({ 'budget-checks-v1': '{зіпсовано', 'budget-checks-outbox-v1': '{x' }).ctx.checksReadState()), {});
  assert.deepEqual(j(device({ 'budget-checks-outbox-v1': '{x' }).ctx.checksReadOutbox()), []);
  const boom = device(null, { localStorage: { getItem(){ throw new Error('x'); }, setItem(){ throw new Error('x'); } } });
  assert.deepEqual(j(boom.ctx.checksReadState()), {}); assert.equal(boom.ctx.checksWriteState({}), false);
});
test('стара відповідь skip (Rev 2.32.189) лишається остаточною', () => {
  const d = device({ 'budget-checks-v1': JSON.stringify({ '2.32.188-1': { r: 'skip' } }) }, null, FRESH);
  assert.ok(!pend(d, FRESH).includes('2.32.188-1')); assert.equal(d.ctx.checksCommit('2.32.188-1', 'ok'), false);
});
test('кнопки «Працює» (галочка) / «Не працює» (хрестик) з іконками; «Не працює» бліднить «Працює», «Не можу перевірити» — обидві до одного рівня (вже бліда «Не працює» не змінюється); скидання повертає насиченість', () => {
  const fn = SRC.slice(SRC.indexOf('function renderChecks()'), SRC.indexOf('function toggleChecksDone'));
  assert.match(fn, /checksFlatButton\('chk-fl k', 'Працює', CHECKS_SVG_TICK, 'ok'\)/); assert.match(fn, /checksFlatButton\('chk-fl n', 'Не працює', CHECKS_SVG_CROSS, 'no'\)/);
  const flat = SRC.slice(SRC.indexOf('function checksFlatButton'), SRC.indexOf('function renderChecks()'));
  assert.match(flat, /checksSvg\(icon\)/, 'іконка в кнопці');
  assert.match(SRC, /it\.classList\.add\('st-no'\)/); assert.match(SRC, /it\.classList\.add\('st-sk'\)/);
  assert.match(SRC, /\.chk-it\.st-no \.chk-fl\.k, \.chk-it\.st-sk \.chk-fl\.k\{ background:color-mix\(in srgb, var\(--ui-accent-strong, var\(--color-primary\)\) 16%, transparent\)/, 'той самий рівень 16%, що й у «Не працює» за замовчуванням');
  assert.match(SRC, /\.chk-fl\.n\{[^}]*color-mix\(in srgb, var\(--color-error\) 16%, transparent\)/);
  assert.ok(!/\.st-sk[^{]*\.chk-fl\.n/.test(SRC), '«Не працює» при «Не можу перевірити» не змінюється');
  const removed = []; const mk = () => ({ classList: { remove(){} } });
  const it = { _t: null, classList: { remove: c => removed.push(c) }, querySelectorAll: () => [], querySelector: () => null };
  device().ctx.checksResetItem(it);
  assert.deepEqual(removed, ['st-no', 'st-sk']);
});
test('поле «Інше»: абстрактні id і name (fldchkN), autocomplete off; підказка «Опишіть недолік коротко.»; «Надіслати» не приймає порожній текст (код)', () => {
  const fn = SRC.slice(SRC.indexOf('function renderChecks()'), SRC.indexOf('function toggleChecksDone'));
  assert.match(fn, /const fid = 'fldchk' \+ \(CHECKS\.indexOf\(c\) \+ 1\);/); assert.match(fn, /fld\.id = fid; applyFieldGuardAttrs\(fld, \{ label: 'Опишіть недолік' \}\);/); // autocomplete off, abstract name x-fldchkN — у спільній функції (tests/field-guard.test.js) assert.match(fn, /fld\.placeholder = 'Опишіть недолік'/); assert.match(fn, /'Опишіть недолік коротко\.'/);
  const forbidden = ['name', 'phone', 'tel', 'mail', 'addr', 'user', 'login', 'first', 'last', 'fio', 'contact'];
  CH(device().ctx).forEach((c, i) => forbidden.forEach(w => assert.ok(!('fldchk' + (i + 1)).includes(w), w)));
  assert.match(SRC, /if\(!fld\.value\.trim\(\)\)\{ err\.style\.display = 'block'; fld\.focus\(\); return; \}/);
});
test('джерело: два рядки в «Сервісі», чекліста й qa.json у клієнті немає, скла немає, розміри й анімація як у макеті v2', () => {
  assert.match(SRC, /id="checks-btn" onclick="openChecksDrawer\(\)"/); assert.match(SRC, /id="diagnostics-btn" onclick="openTestingDrawer\(\)"/);
  assert.ok(!/Тестування/.test(SRC.replace(/\/\/.*|\/\*[\s\S]*?\*\/|<!--[\s\S]*?-->/g, '')), 'підпис «Тестування» прибрано з інтерфейсу');
  ['qa.json?v=', 'toggleQaChecklist', 'copyQaResult', 'Скопіювати результат', 'Чекліст перевірки', 'budget-qa-state-v1', 'chk-gb', 'chk-ab', 'push-diag-errors-btn'].forEach(n => assert.equal(SRC.indexOf(n), -1, n));
  const checksCss = SRC.slice(SRC.indexOf('.chk-card{'), SRC.indexOf('.n-diag-empty{'));
  assert.ok(!/backdrop-filter|box-shadow/.test(checksCss), 'жодного скла й тіней у «Перевірках»');
  [['.chk-it{ max-height:760px', 'max-height 760'], ['.chk-fl, .chk-sk, .chk-send{ position:relative; height:40px; border-radius:14px', 'кнопки 40/14'], ['.chk-pair{ display:grid; grid-template-columns:1fr 1fr; gap:10px', 'пара, проміжок 10'],
    ['.chk-grp button{ display:flex; width:100%; align-items:center; justify-content:space-between; height:48px', 'рядок причин 48'], ['.chk-grp{ background:var(--color-surface-hover); border-radius:14px', 'група, радіус 14'],
    ['.chk-fld{ width:100%; height:34px', 'поле 34'], ['border-radius:12px; border:1px solid var(--color-border)', 'поле радіус 12'], ['font:inherit; font-size:14px; padding:0 12px', 'поле 14'], ['background:var(--color-surface-hover); border:none; color:var(--color-text-secondary); font-size:14px', 'суцільна сіра вторинна кнопка'],
    ['.chk-rz{ overflow:hidden; max-height:0; opacity:0', 'списки'], ['transition:max-height .28s ease, opacity .2s ease', 'анімація списків .28/.2'], ['.chk-it.done .chk-tt{ text-decoration:line-through', 'закреслення']]
    .forEach(([n, w]) => assert.ok(checksCss.indexOf(n) !== -1, w));
  assert.match(SRC, /\.chk-it \.chk-bd\{ display:none; padding:0 16px 16px; \}/);
  assert.match(SRC, /reduce \? 50 : 600/); assert.match(SRC, /@media \(prefers-reduced-motion: reduce\)\{ \.chk-it, \.chk-it\.gone, \.chk-chev, \.chk-tt, \.chk-sent, \.chk-fl, \.chk-rz, \.chk-rz\.open\{ transition:none; \} \}/);
  assert.match(SRC, /#checks-done-list\.hidden\{ display:none; \}/, '«Пройдено» згорнуте за замовчуванням');
  assert.match(SRC, /flushChecksQueue\(\); \/\/ Rev 2\.32\.189 \(CHECKS-1\)/, 'повторна спроба при старті');
  const fn = SRC.slice(SRC.indexOf('function renderChecks()'), SRC.indexOf('function toggleChecksDone'));
  assert.ok(!/innerHTML/.test(fn), 'без innerHTML у відображенні кроків'); assert.match(fn, /'Не можу перевірити зараз'/); assert.match(fn, /'Працює'/); assert.match(fn, /'Не працює'/);
});
test('Rev 2.32.194: у стилях немає dashed і dotted', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8').split('<script')[0];
  assert.ok(!/dashed|dotted/.test(css), 'пунктир прибрано повністю');
});
