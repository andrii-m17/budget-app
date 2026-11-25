# KB-RESUME-7 · клас ризику C (ТЗ від чату, збережено дослівно за суттю)

**Мета.** Варіант keep-lift вмикається щоразу, коли користувач іде із застосунку з відкритою клавіатурою в шторці. Після повернення шторка плавно піднімається до цілі keep-lift (а не стоїть уже піднятою й не їде вниз), клавіатура відкривається з першого дотику без стрибка, на текстових і цифрових полях. Вигляд піднятої шторки не змінюємо (KB-RESUME-4b окремо). Лише keep-lift; control і proxy-tap без змін.

## Факти (запис MT-1125-1348, Rev 2.32.437, keep-lift)
- 3 повернення (сума доходу numeric, термін ОЧ numeric, текстове поле ОЧ): `keptLift false`, спрацював `kb-bg-reset`. Перший дотик: focusin без клавіатури (`hasFocusStart false`). Другий дотик: клавіатура й зсув iOS 389 / 319 / 259 (закон центрування).
- Порядок: `kb-win-blur` → одразу `kb-vv-resize vvH 894` → через 1454 / 321 / 976 мс `visibilitychange hidden` → `kbResetOnBackground('hidden')` → `kbKeepEligible()` false (клавіатура вже «закрита»).
- Між blur і hidden шторка не рухалась. Анімація sheet-close, запущена на hidden, відтворюється після повернення (drawerTop 390 / 332 / 376).
- kbH на телефоні (портрет, innerH 894): numeric 389 (vvH 505), text 388–389. Полів `inputmode="decimal"` немає. Види: numeric | email | password | text. Від visible до першого дотику: 828 / 1135 / 886 мс.

## Рішення користувача
Після повернення шторка плавно піднімається звичайною анімацією підйому до цілі keep-lift (до дотику).

## Крок 0 (звіт, без коду): слухачі між blur і hidden; як ставиться `--sheet-lift` і анімація; сховище висот і джерело kbH для цілі; блокування дотиків без preventDefault.

## Що зробити (після погодження Кроку 0)
1. **Знімок на blur** (час, drawer, поле, тип клавіатури поля, kbH, підйом), коли `kbKeepEligible()`. На hidden вхід: eligible зараз АБО знімок ≤ 3000 мс, та сама шторка й відкрита, поле в DOM, орієнтація та сама. Скидання: window focus, focusout з іншої причини, закриття шторки, orientationchange.
2. **kbH цілі за типом поля:** store за типом знімка → store text → kbH знімка; записувати `kbKind`, `kbHSource` (store-kind | store-text | snapshot), `kbHUsed`.
3. **Плавний підйом.** На hidden: прибрати фокус, поставити шторку в спокій миттєво (без анімації); стан keep-lift зберегти. На visible: якщо стан є, шторка відкрита, орієнтація та сама, клавіатура закрита → через 1–2 кадри звичайна анімація підйому до цілі. Далі поведінка KB-RESUME-6. Якщо клавіатура на visible уже відкрита — звичайний шлях.
4. **Дотики під час підйому** блокувати без preventDefault на touchstart; не довше ніж до кінця анімації + 50 мс (страховка 500 мс); дотик рахувати.
5. **Самописець `kb-resume`** (лише числа/булеві/назви; без «text» у ключах): `eligibleBy` (now | blur-snap | none), `blurToHiddenMs`, `kbKind`, `kbHSource`, `kbHUsed`, `liftAnimMs`, `touchDuringLift`, `visibleToTouchMs`. Подія `kb-resume-lift`: `from`, `to`, `ms`, `frames`, `jumpMax`.
6. **Охоронець** для `kbNoteKbH`, `kbVvTopCloseFollow`, `KB_LIVE` у стані keep-lift і під час підйому (не змінюють kbH і положення).

## Не робимо
control/proxy-tap; keep-lift типовим; вигляд піднятої шторки; рух на touchstart/focusin; програмний фокус; `kbCacheKindForField` (decimal не додаємо); симулятор.

## Критерії приймання (телефон, запис MT)
X1: keptLift true ≥ 9 з 10 повернень (перемикач і свайп додому; numeric і text), `eligibleBy` записано. X2: `kb-resume-lift` 200–350 мс, frames ≥ 10, jumpMax ≤ 60, без sheet-close після visible. X3: перший дотик відкриває клавіатуру (`hasFocusEnd true`, `kbShownMs ≤ 400`), `panMax ≤ 5`, шторка нерухома. X4: перемикач без виходу, дотик поза полем, тягнення, закриття, поворот — як у 2.32.437. X5: control без змін.

## Обов'язкові тести
Чиста функція входу (kbOpenNow, snapAgeMs, sameDrawer, drawerOpen, fieldConnected, sameOrientation, lift) → eligibleBy; межі 0 / 2999 / 3000 / 3001 мс. Вибір kbH (store-kind / store-text / snapshot). План підйому (0 → ціль; без анімації при відкритій клавіатурі; скасування на orientationchange). Блокування дотиків знімається ≤ 500 мс. Приватність ключів самописця. Повний набір зелений. Перевірка на телефоні: 4 виходи через перемикач + 4 свайпом на «Термін»; 2 — текстове поле ОЧ; 2 — сума доходу.
