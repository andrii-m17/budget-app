# DESIGN_SYSTEM.md — довідник дизайн-системи Money Tree

Статус: **фінальний довідник (Rev 2.30.0, M4b)**. «Скло» — єдиний стиль (тест `button-style` завершено, гілок за варіантами немає). Токени, п'ять варіантів кнопок, сегмент і чип, решта компонентів, правила вибору. Рух — Rev 2.24.0 (M1) і 2.25.0 (M2). Нижче, у додатку, — аудит M0 (еталон таббару, інвентар переходів/анімацій).
Еталон — **таббар** (`nav.tabbar`): його не змінюємо, інші елементи зводимо до нього.

## 1. Токени `--ui-*` (псевдоніми існуючих, нічого не перейменовано)

| Токен | Світла | Темна | Примітка |
|---|---|---|---|
| `--ui-glass` / `--ui-glass-press` / `--ui-glass-border` | `rgba(255,255,255,.52)` / `.74` / `.7` | `rgba(21,27,38,.62)` / `rgba(31,38,52,.82)` / `rgba(255,255,255,.1)` | = `--color-glass-*` таббару |
| `--ui-btn-border` | `rgba(16,24,40,.10)` | `rgba(255,255,255,.10)` | межа кнопки (біла межа таббару на білому не видна) |
| `--ui-btn-highlight` | `rgba(255,255,255,.9)` | `rgba(255,255,255,.08)` | внутрішній відблиск `inset 0 1px 0` |
| `--ui-btn-shadow` | `0 2px 8px rgba(16,24,40,.08)` | `0 2px 8px rgba(0,0,0,.35)` | легка тінь |
| `--ui-r-container` / `-control` / `-small` / `-pill` | `26` / `18` / `12` / `999` px | | капсули й треки сегментів / кнопки, бульбашка, індикатор / малі елементи / чипи |
| `--ui-h-control` / `--ui-min-target` | `48` / `44` px | | висота керування / мінімальна зона натискання |
| `--ui-accent` / `-strong` / `-bg` / `-border` / `-text` | `#22C55E` / `#15803D` / `rgba(34,197,94,.16)` / `.32` / `#166534` | `-text`: `#34D673` | `-strong` — заливка основних кнопок (білий текст ≥4.5:1) |
| `--ui-danger` / `-strong` / `-text` / `-glass` | `#EF4444` / `#DC2626` / `#B91C1C` / `rgba(239,68,68,.08)` | `-text`: `#F87171` | `-strong` — заливка (білий текст ≥4.5:1) |
| `--ui-success-strong`, `--ui-warning-strong` | `#15803D`, `#B45309` | | заливки «Додати дохід/борг» з білим текстом ≥4.5:1 |
| `--ui-text`, `--ui-text-2`, `--ui-success` | = `--color-text-primary/-secondary`, `--color-success` | | |
| Рух | `--motion-micro/s/m/l/count` = 120/200/320/480/700 мс × `--motion-k`; `--ease-standard/-out/-spring` | | M1 |

## 2. Варіанти кнопок

Єдиний стиль — «Скло» (рішення користувача після тесту на iPhone). Правила мають префікс `html:root` — це дає специфічність (0,1,1), потрібну, щоб перекрити старі правила компонентів без `!important`. Справжній `backdrop-filter` — лише таббар і `scroll-top`; на кнопках «скло» = напівпрозорий фон + межа 1px + inset-відблиск + легка тінь.

