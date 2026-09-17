// Rev #28.C — Stage C (docs/ROADMAP.md, п.28): тести Repository-routing для
// 4 pilot-доменів (categories/subcategories/subcategoryPriority/
// dictionary) — loadX()/saveX() самі обирають localStorage чи IndexedDB
// через isDomainMigrated(), і backup/restore (buildBackupPayloadData()/
// applyBackupData(), витягнуті з exportBackup()/handleRestoreBackupFile()
// саме заради цієї тестованості) лишаються storage-agnostic: викликають ті
// самі Repository-функції, не звертаються до localStorage/adapter напряму.
//
// loadAll() (10 інших доменів — expenses/incomes/debts/…) НЕ під тестом
// тут — глибоко DOM-залежна (populateMonths/renderAll/renderStructure), і
// applyBackupData()/loadStructureRefs()-цикл викликає її лише як частину
// повного відновлення. Підмінена заглушкою-no-op (той самий принцип, що
// стаб XLSX.SSF.parse_date_code в tests/excel-parsing.test.js) — тести тут
// перевіряють ЛИШЕ 4 pilot-домени, а не інтеграцію з рештою застосунку.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildSandbox, evalInSandbox } = require('./extract');

// Та сама пастка vm.Context, що вже tests/storage-adapter.test.js — const/
// let з index.html не стають властивостями контекстного об'єкта, читати
// значення треба виразом ВСЕРЕДИНІ контексту.
function readConst(ctx, name){ return evalInSandbox(ctx, name); }

// Та сама cross-realm пастка, що вже tests/excel-parsing.test.js: значення
// (масиви/об'єкти), повернуті чи присвоєні всередині vm.Context, живуть в
// ІНШОМУ реалмі — assert.deepEqual падає навіть при структурному збігу.
// JSON-round-trip нормалізує їх як звичайні дані головного реалму.
function plain(x){ return JSON.parse(JSON.stringify(x)); }

function fakeLocalStorage(initial){
  const map = new Map(Object.entries(initial || {}));
  return {
    getItem(key){ return map.has(key) ? map.get(key) : null; },
    setItem(key, value){ map.set(key, String(value)); },
    removeItem(key){ map.delete(key); },
  };
}

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

const REPOSITORY_NAMES = [
  // consts, у безпечному порядку (DOMAIN_MIGRATION_KEYS/BACKUP_LS_KEYS
  // залежать від LS_KEY_* на top-level, мусять іти пізніше)
  'LS_KEY_CATEGORIES', 'LS_KEY_SUBCATEGORIES', 'LS_KEY_SUBCATEGORY_PRIORITY', 'LS_KEY_DICTIONARY',
  'LS_KEY_EXP', 'LS_KEY_INC', 'LS_KEY_DEBT', 'LS_KEY_BANKS', 'LS_KEY_INSTALLMENTS',
  'LS_KEY_HIDDEN', 'LS_KEY_SCHEMA_VERSION', 'LS_KEY_IGNORED_DIVERGENCES',
  'BACKUP_LS_KEYS',
  'DEFAULT_CATEGORIES', 'DEFAULT_SUBCATEGORIES', 'DEFAULT_SUBCATEGORY_PRIORITY', 'DEFAULT_DICTIONARY',
  'IDB_CDN_URL', 'IDB_DB_NAME', 'IDB_STORE_NAME', 'IDB_DB_VERSION',
  'DOMAIN_MIGRATION_KEYS', 'LS_KEY_MIGRATION_STATUS',
  // functions (порядок не критичний — function-декларації хойстяться в
  // межах одного vm.runInContext-скрипта, лише const-const залежності вище
  // потребують порядку)
  'isIdbLibraryReady', 'loadIdbLibrary', 'openIdbDatabase',
  'idbAdapterGet', 'idbAdapterSet', 'idbAdapterRemove',
  'validateRawStorageValue', 'getMigrationStatusMap', 'isDomainMigrated', 'markDomainMigrated',
  'migrateDomainToIndexedDb', 'ensureDomainsMigrated',
  'loadCategories', 'loadSubcategories', 'loadSubcategoryPriority', 'loadDictionary', 'loadStructureRefs',
  'saveCategories', 'saveSubcategories', 'saveSubcategoryPriority', 'saveDictionary',
  'restoreCategoriesFromBackup', 'restoreSubcategoriesFromBackup',
  'restoreSubcategoryPriorityFromBackup', 'restoreDictionaryFromBackup',
  'pilotBackupKeys', 'pilotBackupValue', 'buildBackupPayloadData', 'applyBackupData',
];

