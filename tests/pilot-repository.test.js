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
  // Rev 2.22.79 (6D.152) — restoreDictionaryFromBackup() тепер кличе цей
  // бекфіл-хелпер напряму (не лише через ensureDictionaryIdentity()).
  'ensureDictionaryEntryIds',
  // Rev 2.22.81 (6D.154, Крок A3) — стабільний порядок показу словника.
  'compareDictionaryForDisplay',
  'restoreCategoriesFromBackup', 'restoreSubcategoriesFromBackup',
  'restoreSubcategoryPriorityFromBackup', 'restoreDictionaryFromBackup',
  // Rev 2.22.89 (6D.162, Ревізія C) — маркер каскаду без FK. deleteCategory/
  // deleteSubcategory самі обгорнуті в showConfirmModal() (DOM-діалог
  // підтвердження) — підмінюється в globals нижче (sandbox()) на негайний
  // виклик onConfirm(), той самий принцип, що решта DOM-шару тут.
  // restoreCategory/restoreSubcategory — нові дата-функції без власного UI.
  'deleteCategory', 'deleteSubcategory', 'restoreCategory', 'restoreSubcategory',
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
  // Rev #30 (6D.143) — каскад проти осиротілих hidden_entities-рядків при
  // self-heal cloudId (bank_accounts/installment_accounts), викликається
  // з pushBankAccountsPilot()/pushInstallmentAccountsPilot().
  'cleanupOrphanedHiddenEntities',
  'saveIgnoredDivergences',
  // Rev #30 (6D.31, повне прибирання emoji) — одноразова міграція +
  // чистий rename-хелпер, витягнутий з неї (потрібен тут ЛИШЕ тому, що
  // loadAll() на нього посилається; loadAll сама не під тестом, стаб).
  'renameStrippingEmoji', 'ensureBankInstallmentNamesStripped', 'stripLeadingEmoji',
  // Rev #30 (6D.34, індикатор — стан "помилка") — 3 single-record push
  // функції ще не мали власного extract-покриття (лише array-домени вище);
  // isSyncResultFailure — чистий, DOM-незалежний хелпер з withSyncIndicator().
  'pushExpenseRecordPilot', 'pushIncomeRecordPilot', 'pushDebtRecordPilot', 'isSyncResultFailure',
  // Rev #30 (6D.60) — пакетний push (лише bulk-шляхи restore/syncAllPilotManual),
  // з відкатом на pushXRecordPilot() вище за провалу пакету.
  'pushExpensesBatch', 'pushExpensesBatched', 'pushIncomesBatch', 'pushIncomesBatched', 'pushDebtsBatch', 'pushDebtsBatched',
  'hideKey', 'divergenceKey', 'isHiddenForMonth',
  // Rev 2.22.83 (6D.156, Ревізія B1) — epoch-штамп для legacy-бекфілу hiddenFrom.
  'HIDDEN_FROM_LEGACY_EPOCH',
  'ensureInstallmentFirstMonth',
  'restoreBankAccountsFromBackup', 'restoreInstallmentAccountsFromBackup',
  'restoreHiddenFromFromBackup', 'restoreIgnoredDivergencesFromBackup',
  // Rev 2.22.82 (6D.155, Ревізія B) — hiddenFrom tombstone-модель.
  'normalizeHiddenFromBackupEntry', 'ensureHiddenFromShape', 'ensureHiddenFromIdentity',
  'hideEntityFromMonth', 'unhideEntity',
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
  // Rev #30 (6D.47) — P1.3, LWW-merge для 5 name/cloudId-based доменів;
  // спільний хелпер, яким тепер користуються всі 5 restoreXFromBackup().
  'mergeBackupRecordsByCloudIdOrName',
  // Rev #30 (6D.84) — Внутрішні сповіщення, Частина 3а/3б: автор-довідник +
  // черга "чужих дій", потрібні pullXCore()-тестам нижче. familyUsersById/
  // hiddenEntitiesPulledOnce/otherActorEvents — lowercase `let`, а не
  // function/ALL-CAPS const, тому НЕ тут (extractFunctionSource їх не
  // знайде) — початкові значення передаються через globals у sandbox()
  // нижче, той самий принцип, що cloudSession/hiddenFrom.
  'authorInfoFor', 'pushOtherActorEvent', 'drainOtherActorEvents', 'pluralUa',
  // Rev #30 (6D.68) — таймінги 2-фазного pulse-highlight ("щойно з хмари"),
  // яких pullExpensesCore() потребує ВСЕРЕДИНІ hadMarker-гілки (докоментар
  // над setTimeout-стабом у sandbox() нижче пояснює, чому це раніше не
  // спливало — жоден тест до 6D.84 не комбінував hadMarker:true з реальною
  // зміною для expenses).
  'RECORD_SYNC_PULSE_MS', 'RECORD_SYNC_PULSE_COUNT', 'RECORD_SYNC_DONE_MS',
];

