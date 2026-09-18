// Rev #28.C/D1/D2 — усі три під-етапи (docs/ROADMAP.md, п.28): тести
// Repository-routing для ВСІХ 11 доменів — 4 pilot (Stage C) + 4 D1
// (bankAccounts/installmentAccounts/hiddenFrom/ignoredDivergences) + 3 D2
// (expenses/incomes/debts, фінальні й найчастіше записувані) — loadX()/
// saveX() самі обирають localStorage чи IndexedDB через isDomainMigrated(),
// і backup/restore (buildBackupPayloadData()/applyBackupData(), витягнуті з
// exportBackup()/handleRestoreBackupFile() саме заради цієї тестованості)
// лишаються storage-agnostic: викликають ті самі Repository-функції, не
// звертаються до localStorage/adapter напряму.
//
// loadAll() САМА (як функція) НЕ під тестом тут — з Rev #28.D2 вона
// ПОВНІСТЮ делегує всі 7 "великих" доменів окремим loadX(), але й далі
// закінчується DOM-рендером (populateMonths/renderAll/renderStructure) —
// підмінена заглушкою-no-op у фінальному виклику всередині
// applyBackupData() (той самий принцип, що стаб XLSX.SSF.parse_date_code
// в tests/excel-parsing.test.js) — тести тут перевіряють ЛИШЕ ці 11
// доменів, а не інтеграцію з рештою застосунку (рендер/populateMonths тощо).
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
  'DEFAULT_BANKS',
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
  // Rev #28.D1
  'loadBankAccounts', 'loadInstallmentAccounts', 'loadHiddenFrom', 'loadIgnoredDivergences',
  'saveBankAccounts', 'saveInstallmentAccounts', 'saveHiddenFrom', 'saveIgnoredDivergences',
  'ensureInstallmentFirstMonth',
  'restoreBankAccountsFromBackup', 'restoreInstallmentAccountsFromBackup',
  'restoreHiddenFromFromBackup', 'restoreIgnoredDivergencesFromBackup',
  // Rev #28.D2
  'loadExpenses', 'loadIncomes', 'loadDebts',
  'saveExpenses', 'saveIncomes', 'saveDebts',
  'restoreExpensesFromBackup', 'restoreIncomesFromBackup', 'restoreDebtsFromBackup',
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
      bankAccounts: [],
      installmentAccounts: [],
      hiddenFrom: {},
      ignoredDivergences: {},
      expenses: [],
      incomes: [],
      debts: [],
      // Rev #28.C — loadAll() САМА (як функція) не під тестом тут: навіть
      // після Rev #28.D2 (усі 7 доменів делегують окремим loadX()) вона й
      // далі закінчується DOM-рендером (populateMonths/renderAll/
      // renderStructure) — applyBackupData() викликає її лише як частину
      // повного відновлення; підміняємо no-op заглушкою.
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

