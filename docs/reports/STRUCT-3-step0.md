# STRUCT-3 · Крок 0: карта областей і план перенесення (Rev 2.32.345; без змін коду)

Інструменти (лише читання, додані окремо): `scripts/struct3-analyze.js` (розбір основного `<script>` на оголошення й оператори верхнього рівня, області за діапазонами рядків з уточненням за назвою, залежності за ідентифікаторами, аналіз залежностей під час завантаження). Це статичний аналіз: ім'я об'єктного ключа чи рядка, що збігається з глобальним іменем, дає хибні залежності (їх перевірено вручну там, де вони впливають на порядок). Області проведено орієнтовно: межі між ними — за заголовками секцій у файлі.

## 1. Скільки чого
Основний скрипт `index.html` рядки 1698–28667 (26970 рядків). Верхній рівень: **2153 елементів**: 1569 функцій, 317 `const`, 180 `let`, 87 операторів (виклики, `addEventListener`, IIFE). Усередині `initApp` (рядки 25937–28499, 2563 рядків) ще ≈ 180 локальних функцій (клавіатурний модуль і обробники форм): вони не глобальні й у цьому плані не рахуються. Після `initApp` лишається хвіст до кінця скрипта (реєстрація service worker, `recBgStart`).

## 2. Області
Клас: A — без синхронізації, даних і клавіатури; B — є читання/запис даних, але не синхронізація й не клавіатура; C — синхронізація, дані, клавіатура, безпека, мережа.

| Область | Функцій | const | let | Операторів | Рядків | Використовує інших (імен) | Використовують її (імен) | Клас |
|---|---|---|---|---|---|---|---|---|
| `structure` Структура (вкладка, рендер) | 24 | 8 | 1 | 1 | 180 | 8 | 4 | A |
| `analytics` Аналітика (графіки, дашборди, поява Обліку) | 78 | 21 | 5 | 2 | 1536 | 32 | 11 | A |
| `shell` Каркас UI (вкладки, рух, таббар, тема, місяці) | 102 | 38 | 10 | 17 | 1430 | 62 | 44 | A |
| `payments` Найближчі платежі й екран «Платежі» | 59 | 11 | 3 | 1 | 664 | 49 | 23 | B |
| `diag` Діагностика, «чорна скринька», самописець, журнал JS-помилок | 141 | 28 | 29 | 2 | 1475 | 50 | 39 | B |
| `sheets-forms` Шторки й форми (власний модал, форми «Структури») | 31 | 7 | 6 | 0 | 403 | 27 | 15 | C |
| `cloud-auth` Cloud: автентифікація, середовище, мок | 28 | 13 | 8 | 1 | 346 | 37 | 21 | C |
| `structure-data` Довідники (категорії, підкатегорії, словник: дані) | 19 | 8 | 4 | 0 | 495 | 45 | 21 | C |
| `monobank` Monobank (підключення, «Вхідні», повернення) | 122 | 10 | 8 | 4 | 1191 | 48 | 27 | C |
| `accounting` Облік (борги, ОЧ, картки) | 66 | 2 | 4 | 1 | 986 | 77 | 23 | C |
| `storage` Сховище (localStorage, IndexedDB, міграція, бекап/відновлення, стан) | 101 | 24 | 12 | 1 | 986 | 55 | 59 | C |
| `expenses` Витрати (додавання, чернетка, автопідказка, редагування, журнал, видалені дані) | 210 | 31 | 37 | 17 | 2519 | 77 | 96 | C |
| `service` Сервіс (Excel, кошик, «Перевірки», налаштування, тест-варіанти) | 123 | 21 | 9 | 22 | 2083 | 146 | 27 | C |
| `sync` Синхронізація (push/pull/merge, Realtime, планувальник) | 287 | 61 | 26 | 3 | 4359 | 132 | 125 | C |
| `notif-push` Сповіщення й push (архів, тости, push-приймання) | 172 | 34 | 18 | 10 | 2055 | 135 | 43 | C |
| `boot-initApp` Запуск: initApp (+ клавіатурний модуль) і хвіст скрипта | 6 | 0 | 0 | 5 | 2682 | 50 | 1 | C (STRUCT-4) |

