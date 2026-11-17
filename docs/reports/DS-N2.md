# DS-N2: шкала кеглів (Rev 2.32.341)

Шкала як в iOS (`docs/specs/DS-PLAN.md` §1): `--fs-large` 34 · `--fs-title1` 28 · `--fs-title2` 22 · `--fs-title3` 20 · `--fs-body` 17 · `--fs-callout` 16 · `--fs-subhead` 15 · `--fs-footnote` 13 · `--fs-caption1` 12 · `--fs-caption2` 11.

## Замінено (≈300 `font-size` у `css/app.css`)
| Було, px | Стало | Кількість |
|---|---|---|
| 9 (2) · 9.5 (1) · 10 (10) · 10.5 (12) · 11 (34) | `--fs-caption2` | 59 |
| 11.5 (17) · 12 (28) | `--fs-caption1` | 45 |
| 12.5 (38) · 13 (43) · 13.5 (12) | `--fs-footnote` | 93 |
| 14 (27) · 14.5 (8) · 15 (29) | `--fs-subhead` | 64 |
| 16 | `--fs-callout` | 15 |
| 17 (12) · 18 (4) | `--fs-body` | 16 |
| 20 | `--fs-title3` | 2 |
| 21 (2) · 22 (1) | `--fs-title2` | 3 |
| 26 (1) · 28 (1) | `--fs-title1` | 2 |

`--fs-large` (34) поки що ніде не вживається. `line-height`, вага й гарнітура не змінювались.

## Винятки (19, лишились у px)
Поля вводу (`input`, `textarea`, `select` і їхні класи): iOS збільшує сторінку, якщо кегль поля менший за 16 px, тому значення полів не чіпались. Правил `html.kb-*` з `font-size` немає. `font-size` підписів SVG-графіків у CSS немає (задаються атрибутами/стилями в JS).
| Рядок `app.css` | Селектор | Значення |
|---|---|---|
| 204 | `.month-pill select` | 14px |
| 219 | `.month-picker select` | 14px |
| 283 | `.add-bank-row input` | 14px |
| 501 | `#installment-drawer .och-form .field input` | 14px |
| 517 | `.field input, .field select` | 16px |
| 794 | `#journal-date-input` | 16px |
| 817 | `.journal-search-input-wrap input` | 14px |
| 952 | `.record-edit-panel select` | 14px |
| 1254 | `:is(#struct-drawer, #mono-detail-drawer) .sf-select` | 16px |
| 1255 | `:is(#struct-drawer, #mono-detail-drawer) .sf-input` | 16px |
| 1422 | `.mono-token-input` | 16px |
| 1676 | `.chk-fld` | 14px |
| 1699 | `#push-series-form select` | 16px |
| 2039 | `.app-modal-input-wrap input` | 16px |
| 2044 | `.app-modal-select-wrap select` | 15px |
| 2050 | `.app-modal-amount-wrap input` | 16px |
| 2456 | `@media (max-width:479px) ⟶ .bank-debt-row input.bdr-amount` | 14px |
| 2659 | `@media (min-width:1280px) ⟶ #view-vytraty .field input, #view-vytraty .field select` | 13.5px |
| 2665 | `@media (min-width:1280px) ⟶ #view-vytraty #journal-date-input` | 13.5px |

## Переповнення (вимірювання до/після)
Для 11 станів (5 екранів і 6 шторок) у двох темах (26 вимірювань) зібрано елементи, де текст обрізається (`overflow` не `visible`, `scrollWidth > clientWidth`) або `line-clamp` ховає рядки: до — 26 елементів, після — 26, **нових 0**, зниклих 0. Інструмент: `e2e/ds-shots.spec.js` (`overflow-before/after.json` у `docs/ui/ds-n2/`).

## Знімки
`docs/ui/ds-n2/`: пари `<екран>-<тема>-before/after.png` і `summary.png`.
