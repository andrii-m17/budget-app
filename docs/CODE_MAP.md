# Карта коду Money Tree (`index.html`, Rev 2.32.248)

Номери рядків орієнтовні (зсуваються з правками): шукай за назвою функції (`grep -n "function name"`). Оновлюй карту, коли змінюєш описану тут частину.

## Конвеєр клавіатури й листів (єдиний для всіх `.drawer` і `.app-modal`)
- `kbSheetHostOf` 27814: хост логіки; будь-яке поле всередині `.drawer, .app-modal` автоматично на конвеєрі. Окремих гілок на форму немає (з Rev 2.32.248 прибрано стару формулу iPhone й гілку входу).
- `beginKbFocusProxy` 28483: перший дотик → проміжне поле `kb-focus-proxy` → передача фокуса на справжнє поле. `handleKeyboardFieldFocusIn` 28953: перемикання між полями, `runProxySwitchTrick`.
- `enterKbSheet` 28582 → `kbPipeEnter` 28685 → `kbPipeAnimate` 28700: автомат відкриття (armed → measuring → animating → settled); підйом = `computeSheetLift` 28765 за живим `visualViewport`, низ листа `kbRestBottomLayout` 28771; `updateKbSheetGeometry` 28784; `kbEnsureFieldVisible` (~28695): прокрутка поля в видиму область всередині листа (ландшафт).
- `exitKbSheet` 28869: закриття; слухач `visualViewport resize`: поки `kbFocusInTextField()`, кадри «закрито» ігноруються (Rev 2.32.259, таймера 250 мс нема); так само виходить `updateKbSheetGeometry`. `kbResetOnBackground` (Rev 2.32.258): hidden/pagehide → blur + `handleKeyboardFieldFocusSettle`. `kbWinDiag`: діагностичні події вікна/фокуса/висоти (`kb-win-focus`, `kb-win-blur`, `kb-visibility`, `kb-vv-resize`, `kb-transient-hide`).
- Обгортки для глобального коду: `kbSheetUsesProxy`, `focusCardFieldSafe` (~27270). Сценарій згортання: `npm run e2e:ios:bg` (`e2e/ios/kb5.mjs`). Push-клік у SW: `notificationclick` + `openForPush` (`sw.js`), тест `tests/push-tap-sw.test.js`. Тести: `tests/pilot-repository.test.js` (`kbSheetSandbox`, `pipeSandbox`), `e2e/ios/run.mjs` (симулятор).

## Ідентифікатори (id) і міграція
- `idMigrateUnlinked` 5644, `idMigrateUnlinkedOnce` 5652: одноразове присвоєння `cloudId` непов'язаним записам; `idPushPlain` 5738: створення/оновлення рядка за id.
- `isDomainMigrated` 10192, `DOMAIN_MIGRATION_KEYS`: міграція localStorage → IndexedDB за доменами; адаптер `idbAdapter*`.

## Синхронізація й злиття
- `PULL_DOMAINS` 12235 (FK-порядок), `pull*Core` (напр. `pullExpensesCore` 8503), `push*Pilot` / `push*RecordPilot` (8036, 8210, 8305, 4960…).
- `mdMerge` 7334, `mdMergeServerRow` 7354, `mdPullDirty` 7444, `mdLostToServer` 7439, `mdPushCas` 7389: LWW за `updated_at`, лічильники правок, конфлікти.
- `syncCheck` 12446 → `planSync` 12762 (через `sync_heads()`): лише змінені таблиці; повна звірка раз на 24 год або при зміні `purged_at` (`purgedAtChanged` 12733).
- Realtime: `setupRealtimeSync` 12271, `teardownRealtimeSync` 12285, `scheduleRealtimeSyncCheck` 12462.
- Середовища: `isWriteBlocked` 11313, `countingFetch` 11427, `NET_STATS` 11393; мок `dev/mock-cloud.js`.

## Видалення й кошик
- `deleteRecord` 15450: м'яке видалення (надгробок `deleted_at`). Кошик: `buildTrashItems` 19171, `filterTrashItems` 19232, `restoreBlockedReasonForMonthRecord` 19242, `restoreCategory` 19100, `restoreSubcategory` 19126, `restoreCascadedWords` 19086; остаточне: `purgeTrashItem` 25509, `purgeTrashFromDetail` 25744.

## Імпорт і відновлення з копії
- Копія: `buildBackupPayloadData` 9722, `exportBackup` 9771, `applyBackupData` 9835, `pilotBackupKeys` 9693.
- Відновлення за правилом id (Rev 2.32.246): `restore*FromBackup` 6335–6603, `mergeBackupRecordsByCloudIdOrName` 6293, `restoreDropServerKnown` 6262, `restoreApplyAsEdit` 6243.
- Excel: `handleImportFile` 17233, `importEnsureAccounts` 17174, `askImportNewAccounts` 17219.