«Використовує/використовують» — кількість різних глобальних імен із інших областей. Найбільш зв'язані: `sync` (257), `notif-push` (178), `service` і `expenses` (173), `storage` (114). Найменш: `structure` (12), `sheets-forms` (42), `analytics` (43).

## 3. Що область бере в інших і що з неї беруть
| Область | Топ-імена, що з неї беруть інші (кількість користувачів) | Від кого залежить найбільше |
|---|---|---|
| `structure` | `renderStructure`×24, `structDictLeave`×1, `structDict`×1, `structDictGroupEl`×1 | structure-data (3), shell (3), storage (1) |
| `analytics` | `setDashFinal`×4, `bankIcon`×4, `expenseCountWord`×3, `XSS_AUDITED_SITES`×1, `acctFinishSegFade`×1 | accounting (9), shell (7), expenses (5) |
| `shell` | `renderAll`×32, `lockBackgroundScroll`×23, `unlockBackgroundScroll`×22, `populateMonths`×21, `lastFocusedBeforeDialog`×20 | expenses (15), accounting (9), storage (6) |
| `payments` | `installmentChainCalc`×4, `installmentStandardPayment`×4, `linkedExpensesSum`×2, `typicalMonthlyPayment`×2, `isPaymentsOpen`×2 | storage (14), expenses (10), shell (9) |
| `diag` | `pushDebugEvent`×48, `debugRecordingStartedAt`×47, `debugRecordingActive`×40, `captureDebugGeometry`×27, `recOn`×13 | shell (14), expenses (8), storage (8) |
| `sheets-forms` | `showConfirmModal`×19, `closeAppModal`×7, `showAlertModal`×5, `presentAppModal`×5, `appModalPurgeStyled`×3 | shell (9), expenses (6), structure-data (4) |
| `cloud-auth` | `getSupabaseClient`×87, `cloudSession`×41, `isCloudWriteReady`×19, `blockedByReadOnly`×16, `noteSyncCycle`×12 | sync (17), notif-push (6), shell (6) |
| `structure-data` | `CATEGORIES`×36, `SUBCATEGORIES`×30, `DICTIONARY`×30, `saveDictionaryLocal`×9, `saveDictionary`×9 | sync (28), storage (6), cloud-auth (4) |
| `monobank` | `awaitCloudGate`×5, `monoState`×5, `monoReady`×5, `closeMonoInbox`×3, `closeMonoScreen`×3 | notif-push (12), cloud-auth (9), expenses (5) |
| `accounting` | `populateBankDebtTable`×6, `populateInstallmentTable`×6, `EMPTY_STATE_ICONS`×2, `openInstallmentEditor`×2, `openCardDebtEditor`×2 | storage (21), payments (15), shell (13) |
| `storage` | `installmentAccounts`×70, `expenses`×45, `bankAccounts`×40, `selectedMonth`×40, `debts`×38 | sync (29), structure-data (12), diag (4) |
| `expenses` | `activeDebts`×25, `activeExpenses`×11, `editingRecordKey`×7, `switchAccountingTab`×7, `flashField`×7 | sync (15), sheets-forms (12), structure-data (11) |
| `service` | `reportSaveResult`×53, `pullTaxonomyTombstone`×7, `trashStateNow`×4, `autoSyncStale`×4, `openTrashScreen`×3 | expenses (45), sync (25), shell (14) |
| `sync` | `isCloudSessionReady`×21, `cloudFamilyId`×19, `saveBankAccounts`×7, `saveInstallmentAccounts`×7, `shadowNormalizeList`×6 | storage (37), expenses (22), notif-push (14) |
| `notif-push` | `showTextToast`×32, `showToast`×8, `updateNotifBell`×5, `closeTrashDetail`×5, `isNotifArchiveOpen`×4 | sync (33), monobank (18), diag (17) |
| `boot-initApp` | `updateRecSentCount`×1 | diag (17), shell (13), expenses (5) |