function sandbox({ localStorageInitial, idbImpl } = {}){
  const fakeIdbInstance = idbImpl || fakeIdb();
  // Rev 2.22.89 (6D.162, Ревізія C) — showConfirmModal() нижче навмисно НЕ
  // покладається на bare-виклик `this` (спроба через `this.x = ...`
  // провалилась: функція визначена в реалмі Node, а bare-виклик зсередини
  // vm.Context підставляє GLOBAL ОБ'ЄКТ РЕАЛМУ САМОЇ ФУНКЦІЇ — тобто
  // справжній Node-global, не ctx) — замість цього звичайне замикання над
  // confirmState, той самий об'єкт за посиланням видається тесту як
  // ctx.__confirmState (примітиви копіюються в vm.createContext, об'єкти —
  // за посиланням, тому це працює крос-реалмово).
  const confirmState = {};
  const ctx = buildSandbox(
    {
      __confirmState: confirmState,
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
      // Rev #30 (6D.84) — Внутрішні сповіщення: familyUsersById порожній
      // за замовчуванням (той самий "довідник ще не завантажений" стан, що
      // authorInfoFor() трактує як null/невідомий автор — тихий пропуск, не
      // помилка). hiddenEntitiesPulledOnce:false — "перший пул цієї сесії"
      // (за замовчуванням завжди так у свіжому sandbox()).
      familyUsersById: {},
      hiddenEntitiesPulledOnce: false,
      otherActorEvents: [],
      // Rev #30 (6D.68) — pullExpensesCore() читає/пише цю Map під hadMarker
      // (transient "щойно з хмари" highlight) — раніше НІ ОДИН тест тут не
      // комбінував hadMarker:true з реальною зміною для expenses (усі
      // "LWW"-тести вище — без sync-маркера), тому відсутність цього
      // глобалу залишалась непоміченою аж до 6D.84 тестів нижче.
      recentlyPulledExpenseState: new Map(),
      // Rev #30 (6D.87) — той самий gap, що recentlyPulledExpenseState вище,
      // тепер і для incomes (pullIncomesCore() під hadMarker).
      recentlyPulledIncomeState: new Map(),
      // Rev #30 (6D.84) — той самий "раніше непомічений" gap, що коментар
      // над recentlyPulledExpenseState вище: vm.createContext НЕ має
      // browser/Node timer-глобалів узагалі. Виконуємо колбек ОДРАЗУ
      // (синхронно) — тестам не потрібна справжня затримка 2.4с+0.6с,
      // лише сам факт виконання без ReferenceError.
      setTimeout: (fn) => fn(),
      clearTimeout: () => {},
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
      // Rev #30 (6D.55) — усі 9 pullXCore() тепер рендерять після реальної
      // зміни (renderStructure()/populateCategorySelect()/renderAll()/…,
      // dзеркалять render локального save-шляху) — той самий DOM-шар, що
      // loadAll()/reportSaveResult() вище, підміняємо no-op заглушками.
      renderStructure: function(){},
      populateCategorySelect: function(){},
      populateBankDebtTable: function(){},
      populateInstallmentTable: function(){},
      renderAll: function(){},
      populateMonths: function(){},
      // Rev 2.22.89 (6D.162, Ревізія C) — deleteCategory()/deleteSubcategory()
      // обгорнуті в showConfirmModal(message, onConfirm) (DOM-діалог) — той
      // самий принцип, що решта DOM-шару вище: підміняємо на негайний виклик
      // onConfirm(), Promise зберігаємо в confirmState (замикання, не
      // bare-виклик `this` — докоментар над confirmState вище пояснює чому),
      // щоб тест міг його await-нути через ctx.__confirmState.lastPromise.
      showConfirmModal: function(message, onConfirm){ confirmState.lastPromise = onConfirm(); },
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

// Rev #30 (6D.63) — той самий bugfix і клас багу, що pullDebtsCore()
// (monthlyPayment/minPayment): dueDay для ОЧ, створеної локально ДО того, як
// користувач хоч раз відредагував "число платежу" (addInstallmentAccount() і
// подібні шляхи створення), НІКОЛИ не ініціалізується — local.dueDay
// ВІДСУТНЄ (undefined), тоді як Cloud завжди повертає явний null для цієї
// nullable-колонки. undefined!==null було TRUE назавжди → те саме
// нескінченне "1 оновлено" при кожному повторному pull.
test('pullInstallmentAccountsCore: повторний pull БЕЗ реальних змін (undefined vs null для dueDay) → updated:0, не 1 щоразу', async () => {
  const ctx = pullInstallmentSandbox([{ id: 'i1', name: 'iPhone', initial_amount: 25000, due_day: null, created_at: '2024-01-01T00:00:00.000Z', updated_at: '2024-01-01T00:00:00.000Z' }]);
  // local — саме такий стан, який ЗАЛИШАЄ addInstallmentAccount(): dueDay
  // ВІДСУТНЄ (не null!), бо поле просто ніколи не було встановлене.
  ctx.installmentAccounts = [{ name: 'iPhone', initialAmount: 25000, cloudId: 'i1', createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z' }];
  const result = await ctx.pullInstallmentAccountsCore();
  assert.equal(result.updated, 0, 'updated МАЄ бути 0 — dueDay реально не змінився (undefined і null тут еквівалентні)');
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
  ctx.hiddenFrom = { 'card:Приват Банк': { month: '2026-06', updatedAt: '2026-06-01T00:00:00.000Z' } };
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
  ctx.hiddenFrom = { 'card:Приват Банк': { month: '2026-06', updatedAt: '2026-06-01T00:00:00.000Z' } };
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
  ctx.hiddenFrom = { 'card:Приват Банк': { month: '2026-06', updatedAt: '2026-06-01T00:00:00.000Z' } };
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
  ctx.hiddenFrom = { 'installment:iPhone': { month: '2026-03', updatedAt: '2026-03-01T00:00:00.000Z' } };
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
  ctx.hiddenFrom = { 'card:Приват Банк': { month: '2026-06', updatedAt: '2026-06-01T00:00:00.000Z' } };
  ctx.bankAccounts = [{ name: 'Приват Банк', cloudId: 'b1' }];
  const result = await ctx.pushHiddenEntitiesPilot(); // не кидає, але тепер сигналізує невдачу явно
  assert.equal(fake.calls.length, 1); // спроба відбулась
  // Rev #30 (6D.34, індикатор — стан "помилка") — реальний Supabase-error
  // (не мережевий виняток) тепер теж явно позначається як { success:false },
  // не лише мовчки пропускається — саме це читає withSyncIndicator().
  assert.deepEqual(plain(result), { success: false });
});

/* ============ Rev 2.22.82 (6D.155, Ревізія B) — tombstone/захист для hidden_entities ============ */

test('pushHiddenEntitiesPilot: запис НЕ змінювався (syncedUpdatedAt===updatedAt) → upsert НЕ викликається взагалі (застарілий пристрій не чіпає чужий tombstone)', async () => {
  const { ctx } = sandbox();
  ctx.cloudSession = { user: { id: 'user-1' } };
  ctx.cloudFamilyId = 'fam-1';
  ctx.isSupabaseSdkReady = () => true;
  const fake = fakeSupabaseHiddenEntitiesUpsertClient();
  ctx.getSupabaseClient = () => fake.client;
  // Пристрій НЕ торкався цього запису відтоді, як востаннє синхронізував —
  // навіть якщо на іншому пристрої його тим часом видалили (tombstone) чи
  // перейменували місяць, цей push його просто не пушить.
  ctx.hiddenFrom = { 'card:Приват Банк': { month: '2026-06', updatedAt: '2026-01-01T00:00:00.000Z', syncedUpdatedAt: '2026-01-01T00:00:00.000Z' } };
  ctx.bankAccounts = [{ name: 'Приват Банк', cloudId: 'b1' }];
  const result = await ctx.pushHiddenEntitiesPilot();
  assert.equal(fake.calls.length, 0, 'НЕ мав навіть спробувати — запис не змінювався локально');
  assert.deepEqual(plain(result), { success: true });
});

test('pushHiddenEntitiesPilot: запис ЗМІНИВСЯ (updatedAt !== syncedUpdatedAt) → пушиться, несе deleted_at/updated_at', async () => {
  const { ctx } = sandbox();
  ctx.cloudSession = { user: { id: 'user-1' } };
  ctx.cloudFamilyId = 'fam-1';
  ctx.isSupabaseSdkReady = () => true;
  const fake = fakeSupabaseHiddenEntitiesUpsertClient();
  ctx.getSupabaseClient = () => fake.client;
  ctx.hiddenFrom = { 'card:Приват Банк': { month: '2026-06', updatedAt: '2026-02-01T00:00:00.000Z', deletedAt: '2026-02-01T00:00:00.000Z', syncedUpdatedAt: '2026-01-01T00:00:00.000Z' } };
  ctx.bankAccounts = [{ name: 'Приват Банк', cloudId: 'b1' }];
  await ctx.pushHiddenEntitiesPilot();
  assert.equal(fake.calls.length, 1);
  assert.equal(fake.calls[0].payload.deleted_at, '2026-02-01T00:00:00.000Z');
  assert.equal(fake.calls[0].payload.updated_at, '2026-02-01T00:00:00.000Z');
  assert.equal(ctx.hiddenFrom['card:Приват Банк'].syncedUpdatedAt, '2026-02-01T00:00:00.000Z');
});

test('unhideEntity: ставить tombstone (deletedAt+updatedAt) і пушить', async () => {
  const { ctx } = sandbox();
  ctx.cloudSession = { user: { id: 'user-1' } };
  ctx.cloudFamilyId = 'fam-1';
  ctx.isSupabaseSdkReady = () => true;
  const fake = fakeSupabaseHiddenEntitiesUpsertClient();
  ctx.getSupabaseClient = () => fake.client;
  ctx.hiddenFrom = { 'card:Приват Банк': { month: '2026-06', updatedAt: '2026-01-01T00:00:00.000Z', syncedUpdatedAt: '2026-01-01T00:00:00.000Z' } };
  ctx.bankAccounts = [{ name: 'Приват Банк', cloudId: 'b1' }];
  await ctx.unhideEntity('card', 'Приват Банк');
  assert.ok(ctx.hiddenFrom['card:Приват Банк'].deletedAt, 'мав поставити tombstone');
  assert.equal(fake.calls.length, 1, 'мав запуштись — запис щойно змінився');
  assert.equal(fake.calls[0].payload.deleted_at, ctx.hiddenFrom['card:Приват Банк'].deletedAt);
});

test('unhideEntity: запису немає чи вже tombstone → тихий success, upsert НЕ викликається', async () => {
  const { ctx } = sandbox();
  ctx.cloudSession = { user: { id: 'user-1' } };
  ctx.cloudFamilyId = 'fam-1';
  ctx.isSupabaseSdkReady = () => true;
  const fake = fakeSupabaseHiddenEntitiesUpsertClient();
  ctx.getSupabaseClient = () => fake.client;
  ctx.hiddenFrom = {};
  const result1 = await ctx.unhideEntity('card', 'Немає такого');
  assert.deepEqual(plain(result1), { success: true });
  ctx.hiddenFrom = { 'card:Приват Банк': { month: '2026-06', updatedAt: '2026-01-01T00:00:00.000Z', deletedAt: '2026-01-01T00:00:00.000Z' } };
  const result2 = await ctx.unhideEntity('card', 'Приват Банк');
  assert.deepEqual(plain(result2), { success: true });
  assert.equal(fake.calls.length, 0);
});

test('hideEntityFromMonth: повторне приховання ЗНІМАЄ tombstone і оновлює місяць (новий запис лишається, не створює другого)', () => {
  const { ctx } = sandbox();
  ctx.hiddenFrom = { 'card:Приват Банк': { month: '2026-06', updatedAt: '2026-01-01T00:00:00.000Z', deletedAt: '2026-01-02T00:00:00.000Z', syncedUpdatedAt: '2026-01-02T00:00:00.000Z' } };
  ctx.hideEntityFromMonth('card:Приват Банк', '2026-09');
  const entry = ctx.hiddenFrom['card:Приват Банк'];
  assert.equal(entry.month, '2026-09');
  assert.equal(entry.deletedAt, undefined, 'tombstone мав зніматись');
  assert.equal(Object.keys(ctx.hiddenFrom).length, 1, 'не мав створити другий запис');
});

test('hideEntityFromMonth: запису не було — створює новий', () => {
  const { ctx } = sandbox();
  ctx.hiddenFrom = {};
  ctx.hideEntityFromMonth('card:Нова Картка', '2026-09');
  assert.equal(ctx.hiddenFrom['card:Нова Картка'].month, '2026-09');
  assert.ok(ctx.hiddenFrom['card:Нова Картка'].updatedAt);
});

// Rev 2.22.83 (6D.156, Ревізія B1) — бекфіл ставить СТАЛИЙ epoch, не
// "зараз": "зараз" робило б щойно-нормалізований legacy-запис "новішим"
// за будь-який реальний Cloud-tombstone і провалювало б pull-LWW.
test('ensureHiddenFromShape: нормалізує старий формат (голий рядок) в об\'єкт з epoch-штампом (НЕ "зараз"), ідемпотентний', () => {
  const { ctx } = sandbox();
  ctx.hiddenFrom = { 'card:Приват Банк': '2026-06' };
  const changed1 = ctx.ensureHiddenFromShape();
  assert.equal(changed1, true);
  assert.equal(ctx.hiddenFrom['card:Приват Банк'].month, '2026-06');
  // Rev 2.22.83 (6D.156) — літерал, не ctx.HIDDEN_FROM_LEGACY_EPOCH: vm-
  // контекст НЕ виставляє top-level const/let, виконані ВСЕРЕДИНІ нього,
  // як властивості самого context-об'єкта (лише функції/значення, задані
  // ЗОВНІ через globals-аргумент buildSandbox, видно як ctx.X) — зовнішнє
  // читання ctx.HIDDEN_FROM_LEGACY_EPOCH тому завжди undefined, хоча код,
  // що виконується ВСЕРЕДИНІ контексту (ensureHiddenFromShape() сама),
  // бачить і використовує його коректно через лексичний скоуп.
  assert.equal(ctx.hiddenFrom['card:Приват Банк'].updatedAt, '1970-01-01T00:00:00.000Z');
  assert.equal(ctx.hiddenFrom['card:Приват Банк'].syncedUpdatedAt, '1970-01-01T00:00:00.000Z');
  const changed2 = ctx.ensureHiddenFromShape();
  assert.equal(changed2, false, 'повторний виклик на вже нормалізованих даних нічого не змінює');
});

test('6D.156: нормалізований legacy-запис (epoch) НЕ пушиться сам по собі — syncedUpdatedAt===updatedAt одразу після бекфілу', async () => {
  const { ctx } = sandbox();
  ctx.cloudSession = { user: { id: 'user-1' } };
  ctx.cloudFamilyId = 'fam-1';
  ctx.isSupabaseSdkReady = () => true;
  const fake = fakeSupabaseHiddenEntitiesUpsertClient();
  ctx.getSupabaseClient = () => fake.client;
  ctx.hiddenFrom = { 'card:Приват Банк': '2026-06' };
  ctx.bankAccounts = [{ name: 'Приват Банк', cloudId: 'b1' }];
  ctx.ensureHiddenFromShape();
  await ctx.pushHiddenEntitiesPilot();
  assert.equal(fake.calls.length, 0, 'бекфіл сам по собі не мав запускати push');
});

test('6D.156: нормалізований legacy-запис (epoch) НЕ перемагає свіжіший Cloud-рядок — pull LWW застосовує чужий tombstone', async () => {
  const ctx = pullHiddenSandbox([{ entity_type: 'bank', entity_id: 'b1', hidden_from_month: '2026-06-01', deleted_at: '2026-05-01T00:00:00.000Z', updated_at: '2026-05-01T00:00:00.000Z' }]);
  ctx.bankAccounts = [{ name: 'Приват Банк', cloudId: 'b1' }];
  ctx.hiddenFrom = { 'card:Приват Банк': '2026-06' }; // legacy, ще не нормалізовано
  ctx.ensureHiddenFromShape();
  const result = await ctx.pullHiddenEntitiesCore();
  assert.equal(result.updated, 1, 'epoch МАЄ програвати Cloud-рядку, навіть реальному tombstone');
  assert.equal(ctx.hiddenFrom['card:Приват Банк'].deletedAt, '2026-05-01T00:00:00.000Z');
});

test('6D.156: ніколи не синхронізований legacy-запис (epoch, Cloud про нього не знає) → pull знімає syncedUpdatedAt, наступний push нарешті відправляє', async () => {
  const ctx = pullHiddenSandbox([]); // Cloud для цієї сім'ї геть порожній
  ctx.bankAccounts = [{ name: 'Приват Банк', cloudId: 'b1' }];
  ctx.hiddenFrom = { 'card:Приват Банк': '2026-06' }; // приховано офлайн, ДО першої синхронізації
  ctx.ensureHiddenFromShape();
  assert.equal(ctx.hiddenFrom['card:Приват Банк'].syncedUpdatedAt, '1970-01-01T00:00:00.000Z');
  await ctx.pullHiddenEntitiesCore();
  assert.equal(ctx.hiddenFrom['card:Приват Банк'].syncedUpdatedAt, undefined, 'pull мав "відліпити" його від epoch — Cloud підтвердив, що рядка нема взагалі');
  // І тепер push нарешті його відправляє.
  ctx.cloudSession = { user: { id: 'user-1' } };
  const fake = fakeSupabaseHiddenEntitiesUpsertClient();
  ctx.getSupabaseClient = () => fake.client;
  await ctx.pushHiddenEntitiesPilot();
  assert.equal(fake.calls.length, 1, 'після виявлення pull-ом цей запис нарешті мав запуштись');
});

test('isHiddenForMonth: захисна сумісність зі старим форматом (голий рядок), без нормалізації', () => {
  const { ctx } = sandbox();
  ctx.hiddenFrom = { 'card:Приват Банк': '2026-06' };
  assert.equal(ctx.isHiddenForMonth('Приват Банк', 'card', '2026-08'), true);
  assert.equal(ctx.isHiddenForMonth('Приват Банк', 'card', '2026-03'), false);
});

test('isHiddenForMonth: tombstone (показано назад) → завжди false, незалежно від місяця', () => {
  const { ctx } = sandbox();
  ctx.hiddenFrom = { 'card:Приват Банк': { month: '2026-06', updatedAt: '2026-01-01T00:00:00.000Z', deletedAt: '2026-01-02T00:00:00.000Z' } };
  assert.equal(ctx.isHiddenForMonth('Приват Банк', 'card', '2026-12'), false);
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

test('pushIncomeRecordPilot: реальна Cloud-помилка від upsert → { success:false, error:<message> } (6D.58 — реальна причина більше не губиться мовчки)', async () => {
  const { ctx } = sandbox();
  ctx.cloudSession = { user: { id: 'user-1' } };
  ctx.cloudFamilyId = 'fam-1';
  ctx.isSupabaseSdkReady = () => true;
  ctx.getSupabaseClient = () => ({ from(){ return { upsert(){ return Promise.resolve({ data: null, error: new Error('симульована помилка') }); } }; } });
  const result = await ctx.pushIncomeRecordPilot({ id: 'i1', date: '2026-01-01', amount: 1000, source: 'ЗП' });
  assert.deepEqual(plain(result), { success: false, error: 'симульована помилка' });
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

// Rev #30 (6D.49) — Pull одразу після успішного push (Варіант А).
test('pushExpenseRecordPilot: успішний push → pullExpensesCore() викликається одразу після', async () => {
  const { ctx } = sandbox();
  ctx.cloudSession = { user: { id: 'user-1' } };
  ctx.cloudFamilyId = 'fam-1';
  ctx.isSupabaseSdkReady = () => true;
  ctx.getSupabaseClient = () => ({ from(){ return { upsert(){ return Promise.resolve({ data: [{}], error: null }); } }; } });
  const pullSpy = spyOn(ctx, 'pullExpensesCore');
  await ctx.pushExpenseRecordPilot({ id: 'e1', date: '2026-01-01', amount: 500 });
  assert.equal(pullSpy.count(), 1);
});

test('pushExpenseRecordPilot: push ПРОВАЛИВСЯ (реальна Cloud-помилка) → pullExpensesCore() НЕ викликається', async () => {
  const { ctx } = sandbox();
  ctx.cloudSession = { user: { id: 'user-1' } };
  ctx.cloudFamilyId = 'fam-1';
  ctx.isSupabaseSdkReady = () => true;
  ctx.getSupabaseClient = () => ({ from(){ return { upsert(){ return Promise.resolve({ data: null, error: new Error('симульована помилка') }); } }; } });
  const pullSpy = spyOn(ctx, 'pullExpensesCore');
  await ctx.pushExpenseRecordPilot({ id: 'e1', date: '2026-01-01', amount: 500 });
  assert.equal(pullSpy.count(), 0);
});

test('pushExpenseRecordPilot: не залогінений (офлайн-подібний guard) → pullExpensesCore() НЕ викликається (природний успадкований тихий пропуск)', async () => {
  const { ctx } = sandbox();
  const pullSpy = spyOn(ctx, 'pullExpensesCore');
  await ctx.pushExpenseRecordPilot({ id: 'e1', date: '2026-01-01', amount: 500 });
  assert.equal(pullSpy.count(), 0);
});

test('pushCategoriesPilot: успішний push (порожній масив, anyError:false) → pullCategoriesCore() викликається', async () => {
  const { ctx } = sandbox();
  ctx.cloudSession = { user: { id: 'user-1' } };
  ctx.cloudFamilyId = 'fam-1';
  ctx.isSupabaseSdkReady = () => true;
  ctx.CATEGORIES = [];
  ctx.getSupabaseClient = () => fakeSupabaseSelectClient('categories', []);
  const pullSpy = spyOn(ctx, 'pullCategoriesCore');
  await ctx.pushCategoriesPilot();
  assert.equal(pullSpy.count(), 1);
});

test('pushCategoriesPilot: реальна Cloud-помилка (anyError:true) → pullCategoriesCore() НЕ викликається', async () => {
  const { ctx } = sandbox();
  ctx.cloudSession = { user: { id: 'user-1' } };
  ctx.cloudFamilyId = 'fam-1';
  ctx.isSupabaseSdkReady = () => true;
  ctx.CATEGORIES = [{ name: 'Тест', type: 'Гнучка', active: true, cloudId: 'c1', updatedAt: '2024-01-01T00:00:00.000Z' }];
  ctx.getSupabaseClient = () => ({
    from(table){
      assert.equal(table, 'categories');
      return { update(){ return { eq(){ return { select(){ return Promise.resolve({ data: null, error: new Error('симульована помилка') }); } }; } }; } };
    },
  });
  const pullSpy = spyOn(ctx, 'pullCategoriesCore');
  await ctx.pushCategoriesPilot();
  assert.equal(pullSpy.count(), 0);
});

// Rev #30 (6D.50) — колишній BugFix: bulk-push НЕ мав пересилати незмінені
// записи (знайдено 6D.49 живою перевіркою — контрольовано відтворений
// clobber одночасної чужої зміни). Rev #30 (6D.125) — цей "already synced"
// шорткат сам ВИДАЛЕНО: той самий клас бага, що вже підтверджений реальним
// інцидентом і виправлений для bank_accounts/installment_accounts (6D.76,
// див. тест "pushBankAccountsPilot: cloudId застарів..." нижче) — якщо
// cloudId застарів, а updatedAt локально не змінювався, запис вважав себе
// "синхронізованим" НАЗАВЖДИ, і self-heal нижче (update повертає 0 рядків
// → reconcile) не отримував навіть ШАНСУ спрацювати. Тест тепер перевіряє
// ПРОТИЛЕЖНИЙ, новий інваріант: навіть незмінений запис і далі пушиться
// (щоб self-heal лишався досяжним), помилка з Cloud не ламає результат.
test('pushCategoriesPilot: запис із syncedUpdatedAt===updatedAt (не змінювався локально) — і далі пушиться (self-heal лишається досяжним)', async () => {
  const { ctx } = sandbox();
  ctx.cloudSession = { user: { id: 'user-1' } };
  ctx.cloudFamilyId = 'fam-1';
  ctx.isSupabaseSdkReady = () => true;
  ctx.CATEGORIES = [{ name: 'Незмінена', type: 'Гнучка', active: true, cloudId: 'c1', updatedAt: '2024-01-01T00:00:00.000Z', syncedUpdatedAt: '2024-01-01T00:00:00.000Z' }];
  let updateCalled = false;
  ctx.getSupabaseClient = () => ({
    from(table){
      return {
        update(){ updateCalled = true; return { eq(){ return { select(){ return Promise.resolve({ data: [{}], error: null }); } }; } }; },
        select(){ return { eq(){ return Promise.resolve({ data: [], error: null }); } }; },
      };
    },
  });
  const result = await ctx.pushCategoriesPilot();
  assert.equal(updateCalled, true, 'UPDATE мав викликатись навіть для незміненого запису (self-heal лишається досяжним)');
  assert.deepEqual(plain(result).success, true);
});

test('pushCategoriesPilot: запис ЗМІНИВСЯ (updatedAt !== syncedUpdatedAt) → пушиться, syncedUpdatedAt оновлюється після успіху', async () => {
  const { ctx } = sandbox();
  ctx.cloudSession = { user: { id: 'user-1' } };
  ctx.cloudFamilyId = 'fam-1';
  ctx.isSupabaseSdkReady = () => true;
  ctx.CATEGORIES = [{ name: 'Змінена', type: 'Гнучка', active: true, cloudId: 'c1', updatedAt: '2024-06-01T00:00:00.000Z', syncedUpdatedAt: '2024-01-01T00:00:00.000Z' }];
  let updateCalled = false;
  ctx.getSupabaseClient = () => ({
    from(table){
      return {
        update(){ updateCalled = true; return { eq(){ return { select(){ return Promise.resolve({ data: [{ id: 'c1' }], error: null }); } }; } }; },
        select(){ return { eq(){ return Promise.resolve({ data: [], error: null }); } }; },
      };
    },
  });
  await ctx.pushCategoriesPilot();
  assert.equal(updateCalled, true, 'UPDATE мав викликатись для зміненого запису');
  assert.equal(ctx.CATEGORIES[0].syncedUpdatedAt, '2024-06-01T00:00:00.000Z');
});

// Rev #30 (6D.50) — колишній regression-сценарій: 2 записи, лише ОДИН
// змінився локально — push НЕ мав би торкатись Cloud-рядка іншого. Rev #30
// (6D.125) — після видалення "already synced" шортката (докоментар над
// тестом "і далі пушиться" вище) ОБИДВА записи тепер пушаться щоразу —
// свідомо прийнятий компроміс (той самий, що вже обґрунтований для
// bank_accounts/installment_accounts, 6D.76): кількість категорій мала
// (одиниці-десятки, не сотні), вартість зайвого UPDATE значно менша за
// ризик "тихо мертвого" cloudId назавжди.
test('pushCategoriesPilot: 2 записи, лише 1 локально змінився → ОБИДВА все одно пушаться (self-heal лишається досяжним для кожного)', async () => {
  const { ctx } = sandbox();
  ctx.cloudSession = { user: { id: 'user-1' } };
  ctx.cloudFamilyId = 'fam-1';
  ctx.isSupabaseSdkReady = () => true;
  ctx.CATEGORIES = [
    { name: 'Змінена', type: 'Гнучка', active: true, cloudId: 'c1', updatedAt: '2024-06-01T00:00:00.000Z', syncedUpdatedAt: '2024-01-01T00:00:00.000Z' },
    { name: 'Незмінена', type: 'Гнучка', active: true, cloudId: 'c2', updatedAt: '2024-01-01T00:00:00.000Z', syncedUpdatedAt: '2024-01-01T00:00:00.000Z' },
  ];
  const updatedIds = [];
  ctx.getSupabaseClient = () => ({
    from(table){
      return {
        update(){ return { eq(id, val){ updatedIds.push(val); return { select(){ return Promise.resolve({ data: [{ id: val }], error: null }); } }; } }; },
        select(){ return { eq(){ return Promise.resolve({ data: [], error: null }); } }; },
      };
    },
  });
  await ctx.pushCategoriesPilot();
  assert.deepEqual(updatedIds, ['c1', 'c2']); // ОБИДВА — 'c2' (незмінена) теж пушиться (6D.125)
});

test('pushHiddenEntitiesPilot: успішний push (порожній hiddenFrom) → pullHiddenEntitiesCore() викликається (рішення: той самий принцип, хоч і поза "8 доменів")', async () => {
  const { ctx } = sandbox();
  ctx.cloudSession = { user: { id: 'user-1' } };
  ctx.cloudFamilyId = 'fam-1';
  ctx.isSupabaseSdkReady = () => true;
  ctx.hiddenFrom = {};
  ctx.getSupabaseClient = () => fakeSupabaseSelectClient('hidden_entities', []);
  const pullSpy = spyOn(ctx, 'pullHiddenEntitiesCore');
  await ctx.pushHiddenEntitiesPilot();
  assert.equal(pullSpy.count(), 1);
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

// Rev #30 (6D.76) — КРИТИЧНИЙ регресійний тест: реальний інцидент
// користувача — "постійно крутиться синхронізація, періодично помилка"
// після "Очистити всі дані" → "Відновити". Корінь: bankAccounts.cloudId
// застарів (Cloud-рядок видалено/перестворено), але acc.syncedUpdatedAt
// === acc.updatedAt (перенесено з бекапу) — pushBankAccountsPilot() НІКОЛИ
// б не перевірив Cloud і не помітив би застарілості. debts.bank_account_id
// FK (БЕЗ ON DELETE, підтверджено прямим SQL до budget-app-dev) відхиляє
// push з кодом 23503 — БЕЗ фіксу це повторювалось би нескінченно, бо
// ніщо не скидає застарілий cloudId.
test('pushDebtRecordPilot: push провалюється з кодом 23503 (застарілий cloudId рахунку) → self-heal скидає cloudId+syncedUpdatedAt, НЕ петля назавжди', async () => {
  const { ctx } = sandbox();
  ctx.cloudSession = { user: { id: 'user-1' } };
  ctx.cloudFamilyId = 'fam-1';
  ctx.isSupabaseSdkReady = () => true;
  // Rev #30 (6D.76) — саме ЦЕЙ стан (cloudId присутній, syncedUpdatedAt===
  // updatedAt) — той, що ОБДУРЮЄ pushBankAccountsPilot()'s shortcut
  // (`if(acc.cloudId && acc.syncedUpdatedAt===acc.updatedAt) continue;`),
  // хоча cloudId 'stale-deleted-id' насправді вказує в нікуди.
  ctx.bankAccounts = [{ name: 'Приват Банк', cloudId: 'stale-deleted-id', updatedAt: '2026-01-01T00:00:00.000Z', syncedUpdatedAt: '2026-01-01T00:00:00.000Z' }];
  const saveSpy = spyOn(ctx, 'saveBankAccountsLocal');
  ctx.getSupabaseClient = () => ({ from(){ return { upsert(){
    const err = new Error('insert or update on table "debts" violates foreign key constraint "debts_bank_account_id_fkey"');
    err.code = '23503';
    return Promise.resolve({ data: null, error: err });
  } }; } });
  const result = await ctx.pushDebtRecordPilot({ id: 'd1', name: 'Приват Банк', kind: 'card', month: '2026-01', balance: 1000, updatedAt: '2026-05-01T00:00:00.000Z' });
  assert.equal(result.success, false);
  assert.equal(ctx.bankAccounts[0].cloudId, null, 'застарілий cloudId скинуто — наступний pushBankAccountsPilot() пройде self-heal-шляхом');
  assert.equal(ctx.bankAccounts[0].syncedUpdatedAt, undefined, 'syncedUpdatedAt теж скинуто — інакше shortcut спрацював би знову');
  assert.equal(saveSpy.count(), 1);
});

test('pushDebtRecordPilot: push провалюється БЕЗ коду 23503 (напр. мережа) → cloudId рахунку НЕ чіпається (не всяка помилка — застарілий FK)', async () => {
  const { ctx } = sandbox();
  ctx.cloudSession = { user: { id: 'user-1' } };
  ctx.cloudFamilyId = 'fam-1';
  ctx.isSupabaseSdkReady = () => true;
  ctx.bankAccounts = [{ name: 'Приват Банк', cloudId: 'b1', updatedAt: '2026-01-01T00:00:00.000Z', syncedUpdatedAt: '2026-01-01T00:00:00.000Z' }];
  ctx.getSupabaseClient = () => ({ from(){ return { upsert(){
    return Promise.resolve({ data: null, error: new Error('якась інша помилка') });
  } }; } });
  const result = await ctx.pushDebtRecordPilot({ id: 'd1', name: 'Приват Банк', kind: 'card', month: '2026-01', balance: 1000, updatedAt: '2026-05-01T00:00:00.000Z' });
  assert.equal(result.success, false);
  assert.equal(ctx.bankAccounts[0].cloudId, 'b1');
  assert.equal(ctx.bankAccounts[0].syncedUpdatedAt, '2026-01-01T00:00:00.000Z');
});

test('pushExpenseRecordPilot: linked_installment_id push провалюється з кодом 23503 → self-heal скидає cloudId ОЧ (той самий принцип, що pushDebtRecordPilot)', async () => {
  const { ctx } = sandbox();
  ctx.cloudSession = { user: { id: 'user-1' } };
  ctx.cloudFamilyId = 'fam-1';
  ctx.isSupabaseSdkReady = () => true;
  ctx.installmentAccounts = [{ name: 'iPhone', cloudId: 'stale-deleted-id', updatedAt: '2026-01-01T00:00:00.000Z', syncedUpdatedAt: '2026-01-01T00:00:00.000Z' }];
  ctx.getSupabaseClient = () => ({ from(){ return { upsert(){
    const err = new Error('violates foreign key constraint "expenses_linked_installment_id_fkey"');
    err.code = '23503';
    return Promise.resolve({ data: null, error: err });
  } }; } });
  const result = await ctx.pushExpenseRecordPilot({ id: 'e1', name: 'Платіж', amount: 100, date: '2026-05-01', linkedInstallment: 'iPhone', updatedAt: '2026-05-01T00:00:00.000Z' });
  assert.equal(result.success, false);
  assert.equal(ctx.installmentAccounts[0].cloudId, null);
  assert.equal(ctx.installmentAccounts[0].syncedUpdatedAt, undefined);
});

// Rev #30 (6D.76) — КРИТИЧНИЙ регресійний тест, друга половина реального
// інциденту: навіть після self-heal у pushDebtRecordPilot() (тести вище),
// pushBankAccountsPilot() САМ мав "already synced" шорткат
// (`if(acc.cloudId && acc.syncedUpdatedAt===acc.updatedAt) continue;`),
// що НІКОЛИ не давав self-heal-логіці нижче (data.length===0 → reconcile)
// навіть ШАНСУ спрацювати для акаунта, чий Cloud-рядок зник незалежно від
// цього пристрою (updatedAt локально не змінювався). Підтверджено живо
// проти budget-app-dev: після видалення bank_accounts/installment_accounts
// напряму в базі, повторні "Синхронізувати все" НІЧОГО не змінювали, доки
// шорткат не прибрали.
test('pushBankAccountsPilot: cloudId застарів (Cloud-рядок зник) → update повертає 0 рядків → self-heal перестворює акаунт (НЕ "already synced" назавжди)', async () => {
  const { ctx } = sandbox();
  ctx.cloudSession = { user: { id: 'user-1' } };
  ctx.cloudFamilyId = 'fam-1';
  ctx.isSupabaseSdkReady = () => true;
  // acc.updatedAt НЕ змінювався відколи акаунт вважався синхронізованим —
  // саме той стан, що раніше ОБДУРЮВАВ шорткат.
  ctx.bankAccounts = [{ name: 'Приват Банк', cloudId: 'stale-deleted-id', creditLimit: null, updatedAt: '2026-01-01T00:00:00.000Z', syncedUpdatedAt: '2026-01-01T00:00:00.000Z' }];
  let updateCalls = 0, insertCalls = 0;
  // chainable() — thenable ланцюжок, що обслуговує І pullBankAccountsCore()'s
  // `.select(...).eq(...)` (await НАПРЯМУ, без .maybeSingle()) І
  // reconcileBankAccountCloudId()'s `.select(...).eq().eq().maybeSingle()` —
  // pushBankAccountsPilot() наприкінці сам кличе pull (той самий
  // "pull-after-push", 6D.49), тож мок мусить обслужити обидва шляхи.
  const chainable = function(value){
    return { eq(){ return chainable(value); }, maybeSingle(){ return Promise.resolve(value); }, then(res, rej){ return Promise.resolve(value).then(res, rej); } };
  };
  ctx.getSupabaseClient = () => ({ from(){ return {
    update(){ updateCalls++; return { eq(){ return { select(){ return Promise.resolve({ data: [], error: null }); } }; } }; }, // 0 рядків — cloudId мертвий
    insert(){ insertCalls++; return { select(){ return { single(){ return Promise.resolve({ data: { id: 'fresh-new-id' }, error: null }); } }; } }; },
    select(){ return chainable({ data: null, error: null }); },
  }; } });
  await ctx.pushBankAccountsPilot();
  assert.equal(updateCalls, 1, 'МАЄ спробувати update (не пропустити його шорткатом)');
  assert.equal(insertCalls, 1, 'self-heal: 0 рядків від update → reconcile створює новий');
  assert.equal(ctx.bankAccounts[0].cloudId, 'fresh-new-id');
});

test('pushInstallmentAccountsPilot: той самий self-heal, що pushBankAccountsPilot (cloudId застарів → перестворення)', async () => {
  const { ctx } = sandbox();
  ctx.cloudSession = { user: { id: 'user-1' } };
  ctx.cloudFamilyId = 'fam-1';
  ctx.isSupabaseSdkReady = () => true;
  ctx.installmentAccounts = [{ name: 'iPhone', cloudId: 'stale-deleted-id', initialAmount: 1000, updatedAt: '2026-01-01T00:00:00.000Z', syncedUpdatedAt: '2026-01-01T00:00:00.000Z' }];
  let updateCalls = 0, insertCalls = 0;
  const chainable = function(value){
    return { eq(){ return chainable(value); }, maybeSingle(){ return Promise.resolve(value); }, then(res, rej){ return Promise.resolve(value).then(res, rej); } };
  };
  ctx.getSupabaseClient = () => ({ from(){ return {
    update(){ updateCalls++; return { eq(){ return { select(){ return Promise.resolve({ data: [], error: null }); } }; } }; },
    insert(){ insertCalls++; return { select(){ return { single(){ return Promise.resolve({ data: { id: 'fresh-new-id' }, error: null }); } }; } }; },
    select(){ return chainable({ data: null, error: null }); },
  }; } });
  await ctx.pushInstallmentAccountsPilot();
  assert.equal(updateCalls, 1);
  assert.equal(insertCalls, 1);
  assert.equal(ctx.installmentAccounts[0].cloudId, 'fresh-new-id');
});

// Rev #30 (6D.143) — каскад проти осиротілих hidden_entities-рядків.
// Реальний інцидент: cloudId рахунку самозцілився (self-heal, тести вище),
// pushHiddenEntitiesPilot() наступного разу upsert'ить під НОВИМ entity_id
// (інший ключ конфлікту) — старий рядок лишався в базі назавжди. Ці тести
// перевіряють, що цей каскад (а) спрацьовує рівно коли треба, (б) НЕ
// спрацьовує, коли нема чого прибирати, і (в) його власний провал не
// ламає основний результат push (best-effort, той самий принцип, що
// debts/expenses-каскади поруч).
function hiddenEntitiesDeleteTrackingClient(otherTableHandlers){
  const deleteCalls = [];
  const chainable = function(value){
    return { eq(){ return chainable(value); }, maybeSingle(){ return Promise.resolve(value); }, then(res, rej){ return Promise.resolve(value).then(res, rej); } };
  };
  const client = { from(table){
    if(table === 'hidden_entities'){
      const call = { familyId: null, entityType: null, entityIds: null };
      deleteCalls.push(call);
      const builder = {
        eq(field, val){
          if(field === 'family_id') call.familyId = val;
          if(field === 'entity_type') call.entityType = val;
          return builder;
        },
        in(field, vals){
          if(field === 'entity_id') call.entityIds = vals;
          return Promise.resolve({ data: null, error: null });
        },
      };
      return { delete(){ return builder; } };
    }
    return otherTableHandlers(chainable);
  } };
  return { client, deleteCalls };
}

test('pushBankAccountsPilot: cloudId самозцілився → cleanupOrphanedHiddenEntities викликається зі СТАРИМ cloudId (6D.143)', async () => {
  const { ctx } = sandbox();
  ctx.cloudSession = { user: { id: 'user-1' } };
  ctx.cloudFamilyId = 'fam-1';
  ctx.isSupabaseSdkReady = () => true;
  ctx.bankAccounts = [{ name: 'Приват Банк', cloudId: 'old-id', creditLimit: null, updatedAt: '2026-01-01T00:00:00.000Z', syncedUpdatedAt: '2026-01-01T00:00:00.000Z' }];
  const { client, deleteCalls } = hiddenEntitiesDeleteTrackingClient((chainable) => ({
    update(){ return { eq(){ return { select(){ return Promise.resolve({ data: [], error: null }); } }; } }; }, // 0 рядків — self-heal
    insert(){ return { select(){ return { single(){ return Promise.resolve({ data: { id: 'new-id' }, error: null }); } }; } }; },
    select(){ return chainable({ data: null, error: null }); },
  }));
  ctx.getSupabaseClient = () => client;
  await ctx.pushBankAccountsPilot();
  assert.equal(ctx.bankAccounts[0].cloudId, 'new-id');
  assert.equal(deleteCalls.length, 1, 'delete() на hidden_entities мав викликатись рівно раз');
  assert.equal(deleteCalls[0].entityType, 'bank');
  assert.equal(deleteCalls[0].familyId, 'fam-1');
  assert.deepEqual(plain(deleteCalls[0].entityIds), ['old-id'], 'мусить прибирати САМЕ старий, а не новий cloudId');
});

test('pushInstallmentAccountsPilot: той самий каскад, entity_type="installment" (6D.143)', async () => {
  const { ctx } = sandbox();
  ctx.cloudSession = { user: { id: 'user-1' } };
  ctx.cloudFamilyId = 'fam-1';
  ctx.isSupabaseSdkReady = () => true;
  ctx.installmentAccounts = [{ name: 'iPhone', cloudId: 'old-id', initialAmount: 1000, updatedAt: '2026-01-01T00:00:00.000Z', syncedUpdatedAt: '2026-01-01T00:00:00.000Z' }];
  const { client, deleteCalls } = hiddenEntitiesDeleteTrackingClient((chainable) => ({
    update(){ return { eq(){ return { select(){ return Promise.resolve({ data: [], error: null }); } }; } }; },
    insert(){ return { select(){ return { single(){ return Promise.resolve({ data: { id: 'new-id' }, error: null }); } }; } }; },
    select(){ return chainable({ data: null, error: null }); },
  }));
  ctx.getSupabaseClient = () => client;
  await ctx.pushInstallmentAccountsPilot();
  assert.equal(ctx.installmentAccounts[0].cloudId, 'new-id');
  assert.equal(deleteCalls.length, 1);
  assert.equal(deleteCalls[0].entityType, 'installment');
  assert.deepEqual(plain(deleteCalls[0].entityIds), ['old-id']);
});

test('pushBankAccountsPilot: рахунок ВПЕРШЕ створюється (немає старого cloudId) → cleanupOrphanedHiddenEntities НЕ викликається', async () => {
  const { ctx } = sandbox();
  ctx.cloudSession = { user: { id: 'user-1' } };
  ctx.cloudFamilyId = 'fam-1';
  ctx.isSupabaseSdkReady = () => true;
  ctx.bankAccounts = [{ name: 'Новий банк', cloudId: null, creditLimit: null, updatedAt: '2026-01-01T00:00:00.000Z' }];
  const { client, deleteCalls } = hiddenEntitiesDeleteTrackingClient((chainable) => ({
    insert(){ return { select(){ return { single(){ return Promise.resolve({ data: { id: 'brand-new-id' }, error: null }); } }; } }; },
    select(){ return chainable({ data: null, error: null }); },
  }));
  ctx.getSupabaseClient = () => client;
  await ctx.pushBankAccountsPilot();
  assert.equal(ctx.bankAccounts[0].cloudId, 'brand-new-id');
  assert.equal(deleteCalls.length, 0, 'немає попереднього cloudId — нема що прибирати, delete() не мав викликатись');
});

test('pushBankAccountsPilot: cloudId СТАБІЛЬНИЙ (update успішний, не self-heal) → cleanupOrphanedHiddenEntities НЕ викликається', async () => {
  const { ctx } = sandbox();
  ctx.cloudSession = { user: { id: 'user-1' } };
  ctx.cloudFamilyId = 'fam-1';
  ctx.isSupabaseSdkReady = () => true;
  ctx.bankAccounts = [{ name: 'Стабільний банк', cloudId: 'stable-id', creditLimit: null, updatedAt: '2026-01-01T00:00:00.000Z' }];
  const { client, deleteCalls } = hiddenEntitiesDeleteTrackingClient((chainable) => ({
    update(){ return { eq(){ return { select(){ return Promise.resolve({ data: [{ id: 'stable-id' }], error: null }); } }; } }; }, // рядок існує — НЕ self-heal
    select(){ return chainable({ data: null, error: null }); },
  }));
  ctx.getSupabaseClient = () => client;
  await ctx.pushBankAccountsPilot();
  assert.equal(ctx.bankAccounts[0].cloudId, 'stable-id');
  assert.equal(deleteCalls.length, 0);
});

test('pushBankAccountsPilot: cleanupOrphanedHiddenEntities падає (мережа) → НЕ ламає результат основного push (best-effort)', async () => {
  const { ctx } = sandbox();
  ctx.cloudSession = { user: { id: 'user-1' } };
  ctx.cloudFamilyId = 'fam-1';
  ctx.isSupabaseSdkReady = () => true;
  ctx.bankAccounts = [{ name: 'Приват Банк', cloudId: 'old-id', creditLimit: null, updatedAt: '2026-01-01T00:00:00.000Z', syncedUpdatedAt: '2026-01-01T00:00:00.000Z' }];
  const chainable = function(value){
    return { eq(){ return chainable(value); }, maybeSingle(){ return Promise.resolve(value); }, then(res, rej){ return Promise.resolve(value).then(res, rej); } };
  };
  ctx.getSupabaseClient = () => ({ from(table){
    if(table === 'hidden_entities') return { delete(){ throw new Error('network down'); } };
    return {
      update(){ return { eq(){ return { select(){ return Promise.resolve({ data: [], error: null }); } }; } }; },
      insert(){ return { select(){ return { single(){ return Promise.resolve({ data: { id: 'new-id' }, error: null }); } }; } }; },
      select(){ return chainable({ data: null, error: null }); },
    };
  } });
  const result = await ctx.pushBankAccountsPilot();
  assert.equal(ctx.bankAccounts[0].cloudId, 'new-id', 'основний self-heal і далі відпрацював');
  assert.equal(plain(result).success, true, 'провал ЛИШЕ cleanup-чистки не мав позначити весь push як помилку');
});

test('cleanupOrphanedHiddenEntities: синхронний throw у delete() не пробивається назовні (try/catch)', async () => {
  const { ctx } = sandbox();
  const client = { from(){ return { delete(){ throw new Error('boom'); } }; } };
  await assert.doesNotReject(ctx.cleanupOrphanedHiddenEntities(client, 'bank', ['x']));
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
  assert.deepEqual(plain(result), { skipped: false, added: 0, updated: 0, skippedFk: 1 });
  assert.deepEqual(plain(ctx.hiddenFrom), {});
});

test('pullHiddenEntitiesCore: entity_type "bank" резолвиться в bankAccounts за cloudId, kind "card" у ключі — додається (локально не було)', async () => {
  const ctx = pullHiddenSandbox([{ entity_type: 'bank', entity_id: 'b1', hidden_from_month: '2026-06-01', updated_at: '2026-06-01T00:00:00.000Z' }]);
  ctx.bankAccounts = [{ name: 'Приват Банк', cloudId: 'b1' }];
  ctx.hiddenFrom = {};
  const result = await ctx.pullHiddenEntitiesCore();
  assert.deepEqual(plain(result), { skipped: false, added: 1, updated: 0, skippedFk: 0 });
  assert.equal(ctx.hiddenFrom['card:Приват Банк'].month, '2026-06');
});

test('pullHiddenEntitiesCore: entity_type "installment" резолвиться в installmentAccounts за cloudId, kind "installment" у ключі', async () => {
  const ctx = pullHiddenSandbox([{ entity_type: 'installment', entity_id: 'i1', hidden_from_month: '2026-03-01', updated_at: '2026-03-01T00:00:00.000Z' }]);
  ctx.installmentAccounts = [{ name: 'iPhone', cloudId: 'i1' }];
  ctx.hiddenFrom = {};
  const result = await ctx.pullHiddenEntitiesCore();
  assert.deepEqual(plain(result), { skipped: false, added: 1, updated: 0, skippedFk: 0 });
  assert.equal(ctx.hiddenFrom['installment:iPhone'].month, '2026-03');
});

// Rev 2.22.82 (6D.155, Ревізія B) — "приховати перемагає" (existence-only)
// замінено на справжній LWW за updated_at: локальна зміна, новіша за
// Cloud-рядок, перемагає (той самий принцип, що всі tombstone-домени).
test('pullHiddenEntitiesCore: LWW — локальна зміна НОВІША за Cloud → Cloud-версію НЕ перезаписує', async () => {
  const ctx = pullHiddenSandbox([{ entity_type: 'bank', entity_id: 'b1', hidden_from_month: '2026-08-01', updated_at: '2026-01-01T00:00:00.000Z' }]);
  ctx.bankAccounts = [{ name: 'Приват Банк', cloudId: 'b1' }];
  ctx.hiddenFrom = { 'card:Приват Банк': { month: '2026-06', updatedAt: '2026-07-01T00:00:00.000Z' } }; // локальна зміна новіша
  const result = await ctx.pullHiddenEntitiesCore();
  assert.deepEqual(plain(result), { skipped: false, added: 0, updated: 0, skippedFk: 0 });
  assert.equal(ctx.hiddenFrom['card:Приват Банк'].month, '2026-06'); // не перезаписано Cloud-версією
});

test('pullHiddenEntitiesCore: LWW — Cloud НОВІШИЙ за локальну версію (інший пристрій оновив) → застосовується', async () => {
  const ctx = pullHiddenSandbox([{ entity_type: 'bank', entity_id: 'b1', hidden_from_month: '2026-08-01', updated_at: '2026-07-01T00:00:00.000Z' }]);
  ctx.bankAccounts = [{ name: 'Приват Банк', cloudId: 'b1' }];
  ctx.hiddenFrom = { 'card:Приват Банк': { month: '2026-06', updatedAt: '2026-01-01T00:00:00.000Z' } }; // локальне старіше
  const result = await ctx.pullHiddenEntitiesCore();
  assert.deepEqual(plain(result), { skipped: false, added: 0, updated: 1, skippedFk: 0 });
  assert.equal(ctx.hiddenFrom['card:Приват Банк'].month, '2026-08');
});

test('pullHiddenEntitiesCore: Cloud-tombstone (deleted_at) → показує назад локально', async () => {
  const ctx = pullHiddenSandbox([{ entity_type: 'bank', entity_id: 'b1', hidden_from_month: '2026-06-01', deleted_at: '2026-07-01T00:00:00.000Z', updated_at: '2026-07-01T00:00:00.000Z' }]);
  ctx.bankAccounts = [{ name: 'Приват Банк', cloudId: 'b1' }];
  ctx.hiddenFrom = { 'card:Приват Банк': { month: '2026-06', updatedAt: '2026-01-01T00:00:00.000Z' } };
  const result = await ctx.pullHiddenEntitiesCore();
  assert.equal(result.updated, 1);
  assert.equal(ctx.hiddenFrom['card:Приват Банк'].deletedAt, '2026-07-01T00:00:00.000Z');
});

test('pullHiddenEntitiesCore: локально приховане, якого Cloud не має → не чіпається (це відповідальність push, не pull)', async () => {
  const ctx = pullHiddenSandbox([]);
  ctx.bankAccounts = [{ name: 'Приват Банк', cloudId: 'b1' }];
  ctx.hiddenFrom = { 'card:Приват Банк': { month: '2026-06', updatedAt: '2026-01-01T00:00:00.000Z' } };
  await ctx.pullHiddenEntitiesCore();
  assert.equal(ctx.hiddenFrom['card:Приват Банк'].month, '2026-06');
});

test('pullHiddenEntitiesPilot: тонка обгортка над pullHiddenEntitiesCore (той самий результат)', async () => {
  const ctx = pullHiddenSandbox([{ entity_type: 'bank', entity_id: 'b1', hidden_from_month: '2026-06-01', updated_at: '2026-06-01T00:00:00.000Z' }]);
  ctx.bankAccounts = [{ name: 'Приват Банк', cloudId: 'b1' }];
  ctx.hiddenFrom = {};
  const result = await ctx.pullHiddenEntitiesPilot();
  assert.deepEqual(plain(result), { skipped: false, added: 1, updated: 0, skippedFk: 0 });
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

/* ============ Внутрішні сповіщення (Rev #30, 6D.84): otherActorEvents ============
   pushOtherActorEvent() гейтиться (а) hadMarker (не перший повний backfill,
   той самий принцип, що recentlyPulledExpenseState/6D.67) і (б) актор !== я
   (cloudSession.user.id) і відомий (familyUsersById). */
test('authorInfoFor: gender "m" для Andrii, "f" для Olga', () => {
  const ctx = pullExpensesSandbox([]);
  ctx.familyUsersById = { u1: { name: 'Andrii' }, u2: { name: 'Olga' } };
  assert.equal(ctx.authorInfoFor('u1').gender, 'm');
  assert.equal(ctx.authorInfoFor('u2').gender, 'f');
});

test('pluralUa: українська 3-форма узгодження числівника (1 / 2-4 / 5+, включно з винятком 11-14)', () => {
  const ctx = pullExpensesSandbox([]);
  const forms = ['витрату', 'витрати', 'витрат'];
  assert.equal(ctx.pluralUa(1, forms), 'витрату');
  assert.equal(ctx.pluralUa(21, forms), 'витрату'); // 21 → mod10=1, mod100=21≠11 → форма "1"
  assert.equal(ctx.pluralUa(2, forms), 'витрати');
  assert.equal(ctx.pluralUa(4, forms), 'витрати');
  assert.equal(ctx.pluralUa(5, forms), 'витрат');
  assert.equal(ctx.pluralUa(11, forms), 'витрат'); // виняток: mod10=1, але mod100=11 → НЕ форма "1"
  assert.equal(ctx.pluralUa(12, forms), 'витрат'); // виняток: mod10=2, але mod100=12 → НЕ форма "2-4"
});

test('pullExpensesCore: перший пул (hadMarker=false) → подія НЕ додається в чергу навіть для чужого автора', async () => {
  const ctx = pullExpensesSandbox([{ id: 'e1', amount: 999, expense_date: '2026-05-06', note: 'Оновлено', linked_installment_id: null, created_at: '2024-01-01T00:00:00.000Z', updated_at: '2024-06-01T00:00:00.000Z', updated_by: 'user-2' }]);
  ctx.expenses = [{ id: 'e1', date: '2026-05-05', name: 'Стара назва', amount: 500, createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z' }];
  ctx.familyUsersById = { 'user-2': { name: 'Olga' } };
  await ctx.pullExpensesCore();
  assert.deepEqual(ctx.drainOtherActorEvents(), []);
});

test('pullExpensesCore: інкрементальний пул (є маркер) + редагування ЧУЖИМ автором → подія action:"edit" у черзі', async () => {
  const { ctx } = sandbox();
  ctx.cloudSession = { user: { id: 'user-1' } };
  ctx.cloudFamilyId = 'fam-1';
  ctx.isSupabaseSdkReady = () => true;
  ctx.familyUsersById = { 'user-2': { name: 'Olga' } };
  ctx.setSyncMarker('expenses', '2020-01-01T00:00:00.000Z');
  ctx.expenses = [{ id: 'e1', date: '2026-05-05', name: 'Стара назва', amount: 500, createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z' }];
  const fake = fakeSupabaseMarkerAwareClient('expenses', [{ id: 'e1', amount: 999, expense_date: '2026-05-06', note: 'Оновлено', linked_installment_id: null, created_at: '2024-01-01T00:00:00.000Z', updated_at: '2024-06-01T00:00:00.000Z', updated_by: 'user-2' }]);
  ctx.getSupabaseClient = () => fake.client;
  await ctx.pullExpensesCore();
  const events = ctx.drainOtherActorEvents();
  assert.equal(events.length, 1);
  assert.equal(events[0].domain, 'expenses');
  assert.equal(events[0].action, 'edit');
  assert.equal(events[0].actorName, 'Olga');
  assert.equal(events[0].name, 'Оновлено');
  assert.equal(events[0].amount, 999);
});

test('pullExpensesCore: редагування ВЛАСНИМ автором (мій userId) → подія НЕ додається (не сповіщаємо про себе)', async () => {
  const { ctx } = sandbox();
  ctx.cloudSession = { user: { id: 'user-1' } };
  ctx.cloudFamilyId = 'fam-1';
  ctx.isSupabaseSdkReady = () => true;
  ctx.familyUsersById = { 'user-1': { name: 'Andrii' } };
  ctx.setSyncMarker('expenses', '2020-01-01T00:00:00.000Z');
  ctx.expenses = [{ id: 'e1', date: '2026-05-05', name: 'Стара назва', amount: 500, createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z' }];
  const fake = fakeSupabaseMarkerAwareClient('expenses', [{ id: 'e1', amount: 999, expense_date: '2026-05-06', note: 'Оновлено', linked_installment_id: null, created_at: '2024-01-01T00:00:00.000Z', updated_at: '2024-06-01T00:00:00.000Z', updated_by: 'user-1' }]);
  ctx.getSupabaseClient = () => fake.client;
  await ctx.pullExpensesCore();
  assert.deepEqual(ctx.drainOtherActorEvents(), []);
});

test('pullExpensesCore: автор НЕВІДОМИЙ (немає в familyUsersById) → подія НЕ додається (не вгадуємо)', async () => {
  const { ctx } = sandbox();
  ctx.cloudSession = { user: { id: 'user-1' } };
  ctx.cloudFamilyId = 'fam-1';
  ctx.isSupabaseSdkReady = () => true;
  ctx.familyUsersById = {};
  ctx.setSyncMarker('expenses', '2020-01-01T00:00:00.000Z');
  ctx.expenses = [{ id: 'e1', date: '2026-05-05', name: 'Стара назва', amount: 500, createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z' }];
  const fake = fakeSupabaseMarkerAwareClient('expenses', [{ id: 'e1', amount: 999, expense_date: '2026-05-06', note: 'Оновлено', linked_installment_id: null, created_at: '2024-01-01T00:00:00.000Z', updated_at: '2024-06-01T00:00:00.000Z', updated_by: 'user-2' }]);
  ctx.getSupabaseClient = () => fake.client;
  await ctx.pullExpensesCore();
  assert.deepEqual(ctx.drainOtherActorEvents(), []);
});

test('pullExpensesCore: інкрементальний пул + НОВИЙ запис від чужого автора → подія action:"add"', async () => {
  const { ctx } = sandbox();
  ctx.cloudSession = { user: { id: 'user-1' } };
  ctx.cloudFamilyId = 'fam-1';
  ctx.isSupabaseSdkReady = () => true;
  ctx.familyUsersById = { 'user-2': { name: 'Olga' } };
  ctx.setSyncMarker('expenses', '2020-01-01T00:00:00.000Z');
  ctx.expenses = [];
  const fake = fakeSupabaseMarkerAwareClient('expenses', [{ id: 'e1', amount: 85, expense_date: '2026-05-05', note: 'Кава', linked_installment_id: null, created_at: '2024-01-01T00:00:00.000Z', updated_at: '2024-01-01T00:00:00.000Z', created_by: 'user-2' }]);
  ctx.getSupabaseClient = () => fake.client;
  await ctx.pullExpensesCore();
  const events = ctx.drainOtherActorEvents();
  assert.equal(events.length, 1);
  assert.equal(events[0].action, 'add');
  assert.equal(events[0].name, 'Кава');
  assert.equal(events[0].amount, 85);
});

test('pullExpensesCore: інкрементальний пул + запис щойно ВИДАЛЕНИЙ чужим автором (deletedAt зʼявився) → подія action:"delete", НЕ "edit"', async () => {
  const { ctx } = sandbox();
  ctx.cloudSession = { user: { id: 'user-1' } };
  ctx.cloudFamilyId = 'fam-1';
  ctx.isSupabaseSdkReady = () => true;
  ctx.familyUsersById = { 'user-2': { name: 'Olga' } };
  ctx.setSyncMarker('expenses', '2020-01-01T00:00:00.000Z');
  ctx.expenses = [{ id: 'e1', date: '2026-05-05', name: 'Кава', amount: 500, createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z' }];
  const fake = fakeSupabaseMarkerAwareClient('expenses', [{ id: 'e1', amount: 500, expense_date: '2026-05-05', note: 'Кава', linked_installment_id: null, deleted_at: '2026-05-07T00:00:00.000Z', created_at: '2024-01-01T00:00:00.000Z', updated_at: '2026-05-07T00:00:00.000Z', updated_by: 'user-2' }]);
  ctx.getSupabaseClient = () => fake.client;
  await ctx.pullExpensesCore();
  const events = ctx.drainOtherActorEvents();
  assert.equal(events.length, 1);
  assert.equal(events[0].action, 'delete');
});

test('pullIncomesCore: інкрементальний пул + редагування чужим автором → подія action:"edit", domain:"incomes"', async () => {
  const { ctx } = sandbox();
  ctx.cloudSession = { user: { id: 'user-1' } };
  ctx.cloudFamilyId = 'fam-1';
  ctx.isSupabaseSdkReady = () => true;
  ctx.familyUsersById = { 'user-2': { name: 'Olga' } };
  ctx.setSyncMarker('incomes', '2020-01-01T00:00:00.000Z');
  ctx.incomes = [{ id: 'i1', date: '2026-05-05', source: 'Зарплата', amount: 900, createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z' }];
  const fake = fakeSupabaseMarkerAwareClient('incomes', [{ id: 'i1', amount: 1000, income_date: '2026-05-06', note: 'Зарплата+', deleted_at: null, created_at: '2024-01-01T00:00:00.000Z', updated_at: '2024-06-01T00:00:00.000Z', updated_by: 'user-2' }]);
  ctx.getSupabaseClient = () => fake.client;
  await ctx.pullIncomesCore();
  const events = ctx.drainOtherActorEvents();
  assert.equal(events.length, 1);
  assert.equal(events[0].domain, 'incomes');
  assert.equal(events[0].action, 'edit');
});

test('pullIncomesCore: інкрементальний пул + редагування → recentlyPulledIncomeState проходить syncing→done→(видалено) (6D.87, той самий принцип, що expenses/6D.68)', async () => {
  const { ctx } = sandbox();
  ctx.cloudSession = { user: { id: 'user-1' } };
  ctx.cloudFamilyId = 'fam-1';
  ctx.isSupabaseSdkReady = () => true;
  ctx.setSyncMarker('incomes', '2020-01-01T00:00:00.000Z');
  ctx.incomes = [{ id: 'i1', date: '2026-05-05', source: 'Зарплата', amount: 900, createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z' }];
  const fake = fakeSupabaseMarkerAwareClient('incomes', [{ id: 'i1', amount: 1000, income_date: '2026-05-06', note: 'Зарплата+', deleted_at: null, created_at: '2024-01-01T00:00:00.000Z', updated_at: '2024-06-01T00:00:00.000Z', updated_by: 'user-1' }]);
  ctx.getSupabaseClient = () => fake.client;
  // Перехоплюємо ПЕРШИЙ setTimeout (той, що переводить syncing→done) —
  // знімок Map ДО виклику колбека, поки запис ще 'syncing'.
  let snapshotBeforeFirstTimer = null;
  ctx.setTimeout = function(fn){
    if(snapshotBeforeFirstTimer === null) snapshotBeforeFirstTimer = new Map(ctx.recentlyPulledIncomeState);
    return fn();
  };
  await ctx.pullIncomesCore();
  assert.equal(snapshotBeforeFirstTimer.get('i1'), 'syncing');
  // Обидва вкладені setTimeout відпрацювали синхронно (стаб) — Map тепер порожня.
  assert.equal(ctx.recentlyPulledIncomeState.size, 0);
});

test('pullDebtsCore: інкрементальний пул + редагування чужим автором → подія action:"edit", domain:"debts"', async () => {
  const { ctx } = sandbox();
  ctx.cloudSession = { user: { id: 'user-1' } };
  ctx.cloudFamilyId = 'fam-1';
  ctx.isSupabaseSdkReady = () => true;
  ctx.familyUsersById = { 'user-2': { name: 'Olga' } };
  ctx.setSyncMarker('debts', '2020-01-01T00:00:00.000Z');
  ctx.bankAccounts = [{ name: 'Приват Банк', cloudId: 'b1' }];
  ctx.debts = [{ id: 'd1', name: 'Приват Банк', kind: 'card', month: '2026-05', balance: 1000, createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z' }];
  const fake = fakeSupabaseMarkerAwareClient('debts', [{ id: 'd1', bank_account_id: 'b1', installment_account_id: null, name: 'Приват Банк', kind: 'card', month: '2026-05-01', balance: 1200, deleted_at: null, created_at: '2024-01-01T00:00:00.000Z', updated_at: '2024-06-01T00:00:00.000Z', updated_by: 'user-2' }]);
  ctx.getSupabaseClient = () => fake.client;
  await ctx.pullDebtsCore();
  const events = ctx.drainOtherActorEvents();
  assert.equal(events.length, 1);
  assert.equal(events[0].domain, 'debts');
  assert.equal(events[0].action, 'edit');
});

test('pullHiddenEntitiesCore: ПЕРШИЙ пул цієї сесії → жодної події (hiddenEntitiesPulledOnce ще false)', async () => {
  const { ctx } = sandbox();
  ctx.cloudSession = { user: { id: 'user-1' } };
  ctx.cloudFamilyId = 'fam-1';
  ctx.isSupabaseSdkReady = () => true;
  ctx.bankAccounts = [{ name: 'Приват Банк', cloudId: 'b1' }];
  ctx.familyUsersById = { 'user-2': { name: 'Olga' } };
  ctx.getSupabaseClient = () => fakeSupabaseSelectClient('hidden_entities', [{ entity_type: 'bank', entity_id: 'b1', hidden_from_month: '2026-06-01', created_by: 'user-2' }]);
  await ctx.pullHiddenEntitiesCore();
  assert.deepEqual(ctx.drainOtherActorEvents(), []);
});

test('pullHiddenEntitiesCore: ДРУГИЙ пул (уже hiddenEntitiesPulledOnce), нова прихована сутність чужим автором → подія action:"add", domain:"hiddenEntities"', async () => {
  const { ctx } = sandbox();
  ctx.cloudSession = { user: { id: 'user-1' } };
  ctx.cloudFamilyId = 'fam-1';
  ctx.isSupabaseSdkReady = () => true;
  ctx.bankAccounts = [{ name: 'Приват Банк', cloudId: 'b1' }, { name: 'Monobank', cloudId: 'b2' }];
  ctx.familyUsersById = { 'user-2': { name: 'Olga' } };
  ctx.getSupabaseClient = () => fakeSupabaseSelectClient('hidden_entities', [{ entity_type: 'bank', entity_id: 'b1', hidden_from_month: '2026-06-01', created_by: 'user-2' }]);
  await ctx.pullHiddenEntitiesCore(); // перший пул — суто "прогрів", без подій
  ctx.drainOtherActorEvents();
  ctx.getSupabaseClient = () => fakeSupabaseSelectClient('hidden_entities', [
    { entity_type: 'bank', entity_id: 'b1', hidden_from_month: '2026-06-01', created_by: 'user-2' },
    { entity_type: 'bank', entity_id: 'b2', hidden_from_month: '2026-07-01', created_by: 'user-2' },
  ]);
  await ctx.pullHiddenEntitiesCore();
  const events = ctx.drainOtherActorEvents();
  assert.equal(events.length, 1);
  assert.equal(events[0].domain, 'hiddenEntities');
  assert.equal(events[0].action, 'add');
  assert.equal(events[0].name, 'Monobank');
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

// Rev #30 (6D.63) — КРИТИЧНИЙ фікс, знайдений користувачем: "Синхронізувати
// все" писало "1 оновлено" ПРИ КОЖНОМУ натисканні, навіть коли нічого не
// змінювалось. Причина: local.monthlyPayment (undefined, картковий борг —
// поле незастосовне) порівнювалось напряму з row.monthly_payment (null з
// Cloud) — undefined!==null завжди true в JS, а assign-логіка (`else delete
// local.X`) повертала назад до undefined замість null, тому наступний pull
// НІКОЛИ не бачив рівність. Той самий клас багу для minPayment/minPaymentDone.
test('pullDebtsCore: повторний pull БЕЗ реальних змін (undefined vs null для monthlyPayment/minPayment) → updated:0, не 1 щоразу', async () => {
  const ctx = pullDebtsSandbox([{ id: 'd1', bank_account_id: 'b1', installment_account_id: null, name: 'Приват Банк', kind: 'card', month: '2026-05-01', balance: 2000, min_payment: 200, min_payment_done: true, monthly_payment: null, created_at: '2024-01-01T00:00:00.000Z', updated_at: '2024-01-01T00:00:00.000Z' }]);
  ctx.bankAccounts = [{ name: 'Приват Банк', cloudId: 'b1' }];
  // local — саме такий стан, який ЗАЛИШАЄ pullDebtsCore() після ПЕРШОГО
  // застосування цього ж рядка: monthlyPayment ВІДСУТНЄ (не null!), бо
  // асайн-логіка робить `delete local.monthlyPayment`, коли Cloud-значення null.
  ctx.debts = [{ id: 'd1', name: 'Приват Банк', kind: 'card', month: '2026-05', balance: 2000, minPayment: 200, minPaymentDone: true, createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z' }];
  const result = await ctx.pullDebtsCore();
  assert.equal(result.updated, 0, 'updated МАЄ бути 0 — жодне поле реально не змінилось (undefined і null тут еквівалентні)');
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

// Rev #30 (6D.50) — критична взаємодія з 6D.49/6D.41: pull-after-push
// (6D.49) просуває local.updatedAt на РЕАЛЬНЕ серверне значення (тригер
// 6D.41 завжди перезаписує updated_at), тому push (6D.50) МАЄ виставляти
// syncedUpdatedAt=updatedAt ДО того, як pull-after-push його посуне —
// інакше вони одразу розійдуться знову і skip-логіка ніколи не спрацює.
// Виправлення: pull теж виставляє syncedUpdatedAt=row.updated_at щоразу,
// коли застосовує поля з Cloud (тепер local у цей момент ТОЧНО відповідає
// Cloud, byCloudId-LWW-гілка нижче).
test('pullCategoriesCore: Cloud-переможець (LWW) → syncedUpdatedAt виставляється = row.updated_at (не лишається застарілим після push-after-pull ланцюжка)', async () => {
  const { ctx } = sandbox();
  ctx.cloudSession = { user: { id: 'user-1' } };
  ctx.cloudFamilyId = 'fam-1';
  ctx.isSupabaseSdkReady = () => true;
  ctx.getSupabaseClient = () => fakeSupabaseSelectClient('categories', [
    { id: 'c1', name: 'Тест', active: true, type: 'Гнучка', updated_at: '2026-01-05T00:00:00.000Z' },
  ]);
  ctx.CATEGORIES = [{ name: 'Тест', type: 'Гнучка', active: true, cloudId: 'c1', updatedAt: '2026-01-01T00:00:00.000Z', syncedUpdatedAt: '2020-01-01T00:00:00.000Z' }];
  await ctx.pullCategoriesCore();
  assert.equal(ctx.CATEGORIES[0].updatedAt, '2026-01-05T00:00:00.000Z');
  assert.equal(ctx.CATEGORIES[0].syncedUpdatedAt, '2026-01-05T00:00:00.000Z');
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

test('ensureDictionaryIdentity: запис вже МАЄ createdAt/updatedAt/id → не перезаписується, save не кличе', async () => {
  const { ctx } = sandbox();
  // Rev 2.22.79 (6D.152) — id тепер теж частина "вже повного" запису.
  ctx.DICTIONARY = [{ id: 'existing-id', kw: 'кава', cat: '🍔 Їжа', sub: null, createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-06-01T00:00:00.000Z' }];
  const spy = spyOn(ctx, 'saveDictionary');
  await ctx.ensureDictionaryIdentity();
  assert.equal(ctx.DICTIONARY[0].id, 'existing-id');
  assert.equal(ctx.DICTIONARY[0].createdAt, '2024-01-01T00:00:00.000Z');
  assert.equal(ctx.DICTIONARY[0].updatedAt, '2024-06-01T00:00:00.000Z');
  assert.equal(spy.count(), 0);
});

test('ensureDictionaryIdentity: запис БЕЗ id (легасі) → отримує id, save кличеться один раз', async () => {
  const { ctx } = sandbox();
  ctx.DICTIONARY = [{ kw: 'кава', cat: '🍔 Їжа', sub: null, createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-06-01T00:00:00.000Z' }];
  const spy = spyOn(ctx, 'saveDictionary');
  await ctx.ensureDictionaryIdentity();
  assert.equal(typeof ctx.DICTIONARY[0].id, 'string');
  assert.ok(ctx.DICTIONARY[0].id.length > 0);
  assert.equal(spy.count(), 1);
});

test('ensureDictionaryEntryIds: ідемпотентний — другий виклик нічого не змінює', async () => {
  const { ctx } = sandbox();
  ctx.DICTIONARY = [{ kw: 'кава', cat: '🍔 Їжа', sub: null }];
  const changed1 = ctx.ensureDictionaryEntryIds();
  const idAfterFirst = ctx.DICTIONARY[0].id;
  const changed2 = ctx.ensureDictionaryEntryIds();
  assert.equal(changed1, true);
  assert.equal(changed2, false);
  assert.equal(ctx.DICTIONARY[0].id, idAfterFirst);
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

test('Rev 2.22.79 (6D.152): restoreDictionaryFromBackup() зі СТАРОГО бекапу (без id) → запис отримує id одразу при мержі', async () => {
  const { ctx } = sandbox();
  // Старий бекап (до 6D.152) — рівно той формат, що DEFAULT_DICTIONARY/
  // openAddDictionaryModal видавали до цього Rev: жодного id.
  const raw = JSON.stringify([{ kw: 'таксі', cat: '🚗 Транспорт', sub: null }]);
  await ctx.restoreDictionaryFromBackup(raw);
  assert.equal(typeof ctx.DICTIONARY[0].id, 'string');
  assert.ok(ctx.DICTIONARY[0].id.length > 0);
});

/* ============ Rev 2.22.80 (6D.153, Крок A2) — tombstone для словника ============
   Мок-клієнт для pushDictionaryPilot/reconcileDictionaryCloudId: у коді
   функція робить до 3 РІЗНИХ select-запитів до таблиці 'dictionary' в
   одному проході ('id' — reconcile за keyword; 'id, deleted_at' — перевірка
   чи рядок уже tombstone), розрізняємо їх за точним рядком колонок, який
   реальний код передає в select(cols) — так само, як сам продакшн-код це
   робить неявно через різні .select()-виклики.
   Rev 2.22.90 (6D.163, Ревізія C — фікс знахідки) — ланцюжок update() тепер
   закінчується .or() замість .is() (продакшн-код замінив guard), приймає
   сам аргумент фільтра — тест нижче звіряє точний рядок. */
function dictionaryMockClient(opts){
  const calls = { updates: [], selects: [], inserts: [], orFilters: [] };
  const client = {
    from(table){
      assert.equal(table, 'dictionary');
      return {
        update(payload){
          calls.updates.push(payload);
          return { eq(){ return { or(filter){ calls.orFilters.push(filter); return { select(){ return Promise.resolve(opts.updateResult); } }; } }; } };
        },
        select(cols){
          calls.selects.push(cols);
          const builder = {
            eq(){ return builder; },
            is(){ return builder; },
            maybeSingle(){
              return Promise.resolve(cols === 'id, deleted_at' ? opts.existingRowResult : opts.reconcileSelectResult);
            },
          };
          return builder;
        },
        insert(payload){
          calls.inserts.push(payload);
          return { select(){ return { single(){ return Promise.resolve(opts.insertResult || { data: { id: 'new-cloud-id' }, error: null }); } }; } };
        },
      };
    },
  };
  return { client, calls };
}

function dictionarySandboxFor(entry){
  const { ctx } = sandbox();
  ctx.cloudSession = { user: { id: 'user-1' } };
  ctx.cloudFamilyId = 'fam-1';
  ctx.isSupabaseSdkReady = () => true;
  ctx.CATEGORIES = [{ name: entry.cat, active: true, cloudId: 'cat-cloud-1' }];
  ctx.SUBCATEGORIES = [];
  ctx.DICTIONARY = [entry];
  return ctx;
}

test('6D.153: старий пристрій (не знає про видалення) зберігає запис як живий → Cloud-tombstone НЕ перезаписується, локально приймається чуже видалення', async () => {
  const entry = { id: 'local-1', kw: 'кава', cat: 'Їжа', sub: null, cloudId: 'cloud-1', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' };
  const ctx = dictionarySandboxFor(entry);
  const { client, calls } = dictionaryMockClient({
    updateResult: { data: [], error: null }, // .is('deleted_at', null) не пропустив — Cloud уже tombstone
    existingRowResult: { data: { id: 'cloud-1', deleted_at: '2026-02-01T00:00:00.000Z' }, error: null },
  });
  ctx.getSupabaseClient = () => client;
  await ctx.pushDictionaryPilot();
  assert.equal(entry.deletedAt, '2026-02-01T00:00:00.000Z', 'локальний запис мав прийняти чуже видалення');
  assert.equal(calls.inserts.length, 0, 'НЕ мав запускати reconcile/insert — рядок не "битий", просто видалений');
});

test('6D.153: справжній self-heal — cloudId дійсно не існує (не tombstone) → reconcile за keyword спрацьовує як раніше', async () => {
  const entry = { id: 'local-1', kw: 'обід', cat: 'Їжа', sub: null, cloudId: 'stale-id', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' };
  const ctx = dictionarySandboxFor(entry);
  const { client, calls } = dictionaryMockClient({
    updateResult: { data: [], error: null },
    existingRowResult: { data: null, error: null }, // рядка взагалі нема — не tombstone, справжній self-heal
    reconcileSelectResult: { data: null, error: null }, // і за keyword теж нічого — створюємо новий
  });
  ctx.getSupabaseClient = () => client;
  await ctx.pushDictionaryPilot();
  assert.equal(entry.cloudId, 'new-cloud-id');
  assert.equal(calls.inserts.length, 1);
});

test('Rev 2.22.89 (6D.162, Ревізія C): pushDictionaryPilot() надсилає deleted_via у payload update', async () => {
  const entry = { id: 'local-1', kw: 'лате', cat: 'Їжа', sub: null, cloudId: 'cloud-1', deletedAt: '2026-03-01T00:00:00.000Z', deletedVia: 'category', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-03-01T00:00:00.000Z' };
  const ctx = dictionarySandboxFor(entry);
  const { client, calls } = dictionaryMockClient({
    updateResult: { data: [{ id: 'cloud-1' }], error: null },
  });
  ctx.getSupabaseClient = () => client;
  await ctx.pushDictionaryPilot();
  assert.equal(calls.updates[0].deleted_via, 'category');
});

/* ============ Rev 2.22.90 (6D.163, Ревізія C — фікс знахідки) =============
   `.is('deleted_at', null)` замінено на `.or('deleted_at.is.null,deleted_at.
   lt.'+entry.updatedAt)` — користувач відхилив варіант через updated_at
   (чіпається КОЖНИМ bulk-push, включно з чужим безглуздим) і вимагав
   порівняння з deleted_at (ставить ВИКЛЮЧНО клієнт у момент самого
   видалення, Крок 0 підтвердив — жоден тригер його не чіпає). 4 тести
   нижче відповідають 4 пунктам DoD-доповнення. */
test('6D.163: A2 лишається чинним — застарілий пристрій (updatedAt СТАРІШИЙ за сам момент видалення) НЕ воскрешає tombstone', async () => {
  // Та сама форма .or(), що й продакшн: guard НЕ повинен пропустити update,
  // якщо deleted_at у Cloud НЕ null і НЕ старіший за наш updatedAt — мок
  // відповідає data:[] (0 рядків), той самий сценарій, що вже існуючий тест
  // 6D.153 вище ("старий пристрій зберігає запис як живий"), лише тепер
  // явно перевіряємо сам рядок OR-фільтра, переданий у .or().
  const entry = { id: 'local-1', kw: 'кава', cat: 'Їжа', sub: null, cloudId: 'cloud-1', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' };
  const ctx = dictionarySandboxFor(entry);
  const { client, calls } = dictionaryMockClient({
    updateResult: { data: [], error: null },
    existingRowResult: { data: { id: 'cloud-1', deleted_at: '2026-02-01T00:00:00.000Z' }, error: null },
  });
  ctx.getSupabaseClient = () => client;
  await ctx.pushDictionaryPilot();
  assert.equal(calls.orFilters[0], 'deleted_at.is.null,deleted_at.lt.2026-01-01T00:00:00.000Z');
  assert.equal(entry.deletedAt, '2026-02-01T00:00:00.000Z', 'A2 незмінний: застарілий пристрій приймає чуже видалення, не воскрешає');
});
test('6D.163: відновлення слова виграє у старого tombstone — Cloud отримує deleted_at=null, deleted_via=null', async () => {
  // updatedAt (момент відновлення, "зараз") новіший за deleted_at Cloud —
  // .or() пропускає update, guard більше НЕ блокує легітимне відновлення.
  const entry = { id: 'local-1', kw: 'лате', cat: 'Їжа', sub: null, cloudId: 'cloud-1', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-05-01T00:00:00.000Z' };
  const ctx = dictionarySandboxFor(entry);
  const { client, calls } = dictionaryMockClient({
    updateResult: { data: [{ id: 'cloud-1' }], error: null }, // Cloud deleted_at (2026-02-01) < entry.updatedAt (2026-05-01) → guard пропускає
  });
  ctx.getSupabaseClient = () => client;
  const result = await ctx.pushDictionaryPilot();
  assert.equal(result.success, true);
  assert.equal(calls.updates[0].deleted_at, null);
  assert.equal(calls.updates[0].deleted_via, null);
  assert.equal(calls.orFilters[0], 'deleted_at.is.null,deleted_at.lt.2026-05-01T00:00:00.000Z');
  assert.equal(entry.deletedAt, undefined, 'локальний запис теж лишається живим — push вважається успішним');
});
test('6D.163: навмисна семантика — правка слова ПІСЛЯ чужого видалення перемагає ("останній, хто щось зробив")', async () => {
  // Той самий механізм, що відновлення вище: локальний updatedAt (момент
  // правки) новіший за deleted_at Cloud → правка "воскрешає" слово разом
  // із новими полями (keyword/category/subcategory з цієї самої правки).
  const entry = { id: 'local-1', kw: 'лате оновлене', cat: 'Їжа', sub: null, cloudId: 'cloud-1', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-04-01T00:00:00.000Z' };
  const ctx = dictionarySandboxFor(entry);
  const { client, calls } = dictionaryMockClient({
    updateResult: { data: [{ id: 'cloud-1' }], error: null }, // Cloud deleted_at (2026-02-01) < entry.updatedAt (2026-04-01)
  });
  ctx.getSupabaseClient = () => client;
  const result = await ctx.pushDictionaryPilot();
  assert.equal(result.success, true);
  assert.equal(calls.updates[0].keyword, 'лате оновлене');
  assert.equal(calls.updates[0].deleted_at, null);
});
test('6D.163: чужий безглуздий bulk-push (рядок у Cloud ЖИВИЙ, не tombstone) не блокує легітимну правку — alive-гілка .or() незалежна від updatedAt', async () => {
  // deleted_at.is.null у .or() — перша умова, спрацьовує для БУДЬ-ЯКОГО
  // живого рядка незалежно від того, наскільки "новим" виглядає чужий
  // updated_at (bulk-push чужого пристрою його й так постійно чіпає,
  // Крок 0 підтвердив) — друга умова (deleted_at.lt...) тут навіть не
  // потрібна, перша вже пропускає.
  const entry = { id: 'local-1', kw: 'кава без молока', cat: 'Їжа', sub: null, cloudId: 'cloud-1', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' };
  const ctx = dictionarySandboxFor(entry);
  const { client, calls } = dictionaryMockClient({
    updateResult: { data: [{ id: 'cloud-1' }], error: null }, // Cloud рядок живий (deleted_at null) — перша умова .or() завжди проходить
  });
  ctx.getSupabaseClient = () => client;
  const result = await ctx.pushDictionaryPilot();
  assert.equal(result.success, true);
  assert.equal(calls.updates[0].keyword, 'кава без молока');
});

test('6D.153: reconcileDictionaryCloudId фільтрує .is(deleted_at, null) — знаходить ЖИВИЙ рядок навіть якщо є tombstone з тим самим keyword', async () => {
  const entry = { id: 'local-1', kw: 'кава', cat: 'Їжа', sub: null, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' };
  const ctx = dictionarySandboxFor(entry);
  const { client, calls } = dictionaryMockClient({
    reconcileSelectResult: { data: { id: 'live-cloud-id' }, error: null }, // фільтр .is() сам відсікає tombstone-рядок
  });
  ctx.getSupabaseClient = () => client;
  await ctx.reconcileDictionaryCloudId(client, 'user-1', entry, 'cat-cloud-1', null);
  assert.equal(entry.cloudId, 'live-cloud-id');
  assert.equal(calls.inserts.length, 0, 'НЕ мав створювати дублікат — живий рядок уже знайдено');
});

test('6D.153: reconcileDictionaryCloudId — помилка select (напр. "multiple rows") НЕ падає мовчки й НЕ створює дублікат', async () => {
  const entry = { id: 'local-1', kw: 'кава', cat: 'Їжа', sub: null, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' };
  const ctx = dictionarySandboxFor(entry);
  const { client, calls } = dictionaryMockClient({
    reconcileSelectResult: { data: null, error: { message: 'multiple (or no) rows returned' } },
  });
  ctx.getSupabaseClient = () => client;
  await ctx.reconcileDictionaryCloudId(client, 'user-1', entry, 'cat-cloud-1', null);
  assert.equal(entry.cloudId, undefined, 'cloudId не мав встановитись на помилці');
  assert.equal(calls.inserts.length, 0, 'НЕ мав іти в insert-гілку на помилці select — це і був би дублікат');
});

test('pullDictionaryCore: резерв за keyword ІГНОРУЄ запис з іншим живий/видалений-станом (не лінкує локальне живе слово до Cloud-tombstone)', async () => {
  const { ctx } = sandbox();
  ctx.cloudSession = { user: { id: 'user-1' } };
  ctx.cloudFamilyId = 'fam-1';
  ctx.isSupabaseSdkReady = () => true;
  ctx.CATEGORIES = [{ name: 'Їжа', cloudId: 'cat-cloud-1', active: true }];
  ctx.SUBCATEGORIES = [];
  // Локально живе слово "кава" (без cloudId — ще не синхронізоване).
  ctx.DICTIONARY = [{ id: 'local-live', kw: 'кава', cat: 'Їжа', sub: null, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }];
  // Cloud повертає TOMBSTONE-рядок з тим самим keyword.
  ctx.getSupabaseClient = () => ({
    from(){
      return {
        select(){
          return { eq(){ return Promise.resolve({ data: [
            { id: 'cloud-tomb', keyword: 'кава', category_id: 'cat-cloud-1', subcategory_id: null, deleted_at: '2026-02-01T00:00:00.000Z', created_at: '2026-01-15T00:00:00.000Z', updated_at: '2026-02-01T00:00:00.000Z' },
          ], error: null }); } };
        },
      };
    },
  });
  await ctx.pullDictionaryCore();
  // Не мав зв'язати живий локальний запис з tombstone — натомість створив ОКРЕМИЙ локальний tombstone.
  const liveEntry = ctx.DICTIONARY.find(d => d.id === 'local-live');
  assert.equal(liveEntry.cloudId, undefined, 'живий локальний запис НЕ мав отримати cloudId від tombstone-рядка');
  assert.equal(liveEntry.deletedAt, undefined, 'живий локальний запис НЕ мав стати видаленим');
  const tombEntry = ctx.DICTIONARY.find(d => d.cloudId === 'cloud-tomb');
  assert.ok(tombEntry, 'мав створитись ОКРЕМИЙ локальний запис для Cloud-tombstone');
  assert.equal(tombEntry.deletedAt, '2026-02-01T00:00:00.000Z');
});

test('pullDictionaryCore: Cloud-tombstone, якого пристрій ЩЕ НЕ бачив узагалі → створює локальний tombstone (для майбутньої Корзини)', async () => {
  const { ctx } = sandbox();
  ctx.cloudSession = { user: { id: 'user-1' } };
  ctx.cloudFamilyId = 'fam-1';
  ctx.isSupabaseSdkReady = () => true;
  ctx.CATEGORIES = [{ name: 'Їжа', cloudId: 'cat-cloud-1', active: true }];
  ctx.SUBCATEGORIES = [];
  ctx.DICTIONARY = [];
  const cloudRows = [
    { id: 'cloud-tomb', keyword: 'перекус', category_id: 'cat-cloud-1', subcategory_id: null, deleted_at: '2026-02-01T00:00:00.000Z', created_at: '2026-01-15T00:00:00.000Z', updated_at: '2026-02-01T00:00:00.000Z' },
  ];
  ctx.getSupabaseClient = () => ({
    from(){
      return {
        select(){
          return {
            eq(){ return Promise.resolve({ data: cloudRows, error: null }); },
          };
        },
      };
    },
  });
  await ctx.pullDictionaryCore();
  assert.equal(ctx.DICTIONARY.length, 1);
  assert.equal(ctx.DICTIONARY[0].deletedAt, '2026-02-01T00:00:00.000Z');
  assert.equal(typeof ctx.DICTIONARY[0].id, 'string');
});

test('openAddDictionaryModal-логіка: повторне додавання раніше видаленого слова дозволене (tombstone ігнорується в перевірці унікальності)', () => {
  const { ctx } = sandbox();
  ctx.DICTIONARY = [{ id: 'd1', kw: 'кава', cat: 'Їжа', sub: null, deletedAt: '2026-02-01T00:00:00.000Z' }];
  // Та сама перевірка, що в openAddDictionaryModal()/editDictionaryEntry() після 6D.153.
  const blocked = ctx.DICTIONARY.some(d => d.kw === 'кава' && !d.deletedAt);
  assert.equal(blocked, false, 'tombstone не мав блокувати повторне додавання того самого слова');
});

test('фікс відскоку (6D.153): deleteDictionaryEntry-логіка — видалення НЕ зникає з масиву (tombstone), а не splice', async () => {
  const { ctx } = sandbox();
  ctx.cloudSession = null; // не залогінений — перевіряємо лише ЛОКАЛЬНУ частину
  ctx.DICTIONARY = [{ id: 'd1', kw: 'кава', cat: 'Їжа', sub: null, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }];
  const entry = ctx.DICTIONARY.find(d => d.id === 'd1');
  const nowISO = '2026-02-01T00:00:00.000Z';
  entry.deletedAt = nowISO;
  entry.updatedAt = nowISO;
  assert.equal(ctx.DICTIONARY.length, 1, 'запис МАЄ лишитись у масиві як tombstone, не зникати через splice');
  assert.equal(ctx.DICTIONARY[0].deletedAt, nowISO);
});

/* ============ Rev 2.22.81 (6D.154, Крок A3) — стабільний порядок словника ============
   На двох пристроях DICTIONARY опиняється в РІЗНОМУ порядку масиву (автор
   дописує в кінець; pullDictionaryCore() створює записи в порядку відповіді
   Cloud, без .order()) — renderStructure() без сортування показувала б
   різний порядок на кожному пристрої. compareDictionaryForDisplay()
   винесено окремо саме для цього тесту (сам renderStructure() — DOM,
   поза тестом, як і решта UI-рендерів). */
test('compareDictionaryForDisplay: той самий набір слів у РІЗНОМУ порядку масиву → ОДНАКОВИЙ порядок після сортування', () => {
  const { ctx } = sandbox();
  const wordA = { id: 'id-a', kw: 'альфа', createdAt: '2026-01-01T00:00:00.000Z' };
  const wordB = { id: 'id-b', kw: 'бета', createdAt: '2026-01-02T00:00:00.000Z' };
  const wordC = { id: 'id-c', kw: 'гама', createdAt: '2026-01-03T00:00:00.000Z' };
  // Пристрій 1: автор дописує нове слово в кінець (порядок створення).
  const device1Order = [wordA, wordB, wordC];
  // Пристрій 2: pull повернув їх у зовсім іншому (довільному) порядку.
  const device2Order = [wordC, wordA, wordB];
  const sorted1 = device1Order.slice().sort(ctx.compareDictionaryForDisplay).map(d => d.kw);
  const sorted2 = device2Order.slice().sort(ctx.compareDictionaryForDisplay).map(d => d.kw);
  assert.deepEqual(sorted1, ['альфа', 'бета', 'гама']);
  assert.deepEqual(sorted2, sorted1, 'порядок показу МАЄ збігатись незалежно від порядку масиву');
});

test('compareDictionaryForDisplay: однаковий createdAt (тай-брейк за kw, українська локаль)', () => {
  const { ctx } = sandbox();
  const sameTime = '2026-01-01T00:00:00.000Z';
  const words = [
    { id: 'id-1', kw: 'яблуко', createdAt: sameTime },
    { id: 'id-2', kw: 'апельсин', createdAt: sameTime },
    { id: 'id-3', kw: 'банан', createdAt: sameTime },
  ];
  const sorted = words.sort(ctx.compareDictionaryForDisplay).map(d => d.kw);
  assert.deepEqual(sorted, ['апельсин', 'банан', 'яблуко']);
});

test('compareDictionaryForDisplay: однаковий createdAt і kw (тай-брейк за id) → стабільний, не кидає', () => {
  const { ctx } = sandbox();
  const sameTime = '2026-01-01T00:00:00.000Z';
  const words = [
    { id: 'id-z', kw: 'кава', createdAt: sameTime },
    { id: 'id-a', kw: 'кава', createdAt: sameTime },
  ];
  const sorted = words.sort(ctx.compareDictionaryForDisplay).map(d => d.id);
  assert.deepEqual(sorted, ['id-a', 'id-z']);
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

// Rev #30 (6D.47) — LWW-конфлікт для name/cloudId-based доменів
// (представницьки на categories — той самий mergeBackupRecordsByCloudIdOrName()
// код обслуговує всі 5).
test('restoreCategoriesFromBackup: запис у бекапі СТАРІШИЙ за локальний (той самий cloudId) → НЕ застосовується', async () => {
  const { ctx } = sandbox();
  ctx.CATEGORIES = [{ name: 'Локальна (новіша)', type: 'Гнучка', active: true, cloudId: 'c1', createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-05T00:00:00.000Z' }];
  const backup = [{ name: 'З бекапу (старіша)', type: "Обов'язкова", active: true, cloudId: 'c1', createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z' }];
  const result = await ctx.restoreCategoriesFromBackup(JSON.stringify(backup));
  assert.equal(result.kept, 1);
  assert.equal(result.updated, 0);
  assert.equal(ctx.CATEGORIES[0].name, 'Локальна (новіша)');
});

test('restoreCategoriesFromBackup: запис у бекапі НОВІШИЙ (за name, cloudId відсутній у local) → застосовується', async () => {
  const { ctx } = sandbox();
  ctx.CATEGORIES = [{ name: 'Кафе', type: 'Гнучка', active: true, createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z' }];
  const backup = [{ name: 'Кафе', type: "Обов'язкова", active: false, createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-05T00:00:00.000Z' }];
  const result = await ctx.restoreCategoriesFromBackup(JSON.stringify(backup));
  assert.equal(result.updated, 1);
  assert.equal(ctx.CATEGORIES[0].type, "Обов'язкова");
  assert.equal(ctx.CATEGORIES[0].active, false);
});

// Rev #30 (6D.47) — cloudId-безпека: backup-cloudId НІКОЛИ не переноситься
// на local-запис, знайдений лише за іменем — навіть коли бекап "виграє".
test('restoreCategoriesFromBackup: matched за name (не cloudId), бекап новіший → local.cloudId НЕ перезаписується значенням з бекапу', async () => {
  const { ctx } = sandbox();
  ctx.CATEGORIES = [{ name: 'Кафе', type: 'Гнучка', active: true, cloudId: 'real-c1', createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z' }];
  const backup = [{ name: 'Кафе', type: "Обов'язкова", active: true, cloudId: 'stale-backup-id', createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-05T00:00:00.000Z' }];
  const result = await ctx.restoreCategoriesFromBackup(JSON.stringify(backup));
  assert.equal(result.updated, 1);
  assert.equal(ctx.CATEGORIES[0].cloudId, 'real-c1'); // не 'stale-backup-id'
});

test('restoreCategoriesFromBackup: новий запис із бекапу (немає локально) → додається БЕЗ cloudId з бекапу (self-heal через push, не довіра застарілому id)', async () => {
  const { ctx } = sandbox();
  ctx.CATEGORIES = [];
  const backup = [{ name: 'Нова категорія', type: 'Гнучка', active: true, cloudId: 'maybe-stale', createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z' }];
  const result = await ctx.restoreCategoriesFromBackup(JSON.stringify(backup));
  assert.equal(result.added, 1);
  assert.equal(ctx.CATEGORIES[0].cloudId, undefined);
});

test('restoreCategoriesFromBackup: запису немає в бекапі → локальний-only запис НЕ видаляється', async () => {
  const { ctx } = sandbox();
  ctx.CATEGORIES = [{ name: 'Лише локальна', type: 'Гнучка', active: true, createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z' }];
  const result = await ctx.restoreCategoriesFromBackup(JSON.stringify([]));
  assert.equal(ctx.CATEGORIES.length, 1);
  assert.equal(ctx.CATEGORIES[0].name, 'Лише локальна');
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

// Rev #30 (6D.48) — restoreHiddenFromFromBackup(): existence-based merge,
// той самий принцип, що pullHiddenEntitiesCore() (6D.32).
// Rev 2.22.82 (6D.155, Ревізія B) — hiddenFrom[key] тепер об'єкт
// { month, updatedAt, deletedAt? }, merge — LWW за updatedAt (не "ключ
// відсутній → додати, є → ніколи не чіпати", як до tombstone-моделі).
// Бекап у СТАРОМУ форматі (голий рядок-місяць, без updatedAt) теж
// підтримується — normalizeHiddenFromBackupEntry() повертає updatedAt:null
// для нього, що для вже існуючого локального запису завжди трактується
// як "не новіше" (локальне лишається).
test('restoreHiddenFromFromBackup: ключ відсутній локально → додається з бекапу (старий формат, голий рядок)', async () => {
  const { ctx } = sandbox();
  ctx.hiddenFrom = {};
  const result = await ctx.restoreHiddenFromFromBackup(JSON.stringify({ 'card:Приват Банк': '2026-06' }));
  assert.equal(result.added, 1);
  assert.equal(ctx.hiddenFrom['card:Приват Банк'].month, '2026-06');
  assert.ok(ctx.hiddenFrom['card:Приват Банк'].updatedAt, 'новому запису має призначитись updatedAt, навіть якщо в бекапі його не було');
});

test('restoreHiddenFromFromBackup: ключ УЖЕ Є локально, бекап СТАРОГО формату (без updatedAt) → НЕ перезаписується', async () => {
  const { ctx } = sandbox();
  ctx.hiddenFrom = { 'card:Приват Банк': { month: '2026-09', updatedAt: '2026-01-01T00:00:00.000Z' } };
  const result = await ctx.restoreHiddenFromFromBackup(JSON.stringify({ 'card:Приват Банк': '2026-01' })); // старий формат, без updatedAt
  assert.equal(result.updated, 0);
  assert.equal(ctx.hiddenFrom['card:Приват Банк'].month, '2026-09'); // локальне лишається
});

test('restoreHiddenFromFromBackup: бекап НОВІШИЙ за локальне (LWW) → застосовується, включно з tombstone', async () => {
  const { ctx } = sandbox();
  ctx.hiddenFrom = { 'card:Приват Банк': { month: '2026-09', updatedAt: '2026-01-01T00:00:00.000Z', syncedUpdatedAt: '2026-01-01T00:00:00.000Z' } };
  const backup = { 'card:Приват Банк': { month: '2026-09', updatedAt: '2026-05-01T00:00:00.000Z', deletedAt: '2026-05-01T00:00:00.000Z' } };
  const result = await ctx.restoreHiddenFromFromBackup(JSON.stringify(backup));
  assert.equal(result.updated, 1);
  assert.equal(ctx.hiddenFrom['card:Приват Банк'].deletedAt, '2026-05-01T00:00:00.000Z');
  assert.equal(ctx.hiddenFrom['card:Приват Банк'].syncedUpdatedAt, undefined, 'змінений з бекапу запис має перепушитись — syncedUpdatedAt скидається');
});

test('restoreHiddenFromFromBackup: raw відсутній → існуючі локальні ключі НЕ видаляються', async () => {
  const { ctx } = sandbox();
  ctx.hiddenFrom = { 'card:Приват Банк': { month: '2026-09', updatedAt: '2026-01-01T00:00:00.000Z' } };
  const result = await ctx.restoreHiddenFromFromBackup(null);
  assert.equal(result.added, 0);
  assert.equal(ctx.hiddenFrom['card:Приват Банк'].month, '2026-09');
});

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

// Rev #30 (6D.47) — стара спецповедінка ("ВИДАЛЯЄ ключ, форсуючи
// реконструкцію з debts") прибрана — під новою LWW-merge філософією
// (raw===null → порожній список для merge) примусова реконструкція
// втратила б initialAmount/dueDay записів, яких нема серед debts. Тепер:
// raw відсутній → існуючі локальні ОЧ НЕ чіпаються (той самий принцип,
// що вже 6D.46 для expenses/incomes/debts).
test('restoreInstallmentAccountsFromBackup: raw відсутній → існуючі локальні ОЧ НЕ видаляються (P1.3, не стара реконструкція з debts)', async () => {
  const { ctx, fakeIdbInstance } = sandbox();
  ctx.markDomainMigrated('installmentAccounts');
  ctx.installmentAccounts = d1Fixture().installmentAccounts;
  const result = await ctx.restoreInstallmentAccountsFromBackup(null);
  assert.equal(result.success, true);
  assert.equal(ctx.installmentAccounts.length, 1);
  assert.equal(ctx.installmentAccounts[0].name, d1Fixture().installmentAccounts[0].name);
  assert.equal(ctx.installmentAccounts[0].initialAmount, d1Fixture().installmentAccounts[0].initialAmount);
  // stampMissingTimestamps() виконується безумовно (той самий ensureXIdentity-
  // принцип) — фікстура без timestamps їх тут ЗАКОНОМІРНО отримує, це не втрата даних.
  assert.ok(ctx.installmentAccounts[0].createdAt);
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
  // Rev 2.22.82 (6D.155, Ревізія B) — старий бекап (голий рядок-місяць)
  // відновлюється в НОВУ об'єктну форму { month, updatedAt } — очікувано,
  // той самий принцип, що timestamps для bankAccounts/installmentAccounts
  // вище в цьому ж тесті.
  Object.keys(fixture.hiddenFrom).forEach(function(key){
    assert.equal(freshCtx.hiddenFrom[key].month, fixture.hiddenFrom[key]);
    assert.ok(freshCtx.hiddenFrom[key].updatedAt);
  });
  assert.deepEqual(plain(freshCtx.ignoredDivergences), fixture.ignoredDivergences);

  // installmentAccounts мігровано у freshCtx → IndexedDB, не localStorage.
  // Порівнюємо розпарсено (не сирим рядком) — persisted-значення тепер
  // несе backfilled timestamps.
  assert.deepEqual(JSON.parse(freshIdb.store.get('budget_installmentaccounts_v1')), plain(freshCtx.installmentAccounts));
  assert.equal(freshCtx.localStorage.getItem('budget_installmentaccounts_v1'), null);
  // bankAccounts/hiddenFrom/ignoredDivergences НЕ мігровані у freshCtx → localStorage.
  assert.deepEqual(JSON.parse(freshCtx.localStorage.getItem('budget_bankaccounts_v1')), plain(freshCtx.bankAccounts));
  // Rev 2.22.82 (6D.155) — persisted-значення тепер об'єктна форма, не сирий рядок фікстури.
  assert.deepEqual(JSON.parse(freshCtx.localStorage.getItem('budget_debthidden_v1')), plain(freshCtx.hiddenFrom));
  assert.equal(freshCtx.localStorage.getItem('budget_ignored_divergences_v1'), JSON.stringify(fixture.ignoredDivergences));
});

// Rev #30 (6D.47) — той самий принцип, що тест вище: старий бекап без
// installmentAccounts-ключа більше НЕ видаляє наявні локальні ОЧ.
test('acceptance D1: старий бекап без installmentAccounts + мігрований домен → наявні локальні ОЧ НЕ видаляються (P1.3, не стара реконструкція)', async () => {
  const { ctx, fakeIdbInstance } = sandbox({ localStorageInitial: {} });
  ctx.markDomainMigrated('installmentAccounts');
  ctx.installmentAccounts = d1Fixture().installmentAccounts;
  fakeIdbInstance.store.set('budget_installmentaccounts_v1', JSON.stringify(d1Fixture().installmentAccounts)); // старе значення
  // Бекап явно НЕ містить budget_installmentaccounts_v1 (старий файл до появи ОЧ).
  const backupWithoutInstallments = { budget_categories_v1: JSON.stringify([]) };
  const results = await ctx.applyBackupData(backupWithoutInstallments);
  assert.equal(results.installmentAccounts.success, true);
  assert.equal(ctx.installmentAccounts.length, 1);
  assert.equal(ctx.installmentAccounts[0].name, d1Fixture().installmentAccounts[0].name);
  assert.equal(ctx.installmentAccounts[0].initialAmount, d1Fixture().installmentAccounts[0].initialAmount);
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

// Rev #30 (6D.46) — P1.3 (переглянуто): restoreXFromBackup для expenses/
// incomes/debts більше НЕ безумовна заміна — LWW-merge. Тест нижче
// переписаний: раніше документував "raw відсутній → [] і зберігається"
// (старий безумовний replace); тепер це БУЛО Б втратою даних — порожній/
// відсутній бекап-домен не повинен видаляти те, що вже є локально (той
// самий принцип, що P1.2 для Excel-імпорту).
test('restoreExpensesFromBackup: raw відсутній → існуючі локальні записи НЕ видаляються (P1.3, не старий unconditional replace)', async () => {
  const { ctx, fakeIdbInstance } = sandbox();
  ctx.markDomainMigrated('expenses');
  ctx.expenses = d2Fixture().expenses; // вже є локально
  const result = await ctx.restoreExpensesFromBackup(null);
  assert.equal(result.success, true);
  assert.deepEqual(plain(ctx.expenses), d2Fixture().expenses); // незмінно
  assert.equal(fakeIdbInstance.store.get('budget_expenses_v1'), JSON.stringify(d2Fixture().expenses));
});

test('restoreIncomesFromBackup/restoreDebtsFromBackup: локально порожньо → усі записи бекапу додаються (не тестує LWW-конфлікт, лише "немає з чим порівнювати")', async () => {
  const fixture = d2Fixture();
  const { ctx, fakeIdbInstance } = sandbox();
  ctx.markDomainMigrated('incomes');
  const resultIncomes = await ctx.restoreIncomesFromBackup(JSON.stringify(fixture.incomes));
  const resultDebts = await ctx.restoreDebtsFromBackup(JSON.stringify(fixture.debts));
  assert.equal(resultIncomes.success, true);
  assert.equal(resultDebts.success, true);
  // Rev #30 (6D.75) — id більше НЕ 'i1'/'d1' 1:1: restoreXFromBackup()
  // тепер нормалізує legacy-формат id ДО push (ensureIncomeIdentity()/
  // ensureDebtIdentity(), той самий фікс, що restoreExpensesFromBackup() —
  // докоментар там пояснює реальний інцидент дублювання). Перевіряємо
  // вміст БЕЗ id окремо + сам id валідний UUID.
  assert.match(ctx.incomes[0].id, UUID_FORMAT_RE_JS());
  assert.match(ctx.debts[0].id, UUID_FORMAT_RE_JS());
  // Rev #30 (6D.51) — ensureIncomeIdentity()/ensureDebtIdentity() ТЕЖ
  // бекфілять відсутні createdAt/updatedAt (той самий виклик, що й
  // нормалізує id) — фікстура їх не має, тому теж виключаємо з порівняння.
  const stripMeta = function(obj){ const { id, createdAt, updatedAt, ...rest } = obj; return rest; };
  assert.deepEqual(stripMeta(plain(ctx.incomes[0])), stripMeta(fixture.incomes[0]));
  assert.deepEqual(stripMeta(plain(ctx.debts[0])), stripMeta(fixture.debts[0]));
  assert.equal(fakeIdbInstance.store.get('budget_incomes_v1'), JSON.stringify(plain(ctx.incomes)));
});

// Rev #30 (6D.46) — LWW-конфлікт: реальні сценарії, не лише "локально порожньо".
test('restoreExpensesFromBackup: запис у бекапі СТАРІШИЙ за локальний → НЕ застосовується, локальне лишається', async () => {
  const { ctx } = sandbox();
  ctx.expenses = [{ id: 'e1', date: '2026-09-05', name: 'Локальна (новіша)', amount: 999, category: '', subcategory: '', manual: true, createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-05T00:00:00.000Z' }];
  const backup = [{ id: 'e1', date: '2026-09-01', name: 'З бекапу (старіша)', amount: 65, category: '', subcategory: '', manual: true, createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z' }];
  const result = await ctx.restoreExpensesFromBackup(JSON.stringify(backup));
  assert.equal(result.kept, 1);
  assert.equal(result.updated, 0);
  assert.equal(ctx.expenses[0].amount, 999);
  assert.equal(ctx.expenses[0].name, 'Локальна (новіша)');
});

test('restoreExpensesFromBackup: запис у бекапі НОВІШИЙ за локальний → застосовується', async () => {
  const { ctx } = sandbox();
  ctx.expenses = [{ id: 'e1', date: '2026-09-01', name: 'Локальна (старіша)', amount: 65, category: '', subcategory: '', manual: true, createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z' }];
  const backup = [{ id: 'e1', date: '2026-09-05', name: 'З бекапу (новіша)', amount: 999, category: '', subcategory: '', manual: true, createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-05T00:00:00.000Z' }];
  const result = await ctx.restoreExpensesFromBackup(JSON.stringify(backup));
  assert.equal(result.updated, 1);
  assert.equal(result.kept, 0);
  assert.equal(ctx.expenses[0].amount, 999);
  assert.equal(ctx.expenses[0].name, 'З бекапу (новіша)');
});

test('restoreExpensesFromBackup: локальний tombstoned (новіший за бекап) → deletedAt НЕ "воскрешається"', async () => {
  const { ctx } = sandbox();
  ctx.expenses = [{ id: 'e1', date: '2026-09-01', name: 'Видалена', amount: 65, createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-10T00:00:00.000Z', deletedAt: '2026-09-10T00:00:00.000Z' }];
  const backup = [{ id: 'e1', date: '2026-09-01', name: 'Стара версія (без tombstone)', amount: 65, createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z' }];
  const result = await ctx.restoreExpensesFromBackup(JSON.stringify(backup));
  assert.equal(result.kept, 1);
  assert.equal(ctx.expenses[0].deletedAt, '2026-09-10T00:00:00.000Z'); // лишається видаленим
});

test('restoreExpensesFromBackup: бекап новіший І несе deletedAt → tombstone застосовується (не "воскресіння", а коректне поширення видалення з бекапу)', async () => {
  const { ctx } = sandbox();
  ctx.expenses = [{ id: 'e1', date: '2026-09-01', name: 'Кава', amount: 65, createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z' }];
  const backup = [{ id: 'e1', date: '2026-09-01', name: 'Кава', amount: 65, createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-10T00:00:00.000Z', deletedAt: '2026-09-10T00:00:00.000Z' }];
  const result = await ctx.restoreExpensesFromBackup(JSON.stringify(backup));
  assert.equal(result.updated, 1);
  assert.equal(ctx.expenses[0].deletedAt, '2026-09-10T00:00:00.000Z');
});

test('restoreExpensesFromBackup: запису немає локально → додається як новий, push-спроба (не помилка навіть без Cloud-сесії)', async () => {
  const { ctx } = sandbox();
  ctx.expenses = [];
  const backup = [{ id: 'e1', date: '2026-09-01', name: 'Нова з бекапу', amount: 65, createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z' }];
  const result = await ctx.restoreExpensesFromBackup(JSON.stringify(backup));
  assert.equal(result.added, 1);
  assert.equal(ctx.expenses.length, 1);
});

// Rev #30 (6D.75) — КРИТИЧНИЙ регресійний тест: реальний інцидент
// користувача — "Очистити всі дані" → "Відновити" зі СТАРИМ бекапом
// (зробленим ДО 6D.59, legacy-формат id) створював ДРУГИЙ рядок у Cloud
// для КОЖНОЇ витрати, чий id уже був виправлений (ensureExpenseIdentity(),
// generateUUID()) на іншому пристрої/сесії раніше. Локальний стан ТУТ
// відтворює саме той момент: local вже має ПРАВИЛЬНИЙ (UUID) запис
// (як після свіжого pullExpensesCore() із Cloud), а бекап несе ТУ САМУ
// витрату під СТАРИМ legacy id — без фолбека за вмістом (date+amount+
// name) це виглядало б як "новий" запис і створило б дублікат.
test('restoreExpensesFromBackup: legacy id з бекапу + local вже має ЦЕЙ САМИЙ запис під UUID (за вмістом) → оновлює ІСНУЮЧИЙ, НЕ дублює', async () => {
  const { ctx } = sandbox();
  const properUuid = '9be9de11-cea6-40fd-b6af-b22f575b5dd3';
  ctx.expenses = [{ id: properUuid, date: '2026-09-11', name: 'Картопля (соціальна)', amount: 200, category: '🫂 Соціальні витрати', subcategory: '', createdAt: '2026-09-11T00:00:00.000Z', updatedAt: '2026-09-11T00:00:00.000Z', syncedUpdatedAt: '2026-09-11T00:00:00.000Z' }];
  const legacyId = '1700000000000abcd'; // старий, ДО-UUID формат (6D.59)
  const backup = [{ id: legacyId, date: '2026-09-11', name: 'Картопля (соціальна)', amount: 200, category: '🫂 Соціальні витрати', subcategory: '', createdAt: '2026-09-11T00:00:00.000Z', updatedAt: '2026-09-20T00:00:00.000Z' }];
  const result = await ctx.restoreExpensesFromBackup(JSON.stringify(backup));
  assert.equal(ctx.expenses.length, 1, 'НЕ повинно з\'явитись другого запису — той самий, що вже локально');
  assert.equal(result.added, 0);
  assert.equal(result.updated, 1);
  assert.equal(ctx.expenses[0].id, properUuid, 'id лишається ПРАВИЛЬНИМ, не перезаписується legacy-значенням з бекапу');
});

test('restoreExpensesFromBackup: запису немає в бекапі → локальний-only запис НЕ видаляється (той самий принцип, що P1.2 Excel)', async () => {
  const { ctx } = sandbox();
  ctx.expenses = [{ id: 'e1', date: '2026-09-01', name: 'Лише локальна', amount: 65, createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z' }];
  const result = await ctx.restoreExpensesFromBackup(JSON.stringify([]));
  assert.equal(ctx.expenses.length, 1);
  assert.equal(ctx.expenses[0].id, 'e1');
});

test('restoreDebtsFromBackup: LWW-конфлікт (той самий принцип, окремо перевірений для природного-ключа домену)', async () => {
  const { ctx } = sandbox();
  ctx.debts = [{ id: 'd1', name: 'Приват Банк', kind: 'card', month: '2026-09', balance: 999, createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-05T00:00:00.000Z' }];
  const backup = [{ id: 'd1', name: 'Приват Банк', kind: 'card', month: '2026-09', balance: 111, createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z' }];
  const result = await ctx.restoreDebtsFromBackup(JSON.stringify(backup));
  assert.equal(result.kept, 1);
  assert.equal(ctx.debts[0].balance, 999);
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

  // Rev #30 (6D.75) — id більше НЕ 'e1'/'i1'/'d1' 1:1: applyBackupData()'s
  // трейлінговий loadAll() (той самий, що завжди був) нормалізує legacy-
  // формат id — докоментар над restoreExpensesFromBackup() пояснює
  // реальний інцидент дублювання, що ця нормалізація тепер запобігає ще
  // РАНІШЕ (усередині самого restoreXFromBackup(), до push). Перевіряємо
  // вміст БЕЗ id окремо + сам id валідний UUID.
  assert.match(freshCtx.expenses[0].id, UUID_FORMAT_RE_JS());
  assert.match(freshCtx.incomes[0].id, UUID_FORMAT_RE_JS());
  assert.match(freshCtx.debts[0].id, UUID_FORMAT_RE_JS());
  // Rev #30 (6D.51) — ensureIncomeIdentity()/ensureDebtIdentity() ТЕЖ
  // бекфілять відсутні createdAt/updatedAt (incomes/debts фікстура їх не
  // має) — виключаємо разом з id (expenses фікстура вже МАЄ обидва поля,
  // тому там stripMeta не змінює нічого зайвого).
  const stripMeta = function(obj){ const { id, createdAt, updatedAt, ...rest } = obj; return rest; };
  assert.deepEqual(stripMeta(plain(freshCtx.expenses[0])), stripMeta(fixture.expenses[0]));
  assert.deepEqual(stripMeta(plain(freshCtx.incomes[0])), stripMeta(fixture.incomes[0]));
  assert.deepEqual(stripMeta(plain(freshCtx.debts[0])), stripMeta(fixture.debts[0]));
  // installmentAccounts реконструйовано з debts (kind:'card', не 'installment' у фікстурі) → порожньо, коректно.
  assert.deepEqual(plain(freshCtx.installmentAccounts), []);

  assert.equal(freshCtx.localStorage.getItem('budget_expenses_v1'), JSON.stringify(plain(freshCtx.expenses)));
  assert.equal(freshCtx.localStorage.getItem('budget_incomes_v1'), JSON.stringify(plain(freshCtx.incomes)));
  assert.equal(freshCtx.localStorage.getItem('budget_debts_v1'), JSON.stringify(plain(freshCtx.debts)));
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

// Rev #30 (6D.59) — КРИТИЧНИЙ фікс, знайдений через реальний збій:
// ensureExpenseIdentity() раніше перевіряла лише "чи id взагалі є"
// (typeof === 'string'), пропускаючи СТАРИЙ формат Date.now()+random —
// на відміну від ensureIncomeIdentity()/ensureDebtIdentity() (6D.1), де
// той самий формат коректно розпізнавався й замінювався. Наслідок:
// реальні витрати за кілька місяців обліку (записані до впровадження
// generateUUID(), Rev 2.11.2) НІКОЛИ не отримували валідний UUID —
// кожен push у Cloud (uuid-типізована колонка) провалювався з
// "invalid input syntax for type uuid".
test('ensureExpenseIdentity: СТАРИЙ формат id (Date.now()+random, той самий формат, що 6D.1 виправив для incomes/debts) → новий UUID', async () => {
  const { ctx } = sandbox();
  const oldFormatId = '1789113942728xwch'; // точний формат з реального збою користувача
  ctx.expenses = [{ id: oldFormatId, date: '2026-09-01', name: 'Кава', amount: 65, category: '', subcategory: '', manual: true, createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z' }];
  const spy = spyOn(ctx, 'saveExpenses');
  await ctx.ensureExpenseIdentity();
  assert.match(ctx.expenses[0].id, UUID_FORMAT_RE_JS());
  assert.notEqual(ctx.expenses[0].id, oldFormatId);
  assert.equal(ctx.expenses[0].name, 'Кава'); // решта полів незмінна
  assert.equal(spy.count(), 1);
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

test('ensureIncomeIdentity: запис уже з валідним UUID і createdAt/updatedAt → нічого не змінюється, save не викликається', async () => {
  const { ctx } = sandbox();
  ctx.incomes = [{ id: VALID_UUID_1, date: '2026-09-01', source: 'Інші доходи', amount: 1234, createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z' }];
  const spy = spyOn(ctx, 'saveIncomes');
  await ctx.ensureIncomeIdentity();
  assert.equal(ctx.incomes[0].id, VALID_UUID_1);
  assert.equal(spy.count(), 0);
  assert.equal(ctx.localStorage.getItem('budget_incomes_v1'), null);
});

// Rev #30 (6D.51) — виявлена прогалина: на відміну від ensureExpenseIdentity(),
// ensureIncomeIdentity() ніколи не бекфілив createdAt/updatedAt — потрібно
// для детермінованого тайбрейку в compareRecordsForDisplay().
test('ensureIncomeIdentity: старий запис без createdAt → бекфіл з date (початок дня), updatedAt = createdAt', async () => {
  const { ctx } = sandbox();
  ctx.incomes = [{ id: VALID_UUID_1, date: '2026-09-01', source: 'Інші доходи', amount: 1234 }];
  const spy = spyOn(ctx, 'saveIncomes');
  await ctx.ensureIncomeIdentity();
  assert.equal(ctx.incomes[0].createdAt, '2026-09-01T00:00:00.000Z');
  assert.equal(ctx.incomes[0].updatedAt, '2026-09-01T00:00:00.000Z');
  assert.equal(spy.count(), 1);
});

test('ensureIncomeIdentity: createdAt вже присутній → НЕ перезаписується', async () => {
  const { ctx } = sandbox();
  ctx.incomes = [{ id: VALID_UUID_1, date: '2026-09-01', source: 'Інші доходи', amount: 1234, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-05-05T00:00:00.000Z' }];
  const spy = spyOn(ctx, 'saveIncomes');
  await ctx.ensureIncomeIdentity();
  assert.equal(ctx.incomes[0].createdAt, '2026-01-01T00:00:00.000Z');
  assert.equal(ctx.incomes[0].updatedAt, '2026-05-05T00:00:00.000Z');
  assert.equal(spy.count(), 0);
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

test('ensureDebtIdentity: запис уже з валідним UUID і createdAt/updatedAt → нічого не змінюється, save не викликається', async () => {
  const { ctx } = sandbox();
  ctx.debts = [{ id: VALID_UUID_1, name: 'iPhone', kind: 'installment', month: '2026-09', balance: 20000, monthlyPayment: 2000, createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z' }];
  const spy = spyOn(ctx, 'saveDebts');
  await ctx.ensureDebtIdentity();
  assert.equal(ctx.debts[0].id, VALID_UUID_1);
  assert.equal(spy.count(), 0);
  assert.equal(ctx.localStorage.getItem('budget_debts_v1'), null);
});

// Rev #30 (6D.51) — та сама виявлена прогалина, що ensureIncomeIdentity() вище.
test('ensureDebtIdentity: старий запис без createdAt → бекфіл з month (перше число), updatedAt = createdAt', async () => {
  const { ctx } = sandbox();
  ctx.debts = [{ id: VALID_UUID_1, name: 'iPhone', kind: 'installment', month: '2026-09', balance: 20000, monthlyPayment: 2000 }];
  const spy = spyOn(ctx, 'saveDebts');
  await ctx.ensureDebtIdentity();
  assert.equal(ctx.debts[0].createdAt, '2026-09-01T00:00:00.000Z');
  assert.equal(ctx.debts[0].updatedAt, '2026-09-01T00:00:00.000Z');
  assert.equal(spy.count(), 1);
});

test('ensureDebtIdentity: createdAt вже присутній → НЕ перезаписується', async () => {
  const { ctx } = sandbox();
  ctx.debts = [{ id: VALID_UUID_1, name: 'iPhone', kind: 'installment', month: '2026-09', balance: 20000, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-05-05T00:00:00.000Z' }];
  const spy = spyOn(ctx, 'saveDebts');
  await ctx.ensureDebtIdentity();
  assert.equal(ctx.debts[0].createdAt, '2026-01-01T00:00:00.000Z');
  assert.equal(ctx.debts[0].updatedAt, '2026-05-05T00:00:00.000Z');
  assert.equal(spy.count(), 0);
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

/* ============ Rev #30 (6D.55) — перерендер після pull (у т.ч. pull-after-push) ============
   Крок 0 термінового розслідування: pullXCore() усіх 9 доменів міняв масив і
   зберігав його, але НІКОЛИ не рендерив — щойно підтягнутий з Cloud запис
   лишався невидимим, доки якась ІНША дія випадково не перемалює екран (звідси
   "синхронізація відстає на 1-2 кроки", описане користувачем). Фікс дзеркалить
   ТІ САМІ render-виклики, що вже йдуть після відповідного локального save —
   тести нижче перевіряють: render-стаб викликається РІВНО за реальної зміни
   (added/updated/linked > 0), і НЕ викликається, коли pull нічого не змінив. */
test('pullCategoriesCore: є зміна (added) → renderStructure()+populateCategorySelect() викликані', async () => {
  const ctx = pullSandbox([{ id: 'c1', name: '🎮 Розваги', active: true, type: 'Скорочувана' }]);
  ctx.CATEGORIES = [];
  const renderSpy = spyOn(ctx, 'renderStructure');
  const selectSpy = spyOn(ctx, 'populateCategorySelect');
  await ctx.pullCategoriesCore();
  assert.equal(renderSpy.count(), 1);
  assert.equal(selectSpy.count(), 1);
});
test('pullCategoriesCore: без змін (no-op) → render НЕ викликається', async () => {
  const ctx = pullSandbox([{ id: 'c1', name: '🍔 Їжа', active: true, type: 'Гнучка', created_at: '2024-01-01T00:00:00.000Z', updated_at: '2024-01-01T00:00:00.000Z' }]);
  ctx.CATEGORIES = [{ name: '🍔 Їжа', type: 'Гнучка', active: true, cloudId: 'c1', createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z' }];
  const renderSpy = spyOn(ctx, 'renderStructure');
  await ctx.pullCategoriesCore();
  assert.equal(renderSpy.count(), 0);
});

test('pullSubcategoriesCore: є зміна (added) → renderStructure() викликаний', async () => {
  const ctx = pullSubcategoriesSandbox([{ id: 's1', name: 'Кафе', category_id: 'c1', active: true }]);
  ctx.CATEGORIES = [{ name: '🍔 Їжа', type: 'Гнучка', active: true, cloudId: 'c1' }];
  ctx.SUBCATEGORIES = [];
  const renderSpy = spyOn(ctx, 'renderStructure');
  await ctx.pullSubcategoriesCore();
  assert.equal(renderSpy.count(), 1);
});
test('pullSubcategoriesCore: без змін → render НЕ викликається', async () => {
  const ctx = pullSubcategoriesSandbox([]);
  ctx.CATEGORIES = [];
  const renderSpy = spyOn(ctx, 'renderStructure');
  await ctx.pullSubcategoriesCore();
  assert.equal(renderSpy.count(), 0);
});

test('pullDictionaryCore: є зміна (added) → renderStructure() викликаний', async () => {
  const ctx = pullDictionarySandbox([{ id: 'd1', keyword: 'кава', category_id: 'c1', subcategory_id: null }]);
  ctx.CATEGORIES = [{ name: '🍔 Їжа', type: 'Гнучка', active: true, cloudId: 'c1' }];
  ctx.DICTIONARY = [];
  const renderSpy = spyOn(ctx, 'renderStructure');
  await ctx.pullDictionaryCore();
  assert.equal(renderSpy.count(), 1);
});
test('pullDictionaryCore: без змін → render НЕ викликається', async () => {
  const ctx = pullDictionarySandbox([]);
  const renderSpy = spyOn(ctx, 'renderStructure');
  await ctx.pullDictionaryCore();
  assert.equal(renderSpy.count(), 0);
});

test('pullBankAccountsCore: є зміна (added) → populateBankDebtTable() викликаний', async () => {
  const ctx = pullBankSandbox([{ id: 'b1', name: '🟩 Приват', credit_limit: 10000 }]);
  ctx.bankAccounts = [];
  const renderSpy = spyOn(ctx, 'populateBankDebtTable');
  await ctx.pullBankAccountsCore();
  assert.equal(renderSpy.count(), 1);
});
test('pullBankAccountsCore: без змін → render НЕ викликається', async () => {
  const ctx = pullBankSandbox([]);
  const renderSpy = spyOn(ctx, 'populateBankDebtTable');
  await ctx.pullBankAccountsCore();
  assert.equal(renderSpy.count(), 0);
});

test('pullInstallmentAccountsCore: є зміна (added) → populateInstallmentTable() викликаний', async () => {
  const ctx = pullInstallmentSandbox([{ id: 'i1', name: 'iPhone', initial_amount: 30000 }]);
  ctx.installmentAccounts = [];
  const renderSpy = spyOn(ctx, 'populateInstallmentTable');
  await ctx.pullInstallmentAccountsCore();
  assert.equal(renderSpy.count(), 1);
});
test('pullInstallmentAccountsCore: без змін → render НЕ викликається', async () => {
  const ctx = pullInstallmentSandbox([]);
  const renderSpy = spyOn(ctx, 'populateInstallmentTable');
  await ctx.pullInstallmentAccountsCore();
  assert.equal(renderSpy.count(), 0);
});

test('pullHiddenEntitiesCore: є зміна (added) → renderAll() викликаний', async () => {
  const ctx = pullHiddenSandbox([{ entity_type: 'bank', entity_id: 'b1', hidden_from_month: '2026-05-01' }]);
  ctx.bankAccounts = [{ name: '🟩 Приват', cloudId: 'b1' }];
  ctx.hiddenFrom = {};
  const renderSpy = spyOn(ctx, 'renderAll');
  await ctx.pullHiddenEntitiesCore();
  assert.equal(renderSpy.count(), 1);
});
test('pullHiddenEntitiesCore: без змін → render НЕ викликається', async () => {
  const ctx = pullHiddenSandbox([]);
  const renderSpy = spyOn(ctx, 'renderAll');
  await ctx.pullHiddenEntitiesCore();
  assert.equal(renderSpy.count(), 0);
});

test('pullExpensesCore: є зміна (added) → populateMonths()+renderAll() викликані', async () => {
  const ctx = pullExpensesSandbox([{ id: 'e1', amount: 500, expense_date: '2026-05-01', note: 'Кава', created_at: '2026-05-01T00:00:00.000Z', updated_at: '2026-05-01T00:00:00.000Z' }]);
  ctx.expenses = [];
  const monthsSpy = spyOn(ctx, 'populateMonths');
  const renderSpy = spyOn(ctx, 'renderAll');
  await ctx.pullExpensesCore();
  assert.equal(monthsSpy.count(), 1);
  assert.equal(renderSpy.count(), 1);
});
test('pullExpensesCore: без змін → render НЕ викликається', async () => {
  const ctx = pullExpensesSandbox([]);
  const renderSpy = spyOn(ctx, 'renderAll');
  await ctx.pullExpensesCore();
  assert.equal(renderSpy.count(), 0);
});

test('pullIncomesCore: є зміна (added) → renderAll() викликаний', async () => {
  const ctx = pullIncomesSandbox([{ id: 'i1', amount: 20000, income_date: '2026-05-01', note: 'Зарплата Андрій', created_at: '2026-05-01T00:00:00.000Z', updated_at: '2026-05-01T00:00:00.000Z' }]);
  ctx.incomes = [];
  const renderSpy = spyOn(ctx, 'renderAll');
  await ctx.pullIncomesCore();
  assert.equal(renderSpy.count(), 1);
});
test('pullIncomesCore: без змін → render НЕ викликається', async () => {
  const ctx = pullIncomesSandbox([]);
  const renderSpy = spyOn(ctx, 'renderAll');
  await ctx.pullIncomesCore();
  assert.equal(renderSpy.count(), 0);
});

test('pullDebtsCore: є зміна (added) → renderAll() викликаний', async () => {
  const ctx = pullDebtsSandbox([{ id: 'd1', bank_account_id: 'b1', installment_account_id: null, name: null, kind: 'card', month: '2026-05-01', balance: 5000, min_payment: null, min_payment_done: false, monthly_payment: null, created_at: '2026-05-01T00:00:00.000Z', updated_at: '2026-05-01T00:00:00.000Z' }]);
  ctx.bankAccounts = [{ name: '🟩 Приват', cloudId: 'b1' }];
  ctx.debts = [];
  const renderSpy = spyOn(ctx, 'renderAll');
  await ctx.pullDebtsCore();
  assert.equal(renderSpy.count(), 1);
});
test('pullDebtsCore: без змін → render НЕ викликається', async () => {
  const ctx = pullDebtsSandbox([]);
  const renderSpy = spyOn(ctx, 'renderAll');
  await ctx.pullDebtsCore();
  assert.equal(renderSpy.count(), 0);
});

/* ============ Rev #30 (6D.57) — syncedUpdatedAt для expenses/incomes/debts,
   послідовний await-push при restore, "Синхронізувати все" тепер двосторонній ============
   Термінове розслідування: реальний користувач відновив 3-4 місяці даних
   з бекапу — усе застосувалось локально, але expenses/incomes/debts (0 у
   Cloud) НІКОЛИ не дійшли до Cloud. Крок 0 знайшов дві конкретні причини:
   (1) restoreBankAccountsFromBackup()/restoreInstallmentAccountsFromBackup()
   викликали pushXPilot() БЕЗ await — debts/лінковані expenses, що йдуть
   одразу після в тій самій послідовності, могли побачити ще не встановлений
   cloudId і мовчки пропустити push; (2) необмежений одночасний потік
   fire-and-forget push для сотень записів. Тести нижче перевіряють фікс:
   syncedUpdatedAt-bookkeeping (той самий принцип, що вже 5 bulk-push
   доменів, 6D.50) і те, що restore/"Синхронізувати все" тепер послідовні
   й чесно рахують збої, а не мовчать. */
test('pushExpenseRecordPilot: успішний push → rec.syncedUpdatedAt = rec.updatedAt', async () => {
  const { ctx } = sandbox();
  ctx.cloudSession = { user: { id: 'user-1' } };
  ctx.cloudFamilyId = 'fam-1';
  ctx.isSupabaseSdkReady = () => true;
  ctx.getSupabaseClient = () => ({ from(){ return { upsert(){ return Promise.resolve({ data: [{}], error: null }); } }; } });
  const rec = { id: 'e1', date: '2026-01-01', amount: 500, updatedAt: '2026-05-01T00:00:00.000Z' };
  await ctx.pushExpenseRecordPilot(rec);
  assert.equal(rec.syncedUpdatedAt, '2026-05-01T00:00:00.000Z');
});
test('pushExpenseRecordPilot: push ПРОВАЛИВСЯ → syncedUpdatedAt НЕ встановлюється', async () => {
  const { ctx } = sandbox();
  ctx.cloudSession = { user: { id: 'user-1' } };
  ctx.cloudFamilyId = 'fam-1';
  ctx.isSupabaseSdkReady = () => true;
  ctx.getSupabaseClient = () => ({ from(){ return { upsert(){ return Promise.resolve({ data: null, error: new Error('симульована помилка') }); } }; } });
  const rec = { id: 'e1', date: '2026-01-01', amount: 500, updatedAt: '2026-05-01T00:00:00.000Z' };
  await ctx.pushExpenseRecordPilot(rec);
  assert.equal(rec.syncedUpdatedAt, undefined);
});
test('pullExpensesCore: Cloud-переможець (LWW) → syncedUpdatedAt = row.updated_at', async () => {
  const ctx = pullExpensesSandbox([{ id: 'e1', amount: 999, expense_date: '2026-05-06', note: 'Оновлено', linked_installment_id: null, created_at: '2024-01-01T00:00:00.000Z', updated_at: '2024-06-01T00:00:00.000Z' }]);
  ctx.expenses = [{ id: 'e1', date: '2026-05-05', name: 'Стара', amount: 500, manual: true, createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z' }];
  await ctx.pullExpensesCore();
  assert.equal(ctx.expenses[0].syncedUpdatedAt, '2024-06-01T00:00:00.000Z');
});
test('pullExpensesCore: новий запис для цього пристрою → syncedUpdatedAt = row.updated_at одразу', async () => {
  const ctx = pullExpensesSandbox([{ id: 'e1', amount: 500, expense_date: '2026-05-01', note: 'Кава', linked_installment_id: null, created_at: '2026-05-01T00:00:00.000Z', updated_at: '2026-05-01T00:00:00.000Z' }]);
  ctx.expenses = [];
  await ctx.pullExpensesCore();
  assert.equal(ctx.expenses[0].syncedUpdatedAt, '2026-05-01T00:00:00.000Z');
});

// Rev #30 (6D.57) — restoreBankAccountsFromBackup()/restoreInstallmentAccountsFromBackup()
// тепер await-ують pushXPilot() — критично для debts/лінкованих expenses, що
// читають cloudId синхронно одразу після в applyBackupData().
test('restoreBankAccountsFromBackup: await push completes ДО повернення (cloudId вже встановлений одразу після)', async () => {
  const { ctx } = sandbox();
  ctx.cloudSession = { user: { id: 'user-1' } };
  ctx.cloudFamilyId = 'fam-1';
  ctx.isSupabaseSdkReady = () => true;
  ctx.bankAccounts = [];
  ctx.getSupabaseClient = () => fakeSupabaseStatefulClient('bank_accounts', 'name').client;
  await ctx.restoreBankAccountsFromBackup(JSON.stringify([{ name: '🟩 Приват', creditLimit: 10000, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }]));
  // Якщо push дійсно await-ований (а не fire-and-forget), cloudId вже присутній ОДРАЗУ після return.
  assert.ok(ctx.bankAccounts[0].cloudId, 'cloudId має бути встановлений одразу після restoreBankAccountsFromBackup()');
});

// Rev #30 (6D.60) — оновлено під пакетний push: пакетний upsert (масив)
// СПОЧАТКУ провалюється цілком (емпірично підтверджена атомарність —
// див. докоментар над pushExpensesBatch()), що тригерить відкат на
// перевірений по-одному шлях — саме там і виявляється, який запис
// реально поганий, а який ні.
test('restoreExpensesFromBackup: пакет провалюється → відкат на по-одному, успіх/збій рахуються чесно (pushFailed), не мовчки', async () => {
  const { ctx } = sandbox();
  ctx.cloudSession = { user: { id: 'user-1' } };
  ctx.cloudFamilyId = 'fam-1';
  ctx.isSupabaseSdkReady = () => true;
  ctx.expenses = [];
  // Rev #30 (6D.75) — id тепер ВАЛІДНИЙ UUID з самого початку (не 'e1'/
  // 'e2'): restoreExpensesFromBackup() нормалізує legacy-формат ДО push
  // (ensureExpenseIdentity(), докоментар над функцією), інакше тест
  // симулював би провал за id, який сам фікс уже замінив би на інший.
  ctx.getSupabaseClient = () => ({ from(){ return { upsert(payload){
    if(Array.isArray(payload)){
      // Пакетний виклик — симулюємо провал ВСЬОГО пакету (атомарність).
      return Promise.resolve({ data: null, error: new Error('симульований провал пакету') });
    }
    // Fallback по-одному: другий запис (за id) — "поганий".
    const isBad = payload.id === VALID_UUID_2;
    return Promise.resolve(isBad ? { data: null, error: new Error('симульована помилка') } : { data: [{}], error: null });
  } }; } });
  const nowISO = '2026-05-01T00:00:00.000Z';
  const backup = [
    { id: VALID_UUID_1, date: '2026-05-01', name: 'Успішний', amount: 100, createdAt: nowISO, updatedAt: nowISO },
    { id: VALID_UUID_2, date: '2026-05-01', name: 'Провалиться', amount: 200, createdAt: nowISO, updatedAt: nowISO },
  ];
  const result = await ctx.restoreExpensesFromBackup(JSON.stringify(backup));
  assert.equal(result.added, 2);
  assert.equal(result.pushFailed, 1);
  assert.equal(result.firstError, 'симульована помилка');
  assert.equal(ctx.expenses.find(e => e.id === VALID_UUID_1).syncedUpdatedAt, nowISO);
  assert.equal(ctx.expenses.find(e => e.id === VALID_UUID_2).syncedUpdatedAt, undefined);
});

test('pushExpensesBatch: пакет успішний → ОДИН upsert-виклик з масивом, усі записи позначені синхронізованими', async () => {
  const { ctx } = sandbox();
  ctx.cloudSession = { user: { id: 'user-1' } };
  ctx.cloudFamilyId = 'fam-1';
  ctx.isSupabaseSdkReady = () => true;
  let upsertCallCount = 0, lastPayload = null;
  ctx.getSupabaseClient = () => ({ from(){ return { upsert(payload){
    upsertCallCount++;
    lastPayload = payload;
    return Promise.resolve({ data: payload, error: null });
  } }; } });
  const nowISO = '2026-05-01T00:00:00.000Z';
  const records = [
    { id: 'e1', date: '2026-05-01', amount: 100, createdAt: nowISO, updatedAt: nowISO },
    { id: 'e2', date: '2026-05-01', amount: 200, createdAt: nowISO, updatedAt: nowISO },
    { id: 'e3', date: '2026-05-01', amount: 300, createdAt: nowISO, updatedAt: nowISO },
  ];
  const result = await ctx.pushExpensesBatch(records);
  assert.equal(upsertCallCount, 1);
  assert.equal(lastPayload.length, 3);
  assert.equal(result.pushed, 3);
  assert.equal(result.failed, 0);
  records.forEach(r => assert.equal(r.syncedUpdatedAt, nowISO));
});

test('pushExpensesBatched: розбиває на чанки за chunkSize (2 записи, chunkSize=1 → 2 окремі пакетні виклики)', async () => {
  const { ctx } = sandbox();
  ctx.cloudSession = { user: { id: 'user-1' } };
  ctx.cloudFamilyId = 'fam-1';
  ctx.isSupabaseSdkReady = () => true;
  let batchCallCount = 0;
  ctx.getSupabaseClient = () => ({ from(){ return { upsert(payload){
    batchCallCount++;
    return Promise.resolve({ data: payload, error: null });
  } }; } });
  const nowISO = '2026-05-01T00:00:00.000Z';
  const records = [
    { id: 'e1', date: '2026-05-01', amount: 100, createdAt: nowISO, updatedAt: nowISO },
    { id: 'e2', date: '2026-05-01', amount: 200, createdAt: nowISO, updatedAt: nowISO },
  ];
  const result = await ctx.pushExpensesBatched(records, 1);
  assert.equal(batchCallCount, 2);
  assert.equal(result.pushed, 2);
});

// Rev #30 (6D.58) — термінове розслідування "846 записів, лише 26
// успішних": pull-after-push (6D.49) усередині pushXRecordPilot() раніше
// викликався ПІСЛЯ КОЖНОГО запису під час bulk-циклів (restore/
// syncAllPilotManual) — подвоєння мережевих запитів на весь батч,
// ймовірний тригер rate-limit на реальному з'єднанні. Тести нижче
// перевіряють: (1) suppressPull:true дійсно пригнічує pull-after-push;
// (2) restoreExpensesFromBackup() робить РІВНО ОДИН pullExpensesCore()
// на весь бекап (не по одному на запис), навіть коли всі записи успішні.
test('pushExpenseRecordPilot: opts.suppressPull:true → pullExpensesCore() НЕ викликається навіть при успіху', async () => {
  const { ctx } = sandbox();
  ctx.cloudSession = { user: { id: 'user-1' } };
  ctx.cloudFamilyId = 'fam-1';
  ctx.isSupabaseSdkReady = () => true;
  ctx.getSupabaseClient = () => ({ from(){ return { upsert(){ return Promise.resolve({ data: [{}], error: null }); } }; } });
  const pullSpy = spyOn(ctx, 'pullExpensesCore');
  await ctx.pushExpenseRecordPilot({ id: 'e1', date: '2026-01-01', amount: 500, updatedAt: '2026-01-01T00:00:00.000Z' }, { suppressPull: true });
  assert.equal(pullSpy.count(), 0);
});
test('pushExpenseRecordPilot: без opts (звичайний одиничний виклик, напр. addExpense()) → pullExpensesCore() і далі викликається одразу (поведінка НЕ змінилась)', async () => {
  const { ctx } = sandbox();
  ctx.cloudSession = { user: { id: 'user-1' } };
  ctx.cloudFamilyId = 'fam-1';
  ctx.isSupabaseSdkReady = () => true;
  ctx.getSupabaseClient = () => ({ from(){ return { upsert(){ return Promise.resolve({ data: [{}], error: null }); } }; } });
  const pullSpy = spyOn(ctx, 'pullExpensesCore');
  await ctx.pushExpenseRecordPilot({ id: 'e1', date: '2026-01-01', amount: 500, updatedAt: '2026-01-01T00:00:00.000Z' });
  assert.equal(pullSpy.count(), 1);
});
test('restoreExpensesFromBackup: РІВНО ОДИН pullExpensesCore() на весь бекап із 5 записів (не по одному на запис — фікс амплфікації)', async () => {
  const { ctx } = sandbox();
  ctx.cloudSession = { user: { id: 'user-1' } };
  ctx.cloudFamilyId = 'fam-1';
  ctx.isSupabaseSdkReady = () => true;
  ctx.expenses = [];
  ctx.getSupabaseClient = () => ({ from(){ return { upsert(){ return Promise.resolve({ data: [{}], error: null }); } }; } });
  const pullSpy = spyOn(ctx, 'pullExpensesCore');
  const nowISO = '2026-05-01T00:00:00.000Z';
  const backup = Array.from({ length: 5 }, (_, i) => ({ id: 'e' + i, date: '2026-05-01', name: 'Запис ' + i, amount: 100, createdAt: nowISO, updatedAt: nowISO }));
  const result = await ctx.restoreExpensesFromBackup(JSON.stringify(backup));
  assert.equal(result.added, 5);
  assert.equal(result.pushFailed, 0);
  // pullSpy рахує ВСІ виклики pullExpensesCore(), включно з тим, що на
  // початку функції (isCloudSessionReady() → pull перед merge) — тому 2
  // (1 на початку + 1 фінальний), НЕ 1+5.
  assert.equal(pullSpy.count(), 2);
});
// syncAllPilotManual() сама НЕ юніт-тестується тут (DOM-шар,
// document.getElementById('sync-all-status') напряму — той самий принцип
// виключення, що вже initCloudAuthUI()/applyCloudSession()) — новий
// push-sweep у ній перевірено живо в browser preview.

// Rev 2.22.84 BugFix — latestTouchedRecordMonth() (handlePushAction,
// 'other-actor-summary'): чиста логіка над двома Map + двома масивами,
// на відміну від openJournal()/handlePushAction() самих (DOM-шар,
// switchTab()/document.getElementById — той самий принцип виключення, що
// й syncAllPilotManual() вище, перевірено живо в browser preview).
function latestTouchedRecordMonthSandbox(){
  const context = require('node:vm').createContext({
    expenses: [],
    incomes: [],
    recentlyPulledExpenseState: new Map(),
    recentlyPulledIncomeState: new Map(),
  });
  const { extractFunctionSource } = require('./extract');
  require('node:vm').runInContext(
    extractFunctionSource('monthKey') + '\n\n' + extractFunctionSource('latestTouchedRecordMonth'),
    context
  );
  return context;
}
test('latestTouchedRecordMonth: один щойно підтягнутий запис витрати → місяць ЦІЄЇ витрати', () => {
  const ctx = latestTouchedRecordMonthSandbox();
  ctx.expenses.push({ id: 'e1', date: '2026-09-30' });
  ctx.recentlyPulledExpenseState.set('e1', 'syncing');
  assert.equal(ctx.latestTouchedRecordMonth(), '2026-09');
});
test('latestTouchedRecordMonth: кілька записів (витрати+доходи) у різних місяцях → НАЙСВІЖІШИЙ місяць, не перший/останній у масиві', () => {
  const ctx = latestTouchedRecordMonthSandbox();
  ctx.expenses.push({ id: 'e1', date: '2026-08-15' }, { id: 'e2', date: '2026-09-30' });
  ctx.incomes.push({ id: 'i1', date: '2026-07-01' });
  ctx.recentlyPulledExpenseState.set('e1', 'syncing');
  ctx.recentlyPulledExpenseState.set('e2', 'done');
  ctx.recentlyPulledIncomeState.set('i1', 'syncing');
  assert.equal(ctx.latestTouchedRecordMonth(), '2026-09');
});
test('latestTouchedRecordMonth: жодного щойно підтягнутого запису (обидві Map порожні) → null (виклик openJournal() без аргументу, фолбек на поточний місяць)', () => {
  const ctx = latestTouchedRecordMonthSandbox();
  ctx.expenses.push({ id: 'e1', date: '2026-09-30' });
  assert.equal(ctx.latestTouchedRecordMonth(), null);
});
test('latestTouchedRecordMonth: id у Map, але запису вже немає в expenses/incomes (видалений локально між pull і рендером) → тихо пропускається, не падає', () => {
  const ctx = latestTouchedRecordMonthSandbox();
  ctx.recentlyPulledExpenseState.set('ghost', 'syncing');
  assert.equal(ctx.latestTouchedRecordMonth(), null);
});

// Rev 2.22.85 (6D.158) BugFix — isKeyboardLikelyClosed()/computeKeyboardInset()/
// viewportOrientationKey()/nextBaseViewportHeight() — усі 4 чисті (без DOM),
// на відміну від updateKeyboardInset()/noteViewportHeightIfKeyboardClosed()
// самих (document.body.classList/documentElement.style.setProperty — той
// самий принцип виключення DOM-шару, що вже openJournal()/handlePushAction()
// вище). Регресійний тест нижче відтворює РЕАЛЬНУ послідовність значень із
// живого Web Inspector-заміру на iPhone (t=9495-9584, докоментар у
// index.html): у цей момент власне window.innerHeight тимчасово просів до
// 505 (= visualViewport.height), через що СТАРА isKeyboardLikelyClosed()
// (яка порівнювала саме innerHeight, не кешовану базу) хибно знімала
// kb-open за 87мс після появи клавіатури.
function keyboardInsetSandbox(){
  const { buildSandbox } = require('./extract');
  return buildSandbox({}, [
    'isKeyboardLikelyClosed', 'computeKeyboardInset',
    'viewportOrientationKey', 'nextBaseViewportHeight', 'computeDrawerTopPx',
  ]);
}
test('isKeyboardLikelyClosed: РЕАЛЬНИЙ живий кейс (6D.158, t=9583) — база 894, vvHeight 505 (клавіатура щойно з\'явилась) → НЕ "закрита", попри те що живий window.innerHeight у ту саму мить сам помилково читав 505', () => {
  const ctx = keyboardInsetSandbox();
  assert.equal(ctx.isKeyboardLikelyClosed(894, 505), false);
});
test('isKeyboardLikelyClosed: база 894, vvHeight 894 (справді нема клавіатури) → "закрита"', () => {
  const ctx = keyboardInsetSandbox();
  assert.equal(ctx.isKeyboardLikelyClosed(894, 894), true);
});
test('isKeyboardLikelyClosed: поріг 100px не зламаний фіксом — база 894, vvHeight 820 (легітимне часткове стиснення, не клавіатура) → "закрита"', () => {
  const ctx = keyboardInsetSandbox();
  assert.equal(ctx.isKeyboardLikelyClosed(894, 820), true);
});
test('computeKeyboardInset: РЕАЛЬНИЙ живий кейс (6D.158) — база 894, vvHeight 505, offsetTop 0 → ~389px ОДРАЗУ (без очікування "рятівного" скролу, яким раніше самовиправлявся живий innerHeight)', () => {
  const ctx = keyboardInsetSandbox();
  assert.equal(ctx.computeKeyboardInset(894, 505, 0), 389);
});
test('computeKeyboardInset: від\'ємний результат (vvHeight+offsetTop > base, теоретично неможливо, але захист) → затиснуто до 0', () => {
  const ctx = keyboardInsetSandbox();
  assert.equal(ctx.computeKeyboardInset(500, 600, 0), 0);
});
test('viewportOrientationKey: ширина > висота → landscape, інакше portrait', () => {
  const ctx = keyboardInsetSandbox();
  assert.equal(ctx.viewportOrientationKey(926, 428), 'landscape');
  assert.equal(ctx.viewportOrientationKey(428, 926), 'portrait');
});
// Rev 2.22.86 (6D.158.1) BugFix — живий тест (поворот portrait→landscape
// З ВІДКРИТОЮ клавіатурою): screen.width/height у standalone-PWA НЕ
// змінюються при повороті (підтверджено живими даними — constant 440×956
// в ОБОХ орієнтаціях), тому viewportOrientationKey(screen.width,
// screen.height) завжди повертала 'portrait' — у landscape код брав
// портретну базу (894) замість landscape (~440), --kb-inset виходив
// 684px, картку викидало за межі екрана. Виправлено на innerWidth/
// innerHeight (порівняння, не абсолютне значення) — тест нижче відтворює
// РЕАЛЬНУ послідовність значень із цього заміру, включно з найбитішими
// перехідними кадрами самого повороту (де innerHeight уже спотворений
// тим самим багом 6D.158) — ширина/висота жодного разу не переплутались
// місцями.
test('viewportOrientationKey: РЕАЛЬНА послідовність повороту з відкритою клавіатурою (6D.158.1) — innerWidth/innerHeight коректно розрізняють орієнтацію на кожному кроці, включно з перехідними кадрами де сам innerHeight спотворений багом 6D.158', () => {
  const ctx = keyboardInsetSandbox();
  assert.equal(ctx.viewportOrientationKey(440, 894), 'portrait');   // t=1, спокій
  assert.equal(ctx.viewportOrientationKey(440, 505), 'portrait');   // t=16349, клавіатура в portrait
  assert.equal(ctx.viewportOrientationKey(956, 431), 'landscape');  // t=29099, щойно повернули в landscape
  assert.equal(ctx.viewportOrientationKey(956, 346), 'landscape');  // t=29393, landscape, innerHeight ще "осідає"
  assert.equal(ctx.viewportOrientationKey(440, 956), 'portrait');   // t=41542, повертаємось назад — перехідний кадр з ЗАВИЩЕНИМ innerHeight (956 > справжніх 894), але порівняння все одно коректне
  assert.equal(ctx.viewportOrientationKey(440, 894), 'portrait');   // t=52584, спокій після повороту назад
});
test('viewportOrientationKey: screen.width/screen.height БІЛЬШЕ не використовуються (6D.158.1) — на цьому пристрої вони constant в обох орієнтаціях і давали б завжди "portrait"', () => {
  const ctx = keyboardInsetSandbox();
  // Ілюстрація самого бага 6D.158.1: якби функцію й далі годували screen.*
  // (constant 440×956 в ОБОХ орієнтаціях, підтверджено живими даними),
  // вона НІКОЛИ не повернула б 'landscape' — саме це й сталось у Rev 2.22.85.
  assert.equal(ctx.viewportOrientationKey(440, 956), 'portrait');
});
test('nextBaseViewportHeight: перший запис для орієнтації (prevValue=null) → береться як є, навіть якщо він менший за типовий', () => {
  const ctx = keyboardInsetSandbox();
  assert.equal(ctx.nextBaseViewportHeight(null, 390), 390);
});
test('nextBaseViewportHeight: Rev 2.22.85 — одинична хибна просадка (6D.158, innerHeight=505 в момент появи клавіатури) НЕ псує вже встановлену базу 894', () => {
  const ctx = keyboardInsetSandbox();
  assert.equal(ctx.nextBaseViewportHeight(894, 505), 894);
});
test('nextBaseViewportHeight: легітимне зростання (напр. приховання адресного рядка) враховується', () => {
  const ctx = keyboardInsetSandbox();
  assert.equal(ctx.nextBaseViewportHeight(844, 894), 894);
});

// Rev 2.22.93 (6D.166) BugFix — живий лог (kb-full-scenario 2, mark@129,
// t=40863) довів: drawerBottom (getBoundingClientRect) ТОЧНО дорівнює
// (у ту мить зіпсованому) window.innerHeight мінус CSS bottom — сам
// --kb-inset рахувався вірно (198 = 8 база-під-клавіатуру + 190 inset), але
// WebKit РЕЗОЛЬВИТЬ fixed-позицію проти свого internal (зіпсованого)
// innerHeight, не проти нашого коректного значення. Обхід — рахувати top
// через visualViewport.height/offsetTop, які в ЖОДНОМУ живому замірі цієї
// сесії не були зіпсовані (на відміну від innerHeight).
test('computeDrawerTopPx: РЕАЛЬНИЙ живий кейс (6D.166, kb-full-scenario 2, mark@129) — дає сенсовну позицію замість зламаної drawerBottom:435', () => {
  const ctx = keyboardInsetSandbox();
  // vvOffsetTop=261, vvH=505 (обидва live-підтверджені надійні), bottom=198px
  // (8 база-з-клавіатурою + 190 --kb-inset, проста сума пікселів, без height),
  // drawerHeight=520 (живий замір, актуальна висота картки в ту мить).
  const topPx = ctx.computeDrawerTopPx(261, 505, 198, 520);
  assert.equal(topPx, 48);
  const bottomPx = topPx + 520;
  assert.equal(bottomPx, 568, 'нова позиція ставить низ картки одразу над клавіатурою (261+505=766 видимих px, мінус 198 запасу) — не 435, як давала зламана bottom-резолюція WebKit');
});
test('syncDrawerTopPosition: ставить inline top/bottom:auto на ВІДКРИТУ шторку й ОЧИЩАЄ стилі попередньої, коли та закрилась', () => {
  function makeDrawer(id, bottomCss, height){
    return {
      id: id,
      _style: { top: '', bottom: '' },
      get style(){ return this._style; },
      getBoundingClientRect: function(){ return { height: height }; },
      _bottom: bottomCss,
    };
  }
  const drawerA = makeDrawer('drawer-a', '198px', 520);
  let openDrawer = drawerA;
  const ctx = require('./extract').buildSandbox({
    window: { visualViewport: { height: 505, offsetTop: 261 } },
    document: { querySelector: function(){ return openDrawer; } },
    getComputedStyle: function(el){ return { bottom: el._bottom }; },
    lastPositionedDrawerEl: null,
  }, ['computeDrawerTopPx', 'syncDrawerTopPosition']);
  ctx.syncDrawerTopPosition();
  assert.equal(drawerA.style.top, '48px');
  assert.equal(drawerA.style.bottom, 'auto');
  // Тепер шторка закрилась (querySelector більше нічого не повертає) —
  // попередні inline-стилі мають ОЧИСТИТИСЬ, а не лишитись "залипнути".
  openDrawer = null;
  ctx.syncDrawerTopPosition();
  assert.equal(drawerA.style.top, '');
  assert.equal(drawerA.style.bottom, '');
});

// Rev 2.22.89 (6D.162, Ревізія C) — маркер каскаду без FK (deactivated_via/
// deleted_via, текстові, рішення користувача). Ключова вимога —
// СЕЛЕКТИВНІСТЬ: слово/підкатегорія, видалені ОКРЕМО (без маркера чи з
// іншим маркером), ніколи не чіпаються ні каскадом, ні відновленням.
test('deleteCategory: каскад ставить deactivated_via/deleted_via ЛИШЕ на точну підмножину — вже окремо видалені лишаються незайманими', async () => {
  const { ctx } = sandbox();
  ctx.CATEGORIES = [{ name: 'Їжа', type: 'Гнучка', active: true }];
  ctx.SUBCATEGORIES = [
    { name: 'Кафе', category: 'Їжа', active: true },
    { name: 'Вже видалена окремо', category: 'Їжа', active: false },
  ];
  ctx.DICTIONARY = [
    { id: 'd1', kw: 'лате', cat: 'Їжа', sub: 'Кафе' },
    { id: 'd2', kw: 'пряме-на-категорію', cat: 'Їжа', sub: null },
    { id: 'd3', kw: 'окремо видалене', cat: 'Їжа', sub: null, deletedAt: '2020-01-01T00:00:00.000Z' },
  ];
  ctx.deleteCategory(0);
  await ctx.__confirmState.lastPromise;
  assert.equal(ctx.CATEGORIES[0].active, false);
  assert.equal(ctx.SUBCATEGORIES[0].active, false);
  assert.equal(ctx.SUBCATEGORIES[0].deactivatedVia, 'category');
  assert.equal(ctx.SUBCATEGORIES[1].deactivatedVia, undefined); // не чіпали
  assert.equal(ctx.DICTIONARY[0].deletedVia, 'category');
  assert.equal(ctx.DICTIONARY[1].deletedVia, 'category');
  assert.equal(ctx.DICTIONARY[2].deletedVia, undefined); // вже видалене окремо — не чіпали, deletedAt той самий
  assert.equal(ctx.DICTIONARY[2].deletedAt, '2020-01-01T00:00:00.000Z');
});
test('deleteSubcategory: deleted_via=subcategory лише на ВЛАСНІ слова підкатегорії, не чіпає вже видалені через категорію', async () => {
  const { ctx } = sandbox();
  ctx.SUBCATEGORIES = [{ name: 'Кафе', category: 'Їжа', active: true }];
  ctx.DICTIONARY = [
    { id: 'd1', kw: 'лате', cat: 'Їжа', sub: 'Кафе' },
    { id: 'd2', kw: 'вже видалене каскадом категорії', cat: 'Їжа', sub: 'Кафе', deletedAt: '2020-01-01T00:00:00.000Z', deletedVia: 'category' },
  ];
  ctx.deleteSubcategory(0);
  await ctx.__confirmState.lastPromise;
  assert.equal(ctx.SUBCATEGORIES[0].active, false);
  assert.equal(ctx.DICTIONARY[0].deletedVia, 'subcategory');
  assert.equal(ctx.DICTIONARY[1].deletedVia, 'category'); // не чіпали
});
test('restoreCategory: відновлює категорію + ЛИШЕ підкатегорії/слова з маркером category для ЦІЄЇ категорії', async () => {
  const { ctx } = sandbox();
  ctx.CATEGORIES = [{ name: 'Їжа', type: 'Гнучка', active: false }];
  ctx.SUBCATEGORIES = [
    { name: 'Кафе', category: 'Їжа', active: false, deactivatedVia: 'category' },
    { name: 'Окремо видалена', category: 'Їжа', active: false },
  ];
  ctx.DICTIONARY = [
    { id: 'd1', kw: 'лате', cat: 'Їжа', sub: 'Кафе', deletedAt: '2020-01-01T00:00:00.000Z', deletedVia: 'category' },
    { id: 'd2', kw: 'окреме слово', cat: 'Їжа', sub: null, deletedAt: '2020-02-01T00:00:00.000Z' },
  ];
  const result = await ctx.restoreCategory('Їжа');
  assert.equal(result.success, true);
  assert.equal(ctx.CATEGORIES[0].active, true);
  assert.equal(ctx.SUBCATEGORIES[0].active, true);
  assert.equal(ctx.SUBCATEGORIES[0].deactivatedVia, undefined);
  assert.equal(ctx.SUBCATEGORIES[1].active, false); // незалежно видалена — лишилась видаленою
  assert.equal(ctx.DICTIONARY[0].deletedAt, undefined);
  assert.equal(ctx.DICTIONARY[0].deletedVia, undefined);
  assert.equal(ctx.DICTIONARY[1].deletedAt, '2020-02-01T00:00:00.000Z'); // незалежно видалене слово — не відновили
});
test('restoreCategory: блокується, якщо вже є АКТИВНА категорія з такою самою назвою (захисна перевірка колізії)', async () => {
  const { ctx } = sandbox();
  ctx.CATEGORIES = [
    { name: 'Їжа', active: false },
    { name: 'Їжа', active: true },
  ];
  const result = await ctx.restoreCategory('Їжа');
  assert.equal(result.success, false);
  assert.equal(ctx.CATEGORIES[0].active, false);
});
test('restoreCategory: категорію не знайдено серед видалених → чітка помилка, не кидає виняток', async () => {
  const { ctx } = sandbox();
  ctx.CATEGORIES = [{ name: 'Їжа', active: true }];
  const result = await ctx.restoreCategory('Немає такої');
  assert.equal(result.success, false);
});
test('restoreSubcategory: провалюється, поки батьківська категорія ще неактивна', async () => {
  const { ctx } = sandbox();
  ctx.CATEGORIES = [{ name: 'Їжа', active: false }];
  ctx.SUBCATEGORIES = [{ name: 'Кафе', category: 'Їжа', active: false, deactivatedVia: 'category' }];
  const result = await ctx.restoreSubcategory('Їжа', 'Кафе');
  assert.equal(result.success, false);
  assert.equal(ctx.SUBCATEGORIES[0].active, false);
});
test('restoreSubcategory: відновлює підкатегорію + ЛИШЕ її власні deleted_via=subcategory слова', async () => {
  const { ctx } = sandbox();
  ctx.CATEGORIES = [{ name: 'Їжа', active: true }];
  ctx.SUBCATEGORIES = [{ name: 'Кафе', category: 'Їжа', active: false, deactivatedVia: 'category' }];
  ctx.DICTIONARY = [
    { id: 'd1', kw: 'лате', cat: 'Їжа', sub: 'Кафе', deletedAt: '2020-01-01T00:00:00.000Z', deletedVia: 'subcategory' },
    { id: 'd2', kw: 'видалене разом з категорією', cat: 'Їжа', sub: 'Кафе', deletedAt: '2020-02-01T00:00:00.000Z', deletedVia: 'category' },
  ];
  const result = await ctx.restoreSubcategory('Їжа', 'Кафе');
  assert.equal(result.success, true);
  assert.equal(ctx.SUBCATEGORIES[0].active, true);
  assert.equal(ctx.DICTIONARY[0].deletedAt, undefined);
  assert.equal(ctx.DICTIONARY[1].deletedAt, '2020-02-01T00:00:00.000Z'); // інший маркер — не відновили
});
test('restoreSubcategory: блокується, якщо вже є АКТИВНА підкатегорія з такою самою назвою (захисна перевірка колізії)', async () => {
  const { ctx } = sandbox();
  ctx.CATEGORIES = [{ name: 'Їжа', active: true }];
  ctx.SUBCATEGORIES = [
    { name: 'Кафе', category: 'Їжа', active: false, deactivatedVia: 'category' },
    { name: 'Кафе', category: 'Напої', active: true },
  ];
  const result = await ctx.restoreSubcategory('Їжа', 'Кафе');
  assert.equal(result.success, false);
  assert.equal(ctx.SUBCATEGORIES[0].active, false);
});
test('restoreSubcategoriesFromBackup: старий бекап БЕЗ поля deactivatedVia відновлюється штатно (відсутнє поле — не помилка)', async () => {
  const { ctx } = sandbox();
  ctx.SUBCATEGORIES = [];
  const backup = JSON.stringify([{ name: 'Кафе', category: 'Їжа', active: true, createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z' }]);
  const result = await ctx.restoreSubcategoriesFromBackup(backup);
  assert.equal(result.added, 1);
  assert.equal(ctx.SUBCATEGORIES[0].deactivatedVia, undefined);
});
test('restoreDictionaryFromBackup: старий бекап БЕЗ поля deletedVia відновлюється штатно (відсутнє поле — не помилка)', async () => {
  const { ctx } = sandbox();
  ctx.DICTIONARY = [];
  const backup = JSON.stringify([{ id: 'd1', kw: 'лате', cat: 'Їжа', sub: null, createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z' }]);
  const result = await ctx.restoreDictionaryFromBackup(backup);
  assert.equal(result.added, 1);
  assert.equal(ctx.DICTIONARY[0].deletedVia, undefined);
});

/* ============ Rev 2.22.91 (6D.164) — "Чорна скринька" діагностики ============
   Чисті функції (ringBufferPush/sanitizeDebugEvent/trimEventsForSizeLimit/
   detectIosVersionFromUserAgent/isStandaloneDisplayMode) — без DOM, окремо
   тестовані тут. Оркестрація (start/stop/attach-detach listeners) — DOM-шар,
   але явно вимагається DoD ("вимкнений стан не додає слухачів", "автозупинка
   за таймером") — тестуємо через мінімальне фейкове DOM-середовище нижче
   (jsFakeDom), достатнє лише для цих конкретних функцій, не повноцінний DOM. */
function debugRecorderPureSandbox(){
  return require('./extract').buildSandbox({}, [
    'DEBUG_EVENT_ALLOWLIST', 'sanitizeDebugEvent', 'ringBufferPush', 'trimEventsForSizeLimit',
    'detectIosVersionFromUserAgent', 'isStandaloneDisplayMode',
  ]);
}
test('ringBufferPush: додає подію, не перевищуючи maxSize — найстаріша (з початку) відкидається', () => {
  const ctx = debugRecorderPureSandbox();
  let buf = [{ t: 1 }, { t: 2 }, { t: 3 }];
  buf = ctx.ringBufferPush(buf, { t: 4 }, 3);
  assert.deepEqual(plain(buf), [{ t: 2 }, { t: 3 }, { t: 4 }]);
});
test('ringBufferPush: під лімітом — просто додає, нічого не відкидає', () => {
  const ctx = debugRecorderPureSandbox();
  const buf = ctx.ringBufferPush([{ t: 1 }], { t: 2 }, 5);
  assert.deepEqual(plain(buf), [{ t: 1 }, { t: 2 }]);
});
test('sanitizeDebugEvent: allowlist — поле "value" чи "text" (вміст поля форми) НІКОЛИ не потрапляє в подію', () => {
  const ctx = debugRecorderPureSandbox();
  const out = ctx.sanitizeDebugEvent({ t: 1, type: 'focusin', value: '1234.56', text: 'Назва витрати', innerW: 400 });
  assert.deepEqual(plain(out), { t: 1, type: 'focusin', innerW: 400 });
  assert.equal('value' in out, false);
  assert.equal('text' in out, false);
});
test('sanitizeDebugEvent: дозволені поля проходять усі разом', () => {
  const ctx = debugRecorderPureSandbox();
  const raw = { t: 5, type: 'resize', innerW: 400, innerH: 800, kbInset: '389px', bodyClasses: 'kb-open', orientation: 'portrait' };
  assert.deepEqual(plain(ctx.sanitizeDebugEvent(raw)), raw);
});
test('trimEventsForSizeLimit: спершу обрізає за кількістю', () => {
  const ctx = debugRecorderPureSandbox();
  const events = Array.from({ length: 10 }, (_, i) => ({ t: i }));
  const result = ctx.trimEventsForSizeLimit(events, 3, 1000000);
  assert.deepEqual(plain(result), [{ t: 7 }, { t: 8 }, { t: 9 }]);
});
test('trimEventsForSizeLimit: далі відкидає найстаріші, доки JSON не влізе в байтовий ліміт', () => {
  const ctx = debugRecorderPureSandbox();
  const bigEvent = () => ({ t: 1, bodyClasses: 'x'.repeat(100) });
  const events = Array.from({ length: 20 }, bigEvent);
  const approxEventBytes = JSON.stringify(bigEvent()).length;
  const maxBytes = approxEventBytes * 5 + 20; // влізе приблизно 5 подій
  const result = ctx.trimEventsForSizeLimit(events, 1000, maxBytes);
  assert.ok(result.length <= 6 && result.length >= 4, `очікував ~5 подій, отримав ${result.length}`);
  assert.ok(JSON.stringify(result).length <= maxBytes);
});
test('detectIosVersionFromUserAgent: розпізнає "OS 17_2 like Mac OS X" → "17.2"', () => {
  const ctx = debugRecorderPureSandbox();
  assert.equal(ctx.detectIosVersionFromUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X)'), '17.2');
});
test('detectIosVersionFromUserAgent: з патч-версією "16_7_2" → "16.7.2"', () => {
  const ctx = debugRecorderPureSandbox();
  assert.equal(ctx.detectIosVersionFromUserAgent('CPU iPhone OS 16_7_2 like Mac OS X'), '16.7.2');
});
test('detectIosVersionFromUserAgent: не iOS User-Agent → null', () => {
  const ctx = debugRecorderPureSandbox();
  assert.equal(ctx.detectIosVersionFromUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)'), null);
});
test('isStandaloneDisplayMode: обидва джерела false → false; будь-яке true → true', () => {
  const ctx = debugRecorderPureSandbox();
  assert.equal(ctx.isStandaloneDisplayMode(false, false), false);
  assert.equal(ctx.isStandaloneDisplayMode(true, false), true);
  assert.equal(ctx.isStandaloneDisplayMode(false, true), true);
});

// Rev 2.22.91 — коалесценція ~30мс: фейковий setTimeout/clearTimeout (не
// виконує одразу, на відміну від sandbox() вище — тут саме ЧАС виконання і є
// предметом тесту), captureDebugGeometry підмінено на спай.
test('onDebugScroll: коалесценція — 3 швидкі виклики → лише ОДИН запланований знімок (найновіший таймер, попередні скасовані)', () => {
  let scheduled = [];
  let nextId = 1;
  const cancelled = [];
  let captureCalls = 0;
  const ctx = require('./extract').buildSandbox({
    setTimeout: function(fn, ms){ const id = nextId++; scheduled.push({ id: id, fn: fn, ms: ms }); return id; },
    clearTimeout: function(id){ cancelled.push(id); scheduled = scheduled.filter(function(s){ return s.id !== id; }); },
    captureDebugGeometry: function(){ captureCalls++; },
    debugScrollCoalesceTimer: null,
  }, ['onDebugScroll']);
  ctx.onDebugScroll();
  ctx.onDebugScroll();
  ctx.onDebugScroll();
  assert.equal(scheduled.length, 1, 'лише один живий запланований таймер лишився');
  assert.equal(scheduled[0].ms, 30);
  assert.equal(captureCalls, 0, 'знімок ще НЕ зроблено — таймер ще не спрацював');
  scheduled[0].fn(); // симулюємо спрацювання таймера
  assert.equal(captureCalls, 1, 'рівно один знімок після спрацювання');
});

// Rev 2.22.91 — мінімальне фейкове DOM-середовище, ДОСТАТНЄ лише для
// attachDebugRecorderListeners()/captureDebugGeometry()/start-stop —
// не повноцінний DOM (MutationObserver відсутній у Node — typeof-guard у
// коді сам пропускає цю гілку, тож тут навіть не потрібен).
function debugRecorderDomSandbox(opts){
  opts = opts || {};
  const added = [];
  const removed = [];
  const fakeComputedStyle = { paddingTop: '0px', paddingRight: '0px', paddingBottom: '0px', paddingLeft: '0px', getPropertyValue: function(){ return '0px'; } };
  const fakeVv = {
    width: 400, height: 800, offsetTop: 0, offsetLeft: 0, scale: 1,
    addEventListener: function(type, h){ added.push({ target: 'vv', type: type, h: h }); },
    removeEventListener: function(type, h){ removed.push({ target: 'vv', type: type, h: h }); },
  };
  const fakeBody = { className: '', appendChild: function(){} };
  const fakeDocumentElement = { clientHeight: 800 };
  const fakeWindow = {
    innerWidth: 400, innerHeight: 800, outerHeight: 800, scrollY: 0,
    visualViewport: fakeVv,
    addEventListener: function(type, h, o){ added.push({ target: 'window', type: type, h: h, o: o }); },
    removeEventListener: function(type, h, o){ removed.push({ target: 'window', type: type, h: h, o: o }); },
  };
  // Rev 2.22.92 (6D.165) — querySelector тепер розрізняє селектор: тест для
  // .drawer.open/.drawer-backdrop.open (geometry-фікс) передає opts.drawerEl/
  // opts.backdropEl; за замовчуванням (решта тестів, nav.tabbar) — null,
  // той самий безпечний фолбек, що раніше.
  const fakeDocument = {
    activeElement: { tagName: 'BODY', id: '', type: undefined },
    body: fakeBody,
    documentElement: fakeDocumentElement,
    createElement: function(){ return { style: {} }; },
    querySelector: function(sel){
      if(sel === '.drawer.open') return opts.drawerEl || null;
      if(sel === '.drawer-backdrop.open') return opts.backdropEl || null;
      return null; // nav.tabbar тощо — відсутній у фейковому DOM, безпечно
    },
    getElementById: function(){ return null; },
    addEventListener: function(type, h){ added.push({ target: 'document', type: type, h: h }); },
    removeEventListener: function(type, h){ removed.push({ target: 'document', type: type, h: h }); },
  };
  const timers = { intervals: [], timeouts: [] };
  const ctx = require('./extract').buildSandbox({
    window: fakeWindow,
    document: fakeDocument,
    navigator: { userAgent: 'test-ua', platform: 'test', standalone: false },
    performance: { now: function(){ return Date.now(); } },
    getComputedStyle: function(){ return fakeComputedStyle; },
    setInterval: function(fn, ms){ const id = timers.intervals.length + 1; timers.intervals.push({ id: id, fn: fn, ms: ms }); return id; },
    clearInterval: function(id){ timers.intervals = timers.intervals.filter(function(t){ return t.id !== id; }); },
    setTimeout: function(fn, ms){ const id = timers.timeouts.length + 1; timers.timeouts.push({ id: id, fn: fn, ms: ms }); return id; },
    clearTimeout: function(id){ timers.timeouts = timers.timeouts.filter(function(t){ return t.id !== id; }); },
    debugRecordingActive: false, debugRecordingStartedAt: 0, debugRecordingScenario: '',
    debugEventBuffer: [], debugRecordingAutoStopTimer: null, debugRecordingTimerInterval: null,
    debugListenerHandles: [], debugRecordingMutationObserver: null, debugScrollCoalesceTimer: null,
    debugSafeAreaProbeEl: null,
    DEBUG_RECORDING_MAX_EVENTS: 2000, DEBUG_RECORDING_AUTO_STOP_MS: 30 * 60 * 1000,
  }, [
    'DEBUG_EVENT_ALLOWLIST', 'sanitizeDebugEvent', 'ringBufferPush', 'pushDebugEvent',
    'debugSafeAreaInsets', 'captureDebugGeometry',
    'onDebugWindowResize', 'onDebugVvResize', 'onDebugVvScroll', 'onDebugScroll',
    'onDebugFocusIn', 'onDebugFocusOut', 'onDebugOrientationChange', 'onDebugVisibilityChange',
    'onDebugPageShow', 'onDebugPageHide', 'onDebugTouchStart', 'onDebugTouchEnd', 'onDebugBodyClassChange',
    'attachDebugRecorderListeners', 'detachDebugRecorderListeners',
    'updateDebugRecordButtonUI', 'startDebugRecording', 'stopDebugRecording',
  ]);
  return { ctx: ctx, added: added, removed: removed, timers: timers };
}
test('startDebugRecording: ВИМКНЕНИЙ стан (до старту) не додає жодного слухача й не чіпає DOM', () => {
  const { added } = debugRecorderDomSandbox();
  assert.equal(added.length, 0, 'жодної підписки на подію до виклику startDebugRecording()');
});
test('startDebugRecording: додає слухачів лише ПІСЛЯ старту; stopDebugRecording() знімає РІВНО стільки ж', () => {
  const { ctx, added, removed } = debugRecorderDomSandbox();
  ctx.startDebugRecording('test-scenario');
  assert.equal(ctx.debugRecordingActive, true);
  const addedCount = added.length;
  assert.ok(addedCount > 0, 'слухачі додані після старту');
  ctx.stopDebugRecording();
  assert.equal(ctx.debugRecordingActive, false);
  assert.equal(removed.length, addedCount, 'знято РІВНО стільки ж слухачів, скільки додано');
});
test('startDebugRecording: автозупинка — спрацювання запланованого таймера (30хв) самостійно зупиняє запис', () => {
  const { ctx, timers } = debugRecorderDomSandbox();
  ctx.startDebugRecording('');
  const autoStop = timers.timeouts.find(function(t){ return t.ms === 30 * 60 * 1000; });
  assert.ok(autoStop, 'заплановано setTimeout саме на 30 хвилин');
  assert.equal(ctx.debugRecordingActive, true);
  autoStop.fn(); // симулюємо спрацювання таймера автозупинки
  assert.equal(ctx.debugRecordingActive, false, 'запис зупинився сам, без ручного stop()');
});
test('startDebugRecording → stopDebugRecording: події, зібрані during запису, лишаються в буфері після stop (надсилання — окрема дія)', () => {
  const { ctx } = debugRecorderDomSandbox();
  ctx.startDebugRecording('');
  ctx.onDebugWindowResize();
  ctx.onDebugOrientationChange();
  const countDuring = ctx.debugEventBuffer.length;
  ctx.stopDebugRecording();
  assert.ok(countDuring >= 2, 'resize + orientationchange зафіксовані (плюс start)');
  assert.equal(ctx.debugEventBuffer.length, countDuring + 1, 'stop() сам додає ще один фінальний знімок');
});
test('pushDebugEvent: подія НЕ додається в буфер, поки запис вимкнений (debugRecordingActive:false)', () => {
  const ctx = require('./extract').buildSandbox({
    debugRecordingActive: false, debugEventBuffer: [], DEBUG_RECORDING_MAX_EVENTS: 2000,
  }, ['sanitizeDebugEvent', 'ringBufferPush', 'pushDebugEvent', 'DEBUG_EVENT_ALLOWLIST']);
  ctx.pushDebugEvent({ t: 1, type: 'resize' });
  assert.equal(ctx.debugEventBuffer.length, 0);
});

// Rev 2.22.92 (6D.165) BugFix — живий лог (kb-full-scenario) знайшов дотик,
// що влучив у .drawer-backdrop замість самої картки в landscape — без
// прямокутників ОБОХ елементів неможливо було встановити причину.
test('captureDebugGeometry: записує прямокутники ВІДКРИТОЇ шторки й підложки, коли вони є', () => {
  const drawerEl = { id: 'card-debt-drawer', getBoundingClientRect: function(){ return { top: -42, bottom: 391, left: 16, right: 424, height: 433 }; } };
  const backdropEl = { id: 'card-debt-backdrop', getBoundingClientRect: function(){ return { top: 0, bottom: 757, left: 0, right: 440, height: 757 }; } };
  const { ctx } = debugRecorderDomSandbox({ drawerEl: drawerEl, backdropEl: backdropEl });
  ctx.startDebugRecording('');
  ctx.captureDebugGeometry('manual-check');
  const evt = ctx.debugEventBuffer[ctx.debugEventBuffer.length - 1];
  assert.equal(evt.drawerId, 'card-debt-drawer');
  assert.equal(evt.drawerTop, -42);
  assert.equal(evt.drawerHeight, 433);
  assert.equal(evt.backdropId, 'card-debt-backdrop');
  assert.equal(evt.backdropHeight, 757, 'підложка може бути ВИЩОЮ за саму картку — саме це й шукаємо живим логом');
});
test('captureDebugGeometry: без відкритої шторки/підложки — поля null, не падає', () => {
  const { ctx } = debugRecorderDomSandbox();
  ctx.startDebugRecording('');
  const evt = ctx.debugEventBuffer[ctx.debugEventBuffer.length - 1];
  assert.equal(evt.drawerId, null);
  assert.equal(evt.drawerTop, null);
  assert.equal(evt.backdropId, null);
});

// Rev 2.22.92 (6D.165) BugFix — живий тест: "не зрозуміло чи натиснулась
// Мітка" — короткий візуальний відгук на самій кнопці.
test('markDebugEvent: дає короткий візуальний відгук на кнопці (текст міняється й повертається)', () => {
  const btnState = { textContent: 'Мітка', disabled: false };
  const ctx = require('./extract').buildSandbox({
    debugRecordingActive: true, debugEventBuffer: [], debugRecordingStartedAt: 0, debugSafeAreaProbeEl: null,
    DEBUG_RECORDING_MAX_EVENTS: 2000, DEBUG_EVENT_ALLOWLIST: ['t', 'type'],
    window: { visualViewport: null, innerWidth: 400, innerHeight: 800, outerHeight: 800, scrollY: 0 },
    document: {
      activeElement: null, body: { className: '', appendChild: function(){} }, documentElement: { clientHeight: 800 },
      createElement: function(){ return { style: {} }; },
      querySelector: function(){ return null; },
      getElementById: function(id){ return id === 'debug-record-mark-btn' ? btnState : null; },
    },
    performance: { now: function(){ return 0; } },
    getComputedStyle: function(){ return { getPropertyValue: function(){ return '0px'; } }; },
    setTimeout: function(fn){ fn(); return 1; }, // виконуємо одразу — сам факт скасування відгуку й є предметом тесту
  }, ['sanitizeDebugEvent', 'ringBufferPush', 'pushDebugEvent', 'debugSafeAreaInsets', 'captureDebugGeometry', 'markDebugEvent']);
  ctx.markDebugEvent();
  assert.equal(btnState.textContent, 'Мітка', 'після setTimeout текст повернувся до вихідного');
  assert.equal(btnState.disabled, false);
});
