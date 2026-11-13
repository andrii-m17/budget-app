# AUDIT-1: аудит клієнта Money Tree

Клас A (дослідження). Код, стилі й тести не змінювались. Знято 13.11.2026 з коміту `0672c03` (APP_VERSION 2.32.296). Мережу, швидкість і старт виміряно на моку (`?fixture=typical`, `NET_STATS`), у браузері й у WebKit (Playwright, 390×844, SW вимкнено); до робочої бази запитів не було. Структуру й посилання виміряно парсером `acorn` (AST); «немає посилань» означає «жодної згадки слова в коді, HTML, `sw.js`» (динамічні імена можуть давати хибні спрацювання, тому це кандидати). Усі дані синтетичні.

## 1. Розмір і будова
| Частина | Рядки | Байти |
|---|---|---|
| `index.html` разом | 30 933 | 2 730 579 |
| головний скрипт (рядки 4593–30930) | 26 338 | 2 221 920 |
| CSS (рядки 74–3000) | 2 927 | 345 890 |
| HTML (тіло, рядки 3001–4592, і решта) | ≈ 1 630 | ≈ 159 484 |
| початковий скрипт (рядки 5–41) | 37 | 3 285 |
| `sw.js` | 382 | 28 383 |

- Функцій верхнього рівня **1539** (257 async); усіх функцій з вкладеними **3711** (1551 анонімна); глобальних `const`/`let` **508** (310/198); IIFE верхнього рівня 17; рядків коментарів 7482 (7117 коментарів, ≈ 28% скрипта).
- Медіана довжини функції верхнього рівня 6 рядків; понад 100 рядків 18 функцій, понад 200 рядків 5.
- **`initApp` це одна функція на 2508 рядків (28255–30762), ≈ 9,5% скрипта**; усередині живе клавіатурний модуль.

20 найбільших функцій:
| Функція | Рядків | Межі |
|---|---|---|
| initApp | 2508 | 28255–30762 |
| renderDashboard | 429 | 21833–22261 |
| handleImportFile | 340 | 17755–18094 |
| onload (в handleImportFile) | 319 | 17773–18091 |
| initTabbarSwipe | 232 | 23526–23757 |
| pullExpensesCore | 160 | 8555–8714 |
| buildRecordGroupsHtml | 139 | 20113–20251 |
| playDashboard | 129 | 21362–21490 |
| renderProfileUI | 126 | 13505–13630 |
| saveInstallmentDrawer | 121 | 16416–16536 |
| enterKbSheet | 120 | 29173–29292 |
| syncAllPilotManual | 118 | 13387–13504 |
| pushDictionaryPilotRun | 116 | 5917–6032 |
| performSwitchTab | 110 | 23247–23356 |
| renderNotificationsDrawer | 104 | 26461–26564 |
| initExpenseRowSwipeActions | 104 | 27557–27660 |
| pushCategoriesPilot | 99 | 5012–5110 |
| pullDebtsCore | 98 | 8820–8917 |
| startSheetAnimSampler | 96 | 28930–29025 |
| applyCloudSession | 94 | 11624–11717 |

Логічні області (межі за `docs/CODE_MAP.md`, звіреними з AST; банери в коді позначають ревізії, не області): id і міграція ≈ 5640–5740 і 10190; push/pull і злиття ≈ 4960–9600 (`push*Pilot`, `pull*Core`, `md*`, `exp*`); Cloud, auth, `NET_STATS`, `countingFetch` ≈ 11300–11700; синхронізація, realtime, `syncCheck`, `planSync` ≈ 12235–12870; профіль і ручна синхронізація ≈ 13380–13630; форми й чернетки ≈ 15400–16540; імпорт і резервні копії ≈ 9700–9870 і 17230–18100; Аналітика/дашборд ≈ 21360–22260; Журнал і кошик ≈ 19100–20250 і 24150–26270; Monobank ≈ 24400–25200; сповіщення й push ≈ 25300–26830; жести ≈ 23250–23760 і 27440–27660; клавіатура й листи ≈ 27810–29300 (в `initApp`). Таблиці областей з точними межами не будував.

