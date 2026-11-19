# ANALYTICS-V1 — збережена точка «Аналітики» v1 для десктопа

Рішення власника 19.11: на десктопі в майбутньому показувати «Аналітику» v1 (до DS-5) як хаб з максимальною деталізацією; на телефоні лишається v2 (DS-5). Цей документ фіксує, що було у v1, що забрав DS-5, від чого v1 залежить і як його повернути. Застосунок цією ревізією не змінюється (клас A).

## 1. Збережена точка
- Анотований тег **`analytics-v1`** на коміті `9ef50b9` (Rev 2.32.384, останній стан v1). Тег у `origin`.
- Подивитись: `git show analytics-v1:index.html`, `git show analytics-v1:js/analytics.js`, `git show analytics-v1:css/app.css`.
- Знімки v1 (мок `?fixture=typical`, без справжніх даних): `docs/ui/analytics-v1/analytics-v1-{1280,390}-{light,dark}.png` (уся вкладка згори донизу).

## 2. Що було у v1 (порядок згори донизу)
| № | Блок | Розмітка / функції v1 |
|---|---|---|
| 1 | «Найближчі платежі» (7 днів) | `#payments-card`, `renderPaymentsCard` (лишилась у v2) |
| 2 | Ряд KPI: «Доходи», «Витрати», «Баланс», «Борг» + кільце «Скорочення боргу» | `.kpi-card.v2` (`#kpi-income/-expense/-savings/-debt`, `#trend-*`, `#spark-*`), `#debt-donut`, `#m-paid`, `#m-remaining`; `setKpiTrend`, `svgSparkline`, `renderDebtDonut`, `setDonutSvg` |
| 3 | Смуга показників `.kpi-strip` | «Витрати / доходи», «Обов'язкові платежі», «Після обов'язкових», «Динаміка боргу», «Платежі по ОЧ», «Звичка місяця» (`#kpi-ratio-*`, `#kpi-mandatory*`, `#kpi-free*`, `#kpi-debtchange*`, `#kpi-och*`, `#kpi-habit*`) |
| 4 | Графіки | «Доходи vs Витрати» (`#chart-income-expense`, `svgBarChart`), «Динаміка боргу» (`#chart-debt-line`, `svgLineChart`); `setDashChart`, `clearDashChart`, `shouldReplaceChart`, `roundedTopBarPath`, `chartDuration`, `staggerDelay`, `pathLengthSupported` |
| 5 | Таблиці (розгортання «Всі …») | «Витрати за категоріями» (`#card-categories`), «Деталізація витрат» (`#card-subcategories`), «Потенціал економії» (`#card-reducible`); `applyCardExpandState`, `toggleCardExpand`, `cardVariants`, `expandedRow4Key`, `updateRow3GridColumns` |
| 6 | «Борги по картках», «Оплати частинами» | `renderDebtsCard`, `renderInstallmentsCard`, `installmentsCardData`, `applyInstallmentsCardState`, `toggleDebtsCardExpand`, `toggleInstallmentsCardExpand`, `fmtOchDelta`, `secondaryExpandedKey` |
| 7 | «Висновки місяця» | `#summary-container` (5 висновків у v1) |

Центральна функція — `renderDashboard()` (у v1: `js/analytics.js:960`). Загальні лічильники й малювання: `DASH_CHART_HOSTS`, `DASH_COUNTER_IDS`, `DASH_STAGGER_MS`, `dashSnapshotFromDom`, `dashChanged`, `addHost`, `acctSelector`.

## 3. Що забрав DS-5a–5e (коміти)
| Етап | Коміт | Що прибрано / замінено |
|---|---|---|
| DS-5a (Rev 2.32.385) | `32af92a` | KPI доходів/витрат/балансу замінені карткою «Сімейний баланс» |
| DS-5b (386–387) | `4acd043`, `0dcf9f5` | KPI боргу й ОЧ, кільце «Скорочення боргу», картки «Борги по картках» і «Оплати частинами» → плитки «Борг»/«ОЧ» і шторки; `renderDebtDonut`, `setDonutSvg`, `renderDebtsCard`, `renderInstallmentsCard`, `installmentsCardData`, `applyInstallmentsCardState`, `toggleDebtsCardExpand`, `toggleInstallmentsCardExpand`, `fmtOchDelta`, `secondaryExpandedKey` |
| DS-5c-1 (388–389) | `0070a89`, `f8d8eac` | таблиці «Витрати за категоріями» і «Деталізація витрат» → картка «Деталізація витрат» з кільцями (F9) |
| DS-5c-2 (390–391) | `932e128`, `854aeea` | таблиця «Потенціал економії» і розгортання рядів → картка «Потенціал економії» (F7/F8); `applyCardExpandState`, `toggleCardExpand`, `cardVariants`, `expandedRow4Key`, `updateRow3GridColumns` |
| DS-5d (392–394) | `ca246df`, `05744ce` | «Доходи vs Витрати» + «Динаміка боргу» → «Динаміка за 6 місяців» (F10); «Висновки» у новому вигляді; десяткова кома |
| DS-5e (395) | `514deed` | мертвий код: `setKpiTrend`, `svgSparkline`, `svgBarChart`, `svgLineChart`, `roundedTopBarPath`, `setDashChart`, `clearDashChart`, `shouldReplaceChart`, `dashSnapshotFromDom`, `dashChanged`, `staggerDelay`, `chartDuration`, `pathLengthSupported`, `DASH_CHART_HOSTS`, `DASH_COUNTER_IDS`, `DASH_STAGGER_MS`, `addHost`, `acctSelector`; ≈ 140 правил CSS; KPI «Звичка місяця» і смуга `.kpi-strip` (≈ 650 рядків видалено) |
Підсумок між `9ef50b9` і `514deed`: `js/analytics.js` переписано (1744 рядки змін), `css/app.css` ≈ 450 рядків, `index.html` ≈ 330, `css/tokens.css` +3. Повний перелік зниклих функцій і констант: `git log -S<ім'я> 9ef50b9..514deed`.

