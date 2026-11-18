// Каркас UI: місяці, бейдж, оновлення PWA, вкладки, рух, натискання, таббар і свайп, тема, сегменти
// Перенесено з index.html дослівно, без змін (Rev 2.32.349, STRUCT-3). Звичайний скрипт: функції й const/let лишаються глобальними; підключається в index.html перед основним <script>; оператори верхнього рівня цієї області лишились в основному скрипті.

// Rev 2.32.356 (DS-3e): перелік місяців перемикача — від першого місяця з даними до поточного; без даних — поточний. Rev 2.32.358 (DS-3e2, рішення власника): над поточним додається НАСТУПНИЙ місяць (підпис «наступний»), далі майбутніх немає; порожні місяці до першого місяця з даними не додаються. Дані: ті самі активні витрати, доходи й борги, що в allMonths(), але БЕЗ ковзного вікна −12…+1 (allMonths() не змінено: ним користуються маршрути й ролловер). Чиста функція: dataMonths — масиви ключів 'YYYY-MM'.
function monthPickerList(dataMonths, todayKey){
  const nextKey = shiftMonth(todayKey, 1);
  const ok = (dataMonths || []).filter(function(m){ return typeof m === 'string' && /^\d{4}-\d{2}$/.test(m) && m <= todayKey; });
  const first = ok.length ? ok.reduce(function(a, b){ return b < a ? b : a; }) : todayKey;
  const out = []; let m = first, guard = 0;
  while(m <= nextKey && guard++ < 1200){ out.push(m); m = shiftMonth(m, 1); }
  if(out[out.length - 1] !== nextKey) out.push(nextKey);
  return out;
}
// Сусідній місяць списку для стрілок: delta -1/+1; null — межа (перший місяць з даними / поточний). Якщо вибраного місяця немає в списку (програмний перехід), шукаємо найближчий у потрібний бік.
function monthStepTarget(list, selected, delta){
  if(!list || !list.length) return null;
  if(delta < 0){ for(let i = list.length - 1; i >= 0; i--){ if(list[i] < selected) return list[i]; } return null; }
  for(let i = 0; i < list.length; i++){ if(list[i] > selected) return list[i]; }
  return null;
}
function monthShortName(key, todayKey){
  const parts = key.split('-'); const nm = UA_MONTHS[parseInt(parts[1], 10) - 1] || '';
  return nm.charAt(0).toUpperCase() + nm.slice(1) + (parts[0] !== todayKey.split('-')[0] ? ' ' + parts[0] : '');
}
// Розмітка списку (дані екрануються): місяці від поточного назад, заголовки років, «поточний», галочка на вибраному.
function monthMenuHTML(list, selected, todayKey){
  let h = '', y = null;
  for(let i = list.length - 1; i >= 0; i--){
    const m = list[i], parts = m.split('-'), nm = UA_MONTHS[parseInt(parts[1], 10) - 1] || '';
    if(parts[0] !== y){ y = parts[0]; h += '<div class="yh" role="presentation">' + escapeHtml(y) + '</div>'; }
    const on = m === selected;
    h += '<button type="button" role="menuitemradio" aria-checked="' + (on ? 'true' : 'false') + '" data-m="' + escapeAttr(m) + '"' + (on ? ' class="on"' : '') + '><span>' + escapeHtml(nm.charAt(0).toUpperCase() + nm.slice(1)) + (m === todayKey ? ' <small>поточний</small>' : (m === shiftMonth(todayKey, 1) ? ' <small>наступний</small>' : '')) + '</span>' + (on ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>' : '') + '</button>';
  }
  return h;
}
function dataMonthKeys(){
  return Array.from(new Set([...activeExpenses().map(e=>monthKey(e.date)), ...activeIncomes().map(e=>monthKey(e.date)), ...activeDebts().map(d=>d.month)].filter(Boolean)));
}
function currentMonthList(){ return monthPickerList(dataMonthKeys(), monthKey(localDateISO())); }
let monthPaintedKey = null;
function paintMonthSwitcher(){
  const nameEl = document.getElementById('month-name'); if(!nameEl || !selectedMonth) return;
  const todayKey = monthKey(localDateISO()), list = currentMonthList();
  const prev = document.getElementById('month-prev'), next = document.getElementById('month-next');
  const label = monthShortName(selectedMonth, todayKey);
  if(monthPaintedKey !== selectedMonth){
    const dir = (monthPaintedKey && selectedMonth < monthPaintedKey) ? '-6px' : '6px';
    nameEl.innerHTML = '<span style="--dy:' + dir + '">' + escapeHtml(label) + '</span>';
    monthPaintedKey = selectedMonth;
  }
  if(prev) prev.disabled = monthStepTarget(list, selectedMonth, -1) === null;
  if(next) next.disabled = monthStepTarget(list, selectedMonth, 1) === null;
  const now = document.getElementById('month-now'), pill = document.getElementById('month-pill');
  // Rev 2.32.359 (DS-3e3): рядок і для наступного місяця (внесення наперед): той самий вигляд і дія «До поточного місяця», текст за напрямком
  if(now){
    const away = selectedMonth !== todayKey && !!pill && !pill.classList.contains('hidden');
    now.classList.toggle('on', away);
    const tx = document.getElementById('month-now-text'); if(tx) tx.textContent = selectedMonth > todayKey ? 'Ви дивитесь наступний місяць' : 'Ви дивитесь минулий місяць';
  }
}
function stepMonth(delta){
  const t = monthStepTarget(currentMonthList(), selectedMonth, delta);
  if(t) onMonthChange(t);
}
function goCurrentMonth(){ onMonthChange(monthKey(localDateISO())); }
function closeMonthMenu(){
  const m = document.getElementById('month-menu'); if(!m || !m.classList.contains('on')) return;
  m.classList.remove('on'); const n = document.getElementById('month-name'); if(n) n.setAttribute('aria-expanded', 'false');
}
function toggleMonthMenu(open){
  const m = document.getElementById('month-menu'), n = document.getElementById('month-name'); if(!m || !n) return;
  const o = typeof open === 'boolean' ? open : !m.classList.contains('on');
  if(!o){ closeMonthMenu(); return; }
  m.innerHTML = monthMenuHTML(currentMonthList(), selectedMonth, monthKey(localDateISO()));
  m.classList.add('on'); n.setAttribute('aria-expanded', 'true');
  const sel = m.querySelector('button.on'); if(sel && sel.scrollIntoView) sel.scrollIntoView({ block: 'nearest' });
}
function initMonthSwitcher(){
  const m = document.getElementById('month-menu'); if(!m) return;
  m.addEventListener('click', function(ev){
    const b = ev.target.closest ? ev.target.closest('button[data-m]') : null; if(!b) return;
    ev.stopPropagation(); closeMonthMenu(); onMonthChange(b.getAttribute('data-m'));
  });
  m.addEventListener('keydown', function(ev){
    const items = Array.from(m.querySelectorAll('button[data-m]')); const i = items.indexOf(document.activeElement);
    if(ev.key === 'ArrowDown'){ ev.preventDefault(); (items[i + 1] || items[0]).focus(); }
    else if(ev.key === 'ArrowUp'){ ev.preventDefault(); (items[i - 1] || items[items.length - 1]).focus(); }
  });
  document.addEventListener('pointerdown', function(ev){ if(!(ev.target.closest && ev.target.closest('#month-pill'))) closeMonthMenu(); }, true);
  document.addEventListener('keydown', function(ev){ if(ev.key === 'Escape' && document.getElementById('month-menu').classList.contains('on')){ closeMonthMenu(); const n = document.getElementById('month-name'); if(n) n.focus(); } });
  const mc = document.getElementById('main-col'); if(mc) mc.addEventListener('scroll', closeMonthMenu, { passive: true });
}
function populateMonths(){
  const months = allMonths();
  const todayKey = monthKey(localDateISO());
  if(!selectedMonth || !months.includes(selectedMonth)) selectedMonth = months.includes(todayKey) ? todayKey : months[months.length-1];
  paintMonthSwitcher(); // Rev 2.32.356 (DS-3e): замість заповнення <select>
}
// Rev 2.16.6 — захист від "незбережених змін" прибрано: і картки (Rev
// 2.16.5), і ОЧ тепер редагуються виключно в ізольованій шторці з власним
// явним "Зберегти" — списки самі по собі більше не мають інлайн-полів, які
// можна лишити недоторканими між рендерами, тому втрачати при зміні місяця
// вже нічого.
function onMonthChange(val){
  if(val === selectedMonth) return;
  rolloverState.monthManual = true; // Rev 2.32.26 (M): місяць обрано вручну — опівночі не чіпаємо
  performMonthChange(val);
}
function performMonthChange(val){
  selectedMonth = val;
  updatePageHeader(lastActiveTab); // Rev 2.32.356 (DS-3e): updatePageHeader малює перемикач місяця (paintMonthSwitcher)
  renderAll();
}

// Rev 2.1.25 — розділювачі тисяч у полях ВВОДУ сум (не плутати з fmt()/
// fmtSigned() вище — ті лише для показу готового тексту з "₴", а це для
// значень <input>, куди символ валюти не підходить). Патерн "формат на blur,
// сирі цифри на focus" — найнадійніший спосіб уникнути стрибків курсора під
// час набору (live-форматування на кожен keystroke складне й крихке: коли
// пробіли з'являються/зникають серед цифр, курсор постійно "втікає").
// Гроші в застосунку завжди цілі (fmt() теж без копійок), тому дробову
// частину тут спеціально не підтримуємо.
// Rev 2.10.3 (P1, аудит) — раніше parseAmount() пропускала дробову частину
// (100.5 парсилось як 100.5, лише fmt()/formatThousands() округлювали ПРИ
// ПОКАЗІ) — фінансові суми тихо втрачали копійки лише візуально, а фактично
// збережене число в localStorage/debts/expenses могло лишатись дробовим.
// Тепер округлення відбувається одразу в точці парсингу — єдиному місці,
// звідки будь-яке введене число потрапляє далі в модель. Разом із фільтром
// desyatkovyh символів на вводі (sanitizeAmountInput нижче) і
// inputmode="numeric" (без крапки на iOS-клавіатурі) це усуває копійки
// повністю, а не лише в останній момент показу.
// Rev 2.32.23 (N, A2-13/A2-11) — ЄДИНИЙ нормалізатор сум. Аудит показав: фільтр вводу прибирав усі нецифрові символи (вставлене «99.99» ставало 9999, «1 250,50» -> 125050, «-5» -> 5), число на кшталт 2,5·10²¹ проходило, а Cloud (expenses.amount integer, CHECK >= 0) його не приймав; в Excel текстова сума «1 250,50» читалась як 1. Правила: прибираємо пробіли/NBSP/вузькі пробіли, «₴», «грн»; науковa нотація заборонена; десятковий роздільник — єдиний «,»/«.»; якщо роздільників кілька: однакові (1,250,000) — це роздільники тисяч, різні (1.250,50 / 1,250.50) — останній десятковий; округлення до цілих гривень half up; межі 1…2 147 483 647 (цілий тип бази). opts.allowZero — для полів, де 0 законний (борг, ліміт, мін. платіж: «Якщо боргу немає, внесіть 0»). Повертає { ok, value, reason, error }; reason: non-numeric | negative | zero | too-small | too-big. Альтернатива «лише чистити на льоту» відкинута: саме вона й давала ×100.
const AMOUNT_MAX = 2147483647;
const AMOUNT_ERRORS = {
  'non-numeric': 'Введіть число',
  'negative': 'Лише додатне число',
  'zero': 'Мінімум 1 ₴',
  'too-small': 'Мінімум 1 ₴',
  'too-big': 'Не більше 2 147 483 647 ₴',
};
function normalizeAmount(input, opts){
  const o = opts || {};
  const fail = function(reason){ return { ok: false, value: NaN, reason: reason, error: AMOUNT_ERRORS[reason] }; };
  const done = function(v){
    if(v > AMOUNT_MAX) return fail('too-big');
    return { ok: true, value: v, reason: null, error: null };
  };
  if(input == null) return fail('non-numeric');
  if(typeof input === 'number'){
    if(!isFinite(input)) return fail('non-numeric');
    if(input < 0) return fail('negative');
    const r = Math.floor(input + 0.5);
    if(r < 1){ if(o.allowZero) return done(0); return fail(input === 0 ? 'zero' : 'too-small'); }
    return done(r);
  }
  let t = String(input).replace(/[\s\u00A0\u202F\u2009]/g, '').replace(/₴/g, '').replace(/грн\.?/gi, '');
  if(t === '') return fail('non-numeric');
  let negative = false;
  if(t[0] === '-' || t[0] === '\u2212'){ negative = true; t = t.slice(1); }
  else if(t[0] === '+'){ t = t.slice(1); }
  if(!/^[\d.,]+$/.test(t) || !/\d/.test(t)) return fail('non-numeric');
  const seps = t.match(/[.,]/g) || [];
  let intPart, frac = '';
  if(seps.length === 0){ intPart = t; }
  else if(seps.length === 1){ const i = t.search(/[.,]/); intPart = t.slice(0, i); frac = t.slice(i + 1); }
  else if(seps.every(function(c){ return c === seps[0]; })){ if(!/^\d{1,3}([.,]\d{3})+$/.test(t)) return fail('non-numeric'); intPart = t.replace(/[.,]/g, ''); }
  else{ const i = Math.max(t.lastIndexOf('.'), t.lastIndexOf(',')); intPart = t.slice(0, i).replace(/[.,]/g, ''); frac = t.slice(i + 1); }
  if(/[.,]/.test(frac)) return fail('non-numeric');
  intPart = intPart.replace(/^0+(?=\d)/, '');
  if(intPart === '') intPart = '0';
  if(negative) return fail('negative');
  if(intPart.length > 10) return fail('too-big');
  let v = parseInt(intPart, 10);
  if(frac && frac[0] >= '5') v += 1;
  if(v < 1){
    if(o.allowZero) return done(0);
    return fail(/[1-9]/.test(frac) ? 'too-small' : 'zero');
  }
  return done(v);
}
// Мінорні одиниці банку (копійки) -> цілі гривні half up; < 1 ₴ -> null (операція лишається для ручного рішення).
function fromMinorUnits(kopecks){
  if(typeof kopecks !== 'number' || !isFinite(kopecks) || kopecks < 0) return null;
  const uah = Math.floor(kopecks / 100 + 0.5);
  if(uah < 1 || uah > AMOUNT_MAX) return null;
  return uah;
}
function noteAmountRejected(reason){
  if(typeof debugRecordingActive !== 'undefined' && debugRecordingActive) pushDebugEvent({ t: Math.round(performance.now() - debugRecordingStartedAt), type: 'amount-rejected', reason: reason });
}
// Сумісна обгортка: повертає ціле число або NaN. Нуль допускається (виклики самі вимагають > 0, де треба), причина відмови іде в рекордер.
function parseAmount(str){
  if(str == null || (typeof str === 'string' && str.trim() === '')) return NaN;
  const r = normalizeAmount(str, { allowZero: true });
  if(!r.ok){ noteAmountRejected(r.reason); return NaN; }
  return r.value;
}
// Рішення для поля суми, де потрібне додатне число: показує причину тостом (форми «Витрати»/редагування).
function readPositiveAmount(el){
  const raw = el ? el.value : '';
  if(String(raw).trim() === '') return NaN;
  const r = normalizeAmount(raw);
  if(!r.ok){ noteAmountRejected(r.reason); if(typeof showTextToast === 'function') showTextToast(r.error, 'error'); return NaN; }
  return r.value;
}
function formatAmountBlur(el){
  const raw = el.value;
  if(String(raw).trim() === ''){ el.value = ''; return; }
  const n = parseAmount(raw);
  if(isNaN(n)){
    const r = normalizeAmount(raw, { allowZero: true });
    if(typeof showTextToast === 'function') showTextToast(r.error || 'Введіть число', 'error');
    if(el.id && document.getElementById(el.id)) flashField(el.id);
    return; // значення лишається як є, щоб його можна було виправити
  }
  el.value = formatThousands(n);
}
function unformatAmountFocus(el){
  if(String(el.value).trim() === ''){ el.value = ''; return; }
  const n = parseAmount(el.value);
  if(!isNaN(n)) el.value = String(Math.round(n));
}
// Rev 2.10.3 (P1, аудит) — "Копійки відкидаємо... лише цілі числа": на
// відміну від попередньої поведінки (десяткову крапку можна було ввести, і
// вона просто зникала при збереженні), тепер сам ВВІД крапки/коми
// заборонений одразу. inputmode="numeric" на iOS/Android ховає десяткову
// крапку в цифровій клавіатурі, але зовнішня Bluetooth-клавіатура чи вставка
// з буфера обміну можуть однаково принести "100.50" — цей фільтр прибирає
// будь-який символ, що не цифра чи пробіл (пробіл — розділювач тисяч, який
// саме поле може містити після formatAmountBlur), одразу під час вводу.
// Слухач на document з capture:true спрацьовує РАНІШЕ за власний inline
// oninput="..." кожного поля (той виконується на фазі "at target", вже
// ПІСЛЯ завершення capture-фази) — тому значення встигає очиститись до того,
// як власна логіка поля (checkInstallmentDivergence, saveExpenseDraft тощо)
// прочитає el.value.
function isAmountField(el){
  return !!el && el.tagName === 'INPUT' && (el.type === 'text' || el.type === 'search') && el.getAttribute('inputmode') === 'numeric'; // Rev 2.32.47 (AG): search-type варіант тесту autofill-guard
}

// Rev 2.32.206 (KB-SYNC-RENDER): перемальовування, спричинене синхронізацією (pull чужих змін, злиття конфлікту), не має зсувати екран, поки відкрита клавіатура з полем у фокусі: його відкладено до закриття поля (focusout), одним викликом; поза клавіатурою — як раніше, зі збереженням прокручування документа.
let renderAfterSyncPending = null;

function renderAfterSync(withMonths){
  if(keyboardFieldActive()){ renderAfterSyncPending = renderAfterSyncPending || { months: false }; if(withMonths) renderAfterSyncPending.months = true; return; }
  const se = (typeof document !== 'undefined' && document.scrollingElement) || null, top = se ? se.scrollTop : 0;
  if(withMonths) populateMonths();
  renderAll();
  if(se && se.scrollTop !== top) se.scrollTop = top;
}
function flushRenderAfterSync(){
  if(!renderAfterSyncPending || keyboardFieldActive()) return;
  const p = renderAfterSyncPending; renderAfterSyncPending = null;
  renderAfterSync(p.months);
}

function renderAll(){
  safeCall(rebuildNameHistory, 'rebuildNameHistory');
  safeCall(renderRecords, 'renderRecords');
  safeCall(renderDashboard, 'renderDashboard');
  safeCall(renderPaymentsCard, 'renderPaymentsCard');
  if(isPaymentsOpen) safeCall(renderPaymentsScreen, 'renderPaymentsScreen'); // Rev 2.32.68 (P4) // Rev 2.32.67 (P3): після синхронізації, зміни даних, опівночі (checkDayRollover → renderAll)
  safeCall(populateIncomeTable, 'populateIncomeTable');
  safeCall(populateBankDebtTable, 'populateBankDebtTable');
  safeCall(populateInstallmentTable, 'populateInstallmentTable');
  safeCall(updateIncompleteBadges, 'updateIncompleteBadges'); // Rev 2.31.3 (B)
  safeCall(acctAfterRender, 'acctAfterRender'); // Rev 2.29.0 (A): поява «Обліку» (лише перший показ/зміна місяця; фонові рендери статичні)
  safeCall(updateTodayExpenseBadge, 'updateTodayExpenseBadge');
  safeCall(updateTrashBadge, 'updateTrashBadge'); // Rev 2.23.23 (6D.192): бейдж "Видалені дані" в Сервісі
  if(isTrashOpen) safeCall(renderTrashScreen, 'renderTrashScreen');
}

/* ============ Бейдж "витрат сьогодні" на кнопці "Витрати" (Rev 2.3.6) ============
   Мета: видно з будь-якої вкладки, чи вже щось внесено сьогодні, без переходу
   на "Витрати" — знижує шанс "забути й згадати ввечері". Рахує лише expenses
   (не доходи) — саме витрати є тим типом запису, який найлегше відкласти. */
function updateTodayExpenseBadge(){
  const today = localDateISO();
  // Rev #30 (6D.42) — activeExpenses(): видалена сьогоднішня витрата не мала б рахуватись у бейджі.
  const count = activeExpenses().filter(function(e){ return e.date === today; }).length;
  const text = count > 9 ? '9+' : String(count);
  const topBadge = document.getElementById('tb-count-badge');
  const sideBadge = document.getElementById('side-count-badge');
  [topBadge, sideBadge].forEach(function(el){
    if(!el) return;
    el.textContent = text;
    el.classList.toggle('hidden', count === 0);
  });
}

/* ============ Індикатор доступного оновлення PWA (Rev 2.3.6) ============
   Service worker (Rev 2.3.3) сам виявляє нову версію sw.js на сервері під
   час навігації — подія "updatefound" на реєстрації. showUpdateAvailable()
   вмикає кнопку в шапці/сайдбарі; клік показує пояснення через кастомну
   модалку (той самий #app-modal, що й для решти підтверджень). Дані НЕ
   зачіпаються оновленням — вони в localStorage, окремо від самого файлу
   застосунку.
   Rev 2.11.0 (P1, PWA-аудит) — раніше клік "Оновити зараз" просто робив
   window.location.reload(): це виглядало як контрольоване оновлення, але
   sw.js насправді вже активував нову версію МИТТЄВО й автоматично (через
   self.skipWaiting() одразу на install) задовго до цього кліку — банер
   часто був суто декоративним, реальна заміна вже відбулась без відома
   користувача. Тепер SW (Rev 2.11.0) чекає в стані "waiting", доки сторінка
   сама не надішле команду SKIP_WAITING — тобто АЖ ДО натискання цієї кнопки
   нова версія технічно неактивна. swRegistration зберігає посилання на
   реєстрацію SW (виставляється в кінці файлу, після успішної реєстрації),
   потрібне тут, щоб дістатись до registration.waiting. */
let swRegistration = null;
let swReloadTriggered = false;
// Rev 2.32.25 (U, A3-16) — оновлення застосунку без «закрити двічі». Раніше registration.update() не викликався ніде: браузер перевіряє sw.js лише при завантаженні сторінки, а iPhone тримає PWA в пам'яті днями. Тепер перевірка при старті, при поверненні з фону (не частіше ніж раз на хвилину) і раз на 6 годин; коли нова версія встановлена й чекає — банер «Доступне оновлення · Оновити» (лише коли безпечно: без шторки/діалогу/поля вводу/клавіатури). Тап -> SKIP_WAITING, далі єдиний перезапуск по controllerchange. Автоматичного перезавантаження нема. Чисті функції — для тестів.
const SW_UPDATE_INTERVAL_MS = 6 * 3600 * 1000;
const SW_UPDATE_MIN_GAP_MS = 60 * 1000;
function shouldCheckForUpdate(nowMs, lastMs){ return !lastMs || (nowMs - lastMs) >= SW_UPDATE_MIN_GAP_MS; }
function isSafeToReload(st){ const s = st || {}; return !(s.drawerOpen || s.modalOpen || s.inputFocused || s.kbOpen); }
function shouldShowUpdateBanner(st){ const s = st || {}; return !!s.waiting && isSafeToReload(s); }
function swUiState(){
  const ae = document.activeElement;
  const tag = ae && ae.tagName;
  return {
    waiting: !!(swRegistration && swRegistration.waiting && navigator.serviceWorker && navigator.serviceWorker.controller),
    drawerOpen: !!document.querySelector('.drawer.open'),
    modalOpen: !!document.querySelector('#app-modal.open'),
    inputFocused: !!(ae && (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || ae.isContentEditable)),
    kbOpen: document.body.classList.contains('kb-open'),
  };
}
let swUpdateLastCheck = 0, swUpdateFoundReported = false;
function checkForAppUpdate(){
  if(!swRegistration || !shouldCheckForUpdate(Date.now(), swUpdateLastCheck)) return;
  swUpdateLastCheck = Date.now();
  try{ swRegistration.update().catch(function(){}); }catch(e){}
}
function refreshUpdateBanner(){
  const el = document.getElementById('update-banner');
  if(!el) return;
  const st = swUiState();
  if(st.waiting && !swUpdateFoundReported){
    swUpdateFoundReported = true;
    if(recOn()) pushDebugEvent({ t: Math.round(performance.now() - debugRecordingStartedAt), type: 'sw-update', found: true, applied: false });
  }
  el.classList.toggle('show', shouldShowUpdateBanner(st));
}
function applyAppUpdate(){
  const st = swUiState();
  if(!isSafeToReload(st) || !swRegistration || !swRegistration.waiting){ return; }
  if(recOn()) pushDebugEvent({ t: Math.round(performance.now() - debugRecordingStartedAt), type: 'sw-update', found: true, applied: true });
  swRegistration.waiting.postMessage('SKIP_WAITING');
}

function showUpdateAvailable(){
  const top = document.getElementById('update-btn-top');
  if(top) top.style.display = 'flex'; // Rev 2.32.145 (DESK-UPDATE): бічного пункту більше немає, оновлення пропонує лише плашка #update-banner (її показує refreshUpdateBanner)
}
function openUpdateModal(){
  showConfirmModal(
    'Доступна нова версія застосунку. Дані нікуди не зникають — усе зберігається окремо в памʼяті браузера, а не в самому файлі застосунку. Оновити зараз?',
    function(){
      if(swRegistration && swRegistration.waiting){
        // Явна команда активації — щойно новий SW реально стане активним,
        // подія 'controllerchange' (зареєстрована нижче, разом із
        // реєстрацією SW) сама викличе перезавантаження сторінки. Тут
        // навмисно НЕ викликаємо reload() напряму — інакше можливий
        // короткий проміжок, коли сторінка вже перезавантажилась, а новий SW
        // ще не встиг стати активним (перегляд на мить показав би старий
        // офлайн-кеш замість щойно підтвердженого оновлення).
        swRegistration.waiting.postMessage('SKIP_WAITING');
      }else{
        // Фолбек: немає зареєстрованого waiting-воркера (напр. викликали
        // вручну без реального оновлення) — просто перезавантажуємо.
        window.location.reload();
      }
    },
    'Оновити зараз',
    'primary' // Rev 2.32.45 (FB): оновлення — звичайна дія, не руйнівна
  );
}

let lastActiveTab = 'analytics';
let lastTabSwitchAt = 0; // Rev 2.29.1 — performance.now() останнього performSwitchTab (діагностика expense-focus-neighbors)
// Rev 2.16.6 — той самий захист від "незбережених змін" прибрано (див.
// onMonthChange вище) — редагування Обліку тепер завжди йде через шторку.
function switchTab(tab, opts){
  performSwitchTab(tab, opts);
}
/* ============ Заголовок вкладки (Rev 2.8.0) ============
   Замінює колишній статичний "Бюджет" у шапці — тепер заголовок і
   підзаголовок відповідають АКТИВНІЙ вкладці. Підзаголовки "Аналітики" й
   "Обліку" залежать від обраного місяця (там дані й справді місяць-залежні);
   решта вкладок ("Витрати", "Структура", "Сервіс") не прив'язані до
   конкретного місяця (журнал витрат показує всі записи, структура/сервіс
   взагалі про довідники й дані, а не про місяць) — тому їхні підзаголовки
   статичні, без згадки місяця. */
// ===== Rev 2.24.0 (M1) — фундамент руху (docs/DESIGN_SYSTEM.md, ROADMAP 32.41) =====
// Чисті функції (витягуються тестами tests/motion.test.js): motionDuration, tabDirection, shouldReleasePress.
// MOTION_BASE_MS — JS-дзеркало CSS-токенів --motion-micro/s/m/l/count (:root). k — множник інтенсивності (тест "motion-intensity").
// Rev 2.27.0 (M2.1): count 700→1000; нові chart (лінії/кільце), bars (стовпчики), card (поява картки) — повільніші графіки; токени переходу вкладок і натискань (micro/s/m/l) не змінено.
const MOTION_BASE_MS = { micro: 120, s: 200, m: 320, l: 480, count: 1000, chart: 900, bars: 700, card: 420 };
const MOTION_REDUCED_MAX_MS = 80;
const TAB_ORDER = ['analytics', 'accounting', 'vytraty', 'structure', 'service'];
const PRESS_MIN_MS = 80;
const PRESS_MOVE_TOLERANCE_PX = 10;
function motionDuration(token, k, reduced){
  const base = MOTION_BASE_MS[token];
  if(typeof base !== 'number') return 0;
  const kk = (typeof k === 'number' && isFinite(k) && k > 0) ? k : 1;
  const ms = Math.round(base * kk);
  return reduced ? Math.min(ms, MOTION_REDUCED_MAX_MS) : ms;
}
// +1: рух "вперед" за порядком таббару (вихідна їде вліво, нова приїжджає справа), -1: назад, 0: та сама/невідома вкладка.
function tabDirection(from, to, order){
  const o = order || TAB_ORDER;
  const a = o.indexOf(from), b = o.indexOf(to);
  if(a < 0 || b < 0 || a === b) return 0;
  return b > a ? 1 : -1;
}
// Rev 2.30.1 — перехід на «Витрати» З АВТОФОКУСОМ на «Назві» M1-переходом НЕ анімуємо: autofocus спрацьовує на початку переходу (вкладка прозора, pointer-events:none, .tab-transitioning),
// і iOS не показує активну стрілку «вниз» (лог Test1, 2.29.0). Інші вкладки й вхід у «Витрати» без автофокусу (зі сповіщення, noFocus) анімуються як раніше.
function shouldSkipTabTransition(route, willAutofocus){
  return route === 'vytraty' && !!willAutofocus;
}
function shouldReleasePress(startMs, nowMs, minMs){
  return (nowMs - startMs) >= minMs;
}
const MOTION_EASE_OUT = 'cubic-bezier(.22,1,.36,1)';
const MOTION_EASE_SPRING = 'cubic-bezier(.34,1.56,.64,1)';
// Rev 2.32.0 (F): тест motion-intensity завершено — обрано «Стандартну» (×1) як сталу; CSS-токен --motion-k:1 у :root лишається множником токенів.
const motionK = 1;
function motionReduced(){
  try{ return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); }catch(e){ return false; }
}
// Подія рекордера motion-perf (kind: 'tab-switch' | 'press'): лише числа та назви вкладок, без даних користувача.
function recordMotionPerf(fields){
  if(!debugRecordingActive) return;
  pushDebugEvent(Object.assign({ t: Math.round(performance.now() - debugRecordingStartedAt), type: 'motion-perf' }, fields));
}
// --- Перехід між вкладками (M1) ---
// Вихідний .view лишається видимим і знімається з потоку (position:absolute) на час переходу; новий видимий одразу з початкового стану.
// Анімація — element.animate (opacity + transform). pointer-events:none на вкладках (CSS .tab-transitioning), прокрутка кожної вкладки зберігається.
const tabScrollPositions = {};
let tabTransition = null;
let tabAnimEnabled = false; // вмикається першим жестом користувача: програмні перемикання на старті (маршрут зі сповіщення) не анімуються

