# CLAUDE.md — Money Tree («Бюджет-локально»)

Інструкції для Claude Code в цьому репозиторії (`andrii-m17/budget-app`, GitHub Pages: `andrii-m17.github.io/budget-app`).
Правила, що діють завжди, показує гачок SessionStart з `docs/CRITICAL_RULES.md`; тут лише суть проєкту, карта документів і команди.

## Що це за проєкт
Особистий українськомовний PWA сімейного бюджету (двоє користувачів). Усе інтерфейсне й комунікація — українською.
Файли: `index.html` (весь UI, бізнес-логіка, сховище; ≈ 24 000 рядків), `sw.js` (service worker, офлайн), `manifest.json`, `icons/`, `tests/`, `docs/`, `scripts/`, `.github/workflows/keepalive.yml`.

## Архітектура (коротко)
- **Один файл без збірки.** Скрипти `index.html` виконуються у звичайній глобальній області; DOM-ініціалізація йде під час завантаження. Модулів немає.
- **Сховище:** `localStorage` + IndexedDB (адаптер `idbAdapter*`, міграція за доменами `isDomainMigrated`). Локально завжди повний набір даних; Cloud (Supabase) — синхронна копія для двох користувачів.
- **Cloud-синхронізація:** шар `pull*Core` / `push*Pilot` для 9 таблиць (`categories`, `subcategories`, `dictionary`, `bank_accounts`, `installment_accounts`, `hidden_entities`, `expenses`, `incomes`, `debts`); LWW за `updated_at`, надгробки `deleted_at`, FK-порядок у `PULL_DOMAINS`. З Rev 2.32.74 перевірка змін іде через `sync_heads()` → `planSync` → лише змінені таблиці (`syncCheck`); повна звірка раз на 24 год або за зміною маркера `purged_at` (Rev 2.32.75). Лічильник запитів: `NET_STATS` у «Тестування».
- **Середовища (Rev 2.32.75):** робоче = лише `https://andrii-m17.github.io`; будь-який інший origin = мок `dev/mock-cloud.js` (`?fixture=empty|one|typical|large|invalid|hostile|edge-dates|two-devices`); реальна база в тестовому лише перемикачем і лише читання (захисник у `countingFetch`, `isWriteBlocked()`).
- **Realtime:** одна підписка на 9 таблиць + окрема для архіву сповіщень. Push: Edge Functions + Service Worker; серверні функції змінює лише чат.
- **Шторки й клавіатура iOS:** компонент `.drawer`; клавіатурний модуль живе всередині IIFE `initApp` і недосяжний із глобального коду (безпечні обгортки `kbSheetUsesProxy`, `focusCardFieldSafe`; охоронний тест `tests/scope-guard.test.js`).
- **Тести:** `node --test`, без залежностей. `tests/extract.js` вирізає функції/константи з `index.html` у `vm`-контекст (`buildSandbox`); `const`/`let` читаються через `evalInSandbox`; нові допоміжні функції треба додавати у списки імен тестів.

## Команди
| Що | Команда |
|---|---|
| Усі тести | `node --test` |
| Preview | `.claude/launch.json` → `budget-app-static` (`npx http-server -p 8934 -c-1`), http://localhost:8934; перед перевіркою знімай реєстрацію SW і кеші, інакше віддається стара версія |
| Перевірка перед push | `node scripts/hooks/pre-push-guard.js --manual` (тести, `APP_VERSION` ↔ `CACHE_NAME`, запис у ROADMAP) |
| Відкат | `git revert <коміт>` → новий Rev; ніколи `push --force` у `main` |

## Дисципліна ревізій (деталі: навичка `rev-release`)
1. Одна ревізія = одна ізольована зміна. Не змішувати.
2. Версія в трьох місцях: `APP_VERSION` (`index.html`), футер «Money Tree · Rev X» (`index.html`), `CACHE_NAME` (`sw.js`). Забули `CACHE_NAME` → встановлені PWA не побачать оновлення.
3. Коментар над кожною суттєвою зміною: `// Rev X.Y.Z: що змінено, чому, які ризики й альтернативи`.
4. Запис у `docs/ROADMAP.md`; перед «новим» фіксом iOS-проблем звірся з «матрицею вже випробуваного» там.
5. Тестування на реальному iPhone обов'язкове для завершеності Rev; ти його зробити не можеш, тому завжди чітко пиши в звіті, що саме перевірити на пристрої.
6. Коміти: українською, наприкінці `Co-Authored-By` з рядка, що дає середовище.