| Варіант | Коли використовувати | Вигляд (glass) |
|---|---|---|
| **Основна** | головна дія екрана (зберегти, додати, підтвердити, синхронізувати) | заливка `--ui-accent-strong` (або семантична: дохід — зелена, борг — бурштин, витрата/небезпека — червона), радіус 18, відблиск + тінь |
| **Вторинна (скло)** | другорядна дія (скасувати, додати рядок, показати журнал, скинути фільтри) | `--ui-glass`, межа `--ui-btn-border`, відблиск, тінь, радіус 18 |
| **Текстова** | посилання й дії-підписи (розгорнути, видалити картку, змінити назву) | без фону; колір з контрастом ≥4.5:1; зона натискання розширена невидимо |
| **Небезпечна** | незворотне видалення | контур `--ui-danger` + склянa червона підкладка, радіус 18 |
| **Іконкова** | закрити, назад, шестерня, стрілки дати | скляне коло/квадрат (`min(18px, 50%)`), зона натискання ≥44 через `--ui-hit` |
| **Сегмент** (однакова ширина) | перемикання вкладок усередині екрана: Доходи/Борги/ОЧ, Категорії/Підкатегорії/Словник, тема, «за 1/2/3 дні» | скляний трек (радіус 26), кнопки радіусу 18; **ковзний індикатор** `.seg-indicator` (`transform`, пружина `--motion-l`), ширина міряється при показі/повороті |
| **Чип** (різна ширина) | фільтри (Усі/Витрати/Борги/ОЧ/Інше) | скляна пігулка; активний стан — плавна зміна заливки через `opacity` псевдоелемента |
| *Рядок / картка* | клікабельні рядки й плитки | **поза M3 (M4)**: зберігають поточний вигляд, мають варіант `row` |
| *Еталон* | таббар, `scroll-top`, desktop-sidebar | варіант `reference`, не змінюються |

Колірна семантика збережена: «Відновити» — зелена, незворотне видалення — червоний контур, синій лише «Редагувати» (свайп). Реакція на натискання — загальна (M1), нічого не дублюється.

### Відповідність клас → варіант (джерело правди — `BUTTON_VARIANT_MAP` в `index.html`, охоронний тест `tests/design-system.test.js`)

| Варіант | Класи |
|---|---|
| primary | `submit-btn` (+`income`/`debt`/`expense`/`pill`), `rce-save`, `dsp-action`, `sync-card-btn`, `trash-restore-btn` |
| secondary | `submit-btn secondary` (в т.ч. `journal-empty-reset`), `add-trigger-btn`, `show-journal-link`, `journal-reset-btn`, `rce-cancel`, `diag-issue-ignore`, `installment-pay-btn`, `dbg-rec-btn` |
| text | `t-footer-link`, `cdd-delete-link`, `dsp-link`, `auto-hint-edit-btn`, `n-diag-toggle`, `bdr-diff-apply` |
| danger | `submit-btn danger`, `submit-btn danger-outline` |
| icon | `drawer-close`, `gear-btn` (+`update-btn`, `profile-header-btn`), `date-nav-btn`, `journal-back-btn`, `journal-search-clear`, `bdr-icon-btn`, `data-status-dot`, `exp-edit-cat`, `exp-del` |
| segment | `struct-tab-btn`, `theme-toggle-btn` |
| chip | `trash-chip`; кнопки в `.n-days` (рівної ширини, але окремі кнопки — індикатор їде й тут) |
| row (M4) | `card-debt-compact-row`, `service-tile`, `service-wide-card`, `service-danger-card`, `n-row`, `n-row-link`, `profile-menu-item`, `diag-issue`, `swipe-edit/-delete/-restore/-purge-btn` |
| reference | `tab-vytraty`, `scroll-top-btn`, `side-tab`, кнопки `.tabbar-glass` |

Радіуси «було → стало»: `.submit-btn` 12/18 → 18; `.gear-btn` 12 → коло; `.drawer-close` 12 → коло; `.date-nav-btn` 10 → 18; `.struct-tabs` 22 → 26 (кнопки 18); `.theme-toggle` 12 → 26 (кнопки 10 → 18); `.n-days button` 12 → 18; `.trash-chip` 999 → 999; `.diag-issue-ignore`, `.dsp-action` 10 → 12.

## 2а. Решта компонентів (Rev 2.30.0, M4b)

Поверхні лишаються **непрозорими** (контраст тексту не змінюється); «скло» = радіус зі шкали + межа `--ui-btn-border` (лише верх/право/низ: ліва межа тостів і рядків несе семантичний колір) + inset-відблиск + м'яка тінь. **Без `backdrop-filter`**; розмиття лишається лише в таббарі й `scroll-top` (на шапки шторок не додано: ризик для анімації й клавіатурної логіки шторок).