### Матриця (рядок використовує колонку, різних імен)
| | diag | structu | sync | storage | monoban | payment | cloud-a | notif-p | expense | account | structu | service | shell | analyti | sheets- | boot-in |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `diag` | · | · | 4 | 8 | · | 1 | 4 | 2 | 8 | 1 | · | 2 | 14 | 2 | 4 | · |
| `structure-data` | 1 | · | 28 | 6 | · | · | 4 | · | 3 | · | 1 | 2 | · | · | · | · |
| `sync` | 9 | 12 | · | 37 | 5 | 2 | 10 | 14 | 22 | 2 | 1 | 8 | 9 | · | 1 | · |
| `storage` | 4 | 12 | 29 | · | · | · | 3 | 1 | 2 | · | 1 | 1 | 2 | · | · | · |
| `monobank` | 4 | 2 | 3 | 4 | · | · | 9 | 12 | 5 | · | · | 1 | 4 | · | 4 | · |
| `payments` | · | 1 | 6 | 14 | · | · | · | 3 | 10 | 4 | · | 1 | 9 | · | 1 | · |
| `cloud-auth` | 3 | · | 17 | · | 1 | · | · | 6 | · | · | · | 4 | 6 | · | · | · |
| `notif-push` | 17 | 3 | 33 | 10 | 18 | · | 7 | · | 17 | 4 | 1 | 12 | 11 | · | 2 | · |
| `expenses` | 8 | 11 | 15 | 10 | 1 | · | · | 1 | · | · | 1 | 3 | 11 | 4 | 12 | · |
| `accounting` | · | 1 | 9 | 21 | · | 15 | · | 2 | 10 | · | · | 1 | 13 | 2 | 3 | · |
| `structure` | · | 3 | · | 1 | · | · | · | · | · | · | · | 1 | 3 | · | · | · |
| `service` | 7 | 6 | 25 | 12 | 2 | · | 10 | 12 | 45 | 5 | 1 | · | 14 | · | 6 | 1 |
| `shell` | 6 | · | · | 6 | 4 | 5 | 1 | 4 | 15 | 9 | 1 | 5 | · | 5 | 1 | · |
| `analytics` | 3 | 1 | · | 4 | · | 3 | · | · | 5 | 9 | · | · | 7 | · | · | · |
| `sheets-forms` | 3 | 4 | · | 1 | · | · | · | · | 6 | · | 3 | 1 | 9 | · | · | · |
| `boot-initApp` | 17 | 1 | 3 | 4 | · | · | 1 | 4 | 5 | · | · | 2 | 13 | · | · | · |

## 4. Код, що виконується при завантаженні
### 4.1 Оператори верхнього рівня (87)
Кожен вказаний із областями, імена з яких він використовує (безпосередньо й через виклики функцій, транзитивно; хибні збіги можливі). Усі, крім `initApp`, мають вигляд підписки на події (`addEventListener`), IIFE-ініціалізаторів `init*()`, одиничних викликів (`initSideNav()`, `updateTrashBadge()`, `purgeLegacyKeyboardKeys()`, …) і `setTimeout/setInterval`.

