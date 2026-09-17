// Rev #28.B — Stage B (docs/ROADMAP.md, п.28): тести ІЗОЛЬОВАНОГО storage
// adapter'а (idb → IndexedDB) — жоден реальний loadX()/saveX() ще не
// викликає цей код, тому тести перевіряють ЛИШЕ сам adapter/migration
// routine, а не інтеграцію з рештою застосунку.
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

// Rev #28.B — НОВА (перша в цьому наборі тестів) пастка vm.Context, окрема
// від уже задокументованої cross-realm array/object-порівняння (tests/
// excel-parsing.test.js): top-level `const`/`let` з index.html виконуються
// в vm.runInContext як лексичні біндинги скрипта, а НЕ як власні властивості
// контекстного об'єкта — тому `ctx.LS_KEY_EXP` ззовні є `undefined`, хоча
// `ctx.someFunction()` (function-декларація — вона таки стає властивістю
// глобального об'єкта) працює штатно. Щоб прочитати значення extracted
// const-и, треба виконати вираз ВСЕРЕДИНІ того самого контексту.
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
      'MIGRATION_LS_KEYS', 'validateRawStorageValue',
      'migrateLocalStorageToIndexedDb',
      'LS_KEY_MIGRATION_STATUS', 'markMigrationCompleted', 'isMigrationCompleted',
    ]
  );
  return { ctx, fakeIdbInstance };
}