| Компонент | Класи | Що застосовано |
|---|---|---|
| Картки | `.card`, `.card-summary`, `.kpi-card.v2`, `.table-card` (через `.card`) | радіус `--ui-r-control` (18), межа/відблиск/тінь |
| Клікабельні рядки й плитки | `.card-debt-compact-row`, `.service-tile`, `.service-wide-card`, `.service-danger-card`, `.expense-row` (+ обгортка `.expense-row-swipe`) | радіус 18, межа/відблиск/тінь; `.service-danger-card` зберігає червоний контур |
| Поля вводу | `.field input`, `.field select` (крім `.manual-flag`), `.field textarea` | радіус 18, `background-color: --ui-glass` (не shorthand — щоб не скинути стрілку select), фокус: `--ui-accent` + кільце `--ui-accent-bg`; `id`/атрибути/поведінка не змінювались |
| Тумблер | `.n-switch-input` | трек із внутрішньою межею, увімкнено `--ui-success`, бігунок з відблиском і пружиною `--ease-spring` (єдине місце) |
| Тости | `.live-toast` | радіус 18, відблиск; ліва семантична смужка збережена |
| Діалоги й шторки | `.app-modal`, `.drawer` | радіус `--ui-r-container` (26), відблиск; геометрія/анімація шторок не чіпались |
| Дії свайпу | `.swipe-restore-btn`, `.swipe-purge-btn` | темніші заливки `--ui-success-strong` / `--ui-danger-strong` (білий текст ≥4.5:1) |
| **Не чіпались** | `.n-row`, `.n-row-link`, `.profile-menu-item`, `.t-row`, `.diag-issue`, таббар, `.scroll-top-btn`, форма «Витрати» (структура) | `.n-row`/`.profile-menu-item` — рядки з роздільниками всередині карток (радіус зламав би лінії); `.diag-issue` має ліву акцентну смужку; таббар — еталон; форма «Витрати» — за обмеженням ревізії |

## 3. Правила

1. Нову кнопку відносимо до одного варіанта й додаємо клас у `BUTTON_VARIANT_MAP` (тест падає, якщо клас без варіанта).
2. Радіуси лише зі шкали `--ui-r-*`; прямі `px` у нових правилах заборонені тестом.
3. `transition`/`animation` лише `transform` і `opacity` (+ кольори); ніяких `width`/`height`/`top`/`left`/`margin`/`padding`/`box-shadow`/`filter`/`backdrop-filter` (тест, перелік винятків порожній).
4. Зона натискання ≥44: або розмір, або невидиме розширення `--ui-hit` (`::after`; окремо `--ui-hit-y`, `--ui-hit-l/-r` для сегментів і пар іконок впритул). Виняток: `bdr-icon-btn` (24pt, пара «редагувати/видалити» впритул, крок рядків 41–43pt) — 45pt по ширині, 41pt по висоті (`UI_AUDIT_SMALL_EXEMPT`). Подія `ui-audit` рахує кнопки з меншою зоною.
5. Контраст тексту кнопок ≥4.5:1 в обох темах (`ui-audit`, `contrastRatio`).
6. `backdrop-filter` — лише таббар і `scroll-top` (шапки шторок свідомо без розмиття).
8. `!important` — лише в блоці `prefers-reduced-motion` (перевизначення авторських переходів/анімацій); у решті CSS його немає (тест).
9. CSS — один блок `<style>`; нові правила — під `html:root`, радіуси лише `--ui-r-*`.
7. Сегмент — коли кнопки однакової ширини і вибір один; чип — коли ширина різна або вибір фільтра.

## 4. Подія `ui-audit` (рекордер, при старті запису)
`uiStyle`, `btnTotal`, `byVariant{}`, `btnNoVariant` (має бути 0), `btnSmall` (зона <44, окрім `row`/`reference`), `btnLowContrast` (пар поза AA), і перелік перших класів для кожного некоректного випадку (без даних користувача). Кнопки рахуються всі в DOM (також у прихованих шторках); розмір зони — лише для відрендерених.

---

## Додаток. Аудит M0 (стан до M1–M3)
Статус: **чернетка для затвердження стилю** (епік «анімації + єдиний дизайн»). Тут лише таблиці токенів і каталог; реалізація — ревізії M1–M4. Існуючі токени (`--color-*`, `--radius-*`, `--shadow-*`, `--duration-*`, `--easing-standard`) **не перейменовуються**: нові `--ui-*` — псевдоніми поверх них. Номери рядків — номери рядків `index.html` на момент Rev 2.23.33.

## 1. Еталон: таббар (виміряно в preview, обидві теми)