## 4. Від чого v1 залежить і що змінилось після DS-5
| Залежність | Було у v1 | Зараз |
|---|---|---|
| Місячні підсумки (`monthAggregates`, `debtTotalsForMonth`) | `totalMonthlyInstallment` — сума по записах боргу | FIX-1118 (2.32.396): `totalMonthlyInstallment = installmentMonthPayTotal(month)`, єдиний розрахунок з «Обліком»; платіж запису береться лише з місяця самого запису. KPI «Платежі по ОЧ» у v1 дасть вже виправлене число |
| Деталізація витрат / відсотки (F9) | таблиця «Деталізація витрат» рахувала підкатегорії від суми підкатегорій | `catBreakdown` повертає `subTotal`; відсотки від усіх витрат (FIX-SUB, 2.32.398); рядка «Без підкатегорії» немає |
| «Найближчі платежі» | сіра смуга днів, «Наступний» | блакитні дні, «Прострочено» (FIX-PAY, DS-PAY 2.32.396/399); токени `--inst-text/-bg/-line` |
| Токени дизайн-системи | `--color-*`, старі назви | `css/tokens.css`: `--income-text`, `--debt-text`, `--inst-*`, `--on-ring`; ds-guard обмежує сирі `rgba/hex/px` — v1-CSS без перенесення на токени тест не пройде |
| Формат відсотків | `31.8%` | `31,8 %` з нерозривним пробілом (2.32.394) |
| Охоронні тести | порогові значення під v1 | зменшені в DS-5e (`ds-guard`, `desk-nav`, `dashboard-motion`, `pct-format`, `cat-donut`, `savings-potential`, `och-form`, `debt-och-tiles`); тести лише v1-функцій видалено |
| Одометр, `setDashFinal`, `odoRender` | спільні | лишились (Облік) |

## 5. План відновлення для десктопа (окремий етап DS-DESK)
1. **Файл `js/analytics-desktop.js`** — не повертати v1 у `js/analytics.js`. Перенести з тега лише потрібні функції (список у п. 3), під префіксом `adesk` (`adeskRenderDashboard`, `adeskSvgBarChart` …), щоб не конфліктувати з v2 у глобальній області. Дані брати зі спільних функцій (`monthAggregates`, `debtTotalsForMonth`, `catBreakdown`, `installmentMonthPayTotal`), не копіювати формули.
2. **Розмітка:** окремий контейнер `#analytics-desktop` поруч із v2; показ за шириною ≥ 1280 pt (CSS-медіазапит і `matchMedia` у JS; рендер лише коли контейнер видимий — без подвійної роботи на телефоні).
3. **Стилі:** v1-CSS (`.kpi-card.v2`, `.kpi-strip`, `.table-card`, `.gm-chart-card` тощо) повернути в окремий `css/analytics-desktop.css`, переписавши на токени (ds-guard); не змішувати з v2.
4. **Графіки:** `svgBarChart`/`svgLineChart`/`svgSparkline` разом із `roundedTopBarPath`; перевірити `prefers-reduced-motion`.
5. **Тести:** повернути лише тести повернутих функцій (з `git show analytics-v1:tests/…`), оновити під FIX-1118/F9; E2E на 1280 (мок), знімки порівняти зі знімками з `docs/ui/analytics-v1/`.
6. **Порядок:** DS-DESK-0 (Крок 0: що з v1 справді потрібне хабу, клас C для залежностей від формул) → DS-DESK-1 (дані й функції) → DS-DESK-2 (розмітка й стилі) → DS-DESK-3 (тести, знімки). Кожен — окрема ревізія.

## 6. Ризики
- **Подвійний рендер і розбіжність чисел** між v1 і v2: обидва мають брати числа з одних функцій; тест, що порівнює ключові суми (як `e2e/ds5c1b.spec.js` для v2).
- **Імена в глобальній області:** v1-функції зі старими іменами колізують із v2 (`renderDashboard`, `setDashChart`): лише префікс `adesk`.
- **Токени й ds-guard:** сирі значення v1 завалять охоронні тести; перенесення на токени — частина етапу, не «потім».
- **Вага й швидкодія:** v1 малює SVG-графіки й розгортання на кожному `renderDashboard`; на телефоні контейнер не рендерити.
- **Застарілі формули:** v1 містив KPI «Звичка місяця» і таблицю «Потенціал» з логікою до F7/F8; повертати лише те, що підтвердить власник у Кроці 0.
- **Тег незмінний:** якщо v1 колись знадобиться відкотити повністю — `git checkout analytics-v1 -- <файли>` дасть стару версію, але вона не знає про FIX-1118 і нові токени.
