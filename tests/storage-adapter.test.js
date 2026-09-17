// Rev #28.B/C — Stage B (docs/ROADMAP.md, п.28): тести ІЗОЛЬОВАНОГО storage
// adapter'а (idb → IndexedDB) — жоден реальний loadX()/saveX() ще не
// викликає ЦЕЙ шар (adapter primitives) напряму, тому тести перевіряють
// лише сам adapter/по-доменну migration routine, а не інтеграцію з рештою
// застосунку (та інтеграція — tests/pilot-repository.test.js, Stage C).
//
// Rev #28.C — прапорець і migration routine стали ПО-ДОМЕННИМИ (замість
// одного глобального boolean і одного "мігрувати все 12 ключів атомарно" —
// див. коментар у index.html над DOMAIN_MIGRATION_KEYS): це виправлення
// внесено ДО написання Repository-routing коду, за явним запитом
// користувача звірити форму прапорця перед стартом Stage C.
//
// Фейкові idb/localStorage — за тим самим принципом, що вже заглушка
// XLSX.SSF.parse_date_code у tests/excel-parsing.test.js: мінімальний
// поверхневий контракт (лише ті методи, які реально викликає adapter —
// get/put/delete під сигнатурою реальної бібліотеки idb), а НЕ повна
// емуляція IDBTransaction/IDBCursor/подій. isIdbLibraryReady() у коді
// адаптера робить loadIdbLibrary() (CDN <script>, потребує document) НЕДО-
// сяжним у жодному з тестів нижче, доки фейковий `idb.openDB` вже присутній
// у sandbox — тому document тут не потрібен узагалі: тестується власна
// логіка adapter'а (валідація/запис/верифікація), не сам idb.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildSandbox, evalInSandbox } = require('./extract');

// Rev #28.B — пастка vm.Context, окрема від уже задокументованої cross-realm
// array/object-порівняння (tests/excel-parsing.test.js): top-level
// `const`/`let` з index.html виконуються в vm.runInContext як лексичні
// біндинги скрипта, а НЕ як власні властивості контекстного об'єкта — тому
// `ctx.LS_KEY_EXP` ззовні є `undefined`, хоча `ctx.someFunction()`
// (function-декларація — вона таки стає властивістю глобального об'єкта)
// працює штатно. Щоб прочитати значення extracted const-и, треба виконати
// вираз ВСЕРЕДИНІ того самого контексту.
function readConst(ctx, name){ return evalInSandbox(ctx, name); }

// Мінімальна заглушка Storage (getItem/setItem/removeItem), in-memory Map.
function fakeLocalStorage(initial){
  const map = new Map(Object.entries(initial || {}));
  return {
    getItem(key){ return map.has(key) ? map.get(key) : null; },
    setItem(key, value){ map.set(key, String(value)); },
    removeItem(key){ map.delete(key); },
    _map: map,
  };
}

// Мінімальна заглушка idb: openDB() повертає об'єкт із get/put/delete під
// сигнатурою реальної бібліотеки idb (storeName, value, key) — той самий
// object store для будь-якого ключа (generic key-value mirror, без
// структурних object store на домен). failOnKey дозволяє тестам симулювати
// збій запису конкретного ключа (для тесту "збій на середині").
function fakeIdb(){
  const store = new Map();
  let failOnKey = null;
  return {
    idb: {
      openDB: async function(name, version, opts){
        if(opts && typeof opts.upgrade === 'function'){
          opts.upgrade({ objectStoreNames: { contains: () => true }, createObjectStore(){} });
        }
        return {
          async get(storeName, key){ return store.has(key) ? store.get(key) : undefined; },
          async put(storeName, value, key){
            if(failOnKey === key) throw new Error(`симульований збій запису "${key}"`);
            store.set(key, value);
          },
          async delete(storeName, key){ store.delete(key); },
        };
      },
    },
    store,
    setFailOnKey(key){ failOnKey = key; },
  };
}

function sandbox({ localStorageInitial, idbImpl } = {}){
  const fakeIdbInstance = idbImpl || fakeIdb();
  const ctx = buildSandbox(
    {
      localStorage: fakeLocalStorage(localStorageInitial),
      idb: fakeIdbInstance.idb,
      idbLoadPromise: null,
      idbDbPromise: null,
    },
    [
      'LS_KEY_EXP', 'LS_KEY_INC', 'LS_KEY_DEBT', 'LS_KEY_BANKS', 'LS_KEY_INSTALLMENTS',
      'LS_KEY_HIDDEN', 'LS_KEY_CATEGORIES', 'LS_KEY_SUBCATEGORIES',
      'LS_KEY_SUBCATEGORY_PRIORITY', 'LS_KEY_DICTIONARY', 'LS_KEY_SCHEMA_VERSION',
      'LS_KEY_IGNORED_DIVERGENCES', 'BACKUP_LS_KEYS',
      'IDB_CDN_URL', 'IDB_DB_NAME', 'IDB_STORE_NAME', 'IDB_DB_VERSION',
      'isIdbLibraryReady', 'loadIdbLibrary', 'openIdbDatabase',
      'idbAdapterGet', 'idbAdapterSet', 'idbAdapterRemove',
      'DOMAIN_MIGRATION_KEYS', 'validateRawStorageValue',
      'LS_KEY_MIGRATION_STATUS', 'getMigrationStatusMap',
      'isDomainMigrated', 'markDomainMigrated',
      'migrateDomainToIndexedDb', 'ensureDomainsMigrated',
    ]
  );
  return { ctx, fakeIdbInstance };
}