| Властивість | Світла | Темна | Де |
|---|---|---|---|
| Контейнер `nav.tabbar` | `position:fixed`, `bottom:max(6px, env(safe-area-inset-bottom) − 13px)`, `width:calc(100% − 28px)`, `max-width:460px`, `z-index:20`; **ніколи без `transform`** | те саме | рядок ~1674 |
| Фон скла `--color-glass-bg` | `rgba(255,255,255,.52)` | `rgba(21,27,38,.62)` | `.tabbar-glass` |
| Фон при натисканні `--color-glass-pressed-bg` | `rgba(255,255,255,.74)` | `rgba(31,38,52,.82)` | `.pressed` |
| `backdrop-filter` | `blur(16px) saturate(180%)` | те саме | `.tabbar-glass` |
| Межа | `1px solid rgba(255,255,255,.7)` | `1px solid rgba(255,255,255,.1)` | `--color-glass-border` |
| Радіус | `26px` (капсула) | те саме | |
| Відступ капсули | `6px` | те саме | |
| Тінь `--shadow-glass` | `0 10px 32px rgba(16,24,40,.16), 0 2px 8px rgba(16,24,40,.06), inset 0 1px 0 rgba(255,255,255,.5)` | `0 10px 32px rgba(0,0,0,.5), 0 2px 8px rgba(0,0,0,.3), inset 0 1px 0 rgba(255,255,255,.08)` | |
| Натискання капсули | `transform:scale(1.035)` + фон pressed, `.22s cubic-bezier(.22,1,.36,1)`; повернення `.82s` тією ж кривою | те саме | `nav.tabbar.pressed .tabbar-glass` |
| `will-change` | `transform, backdrop-filter` (постійно) | те саме | `.tabbar-glass` |
| Кнопка вкладки | `font:600 10.5px`, `padding:8px 4px`, `radius:18px`, `min 44×44`, `gap:5px`, іконка `18px`; колір `#64748B` (muted) | `#94A0B4` | |
| Активна вкладка | колір `--color-primary-hover` `#16A34A` | `#34D673` | `.active` |
| «Бульбашка» `.tabbar-bubble` | фон `rgba(34,197,94,.16)`, межа `1px rgba(34,197,94,.32)`, тінь `0 2px 8px rgba(34,197,94,.22)`, радіус `18px` | те саме | `updateTabBubble()` |
| Рух бульбашки | `transform .6s cubic-bezier(.34,1.56,.64,1)` (пружина), **`width .6s` (дорого)**, `opacity .22s`; позиція `--bubble-x` з JS (`offsetLeft`) | те саме | |
| Натискання бульбашки | `--bubble-scale:1.2` + shimmer `1s infinite` (`tabbarBubbleShimmer`, `background-position`) | те саме | |
| «Витрати» (центр) | коло `40px`, `--color-primary`, поза системою бульбашки | | |

## 2. Каталог токенів `--ui-*` (пропозиція; псевдоніми існуючих)

