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
const NAMES = ['CHECKS_SEEN_KEY', 'checksReadSeen', 'checksWriteSeen', 'checksRecordSeen', 'CHECKS_STATE_KEY', 'CHECKS_OUTBOX_KEY', 'CHECKS_OTHER', 'CHECKS_DEFER_REASONS', 'CHECKS_EXPIRE_BUILDS', 'CHECKS_NOTE_MAX', 'CHECKS', 'checksReadState', 'checksWriteState', 'checksReadOutbox', 'checksWriteOutbox',
  'checksOwn', 'checksIsFinal', 'checksBuildsBehind', 'checksIsExpired', 'checksPending', 'checksAnswered', 'checksReasonsFor', 'checksNormalize', 'checksAnswer', 'checksCommit', 'checksExpireStale', 'flushChecksQueue', 'checksResetItem'];
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
  const mine = CH(ctx).filter(c => c.id !== '2.32.189-1');
  assert.deepEqual(mine, data.map(c => ({ id: c.id, rev: c.rev, title: c.title, steps: c.steps, expect: c.expect, reasons: c.reasons })));
  CH(ctx).forEach(c => assert.ok(!c.reasons.includes('Інше')));
  const last = CH(ctx).pop();
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
test('термін: вік кроку від збірки першого показу на пристрої (firstSeenBuild), а не від rev; через 3 збірки зникає як «не перевірено» із записом expired', async () => {
  const d = device(null, null, '2.32.190');
  assert.equal(d.ctx.checksBuildsBehind('2.32.186', '2.32.190'), 4);
  assert.equal(d.ctx.checksBuildsBehind('2.32.187', '2.32.190'), 3); assert.equal(d.ctx.checksBuildsBehind('2.32.190', '2.32.190'), 0);
  assert.equal(d.ctx.checksBuildsBehind('2.31.250', '2.32.1'), Infinity); assert.equal(d.ctx.checksBuildsBehind('x', '2.32.190'), 0);
  // перший показ на збірці 190: старі за rev кроки (186-1, 186-2, 188-1) одразу не зникають
  assert.deepEqual(j(d.ctx.checksReadSeen()), {});
  assert.equal(d.ctx.checksIsExpired(CH(d.ctx)[0]), false, 'ще не бачили: не прострочений');
  assert.equal(d.ctx.checksExpireStale(), 0);
  const seen = j(d.ctx.checksReadSeen());
  CH(d.ctx).forEach(c => assert.equal(seen[c.id], '2.32.190', 'firstSeenBuild = збірка першого показу'));
  assert.deepEqual(pend(d), ids(d.ctx), 'усі кроки показано, у т. ч. 186-1, 186-2, 188-1');
  // наступні збірки: firstSeenBuild не змінюється; 193 (3 збірки) ще ні, 194 (4) — так
  const at = v => device(d.ls, null, v);
  const b193 = at('2.32.193'); assert.equal(b193.ctx.checksExpireStale(), 0); assert.deepEqual(pend(b193), ids(b193.ctx));
  assert.equal(j(b193.ctx.checksReadSeen())['2.32.186-1'], '2.32.190', 'зберігається від першого показу');
  const b194 = at('2.32.194');
  assert.equal(b194.ctx.checksIsExpired(CH(b194.ctx)[0]), true);
  assert.equal(b194.ctx.checksExpireStale(), CH(b194.ctx).length);
  assert.equal(b194.ctx.checksReadState()['2.32.186-1'].r, 'expired');
  assert.ok(j(b194.ctx.checksAnswered(b194.ctx.checksReadState())).some(c => c.id === '2.32.186-1'), 'у «Пройдено»');
  assert.equal(b194.ctx.checksExpireStale(), 0, 'повторно не пише');
  await b194.ctx.flushChecksQueue();
  assert.ok(b194.inserts.length > 0 && b194.inserts.every(x => { const e = j(x.row).events[0]; return e.result === 'expired' && e.note === null; }));
  // пройдений крок не прострочується; новий крок (ще не бачений) отримує власну базу
  const answered = at('2.32.194'); answered.ctx.checksCommit('2.32.189-1', 'ok'); assert.equal(answered.ctx.checksIsExpired(CH(answered.ctx)[3]), true); assert.ok(!j(answered.ctx.checksAnswered({})).length);
  assert.deepEqual(j(device({ 'budget-checks-seen-v1': '[1]' }).ctx.checksReadSeen()), {}); assert.deepEqual(j(device({ 'budget-checks-seen-v1': '{x' }).ctx.checksReadSeen()), {});
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