## 2. Мертвий код (кандидати)
- **Функцій верхнього рівня без посилань: 36 із 1539 (143 рядки).** 28 з них лише в тестах: `showJsErrorsLog` 4725, `pullCategoriesPilot` 5275, `idEnsureClientId` 5684, `findLiveDictionaryRow` 6040, `pullSubcategoriesPilot` 6171, `expFieldEq` 7531, `expMerge` 7532, `expSetFromSnap` 7533, `expMergeServerRow` 7535, `expRecordConflicts` 7955, `pullBankAccountsPilot` 9155, `pullInstallmentAccountsPilot` 9358, `pullHiddenEntitiesPilot` 9591, `lastKnownBalance` 10518, `ppModeAmount` 10553, `payPlural` 10857, `payUnconfirmedLadder` 10888, `applySyncMarker` 12702, `kbIsIphone` 14307, `fromMinorUnits` 18240, `renameRecordsStamp` 19384, `shouldAnimateSegment` 21595, `incompleteReasons` 22961, `notificationRowStyle` 25212, `reminderPending` 25255, `shouldShowToast` 25634, `successToastPlacement` 25636, `toggleDeliveryDiagFromTesting` 26627.
- **Без коду й без тестів: 8:** `backupArrayCount` 9856, `incomeCountWord` 9862, `debtCountWord` 9868, `acctSelector` 21648, `toggleExperiment` 24000, `showNetStats` 24102, `openDebugRecordFromTesting` 24135, `resetAllTestVariantsFromUi` 24143.
- Глобальні лише з визначенням: 5 із 508: `ID_MIGRATE_LAST` 5694, `SYNC_SLOT_SYNCING_MS` 7800, `BUTTON_MODIFIER_CLASSES` 22801, `NOTIFICATIONS_STAGE2_ENABLED` 26311, `APP_MODAL_DEFER_MAX_MS` 27786. Вкладені: `upgrade` 10155, `kbCaretShow` 28645, `settledPosition` 28910.
- CSS: класів 691, **39 без жодного літерального використання**: `t-info t-warning t-error month-picker total-row bank-debt-row bdr-actions add-bank-row amount-input disabled-soon import-card import-title import-desc role-obligatory role-flexible role-reducible exp-date kpi-sub t-ob t-fl t-re struct-item s-name s-parent info-note info-note-icon kw-row kw-tag kw-target n-row-sub n-status n-status-hint n-row-state n-diag-list chk-state n-readonly-note test-section-sub update-dot bdr-amount`. `#id` у CSS 28, невикористаних 0. `@keyframes` 18, невикористаних 0.
- Токени: 110 визначено (188 визначень), **19 не використовуються**: `--color-expense --color-expense-bg --space-1…--space-9 --motion-micro --motion-count --motion-chart --motion-bars --motion-card --ui-h-control --ui-min-target --ui-glass-border`. Задаються з JS (не в CSS): `--toast-top --portrait-w --base-vh --sheet-max-h --sheet-lift --kb-pipe-ms --sheet-vvtop --row3-col-1…3 --seg-x --seg-y --vv-offset-top` та ін.
- Залишки знятих можливостей в `index.html`: `TRASH-TEST` 1 згадка (коментар 5448; ще у 4 файлах тестів); `Family Bridge` 4 коментарі (4999, 6735, 15554, 22347); Notion 0 (лишилися `docs/NOTION_BRIDGE.md` і навичка); самописець: 128 згадок `debugRecording*` (ручний режим із таймером у `setInterval`, рядок 14716, живий; чи його ще потрібно залишати, рішення власника); `client_debug_logs` 18 згадок.

## 3. Дублі
- **CSS:** правил 1465; px-значень поза `:root` 1944 (107 унікальних; найчастіші 8px ×141, 12px ×141, 16px ×130, 10px ×121, 1px ×119, 14px ×118); `#hex` 98 (52 унікальні; `#fff` ×26); `rgb()/rgba()` 75 (45 унікальних; зелений `rgba(34,197,94,…)` у 4 відтінках 16+ разів); `var(--…)` 1160 використань; **31 група правил з ідентичним тілом (48 зайвих копій)**.
- **JS (форматування):** `Intl.NumberFormat` 8, `Intl.DateTimeFormat` 2, `toFixed` 57, `new Date(` 135, `toISOString().slice` 3; допоміжних форматерів 8 (`fmt` 18167, `fmtSigned` 18168, `formatThousands` 18177, `formatAmountBlur` 18264, `fmtSignedPercent` 22331, `formatTrashShortDate` 20089, `formatTrashDeletedAt` 20094, `formatLastEvent` 24403). Чи збігається їхня логіка (суми, дати), не звірено.
- **JS (розмітка):** `.innerHTML =` 104, `escapeHtml(` 95 викликів; `insertAdjacentHTML` 0; inline-стилі з px у JS: `style.*px` 39 і шаблони `style="…px` 5.
- Дублі рядків списків і шторок кількісно **не виміряно, причина: потрібне семантичне порівняння, а не лічильник**.