function finishTabTransition(){
  const tr = tabTransition;
  if(!tr) return;
  tabTransition = null;
  tr.done(false);
}
function beginTabTransition(prevTab, tab, fromContentTop){
  const mainCol = document.getElementById('main-col');
  const fromEl = document.getElementById('view-' + prevTab);
  const toEl = document.getElementById('view-' + tab);
  if(!mainCol || !fromEl || !toEl || typeof toEl.animate !== 'function') return false;
  const cs = getComputedStyle(mainCol);
  const padL = parseFloat(cs.paddingLeft) || 0, padR = parseFloat(cs.paddingRight) || 0;
  mainCol.classList.add('tab-transitioning');
  fromEl.classList.remove('hidden');
  fromEl.style.position = 'absolute'; fromEl.style.left = padL + 'px'; fromEl.style.right = padR + 'px'; fromEl.style.top = fromContentTop + 'px';
  fromEl.style.zIndex = '0';
  return { mainCol: mainCol, fromEl: fromEl, toEl: toEl, fromContentTop: fromContentTop };
}
function playTabTransition(ctx, prevTab, tab, fromScroll, t0){
  const { mainCol, fromEl, toEl, fromContentTop } = ctx;
  // Старий .view тримаємо візуально на місці: позиція (у координатах вмісту #main-col) = де він був у вмісті - стара прокрутка + нова.
  fromEl.style.top = (fromContentTop - fromScroll + mainCol.scrollTop) + 'px';
  const reduced = motionReduced();
  const k = motionK;
  const dir = reduced ? 0 : tabDirection(prevTab, tab);
  const dOut = motionDuration('micro', k, reduced), dIn = motionDuration('s', k, reduced);
  const shiftOut = dir ? (-dir * 8 * k) : 0, shiftIn = dir ? (dir * 10 * k) : 0;
  const kfOut = dir ? [{ opacity: 1, transform: 'translateX(0px)' }, { opacity: 0, transform: 'translateX(' + shiftOut + 'px)' }] : [{ opacity: 1 }, { opacity: 0 }];
  const kfIn = dir ? [{ opacity: 0, transform: 'translateX(' + shiftIn + 'px)' }, { opacity: 1, transform: 'translateX(0px)' }] : [{ opacity: 0 }, { opacity: 1 }];
  // Rev 2.29.0 (B1) — важка частина (показ нового .view, розмітка, скидання прокрутки) вже виконана СИНХРОННО в performSwitchTab; новий .view тримаємо opacity:0 (inline), і анімацію
  // стартуємо в НАСТУПНОМУ кадрі: перший (важкий) кадр лишається поза анімацією, тож пауза всередині руху зникає. Запасний старт за 100 мс — якщо rAF не прийшов (сторінка прихована).
  // will-change лише на час анімації. contain на .view НЕ додано: layout/paint-containment робить .view containing block і обрізає виступи — безпека не доведена (див. ROADMAP 32.48).
  let frames = 0, maxGap = 0, gapAt = 0, lastT = 0, startedAt = 0, firstFrameMs = 0, started = false, ended = false;
  let outAnim = null, inAnim = null, safety = null, startSafety = null;
  toEl.style.opacity = '0';
  function tick(now){
    if(ended) return;
    frames++;
    const gap = now - lastT; if(gap > maxGap){ maxGap = gap; gapAt = frames; }
    lastT = now;
    requestAnimationFrame(tick);
  }
  function done(completed){
    if(ended) return;
    ended = true;
    if(safety){ clearTimeout(safety); safety = null; }
    if(startSafety){ clearTimeout(startSafety); startSafety = null; }
    const duration = started ? performance.now() - startedAt : 0;
    fromEl.classList.add('hidden');
    fromEl.style.position = ''; fromEl.style.left = ''; fromEl.style.right = ''; fromEl.style.top = ''; fromEl.style.zIndex = '';
    try{ if(outAnim) outAnim.cancel(); if(inAnim) inAnim.cancel(); }catch(e){}
    toEl.style.opacity = ''; toEl.style.willChange = ''; fromEl.style.willChange = '';
    mainCol.classList.remove('tab-transitioning');
    if(completed) recordMotionPerf({ kind: 'tab-switch', from: prevTab, to: tab, frames: frames, maxGapMs: Math.round(maxGap), durationMs: Math.round(duration), reduced: reduced, firstFrameMs: Math.round(firstFrameMs), gapAtFrame: gapAt });
  }
  const onBoth = function(){ if(tabTransition && tabTransition.done === done){ tabTransition = null; done(true); } };
  function start(){
    if(started || ended) return;
    started = true;
    if(startSafety){ clearTimeout(startSafety); startSafety = null; }
    firstFrameMs = performance.now() - (t0 || performance.now());
    toEl.style.opacity = ''; toEl.style.willChange = 'transform, opacity'; fromEl.style.willChange = 'transform, opacity';
    outAnim = fromEl.animate(kfOut, { duration: dOut, easing: 'cubic-bezier(.4,0,1,1)', fill: 'forwards' });
    inAnim = toEl.animate(kfIn, { duration: dIn, easing: MOTION_EASE_OUT, fill: 'backwards' });
    startedAt = performance.now(); lastT = startedAt;
    requestAnimationFrame(tick);
    Promise.all([outAnim.finished, inAnim.finished]).then(onBoth, function(){ /* cancel під час переривання — done(false) уже викликано */ });
    safety = setTimeout(onBoth, Math.max(dOut, dIn) + 200);
  }
  tabTransition = { done: done };
  requestAnimationFrame(start);
  startSafety = setTimeout(start, 100);
}
// --- Реакція на натискання (M1): один механізм для кнопок, чипів, рядків, карток ---
// .is-pressed ставиться на pointerdown (passive), знімається на pointerup/pointercancel/відхід пальця/visibilitychange; не раніше PRESS_MIN_MS.
// Сам ефект (scale + opacity) — WAAPI: не конфліктує з власними transition/transform елементів (свайп .expense-row, .selected).
const PRESS_SELECTOR = 'button, [role="button"], .expense-row, .card-debt-compact-row, .service-tile, .service-danger-card, .service-wide-card, .n-row, .name-suggest-item, .profile-menu-item, .show-journal-link';
const PRESS_EXCLUDE = 'nav.tabbar, .scroll-top-btn, .drawer-handle, [data-no-press]';
const pressStates = new Map();
function pressCanScale(){ try{ return !!(window.CSS && CSS.supports && CSS.supports('scale', '1')); }catch(e){ return false; } }
function pressStart(e){
  if(e.pointerType === 'mouse' && e.button !== 0) return;
  const t = e.target;
  const el = (t && t.closest) ? t.closest(PRESS_SELECTOR) : null;
  if(!el || pressStates.has(el) || el.closest(PRESS_EXCLUDE)) return;
  if(el.disabled || el.getAttribute('aria-disabled') === 'true') return;
  const reduced = motionReduced();
  const dur = motionDuration('micro', motionK, reduced);
  const baseOp = parseFloat(getComputedStyle(el).opacity);
  const op = isNaN(baseOp) ? 1 : baseOp;
  const toScale = 1 - 0.03 * motionK;
  const useScale = !reduced && pressCanScale();
  const from = useScale ? { scale: '1', opacity: op } : { opacity: op };
  const to = useScale ? { scale: String(toScale), opacity: op * 0.9 } : { opacity: op * 0.9 };
  let anim = null;
  if(typeof el.animate === 'function'){
    try{ anim = el.animate([from, to], { duration: dur, easing: MOTION_EASE_OUT, fill: 'forwards' }); }catch(err){ anim = null; }
  }
  const st = { id: e.pointerId, x: e.clientX, y: e.clientY, start: performance.now(), anim: anim, from: from, to: to, dur: dur, timer: null, safety: null };
  st.safety = setTimeout(function(){ pressRelease(el); }, 8000); // страховка від "залипання", якщо подія відпускання загубилась
  pressStates.set(el, st);
  el.classList.add('is-pressed');
}
function pressElSelector(el){ return el ? (el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.classList && el.classList[0] ? '.' + el.classList[0] : '')) : ''; }
// Rev 2.29.0 (B2) — підмітальник: через 300 мс після відпускання знімає .is-pressed з елементів, що НЕ відстежуються активним натисканням (витік). Активні (другий тап/палець) НЕ витік:
// у логу 2.27.0 єдиний pressLeak=1 був саме таким — другий тап по #show-journal-btn уже йшов (touchstart за 18 мс до заміру), а не залипання.
function sweepPress(releasedAt){
  const now = performance.now();
  const fixed = []; let remaining = 0; let remSel = '';
  document.querySelectorAll('.is-pressed').forEach(function(el){
    if(pressStates.has(el)) return;
    if(shouldSweepPress({ pressed: true, tracked: false, sinceMs: releasedAt }, now)){ el.classList.remove('is-pressed'); fixed.push(pressElSelector(el)); }
    else { remaining++; remSel = pressElSelector(el); }
  });
  fixed.forEach(function(sel){ recordMotionPerf({ kind: 'press-leak-fixed', selector: sel, ms: Math.round(now - releasedAt) }); });
  return { fixed: fixed, remaining: remaining, remainingSelector: remSel };
}
function pressRelease(el){
  const st = pressStates.get(el);
  if(!st) return;
  pressStates.delete(el);
  if(st.timer) clearTimeout(st.timer);
  if(st.safety) clearTimeout(st.safety);
  el.classList.remove('is-pressed');
  if(st.anim && typeof el.animate === 'function'){
    try{
      el.animate([st.to, st.from], { duration: st.dur, easing: MOTION_EASE_SPRING });
      st.anim.cancel();
    }catch(err){ try{ st.anim.cancel(); }catch(e2){} }
  }
  const releasedAt = performance.now();
  const holdMs = Math.round(releasedAt - st.start);
  setTimeout(function(){
    const r = sweepPress(releasedAt);
    if(debugRecordingActive) recordMotionPerf({ kind: 'press', holdMs: holdMs, pressLeak: r.remaining, leakSelector: r.remainingSelector || (r.fixed[0] || ''), reduced: motionReduced() });
  }, 300);
}
function pressEnd(e){
  pressStates.forEach(function(st, el){
    if(st.id !== e.pointerId) return;
    if(e.type === 'pointercancel' || shouldReleasePress(st.start, performance.now(), PRESS_MIN_MS)) pressRelease(el);
    else if(!st.timer) st.timer = setTimeout(function(){ pressRelease(el); }, PRESS_MIN_MS - (performance.now() - st.start));
  });
}
function pressMove(e){
  if(!pressStates.size) return;
  pressStates.forEach(function(st, el){
    if(st.id !== e.pointerId) return;
    if(Math.abs(e.clientX - st.x) > PRESS_MOVE_TOLERANCE_PX || Math.abs(e.clientY - st.y) > PRESS_MOVE_TOLERANCE_PX) pressRelease(el);
  });
}
function pressReleaseAll(){ Array.from(pressStates.keys()).forEach(pressRelease); }
// touchend/touchcancel без пальців — знімаємо всі натискання (страховка, якщо pointerup/pointercancel не дійшли); мінімальна тривалість зберігається.
function pressEndAllTouch(e){
  if(e.touches && e.touches.length) return;
  pressStates.forEach(function(st, el){
    if(e.type === 'touchcancel' || shouldReleasePress(st.start, performance.now(), PRESS_MIN_MS)) pressRelease(el);
    else if(!st.timer) st.timer = setTimeout(function(){ pressRelease(el); }, PRESS_MIN_MS - (performance.now() - st.start));
  });
}