| Токен | Значення (світла) | Значення (темна) | Базується на |
|---|---|---|---|
| `--ui-surface` | `#FFFFFF` | `#151B26` | `--color-surface` |
| `--ui-surface-2` (hover/вкладені) | `#F1F3F5` | `#1E2530` | `--color-surface-hover` |
| `--ui-glass` | `rgba(255,255,255,.52)` | `rgba(21,27,38,.62)` | `--color-glass-bg` |
| `--ui-glass-press` | `rgba(255,255,255,.74)` | `rgba(31,38,52,.82)` | `--color-glass-pressed-bg` |
| `--ui-glass-border` | `rgba(255,255,255,.7)` | `rgba(255,255,255,.1)` | `--color-glass-border` |
| `--ui-border` / `--ui-border-strong` | `#E6EAF2` / `#E6EAF2` | `#262E3B` / `#2E3745` | `--color-border(-strong)` |
| `--ui-text` / `--ui-text-2` / `--ui-text-3` | `#101828` / `#64748B` / `#94A3B8` | `#F1F4F8` / `#94A0B4` / `#7C8BA3` | `--color-text-*` |
| `--ui-accent` / `--ui-accent-bg` / `--ui-accent-border` | `#22C55E` / `rgba(34,197,94,.16)` / `rgba(34,197,94,.32)` | те саме | `--color-primary`, бульбашка |
| `--ui-accent-text` | `#16A34A` | `#34D673` | `--color-primary-hover` |
| `--ui-danger` / `--ui-danger-bg` | `#EF4444` / `#FDECEC` | `#F87171` / `rgba(239,68,68,.18)` | `--color-error*` |
| `--ui-success`, `--ui-warning`, `--ui-info` | як `--color-*` | як `--color-*` | |
| `--ui-r-s` / `--ui-r-m` / `--ui-r-l` / `--ui-r-pill` | `12px` / `18px` / `26px` / `999px` | | узгодити з `--radius-md/xl` (див. розбіжності в розділі 4) |
| `--ui-shadow-1` (картка) / `--ui-shadow-glass` | `--shadow-sm` / `--shadow-glass` | | |
| Рух: `--ui-dur-micro` | `120ms` | | = `--duration-fast` |
| `--ui-dur-s` / `--ui-dur-m` / `--ui-dur-l` / `--ui-dur-count` | `200` / `320` / `480` / `700ms` | | нові |
| `--ui-ease` (стандартна) | `cubic-bezier(.4,0,.2,1)` | | = `--easing-standard` |
| `--ui-ease-out` (поява) | `cubic-bezier(.22,1,.36,1)` | | як у таббарі |
| `--ui-ease-spring` (лише перемикачі/відпускання) | `cubic-bezier(.34,1.56,.64,1)` | | як у бульбашці |
| `--ui-motion` (множник інтенсивності) | `1` (Стандартна), `.6` (Стримана), `1.35` (Виразна) | | тестовий варіант |

## 3. Каталог компонентів і варіантів (цільовий)

| Компонент | Варіанти | Семантика кольору (зберігається) |
|---|---|---|
| Кнопка | основна (заливка `--ui-accent`), вторинна (поверхня таббару: скло/`--ui-glass`, межа `--ui-glass-border`), текстова, небезпечна (червона заливка для підтвердження), небезпечна контурна («Видалити назавжди»), іконкова 44×44 | «Відновити» — зелена; незворотне видалення — червоний контур; синій лише «Редагувати» |
| Чип / сегмент | ковзний індикатор як бульбашка таббару (`transform` + `opacity`; ширина без анімації — індикатор фіксованої ширини `scaleX`/по кнопці) | активний — акцент |
| Перемикач | трек + бігунок, пружина лише тут | увімкнено — `--ui-success` |
| Рядок списку | `--ui-surface`, межа, радіус `--ui-r-m`, натискання `scale(.98)` | смужка автора лишається |
| Картка | `--ui-surface`, межа, `--ui-shadow-1`, радіус `--ui-r-l` | |
| Шапка шторки / тост | як зараз + токени | |

## 4. Розбіжності, які фіксує M0 (для M3/M4)

| Що | Спостереження |
|---|---|
| Радіуси кнопок | `10, 12, 13, 18, 20, 24, 26, 999px, 50%` — кількість оголошень: `--radius-sm` 25, `50%` 21, `--radius-md` 15, `--radius-lg` 11, `999px` 6, `20px` 6, `18px` 4, `8px` 2, `13px` 2, `--radius-xl` 2; таббар 26/18 |
| Заливка основних кнопок | `.submit-btn` (зелена), `.pill`, `.struct-tab-btn.active` (зелена заливка `18px`), `.trash-chip.active` (**темна заливка**, `999px`) — різні активні стани чипів/сегментів |
| Чипи без ковзного індикатора | `.struct-tab-btn`, `.trash-chip`, `.theme-toggle-btn`, `.n-days button` — миттєве перемикання |
| `!important` | 8 у 6 правилах (`.cdr-avatar svg`, `#card-debt-drawer …`, `.btn-loading`, `.kpi-trend.is-positive/negative`, `html.kb-sheet-moving …`) |
| Дубль `<style>` | другий блок (`.service-tile-icon--right`, `.service-tile-sub`) — без анімацій |
| `prefers-reduced-motion` | **відсутній** |

## 5. Система руху (пропозиція)

| Рівень | Тривалість | Крива | Для чого |
|---|---|---|---|
| мікро | 120 мс | стандартна | колір/фон, реакція на натискання |
| мала | 200 мс | стандартна / ease-out | тости, чипи, скорочений перехід |
| середня | 320 мс | ease-out (`.22,1,.36,1`) | перехід вкладок, поява карток |
| велика | 480 мс | ease-out | графіки (лінії/стовпчики/кільця) |
| лічильники | 700 мс | ease-out | числа KPI |
| пружина | 320–600 мс | `.34,1.56,.64,1` | лише перемикачі, відпускання кнопки, бульбашка |

