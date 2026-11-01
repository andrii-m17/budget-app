# Крок 0: клавіатура й таб-бар на iPad і Android (Rev 2.32.238, лише аналіз і діагностика)

## 1. Де рахується клавіатура
- Режим пристрою: `usesOnScreenKeyboard(env)` / `kbMode()` — лише за `maxTouchPoints`, `(pointer: coarse)`, `(any-pointer: fine)`: `never` (десктоп без дотику), `always` (дотик без миші: iPhone, iPad, Android), `resize` (гібриди). **Це не iOS-код:** на Android діє той самий `always`.
- Прямої перевірки платформи мало: `IS_IOS_RUNTIME` (`/iPad|iPhone|iPod/` у UA або наявність `navigator.standalone`) лише для перехоплення тапів і `intercept-miss` (iOS); `kbMode()` і підйом шторок діють на всіх дотикових пристроях.
- Висота клавіатури: `baseVh − visualViewport.height` (`computeKeyboardHeight`, `isKeyboardOpen` ≥ 100). **`innerHeight − vv.height − vv.offsetTop` не використовується**: `offsetTop` ігнорується (лише `correctPanIfNeeded` скидає скрол).
- `baseVh` = `getBaseViewportHeight()` = **максимум** `innerHeight`, побачений при закритій клавіатурі, окремо для portrait/landscape (`nextBaseViewportHeight`); не скидається при зміні розміру вікна (iPad Split View/Stage Manager, ховання/показ адресного рядка Android).
- Початкова оцінка: `estimateKeyboardHeight` = `baseVh × 0,465` (текстова) / `0,435` (числова) — пропорція iPhone; далі `keyboardHeightCache[орієнтація][тип]` із живого виміру.
- Підйом шторки: `enterKbSheet` → `--kb-h`, `--vv-h`, `--sheet-lift = restBottom − (baseVh − kbH − 8)`, `--sheet-max-h`; CSS `html.kb-sheet .drawer.open { transform: translate3d(0, calc(-1px * var(--sheet-lift)), 0); max-height: calc(var(--sheet-max-h) …) }` (`.app-modal` аналогічно). Живе оновлення `updateKbSheetGeometry` (на кожен `visualViewport` resize/scroll): `--kb-h`, `--vv-h`, `--sheet-max-h` — завжди, а `--sheet-lift` **лише** якщо `kbSheetLiftDirty` і клавіатура відкрита, і зміна > 2 px.
- Таб-бар під час клавіатури: `body.kb-open nav.tabbar { display:none }`; `kb-open` знімається за `isKeyboardLikelyClosed` (< 100) і запобіжником 700 мс (`shouldReleaseKbOpen`).

## 2. Мета-тег і API
- `viewport`: `width=device-width, initial-scale=1.0, maximum-scale=1, user-scalable=no, viewport-fit=cover`. **`interactive-widget` немає** (Android Chrome 108+ за замовчуванням `resizes-visual`; iOS ігнорує). `navigator.virtualKeyboard` і `env(keyboard-inset-*)` не використовуються. Одиниці: `100dvh` ×1, `100vh` ×5 (здебільшого запасні значення `--sheet-max-h`).

## 3. Таб-бар
- `nav.tabbar { position: fixed; bottom: max(6px, calc(env(safe-area-inset-bottom) − 13px)); width: calc(100% − 28px); max-width: 460px }`. iPhone з home-індикатором (safe ≈ 34): ≈ 21 px від низу. **iPad:** safe-area ≈ 20 → 7 px. **Android** (жестова навігація, зазвичай `env()` = 0): 6 px. Звідси «надто низько» — константи підібрано під iPhone. Desktop: окрема `nav.side-panel` (DESK-NAV), таб-бар там не показується.

## 4. Які форми мають клавіатурну поведінку
Усі `.drawer` (вхід `#profile-drawer`, налаштування, нова витрата/редагування, картка, ОЧ, дохід, слова, Структура) і `.app-modal` (картки введення) — один механізм `enterKbSheet`/`exitKbSheet`/`updateKbSheetGeometry`; поле на сторінці (не в шторці) — лише `kb-open` без підйому. Вхід — звичайний `.drawer` без особливостей.

## Гіпотези за кодом (потрібні цифри з пристроїв)
- Android: `baseVh` = історичний максимум `innerHeight` (адресний рядок ховається/показується) → завищений `baseVh`, а оцінка 0,465 більша за типову висоту Android-клавіатури → підйом «високо»; живий `--sheet-lift` оновлюється лише за `kbSheetLiftDirty`, тож оцінка може лишитися. Подвійної компенсації `visualViewport` + `interactive-widget` у коді нема (тега немає), але `fixed`-елементи при `resizes-visual` прив'язані до layout viewport.
- iPad: оцінка 0,465 × висота екрана не збігається з реальною (панель швидких дій, плаваюча клавіатура, режим вікон); `offsetTop` ігнорується (на iOS оновлюється із запізненням); `baseVh` у режимі вікон не оновлюється при зменшенні вікна; живий `--sheet-lift` лише за `kbSheetLiftDirty`.

## 5. План (після цифр)
1. Запис діагностики на iPad (portrait/landscape, з панеллю швидких дій і без) та Android Chrome: події `kb-geometry` (старт, фокус, `vv`, «осідання» 150 мс, «Мітка»).
2. Єдина формула `innerHeight − vv.height − vv.offsetTop` із «осіданням»; `baseVh` не як максимум, а за поточним layout viewport при закритій клавіатурі; пропорційну оцінку замінити кешем/мінімальним значенням за класом пристрою; `--sheet-lift` оновлювати завжди при відкритій клавіатурі.
3. Android: `interactive-widget=resizes-visual` явно (або перевірка за фактом: чи змінився `innerHeight` на відкриті клавіатури) — без подвійної компенсації.
4. Таб-бар: мінімальний відступ за класом пристрою (iPad/Android більший за 6–7 px), `max(…, env(safe-area-inset-bottom))`.
5. Ризики: iPhone і desktop (`kbMode` = never) не повинні змінитись — тести WebKit iPhone і iPad, Chromium Android, desktop без змін; клас C: `kb-*` чіпати лише окремим завданням, одним Rev.
