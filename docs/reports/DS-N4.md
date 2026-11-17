# DS-N4: тривалості й відступи

## DS-N4a · тривалості (Rev 2.32.343)
Правило: ≤ 150 мс → `--t-micro` (120), 151–260 → `--t-s` (200), 261–400 → `--t-m` (320), 401–640 → `--t-l` (480), 641–900 → `--t-count` (800). Замінено **45** значень у `transition`/`animation` (за значеннями: `.35s` ×10, `.22s` ×8, `.3s` ×8, `.8s` ×4, `.28s` ×4, `.26s` ×2, `.38s` ×2, `.25s` ×2, `.15s` ×2, `.16s` ×2, `.18s` ×1).

### Не змінювались (30 оголошень)
| Рядок | Причина | Селектор | Значення |
|---|---|---|---|
| 113 | infinite | `.avatar-status-dot.syncing svg` | `syncSpin .9s linear infinite` |
| 659 | infinite | `.profile-status-dot.syncing` | `syncPulse 1s ease-in-out infinite` |
| 671 | infinite | `.sync-card-icon.syncing svg` | `syncSpin .9s linear infinite` |
| 981 | infinite | `.skeleton::after` | `shimmer 1.4s ease infinite` |
| 986 | infinite | `.btn-loading::after` | `spin .7s linear infinite` |
| 1330 | reduced-motion | `#struct-dictionary .struct-dict-collapse` | `opacity 80ms linear` |
| 1613 | infinite | `.sync-slot[data-s="syncing"] .sl-ring` | `syncRing 1.1s linear infinite` |
| 1721 | шторка | `#notifications-drawer .nx-notice.nx-flash` | `nxFlash 600ms ease-in-out` |
| 1779 | > 900 мс | `.diag-flash` | `diagFlash 1.6s ease-out` |
| 1926 | kb-* | `html.kb-pipe.kb-sheet.kb-sheet-closing .drawer.open, html.kb-pipe.kb-s` | `250ms` |
| 1956 | kb-* | `html.kb-sheet.kb-sheet-switching .drawer.open` | `transform 220ms cubic-bezier(0.25, 0.46, 0.45, 0.94)` |
| 1961 | kb-* | `html.kb-sheet.kb-sheet-switching .app-modal.open` | `transform 220ms cubic-bezier(0.25, 0.46, 0.45, 0.94)` |
| 2020 | шторка | `.app-modal.open` | `appModalIn .24s cubic-bezier(.2,.8,.2,1) both` |
| 2021 | шторка | `.app-modal.leaving` | `appModalOut .2s ease-in both` |
| 2095 | kb-* | `html.kb-pipe.kb-sheet .drawer.open` | `var(--kb-pipe-ms, 280ms)` |
| 2096 | kb-* | `html.kb-pipe.kb-sheet .app-modal.open` | `var(--kb-pipe-ms, 280ms)` |
| 2135 | таббар/«вгору» | `.tabbar-glass` | `transform .82s cubic-bezier(.22,1,.36,1), background .82s cubic-bezier(.22,1,.36` |
| 2141 | таббар/«вгору» | `nav.tabbar.pressed .tabbar-glass` | `transform .22s cubic-bezier(.22,1,.36,1), background .22s cubic-bezier(.22,1,.36` |
| 2174 | таббар/«вгору» | `.tabbar-bubble` | `transform .6s cubic-bezier(.34,1.56,.64,1), opacity .22s ease` |
| 2193 | таббар/«вгору» | `nav.tabbar.pressed .tabbar-bubble::before` | `tabbarBubbleShimmer 1s ease-in-out infinite` |
| 2229 | kb-* | `html.kb-sheet.kb-sheet-closing nav.tabbar` | `opacity 140ms ease-out` |
| 2277 | таббар/«вгору» | `.scroll-top-btn` | `opacity .38s ease, transform .42s cubic-bezier(.22,1,.36,1), background var(--t-` |
| 2282 | таббар/«вгору» | `.scroll-top-btn.visible` | `opacity .35s ease, transform .6s cubic-bezier(.34,1.56,.64,1), background .22s c` |
| 2299 | таббар/«вгору» | `.scroll-top-btn.pressed` | `transform var(--t-m) cubic-bezier(.34,1.56,.64,1), background .18s ease, border-` |
| 2345 | таббар/«вгору» | `.scroll-top-btn.scrolling` | `transform .38s cubic-bezier(.22,1,.36,1), background .22s ease, border-color .22` |
| 2357 | таббар/«вгору» | `.scroll-top-btn::after` | `opacity .22s ease` |
| 2360 | таббар/«вгору» | `.scroll-top-btn.pressed .stb-clip::before, .scroll-top-btn.scrolling .` | `tabbarBubbleShimmer 1s ease-in-out infinite` |
| 2817 | шторка | `*:not(.drawer):not(.drawer-backdrop):not(.side):not(.side-panel), *::b` | `80ms !important` |
| 2822 | шторка | `.app-modal.open` | `appModalFadeIn 80ms linear both` |
| 2823 | шторка | `.app-modal.leaving` | `appModalFadeOut 80ms linear both` |