function sandbox({ localStorageInitial, idbImpl } = {}){
  const fakeIdbInstance = idbImpl || fakeIdb();
  const ctx = buildSandbox(
    {
      localStorage: fakeLocalStorage(localStorageInitial),
      idb: fakeIdbInstance.idb,
      idbLoadPromise: null,
      idbDbPromise: null,
      CATEGORIES: [],
      SUBCATEGORIES: [],
      SUBCATEGORY_PRIORITY: {},
      DICTIONARY: [],
      // Rev #28.C — 10 інших доменів (Stage D) не під тестом тут; loadAll()
      // сама глибоко DOM-залежна (populateMonths/renderAll/renderStructure) —
      // applyBackupData() її викликає як частину повного відновлення, тому
      // підміняємо no-op заглушкою, щоб тестувати ЛИШЕ 4 pilot-домени.
      loadAll: async function(){},
      // reportSaveResult (Rev #28.C BugFix, loadCategories()/…) звертається
      // до document.getElementById() для storage-error-banner — DOM-шар,
      // не під тестом тут (UI-показ помилки перевіряється окремо в майбутніх
      // тестах на реальний DOM/браузер). Підміняємо прозорим pass-through.
      reportSaveResult: function(r){ return r; },
    },
    REPOSITORY_NAMES
  );
  return { ctx, fakeIdbInstance };
}

function pilotFixture(){
  return {
    categories: [{ name: '🍔 Їжа', type: "Гнучка", active: true }],
    subcategories: [{ name: 'Кафе', category: '🍔 Їжа', active: true }],
    subcategoryPriority: { Кафе: { label: 'Середній', score: 0.65, color: 'warning' } },
    dictionary: [{ kw: 'кава', cat: '🍔 Їжа', sub: 'Кафе' }],
  };
}

/* ============ loadCategories: routing ============ */

test('loadCategories: домен не мігровано → читає з localStorage, IndexedDB не чіпає', async () => {
  const fixture = pilotFixture();
  const { ctx, fakeIdbInstance } = sandbox({
    localStorageInitial: { budget_categories_v1: JSON.stringify(fixture.categories) },
  });
  await ctx.loadCategories();
  assert.deepEqual(plain(ctx.CATEGORIES), fixture.categories);
  assert.equal(fakeIdbInstance.store.size, 0);
});

test('loadCategories: домен мігровано → читає з IndexedDB, ігнорує (застаріле) значення localStorage', async () => {
  const fixture = pilotFixture();
  const { ctx, fakeIdbInstance } = sandbox({
    localStorageInitial: { budget_categories_v1: JSON.stringify([{ name: 'СТАРЕ', type: 'Гнучка', active: true }]) },
  });
  ctx.markDomainMigrated('categories');
  fakeIdbInstance.store.set('budget_categories_v1', JSON.stringify(fixture.categories));
  await ctx.loadCategories();
  assert.deepEqual(plain(ctx.CATEGORIES), fixture.categories);
});