const BUTTON_VARIANT_MAP = {
  primary: ['chk-fl', 'submit-btn', 'rce-save', 'dsp-action', 'sync-card-btn', 'trash-restore-btn', 'mono-primary'],
  secondary: ['rs-cancel', 'chk-sk', 'add-trigger-btn', 'show-journal-link', 'journal-reset-btn', 'rce-cancel', 'diag-issue-ignore', 'installment-pay-btn', 'dbg-rec-btn'],
  text: ['mn', 'mono-back', 'notif-back', 't-footer-link', 'cdd-delete-link', 'dsp-link', 'auto-hint-edit-btn', 'n-diag-toggle', 'mono-kw-undo', 'struct-delete-row', 'notif-readall', 'bdr-diff-apply', 'journal-empty-reset'],
  danger: ['danger-outline'],
  icon: ['mb', 'och-delete-btn', 'drawer-close', 'gear-btn', 'notif-bell-btn', 'profile-header-btn', 'update-btn', 'date-nav-btn', 'journal-back-btn', 'journal-search-clear', 'bdr-icon-btn', 'data-status-dot', 'exp-del', 'notif-row-trash'],
  segment: ['struct-tab-btn', 'theme-toggle-btn'],
  chip: ['trash-chip', 'mono-inst-label', 'mono-refund-label', 'mono-cat-btn'],
  row: ['rs-rw', 'mono-row', 'mono-auto-row', 'mono-auto-ok', 'notif-row', 'struct-row', 'struct-dict-head', 'pay-day', 'pay-card-hit', 'pay-line', 'mono-switch', 'chk-row', 'chk-hd', 'swipe-ignore-btn', 'card-debt-compact-row', 'service-tile', 'service-wide-card', 'service-danger-card', 'n-row', 'n-row-link', 'profile-menu-item', 'diag-issue', 'swipe-edit-btn', 'swipe-delete-btn', 'swipe-restore-btn', 'swipe-purge-btn'],
  reference: ['mini-head', 'tab-vytraty', 'scroll-top-btn', 'side-tab', 'side-collapse-btn', 'och-cond-row']
};
// Класи-модифікатори (не визначають варіант самі): стани й кольорові різновиди.
const BUTTON_MODIFIER_CLASSES = ['on', 'hidden', 'active', 'link', 'pill', 'income', 'debt', 'expense', 'danger', 'secondary', 'btn-loading', 'journal-empty-reset-x', 'accent', 'save-gated', 'chk-mut', 'k', 'first', 'more'];
// className → variant (або null). parentClassName — клас контейнера для безкласових кнопок (.n-days > button = chip; .tabbar-glass > button = reference).
function buttonVariantOf(className, parentClassName){
  const cls = String(className || '').split(/\s+/).filter(Boolean);
  const has = c => cls.indexOf(c) !== -1;
  if(has('submit-btn')){
    if(has('danger-outline') || has('danger')) return 'danger';
    if(has('secondary')) return 'secondary';
    return 'primary';
  }
  for(let i = 0; i < cls.length; i++){
    const c = cls[i];
    for(const v in BUTTON_VARIANT_MAP){ if(BUTTON_VARIANT_MAP[v].indexOf(c) !== -1) return v; }
  }
  const parent = String(parentClassName || '').split(/\s+/);
  if(parent.indexOf('n-days') !== -1) return 'chip';
  if(parent.indexOf('tabbar-glass') !== -1) return 'reference';
  return null;
}
function meetsMinTarget(w, h, min){
  const m = typeof min === 'number' ? min : 44;
  return Number(w) >= m && Number(h) >= m;
}
function compositeColor(fg, bg){
  const f = parseCssColor(fg), b = parseCssColor(bg);
  if(!f || !b) return null;
  const a = f[3];
  return [f[0] * a + b[0] * (1 - a), f[1] * a + b[1] * (1 - a), f[2] * a + b[2] * (1 - a), 1];
}
// WCAG-контраст двох кольорів; прозорий fg композититься поверх bg (bg має бути непрозорим або вже скомпонованим).
function contrastRatio(fg, bg){
  const b = parseCssColor(bg);
  const f = compositeColor(fg, b && b[3] < 1 ? compositeColor(b, [255, 255, 255, 1]) : b);
  if(!f || !b) return 0;
  const bb = b[3] < 1 ? compositeColor(b, [255, 255, 255, 1]) : b;
  const l1 = relativeLuminance(f), l2 = relativeLuminance(bb);
  const hi = Math.max(l1, l2), lo = Math.min(l1, l2);
  return (hi + 0.05) / (lo + 0.05);
}
const UI_AUDIT_MIN_TARGET = 44;
const UI_AUDIT_AA = 4.5;
const UI_AUDIT_SMALL_EXEMPT = ['bdr-icon-btn'];
// Фон елемента: шари фону вгору по предках композитяться, доки не зустрінеться непрозорий.
function effectiveBackgroundColor(el){
  const layers = [];
  let n = el;
  while(n && n.nodeType === 1){
    const c = parseCssColor(getComputedStyle(n).backgroundColor);
    if(c && c[3] > 0){ layers.push(c); if(c[3] >= 1) break; }
    n = n.parentElement;
  }
  let base = parseCssColor(getComputedStyle(document.body).backgroundColor);
  if(!base || base[3] < 1) base = [255, 255, 255, 1];
  let acc = layers.length && layers[layers.length - 1][3] >= 1 ? layers.pop() : base;
  while(layers.length){ acc = compositeColor(layers.pop(), acc); }
  return acc;
}
// ui-audit: лише кількості й перелік КЛАСІВ (без даних користувача).
function runUiAudit(){
  const byVariant = {}; let total = 0, noVariant = 0, small = 0, lowContrast = 0, smallExempt = 0, lowRow = 0;
  const noVariantCls = {}, smallCls = {}, lowCls = {}, lowRowCls = {};
  document.querySelectorAll('button').forEach(function(b){
    // Усі кнопки в DOM (також у прихованих вкладках/шторках) — варіант і контраст рахуються зі стилів; розмір зони натискання — лише для відрендерених.
    const r = b.getBoundingClientRect();
    const rendered = r.width > 0 && r.height > 0;
    total++;
    const cn = typeof b.className === 'string' ? b.className : '';
    const v = buttonVariantOf(cn, b.parentElement ? b.parentElement.className : '') || (b.closest('nav.tabbar') ? 'reference' : null);
    const key = (cn.split(/\s+/)[0] || b.tagName.toLowerCase());
    if(!v){ noVariant++; noVariantCls[key] = 1; }
    else byVariant[v] = (byVariant[v] || 0) + 1;
    const cs = getComputedStyle(b);
    const hit = parseFloat(cs.getPropertyValue('--ui-hit')) || 0;
    const hv = function(name, dflt){ const raw = cs.getPropertyValue(name).trim(); return raw === '' ? dflt : (parseFloat(raw) || 0); };
    const hy = hv('--ui-hit-y', hit), hl = hv('--ui-hit-l', hit), hr = hv('--ui-hit-r', hit);
    if(rendered && v !== 'row' && v !== 'reference' && !meetsMinTarget(r.width + hl + hr, r.height + 2 * hy, UI_AUDIT_MIN_TARGET)){
      // Задокументований виняток: щільні ряди іконок-кнопок (сусіди впритул) — розширення до 44 перекривало б сусідні кнопки.
      if(UI_AUDIT_SMALL_EXEMPT.indexOf(key) !== -1){ smallExempt++; } else { small++; smallCls[key] = 1; }
    }
    if(b.textContent.trim() && v !== 'reference'){
      const fg = parseCssColor(cs.color), bg = effectiveBackgroundColor(b);
      if(fg && bg && contrastRatio(fg, bg) < UI_AUDIT_AA){
        if(v === 'row'){ lowRow++; lowRowCls[key] = 1; } // рядки/дії свайпу — M4
        else { lowContrast++; lowCls[key] = 1; }
      }
    }
  });
  return { btnTotal: total, byVariant: byVariant, btnNoVariant: noVariant, btnSmall: small, btnSmallExempt: smallExempt, btnLowContrast: lowContrast, btnLowContrastRow: lowRow, lowContrastRowClasses: Object.keys(lowRowCls).slice(0, 20),
    noVariantClasses: Object.keys(noVariantCls).slice(0, 20), smallClasses: Object.keys(smallCls).slice(0, 20), lowContrastClasses: Object.keys(lowCls).slice(0, 20) };
}
function recordUiAudit(){
  if(!debugRecordingActive) return;
  try{ pushDebugEvent(Object.assign({ t: Math.round(performance.now() - debugRecordingStartedAt), type: 'ui-audit' }, runUiAudit())); }catch(e){}
}
// ===== Rev 2.31.3 (B) — крапки «дані заповнені неповністю» для карток боргів і ОЧ в «Обліку» =====
// Доповнюють наявні крапки-статуси KPI (#21/#23, «немає місячних записів карток» — лише дашборд «Аналітики»): тут причина інша й по-картково (ліміт, мін. платіж, день платежу, початкова сума, платіж).
// Той самий колір (--color-warning) і той самий розмір крапки (7px), що й .data-status-dot; натискання відкриває діалог із переліком і кнопкою «Заповнити».
const INCOMPLETE_LABELS = { openingBalance: 'Залишок за банком на початок обліку', limit: 'Немає кредитного ліміту', balance: 'Немає даних про борг за цей місяць', minPayment: 'Немає мінімального платежу', dueDay: 'Немає дня платежу', initialAmount: 'Немає початкової суми', payment: 'Немає платежу за цей місяць' };
const INCOMPLETE_FIELDS = { openingBalance: 'idd-balance', limit: 'cdd-limit', balance: 'cdd-balance', minPayment: 'cdd-minpay', dueDay: 'idd-start', initialAmount: 'idd-initial', payment: 'idd-pay' };
// Rev 2.32.135: поле шторки за видом і причиною (день платежу картки — cdd-payday; залишок ОЧ — idd-balance).
function incompleteFieldId(kind, code){
  if(kind === 'card') return code === 'dueDay' ? 'cdd-payday' : INCOMPLETE_FIELDS[code];
  return code === 'balance' ? 'idd-balance' : INCOMPLETE_FIELDS[code];
}
// entity: картка {creditLimit} або ОЧ {initialAmount, dueDay}; monthRecord: { balance, minPayment, monthlyPayment } (для ОЧ — вже «розв'язаний» факт/оцінка місяця) або null; hidden: прихована для місяця → без крапки.
// Картка: немає ліміту (>0) / немає балансу за місяць / баланс>0 без мін. платежу (дату платежу не вимагаємо — поля немає). ОЧ: немає дня платежу / початкової суми (>0) / платежу за місяць при ненульовому залишку.
// Rev 2.32.135 (INCOMPLETE-2, рішення чату): причини НЕЗАЛЕЖНІ, без «заглушення»; умовні (мін. платіж картки / платіж ОЧ) показуються й тоді, коли борг/залишок за місяць ще невідомий (dependent: true, значення «залежить від боргу/залишку»), і зникають, коли борг/залишок відомий і дорівнює 0.
// Картка (порядок): limit (ліміт > 0), balance (є запис за місяць), minPayment (при боргу > 0 або невідомому), dueDay (день платежу картки, paymentDay 1…31). ОЧ: dueDay, initialAmount (> 0), balance (залишок за місяць, факт чи оцінка), payment (платіж > 0 при залишку > 0 або невідомому).
// Повертає [{ code, dependent }]; приховані → [].
// Rev 2.32.150 (INCOMPLETE-3, рішення чату): (1) МІСЯЧНІ причини (balance, minPayment, payment, день платежу картки) лише для поточного й попереднього місяця (nowMonth = київський «YYYY-MM»); майбутній і старіші місяці без них; постійні (ліміт картки, дата платежу й початкова сума ОЧ) лишаються. Без nowMonth вікно не застосовується (сумісність викликів). (2) Картка з ВІДОМИМ нульовим боргом: без «Мінімальний платіж» і «День платежу» (вимагаються, коли борг > 0 або ще невідомий); ліміт обов'язковий завжди. (3) Закрита ОЧ (залишок відомий і ≤ 0): жодних причин. (4) Явний «0» знімає крапку: мін. платіж картки (було й раніше) і платіж ОЧ при залишку > 0; порожнє (null) лишає. До початку обліку (createdAt картки, firstMonth ОЧ) і приховані: hidden → [] (картка там узагалі не показується). Ризик: поточний місяць береться з годинника пристрою (Київ); невідомий nowMonth = старий режим.
function incompleteMonthWindow(month, nowMonth){
  if(!nowMonth) return true;
  const y = +nowMonth.slice(0, 4), m = +nowMonth.slice(5, 7);
  const prev = m === 1 ? (y - 1) + '-12' : y + '-' + String(m - 1).padStart(2, '0');
  return month === nowMonth || month === prev;
}
function incompleteDetails(entity, monthRecord, month, hidden, nowMonth){
  if(hidden || !entity) return [];
  const rec = monthRecord || null;
  const out = [];
  const isCard = Object.prototype.hasOwnProperty.call(entity, 'creditLimit');
  const balKnown = !!rec && rec.balance != null;
  const bal = balKnown ? Number(rec.balance) : null;
  const monthly = incompleteMonthWindow(month, nowMonth);
  const needDebtFields = !balKnown || bal > 0; // борг відомий і нульовий → поля боргу не вимагаються
  if(isCard){
    if(!(Number(entity.creditLimit) > 0)) out.push({ code: 'limit', dependent: false });
    if(monthly){
      if(!balKnown) out.push({ code: 'balance', dependent: false });
      const minMissing = !rec || rec.minPayment == null;
      if(minMissing && needDebtFields) out.push({ code: 'minPayment', dependent: !balKnown });
      if(!entity.paymentDay && needDebtFields) out.push({ code: 'dueDay', dependent: false });
    }
  }else{
    if(balKnown && bal <= 0) return []; // закрита ОЧ
    if(!entity.dueDay) out.push({ code: 'dueDay', dependent: false });
    if(!(Number(entity.initialAmount) > 0)) out.push({ code: 'initialAmount', dependent: false });
    if(entity.openingMissing) out.push({ code: 'openingBalance', dependent: false }); // Rev 2.32.177: ОЧ із start_date раніше за початок обліку без опорної точки й без графіка
    if(monthly){
      if(!balKnown) out.push({ code: 'balance', dependent: false });
      const payMissing = !rec || rec.monthlyPayment == null; // явний «0» = введено
      if(payMissing && needDebtFields) out.push({ code: 'payment', dependent: !balKnown });
    }
  }
  return out;
}
function incompleteReasons(entity, monthRecord, month, hidden){
  return incompleteDetails(entity, monthRecord, month, hidden).map(function(d){ return d.code; });
}
function cardIncompleteDetails(acc){
  const hidden = !isCardVisibleForMonth(acc, selectedMonth); // Rev 2.32.137
  const existing = findAccountMonthDebt(activeDebts(), acc, selectedMonth, 'card'); // Rev 2.32.237 (CARD-BY-ID)
  return incompleteDetails(acc, existing ? { balance: existing.balance, minPayment: existing.minPayment } : null, selectedMonth, hidden, kyivTodayISO().slice(0, 7));
}
function cardIncompleteReasons(acc){ return cardIncompleteDetails(acc).map(function(d){ return d.code; }); }
function installmentIncompleteDetails(acc){
  const hidden = !isInstallmentVisibleForMonth(acc, selectedMonth);
  const existing = activeDebts().find(function(d){ return d.name === acc.name && d.kind === 'installment' && d.month === selectedMonth; });
  const resolved = resolveInstallmentFact(acc.name, selectedMonth, existing);
  const calc = hidden ? null : installmentChainCalc(installmentChainSpec(acc.name), selectedMonth);
  return incompleteDetails(Object.assign({}, acc, { openingMissing: !!(calc && calc.openingMissing) }), { balance: resolved.balance, monthlyPayment: resolved.pay }, selectedMonth, hidden, kyivTodayISO().slice(0, 7)); // Rev 2.32.177: openingMissing — «Залишок за банком на початок обліку»
}
function installmentIncompleteReasons(acc){ return installmentIncompleteDetails(acc).map(function(d){ return d.code; }); }
function incompleteDotHtml(kind, i, reasons){
  if(!reasons.length) return '';
  return `<span class="cdr-dot" role="img" aria-label="Дані заповнені неповністю" onclick="event.stopPropagation(); showIncompleteInfo('${kind}', ${i})"></span>`;
}
// Крапка з кількістю на сегментах «Борги» / «ОЧ» (оновлюється лише при зміні числа — фонові рендери не мерехтять).
function updateIncompleteBadges(){
  if(!selectedMonth) return;
  const nCards = bankAccounts.filter(function(a){ return cardIncompleteReasons(a).length > 0; }).length;
  const nInst = installmentAccounts.filter(function(a){ return installmentIncompleteReasons(a).length > 0; }).length;
  [['seg-badge-debts', nCards], ['seg-badge-installments', nInst]].forEach(function(p){
    const el = document.getElementById(p[0]);
    if(!el) return;
    const txt = p[1] ? String(p[1]) : '';
    if(el.textContent !== txt) el.textContent = txt;
    el.classList.toggle('hidden', !p[1]);
  });
}
// Rev 2.32.130: рядок «що бракує» (підпис ліворуч, приглушене значення праворуч) за видом причини; kind: 'card' | 'installment'. «День платежу» — картка, «Дата платежу» — ОЧ.
function incompleteRowModel(kind, reason, dependent){
  const isCard = kind === 'card';
  const map = {
    limit: { label: 'Кредитний ліміт', value: 'не вказано' },
    dueDay: { label: isCard ? 'День платежу' : 'Дата платежу', value: 'не вказано' },
    minPayment: { label: 'Мінімальний платіж', value: 'не вказано' },
    balance: { label: isCard ? 'Борг за цей місяць' : 'Залишок за цей місяць', value: 'немає даних' },
    initialAmount: { label: 'Початкова сума', value: 'не вказано' },
    payment: { label: 'Платіж на місяць', value: 'не вказано' },
  };
  const m = map[reason] || { label: String(INCOMPLETE_LABELS[reason] || reason), value: '' };
  if(dependent) return { label: m.label, value: isCard ? 'залежить від боргу' : 'залежить від залишку' }; // умовні поля, поки борг/залишок невідомий
  return m;
}
// Rev 2.32.130: іконка — коло зі знаком оклику (за уточненим макетом).
const INCOMPLETE_WARN_SVG = '<svg viewBox="0 0 30 30" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="15" cy="15" r="10"/><path d="M15 9.5v7"/><path d="M15 20.5h.01"/></svg>';
function showIncompleteInfo(kind, i){
  const acc = kind === 'card' ? bankAccounts[i] : installmentAccounts[i];
  if(!acc) return;
  const details = kind === 'card' ? cardIncompleteDetails(acc) : installmentIncompleteDetails(acc);
  if(!details.length) return;
  const msg = stripLeadingEmoji(acc.name) + ': дані заповнені неповністю.';
  showConfirmModal(msg, function(){ fillIncomplete(kind, i, details.map(function(d){ return d.code; })); }, 'Заповнити', 'primary'); // Rev 2.32.45 (FB): основна (зелена) дія, не руйнівна
  // Rev 2.32.130: структура за макетом (заголовок, підзаголовок, рядки «що бракує»); усі тексти через textContent. Читач екрана бачить цю структуру (заголовок, підзаголовок, рядки).
  const text = document.getElementById('app-modal-text');
  text.textContent = '';
  const title = document.createElement('div'); title.className = 'inc-title'; title.textContent = stripLeadingEmoji(acc.name);
  const sub = document.createElement('div'); sub.className = 'inc-sub'; sub.textContent = 'Дані заповнені неповністю';
  const list = document.createElement('div'); list.className = 'inc-list';
  details.forEach(function(d){
    const m = incompleteRowModel(kind, d.code, d.dependent);
    const row = document.createElement('div'); row.className = 'inc-row';
    const ic = document.createElement('span'); ic.className = 'inc-icon'; ic.innerHTML = INCOMPLETE_WARN_SVG;
    const lb = document.createElement('span'); lb.className = 'inc-label'; lb.textContent = m.label;
    const vl = document.createElement('span'); vl.className = 'inc-value'; vl.textContent = m.value;
    row.appendChild(ic); row.appendChild(lb); row.appendChild(vl); list.appendChild(row);
  });
  text.appendChild(title); text.appendChild(sub); text.appendChild(list);
  const cancelBtn = document.getElementById('app-modal-cancel-btn');
  if(cancelBtn) cancelBtn.textContent = 'Закрити';
}
// «Заповнити»: відкриває шторку цієї картки/ОЧ і підсвічує (та прокручує до) першого порожнього поля — БЕЗ автофокусу (клавіатурна логіка шторок не чіпається).
function fillIncomplete(kind, i, codes){
  if(kind === 'card') openCardDebtEditor(i); else openInstallmentEditor(i);
  const list = Array.isArray(codes) ? codes : [codes];
  setTimeout(function(){
    // Rev 2.32.135: підсвічуємо ВСІ порожні поля одразу (до першого вводу в полі або 6 с), прокручуємо до першого; без автофокусу (клавіатурна логіка шторок не чіпається).
    let first = null;
    list.forEach(function(code){
      const el = document.getElementById(incompleteFieldId(kind, code));
      if(!el) return;
      const raw = String(el.value == null ? '' : el.value).trim();
      if(raw !== '') return; // Rev 2.32.150: явний «0» (і платіж ОЧ) — введено, не порожнє
      if(!first) first = el;
      if(typeof ochSetCond === 'function' && el.closest && el.closest('#idd-cond')) ochSetCond(true); // «Залишок за банком» лежить у згорнутих «Умовах»
      hintField(el); // Rev 2.32.172: той самий компонент, що в тапі по «ОЧ без дати»
    });
    if(first) first.scrollIntoView({ block: 'center' });
  }, 350);
}
function recordIncompleteDots(){
  if(!debugRecordingActive || !selectedMonth) return;
  const counts = {};
  let cards = 0, inst = 0;
  bankAccounts.forEach(function(a){ const r = cardIncompleteReasons(a); if(r.length){ cards++; r.forEach(function(x){ counts[x] = (counts[x] || 0) + 1; }); } });
  installmentAccounts.forEach(function(a){ const r = installmentIncompleteReasons(a); if(r.length){ inst++; r.forEach(function(x){ counts[x] = (counts[x] || 0) + 1; }); } });
  pushDebugEvent({ t: Math.round(performance.now() - debugRecordingStartedAt), type: 'incomplete-dots', cards: cards, installments: inst, reasonCounts: counts });
}
// ===== Rev 2.28.1 (C) — аудит id/name текстових полів (панель iOS "Автозаповнити контакт", ROADMAP 6D.136–141: причина — підрядок "name" в id) =====
// Заборонені підрядки (без урахування регістру) в id/name текстових input/textarea. Фікс — абстрактні id за схемою fld+код+число (expfielda7, cddfielda1, iddfielda1, edtfielda1, cldfielda1).
const INPUT_ATTR_FORBIDDEN = ['name', 'phone', 'tel', 'mail', 'addr', 'user', 'login', 'first', 'last', 'fio', 'contact'];
function forbiddenInputAttr(value){
  const v = String(value || '').toLowerCase();
  for(let i = 0; i < INPUT_ATTR_FORBIDDEN.length; i++){ if(v.indexOf(INPUT_ATTR_FORBIDDEN[i]) !== -1) return INPUT_ATTR_FORBIDDEN[i]; }
  return null;
}
// Rev 2.32.169 (FIELD-GUARD, клас C): захисні атрибути текстових полів, створених у JS, — в ОДНОМУ місці (раніше кожне поле виставляло свій набір: у «слова» не було autocapitalize, name, enterkeyhint). Набір: autocomplete=off, autocorrect=off, autocapitalize=off, spellcheck=false, aria-label, enterkeyhint і нейтральний name «x-<id>» (id за схемою fld+код+число; name не додається, якщо id порожній або містить заборонений підрядок — forbiddenInputAttr). Платформа: вирішальні лише id і name (6D.132–141), решта атрибутів автозаповнення не вимикає, але прибирає автовеликі літери/виправлення; жодна з них не змінює клавіатурну логіку (проміжне поле копіює їх із цільового поля як раніше). Ризик: autocapitalize=off — назви категорій/підкатегорій у «Структурі» більше не починаються з великої автоматично.
function applyFieldGuardAttrs(input, opts){
  const o = opts || {};
  if(!input || typeof input.setAttribute !== 'function') return input;
  // Rev 2.32.218 (AUTOFILL-DATE): нетекстові поля (date, month, time, number тощо) — лише autocomplete=off: гіпотеза — набір «текст + дата + сума» Safari сприймає як контактну форму; autocorrect/autocapitalize/spellcheck/enterkeyhint для них не мають сенсу й не ставляться.
  if(['date', 'month', 'time', 'datetime-local', 'week', 'number', 'range'].indexOf(String(input.type || '').toLowerCase()) !== -1){ input.setAttribute('autocomplete', 'off'); return input; }
  input.setAttribute('autocomplete', 'off'); input.setAttribute('autocorrect', 'off'); input.setAttribute('autocapitalize', 'off'); input.setAttribute('spellcheck', 'false');
  if(o.label) input.setAttribute('aria-label', o.label);
  input.setAttribute('enterkeyhint', o.enterkeyhint || 'done');
  const id = String(input.id || '');
  // Rev 2.32.216 (INPUT-AUDIT, клас C): name = сам id без префікса «x-» — тире в name вмикає «телефонну» евристику Safari (ігнорує autocomplete=off); id за схемою fld+код+число тире не містить. Ідентичний id у name додатково перевіряється forbiddenInputAttr і охоронним тестом.
  if(id && id.indexOf('-') === -1 && forbiddenInputAttr(id) === null) input.setAttribute('name', id);
  return input;
}
// Rev 2.32.169 (FIELD-GUARD): рекордер (лише режим розробника) — атрибути поля, що отримало фокус у формі «Структури» (#struct-drawer) і на вкладці «Словник»: без значень, з ознакою проміжного поля й id пов'язаного поля. Допомагає відрізнити «поле» від «проміжного поля» при появі панелі «Автозаповнити контакт».
const FIELD_ATTRS_WATCHED = ['autocomplete', 'autocorrect', 'autocapitalize', 'spellcheck', 'name', 'inputmode', 'enterkeyhint', 'aria-label', 'placeholder', 'maxlength', 'readonly'];
function fieldAttrsSnapshot(el){
  if(!el || !el.tagName || !/^(INPUT|TEXTAREA)$/.test(el.tagName) || typeof el.closest !== 'function') return null;
  const scope = el.closest('#struct-drawer, #struct-tab-panel-dictionary');
  if(!scope) return null;
  const cut = function(v){ return String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, 40); };
  const attrs = FIELD_ATTRS_WATCHED.filter(function(k){ return el.hasAttribute(k); }).map(function(k){ return k + '=' + cut(el.getAttribute(k)); }).join('|');
  const proxy = el.id === 'kb-focus-proxy';
  let linked = null;
  if(proxy && el.parentNode && typeof el.parentNode.querySelector === 'function'){ const f = el.parentNode.querySelector('input:not(#kb-focus-proxy), textarea'); linked = f ? (f.id || null) : null; }
  return { fieldId: cut(el.id), fieldType: cut(el.getAttribute('type') || el.type || 'text'), fieldAttrs: attrs, fieldParent: cut(el.parentNode && el.parentNode.className), fieldProxy: proxy, fieldLinked: linked, fieldScreen: scope.id === 'struct-drawer' ? 'struct-form' : 'dictionary' };
}
function onFieldAttrsFocusIn(e){
  if(!debugRecordingActive) return;
  const snap = fieldAttrsSnapshot(e.target);
  if(!snap) return;
  pushDebugEvent(Object.assign({ t: Math.round(performance.now() - debugRecordingStartedAt), type: 'field-attrs' }, snap));
}