Пояснення: «шторка» — `.app-modal`, `.drawer*`, бекдропи; «kb-*» — клавіатурні правила; «таббар/«вгору»» — таббар, бульбашка (пружина), `.scroll-top-btn`; «infinite» і «> 900 мс» — блиск, скелетон, обертання синхронізації, `diagFlash`; «reduced-motion» і «!important» — перевизначення для «Зменшити рух».

## DS-N4b · відступи (Rev 2.32.344)
Токени `--sp-1` 4 · `--sp-2` 8 · `--sp-3` 12 · `--sp-4` 16 · `--sp-5` 20 · `--sp-6` 24 · `--sp-8` 32 · `--sp-10` 40 · `--sp-12` 48. Властивості: `padding*`, `margin*`, `gap`, `row-gap`, `column-gap` (лише верхній рівень значення; значення в `calc()`, `var()`, `env()` не чіпались).

Замінено **545** значень (з них зсунуто на сітку 268, точні збіги 277).

| Було, px | Стало | Кількість |
|---|---|---|
| 3·5 | `--sp` 4 px | 18 |
| 4 | `--sp` 4 (точний) px | 48 |
| 6 | `--sp` 8 px | 55 |
| 7·9 | `--sp` 8 px | 24 |
| 8 | `--sp` 8 (точний) px | 81 |
| 10 | `--sp` 12 px | 73 |
| 11·13 | `--sp` 12 px | 8 |
| 12 | `--sp` 12 (точний) px | 68 |
| 14 | `--sp` 16 px | 56 |
| 15·17 | `--sp` 16 px | 4 |
| 16 | `--sp` 16 (точний) px | 41 |
| 18 | `--sp` 20 px | 14 |
| 20 | `--sp` 20 (точний) px | 20 |
| 22 | `--sp` 24 px | 5 |
| 24 | `--sp` 24 (точний) px | 15 |
| 26·28 | `--sp` 24 px | 7 |
| 32 | `--sp` 32 (точний) px | 0 |
| 34·36 | `--sp` 32 px | 4 |
| 40 | `--sp` 40 (точний) px | 4 |

### Лишилось без змін (поза правилами)
`2px` ×38, `1px` ×6, `112px` ×3, `-4px` ×3, `-3px` ×2, `4.5px` ×2, `-8px` ×2, `-60px` ×2, `76px` ×1, `-2px` ×1, `-6px` ×1, `-16px` ×1, `-13.5px` ×1. Це 1–2 px (тонкі підгонки), від'ємні, дробові (4.5) і великі (76, 112).

### Не змінювались (137 оголошень): форми шторок — 124; таббар — 6; kb-* — 7
Найчастіші селектори: `#installment-drawer .drawer-handle` ×6, `#installment-drawer .och-actions` ×5, `#installment-drawer .och-form .cdd-delete-link` ×4, `#installment-drawer .installment-pay-btn` ×4, `html.kb-sheet #installment-drawer .och-actions` ×3, `#installment-drawer` ×3, `.och-cond-row` ×3, `nav.tabbar button` ×2, `.drawer-handle` ×2, `html.kb-sheet .drawer.open :is(.mono-detail-actions, .sf-actions)` ×2, `#notifications-drawer .n-row.n-row-wrap` ×2, `#notifications-drawer .n-row, #notifications-drawer .n-time-row` ×2, `.mono-detail-fields` ×2, `.mono-detail-actions` ×2. Повний перелік: `node scripts/ds2-apply.js --sp --dry` (другий рядок виводу).

### Висота екранів (pt, scrollHeight, 390 pt, `typical`)
| Екран | до | після | Δ |
|---|---|---|---|
| Аналітика | 3591 | 3657 | +66 |
| Витрати | 1213 | 1232 | +19 |
| Структура | 1496 | 1505 | +9 |
| Сервіс | 1328 | 1339 | +11 |
| Облік | 844 | 844 | +0 |

Нових переповнень 0; вкладені радіуси: нових порушень 0. Фікстура `large` у моку не подовжує «Облік» і «Структуру» (висоти збігаються з `typical`), тож довгі списки перевірені лише на наявних даних.

