# ERR-1 · помилки, що зникають мовчки: Крок 0 (клас C, лише читання)

Код не змінено. Реальних даних у звіті немає. Перелік місць: `index.html`, `js/*.js`, `sw.js` на коміті `3efa22e`; сирий перелік (235 записів з `файл:рядок`, функцією й контекстом) скриптом відтворюється регулярними виразами `catch\s*(\(\w*\))?\s*\{\s*(/\*…\*/)?\s*\}` і `.catch(function(){})`.

## 1. Скільки місць

| Вид | Кількість |
|---|---|
| Порожні `catch` (`catch(e){}`, лише коментар) | **235** (`index.html` 181, `js/diag.js` 22, `js/shell.js` 13, `js/sheets.js` 6, `sw.js` 6, `js/analytics.js` 5, `js/payments.js` 2) |
| `.catch(function(){})` на промісах | **25** (index.html 19, diag.js 3, sw.js 2, shell.js 1) |
| `catch`, де лише `console.*` | **1 місце**: `safeCall` (`js/util-misc.js:23`, `console.error`), але через нього йде багато викликів |

За змістом (оцінка за контекстом рядка й назвою функції):

| Область | Місць | Висновок |
|---|---|---|
| Запис витрат/доходів/боргів: `push*Batch` і наслідки | 3 + 2 (`expApplyPushedRow`, каскад перейменування) | **кандидати** |
| `push*Pilot` / `pull*Core` / перевірка змін | 5 (`idMigrateUnlinked` у `pullCategories/Subcategories/Dictionary/BankAccounts/InstallmentAccountsCore`) + 4 (`runSyncCheck` ×2, `applyHeadsCounters`, `expenseFingerprint` → `pushBankAccountsPilot`) | **кандидати** |
| IndexedDB, копії | 5 (`renderBackupStatus`, `openRestoreSheet`, `rsUndo` ×2, `performRestore`→`abBeforeRestore`) + `recQueueSave`, `clearLocalAccountData` | **кандидати** (крім самописця) |
| Realtime | 1 (`teardownNotifRealtime`) | кандидат (помилки підписки йдуть не через `catch`) |
| Monobank | 7 (`monoRefundSignal`, `monoNewToastCheck`, `monoExtractErrorCode`, `refreshMonoNewCount`, `monoLoadConnection`, `loadMonoSuggestRows`, `resetSyncCheckState`) | **кандидати** |
| Сповіщення й підписка | 13 у `index.html` (`pushReceipt*` ×5, `revokeDevicePushSubscription` ×2, `refreshNotifUnread`, `markPushNotificationsRead`, `notifQueueWrite`, `refreshPushSubscription`, `sendTestNotification`, `refreshNotifAfterAction`) + 14 `.catch(function(){})` на `notifFlush`/`readAndClearPendingPushAction` + 6 у `sw.js` | **кандидати** (SW окремо) |
| Клавіатура й анімації (`kb*`, `.cancel()`, `scrollIntoView`, `focus/blur`, `setSelectionRange`) | ≈ 70 | свідомо мовчазні; клавіатурний модуль не чіпати (клас C окремо) |
| `localStorage` / `sessionStorage` (приватний режим, квота) | ≈ 25 | свідомо мовчазні |
| Самодіагностика (`js/diag.js`: `recordJsError`, `captureDebugGeometry`, `pushDebugEvent`, знімки) | ≈ 25 | мають лишитись мовчазними (інакше рекурсія) |
| Спостерігачі/DOM (`disconnect`, `matchMedia`, `getComputedStyle`, `postMessage`, `replaceState`) | ≈ 25 | свідомо мовчазні |

Разом: **≈ 118 свідомо мовчазних за контекстом, ≈ 117 на розгляд; з них ≈ 40 справді стосуються даних, синхронізації, IndexedDB, Monobank і сповіщень**, решта (kb*, діагностика, UI-логіка) лишається без змін.

## 2. Що з кандидатів впливає на дані (пріоритет)

1. `runSyncCheck` (`index.html:9163, 9165`): `syncFullDirty = false;` стоїть ДО `await autoSyncStale('full-reconcile')` під німим `catch`: збій повної звірки скидає прапорець і наступна спроба лише за 24 год або зміною `purged_at`. Дані не псуються, але розбіжність між пристроями живе довше.
2. `idMigrateUnlinked` у п'яти `pull*Core` (`2169, 3072, 3158, 6142, 6343`): записи без id лишаються без id мовчки; наслідок: наступні `push` ідуть без `cloud id`.
3. `pushExpensesBatch/IncomesBatch/DebtsBatch` (`5287, 5389, 5549`): збій пакету йде у fallback поштучно; причина пакетного збою (мережа чи помилка політики) не фіксується; далі помилка fallback уже лунає.
4. `performRestore` → `abBeforeRestore` (`7099`) і `openRestoreSheet`/`renderBackupStatus`: якщо автоматична копія перед відновленням не створилась (IndexedDB), відновлення йде далі **без страхової копії**, і про це ніде нема сліду.
5. `expApplyPushedRow` (`4769, 4794`): каскад перейменування категорії/підкатегорії після серверної відповіді мовчить.
6. `pushReceipt*`, `notifFlush(...).catch(function(){})`, `revokeDevicePushSubscription`, `refreshPushSubscription` (повторна підписка теж під німим `catch`): втрата сліду, чому сповіщення не підтверджуються або підписка не оновилась.
7. Monobank (`7` місць): помилки завантаження лічильника, підключення, підказок повернення зникають, екран показує застаріле.

