// Rev 2.32.120 (PRIV-1): колір автора за статтю профілю users.gender (m → синій, f → рожевий, інше → нейтральний); без імен і без порядку створення.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildSandbox, evalInSandbox } = require('./extract');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const j = v => JSON.parse(JSON.stringify(v));
const NAMES = ['AUTHOR_GENDERS_LS_KEY', 'AUTHOR_GENDER_COLORS', 'AUTHOR_NEUTRAL', 'normalizeAuthorGender', 'cachedAuthorGender', 'authorInfoFor', 'loadFamilyUsersDirectory'];
function mk(users, store){
  const ls = Object.assign({}, store || {});
  return buildSandbox({ familyUsersById: users || {}, familyUsersLoaded: false, localStorage: { getItem: k => ls[k] === undefined ? null : ls[k], setItem: (k, v) => { ls[k] = v; } }, __ls: ls }, NAMES);
}
const PINK = { colorVar: '--color-accent-pink', bgVar: '--color-accent-pink-bg' };
const BLUE = { colorVar: '--color-info', bgVar: '--color-info-bg' };
const NEUTRAL = { colorVar: '--color-text-secondary', bgVar: '--color-surface-hover' };

test('два користувачі: m → синій, f → рожевий (ті самі кольори, що давало зіставлення за іменем); порядок створення не впливає', () => {
  const k = mk({ u0: { name: 'X', gender: 'm' }, u1: { name: 'Y', gender: 'f' } });
  assert.deepEqual(j(k.authorInfoFor('u0')), Object.assign({ name: 'X', gender: 'm' }, BLUE));
  assert.deepEqual(j(k.authorInfoFor('u1')), Object.assign({ name: 'Y', gender: 'f' }, PINK));
  const swapped = mk({ u1: { name: 'Y', gender: 'f' }, u0: { name: 'X', gender: 'm' } }); // інший порядок ключів/створення
  assert.deepEqual(j(swapped.authorInfoFor('u0')), Object.assign({ name: 'X', gender: 'm' }, BLUE));
});
test('невідоме значення статі, відсутня стать і третій учасник без статі: нейтральний; невідомий автор без імені → null', () => {
  const k = mk({ a: { name: 'A', gender: 'x' }, b: { name: 'B', gender: null }, c: { name: 'C' } });
  ['a', 'b', 'c'].forEach(id => assert.deepEqual(j(k.authorInfoFor(id)), Object.assign({ name: k.authorInfoFor(id).name, gender: null }, NEUTRAL), id));
  assert.equal(k.authorInfoFor('немає'), null); assert.equal(k.authorInfoFor(null), null); assert.equal(k.authorInfoFor(undefined, ''), null);
  const third = mk({ u0: { name: 'X', gender: 'm' }, u1: { name: 'Y', gender: 'f' }, u2: { name: 'Z', gender: null } });
  assert.deepEqual(j(third.authorInfoFor('u2')), Object.assign({ name: 'Z', gender: null }, NEUTRAL), 'третій учасник нейтральний');
});
test('для себе до завантаження довідника: стать із кешу localStorage (колір одразу), без кешу нейтральний; зіпсований кеш не ламає', () => {
  const cached = mk({}, { 'budget-author-genders-v1': JSON.stringify({ me: 'f' }) });
  assert.deepEqual(j(cached.authorInfoFor('me', 'me@example.test')), Object.assign({ name: 'me@example.test', gender: 'f' }, PINK));
  assert.deepEqual(j(mk({}).authorInfoFor('me', 'me@example.test')), Object.assign({ name: 'me@example.test', gender: null }, NEUTRAL));
  assert.deepEqual(j(mk({}, { 'budget-author-genders-v1': '{зіпсовано' }).authorInfoFor('me', 'x')), Object.assign({ name: 'x', gender: null }, NEUTRAL));
  assert.deepEqual(j(mk({}, { 'budget-author-genders-v1': JSON.stringify({ me: 'x' }) }).authorInfoFor('me', 'x')), Object.assign({ name: 'x', gender: null }, NEUTRAL), 'у кеші невідоме значення = нейтральний');
});
test('довідник: запит читає gender (без created_at), стать кешується для відомих значень; помилка запиту нічого не міняє, але знімає очікування', async () => {
  const rows = [{ id: 'p', display_name: ' Перший ', email: null, gender: 'f' }, { id: 'q', display_name: null, email: 'q@example.test', gender: 'm' }, { id: 'r', display_name: 'Третій', gender: 'інше' }];
  let cols = null;
  const c = mk();
  await c.loadFamilyUsersDirectory({ from: () => ({ select: async cl => { cols = cl; return { data: rows, error: null }; } }) });
  assert.match(cols, /gender/); assert.ok(!/created_at/.test(cols), 'порядок створення більше не читається');
  assert.deepEqual(j(c.authorInfoFor('p')), Object.assign({ name: 'Перший', gender: 'f' }, PINK));
  assert.deepEqual(j(c.authorInfoFor('q')), Object.assign({ name: 'q@example.test', gender: 'm' }, BLUE));
  assert.deepEqual(j(c.authorInfoFor('r')), Object.assign({ name: 'Третій', gender: null }, NEUTRAL));
  assert.deepEqual(JSON.parse(c.__ls['budget-author-genders-v1']), { p: 'f', q: 'm' }, 'у кеш лише m/f');
  assert.equal(evalInSandbox(c, 'familyUsersLoaded'), true);
  const e = mk({ keep: { name: 'K', gender: 'f' } });
  await e.loadFamilyUsersDirectory({ from: () => ({ select: async () => { throw new Error('мережа'); } }) });
  assert.ok(e.authorInfoFor('keep')); assert.equal(evalInSandbox(e, 'familyUsersLoaded'), true, 'помилка теж знімає очікування');
});
test('localStorage що кидає виняток не ламає ні читання, ні запис', async () => {
  const boom = buildSandbox({ familyUsersById: { u: { name: 'U', gender: 'm' } }, familyUsersLoaded: false, localStorage: { getItem(){ throw new Error('заборонено'); }, setItem(){ throw new Error('заборонено'); } } }, NAMES);
  assert.deepEqual(j(boom.authorInfoFor('u')), Object.assign({ name: 'U', gender: 'm' }, BLUE));
  assert.deepEqual(j(boom.authorInfoFor('x', 'n')), Object.assign({ name: 'n', gender: null }, NEUTRAL));
  await boom.loadFamilyUsersDirectory({ from: () => ({ select: async () => ({ data: [{ id: 'u', display_name: 'U', gender: 'f' }], error: null }) }) });
  assert.equal(boom.authorInfoFor('u').gender, 'f');
});
test('у коді немає зіставлення за іменем і за слотом (порядком створення)', () => {
  const code = SRC.replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, '');
  assert.ok(!/nameLower/.test(code));
  assert.ok(!/AUTHOR_SLOTS|authorSlotsFromUsers|cachedAuthorSlot|created_at, gender/.test(code), 'слоти прибрано');
});
test('перший запуск після оновлення: аватар власника прихований (gender-pending), доки невідома стать, і знімається після довідника; запобіжник 3 с', () => {
  assert.ok(SRC.includes('const slotPending = !!(signedIn && !familyUsersLoaded && cachedAuthorGender(session.user.id) === null);'));
  assert.ok(SRC.includes("face.classList.toggle('slot-pending', slotPending);"));
  assert.match(SRC, /\.avatar-face\.slot-pending\{ opacity:0; \}/);
  assert.ok(SRC.includes('renderProfileUI.__pendingTimer = null; familyUsersLoaded = true; try{ renderProfileUI(); }catch(e){} }, 3000); }'), 'запобіжник 3 с');
  const f = SRC.slice(SRC.indexOf('async function loadFamilyUsersDirectory'), SRC.indexOf('// Rev #30 (6D.62) — кольорове розрізнення авторства (ТЗ користувача); з Rev 2.32.120'));
  assert.match(f, /finally\{ familyUsersLoaded = true; \}/);
});