## 4. Мережа
Виміряно на моку (`NET_STATS`, `typical`).
| Ситуація | Запитів | Склад |
|---|---|---|
| холодний старт, порожнє сховище | 70 | 26 GET + 44 POST: `categories` 11, `subcategories` 10, `dictionary` 23 (засівання), GET `categories`/`subcategories`/`dictionary` по 4 |
| старт із наповненим сховищем | 6 (в окремих прогонах 4) | `family_members` 1, `users` 2, `sync_heads` 1, `mono_inbox` 1, `client_debug_logs` 1 |
| відкриття кожної з 5 вкладок | 0 | |
| повернення з фону через > 30 с | 2 | `sync_heads` + `mono_inbox` |
| додавання витрати | 4 | POST `expenses` 1 + `sync_heads` 1 + GET `expenses` 2 |
| редагування витрати | 4 | PATCH 1 + `sync_heads` 1 + GET 2 |
| видалення витрати | 4 | PATCH 1 + `sync_heads` 1 + GET 2 |

Повернення з фону до 30 с: не виміряно, діє `SYNC_MIN_CHECK_MS = 30 с` (12866). Відкриття екрана Monobank: 2 запити (`mono_connections`, `mono_accounts`) за кодом 24476–24479, окремо не вимірювалось.
- Константи: повна звірка раз на 24 год (`SYNC_FULL_INTERVAL_MS`), мінімальний інтервал 30 с, згортання Realtime 1,5 с, перекриття дельти 2 с.
- **Таймери:** `setInterval` 4: 14716 (кнопка запису, 1 с, лише поки записується), 17747 (опитування модалки імпорту, короткочасно), 18438 (`checkForAppUpdate`, 6 год, не частіше разу на 60 с, робить `swRegistration.update()`), **18439 (`refreshUpdateBanner`, кожні 1,5 с постійно, без мережі)**. `setTimeout` 132 місця, `requestAnimationFrame` 32, обробників `visibilitychange` 11, `online/offline/focus/pageshow` ≈ 25.
- **Realtime:** 2 канали: `family-sync-<сім'я>` (postgres_changes для 9 синхронізованих таблиць) і `user-notifications-<користувач>` (`user_notifications`).
- Оптимізаційні факти: кожен запис витрати дає `sync_heads` і 2 GET `expenses` після власного POST/PATCH (на моку); чи так само на реальній базі, перевірити (там може додаватись ехо Realtime).

## 5. Швидкість (WebKit, мок, 3 прогони, медіана)
- Перше перемальовування `#analytics-body` (перша зміна DOM від початку навігації): **238 мс холодно, 57 мс з наповненим сховищем**. DOMContentLoaded: 240–600 мс холодно, ≈ 80 мс тепло.
- Остання зміна DOM в `#analytics-body`: **1042 мс холодно, 1355 мс тепло**; за цей час **≈ 1000 (холодно) – 1700 (тепло) мутацій DOM** (анімація лічильників дашборда, `playDashboard`).
- Довгих завдань (>50 мс, `longtask`) у прогонах не зафіксовано.
- Найважчі перемальовування за розміром коду: `renderDashboard` 429 рядків, `buildRecordGroupsHtml` 139 рядків; по часу окремо **не виміряно**.
- Що читається зі сховища на старті: у чистому профілі 9 ключів `localStorage` (≈ 1,2 КБ); обсяг даних в IndexedDB на старті **не виміряно**.