// Rev 2.32.31 (A) — перепис текстових полів поточного екрана для діагностики панелі iOS «Автозаповнити контакт»: для кожного поля id, type, name, autocomplete, inputmode, placeholder, aria-label і текст підпису (СТАТИЧНІ тексти інтерфейсу; значень, які ввів користувач, немає). Рядок: «id|type|name|autocomplete|inputmode|ph=…|aria=…|lbl=…|vis».
const FIELD_CENSUS_SKIP_TYPES = ['checkbox', 'radio', 'hidden', 'date', 'file', 'range', 'submit', 'button', 'color', 'time', 'month'];
function fieldCensusLine(attrs){
  const a = attrs || {};
  const cut = function(v){ return String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, 40); };
  return [cut(a.id) || '—', a.type || 'text', cut(a.name), cut(a.autocomplete), cut(a.inputmode), 'ph=' + cut(a.placeholder), 'aria=' + cut(a.aria), 'lbl=' + cut(a.label), a.visible ? 'vis' : 'hid'].join('|');
}
function fieldsCensusNow(){
  const out = [];
  document.querySelectorAll('input, textarea').forEach(function(el){
    const type = (el.getAttribute('type') || 'text').toLowerCase();
    if(el.tagName === 'INPUT' && FIELD_CENSUS_SKIP_TYPES.indexOf(type) !== -1) return;
    let label = '';
    try{
      if(el.labels && el.labels[0]) label = el.labels[0].textContent;
      else{ const f = el.closest('.field'); const l = f && f.querySelector('label, .fld-label-like'); label = l ? l.textContent : ''; }
    }catch(e){}
    const visible = !!(el.offsetParent !== null || (el.closest && el.closest('.drawer.open, .app-modal.open')));
    out.push(fieldCensusLine({ id: el.id, type: type, name: el.getAttribute('name'), autocomplete: el.getAttribute('autocomplete'), inputmode: el.getAttribute('inputmode'), placeholder: el.getAttribute('placeholder'), aria: el.getAttribute('aria-label'), label: label, visible: visible }));
  });
  return out;
}
function recordFieldsCensus(){
  const lines = fieldsCensusNow();
  if(debugRecordingActive) pushDebugEvent({ t: Math.round(performance.now() - debugRecordingStartedAt), type: 'fields-census', fieldsCount: lines.length, fields: lines.slice(0, 80), formsCount: document.querySelectorAll('form').length, hasLoginFields: !!document.querySelector('input[type="email"], input[type="password"]'), autofillGuard: autofillGuardVariant() }); // Rev 2.32.47 (AG)
  return lines;
}
function recordFieldsCensusFromTesting(){
  if(!debugRecordingActive){ showToast({ kind: 'warning', title: 'Спершу почніть запис діагностики', actionLabel: 'Почати запис', onAction: function(){ startDebugRecording('Перепис полів'); recordFieldsCensusFromTesting(); } }); return; } // Rev 2.32.46 (TO): попередження з дією «Почати запис» (старе червоне повідомлення прибрано)
  const n = recordFieldsCensus().length;
  showTextToast('Перепис полів записано: ' + n, 'success');
}
function runInputAttrsAudit(){
  const offenders = {}; let total = 0, bad = 0;
  document.querySelectorAll('input, textarea').forEach(function(el){
    const t = (el.getAttribute('type') || 'text').toLowerCase();
    if(el.tagName === 'INPUT' && ['checkbox', 'radio', 'hidden', 'date', 'file', 'range', 'submit', 'button', 'color', 'time', 'month'].indexOf(t) !== -1) return;
    total++;
    // динамічні id (edtfielda1-<uuid>) → лише префікс до першого дефісу з даними не перевіряємо цілком: uuid містить hex-символи, але не слова
    const id = el.id || '', nm = el.getAttribute('name') || '';
    const hit = forbiddenInputAttr(id) || forbiddenInputAttr(nm);
    if(hit){ bad++; offenders[(id || nm).slice(0, 40)] = hit; }
  });
  return { inputsTotal: total, inputsBad: bad, badIds: Object.keys(offenders).slice(0, 20) };
}
function recordInputAttrsAudit(){
  if(!debugRecordingActive) return;
  try{ pushDebugEvent(Object.assign({ t: Math.round(performance.now() - debugRecordingStartedAt), type: 'input-attrs-audit' }, runInputAttrsAudit())); }catch(e){}
}
// --- Сегменти однакової ширини: ковзний індикатор (лише transform; ширина/висота ставляться без анімації) ---
const SEGMENT_SELECTOR = '.struct-tabs, .theme-toggle, .n-days';
// Rev 2.32.13 — чиста геометрія індикатора: buttons = [{ left, top, width, height }] (offsetLeft/Top/Width/Height), selectedIndex → { x, y, w, h } або null (немає вибраного сегмента чи він ще не виміряний — ширина 0, напр. рядок щойно з'явився).
function segmentIndicatorBox(buttons, selectedIndex){
  const b = buttons && buttons[selectedIndex];
  if(!b || !(b.width > 0) || !(b.height > 0)) return null;
  return { x: b.left, y: b.top, w: b.width, h: b.height };
}
function layoutSegment(c, instant){
  const ind = c.querySelector(':scope > .seg-indicator');
  if(!ind) return;
  const btns = Array.prototype.slice.call(c.querySelectorAll(':scope > button'));
  const btn = c.querySelector(':scope > button.active');
  const box = c.offsetWidth ? segmentIndicatorBox(btns.map(function(b){ return { left: b.offsetLeft, top: b.offsetTop, width: b.offsetWidth, height: b.offsetHeight }; }), btns.indexOf(btn)) : null;
  if(!box){ ind.classList.remove('on'); return; }
  ind.style.width = box.w + 'px';
  ind.style.height = box.h + 'px';
  const first = !ind.classList.contains('on');
  if(instant || first) ind.classList.add('no-anim');
  ind.style.setProperty('--seg-x', box.x + 'px');
  ind.style.setProperty('--seg-y', box.y + 'px');
  ind.classList.add('on');
  if(instant || first){ void ind.offsetWidth; ind.classList.remove('no-anim'); }
}
function initSegments(){
  document.querySelectorAll(SEGMENT_SELECTOR).forEach(function(c){
    if(c.querySelector(':scope > .seg-indicator')) return;
    const ind = document.createElement('span');
    ind.className = 'seg-indicator';
    ind.setAttribute('aria-hidden', 'true');
    c.insertBefore(ind, c.firstChild);
    // Клас .active міняється іншим кодом (switchAccountingTab, setThemeChoice...) → індикатор їде; показ/поворот/зміна розміру → миттєве перевимірювання.
    // Реагуємо лише на зміну класу КНОПОК сегмента (не самого індикатора: його класи on/no-anim міняє layoutSegment → інакше цикл).
    new MutationObserver(function(records){
      if(records.some(function(r){ return r.target !== ind; })) layoutSegment(c, false);
    }).observe(c, { attributes: true, attributeFilter: ['class'], subtree: true });
    if(typeof ResizeObserver === 'function') new ResizeObserver(function(){ layoutSegment(c, true); }).observe(c);
    layoutSegment(c, true);
  });
}
const TAB_META = {
  analytics: { title:'Аналітика', subtitle: m => `Ваш фінансовий стан на ${m}`, showMonthPill:true },
  accounting: { title:'Облік', subtitle: m => `Дохід, борги та ОЧ за ${m}`, showMonthPill:true },
  vytraty: { title:'Витрати', subtitle: () => 'Додавання витрат і журнал усіх записів', showMonthPill:false },
  structure: { title:'Структура', subtitle: () => 'Категорії, підкатегорії, автопідбір', showMonthPill:false }, // Rev 2.32.48 (S1): коротший підзаголовок — в один рядок
  service: { title:'Сервіс', subtitle: () => 'Резервні копії, імпорт та експорт Excel', showMonthPill:false },
};
// Rev 2.32.162 (DESK-NAV): згортання бічної панелі. Збережений вибір (localStorage 'mt-side-collapsed': '1'/'0') важить більше за ширину; без нього панель вузька, коли вікно < 1100 px (і слідує за зміною ширини). Стан лише клас html.side-collapsed + aria на кнопці; навігацію (switchTab) не чіпає.
const SIDE_COLLAPSE_KEY = 'mt-side-collapsed';
const SIDE_NARROW_PX = 1100;
function sideCollapseResolve(stored, width){
  if(stored === '1') return true;
  if(stored === '0') return false;
  return Number(width) < SIDE_NARROW_PX;
}
function sideCollapseStored(){ try{ return localStorage.getItem(SIDE_COLLAPSE_KEY); }catch(e){ return null; } }
function applySideCollapsed(collapsed){
  document.documentElement.classList.toggle('side-collapsed', !!collapsed);
  const btn = document.getElementById('side-collapse-btn');
  if(btn){
    btn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    const t = collapsed ? 'Розгорнути панель' : 'Згорнути панель';
    btn.setAttribute('aria-label', t); btn.setAttribute('title', t);
  }
}
function toggleSideNav(){
  const next = !document.documentElement.classList.contains('side-collapsed');
  try{ localStorage.setItem(SIDE_COLLAPSE_KEY, next ? '1' : '0'); }catch(e){}
  applySideCollapsed(next);
}
function initSideNav(){
  applySideCollapsed(sideCollapseResolve(sideCollapseStored(), window.innerWidth));
  const btn = document.getElementById('side-collapse-btn');
  if(btn) btn.addEventListener('click', toggleSideNav);
  window.addEventListener('resize', function(){ if(sideCollapseStored() === null) applySideCollapsed(sideCollapseResolve(null, window.innerWidth)); });
}

