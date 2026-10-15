# UI_PATTERNS · виміряні компоненти Money Tree
_Виміряно Claude Code в Chrome (CDP), синтетичні дані, без Cloud-сесії; обчислені стилі реальних компонентів. Ширина 390 і 440 (iPhone), обидві теми; для шапки, списків і шторок також iPad 820 і десктоп 1280. Скріншоти: `docs/ui/<компонент>-<ширина>-<тема>.png`. Чат проєктує макети лише з цих значень._

**Як читати.** Розмір у пт (CSS-пікселі). Якщо значення однакове на всіх ширинах, наведено одне число, інакше розписано по ширинах. Колір: токен із `:root` (темна → світла, якщо відрізняється); без токена показано обчислений rgb. Радіус: px (+ токен, якщо збігається). Відступи, радіус, шрифт і рух наведено для найвужчої ширини, де елемент видно (зазвичай 390, темна); на інших ширинах і темі вони не відрізняються, окрім зазначеного в колонці розміру й кольору.
**Обмеження вимірювання.** Натискання (M1) перевірено програмним класом `.is-pressed`, не жестом; рух береться з `transition` (тривалість і крива), а не з покадрового запису. На iPhone-пристрої не перевірялось.

## Шапка вкладки
Контейнер `.top` спільний для всіх вкладок: ліворуч профіль, праворуч дзвіночок і шестерня, по центру заголовок і підзаголовок; нижче вибір місяця (`.month-picker`). Скріншоти: `docs/ui/shapka-390-dark.png`, `docs/ui/shapka-390-light.png`; `docs/ui/shapka-440-dark.png`, `docs/ui/shapka-440-light.png`; `docs/ui/shapka-820-dark.png`, `docs/ui/shapka-820-light.png`; `docs/ui/shapka-1280-dark.png`, `docs/ui/shapka-1280-light.png`.

| Елемент | Селектор | Розмір, пт (ширина екрана) | Відступи (т п н л) | Радіус | Шрифт (розмір/рядок вага) | Колір тексту (темна → світла) | Тло (темна → світла) | Межа | Тінь | Рух |
|---|---|---|---|---|---|---|---|---|---|---|
| Контейнер | `.top` | 390: 390×137.5; 440: 440×137.5; 820: 820×137.5; 1280: 974×77.9 | 18px 20px 20px 20px | 0px | 16px/normal 400 | --color-text-primary (+2) | прозорий | — | — | — |
| Заголовок | `#page-title` | 390: 198×27; 440: 248×27; 820: 628×27; 1280: 974×34 | — | 0px | 21px/27px 700 ls -0.21px | --color-text-primary (+2) | прозорий | — | — | — |
| Підзаголовок | `.page-subtitle` | 390: 198×17.5; 440: 248×17.5; 820: 628×17.5; 1280: 974×18.9 | — | 0px | 12.5px/17.5px 400 | --color-text-secondary (+2) | прозорий | — | — | — |
| Кругла кнопка (профіль/дзвіночок/шестерня) | `.top .gear-btn` | 390: 36×36; 440: 36×36; 820: 36×36; 1280: 0×0 | — | 12px (--ui-r-small|--radius-md) | 13.3333px/normal 400 | --color-text-secondary (+2) | прозорий | — | — | background, color 0.12s, 0.12s cubic-bezier(0.4, 0, 0.2, 1), cu |
| Вибір місяця (піл) | `.month-pill` | 390: 180×37; 440: 180×37; 820: 180×37; 1280: 0×0 | 9px 14px 9px 14px | 999px (--ui-r-pill) | 16px/normal 400 | --color-text-primary (+2) | --color-surface | --color-border-strong | rgba(0, 0, 0, 0.35) 0px 2px 10px 0px | — |
| Вибір місяця (select) | `.month-pill select` | 390: 107×17; 440: 107×17; 820: 107×17; 1280: 0×0 | — | 0px | 14px/normal 700 | --color-text-primary (+2) | прозорий | — | — | — |
| Десктоп ≥1280: бічна панель | `.side` | 390: 0×0; 440: 0×0; 820: 0×0; 1280: 250×800 | 26px 16px 26px 16px | 0px | 16px/normal 400 | --color-text-primary (+2) | прозорий | — | — | — |
| Десктоп: пункт меню | `.side-tab` | 390: 0×0; 440: 0×0; 820: 0×0; 1280: 217×44 | 11px 12px 11px 12px | 12px (--ui-r-small|--radius-md) | 14px/normal 600 | --ui-accent-text (+1) → --color-primary-hover | --color-primary-bg (+2) → --color-primary-bg (+1) | — | — | background, color 0.12s, 0.12s cubic-bezier(0.4, 0, 0.2, 1), cu |
| Десктоп: активний пункт | `.side-tab.active` | 390: 0×0; 440: 0×0; 820: 0×0; 1280: 217×44 | 11px 12px 11px 12px | 12px (--ui-r-small|--radius-md) | 14px/normal 600 | --ui-accent-text (+1) → --color-primary-hover | --color-primary-bg (+2) → --color-primary-bg (+1) | — | — | background, color 0.12s, 0.12s cubic-bezier(0.4, 0, 0.2, 1), cu |
| Десктоп: вибір місяця | `.side .month-picker select` | 390: 0×0; 440: 0×0; 820: 0×0; 1280: 146.4×37 | 8px 10px 8px 10px | 10px (--radius-sm) | 14px/normal 600 | --color-text-primary (+2) | --color-surface | --color-border-strong | — | — |