// Реалістичні значення для 4 pilot-доменів (Stage C) — довільні, але
// правдоподібні за формою дані кожного домену.
function pilotFixture(){
  return {
    budget_categories_v1: JSON.stringify([{ name: '🍔 Їжа', type: "Гнучка", active: true }]),
    budget_subcategories_v1: JSON.stringify([{ name: 'Кафе', category: '🍔 Їжа', active: true }]),
    budget_subcategory_priority_v1: JSON.stringify({ Кафе: { label: 'Середній', score: 0.65, color: 'warning' } }),
    budget_dictionary_v1: JSON.stringify([{ kw: 'кава', cat: '🍔 Їжа', sub: 'Кафе' }]),
  };
}

/* ============ isIdbLibraryReady ============ */

test('isIdbLibraryReady: idb.openDB присутній → true', () => {
  const { ctx } = sandbox();
  assert.equal(ctx.isIdbLibraryReady(), true);
});

test('isIdbLibraryReady: глобальний idb відсутній → false (без document/CDN)', () => {
  const ctx = buildSandbox({ idbLoadPromise: null, idbDbPromise: null }, ['isIdbLibraryReady']);
  assert.equal(ctx.isIdbLibraryReady(), false);
});

/* ============ DOMAIN_MIGRATION_KEYS ============ */

test('DOMAIN_MIGRATION_KEYS: 4 pilot-домени (Stage C) + 4 D1-домени (Rev #28.D1), кожен → свій єдиний ключ', () => {
  const { ctx } = sandbox();
  const map = readConst(ctx, 'DOMAIN_MIGRATION_KEYS');
  assert.deepEqual(Object.keys(map).sort(), [
    'categories', 'dictionary', 'subcategories', 'subcategoryPriority',
    'bankAccounts', 'installmentAccounts', 'hiddenFrom', 'ignoredDivergences',
  ].sort());
  assert.deepEqual(Array.from(map.categories), [readConst(ctx, 'LS_KEY_CATEGORIES')]);
  assert.deepEqual(Array.from(map.dictionary), [readConst(ctx, 'LS_KEY_DICTIONARY')]);
  assert.deepEqual(Array.from(map.bankAccounts), [readConst(ctx, 'LS_KEY_BANKS')]);
  assert.deepEqual(Array.from(map.installmentAccounts), [readConst(ctx, 'LS_KEY_INSTALLMENTS')]);
  assert.deepEqual(Array.from(map.hiddenFrom), [readConst(ctx, 'LS_KEY_HIDDEN')]);
  assert.deepEqual(Array.from(map.ignoredDivergences), [readConst(ctx, 'LS_KEY_IGNORED_DIVERGENCES')]);
});

/* ============ validateRawStorageValue ============ */

test('validateRawStorageValue: валідний JSON для звичайного ключа → valid', () => {
  const { ctx } = sandbox();
  const r = ctx.validateRawStorageValue(readConst(ctx, 'LS_KEY_CATEGORIES'), '[]');
  assert.equal(r.valid, true);
});

test('validateRawStorageValue: пошкоджений JSON → invalid з причиною', () => {
  const { ctx } = sandbox();
  const r = ctx.validateRawStorageValue(readConst(ctx, 'LS_KEY_CATEGORIES'), '{не json');
  assert.equal(r.valid, false);
  assert.match(r.reason, /пошкоджений JSON/);
});

test('validateRawStorageValue: LS_KEY_SCHEMA_VERSION — голе число (не JSON) → valid', () => {
  const { ctx } = sandbox();
  assert.equal(ctx.validateRawStorageValue(readConst(ctx, 'LS_KEY_SCHEMA_VERSION'), '1').valid, true);
});

test('validateRawStorageValue: LS_KEY_SCHEMA_VERSION — нечислове значення → invalid', () => {
  const { ctx } = sandbox();
  const r = ctx.validateRawStorageValue(readConst(ctx, 'LS_KEY_SCHEMA_VERSION'), 'не число');
  assert.equal(r.valid, false);
});

