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
const nodeCrypto = require('node:crypto');
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

// Rev #30 (6D.1) — лічильник викликів для перевірки "saveX() викликається
// ЛИШЕ за реальної зміни" (changed-прапорець в ensureIncomeIdentity/
// ensureDebtIdentity/ensureExpenseIdentity). Підміна властивості на
// context-об'єкті працює так само, як уже підмінені loadAll/reportSaveResult
// вище: top-level function-декларації з index.html виконуються в
// НЕ-строгому режимі як властивості глобального об'єкта vm.Context, тому
// виклик `saveExpenses()` УСЕРЕДИНІ ensureExpenseIdentity() резолвиться
// через той самий глобальний об'єкт і побачить підміну, зроблену вже ПІСЛЯ
// buildSandbox().
function spyOn(ctx, name){
  const original = ctx[name];
  let calls = 0;
  ctx[name] = function(...args){ calls++; return original.apply(this, args); };
  return { count: () => calls };
}

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
  // Rev #30 (6D.2) — Sync Engine v1 pilot push для categories. cloudSession/
  // cloudFamilyId за замовчуванням null у globals нижче (sandbox() → "не
  // залогінений") — pushCategoriesPilot() тому завжди повертається одразу
  // (guard clause), без потреби мокати реальний Supabase-клієнт: existing
  // routing/backup-тести saveCategories() лишаються коректними, бо push —
  // чистий no-op у їхньому контексті. isSupabaseSdkReady/getSupabaseClient
  // тут НЕ під тестом (реальний мережевий шар, жива browser-перевірка) —
  // включені лише тому, що saveCategoriesLocal/pushCategoriesPilot фізично
  // посилаються на них (навіть недосяжним для тестів кодом).
  'isSupabaseSdkReady', 'getSupabaseClient', 'loadCloudFamilyId', 'clearCloudFamilyId',
  'LS_KEY_CLOUD_FAMILY_ID',
  // Rev #30 (6D, індикатор — фікс дублювання) — усі 10 push/pull-функцій
  // тепер посилаються на isCloudSessionReady() замість inline-guard'а.
  'isCloudSessionReady',
  // Rev #30 (6D.38, інкрементальний pull) — усі 9 pullXCore() тепер
  // посилаються на ці хелпери (недосяжним для решти тестів кодом,
  // localStorage:{} за замовчуванням → getSyncMarker завжди null →
  // applySyncMarker() — прозорий no-op, повний pull як і раніше).
  'LS_KEY_SYNC_MARKERS', 'loadSyncMarkers', 'getSyncMarker', 'setSyncMarker',
  'clearSyncMarkers', 'applySyncMarker', 'updateSyncMarkerFromAllRows',
  'saveCategories', 'saveCategoriesLocal', 'pushCategoriesPilot', 'reconcileCategoryCloudId',
  // Rev #30 (6D крок 9) — Pull pilot: categories. На відміну від push-тестів
  // вище (де cloudSession:null завжди зупиняє на guard clause), тут
  // cloudSession/cloudFamilyId/getSupabaseClient/isSupabaseSdkReady ПІДМІНЯЮТЬСЯ
  // після buildSandbox() (той самий cross-realm-override прийом, що spyOn())
  // — реальна мережа не звертається, лише fakeSupabaseCategoriesClient()
  // нижче. pullCategoriesPilotManual НЕ включена — DOM-шар
  // (document.getElementById), той самий принцип виключення, що вже
  // initCloudAuthUI/applyCloudSession (не extract-тестуються тут).
  'pullCategoriesCore', 'pullCategoriesPilot',
  // Rev #30 (6D, Варіант А) — createdAt/updatedAt backfill (той самий
  // ідемпотентний принцип, що ensureExpenseIdentity()) — потрібна тут
  // ЛИШЕ тому, що loadStructureRefs() тепер на неї посилається
  // (недосяжним для routing-тестів кодом, cloudSession:null → саve
  // Categories() усередині — чистий local-write no-op).
  'ensureCategoryIdentity',
  // Rev #30 (6D, термінове розслідування — фікс подвійного push) — чистий
  // stamp-хелпер, витягнутий з усіх 5 ensureXIdentity(); restoreXFromBackup()
  // нижче теж на нього посилається (недосяжним для routing-тестів кодом).
  'stampMissingTimestamps',
  // Rev #30 (6D.4) — той самий принцип, що categories вище: cloudSession
  // null за замовчуванням → усі 4 нові pushXPilot() одразу повертаються на
  // guard clause, без реального Supabase-клієнта. reconcileXCloudId — не
  // під тестом (мережевий шар), включені лише тому, що saveXLocal/pushXPilot
  // фізично на них посилаються.
  'saveSubcategories', 'saveSubcategoriesLocal', 'pushSubcategoriesPilot', 'reconcileSubcategoryCloudId',
  'saveSubcategoryPriority',
  'saveDictionary', 'saveDictionaryLocal', 'pushDictionaryPilot', 'reconcileDictionaryCloudId',
  // Rev #30 (6D.28, subcategories+dictionary повний цикл) — той самий
  // cross-realm-override прийом, що pullBankAccountsCore/
  // pullInstallmentAccountsCore тести. pullSubcategoriesPilotManual/
  // pullDictionaryPilotManual НЕ включені (DOM-шар).
  'pullSubcategoriesCore', 'pullSubcategoriesPilot', 'ensureSubcategoryIdentity',
  'pullDictionaryCore', 'pullDictionaryPilot', 'ensureDictionaryIdentity',
  'restoreCategoriesFromBackup', 'restoreSubcategoriesFromBackup',
  'restoreSubcategoryPriorityFromBackup', 'restoreDictionaryFromBackup',
  // Rev #28.D1
  'loadBankAccounts', 'loadInstallmentAccounts', 'loadHiddenFrom', 'loadIgnoredDivergences',
  'saveBankAccounts', 'saveBankAccountsLocal', 'pushBankAccountsPilot', 'reconcileBankAccountCloudId',
  // Rev #30 (6D, bank_accounts повний цикл) — той самий cross-realm-override
  // прийом, що pullCategoriesCore тести нижче: cloudSession/cloudFamilyId/
  // getSupabaseClient/isSupabaseSdkReady підмінюються після buildSandbox().
  // pullBankAccountsPilotManual НЕ включена (DOM-шар).
  'pullBankAccountsCore', 'pullBankAccountsPilot', 'ensureBankAccountIdentity',
  'saveInstallmentAccounts', 'saveInstallmentAccountsLocal', 'pushInstallmentAccountsPilot', 'reconcileInstallmentAccountCloudId',
  // Rev #30 (6D.27, installment_accounts повний цикл) — той самий
  // cross-realm-override прийом, що pullBankAccountsCore тести.
  // pullInstallmentAccountsPilotManual НЕ включена (DOM-шар).
  'pullInstallmentAccountsCore', 'pullInstallmentAccountsPilot', 'ensureInstallmentAccountIdentity',
  // Rev #30 (6D.32, hidden_entities перша реалізація) — той самий
  // local/push розподіл, що решта 5 доменів. pullHiddenEntitiesPilotManual
  // НЕ включена (DOM-шар).
  'saveHiddenFrom', 'saveHiddenFromLocal', 'monthToDate', 'dateToMonth', 'pushHiddenEntitiesPilot',
  'pullHiddenEntitiesCore', 'pullHiddenEntitiesPilot',
  'saveIgnoredDivergences',
  // Rev #30 (6D.31, повне прибирання emoji) — одноразова міграція +
  // чистий rename-хелпер, витягнутий з неї (потрібен тут ЛИШЕ тому, що
  // loadAll() на нього посилається; loadAll сама не під тестом, стаб).
  'renameStrippingEmoji', 'ensureBankInstallmentNamesStripped', 'stripLeadingEmoji',
  // Rev #30 (6D.34, індикатор — стан "помилка") — 3 single-record push
  // функції ще не мали власного extract-покриття (лише array-домени вище);
  // isSyncResultFailure — чистий, DOM-незалежний хелпер з withSyncIndicator().
  'pushExpenseRecordPilot', 'pushIncomeRecordPilot', 'pushDebtRecordPilot', 'isSyncResultFailure',
  'hideKey', 'divergenceKey',
  'ensureInstallmentFirstMonth',
  'restoreBankAccountsFromBackup', 'restoreInstallmentAccountsFromBackup',
  'restoreHiddenFromFromBackup', 'restoreIgnoredDivergencesFromBackup',
  // Rev #28.D2
  'loadExpenses', 'loadIncomes', 'loadDebts',
  'saveExpenses', 'saveIncomes', 'saveDebts',
  // Rev #30 (6D.37, Категорія A — expenses/incomes/debts повний цикл) —
  // той самий cross-realm-override прийом, що pullBankAccountsCore тощо.
  // syncAllPilotManual() (DOM-шар) НЕ включена, той самий принцип, що всі
  // *PilotManual().
  'pullExpensesCore', 'pullExpensesPilot',
  'pullIncomesCore', 'pullIncomesPilot',
  'pullDebtsCore', 'pullDebtsPilot',
  'restoreExpensesFromBackup', 'restoreIncomesFromBackup', 'restoreDebtsFromBackup',
  'pilotBackupKeys', 'pilotBackupValue', 'buildBackupPayloadData', 'applyBackupData',
  // Rev #30 (6D.1) — генерація/нормалізація id (UUID_FORMAT_RE — const,
  // мусить іти ПЕРЕД функціями, що на неї посилаються, хоч TDZ тут і не
  // критичний: тіла ensureIncomeIdentity/ensureDebtIdentity виконуються
  // лише при явному виклику, вже після того, як увесь sandbox-скрипт
  // відпрацював).
  'UUID_FORMAT_RE', 'generateUUID',
  'ensureExpenseIdentity', 'ensureIncomeIdentity', 'ensureDebtIdentity',
  // Rev #30 (6D.42) — Sync Safety Patch P0.1, tombstone для expenses.
  // deleteRecord() САМА (DOM-термінальна: populateMonths()/renderAll())
  // тут НЕ під тестом — той самий скоуп-принцип, що вже задокументований
  // для handleImportFile() (excel-parsing.test.js:9-14); activeExpenses()
  // — чиста, DOM-незалежна, тому й покрита напряму.
  'activeExpenses',
  // Rev #30 (6D.43) — tombstone для incomes (домен 2/3), той самий принцип.
  // saveIncomeDrawer() (DOM-термінальна, "воскресіння" через existingIdx-
  // реюз усередині неї) НЕ під тестом тут — той самий скоуп-принцип;
  // перевірено натомість живо в браузері. activeIncomes() чиста.
  'activeIncomes',
  // Rev #30 (6D.44) — tombstone для debts (домен 3/3, останній). Той самий
  // принцип: saveInstallmentDrawer()/saveCardDebtDrawer() НЕ під тестом тут
  // (DOM-термінальні), перевірено живо. activeDebts() чиста.
  'activeDebts',
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
      // Rev #30 (6D.2) — за замовчуванням "не залогінений" (той самий стан,
      // що свіжий localStorage без sb-*-auth-token): pushCategoriesPilot()
      // всередині saveCategories() одразу повертається на guard clause,
      // не звертаючись до Supabase — routing/backup-тести saveCategories()
      // нижче лишаються чистими unit-тестами локального шару.
      cloudSession: null,
      cloudFamilyId: null,
      // Rev #30 (6D.1) — generateUUID() перевіряє window.crypto.randomUUID
      // (справжній шлях у браузері) — vm.Context не має глобального `window`,
      // тому підставляємо мінімальну заглушку поверх реального Node
      // node:crypto.randomUUID (не власний фейковий генератор — тест мусить
      // ганяти РЕАЛЬНИЙ формат UUID v4, а не свій імітований).
      window: { crypto: { randomUUID: () => nodeCrypto.randomUUID() } },
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

// Rev #30 (6D, термінове розслідування — фікс подвійного push) — на
// відміну від fakeSupabaseCategoriesClient() нижче (мертвий "прочитати весь
// масив" mock для pull), цей — СТАТЕФУЛ mock для push/reconcile-ланцюжка
// (select().eq().eq().maybeSingle() → insert().select().single(), або
// update().eq().select()), що імітує РЕАЛЬНУ Cloud-таблицю з ключем за
// назвою (byName Map) — потрібен, щоб перевірити (не припустити), що ДРУГИЙ
// push-виклик після фіксу дійсно бачить рядок, вставлений ПЕРШИМ (реальна
// поведінка Postgres у не-конкурентному випадку), а не сліпо рахує виклики.
function fakeSupabaseStatefulClient(table, nameField){
  const byName = new Map();
  let insertCount = 0, updateCount = 0;
  const client = {
    from(t){
      assert.equal(t, table);
      return {
        select(cols){
          return {
            eq(col1, val1){
              return {
                eq(col2, val2){
                  return {
                    maybeSingle(){
                      const row = byName.get(val2);
                      return Promise.resolve({ data: row ? { id: row.id } : null, error: null });
                    },
                  };
                },
              };
            },
          };
        },
        insert(fields){
          insertCount++;
          const id = 'gen-' + insertCount;
          const row = { id, ...fields };
          byName.set(fields[nameField], row);
          return { select(){ return { single(){ return Promise.resolve({ data: { id }, error: null }); } }; } };
        },
        update(fields){
          updateCount++;
          return {
            eq(col, id){
              return {
                select(cols){
                  const found = [...byName.values()].find(r => r.id === id);
                  if(found) Object.assign(found, fields);
                  return Promise.resolve({ data: found ? [{ id }] : [], error: null });
                },
              };
            },
          };
        },
      };
    },
  };
  return { client, getInsertCount: () => insertCount, getUpdateCount: () => updateCount, byName };
}

// Rev #30 (6D крок 9) — мінімальний фейковий Supabase-клієнт для
// pullCategoriesCore(): підтримує лише той самий ланцюжок викликів, що
// РЕАЛЬНИЙ код використовує — client.from('categories').select(...).eq(...)
// повертає Promise<{data,error}> напряму (без .maybeSingle()/.single(), на
// відміну від push — pull читає ВЕСЬ масив рядків family одним запитом).
// Rev #30 (6D.38, інкрементальний pull) — на відміну від решти fake-
// клієнтів (одноразовий .eq() → Promise), цей МУСИТЬ підтримувати ОБИДВА
// шляхи `applySyncMarker()`: без маркера — `.eq()` сам awaitable
// (потребує `.then()`); з маркером — `.eq().gte()` повертає Promise
// напряму. `allRows` реально фільтрується за `updated_at >= gte`-значенням
// (як справжній Postgres), щоб тест міг перевірити НЕ ЛИШЕ факт виклику
// `.gte()`, а й що результат справді звузився.
function fakeSupabaseMarkerAwareClient(table, allRows){
  const calls = [];
  const client = {
    from(t){
      assert.equal(t, table);
      return {
        select(cols){
          return {
            eq(col, val){
              return {
                gte(col2, val2){
                  calls.push(val2);
                  return Promise.resolve({ data: allRows.filter(r => r.updated_at >= val2), error: null });
                },
                then(resolve, reject){
                  calls.push(null);
                  return Promise.resolve({ data: allRows, error: null }).then(resolve, reject);
                },
              };
            },
          };
        },
      };
    },
  };
  return { client, calls };
}

function fakeSupabaseCategoriesClient(rows, opts){
  return {
    from(table){
      assert.equal(table, 'categories');
      return {
        select(cols){
          return {
            eq(col, val){
              if(opts && opts.error) return Promise.resolve({ data: null, error: new Error('симульована мережева помилка') });
              return Promise.resolve({ data: rows, error: null });
            },
          };
        },
      };
    },
  };
}

// Rev #30 (6D, bank_accounts повний цикл) — той самий мінімальний mock, що
// fakeSupabaseCategoriesClient(), для pullBankAccountsCore().
function fakeSupabaseBankAccountsClient(rows, opts){
  return {
    from(table){
      assert.equal(table, 'bank_accounts');
      return {
        select(cols){
          return {
            eq(col, val){
              if(opts && opts.error) return Promise.resolve({ data: null, error: new Error('симульована мережева помилка') });
              return Promise.resolve({ data: rows, error: null });
            },
          };
        },
      };
    },
  };
}

function fakeSupabaseInstallmentAccountsClient(rows, opts){
  return {
    from(table){
      assert.equal(table, 'installment_accounts');
      return {
        select(cols){
          return {
            eq(col, val){
              if(opts && opts.error) return Promise.resolve({ data: null, error: new Error('симульована мережева помилка') });
              return Promise.resolve({ data: rows, error: null });
            },
          };
        },
      };
    },
  };
}

function fakeSupabaseSubcategoriesClient(rows, opts){
  return {
    from(table){
      assert.equal(table, 'subcategories');
      return {
        select(cols){
          return {
            eq(col, val){
              if(opts && opts.error) return Promise.resolve({ data: null, error: new Error('симульована мережева помилка') });
              return Promise.resolve({ data: rows, error: null });
            },
          };
        },
      };
    },
  };
}

function fakeSupabaseDictionaryClient(rows, opts){
  return {
    from(table){
      assert.equal(table, 'dictionary');
      return {
        select(cols){
          return {
            eq(col, val){
              if(opts && opts.error) return Promise.resolve({ data: null, error: new Error('симульована мережева помилка') });
              return Promise.resolve({ data: rows, error: null });
            },
          };
        },
      };
    },
  };
}