| Рядок | Область | Оператор | Потребує областей |
|---|---|---|---|
| 1859 | `diag` | `window.addEventListener('error', function(e){` | — (лише своя) |
| 1863 | `diag` | `window.addEventListener('unhandledrejection', function(e){` | — (лише своя) |
| 7221 | `storage` | `document.addEventListener('click', function(e){` | — (лише своя) |
| 8368 | `payments` | `(function initPaymentsScreen(){` | expenses(4) |
| 8666 | `cloud-auth` | `window.__netStats = NET_STATS;` | — (лише своя) |
| 9273 | `notif-push` | `document.addEventListener('visibilitychange', function(){ if(document.` | — (лише своя) |
| 9274 | `notif-push` | `window.addEventListener('pageshow', function(){ runPendingPushAction('` | — (лише своя) |
| 9275 | `notif-push` | `window.addEventListener('focus', function(){ runPendingPushAction('foc` | — (лише своя) |
| 9500 | `notif-push` | `window.addEventListener('hashchange', handleMonoHash);` | — (лише своя) |
| 9501 | `notif-push` | `window.addEventListener('pagehide', function(){ syncAppVisible(false);` | — (лише своя) |
| 9803 | `notif-push` | `document.addEventListener('visibilitychange', function(){` | — (лише своя) |
| 9806 | `notif-push` | `window.addEventListener('focus', pullAllOnResume);` | — (лише своя) |
| 11102 | `sync` | `document.addEventListener('keydown', function(ev){ if(!loginIsField(ev` | — (лише своя) |
| 11103 | `sync` | `document.addEventListener('click', function(ev){ try{ if(ev.target && ` | — (лише своя) |
| 11104 | `sync` | `['input', 'change'].forEach(function(evName){` | — (лише своя) |
| 13347 | `expenses` | `document.addEventListener('visibilitychange', function(){ if(document.` | — (лише своя) |
| 13348 | `expenses` | `window.addEventListener('focus', function(){ checkDayRollover('focus')` | — (лише своя) |
| 13349 | `expenses` | `setTimeout(scheduleMidnightCheck, 0);` | — (лише своя) |
| 13351 | `expenses` | `document.addEventListener('input', function(e){ if(e.target && e.targe` | — (лише своя) |
| 14563 | `accounting` | `document.addEventListener('click', function(e){` | — (лише своя) |
| 14741 | `structure` | `document.addEventListener('click', function(e){` | — (лише своя) |
| 14936 | `service` | `window.addEventListener('online', function(){ updateOnlineStatusUI(); ` | — (лише своя) |
| 14937 | `service` | `window.addEventListener('offline', updateOnlineStatusUI);` | — (лише своя) |
| 15657 | `shell` | `document.addEventListener('input', function(e){` | — (лише своя) |
| 15670 | `shell` | `document.addEventListener('paste', function(e){` | — (лише своя) |
| 15700 | `shell` | `document.addEventListener('focusout', function(){ setTimeout(flushRend` | — (лише своя) |
| 15793 | `shell` | `document.addEventListener('visibilitychange', function(){ if(document.` | — (лише своя) |
| 15794 | `shell` | `setInterval(checkForAppUpdate, SW_UPDATE_INTERVAL_MS);` | — (лише своя) |
| 15795 | `shell` | `setInterval(refreshUpdateBanner, 1500);` | — (лише своя) |
| 15796 | `shell` | `document.addEventListener('focusin', refreshUpdateBanner);` | — (лише своя) |
| 15797 | `shell` | `document.addEventListener('focusout', function(){ setTimeout(refreshUp` | — (лише своя) |
| 15959 | `expenses` | `document.addEventListener('touchstart', function(){ suggestLastTouchAt` | — (лише своя) |
| 15960 | `expenses` | `document.addEventListener('pointerdown', function(e){` | — (лише своя) |
| 16107 | `expenses` | `['touchstart', 'pointerdown'].forEach(function(ev){ document.addEventL` | — (лише своя) |
| 16108 | `expenses` | `['touchend', 'touchcancel', 'pointerup', 'pointercancel'].forEach(func` | — (лише своя) |
| 16195 | `expenses` | `(function initSaveGates(){` | — (лише своя) |
| 16378 | `expenses` | `document.addEventListener('focusin', onEditGuardFocusIn, true);` | — (лише своя) |
| 16393 | `expenses` | `['openJournal'].forEach(function(n){ guardEditOpener(n, 'open-journal'` | — (лише своя) |
| 16394 | `expenses` | `['openTrashScreen'].forEach(function(n){ guardEditOpener(n, 'open-tras` | — (лише своя) |
| 16395 | `expenses` | `['switchTab'].forEach(function(n){ guardEditOpener(n, 'tab-switch'); }` | — (лише своя) |
| 16396 | `expenses` | `['addExpense'].forEach(function(n){ guardEditOpener(n, 'add-expense');` | — (лише своя) |
| 16397 | `expenses` | `['openProfileLoginDrawer', 'openDebugRecordDrawer', 'openIncomeEditor'` | — (лише своя) |
| 17812 | `expenses` | `(function(){` | — (лише своя) |
| 17852 | `expenses` | `(function(){` | service(1) |
| 18596 | `analytics` | `window.addEventListener('load', dashKick);` | — (лише своя) |
| 18597 | `analytics` | `document.addEventListener('visibilitychange', function(){ if(document.` | — (лише своя) |
| 19907 | `shell` | `['pointerdown', 'keydown', 'touchstart'].forEach(function(ev){` | — (лише своя) |
| 20071 | `shell` | `(function initPressFeedback(){` | — (лише своя) |
| 20395 | `shell` | `document.addEventListener('focusin', onFieldAttrsFocusIn, true);` | — (лише своя) |
| 20521 | `shell` | `initSideNav();` | — (лише своя) |
| 20688 | `shell` | `window.addEventListener('resize', function(){ updateTabBubble(true); }` | — (лише своя) |
| 20761 | `shell` | `(function initScrollTopBtn(){` | — (лише своя) |
| 20816 | `shell` | `(function initTabbarSwipe(){` | — (лише своя) |
| 21142 | `shell` | `purgeLegacyKeyboardKeys();` | — (лише своя) |
| 21235 | `service` | `pruneVariants();` | — (лише своя) |
| 21278 | `service` | `applyAutofillGuard();` | — (лише своя) |
| 21279 | `service` | `initSegments();` | shell(4) |
| 21387 | `service` | `document.addEventListener('DOMContentLoaded', renderCloudEnvUI);` | — (лише своя) |
| 21437 | `service` | `updateTestingBadge();` | — (лише своя) |
| 21661 | `notif-push` | `(function initNotifReadQueue(){` | cloud-auth(5), monobank(3), sync(2) |
| 21757 | `monobank` | `document.addEventListener('click', function(e){ if(e.target.closest &&` | — (лише своя) |
| 21758 | `monobank` | `window.addEventListener('online', function(){ reloadOpenCloudScreens(f` | — (лише своя) |
| 21950 | `monobank` | `(function initMonoScreen(){` | expenses(4) |
| 22744 | `monobank` | `(function initMonoInbox(){` | expenses(4) |
| 23132 | `notif-push` | `(function initNotifArchive(){` | expenses(4) |
| 23954 | `service` | `(function initTrashScreenHandlers(){` | — (лише своя) |
| 23988 | `service` | `updateTrashBadge();` | expenses(8), storage(6), structure-data(3) |
| 24561 | `notif-push` | `try{ readPushDiagFlag().then(function(v){ jsErrPersistOn = !!v; }); }c` | — (лише своя) |
| 24930 | `service` | `document.addEventListener('click', function(e){` | — (лише своя) |
| 24962 | `service` | `updateChecksBadge();` | — (лише своя) |
| 24964 | `service` | `[2000, 9000, 25000].forEach(function(ms){ setTimeout(function(){ if(!c` | — (лише своя) |
| 24965 | `service` | `document.addEventListener('visibilitychange', function(){ if(document.` | — (лише своя) |
| 24966 | `service` | `window.addEventListener('online', function(){ checksRefreshShared(fals` | — (лише своя) |
| 25041 | `service` | `window.addEventListener('online', function(){ const d = document.getEl` | — (лише своя) |
| 25042 | `service` | `window.addEventListener('offline', function(){ const d = document.getE` | — (лише своя) |
| 25057 | `service` | `document.addEventListener('keydown', function(e){` | — (лише своя) |
| 25111 | `service` | `document.addEventListener('keydown', (e)=>{ if(e.key==='Escape'){ clos` | — (лише своя) |
| 25121 | `service` | `(function initDrawerSwipeToDismiss(){` | — (лише своя) |
| 25161 | `service` | `(function initRowEditPointer(){` | — (лише своя) |
| 25192 | `service` | `(function initEditCollapsePointer(){` | — (лише своя) |
| 25239 | `service` | `(function initExpenseRowSwipeActions(){` | — (лише своя) |
| 25425 | `shell` | `if(window.matchMedia){` | — (лише своя) |
| 25937 | `boot-initApp` | `(async function initApp(){` | sync(290), notif-push(157), expenses(146), storage(101), analytics(95) |
| 28510 | `boot-initApp` | `if('serviceWorker' in navigator){` | — (лише своя) |
| 28527 | `boot-initApp` | `if('serviceWorker' in navigator && (location.protocol === 'https:' \|\` | — (лише своя) |
| 28666 | `boot-initApp` | `if(document.readyState === 'loading') document.addEventListener('DOMCo` | — (лише своя) |
| 28666 | `boot-initApp` | `else recBgStart();` | diag(75), notif-push(29), cloud-auth(20), storage(12), service(6) |

### 4.2 `const`/`let` з виконанням під час завантаження
150 ініціалізаторів містять виклики, `new`, масиви чи об'єкти. Реальних міжобластевих залежностей часу завантаження (TDZ, коли ініціалізатор бачить інший `const`) **дві**:
1. `storage` ← `structure-data`: `BACKUP_LS_KEYS` (рядок 6910) і `DOMAIN_MIGRATION_KEYS` (7383) читають `LS_KEY_CATEGORIES`, `LS_KEY_SUBCATEGORIES`, `LS_KEY_SUBCATEGORY_PRIORITY`, `LS_KEY_DICTIONARY` (рядки 1949+). Файл `structure-data` має завантажитись раніше за `storage`.
2. `notif-push` ← `sync`: `TOAST_ICONS` (23214) складається з `SYNC_SLOT_CLOUD_D` і `SYNC_SLOT_BANG` (4985–4986, `SYNC_SLOT_CLOUD_D = CLOUD_ICON_D`). Файл `sync` — раніше за `notif-push`.
Решта знайдених залежностей (`ACCT_SEGMENT_NAMES⟵debts`, `NOTIF_ICON_SVG⟵expenses`, `MERGE_DOMAINS⟵expenses/…`) — хибні: збіг ключа об'єкта чи рядка з назвою змінної або звернення лише в тілах функцій (виконується пізніше). Два `const`, що читають середовище при завантаженні, — `CLOUD_ENV` (8533, `location`, прапорець `localStorage`) і `IS_IOS_RUNTIME` (21131, `navigator`): від операторів верхнього рівня вони не залежать, тож перенесення їх не змінює.

### 4.3 Висновок для порядку
* Оголошення функцій видно лише після завантаження свого файлу; `const`/`let` — лише після виконання свого рядка. **Усі 87 операторів лишаються в основному inline-скрипті** (у тому самому порядку), який завантажується ПІСЛЯ всіх `js/*.js`: тоді кожен оператор бачить усі функції й `const` усіх областей, і жодна залежність часу завантаження не порушується. Це й є ключове рішення порядку: файли областей містять лише оголошення (функції, `const`, `let`), оператори й `initApp` лишаються inline до STRUCT-4.
* Єдині обмеження порядку між файлами областей: `structure-data` < `storage`, `sync` < `notif-push`. Ці ж обмеження діють у проміжних станах: область з `const`, що залежить від іншої, переносять **після** тієї, від якої вона залежить (інакше тимчасово ініціалізатор побачить ще не завантажене).
* Рівні залежності без обмеження часу завантаження (виклики функцій у тілах функцій) порядку файлів не вимагають: усе доступне до першої події.

### 4.4 Клавіатура поза `initApp`
13 глобальних функцій клавіатурного кола лежать не в `initApp`: діагностика клавіатури (`kbIsIphone`, `kbgDeviceClass`, `kbgR`, `kbgSnapshot`, `kbgMeasure`, `kbStickyBarOf`, `kbgSettleTimer`, `kbgSchedule`, `focusNeighborsOf`, рядки 11732–11919), `keyboardFieldActive` (15683), `kbGuardSkipped`, `kbGuardNote`, `kbSheetUsesProxy` (25450–25456). Їх **не переносимо** до STRUCT-4: лишаємо inline (виняток при перенесенні областей `diag`, `shell`, `sheets-forms`).

## 5. Порядок файлів і ревізії
Лише оголошення переносяться; тег `<script src="./js/<область>.js?v=<APP_VERSION>">` ставиться перед основним inline-скриптом у кінцевому порядку:

`util-*` → `structure-data` → `storage` → `cloud-auth` → `sync` → `diag` → `shell` → `structure` → `analytics` → `payments` → `sheets-forms` → `monobank` → `notif-push` → `accounting` → `service` → `expenses` → (inline: оператори й `initApp`).

Послідовність ревізій (від найменш пов'язаної до найбільш; кожна — окремий Rev; нижче в дужках клас ревізії):
| № | Область | Рядків | Клас | Примітка |
|---|---|---|---|---|
| 3a | інфраструктура | — | A | `readIndexWithCss()` вбудовує й `js/*.js`; кодмод для ~44 тестів, що читають `index.html` напряму; `scope-guard`; `scripts/struct3-move.js` (як `struct2-move.js`, по області); перевірка порядку `scripts/struct3-check-load.js` (повтор цього аналізу, падає при порушенні) |
| 3b | `structure` | 180 | A | найменше зв'язків (12 імен) |
| 3c | `analytics` | 1536 | A | |
| 3d | `shell` | 1430 | A | 17 операторів лишаються inline; `keyboardFieldActive` лишається |
| 3e | `payments` | 664 | B | читає/пише дані через `storage`, без синхронізації |
| 3f | `diag` | 1475 | B | самописець, журнал помилок; 9 функцій клавіатурної діагностики лишаються |
| 3g | `sheets-forms` | 403 | C | поруч із клавіатурою; 3 `kb*` лишаються |
| 3h | `cloud-auth` | 346 | C | `getSupabaseClient`, `cloudSession` — основа для sync/Monobank |
| 3i | `structure-data` | 495 | C | дані; обов'язково перед `storage` |
| 3j | `monobank` | 1191 | C | мережа/RPC |
| 3k | `accounting` | 986 | C | дані, запис |
| 3l | `storage` | 986 | C | після `structure-data` |
| 3m | `expenses` | 2519 | C | найбільший за зв'язністю серед предметних; можливий поділ (додавання/чернетка, журнал, видалені дані) |
| 3n | `service` | 2083 | C | Excel-імпорт змінює дані; кошик; налаштування |
| 3o | `sync` | 4359 | C | найбільший і найзв'язаніший; поділ на `sync-core`, `sync-push`, `sync-pull`, `sync-merge`, `sync-sched` окремими під-ревізіями |
| 3p | `notif-push` | 2055 | C | лише після `sync` (`TOAST_ICONS`) |
Після 3p в `index.html` лишаються inline-оператори (87) і `initApp` (≈ 2,7 тис. рядків) — це STRUCT-4.

Умова для кожної ревізії: перенесення дослівне (разом із власними коментарями); перед комітом `struct3-check-load.js` зелений; `node --test`, `e2e:smoke`, порівняння обчислених стилів і знімків (0 різниць), перевірка відсутності помилок виконання в браузері, офлайн-імітація `sw.js`. Для класу C додатково E2E зміненої області та `spec-reviewer`.

## 6. Тести й E2E
* **`tests/extract.js`.** `SOURCE` уже складається з `js/util-*.js` + `index.html` (STRUCT-2). Розширити: список файлів береться з усіх `<script src="./js/…">` у порядку підключення, тож `extractFunctionSource/extractConstSource` знаходять функції в будь-якому файлі області без змін у тестах.
* **Тести, що читають `index.html` напряму** (≈ 100 файлів; 56 уже через `readIndexWithCss()`): `readIndexWithCss()` додатково вбудовує вміст `<script src>` на місце тегів (як для стилів), решту ~44 переводить кодмод (як у STRUCT-1). Перевірки, що шматують текст між сусідніми функціями (як у STRUCT-2 `upcoming-payments`), правляться точково.
* **`tests/scope-guard.test.js`.** Читає `index.html`, відрізає `initApp` і шукає в решті тексту звернення до його локальних імен. Після перенесення «решта» = `index.html` + усі `js/*.js` (читати через той самий вбудований текст), логіка перевірки й `KNOWN_OUTSIDE` не змінюються. `initApp` лишається inline, тому шукання `(async function initApp(){` працює.
* **E2E (Playwright).** Сервер статичний, нові файли віддаються без змін; WebKit-сценарії не читають текст `index.html`, окрім `keyboard.spec.js` (перевірка тексту CSS → через помічник). `e2e/ds-compare.spec.js` і `scripts/ds-compare.js` перевіряють вигляд.
* **`sw.js`/гачок.** У `APP_SHELL` додаються нові файли; network-first і `ignoreSearch` для `/js/*.js` уже є; `pre-push-guard` і `tests/css-links.test.js` уже перевіряють мітку `?v=` у `<script src>` (список файлів у тесті оновлювати).

## 7. Ризики
1. **Порядок завантаження.** Закрито рішенням п. 4.3 (оператори й `initApp` — після всіх файлів) і автоматичною перевіркою `struct3-check-load.js`.
2. **Хибні й справжні залежності.** Аналіз консервативний; справжні TDZ-залежності (2) відомі.
3. **Кількість запитів.** До ~16 файлів замість одного: мережа-спочатку, кеш service worker; на PWA прийнятно, але перше завантаження без кешу робить більше запитів.
4. **Номери рядків у діагностиці.** Помилки з `js-error` отримають інше ім'я файлу й номер рядка; `docs/CODE_MAP.md` посилається на назви функцій, а не на рядки.
5. **Дублі глобальних імен.** Кожне ім'я лишається унікальним (перенесення дослівне).

Чекаю підтвердження плану; код не змінювався.
