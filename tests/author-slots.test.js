// Rev 2.32.116 (PRIV-1): автор-колір за слотом учасника (порядок users.created_at, id), без імен у коді.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildSandbox } = require('./extract');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const j = v => JSON.parse(JSON.stringify(v));
const NAMES = ['AUTHOR_SLOTS_LS_KEY', 'AUTHOR_SLOTS', 'AUTHOR_NEUTRAL', 'authorSlotsFromUsers', 'cachedAuthorSlot', 'authorInfoFor', 'loadFamilyUsersDirectory'];
function mk(users, store){
  const ls = Object.assign({}, store || {});
  return buildSandbox({ familyUsersById: users || {}, localStorage: { getItem: k => ls[k] === undefined ? null : ls[k], setItem: (k, v) => { ls[k] = v; } }, __ls: ls }, NAMES);
}
const PINK = { colorVar: '--color-accent-pink', bgVar: '--color-accent-pink-bg' };
const BLUE = { colorVar: '--color-info', bgVar: '--color-info-bg' };
const NEUTRAL = { colorVar: '--color-text-secondary', bgVar: '--color-surface-hover' };

test('слоти: учасники за (created_at, id); слот 0 = рожевий, слот 1 = синій (ті самі кольори, що давало зіставлення за іменем); gender з users.gender', () => {
  const c = mk();
  assert.deepEqual(j(c.authorSlotsFromUsers([{ id: 'b', created_at: '2026-09-02' }, { id: 'a', created_at: '2026-09-01' }])), { a: 0, b: 1 });
  assert.deepEqual(j(c.authorSlotsFromUsers([{ id: 'z', created_at: '2026-09-01' }, { id: 'y', created_at: '2026-09-01' }])), { y: 0, z: 1 }, 'однаковий час: за id');
  assert.deepEqual(j(c.authorSlotsFromUsers([])), {});
  const u = { u0: { name: 'X', slot: 0, gender: 'f' }, u1: { name: 'Y', slot: 1, gender: 'm' } };
  const k = mk(u);
  assert.deepEqual(j(k.authorInfoFor('u0')), Object.assign({ name: 'X', gender: 'f' }, PINK));
  assert.deepEqual(j(k.authorInfoFor('u1')), Object.assign({ name: 'Y', gender: 'm' }, BLUE));
});
test('запасний колір нейтральний: 3-й учасник, відомий без слота; невідомий без імені → null (як раніше)', () => {
  const k = mk({ u2: { name: 'Z', slot: 2, gender: 'f' }, u9: { name: 'Q', gender: 'x' } });
  assert.deepEqual(j(k.authorInfoFor('u2')), Object.assign({ name: 'Z', gender: 'f' }, NEUTRAL), 'рід бере з users.gender навіть для нейтрального кольору');
  assert.deepEqual(j(k.authorInfoFor('u9')), Object.assign({ name: 'Q', gender: null }, NEUTRAL), 'невідомий рід = null');
  assert.equal(k.authorInfoFor('немає'), null); assert.equal(k.authorInfoFor(null), null); assert.equal(k.authorInfoFor(undefined, ''), null);
});
test('для себе до завантаження довідника: слот із кешу localStorage (колір одразу), без кешу нейтральний; fallbackName — ім\'я', () => {
  const cached = mk({}, { 'budget-author-slots-v1': JSON.stringify({ me: 1 }) });
  assert.deepEqual(j(cached.authorInfoFor('me', 'me@example.test')), Object.assign({ name: 'me@example.test', gender: null }, BLUE));
  const none = mk({});
  assert.deepEqual(j(none.authorInfoFor('me', 'me@example.test')), Object.assign({ name: 'me@example.test', gender: null }, NEUTRAL));
  const bad = mk({}, { 'budget-author-slots-v1': '{зіпсовано' });
  assert.deepEqual(j(bad.authorInfoFor('me', 'x')), Object.assign({ name: 'x', gender: null }, NEUTRAL));
});
test('довідник: запит із created_at, слоти пишуться в familyUsersById і кешуються; помилка запиту нічого не змінює', async () => {
  const rows = [{ id: 'p', display_name: ' Перший ', email: null, created_at: '2026-09-01T00:00:00Z', gender: 'f' }, { id: 'q', display_name: null, email: 'q@example.test', created_at: '2026-09-02T00:00:00Z', gender: 'm' }, { id: 'r', display_name: 'Третій', created_at: '2026-09-03T00:00:00Z', gender: null }];
  let cols = null;
  const c = mk();
  await c.loadFamilyUsersDirectory({ from: () => ({ select: async cl => { cols = cl; return { data: rows, error: null }; } }) });
  assert.match(cols, /created_at/); assert.match(cols, /gender/);
  assert.deepEqual(j(c.authorInfoFor('p')), Object.assign({ name: 'Перший', gender: 'f' }, PINK));
  assert.deepEqual(j(c.authorInfoFor('q')), Object.assign({ name: 'q@example.test', gender: 'm' }, BLUE));
  assert.deepEqual(j(c.authorInfoFor('r')), Object.assign({ name: 'Третій', gender: null }, NEUTRAL));
  assert.deepEqual(JSON.parse(c.__ls['budget-author-slots-v1']), { p: 0, q: 1, r: 2 });
  const e = mk({ keep: { name: 'K', slot: 0 } });
  await e.loadFamilyUsersDirectory({ from: () => ({ select: async () => ({ data: null, error: { message: 'x' } }) }) });
  assert.ok(e.authorInfoFor('keep'));
});
test('у коді немає зіставлення за іменем (префікси імен членів родини)', () => {
  const code = SRC.replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, '');
  assert.ok(!/startsWith\('[^']{3,}'\)\s*\|\|\s*nameLower/.test(code) && !/nameLower/.test(code), 'зіставлення за префіксом імені прибрано');
  assert.ok(!/nameLower/.test(code));
});

test('один учасник → слот 0; видалення першого учасника зсуває слоти (колір змінюється; ризик задокументований); localStorage що кидає виняток не ламає', async () => {
  const c = mk();
  assert.deepEqual(j(c.authorSlotsFromUsers([{ id: 'solo', created_at: '2026-09-01' }])), { solo: 0 });
  assert.deepEqual(j(c.authorSlotsFromUsers([{ id: 'b', created_at: '2026-09-02' }])), { b: 0 }, 'після видалення першого другий стає слотом 0');
  const boom = buildSandbox({ familyUsersById: { u: { name: 'U', slot: 1, gender: 'm' } }, localStorage: { getItem(){ throw new Error('заборонено'); }, setItem(){ throw new Error('заборонено'); } } }, NAMES);
  assert.deepEqual(j(boom.authorInfoFor('u')), Object.assign({ name: 'U', gender: 'm' }, BLUE));
  assert.deepEqual(j(boom.authorInfoFor('x', 'n')), Object.assign({ name: 'n', gender: null }, NEUTRAL), 'кеш недоступний → нейтральний');
  await boom.loadFamilyUsersDirectory({ from: () => ({ select: async () => ({ data: [{ id: 'u', display_name: 'U', created_at: '2026-09-01', gender: 'f' }], error: null }) }) }); // setItem кидає: без винятку
  assert.equal(boom.authorInfoFor('u').gender, 'f');
});