function updatePageHeader(tab){
  const meta = TAB_META[tab];
  if(!meta) return;
  const titleEl = document.getElementById('page-title');
  const subtitleEl = document.getElementById('page-subtitle');
  const monthPillEl = document.querySelector('.month-pill');
  if(titleEl) titleEl.textContent = meta.title;
  if(subtitleEl) subtitleEl.textContent = meta.subtitle(selectedMonth ? monthLabel(selectedMonth) : '');
  if(monthPillEl) monthPillEl.classList.toggle('hidden', !meta.showMonthPill);
  closeMonthMenu(); paintMonthSwitcher(); // Rev 2.32.356 (DS-3e)
}
// Rev 2.32.43 (SC): чиста функція — чи скидати прокрутку у верх при переході на «+Витрата». Тригери: тап по вкладці з іншої ('tab'), повторний тап по активній ('repeat'), перехід зі сповіщення/Журналу ('push'); інші вкладки — ні.
function shouldScrollExpenseTop(trigger, state){
  if(!state || state.tab !== 'vytraty') return false;
  return trigger === 'tab' || trigger === 'repeat' || trigger === 'push';
}
// Rev 2.32.355 (DS-3b): чи програвати анімацію іконки вибраної вкладки таббару. Лише при реальній зміні вкладки після першого жесту користувача (не старт, не відновлення, не повторний дотик), видима сторінка, без клавіатури, шторки, автофокусу (клавіатура зараз відкриється) і reduced-motion. Чиста функція: ctx = { switching, enabled, visible, kbOpen, drawerOpen, autofocus, reduced }.
// Rev 2.32.360 (DS-3b3): причина, чому анімацію не запущено ('' — можна): same-tab | start (до першого жесту) | hidden | kb | drawer | autofocus | reduced. Порядок = пріоритет. 'ipad' (таббар сховано бічною панеллю) визначає playTabIconAnim.
function tabAnimBlockReason(ctx){
  const c = ctx || {};
  if(!c.switching) return 'same-tab';
  if(!c.enabled) return 'start';
  if(!c.visible) return 'hidden';
  if(c.kbOpen) return 'kb';
  if(c.drawerOpen) return 'drawer';
  if(c.autofocus) return 'autofocus';
  if(c.reduced) return 'reduced';
  return '';
}
function shouldAnimateTabIcon(ctx){
  return tabAnimBlockReason(ctx) === '';
}
// Rev 2.32.360 (DS-3b3): запис у самописець (тип 'tab-anim') на КОЖНЕ натискання вкладки: звідки-куди (from/to), як (via: touch | swipe | click | click-after-touch | other), чи запущено (started) і чому ні (why), чи анімація справді йшла (ran), дограла (finished) чи обірвана (cutAfterMs, cutBy), запізнення старту (lagMs), плавність (frames, maxGapMs). Без даних користувача: лише назви вкладок і числа.
let tabPressVia = 'other', lastTabTouchEndAt = 0;
function recTabAnim(ev){
  try{ if(typeof pushDebugEvent === 'function') pushDebugEvent(Object.assign({ type: 'tab-anim' }, ev)); }catch(e){}
}
let tabAnimTrace = null;
function endTabAnimTrace(cutBy){
  const tr = tabAnimTrace; if(!tr || tr.done) return;
  tr.done = true; tabAnimTrace = null;
  const now = performance.now();
  const ev = { from: tr.from, to: tr.to, via: tr.via, started: true, ran: tr.ran, finished: !cutBy, anims: tr.names, lagMs: tr.lag, frames: tr.frames, maxGapMs: Math.round(tr.maxGap) };
  if(cutBy){ ev.cutAfterMs = Math.round(now - tr.t0); ev.cutBy = cutBy; } else { ev.ms = Math.round(now - tr.t0); }
  recTabAnim(ev);
}
function traceTabAnimStart(from, to, via){
  endTabAnimTrace('next-tab');
  const t0 = performance.now();
  const tr = { from: from, to: to, via: via, t0: t0, last: t0, frames: 0, maxGap: 0, ran: false, names: '', lag: null, done: false };
  tabAnimTrace = tr;
  (function tick(now){
    if(tabAnimTrace !== tr) return;
    tr.frames++; tr.maxGap = Math.max(tr.maxGap, now - tr.last); tr.last = now;
    if(now - t0 < 1000) requestAnimationFrame(tick); else endTabAnimTrace('timeout');
  })(t0);
  requestAnimationFrame(function(){ requestAnimationFrame(function(){
    if(tabAnimTrace !== tr) return;
    const btn = document.querySelector('nav.tabbar button[data-tab="' + to + '"]');
    const list = btn && btn.getAnimations ? btn.getAnimations({ subtree: true }).filter(function(a){ return /^tb/.test(a.animationName || ''); }) : [];
    tr.ran = list.length > 0;
    tr.names = Array.from(new Set(list.map(function(a){ return a.animationName; }))).join('+');
    const st = list.map(function(a){ return a.startTime; }).filter(function(x){ return typeof x === 'number'; });
    if(st.length) tr.lag = Math.round(Math.min.apply(null, st) - t0);
    if(!list.length){ endTabAnimTrace('no-anim'); return; }
    Promise.all(list.map(function(a){ return a.finished; })).then(function(){ if(tabAnimTrace === tr) endTabAnimTrace(''); }, function(){
      if(tabAnimTrace !== tr) return;
      endTabAnimTrace(document.body.classList.contains('kb-open') ? 'kb-open' : (getComputedStyle(document.querySelector('nav.tabbar')).display === 'none' ? 'hidden' : 'external'));
    });
  }); });
}
// Rev 2.32.366 (DS-3b6): вихід з «Витрат» — «+» коротко стискається (1 → .9 → 1) у темпі повороту й кільця (змінні --tb-plus-out, --tb-plus-sq на nav.tabbar). Клас .tb-out знімаємо за таймером; повторний вихід перезапускає.
let plusExitTimer = null;
// Rev 2.32.369 (DS-3c3): toTab — вкладка, куди переходимо: «Структура»/«Сервіс» → поворот за годинниковою (.tb-out-cw, 90° → 180°), інакше проти (90° → 0°); наприкінці 180° скидається на 0° без переходу (+ симетричний).
function plusExitClockwise(toTab){ return toTab === 'structure' || toTab === 'service'; }
function playPlusExitAnim(toTab){
  const bar = document.querySelector('nav.tabbar'); const btn = bar && bar.querySelector('button.tab-vytraty'); if(!btn || motionReduced()) return;
  const raw = getComputedStyle(bar).getPropertyValue('--tb-plus-out').trim(); let ms = parseFloat(raw); if(!isFinite(ms)) ms = 680; if(/[^m]s$/.test(raw)) ms *= 1000;
  btn.classList.remove('tb-reset'); btn.classList.toggle('tb-out-cw', plusExitClockwise(toTab));
  btn.classList.remove('tb-out'); void btn.getBoundingClientRect(); btn.classList.add('tb-out');
  if(plusExitTimer) clearTimeout(plusExitTimer);
  plusExitTimer = setTimeout(function(){
    plusExitTimer = null; btn.classList.remove('tb-out');
    if(btn.classList.contains('tb-out-cw')){
      if(!btn.classList.contains('active')){ btn.classList.add('tb-reset'); btn.classList.remove('tb-out-cw'); void btn.getBoundingClientRect(); btn.classList.remove('tb-reset'); } // 180° → 0° без переходу
      else btn.classList.remove('tb-out-cw'); // повернулись на «Витрати» до кінця: рух до 90° уже йде з поточного кута
    }
  }, ms + 60);
}
let tabIconAnimTimer = null;
// Rev 2.32.357 (DS-3b2): викликається ЛИШЕ при реальній зміні вкладки (switching). Раніше виклик ішов і при повторному performSwitchTab на ту саму вкладку (iOS: touchend не скасовується → слідом click → другий switchTab) із on=false, і той «порожній» виклик знімав .tb-anim щойно запущеної анімації — іконка «просто перемикалась». Тепер: on=true — анімація (із примусовим перезапуском, якщо клас уже стоїть, напр. A→B→A→B швидко); on=false — лише знімаємо анімацію попередньої вкладки (клавіатура, шторка, reduced-motion).
function playTabIconAnim(tab, on){
  const bar = document.querySelector('nav.tabbar');
  if(!bar) return false;
  if(!on) endTabAnimTrace('switch-blocked'); // Rev 2.32.360 (DS-3b3): попередню анімацію обриває перемикання без анімації (клавіатура, шторка...)
  bar.querySelectorAll('button.tb-anim').forEach(function(b){ if(!(on && b.getAttribute('data-tab') === tab)) b.classList.remove('tb-anim'); });
  if(tabIconAnimTimer){ clearTimeout(tabIconAnimTimer); tabIconAnimTimer = null; }
  if(!on || getComputedStyle(bar).display === 'none') return false; // на iPad/десктопі з бічною панеллю таббар сховано — анімацій немає
  const btn = bar.querySelector('button[data-tab="' + tab + '"]');
  if(!btn) return false;
  if(btn.classList.contains('tb-anim')){ btn.classList.remove('tb-anim'); void btn.getBoundingClientRect(); } // перезапуск: клас знімаємо, перераховуємо стилі, додаємо
  btn.classList.add('tb-anim');
  tabIconAnimTimer = setTimeout(function(){ endTabAnimTrace('timer'); btn.classList.remove('tb-anim'); tabIconAnimTimer = null; }, 800); // найдовша анімація 650 мс (структура із затримками) + запас
  return true;
}
function performSwitchTab(tab, opts){
  // Rev 2.24.0 (M1) — попередня вкладка (для переходу й збереження прокрутки); незавершений перехід дозавершуємо одразу.
  // ВАЖЛИВО: прокрутку й позицію вихідної вкладки знімаємо ДО будь-яких змін DOM: шапка (.top з month-pill) лежить у тому самому #main-col,
  // і зміна її висоти (updatePageHeader) через scroll anchoring зсуває scrollTop (Аналітика→Сервіс: 500 → 448).
  const tSwitch0 = performance.now(); // Rev 2.29.0 (B)
  lastTabSwitchAt = tSwitch0; // Rev 2.29.1: для діагностики стрілок (msSinceTab): час від початку перемикання до першого кадру → firstFrameMs
  const prevTab = lastActiveTab;
  finishTabTransition();
  const mainColForTab = document.getElementById('main-col');
  const fromScroll = mainColForTab ? mainColForTab.scrollTop : 0;
  const switching = !!prevTab && prevTab !== tab;
  const willAutofocus = tab === 'vytraty' && !(opts && opts.noFocus); // Rev 2.30.1: той самий критерій, що й автофокус нижче в цій функції
  const skipForAutofocus = shouldSkipTabTransition(tab, willAutofocus);
  const animateSwitch = switching && tabAnimEnabled && document.visibilityState === 'visible' && !skipForAutofocus
    && !document.body.classList.contains('kb-open') && !document.querySelector('.drawer.open');
  let fromContentTop = 0;
  if(animateSwitch && mainColForTab){
    const fe = document.getElementById('view-' + prevTab);
    if(fe) fromContentTop = fe.getBoundingClientRect().top - mainColForTab.getBoundingClientRect().top + fromScroll;
  }
  // Rev 2.21.0 — Журнал (#journal-overlay) більше не fixed-оверлей поверх
  // усього застосунку, а другий стан вкладки "Витрати" — тому перемикання
  // вкладки (навіть повторний клік на "Витрати") явно закриває Журнал, щоб
  // користувач завжди повертався на форму внесення нової витрати (типовий
  // стан вкладки), а не "застрягав" на Журналі під іншою вкладкою.
  if(editingRecordKey) closeActiveEdit('tab-switch-forced', activeEditDirty(), { noRender: true }); // Rev 2.32.2 (E1): програмне перемикання (маршрути) — запасне закриття; тап по таббару проходить через switchTab → requestCloseEdit
  if(isJournalOpen) closeJournal();
  if(isTrashOpen) closeTrashScreen(); // Rev 2.23.23 (6D.192): екран "Видалені дані" — підекран Сервісу
  if(isMonoInboxOpen) closeMonoInbox(); // Rev 2.32.28 (MB-4)
  if(isPaymentsOpen) closePaymentsScreen(); // Rev 2.32.68 (P4)
  if(isMonoOpen) closeMonoScreen(); // Rev 2.32.27 (MB-3): екран «Monobank» — підекран Сервісу
  if(isNotifArchiveOpen) closeNotifArchive(); // Rev 2.32.158 (TABBAR-CLOSE): журнал сповіщень — накладка поверх будь-якої вкладки; тап по вкладці таб-бару/бокової панелі (і повторний по активній) спершу закриває його (раніше лишався під новою вкладкою, закривався лише стрілкою чи свайпом). Незбережені зміни/редагування: наявна логіка guardEditOpener('switchTab') з діалогом «Скасувати редагування запису?» виконується ДО цього рядка; анімацію закриття, свайп і стрілку не чіпали.
  // Rev #21+#23 (bugfix) — data-status popover (крапка "станом на" на
  // KPI "Борг"/"Скорочення боргу") лишався відкритим і після переходу на
  // іншу вкладку, бо закривався лише по кліку поза його межами/Escape —
  // перемикання вкладки таким кліком не вважається. Закриваємо явно.
  closeAllDataStatusPopovers();
  // Rev 2.3.2 — якщо є незбережена чернетка (напр. з датою "позавчора",
  // свідомо обраною користувачем перед тим, як він відволікся), скидання на
  // "сьогодні" при поверненні на вкладку стерло б саме ту дату, яку людина
  // навмисно виставила — тому скидаємо лише за відсутності чернетки.
  if(tab === 'vytraty' && lastActiveTab !== 'vytraty' && !hasExpenseDraft()){
    resetVytratyDateToToday();
  }
  // Rev #30 — Cloud Auth SDK підвантажується лише при реальному відкритті
  // "Сервісу" (той самий "лінивий" принцип, що idb вище), і лише один раз
  // за сесію (initCloudAuthUI сама підписується на onAuthStateChange), а не
  // при кожному перемиканні на цю вкладку.
  if(tab === 'service' && lastActiveTab !== 'service'){
    initCloudAuthUI();
  }
  lastActiveTab = tab;
  updatePageHeader(tab);
  // Rev 2.24.0 (M1) — прокрутка вихідної вкладки запам'ятовується; перехід анімується лише для реальної зміни вкладки після першого жесту.
  if(switching) tabScrollPositions[prevTab] = fromScroll;
  if(switching && prevTab === 'structure' && typeof structDictLeave === 'function') structDictLeave(fromScroll); // Rev 2.32.56 (W): вихід зі «Структури» зі «Словника» — чистий стан і прокрутка 0
  const tabCtx = animateSwitch ? beginTabTransition(prevTab, tab, fromContentTop) : null;
  ['analytics','accounting','vytraty','structure','service'].forEach(t=>{
    if(tabCtx && t === prevTab) return; // вихідна лишається видимою до кінця переходу (finishTabTransition її ховає)
    document.getElementById('view-'+t).classList.toggle('hidden', t!==tab);
  });
  document.querySelectorAll('.tabbar button').forEach(b=>b.classList.toggle('active', b.dataset.tab===tab));
  tabbarMiniExpand('tab'); // Rev 2.32.364 (DS-3c): зміна вкладки розгортає таббар (прокрутку скинуто)
  requestAnimationFrame(runMainScroll); // Rev 2.32.365 (DS-3f): капсула/кнопка «вгору» за новою вкладкою
  if(switching && prevTab === 'vytraty' && tab !== 'vytraty' && tabAnimEnabled) playPlusExitAnim(tab); // Rev 2.32.366 (DS-3b6)
  { // Rev 2.32.355 (DS-3b); Rev 2.32.357 (DS-3b2): лише при зміні вкладки; Rev 2.32.360 (DS-3b3): причина й запис у самописець
    const via = tabPressVia; tabPressVia = 'other';
    let why = tabAnimBlockReason({ switching: switching, enabled: tabAnimEnabled, visible: document.visibilityState === 'visible', kbOpen: document.body.classList.contains('kb-open'), drawerOpen: !!document.querySelector('.drawer.open'), autofocus: willAutofocus, reduced: motionReduced() });
    if(switching){
      const started = playTabIconAnim(tab, why === '');
      if(started) traceTabAnimStart(prevTab, tab, via);
      else { if(why === '') why = 'ipad'; recTabAnim({ from: prevTab, to: tab, via: via, started: false, why: why }); }
    } else recTabAnim({ from: prevTab, to: tab, via: via, started: false, why: why });
  }
  document.querySelectorAll('.side-tab[data-tab]').forEach(b=>{ const on = b.dataset.tab===tab; b.classList.toggle('active', on); if(on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); }); // Rev 2.32.162 (DESK-NAV): aria-current для активного пункту панелі
  updateTabBubble();
  // BugFix Rev 2.0.8, переписано в Rev 2.7.0: вкладки — це просто
  // display:none/block перемикання div-ів всередині ОДНОГО спільного
  // контейнера прокрутки (.main-col, Rev 2.7.0) — тому прокрутка
  // "переносилась" з попередньої вкладки на нову. Скидаємо скрол на верх при
  // кожному перемиканні, щоб кожна вкладка завжди відкривалась зі свого
  // початку. Раніше це робилось через window.scrollTo(0,0) (скролився сам
  // документ); тепер скролиться лише .main-col, тому й скидати треба саме
  // його scrollTop, а не позицію вікна.
  killMainColMomentumScroll();
  const mainColEl = document.getElementById('main-col');
  // Rev 2.24.0 (M1) — повернення на вкладку відновлює її збережену прокрутку (раніше завжди 0); повторний тап по активній вкладці, як і раніше, — на початок.
  // Rev 2.32.43 (SC): «+Витрата» ЗАВЖДИ відкривається з верху форми (раніше повернення на вкладку відновлювало збережену прокрутку M1 — форма лишалась біля кнопки журналу, хоча фокус переходив у «Назву»). Скидання — до передачі фокуса нижче; збережену позицію вкладки теж обнуляємо.
  const expenseTopTrigger = tab === 'vytraty' ? (opts && opts.noFocus ? 'push' : (switching ? 'tab' : 'repeat')) : null;
  const scrollTopForExpense = expenseTopTrigger && shouldScrollExpenseTop(expenseTopTrigger, { tab: tab });
  if(scrollTopForExpense){
    if(debugRecordingActive) pushDebugEvent({ t: Math.round(performance.now() - debugRecordingStartedAt), type: 'expense-scroll-top', from: Math.round(switching ? (tabScrollPositions[tab] || 0) : fromScroll), reason: expenseTopTrigger });
    tabScrollPositions[tab] = 0;
  }
  if(mainColEl) mainColEl.scrollTop = scrollTopForExpense ? 0 : (switching ? (tabScrollPositions[tab] || 0) : 0);
  if(tabCtx) playTabTransition(tabCtx, prevTab, tab, fromScroll, tSwitch0);
  if(switching && tab === 'analytics') onDashboardVisit(); // Rev 2.25.0 (M2)
  if(switching && tab === 'accounting') onAccountVisit(); // Rev 2.29.0 (A)
  // Rev 2.3.4 — автофокус на "Назва витрати" при вході на вкладку "Витрати":
  // єдина щоденна дія має починатись з можливості одразу друкувати, без
  // зайвого тапу по полю. Виклик СИНХРОННИЙ (без setTimeout) — на iOS Safari
  // клавіатура відкривається програмним focus() лише в межах того самого
  // "жесту користувача" (клік по вкладці); асинхронний виклик цей контекст
  // втрачає, і клавіатура просто не з'явиться. preventScroll:true — щоб
  // власний scrollTo(0,0) вище не конфліктував із авто-скролом браузера
  // "підняти поле над клавіатурою".
  // Rev 2.23.29 (6D.198) — opts.noFocus: перехід зі сповіщення (daily-expense-reminder) НЕ фокусує поле "Назва" —
  // інакше клавіатура виїжджала сама. Звичайний тап по таббару поводиться як раніше.
  if(tab === 'vytraty' && !(opts && opts.noFocus)){
    const nameInput = document.getElementById('expfielda7');
    const amountInput = document.getElementById('f-amount');
    // Якщо назва вже заповнена (відновлена чернетка з попереднього разу —
    // Rev 2.3.2) — фокус одразу на суму, бо назва вводити вже не треба.
    const target = (nameInput && nameInput.value.trim() && amountInput) ? amountInput : nameInput;
    if(target){
      try{ target.focus({preventScroll:true}); }catch(e){ target.focus(); }
    }
    // Rev 2.30.1 — діагностика: перехід навмисно пропущено (без .tab-transitioning/inline opacity/pointer-events:none) і стан стрілок через 450 мс після автофокусу.
    if(switching && skipForAutofocus && tabAnimEnabled) recordMotionPerf({ kind: 'tab-switch', from: prevTab, to: tab, skipped: 'autofocus', frames: 0, maxGapMs: 0, durationMs: 0, reduced: motionReduced() });
    if(debugRecordingActive && target) setTimeout(function(){ if(debugRecordingActive) recordExpenseArrowsState(target); }, 450);
  }
}