test('loadCategories: BugFix — домен мігровано, але в IndexedDB ще немає значення → DEFAULT_CATEGORIES і одразу зберігається В IndexedDB (не тихо скидається щоразу)', async () => {
  // Виявлено живою перевіркою в браузері: щойно мігрований домен, чий ключ
  // ще НІКОЛИ не мав значення (напр. до міграції в localStorage не було
  // жодного запису), без цього фіксу отримував би DEFAULT_CATEGORIES при
  // КОЖНОМУ старті, ніколи не зберігаючи їх у IndexedDB.
  const { ctx, fakeIdbInstance } = sandbox({ localStorageInitial: {} });
  ctx.markDomainMigrated('categories');
  await ctx.loadCategories();
  assert.deepEqual(plain(ctx.CATEGORIES), plain(readConst(ctx, 'DEFAULT_CATEGORIES')));
  assert.equal(fakeIdbInstance.store.get('budget_categories_v1'), JSON.stringify(ctx.CATEGORIES));
  // Наступний виклик loadCategories() (симуляція наступного старту) вже
  // читає щойно збережене значення з IndexedDB, не пише вдруге.
  fakeIdbInstance.store.set('sentinel', 'no-rewrite');
  await ctx.loadCategories();
  assert.equal(fakeIdbInstance.store.get('sentinel'), 'no-rewrite');
});

test('loadCategories: перший запуск (немає ключа в localStorage) → DEFAULT_CATEGORIES і одразу зберігається', async () => {
  const { ctx } = sandbox({ localStorageInitial: {} });
  await ctx.loadCategories();
  assert.deepEqual(plain(ctx.CATEGORIES), plain(readConst(ctx, 'DEFAULT_CATEGORIES')));
  assert.equal(ctx.localStorage.getItem('budget_categories_v1'), JSON.stringify(ctx.CATEGORIES));
});

/* ============ saveCategories: routing + помилка ============ */

test('saveCategories: домен не мігровано → пише в localStorage, повертає success', async () => {
  const { ctx } = sandbox();
  ctx.CATEGORIES = [{ name: 'X', type: 'Гнучка', active: true }];
  const result = await ctx.saveCategories();
  assert.equal(result.success, true);
  assert.equal(ctx.localStorage.getItem('budget_categories_v1'), JSON.stringify(ctx.CATEGORIES));
});

test('saveCategories: домен мігровано → пише в IndexedDB, НЕ в localStorage', async () => {
  const { ctx, fakeIdbInstance } = sandbox();
  ctx.markDomainMigrated('categories');
  ctx.CATEGORIES = [{ name: 'X', type: 'Гнучка', active: true }];
  const result = await ctx.saveCategories();
  assert.equal(result.success, true);
  assert.equal(fakeIdbInstance.store.get('budget_categories_v1'), JSON.stringify(ctx.CATEGORIES));
  assert.equal(ctx.localStorage.getItem('budget_categories_v1'), null);
});

test('saveCategories: домен мігровано, IndexedDB кидає → { success:false, error } (без silent retry)', async () => {
  const fakeIdbInstance = fakeIdb();
  fakeIdbInstance.setFailOnKey('budget_categories_v1');
  const { ctx } = sandbox({ idbImpl: fakeIdbInstance });
  ctx.markDomainMigrated('categories');
  ctx.CATEGORIES = [{ name: 'X', type: 'Гнучка', active: true }];
  const result = await ctx.saveCategories();
  assert.equal(result.success, false);
  assert.match(result.error, /симульований збій/);
});

/* ============ Acceptance: mixed-storage export → restore ============ */