// Rev #30 (6D.32, hidden_entities — перша реалізація) — push тут ЗАВЖДИ
// upsert (не update-if-cloudId/insert-if-not, як решта доменів), тому
// мок відрізняється: track-mock для .upsert(), окремий read-only mock
// для pull (той самий select().eq() шаблон, що решта pull-мок'ів).
function fakeSupabaseHiddenEntitiesUpsertClient(opts){
  const calls = [];
  return {
    client: {
      from(table){
        assert.equal(table, 'hidden_entities');
        return {
          upsert(payload, upsertOpts){
            calls.push({ payload, upsertOpts });
            if(opts && opts.error) return Promise.resolve({ data: null, error: new Error('симульована мережева помилка') });
            return Promise.resolve({ data: [payload], error: null });
          },
        };
      },
    },
    calls,
  };
}
function fakeSupabaseHiddenEntitiesClient(rows, opts){
  return {
    from(table){
      assert.equal(table, 'hidden_entities');
      return {
        select(cols){
          return {
            eq(col, val){
              if(opts && opts.error) return Promise.resolve({ data: null, error: new Error('симульована мережева помилка') });
              return Promise.resolve({ data: rows, error: null });
            },
          };
        },
      };
    },
  };
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

/* ============ pullCategoriesCore: Pull pilot (6D крок 9) ============ */

/* ============ isCloudSessionReady (Rev #30, 6D індикатор — фікс дублювання) ============ */

test('isCloudSessionReady: усі умови виконані → true', () => {
  const { ctx } = sandbox();
  ctx.cloudSession = { user: { id: 'u1' } };
  ctx.cloudFamilyId = 'fam-1';
  ctx.isSupabaseSdkReady = () => true;
  assert.equal(ctx.isCloudSessionReady(), true);
});

test('isCloudSessionReady: не залогінений → false', () => {
  const { ctx } = sandbox();
  ctx.cloudSession = null;
  ctx.cloudFamilyId = 'fam-1';
  ctx.isSupabaseSdkReady = () => true;
  assert.equal(ctx.isCloudSessionReady(), false);
});

test('isCloudSessionReady: немає cloudFamilyId → false', () => {
  const { ctx } = sandbox();
  ctx.cloudSession = { user: { id: 'u1' } };
  ctx.cloudFamilyId = null;
  ctx.isSupabaseSdkReady = () => true;
  assert.equal(ctx.isCloudSessionReady(), false);
});

test('isCloudSessionReady: SDK не готовий → false', () => {
  const { ctx } = sandbox();
  ctx.cloudSession = { user: { id: 'u1' } };
  ctx.cloudFamilyId = 'fam-1';
  ctx.isSupabaseSdkReady = () => false;
  assert.equal(ctx.isCloudSessionReady(), false);
});

function pullSandbox(rows, opts){
  const { ctx } = sandbox();
  ctx.cloudSession = { user: { id: 'user-1' } };
  ctx.cloudFamilyId = 'fam-1';
  ctx.isSupabaseSdkReady = () => true;
  ctx.getSupabaseClient = () => fakeSupabaseCategoriesClient(rows, opts);
  return ctx;
}

function pullBankSandbox(rows, opts){
  const { ctx } = sandbox();
  ctx.cloudSession = { user: { id: 'user-1' } };
  ctx.cloudFamilyId = 'fam-1';
  ctx.isSupabaseSdkReady = () => true;
  ctx.getSupabaseClient = () => fakeSupabaseBankAccountsClient(rows, opts);
  return ctx;
}

function pullInstallmentSandbox(rows, opts){
  const { ctx } = sandbox();
  ctx.cloudSession = { user: { id: 'user-1' } };
  ctx.cloudFamilyId = 'fam-1';
  ctx.isSupabaseSdkReady = () => true;
  ctx.getSupabaseClient = () => fakeSupabaseInstallmentAccountsClient(rows, opts);
  return ctx;
}

function pullSubcategoriesSandbox(rows, opts){
  const { ctx } = sandbox();
  ctx.cloudSession = { user: { id: 'user-1' } };
  ctx.cloudFamilyId = 'fam-1';
  ctx.isSupabaseSdkReady = () => true;
  ctx.getSupabaseClient = () => fakeSupabaseSubcategoriesClient(rows, opts);
  return ctx;
}

function pullDictionarySandbox(rows, opts){
  const { ctx } = sandbox();
  ctx.cloudSession = { user: { id: 'user-1' } };
  ctx.cloudFamilyId = 'fam-1';
  ctx.isSupabaseSdkReady = () => true;
  ctx.getSupabaseClient = () => fakeSupabaseDictionaryClient(rows, opts);
  return ctx;
}

test('pullCategoriesCore: не залогінений → { skipped:true }, CATEGORIES не чіпаються', async () => {
  const ctx = pullSandbox([{ id: 'c1', name: '🍔 Їжа', active: true }]);
  ctx.cloudSession = null;
  ctx.CATEGORIES = [{ name: 'X', type: 'Гнучка', active: true }];
  const result = await ctx.pullCategoriesCore();
  assert.deepEqual(plain(result), { skipped: true });
  assert.deepEqual(plain(ctx.CATEGORIES), [{ name: 'X', type: 'Гнучка', active: true }]);
});

test('pullCategoriesCore: немає cloudFamilyId → { skipped:true }, тихий пропуск', async () => {
  const ctx = pullSandbox([{ id: 'c1', name: '🍔 Їжа', active: true }]);
  ctx.cloudFamilyId = null;
  const result = await ctx.pullCategoriesCore();
  assert.deepEqual(plain(result), { skipped: true });
});

test('pullCategoriesCore: мережева помилка → { skipped:true }, без винятку', async () => {
  const ctx = pullSandbox(null, { error: true });
  ctx.CATEGORIES = [{ name: 'X', type: 'Гнучка', active: true }];
  const result = await ctx.pullCategoriesCore();
  assert.deepEqual(plain(result), { skipped: true });
  assert.deepEqual(plain(ctx.CATEGORIES), [{ name: 'X', type: 'Гнучка', active: true }]);
});

test('pullCategoriesCore: правило 1 — Cloud новіший (LWW) → оновлюється name/active/type з Cloud-версії', async () => {
  const ctx = pullSandbox([{ id: 'c1', name: '🍔 Їжа (нова назва)', active: false, type: "Обов'язкова", created_at: '2024-01-01T00:00:00.000Z', updated_at: '2024-06-01T00:00:00.000Z' }]);
  ctx.CATEGORIES = [{ name: '🍔 Їжа', type: 'Гнучка', active: true, cloudId: 'c1', createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z' }];
  const result = await ctx.pullCategoriesCore();
  assert.deepEqual(plain(result), { skipped: false, updated: 1, linked: 0, added: 0, keptLocal: 0 });
  assert.equal(ctx.CATEGORIES[0].name, '🍔 Їжа (нова назва)');
  assert.equal(ctx.CATEGORIES[0].active, false);
  assert.equal(ctx.CATEGORIES[0].type, "Обов'язкова");
  assert.equal(ctx.CATEGORIES[0].updatedAt, '2024-06-01T00:00:00.000Z');
});

test('pullCategoriesCore: LWW — локальний СТРОГО новіший за Cloud → local НЕ перезаписується (keptLocal)', async () => {
  // Точний сценарій з DoD: користувач змінив тип локально (updatedAt
  // свіжий), Cloud ще має старе значення (updated_at давніший) — pull НЕ
  // повинен відкотити локальну зміну.
  const ctx = pullSandbox([{ id: 'c1', name: '🍔 Їжа', active: true, type: 'Гнучка', created_at: '2024-01-01T00:00:00.000Z', updated_at: '2024-01-01T00:00:00.000Z' }]);
  ctx.CATEGORIES = [{ name: '🍔 Їжа', type: "Обов'язкова", active: true, cloudId: 'c1', createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-06-01T00:00:00.000Z' }];
  const result = await ctx.pullCategoriesCore();
  assert.deepEqual(plain(result), { skipped: false, updated: 0, linked: 0, added: 0, keptLocal: 1 });
  // Локальна версія лишається БЕЗ ЗМІН — Cloud НЕ перезаписав тип.
  assert.equal(ctx.CATEGORIES[0].type, "Обов'язкова");
  assert.equal(ctx.CATEGORIES[0].active, true);
  assert.equal(ctx.CATEGORIES[0].updatedAt, '2024-06-01T00:00:00.000Z');
});

test('pullCategoriesCore: LWW — рівні updatedAt → Cloud перемагає (той самий fallback, що діяв раніше для всіх випадків)', async () => {
  const ctx = pullSandbox([{ id: 'c1', name: '🍔 Їжа (Cloud)', active: true, type: 'Гнучка', created_at: '2024-01-01T00:00:00.000Z', updated_at: '2024-01-01T00:00:00.000Z' }]);
  ctx.CATEGORIES = [{ name: '🍔 Їжа', type: 'Гнучка', active: true, cloudId: 'c1', createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z' }];
  const result = await ctx.pullCategoriesCore();
  assert.deepEqual(plain(result), { skipped: false, updated: 1, linked: 0, added: 0, keptLocal: 0 });
  assert.equal(ctx.CATEGORIES[0].name, '🍔 Їжа (Cloud)');
});

test('pullCategoriesCore: LWW — local без updatedAt (перехідний стан, ще не backfill-ився) → Cloud перемагає', async () => {
  const ctx = pullSandbox([{ id: 'c1', name: '🍔 Їжа (Cloud)', active: true, type: 'Гнучка', created_at: '2024-01-01T00:00:00.000Z', updated_at: '2024-01-01T00:00:00.000Z' }]);
  ctx.CATEGORIES = [{ name: '🍔 Їжа', type: 'Гнучка', active: true, cloudId: 'c1' }]; // немає createdAt/updatedAt узагалі
  const result = await ctx.pullCategoriesCore();
  assert.deepEqual(plain(result), { skipped: false, updated: 1, linked: 0, added: 0, keptLocal: 0 });
  assert.equal(ctx.CATEGORIES[0].name, '🍔 Їжа (Cloud)');
  assert.equal(ctx.CATEGORIES[0].updatedAt, '2024-01-01T00:00:00.000Z');
});

test('pullCategoriesCore: BugFix — type тепер РЕАЛЬНО синхронізується з Cloud (не завжди дефолт "Гнучка")', async () => {
  // Регресійний тест на знайдений користувачем ризик: категорія, що на
  // пристрої-джерелі має type:"Обов'язкова", НЕ повинна тихо ставати
  // "Гнучка" після pull на іншому пристрої — inline з mandatoryPaymentsSummary()
  // (#26), яка фільтрує саме за цим полем для KPI "Обов'язкові платежі".
  const ctx = pullSandbox([{ id: 'c9', name: '💳 Підписки', active: true, type: "Обов'язкова" }]);
  ctx.CATEGORIES = [];
  const result = await ctx.pullCategoriesCore();
  assert.deepEqual(plain(result), { skipped: false, updated: 0, linked: 0, added: 1, keptLocal: 0 });
  assert.equal(ctx.CATEGORIES[0].type, "Обов'язкова");
});

test('pullCategoriesCore: правило 1 (no-op) — cloudId збігається, дані вже ідентичні (враховуючи type/updatedAt) → лічильники нульові', async () => {
  const ctx = pullSandbox([{ id: 'c1', name: '🍔 Їжа', active: true, type: 'Гнучка', created_at: '2024-01-01T00:00:00.000Z', updated_at: '2024-01-01T00:00:00.000Z' }]);
  ctx.CATEGORIES = [{ name: '🍔 Їжа', type: 'Гнучка', active: true, cloudId: 'c1', createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z' }];
  const result = await ctx.pullCategoriesCore();
  assert.deepEqual(plain(result), { skipped: false, updated: 0, linked: 0, added: 0, keptLocal: 0 });
});

test('pullCategoriesCore: правило 2 — unlinked (без cloudId) local з тим самим name → зв\'язується (cloudId) і self-heal одразу підтягує Cloud active/type, не дублюється', async () => {
  const ctx = pullSandbox([{ id: 'c2', name: '🍔 Їжа', active: true, type: "Обов'язкова" }]);
  ctx.CATEGORIES = [{ name: '🍔 Їжа', type: 'Гнучка', active: true }]; // без cloudId — ще не пушилась
  const result = await ctx.pullCategoriesCore();
  assert.deepEqual(plain(result), { skipped: false, updated: 0, linked: 1, added: 0, keptLocal: 0 });
  assert.equal(ctx.CATEGORIES.length, 1); // НЕ задублювалось
  assert.equal(ctx.CATEGORIES[0].cloudId, 'c2');
  assert.equal(ctx.CATEGORIES[0].type, "Обов'язкова");
});

test('pullCategoriesCore: BugFix (6D) — local з "МЕРТВИМ" cloudId (Cloud-рядок з таким id більше не існує) + правильний name → self-heal, БЕЗ дублювання', async () => {
  // Регресійний тест на точний сценарій з реального інциденту: користувач
  // відновив локальний бекап, у якому "Харчування" несла застарілий
  // cloudId з давнього self-heal-тесту (рядок з таким id давно не існує
  // в Cloud). До фіксу: byCloudId не знаходив (id чужий), byName ТЕЖ не
  // знаходив (умова `!c.cloudId` виключала запис, бо він МАЄ якийсь
  // cloudId, хай і мертвий) → падало у гілку "новий запис", утворюючи
  // ДРУГИЙ локальний об'єкт з тим самим name, лишаючи старий сиротою
  // назавжди. Підтверджено контрольованим відтворенням у browser preview
  // (мокнутий Supabase-клієнт, реальний UI-флоу deleteCategory() +
  // applyBackupData() + pullCategoriesCore()) перед фіксом.
  const ctx = pullSandbox([{ id: 'c1', name: '🍔 Харчування', active: true, type: 'Скорочувана' }]);
  ctx.CATEGORIES = [{ name: '🍔 Харчування', type: 'Гнучка', active: true, cloudId: 'dead-old-selfheal-id' }];
  const result = await ctx.pullCategoriesCore();
  assert.deepEqual(plain(result), { skipped: false, updated: 0, linked: 1, added: 0, keptLocal: 0 });
  assert.equal(ctx.CATEGORIES.length, 1); // КРИТИЧНО: НЕ задублювалось
  assert.equal(ctx.CATEGORIES[0].cloudId, 'c1'); // self-heal перезаписав мертвий cloudId
  assert.equal(ctx.CATEGORIES[0].active, true);
  assert.equal(ctx.CATEGORIES[0].type, 'Скорочувана');
});

test('pullCategoriesCore: правило 3 — новий Cloud-рядок без local-відповідника → додається з РЕАЛЬНИМ Cloud type', async () => {
  const ctx = pullSandbox([{ id: 'c3', name: '🎮 Розваги (з іншого пристрою)', active: true, type: 'Скорочувана' }]);
  ctx.CATEGORIES = [];
  const result = await ctx.pullCategoriesCore();
  assert.deepEqual(plain(result), { skipped: false, updated: 0, linked: 0, added: 1, keptLocal: 0 });
  assert.equal(ctx.CATEGORIES.length, 1);
  assert.equal(ctx.CATEGORIES[0].name, '🎮 Розваги (з іншого пристрою)');
  assert.equal(ctx.CATEGORIES[0].cloudId, 'c3');
  assert.equal(ctx.CATEGORIES[0].type, 'Скорочувана');
});

test('pullCategoriesCore: правило 3 — Cloud-рядок БЕЗ type (страховка на старий/нестандартний рядок) → фолбек "Гнучка"', async () => {
  const ctx = pullSandbox([{ id: 'c4', name: '🧾 Легасі-рядок', active: true }]); // type відсутній у моці
  ctx.CATEGORIES = [];
  const result = await ctx.pullCategoriesCore();
  assert.deepEqual(plain(result), { skipped: false, updated: 0, linked: 0, added: 1, keptLocal: 0 });
  assert.equal(ctx.CATEGORIES[0].type, 'Гнучка');
});

test('pullCategoriesCore: локальна незв\'язана категорія БЕЗ Cloud-відповідника → не чіпається', async () => {
  const ctx = pullSandbox([{ id: 'c1', name: '🍔 Їжа', active: true, type: 'Гнучка' }]);
  ctx.CATEGORIES = [
    { name: '🍔 Їжа', type: 'Гнучка', active: true }, // зв'яжеться (правило 2)
    { name: '🧘 Особисте (лише локальна)', type: 'Гнучка', active: true }, // немає в Cloud — недоторкана
  ];
  await ctx.pullCategoriesCore();
  const untouched = ctx.CATEGORIES.find(c => c.name === '🧘 Особисте (лише локальна)');
  assert.deepEqual(plain(untouched), { name: '🧘 Особисте (лише локальна)', type: 'Гнучка', active: true });
});

test('pullCategoriesCore: видалення НЕ синхронізується — local з "висячим" cloudId (Cloud-рядка більше немає) лишається', async () => {
  const ctx = pullSandbox([]); // Cloud family — порожній набір (усе видалено на іншому пристрої)
  ctx.CATEGORIES = [{ name: '🍔 Їжа', type: 'Гнучка', active: true, cloudId: 'c1' }];
  const result = await ctx.pullCategoriesCore();
  assert.deepEqual(plain(result), { skipped: false, updated: 0, linked: 0, added: 0, keptLocal: 0 });
  assert.equal(ctx.CATEGORIES.length, 1); // НЕ видалено
  assert.equal(ctx.CATEGORIES[0].cloudId, 'c1');
});

test('pullCategoriesCore: пише лише saveCategoriesLocal() — pushCategoriesPilot() НЕ тригериться для звичайного "додати з Cloud" (без зациклення pull→push)', async () => {
  const ctx = pullSandbox([{ id: 'c3', name: '🎮 Розваги', active: true, type: 'Гнучка' }]);
  ctx.CATEGORIES = [];
  const pushSpy = spyOn(ctx, 'pushCategoriesPilot');
  await ctx.pullCategoriesCore();
  assert.equal(pushSpy.count(), 0);
  // саме збереження ВІДБУЛОСЬ (не порожня операція) — підтверджує, що
  // пропущений push — не випадковість (напр. guard clause на іншому кроці).
  assert.equal(ctx.localStorage.getItem('budget_categories_v1'), JSON.stringify(ctx.CATEGORIES));
});

test('pullCategoriesCore: push-retry — LWW-переможець (keptLocal) ОДРАЗУ тригерить pushCategoriesPilot(), не чекаючи ручного редагування', async () => {
  const ctx = pullSandbox([{ id: 'c1', name: '🍔 Їжа', active: true, type: 'Гнучка', created_at: '2024-01-01T00:00:00.000Z', updated_at: '2024-01-01T00:00:00.000Z' }]);
  ctx.CATEGORIES = [{ name: '🍔 Їжа', type: "Обов'язкова", active: true, cloudId: 'c1', createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-06-01T00:00:00.000Z' }];
  const pushSpy = spyOn(ctx, 'pushCategoriesPilot');
  const result = await ctx.pullCategoriesCore();
  assert.equal(result.keptLocal, 1);
  assert.equal(pushSpy.count(), 1);
});

test('pullCategoriesCore: push-retry НЕ тригериться, коли Cloud перемагає (лише правило 1 "keptLocal" гілка це робить)', async () => {
  const ctx = pullSandbox([{ id: 'c1', name: '🍔 Їжа (Cloud новіший)', active: true, type: 'Гнучка', created_at: '2024-01-01T00:00:00.000Z', updated_at: '2024-06-01T00:00:00.000Z' }]);
  ctx.CATEGORIES = [{ name: '🍔 Їжа', type: "Обов'язкова", active: true, cloudId: 'c1', createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z' }];
  const pushSpy = spyOn(ctx, 'pushCategoriesPilot');
  const result = await ctx.pullCategoriesCore();
  assert.equal(result.updated, 1);
  assert.equal(pushSpy.count(), 0);
});

test('pullCategoriesCore: домен мігровано на IndexedDB → зберігає туди (routing спільний з saveCategoriesLocal)', async () => {
  const ctx = pullSandbox([{ id: 'c3', name: '🎮 Розваги', active: true, type: 'Гнучка' }]);
  ctx.markDomainMigrated('categories');
  ctx.CATEGORIES = [];
  await ctx.pullCategoriesCore();
  assert.equal(ctx.CATEGORIES.length, 1);
});

test('pullCategoriesCore: змішаний сценарій — усі три правила одночасно, кожен по своєму шляху', async () => {
  const ctx = pullSandbox([
    { id: 'c1', name: '🍔 Їжа (оновлено)', active: true, type: "Обов'язкова" },  // правило 1: update (i.e. type теж)
    { id: 'c2', name: '🚗 Транспорт', active: true, type: 'Гнучка' },            // правило 2: link
    { id: 'c3', name: '🎮 Розваги', active: true, type: 'Скорочувана' },         // правило 3: add
  ]);
  ctx.CATEGORIES = [
    { name: '🍔 Їжа', type: 'Гнучка', active: true, cloudId: 'c1' },
    { name: '🚗 Транспорт', type: 'Гнучка', active: true },
    { name: '🧘 Особисте', type: 'Гнучка', active: true },
  ];
  const result = await ctx.pullCategoriesCore();
  assert.deepEqual(plain(result), { skipped: false, updated: 1, linked: 1, added: 1, keptLocal: 0 });
  assert.equal(ctx.CATEGORIES.length, 4);
  assert.equal(ctx.CATEGORIES.find(c => c.cloudId === 'c1').name, '🍔 Їжа (оновлено)');
  assert.equal(ctx.CATEGORIES.find(c => c.cloudId === 'c1').type, "Обов'язкова");
  assert.equal(ctx.CATEGORIES.find(c => c.cloudId === 'c2').name, '🚗 Транспорт');
  assert.equal(ctx.CATEGORIES.find(c => c.cloudId === 'c3').name, '🎮 Розваги');
  assert.equal(ctx.CATEGORIES.find(c => c.cloudId === 'c3').type, 'Скорочувана');
  assert.equal(ctx.CATEGORIES.find(c => c.name === '🧘 Особисте').cloudId, undefined);
});

test('pullCategoriesPilot: тонка обгортка над pullCategoriesCore (той самий результат)', async () => {
  const ctx = pullSandbox([{ id: 'c1', name: '🍔 Їжа', active: true, type: 'Гнучка' }]);
  ctx.CATEGORIES = [];
  const result = await ctx.pullCategoriesPilot();
  assert.deepEqual(plain(result), { skipped: false, updated: 0, linked: 0, added: 1, keptLocal: 0 });
});

/* ============ pullBankAccountsCore: Pull pilot (bank_accounts, повний цикл) ============
   Написаний одразу у фінальному вигляді pullCategoriesCore (6D.17→6D.19→6D.20) —
   тести нижче дзеркалять ті самі сценарії, включно з регресійним тестом на
   BugFix 6D.19 (мертвий cloudId → self-heal, не дублювання), написаним тут
   ПРЕВЕНТИВНО, а не після знайденого бага. */

test('pullBankAccountsCore: не залогінений → { skipped:true }, bankAccounts не чіпаються', async () => {
  const ctx = pullBankSandbox([{ id: 'b1', name: '🟩 Приват Банк', credit_limit: 50000 }]);
  ctx.cloudSession = null;
  ctx.bankAccounts = [{ name: 'X', creditLimit: 1000 }];
  const result = await ctx.pullBankAccountsCore();
  assert.deepEqual(plain(result), { skipped: true });
  assert.deepEqual(plain(ctx.bankAccounts), [{ name: 'X', creditLimit: 1000 }]);
});

test('pullBankAccountsCore: немає cloudFamilyId → { skipped:true }', async () => {
  const ctx = pullBankSandbox([{ id: 'b1', name: '🟩 Приват Банк', credit_limit: 50000 }]);
  ctx.cloudFamilyId = null;
  const result = await ctx.pullBankAccountsCore();
  assert.deepEqual(plain(result), { skipped: true });
});

test('pullBankAccountsCore: мережева помилка → { skipped:true }, без винятку', async () => {
  const ctx = pullBankSandbox(null, { error: true });
  ctx.bankAccounts = [{ name: 'X', creditLimit: 1000 }];
  const result = await ctx.pullBankAccountsCore();
  assert.deepEqual(plain(result), { skipped: true });
});

test('pullBankAccountsCore: правило 1 — Cloud новіший (LWW) → оновлюється name/creditLimit', async () => {
  const ctx = pullBankSandbox([{ id: 'b1', name: '🟩 Приват Банк (новий)', credit_limit: 60000, created_at: '2024-01-01T00:00:00.000Z', updated_at: '2024-06-01T00:00:00.000Z' }]);
  ctx.bankAccounts = [{ name: '🟩 Приват Банк', creditLimit: 50000, cloudId: 'b1', createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z' }];
  const result = await ctx.pullBankAccountsCore();
  assert.deepEqual(plain(result), { skipped: false, updated: 1, linked: 0, added: 0, keptLocal: 0 });
  assert.equal(ctx.bankAccounts[0].name, '🟩 Приват Банк (новий)');
  assert.equal(ctx.bankAccounts[0].creditLimit, 60000);
});

test('pullBankAccountsCore: LWW — локальний СТРОГО новіший → НЕ перезаписується (keptLocal) + push-retry', async () => {
  const ctx = pullBankSandbox([{ id: 'b1', name: '🟩 Приват Банк', credit_limit: 50000, created_at: '2024-01-01T00:00:00.000Z', updated_at: '2024-01-01T00:00:00.000Z' }]);
  ctx.bankAccounts = [{ name: '🟩 Приват Банк', creditLimit: 75000, cloudId: 'b1', createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-06-01T00:00:00.000Z' }];
  const pushSpy = spyOn(ctx, 'pushBankAccountsPilot');
  const result = await ctx.pullBankAccountsCore();
  assert.deepEqual(plain(result), { skipped: false, updated: 0, linked: 0, added: 0, keptLocal: 1 });
  assert.equal(ctx.bankAccounts[0].creditLimit, 75000); // локальне НЕ перезаписано
  assert.equal(pushSpy.count(), 1); // Частина 1: push-retry тригериться одразу
});

test('pullBankAccountsCore: push-retry НЕ тригериться, коли Cloud перемагає', async () => {
  const ctx = pullBankSandbox([{ id: 'b1', name: '🟩 Приват Банк', credit_limit: 50000, created_at: '2024-01-01T00:00:00.000Z', updated_at: '2024-06-01T00:00:00.000Z' }]);
  ctx.bankAccounts = [{ name: '🟩 Приват Банк', creditLimit: 75000, cloudId: 'b1', createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z' }];
  const pushSpy = spyOn(ctx, 'pushBankAccountsPilot');
  const result = await ctx.pullBankAccountsCore();
  assert.equal(result.updated, 1);
  assert.equal(pushSpy.count(), 0);
});

test('pullBankAccountsCore: BugFix 6D.19 (превентивно) — local з "мертвим" cloudId + правильний name → self-heal, БЕЗ дублювання', async () => {
  const ctx = pullBankSandbox([{ id: 'b1', name: '🟩 Приват Банк', credit_limit: 50000 }]);
  ctx.bankAccounts = [{ name: '🟩 Приват Банк', creditLimit: 50000, cloudId: 'dead-old-id' }];
  const result = await ctx.pullBankAccountsCore();
  assert.deepEqual(plain(result), { skipped: false, updated: 0, linked: 1, added: 0, keptLocal: 0 });
  assert.equal(ctx.bankAccounts.length, 1); // КРИТИЧНО: не задублювалось
  assert.equal(ctx.bankAccounts[0].cloudId, 'b1');
});

test('pullBankAccountsCore: правило 2 — unlinked local з тим самим name → зв\'язується, не дублюється', async () => {
  const ctx = pullBankSandbox([{ id: 'b2', name: '🟩 Приват Банк', credit_limit: 50000 }]);
  ctx.bankAccounts = [{ name: '🟩 Приват Банк', creditLimit: 50000 }];
  const result = await ctx.pullBankAccountsCore();
  assert.deepEqual(plain(result), { skipped: false, updated: 0, linked: 1, added: 0, keptLocal: 0 });
  assert.equal(ctx.bankAccounts.length, 1);
  assert.equal(ctx.bankAccounts[0].cloudId, 'b2');
});

test('pullBankAccountsCore: правило 3 — новий Cloud-рядок без local-відповідника → додається', async () => {
  const ctx = pullBankSandbox([{ id: 'b3', name: '🟨 Raifaizen (з іншого пристрою)', credit_limit: 30000 }]);
  ctx.bankAccounts = [];
  const result = await ctx.pullBankAccountsCore();
  assert.deepEqual(plain(result), { skipped: false, updated: 0, linked: 0, added: 1, keptLocal: 0 });
  assert.equal(ctx.bankAccounts[0].name, '🟨 Raifaizen (з іншого пристрою)');
  assert.equal(ctx.bankAccounts[0].cloudId, 'b3');
});

test('pullBankAccountsCore: локальний БЕЗ Cloud-відповідника → не чіпається (видалення не синхронізується)', async () => {
  const ctx = pullBankSandbox([{ id: 'b1', name: '🟩 Приват Банк', credit_limit: 50000 }]);
  ctx.bankAccounts = [
    { name: '🟩 Приват Банк', creditLimit: 50000 },
    { name: '🟪 Лише локальний банк', creditLimit: 1000 },
  ];
  await ctx.pullBankAccountsCore();
  const untouched = ctx.bankAccounts.find(a => a.name === '🟪 Лише локальний банк');
  assert.deepEqual(plain(untouched), { name: '🟪 Лише локальний банк', creditLimit: 1000 });
});

test('pullBankAccountsCore: пише лише saveBankAccountsLocal() для звичайного "додати" — pushBankAccountsPilot() НЕ тригериться', async () => {
  const ctx = pullBankSandbox([{ id: 'b3', name: '🟨 Raifaizen', credit_limit: 30000 }]);
  ctx.bankAccounts = [];
  const pushSpy = spyOn(ctx, 'pushBankAccountsPilot');
  await ctx.pullBankAccountsCore();
  assert.equal(pushSpy.count(), 0);
  assert.equal(ctx.localStorage.getItem('budget_bankaccounts_v1'), JSON.stringify(ctx.bankAccounts));
});

test('pullBankAccountsPilot: тонка обгортка над pullBankAccountsCore (той самий результат)', async () => {
  const ctx = pullBankSandbox([{ id: 'b1', name: '🟩 Приват Банк', credit_limit: 50000 }]);
  ctx.bankAccounts = [];
  const result = await ctx.pullBankAccountsPilot();
  assert.deepEqual(plain(result), { skipped: false, updated: 0, linked: 0, added: 1, keptLocal: 0 });
});

/* ============ ensureBankAccountIdentity (Rev #30, bank_accounts Варіант А) ============ */

test('ensureBankAccountIdentity: запис без createdAt/updatedAt → заповнюється "зараз"', async () => {
  const { ctx } = sandbox();
  ctx.bankAccounts = [{ name: '🟩 Приват Банк', creditLimit: 50000 }];
  const spy = spyOn(ctx, 'saveBankAccounts');
  await ctx.ensureBankAccountIdentity();
  assert.ok(ctx.bankAccounts[0].createdAt);
  assert.equal(ctx.bankAccounts[0].updatedAt, ctx.bankAccounts[0].createdAt);
  assert.equal(spy.count(), 1);
});

test('ensureBankAccountIdentity: запис вже МАЄ createdAt/updatedAt → не перезаписується, save не кличе', async () => {
  const { ctx } = sandbox();
  ctx.bankAccounts = [{ name: '🟩 Приват Банк', creditLimit: 50000, createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-06-01T00:00:00.000Z' }];
  const spy = spyOn(ctx, 'saveBankAccounts');
  await ctx.ensureBankAccountIdentity();
  assert.equal(ctx.bankAccounts[0].createdAt, '2024-01-01T00:00:00.000Z');
  assert.equal(ctx.bankAccounts[0].updatedAt, '2024-06-01T00:00:00.000Z');
  assert.equal(spy.count(), 0);
});

/* ============ pullInstallmentAccountsCore: Pull pilot (installment_accounts, повний цикл) ============
   Rev #30 (6D.27) — третій раз той самий шаблон (categories → bank_accounts →
   installment_accounts), написаний одразу у фінальному вигляді. Тести нижче
   дзеркалять ті самі сценарії, що pullBankAccountsCore вище. */

test('pullInstallmentAccountsCore: не залогінений → { skipped:true }, installmentAccounts не чіпаються', async () => {
  const ctx = pullInstallmentSandbox([{ id: 'i1', name: 'iPhone', initial_amount: 25000, due_day: 5 }]);
  ctx.cloudSession = null;
  ctx.installmentAccounts = [{ name: 'X', initialAmount: 1000 }];
  const result = await ctx.pullInstallmentAccountsCore();
  assert.deepEqual(plain(result), { skipped: true });
  assert.deepEqual(plain(ctx.installmentAccounts), [{ name: 'X', initialAmount: 1000 }]);
});

test('pullInstallmentAccountsCore: немає cloudFamilyId → { skipped:true }', async () => {
  const ctx = pullInstallmentSandbox([{ id: 'i1', name: 'iPhone', initial_amount: 25000, due_day: 5 }]);
  ctx.cloudFamilyId = null;
  const result = await ctx.pullInstallmentAccountsCore();
  assert.deepEqual(plain(result), { skipped: true });
});

test('pullInstallmentAccountsCore: мережева помилка → { skipped:true }, без винятку', async () => {
  const ctx = pullInstallmentSandbox(null, { error: true });
  ctx.installmentAccounts = [{ name: 'X', initialAmount: 1000 }];
  const result = await ctx.pullInstallmentAccountsCore();
  assert.deepEqual(plain(result), { skipped: true });
});

test('pullInstallmentAccountsCore: правило 1 — Cloud новіший (LWW) → оновлюється name/initialAmount/dueDay', async () => {
  const ctx = pullInstallmentSandbox([{ id: 'i1', name: 'iPhone (новий)', initial_amount: 30000, due_day: 10, created_at: '2024-01-01T00:00:00.000Z', updated_at: '2024-06-01T00:00:00.000Z' }]);
  ctx.installmentAccounts = [{ name: 'iPhone', initialAmount: 25000, dueDay: 5, cloudId: 'i1', createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z' }];
  const result = await ctx.pullInstallmentAccountsCore();
  assert.deepEqual(plain(result), { skipped: false, updated: 1, linked: 0, added: 0, keptLocal: 0 });
  assert.equal(ctx.installmentAccounts[0].name, 'iPhone (новий)');
  assert.equal(ctx.installmentAccounts[0].initialAmount, 30000);
  assert.equal(ctx.installmentAccounts[0].dueDay, 10);
});

test('pullInstallmentAccountsCore: LWW — локальний СТРОГО новіший → НЕ перезаписується (keptLocal) + push-retry', async () => {
  const ctx = pullInstallmentSandbox([{ id: 'i1', name: 'iPhone', initial_amount: 25000, due_day: 5, created_at: '2024-01-01T00:00:00.000Z', updated_at: '2024-01-01T00:00:00.000Z' }]);
  ctx.installmentAccounts = [{ name: 'iPhone', initialAmount: 27000, dueDay: 15, cloudId: 'i1', createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-06-01T00:00:00.000Z' }];
  const pushSpy = spyOn(ctx, 'pushInstallmentAccountsPilot');
  const result = await ctx.pullInstallmentAccountsCore();
  assert.deepEqual(plain(result), { skipped: false, updated: 0, linked: 0, added: 0, keptLocal: 1 });
  assert.equal(ctx.installmentAccounts[0].initialAmount, 27000); // локальне НЕ перезаписано
  assert.equal(ctx.installmentAccounts[0].dueDay, 15);
  assert.equal(pushSpy.count(), 1); // Частина 1: push-retry тригериться одразу
});

test('pullInstallmentAccountsCore: push-retry НЕ тригериться, коли Cloud перемагає', async () => {
  const ctx = pullInstallmentSandbox([{ id: 'i1', name: 'iPhone', initial_amount: 25000, due_day: 5, created_at: '2024-01-01T00:00:00.000Z', updated_at: '2024-06-01T00:00:00.000Z' }]);
  ctx.installmentAccounts = [{ name: 'iPhone', initialAmount: 27000, dueDay: 15, cloudId: 'i1', createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z' }];
  const pushSpy = spyOn(ctx, 'pushInstallmentAccountsPilot');
  const result = await ctx.pullInstallmentAccountsCore();
  assert.equal(result.updated, 1);
  assert.equal(pushSpy.count(), 0);
});

test('pullInstallmentAccountsCore: BugFix 6D.19-стиль (превентивно) — local з "мертвим" cloudId + правильний name → self-heal, БЕЗ дублювання', async () => {
  const ctx = pullInstallmentSandbox([{ id: 'i1', name: 'iPhone', initial_amount: 25000, due_day: 5 }]);
  ctx.installmentAccounts = [{ name: 'iPhone', initialAmount: 25000, dueDay: 5, cloudId: 'dead-old-id' }];
  const result = await ctx.pullInstallmentAccountsCore();
  assert.deepEqual(plain(result), { skipped: false, updated: 0, linked: 1, added: 0, keptLocal: 0 });
  assert.equal(ctx.installmentAccounts.length, 1); // КРИТИЧНО: не задублювалось
  assert.equal(ctx.installmentAccounts[0].cloudId, 'i1');
});

test('pullInstallmentAccountsCore: правило 2 — unlinked local з тим самим name → зв\'язується, не дублюється', async () => {
  const ctx = pullInstallmentSandbox([{ id: 'i2', name: 'iPhone', initial_amount: 25000, due_day: 5 }]);
  ctx.installmentAccounts = [{ name: 'iPhone', initialAmount: 25000 }];
  const result = await ctx.pullInstallmentAccountsCore();
  assert.deepEqual(plain(result), { skipped: false, updated: 0, linked: 1, added: 0, keptLocal: 0 });
  assert.equal(ctx.installmentAccounts.length, 1);
  assert.equal(ctx.installmentAccounts[0].cloudId, 'i2');
});

test('pullInstallmentAccountsCore: правило 3 — новий Cloud-рядок без local-відповідника → додається', async () => {
  const ctx = pullInstallmentSandbox([{ id: 'i3', name: 'MacBook (з іншого пристрою)', initial_amount: 45000, due_day: 20 }]);
  ctx.installmentAccounts = [];
  const result = await ctx.pullInstallmentAccountsCore();
  assert.deepEqual(plain(result), { skipped: false, updated: 0, linked: 0, added: 1, keptLocal: 0 });
  assert.equal(ctx.installmentAccounts[0].name, 'MacBook (з іншого пристрою)');
  assert.equal(ctx.installmentAccounts[0].cloudId, 'i3');
});

test('pullInstallmentAccountsCore: локальний БЕЗ Cloud-відповідника → не чіпається (видалення не синхронізується)', async () => {
  const ctx = pullInstallmentSandbox([{ id: 'i1', name: 'iPhone', initial_amount: 25000, due_day: 5 }]);
  ctx.installmentAccounts = [
    { name: 'iPhone', initialAmount: 25000 },
    { name: 'Лише локальна ОЧ', initialAmount: 1000 },
  ];
  await ctx.pullInstallmentAccountsCore();
  const untouched = ctx.installmentAccounts.find(a => a.name === 'Лише локальна ОЧ');
  assert.deepEqual(plain(untouched), { name: 'Лише локальна ОЧ', initialAmount: 1000 });
});

test('pullInstallmentAccountsCore: пише лише saveInstallmentAccountsLocal() для звичайного "додати" — pushInstallmentAccountsPilot() НЕ тригериться', async () => {
  const ctx = pullInstallmentSandbox([{ id: 'i3', name: 'MacBook', initial_amount: 45000, due_day: 20 }]);
  ctx.installmentAccounts = [];
  const pushSpy = spyOn(ctx, 'pushInstallmentAccountsPilot');
  await ctx.pullInstallmentAccountsCore();
  assert.equal(pushSpy.count(), 0);
  assert.equal(ctx.localStorage.getItem('budget_installmentaccounts_v1'), JSON.stringify(ctx.installmentAccounts));
});

test('pullInstallmentAccountsCore: reconciliation на два пристрої з різними полями (один міняє initialAmount, другий — dueDay) — новіший локально виграє ЦІЛИМ записом (LWW не field-level)', async () => {
  // Той самий, задокументований у "Відомі обмеження" компроміс, що
  // pullCategoriesCore/pullBankAccountsCore: LWW порівнює УВЕСЬ запис за
  // updatedAt, не зливає поля окремо — тут явно перевірено на installment_accounts.
  const ctx = pullInstallmentSandbox([{ id: 'i1', name: 'iPhone', initial_amount: 25000, due_day: 20, created_at: '2024-01-01T00:00:00.000Z', updated_at: '2024-06-01T00:00:00.000Z' }]);
  ctx.installmentAccounts = [{ name: 'iPhone', initialAmount: 27000, dueDay: 5, cloudId: 'i1', createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-06-02T00:00:00.000Z' }];
  const result = await ctx.pullInstallmentAccountsCore();
  assert.equal(result.keptLocal, 1);
  // локальний (initialAmount:27000, dueDay:5) новіший за Cloud (due_day:20) → весь запис лишається локальним
  assert.equal(ctx.installmentAccounts[0].initialAmount, 27000);
  assert.equal(ctx.installmentAccounts[0].dueDay, 5);
});

test('pullInstallmentAccountsPilot: тонка обгортка над pullInstallmentAccountsCore (той самий результат)', async () => {
  const ctx = pullInstallmentSandbox([{ id: 'i1', name: 'iPhone', initial_amount: 25000, due_day: 5 }]);
  ctx.installmentAccounts = [];
  const result = await ctx.pullInstallmentAccountsPilot();
  assert.deepEqual(plain(result), { skipped: false, updated: 0, linked: 0, added: 1, keptLocal: 0 });
});

/* ============ ensureInstallmentAccountIdentity (Rev #30, 6D.27) ============ */

test('ensureInstallmentAccountIdentity: запис без createdAt/updatedAt → заповнюється "зараз"', async () => {
  const { ctx } = sandbox();
  ctx.installmentAccounts = [{ name: 'iPhone', initialAmount: 25000 }];
  const spy = spyOn(ctx, 'saveInstallmentAccounts');
  await ctx.ensureInstallmentAccountIdentity();
  assert.ok(ctx.installmentAccounts[0].createdAt);
  assert.equal(ctx.installmentAccounts[0].updatedAt, ctx.installmentAccounts[0].createdAt);
  assert.equal(spy.count(), 1);
});

test('ensureInstallmentAccountIdentity: запис вже МАЄ createdAt/updatedAt → не перезаписується, save не кличе', async () => {
  const { ctx } = sandbox();
  ctx.installmentAccounts = [{ name: 'iPhone', initialAmount: 25000, createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-06-01T00:00:00.000Z' }];
  const spy = spyOn(ctx, 'saveInstallmentAccounts');
  await ctx.ensureInstallmentAccountIdentity();
  assert.equal(ctx.installmentAccounts[0].createdAt, '2024-01-01T00:00:00.000Z');
  assert.equal(ctx.installmentAccounts[0].updatedAt, '2024-06-01T00:00:00.000Z');
  assert.equal(spy.count(), 0);
});

/* ============ ensureBankInstallmentNamesStripped (Rev #30, 6D.31 — повне прибирання emoji) ============
   Одноразова, ідемпотентна міграція: emoji прибирається з name, і той самий
   рядок оновлюється всюди, де він natural-key — debts[], hiddenFrom,
   ignoredDivergences (лише installment), expenses[].linkedInstallment
   (лише installment). */

test('renameStrippingEmoji: назва без emoji-префікса → no-op, changed:false, нічого не чіпає', () => {
  const { ctx } = sandbox();
  ctx.bankAccounts = [{ name: 'Приват Банк', creditLimit: 1000 }];
  ctx.debts = [{ id: 'd1', name: 'Приват Банк', kind: 'card', month: '2026-01', balance: 500 }];
  const changed = ctx.renameStrippingEmoji(ctx.bankAccounts, 'card');
  assert.equal(changed, false);
  assert.equal(ctx.bankAccounts[0].name, 'Приват Банк');
  assert.equal(ctx.debts[0].name, 'Приват Банк');
});

test('renameStrippingEmoji: bankAccounts (kind card) — emoji прибрано, debts перейменовано ретроактивно, hiddenFrom rekeyed, updatedAt проставлено', () => {
  const { ctx } = sandbox();
  ctx.bankAccounts = [{ name: '🟩 Приват Банк', creditLimit: 1000, createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z' }];
  ctx.debts = [
    { id: 'd1', name: '🟩 Приват Банк', kind: 'card', month: '2026-01', balance: 500 },
    { id: 'd2', name: '🟩 Приват Банк', kind: 'installment', month: '2026-01', balance: 999 }, // інший kind — НЕ чіпати
  ];
  ctx.hiddenFrom = { [ctx.hideKey('🟩 Приват Банк', 'card')]: '2026-06' };
  const changed = ctx.renameStrippingEmoji(ctx.bankAccounts, 'card');
  assert.equal(changed, true);
  assert.equal(ctx.bankAccounts[0].name, 'Приват Банк');
  assert.equal(ctx.bankAccounts[0].createdAt, '2024-01-01T00:00:00.000Z'); // createdAt незмінний
  assert.notEqual(ctx.bankAccounts[0].updatedAt, '2024-01-01T00:00:00.000Z'); // updatedAt — реальна зміна
  assert.equal(ctx.debts[0].name, 'Приват Банк'); // kind='card' — перейменовано
  assert.equal(ctx.debts[1].name, '🟩 Приват Банк'); // kind='installment' — НЕ чіпалось
  assert.equal(ctx.hiddenFrom[ctx.hideKey('Приват Банк', 'card')], '2026-06');
  assert.equal(ctx.hiddenFrom[ctx.hideKey('🟩 Приват Банк', 'card')], undefined);
});

test('renameStrippingEmoji: installmentAccounts (kind installment) — debts, expenses.linkedInstallment, hiddenFrom, ignoredDivergences всі оновлені', () => {
  const { ctx } = sandbox();
  ctx.installmentAccounts = [{ name: '📱 iPhone', initialAmount: 25000, createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z' }];
  ctx.debts = [{ id: 'd1', name: '📱 iPhone', kind: 'installment', month: '2026-01', balance: 500 }];
  ctx.expenses = [{ id: 'e1', date: '2026-01-05', name: '📱 iPhone', amount: 500, linkedInstallment: '📱 iPhone' }];
  ctx.hiddenFrom = { [ctx.hideKey('📱 iPhone', 'installment')]: '2026-06' };
  ctx.ignoredDivergences = { [ctx.divergenceKey('📱 iPhone', '2026-03')]: true };
  const changed = ctx.renameStrippingEmoji(ctx.installmentAccounts, 'installment');
  assert.equal(changed, true);
  assert.equal(ctx.installmentAccounts[0].name, 'iPhone');
  assert.equal(ctx.debts[0].name, 'iPhone');
  assert.equal(ctx.expenses[0].linkedInstallment, 'iPhone');
  assert.equal(ctx.hiddenFrom[ctx.hideKey('iPhone', 'installment')], '2026-06');
  assert.equal(ctx.ignoredDivergences[ctx.divergenceKey('iPhone', '2026-03')], true);
  assert.equal(ctx.ignoredDivergences[ctx.divergenceKey('📱 iPhone', '2026-03')], undefined);
});

test('ensureBankInstallmentNamesStripped: мігрує обидва домени за один прогін, save/push лише для того, що реально змінилось', async () => {
  const { ctx } = sandbox();
  ctx.bankAccounts = [{ name: '🟩 Приват Банк', creditLimit: 1000 }];
  ctx.installmentAccounts = [{ name: 'iPhone', initialAmount: 25000 }]; // вже без emoji
  ctx.debts = [];
  const bankSpy = spyOn(ctx, 'saveBankAccounts');
  const instSpy = spyOn(ctx, 'saveInstallmentAccounts');
  const debtsSpy = spyOn(ctx, 'saveDebts');
  await ctx.ensureBankInstallmentNamesStripped();
  assert.equal(ctx.bankAccounts[0].name, 'Приват Банк');
  assert.equal(ctx.installmentAccounts[0].name, 'iPhone');
  assert.equal(bankSpy.count(), 1);
  assert.equal(instSpy.count(), 0); // installmentAccounts не змінювався — save НЕ кличеться
  assert.equal(debtsSpy.count(), 1); // bankChanged=true — допоміжні домени зберігаються
});

test('ensureBankInstallmentNamesStripped: ідемпотентність — повторний виклик на вже мігровані дані НІЧОГО не кличе', async () => {
  const { ctx } = sandbox();
  ctx.bankAccounts = [{ name: 'Приват Банк', creditLimit: 1000 }];
  ctx.installmentAccounts = [{ name: 'iPhone', initialAmount: 25000 }];
  const bankSpy = spyOn(ctx, 'saveBankAccounts');
  const instSpy = spyOn(ctx, 'saveInstallmentAccounts');
  const debtsSpy = spyOn(ctx, 'saveDebts');
  await ctx.ensureBankInstallmentNamesStripped();
  assert.equal(bankSpy.count(), 0);
  assert.equal(instSpy.count(), 0);
  assert.equal(debtsSpy.count(), 0);
});

/* ============ hidden_entities — перша реалізація (Rev #30, 6D.32) ============
   Найпростіший домен: reconciliation за (family_id, entity_type,
   entity_id) — UNIQUE у Cloud-схемі, entity_id = cloudId батька (не name).
   push — ЗАВЖДИ upsert. Немає updated_at — LWW спрощений до "приховати
   перемагає" (push) / "не перезаписувати вже приховане" (pull). */

test('pushHiddenEntitiesPilot: не залогінений → жодного виклику Cloud, { success:true } (не помилка, не спробували)', async () => {
  const { ctx } = sandbox();
  ctx.hiddenFrom = { 'card:Приват Банк': '2026-06' };
  ctx.bankAccounts = [{ name: 'Приват Банк', cloudId: 'b1' }];
  const result = await ctx.pushHiddenEntitiesPilot(); // guard clause, getSupabaseClient не викликається взагалі
  assert.deepEqual(plain(result), { success: true });
});

test('pushHiddenEntitiesPilot: батько (bankAccounts) ще не синхронізований (немає cloudId) → тихий пропуск, upsert НЕ викликається, { success:true }', async () => {
  const { ctx } = sandbox();
  ctx.cloudSession = { user: { id: 'user-1' } };
  ctx.cloudFamilyId = 'fam-1';
  ctx.isSupabaseSdkReady = () => true;
  const fake = fakeSupabaseHiddenEntitiesUpsertClient();
  ctx.getSupabaseClient = () => fake.client;
  ctx.hiddenFrom = { 'card:Приват Банк': '2026-06' };
  ctx.bankAccounts = [{ name: 'Приват Банк' }]; // без cloudId
  const result = await ctx.pushHiddenEntitiesPilot();
  assert.equal(fake.calls.length, 0);
  assert.deepEqual(plain(result), { success: true }); // тихий пропуск — НЕ помилка
});

test('pushHiddenEntitiesPilot: kind "card" → entity_type "bank", entity_id = cloudId, upsert на onConflict family_id,entity_type,entity_id', async () => {
  const { ctx } = sandbox();
  ctx.cloudSession = { user: { id: 'user-1' } };
  ctx.cloudFamilyId = 'fam-1';
  ctx.isSupabaseSdkReady = () => true;
  const fake = fakeSupabaseHiddenEntitiesUpsertClient();
  ctx.getSupabaseClient = () => fake.client;
  ctx.hiddenFrom = { 'card:Приват Банк': '2026-06' };
  ctx.bankAccounts = [{ name: 'Приват Банк', cloudId: 'b1' }];
  const result = await ctx.pushHiddenEntitiesPilot();
  assert.equal(fake.calls.length, 1);
  assert.equal(fake.calls[0].payload.entity_type, 'bank');
  assert.equal(fake.calls[0].payload.entity_id, 'b1');
  // Rev #30 (6D.32 BugFix) — hidden_from_month у Cloud типу `date`, тому
  // push конвертує "YYYY-MM" → "YYYY-MM-01" (monthToDate()).
  assert.equal(fake.calls[0].payload.hidden_from_month, '2026-06-01');
  assert.equal(fake.calls[0].payload.family_id, 'fam-1');
  assert.equal(fake.calls[0].upsertOpts.onConflict, 'family_id,entity_type,entity_id');
  assert.deepEqual(plain(result), { success: true });
});

test('pushHiddenEntitiesPilot: kind "installment" → entity_type "installment"', async () => {
  const { ctx } = sandbox();
  ctx.cloudSession = { user: { id: 'user-1' } };
  ctx.cloudFamilyId = 'fam-1';
  ctx.isSupabaseSdkReady = () => true;
  const fake = fakeSupabaseHiddenEntitiesUpsertClient();
  ctx.getSupabaseClient = () => fake.client;
  ctx.hiddenFrom = { 'installment:iPhone': '2026-03' };
  ctx.installmentAccounts = [{ name: 'iPhone', cloudId: 'i1' }];
  await ctx.pushHiddenEntitiesPilot();
  assert.equal(fake.calls.length, 1);
  assert.equal(fake.calls[0].payload.entity_type, 'installment');
  assert.equal(fake.calls[0].payload.entity_id, 'i1');
});

test('pushHiddenEntitiesPilot: мережева помилка одного запису → тихий пропуск, решта масиву обробляється', async () => {
  const { ctx } = sandbox();
  ctx.cloudSession = { user: { id: 'user-1' } };
  ctx.cloudFamilyId = 'fam-1';
  ctx.isSupabaseSdkReady = () => true;
  const fake = fakeSupabaseHiddenEntitiesUpsertClient({ error: true });
  ctx.getSupabaseClient = () => fake.client;
  ctx.hiddenFrom = { 'card:Приват Банк': '2026-06' };
  ctx.bankAccounts = [{ name: 'Приват Банк', cloudId: 'b1' }];
  const result = await ctx.pushHiddenEntitiesPilot(); // не кидає, але тепер сигналізує невдачу явно
  assert.equal(fake.calls.length, 1); // спроба відбулась
  // Rev #30 (6D.34, індикатор — стан "помилка") — реальний Supabase-error
  // (не мережевий виняток) тепер теж явно позначається як { success:false },
  // не лише мовчки пропускається — саме це читає withSyncIndicator().
  assert.deepEqual(plain(result), { success: false });
});

/* ============ Індикатор синхронізації — стан "помилка" (Rev #30, 6D.34) ============
   Push-функції тепер явно повертають { success }, а не undefined —
   withSyncIndicator() (DOM-шар, не тестується тут напряму) читає це через
   isSyncResultFailure(). Тести нижче перевіряють САМЕ ЦЕЙ контракт:
   реальна Cloud-помилка (не мережевий виняток, а `error` у відповіді) →
   success:false; guard clause/тихий пропуск (батько ще не синхронізований
   тощо) → success:true (це НЕ помилка). */

test('pushCategoriesPilot: реальна Cloud-помилка (error, не виняток) при update → { success:false }', async () => {
  const { ctx } = sandbox();
  ctx.cloudSession = { user: { id: 'user-1' } };
  ctx.cloudFamilyId = 'fam-1';
  ctx.isSupabaseSdkReady = () => true;
  ctx.getSupabaseClient = () => ({
    from(table){
      assert.equal(table, 'categories');
      return {
        update(){ return { eq(){ return { select(){ return Promise.resolve({ data: null, error: new Error('симульована Cloud-помилка') }); } }; } }; },
      };
    },
  });
  ctx.CATEGORIES = [{ name: 'Тест', type: 'Гнучка', active: true, cloudId: 'c1', updatedAt: '2024-01-01T00:00:00.000Z' }];
  const result = await ctx.pushCategoriesPilot();
  assert.deepEqual(plain(result), { success: false });
});

test('pushCategoriesPilot: не залогінений → { success:true } (тихий пропуск, не помилка)', async () => {
  const { ctx } = sandbox();
  const result = await ctx.pushCategoriesPilot();
  assert.deepEqual(plain(result), { success: true });
});

test('pushIncomeRecordPilot: успішний upsert → { success:true }', async () => {
  const { ctx } = sandbox();
  ctx.cloudSession = { user: { id: 'user-1' } };
  ctx.cloudFamilyId = 'fam-1';
  ctx.isSupabaseSdkReady = () => true;
  ctx.getSupabaseClient = () => ({ from(){ return { upsert(){ return Promise.resolve({ data: [{}], error: null }); } }; } });
  const result = await ctx.pushIncomeRecordPilot({ id: 'i1', date: '2026-01-01', amount: 1000, source: 'ЗП' });
  assert.deepEqual(plain(result), { success: true });
});

// Rev #30 (6D.43) — Sync Safety Patch P0.1, tombstone для incomes.
test('activeIncomes: приховує записи з deletedAt, лишає решту', () => {
  const { ctx } = sandbox();
  ctx.incomes = [
    { id: 'i1', source: 'ЗП', deletedAt: undefined },
    { id: 'i2', source: 'Фріланс', deletedAt: '2026-03-01T00:00:00.000Z' },
  ];
  const result = ctx.activeIncomes();
  assert.equal(result.length, 1);
  assert.equal(result[0].id, 'i1');
});
test('pushIncomeRecordPilot: rec.deletedAt встановлено → payload несе deleted_at', async () => {
  const { ctx } = sandbox();
  ctx.cloudSession = { user: { id: 'user-1' } };
  ctx.cloudFamilyId = 'fam-1';
  ctx.isSupabaseSdkReady = () => true;
  let capturedPayload = null;
  ctx.getSupabaseClient = () => ({ from(){ return { upsert(payload){ capturedPayload = payload; return Promise.resolve({ data: [{}], error: null }); } }; } });
  await ctx.pushIncomeRecordPilot({ id: 'i1', date: '2026-01-01', amount: 1000, source: 'ЗП', deletedAt: '2026-03-01T00:00:00.000Z', updatedAt: '2026-03-01T00:00:00.000Z' });
  assert.equal(capturedPayload.deleted_at, '2026-03-01T00:00:00.000Z');
});

test('pushIncomeRecordPilot: реальна Cloud-помилка від upsert → { success:false }', async () => {
  const { ctx } = sandbox();
  ctx.cloudSession = { user: { id: 'user-1' } };
  ctx.cloudFamilyId = 'fam-1';
  ctx.isSupabaseSdkReady = () => true;
  ctx.getSupabaseClient = () => ({ from(){ return { upsert(){ return Promise.resolve({ data: null, error: new Error('симульована помилка') }); } }; } });
  const result = await ctx.pushIncomeRecordPilot({ id: 'i1', date: '2026-01-01', amount: 1000, source: 'ЗП' });
  assert.deepEqual(plain(result), { success: false });
});

test('pushExpenseRecordPilot: ОЧ-залежність ще не синхронізована → тихий пропуск, { success:true } (не помилка)', async () => {
  const { ctx } = sandbox();
  ctx.cloudSession = { user: { id: 'user-1' } };
  ctx.cloudFamilyId = 'fam-1';
  ctx.isSupabaseSdkReady = () => true;
  ctx.installmentAccounts = [{ name: 'iPhone' }]; // без cloudId
  const result = await ctx.pushExpenseRecordPilot({ id: 'e1', date: '2026-01-01', amount: 500, linkedInstallment: 'iPhone' });
  assert.deepEqual(plain(result), { success: true });
});

// Rev #30 (6D.42) — Sync Safety Patch P0.1, tombstone для expenses.
test('activeExpenses: приховує записи з deletedAt, лишає решту', () => {
  const { ctx } = sandbox();
  ctx.expenses = [
    { id: 'e1', name: 'Активна' },
    { id: 'e2', name: 'Видалена', deletedAt: '2026-03-01T00:00:00.000Z' },
    { id: 'e3', name: 'Теж активна' },
  ];
  const result = ctx.activeExpenses();
  assert.equal(result.length, 2);
  assert.deepEqual(result.map(function(e){ return e.id; }), ['e1', 'e3']);
});

test('pushExpenseRecordPilot: rec.deletedAt встановлено → payload несе deleted_at', async () => {
  const { ctx } = sandbox();
  ctx.cloudSession = { user: { id: 'user-1' } };
  ctx.cloudFamilyId = 'fam-1';
  ctx.isSupabaseSdkReady = () => true;
  let capturedPayload = null;
  ctx.getSupabaseClient = () => ({ from(){ return { upsert(payload){ capturedPayload = payload; return Promise.resolve({ data: [{}], error: null }); } }; } });
  const result = await ctx.pushExpenseRecordPilot({ id: 'e1', date: '2026-01-01', amount: 500, deletedAt: '2026-03-01T00:00:00.000Z', updatedAt: '2026-03-01T00:00:00.000Z' });
  assert.deepEqual(plain(result), { success: true });
  assert.equal(capturedPayload.deleted_at, '2026-03-01T00:00:00.000Z');
});
test('pushExpenseRecordPilot: без deletedAt → payload несе deleted_at:null', async () => {
  const { ctx } = sandbox();
  ctx.cloudSession = { user: { id: 'user-1' } };
  ctx.cloudFamilyId = 'fam-1';
  ctx.isSupabaseSdkReady = () => true;
  let capturedPayload = null;
  ctx.getSupabaseClient = () => ({ from(){ return { upsert(payload){ capturedPayload = payload; return Promise.resolve({ data: [{}], error: null }); } }; } });
  await ctx.pushExpenseRecordPilot({ id: 'e1', date: '2026-01-01', amount: 500 });
  assert.equal(capturedPayload.deleted_at, null);
});

test('pushDebtRecordPilot: рахунок ще не синхронізований → тихий пропуск, { success:true } (не помилка)', async () => {
  const { ctx } = sandbox();
  ctx.cloudSession = { user: { id: 'user-1' } };
  ctx.cloudFamilyId = 'fam-1';
  ctx.isSupabaseSdkReady = () => true;
  ctx.bankAccounts = [{ name: 'Приват Банк' }]; // без cloudId
  const result = await ctx.pushDebtRecordPilot({ id: 'd1', name: 'Приват Банк', kind: 'card', month: '2026-01', balance: 1000 });
  assert.deepEqual(plain(result), { success: true });
});

// Rev #30 (6D.44) — Sync Safety Patch P0.1, tombstone для debts.
test('activeDebts: приховує записи з deletedAt, лишає решту', () => {
  const { ctx } = sandbox();
  ctx.debts = [
    { id: 'd1', name: 'Приват Банк', kind: 'card', month: '2026-01', balance: 1000 },
    { id: 'd2', name: 'iPhone', kind: 'installment', month: '2026-01', balance: 5000, deletedAt: '2026-03-01T00:00:00.000Z' },
  ];
  const result = ctx.activeDebts();
  assert.equal(result.length, 1);
  assert.equal(result[0].id, 'd1');
});
test('pushDebtRecordPilot: rec.deletedAt встановлено → payload несе deleted_at', async () => {
  const { ctx } = sandbox();
  ctx.cloudSession = { user: { id: 'user-1' } };
  ctx.cloudFamilyId = 'fam-1';
  ctx.isSupabaseSdkReady = () => true;
  ctx.bankAccounts = [{ name: 'Приват Банк', cloudId: 'b1' }];
  let capturedPayload = null;
  ctx.getSupabaseClient = () => ({ from(){ return { upsert(payload){ capturedPayload = payload; return Promise.resolve({ data: [{}], error: null }); } }; } });
  await ctx.pushDebtRecordPilot({ id: 'd1', name: 'Приват Банк', kind: 'card', month: '2026-01', balance: 1000, deletedAt: '2026-03-01T00:00:00.000Z', updatedAt: '2026-03-01T00:00:00.000Z' });
  assert.equal(capturedPayload.deleted_at, '2026-03-01T00:00:00.000Z');
});

test('isSyncResultFailure: { success:false } → true', () => {
  const { ctx } = sandbox();
  assert.equal(ctx.isSyncResultFailure({ success: false }), true);
});
test('isSyncResultFailure: { success:true } → false', () => {
  const { ctx } = sandbox();
  assert.equal(ctx.isSyncResultFailure({ success: true }), false);
});
test('isSyncResultFailure: { skipped:true } (pull, реальний провал усередині withSyncIndicator) → true', () => {
  const { ctx } = sandbox();
  assert.equal(ctx.isSyncResultFailure({ skipped: true }), true);
});
test('isSyncResultFailure: { skipped:false, added:1 } → false', () => {
  const { ctx } = sandbox();
  assert.equal(ctx.isSyncResultFailure({ skipped: false, added: 1 }), false);
});
test('isSyncResultFailure: відсутній результат (undefined) → false ("не знаємо", не помилка)', () => {
  const { ctx } = sandbox();
  assert.equal(ctx.isSyncResultFailure(undefined), false);
});

function pullHiddenSandbox(rows, opts){
  const { ctx } = sandbox();
  ctx.cloudSession = { user: { id: 'user-1' } };
  ctx.cloudFamilyId = 'fam-1';
  ctx.isSupabaseSdkReady = () => true;
  ctx.getSupabaseClient = () => fakeSupabaseHiddenEntitiesClient(rows, opts);
  return ctx;
}

test('pullHiddenEntitiesCore: не залогінений → { skipped:true }', async () => {
  const ctx = pullHiddenSandbox([{ entity_type: 'bank', entity_id: 'b1', hidden_from_month: '2026-06-01' }]);
  ctx.cloudSession = null;
  const result = await ctx.pullHiddenEntitiesCore();
  assert.deepEqual(plain(result), { skipped: true });
});

test('pullHiddenEntitiesCore: мережева помилка → { skipped:true }', async () => {
  const ctx = pullHiddenSandbox(null, { error: true });
  const result = await ctx.pullHiddenEntitiesCore();
  assert.deepEqual(plain(result), { skipped: true });
});

test('pullHiddenEntitiesCore: батько (за entity_id) не знайдений локально → skippedFk, hiddenFrom не чіпається', async () => {
  const ctx = pullHiddenSandbox([{ entity_type: 'bank', entity_id: 'b-unknown', hidden_from_month: '2026-06-01' }]);
  ctx.bankAccounts = [{ name: 'Приват Банк', cloudId: 'b1' }]; // інший cloudId
  ctx.hiddenFrom = {};
  const result = await ctx.pullHiddenEntitiesCore();
  assert.deepEqual(plain(result), { skipped: false, added: 0, skippedFk: 1 });
  assert.deepEqual(plain(ctx.hiddenFrom), {});
});

test('pullHiddenEntitiesCore: entity_type "bank" резолвиться в bankAccounts за cloudId, kind "card" у ключі — додається (локально не було)', async () => {
  const ctx = pullHiddenSandbox([{ entity_type: 'bank', entity_id: 'b1', hidden_from_month: '2026-06-01' }]);
  ctx.bankAccounts = [{ name: 'Приват Банк', cloudId: 'b1' }];
  ctx.hiddenFrom = {};
  const result = await ctx.pullHiddenEntitiesCore();
  assert.deepEqual(plain(result), { skipped: false, added: 1, skippedFk: 0 });
  assert.equal(ctx.hiddenFrom['card:Приват Банк'], '2026-06');
});

test('pullHiddenEntitiesCore: entity_type "installment" резолвиться в installmentAccounts за cloudId, kind "installment" у ключі', async () => {
  const ctx = pullHiddenSandbox([{ entity_type: 'installment', entity_id: 'i1', hidden_from_month: '2026-03-01' }]);
  ctx.installmentAccounts = [{ name: 'iPhone', cloudId: 'i1' }];
  ctx.hiddenFrom = {};
  const result = await ctx.pullHiddenEntitiesCore();
  assert.deepEqual(plain(result), { skipped: false, added: 1, skippedFk: 0 });
  assert.equal(ctx.hiddenFrom['installment:iPhone'], '2026-03');
});

test('pullHiddenEntitiesCore: "приховати перемагає" — локально ВЖЕ приховано (інший місяць) → Cloud-версію НЕ перезаписує, added:0', async () => {
  const ctx = pullHiddenSandbox([{ entity_type: 'bank', entity_id: 'b1', hidden_from_month: '2026-08-01' }]);
  ctx.bankAccounts = [{ name: 'Приват Банк', cloudId: 'b1' }];
  ctx.hiddenFrom = { 'card:Приват Банк': '2026-06' }; // локальна версія вже є
  const result = await ctx.pullHiddenEntitiesCore();
  assert.deepEqual(plain(result), { skipped: false, added: 0, skippedFk: 0 });
  assert.equal(ctx.hiddenFrom['card:Приват Банк'], '2026-06'); // не перезаписано Cloud-версією
});

test('pullHiddenEntitiesCore: локально приховане, якого Cloud не має → не чіпається (це відповідальність push, не pull)', async () => {
  const ctx = pullHiddenSandbox([]);
  ctx.bankAccounts = [{ name: 'Приват Банк', cloudId: 'b1' }];
  ctx.hiddenFrom = { 'card:Приват Банк': '2026-06' };
  await ctx.pullHiddenEntitiesCore();
  assert.equal(ctx.hiddenFrom['card:Приват Банк'], '2026-06');
});

test('pullHiddenEntitiesPilot: тонка обгортка над pullHiddenEntitiesCore (той самий результат)', async () => {
  const ctx = pullHiddenSandbox([{ entity_type: 'bank', entity_id: 'b1', hidden_from_month: '2026-06-01' }]);
  ctx.bankAccounts = [{ name: 'Приват Банк', cloudId: 'b1' }];
  ctx.hiddenFrom = {};
  const result = await ctx.pullHiddenEntitiesPilot();
  assert.deepEqual(plain(result), { skipped: false, added: 1, skippedFk: 0 });
});

/* ============ pullExpensesCore/pullIncomesCore/pullDebtsCore (Rev #30, 6D.37) ============
   Категорія A: серце фінансових даних, архітектурно найпростіша з шести
   вже завершених доменів — reconciliation за `id` (стабільний UUID,
   генерується локально), БЕЗ name-based self-heal. LWW — той самий
   принцип, що всюди. FK (linked_installment_id/bank_account_id/
   installment_account_id) резолвиться за cloudId батька —skippedFk той
   самий edge case, що вже subcategories/dictionary. */

function fakeSupabaseSelectClient(table, rows, opts){
  return {
    from(t){
      assert.equal(t, table);
      return {
        select(cols){
          return {
            eq(col, val){
              if(opts && opts.error) return Promise.resolve({ data: null, error: new Error('симульована мережева помилка') });
              return Promise.resolve({ data: rows, error: null });
            },
          };
        },
      };
    },
  };
}
function pullExpensesSandbox(rows, opts){
  const { ctx } = sandbox();
  ctx.cloudSession = { user: { id: 'user-1' } };
  ctx.cloudFamilyId = 'fam-1';
  ctx.isSupabaseSdkReady = () => true;
  ctx.getSupabaseClient = () => fakeSupabaseSelectClient('expenses', rows, opts);
  return ctx;
}
function pullIncomesSandbox(rows, opts){
  const { ctx } = sandbox();
  ctx.cloudSession = { user: { id: 'user-1' } };
  ctx.cloudFamilyId = 'fam-1';
  ctx.isSupabaseSdkReady = () => true;
  ctx.getSupabaseClient = () => fakeSupabaseSelectClient('incomes', rows, opts);
  return ctx;
}
function pullDebtsSandbox(rows, opts){
  const { ctx } = sandbox();
  ctx.cloudSession = { user: { id: 'user-1' } };
  ctx.cloudFamilyId = 'fam-1';
  ctx.isSupabaseSdkReady = () => true;
  ctx.getSupabaseClient = () => fakeSupabaseSelectClient('debts', rows, opts);
  return ctx;
}

test('pullExpensesCore: не залогінений → { skipped:true }', async () => {
  const ctx = pullExpensesSandbox([{ id: 'e1', amount: 500, expense_date: '2026-05-01', note: 'Кава' }]);
  ctx.cloudSession = null;
  const result = await ctx.pullExpensesCore();
  assert.deepEqual(plain(result), { skipped: true });
});

test('pullExpensesCore: мережева помилка → { skipped:true }', async () => {
  const ctx = pullExpensesSandbox(null, { error: true });
  const result = await ctx.pullExpensesCore();
  assert.deepEqual(plain(result), { skipped: true });
});

test('pullExpensesCore: без linked_installment_id → додається напряму, без FK-залежності', async () => {
  const ctx = pullExpensesSandbox([{ id: 'e1', amount: 500, expense_date: '2026-05-05', category: '🍔 Їжа', subcategory: 'Кафе', note: 'Кава', linked_installment_id: null, created_at: '2024-01-01T00:00:00.000Z', updated_at: '2024-01-01T00:00:00.000Z' }]);
  ctx.expenses = [];
  const result = await ctx.pullExpensesCore();
  assert.deepEqual(plain(result), { skipped: false, updated: 0, added: 1, keptLocal: 0, skippedFk: 0 });
  assert.equal(ctx.expenses[0].name, 'Кава');
  assert.equal(ctx.expenses[0].amount, 500);
  assert.equal(ctx.expenses[0].manual, true);
  assert.equal(ctx.expenses[0].linkedInstallment, undefined);
});

test('pullExpensesCore: linked_installment_id вказаний, батько не пролінкований локально → skippedFk, не додається', async () => {
  const ctx = pullExpensesSandbox([{ id: 'e1', amount: 500, expense_date: '2026-05-05', note: 'iPhone внесок', linked_installment_id: 'i-unknown' }]);
  ctx.installmentAccounts = [{ name: 'iPhone', cloudId: 'i1' }]; // інший cloudId
  ctx.expenses = [];
  const result = await ctx.pullExpensesCore();
  assert.deepEqual(plain(result), { skipped: false, updated: 0, added: 0, keptLocal: 0, skippedFk: 1 });
  assert.equal(ctx.expenses.length, 0);
});

test('pullExpensesCore: linked_installment_id резолвиться за cloudId → linkedInstallment = ім\'я локальної ОЧ', async () => {
  const ctx = pullExpensesSandbox([{ id: 'e1', amount: 2500, expense_date: '2026-05-05', note: 'iPhone внесок', linked_installment_id: 'i1', created_at: '2024-01-01T00:00:00.000Z', updated_at: '2024-01-01T00:00:00.000Z' }]);
  ctx.installmentAccounts = [{ name: 'iPhone', cloudId: 'i1' }];
  ctx.expenses = [];
  const result = await ctx.pullExpensesCore();
  assert.deepEqual(plain(result), { skipped: false, updated: 0, added: 1, keptLocal: 0, skippedFk: 0 });
  assert.equal(ctx.expenses[0].linkedInstallment, 'iPhone');
});

test('pullExpensesCore: LWW — Cloud новіший → оновлює локальний запис за id', async () => {
  const ctx = pullExpensesSandbox([{ id: 'e1', amount: 999, expense_date: '2026-05-06', category: '🍔 Їжа', subcategory: 'Кафе', note: 'Оновлено', linked_installment_id: null, created_at: '2024-01-01T00:00:00.000Z', updated_at: '2024-06-01T00:00:00.000Z' }]);
  ctx.expenses = [{ id: 'e1', date: '2026-05-05', name: 'Стара назва', amount: 500, category: '🍔 Їжа', subcategory: 'Кафе', manual: true, createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z' }];
  const result = await ctx.pullExpensesCore();
  assert.deepEqual(plain(result), { skipped: false, updated: 1, added: 0, keptLocal: 0, skippedFk: 0 });
  assert.equal(ctx.expenses[0].amount, 999);
  assert.equal(ctx.expenses[0].name, 'Оновлено');
});

test('pullExpensesCore: LWW — локальний СТРОГО новіший → keptLocal + push-retry, Cloud НЕ перезаписує', async () => {
  const ctx = pullExpensesSandbox([{ id: 'e1', amount: 999, expense_date: '2026-05-06', note: 'Cloud-версія', linked_installment_id: null, created_at: '2024-01-01T00:00:00.000Z', updated_at: '2024-01-01T00:00:00.000Z' }]);
  ctx.expenses = [{ id: 'e1', date: '2026-05-05', name: 'Локальна версія', amount: 500, manual: true, createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-06-01T00:00:00.000Z' }];
  const pushSpy = spyOn(ctx, 'pushExpenseRecordPilot');
  const result = await ctx.pullExpensesCore();
  assert.deepEqual(plain(result), { skipped: false, updated: 0, added: 0, keptLocal: 1, skippedFk: 0 });
  assert.equal(ctx.expenses[0].name, 'Локальна версія');
  assert.equal(pushSpy.count(), 1);
});

test('pullExpensesCore: локальний запис без Cloud-відповідника → не чіпається (видалення не синхронізується)', async () => {
  const ctx = pullExpensesSandbox([]);
  ctx.expenses = [{ id: 'e1', date: '2026-05-05', name: 'Лише локальна витрата', amount: 500, manual: true, createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z' }];
  await ctx.pullExpensesCore();
  assert.equal(ctx.expenses.length, 1);
  assert.equal(ctx.expenses[0].name, 'Лише локальна витрата');
});

// Rev #30 (6D.42) — Sync Safety Patch P0.1, tombstone для expenses.
test('pullExpensesCore: Cloud-рядок з deleted_at, НОВИЙ для цього пристрою → створюється одразу з deletedAt ("пристрій C ніколи не бачить")', async () => {
  const ctx = pullExpensesSandbox([{ id: 'e1', amount: 500, expense_date: '2026-05-05', note: 'Видалене на іншому пристрої', linked_installment_id: null, deleted_at: '2026-05-06T00:00:00.000Z', created_at: '2024-01-01T00:00:00.000Z', updated_at: '2026-05-06T00:00:00.000Z' }]);
  ctx.expenses = [];
  const result = await ctx.pullExpensesCore();
  assert.deepEqual(plain(result), { skipped: false, updated: 0, added: 1, keptLocal: 0, skippedFk: 0 });
  assert.equal(ctx.expenses[0].deletedAt, '2026-05-06T00:00:00.000Z');
  assert.deepEqual(ctx.activeExpenses(), []);
});

test('pullExpensesCore: Cloud-рядок з deleted_at, локальний запис ІСНУЄ (не видалений) → LWW-переможець Cloud позначає deletedAt локально', async () => {
  const ctx = pullExpensesSandbox([{ id: 'e1', amount: 500, expense_date: '2026-05-05', note: 'Кава', linked_installment_id: null, deleted_at: '2026-05-07T00:00:00.000Z', created_at: '2024-01-01T00:00:00.000Z', updated_at: '2026-05-07T00:00:00.000Z' }]);
  ctx.expenses = [{ id: 'e1', date: '2026-05-05', name: 'Кава', amount: 500, manual: true, createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z' }];
  const result = await ctx.pullExpensesCore();
  assert.deepEqual(plain(result), { skipped: false, updated: 1, added: 0, keptLocal: 0, skippedFk: 0 });
  assert.equal(ctx.expenses[0].deletedAt, '2026-05-07T00:00:00.000Z');
  assert.equal(ctx.expenses.length, 1); // фізично лишається в масиві — не спліситься
});

test('pullExpensesCore: локальний СТРОГО новіший за Cloud-tombstone → keptLocal + push-retry, deletedAt НЕ застосовується', async () => {
  const ctx = pullExpensesSandbox([{ id: 'e1', amount: 500, expense_date: '2026-05-05', note: 'Кава', linked_installment_id: null, deleted_at: '2026-05-06T00:00:00.000Z', created_at: '2024-01-01T00:00:00.000Z', updated_at: '2026-05-06T00:00:00.000Z' }]);
  ctx.expenses = [{ id: 'e1', date: '2026-05-05', name: 'Кава (відредаговано ПІСЛЯ видалення на іншому пристрої)', amount: 600, manual: true, createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2026-05-08T00:00:00.000Z' }];
  const pushSpy = spyOn(ctx, 'pushExpenseRecordPilot');
  const result = await ctx.pullExpensesCore();
  assert.deepEqual(plain(result), { skipped: false, updated: 0, added: 0, keptLocal: 1, skippedFk: 0 });
  assert.equal(ctx.expenses[0].deletedAt, undefined);
  assert.equal(pushSpy.count(), 1);
});

test('pullExpensesPilot: тонка обгортка над pullExpensesCore (той самий результат)', async () => {
  const ctx = pullExpensesSandbox([{ id: 'e1', amount: 500, expense_date: '2026-05-05', note: 'Кава', linked_installment_id: null }]);
  ctx.expenses = [];
  const result = await ctx.pullExpensesPilot();
  assert.deepEqual(plain(result), { skipped: false, updated: 0, added: 1, keptLocal: 0, skippedFk: 0 });
});

test('pullIncomesCore: не залогінений → { skipped:true }', async () => {
  const ctx = pullIncomesSandbox([{ id: 'i1', amount: 20000, income_date: '2026-05-01', note: 'ЗП' }]);
  ctx.cloudSession = null;
  const result = await ctx.pullIncomesCore();
  assert.deepEqual(plain(result), { skipped: true });
});

test('pullIncomesCore: мережева помилка → { skipped:true }', async () => {
  const ctx = pullIncomesSandbox(null, { error: true });
  const result = await ctx.pullIncomesCore();
  assert.deepEqual(plain(result), { skipped: true });
});

test('pullIncomesCore: новий Cloud-запис → додається (note → source)', async () => {
  const ctx = pullIncomesSandbox([{ id: 'i1', amount: 20000, income_date: '2026-05-01', note: 'Зарплата Андрій', created_at: '2024-01-01T00:00:00.000Z', updated_at: '2024-01-01T00:00:00.000Z' }]);
  ctx.incomes = [];
  const result = await ctx.pullIncomesCore();
  assert.deepEqual(plain(result), { skipped: false, updated: 0, added: 1, keptLocal: 0 });
  assert.equal(ctx.incomes[0].source, 'Зарплата Андрій');
  assert.equal(ctx.incomes[0].amount, 20000);
});

test('pullIncomesCore: LWW — Cloud новіший → оновлює', async () => {
  const ctx = pullIncomesSandbox([{ id: 'i1', amount: 25000, income_date: '2026-05-01', note: 'Зарплата Андрій', created_at: '2024-01-01T00:00:00.000Z', updated_at: '2024-06-01T00:00:00.000Z' }]);
  ctx.incomes = [{ id: 'i1', date: '2026-05-01', source: 'Зарплата Андрій', amount: 20000, createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z' }];
  const result = await ctx.pullIncomesCore();
  assert.deepEqual(plain(result), { skipped: false, updated: 1, added: 0, keptLocal: 0 });
  assert.equal(ctx.incomes[0].amount, 25000);
});

test('pullIncomesCore: LWW — локальний СТРОГО новіший → keptLocal + push-retry', async () => {
  const ctx = pullIncomesSandbox([{ id: 'i1', amount: 25000, income_date: '2026-05-01', note: 'Зарплата', created_at: '2024-01-01T00:00:00.000Z', updated_at: '2024-01-01T00:00:00.000Z' }]);
  ctx.incomes = [{ id: 'i1', date: '2026-05-01', source: 'Зарплата', amount: 20000, createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-06-01T00:00:00.000Z' }];
  const pushSpy = spyOn(ctx, 'pushIncomeRecordPilot');
  const result = await ctx.pullIncomesCore();
  assert.equal(result.keptLocal, 1);
  assert.equal(ctx.incomes[0].amount, 20000);
  assert.equal(pushSpy.count(), 1);
});

// Rev #30 (6D.43) — Sync Safety Patch P0.1, tombstone для incomes.
test('pullIncomesCore: Cloud-рядок з deleted_at, НОВИЙ для цього пристрою → створюється одразу з deletedAt ("пристрій C")', async () => {
  const ctx = pullIncomesSandbox([{ id: 'i1', amount: 20000, income_date: '2026-05-01', note: 'Видалено на іншому пристрої', deleted_at: '2026-05-06T00:00:00.000Z', created_at: '2024-01-01T00:00:00.000Z', updated_at: '2026-05-06T00:00:00.000Z' }]);
  ctx.incomes = [];
  const result = await ctx.pullIncomesCore();
  assert.deepEqual(plain(result), { skipped: false, updated: 0, added: 1, keptLocal: 0 });
  assert.equal(ctx.incomes[0].deletedAt, '2026-05-06T00:00:00.000Z');
  assert.deepEqual(ctx.activeIncomes(), []);
});

test('pullIncomesCore: Cloud-рядок з deleted_at, локальний ІСНУЄ (не видалений) → LWW-переможець Cloud позначає deletedAt локально', async () => {
  const ctx = pullIncomesSandbox([{ id: 'i1', amount: 20000, income_date: '2026-05-01', note: 'ЗП', deleted_at: '2026-05-07T00:00:00.000Z', created_at: '2024-01-01T00:00:00.000Z', updated_at: '2026-05-07T00:00:00.000Z' }]);
  ctx.incomes = [{ id: 'i1', date: '2026-05-01', source: 'ЗП', amount: 20000, createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z' }];
  const result = await ctx.pullIncomesCore();
  assert.deepEqual(plain(result), { skipped: false, updated: 1, added: 0, keptLocal: 0 });
  assert.equal(ctx.incomes[0].deletedAt, '2026-05-07T00:00:00.000Z');
  assert.equal(ctx.incomes.length, 1);
});

test('pullIncomesPilot: тонка обгортка над pullIncomesCore (той самий результат)', async () => {
  const ctx = pullIncomesSandbox([{ id: 'i1', amount: 20000, income_date: '2026-05-01', note: 'ЗП' }]);
  ctx.incomes = [];
  const result = await ctx.pullIncomesPilot();
  assert.deepEqual(plain(result), { skipped: false, updated: 0, added: 1, keptLocal: 0 });
});

test('pullDebtsCore: не залогінений → { skipped:true }', async () => {
  const ctx = pullDebtsSandbox([{ id: 'd1', bank_account_id: 'b1', installment_account_id: null, name: 'Приват Банк', kind: 'card', month: '2026-05-01', balance: 1000 }]);
  ctx.cloudSession = null;
  const result = await ctx.pullDebtsCore();
  assert.deepEqual(plain(result), { skipped: true });
});

test('pullDebtsCore: мережева помилка → { skipped:true }', async () => {
  const ctx = pullDebtsSandbox(null, { error: true });
  const result = await ctx.pullDebtsCore();
  assert.deepEqual(plain(result), { skipped: true });
});

test('pullDebtsCore: kind card, bank_account_id не пролінкований локально → skippedFk, не додається', async () => {
  const ctx = pullDebtsSandbox([{ id: 'd1', bank_account_id: 'b-unknown', installment_account_id: null, name: 'Приват Банк', kind: 'card', month: '2026-05-01', balance: 1000 }]);
  ctx.bankAccounts = [{ name: 'Приват Банк', cloudId: 'b1' }];
  ctx.debts = [];
  const result = await ctx.pullDebtsCore();
  assert.deepEqual(plain(result), { skipped: false, updated: 0, added: 0, keptLocal: 0, skippedFk: 1 });
  assert.equal(ctx.debts.length, 0);
});

test('pullDebtsCore: kind installment, installment_account_id не пролінкований → skippedFk', async () => {
  const ctx = pullDebtsSandbox([{ id: 'd1', bank_account_id: null, installment_account_id: 'i-unknown', name: 'iPhone', kind: 'installment', month: '2026-05-01', balance: 15000 }]);
  ctx.installmentAccounts = [{ name: 'iPhone', cloudId: 'i1' }];
  ctx.debts = [];
  const result = await ctx.pullDebtsCore();
  assert.deepEqual(plain(result), { skipped: false, updated: 0, added: 0, keptLocal: 0, skippedFk: 1 });
});

test('pullDebtsCore: новий Cloud-запис (kind card) → додається, month конвертовано "YYYY-MM-DD"→"YYYY-MM", name резолвлено за cloudId', async () => {
  const ctx = pullDebtsSandbox([{ id: 'd1', bank_account_id: 'b1', installment_account_id: null, name: 'Приват Банк (з Cloud)', kind: 'card', month: '2026-05-01', balance: 1000, min_payment: 100, min_payment_done: false, monthly_payment: null, created_at: '2024-01-01T00:00:00.000Z', updated_at: '2024-01-01T00:00:00.000Z' }]);
  ctx.bankAccounts = [{ name: 'Приват Банк', cloudId: 'b1' }];
  ctx.debts = [];
  const result = await ctx.pullDebtsCore();
  assert.deepEqual(plain(result), { skipped: false, updated: 0, added: 1, keptLocal: 0, skippedFk: 0 });
  assert.equal(ctx.debts[0].name, 'Приват Банк'); // резолвлено локально за cloudId, не Cloud-назвою
  assert.equal(ctx.debts[0].month, '2026-05');
  assert.equal(ctx.debts[0].minPayment, 100);
});

test('pullDebtsCore: LWW — Cloud новіший → оновлює баланс', async () => {
  const ctx = pullDebtsSandbox([{ id: 'd1', bank_account_id: 'b1', installment_account_id: null, name: 'Приват Банк', kind: 'card', month: '2026-05-01', balance: 2000, created_at: '2024-01-01T00:00:00.000Z', updated_at: '2024-06-01T00:00:00.000Z' }]);
  ctx.bankAccounts = [{ name: 'Приват Банк', cloudId: 'b1' }];
  ctx.debts = [{ id: 'd1', name: 'Приват Банк', kind: 'card', month: '2026-05', balance: 1000, createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z' }];
  const result = await ctx.pullDebtsCore();
  assert.deepEqual(plain(result), { skipped: false, updated: 1, added: 0, keptLocal: 0, skippedFk: 0 });
  assert.equal(ctx.debts[0].balance, 2000);
});

test('pullDebtsCore: LWW — локальний СТРОГО новіший → keptLocal + push-retry, Cloud не перезаписує', async () => {
  const ctx = pullDebtsSandbox([{ id: 'd1', bank_account_id: 'b1', installment_account_id: null, name: 'Приват Банк', kind: 'card', month: '2026-05-01', balance: 2000, created_at: '2024-01-01T00:00:00.000Z', updated_at: '2024-01-01T00:00:00.000Z' }]);
  ctx.bankAccounts = [{ name: 'Приват Банк', cloudId: 'b1' }];
  ctx.debts = [{ id: 'd1', name: 'Приват Банк', kind: 'card', month: '2026-05', balance: 1500, createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-06-01T00:00:00.000Z' }];
  const pushSpy = spyOn(ctx, 'pushDebtRecordPilot');
  const result = await ctx.pullDebtsCore();
  assert.equal(result.keptLocal, 1);
  assert.equal(ctx.debts[0].balance, 1500);
  assert.equal(pushSpy.count(), 1);
});

// Rev #30 (6D.44) — Sync Safety Patch P0.1, tombstone для debts.
test('pullDebtsCore: Cloud-рядок з deleted_at, НОВИЙ для цього пристрою → створюється одразу з deletedAt ("пристрій C")', async () => {
  const ctx = pullDebtsSandbox([{ id: 'd1', bank_account_id: 'b1', installment_account_id: null, name: 'Приват Банк', kind: 'card', month: '2026-05-01', balance: 1000, deleted_at: '2026-05-06T00:00:00.000Z', created_at: '2024-01-01T00:00:00.000Z', updated_at: '2026-05-06T00:00:00.000Z' }]);
  ctx.bankAccounts = [{ name: 'Приват Банк', cloudId: 'b1' }];
  ctx.debts = [];
  const result = await ctx.pullDebtsCore();
  assert.deepEqual(plain(result), { skipped: false, updated: 0, added: 1, keptLocal: 0, skippedFk: 0 });
  assert.equal(ctx.debts[0].deletedAt, '2026-05-06T00:00:00.000Z');
  assert.deepEqual(ctx.activeDebts(), []);
});

test('pullDebtsCore: Cloud-рядок з deleted_at, локальний ІСНУЄ (не видалений) → LWW-переможець Cloud позначає deletedAt локально', async () => {
  const ctx = pullDebtsSandbox([{ id: 'd1', bank_account_id: 'b1', installment_account_id: null, name: 'Приват Банк', kind: 'card', month: '2026-05-01', balance: 1000, deleted_at: '2026-05-07T00:00:00.000Z', created_at: '2024-01-01T00:00:00.000Z', updated_at: '2026-05-07T00:00:00.000Z' }]);
  ctx.bankAccounts = [{ name: 'Приват Банк', cloudId: 'b1' }];
  ctx.debts = [{ id: 'd1', name: 'Приват Банк', kind: 'card', month: '2026-05', balance: 1000, createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z' }];
  const result = await ctx.pullDebtsCore();
  assert.deepEqual(plain(result), { skipped: false, updated: 1, added: 0, keptLocal: 0, skippedFk: 0 });
  assert.equal(ctx.debts[0].deletedAt, '2026-05-07T00:00:00.000Z');
  assert.equal(ctx.debts.length, 1);
});

test('pullDebtsPilot: тонка обгортка над pullDebtsCore (той самий результат)', async () => {
  const ctx = pullDebtsSandbox([{ id: 'd1', bank_account_id: 'b1', installment_account_id: null, name: 'Приват Банк', kind: 'card', month: '2026-05-01', balance: 1000 }]);
  ctx.bankAccounts = [{ name: 'Приват Банк', cloudId: 'b1' }];
  ctx.debts = [];
  const result = await ctx.pullDebtsPilot();
  assert.deepEqual(plain(result), { skipped: false, updated: 0, added: 1, keptLocal: 0, skippedFk: 0 });
});

/* ============ Інкрементальний pull — lastSyncMarker (Rev #30, 6D.38) ============
   Маркер — device-local стан (localStorage, як theme/draft), НЕ фінансові
   дані. Перший pull домену (немає маркера) — повний, як і завжди
   (applySyncMarker() — прозорий no-op). Наступний — WHERE updated_at>=
   marker (Крок 0 п.1: `.gte`, не строгий `.gt`, безпечніше при
   одночасних правках з тим самим timestamp). Маркер оновлюється ЛИШЕ
   при реальному отриманні даних (DoD), і ЛИШЕ на основі рядків, що
   пройшли FK-резолюцію (skippedFk-рядки маркер не рухають — інакше
   self-heal назавжди зламався б саме для них). */

test('getSyncMarker/setSyncMarker/clearSyncMarkers: базовий round-trip, домени незалежні', () => {
  const { ctx } = sandbox();
  assert.equal(ctx.getSyncMarker('categories'), null);
  ctx.setSyncMarker('categories', '2024-01-01T00:00:00.000Z');
  ctx.setSyncMarker('expenses', '2024-06-01T00:00:00.000Z');
  assert.equal(ctx.getSyncMarker('categories'), '2024-01-01T00:00:00.000Z');
  assert.equal(ctx.getSyncMarker('expenses'), '2024-06-01T00:00:00.000Z');
  ctx.clearSyncMarkers();
  assert.equal(ctx.getSyncMarker('categories'), null);
  assert.equal(ctx.getSyncMarker('expenses'), null);
});

test('applySyncMarker: маркера немає → query повертається БЕЗ змін (повний pull)', () => {
  const { ctx } = sandbox();
  const fakeQuery = { gte(){ throw new Error('НЕ мало викликатись — маркера немає'); } };
  const result = ctx.applySyncMarker(fakeQuery, 'categories');
  assert.equal(result, fakeQuery);
});

test('updateSyncMarkerFromAllRows: порожній масив → маркер НЕ рухається (DoD)', () => {
  const { ctx } = sandbox();
  ctx.updateSyncMarkerFromAllRows('categories', []);
  assert.equal(ctx.getSyncMarker('categories'), null);
});

test('updateSyncMarkerFromAllRows: max(updated_at) серед рядків, не порядок масиву', () => {
  const { ctx } = sandbox();
  ctx.updateSyncMarkerFromAllRows('categories', [
    { updated_at: '2024-03-01T00:00:00.000Z' },
    { updated_at: '2024-06-01T00:00:00.000Z' },
    { updated_at: '2024-02-01T00:00:00.000Z' },
  ]);
  assert.equal(ctx.getSyncMarker('categories'), '2024-06-01T00:00:00.000Z');
});

test('pullCategoriesCore: перший pull (немає маркера) → повний запит (без .gte), маркер встановлюється з max(updated_at)', async () => {
  const { ctx } = sandbox();
  ctx.cloudSession = { user: { id: 'user-1' } };
  ctx.cloudFamilyId = 'fam-1';
  ctx.isSupabaseSdkReady = () => true;
  const rows = [
    { id: 'c1', name: 'Старіша', active: true, type: 'Гнучка', updated_at: '2024-01-01T00:00:00.000Z' },
    { id: 'c2', name: 'Новіша', active: true, type: 'Гнучка', updated_at: '2024-06-01T00:00:00.000Z' },
  ];
  const fake = fakeSupabaseMarkerAwareClient('categories', rows);
  ctx.getSupabaseClient = () => fake.client;
  ctx.CATEGORIES = [];
  const result = await ctx.pullCategoriesCore();
  assert.equal(result.added, 2);
  assert.deepEqual(fake.calls, [null]); // .gte() НЕ викликаний — перший pull повний
  assert.equal(ctx.getSyncMarker('categories'), '2024-06-01T00:00:00.000Z');
});

test('pullCategoriesCore: другий pull (є маркер, нових Cloud-змін немає) → запит із .gte(marker), порожній результат, маркер НЕ рухається', async () => {
  const { ctx } = sandbox();
  ctx.cloudSession = { user: { id: 'user-1' } };
  ctx.cloudFamilyId = 'fam-1';
  ctx.isSupabaseSdkReady = () => true;
  ctx.setSyncMarker('categories', '2024-06-01T00:00:00.000Z');
  // Cloud більше не повертає нічого НОВІШОГО за маркер — fakeClient фільтрує сам.
  const rows = [{ id: 'c1', name: 'Стара', active: true, type: 'Гнучка', updated_at: '2024-01-01T00:00:00.000Z' }];
  const fake = fakeSupabaseMarkerAwareClient('categories', rows);
  ctx.getSupabaseClient = () => fake.client;
  ctx.CATEGORIES = [{ name: 'Стара', cloudId: 'c1', active: true, type: 'Гнучка', updatedAt: '2024-01-01T00:00:00.000Z' }];
  const result = await ctx.pullCategoriesCore();
  assert.deepEqual(fake.calls, ['2024-06-01T00:00:00.000Z']); // .gte() викликаний з маркером
  assert.equal(result.added, 0);
  assert.equal(result.updated, 0);
  assert.equal(ctx.getSyncMarker('categories'), '2024-06-01T00:00:00.000Z'); // не зрушив — нічого нового не прийшло
});

test('pullCategoriesCore: третій pull (є нова Cloud-зміна після маркера) → отримує лише нове, маркер посувається на неї', async () => {
  const { ctx } = sandbox();
  ctx.cloudSession = { user: { id: 'user-1' } };
  ctx.cloudFamilyId = 'fam-1';
  ctx.isSupabaseSdkReady = () => true;
  ctx.setSyncMarker('categories', '2024-06-01T00:00:00.000Z');
  const rows = [{ id: 'c2', name: 'Нова категорія', active: true, type: 'Гнучка', updated_at: '2024-09-01T00:00:00.000Z' }];
  const fake = fakeSupabaseMarkerAwareClient('categories', rows);
  ctx.getSupabaseClient = () => fake.client;
  ctx.CATEGORIES = [];
  const result = await ctx.pullCategoriesCore();
  assert.equal(result.added, 1);
  assert.equal(ctx.getSyncMarker('categories'), '2024-09-01T00:00:00.000Z'); // посунувся на нову зміну
});

test('pullExpensesCore: skippedFk-рядок НЕ рухає маркер (інакше self-heal назавжди зламався б для цього запису)', async () => {
  const ctx = pullExpensesSandbox([
    { id: 'e1', amount: 500, expense_date: '2026-05-05', note: 'Оброблено', linked_installment_id: null, updated_at: '2024-01-01T00:00:00.000Z' },
    { id: 'e2', amount: 2500, expense_date: '2026-05-06', note: 'FK ще не готовий', linked_installment_id: 'i-unknown', updated_at: '2024-06-01T00:00:00.000Z' }, // пізніший timestamp, але skippedFk
  ]);
  ctx.installmentAccounts = [];
  ctx.expenses = [];
  const result = await ctx.pullExpensesCore();
  assert.equal(result.added, 1);
  assert.equal(result.skippedFk, 1);
  // Маркер зупинився на ОБРОБЛЕНОМУ рядку (e1), НЕ на пізнішому skippedFk (e2) —
  // інакше e2 ніколи більше не потрапив би в наступний інкрементальний pull.
  assert.equal(ctx.getSyncMarker('expenses'), '2024-01-01T00:00:00.000Z');
});

test('clearCloudFamilyId: очищує маркери разом із family_id (Крок 0 п.3 — захист від застарілого маркера іншого акаунта)', async () => {
  const { ctx } = sandbox();
  ctx.setSyncMarker('categories', '2024-01-01T00:00:00.000Z');
  ctx.cloudFamilyId = 'fam-1';
  ctx.clearCloudFamilyId();
  assert.equal(ctx.cloudFamilyId, null);
  assert.equal(ctx.getSyncMarker('categories'), null);
});

/* ============ pullSubcategoriesCore: Pull pilot (subcategories, повний цикл) ============
   Rev #30 (6D.28) — четвертий раз той самий шаблон, з ОДНІЄЮ новою
   відмінністю: FK-залежність на category_id, resolved через local CATEGORIES
   за cloudId (не за назвою — назва може розійтись, id — стабільний). */

test('pullSubcategoriesCore: не залогінений → { skipped:true }, SUBCATEGORIES не чіпаються', async () => {
  const ctx = pullSubcategoriesSandbox([{ id: 's1', name: 'Кафе', category_id: 'c1', active: true }]);
  ctx.cloudSession = null;
  ctx.SUBCATEGORIES = [{ name: 'X', category: 'Y', active: true }];
  const result = await ctx.pullSubcategoriesCore();
  assert.deepEqual(plain(result), { skipped: true });
  assert.deepEqual(plain(ctx.SUBCATEGORIES), [{ name: 'X', category: 'Y', active: true }]);
});

test('pullSubcategoriesCore: немає cloudFamilyId → { skipped:true }', async () => {
  const ctx = pullSubcategoriesSandbox([{ id: 's1', name: 'Кафе', category_id: 'c1', active: true }]);
  ctx.cloudFamilyId = null;
  const result = await ctx.pullSubcategoriesCore();
  assert.deepEqual(plain(result), { skipped: true });
});

test('pullSubcategoriesCore: мережева помилка → { skipped:true }, без винятку', async () => {
  const ctx = pullSubcategoriesSandbox(null, { error: true });
  ctx.SUBCATEGORIES = [{ name: 'X', category: 'Y', active: true }];
  const result = await ctx.pullSubcategoriesCore();
  assert.deepEqual(plain(result), { skipped: true });
});

test('pullSubcategoriesCore: Крок 0 edge case — батьківська категорія відсутня локально (не лінкована за cloudId) → рядок МОВЧКИ пропускається (skippedFk), НЕ додається "осиротілим"', async () => {
  const ctx = pullSubcategoriesSandbox([{ id: 's1', name: 'Кафе', category_id: 'c-unknown', active: true }]);
  ctx.CATEGORIES = [{ name: '🍔 Їжа', type: 'Гнучка', active: true, cloudId: 'c1' }]; // інший cloudId, не 'c-unknown'
  ctx.SUBCATEGORIES = [];
  const result = await ctx.pullSubcategoriesCore();
  assert.deepEqual(plain(result), { skipped: false, updated: 0, linked: 0, added: 0, keptLocal: 0, skippedFk: 1 });
  assert.equal(ctx.SUBCATEGORIES.length, 0); // нічого не додано з відсутнім/неправильним зв'язком
});

test('pullSubcategoriesCore: правило 1 — Cloud новіший (LWW) → оновлюється name/category(resolved за cloudId)/active', async () => {
  const ctx = pullSubcategoriesSandbox([{ id: 's1', name: 'Кафе і ресторани', category_id: 'c1', active: true, created_at: '2024-01-01T00:00:00.000Z', updated_at: '2024-06-01T00:00:00.000Z' }]);
  ctx.CATEGORIES = [{ name: '🍔 Їжа', type: 'Гнучка', active: true, cloudId: 'c1' }];
  ctx.SUBCATEGORIES = [{ name: 'Кафе', category: '🍔 Їжа', active: true, cloudId: 's1', createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z' }];
  const result = await ctx.pullSubcategoriesCore();
  assert.deepEqual(plain(result), { skipped: false, updated: 1, linked: 0, added: 0, keptLocal: 0, skippedFk: 0 });
  assert.equal(ctx.SUBCATEGORIES[0].name, 'Кафе і ресторани');
  assert.equal(ctx.SUBCATEGORIES[0].category, '🍔 Їжа');
});

test('pullSubcategoriesCore: LWW — локальний СТРОГО новіший → НЕ перезаписується (keptLocal) + push-retry', async () => {
  const ctx = pullSubcategoriesSandbox([{ id: 's1', name: 'Кафе', category_id: 'c1', active: true, created_at: '2024-01-01T00:00:00.000Z', updated_at: '2024-01-01T00:00:00.000Z' }]);
  ctx.CATEGORIES = [{ name: '🍔 Їжа', type: 'Гнучка', active: true, cloudId: 'c1' }];
  ctx.SUBCATEGORIES = [{ name: 'Кафе (нова назва)', category: '🍔 Їжа', active: true, cloudId: 's1', createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-06-01T00:00:00.000Z' }];
  const pushSpy = spyOn(ctx, 'pushSubcategoriesPilot');
  const result = await ctx.pullSubcategoriesCore();
  assert.deepEqual(plain(result), { skipped: false, updated: 0, linked: 0, added: 0, keptLocal: 1, skippedFk: 0 });
  assert.equal(ctx.SUBCATEGORIES[0].name, 'Кафе (нова назва)'); // локальне НЕ перезаписано
  assert.equal(pushSpy.count(), 1); // Частина 1: push-retry тригериться одразу
});

test('pullSubcategoriesCore: правило 2 — unlinked local з тим самим name → зв\'язується, category резолвиться за cloudId', async () => {
  const ctx = pullSubcategoriesSandbox([{ id: 's2', name: 'Кафе', category_id: 'c1', active: true }]);
  ctx.CATEGORIES = [{ name: '🍔 Їжа', type: 'Гнучка', active: true, cloudId: 'c1' }];
  ctx.SUBCATEGORIES = [{ name: 'Кафе', category: '🍔 Їжа', active: true }];
  const result = await ctx.pullSubcategoriesCore();
  assert.deepEqual(plain(result), { skipped: false, updated: 0, linked: 1, added: 0, keptLocal: 0, skippedFk: 0 });
  assert.equal(ctx.SUBCATEGORIES.length, 1);
  assert.equal(ctx.SUBCATEGORIES[0].cloudId, 's2');
});

test('pullSubcategoriesCore: правило 3 — новий Cloud-рядок без local-відповідника → додається', async () => {
  const ctx = pullSubcategoriesSandbox([{ id: 's3', name: 'Ресторани (з іншого пристрою)', category_id: 'c1', active: true }]);
  ctx.CATEGORIES = [{ name: '🍔 Їжа', type: 'Гнучка', active: true, cloudId: 'c1' }];
  ctx.SUBCATEGORIES = [];
  const result = await ctx.pullSubcategoriesCore();
  assert.deepEqual(plain(result), { skipped: false, updated: 0, linked: 0, added: 1, keptLocal: 0, skippedFk: 0 });
  assert.equal(ctx.SUBCATEGORIES[0].name, 'Ресторани (з іншого пристрою)');
  assert.equal(ctx.SUBCATEGORIES[0].category, '🍔 Їжа');
  assert.equal(ctx.SUBCATEGORIES[0].cloudId, 's3');
});

test('pullSubcategoriesCore: локальний БЕЗ Cloud-відповідника → не чіпається (видалення не синхронізується)', async () => {
  const ctx = pullSubcategoriesSandbox([{ id: 's1', name: 'Кафе', category_id: 'c1', active: true }]);
  ctx.CATEGORIES = [{ name: '🍔 Їжа', type: 'Гнучка', active: true, cloudId: 'c1' }];
  ctx.SUBCATEGORIES = [
    { name: 'Кафе', category: '🍔 Їжа', active: true },
    { name: 'Лише локальна підкатегорія', category: '🍔 Їжа', active: true },
  ];
  await ctx.pullSubcategoriesCore();
  const untouched = ctx.SUBCATEGORIES.find(s => s.name === 'Лише локальна підкатегорія');
  assert.deepEqual(plain(untouched), { name: 'Лише локальна підкатегорія', category: '🍔 Їжа', active: true });
});

test('pullSubcategoriesPilot: тонка обгортка над pullSubcategoriesCore (той самий результат)', async () => {
  const ctx = pullSubcategoriesSandbox([{ id: 's1', name: 'Кафе', category_id: 'c1', active: true }]);
  ctx.CATEGORIES = [{ name: '🍔 Їжа', type: 'Гнучка', active: true, cloudId: 'c1' }];
  ctx.SUBCATEGORIES = [];
  const result = await ctx.pullSubcategoriesPilot();
  assert.deepEqual(plain(result), { skipped: false, updated: 0, linked: 0, added: 1, keptLocal: 0, skippedFk: 0 });
});

/* ============ ensureSubcategoryIdentity (Rev #30, 6D.28) ============ */

test('ensureSubcategoryIdentity: запис без createdAt/updatedAt → заповнюється "зараз"', async () => {
  const { ctx } = sandbox();
  ctx.SUBCATEGORIES = [{ name: 'Кафе', category: '🍔 Їжа', active: true }];
  const spy = spyOn(ctx, 'saveSubcategories');
  await ctx.ensureSubcategoryIdentity();
  assert.ok(ctx.SUBCATEGORIES[0].createdAt);
  assert.equal(ctx.SUBCATEGORIES[0].updatedAt, ctx.SUBCATEGORIES[0].createdAt);
  assert.equal(spy.count(), 1);
});

test('ensureSubcategoryIdentity: запис вже МАЄ createdAt/updatedAt → не перезаписується, save не кличе', async () => {
  const { ctx } = sandbox();
  ctx.SUBCATEGORIES = [{ name: 'Кафе', category: '🍔 Їжа', active: true, createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-06-01T00:00:00.000Z' }];
  const spy = spyOn(ctx, 'saveSubcategories');
  await ctx.ensureSubcategoryIdentity();
  assert.equal(ctx.SUBCATEGORIES[0].createdAt, '2024-01-01T00:00:00.000Z');
  assert.equal(ctx.SUBCATEGORIES[0].updatedAt, '2024-06-01T00:00:00.000Z');
  assert.equal(spy.count(), 0);
});

/* ============ pullDictionaryCore: Pull pilot (dictionary, повний цикл) ============
   Rev #30 (6D.28) — той самий шаблон, ПОДВІЙНА FK-залежність: category_id
   (обов'язковий) і subcategory_id (опціональний — null легітимний, НЕ
   причина для skippedFk). */

test('pullDictionaryCore: не залогінений → { skipped:true }, DICTIONARY не чіпається', async () => {
  const ctx = pullDictionarySandbox([{ id: 'd1', keyword: 'кава', category_id: 'c1', subcategory_id: null }]);
  ctx.cloudSession = null;
  ctx.DICTIONARY = [{ kw: 'X', cat: 'Y', sub: null }];
  const result = await ctx.pullDictionaryCore();
  assert.deepEqual(plain(result), { skipped: true });
  assert.deepEqual(plain(ctx.DICTIONARY), [{ kw: 'X', cat: 'Y', sub: null }]);
});

test('pullDictionaryCore: немає cloudFamilyId → { skipped:true }', async () => {
  const ctx = pullDictionarySandbox([{ id: 'd1', keyword: 'кава', category_id: 'c1', subcategory_id: null }]);
  ctx.cloudFamilyId = null;
  const result = await ctx.pullDictionaryCore();
  assert.deepEqual(plain(result), { skipped: true });
});

test('pullDictionaryCore: мережева помилка → { skipped:true }, без винятку', async () => {
  const ctx = pullDictionarySandbox(null, { error: true });
  ctx.DICTIONARY = [{ kw: 'X', cat: 'Y', sub: null }];
  const result = await ctx.pullDictionaryCore();
  assert.deepEqual(plain(result), { skipped: true });
});

test('pullDictionaryCore: Крок 0 edge case — категорія відсутня локально → skippedFk, не додається', async () => {
  const ctx = pullDictionarySandbox([{ id: 'd1', keyword: 'кава', category_id: 'c-unknown', subcategory_id: null }]);
  ctx.CATEGORIES = [{ name: '🍔 Їжа', type: 'Гнучка', active: true, cloudId: 'c1' }];
  ctx.DICTIONARY = [];
  const result = await ctx.pullDictionaryCore();
  assert.deepEqual(plain(result), { skipped: false, updated: 0, linked: 0, added: 0, keptLocal: 0, skippedFk: 1 });
  assert.equal(ctx.DICTIONARY.length, 0);
});

test('pullDictionaryCore: Крок 0 edge case — категорія знайдена, але підкатегорія відсутня локально → skippedFk (subcategory_id вказаний, але не лінкований)', async () => {
  const ctx = pullDictionarySandbox([{ id: 'd1', keyword: 'кава', category_id: 'c1', subcategory_id: 's-unknown' }]);
  ctx.CATEGORIES = [{ name: '🍔 Їжа', type: 'Гнучка', active: true, cloudId: 'c1' }];
  ctx.SUBCATEGORIES = [{ name: 'Кафе', category: '🍔 Їжа', active: true, cloudId: 's1' }]; // інший cloudId
  ctx.DICTIONARY = [];
  const result = await ctx.pullDictionaryCore();
  assert.deepEqual(plain(result), { skipped: false, updated: 0, linked: 0, added: 0, keptLocal: 0, skippedFk: 1 });
  assert.equal(ctx.DICTIONARY.length, 0);
});

test('pullDictionaryCore: subcategory_id === null → легітимний стан, НЕ skippedFk, додається з sub:null', async () => {
  const ctx = pullDictionarySandbox([{ id: 'd1', keyword: 'кава', category_id: 'c1', subcategory_id: null }]);
  ctx.CATEGORIES = [{ name: '🍔 Їжа', type: 'Гнучка', active: true, cloudId: 'c1' }];
  ctx.DICTIONARY = [];
  const result = await ctx.pullDictionaryCore();
  assert.deepEqual(plain(result), { skipped: false, updated: 0, linked: 0, added: 1, keptLocal: 0, skippedFk: 0 });
  assert.equal(ctx.DICTIONARY[0].kw, 'кава');
  assert.equal(ctx.DICTIONARY[0].cat, '🍔 Їжа');
  assert.equal(ctx.DICTIONARY[0].sub, null);
});

test('pullDictionaryCore: правило 1 — Cloud новіший (LWW) → оновлюється kw/cat/sub (резолвлені за cloudId)', async () => {
  const ctx = pullDictionarySandbox([{ id: 'd1', keyword: 'капучино', category_id: 'c1', subcategory_id: 's1', created_at: '2024-01-01T00:00:00.000Z', updated_at: '2024-06-01T00:00:00.000Z' }]);
  ctx.CATEGORIES = [{ name: '🍔 Їжа', type: 'Гнучка', active: true, cloudId: 'c1' }];
  ctx.SUBCATEGORIES = [{ name: 'Кафе', category: '🍔 Їжа', active: true, cloudId: 's1' }];
  ctx.DICTIONARY = [{ kw: 'кава', cat: '🍔 Їжа', sub: null, cloudId: 'd1', createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z' }];
  const result = await ctx.pullDictionaryCore();
  assert.deepEqual(plain(result), { skipped: false, updated: 1, linked: 0, added: 0, keptLocal: 0, skippedFk: 0 });
  assert.equal(ctx.DICTIONARY[0].kw, 'капучино');
  assert.equal(ctx.DICTIONARY[0].sub, 'Кафе');
});

test('pullDictionaryCore: LWW — локальний СТРОГО новіший → НЕ перезаписується (keptLocal) + push-retry', async () => {
  const ctx = pullDictionarySandbox([{ id: 'd1', keyword: 'кава', category_id: 'c1', subcategory_id: null, created_at: '2024-01-01T00:00:00.000Z', updated_at: '2024-01-01T00:00:00.000Z' }]);
  ctx.CATEGORIES = [{ name: '🍔 Їжа', type: 'Гнучка', active: true, cloudId: 'c1' }];
  ctx.DICTIONARY = [{ kw: 'кава латте', cat: '🍔 Їжа', sub: null, cloudId: 'd1', createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-06-01T00:00:00.000Z' }];
  const pushSpy = spyOn(ctx, 'pushDictionaryPilot');
  const result = await ctx.pullDictionaryCore();
  assert.deepEqual(plain(result), { skipped: false, updated: 0, linked: 0, added: 0, keptLocal: 1, skippedFk: 0 });
  assert.equal(ctx.DICTIONARY[0].kw, 'кава латте');
  assert.equal(pushSpy.count(), 1);
});

test('pullDictionaryCore: правило 2 — unlinked local з тим самим kw → зв\'язується', async () => {
  const ctx = pullDictionarySandbox([{ id: 'd2', keyword: 'кава', category_id: 'c1', subcategory_id: null }]);
  ctx.CATEGORIES = [{ name: '🍔 Їжа', type: 'Гнучка', active: true, cloudId: 'c1' }];
  ctx.DICTIONARY = [{ kw: 'кава', cat: '🍔 Їжа', sub: null }];
  const result = await ctx.pullDictionaryCore();
  assert.deepEqual(plain(result), { skipped: false, updated: 0, linked: 1, added: 0, keptLocal: 0, skippedFk: 0 });
  assert.equal(ctx.DICTIONARY[0].cloudId, 'd2');
});

test('pullDictionaryCore: правило 3 — новий Cloud-рядок без local-відповідника → додається', async () => {
  const ctx = pullDictionarySandbox([{ id: 'd3', keyword: 'еспресо (з іншого пристрою)', category_id: 'c1', subcategory_id: null }]);
  ctx.CATEGORIES = [{ name: '🍔 Їжа', type: 'Гнучка', active: true, cloudId: 'c1' }];
  ctx.DICTIONARY = [];
  const result = await ctx.pullDictionaryCore();
  assert.deepEqual(plain(result), { skipped: false, updated: 0, linked: 0, added: 1, keptLocal: 0, skippedFk: 0 });
  assert.equal(ctx.DICTIONARY[0].kw, 'еспресо (з іншого пристрою)');
});

test('pullDictionaryCore: локальний БЕЗ Cloud-відповідника → не чіпається (видалення не синхронізується)', async () => {
  const ctx = pullDictionarySandbox([{ id: 'd1', keyword: 'кава', category_id: 'c1', subcategory_id: null }]);
  ctx.CATEGORIES = [{ name: '🍔 Їжа', type: 'Гнучка', active: true, cloudId: 'c1' }];
  ctx.DICTIONARY = [
    { kw: 'кава', cat: '🍔 Їжа', sub: null },
    { kw: 'лише локальне слово', cat: '🍔 Їжа', sub: null },
  ];
  await ctx.pullDictionaryCore();
  const untouched = ctx.DICTIONARY.find(d => d.kw === 'лише локальне слово');
  assert.deepEqual(plain(untouched), { kw: 'лише локальне слово', cat: '🍔 Їжа', sub: null });
});

test('pullDictionaryPilot: тонка обгортка над pullDictionaryCore (той самий результат)', async () => {
  const ctx = pullDictionarySandbox([{ id: 'd1', keyword: 'кава', category_id: 'c1', subcategory_id: null }]);
  ctx.CATEGORIES = [{ name: '🍔 Їжа', type: 'Гнучка', active: true, cloudId: 'c1' }];
  ctx.DICTIONARY = [];
  const result = await ctx.pullDictionaryPilot();
  assert.deepEqual(plain(result), { skipped: false, updated: 0, linked: 0, added: 1, keptLocal: 0, skippedFk: 0 });
});

/* ============ ensureDictionaryIdentity (Rev #30, 6D.28) ============ */

test('ensureDictionaryIdentity: запис без createdAt/updatedAt → заповнюється "зараз"', async () => {
  const { ctx } = sandbox();
  ctx.DICTIONARY = [{ kw: 'кава', cat: '🍔 Їжа', sub: null }];
  const spy = spyOn(ctx, 'saveDictionary');
  await ctx.ensureDictionaryIdentity();
  assert.ok(ctx.DICTIONARY[0].createdAt);
  assert.equal(ctx.DICTIONARY[0].updatedAt, ctx.DICTIONARY[0].createdAt);
  assert.equal(spy.count(), 1);
});

test('ensureDictionaryIdentity: запис вже МАЄ createdAt/updatedAt → не перезаписується, save не кличе', async () => {
  const { ctx } = sandbox();
  ctx.DICTIONARY = [{ kw: 'кава', cat: '🍔 Їжа', sub: null, createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-06-01T00:00:00.000Z' }];
  const spy = spyOn(ctx, 'saveDictionary');
  await ctx.ensureDictionaryIdentity();
  assert.equal(ctx.DICTIONARY[0].createdAt, '2024-01-01T00:00:00.000Z');
  assert.equal(ctx.DICTIONARY[0].updatedAt, '2024-06-01T00:00:00.000Z');
  assert.equal(spy.count(), 0);
});

/* ============ Фікс подвійного push при restore (6D, термінове розслідування) ============
   Корінь: restoreXFromBackup() тригерив ПЕРШИЙ push (усередині власного
   saveX()), а ensureXIdentity() (викликана пізніше в тому самому
   applyBackupData(), з loadStructureRefs()/loadAll()) бачила щойно
   відновлені записи БЕЗ timestamps і сама тригерила ДРУГИЙ, незалежний
   push — обидва конкурентно проходили неатомарний "SELECT за name, якщо
   нема — INSERT" у reconcileXCloudId(), і при живому відтворенні (два
   реальні мережеві запити з затримкою) обидва встигали побачити "нема" до
   того, як інший закомітив — 2 Cloud-рядки з одного відновлення (доведено
   контрольовано на bank_accounts І на categories, домен-агностична race).
   Фікс: restoreXFromBackup() тепер сам стемпає ПЕРЕД єдиним save() —
   ensureXIdentity() пізніше вже нічого не стемпає й не викликає saveX()
   вдруге. Тести нижче перевіряють МЕХАНІЗМ фіксу (не таймінг): другий
   виклик ensureXIdentity() після restore має бути справжнім no-op. */

test('фікс подвійного push: restoreCategoriesFromBackup() стемпає одразу → наступний ensureCategoryIdentity() saveCategories() вдруге НЕ кличе', async () => {
  const { ctx } = sandbox();
  const raw = JSON.stringify([{ name: 'Тест', type: 'Гнучка', active: true }]); // без timestamps
  await ctx.restoreCategoriesFromBackup(raw);
  assert.ok(ctx.CATEGORIES[0].createdAt, 'restoreCategoriesFromBackup() мала стемпати одразу');
  const spy = spyOn(ctx, 'saveCategories');
  await ctx.ensureCategoryIdentity();
  assert.equal(spy.count(), 0, 'другий виклик не має нічого стемпати — save/push НЕ кличеться вдруге');
});

test('фікс подвійного push: restoreSubcategoriesFromBackup() стемпає одразу → наступний ensureSubcategoryIdentity() saveSubcategories() вдруге НЕ кличе', async () => {
  const { ctx } = sandbox();
  const raw = JSON.stringify([{ name: 'Кафе', category: '🍔 Їжа', active: true }]);
  await ctx.restoreSubcategoriesFromBackup(raw);
  assert.ok(ctx.SUBCATEGORIES[0].createdAt);
  const spy = spyOn(ctx, 'saveSubcategories');
  await ctx.ensureSubcategoryIdentity();
  assert.equal(spy.count(), 0);
});

test('фікс подвійного push: restoreDictionaryFromBackup() стемпає одразу → наступний ensureDictionaryIdentity() saveDictionary() вдруге НЕ кличе', async () => {
  const { ctx } = sandbox();
  const raw = JSON.stringify([{ kw: 'кава', cat: '🍔 Їжа', sub: null }]);
  await ctx.restoreDictionaryFromBackup(raw);
  assert.ok(ctx.DICTIONARY[0].createdAt);
  const spy = spyOn(ctx, 'saveDictionary');
  await ctx.ensureDictionaryIdentity();
  assert.equal(spy.count(), 0);
});

test('фікс подвійного push: restoreBankAccountsFromBackup() стемпає одразу → наступний ensureBankAccountIdentity() saveBankAccounts() вдруге НЕ кличе', async () => {
  const { ctx } = sandbox();
  const raw = JSON.stringify([{ name: '🟩 Приват Банк', creditLimit: 50000 }]);
  await ctx.restoreBankAccountsFromBackup(raw);
  assert.ok(ctx.bankAccounts[0].createdAt);
  const spy = spyOn(ctx, 'saveBankAccounts');
  await ctx.ensureBankAccountIdentity();
  assert.equal(spy.count(), 0);
});

test('фікс подвійного push: restoreInstallmentAccountsFromBackup() стемпає одразу → наступний ensureInstallmentAccountIdentity() saveInstallmentAccounts() вдруге НЕ кличе', async () => {
  const { ctx } = sandbox();
  const raw = JSON.stringify([{ name: 'iPhone', initialAmount: 25000 }]);
  await ctx.restoreInstallmentAccountsFromBackup(raw);
  assert.ok(ctx.installmentAccounts[0].createdAt);
  const spy = spyOn(ctx, 'saveInstallmentAccounts');
  await ctx.ensureInstallmentAccountIdentity();
  assert.equal(spy.count(), 0);
});

// Rev #30 (6D, термінове розслідування) — end-to-end регресія з реальним
// (стейтфул) Cloud-mock'ом, ТІЄЮ САМОЮ послідовністю викликів, що
// applyBackupData() робить для categories: restoreCategoriesFromBackup()
// (перший push) → loadStructureRefs() (реальна функція, НЕ стаб — саме тут
// раніше жив другий push через ensureCategoryIdentity()). До фіксу це дало
// б 2 INSERT; після — точно 1, а другий restore того самого фантомного
// запису (без cloudId — бекап його не ніс) лише ЗВ'ЯЗУЄ вже вставлений
// рядок (лишається 1), той самий "2 відновлення" сценарій з живого тесту.
test('регресія (стейтфул Cloud-mock): одне відновлення бекапу з фантомним записом без timestamp → РІВНО один Cloud-рядок, не два', async () => {
  const { ctx } = sandbox();
  ctx.cloudSession = { user: { id: 'user-1' } };
  ctx.cloudFamilyId = 'fam-1';
  ctx.isSupabaseSdkReady = () => true;
  const fake = fakeSupabaseStatefulClient('categories', 'name');
  ctx.getSupabaseClient = () => fake.client;

  const raw = JSON.stringify([{ name: 'Тест Рейс', type: 'Гнучка', active: true }]); // без timestamps, без cloudId
  await ctx.restoreCategoriesFromBackup(raw);
  await new Promise(r => setTimeout(r, 0)); // дати відпрацювати fire-and-forget push #1
  await ctx.loadStructureRefs(); // реальний виклик, той самий, що всередині applyBackupData()
  await new Promise(r => setTimeout(r, 0)); // дати відпрацювати fire-and-forget push #2 (якби він стався)

  assert.equal(fake.getInsertCount(), 1, 'мало бути РІВНО 1 INSERT — до фіксу тут було 2');
  assert.ok(ctx.CATEGORIES[0].cloudId, 'перший push мав зв\'язати cloudId');

  // Той самий "2 відновлення" сценарій з живого тесту: другий restore ТІЄЇ
  // САМОЇ фантомної фікстури (без cloudId — бекап його не ніс) не мав би
  // створити ЩЕ один рядок — byName reconciliation знаходить уже вставлений.
  await ctx.restoreCategoriesFromBackup(raw);
  await new Promise(r => setTimeout(r, 0));
  await ctx.loadStructureRefs();
  await new Promise(r => setTimeout(r, 0));

  assert.equal(fake.getInsertCount(), 1, 'другe відновлення не мало додати ще один INSERT — до фіксу тут було 4 сумарно');
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
  // Rev #30 (6D, фікс подвійного push) — restoreXFromBackup() тепер сам
  // стемпає createdAt/updatedAt ПЕРЕД єдиним save(), а не покладається на
  // пізніший ensureInstallmentAccountIdentity() — фікстура без timestamps
  // ЗАКОНОМІРНО отримує їх тут, це не регресія.
  assert.equal(ctx.installmentAccounts.length, 1);
  assert.equal(ctx.installmentAccounts[0].name, d1Fixture().installmentAccounts[0].name);
  assert.equal(ctx.installmentAccounts[0].initialAmount, d1Fixture().installmentAccounts[0].initialAmount);
  assert.ok(ctx.installmentAccounts[0].createdAt);
  assert.equal(ctx.installmentAccounts[0].updatedAt, ctx.installmentAccounts[0].createdAt);
  assert.equal(fakeIdbInstance.store.get('budget_installmentaccounts_v1'), JSON.stringify(ctx.installmentAccounts));
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
  // із них фактично записався під час restore. categories — окремо:
  // applyBackupData() завершується await loadStructureRefs(), яка (Rev #30,
  // 6D Варіант А) тепер викликає ensureCategoryIdentity() — фікстура без
  // createdAt/updatedAt ЗАКОНОМІРНО отримує backfill тут, це не регресія.
  assert.equal(freshCtx.CATEGORIES.length, fixture.categories.length);
  freshCtx.CATEGORIES.forEach((c, i) => {
    assert.equal(c.name, fixture.categories[i].name);
    assert.equal(c.type, fixture.categories[i].type);
    assert.equal(c.active, fixture.categories[i].active);
    assert.ok(c.createdAt, 'ensureCategoryIdentity() мала заповнити createdAt');
    assert.equal(c.updatedAt, c.createdAt); // backfill: updatedAt = createdAt при першому заповненні
  });
  // Rev #30 (6D.28) — та сама логіка, що categories вище: SUBCATEGORIES/
  // DICTIONARY фікстури без createdAt/updatedAt ЗАКОНОМІРНО отримують
  // backfill від ensureSubcategoryIdentity()/ensureDictionaryIdentity()
  // (обидві теж викликані з loadStructureRefs()) — не регресія.
  assert.equal(freshCtx.SUBCATEGORIES.length, fixture.subcategories.length);
  freshCtx.SUBCATEGORIES.forEach((s, i) => {
    assert.equal(s.name, fixture.subcategories[i].name);
    assert.equal(s.category, fixture.subcategories[i].category);
    assert.equal(s.active, fixture.subcategories[i].active);
    assert.ok(s.createdAt, 'ensureSubcategoryIdentity() мала заповнити createdAt');
    assert.equal(s.updatedAt, s.createdAt);
  });
  assert.deepEqual(plain(freshCtx.SUBCATEGORY_PRIORITY), fixture.subcategoryPriority);
  assert.equal(freshCtx.DICTIONARY.length, fixture.dictionary.length);
  freshCtx.DICTIONARY.forEach((d, i) => {
    assert.equal(d.kw, fixture.dictionary[i].kw);
    assert.equal(d.cat, fixture.dictionary[i].cat);
    assert.equal(d.sub, fixture.dictionary[i].sub);
    assert.ok(d.createdAt, 'ensureDictionaryIdentity() мала заповнити createdAt');
    assert.equal(d.updatedAt, d.createdAt);
  });

  // categories мігровано у freshCtx → restore (і наступний ensureCategoryIdentity()
  // backfill) писали в IndexedDB, НЕ localStorage. Порівнюємо розпарсено
  // (не сирим рядком) — persisted-значення тепер несе backfilled timestamps.
  assert.deepEqual(JSON.parse(freshIdb.store.get('budget_categories_v1')), plain(freshCtx.CATEGORIES));
  assert.equal(freshCtx.localStorage.getItem('budget_categories_v1'), null);
  // subcategories/subcategoryPriority/dictionary НЕ мігровані у freshCtx →
  // localStorage — але й тут backfill дописав timestamps ПІСЛЯ restore,
  // тому порівнюємо розпарсено (persisted-значення несе timestamps), не
  // сирим рядком проти фікстури без них.
  assert.deepEqual(JSON.parse(freshCtx.localStorage.getItem('budget_subcategories_v1')), plain(freshCtx.SUBCATEGORIES));
  assert.deepEqual(JSON.parse(freshCtx.localStorage.getItem('budget_dictionary_v1')), plain(freshCtx.DICTIONARY));
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

  // Rev #30 (6D, фікс подвійного push) — restoreBankAccountsFromBackup()/
  // restoreInstallmentAccountsFromBackup() тепер самі стемплять
  // createdAt/updatedAt ПЕРЕД save() — фікстури без timestamps ЗАКОНОМІРНО
  // отримують їх тут, це не регресія (той самий принцип, що вже
  // застосований для categories/subcategories/dictionary раніше).
  assert.equal(freshCtx.bankAccounts.length, fixture.bankAccounts.length);
  freshCtx.bankAccounts.forEach((b, i) => {
    assert.equal(b.name, fixture.bankAccounts[i].name);
    assert.equal(b.creditLimit, fixture.bankAccounts[i].creditLimit);
    assert.ok(b.createdAt);
    assert.equal(b.updatedAt, b.createdAt);
  });
  assert.equal(freshCtx.installmentAccounts.length, fixture.installmentAccounts.length);
  freshCtx.installmentAccounts.forEach((a, i) => {
    assert.equal(a.name, fixture.installmentAccounts[i].name);
    assert.equal(a.initialAmount, fixture.installmentAccounts[i].initialAmount);
    assert.ok(a.createdAt);
    assert.equal(a.updatedAt, a.createdAt);
  });
  assert.deepEqual(plain(freshCtx.hiddenFrom), fixture.hiddenFrom);
  assert.deepEqual(plain(freshCtx.ignoredDivergences), fixture.ignoredDivergences);

  // installmentAccounts мігровано у freshCtx → IndexedDB, не localStorage.
  // Порівнюємо розпарсено (не сирим рядком) — persisted-значення тепер
  // несе backfilled timestamps.
  assert.deepEqual(JSON.parse(freshIdb.store.get('budget_installmentaccounts_v1')), plain(freshCtx.installmentAccounts));
  assert.equal(freshCtx.localStorage.getItem('budget_installmentaccounts_v1'), null);
  // bankAccounts/hiddenFrom/ignoredDivergences НЕ мігровані у freshCtx → localStorage.
  assert.deepEqual(JSON.parse(freshCtx.localStorage.getItem('budget_bankaccounts_v1')), plain(freshCtx.bankAccounts));
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

/* ============ Rev #30 (6D.1): ensureExpenseIdentity/ensureIncomeIdentity/
   ensureDebtIdentity — технічний борг: ці три функції існували з Rev 2.11.2
   (expenses) і Rev 2.21.37 (incomes/debts) без unit-тестів, покриті лише
   живою browser-перевіркою. Ризик, названий явно: "save лише за changed" —
   умовна гілка, яку легко тихо зламати майбутнім рефакторингом (#31 Sync
   Engine). П'ять симетричних кейсів на кожну функцію: старий формат →
   новий UUID; вже валідний UUID → НЕ перегенеровується; змішаний масив →
   лише невалідні замінені; порожній масив → без помилок і без save;
   ідемпотентність — другий виклик на вже мігрований масив save не кличе. ============ */

const VALID_UUID_1 = '11111111-1111-4111-8111-111111111111';
const VALID_UUID_2 = '22222222-2222-4222-8222-222222222222';
const OLD_FORMAT_ID = '1700000000000abcd'; // Date.now()+Math.random().toString(36).slice(2,6), формат до Rev 2.21.37

test('ensureExpenseIdentity: старий запис без id → отримує UUID, решта полів незмінна', async () => {
  const { ctx } = sandbox();
  ctx.expenses = [{ date: '2026-09-01', name: 'Кава', amount: 65, category: '🍔 Харчування', subcategory: '', manual: true, createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z' }];
  const spy = spyOn(ctx, 'saveExpenses');
  await ctx.ensureExpenseIdentity();
  assert.match(ctx.expenses[0].id, UUID_FORMAT_RE_JS());
  assert.equal(ctx.expenses[0].name, 'Кава');
  assert.equal(ctx.expenses[0].amount, 65);
  assert.equal(ctx.expenses[0].createdAt, '2026-09-01T00:00:00.000Z'); // не зачеплено цим кроком
  assert.equal(spy.count(), 1);
});

test('ensureExpenseIdentity: запис уже з валідним UUID → id не змінюється, save не викликається', async () => {
  const { ctx } = sandbox();
  ctx.expenses = [{ id: VALID_UUID_1, date: '2026-09-01', name: 'Кава', amount: 65, category: '', subcategory: '', manual: true, createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z' }];
  const spy = spyOn(ctx, 'saveExpenses');
  await ctx.ensureExpenseIdentity();
  assert.equal(ctx.expenses[0].id, VALID_UUID_1);
  assert.equal(spy.count(), 0);
  assert.equal(ctx.localStorage.getItem('budget_expenses_v1'), null);
});

test('ensureExpenseIdentity: змішаний масив → лише запис без id замінено, валідний лишається', async () => {
  const { ctx } = sandbox();
  ctx.expenses = [
    { id: VALID_UUID_1, date: '2026-09-01', name: 'Кава', amount: 65, category: '', subcategory: '', manual: true, createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z' },
    { date: '2026-09-02', name: 'Обід', amount: 200, category: '', subcategory: '', manual: true, createdAt: '2026-09-02T00:00:00.000Z', updatedAt: '2026-09-02T00:00:00.000Z' },
  ];
  await ctx.ensureExpenseIdentity();
  assert.equal(ctx.expenses[0].id, VALID_UUID_1); // валідний — незмінний
  assert.match(ctx.expenses[1].id, UUID_FORMAT_RE_JS()); // невалідний (був відсутній) — замінений
});

test('ensureExpenseIdentity: порожній масив → без помилок, save не викликається', async () => {
  const { ctx } = sandbox();
  ctx.expenses = [];
  const spy = spyOn(ctx, 'saveExpenses');
  await assert.doesNotReject(ctx.ensureExpenseIdentity());
  assert.equal(spy.count(), 0);
});

test('ensureExpenseIdentity: ідемпотентність — другий виклик на вже мігрований масив save не кличе, id той самий', async () => {
  const { ctx } = sandbox();
  ctx.expenses = [{ date: '2026-09-01', name: 'Кава', amount: 65, category: '', subcategory: '', manual: true, createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z' }];
  const spy = spyOn(ctx, 'saveExpenses');
  await ctx.ensureExpenseIdentity();
  assert.equal(spy.count(), 1);
  const idAfterFirstCall = ctx.expenses[0].id;
  await ctx.ensureExpenseIdentity();
  assert.equal(spy.count(), 1); // другий виклик НЕ зберігав
  assert.equal(ctx.expenses[0].id, idAfterFirstCall);
});

test('ensureIncomeIdentity: старий формат id (Date.now()+random) → новий UUID, решта полів незмінна', async () => {
  const { ctx } = sandbox();
  ctx.incomes = [{ id: OLD_FORMAT_ID, date: '2026-09-01', source: 'Інші доходи', amount: 1234 }];
  const spy = spyOn(ctx, 'saveIncomes');
  await ctx.ensureIncomeIdentity();
  assert.match(ctx.incomes[0].id, UUID_FORMAT_RE_JS());
  assert.notEqual(ctx.incomes[0].id, OLD_FORMAT_ID);
  assert.equal(ctx.incomes[0].source, 'Інші доходи');
  assert.equal(ctx.incomes[0].amount, 1234);
  assert.equal(spy.count(), 1);
});

test('ensureIncomeIdentity: запис уже з валідним UUID → id не змінюється, save не викликається', async () => {
  const { ctx } = sandbox();
  ctx.incomes = [{ id: VALID_UUID_1, date: '2026-09-01', source: 'Інші доходи', amount: 1234 }];
  const spy = spyOn(ctx, 'saveIncomes');
  await ctx.ensureIncomeIdentity();
  assert.equal(ctx.incomes[0].id, VALID_UUID_1);
  assert.equal(spy.count(), 0);
  assert.equal(ctx.localStorage.getItem('budget_incomes_v1'), null);
});

test('ensureIncomeIdentity: змішаний масив → лише невалідний id замінено', async () => {
  const { ctx } = sandbox();
  ctx.incomes = [
    { id: VALID_UUID_1, date: '2026-09-01', source: 'Зарплата Андрій', amount: 20000 },
    { id: OLD_FORMAT_ID, date: '2026-09-01', source: 'Зарплата Оля', amount: 18000 },
  ];
  await ctx.ensureIncomeIdentity();
  assert.equal(ctx.incomes[0].id, VALID_UUID_1);
  assert.match(ctx.incomes[1].id, UUID_FORMAT_RE_JS());
  assert.notEqual(ctx.incomes[1].id, OLD_FORMAT_ID);
});

test('ensureIncomeIdentity: порожній масив → без помилок, save не викликається', async () => {
  const { ctx } = sandbox();
  ctx.incomes = [];
  const spy = spyOn(ctx, 'saveIncomes');
  await assert.doesNotReject(ctx.ensureIncomeIdentity());
  assert.equal(spy.count(), 0);
});

test('ensureIncomeIdentity: ідемпотентність — другий виклик на вже мігрований масив save не кличе, id той самий', async () => {
  const { ctx } = sandbox();
  ctx.incomes = [{ id: OLD_FORMAT_ID, date: '2026-09-01', source: 'Інші доходи', amount: 1234 }];
  const spy = spyOn(ctx, 'saveIncomes');
  await ctx.ensureIncomeIdentity();
  assert.equal(spy.count(), 1);
  const idAfterFirstCall = ctx.incomes[0].id;
  await ctx.ensureIncomeIdentity();
  assert.equal(spy.count(), 1);
  assert.equal(ctx.incomes[0].id, idAfterFirstCall);
});

test('ensureDebtIdentity: старий формат id (Date.now()+random) → новий UUID, решта полів незмінна (kind:card)', async () => {
  const { ctx } = sandbox();
  ctx.debts = [{ id: OLD_FORMAT_ID, name: '🟩 Приват Банк', kind: 'card', month: '2026-09', balance: 5000, minPayment: null, minPaymentDone: false }];
  const spy = spyOn(ctx, 'saveDebts');
  await ctx.ensureDebtIdentity();
  assert.match(ctx.debts[0].id, UUID_FORMAT_RE_JS());
  assert.notEqual(ctx.debts[0].id, OLD_FORMAT_ID);
  assert.equal(ctx.debts[0].name, '🟩 Приват Банк');
  assert.equal(ctx.debts[0].balance, 5000);
  assert.equal(ctx.debts[0].minPaymentDone, false);
  assert.equal(spy.count(), 1);
});

test('ensureDebtIdentity: запис уже з валідним UUID → id не змінюється, save не викликається', async () => {
  const { ctx } = sandbox();
  ctx.debts = [{ id: VALID_UUID_1, name: 'iPhone', kind: 'installment', month: '2026-09', balance: 20000, monthlyPayment: 2000 }];
  const spy = spyOn(ctx, 'saveDebts');
  await ctx.ensureDebtIdentity();
  assert.equal(ctx.debts[0].id, VALID_UUID_1);
  assert.equal(spy.count(), 0);
  assert.equal(ctx.localStorage.getItem('budget_debts_v1'), null);
});

test('ensureDebtIdentity: змішаний масив (card+installment) → лише невалідний id замінено', async () => {
  const { ctx } = sandbox();
  ctx.debts = [
    { id: VALID_UUID_2, name: '🟩 Приват Банк', kind: 'card', month: '2026-09', balance: 5000 },
    { id: OLD_FORMAT_ID, name: 'iPhone', kind: 'installment', month: '2026-09', balance: 20000 },
  ];
  await ctx.ensureDebtIdentity();
  assert.equal(ctx.debts[0].id, VALID_UUID_2);
  assert.match(ctx.debts[1].id, UUID_FORMAT_RE_JS());
  assert.notEqual(ctx.debts[1].id, OLD_FORMAT_ID);
});

test('ensureDebtIdentity: порожній масив → без помилок, save не викликається', async () => {
  const { ctx } = sandbox();
  ctx.debts = [];
  const spy = spyOn(ctx, 'saveDebts');
  await assert.doesNotReject(ctx.ensureDebtIdentity());
  assert.equal(spy.count(), 0);
});

test('ensureDebtIdentity: ідемпотентність — другий виклик на вже мігрований масив save не кличе, id той самий', async () => {
  const { ctx } = sandbox();
  ctx.debts = [{ id: OLD_FORMAT_ID, name: '🟩 Приват Банк', kind: 'card', month: '2026-09', balance: 5000 }];
  const spy = spyOn(ctx, 'saveDebts');
  await ctx.ensureDebtIdentity();
  assert.equal(spy.count(), 1);
  const idAfterFirstCall = ctx.debts[0].id;
  await ctx.ensureDebtIdentity();
  assert.equal(spy.count(), 1);
  assert.equal(ctx.debts[0].id, idAfterFirstCall);
});

/* ============ ensureCategoryIdentity (Rev #30, 6D Варіант А) ============ */

test('ensureCategoryIdentity: категорія без createdAt/updatedAt → заповнюється "зараз" (немає кращого проксі, на відміну від expenses.date)', async () => {
  const { ctx } = sandbox();
  ctx.CATEGORIES = [{ name: '🍔 Їжа', type: 'Гнучка', active: true }];
  const spy = spyOn(ctx, 'saveCategories');
  await ctx.ensureCategoryIdentity();
  assert.ok(ctx.CATEGORIES[0].createdAt);
  assert.equal(ctx.CATEGORIES[0].updatedAt, ctx.CATEGORIES[0].createdAt);
  assert.equal(spy.count(), 1);
});

test('ensureCategoryIdentity: категорія вже МАЄ createdAt/updatedAt → не перезаписується, save не кличе', async () => {
  const { ctx } = sandbox();
  ctx.CATEGORIES = [{ name: '🍔 Їжа', type: 'Гнучка', active: true, createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-06-01T00:00:00.000Z' }];
  const spy = spyOn(ctx, 'saveCategories');
  await ctx.ensureCategoryIdentity();
  assert.equal(ctx.CATEGORIES[0].createdAt, '2024-01-01T00:00:00.000Z');
  assert.equal(ctx.CATEGORIES[0].updatedAt, '2024-06-01T00:00:00.000Z');
  assert.equal(spy.count(), 0);
});

test('ensureCategoryIdentity: змішаний масив → лише запис без timestamps змінено', async () => {
  const { ctx } = sandbox();
  ctx.CATEGORIES = [
    { name: '🍔 Їжа', type: 'Гнучка', active: true, createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z' },
    { name: '🚗 Транспорт', type: 'Гнучка', active: true },
  ];
  await ctx.ensureCategoryIdentity();
  assert.equal(ctx.CATEGORIES[0].createdAt, '2024-01-01T00:00:00.000Z'); // незмінний
  assert.ok(ctx.CATEGORIES[1].createdAt); // заповнений
});

test('ensureCategoryIdentity: ідемпотентність — другий виклик save не кличе', async () => {
  const { ctx } = sandbox();
  ctx.CATEGORIES = [{ name: '🍔 Їжа', type: 'Гнучка', active: true }];
  const spy = spyOn(ctx, 'saveCategories');
  await ctx.ensureCategoryIdentity();
  assert.equal(spy.count(), 1);
  const createdAtAfterFirst = ctx.CATEGORIES[0].createdAt;
  await ctx.ensureCategoryIdentity();
  assert.equal(spy.count(), 1);
  assert.equal(ctx.CATEGORIES[0].createdAt, createdAtAfterFirst);
});

// UUID_FORMAT_RE — властивість vm.Context, не звичайний RegExp головного
// реалму (та сама cross-realm пастка, що plain(): `instanceof RegExp` і
// assert.match() з іншого реалму можуть повестись несподівано) — власна
// копія того самого патерну в реалмі тесту, лише для читабельних asserts.
function UUID_FORMAT_RE_JS(){ return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i; }