/* ============ "Liquid Glass" таббар: бульбашка + свайп (Rev 2.4.0) ============
   updateTabBubble() позиціонує плаваючу підсвітку під АКТИВНУ кнопку таббару,
   крім "Витрати" (та має власний окремий floating-стиль, поза системою
   бульбашки — див. коментар у CSS). Позиція рахується через
   getBoundingClientRect(), а не CSS-відсотками — так бульбашка завжди влучає
   точно під кнопку незалежно від фактичної ширини екрана й того, що кнопка
   "Витрати" має іншу ширину/висоту за решту. */
function updateTabBubble(skipAnimation){
  const bar = document.querySelector('nav.tabbar');
  const bubble = document.getElementById('tabbar-bubble');
  if(!bar || !bubble) return;
  const activeBtn = bar.querySelector('button.active:not(.tab-vytraty)');
  if(!activeBtn){
    // Активна вкладка — "Витрати" (або взагалі не таббар-вкладка, напр.
    // Налаштування): бульбашці нема під чим бути, ховаємо через opacity, а
    // не миттєве display:none — так наступна поява знову плавно виникає з
    // тієї самої точки, а не "телепортується".
    bubble.style.opacity = '0';
    return;
  }
  // Rev 2.4.9 BugFix — offsetLeft/offsetWidth замість getBoundingClientRect():
  // це ЛОКАЛЬНІ координати (в системі відліку offsetParent, тобто
  // .tabbar-glass), повністю незалежні від transform:scale на самому
  // .tabbar-glass. getBoundingClientRect() натомість повертає координати "як
  // намальовано на екрані" (вже З урахуванням масштабу капсули при
  // .pressed) — і оскільки бульбашка сама теж лежить УСЕРЕДИНІ того самого
  // масштабованого контейнера, застосування таких "вже помножених на
  // масштаб" чисел як її ЛОКАЛЬНИХ CSS-значень масштабувало б її вдруге.
  if(skipAnimation) bubble.classList.add('no-anim');
  bubble.style.width = activeBtn.offsetWidth + 'px';
  bubble.style.setProperty('--bubble-x', activeBtn.offsetLeft + 'px');
  bubble.style.opacity = '1';
  if(skipAnimation){
    // Форсуємо reflow, щоб браузер "побачив" стиль без transition ДО того,
    // як ми знову дозволимо анімацію — інакше перше позиціювання при
    // завантаженні сторінки саме теж плавно "приїжджало" б з кута (0,0).
    void bubble.offsetHeight;
    bubble.classList.remove('no-anim');
  }
}

