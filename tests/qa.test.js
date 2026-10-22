// Rev 2.32.122 (QA-1): «Чекліст перевірки»: стан лише локально, текст результату за номерами, генерація qa.json зі звітів.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildSandbox, evalInSandbox } = require('./extract');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const j = v => JSON.parse(JSON.stringify(v));
const NAMES = ['QA_STATE_KEY', 'QA_REASONS', 'QA_RESULT_LABELS', 'qaValidItems', 'qaGroupByRev', 'qaReadState', 'qaWriteState', 'qaSetResult', 'qaPruneDone', 'qaSummaryText', 'qaAnswerFor', 'loadQaItems'];
function mk(store){ const ls = Object.assign({}, store || {}); const c = buildSandbox({ localStorage: { getItem: k => ls[k] === undefined ? null : ls[k], setItem: (k, v) => { ls[k] = v; } }, __ls: ls }, NAMES); return c; }
const ITEMS = [{ id: '2.32.119-1', rev: '2.32.119', title: 'А', steps: [], expected: '' }, { id: '2.32.119-2', rev: '2.32.119', title: 'Б', steps: [], expected: '' }, { id: '2.32.118-1', rev: '2.32.118', title: 'В', steps: [], expected: '' }];

test('qaSetResult: ок / не ок (+ причина кнопкою з переліку); невідома причина відкидається; повторний вибір знімає', () => {
  const c = mk();
  let st = c.qaSetResult({}, 'a', 'ok'); assert.deepEqual(j(st), { a: { s: 'ok' } });
  st = c.qaSetResult(st, 'b', 'bad', 'обрізано'); assert.deepEqual(j(st.b), { s: 'bad', r: 'обрізано' });
  st = c.qaSetResult(st, 'b', 'bad', 'вигадана причина'); assert.deepEqual(j(st.b), { s: 'bad' });
  st = c.qaSetResult(st, 'a', null); assert.ok(!('a' in st));
  assert.deepEqual(j(c.qaSetResult({}, 'x', 'skip')), {}, 'лише ок / не ок');
  assert.deepEqual(j(evalInSandbox(c, 'QA_REASONS')), ['обрізано', 'не працює', 'повільно', 'інше']);
});
test('qaSummaryText: текст за номерами, як у ТЗ; без відповідей немає запису; шапка зі збіркою й датою', () => {
  const c = mk();
  const st = { '2.32.119-1': { s: 'ok' }, '2.32.119-2': { s: 'bad', r: 'обрізано' }, '2.32.118-1': { s: 'bad' } };
  assert.equal(c.qaSummaryText(ITEMS, st, '2.32.122', '22.10.2026'), 'Збірка 2.32.122 · 22.10.2026\n2.32.119-1 ок; 2.32.119-2 не ок: обрізано; 2.32.118-1 не ок');
  assert.equal(c.qaSummaryText(ITEMS, {}, '2.32.122', '22.10.2026'), 'Збірка 2.32.122 · 22.10.2026\nРезультатів немає');
  assert.equal(c.qaSummaryText(ITEMS, { x: { s: 'ok' } }, 'v', 'd'), 'Збірка v · d\nРезультатів немає', 'невідомі id ігноруються');
});
test('стан зберігається лише в localStorage; зіпсований стан і недоступне сховище не ламають; «Очистити пройдені» лишає «не ок»', () => {
  const c = mk({ 'budget-qa-state-v1': '{зіпсовано' });
  assert.deepEqual(j(c.qaReadState()), {});
  assert.equal(c.qaWriteState({ a: { s: 'ok' } }), true); assert.equal(c.__ls['budget-qa-state-v1'], JSON.stringify({ a: { s: 'ok' } }));
  assert.deepEqual(j(c.qaReadState()), { a: { s: 'ok' } });
  assert.deepEqual(j(mk({ 'budget-qa-state-v1': '[1]' }).qaReadState()), {}, 'масив не вважається станом');
  assert.deepEqual(j(c.qaPruneDone({ a: { s: 'ok' }, b: { s: 'bad', r: 'повільно' } })), { b: { s: 'bad', r: 'повільно' } });
  const boom = buildSandbox({ localStorage: { getItem(){ throw new Error('x'); }, setItem(){ throw new Error('x'); } } }, NAMES);
  assert.deepEqual(j(boom.qaReadState()), {}); assert.equal(boom.qaWriteState({}), false);
});
test('qaValidItems відкидає невалідні й дублікати id; qaGroupByRev зберігає порядок', () => {
  const c = mk();
  const v = j(c.qaValidItems([{ id: 'a', rev: '1', title: 'T', steps: ['s', 5], expected: 'e' }, { id: 'a', rev: '1', title: 'дубль' }, { rev: '1', title: 'без id' }, null, 'x', { id: 'b', rev: '2', title: 'U' }]));
  assert.deepEqual(v.map(x => x.id), ['a', 'b']); assert.deepEqual(v[0].steps, ['s']); assert.equal(v[1].expected, '');
  assert.deepEqual(j(c.qaValidItems(null)), []); assert.deepEqual(j(c.qaValidItems({ a: 1 })), []);
  assert.deepEqual(j(c.qaGroupByRev(ITEMS)).map(g => [g.rev, g.items.length]), [['2.32.119', 2], ['2.32.118', 1]]);
});
test('qa.json: валідний, id унікальні й починаються з rev, актуальний відносно звітів (node scripts/gen-qa.mjs); містить пункти поточної черги', async () => {
  const items = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'qa.json'), 'utf8'));
  assert.ok(items.length >= 5);
  const ids = new Set(); items.forEach(it => { assert.ok(it.id.startsWith(it.rev + '-') && it.title && !ids.has(it.id)); ids.add(it.id); assert.ok(!/@|\d{9,}/.test(JSON.stringify(it)), 'без email і довгих чисел'); });
  ['2.32.115', '2.32.111', '2.32.120', '2.32.121'].forEach(r => assert.ok(items.some(x => x.rev === r), 'пункти ' + r));
  const { buildItems, parseReport } = await import('../scripts/gen-qa.mjs');
  const dir = path.join(__dirname, '..', 'docs', 'reports');
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.md')).sort().map(f => ({ name: f, text: fs.readFileSync(path.join(dir, f), 'utf8') }));
  assert.deepEqual(buildItems(files), items, 'qa.json збігається зі звітами');
  const md = '# Звіт\n\n## Rev 2.32.9: щось\n### Для iPhone\n- Перший: очікується А\n- **Другий**: очікується Б\n1. Третій без двокрапки\n\n## Інше\n- не беремо\n### Перевірка на iPhone\n- старий розділ не беремо\n';
  assert.deepEqual(parseReport(md).map(x => x.text), ['Перший: очікується А', 'Другий: очікується Б', 'Третій без двокрапки']);
  assert.ok(parseReport(md).every(x => x.rev === '2.32.9'));
});
test('джерело: чекліст лише в «Тестуванні»; без мережевих записів і без текстових полів; qa.json із версією й no-store; клавіатурні правила не чіпались', () => {
  const a = SRC.indexOf('const QA_STATE_KEY'), b = SRC.indexOf('// Головний тумблер: вимкнення лише пише false;');
  const code = SRC.slice(a, b);
  assert.ok(!/\.from\(|\.insert\(|\.upsert\(|\.rpc\(|createElement\('input'\)|createElement\('textarea'\)|<input|<textarea/.test(code), 'лише localStorage, без записів у мережу й полів');
  assert.ok(/fetch\('\.\/qa\.json\?v=' \+ encodeURIComponent\(APP_VERSION\), \{ cache: 'no-store' \}\)/.test(code));
  assert.match(SRC, /id="qa-btn"[^>]*onclick="toggleQaChecklist\(\)">Показати чекліст перевірки</);
  assert.ok(!/kb-|focusCardField|kbMode/.test(code));
});

test('qaAnswerFor: відповідь чинна лише за збігу хешу; __proto__ не діє', () => {
  const c = mk();
  const it = { id: 'a-1', h: 'aaa' };
  assert.deepEqual(j(c.qaAnswerFor({ 'a-1': { s: 'ok', h: 'aaa' } }, it)), { s: 'ok', h: 'aaa' });
  assert.equal(c.qaAnswerFor({ 'a-1': { s: 'ok', h: 'bbb' } }, it), null, 'інший текст пункту з тим самим id');
  assert.deepEqual(j(c.qaAnswerFor({ 'a-1': { s: 'ok' } }, it)), { s: 'ok' }, 'старий запис без хешу зберігається');
  assert.equal(c.qaAnswerFor({}, { id: 'constructor' }), null);
  const st = c.qaSetResult({}, '__proto__', 'ok', null, 'h1');
  assert.equal(Object.keys(st).length, 0); assert.equal(({}).s, undefined); assert.equal(st.s, undefined, 'прототип не підмінено');
  assert.equal(c.qaSetResult({}, 'a', 'ok', null, 'h9').a.h, 'h9');
});
function mkLoad(fetchImpl){ return buildSandbox({ fetch: fetchImpl, encodeURIComponent, APP_VERSION: '9.9.9' }, NAMES); }
test('loadQaItems: успіх, порожній, невалідний JSON, помилка мережі й HTTP; після невдачі qaItems = null (повторна спроба)', async () => {
  let c = mkLoad(async () => ({ ok: true, json: async () => [{ id: 'a', rev: '1', title: 'T', h: 'x' }] }));
  assert.equal((await c.loadQaItems()).length, 1);
  c = mkLoad(async () => ({ ok: true, json: async () => [] })); assert.deepEqual(j(await c.loadQaItems()), []);
  c = mkLoad(async () => ({ ok: true, json: async () => { throw new SyntaxError('bad'); } })); assert.equal(await c.loadQaItems(), null);
  c = mkLoad(async () => { throw new Error('offline'); }); assert.equal(await c.loadQaItems(), null);
  c = mkLoad(async () => ({ ok: false, status: 404 })); assert.equal(await c.loadQaItems(), null);
  assert.equal(evalInSandbox(c, 'qaItems'), null);
  assert.equal(evalInSandbox(c, 'qaLoadFailed'), true);
  c = mkLoad(async () => ({ ok: true, json: async () => ({ not: 'array' }) })); assert.deepEqual(j(await c.loadQaItems()), []);
});
test('gen-qa: явні номери, ≥10 пунктів (числове сортування), CRLF, багаторядкові пункти, код-блоки, унікальні id між звітами', async () => {
  const { buildItems, parseReport } = await import('../scripts/gen-qa.mjs');
  let md = '## Rev 2.32.50\r\n### Для iPhone\r\n';
  for(let i = 1; i <= 11; i++) md += i + '. Пункт ' + i + ': очікується ' + i + '\r\n';
  const items = buildItems([{ text: md }]);
  assert.deepEqual(items.map(x => x.id), Array.from({ length: 11 }, (_, i) => '2.32.50-' + (i + 1)), 'числове, не рядкове сортування');
  const multi = '## Rev 2.32.51\n### Для iPhone\n- Перший: очікується\n  продовження\n```\n- у коді не беремо\n```\n- Другий: ок\n';
  const p = parseReport(multi); assert.equal(p.length, 2); assert.match(p[0].text, /очікується продовження/);
  const a = buildItems([{ text: '## Rev 2.32.52\n### Для iPhone\n- А: x\n' }, { text: '## Rev 2.32.52\n### Для iPhone\n- Б: y\n' }]);
  assert.equal(new Set(a.map(x => x.id)).size, 2, 'id не збігаються між звітами');
  const e = buildItems([{ text: '## Rev 2.32.53\n### Для iPhone\n- А: x\n- Б: y\n' }]);
  const e2 = buildItems([{ text: '## Rev 2.32.53\n### Для iPhone\n1. Б: y\n2. А: x\n' }]);
  assert.ok(e[0].h && e[0].h !== e[1].h, 'хеш різний для різного тексту');
  assert.equal(e2.length, 2);
});