## 6. Тести
- **2114 тестів: 2111 пройдено, 0 падінь, 3 `todo`** (одне з них: `A1-5` відсутність Content-Security-Policy); файлів тестів 186, рядків 24 838. Повний `node --test`: **30,8 с** стіною (75 с процесорного часу, паралельно).
- 10 найповільніших: 4386 мс «246-12: діалог імпорту: технічний збій»; 2002 мс «IndexedDB діагностики не відповідає…»; 2002 мс «sw.js push (NOTIF-3): IndexedDB журналу ніколи не відповідає»; 1233 мс «PAGING-1 №1/№6»; 1048 мс «індекс сервера: усі рядки при n = 0…5000»; 774 мс «системне сповіщення… handlePushAction»; 728 мс «кільцевий журнал: не більше 200 подій»; 332 мс `awaitCloudGate`; 320 мс «кільце ≤ 50»; 307 мс «два пристрої (bank_accounts)». Понад 1 с лише 5, понад 100 мс 66; повільні це справжні тайм-аути в тестах.
- **Нестабільні:** E2E 44, 45, 51 (`e2e/keyboard.spec.js:236, 300, 450`): причина за `docs/STATUS.md:21`: залежать від реальних кадрів, мають перейти на кероване значення часу. Також сценарій 17 (`e2e/scenarios.spec.js`, таймаут 40 с у `editAmountUI`, `docs/E2E.md`).
- **Покриття за згадками імен у тестах:** 1263 із 1539 функцій верхнього рівня згадано; **276 (2560 рядків) ні разу**. З критичними назвами (пошук за `restore/import/merge/pull/push/trash/installment/backup…`) без згадок **29**: `openTrashDetail` 25848, `trashRowHtml` 24188, `payInstallmentQuick` 16348, `renderInstallmentLinkHint` 15419, `restoreExpenseDraft` 15821, `showPurgeConfirm` 26016, `performRestore` 10051, `restoreTrashRecord` 25756, `pullAllOnResume` 12452, `createRestoreSafetySnapshot` 9839 та ін. Без згадок і понад 40 рядків: `renderDebtDonut` 63, `renderTestingDrawer` 60, `goToDiagnosticIssue` 54, `openTrashDetail` 48. Фінансове ядро й синхронізація (`carry`, `merge`, `planSync`, `monthAggregates` тощо) у тестах згадані. Згадка імені не доводить покриття гілок: це нижня оцінка прогалин.

## 7. Обробка помилок
- Блоків `catch` 425; **порожніх `catch{}` 175 (41%)**; порожніх `.catch(fn)` 23. З 175 порожніх 43 стоять поза іменованими функціями (IIFE, зокрема `initApp`); по 2–5 у `recordJsError` (5), `closeOpenSheetsForPush` (4), `cleanupOrphanHiddenOnce`, `rsUndo`, `performRestore`, `pushHighlightStop`, `handlePushAction`, `runSyncCheck`, `loadFamilyUsersDirectory`, `clearLocalAccountData`, `revokeDevicePushSubscription`, `performSignOut` по 2.
- Локальне збереження: помилка доходить до користувача через `reportSaveResult` (17412): банер «Не вдалося зберегти зміни». Cloud-запис: пакет витрат при збої падає у запис по одному (`catch` з коментарем, 8233), помилка повертається як `{failed, firstError}`; чи кожне місце показує її користувачу, окремо **не виміряно**. `swRegistration.update().catch(function(){})` (18416) ковтає помилку оновлення SW мовчки.

## 8. Відомі прогалини
- `TODO`: 4 «name-based reconciliation» (8945, 9077, 9177, 9279); FIXME 0; `console.warn/error` 137 (клієнт) і 5 (SW).
- `docs/STATUS.md` «У роботі»: нестабільні тести клавіатури 44/45/51; набір K1–K3 (K2 і Крок 0 для K3); журнал помилок JS і аудит консолі; чекліст перевірок iPhone; наскрізні тести й CI з гілкою `dev`; міст Notion «якщо обрано» (суперечить `CLAUDE.md`: Notion не використовується); автододавання впевнених покупок Monobank (чекає рішень); підключення Користувача Б; backlog: довідник логотипів банків, прив'язка за id (етапи 2–3), початковий стан без стандартних карток (крок B).
- MONO-ACC: показ `last_error = unknown_account` на екрані Monobank (клієнтський Rev класу B після макета); поки що користувач не бачить причини.
- «Чекає перевірки на iPhone» у STATUS: багато пунктів з 2.32.187 і далі; кількість **не пораховано**.
- Три `todo`-тести аудиту; серед них відсутній CSP (`tests/audit-a1.test.js:65`).
- **Мітка «не запушено» стоїть у 117 рядках ROADMAP і 89 рядках STATUS, хоча `origin/main` збігається з локальним `main`** (мітки застаріли).