function smoothScrollToTop(duration, onDone, onProgress){
  duration = duration || 380;
  const mainColEl = document.getElementById('main-col');
  if(!mainColEl){ if(onDone) onDone(); return; }
  const startY = mainColEl.scrollTop || 0;
  if(startY <= 0){ if(onDone) onDone(); return; }
  killMainColMomentumScroll();
  const startTime = performance.now();
  function easeOutCubic(t){ return 1 - Math.pow(1-t, 3); }
  function step(now){
    const elapsed = now - startTime;
    const t = Math.min(1, elapsed / duration);
    mainColEl.scrollTop = Math.round(startY * (1 - easeOutCubic(t)));
    if(onProgress) onProgress(t);
    if(t < 1) requestAnimationFrame(step);
    else if(onDone) onDone();
  }
  requestAnimationFrame(step);
}
// Rev 2.21.7 — показує/ховає #scroll-top-btn залежно від scrollTop
// #main-col (той самий спільний контейнер прокрутки для всіх вкладок,
// Rev 2.7.0). Поріг 240px — щоб кнопка не блимала одразу при щонайменшому
// скролі, лише коли реально є куди "повертатись".
const SCROLL_TOP_BTN_THRESHOLD = 240;
// ===== Rev 2.32.364 (DS-3c): спільний слухач прокрутки #main-col і стиснення таббару =====
// Один passive-слухач (через rAF) обслуговує капсулу «вгору» (updateScrollTopBtn), стиснення таббару й підписників (DS-3f підключається через subscribeMainScroll). Пружний відскок iOS (scrollTop < 0 або > max) приводиться до межі.
// Пороги з макета analytics-ds (onScroll): стиснути — крок вниз > 6 і від верху > 24; розгорнути — крок вгору > 6, < 24 від верху, < 24 до кінця.
const TABBAR_MINI_STEP = 6;
const TABBAR_MINI_EDGE = 24;
// Чиста функція: s = { y, max, lastY, mini, blocked, user } → { mini, lastY, why } (why — причина зміни стану або '').
// Rev 2.32.368 (DS-3c2): user — прокрутку почав користувач (дотик із рухом, колесо, клавіші). Програмна прокрутка (відновлення позиції вкладки, «вгору», scrollTo) стискати не може: точка відліку лише переставляється на нову позицію (lastY = y), розгортання біля верху/кінця лишається.
function tabbarMiniNext(s){
  const y = s.y, max = s.max;
  if(s.blocked) return { mini: false, lastY: y, why: s.mini ? s.blocked : '' };
  if(max <= TABBAR_MINI_EDGE * 2) return { mini: false, lastY: y, why: s.mini ? 'short' : '' };
  if(s.user === false){
    const ex = s.mini && (y < TABBAR_MINI_EDGE || y > max - TABBAR_MINI_EDGE);
    return { mini: ex ? false : s.mini, lastY: y, why: ex ? (y < TABBAR_MINI_EDGE ? 'top' : 'end') : '' };
  }
  const d = y - s.lastY; let mini = s.mini, why = '';
  if(y < TABBAR_MINI_EDGE){ mini = false; why = 'top'; }
  else if(y > max - TABBAR_MINI_EDGE){ mini = false; why = 'end'; }
  else if(d > TABBAR_MINI_STEP){ mini = true; why = 'down'; }
  else if(d < -TABBAR_MINI_STEP){ mini = false; why = 'up'; }
  return { mini: mini, lastY: Math.abs(d) > TABBAR_MINI_STEP ? y : s.lastY, why: mini !== s.mini ? why : '' };
}
let tabbarMini = false, tabbarMiniLastY = 0;
// Rev 2.32.368 (DS-3c2): ознака прокрутки користувача. Дотик по #main-col із рухом > 4 px, колесо й клавіші прокрутки → «користувач» поки палець на екрані й ще MAIN_USER_SCROLL_MS після (інерція iOS). Зміна вкладки скидає ознаку.
const MAIN_USER_SCROLL_MS = 3000;
const MAIN_USER_MOVE_PX = 4;
let mainUserAt = 0, mainTouchMoved = false, mainTouchY0 = 0;
function mainUserScrolling(){ return mainTouchMoved || (mainUserAt > 0 && performance.now() - mainUserAt < MAIN_USER_SCROLL_MS); }
function mainUserReset(){ mainUserAt = 0; mainTouchMoved = false; }
function recTabMini(ev){ try{ if(typeof pushDebugEvent === 'function') pushDebugEvent(Object.assign({ type: 'tab-mini' }, ev)); }catch(e){} }
// Чому зараз не можна стискати: відкрита клавіатура / шторка / модалка / таббар сховано (iPad з бічною панеллю)
function tabbarMiniBlocked(){
  if(document.body.classList.contains('kb-open')) return 'kb';
  if(document.querySelector('.drawer.open, .app-modal.open')) return 'drawer';
  const bar = document.querySelector('nav.tabbar');
  if(!bar || getComputedStyle(bar).display === 'none') return 'ipad';
  return '';
}
function setTabbarMini(on, why, y, byUser){
  const bar = document.querySelector('nav.tabbar'); if(!bar) return;
  if(tabbarMini === on) return;
  tabbarMini = on; bar.classList.toggle('mini', on);
  recTabMini({ mini: on, why: why || '', scrollY: typeof y === 'number' ? Math.round(y) : null, byUser: !!byUser });
}
function tabbarMiniOnScroll(y, max){
  const user = mainUserScrolling();
  const r = tabbarMiniNext({ y: y, max: max, lastY: tabbarMiniLastY, mini: tabbarMini, blocked: tabbarMiniBlocked(), user: user });
  tabbarMiniLastY = r.lastY;
  if(r.mini !== tabbarMini) setTabbarMini(r.mini, r.why, y, user);
}
// Розгорнути без прокрутки: дотик до таббару, зміна вкладки, клавіатура, шторка, iPad (виклик із відповідних місць і MutationObserver нижче)
function tabbarMiniExpand(why){ tabbarMiniLastY = 0; if(why === 'tab') mainUserReset(); setTabbarMini(false, why, undefined, false); }
function tabbarMiniGuard(){ if(!tabbarMini) return; const b = tabbarMiniBlocked(); if(b) tabbarMiniExpand(b); }
const mainScrollSubs = [];
function subscribeMainScroll(fn){ if(typeof fn === 'function' && mainScrollSubs.indexOf(fn) === -1) mainScrollSubs.push(fn); }
let mainScrollRaf = 0;
function onMainColScroll(){
  if(mainScrollRaf) return;
  mainScrollRaf = requestAnimationFrame(function(){ mainScrollRaf = 0; runMainScroll(); });
}
function runMainScroll(){
  const el = document.getElementById('main-col'); if(!el) return;
  const max = Math.max(0, el.scrollHeight - el.clientHeight);
  const y = Math.min(Math.max(el.scrollTop, 0), max);
  updateScrollTopBtn();
  tabbarMiniOnScroll(y, max);
  mainScrollSubs.forEach(function(fn){ try{ fn({ y: y, max: max }); }catch(e){} });
}
function initTabbarMini(){
  const bar = document.querySelector('nav.tabbar'); if(!bar) return;
  bar.addEventListener('pointerdown', function(){ tabbarMiniExpand('touch'); }, { capture: true, passive: true });
  bar.addEventListener('touchstart', function(){ tabbarMiniExpand('touch'); }, { capture: true, passive: true }); // на випадок, коли pointerdown не надійшов (синтетичні/старі події)
  if(typeof MutationObserver !== 'undefined') new MutationObserver(tabbarMiniGuard).observe(document.body, { attributes: true, attributeFilter: ['class'], subtree: true });
  window.addEventListener('resize', tabbarMiniGuard);
  // Rev 2.32.368 (DS-3c2): ввід користувача, що робить прокрутку «користувацькою»
  const mc = document.getElementById('main-col');
  if(mc){
    const o = { capture: true, passive: true };
    mc.addEventListener('touchstart', function(e){ mainTouchMoved = false; mainTouchY0 = e.touches && e.touches[0] ? e.touches[0].clientY : 0; }, o);
    mc.addEventListener('touchmove', function(e){ const y = e.touches && e.touches[0] ? e.touches[0].clientY : mainTouchY0; if(Math.abs(y - mainTouchY0) > MAIN_USER_MOVE_PX){ mainTouchMoved = true; mainUserAt = performance.now(); } }, o);
    const end = function(){ if(mainTouchMoved) mainUserAt = performance.now(); mainTouchMoved = false; };
    mc.addEventListener('touchend', end, o); mc.addEventListener('touchcancel', end, o);
    mc.addEventListener('wheel', function(){ mainUserAt = performance.now(); }, o);
  }
  document.addEventListener('keydown', function(e){ if(/^(ArrowUp|ArrowDown|PageUp|PageDown|Home|End| )$/.test(e.key) && !/^(INPUT|TEXTAREA|SELECT)$/.test((e.target && e.target.tagName) || '')) mainUserAt = performance.now(); }, { capture: true, passive: true });
}
function updateScrollTopBtn(){
  const mainColEl = document.getElementById('main-col');
  const btn = document.getElementById('scroll-top-btn');
  if(!mainColEl || !btn) return;
  // Rev 2.32.365 (DS-3f): на «Аналітиці» кнопку «вгору» замінює капсула #mini-head (дві не показуємо); на інших вкладках без змін
  btn.classList.toggle('visible', mainColEl.scrollTop > SCROLL_TOP_BTN_THRESHOLD && lastActiveTab !== 'analytics');
}
// ===== Rev 2.32.365 (DS-3f): капсула «Аналітика · місяць · залишок» при прокрутці =====
// Показується лише на «Аналітиці», коли прокрутили понад MINI_HEAD_SHOW_Y, без клавіатури/шторки, на сторінці не коротшій за екран. Анімуються лише opacity і transform (CSS). Скло з одним розмиттям (як у таббара); MINI_HEAD_BLUR = false вмикає запасний варіант без розмиття (непрозорий --surface) — одним рядком, якщо на iPhone буде мерехтіння.
const MINI_HEAD_SHOW_Y = 150;
const MINI_HEAD_BLUR = true;
// Чиста функція: s = { tab, y, max, kb, drawer } → чи показувати капсулу
function miniHeadShouldShow(s){
  return !!s && s.tab === 'analytics' && s.y > MINI_HEAD_SHOW_Y && s.max > 48 && !s.kb && !s.drawer;
}
let lastDashSavings = null; // «Баланс» місяця — те саме значення, що renderDashboard показує в #kpi-savings (monthAggregates → savings); нових формул немає
let miniHeadLast = { y: 0, max: 0 };
function miniHeadPaint(){
  const m = document.getElementById('mini-head-month'), b = document.getElementById('mini-head-bal'); if(!m || !b) return;
  if(selectedMonth) m.textContent = monthShortName(selectedMonth, monthKey(localDateISO()));
  b.textContent = (typeof lastDashSavings === 'number' && isFinite(lastDashSavings)) ? fmt(lastDashSavings) : '—';
}
function miniHeadRefresh(){
  const el = document.getElementById('mini-head'); if(!el) return;
  const on = miniHeadShouldShow({ tab: lastActiveTab, y: miniHeadLast.y, max: miniHeadLast.max, kb: document.body.classList.contains('kb-open'), drawer: !!document.querySelector('.drawer.open, .app-modal.open') });
  if(el.classList.contains('on') !== on){ el.classList.toggle('on', on); el.setAttribute('aria-hidden', on ? 'false' : 'true'); el.tabIndex = on ? 0 : -1; }
}
function miniHeadOnScroll(s){ miniHeadLast = { y: s.y, max: s.max }; miniHeadRefresh(); }
function miniHeadClick(){
  const el = document.getElementById('main-col'); if(!el) return;
  if(motionReduced()){ el.scrollTop = 0; return; }
  smoothScrollToTop();
}
function initMiniHead(){
  const el = document.getElementById('mini-head'); if(!el) return;
  if(!MINI_HEAD_BLUR) el.classList.add('mh-noblur');
  subscribeMainScroll(miniHeadOnScroll);
  if(typeof MutationObserver !== 'undefined') new MutationObserver(miniHeadRefresh).observe(document.body, { attributes: true, attributeFilter: ['class'], subtree: true });
  miniHeadPaint();
}