## Push-сповіщення
- Клієнт: `requestPushSubscription` 11682, `openPushActionDb` 11724, `queuePushAction` 11868, `handlePushAction` 12173, `pendingPushState` 11853.
- Service Worker `sw.js`: обробник `push` (~177), `CACHE_NAME`. Серверні функції змінює лише чат.

## Діагностика: бортовий самописець (Rev 2.32.260, REC-1)
- Код: блок «REC-1» у `index.html` перед `sendDebugLog`: чисті `recSanitizeEvent`, `recTrim`, `recChunk`, `recLimitReport`, `recRateCheck`, `recQueueAdd`, `recReportCode`, `recDetectSheetJump`, `recFieldHidden`; рантайм `recPush` (з `pushDebugEvent`), `recMirrorSave/Load` (IndexedDB, ключ `budget-rec-buffer-v1`), `recSendParts`, `recDeliver`, `recFlushQueue` (черга `budget-rec-queue-v1` в IndexedDB), `recTrigger` (автозвіт), `recReportNow` (кнопка), `recBgStart` (стартує з застосунком, слухачі vv/focus/visibility/touch). Стан `recBgOn`/`recOn()` оголошені на початку скрипта. Старий ручний запис (`startDebugRecording`, шторка `debug-record-drawer`) лишився в коді недосяжним з інтерфейсу.
- UI: «Сервіс → Допомога» (картка `rec-report-btn` → шторка `rec-report-drawer`: стани sending/sent/offline, код `MT-ММДД-NNNN`), «Для розробника» (`testing-drawer`: «Надіслані звіти», «Скопіювати запис», «Розширена діагностика», «Перевірка цілісності даних»).
- Буфер: останні 2 хв (`REC_WINDOW_MS`), до 1200 подій; події лише з білих списків `REC_ALLOWED_TYPES` / `REC_ALLOWED_KEYS` (без сум, назв, описів, email, токенів; рядки очищаються від email, uuid, довгих чисел). Звіт ≤ 450 КБ (`REC_MAX_REPORT_BYTES`), ділиться на частини ≤ 150 КБ і ≤ 600 подій.
- Автозвіти (`scenario='incident'`): помилка JS, помилка синхронізації, `sheet-jump` (рух листа >20 пт і назад за 600 мс), `field-hidden` (поле у фокусі під клавіатурою), `push-no-open` («Вхідні» не відкрились за 3 с після тапу по push). Не частіше 1 звіту кожного типу за 10 хв, не більше 20 на добу. Кнопка «Повідомити про проблему» (`manual`) без обмежень.
- Формат рядка `client_debug_logs`: `scenario='incident'`, `app_version`, `device` (userAgent, platform, screen, standalone, iosVersion, `appVersion`, `theme`, `online`, `sw`, `sdk`, `trigger`, `report: { code, trigger, part, parts, wall }`), `events` (масив подій: `t` мс від старту сторінки, `wall` мс від епохи, `type` + технічні поля).
- SQL для чату (усі частини звіту за кодом): `select id, created_at, device->'report'->>'part' as part, device->'report'->>'trigger' as trigger, jsonb_array_length(events) as n from client_debug_logs where scenario = 'incident' and device->'report'->>'code' = 'MT-1106-0193' order by (device->'report'->>'part')::int;` Події: `select e from client_debug_logs l, jsonb_array_elements(l.events) e where l.scenario = 'incident' and l.device->'report'->>'code' = 'MT-1106-0193' order by (l.device->'report'->>'part')::int, (e->>'wall')::bigint;`
- Підйом листа (Rev 2.32.265): `kbSetLift` (перша нога, або нова нога зі збереженням швидкості при зміні цілі), `kbLiftTick` (rAF → `--sheet-lift`), `kbLiftState`, `kbLiftStop`/`kbLiftFinish`; клас `kb-lift-js` вимикає CSS-перехід `transform` на час руху; `--sheet-lift-target` — ціль. `sheet-anim` close має `samplesExt`.
- Прокрутка до поля (Rev 2.32.264): `kbStartFieldScroll` (з `kbPipeAnimate`), `computeFieldScrollTarget`, `kbBezier`, `kbScrollDone`/`kbScrollWaiters`; курсор (`kb-sheet-moving`) знімає `beginSheetMoving.finish` після неї й `getAnimations()`.
- `kb-geometry` (Rev 2.32.262): `recordKbGeometry('vv-settled')` через 450 мс після зміни висоти клавіатури та `'rest-settled'` після зняття `kb-open`: `sheetTop/Bottom/Height`, `fieldTop/Bottom`, `kbHeightCalc`, `drawerScrollHeight/ClientHeight`, `drawerScrollTop`, `actionsTop/Bottom` (прикріплений блок кнопок, `kbStickyBarOf`, Rev 2.32.263).
- Тести: `tests/rec-recorder.test.js` (буфер, приватність, частота, частини, черга), `e2e/cloud/rec.spec.js` (звіт частинами на тестовому сервері, офлайн-черга).
- E2E: `npm run e2e` (WebKit); симулятор `npm run e2e:ios` лише на прямий запит чату.
