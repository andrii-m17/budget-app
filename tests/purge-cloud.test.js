// Rev 2.32.76 (PURGE-1) — «Видалити назавжди»: Cloud-крок для будь-якої назви, пошук за назвою при порожньому cloudId, явні помилки, строк надгробка в тості.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const ex = require('./extract');

const NAMES = ['TRASH_PURGEABLE_TYPES', 'findLiveCloudId', 'isAccountTrashType', 'isTaxonomyTrashType', 'purgeAccountPlan', 'purgeTaxonomyPlan', 'taxonomyUsage', 'purgeBlockedReason',
  'runAccountPurge', 'runTaxonomyPurge', 'runTrashPurgeCore', 'purgeCloudRow'];
const J = v => JSON.parse(JSON.stringify(v));

// Фальшивий клієнт: ланцюжок from().select/update/delete/eq/is/not/maybeSingle().select() → Promise за респондером.
function fakeClient(respond){
  const calls = [];
  return {
    calls,
    from(table){
      const q = { table, op: null, filters: [], payload: null, single: false };
      const chain = {
        select(){ if(!q.op) q.op = 'select'; return chain; }, update(p){ q.op = 'update'; q.payload = p; return chain; }, delete(){ q.op = 'delete'; return chain; },
        eq(c, v){ q.filters.push(['eq', c, v]); return chain; }, is(c, v){ q.filters.push(['is', c, v]); return chain; }, not(c, o, v){ q.filters.push(['not', c, v]); return chain; },
        neq(c, v){ q.filters.push(['neq', c, v]); return chain; }, maybeSingle(){ q.single = true; return chain; },
        then(res, rej){ calls.push(q); return Promise.resolve(respond(q)).then(res, rej); },
      };
      return chain;
    },
  };
}
function make(opts){
  const o = opts || {};
  const toasts = [], local = [];
  const client = fakeClient(o.respond || function(){ return { data: [], error: null }; });
  const g = {
    getSupabaseClient: function(){ return client; }, cloudFamilyId: 'fam', cloudSession: { user: { id: 'u1' } },
    showTextToast: function(t, k){ toasts.push({ t, k }); }, captureDebugGeometry: function(){}, debugRecordingActive: false, trashDetailKey: null, closeTrashDetail: function(){},
    renderTrashScreen: function(){}, showTaxonomyBlocked: function(){ local.push('blocked'); },
    isTestSyncIgnored: function(){ return true; }, // ізоляція тестових імен УВІМКНЕНА: на видалення назавжди вона не діє
    isTrashOffline: function(){ return !!o.offline; }, isMonthRecordType: function(t){ return t === 'debtMonth' || t === 'installmentMonth'; },
    trashStateNow: function(){ return o.state; },
    CATEGORIES: (o.state && o.state.categories) || [], SUBCATEGORIES: (o.state && o.state.subcategories) || [],
    applyAccountRemovalLocally: async function(plan){ local.push('account:' + plan.name); return { debts: 0, monthsRemoved: 0, unlinkedExpenses: 0 }; }, rememberPurgedAccount: function(){},
    applyTaxonomyRemovalLocally: async function(plan){ local.push('taxonomy:' + plan.name); return { subcategories: 0, words: 0 }; }, rememberPurgedTaxonomy: function(){},
    removeTrashLocally: async function(keys){ local.push('trash:' + keys.join(',')); },
    DICTIONARY: o.dictionary || [], pullExpensesPilot: function(){ local.push('pull-expenses'); }, pullIncomesPilot: function(){}, pullDebtsPilot: function(){}, pullDictionaryPilot: function(){},
  };
  const c = ex.buildSandbox(g, NAMES);
  c.__toasts = toasts; c.__local = local; c.__client = client;
  return c;
}
const accItem = { type: 'card', title: 'TRASH-TEST-X', key: 'card:TRASH-TEST-X' };
const stateWithCard = (cloudId, name) => ({ bankAccounts: [{ name: name || 'TRASH-TEST-X', cloudId }], installmentAccounts: [], debts: [{ id: 'd1', kind: 'card', name: name || 'TRASH-TEST-X', month: '2026-10' }], expenses: [], hiddenFrom: { ['card:' + (name || 'TRASH-TEST-X')]: {} } });