test('validateRawStorageValue: відсутній ключ (null) → valid (нема що мігрувати)', () => {
  const { ctx } = sandbox();
  assert.equal(ctx.validateRawStorageValue(readConst(ctx, 'LS_KEY_CATEGORIES'), null).valid, true);
});

/* ============ idbAdapterGet/Set/Remove ============ */

test('idbAdapterSet + idbAdapterGet: round-trip через generic key-value store', async () => {
  const { ctx } = sandbox();
  await ctx.idbAdapterSet('budget_categories_v1', '[{"name":"Їжа"}]');
  const back = await ctx.idbAdapterGet('budget_categories_v1');
  assert.equal(back, '[{"name":"Їжа"}]');
});

test('idbAdapterRemove: видаляє ключ, наступний get повертає undefined', async () => {
  const { ctx } = sandbox();
  await ctx.idbAdapterSet('k', 'v');
  await ctx.idbAdapterRemove('k');
  assert.equal(await ctx.idbAdapterGet('k'), undefined);
});

/* ============ isDomainMigrated / markDomainMigrated ============ */

test('markDomainMigrated: позначає лише ОДИН домен, решта лишаються false', () => {
  const { ctx, fakeIdbInstance } = sandbox();
  ctx.markDomainMigrated('categories');
  assert.equal(ctx.isDomainMigrated('categories'), true);
  assert.equal(ctx.isDomainMigrated('subcategories'), false);
  assert.equal(ctx.isDomainMigrated('dictionary'), false);
  assert.equal(fakeIdbInstance.store.has(readConst(ctx, 'LS_KEY_MIGRATION_STATUS')), false); // прапорець лише в localStorage
});

test('markDomainMigrated: викликаний для двох доменів по черзі — обидва true, мапа накопичується (не перезаписується)', () => {
  const { ctx } = sandbox();
  ctx.markDomainMigrated('categories');
  ctx.markDomainMigrated('dictionary');
  assert.equal(ctx.isDomainMigrated('categories'), true);
  assert.equal(ctx.isDomainMigrated('dictionary'), true);
  assert.equal(ctx.isDomainMigrated('subcategories'), false);
});

test('isDomainMigrated: за замовчуванням (свіжий localStorage) → false для будь-якого домену', () => {
  const { ctx } = sandbox();
  assert.equal(ctx.isDomainMigrated('categories'), false);
});

test('isDomainMigrated: пошкоджений JSON у LS_KEY_MIGRATION_STATUS → false, не кидає', () => {
  const migrationKey = 'budget_migration_status_v1';
  const { ctx } = sandbox({ localStorageInitial: { [migrationKey]: '{зіпсовано' } });
  assert.equal(ctx.isDomainMigrated('categories'), false);
});

/* ============ migrateDomainToIndexedDb: успіх ============ */

test('migrateDomainToIndexedDb: домен з одним ключем мігровано і верифіковано → success', async () => {
  const fixture = pilotFixture();
  const { ctx, fakeIdbInstance } = sandbox({ localStorageInitial: fixture });
  const result = await ctx.migrateDomainToIndexedDb('categories');
  assert.equal(result.success, true);
  assert.equal(fakeIdbInstance.store.get('budget_categories_v1'), fixture.budget_categories_v1);
});

test('migrateDomainToIndexedDb: мігрує ЛИШЕ ключі свого домену, не чіпає інші pilot-ключі', async () => {
  const fixture = pilotFixture();
  const { ctx, fakeIdbInstance } = sandbox({ localStorageInitial: fixture });
  await ctx.migrateDomainToIndexedDb('categories');
  assert.equal(fakeIdbInstance.store.has('budget_subcategories_v1'), false);
  assert.equal(fakeIdbInstance.store.has('budget_dictionary_v1'), false);
});

test('migrateDomainToIndexedDb: успіх НЕ встановлює прапорець сам (окрема дія markDomainMigrated)', async () => {
  const { ctx } = sandbox({ localStorageInitial: pilotFixture() });
  await ctx.migrateDomainToIndexedDb('categories');
  assert.equal(ctx.isDomainMigrated('categories'), false);
});

test('migrateDomainToIndexedDb: успіх не чіпає localStorage', async () => {
  const fixture = pilotFixture();
  const { ctx } = sandbox({ localStorageInitial: fixture });
  await ctx.migrateDomainToIndexedDb('categories');
  assert.equal(ctx.localStorage.getItem('budget_categories_v1'), fixture.budget_categories_v1);
});

/* ============ migrateDomainToIndexedDb: збій запису ============ */