Правила: лише `transform` і `opacity`; `will-change` лише на час анімації; ≤ ~30 елементів одночасно; розсинхронізація 40 мс для ≤ 8 елементів; `prefers-reduced-motion` → лише швидкі затухання, без лічильників.

## 6. Карта анімацій (цільова)

| Подія | Рух |
|---|---|
| Натискання кнопки/рядка | клас `.is-pressed` (JS `pointerdown/up`, без залипання `:active`): `scale(.97)` + `opacity .9`, відпускання — пружина |
| Перехід між вкладками | вихід: `opacity→0` + зсув 8–12 пт у бік, вхід: `opacity 0→1` + зсув з протилежного боку; напрямок за порядком вкладок; бульбашка таббару як зараз (ширину замінити на `scaleX`) |
| Поява дашборду | KPI-картки по черзі (40 мс), числа лічильником (від 0 або від попереднього значення, табличні цифри `.mono`), спарклайни `stroke-dashoffset`, стовпчики `scaleY` від низу (`transform-origin:bottom`), кільце `stroke-dasharray` |
| Повторний показ вкладки | скорочена (~200 мс), перший показ за сесію — повна |

## 7. Вимірювання (`motion-perf`)

Подія рекордера `motion-perf`: `{ name, frames, maxGapMs, durationMs }`. Реалізація — той самий приклад, що `startSheetAnimSampler` (`tickNoLayout`): лише `requestAnimationFrame`, без читань розмітки під час руху; один семплер на анімацію, завершення за `transitionend`/стелею.

## 8. Наявні переходи (інвентар, CSS-блок №1)

| Рядок | Селектор | Перехід | Дорогі властивості |
|---|---|---|---|
| 185 | `button` | `background var(--duration-fast) var(--easing-standard), color var(--duration-fast) var(--e` |  |
| 302 | `.live-toast` | `transform .2s ease, opacity .2s ease` |  |
| 428 | `.add-trigger-btn` | `background var(--duration-fast) var(--easing-standard), border-color var(--duration-fast) ` | ⚠️ border-color |
| 460 | `.card-debt-compact-row` | `background var(--duration-fast) var(--easing-standard)` |  |
| 670 | `.submit-btn` | `background var(--duration-fast) var(--easing-standard)` |  |
| 907 | `.expense-row` | `background var(--duration-fast) var(--easing-standard), border-color var(--duration-fast) ` | ⚠️ border-color, box-shadow |
| 924 | `.expense-row-swipe.dragging .expense-row` | `none` |  |
| 978 | `.expense-row.just-synced.just-synced-done` | `background .3s ease` |  |
| 1122 | `.t-row` | `background var(--duration-fast) var(--easing-standard)` |  |
| 1209 | `.struct-tab-btn` | `background var(--duration-fast) var(--easing-standard), color var(--duration-fast) var(--e` |  |
| 1308 | `.n-switch-input` | `background var(--duration-fast) var(--easing-standard)` |  |
| 1309 | `.n-switch-input::after` | `transform var(--duration-fast) var(--easing-standard)` |  |
| 1334 | `.trash-sync-line` | `opacity var(--duration-fast) var(--easing-standard)` |  |
| 1424 | `.drawer` | `transform var(--duration-slow) var(--easing-standard)` |  |
| 1530 | `html.kb-sheet .drawer.open` | `transform 240ms cubic-bezier(0.22, 0.9, 0.3, 1)` |  |
| 1535 | `html.kb-sheet.kb-sheet-closing .drawer.open` | `transform 250ms cubic-bezier(0.25, 0.1, 0.25, 1)` |  |
| 1548 | `html.kb-sheet.kb-sheet-switching .drawer.open` | `transform 220ms cubic-bezier(0.25, 0.46, 0.45, 0.94)` |  |
| 1562 | `.theme-toggle-btn` | `background var(--duration-fast) var(--easing-standard), color var(--duration-fast) var(--e` |  |
| 1571 | `.app-modal` | `opacity var(--duration-base) var(--easing-standard), transform var(--duration-base) var(--` |  |
| 1632 | `.tabbar-glass` | `transform .82s cubic-bezier(.22,1,.36,1), background .82s cubic-bezier(.22,1,.36,1)` |  |
| 1676 | `nav.tabbar.pressed .tabbar-glass` | `transform .22s cubic-bezier(.22,1,.36,1), background .22s cubic-bezier(.22,1,.36,1)` |  |
| 1686 | `.tabbar-bubble` | `transform .6s cubic-bezier(.34,1.56,.64,1), width .6s cubic-bezier(.34,1.56,.64,1), opacit` | ⚠️ width |
| 1710 | `.tabbar-bubble.no-anim` | `none` |  |
| 1716 | `.tabbar-bubble::before` | `opacity .2s ease` |  |
| 1758 | `html.kb-sheet.kb-sheet-closing nav.tabbar` | `opacity 140ms ease-out` |  |
| 1786 | `.scroll-top-btn` | `opacity .38s ease, transform .42s cubic-bezier(.22,1,.36,1), background .2s ease, border-c` | ⚠️ border-color, box-shadow |
| 1808 | `.scroll-top-btn.visible` | `opacity .35s ease, transform .6s cubic-bezier(.34,1.56,.64,1), background .22s cubic-bezie` | ⚠️ border-color, box-shadow |
| 1822 | `.scroll-top-btn.pressed` | `transform .32s cubic-bezier(.34,1.56,.64,1), background .18s ease, border-color .18s ease,` | ⚠️ border-color, box-shadow |
| 1867 | `.scroll-top-btn.scrolling` | `transform .38s cubic-bezier(.22,1,.36,1), background .22s ease, border-color .22s ease, bo` | ⚠️ border-color, box-shadow |
| 1876 | `.scroll-top-btn::before` | `opacity .2s ease` |  |
| 1907 | `nav.tabbar button.tab-vytraty .tb-icon-wrap` | `background var(--duration-fast) var(--easing-standard)` |  |
| 2103 | `.ov-row3` | `grid-template-columns .25s var(--easing-standard)` |  |