## 3. Свідомо мовчазні, мають лишитись

`localStorage`/`sessionStorage` (недоступні в приватному режимі, квота; ≈ 25: тема, згорнута бічна панель, `LS_KEY_*`), анімації (`anim.cancel()`, `kbLift*`), DOM (`scrollIntoView`, `focus`, `blur`, `setSelectionRange`, `setPointerCapture`), спостерігачі (`disconnect`), `matchMedia`, самодіагностика (щоб запис помилки не породжував нових помилок), `postMessage` у вікна, що закрились, `window.__*` захисти, кроки клавіатури. Їх не змінюємо.

## 4. Пропозиція: подія самописця `err`

Одна функція `recErr(at, e)` у `js/diag.js` (ззовні `try`-обгорнута, ніколи не кидає, поведінку не змінює):

```
catch(e){ recErr('pull-idmig-cat', e); }   // було catch(e){}
```

Подія (через наявний `pushDebugEvent`, білі списки):
- `type: 'err'`; `at`: короткий код місця (≤ 24 символи, `[a-z0-9-]`, напр. `sync-full`, `push-batch-exp`, `idb-restore-bk`, `mono-count`, `notif-flush`);
- `message`: `scrubJsErrorText(e.message, 80)`: уже прибирає email і довгі числа/суми, до 80 символів;
- `stackTop`: `jsErrorStackTop(e.stack)`: лише імена перших 3 кадрів, без шляхів і параметрів;
- `count`: скільки таких подій було (лише при першій і при кожному степені двійки, як у `recordJsError`).

Білі списки: додати `'err'` у `REC_ALLOWED_TYPES`, `'at'` у `REC_ALLOWED_KEYS` (`message`, `stackTop`, `count` уже дозволені). Тест `tests/rec-types.test.js` оновити.

Обмеження частоти: ключ `at + message`: не більше 3 подій за хвилину, понад ліміт лише лічильник у наступній події; загальна стеля 30 подій за хвилину; бортовий буфер самописця вже кільцевий. Дублікат `recordJsError` (глобальні помилки) не торкаємось; `err` для спійманих помилок, `js-error` для неспійманих.

Окремо один рядок у `safeCall` (`js/util-misc.js:23`): замість лише `console.error` — ще `recErr('safe-' + label, err)`; це покриває всі обгортки одразу.

## 5. Обсяг і ризики

- Змінюється **≈ 40 місць** (перелік у п. 1–2) + `safeCall` + `diag.js` (функція, білі списки) + `rec-types.test.js` + нові тести; поведінка застосунку не змінюється (лише виклик у `catch`, швидкий, у `try`).
- `sw.js` (6): воркер не має доступу до самописця сторінки; пропоную не змінювати (він пише власний `diagRecord`), або окремою задачею.
- Ризики: (а) обсяг подій при масовому збої мережі (захищено лімітом); (б) `e.message` у відповідях Supabase може містити значення полів: `scrubJsErrorText` прибирає email і довгі числа, але не імена; для `at` з відповідей сервера пропоную ще `message` лише до першого `:`/`(`; (в) виклик у `catch` на шляху запису не повинен змінити час: тестуємо, що кількість `await` не змінилась; (г) клас C: синхронізація, дані: окремі ревізії за областями (запис/синк → IndexedDB/копії → Monobank → сповіщення), кожна з тестом «до: подія не пишеться, після: пишеться, поведінка та сама».

## 6. Матриця сценаріїв (коротко)

| Вісь | Перевірка |
|---|---|
| Помилка мережі в `push*Batch` | подія `err`/`push-batch-exp`; fallback працює як раніше |
| Збій IndexedDB перед відновленням | подія `err`/`idb-restore-bk`; відновлення йде як раніше |
| Масовий збій (100 подій) | ≤ 3 однакових за хвилину, решта лічильник |
| Режим самописця вимкнено | нічого не пишеться, нуль накладних витрат |
| Приватність | немає шляхів, email, довгих чисел; `message` ≤ 80 |

## Питання до чату
1. Назва події: `err` (нова) чи розширити наявну `js-error` полем `at`?
2. Лише ≈ 40 кандидатів з п. 1–2 чи ще й `kb*` (чіпати не раджу)?
3. Порядок ревізій: запис/синк → копії → Monobank → сповіщення; `sw.js` виключити?