## 9. Клієнт і сервер
- **Таблиці (19):** `categories`, `subcategories`, `dictionary`, `bank_accounts`, `installment_accounts`, `hidden_entities`, `expenses`, `incomes`, `debts` (синхронізація); `notification_settings`, `mono_inbox`, `push_subscriptions`, `user_notifications`, `family_members`, `users`, `client_debug_logs`, `mono_connections`, `mono_accounts`, `push_delivery_log`.
- **RPC (10):** `sync_heads` (12476), `claim_push_subscription` (11753, 26776), `mark_notifications_read` (24349, 25522), `mono_accept` (24893), `mono_ignore` (24932), `mono_refund_candidates` (25140), `mono_apply_refund` (25169), `delete_notification` (25491), `clear_notifications` (25537), `start_test_push_series` (26818).
- **Edge Functions з клієнта:** `mono-connect` (24587, 24634), `send-test-push` (27320). `send-push-notification` клієнт не викликає (коментар 26310), `mono-webhook`, `mono-health` теж ні.
- **Realtime:** 2 канали (розділ 4). Прямих `fetch(` 2 (у `countingFetch`, 11492–11494). Зовнішні скрипти: `xlsx` (cdnjs, рядок 73), `idb` (jsdelivr, 10123), `supabase-js@2.119.0` (jsdelivr, 11313).
- **Тестові функції сервера:** `start_test_push_series` **викликається**: з блоку діагностики push (серія тестових push, `index.html:26794–26830`, екран «Тестування»); `send-test-push` викликається (27320). **`push_latency` і `ping` у клієнті й `sw.js` не згадуються (0 посилань)**; таблицю `push_test_series` клієнт не читає (лише коментар 26794).

## 10. Документи
- `docs/CODE_MAP.md`: шапка «Rev 2.32.248», поточна 2.32.296; **усі 54 імені з номерами рядків існують у коді**, але номери зсунулись: медіана відхилення 147 рядків, p90 970, максимум 1195; жоден не в межах 50 рядків; понад 1000 рядків 5. Карту вже позначено «орієнтовні», проте її чекліст «оновлюй карту в тому самому коміті» не виконується.
- `docs/ROADMAP.md`: 14 026 рядків, 2,05 МБ (читається лише вибірково); `docs/STATUS.md` 223 рядки, 65 КБ; `docs/SUPABASE_POLICY.md` 49 КБ; `docs/UI_PATTERNS.md` 57 КБ.
- Суперечать коду або `CLAUDE.md`: `docs/NOTION_BRIDGE.md` і навичка `notion-bridge` (позначені застарілими, але STATUS досі веде пункт про міст Notion); мітки «не запушено» (розділ 8); `docs/SCENARIOS.md` останній раз змінювався 16.10 (не відображає нових осей, напр. Monobank-добір).
- Не звірено, причина: потрібне читання кожного файлу: `PROJECT_SPEC.md`, `DESIGN_SYSTEM.md`, `UI_PATTERNS.md` проти коду.

## 11. Варіанти структури
Факти, що обмежують вибір: `index.html` без збірки; Pages віддає статику з `main`; `sw.js` кешує `APP_SHELL` (5 ресурсів), додані файли треба вписувати в нього й у `CACHE_NAME`; `tests/extract.js` вирізає функції з `index.html`; `const`/`let` читаються через `evalInSandbox`; `scope-guard.test.js` стежить, що клавіатурний модуль недосяжний із глобального коду.

| Варіант | Як | Плюси | Мінуси й ризики | Обсяг |
|---|---|---|---|---|
| **A. Класичні `<script src>` без модулів** | Винести CSS у `styles.css`, початковий скрипт і головний скрипт розрізати на ≈ 12–15 файлів за областями розділу 1; той самий глобальний обсяг, порядок підключення фіксований | Механічно, семантика не змінюється; працює на Pages без збірки; офлайн: додати файли в `APP_SHELL`; інкрементально (спершу CSS = 12,7% розміру) | Глобальні змінні лишаються; залежності від порядку; `extract.js` і гачки мають читати кілька файлів; `initApp` на 2508 рядків лишається монолітом до окремого розбиття | L (по етапах S–M) |
| B. ES-модулі (`type=module`) | Справжні `import/export`, без глобальної області | Чисті межі, видимі залежності | Ламає тести (`evalInSandbox`), inline-обробники, клавіатурний модуль усередині `initApp`; переписування майже всього | L+ (дуже ризиково) |
| C. Збірка (esbuild) у один файл | Розробка в модулях, на Pages віддається зібраний `index.html`/`app.js` | Мале завантаження, чиста розробка | Порушує принцип «без збірки» з `CLAUDE.md`; потрібна збірка в CI або закомічений результат; тести | L |