## Карта документів
| Файл | Для чого |
|---|---|
| `docs/CRITICAL_RULES.md` | 12 непорушних правил (показуються на старті; п. 12 — економія) |
| `docs/WORKFLOW.md` | ролі (власник · чат · Claude Code), класи ризику A/B/C, цикл задачі, «Готово», відкат |
| `docs/SCENARIOS.md` | осі сценаріїв і синтетичні набори даних |
| `docs/USAGE_PROTOCOL.md` | економія ресурсів: короткі розмови, `/clear` між задачами, що куди класти |
| `docs/SUPABASE_POLICY.md` | політика сервера, зберігання, синхронізація, місткість |
| `docs/STATUS.md` | реєстр рішень і відкритих питань (оновлюй після кожного Rev) |
| `docs/UI_PATTERNS.md` | виміряні компоненти UI (джерело істини для макетів) |
| `docs/NOTION_BRIDGE.md` | міст чат ↔ Claude Code через Notion |
| `docs/ROADMAP.md` | журнал ревізій (дуже великий; читати вибірково: `grep -n "^## "`) |
| `docs/FINANCIAL_RULES_AND_OBLIGATIONS.md` | фінансова модель (carry-forward, ОЧ, обов'язкові платежі). **Формули без явного підтвердження не змінювати** |
| `docs/PROJECT_SPEC.md`, `docs/DESIGN_SYSTEM.md` | специфікація інтерфейсу й дизайн-система |
| `docs/PLATFORM_LIMITS.md` | платформні обмеження iOS/WebKit і правила полів вводу (дослівно з колишнього CLAUDE.md) |
| `docs/TESTING.md`, `docs/AUDIT.md`, `docs/FIELDS_AUDIT.md` | тестування, аудити, перепис полів |
| `docs/STATUS_LOG_2.1-2.3.md` | архів колишнього STATUS (Rev 2.1.0–2.3.5) |

## Навички й субагент (`.claude/`)
`rev-release` · `task-report` · `step0-audit` · `scenario-matrix` · `ui-from-mockup` · `new-input-field` · `ios-keyboard-safety` · `supabase-safety` · `notion-bridge`; субагент `spec-reviewer` (обов'язковий для класів B і C).
Гачки (`.claude/settings.json`): SessionStart показує правила; перед `git push` — тести, версії, ROADMAP; Stop — тести, якщо є незакомічені зміни коду.

## Платформні обмеження (не «лагодити» без нових фактів; дослівно в `docs/PLATFORM_LIMITS.md`)
- **iOS 26 WebKit Bug 301108:** колір статус-бару під тему й коректна геометрія знизу несумісні; компроміс `status-bar-style: default`.
- **Спалах `env(safe-area-inset-top)` при `orientationchange`:** незалежна поведінка iOS; маскування (6D.110, 6D.115–118) провалилось, не повторювати.
- **Системний edge-резерв WKWebView (≈15–20 px від краю):** власні жести від краю працюють лише після цієї смуги.
- **Текстові поля вводу не повинні викликати панель iOS «Автозаповнити контакт».** Вирішальний лише `id` (і `name`) поля: ніколи підрядків `name`, `phone`, `tel`, `mail`, `addr`, `user`, `login`, `first`, `last`, `fio`, `contact`; абстрактні id за схемою `fld` + код + число. `autocomplete`, `readonly`, `<label for>` не допомагають (6D.132–141). Нові поля: навичка `new-input-field`, `KNOWN_TEXT_FIELD_IDS`, тест `tests/input-attrs.test.js`; про кожне нове поле згадуй у записі ревізії.
- **Панель «Попереднє/Наступне/Готово»:** платформне, не вимикається; хак `inputmode` свідомо не застосовано.

## Стиснуті «золоті» правила (повні — `docs/CRITICAL_RULES.md`)
- Зміна балансу кредитної картки ніколи не витрата; платежі ОЧ — витрати; очікувані значення не зберігаються автоматично; лише цілі гривні.
- Усі дані в HTML — через `escapeHtml` / `escapeAttr` / `safeId` або `textContent`.
- Клавіатурну логіку, Баг 1, safe-area Баг 1a не чіпати без окремого завдання класу C.
- Preview і тести не пишуть у робочу базу; сервер змінює лише чат; тестові записи лише з префіксом `TRASH-TEST-`.
- Публічний репозиторій: ніяких реальних сум, назв рахунків, імен, email, id у файлах, тестах, коментарях і комітах.
- Клас C (клавіатура, синхронізація, дані, безпека, фінанси): спершу лише Крок 0 і чекати підтвердження.

## Економія сесії
Після звіту нагадати користувачу про `/clear`; нову задачу брати з Notion у чистій сесії. Гачок Stop сам попереджає, коли в сесії понад ≈ 40 викликів інструментів.

## Мова
Уся комунікація, коментарі й повідомлення комітів — українською, як і весь інтерфейс застосунку.