## 9. Наявні `animation`

| Рядок | Селектор | Анімація |
|---|---|---|
| 269 | `.avatar-status-dot.syncing svg` | `syncSpin .9s linear infinite` |
| 270 | `.avatar-status-dot.done` | `syncPop .35s ease-out` |
| 271 | `.avatar-status-dot.error` | `syncPop .35s ease-out` |
| 724 | `.profile-status-dot.syncing` | `syncPulse 1s ease-in-out infinite` |
| 725 | `.profile-status-dot.done` | `syncPop .35s ease-out` |
| 726 | `.profile-status-dot.error` | `syncPop .35s ease-out` |
| 736 | `.sync-card-icon.syncing svg` | `syncSpin .9s linear infinite` |
| 977 | `.expense-row.just-synced` | `cardBlink .8s ease-in-out 3` |
| 1029 | `.skeleton` | `shimmer 1.4s ease infinite` |
| 1032 | `.btn-loading::after` | `spin .7s linear infinite` |
| 1333 | `.card-debt-compact-row.just-notified` | `cardBlink .8s ease-in-out 3` |
| 1383 | `.diag-flash` | `diagFlash 1.6s ease-out` |
| 1723 | `nav.tabbar.pressed .tabbar-bubble::before` | `tabbarBubbleShimmer 1s ease-in-out infinite` |
| 1882 | `.scroll-top-btn.pressed::before, .scroll-top-btn.scrolling::before` | `tabbarBubbleShimmer 1s ease-in-out infinite` |

`@keyframes`: `syncPulse`, `syncPop`, `syncSpin`, `cardBlink`, `shimmer` (скелетон, `background-position`), `spin`, `diagFlash`, `tabbarBubbleShimmer` (`background-position`).


## Статус M1 (Rev 2.24.0)

Реалізовано рух-фундамент: токени `--motion-*`/`--ease-*`/`--motion-k` на `:root`, `prefers-reduced-motion`, реакція на натискання (`.is-pressed`), перехід між вкладками, прибрані дорогі `transition`/`@keyframes`, тест `motion-intensity`, подія `motion-perf`. Деталі й таблиця «було → стало» — `docs/ROADMAP.md` 32.42. Токени вигляду `--ui-*` і каталог компонентів — M3/M4.