**Рекомендація: A, у порядку:** (1) `styles.css` (346 КБ), (2) чисті допоміжні функції без DOM (їх уже вирізають тести), (3) області синхронізації/Monobank/кошика/імпорту, (4) `initApp` останнім і окремим завданням класу C. Кожен крок з окремою ревізією, оновленням `APP_SHELL` і `CACHE_NAME`.

## Підсумкова таблиця знахідок (за впливом)
| Код | Область | Що | Доказ | Вплив | Обсяг | Клас |
|---|---|---|---|---|---|---|
| F-01 | Структура | `initApp` одна функція на 2508 рядків (клавіатура всередині), все в одному скрипті на 26 338 рядків | `index.html:28255–30762`; розділ 1 | високий | L | C |
| F-02 | Мережа | Кожне додавання, редагування й видалення витрати дає 4 запити (запис + `sync_heads` + 2 GET `expenses`) | `NET_STATS` на моку, розділ 4 | високий | M | C |
| F-03 | Помилки | 175 порожніх `catch{}` (41% з 425) і 23 порожні `.catch(fn)`; помилки в 43 місцях IIFE не діагностуються | розділ 7 | високий | M | B |
| F-04 | Офлайн | Excel-імпорт, `idb` і `supabase-js` беруться з CDN; Excel SW свідомо не кешує | `index.html:73, 10123, 11313, 17375` | середній | S–M | B |
| F-05 | Мережа | Холодний старт з порожнього сховища: 70 запитів, з них 44 POST (засівання довідників) | розділ 4 | середній | M | C |
| F-06 | Тести | 29 функцій з критичними назвами без згадок у тестах (кошик/відновлення/страховий знімок/`pullAllOnResume`/швидка оплата ОЧ) | розділ 6 | середній | M | A |
| F-07 | Тести | Нестабільні E2E 44, 45, 51 і сценарій 17; залежність від реальних кадрів | `e2e/keyboard.spec.js:236, 300, 450`; `docs/E2E.md` | середній | M | A |
| F-08 | Дизайн-система | 1944 px-значення (107 унікальних), 98 `#hex` + 75 `rgba` поза токенами; 19 токенів не використовується | розділ 3, 2 | середній | L | B |
| F-09 | Швидкість | Анімація дашборда: ≈ 1000–1700 змін DOM за ≈ 1 с після першого показу | розділ 5 | середній | M | B |
| F-10 | Документи | `CODE_MAP.md` на Rev 2.32.248 (відхилення рядків: медіана 147, p90 970); ROADMAP 2,05 МБ | розділ 10 | середній | S | A |
| F-11 | Безпека | У `index.html` немає Content-Security-Policy (3 `todo`-тести аудиту) | `tests/audit-a1.test.js:65` | середній | M | C |
| F-12 | Монобанк/UI | Користувач не бачить `last_error = unknown_account` (чекає макета) | розділ 8 | середній | S | B |
| F-13 | Ресурси | `setInterval(refreshUpdateBanner, 1500)` працює постійно, без мережі | `index.html:18439` | низький | S | A |
| F-14 | Документи | Мітка «не запушено» у 117 рядках ROADMAP і 89 рядках STATUS при синхронному `origin/main` | розділ 8 | низький | S | A |
| F-15 | Мертвий код | 36 функцій і 5 констант без посилань (8 функцій ще й без тестів) | розділ 2 | низький | S | A |
| F-16 | CSS | 31 група ідентичних правил (48 зайвих копій), 39 невикористаних класів | розділ 3, 2 | низький | S | A |
| F-17 | Сервер | `push_latency`, `ping` клієнт не викликає; `start_test_push_series` викликається лише з екрана «Тестування» | розділ 9 | низький | S | C |
| F-18 | Код | 4 TODO про ризик злиття за назвою (8945, 9077, 9177, 9279) | розділ 8 | низький | S | C |
| F-19 | Документи | Міст Notion (документ, навичка, пункт STATUS) суперечить `CLAUDE.md` | розділ 8, 10 | низький | S | A |
| F-20 | Тести | 5 тестів понад 1 с через реальні тайм-аути (4,4 с, 2×2 с, 1,2 с, 1,0 с) | розділ 6 | низький | S | A |

Не виміряно (причина): повернення з фону до 30 с; запити екрана Monobank окремо; час окремих перемальовувань; обсяг IndexedDB при старті; кількість пунктів «Чекає перевірки на iPhone»; семантичні дублі списків і шторок; звірка `PROJECT_SPEC`/`DESIGN_SYSTEM`/`UI_PATTERNS` з кодом.
