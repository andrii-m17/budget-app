# DS-4d2 · група «struct»: 11 оголошень

| рядок app.css | селектор | властивість | було | стало |
|---|---|---|---|---|
| 1263 | `:is(#struct-drawer, #mono-detail-drawer) .sf-title` | margin | `2px 0 12px` | `2px 0 var(--sp-3)` |
| 1264 | `:is(#struct-drawer, #mono-detail-drawer) .sf-notice` | padding | `10px 12px` | `var(--sp-3) var(--sp-3)` |
| 1265 | `:is(#struct-drawer, #mono-detail-drawer) .sf-group` | margin-bottom | `10px` | `var(--sp-3)` |
| 1266 | `:is(#struct-drawer, #mono-detail-drawer) .sf-row` | padding | `0 14px` | `0 var(--sp-4)` |
| 1266 | `:is(#struct-drawer, #mono-detail-drawer) .sf-row` | gap | `10px` | `var(--sp-3)` |
| 1285 | `:is(#struct-drawer, #mono-detail-drawer) .sf-seg` | padding | `6px 8px` | `var(--sp-2) var(--sp-2)` |
| 1287 | `:is(#struct-drawer, #mono-detail-drawer) .sf-seg .struct-tab-btn` | padding | `7px 4px` | `var(--sp-2) var(--sp-1)` |
| 1289 | `:is(#struct-drawer, #mono-detail-drawer) .sf-actions` | margin-top | `6px` | `var(--sp-2)` |
| 1289 | `:is(#struct-drawer, #mono-detail-drawer) .sf-actions` | gap | `10px` | `var(--sp-3)` |
| 1293 | `:is(#struct-drawer, #mono-detail-drawer) .sf-delete-wrap .cdd-delete-link` | margin-top | `10px` | `var(--sp-3)` |
| 1547 | `.mono-detail-actions` | gap | `10px` | `var(--sp-3)` |

> Rev 2.32.384: рядки 1265 (`.sf-group` margin-bottom) і 1289 (`.sf-actions` margin-top) повернено до 10px і 6px: зв'язані з компенсацією kb-sheet (тест 50). Фактично змінено 9 з 11.