test('PURGE-1: тестова назва з cloudId — Cloud-кроки йдуть (борги → приховане → рахунок), ізоляція не блокує; тост «Видалено назавжди» без строку надгробка', async function(){
  const c = make({ state: stateWithCard('cid-1') });
  await c.runAccountPurge(accItem);
  const ops = c.__client.calls.map(q => q.op + ':' + q.table);
  assert.deepEqual(ops, ['update:debts', 'delete:hidden_entities', 'update:bank_accounts']);
  assert.deepEqual(J(c.__client.calls[2].filters).filter(f => f[1] === 'id'), [['eq', 'id', 'cid-1']]);
  assert.deepEqual(c.__local, ['account:TRASH-TEST-X']);
  assert.equal(c.__toasts[0].t, 'Видалено назавжди');
  assert.equal(c.__toasts[0].k, 'success');
});
test('PURGE-1: порожній cloudId — пошук за назвою; знайдено → кроки з цим id; не знайдено → лише локально', async function(){
  let c = make({ state: stateWithCard(null, 'Нова'), respond: q => q.single ? { data: { id: 'found-1' }, error: null } : { data: [], error: null } });
  await c.runAccountPurge({ type: 'card', title: 'Нова', key: 'card:Нова' });
  const ops = c.__client.calls.map(q => q.op + ':' + q.table);
  assert.deepEqual(ops, ['select:bank_accounts', 'update:debts', 'delete:hidden_entities', 'update:bank_accounts']);
  assert.deepEqual(J(c.__client.calls[0].filters), [['eq', 'family_id', 'fam'], ['eq', 'name', 'Нова'], ['is', 'deleted_at', null]]);
  assert.deepEqual(J(c.__client.calls[1].filters).filter(f => f[1] === 'bank_account_id'), [['eq', 'bank_account_id', 'found-1']]);
  c = make({ state: stateWithCard(null, 'Нова'), respond: () => ({ data: null, error: null }) });
  await c.runAccountPurge({ type: 'card', title: 'Нова', key: 'card:Нова' });
  assert.deepEqual(c.__client.calls.map(q => q.op), ['select']);
  assert.deepEqual(c.__local, ['account:Нова']);
  assert.equal(c.__toasts[0].t, 'Видалено назавжди');
});
test('PURGE-1: помилка пошуку за назвою або будь-якого Cloud-кроку — явна помилка, локальний запис на місці', async function(){
  let c = make({ state: stateWithCard(null, 'Нова'), respond: () => ({ data: null, error: { message: 'x' } }) });
  await c.runAccountPurge({ type: 'card', title: 'Нова', key: 'card:Нова' });
  assert.deepEqual(c.__local, []); assert.equal(c.__toasts[0].k, 'error'); assert.match(c.__toasts[0].t, /Не вдалося видалити назавжди/);
  for(const failAt of ['debts', 'hidden_entities', 'bank_accounts']){
    c = make({ state: stateWithCard('cid-1'), respond: q => q.table === failAt ? { data: null, error: { message: 'rls' } } : { data: [], error: null } });
    await c.runAccountPurge(accItem);
    assert.deepEqual(c.__local, [], failAt); assert.equal(c.__toasts[0].k, 'error', failAt);
  }
  c = make({ state: stateWithCard('cid-1'), respond: () => { throw new Error('network'); } });
  await c.runAccountPurge(accItem);
  assert.deepEqual(c.__local, []); assert.equal(c.__toasts[0].k, 'error');
});
const taxState = () => ({ categories: [{ name: 'Тест1', active: false, cloudId: null }, { name: 'Батько', active: true, cloudId: 'p1' }], subcategories: [{ name: 'Під', category: 'Батько', active: false, cloudId: null }], dictionary: [], expenses: [] });
test('PURGE-1: категорія з порожнім cloudId — пошук за назвою, кроки слова → підкатегорії → категорія з знайденим id', async function(){
  const c = make({ state: taxState(), respond: q => q.single ? { data: { id: 'cat-9' }, error: null } : { data: [], error: null } });
  await c.runTaxonomyPurge({ type: 'category', title: 'Тест1', key: 'category:Тест1' });
  assert.deepEqual(c.__client.calls.map(q => q.op + ':' + q.table), ['select:categories', 'update:dictionary', 'update:subcategories', 'update:categories']);
  assert.deepEqual(J(c.__client.calls[3].filters).filter(f => f[1] === 'id'), [['eq', 'id', 'cat-9']]);
  assert.deepEqual(c.__local, ['taxonomy:Тест1']);
  assert.equal(c.__toasts[0].t, 'Видалено назавжди');
});
test('PURGE-1: підкатегорія з порожнім cloudId — спершу відомий cloudId батька, потім пошук за (назва, category_id)', async function(){
  const c = make({ state: taxState(), respond: q => q.single ? { data: { id: 'sub-7' }, error: null } : { data: [], error: null } });
  await c.runTaxonomyPurge({ type: 'subcategory', title: 'Під', category: 'Батько', key: 'subcategory:Під' });
  const first = c.__client.calls[0];
  assert.equal(first.table, 'subcategories');
  assert.ok(J(first.filters).some(f => f[1] === 'category_id' && f[2] === 'p1'));
  assert.deepEqual(c.__client.calls.map(q => q.op + ':' + q.table), ['select:subcategories', 'update:dictionary', 'update:subcategories']);
});
test('PURGE-1: помилка Cloud-кроку категорії — явна помилка, нічого локально', async function(){
  const c = make({ state: taxState(), respond: q => q.table === 'categories' && q.op === 'update' ? { data: null, error: { message: 'rls' } } : (q.single ? { data: { id: 'c9' }, error: null } : { data: [], error: null }) });
  await c.runTaxonomyPurge({ type: 'category', title: 'Тест1', key: 'category:Тест1' });
  assert.deepEqual(c.__local, []); assert.equal(c.__toasts[0].k, 'error');
});
test('PURGE-1: витрата: DELETE лише надгробка (not deleted_at is null); «вже видалено» — нейтральний тост (info), не помилка', async function(){
  // DELETE нічого не видалив (data []), а контрольний select не знаходить рядка → outcome 'gone'
  const c = make({ state: {}, respond: q => q.single ? { data: null, error: null } : { data: [], error: null } });
  await c.runTrashPurgeCore({ type: 'expense', id: 'e1', key: 'expense:e1', title: 'x' });
  const del = c.__client.calls[0];
  assert.equal(del.op, 'delete'); assert.ok(J(del.filters).some(f => f[0] === 'not' && f[1] === 'deleted_at'));
  assert.equal(c.__toasts[0].t, 'Запис уже видалено назавжди'); assert.equal(c.__toasts[0].k, 'info');
  assert.deepEqual(c.__local, ['trash:expense:e1']);
});
test('PURGE-1: офлайн — запитів немає, запис на місці, явний тост', async function(){
  const c = make({ state: stateWithCard('cid-1'), offline: true });
  await c.runTrashPurgeCore(accItem);
  assert.equal(c.__client.calls.length, 0); assert.deepEqual(c.__local, []); assert.equal(c.__toasts[0].k, 'error');
});