## Таббар
Плаваюча «скляна» панель знизу; ковзна бульбашка під активною вкладкою; центральна кнопка «Витрати» піднята. Скріншоти: `docs/ui/tabbar-390-dark.png`, `docs/ui/tabbar-390-light.png`; `docs/ui/tabbar-440-dark.png`, `docs/ui/tabbar-440-light.png`; `docs/ui/tabbar-820-dark.png`, `docs/ui/tabbar-820-light.png`; `docs/ui/tabbar-1280-dark.png`, `docs/ui/tabbar-1280-light.png`.

| Елемент | Селектор | Розмір, пт (ширина екрана) | Відступи (т п н л) | Радіус | Шрифт (розмір/рядок вага) | Колір тексту (темна → світла) | Тло (темна → світла) | Межа | Тінь | Рух |
|---|---|---|---|---|---|---|---|---|---|---|
| Панель | `.tabbar` | 390: 362×74; 440: 412×74; 820: 460×74; 1280: 0×0 | — | 0px | 16px/normal 400 | --color-text-primary (+2) | прозорий | — | — | — |
| Скляний шар | `.tabbar-glass` | 390: 362×74; 440: 412×74; 820: 460×74; 1280: 0×0 | 6px 6px 6px 6px | 26px (--ui-r-container) | 16px/normal 400 | --color-text-primary (+2) | --color-glass-bg (+1) | --color-active-overlay (+3) | rgba(0, 0, 0, 0.5) 0px 10px 32px 0px, rgba(0, 0, 0, 0.3) 0px 2px 8px 0px, rgba(255, 255, 2 | transform, background 0.82s, 0.82s cubic-bezier(0.22, 1, 0.36, 1),  |
| Кнопка вкладки | `.tabbar-glass > button` | 390: 69.6×60; 440: 79.6×60; 820: 89.2×60; 1280: 0×0 | 8px 4px 8px 4px | 18px (--ui-r-control) | 10.5px/normal 600 | --ui-accent-text (+1) → --color-primary-hover | прозорий | — | — | background, color 0.12s, 0.12s cubic-bezier(0.4, 0, 0.2, 1), cu |
| Активна вкладка | `.tabbar-glass > button.active` | 390: 69.6×60; 440: 79.6×60; 820: 89.2×60; 1280: 0×0 | 8px 4px 8px 4px | 18px (--ui-r-control) | 10.5px/normal 600 | --ui-accent-text (+1) → --color-primary-hover | прозорий | — | — | background, color 0.12s, 0.12s cubic-bezier(0.4, 0, 0.2, 1), cu |
| Бульбашка | `.tabbar-bubble` | 390: 70×60; 440: 80×60; 820: 89×60; 1280: 0×0 | — | 18px (--ui-r-control) | 16px/normal 400 | --color-text-primary (+2) | --color-primary-bg (+2) → --ui-accent-bg | --ui-accent-border | rgba(34, 197, 94, 0.22) 0px 2px 8px 0px | transform, opacity 0.6s, 0.22s cubic-bezier(0.34, 1.56, 0.64, 1 |
| Кнопка «Витрати» | `.tabbar-glass > button.tab-vytraty` | 390: 69.6×60; 440: 79.6×60; 820: 89.2×60; 1280: 0×0 | 8px 4px 8px 4px | 18px (--ui-r-control) | 10.5px/normal 600 | --color-text-secondary (+2) | прозорий | — | — | background, color 0.12s, 0.12s cubic-bezier(0.4, 0, 0.2, 1), cu |

## Сегменти (скляний індикатор)
Компонент `.struct-tabs` із `.seg-indicator` (ковзна бульбашка) і необов'язковим бейджем. Динамічні сегменти підключати через `initSegments()`. Скріншоти: `docs/ui/segmenty-390-dark.png`, `docs/ui/segmenty-390-light.png`; `docs/ui/segmenty-440-dark.png`, `docs/ui/segmenty-440-light.png`.

| Елемент | Селектор | Розмір, пт (ширина екрана) | Відступи (т п н л) | Радіус | Шрифт (розмір/рядок вага) | Колір тексту (темна → світла) | Тло (темна → світла) | Межа | Тінь | Рух |
|---|---|---|---|---|---|---|---|---|---|---|
| Контейнер | `.struct-tabs` | 390: 350×43.5; 440: 400×43.5; 820: 780×43.5; 1280: 974×43.5 | 4px 4px 4px 4px | 26px (--ui-r-container) | 16px/normal 400 | --color-text-primary (+2) | --color-glass-bg (+1) | — | rgba(255, 255, 255, 0.1) 0px 0px 0px 1px inset, rgba(255, 255, 255, 0.08) 0px 1px 0px 0px  | — |
| Кнопка | `.struct-tab-btn` | 390: 111.3×35.5; 440: 128×35.5; 820: 254.7×35.5; 1280: 319.3×35.5 | 9px 4px 9px 4px | 18px (--ui-r-control) | 13px/normal 600 | --ui-accent-text (+1) → --ui-accent-text | прозорий | — | — | background, color 0.12s, 0.12s cubic-bezier(0.4, 0, 0.2, 1), cu |
| Активна | `.struct-tab-btn.active` | 390: 111.3×35.5; 440: 128×35.5; 820: 254.7×35.5; 1280: 319.3×35.5 | 9px 4px 9px 4px | 18px (--ui-r-control) | 13px/normal 600 | --ui-accent-text (+1) → --ui-accent-text | прозорий | — | — | background, color 0.12s, 0.12s cubic-bezier(0.4, 0, 0.2, 1), cu |
| Індикатор | `.seg-indicator` | 390: 111×35; 440: 128×35; 820: 255×35; 1280: 319×35 | — | 18px (--ui-r-control) | 16px/normal 400 | --color-text-primary (+2) | --color-primary-bg (+2) → --ui-accent-bg | --ui-accent-border | rgba(34, 197, 94, 0.22) 0px 2px 8px 0px | transform, opacity 0.48s, 0.2s cubic-bezier(0.34, 1.56, 0.64, 1 |
| Бейдж | `.seg-badge` | 16×16 | 0px 4px 0px 4px | 999px (--ui-r-pill) | 10px/16px 700 | rgb(255, 255, 255) → --color-surface | --ui-warning-strong → --ui-warning-strong (+1) | — | — | — |

## Групований список і рядок (48/52/56)
Підсумкова картка + підпис розділу + список компактних рядків (`.card-debt-compact-row`: аватар, текст, суми). Висоти рядків у застосунку: компактний рядок списку (нижче), рядок форми `.sf-row` 48, рядок повідомлення картки платежів 34. Скріншоти: `docs/ui/spysok-390-dark.png`, `docs/ui/spysok-390-light.png`; `docs/ui/spysok-440-dark.png`, `docs/ui/spysok-440-light.png` (820/1280: зміна лише ширини контейнера, див. розмір).

| Елемент | Селектор | Розмір, пт (ширина екрана) | Відступи (т п н л) | Радіус | Шрифт (розмір/рядок вага) | Колір тексту (темна → світла) | Тло (темна → світла) | Межа | Тінь | Рух |
|---|---|---|---|---|---|---|---|---|---|---|
| Підсумкова картка | `.card-summary` | 390: 350×57; 440: 400×57; 820: 780×57; 1280: 974×57 | 16px 18px 16px 18px | 18px (--ui-r-control) | 16px/normal 400 | --color-text-primary (+2) | --color-surface | --color-active-overlay (+3) | rgba(255, 255, 255, 0.08) 0px 1px 0px 0px inset, rgba(0, 0, 0, 0.35) 0px 2px 8px 0px | — |
| Рядок підсумку | `.card-summary-row` | 390: 312×23; 440: 362×23; 820: 742×23; 1280: 936×23 | — | 0px | 16px/normal 400 | --color-text-primary (+2) | прозорий | — | — | — |
| Підпис підсумку | `.card-summary-label` | 95.2×15 | — | 0px | 12px/normal 600 | --color-text-secondary (+2) | прозорий | — | — | — |
| Значення підсумку | `.card-summary-value` | 32.4×23 | — | 0px | 18px/normal 800 | --color-text-primary (+2) | прозорий | — | — | — |
| Підпис розділу | `.section-label` | 390: 346×14; 440: 396×14; 820: 776×14; 1280: 970×14 | — | 0px | 11px/normal 700 ls 0.6px | --color-text-secondary (+2) | прозорий | — | — | — |
| Список | `.bank-debt-table` | 390: 350×206; 440: 400×206; 820: 780×206; 1280: 974×206 | — | 0px | 16px/normal 400 | --color-text-primary (+2) | прозорий | — | — | — |
| Рядок | `.card-debt-compact-row` | 390: 350×62; 440: 400×62; 820: 780×62; 1280: 974×62 | 11px 12px 11px 12px | 18px (--ui-r-control) | 13.3333px/normal 400 | rgb(255, 255, 255) → rgb(0, 0, 0) | --color-surface | --color-active-overlay (+3) | rgba(255, 255, 255, 0.08) 0px 1px 0px 0px inset, rgba(0, 0, 0, 0.35) 0px 2px 8px 0px | background 0.12s cubic-bezier(0.4, 0, 0.2, 1) |
| Рядок (вкладка «Борги») | `#bank-debt-table .card-debt-compact-row` | 390: 350×62; 440: 400×62; 820: 780×62; 1280: 974×62 | 11px 12px 11px 12px | 18px (--ui-r-control) | 13.3333px/normal 400 | rgb(255, 255, 255) → rgb(0, 0, 0) | --color-surface | --color-active-overlay (+3) | rgba(255, 255, 255, 0.08) 0px 1px 0px 0px inset, rgba(0, 0, 0, 0.35) 0px 2px 8px 0px | background 0.12s cubic-bezier(0.4, 0, 0.2, 1) |
| Аватар | `.cdr-avatar` | 38×38 | — | 0px | 13.3333px/normal 400 | rgb(255, 255, 255) → rgb(0, 0, 0) | прозорий | — | — | — |
| Текстова частина | `.cdr-main` | 390: 218.9×32; 440: 268.9×32; 820: 648.9×32; 1280: 842.9×32 | — | 0px | 13.3333px/normal 400 | rgb(255, 255, 255) → rgb(0, 0, 0) | прозорий | — | — | — |
| Суми | `.cdr-amounts` | 26.1×19 | — | 0px | 13.3333px/normal 400 | rgb(255, 255, 255) → rgb(0, 0, 0) | прозорий | — | — | — |

## Журнал (екран на всю висоту)
Повноекранний шар `#journal-overlay`: верхня смуга з кнопкою «назад», рядок пошуку, групи за днями. Скріншоти: `docs/ui/zhurnal-390-dark.png`, `docs/ui/zhurnal-390-light.png`; `docs/ui/zhurnal-440-dark.png`, `docs/ui/zhurnal-440-light.png`; `docs/ui/zhurnal-820-dark.png`, `docs/ui/zhurnal-820-light.png`; `docs/ui/zhurnal-1280-dark.png`, `docs/ui/zhurnal-1280-light.png`.

| Елемент | Селектор | Розмір, пт (ширина екрана) | Відступи (т п н л) | Радіус | Шрифт (розмір/рядок вага) | Колір тексту (темна → світла) | Тло (темна → світла) | Межа | Тінь | Рух |
|---|---|---|---|---|---|---|---|---|---|---|
| Верхня смуга | `.journal-overlay-top` | 390: 350×51; 440: 400×51; 820: 780×51; 1280: 974×51 | 0px 0px 14px 0px | 0px | 16px/normal 400 | --color-text-primary (+2) | прозорий | — | — | — |
| Пошук | `.journal-search-input-wrap` | 390: 350×44; 440: 400×44; 820: 780×44; 1280: 974×44 | — | 0px | 16px/normal 400 | --color-text-primary (+2) | прозорий | — | — | — |
| Навігація місяцем | `#journal-overlay .journal-month-nav` | 390: 350×69; 440: 400×69; 820: 780×69; 1280: 974×59 | — | 0px | 16px/normal 400 | --color-text-primary (+2) | прозорий | — | — | — |
| Група дня | `#journal-overlay .journal-day-group` | 390: 350×180; 440: 400×180; 820: 780×180; 1280: 974×180 | — | 0px | 16px/normal 400 | --color-text-primary (+2) | прозорий | — | — | — |
| Рядок запису | `#journal-overlay .expense-row` | 390: 350×68; 440: 400×68; 820: 780×68; 1280: 974×68 | 12px 14px 12px 14px | 18px (--ui-r-control) | 16px/normal 400 | --color-text-primary (+2) | --color-surface | --color-active-overlay (+3) | rgba(255, 255, 255, 0.08) 0px 1px 0px 0px inset, rgba(0, 0, 0, 0.35) 0px 2px 8px 0px | background, transform 0.12s, 0.12s cubic-bezier(0.4, 0, 0.2, 1), cu |

## Шторка `.drawer` (форма)
Домінантний патерн форм: плаваюча шторка знизу з ручкою, шапкою (заголовок + «×»), групами `.sf-group` з рядками `.sf-row` по 48, кнопками «Скасувати / Додати» внизу. Зразок: форма «Нова категорія» (`openStructForm`). Прозорий `select` поверх рядка, значення малюється окремо. Скріншоти: `docs/ui/shtorka-390-dark.png`, `docs/ui/shtorka-390-light.png`; `docs/ui/shtorka-440-dark.png`, `docs/ui/shtorka-440-light.png`; `docs/ui/shtorka-820-dark.png`, `docs/ui/shtorka-820-light.png`; `docs/ui/shtorka-1280-dark.png`, `docs/ui/shtorka-1280-light.png`.

| Елемент | Селектор | Розмір, пт (ширина екрана) | Відступи (т п н л) | Радіус | Шрифт (розмір/рядок вага) | Колір тексту (темна → світла) | Тло (темна → світла) | Межа | Тінь | Рух |
|---|---|---|---|---|---|---|---|---|---|---|
| Шторка | `.drawer.open` | 390: 358×316.4; 440: 408×316.4; 820: 788×298.9; 1280: 360×700 | 20px 20px 20px 20px | 26px (--ui-r-container) | 16px/normal 400 | --color-text-primary (+2) | --color-surface | — | rgba(255, 255, 255, 0.08) 0px 1px 0px 0px inset, rgba(0, 0, 0, 0.45) 0px 4px 18px 0px | transform 0.24s cubic-bezier(0.4, 0, 0.2, 1) |
| Ручка | `.drawer-handle` | 390: 358×18; 440: 408×18; 820: 788×18; 1280: 0×0 | 8px 0px 6px 0px | 0px | 16px/normal 400 | --color-text-primary (+2) | прозорий | — | — | — |
| Заголовок | `#sf-title` | 390: 318×23.4; 440: 368×23.4; 820: 748×23.4; 1280: 320×23.4 | — | 0px | 18px/23.4px 700 | --color-text-primary (+2) | прозорий | — | — | — |
| Підказка під полем | `.struct-caption` | 390: 310×35; 440: 360×35; 820: 740×17.5; 1280: 312×35 | — | 0px | 12.5px/17.5px 400 | --color-text-secondary (+2) | прозорий | — | — | — |
| Ряд кнопок | `.sf-actions` | 390: 318×56; 440: 368×56; 820: 748×56; 1280: 320×56 | — | 0px | 16px/normal 400 | --color-text-primary (+2) | прозорий | — | — | — |
| Група | `.sf-group` | 390: 318×50; 440: 368×50; 820: 748×50; 1280: 320×50 | — | 18px (--ui-r-control) | 16px/normal 400 | --color-text-primary (+2) | --color-glass-bg (+1) | --color-border | — | — |
| Рядок | `.sf-row` | 390: 316×48; 440: 366×48; 820: 746×48; 1280: 318×48 | 0px 14px 0px 14px | 0px | 16px/normal 400 | --color-text-primary (+2) | прозорий | — | — | — |
| Поле вводу | `.sf-input` | 390: 244×48; 440: 294×48; 820: 674×48; 1280: 246×48 | — | 0px | 16px/normal 400 | --color-text-primary (+2) | прозорий | — | — | — |
| Кнопка (основна) | `#sf-save` | 390: 153×50; 440: 178×50; 820: 368×50; 1280: 154×50 | 14px 14px 14px 14px | 18px (--ui-r-control) | 15px/normal 600 | rgb(255, 255, 255) → --color-surface | --ui-accent-strong (+1) | — | rgba(255, 255, 255, 0.25) 0px 1px 0px 0px inset, rgba(16, 24, 40, 0.14) 0px 2px 8px 0px | background 0.12s cubic-bezier(0.4, 0, 0.2, 1) |
| Кнопка (вторинна) | `#sf-cancel` | 390: 155×50; 440: 180×50; 820: 370×50; 1280: 156×50 | 14px 14px 14px 14px | 18px (--ui-r-control) | 15px/normal 600 | --color-text-primary (+2) | прозорий | --color-border-strong | — | background 0.12s cubic-bezier(0.4, 0, 0.2, 1) |
| Підкладка | `.drawer-backdrop.open` | 390: 390×844; 440: 440×956; 820: 820×1180; 1280: 1280×800 | — | 0px | 16px/normal 400 | --color-text-primary (+2) | rgb(16, 24, 40, 0.45) | — | — | — |

## Діалог підтвердження
`showConfirmModal(текст, onConfirm, підпис, варіант)`; варіант `danger` для руйнівних дій. Скріншоти: `docs/ui/dialog-390-dark.png`, `docs/ui/dialog-390-light.png`; `docs/ui/dialog-440-dark.png`, `docs/ui/dialog-440-light.png`.

| Елемент | Селектор | Розмір, пт (ширина екрана) | Відступи (т п н л) | Радіус | Шрифт (розмір/рядок вага) | Колір тексту (темна → світла) | Тло (темна → світла) | Межа | Тінь | Рух |
|---|---|---|---|---|---|---|---|---|---|---|
| Діалог | `#app-modal.open` | 390: 350×152.5; 440: 360×152.5; 820: 360×152.5; 1280: 360×152.5 | 22px 20px 22px 20px | 26px (--ui-r-container) | 16px/normal 400 | --color-text-primary (+2) | --color-surface | — | rgba(255, 255, 255, 0.08) 0px 1px 0px 0px inset, rgba(0, 0, 0, 0.45) 0px 4px 18px 0px | opacity, transform 0.18s, 0.18s cubic-bezier(0.4, 0, 0.2, 1), cu |
| Текст | `#app-modal-text` | 390: 310×43.5; 440: 320×43.5; 820: 320×43.5; 1280: 320×43.5 | — | 0px | 14.5px/21.75px 400 | --color-text-primary (+2) | прозорий | — | — | — |

Кнопки діалогу (390, темна):
- кнопка 1: 151×49, радіус 18px (--ui-r-control), шрифт 15px/normal 600, колір --color-text-primary (+2), тло --color-glass-bg (+1), межа --color-active-overlay (+3)
- кнопка 2: 149×49, радіус 18px (--ui-r-control), шрифт 15px/normal 600, колір rgb(255, 255, 255), тло --ui-danger-strong, межа —

## Верхнє сповіщення (тост)
`showToast({kind, title, subtitle, icon})`; види `success`, `info`, `warning`, `error`; черга по одному. Скріншоти: `docs/ui/tost-390-dark.png`, `docs/ui/tost-390-light.png`; `docs/ui/tost-440-dark.png`, `docs/ui/tost-440-light.png`.

| Елемент | Селектор | Розмір, пт (ширина екрана) | Відступи (т п н л) | Радіус | Шрифт (розмір/рядок вага) | Колір тексту (темна → світла) | Тло (темна → світла) | Межа | Тінь | Рух |
|---|---|---|---|---|---|---|---|---|---|---|
| Контейнер-хост | `#success-toast-host` | 390: 358×57.4; 440: 408×57.4; 820: 788×57.4; 1280: 1248×57.4 | — | 0px | 16px/normal 400 | --color-text-primary (+2) | прозорий | — | — | — |
| Тост | `.success-toast` | 178.1×57.4 | 10px 10px 10px 12px | 22px | 16px/normal 400 | --color-text-primary (+2) | --color-glass-bg (+1) | --color-active-overlay (+3) | rgba(255, 255, 255, 0.08) 0px 1px 0px 0px inset, rgba(0, 0, 0, 0.45) 0px 4px 18px 0px | — |
| Заголовок | `.success-toast-title` | 112.1×18.2 | — | 0px | 14px/18.2px 600 | --color-text-primary (+2) | прозорий | — | — | — |
| Підзаголовок | `.success-toast-sub` | 112.1×16.3 | — | 0px | 12.5px/16.25px 400 | --color-text-secondary (+2) | прозорий | — | — | — |

## Картка «Аналітики»
Два зразки: KPI-картка (`.kpi-card.v2`) і картка «Найближчі платежі» (`.pay-card`, смуга днів у три рядки). Скріншоти: `docs/ui/kpi-card-390-dark.png`, `docs/ui/kpi-card-390-light.png`; `docs/ui/kpi-card-440-dark.png`, `docs/ui/kpi-card-440-light.png`; `docs/ui/pay-card-390-dark.png`, `docs/ui/pay-card-390-light.png`; `docs/ui/pay-card-440-dark.png`, `docs/ui/pay-card-440-light.png`.

| Елемент | Селектор | Розмір, пт (ширина екрана) | Відступи (т п н л) | Радіус | Шрифт (розмір/рядок вага) | Колір тексту (темна → світла) | Тло (темна → світла) | Межа | Тінь | Рух |
|---|---|---|---|---|---|---|---|---|---|---|
| KPI-картка | `.kpi-card.v2.income` | 390: 169×180; 440: 194×180; 820: 384×180; 1280: 182×180 | 16px 16px 16px 16px | 18px (--ui-r-control) | 16px/normal 400 | --color-text-primary (+2) | --color-surface | --color-active-overlay (+3) | rgba(255, 255, 255, 0.08) 0px 1px 0px 0px inset, rgba(0, 0, 0, 0.35) 0px 2px 8px 0px | — |
| KPI: підпис | `.kpi-card.v2.income .kpi-label` | 51.4×14 | — | 0px | 11px/14px 700 | --color-text-primary (+2) | прозорий | — | — | — |
| KPI: іконка | `.kpi-card.v2.income .kpi-icon-circle` | 40×40 | — | 50% | 16px/normal 400 | --color-primary (+3) | --color-primary-bg (+2) → --color-primary-bg (+1) | — | — | — |
| Платежі: картка | `#payments-card` | 390: 350×208; 440: 400×208; 820: 780×208; 1280: 974×208 | 12px 14px 0px 14px | 20px (--radius-lg) | 16px/normal 400 | --color-text-primary (+2) | --color-surface | --color-border | — | — |
| Платежі: заголовок | `#payments-card .pay-line1` | 390: 320×34; 440: 370×34; 820: 750×34; 1280: 944×34 | — | 0px | 14px/normal 400 | --color-text-primary (+2) | прозорий | — | — | — |
| Платежі: комірка дня | `#payments-card .pay-day` | 390: 43.1×53; 440: 50.3×53; 820: 104.6×53; 1280: 132.3×53 | 4px 0px 4px 0px | 12px (--ui-r-small|--radius-md) | 16px/normal 400 | --color-text-primary (+2) | прозорий | --color-border-strong | — | background, color 0.12s, 0.12s cubic-bezier(0.4, 0, 0.2, 1), cu |
| Платежі: рядок повідомлення | `#payments-card .pay-msg` | 390: 320×34; 440: 370×34; 820: 750×34; 1280: 944×34 | — | 0px | 13px/normal 400 | --ui-warning-text (+1) → --color-warning | прозорий | — | — | — |

## Порожній стан
Порожня аналітика (`#analytics-empty`): піктограма, заголовок, пояснення. Скріншоти: `docs/ui/porozhniy-390-dark.png`, `docs/ui/porozhniy-390-light.png`; `docs/ui/porozhniy-440-dark.png`, `docs/ui/porozhniy-440-light.png`.

| Елемент | Селектор | Розмір, пт (ширина екрана) | Відступи (т п н л) | Радіус | Шрифт (розмір/рядок вага) | Колір тексту (темна → світла) | Тло (темна → світла) | Межа | Тінь | Рух |
|---|---|---|---|---|---|---|---|---|---|---|
| Контейнер | `#analytics-empty` | 390: 350×207; 440: 400×173; 820: 780×158; 1280: 974×158 | 40px 20px 40px 20px | 0px | 16px/normal 400 | --color-text-secondary (+2) | прозорий | — | — | — |
| Піктограма | `#analytics-empty .glyph` | 390: 310×30; 440: 360×30; 820: 740×30; 1280: 934×30 | — | 0px | 16px/normal 400 | --color-text-secondary (+2) | прозорий | — | — | — |
| Заголовок | `#analytics-empty .ae-title` | 390: 310×38; 440: 360×19; 820: 740×19; 1280: 934×19 | — | 0px | 15px/normal 700 | --color-text-primary (+2) | прозорий | — | — | — |
| Пояснення | `#analytics-empty .ae-sub` | 390: 310×45; 440: 360×30; 820: 740×15; 1280: 934×15 | — | 0px | 12.5px/normal 400 | --color-text-secondary (+2) | прозорий | — | — | — |

## Кнопки: основна, обведена, текстова, руйнівна
Скріншот сторінки «Сервіс» з кнопками: `docs/ui/knopky-390-dark.png`, `docs/ui/knopky-390-light.png`; `docs/ui/knopky-440-dark.png`, `docs/ui/knopky-440-light.png`.

| Елемент | Селектор | Розмір, пт (ширина екрана) | Відступи (т п н л) | Радіус | Шрифт (розмір/рядок вага) | Колір тексту (темна → світла) | Тло (темна → світла) | Межа | Тінь | Рух |
|---|---|---|---|---|---|---|---|---|---|---|
| Широка картка «Сервісу» | `.service-wide-card` | 390: 350×72; 440: 400×72; 820: 780×72; 1280: 974×72 | 16px 16px 16px 16px | 18px (--ui-r-control) | 13.3333px/normal 400 | rgb(255, 255, 255) → rgb(0, 0, 0) | --color-surface | --color-active-overlay (+3) | rgba(255, 255, 255, 0.08) 0px 1px 0px 0px inset, rgba(0, 0, 0, 0.35) 0px 2px 8px 0px | background, color 0.12s, 0.12s cubic-bezier(0.4, 0, 0.2, 1), cu |
| Основна (`.submit-btn.pill`) | `.submit-btn.pill` | 390: 316×47; 440: 366×47; 820: 746×47; 1280: 940×47 | 14px 14px 14px 14px | 18px (--ui-r-control) | 15px/normal 600 | rgb(255, 255, 255) → --color-surface | --ui-accent-strong (+1) | — | rgba(255, 255, 255, 0.25) 0px 1px 0px 0px inset, rgba(16, 24, 40, 0.14) 0px 2px 8px 0px | background 0.12s cubic-bezier(0.4, 0, 0.2, 1) |
| Обведена/вторинна (`.secondary`) | `.submit-btn.pill.secondary` | 390: 318×50; 440: 368×50; 820: 748×50; 1280: 320×50 | 14px 14px 14px 14px | 18px (--ui-r-control) | 15px/normal 600 | --color-text-primary (+2) | прозорий | --color-border-strong | — | background 0.12s cubic-bezier(0.4, 0, 0.2, 1) |
| Руйнівна обведена (`.danger-outline`) | `.submit-btn.pill.danger-outline` | 0×0 | 14px 14px 14px 14px | 18px (--ui-r-control) | 15px/normal 600 | --ui-danger-text (+2) → --ui-danger-text | --ui-danger-glass | --color-error (+2) | — | background 0.12s cubic-bezier(0.4, 0, 0.2, 1) |

Текстова кнопка: `.cdd-delete-link` (посилання «Видалити» в шторках карток), без тла й межі.

### Натискання (M1, клас `.is-pressed`, 390 темна)
| Елемент | До | Після |
|---|---|---|
| btn-pill | transform none; opacity 1 | transform none; opacity 1; тло rgb(21, 128, 61); рух 0.12s |
| list-row | transform none; opacity 1 | transform none; opacity 1; тло rgb(21, 27, 38); рух 0.12s |
| tabbar-btn | transform none; opacity 1 | transform none; opacity 1; тло rgba(0, 0, 0, 0); рух 0.12s, 0.12s |
| segment-btn | transform none; opacity 1 | transform none; opacity 1; тло rgba(0, 0, 0, 0); рух 0.12s, 0.12s |

## Токени кольорів і руху
Значення з `:root` у кожній темі (кольори `--color-*` і `--ui-*`, відступи `--space-*`, радіуси, тіні, рух `--motion-*`/`--duration-*`/`--ease-*`).

| Токен | Темна | Світла |
|---|---|---|
| `--color-accent-pink` | #F472B6 | #EC4899 |
| `--color-accent-pink-bg` | rgba(236,72,153,.2) | #FCE7F3 |
| `--color-accent-purple` | #C084FC | #9333EA |
| `--color-accent-purple-bg` | rgba(147,51,234,.2) | #F5E9FE |
| `--color-active-overlay` | rgba(255,255,255,.1) | rgba(16,24,40,.07) |
| `--color-bg` | #0B0F16 | #F7F8FA |
| `--color-border` | #262E3B | #E6EAF2 |
| `--color-border-strong` | #2E3745 | #E6EAF2 |
| `--color-chart-grid` | #29323F | #D1D5DB |
| `--color-disabled-bg` | #1A212C | #F2F4F7 |
| `--color-disabled-text` | #4B5563 | #D0D5DD |
| `--color-error` | #F87171 | #EF4444 |
| `--color-error-bg` | rgba(239,68,68,.18) | #FDECEC |
| `--color-error-hover` | #FCA5A5 | #DC2626 |
| `--color-expense` | #F1F4F8 | #101828 |
| `--color-expense-bg` | #1E2530 | #F1F3F5 |
| `--color-glass-bg` | rgba(21,27,38,.62) | rgba(255,255,255,.52) |
| `--color-glass-border` | rgba(255,255,255,.1) | rgba(255,255,255,.7) |
| `--color-glass-pressed-bg` | rgba(31,38,52,.82) | rgba(255,255,255,.74) |
| `--color-glass-shimmer` | rgba(255,255,255,.22) | rgba(255,255,255,.65) |
| `--color-hover-overlay` | rgba(255,255,255,.06) | rgba(16,24,40,.04) |
| `--color-info` | #60A5FA | #3B82F6 |
| `--color-info-bg` | rgba(59,130,246,.18) | #EAF1FE |
| `--color-muted` | #94A0B4 | #64748B |
| `--color-primary` | #22C55E | #22C55E |
| `--color-primary-bg` | rgba(34,197,94,.16) | #EAFBF1 |
| `--color-primary-hover` | #34D673 | #16A34A |
| `--color-success` | #22C55E | #22C55E |
| `--color-success-bg` | rgba(34,197,94,.16) | #EAFBF1 |
| `--color-surface` | #151B26 | #FFFFFF |
| `--color-surface-hover` | #1E2530 | #F1F3F5 |
| `--color-text-primary` | #F1F4F8 | #101828 |
| `--color-text-secondary` | #94A0B4 | #64748B |
| `--color-text-tertiary` | #7C8BA3 | #94A3B8 |
| `--color-track-bg` | #1E2530 | #F1F5F9 |
| `--color-warning` | #F59E0B | #F59E0B |
| `--color-warning-bg` | rgba(245,158,11,.16) | #FEF3E2 |
| `--color-warning-hover` | #FBBF24 | #D97706 |
| `--duration-base` | 180ms | 180ms |
| `--duration-fast` | 120ms | 120ms |
| `--duration-slow` | 240ms | 240ms |
| `--ease-out` | cubic-bezier(.22,1,.36,1) | cubic-bezier(.22,1,.36,1) |
| `--ease-spring` | cubic-bezier(.34,1.56,.64,1) | cubic-bezier(.34,1.56,.64,1) |
| `--ease-standard` | cubic-bezier(.4,0,.2,1) | cubic-bezier(.4,0,.2,1) |
| `--easing-standard` | cubic-bezier(.4,0,.2,1) | cubic-bezier(.4,0,.2,1) |
| `--motion-bars` | calc(700ms * 1) | calc(700ms * 1) |
| `--motion-card` | calc(420ms * 1) | calc(420ms * 1) |
| `--motion-chart` | calc(900ms * 1) | calc(900ms * 1) |
| `--motion-count` | calc(1000ms * 1) | calc(1000ms * 1) |
| `--motion-k` | 1 | 1 |
| `--motion-l` | calc(480ms * 1) | calc(480ms * 1) |
| `--motion-m` | calc(320ms * 1) | calc(320ms * 1) |
| `--motion-micro` | calc(120ms * 1) | calc(120ms * 1) |
| `--motion-s` | calc(200ms * 1) | calc(200ms * 1) |
| `--radius-lg` | 20px | 20px |
| `--radius-md` | 12px | 12px |
| `--radius-sm` | 10px | 10px |
| `--radius-xl` | 24px | 24px |
| `--shadow-glass` | 0 10px 32px rgba(0,0,0,.5), 0 2px 8px rgba(0,0,0,.3), inset 0 1px 0 rgba(255,255,255,.08) | 0 10px 32px rgba(16,24,40,.16), 0 2px 8px rgba(16,24,40,.06), inset 0 1px 0 rgba(255,255,255,.5) |
| `--shadow-lg` | 0 4px 18px rgba(0,0,0,.45) | 0 2px 10px rgba(15,23,42,.05) |
| `--shadow-md` | 0 2px 12px rgba(0,0,0,.35) | 0 2px 10px rgba(15,23,42,.05) |
| `--shadow-sm` | 0 2px 10px rgba(0,0,0,.35) | 0 2px 10px rgba(15,23,42,.05) |
| `--space-1` | 4px | 4px |
| `--space-2` | 8px | 8px |
| `--space-3` | 12px | 12px |
| `--space-4` | 16px | 16px |
| `--space-5` | 24px | 24px |
| `--space-6` | 32px | 32px |
| `--space-7` | 40px | 40px |
| `--space-8` | 48px | 48px |
| `--space-9` | 64px | 64px |
| `--ui-accent` | #22C55E | #22C55E |
| `--ui-accent-bg` | rgba(34,197,94,.16) | rgba(34,197,94,.16) |
| `--ui-accent-border` | rgba(34,197,94,.32) | rgba(34,197,94,.32) |
| `--ui-accent-strong` | #15803D | #15803D |
| `--ui-accent-text` | #34D673 | #166534 |
| `--ui-btn-border` | rgba(255,255,255,.10) | rgba(16,24,40,.10) |
| `--ui-btn-highlight` | rgba(255,255,255,.08) | rgba(255,255,255,.9) |
| `--ui-btn-shadow` | 0 2px 8px rgba(0,0,0,.35) | 0 2px 8px rgba(16,24,40,.08) |
| `--ui-danger` | #F87171 | #EF4444 |
| `--ui-danger-glass` | rgba(239,68,68,.08) | rgba(239,68,68,.08) |
| `--ui-danger-strong` | #DC2626 | #DC2626 |
| `--ui-danger-text` | #F87171 | #B91C1C |
| `--ui-glass` | rgba(21,27,38,.62) | rgba(255,255,255,.52) |
| `--ui-glass-border` | rgba(255,255,255,.1) | rgba(255,255,255,.7) |
| `--ui-glass-press` | rgba(31,38,52,.82) | rgba(255,255,255,.74) |
| `--ui-h-control` | 48px | 48px |
| `--ui-hit` | — | — |
| `--ui-hit-l` | — | — |
| `--ui-hit-r` | — | — |
| `--ui-hit-y` | — | — |
| `--ui-min-target` | 44px | 44px |
| `--ui-r-container` | 26px | 26px |
| `--ui-r-control` | 18px | 18px |
| `--ui-r-pill` | 999px | 999px |
| `--ui-r-small` | 12px | 12px |
| `--ui-success` | #22C55E | #22C55E |
| `--ui-success-strong` | #15803D | #15803D |
| `--ui-text` | #F1F4F8 | #101828 |
| `--ui-text-2` | #94A0B4 | #64748B |
| `--ui-warning-strong` | #B45309 | #B45309 |
| `--ui-warning-text` | #F59E0B | #B45309 |