// Реалістичний набір валідних значень для всіх 12 ключів MIGRATION_LS_KEYS
// (== BACKUP_LS_KEYS: усе, крім theme/draft) — довільні, але правдоподібні
// за формою дані кожного домену.
function validLocalStorageFixture(){
  return {
    budget_expenses_v1: JSON.stringify([{ id: 'e1', date: '2026-03-01', amount: 100 }]),
    budget_incomes_v1: JSON.stringify([{ id: 'i1', date: '2026-03-01', amount: 20000 }]),
    budget_debts_v1: JSON.stringify([]),
    budget_bankaccounts_v1: JSON.stringify([{ name: '🟩 Приват Банк', creditLimit: 50000 }]),
    budget_installmentaccounts_v1: JSON.stringify([]),
    budget_debthidden_v1: JSON.stringify({}),
    budget_categories_v1: JSON.stringify([{ name: '🍔 Їжа', type: "Гнучка", active: true }]),
    budget_subcategories_v1: JSON.stringify([]),
    budget_subcategory_priority_v1: JSON.stringify({}),
    budget_dictionary_v1: JSON.stringify([]),
    budget_schema_version_v1: '1',
    budget_ignored_divergences_v1: JSON.stringify({}),
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

/* ============ MIGRATION_LS_KEYS ============ */

test('MIGRATION_LS_KEYS: той самий склад, що BACKUP_LS_KEYS (12 ключів, без theme/draft)', () => {
  const { ctx } = sandbox();
  assert.deepEqual(Array.from(readConst(ctx, 'MIGRATION_LS_KEYS')), Array.from(readConst(ctx, 'BACKUP_LS_KEYS')));
  assert.equal(readConst(ctx, 'MIGRATION_LS_KEYS').length, 12);
});

/* ============ validateRawStorageValue ============ */

test('validateRawStorageValue: валідний JSON для звичайного ключа → valid', () => {
  const { ctx } = sandbox();
  const r = ctx.validateRawStorageValue(readConst(ctx, 'LS_KEY_EXP'), '[]');
  assert.equal(r.valid, true);
});

test('validateRawStorageValue: пошкоджений JSON → invalid з причиною', () => {
  const { ctx } = sandbox();
  const r = ctx.validateRawStorageValue(readConst(ctx, 'LS_KEY_EXP'), '{не json');
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
  assert.equal(ctx.validateRawStorageValue(readConst(ctx, 'LS_KEY_EXP'), null).valid, true);
});

/* ============ idbAdapterGet/Set/Remove ============ */

test('idbAdapterSet + idbAdapterGet: round-trip через generic key-value store', async () => {
  const { ctx } = sandbox();
  await ctx.idbAdapterSet('budget_expenses_v1', '[{"id":"e1"}]');
  const back = await ctx.idbAdapterGet('budget_expenses_v1');
  assert.equal(back, '[{"id":"e1"}]');
});

test('idbAdapterRemove: видаляє ключ, наступний get повертає undefined', async () => {
  const { ctx } = sandbox();
  await ctx.idbAdapterSet('k', 'v');
  await ctx.idbAdapterRemove('k');
  assert.equal(await ctx.idbAdapterGet('k'), undefined);
});

/* ============ migrateLocalStorageToIndexedDb: успіх ============ */

test('migrateLocalStorageToIndexedDb: усі 12 ключів мігровано і верифіковано → success', async () => {
  const { ctx, fakeIdbInstance } = sandbox({ localStorageInitial: validLocalStorageFixture() });
  const result = await ctx.migrateLocalStorageToIndexedDb();
  assert.equal(result.success, true);
  const fixture = validLocalStorageFixture();
  for(const key of Object.keys(fixture)){
    assert.equal(fakeIdbInstance.store.get(key), fixture[key]);
  }
});

test('migrateLocalStorageToIndexedDb: успіх НЕ встановлює LS_KEY_MIGRATION_STATUS сам', async () => {
  const { ctx } = sandbox({ localStorageInitial: validLocalStorageFixture() });
  await ctx.migrateLocalStorageToIndexedDb();
  assert.equal(ctx.isMigrationCompleted(), false);
});

test('migrateLocalStorageToIndexedDb: успіх не чіпає localStorage (жодного видалення/перезапису)', async () => {
  const { ctx } = sandbox({ localStorageInitial: validLocalStorageFixture() });
  const fixture = validLocalStorageFixture();
  await ctx.migrateLocalStorageToIndexedDb();
  for(const key of Object.keys(fixture)){
    assert.equal(ctx.localStorage.getItem(key), fixture[key]);
  }
});

/* ============ migrateLocalStorageToIndexedDb: збій запису на середині ============ */

test('migrateLocalStorageToIndexedDb: збій запису на середині → failure, прапорець не встановлюється, localStorage незайманий', async () => {
  const fakeIdbInstance = fakeIdb();
  fakeIdbInstance.setFailOnKey('budget_bankaccounts_v1'); // не перший і не останній ключ у BACKUP_LS_KEYS
  const fixture = validLocalStorageFixture();
  const { ctx } = sandbox({ localStorageInitial: fixture, idbImpl: fakeIdbInstance });
  const result = await ctx.migrateLocalStorageToIndexedDb();
  assert.equal(result.success, false);
  assert.match(result.error, /Запис у IndexedDB не вдався/);
  assert.equal(ctx.isMigrationCompleted(), false);
  for(const key of Object.keys(fixture)){
    assert.equal(ctx.localStorage.getItem(key), fixture[key]);
  }
});

/* ============ migrateLocalStorageToIndexedDb: ідемпотентність ============ */

test('migrateLocalStorageToIndexedDb: якщо флаг уже true → no-op, IndexedDB вдруге не переписується', async () => {
  const { ctx, fakeIdbInstance } = sandbox({ localStorageInitial: validLocalStorageFixture() });
  ctx.markMigrationCompleted();
  fakeIdbInstance.store.set('sentinel', 'не має бути перезаписано чи очищено');
  const result = await ctx.migrateLocalStorageToIndexedDb();
  // Rev #28.B — result повертається з vm.Context (інший реалм), тому
  // assert.deepEqual на весь об'єкт падає навіть при структурному збігу
  // (той самий клас пастки, що вже задокументований у excel-parsing/
  // installment-match тестах для масивів/об'єктів) — звіряємо поля окремо,
  // це прості boolean-примітиви, для них realm значення не має.
  assert.equal(result.success, true);
  assert.equal(result.skipped, true);
  assert.equal(fakeIdbInstance.store.get('sentinel'), 'не має бути перезаписано чи очищено');
});

/* ============ migrateLocalStorageToIndexedDb: пошкоджений ключ ============ */

test('migrateLocalStorageToIndexedDb: пошкоджений JSON в одному ключі → failure ДО будь-якого запису в IndexedDB', async () => {
  const fixture = validLocalStorageFixture();
  fixture.budget_debts_v1 = '{зіпсований json';
  const { ctx, fakeIdbInstance } = sandbox({ localStorageInitial: fixture });
  const result = await ctx.migrateLocalStorageToIndexedDb();
  assert.equal(result.success, false);
  assert.match(result.error, /Валідація не пройдена/);
  assert.equal(fakeIdbInstance.store.size, 0); // жодного запису — валідація йде ПЕРЕД будь-яким put()
});

test('migrateLocalStorageToIndexedDb: відсутній (не пошкоджений, а просто нема) ключ → мігрує решту, success', async () => {
  const fixture = validLocalStorageFixture();
  delete fixture.budget_ignored_divergences_v1; // немає в localStorage взагалі — не помилка
  const { ctx, fakeIdbInstance } = sandbox({ localStorageInitial: fixture });
  const result = await ctx.migrateLocalStorageToIndexedDb();
  assert.equal(result.success, true);
  assert.equal(fakeIdbInstance.store.has('budget_ignored_divergences_v1'), false);
  assert.equal(fakeIdbInstance.store.get('budget_expenses_v1'), fixture.budget_expenses_v1);
});

/* ============ markMigrationCompleted / isMigrationCompleted (окремо від migration routine) ============ */

test('markMigrationCompleted: встановлює прапорець У localStorage (не в IndexedDB)', () => {
  const { ctx, fakeIdbInstance } = sandbox();
  ctx.markMigrationCompleted();
  const migrationStatusKey = readConst(ctx, 'LS_KEY_MIGRATION_STATUS');
  assert.equal(ctx.isMigrationCompleted(), true);
  assert.equal(ctx.localStorage.getItem(migrationStatusKey), 'true');
  assert.equal(fakeIdbInstance.store.has(migrationStatusKey), false);
});

test('markMigrationCompleted: ідемпотентний — повторний виклик нічого не ламає', () => {
  const { ctx } = sandbox();
  ctx.markMigrationCompleted();
  ctx.markMigrationCompleted();
  assert.equal(ctx.isMigrationCompleted(), true);
});

test('isMigrationCompleted: за замовчуванням (свіжий localStorage) → false', () => {
  const { ctx } = sandbox();
  assert.equal(ctx.isMigrationCompleted(), false);
});

test('LS_KEY_MIGRATION_STATUS: не входить у MIGRATION_LS_KEYS (не мігрується разом з рештою)', () => {
  const { ctx } = sandbox();
  const migrationKeys = Array.from(readConst(ctx, 'MIGRATION_LS_KEYS'));
  assert.equal(migrationKeys.includes(readConst(ctx, 'LS_KEY_MIGRATION_STATUS')), false);
});