test('PURGE-1: «alive» (запис відновлено на іншому пристрої) — не видаляється, явний тост, pull, локально на місці', async function(){
  const c = make({ state: {}, respond: q => q.op === 'delete' ? { data: [], error: null } : { data: { id: 'e1', deleted_at: null }, error: null } });
  await c.runTrashPurgeCore({ type: 'expense', id: 'e1', key: 'expense:e1', title: 'x' });
  assert.deepEqual(c.__local, ['pull-expenses']);
  assert.equal(c.__toasts[0].k, 'error'); assert.match(c.__toasts[0].t, /відновлено на іншому пристрої/);
});
test('PURGE-1: дохід, слово, місячний борг, ОЧ-місяць — DELETE лише надгробка у своїй таблиці; результат «Видалено назавжди»', async function(){
  const cases = [
    [{ type: 'income', id: 'i1', key: 'income:i1', title: 'x' }, 'incomes', null],
    [{ type: 'debtMonth', id: 'd1', key: 'debtMonth:d1', title: 'x' }, 'debts', null],
    [{ type: 'installmentMonth', id: 'd2', key: 'installmentMonth:d2', title: 'x' }, 'debts', null],
    [{ type: 'word', id: 'w1', key: 'word:w1', title: 'k' }, 'dictionary', [{ id: 'w1', kw: 'k', cloudId: 'wc1', deletedAt: 'x' }]],
  ];
  for(const [item, table, dict] of cases){
    const c = make({ state: {}, dictionary: dict || [], respond: q => q.op === 'delete' ? { data: [{ id: 'z' }], error: null } : { data: [], error: null } });
    await c.runTrashPurgeCore(item);
    const del = c.__client.calls.find(q => q.op === 'delete');
    assert.ok(del, item.type + ' ' + JSON.stringify(c.__toasts) + JSON.stringify(c.__client.calls.map(q => q.op + q.table)));
    assert.equal(del.table, table, item.type);
    assert.ok(J(del.filters).some(f => f[0] === 'not' && f[1] === 'deleted_at'), item.type);
    assert.equal(c.__toasts[0].t, 'Видалено назавжди', item.type); assert.equal(c.__toasts[0].k, 'success', item.type);
    assert.deepEqual(c.__local, ['trash:' + item.key], item.type);
  }
});
test('PURGE-1: ОЧ — кроки по installment_account_id / installment_accounts, тест-назва з cloudId, тост без підпису про строк', async function(){
  const st = { bankAccounts: [], installmentAccounts: [{ name: 'TRASH-TEST-OC', cloudId: 'ic1' }], debts: [], expenses: [], hiddenFrom: {} };
  const c = make({ state: st });
  await c.runAccountPurge({ type: 'installment', title: 'TRASH-TEST-OC', key: 'installment:TRASH-TEST-OC' });
  assert.deepEqual(c.__client.calls.map(q => q.op + ':' + q.table), ['update:debts', 'delete:hidden_entities', 'update:installment_accounts']);
  assert.ok(J(c.__client.calls[0].filters).some(f => f[1] === 'installment_account_id' && f[2] === 'ic1'));
  assert.ok(J(c.__client.calls[1].filters).some(f => f[1] === 'entity_type' && f[2] === 'installment'));
  assert.equal(c.__toasts[0].t, 'Видалено назавжди');
});
test('PURGE-1: категорія з відомим cloudId — без пошуку за назвою; неоднозначна назва (помилка maybeSingle) — явна помилка; підкатегорія з невідомим батьком — лише локально', async function(){
  const st = { categories: [{ name: 'К', active: false, cloudId: 'k1' }], subcategories: [], dictionary: [], expenses: [] };
  let c = make({ state: st });
  await c.runTaxonomyPurge({ type: 'category', title: 'К', key: 'category:К' });
  assert.deepEqual(c.__client.calls.map(q => q.op + ':' + q.table), ['update:dictionary', 'update:subcategories', 'update:categories']);
  c = make({ state: taxState(), respond: q => q.single ? { data: null, error: { code: 'PGRST116' } } : { data: [], error: null } });
  await c.runTaxonomyPurge({ type: 'category', title: 'Тест1', key: 'category:Тест1' });
  assert.deepEqual(c.__local, []); assert.equal(c.__toasts[0].k, 'error');
  const noParent = { categories: [], subcategories: [{ name: 'Під', category: 'Невідомий', active: false, cloudId: null }], dictionary: [], expenses: [] };
  c = make({ state: noParent, respond: () => ({ data: null, error: null }) });
  await c.runTaxonomyPurge({ type: 'subcategory', title: 'Під', category: 'Невідомий', key: 'subcategory:Під' });
  assert.deepEqual(c.__client.calls.map(q => q.table), ['categories']);
  assert.deepEqual(c.__local, ['taxonomy:Під']); assert.equal(c.__toasts[0].t, 'Видалено назавжди');
});