function d1Fixture(){
  return {
    bankAccounts: [{ name: '🟩 Приват Банк', creditLimit: 50000 }],
    installmentAccounts: [{ name: 'iPhone', initialAmount: 25000, firstMonth: '2026-01' }],
    hiddenFrom: { 'card:🟨 Raifaizen': '2026-06' },
    ignoredDivergences: { 'iPhone|2026-03': true },
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

/* ============ D1: loadBankAccounts/saveBankAccounts — routing ============ */

test('loadBankAccounts: домен не мігровано, немає ключа → DEFAULT_BANKS, зберігається в localStorage', async () => {
  const { ctx } = sandbox({ localStorageInitial: {} });
  await ctx.loadBankAccounts();
  const expected = plain(readConst(ctx, 'DEFAULT_BANKS')).map(name => ({ name, creditLimit: null }));
  assert.deepEqual(plain(ctx.bankAccounts), expected);
  assert.equal(ctx.localStorage.getItem('budget_bankaccounts_v1'), JSON.stringify(ctx.bankAccounts));
});

test('loadBankAccounts: BugFix — домен мігровано, IndexedDB порожня → DEFAULT_BANKS одразу зберігається В IndexedDB', async () => {
  const { ctx, fakeIdbInstance } = sandbox({ localStorageInitial: {} });
  ctx.markDomainMigrated('bankAccounts');
  await ctx.loadBankAccounts();
  assert.equal(fakeIdbInstance.store.get('budget_bankaccounts_v1'), JSON.stringify(ctx.bankAccounts));
  assert.equal(ctx.localStorage.getItem('budget_bankaccounts_v1'), null);
});

test('loadBankAccounts: домен мігровано, старий формат (масив рядків) → мігрує в об\'єкти й перезберігає', async () => {
  const { ctx, fakeIdbInstance } = sandbox();
  ctx.markDomainMigrated('bankAccounts');
  fakeIdbInstance.store.set('budget_bankaccounts_v1', JSON.stringify(['🟩 Приват Банк']));
  await ctx.loadBankAccounts();
  assert.deepEqual(plain(ctx.bankAccounts), [{ name: '🟩 Приват Банк', creditLimit: null }]);
  assert.equal(fakeIdbInstance.store.get('budget_bankaccounts_v1'), JSON.stringify(ctx.bankAccounts));
});

test('saveBankAccounts: домен мігровано → IndexedDB, не localStorage', async () => {
  const { ctx, fakeIdbInstance } = sandbox();
  ctx.markDomainMigrated('bankAccounts');
  ctx.bankAccounts = d1Fixture().bankAccounts;
  const result = await ctx.saveBankAccounts();
  assert.equal(result.success, true);
  assert.equal(fakeIdbInstance.store.get('budget_bankaccounts_v1'), JSON.stringify(ctx.bankAccounts));
  assert.equal(ctx.localStorage.getItem('budget_bankaccounts_v1'), null);
});

/* ============ D1: loadInstallmentAccounts — реконструкція з debts ============ */

test('loadInstallmentAccounts: домен не мігровано, немає ключа → реконструює з debts (module-level, не сховище)', async () => {
  const { ctx } = sandbox({ localStorageInitial: {} });
  ctx.debts = [
    { id: 'd1', kind: 'installment', name: 'iPhone', month: '2026-01', balance: 20000 },
    { id: 'd2', kind: 'installment', name: 'iPhone', month: '2026-02', balance: 17000 },
    { id: 'd3', kind: 'card', name: '🟩 Приват Банк', month: '2026-01', balance: 5000 },
  ];
  await ctx.loadInstallmentAccounts();
  assert.deepEqual(plain(ctx.installmentAccounts), [{ name: 'iPhone', initialAmount: null }]);
});

test('loadInstallmentAccounts: BugFix — домен мігровано, IndexedDB порожня, debts порожній → seed [] одразу зберігається В IndexedDB', async () => {
  const { ctx, fakeIdbInstance } = sandbox({ localStorageInitial: {} });
  ctx.markDomainMigrated('installmentAccounts');
  ctx.debts = [];
  await ctx.loadInstallmentAccounts();
  assert.deepEqual(plain(ctx.installmentAccounts), []);
  assert.equal(fakeIdbInstance.store.get('budget_installmentaccounts_v1'), '[]');
});

test('loadInstallmentAccounts: домен мігровано, IndexedDB порожня, debts має записи → реконструює й зберігає В IndexedDB (не localStorage)', async () => {
  const { ctx, fakeIdbInstance } = sandbox({ localStorageInitial: {} });
  ctx.markDomainMigrated('installmentAccounts');
  ctx.debts = [{ id: 'd1', kind: 'installment', name: 'iPhone', month: '2026-01', balance: 20000 }];
  await ctx.loadInstallmentAccounts();
  assert.deepEqual(plain(ctx.installmentAccounts), [{ name: 'iPhone', initialAmount: null }]);
  assert.equal(fakeIdbInstance.store.get('budget_installmentaccounts_v1'), JSON.stringify(ctx.installmentAccounts));
  assert.equal(ctx.localStorage.getItem('budget_installmentaccounts_v1'), null);
});

/* ============ D1: ensureInstallmentFirstMonth ============ */

test('ensureInstallmentFirstMonth: backfills firstMonth з debts і зберігає через routing-aware saveInstallmentAccounts', async () => {
  const { ctx, fakeIdbInstance } = sandbox();
  ctx.markDomainMigrated('installmentAccounts');
  ctx.installmentAccounts = [{ name: 'iPhone', initialAmount: 25000 }]; // без firstMonth
  ctx.debts = [
    { kind: 'installment', name: 'iPhone', month: '2026-03' },
    { kind: 'installment', name: 'iPhone', month: '2026-01' }, // найраніший
  ];
  await ctx.ensureInstallmentFirstMonth();
  assert.equal(ctx.installmentAccounts[0].firstMonth, '2026-01');
  assert.equal(JSON.parse(fakeIdbInstance.store.get('budget_installmentaccounts_v1'))[0].firstMonth, '2026-01');
});

test('ensureInstallmentFirstMonth: нічого не змінилось → не зберігає (не чіпає сховище)', async () => {
  const { ctx, fakeIdbInstance } = sandbox();
  ctx.markDomainMigrated('installmentAccounts');
  ctx.installmentAccounts = [{ name: 'iPhone', initialAmount: 25000, firstMonth: '2026-01' }]; // вже є
  ctx.debts = [];
  await ctx.ensureInstallmentFirstMonth();
  assert.equal(fakeIdbInstance.store.has('budget_installmentaccounts_v1'), false);
});

/* ============ D1: hiddenFrom/ignoredDivergences — легітимно порожні, без seed ============ */

test('loadHiddenFrom: немає ключа (не мігровано і не мігровано) → {} в обох гілках, без запису в сховище', async () => {
  const { ctx: notMigrated } = sandbox({ localStorageInitial: {} });
  await notMigrated.loadHiddenFrom();
  assert.deepEqual(plain(notMigrated.hiddenFrom), {});
  assert.equal(notMigrated.localStorage.getItem('budget_debthidden_v1'), null); // жодного seed-запису

  const { ctx: migrated, fakeIdbInstance } = sandbox({ localStorageInitial: {} });
  migrated.markDomainMigrated('hiddenFrom');
  await migrated.loadHiddenFrom();
  assert.deepEqual(plain(migrated.hiddenFrom), {});
  assert.equal(fakeIdbInstance.store.has('budget_debthidden_v1'), false); // теж без seed-запису
});

test('loadIgnoredDivergences: той самий принцип — {} без запису в жодній гілці', async () => {
  const { ctx, fakeIdbInstance } = sandbox({ localStorageInitial: {} });
  ctx.markDomainMigrated('ignoredDivergences');
  await ctx.loadIgnoredDivergences();
  assert.deepEqual(plain(ctx.ignoredDivergences), {});
  assert.equal(fakeIdbInstance.store.has('budget_ignored_divergences_v1'), false);
});

test('saveHiddenFrom/saveIgnoredDivergences: домен мігровано → пишуть в IndexedDB', async () => {
  const { ctx, fakeIdbInstance } = sandbox();
  ctx.markDomainMigrated('hiddenFrom');
  ctx.markDomainMigrated('ignoredDivergences');
  ctx.hiddenFrom = d1Fixture().hiddenFrom;
  ctx.ignoredDivergences = d1Fixture().ignoredDivergences;
  reportSaveResultCheck(await ctx.saveHiddenFrom());
  reportSaveResultCheck(await ctx.saveIgnoredDivergences());
  assert.equal(fakeIdbInstance.store.get('budget_debthidden_v1'), JSON.stringify(d1Fixture().hiddenFrom));
  assert.equal(fakeIdbInstance.store.get('budget_ignored_divergences_v1'), JSON.stringify(d1Fixture().ignoredDivergences));
  function reportSaveResultCheck(r){ assert.equal(r.success, true); }
});

/* ============ D1: restoreInstallmentAccountsFromBackup — спецвипадок відсутнього ключа ============ */

test('restoreInstallmentAccountsFromBackup: raw присутній → parse+save, той самий принцип, що інші restoreXFromBackup', async () => {
  const { ctx, fakeIdbInstance } = sandbox();
  ctx.markDomainMigrated('installmentAccounts');
  const raw = JSON.stringify(d1Fixture().installmentAccounts);
  const result = await ctx.restoreInstallmentAccountsFromBackup(raw);
  assert.equal(result.success, true);
  assert.deepEqual(plain(ctx.installmentAccounts), d1Fixture().installmentAccounts);
  assert.equal(fakeIdbInstance.store.get('budget_installmentaccounts_v1'), raw);
});

test('restoreInstallmentAccountsFromBackup: raw відсутній (старий бекап без ОЧ) → ВИДАЛЯЄ ключ, не пише [] (щоб не заблокувати майбутню реконструкцію з debts)', async () => {
  const { ctx, fakeIdbInstance } = sandbox();
  ctx.markDomainMigrated('installmentAccounts');
  fakeIdbInstance.store.set('budget_installmentaccounts_v1', JSON.stringify(d1Fixture().installmentAccounts)); // старе значення до restore
  const result = await ctx.restoreInstallmentAccountsFromBackup(null);
  assert.equal(result.success, true);
  assert.equal(fakeIdbInstance.store.has('budget_installmentaccounts_v1'), false);
});

test('restoreInstallmentAccountsFromBackup: raw відсутній, домен НЕ мігровано → видаляє ключ з localStorage', async () => {
  const { ctx } = sandbox({ localStorageInitial: { budget_installmentaccounts_v1: JSON.stringify(d1Fixture().installmentAccounts) } });
  await ctx.restoreInstallmentAccountsFromBackup(null);
  assert.equal(ctx.localStorage.getItem('budget_installmentaccounts_v1'), null);
});

/* ============ Acceptance: mixed-storage export → restore ============ */

test('acceptance: mixed-storage (частина доменів мігрована, частина ні) — export потім restore відтворює повний стан усіх 4 доменів', async () => {
  const fixture = pilotFixture();
  const { ctx, fakeIdbInstance } = sandbox({
    localStorageInitial: {
      // subcategories/subcategoryPriority — ще на localStorage
      budget_subcategories_v1: JSON.stringify(fixture.subcategories),
      budget_subcategory_priority_v1: JSON.stringify(fixture.subcategoryPriority),
      // + єдиний ключ, що й після Rev #28.D2 лишається поза DOMAIN_MIGRATION_KEYS
      // (LS_KEY_SCHEMA_VERSION — метадані схеми, не домен) — має пережити цикл незмінним.
      budget_schema_version_v1: '1',
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

test('acceptance: єдиний непілотний ключ (LS_KEY_SCHEMA_VERSION) відновлюється прямим localStorage clear→write, як і до Stage C', async () => {
  const { ctx } = sandbox({ localStorageInitial: { budget_schema_version_v1: '0' } });
  const backupData = { budget_schema_version_v1: '1' };
  await ctx.applyBackupData(backupData);
  assert.equal(ctx.localStorage.getItem('budget_schema_version_v1'), '1');
});

test('acceptance: непілотний ключ (LS_KEY_SCHEMA_VERSION) відсутній у бекапі → прибирається з localStorage (не лишається привидом)', async () => {
  const { ctx } = sandbox({ localStorageInitial: { budget_schema_version_v1: '1' } });
  await ctx.applyBackupData({});
  assert.equal(ctx.localStorage.getItem('budget_schema_version_v1'), null);
});

/* ============ Acceptance D1: mixed-storage export → restore для 4 D1-доменів ============ */

test('acceptance D1: mixed-storage — bankAccounts/hiddenFrom мігровані, installmentAccounts/ignoredDivergences ні — export→restore відтворює всі 4', async () => {
  const fixture = d1Fixture();
  const { ctx, fakeIdbInstance } = sandbox({
    localStorageInitial: {
      budget_installmentaccounts_v1: JSON.stringify(fixture.installmentAccounts),
      budget_ignored_divergences_v1: JSON.stringify(fixture.ignoredDivergences),
    },
  });
  ctx.markDomainMigrated('bankAccounts');
  ctx.markDomainMigrated('hiddenFrom');
  fakeIdbInstance.store.set('budget_bankaccounts_v1', JSON.stringify(fixture.bankAccounts));
  fakeIdbInstance.store.set('budget_debthidden_v1', JSON.stringify(fixture.hiddenFrom));
  ctx.bankAccounts = fixture.bankAccounts;
  ctx.installmentAccounts = fixture.installmentAccounts;
  ctx.hiddenFrom = fixture.hiddenFrom;
  ctx.ignoredDivergences = fixture.ignoredDivergences;

  const exportedData = ctx.buildBackupPayloadData();
  assert.deepEqual(JSON.parse(exportedData.budget_bankaccounts_v1), fixture.bankAccounts);
  assert.deepEqual(JSON.parse(exportedData.budget_installmentaccounts_v1), fixture.installmentAccounts);
  assert.deepEqual(JSON.parse(exportedData.budget_debthidden_v1), fixture.hiddenFrom);
  assert.deepEqual(JSON.parse(exportedData.budget_ignored_divergences_v1), fixture.ignoredDivergences);

  // Restore у "чистому" застосунку з ІНШИМ mixed-станом (installmentAccounts
  // мігровано, bankAccounts — ні) — той самий acceptance-принцип, що pilot-тест.
  const { ctx: freshCtx, fakeIdbInstance: freshIdb } = sandbox({ localStorageInitial: {} });
  freshCtx.markDomainMigrated('installmentAccounts');

  const results = await freshCtx.applyBackupData(exportedData);
  assert.equal(results.bankAccounts.success, true);
  assert.equal(results.installmentAccounts.success, true);
  assert.equal(results.hiddenFrom.success, true);
  assert.equal(results.ignoredDivergences.success, true);

  assert.deepEqual(plain(freshCtx.bankAccounts), fixture.bankAccounts);
  assert.deepEqual(plain(freshCtx.installmentAccounts), fixture.installmentAccounts);
  assert.deepEqual(plain(freshCtx.hiddenFrom), fixture.hiddenFrom);
  assert.deepEqual(plain(freshCtx.ignoredDivergences), fixture.ignoredDivergences);

  // installmentAccounts мігровано у freshCtx → IndexedDB, не localStorage.
  assert.equal(freshIdb.store.get('budget_installmentaccounts_v1'), JSON.stringify(fixture.installmentAccounts));
  assert.equal(freshCtx.localStorage.getItem('budget_installmentaccounts_v1'), null);
  // bankAccounts/hiddenFrom/ignoredDivergences НЕ мігровані у freshCtx → localStorage.
  assert.equal(freshCtx.localStorage.getItem('budget_bankaccounts_v1'), JSON.stringify(fixture.bankAccounts));
  assert.equal(freshCtx.localStorage.getItem('budget_debthidden_v1'), JSON.stringify(fixture.hiddenFrom));
  assert.equal(freshCtx.localStorage.getItem('budget_ignored_divergences_v1'), JSON.stringify(fixture.ignoredDivergences));
});

test('acceptance D1: старий бекап без installmentAccounts + мігрований домен → ключ видалено з IndexedDB, реконструкція лишається наступному loadAll()', async () => {
  const { ctx, fakeIdbInstance } = sandbox({ localStorageInitial: {} });
  ctx.markDomainMigrated('installmentAccounts');
  fakeIdbInstance.store.set('budget_installmentaccounts_v1', JSON.stringify(d1Fixture().installmentAccounts)); // старе значення
  // Бекап явно НЕ містить budget_installmentaccounts_v1 (старий файл до появи ОЧ).
  const backupWithoutInstallments = { budget_categories_v1: JSON.stringify([]) };
  const results = await ctx.applyBackupData(backupWithoutInstallments);
  assert.equal(results.installmentAccounts.success, true);
  assert.equal(fakeIdbInstance.store.has('budget_installmentaccounts_v1'), false);
});

/* ============ D2: loadExpenses/loadIncomes/loadDebts — routing ============ */

function d2Fixture(){
  return {
    expenses: [{ id: 'e1', date: '2026-09-01', name: 'Кава', amount: 65, category: '🍔 Харчування', subcategory: '', manual: true, createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z' }],
    incomes: [{ id: 'i1', date: '2026-09-01', source: 'salary_andrii', amount: 20000 }],
    debts: [{ id: 'd1', name: '🟩 Приват Банк', kind: 'card', month: '2026-09', balance: 5000 }],
  };
}

test('loadExpenses: домен не мігровано, немає ключа → [] (легітимно порожньо, без seed-запису)', async () => {
  const { ctx, fakeIdbInstance } = sandbox({ localStorageInitial: {} });
  await ctx.loadExpenses();
  assert.deepEqual(plain(ctx.expenses), []);
  assert.equal(ctx.localStorage.getItem('budget_expenses_v1'), null); // жодного seed-запису
  assert.equal(fakeIdbInstance.store.size, 0);
});

test('loadExpenses: домен мігровано, IndexedDB порожня → [] БЕЗ жодного запису (на відміну від bankAccounts/installmentAccounts — тут немає дефолту/реконструкції)', async () => {
  const { ctx, fakeIdbInstance } = sandbox({ localStorageInitial: {} });
  ctx.markDomainMigrated('expenses');
  await ctx.loadExpenses();
  assert.deepEqual(plain(ctx.expenses), []);
  assert.equal(fakeIdbInstance.store.has('budget_expenses_v1'), false);
});

test('loadExpenses: домен мігровано → читає з IndexedDB', async () => {
  const fixture = d2Fixture();
  const { ctx, fakeIdbInstance } = sandbox();
  ctx.markDomainMigrated('expenses');
  fakeIdbInstance.store.set('budget_expenses_v1', JSON.stringify(fixture.expenses));
  await ctx.loadExpenses();
  assert.deepEqual(plain(ctx.expenses), fixture.expenses);
});

test('loadIncomes/loadDebts: та сама routing-логіка, що loadExpenses (не мігровано → localStorage, мігровано → IndexedDB)', async () => {
  const fixture = d2Fixture();
  const { ctx, fakeIdbInstance } = sandbox({
    localStorageInitial: { budget_incomes_v1: JSON.stringify(fixture.incomes) },
  });
  ctx.markDomainMigrated('debts');
  fakeIdbInstance.store.set('budget_debts_v1', JSON.stringify(fixture.debts));
  await ctx.loadIncomes();
  await ctx.loadDebts();
  assert.deepEqual(plain(ctx.incomes), fixture.incomes);
  assert.deepEqual(plain(ctx.debts), fixture.debts);
  assert.equal(ctx.localStorage.getItem('budget_debts_v1'), null);
});

/* ============ D2: saveExpenses/saveIncomes/saveDebts — routing + помилка ============ */

test('saveExpenses: домен мігровано → IndexedDB, не localStorage', async () => {
  const { ctx, fakeIdbInstance } = sandbox();
  ctx.markDomainMigrated('expenses');
  ctx.expenses = d2Fixture().expenses;
  const result = await ctx.saveExpenses();
  assert.equal(result.success, true);
  assert.equal(fakeIdbInstance.store.get('budget_expenses_v1'), JSON.stringify(ctx.expenses));
  assert.equal(ctx.localStorage.getItem('budget_expenses_v1'), null);
});

test('saveDebts: домен мігровано, IndexedDB кидає → { success:false, error } (без silent retry)', async () => {
  const fakeIdbInstance = fakeIdb();
  fakeIdbInstance.setFailOnKey('budget_debts_v1');
  const { ctx } = sandbox({ idbImpl: fakeIdbInstance });
  ctx.markDomainMigrated('debts');
  ctx.debts = d2Fixture().debts;
  const result = await ctx.saveDebts();
  assert.equal(result.success, false);
  assert.match(result.error, /симульований збій/);
});

/* ============ D2: restoreXFromBackup — легітимно порожньо, не спецвипадок (на відміну від installmentAccounts) ============ */

test('restoreExpensesFromBackup: raw відсутній → [] і зберігається (НЕ видаляє ключ, на відміну від restoreInstallmentAccountsFromBackup)', async () => {
  const { ctx, fakeIdbInstance } = sandbox();
  ctx.markDomainMigrated('expenses');
  fakeIdbInstance.store.set('budget_expenses_v1', JSON.stringify(d2Fixture().expenses)); // старе значення
  const result = await ctx.restoreExpensesFromBackup(null);
  assert.equal(result.success, true);
  assert.equal(fakeIdbInstance.store.get('budget_expenses_v1'), '[]');
  assert.deepEqual(plain(ctx.expenses), []);
});

test('restoreIncomesFromBackup/restoreDebtsFromBackup: raw присутній → parse+save', async () => {
  const fixture = d2Fixture();
  const { ctx, fakeIdbInstance } = sandbox();
  ctx.markDomainMigrated('incomes');
  const resultIncomes = await ctx.restoreIncomesFromBackup(JSON.stringify(fixture.incomes));
  const resultDebts = await ctx.restoreDebtsFromBackup(JSON.stringify(fixture.debts));
  assert.equal(resultIncomes.success, true);
  assert.equal(resultDebts.success, true);
  assert.deepEqual(plain(ctx.incomes), fixture.incomes);
  assert.deepEqual(plain(ctx.debts), fixture.debts);
  assert.equal(fakeIdbInstance.store.get('budget_incomes_v1'), JSON.stringify(fixture.incomes));
});

/* ============ Acceptance D2: mixed-storage export → restore для 3 фінальних доменів ============ */

test('acceptance D2: mixed-storage — expenses мігровано, incomes/debts ні — export→restore відтворює всі 3, installmentAccounts реконструюється з відновлених debts', async () => {
  const fixture = d2Fixture();
  const { ctx, fakeIdbInstance } = sandbox({
    localStorageInitial: {
      budget_incomes_v1: JSON.stringify(fixture.incomes),
      budget_debts_v1: JSON.stringify(fixture.debts),
    },
  });
  ctx.markDomainMigrated('expenses');
  fakeIdbInstance.store.set('budget_expenses_v1', JSON.stringify(fixture.expenses));
  ctx.expenses = fixture.expenses;
  ctx.incomes = fixture.incomes;
  ctx.debts = fixture.debts;

  const exportedData = ctx.buildBackupPayloadData();
  assert.deepEqual(JSON.parse(exportedData.budget_expenses_v1), fixture.expenses);
  assert.deepEqual(JSON.parse(exportedData.budget_incomes_v1), fixture.incomes);
  assert.deepEqual(JSON.parse(exportedData.budget_debts_v1), fixture.debts);

  // Restore у "чистому" застосунку, де НІЧОГО не мігровано — увесь backup
  // storage-agnostic незалежно від mixed-стану джерела.
  const { ctx: freshCtx, fakeIdbInstance: freshIdb } = sandbox({ localStorageInitial: {} });
  // installmentAccounts у backup ВІДСУТНІЙ (типовий старий бекап) — має
  // реконструюватись з ЩОЙНО відновлених debts у фінальному loadAll()
  // всередині applyBackupData() (той самий edge case, що D1-тест вище,
  // тепер наскрізно перевірений разом із реальним debts-джерелом).
  const results = await freshCtx.applyBackupData(exportedData);
  assert.equal(results.expenses.success, true);
  assert.equal(results.incomes.success, true);
  assert.equal(results.debts.success, true);
  assert.equal(results.installmentAccounts.success, true);

  assert.deepEqual(plain(freshCtx.expenses), fixture.expenses);
  assert.deepEqual(plain(freshCtx.incomes), fixture.incomes);
  assert.deepEqual(plain(freshCtx.debts), fixture.debts);
  // installmentAccounts реконструйовано з debts (kind:'card', не 'installment' у фікстурі) → порожньо, коректно.
  assert.deepEqual(plain(freshCtx.installmentAccounts), []);

  assert.equal(freshCtx.localStorage.getItem('budget_expenses_v1'), JSON.stringify(fixture.expenses));
  assert.equal(freshCtx.localStorage.getItem('budget_incomes_v1'), JSON.stringify(fixture.incomes));
  assert.equal(freshCtx.localStorage.getItem('budget_debts_v1'), JSON.stringify(fixture.debts));
});