test('migrateDomainToIndexedDb: збій запису → failure, прапорець не встановлюється, localStorage незайманий', async () => {
  const fakeIdbInstance = fakeIdb();
  fakeIdbInstance.setFailOnKey('budget_dictionary_v1');
  const fixture = pilotFixture();
  const { ctx } = sandbox({ localStorageInitial: fixture, idbImpl: fakeIdbInstance });
  const result = await ctx.migrateDomainToIndexedDb('dictionary');
  assert.equal(result.success, false);
  assert.match(result.error, /Запис у IndexedDB не вдався/);
  assert.equal(ctx.isDomainMigrated('dictionary'), false);
  assert.equal(ctx.localStorage.getItem('budget_dictionary_v1'), fixture.budget_dictionary_v1);
});

/* ============ migrateDomainToIndexedDb: ідемпотентність ============ */

test('migrateDomainToIndexedDb: якщо домен уже мігровано → no-op, IndexedDB вдруге не переписується', async () => {
  const { ctx, fakeIdbInstance } = sandbox({ localStorageInitial: pilotFixture() });
  ctx.markDomainMigrated('categories');
  fakeIdbInstance.store.set('sentinel', 'не має бути перезаписано чи очищено');
  const result = await ctx.migrateDomainToIndexedDb('categories');
  assert.equal(result.success, true);
  assert.equal(result.skipped, true);
  assert.equal(fakeIdbInstance.store.get('sentinel'), 'не має бути перезаписано чи очищено');
});

/* ============ migrateDomainToIndexedDb: пошкоджений/відсутній ключ ============ */

test('migrateDomainToIndexedDb: пошкоджений JSON у ключі домену → failure ДО будь-якого запису', async () => {
  const fixture = pilotFixture();
  fixture.budget_categories_v1 = '{зіпсований json';
  const { ctx, fakeIdbInstance } = sandbox({ localStorageInitial: fixture });
  const result = await ctx.migrateDomainToIndexedDb('categories');
  assert.equal(result.success, false);
  assert.match(result.error, /Валідація не пройдена/);
  assert.equal(fakeIdbInstance.store.size, 0);
});

test('migrateDomainToIndexedDb: відсутній ключ домену (не пошкоджений, просто нема) → success, нічого не пишеться', async () => {
  const { ctx, fakeIdbInstance } = sandbox({ localStorageInitial: {} });
  const result = await ctx.migrateDomainToIndexedDb('categories');
  assert.equal(result.success, true);
  assert.equal(fakeIdbInstance.store.has('budget_categories_v1'), false);
});

/* ============ ensureDomainsMigrated: init-time orchestrator ============ */

test('ensureDomainsMigrated: мігрує і позначає ВСІ 4 pilot-домени за один прогін', async () => {
  const { ctx, fakeIdbInstance } = sandbox({ localStorageInitial: pilotFixture() });
  await ctx.ensureDomainsMigrated(['categories', 'subcategories', 'subcategoryPriority', 'dictionary']);
  assert.equal(ctx.isDomainMigrated('categories'), true);
  assert.equal(ctx.isDomainMigrated('subcategories'), true);
  assert.equal(ctx.isDomainMigrated('subcategoryPriority'), true);
  assert.equal(ctx.isDomainMigrated('dictionary'), true);
  const fixture = pilotFixture();
  for(const key of Object.keys(fixture)) assert.equal(fakeIdbInstance.store.get(key), fixture[key]);
});

test('ensureDomainsMigrated: збій ОДНОГО домену не зупиняє спробу для решти (кожен домен незалежний)', async () => {
  const fakeIdbInstance = fakeIdb();
  fakeIdbInstance.setFailOnKey('budget_subcategories_v1');
  const { ctx } = sandbox({ localStorageInitial: pilotFixture(), idbImpl: fakeIdbInstance });
  await ctx.ensureDomainsMigrated(['categories', 'subcategories', 'subcategoryPriority', 'dictionary']);
  assert.equal(ctx.isDomainMigrated('categories'), true);
  assert.equal(ctx.isDomainMigrated('subcategories'), false); // збій — тихо лишається на localStorage
  assert.equal(ctx.isDomainMigrated('subcategoryPriority'), true);
  assert.equal(ctx.isDomainMigrated('dictionary'), true);
});

test('ensureDomainsMigrated: повторний виклик, коли всі вже мігровані → жодного нового запису в IndexedDB', async () => {
  const { ctx, fakeIdbInstance } = sandbox({ localStorageInitial: pilotFixture() });
  await ctx.ensureDomainsMigrated(['categories', 'subcategories', 'subcategoryPriority', 'dictionary']);
  fakeIdbInstance.store.set('sentinel', 'no-touch');
  await ctx.ensureDomainsMigrated(['categories', 'subcategories', 'subcategoryPriority', 'dictionary']);
  assert.equal(fakeIdbInstance.store.get('sentinel'), 'no-touch');
});
