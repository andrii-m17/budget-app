# Карта коду Money Tree (`index.html`, Rev 2.32.248)

Номери рядків орієнтовні (зсуваються з правками): шукай за назвою функції (`grep -n "function name"`). Оновлюй карту, коли змінюєш описану тут частину.

## Конвеєр клавіатури й листів (єдиний для всіх `.drawer` і `.app-modal`)
- `kbSheetHostOf` 27814: хост логіки; будь-яке поле всередині `.drawer, .app-modal` автоматично на конвеєрі. Окремих гілок на форму немає (з Rev 2.32.248 прибрано стару формулу iPhone й гілку входу).
- `beginKbFocusProxy` 28483: перший дотик → проміжне поле `kb-focus-proxy` → передача фокуса на справжнє поле. `handleKeyboardFieldFocusIn` 28953: перемикання між полями, `runProxySwitchTrick`.
- `enterKbSheet` 28582 → `kbPipeEnter` 28685 → `kbPipeAnimate` 28700: автомат відкриття (armed → measuring → animating → settled); підйом = `computeSheetLift` 28765 за живим `visualViewport`, низ листа `kbRestBottomLayout` 28771; `updateKbSheetGeometry` 28784; `kbEnsureFieldVisible` (~28695): прокрутка поля в видиму область всередині листа (ландшафт).
- `exitKbSheet` 28869: закриття; слухач `visualViewport resize` (`KB_CLOSE_CONFIRM_MS`, після `handleKeyboardFieldFocusSettle`): зняття `kb-open` лише після підтвердження 250 мс.
- Обгортки для глобального коду: `kbSheetUsesProxy`, `focusCardFieldSafe` (~27270). Тести: `tests/pilot-repository.test.js` (`kbSheetSandbox`, `pipeSandbox`), `e2e/ios/run.mjs` (симулятор).

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

## Діагностика
- `pushDebugEvent` 14151, `captureDebugGeometry` 14157, `startDebugRecording` 14465, `startDebugRecordingFromDrawer` 14590, `sendDebugLog` 14614, `openTestingDrawer` 23587 («Сервіс → Діагностика / Тестування»).
- E2E: `npm run e2e:ios` (симулятор), `npm run e2e` (WebKit); звіти в `docs/ui/sim/<версія>/`.