// Rev #26.3 — за проханням: "ховається" — це зсув ВНИЗ (translateY), а не
// фейд (перша спроба Rev #26.2 керувала opacity — замінено). В останні
// SCROLL_TOP_BTN_HIDE_START_T..1 прогресу скролу (за замовчуванням — останні
// 40%) кнопка з'їжджає вниз на SCROLL_TOP_BTN_HIDE_DISTANCE px (easeInQuad —
// "сповзання" пришвидшується, а не рівномірне) — transform веде напряму
// inline style, а на сам момент старту цієї фази з transitionProperty
// прибирається transform (лишаються тільки background/border-color/
// box-shadow/color), щоб inline-значення з кожного кадру застосовувались
// миттєво, без "відставання" CSS-переходу .scrolling за швидкозмінним
// значенням. До моменту, коли скрол реально завершується, кнопка вже
// практично зсунулась з екрана — а не ще стоїть на місці.
const SCROLL_TOP_BTN_HIDE_START_T = 0.6;
const SCROLL_TOP_BTN_HIDE_DISTANCE = 40; // px — той самий зсув, що й у базовому прихованому стані
function scrollTopBtnClick(){
  const btn = document.getElementById('scroll-top-btn');
  let hidePhaseStarted = false;
  if(btn){ btn.classList.add('scrolling'); btn.style.transform = ''; btn.style.transitionProperty = ''; }
  smoothScrollToTop(
    380,
    function(){ if(btn){ btn.classList.remove('scrolling'); btn.style.transform = ''; btn.style.transitionProperty = ''; } },
    function(t){
      if(!btn || t < SCROLL_TOP_BTN_HIDE_START_T) return;
      if(!hidePhaseStarted){
        hidePhaseStarted = true;
        btn.style.transitionProperty = 'background, border-color, color'; // Rev 2.24.0 (M1): box-shadow більше не в transition
      }
      const p = (t - SCROLL_TOP_BTN_HIDE_START_T) / (1 - SCROLL_TOP_BTN_HIDE_START_T);
      const eased = p * p;
      btn.style.transform = `translateY(${(SCROLL_TOP_BTN_HIDE_DISTANCE * eased).toFixed(1)}px) scale(1)`;
    }
  );
}

/* ============ Доступність модальних шарів (Rev 2.10.2, P1 аудит) ============
   Раніше settings-drawer/app-modal у ЗАКРИТОМУ стані ховались лише візуально
   (transform:translateY(100%) / opacity:0) — сам DOM лишався в акседесібіліті-
   дереві й у Tab-послідовності: скрінрідер міг "побачити" вміст закритого
   діалогу, а Tab міг завести фокус у невидимий елемент. Атрибут `inert`
   (нативний, без бібліотек) виключає піддерево з фокусу/акседесібіліті-дерева
   повністю — знімаємо його лише на момент відкриття, повертаємо на закритті.
   lastFocusedBeforeDialog / focusFirstIn / restoreFocus — спільні для обох
   типів діалогів (drawer і app-modal): фокус переходить усередину при
   відкритті і повертається на елемент-тригер при закритті. */
let lastFocusedBeforeDialog = null;
function focusFirstIn(container){
  if(!container) return;
  const candidates = container.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
  for(const el of candidates){
    // offsetParent===null охоплює і display:none, і приховані predecessors —
    // так фокус природно потрапляє на першу РЕАЛЬНО видиму кнопку/поле
    // (напр. для showConfirmModal це кнопка "Так", бо всі текстові поля
    // цієї модалки приховані), а не на технічно перший, але невидимий елемент.
    if(el.offsetParent !== null && !el.disabled){
      // Rev 2.23.29 (6D.198) — програмний focus() на КНОПЦІ (чи посилання) на iOS давав видиме кільце :focus-visible
      // ("назад" зеленим після переходу зі сповіщення). Для кнопок фокус тепер іде на контейнер (tabindex=-1, без
      // контуру); для полів вводу поведінка не змінена (там фокус ініціює сам сценарій екрана).
      if(el.tagName === 'BUTTON' || el.tagName === 'A'){
        if(!container.hasAttribute('tabindex')) container.setAttribute('tabindex', '-1');
        try{ container.focus({preventScroll:true}); }catch(e){ container.focus(); }
        return;
      }
      if(typeof window.kbAutofocusOpen === 'function' && window.kbAutofocusOpen(container, el)) return; // Rev 2.32.294 (KB-39, A)
      try{ el.focus({preventScroll:true}); }catch(e){ el.focus(); }
      return;
    }
  }
}
function restoreFocus(){
  const el = lastFocusedBeforeDialog;
  lastFocusedBeforeDialog = null;
  // Rev 2.23.29 (6D.198) — повернення фокуса на кнопку-тригер теж давало кільце :focus-visible; кнопки не фокусуємо
  // (поля вводу — як раніше).
  if(el && (el.tagName === 'BUTTON' || el.tagName === 'A')) return;
  if(el && typeof el.focus === 'function' && document.contains(el)){
    try{ el.focus({preventScroll:true}); }catch(e){ el.focus(); }
  }
}
// Rev 2.23.7 (6D.176) — живий лог (name-field-check, 6D.174/175) ДОВІВ, що
// inert на #main-col справді блокує touch-scroll на цьому WebKit (scrollTop
// незмінно 0 на кожній scroll-події, поки inert активний) — "не
// спрацювало" з раніше відкоченого 6D.170 було хибним враженням,
// сплутаним із реальним багом 6D.172 (main-col-нащадки) в ТОМУ Ж коміті.
// Користувач запитав: "що робити з тим, що фон ЗА КАРТКОЮ можна
// проскролити?" — 6D.173-175 блокують фон лише ПОКИ АКТИВНА КЛАВІАТУРА на
// полі в шторці; відкрита шторка БЕЗ сфокусованого поля (напр. щойно
// відкрили, ще не торкались жодного поля) фон не блокувала. Повертаємо
// lockBackgroundScroll()/unlockBackgroundScroll() (той самий код, що
// 6D.170, лічильник openOverlayCount — не прапорець, щоб коректно
// складатись із 6D.173: відкрита шторка ДОДАЄ лок, фокус на полі всередині
// неї ДОДАЄ ще один — перший unlock() (втрата фокусу) не розблокує фон,
// поки шторка ще відкрита) — цього разу БЕЗПЕЧНО, бо джерела локу — ЛИШЕ
// (а) відкриття/закриття шторки (вона завжди ПОЗА #main-col) і (б) фокус
// на полі ВСЕРЕДИНІ шторки (isFieldInsideDrawer(), 6D.173) — та сама умова,
// що категорично виключає баг 6D.172 (ніколи не чіпає #main-col-нащадків,
// напр. "Витрати").
let openOverlayCount = 0;
function lockBackgroundScroll(){
  openOverlayCount++;
  const mainCol = document.getElementById('main-col');
  if(mainCol) mainCol.setAttribute('inert', '');
}
function unlockBackgroundScroll(){
  openOverlayCount = Math.max(0, openOverlayCount - 1);
  if(openOverlayCount === 0){
    const mainCol = document.getElementById('main-col');
    if(mainCol) mainCol.removeAttribute('inert');
  }
}
// Rev 2.23.21 (6D.190) — isIosRuntime/IS_IOS_RUNTIME ГЛОБАЛЬНІ (потрібні й
// поза IIFE initApp). Лише iOS: navigator.standalone — API, що існує
// ВИКЛЮЧНО в iOS Safari/WKWebView; регулярка — fallback для iPadOS "режиму
// робочого столу".
function isIosRuntime(ua, hasNavigatorStandalone){
  return !!hasNavigatorStandalone || /iPad|iPhone|iPod/.test(ua || '');
}
const IS_IOS_RUNTIME = isIosRuntime(navigator.userAgent, typeof navigator.standalone !== 'undefined');
// Rev 2.23.21 (6D.190) — фінальне прибирання клавіатурних варіантів: лишено
// ЄДИНУ поведінку (режим A, перший фокус H2, стрілки P, курсор hide) —
// застарілі діагностичні ключі localStorage (перемикачі варіантів 6D.178-
// 6D.189) видаляються при старті (removeItem — НЕ читання; idempotent).
const LEGACY_KEYBOARD_LS_KEYS = ['budget_kb_mode_v1', 'budget_kb_focus_mode_v1', 'budget_kb_arrows_v1', 'budget_exp_kb_caret_v1', 'budget-kb-direct-focus-v1']; // Rev 2.32.277 (KB-23): + ключ перемикача «Прямий фокус», прибраного (фокус прямий завжди)
function purgeLegacyKeyboardKeys(){
  LEGACY_KEYBOARD_LS_KEYS.forEach(function(k){
    try{ localStorage.removeItem(k); }catch(e){}
  });
}

/* ============ Тема застосунку (Rev 2.6.0) ============
   Три стани: 'auto' (за системною темою, дефолт), 'light', 'dark' — саме
   значення користувацького ВИБОРУ зберігається в localStorage, а не
   резолюцію ('light'/'dark') — так при зміні системної теми ОС значення
   "Авто" автоматично підхоплює нову тему без додаткових дій користувача.
   Сам факт застосування теми (виставлення атрибута data-theme на <html>)
   відбувається у ДВОХ місцях: 1) синхронний anti-FOUC скрипт на самому
   початку <head> (до першого рендеру, щоб не було спалаху) і 2) тут, у
   applyTheme() — під час звичайної роботи застосунку (перемикання вручну,
   зміна системної теми в режимі "Авто").

   Rev #27.2 — Stage 5, п.27: ті самі ДВА місця означають і ДВА окремі
   джерела доступу до самого ключа localStorage — тут, через константу
   LS_KEY_THEME (канонічне джерело), і окремо хардкод-рядком
   'budget_theme_v1' в anti-FOUC IIFE на самому початку <head> (до цього
   <script>-блоку скрипт там ще не завантажений, тому константу звідти
   використати неможливо — технічна необхідність, не недогляд). Це
   свідомо НЕ об'єднується — синхронний anti-FOUC-скрипт мусить
   виконатись ДО того, як цей блок коду взагалі завантажиться. */
const LS_KEY_THEME = 'budget_theme_v1';
function getThemeChoice(){
  try{ return localStorage.getItem(LS_KEY_THEME) || 'auto'; }catch(e){ return 'auto'; }
}
function resolveTheme(choice){
  if(choice === 'auto'){
    return (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
  }
  return choice;
}
// Rev 2.6.0 — theme-color узгоджений з фактичним --color-bg кожної теми
// (значення продубльовані тут навмисно, а не читаються через
// getComputedStyle — на самому старті застосунку, коли html.setAttribute
// щойно відбувся, стилі можуть бути ще не застосовані для читання,
// а theme-color для статус-бару/адресного рядка потрібен негайно).
const THEME_COLOR_MAP = { light: '#F7F8FA', dark: '#0B0F16' };
function applyTheme(){
  const resolved = resolveTheme(getThemeChoice());
  document.documentElement.setAttribute('data-theme', resolved);
  const metaTheme = document.getElementById('meta-theme-color');
  const metaScheme = document.getElementById('meta-color-scheme');
  if(metaTheme) metaTheme.setAttribute('content', THEME_COLOR_MAP[resolved]);
  if(metaScheme) metaScheme.setAttribute('content', resolved);
  syncThemeToggleUI();
  forceThemeRepaint();
}
// Rev 2.11.8 BugFix (#4) — після перемикання теми в safe-area зверху (під
// "чубчиком"/статус-баром на iOS, у standalone PWA) інколи лишалась смуга
// КОЛИШНЬОГО кольору фону, хоча решта застосунку вже перефарбувалась
// коректно. Причина — WebKit-специфічна примха: html/body навмисно
// position:fixed з inset:0 (щоб зафіксувати viewport і прибрати "bounce"
// скролу), а їхній фон (background:var(--color-bg)) змінюється лише через
// CSS custom property при зміні data-theme. У такій комбінації WebKit
// подекуди НЕ перефарбовує position:fixed-фон негайно (найпомітніше — одразу
// після "холодного" запуску PWA), доки щось інше не форсує перемальовку
// (скрол, resize тощо) — звідси й "залипла" смуга старої теми. Фікс —
// класичний, безпечний для ока прийом: нікчемна зміна opacity кореневого
// елемента (0.999 — жодного видимого мерехтіння) примусово змушує WebKit
// повністю перемалювати весь піддерево, після чого відкат назад на
// наступному кадрі.
function forceThemeRepaint(){
  const el = document.documentElement;
  if(!el) return;
  el.style.opacity = '0.999';
  requestAnimationFrame(function(){ el.style.opacity = ''; });
}
function setThemeChoice(choice){
  try{ localStorage.setItem(LS_KEY_THEME, choice); }catch(e){}
  applyTheme();
}
function syncThemeToggleUI(){
  const choice = getThemeChoice();
  document.querySelectorAll('.theme-toggle-btn').forEach(function(btn){
    const isActive = btn.dataset.themeChoice === choice;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-checked', isActive ? 'true' : 'false');
  });
}
(window.__MT_FILES = window.__MT_FILES || []).push('shell.js');
