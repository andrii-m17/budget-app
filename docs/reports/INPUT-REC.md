# INPUT-REC — Rev 2.32.129 (BUG-INPUT, розширення рекордера; клас B; не запушено)

## Що
Лише запис діагностики (`debugRecordingActive`); поза записом нічого не пишеться й не міняється. Без тексту назв: довжини й 6-символьні хеші.
- `suggest-render`: `ctx` (`new`/`edit`), `count`, `lens[]`, `activeIdx`.
- `suggest-pick`: `ctx`, `pickIdx`, `pickLen`, `pickHash`, `textLenBefore`, `textLenAfter`.
- `add-button`: `phase` = `pointerdown` / `pointerup` / `click` (час, `rect` кнопки на момент події, `pointerType`, `gotClick` у click); `no-click` — pointerup без click за 400 мс (з `rect` на той момент, видно зсув кнопки); `result` — `added` / `rejected` (`gate`, `name-empty`, `amount-invalid`) / `deferred` (`edit-guard`: відкрите редагування).
- `touchstart`/`touchend`: `targetId`, `targetTag`, `targetClasses`, `targetRect` (раніше для touchstart без прямокутника, для touchend без цілі).
- Окрім того, allowlist відкидав `event`/`count` подій `suggest-edit` (їх не було в логах): додано.
- Тести: `tests/recorder-suggest.test.js` (+7), оновлено списки імен у `pilot-repository`/`action-gate`.

## Як записати
«Тестування» → «Запис діагностики» → сценарій: (a) «Витрати», набрати «Вел», тапнути коротку підказку, потім довшу; (b) тап «Додати витрату» кілька разів з відкритою клавіатурою; (c) тап по лівій частині підказки; (d) редагування запису, зміна дати. «Мітка» → зупинити → надіслати.

## Для iPhone
- Запис діагностики: після тапів по підказці та «Додати витрату» у логу є події `suggest-render`, `suggest-pick`, `add-button` без тексту назв
- Звичайна робота без запису: підказки й «Додати витрату» працюють як раніше