test('acceptance: mixed-storage (частина доменів мігрована, частина ні) — export потім restore відтворює повний стан усіх 4 доменів', async () => {
  const fixture = pilotFixture();
  const { ctx, fakeIdbInstance } = sandbox({
    localStorageInitial: {
      // subcategories/subcategoryPriority — ще на localStorage
      budget_subcategories_v1: JSON.stringify(fixture.subcategories),
      budget_subcategory_priority_v1: JSON.stringify(fixture.subcategoryPriority),
      // + довільний непілотний ключ (Stage D territory) — має пережити цикл незмінним
      budget_expenses_v1: JSON.stringify([{ id: 'e1', amount: 42 }]),
    },
  });
  // categories/dictionary — вже "мігровані" в IndexedDB
  ctx.markDomainMigrated('categories');
  ctx.markDomainMigrated('dictionary');
  fakeIdbInstance.store.set('budget_categories_v1', JSON.stringify(fixture.categories));
  fakeIdbInstance.store.set('budget_dictionary_v1', JSON.stringify(fixture.dictionary));
  // In-memory стан (як після реального loadStructureRefs() при старті) —
  // buildBackupPayloadData() для pilot-доменів читає САМЕ ЦІ змінні, не сховище напряму.
  ctx.CATEGORIES = fixture.categories;
  ctx.SUBCATEGORIES = fixture.subcategories;
  ctx.SUBCATEGORY_PRIORITY = fixture.subcategoryPriority;
  ctx.DICTIONARY = fixture.dictionary;

  const exportedData = ctx.buildBackupPayloadData();
  // Усі 4 pilot-домени присутні в бекапі однаково, незалежно від того, де
  // фізично лежали (IndexedDB чи localStorage) — саме "storage-agnostic".
  assert.deepEqual(JSON.parse(exportedData.budget_categories_v1), fixture.categories);
  assert.deepEqual(JSON.parse(exportedData.budget_subcategories_v1), fixture.subcategories);
  assert.deepEqual(JSON.parse(exportedData.budget_subcategory_priority_v1), fixture.subcategoryPriority);
  assert.deepEqual(JSON.parse(exportedData.budget_dictionary_v1), fixture.dictionary);

  // Тепер симулюємо "чистий" браузер (усе стерто) і застосовуємо бекап.
  const { ctx: freshCtx, fakeIdbInstance: freshIdb } = sandbox({ localStorageInitial: {} });
  // Той самий mixed-migration стан відтворюємо і в "чистому" застосунку —
  // acceptance-сценарій: restore відбувається в застосунку, що вже частково
  // мігрований (не обов'язково в стані джерела бекапу).
  freshCtx.markDomainMigrated('categories');

  const results = await freshCtx.applyBackupData(exportedData);
  assert.equal(results.categories.success, true);
  assert.equal(results.subcategories.success, true);
  assert.equal(results.subcategoryPriority.success, true);
  assert.equal(results.dictionary.success, true);

  // Повний стан усіх 4 доменів відтворений — незалежно від того, куди КОЖЕН
  // із них фактично записався під час restore.
  assert.deepEqual(plain(freshCtx.CATEGORIES), fixture.categories);
  assert.deepEqual(plain(freshCtx.SUBCATEGORIES), fixture.subcategories);
  assert.deepEqual(plain(freshCtx.SUBCATEGORY_PRIORITY), fixture.subcategoryPriority);
  assert.deepEqual(plain(freshCtx.DICTIONARY), fixture.dictionary);

  // categories мігровано у freshCtx → restore писав в IndexedDB, НЕ localStorage.
  assert.equal(freshIdb.store.get('budget_categories_v1'), JSON.stringify(fixture.categories));
  assert.equal(freshCtx.localStorage.getItem('budget_categories_v1'), null);
  // subcategories/subcategoryPriority/dictionary НЕ мігровані у freshCtx → localStorage.
  assert.equal(freshCtx.localStorage.getItem('budget_subcategories_v1'), JSON.stringify(fixture.subcategories));
  assert.equal(freshCtx.localStorage.getItem('budget_dictionary_v1'), JSON.stringify(fixture.dictionary));
});

test('acceptance: непілотний ключ (Stage D territory) відновлюється прямим localStorage clear→write, як і до Stage C', async () => {
  const { ctx } = sandbox({ localStorageInitial: { budget_expenses_v1: JSON.stringify([{ id: 'stale' }]) } });
  const backupData = { budget_expenses_v1: JSON.stringify([{ id: 'from-backup' }]) };
  await ctx.applyBackupData(backupData);
  assert.equal(ctx.localStorage.getItem('budget_expenses_v1'), JSON.stringify([{ id: 'from-backup' }]));
});

test('acceptance: непілотний ключ відсутній у бекапі → прибирається з localStorage (не лишається привидом)', async () => {
  const { ctx } = sandbox({ localStorageInitial: { budget_debts_v1: JSON.stringify([{ id: 'ghost' }]) } });
  await ctx.applyBackupData({});
  assert.equal(ctx.localStorage.getItem('budget_debts_v1'), null);
});
