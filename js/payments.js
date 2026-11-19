// Найближчі платежі: чиста логіка, картка на «Аналітиці», екран «Платежі» і дії, модель ОЧ
// Перенесено з index.html дослівно, без змін (Rev 2.32.350, STRUCT-3). Звичайний скрипт: функції й const/let лишаються глобальними; підключається в index.html перед основним <script>; оператори верхнього рівня цієї області лишились в основному скрипті.

function ppModeAmount(values){
  const list = values.slice(-6);
  if(!list.length) return null;
  const counts = {}; list.forEach(function(v){ counts[v] = (counts[v] || 0) + 1; });
  let best = list[list.length - 1], bestCount = 0;
  list.forEach(function(v){ if(counts[v] >= bestCount){ bestCount = counts[v]; best = v; } });
  return best;
}
// Rev 2.32.70 — оцінка очікуваного платежу ОЧ для картки «Найближчі платежі»: history — платежі від НОВІШИХ до СТАРІШИХ (null і ≤ 0 ігноруються). Два найновіші однакові → це значення (оцінка не відстає після зміни суми: 5000, 5000, 6000, 6000, 6000 → 5000); інакше мода найновіших до 6 значень, при рівності виграє новіше; немає історії → null. typicalMonthlyPayment і розрахунок залишків не змінюються.
function expectedPaymentForCard(history){
  const v = (history || []).filter(function(x){ return x != null && x > 0; });
  if(!v.length) return null;
  if(v.length >= 2 && v[0] === v[1]) return v[0];
  const list = v.slice(0, 6);
  const counts = {}; list.forEach(function(x){ counts[x] = (counts[x] || 0) + 1; });
  let best = list[0], bestCount = 0;
  list.forEach(function(x){ if(counts[x] > bestCount){ bestCount = counts[x]; best = x; } }); // від новіших: суворе «>» — при рівності лишається новіше
  return best;
}
// Rev 2.32.151 (OCH-STATE, рішення чату): стан платежу ОЧ у місяці — ✓, ½, «скоро», «!». Єдина чиста логіка для рядка ОЧ в «Обліку» і для «Найближчі платежі» (внесено/не внесено). Порівнюється сума прив'язаних витрат за місяць (linkedExpensesSum) з ОЧІКУВАНИМ платежем: «Платіж на місяць» цього місяця; якщо його немає, останній відомий платіж ОЧ; для останнього платежу очікуване = залишок, якщо він менший. НЕ typicalMonthlyPayment; формули оцінки залишку не змінено. Допуск max(2 ₴, 1%). «!» = лише прострочений платіж (дата минула, платіж неповний), не незвична сума. N днів для «скоро» = налаштування сповіщень installment_days (за замовчуванням 2). Ризик: поки екран «Сповіщення» не відкривали в цій сесії, notificationSettings порожні й N = 2 (як у значенні за замовчуванням), додатковий запит заради N не робимо.
const INSTALLMENT_BANG_SVG = '<svg viewBox="0 0 24 24" width="9" height="9" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" aria-hidden="true"><line x1="12" y1="4" x2="12" y2="14"/><line x1="12" y1="19" x2="12.01" y2="19"/></svg>'; // знак оклику лише для простроченого платежу
function installmentExpectedPayment(x){
  const base = x && x.monthPay > 0 ? x.monthPay : (x && x.lastPay > 0 ? x.lastPay : null);
  if(base == null) return null;
  return (x.prevBalance != null && x.prevBalance > 0 && x.prevBalance < base) ? x.prevBalance : base;
}
// Чисте: чи платіж повний. Очікуване невідоме → будь-яка внесена сума = повний (як раніше без історії). Повертає { paid, more }.
function installmentPaidFull(linked, expected){
  const l = Number(linked) > 0 ? Number(linked) : 0;
  if(!(l > 0)) return { paid: false, more: false };
  if(!(expected > 0)) return { paid: true, more: false };
  const tol = Math.max(2, expected * 0.01);
  return { paid: l >= expected - tol, more: l > expected + tol };
}
// Rev 2.32.152 (OCH-DUE, рішення чату): ЄДИНЕ визначення «дата платежу минула» для рядка ОЧ («!») і для «Найближчі платежі» («N без позначки»): попередній (чи старший) місяць — завжди; поточний — сьогодні пізніше за дату платежу + 1 день (пільговий день: у dueDate+1 ще «скоро»). Раніше «Найближчі» вважали минулою вже дату < сьогодні (на день раніше за «!»).
function installmentDuePassed(month, dueDate, today){
  if(!month || !dueDate || !today) return false;
  const cur = today.slice(0, 7);
  if(month < cur) return true;
  if(month > cur) return false;
  return today > ppAddDays(dueDate, 1);
}
// p: { linked, expected, dueDay, month, firstMonth?, today, days }. kind: 'paid' | 'partial' | 'soon' | 'overdue' | 'none'. Майбутній місяць і місяць до firstMonth → 'none'; старіший за попередній — лише 'paid'/'partial' (Rev 2.32.154).
function installmentPaymentState(p){
  const linked = Number(p.linked) > 0 ? Number(p.linked) : 0;
  const exp = p.expected > 0 ? p.expected : null;
  const dueDate = p.dueDay ? ppClampDate(p.month, p.dueDay) : null;
  const days = (p.days == null || isNaN(p.days)) ? 2 : Number(p.days);
  const mk = function(kind, more){ return { kind: kind, linked: linked, expected: exp, dueDate: dueDate, more: !!more }; };
  const cur = p.today.slice(0, 7);
  // Rev 2.32.154 (OCH-STATE-ALL, рішення чату): ✓ і ½ — для будь-якого місяця від firstMonth ОЧ до поточного (за сумою прив'язаних витрат і очікуваним платежем ТОГО місяця); «скоро» і «!» лише для поточного й попереднього; майбутні місяці й місяці до початку ОЧ без значків.
  if(p.month > cur || (p.firstMonth && p.month < p.firstMonth)) return mk('none');
  const full = installmentPaidFull(linked, exp);
  if(full.paid) return mk('paid', full.more);
  if(p.month !== cur && p.month !== ppPrevMonth(cur)) return mk(linked > 0 ? 'partial' : 'none'); // старіший місяць: без «скоро»/«!»
  if(!dueDate) return mk(linked > 0 ? 'partial' : 'none'); // без dueDay «скоро»/«!» немає (це ловить крапка неповних даних)
  if(installmentDuePassed(p.month, dueDate, p.today)) return mk('overdue');
  if(ppDayDiff(p.today, dueDate) <= days) return mk('soon');
  return mk(linked > 0 ? 'partial' : 'none');
}
// Тексти й значок за станом (без HTML): { badge: 'check'|'half'|'bang'|null, text: string|null, accent: boolean }.
function installmentStateView(st){
  const part = st.linked > 0 && st.expected > 0 ? 'Частково: ' + payFmt(st.linked) + ' з ' + payFmt(st.expected) : null;
  const due = st.dueDate ? 'до ' + payDateShort(st.dueDate) : null;
  if(st.kind === 'paid') return { badge: 'check', text: st.more ? 'внесено більше' : null, accent: false };
  if(st.kind === 'partial') return { badge: 'half', text: part, accent: false, frac: installmentProgressFraction(st.linked, st.expected) };
  if(st.kind === 'soon') return { badge: null, text: part ? part + ' · ' + due : 'Платіж ' + due, accent: true };
  if(st.kind === 'overdue') return { badge: 'bang', text: part ? part + ' · ' + due : 'Платіж ' + due, accent: true };
  return { badge: null, text: null, accent: false };
}
// Rev 2.32.155 (OCH-RING, затверджений варіант A): частка внесеного від очікуваного для кільця прогресу на аватарі ОЧ: 0..1 (обрізається), null — очікуване невідоме. Кільце лише відображення «½» (стани й підпис «Частково: X з Y ₴» без змін).
function installmentProgressFraction(linked, expected){
  const e = Number(expected), l = Number(linked);
  if(!(e > 0)) return null;
  if(!(l > 0)) return 0;
  return Math.min(1, l / e);
}
// Кільце 18 px: доріжка (нейтральний токен) + дуга заповнення (warning) від 12 години за годинниковою; лише числові значення в SVG, текст aria-label екранується.
function installmentProgressRingHtml(frac, label){
  const r = 7, circ = 2 * Math.PI * r, f = frac == null ? 0 : Math.max(0, Math.min(1, frac));
  const dash = (Math.round(circ * f * 100) / 100) + ' ' + (Math.round(circ * 100) / 100);
  return '<span class="cdr-paid-badge ring" role="img" aria-label="' + escapeAttr(label) + '"><svg viewBox="0 0 18 18" width="18" height="18" aria-hidden="true"><circle class="ring-track" cx="9" cy="9" r="' + r + '" fill="none" stroke-width="2.5"/><circle cx="9" cy="9" r="' + r + '" fill="none" stroke="var(--color-warning)" stroke-width="2.5" stroke-linecap="round" stroke-dasharray="' + dash + '" transform="rotate(-90 9 9)"/></svg></span>';
}
function installmentRemindDays(){
  const n = typeof notificationSettings !== 'undefined' && notificationSettings ? Number(notificationSettings.installment_days) : NaN;
  return Number.isInteger(n) && n >= 0 && n <= 30 ? n : 2;
}
// Rev 2.32.164 (OCH-CHAIN, правило власника, підтверджене збігом з банком): залишок ОЧ за місяць — ЛАНЦЮЖОК від першого місяця ОЧ, а не «останній збережений запис».
// Пріоритет у кожному місяці: (1) є прив'язана витрата: залишок = попередній обчислений залишок − сума прив'язаних (перший місяць: initialAmount − сума), не нижче 0, і вона ПЕРЕМАГАЄ внесений факт (6D.148); (2) прив'язаних немає, але є внесений факт місяця: факт; (3) нічого немає: залишок попереднього місяця БЕЗ віднімання типового платежу (Rev 2.32.168: прогнозів немає, ОЧ без платежів у місяці лишає залишок; було «− типовий платіж»). Попереднього залишку нема (перший місяць без initialAmount, далі нічого не відомо): (1) → факт місяця, (3) → null.
// Пропущений місяць посередині просто проходить правилом (3) і передає залишок далі. Чисті функції без глобального стану (тести й upcomingPayments): spec = { initial, firstMonth, recs:[{month,balance,monthlyPayment}], linked:{ 'YYYY-MM': сума } }.
// Ризик: місяць без прив'язаного платежу й без факту не зменшує залишок — доки платіж не внесено (прив'язана витрата чи факт), залишок лишається попереднім.
// ===== Rev 2.32.171 (OCH-MODEL, клас C): модель ОЧ — загальна сума, місяці, дата створення, стандартний платіж, сегменти =====
// Серверні поля installment_accounts: term_months, start_date, first_payment ('same_day' | 'next_month'), pay_mode ('auto' | 'manual'), payment (цілий), усі nullable. Стандартний платіж = payment, інакше round(initialAmount ÷ term_months); однаковий для всіх банків, переплати його не зменшують. first_payment і pay_mode поки лише зберігаються й синхронізуються (резерв для графіка), у розрахунках не беруть участі.
const OCH_FIRST_PAYMENTS = ['same_day', 'next_month'];
const OCH_PAY_MODES = ['auto', 'manual'];
function ochModelDiffers(acc, row){
  return (acc.termMonths ?? null) !== (row.term_months ?? null) || (acc.startDate ?? null) !== (row.start_date ?? null) || (acc.firstPayment ?? null) !== (row.first_payment ?? null) || (acc.payMode ?? null) !== (row.pay_mode ?? null) || (acc.payment ?? null) !== (row.payment ?? null);
}
function applyOchModelFromRow(acc, row){
  acc.termMonths = row.term_months ?? null; acc.startDate = row.start_date ?? null; acc.firstPayment = row.first_payment ?? null; acc.payMode = row.pay_mode ?? null; acc.payment = row.payment ?? null;
}
// Типові сегменти за назвою банку: перший платіж «У день оформлення» для всіх, крім ПУМБ («Наступного місяця»); списання «Автоматично» для Моно й Приват, «Вношу вручну» для ПУМБ і решти.
function ochDefaultSegments(name){
  const n = String(name || '').toLowerCase();
  const pumb = n.indexOf('пумб') !== -1 || n.indexOf('pumb') !== -1;
  const auto = n.indexOf('моно') !== -1 || n.indexOf('mono') !== -1 || n.indexOf('приват') !== -1 || n.indexOf('privat') !== -1;
  return { firstPayment: pumb ? 'next_month' : 'same_day', payMode: auto && !pumb ? 'auto' : 'manual' };
}
function installmentStandardPayment(acc){
  if(!acc) return null;
  const p = Number(acc.payment);
  if(acc.payment != null && acc.payment !== '' && p > 0) return Math.round(p);
  const init = Number(acc.initialAmount), term = Number(acc.termMonths);
  if(init > 0 && term > 0) return Math.round(init / term);
  return null;
}
// Скільки платежів лишилось: ceil(залишок ÷ платіж); залишок ≤ 0 → 0; платежу нема → null.
function installmentPaymentsLeft(balance, payment){
  const b = Number(balance), p = Number(payment);
  if(balance == null || isNaN(b) || !(p > 0)) return null;
  return b <= 0 ? 0 : Math.ceil(b / p);
}
// Платіж місяця за ланцюжком: стандартний, але останній платіж = залишок (не більше за залишок).
function installmentPayAmount(standard, balanceBefore){
  if(!(standard > 0)) return null;
  const b = Number(balanceBefore);
  return balanceBefore != null && !isNaN(b) && b > 0 && b < standard ? b : standard;
}
// Овали таблиці «Оплати частинами»: { mode: 'none' | 'ovals' | 'solid', total, done }; none — немає term_months (або платежу, щоб порахувати); solid — term_months > 24 (суцільна смуга); done = term − лишилось платежів у межах 0..term.
const OCH_OVALS_MAX = 24; // Rev 2.32.174: понад 24 місяці овалів усе одно 24 (кожен = кілька місяців), без суцільної смуги
function ochOvalsModel(termMonths, balance, payment){
  const term = Math.round(Number(termMonths));
  if(!(term >= 1)) return { mode: 'none', total: 0, done: 0 };
  const left = installmentPaymentsLeft(balance, payment);
  if(left === null) return { mode: 'none', total: term, done: 0 };
  const done = Math.max(0, Math.min(term, term - left));
  if(term <= OCH_OVALS_MAX) return { mode: 'ovals', total: term, done: done };
  // Rev 2.32.174: term > 24 — масштабування до 24 овалів (кожен = term/24 місяців); зафарбований, коли сплачено не менше половини його діапазону; перший платіж фарбує перший овал, останній — усі
  const shown = OCH_OVALS_MAX;
  const fill = done >= term ? shown : (done > 0 ? Math.max(1, Math.round(done / term * shown)) : 0);
  return { mode: 'ovals', total: shown, done: fill, term: term, paid: done };
}
function ochOvalsHtml(model){
  if(!model || model.mode === 'none') return '';
  if(model.mode === 'solid'){ const pct = Math.round(model.done / model.total * 100); return '<span class="och-solid" aria-hidden="true"><i style="width:' + pct + '%"></i></span>'; }
  let h = '<span class="och-ovals" aria-hidden="true">';
  for(let i = 0; i < model.total; i++) h += '<i class="och-oval' + (i < model.done ? ' on' : '') + '"></i>';
  return h + '</span>';
}
function installmentTypicalPay(recs, beforeMonth){
  const rs = (recs || []).filter(function(d){ return d.monthlyPayment != null && String(d.month).slice(0, 7) < beforeMonth; }).sort(function(a, b){ return String(a.month).localeCompare(String(b.month)); });
  if(!rs.length) return null;
  const counts = {};
  rs.forEach(function(r){ counts[r.monthlyPayment] = (counts[r.monthlyPayment] || 0) + 1; });
  let best = rs[rs.length - 1].monthlyPayment, bestCount = 0;
  rs.forEach(function(r){ const c = counts[r.monthlyPayment]; if(c >= bestCount){ bestCount = c; best = r.monthlyPayment; } }); // >= і хронологічний порядок: при рівності виграє новіший
  return best;
}
// Повертає { start, before, balance, pay, linkedSum }: before — обчислений залишок НА ПОЧАТОК місяця (попередній місяць ланцюжка; для першого місяця initialAmount; null — невідомо), balance — залишок місяця за правилом (1)–(3), pay — платіж місяця (прив'язаний, інакше типовий). Місяць раніше за початок ланцюжка: усе null.
// Rev 2.32.177 (OCH-ANCHOR, правило власника): ОПОРНІ ТОЧКИ. Внесений «Залишок за банком» за місяць M (до платежу цього місяця) — опорна точка: залишок на початок M = цей факт, залишок M = max(0, опора − прив'язані за M), наступні місяці від нього (до наступної опорної точки); прив'язані платежі в межах місяця завжди зменшують (вони не «перемагають» факт, а віднімаються від нього). Без опорної точки в першому місяці: якщо pay_mode = 'auto' і є start_date, стандартний платіж і term_months — за графіком total − min(N, term) × платіж, N = кількість запланованих платежів до початку цього місяця; інакше total і причина неповних даних «Залишок за банком на початок обліку» (openingMissing: для ОЧ, у яких start_date раніше за перший місяць обліку). Без прогнозів: місяць без прив'язаної й без факту лишає залишок.
// Графік: same_day — перший платіж у день start_date, next_month — через місяць, далі щомісяця (день не більший за довжину місяця, на кількість не впливає); N = платежі, чий місяць раніше за місяць M.
function ochMonthIndex(ym){ return +String(ym).slice(0, 4) * 12 + (+String(ym).slice(5, 7) - 1); }
function ochPlannedPaymentsBefore(startDate, firstPayment, term, month){
  const sd = /^(\d{4})-(\d{2})-\d{2}$/.exec(String(startDate || ''));
  const t = Math.round(Number(term));
  if(!sd || !(t >= 1) || !month) return null;
  const startIdx = +sd[1] * 12 + (+sd[2] - 1);
  const n = ochMonthIndex(month) - startIdx - (firstPayment === 'next_month' ? 1 : 0);
  return Math.max(0, Math.min(t, n));
}
// Вихідний залишок першого місяця без опорної точки: { balance, scheduled } (scheduled — за графіком); balance null — total невідомий.
function ochOpeningBalance(sp, firstMonth){
  const total = Number(sp.initial);
  if(!(total > 0)) return { balance: null, scheduled: false };
  const pay = Number(sp.std);
  if(sp.payMode === 'auto' && sp.startDate && pay > 0 && Number(sp.termMonths) > 0){
    const n = ochPlannedPaymentsBefore(sp.startDate, sp.firstPayment, sp.termMonths, firstMonth);
    if(n !== null) return { balance: Math.max(0, total - n * pay), scheduled: true };
  }
  return { balance: total, scheduled: false };
}
// Повертає { start, before, calcBefore, balance, pay, linkedSum, anchored, openingMissing }: before — залишок НА ПОЧАТОК місяця (опорна точка, якщо є; інакше розрахунковий), calcBefore — той самий без опорної точки цього місяця (для підказки «Відрізняється від розрахунку»), balance — залишок місяця = max(0, before − прив'язані). Місяць раніше за початок ланцюжка: усе null.
function installmentChainCalc(spec, month){
  const sp = spec || {};
  const recs = (sp.recs || []).filter(function(d){ return d && d.month; });
  const linked = sp.linked || {};
  const cands = [];
  if(sp.firstMonth) cands.push(String(sp.firstMonth).slice(0, 7));
  recs.forEach(function(d){ cands.push(String(d.month).slice(0, 7)); });
  Object.keys(linked).forEach(function(m){ if(linked[m] > 0) cands.push(m); });
  const start = cands.length ? cands.slice().sort()[0] : null;
  const empty = { start: start, before: null, calcBefore: null, balance: null, pay: null, linkedSum: Number(linked[month]) > 0 ? Number(linked[month]) : 0, anchored: false, openingMissing: false };
  if(!start || month < start) return empty;
  let prevEnd = null, m = start, guard = 0, out = empty;
  while(guard++ < 1200){
    const lk = Number(linked[m]) > 0 ? Number(linked[m]) : 0;
    const factRec = recs.filter(function(d){ return String(d.month).slice(0, 7) === m && d.balance != null; })[0];
    let calcBefore = prevEnd, scheduled = false;
    if(m === start){ const op = ochOpeningBalance(sp, start); calcBefore = op.balance; scheduled = op.scheduled; }
    const startBal = factRec ? Number(factRec.balance) : calcBefore;
    const bal = startBal == null || isNaN(startBal) ? null : Math.max(0, startBal - lk);
    const sd = /^(\d{4})-(\d{2})/.exec(String(sp.startDate || ''));
    const openingMissing = m === start && !factRec && !scheduled && !!sd && (sd[1] + '-' + sd[2]) < start;
    out = { start: start, before: startBal == null || isNaN(startBal) ? null : startBal, calcBefore: calcBefore, balance: bal, pay: lk > 0 ? lk : installmentTypicalPay(recs, m), linkedSum: lk, anchored: !!factRec, openingMissing: openingMissing };
    if(m === month) return out;
    prevEnd = bal; m = ppNextMonth(m);
  }
  return empty;
}
function upcomingPayments(opts){
  const o = opts || {};
  const today = o.today, horizon = o.horizonDays || 7;
  const debts = (o.debtsByMonth || []).filter(function(d){ return d && !d.deletedAt; });
  const expenses = (o.expenses || []).filter(function(e){ return e && !e.deletedAt; });
  const hidden = o.hidden || {};
  // Rev 2.32.199 (PAY-CLOSED): спільний читач приховування (isHiddenForMonth: за id, назвою, accountName) передається через opts.isHidden; без нього (тести) — старий пошук за ключем-назвою. Чиста функція лишається чистою.
  const hiddenReader = typeof o.isHidden === 'function' ? o.isHidden : null;
  const hiddenFor = function(name, kind, month){ if(hiddenReader) return !!hiddenReader(name, kind, month); const e = hidden[kind + ':' + name]; if(!e) return false; if(typeof e === 'string') return month >= e; return !e.deletedAt && month >= e.month; };
  const m0 = today.slice(0, 7), m1 = ppNextMonth(m0);
  const windowEnd = ppAddDays(today, horizon - 1), laterEnd = ppClampDate(m1, 31);
  const result = { items: [], later: [], unconfirmed: [], undatedCards: { count: 0, total: 0 }, undatedList: [], noDay: [], load: { total: 0, count: 0, estimated: false, unknown: 0 } };
  const place = function(item){
    const past = item.kind === 'installment' ? installmentDuePassed(item.month, item.date, today) : item.date < today; // Rev 2.32.152: для ОЧ спільне з рядком визначення (пільга +1 день); картки без змін
    if(past){ if(item.month === m0) result.unconfirmed.push(item); return; }
    if(item.kind === 'installment' && item.date < today) item = Object.assign({}, item, { overdue: true }); // Rev 2.32.396 (FIX-PAY): пільговий день (dueDate+1) лишається зі СПРАВЖНЬОЮ датою й позначкою «прострочено» (раніше переносився на сьогодні: «18-те» замість «до 17 лис» в «Обліку»). Смуга днів його не малює (дата поза вікном), «Наступний» і екран «Платежі» показують «Прострочено».
    if(item.date <= windowEnd) result.items.push(item);
    else if(item.date <= laterEnd) result.later.push(item);
  };
  // ----- ОЧ -----
  (o.installments || []).forEach(function(inst){
    if(!inst || inst.deletedAt) return;
    let firstVisibleMonth = null;
    [m0, m1].forEach(function(month){
      if(hiddenFor(inst.name, 'installment', month)) return;
      const startM = installmentStartMonth(inst, debts, expenses); // Rev 2.32.179 (OCH-START)
      if(startM && month < startM) return;
      const hist = debts.filter(function(d){ return d.kind === 'installment' && d.name === inst.name && d.month <= month; }).sort(function(a, b){ return a.month.localeCompare(b.month); });
      // Rev 2.32.199 (PAY-CLOSED): завершеність — з обчисленого ланцюжка (залишок на початок місяця 0), а не з поля balance останнього запису (воно показує залишок НА ПОЧАТОК місяця, тож в останньому платежі дорівнює платежу). Ланцюжок без записів і витрат дає before з початкової суми, нуль не вигадується.
      const chainSpec = { initial: inst.initialAmount, firstMonth: inst.firstMonth || null, std: installmentStandardPayment(inst), termMonths: inst.termMonths, startDate: inst.startDate, firstPayment: inst.firstPayment, payMode: inst.payMode, recs: debts.filter(function(d){ return d.kind === 'installment' && d.name === inst.name; }), linked: expenses.reduce(function(a, e){ if(e.linkedInstallment === inst.name){ const k = String(e.date).slice(0, 7); a[k] = (a[k] || 0) + (Number(e.amount) || 0); } return a; }, {}) };
      const chainBefore = installmentChainCalc(chainSpec, month).before;
      if(chainBefore === 0) return; // завершена: ні в «Потребує уваги», ні в «Найближчі», ні в «Пізніше»
      if(firstVisibleMonth === null) firstVisibleMonth = month;
      if(!inst.dueDay) return;
      const rec = debts.filter(function(d){ return d.kind === 'installment' && d.name === inst.name && d.month === month && d.monthlyPayment != null; })[0];
      // Rev 2.32.151 (OCH-STATE): «сплачено» = сума прив'язаних витрат ≥ очікуваного (допуск max(2 ₴, 1%)), а не будь-яка витрата; часткові лишаються в списку (сума й оцінка без змін)
      const linkedSum = expenses.filter(function(e){ return e.linkedInstallment === inst.name && String(e.date).slice(0, 7) === month; }).reduce(function(a, e){ return a + (Number(e.amount) || 0); }, 0);
      // Rev 2.32.183 (PAY-CARD-FIX): залишок на початок місяця потрібен і поза гілкою «є прив'язана витрата» (сума платежу ОЧ зі стандартним платежем) — раніше змінна була оголошена лише всередині гілки, тож без прив'язаних витрат кидалось ReferenceError і картка «Найближчі платежі» зникала.
        // Rev 2.32.164 (OCH-CHAIN): попередній залишок — з обчисленого ланцюжка (а не останній збережений запис): той самий розрахунок, що в «Обліку», таблиці й кільці
      if(linkedSum > 0){
        const lastRec = debts.filter(function(d){ return d.kind === 'installment' && d.name === inst.name && d.month <= month && d.monthlyPayment > 0; }).sort(function(a, b){ return a.month.localeCompare(b.month); }).pop();
        const expected = installmentExpectedPayment({ monthPay: rec ? rec.monthlyPayment : null, lastPay: lastRec ? lastRec.monthlyPayment : null, prevBalance: chainBefore });
        if(installmentPaidFull(linkedSum, expected).paid) return; // сплачено
      }
      let amount = null, estimated = false;
      const stdPay = installmentStandardPayment(inst); // Rev 2.32.171 (OCH-MODEL): стандартний платіж моделі ОЧ (payment ?? сума ÷ місяці); останній платіж = залишок
      if(rec){ amount = rec.monthlyPayment; }
      else if(stdPay != null){ amount = installmentPayAmount(stdPay, chainBefore); }
      else{
        // Rev 2.32.396 (FIX-PAY): очікуваний платіж — ТИМ САМИМ правилом, що в «Обліку» (typicalMonthlyPayment: мода всіх попередніх платежів, при рівності новіший). Раніше expectedPaymentForCard (два найновіші однакові → вони) давав «≈ 5 000 ₴» там, де «Облік» показував 6 000 ₴. expectedPaymentForCard лишається (тести, інші виклики не змінено).
        const mode = installmentTypicalPay(debts.filter(function(d){ return d.kind === 'installment' && d.name === inst.name; }), month);
        if(mode != null && mode > 0){ amount = mode; estimated = true; }
      }
      // Rev 2.32.418 (DS-PAYLIST Rev 1): «k з n» — з тієї самої моделі овалів, що прогрес ОЧ на картці «ОЧ» (F5-джерело: ochOvalsModel(термін, залишок, стандартний платіж)); k = сплачено + 1 (номер цього платежу), n = термін; без terмін/залишку/платежу — k, n відсутні, тоді показується лише «ОЧ». Лише додаткові поля, склад і суми списку не змінені.
      let kOfN = null, nOfN = null;
      if(typeof ochOvalsModel === 'function'){
        const ov = ochOvalsModel(inst.termMonths, chainBefore, stdPay);
        if(ov && ov.mode === 'ovals'){ nOfN = ov.term || ov.total; const paid = ov.paid !== undefined ? ov.paid : ov.done; kOfN = Math.min(nOfN, paid + 1); }
      }
      place({ kind: 'installment', name: inst.name, date: ppClampDate(month, inst.dueDay), month: month, amount: amount, estimated: estimated, k: kOfN, n: nOfN });
    });
    if(!inst.dueDay && firstVisibleMonth === m0) result.noDay.push(inst.name);
  });
  // ----- Картки: мінімальний платіж місяця (лише > 0 і не внесений) -----
  (o.cards || []).forEach(function(card){
    if(!card || card.deletedAt) return;
    [m0, m1].forEach(function(month){
      if(hiddenFor(card.name, 'card', month)) return;
      const rec = findAccountMonthDebt(debts, card, month, 'card'); // Rev 2.32.237 (CARD-BY-ID): за id, запасний варіант — назва
      if(!rec || !(rec.minPayment > 0) || rec.minPaymentDone) return;
      if(!card.paymentDay){ if(month === m0){ result.undatedCards.count++; result.undatedCards.total += rec.minPayment; result.undatedList.push({ kind: 'card', name: card.name, month: month, amount: rec.minPayment, date: null }); } return; }
      place({ kind: 'card', name: card.name, date: ppClampDate(month, card.paymentDay), month: month, amount: rec.minPayment, estimated: false });
    });
  });
  const byDate = function(a, b){ return a.date.localeCompare(b.date) || a.name.localeCompare(b.name); };
  result.items.sort(byDate); result.later.sort(byDate); result.unconfirmed.sort(byDate);
  result.items.forEach(function(it){
    result.load.count++;
    if(it.amount != null){ result.load.total += it.amount; if(it.estimated) result.load.estimated = true; } else result.load.unknown++;
  });
  return result;
}
// Обгортка над реальними даними застосунку (для картки й екрана «Платежі»).
function computeUpcomingNow(horizonDays){
  return upcomingPayments({ today: kyivTodayISO(), horizonDays: horizonDays, installments: installmentAccounts, cards: bankAccounts, debtsByMonth: activeDebts().map(function(d){ return Object.assign({}, d, { month: monthKey2(d.month) }); }), expenses: activeExpenses(), hidden: hiddenFrom, isHidden: isHiddenForMonth });
}
/* ============ Картка «Найближчі платежі» на «Аналітиці» (Rev 2.32.67, P3) ============ */
const PAY_MONTHS_SHORT = ['січ', 'лют', 'бер', 'кві', 'тра', 'чер', 'лип', 'сер', 'вер', 'жов', 'лис', 'гру'];
const PAY_DOW = ['Нд', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
const PAY_MONTHS_GEN = ['січня', 'лютого', 'березня', 'квітня', 'травня', 'червня', 'липня', 'серпня', 'вересня', 'жовтня', 'листопада', 'грудня'];
function payDow(iso){ return PAY_DOW[new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10))).getUTCDay()]; }
function payDateShort(iso){ return +iso.slice(8, 10) + ' ' + PAY_MONTHS_SHORT[+iso.slice(5, 7) - 1]; }
function payFmt(n){ return new Intl.NumberFormat('uk-UA', { maximumFractionDigits: 0 }).format(n) + ' ₴'; }
function payAmountText(it){ return it.amount == null ? 'сума невідома' : (it.estimated ? '≈ ' : '') + payFmt(it.amount); }
function payPlural(n){ return pluralUa(n, ['платіж', 'платежі', 'платежів']); }
// Rev 2.32.84 (CARD-1, нова специфікація): еталон = картка Rev 2.32.72 (з назвами). Адаптація лише там, де еталонний текст не влізає: кожен адаптивний рядок має ДРАБИНУ текстів від найбагатшого до найкоротшого,
// вибирається перша сходинка, що влізає поруч із сумою праворуч у ФАКТИЧНУ доступну ширину (вимірювання в DOM, fitPaymentsCard), без обрізання й «…». Суми праворуч не чіпаємо (лише останнім кроком «1,2М»).
// Ризик: вимірювання потребує видимої картки (у прихованій вкладці ширина 0 — перевибір робить ResizeObserver); альтернатива (лише container query за шириною екрана) не знає довжини назв.
// pickCardVariant(fits, count): індекс першої сходинки, що влізає (fits(i) → boolean); якщо жодна — остання.
function pickCardVariant(fits, count){
  for(let i = 0; i < count; i++){ if(fits(i)) return i; }
  return Math.max(0, count - 1);
}
// Скорочення суми (останній крок): до 999 повністю, до 9 999 з десятими («4,9к», «5к»), далі «12к», від мільйона «1,2М».
function payCompactAmount(n){
  const v = Math.round(n);
  const dec = function(x){ return (Math.round(x * 10) / 10).toString().replace('.', ','); };
  if(v < 1000) return String(v);
  if(v < 9950) return dec(v / 1000) + 'к';
  if(v < 999500) return Math.round(v / 1000) + 'к';
  return dec(v / 1000000) + 'М';
}
function payAmountShortText(it){ return it.amount == null ? 'сума невідома' : (it.estimated ? '≈ ' : '') + payCompactAmount(it.amount) + ' ₴'; }
// Драбина «Найближчого»: dp — день («Сб 17» чи «17 жов»), name — назва (випадає цілою, ніколи не обрізається).
function payNextLadder(dp, name, overdue){ if(overdue) return ['Чекає внесення · ' + dp + ' · ' + name, 'Чекає внесення · ' + dp, dp + ' · ' + name, dp]; return ['Наступний · ' + dp + ' · ' + name, 'Далі · ' + dp + ' · ' + name, dp + ' · ' + name, 'Далі · ' + dp]; } // Rev 2.32.396: пільговий день — з позначкою замість «Наступний»; Rev 2.32.418 (DS-PAYLIST): позначка «Чекає внесення» (слова «Прострочено» немає)
// Rev 2.32.160 (PAY-ICONS): драбина переліку назв без дат. Спершу прибирається хвіст переліку з «+K» («А, Б, В» → «А, Б +1» → «А +2»), потім лише заголовок; «…» немає. Повертає пари { h: заголовок, t: перелік } — заголовок і перелік фарбуються окремо.
function payNamesParts(head, names){
  const n = names.length, out = [];
  for(let k = n; k >= 1; k--) out.push({ h: head, t: names.slice(0, k).join(', ') + (k < n ? ' +' + (n - k) : '') });
  out.push({ h: head, t: '' });
  return out;
}
function payPartsText(p){ return p.h + (p.t ? ' · ' + p.t : ''); }
// Драбина «без позначки» (Rev 2.32.160: без дати): names — назви (за зростанням дати).
function payUnconfirmedParts(names){ return payNamesParts(names.length + ' без позначки', names); }
function payUnconfirmedLadder(names){ return payUnconfirmedParts(names).map(payPartsText); }
// Rev 2.32.160: «ОЧ без дати · N · назви» (лише видимі ОЧ без dueDay; суми немає)
function payNoDayParts(names){ return payNamesParts('ОЧ без дати · ' + names.length, names); }
// Підсвічений день смуги (Rev 2.32.167: завжди синє скло, без варіанта «скоро»): найближчий платіж; у смузі він завжди не сплачений повністю (upcomingPayments відсіває сплачені через installmentPaidFull).
// Модель компактної картки (без DOM; Rev 2.32.71). r — результат upcomingPayments (horizon 7). Стани: week / empty / allpaid.
// Rev 2.32.410 (FIX-1119 п.4): підсумок кількох платежів одного дня як один «умовний» платіж: сума відомих; estimated, якщо хоч один очікуваний або без суми; усі без суми — amount:null
function paySameDaySum(items){
  const known = items.filter(function(x){ return x.amount != null; });
  if(!known.length) return { amount: null, estimated: false };
  return { amount: known.reduce(function(a, x){ return a + x.amount; }, 0), estimated: known.length < items.length || items.some(function(x){ return !!x.estimated; }) };
}
function paymentsCardModel(r, today, hasAccounts){
  if(!hasAccounts) return { hidden: true };
  const m = { hidden: false, window: '7 днів', total: null, totalShort: null, headLadder: [{ title: 'Найближчі платежі', window: '7 днів' }, { title: 'Найближчі платежі', window: '' }, { title: 'Платежі', window: '' }],
    state: '', days: [], showStrip: true, calm: null, next: null, done: null, messages: [] };
  for(let i = 0; i < 7; i++){
    const date = ppAddDays(today, i);
    const its = r.items.filter(function(x){ return x.date === date; });
    const known = its.filter(function(x){ return x.amount != null; });
    m.days.push({ date: date, dow: payDow(date), day: +date.slice(8, 10), today: i === 0, has: its.length > 0, sum: known.length ? known.reduce(function(a, x){ return a + x.amount; }, 0) : null, count: its.length, next: false, label: '' });
  }
  if(r.items.length){ // Rev 2.32.160: підсвічується лише день найближчого платежу
    const fd = r.items[0], di = m.days.filter(function(d){ return d.date === fd.date; })[0];
    if(di){
      di.next = true;
      const dayTxt = +fd.date.slice(8, 10) + ' ' + PAY_MONTHS_GEN[+fd.date.slice(5, 7) - 1];
      di.label = 'Наступний платіж: ' + dayTxt + ', ' + (di.count > 1 && di.sum != null ? payFmt(di.sum) : payAmountText(fd));
    }
  }
  const nextItem = r.items.length ? null : (r.later[0] || null);
  if(r.items.length){
    m.state = 'week';
    m.total = (r.load.total === 0 && r.load.unknown > 0) ? 'Сума невідома' : (r.load.estimated ? '≈ ' : '') + payFmt(r.load.total);
    m.totalShort = (r.load.total === 0 && r.load.unknown > 0) ? m.total : (r.load.estimated ? '≈ ' : '') + payCompactAmount(r.load.total) + ' ₴';
    const f = r.items[0];
    const dp = payDow(f.date) + ' ' + (+f.date.slice(8, 10));
    // Rev 2.32.410 (FIX-1119 п.4): кілька платежів одного дня — рядок «Наступний · Пт 20 · 2 платежі» із сумою ВСІХ платежів дня (≈, якщо хоч одна очікувана чи невідома), дотик відкриває екран «Платежі» на цій даті; раніше показувався лише перший («… Ноутбук 1»)
    const same = r.items.filter(function(x){ return x.date === f.date; });
    const nameTxt = same.length > 1 ? same.length + ' ' + payPlural(same.length) : f.name;
    const sumItem = same.length > 1 ? paySameDaySum(same) : f;
    m.next = { label: (f.overdue ? 'Чекає внесення' : 'Наступний') + ' · ' + dp + ' · ' + nameTxt, amount: payAmountText(sumItem), amountShort: payAmountShortText(sumItem), ladder: payNextLadder(dp, nameTxt, !!f.overdue), overdue: !!f.overdue, date: f.date, count: same.length };
  }else if(nextItem && nextItem.month === today.slice(0, 7)){
    m.state = 'empty'; m.calm = 'Тиждень без платежів';
    const dp = payDow(nextItem.date) + ' ' + payDateShort(nextItem.date);
    m.next = { label: 'Наступний · ' + dp + ' · ' + nextItem.name, amount: payAmountText(nextItem), amountShort: payAmountShortText(nextItem), ladder: payNextLadder(dp, nextItem.name) };
  }else{
    m.state = 'allpaid'; m.showStrip = false;
    const dp = nextItem ? payDateShort(nextItem.date) : '';
    m.done = { title: 'Усе сплачено.', next: nextItem ? 'Наступний · ' + dp + ' · ' + nextItem.name : '', nextLadder: nextItem ? payNextLadder(dp, nextItem.name).concat([dp]) : null }; // + остання сходинка лише дата: в рядку «Усе сплачено.» (значок + заголовок) на 290 пт не влізає й «Далі · дата»
  }
  // повідомлення (Rev 2.32.160: до трьох), у порядку: без позначки, картки без дати, ОЧ без дати
  if(r.unconfirmed.length){
    const parts = payUnconfirmedParts(r.unconfirmed.map(function(u){ return u.name; })); // список відсортовано за датою; Rev 2.32.160: без дати
    m.messages.push({ kind: 'unconfirmed', text: payPartsText(parts[0]), ladder: parts.map(payPartsText), parts: parts });
  }
  if(r.undatedCards.count){ const c = r.undatedCards.count; m.messages.push({ kind: 'cards', text: 'Картки без дати · ' + c, ladder: ['Картки без дати · ' + c, 'Без дати · ' + c], amount: payFmt(r.undatedCards.total), amountShort: payCompactAmount(r.undatedCards.total) + ' ₴' }); }
  if(r.noDay.length){ const parts = payNoDayParts(r.noDay); m.messages.push({ kind: 'noday', text: payPartsText(parts[0]), ladder: parts.map(payPartsText), parts: parts }); } // Rev 2.32.160: «ОЧ без дати · N · назви», сума не показується
  m.messages = m.messages.slice(0, 3); // Rev 2.32.160: було 2; третій рядок потрібен, щоб «ОЧ без дати» не пропадав, коли є й «без позначки», і картки без дати
  return m;
}
// Rev 2.32.160 (PAY-ICONS): іконки рядків картки. Форми й кола ті самі, що в bankIcon без логотипа (Rev 2.32.157: EMPTY_STATE_ICONS — картка й календар із ₴ у нейтральному колі); «!» — жовте коло зі знаком оклику як у рядку ОЧ; «Наступний» — звичайний календар без кола.
const PAY_CAL_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4.5" width="18" height="16" rx="2.5"/><path d="M3 9.5h18"/><path d="M8 2.5v4"/><path d="M16 2.5v4"/></svg>';
const PAY_BANG_SVG = '<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" aria-hidden="true"><line x1="12" y1="4" x2="12" y2="14"/><line x1="12" y1="19" x2="12.01" y2="19"/></svg>';
function payIconFor(kind){
  const e = payEl('span', 'pay-ico ' + (kind === 'unconfirmed' ? 'warn' : kind === 'next' ? 'plain' : 'neutral'));
  e.setAttribute('aria-hidden', 'true');
  e.innerHTML = kind === 'unconfirmed' ? PAY_BANG_SVG : kind === 'next' ? PAY_CAL_SVG : kind === 'cards' ? EMPTY_STATE_ICONS.card : EMPTY_STATE_ICONS.calendar;
  return e;
}
// Ставить сходинку драбини: рядок або пара { h, t } (заголовок і перелік окремими span для різних кольорів)
function payRenderParts(el, p){
  el.textContent = '';
  el.appendChild(payEl('span', 'head', p.h));
  if(p.t){ el.appendChild(payEl('span', 'sep', ' · ')); el.appendChild(payEl('span', 'tail', p.t)); }
}
function payEl(tag, cls, text){ const e = document.createElement(tag); if(cls) e.className = cls; if(text != null) e.textContent = text; return e; }
const PAY_CHEV_SVG = '<svg width="9" height="15" viewBox="0 0 9 15" fill="none" aria-hidden="true"><path d="M1.5 1.5l6 6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const PAY_CHECK_SVG = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3.5 8.5l3 3 6-6.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
function renderPaymentsCard(){
  const host = document.getElementById('payments-card');
  if(!host) return;
  const hasAccounts = installmentAccounts.length > 0 || bankAccounts.length > 0;
  let m;
  try{ m = paymentsCardModel(computeUpcomingNow(7), kyivTodayISO(), hasAccounts); }catch(e){ host.classList.add('hidden'); return; }
  host.classList.toggle('hidden', m.hidden);
  host.textContent = '';
  if(m.hidden) return;
  const openAll = function(date){ if(typeof openPaymentsScreen === 'function') openPaymentsScreen(date); };
  // уся картка — одна кнопка (прозорий шар); для VoiceOver — «Найближчі платежі, відкрити»
  const hit = payEl('button', 'pay-card-hit'); hit.type = 'button'; hit.setAttribute('aria-label', 'Найближчі платежі, відкрити');
  hit.addEventListener('click', function(){ openAll(null); });
  host.appendChild(hit);
  const head = payEl('div', 'pay-head');
  const left = payEl('div', 'pay-head-left'); const titleEl = payEl('span', 'pay-title', 'Найближчі платежі'); const windowEl = payEl('span', 'pay-window', m.window); left.appendChild(titleEl); left.appendChild(windowEl); head.appendChild(left);
  left._payHead = { title: titleEl, win: windowEl, ladder: m.headLadder };
  const right = payEl('div', 'pay-head-right'); if(m.total){ const totalEl = payEl('span', 'pay-total', m.total); totalEl._payAmt = { full: m.total, short: m.totalShort }; left._payHead.amt = totalEl; right.appendChild(totalEl); }
  const chev = payEl('span', 'pay-chev'); chev.innerHTML = PAY_CHEV_SVG; right.appendChild(chev); head.appendChild(right);
  host.appendChild(head);
  if(m.calm) host.appendChild(payEl('div', 'pay-calm', m.calm));
  if(m.showStrip){
    const strip = payEl('div', 'pay-strip');
    m.days.forEach(function(d){
      const b = payEl('button', 'pay-day' + (d.today ? ' today' : '') + (d.has ? ' has' : '') + (d.next ? ' next' : '')); b.type = 'button';
      // Rev 2.32.72: три окремі рядки по центру (за макетом): день тижня, число, сума (місце під суму зарезервоване — комірки однакової висоти)
      b.appendChild(payEl('span', 'pay-dow', d.dow)); b.appendChild(payEl('span', 'pay-num', String(d.day)));
      const sumEl = payEl('span', 'pay-sum', d.sum != null ? new Intl.NumberFormat('uk-UA', { maximumFractionDigits: 0 }).format(d.sum) : ''); sumEl._paySum = d.sum; b.appendChild(sumEl);
      if(d.next && d.label){ b.setAttribute('aria-label', d.label); } else b.setAttribute('aria-hidden', 'true'); // Rev 2.32.160: підсвічений день доступний для VoiceOver з підписом «Наступний платіж: …»
      b.tabIndex = -1; // уся картка — одна доступна кнопка; комірка з платежем відкриває «Платежі» на цій даті
      if(d.has) b.addEventListener('click', function(ev){ ev.stopPropagation(); openAll(d.date); });
      strip.appendChild(b);
    });
    host.appendChild(strip);
  }
  if(m.next){
    const l = payEl('div', 'pay-line1' + (m.next.overdue ? ' amber' : '')); const lt = payEl('span', 'l', m.next.label); const rt = payEl('span', 'r', m.next.amount);
    lt._payLadder = m.next.ladder; lt._payAmt = { el: rt, full: m.next.amount, short: m.next.amountShort };
    const lw = payEl('span', 'lw'); lw.appendChild(payIconFor('next')); lw.appendChild(lt); // Rev 2.32.160: календар перед текстом
    l.appendChild(lw); l.appendChild(rt); host.appendChild(l);
    if(m.next.date){ l.classList.add('tap'); l.addEventListener('click', function(ev){ ev.stopPropagation(); openAll(m.next.date); }); } // Rev 2.32.410 (FIX-1119 п.4): дотик по рядку «Наступний» відкриває «Платежі» на дні цього платежу
  }
  if(m.done){
    const d = payEl('div', 'pay-done'); const ico = payEl('span', 'pay-done-ico'); ico.innerHTML = PAY_CHECK_SVG; d.appendChild(ico);
    d.appendChild(payEl('b', '', m.done.title));
    if(m.done.next){ const mt = payEl('span', 'm', m.done.next); mt._payLadder = m.done.nextLadder; d.appendChild(mt); }
    host.appendChild(d);
  }
  if(m.messages.length){
    const box = payEl('div', 'pay-msgs');
    m.messages.forEach(function(x){
      const row = payEl('div', 'pay-msg' + (x.kind === 'unconfirmed' ? ' amber' : '')); const lt = payEl('span', 'l', x.text); lt._payLadder = x.ladder; if(x.parts) lt._payParts = x.parts;
      row.appendChild(payIconFor(x.kind)); row.appendChild(lt); // Rev 2.32.160: значок за видом рядка
      if(x.amount){ const rt = payEl('span', 'r', x.amount); lt._payAmt = { el: rt, full: x.amount, short: x.amountShort }; row.appendChild(rt); }
      box.appendChild(row);
    });
    host.appendChild(box);
  }
  host.classList.toggle('is-flat', m.messages.length > 0 || !!m.next); // повідомлення й рядок «Наступний» без нижнього відступу — картка не росте
  fitPaymentsCard(host); // той самий синхронний виклик, до першого малювання: без мерехтіння
  payCardLastW = host.clientWidth;
  if(!payCardRO && typeof ResizeObserver === 'function'){
    payCardRO = new ResizeObserver(function(){ const h = document.getElementById('payments-card'); if(h && h.clientWidth && h.clientWidth !== payCardLastW){ payCardLastW = h.clientWidth; fitPaymentsCard(h); } });
    payCardRO.observe(host);
    if(document.fonts && document.fonts.ready) document.fonts.ready.then(function(){ const h = document.getElementById('payments-card'); if(h) fitPaymentsCard(h); });
    // зміна розміру системного шрифту (Dynamic Type) не міняє ширину картки, тож ResizeObserver її не бачить: перевибір і при поверненні на вкладку/зміні вікна
    const refit = function(){ const h = document.getElementById('payments-card'); if(h) fitPaymentsCard(h); };
    document.addEventListener('visibilitychange', function(){ if(document.visibilityState === 'visible') refit(); });
    window.addEventListener('resize', refit);
  }
}
let payCardRO = null, payCardLastW = 0;
// Вибір сходинок за ФАКТИЧНОЮ шириною: тимчасово ставимо текст сходинки й дивимось, чи він не виходить за свій бокс (scrollWidth > clientWidth). Нічого не обрізаємо.
function fitPaymentsCard(host){
  if(!host || !host.clientWidth) return; // прихована вкладка: ширина 0, перевибір зробить ResizeObserver
  const over = function(el){ return el.scrollWidth > el.clientWidth + 0.5; };
  const head = host.querySelector('.pay-head-left');
  if(head && head._payHead){
    const hh = head._payHead;
    if(hh.amt) hh.amt.textContent = hh.amt._payAmt.full;
    const idx = pickCardVariant(function(i){ hh.title.textContent = hh.ladder[i].title; hh.win.textContent = hh.ladder[i].window; hh.win.style.display = hh.ladder[i].window ? '' : 'none'; return !over(head); }, hh.ladder.length);
    hh.title.textContent = hh.ladder[idx].title; hh.win.textContent = hh.ladder[idx].window; hh.win.style.display = hh.ladder[idx].window ? '' : 'none';
    if(hh.amt && over(head) && hh.amt._payAmt.short) hh.amt.textContent = hh.amt._payAmt.short; // крайній випадок: семизначна сума
  }
  host.querySelectorAll('.pay-line1 .l, .pay-msg .l, .pay-done span.m').forEach(function(el){
    const ladder = el._payLadder; if(!ladder) return;
    const amt = el._payAmt; if(amt) amt.el.textContent = amt.full;
    const put = function(i){ if(el._payParts) payRenderParts(el, el._payParts[i]); else el.textContent = ladder[i]; };
    const idx = pickCardVariant(function(i){ put(i); return !over(el); }, ladder.length);
    put(idx);
    if(amt && amt.short && over(el)) amt.el.textContent = amt.short; // суми праворуч повні; скорочення лише останнім кроком
  });
  const sums = host.querySelectorAll('.pay-sum');
  if(sums.length){
    sums.forEach(function(el){ el.textContent = el._paySum != null ? new Intl.NumberFormat('uk-UA', { maximumFractionDigits: 0 }).format(el._paySum) : ''; });
    const sumOver = function(el){ return el.getBoundingClientRect().width > el.parentElement.clientWidth + 0.5; }; // .pay-sum — inline: scrollWidth не працює, міряємо ширину тексту проти комірки
    if([].some.call(sums, sumOver)) sums.forEach(function(el){ el.textContent = el._paySum != null ? payCompactAmount(el._paySum) : ''; }); // сума дня на екрані «Платежі» завжди повна
  }
}
/* ============ Екран «Платежі» і дії (Rev 2.32.68, P4) ============ */
let isPaymentsOpen = false;
let payActionItem = null;
function payRelative(date, today){
  const n = ppDayDiff(today, date);
  if(n === 0) return 'Сьогодні';
  if(n === 1) return 'Завтра';
  return 'Через ' + n + ' ' + pluralUa(n, ['день', 'дні', 'днів']);
}
// ===== Rev 2.32.418 (DS-PAYLIST Rev 1): екран «Платежі» — підсумок, «Чекає внесення», групи за днями, «Пізніше» по місяцях. Лише вигляд: склад і суми списку дає upcomingPayments без змін; внесення (форма) — наявна підстановка payInstallmentPrefill (зміни — Rev 2). Ризики: тиждень — Пн–Нд за київським «сьогодні»; платіж пільгового дня (дата вчора, не «Чекає внесення» за installmentDuePassed) лишається в групах днів із заголовком «Вчора» і в плитці «Цей тиждень»; усі суми цілі гривні (Math.round на рядок), тож плитки сходяться зі списком; невнесені платежі минулого місяця на екрані не показуються (upcomingPayments бере поточний і наступний місяць; вибраний у застосунку місяць екран зараз не знає — див. DS-PAYLIST Rev 2). =====
const PAY_MONTHS_NOM = ['Січень', 'Лютий', 'Березень', 'Квітень', 'Травень', 'Червень', 'Липень', 'Серпень', 'Вересень', 'Жовтень', 'Листопад', 'Грудень'];
function payWeekEnd(today){ const wd = new Date(Date.UTC(+today.slice(0, 4), +today.slice(5, 7) - 1, +today.slice(8, 10))).getUTCDay(); return ppAddDays(today, wd === 0 ? 0 : 7 - wd); } // неділя поточного тижня (Пн = початок)
function payMonthLast(today){ return ppClampDate(today.slice(0, 7), 31); }
// Сума групи: відомі суми (цілі гривні); «≈», якщо хоч одна очікувана або без суми; усі без суми — null
function paySum(items){
  const known = items.filter(function(x){ return x.amount != null; });
  if(!known.length) return { num: null, approx: false, count: items.length };
  return { num: known.reduce(function(a, x){ return a + x.amount; }, 0), approx: known.length < items.length || items.some(function(x){ return !!x.estimated; }), count: items.length };
}
function paySumText(sm){ return sm.num == null ? (sm.count ? 'сума невідома' : '0 ₴') : (sm.approx ? '≈ ' : '') + payFmt(sm.num); }
function payRowModel(it, today){
  const isInst = it.kind === 'installment';
  const amt = it.amount == null ? null : Math.round(it.amount);
  const kn = isInst && it.k > 0 && it.n > 0 ? ' · ' + it.k + ' з ' + it.n : '';
  return { kind: it.kind, name: it.name, month: it.month, date: it.date, amount: amt, estimated: !!it.estimated, k: it.k || null, n: it.n || null,
    amountPlain: amt == null ? 'сума невідома' : payFmt(amt), approx: amt != null && !!it.estimated, amountText: amt == null ? 'сума невідома' : (it.estimated ? '≈ ' : '') + payFmt(amt),
    sub: isInst ? 'ОЧ' + kn : (it.date ? 'Кредитка · мінімальний платіж' : 'Мінімальний платіж'), day: it.date ? +it.date.slice(8, 10) : null, mon: it.date ? PAY_MONTHS_SHORT[+it.date.slice(5, 7) - 1] : null };
}
// Заголовок групи дня: «Сьогодні» / «Вчора» / «Завтра» (з датою поруч) або «<день тижня>, <дата>»
function payDayLabel(date, today){
  const n = ppDayDiff(today, date), dd = payDow(date) + ', ' + payDateShort(date);
  if(n === 0) return { title: 'Сьогодні', sub: dd };
  if(n === 1) return { title: 'Завтра', sub: dd };
  if(n === -1) return { title: 'Вчора', sub: dd };
  return { title: dd, sub: '' };
}
function payDayGroups(items, today){
  const out = [], byDate = {};
  items.forEach(function(it){
    const row = payRowModel(it, today);
    if(!byDate[it.date]){ const l = payDayLabel(it.date, today); byDate[it.date] = { date: it.date, title: l.title, sub: l.sub, rows: [], items: [] }; out.push(byDate[it.date]); }
    byDate[it.date].rows.push(row); byDate[it.date].items.push(row);
  });
  out.forEach(function(g){ const sm = paySum(g.items); g.sum = { num: sm.num, approx: sm.approx }; g.sumText = paySumText(sm); delete g.items; });
  return out;
}
// Плитки: «Чекає внесення» (r.unconfirmed = installmentDuePassed, без зміни формул), «Цей тиждень» (до неділі, разом із пільговим днем), «До кінця місяця» (з понеділка наступного тижня до останнього дня місяця); набори не перетинаються
function payTilesModel(r, today){
  const sun = payWeekEnd(today), eom = payMonthLast(today), all = r.items.concat(r.later);
  const sets = { wait: r.unconfirmed.slice(), week: all.filter(function(x){ return x.date <= sun; }), rest: all.filter(function(x){ return x.date > sun && x.date <= eom; }) };
  const mk = function(key, label, list){
    const rows = list.map(function(x){ return payRowModel(x, today); }), sm = paySum(rows);
    return { key: key, label: label, count: list.length, countText: list.length + ' ' + payPlural(list.length), sum: { num: sm.num, approx: sm.approx }, sumText: paySumText(sm), amber: key === 'wait' && list.length > 0 };
  };
  return [mk('wait', 'Чекає внесення', sets.wait), mk('week', 'Цей тиждень', sets.week), mk('rest', 'До кінця місяця', sets.rest)];
}
// Модель екрана (без DOM). r — результат upcomingPayments (horizon 14).
function paymentsScreenModel(r, today){
  const wait = r.unconfirmed.map(function(x){ const row = payRowModel(x, today); row.text = 'Платіж ' + payDateShort(x.date) + ' ще не внесено у витрати'; row.action = x.kind === 'installment' ? 'Внести платіж' : 'Позначити сплаченим'; return row; });
  const days = payDayGroups(r.items, today), winSum = paySum(r.items.map(function(x){ return payRowModel(x, today); }));
  const win = r.items.length ? { title: 'Найближчі 14 днів', count: r.items.length, countText: r.items.length + ' ' + payPlural(r.items.length), sumText: paySumText(winSum), days: days } : null;
  const months = [], byM = {};
  r.later.forEach(function(x){ const k = x.date.slice(0, 7); if(!byM[k]){ byM[k] = { key: k, title: PAY_MONTHS_NOM[+k.slice(5, 7) - 1], list: [] }; months.push(byM[k]); } byM[k].list.push(x); });
  const later = months.map(function(m){ const rows = m.list.map(function(x){ return payRowModel(x, today); }), sm = paySum(rows); return { key: m.key, title: m.title, count: m.list.length, countText: m.list.length + ' ' + payPlural(m.list.length), sumText: paySumText(sm), days: payDayGroups(m.list, today) }; });
  const undated = r.undatedList.map(function(x){ const row = payRowModel(x, today); row.amountText = payFmt(x.amount); row.amountPlain = payFmt(x.amount); row.approx = false; return row; });
  const empty = !wait.length && !win && !later.length && !undated.length;
  const noday = r.noDay.map(function(name){ return { kind: 'installment', name: name, month: today.slice(0, 7), date: null, amount: null, estimated: false, amountText: '', amountPlain: '', approx: false, sub: 'Без дня платежу', go: 'installments', day: null, mon: null }; });
  return { tiles: payTilesModel(r, today), wait: wait, window: win, later: later, undated: undated, undatedCaption: 'Це мінімальні платежі з «Обліку». Додайте день платежу в картці, і вона з\'явиться в календарі.', noday: noday, nodayCaption: 'Додайте день платежу в ОЧ («Облік» → ОЧ), і платіж з\'явиться в календарі.', empty: empty, caption: 'Суми з «≈» очікувані за попередніми місяцями. Торкніться платежу, щоб внести його й зафіксувати факт.' };
}
// Дії для рядка: ОЧ — «Внести платіж»; картка — «Позначити сплаченим» (витрата не створюється).
function payActionModel(item){
  if(item.kind === 'installment') return { title: item.name, sub: (item.date ? +item.date.slice(8, 10) + ' ' + PAY_MONTHS_GEN[+item.date.slice(5, 7) - 1] + ' · ' : '') + payAmountText(item), primary: 'Внести платіж', note: 'Відкриється форма витрати з підставленими сумою, датою й ОЧ. Збереження лише вашим дотиком.' };
  return { title: item.name, sub: 'Мінімальний платіж · ' + payFmt(item.amount), primary: 'Позначити сплаченим', note: 'Це не витрата: змінюється лише позначка в «Обліку».' };
}
// Допоміжні для розмітки екрана (innerHTML лише для логотипа bankIcon, дані — textContent)
let payLaterOpen = {};
function payLogoEl(name, kind){ const e = payEl('span', 'pl-logo'); e.setAttribute('aria-hidden', 'true'); e.innerHTML = bankIcon(stripLeadingEmoji(name), 40, true, kind === 'card' ? 'card' : 'installment'); return e; }
function payAmtEl(cls, r){ const e = payEl('span', cls); if(r.approx) e.appendChild(payEl('span', 'pl-approx', '≈ ')); e.appendChild(document.createTextNode(r.amountPlain)); return e; }
function paySumEl(cls, sum, text){ const e = payEl('span', cls); if(sum.num != null && sum.approx) e.appendChild(payEl('span', 'pl-approx', '≈ ')); e.appendChild(document.createTextNode(sum.num != null && sum.approx ? text.replace(/^≈\s*/, '') : text)); return e; }
function payRowBtn(r){
  const b = payEl('button', 'pay-line'); b.type = 'button';
  if(r.date) b.setAttribute('data-date', r.date);
  if(r.date !== null || r.kind === 'card') b.appendChild(payLogoEl(r.name, r.kind));
  const main = payEl('span', 'pay-line-main'); main.appendChild(payEl('span', 'pay-line-name', stripLeadingEmoji(r.name))); main.appendChild(payEl('span', 'pay-line-sub', r.sub)); b.appendChild(main);
  if(r.amountPlain) b.appendChild(payAmtEl('pay-line-amt', r));
  if(r.date === null){ const ch = payEl('span', 'pay-line-chev'); ch.innerHTML = PAY_CHEV_SVG; b.appendChild(ch); }
  b.addEventListener('click', function(){ if(r.go === 'installments') openInstallmentFromPayments(r.name); else openPayAction(r); /* Rev 2.32.170: «ОЧ без дати» → «Облік» → ОЧ; рядок платежу — наявна шторка дії (Rev 2.32.418: без змін логіки, внесення — Rev 2) */ });
  return b;
}
function payDayGroupEl(g){
  const wrap = payEl('div', 'struct-section pl-day');
  const hd = payEl('div', 'pl-dayhead'); const t = payEl('span', 'pl-daytitle', g.title); if(g.sub) t.appendChild(payEl('span', 'pl-daysub', ' · ' + g.sub)); hd.appendChild(t); hd.appendChild(paySumEl('pl-daysum', g.sum, g.sumText)); wrap.appendChild(hd);
  const box = payEl('div', 'struct-group'); g.rows.forEach(function(r){ box.appendChild(payRowBtn(r)); }); wrap.appendChild(box);
  return wrap;
}
function payTilesEl(tiles){
  const row = payEl('div', 'pl-tiles');
  tiles.forEach(function(t){ const c = payEl('div', 'pl-tile' + (t.amber ? ' amber' : '')); c.appendChild(payEl('span', 'pl-tile-lab', t.label)); c.appendChild(paySumEl('pl-tile-amt', t.sum, t.sumText)); c.appendChild(payEl('span', 'pl-tile-cnt', t.countText)); row.appendChild(c); });
  return row;
}
function payWaitEl(rows){
  const sec = payEl('div', 'struct-section');
  sec.appendChild(payEl('div', 'pl-wait-title', 'Чекає внесення · ' + rows.length));
  rows.forEach(function(r){
    const card = payEl('div', 'pl-wait'); const top = payEl('div', 'pl-wait-row');
    top.appendChild(payLogoEl(r.name, r.kind)); const tx = payEl('span', 'pl-wait-text'); tx.appendChild(payEl('span', 'pay-line-name', stripLeadingEmoji(r.name))); tx.appendChild(payEl('span', 'pl-wait-sub', r.text)); top.appendChild(tx); top.appendChild(payAmtEl('pay-line-amt', r)); card.appendChild(top);
    const btn = payEl('button', 'submit-btn pill', r.action); btn.type = 'button';
    btn.addEventListener('click', function(){ if(r.kind === 'installment') payInstallmentPrefill(r); else openPayAction(r); }); // Rev 2.32.418: ОЧ — наявна підстановка без змін логіки; картка — наявна шторка «Позначити сплаченим» (не витрата)
    card.appendChild(btn); sec.appendChild(card);
  });
  return sec;
}
function payLaterEl(months){
  const sec = payEl('div', 'struct-section'); sec.appendChild(payEl('div', 'struct-group-label', 'Пізніше'));
  const box = payEl('div', 'struct-group');
  months.forEach(function(m){
    const open = !!payLaterOpen[m.key];
    const b = payEl('button', 'pay-line pl-month'); b.type = 'button'; b.setAttribute('aria-expanded', open ? 'true' : 'false');
    const main = payEl('span', 'pay-line-main'); main.appendChild(payEl('span', 'pay-line-name', m.title)); main.appendChild(payEl('span', 'pay-line-sub', m.countText)); b.appendChild(main);
    b.appendChild(payMonthSumEl(m));
    const ch = payEl('span', 'pay-line-chev'); ch.innerHTML = PAY_CHEV_SVG; b.appendChild(ch);
    b.addEventListener('click', function(){ payLaterOpen[m.key] = !payLaterOpen[m.key]; renderPaymentsScreen(); });
    box.appendChild(b);
    if(open){ const body = payEl('div', 'pl-month-body'); m.days.forEach(function(g){ body.appendChild(payDayGroupEl(g)); }); box.appendChild(body); }
  });
  sec.appendChild(box);
  return sec;
}
function payMonthSumEl(m){ const approx = /^≈/.test(m.sumText); return paySumEl('pay-line-amt', { num: approx ? 1 : 0, approx: approx }, m.sumText); }
function payExtraEl(title, rows, caption){
  const wrap = payEl('div', 'struct-section'); wrap.appendChild(payEl('div', 'struct-group-label', title + ' · ' + rows.length));
  const g = payEl('div', 'struct-group'); rows.forEach(function(r){ g.appendChild(payRowBtn(r)); }); wrap.appendChild(g);
  wrap.appendChild(payEl('div', 'struct-caption', caption)); return wrap;
}
function renderPaymentsScreen(){
  const body = document.getElementById('payments-body');
  if(!body) return;
  const today = kyivTodayISO();
  const m = paymentsScreenModel(computeUpcomingNow(14), today);
  body.textContent = '';
  if(m.empty){ body.appendChild(payEl('div', 'mono-note', 'Найближчих платежів немає')); body.appendChild(payEl('div', 'struct-caption', m.caption)); }
  else body.appendChild(payTilesEl(m.tiles));
  if(m.wait.length) body.appendChild(payWaitEl(m.wait));
  if(m.window){
    body.appendChild(payEl('div', 'struct-group-label pl-winlabel', m.window.title + ' · ' + m.window.countText + ' · ' + m.window.sumText));
    m.window.days.forEach(function(g){ body.appendChild(payDayGroupEl(g)); });
  }
  if(m.later.length) body.appendChild(payLaterEl(m.later));
  if(m.undated.length) body.appendChild(payExtraEl('Картки без дати', m.undated, m.undatedCaption));
  if(m.noday.length) body.appendChild(payExtraEl('ОЧ без дати', m.noday, m.nodayCaption)); // Rev 2.32.167 (PAY-STRIP): назви ОЧ без дня платежу; тап веде в «Облік» → ОЧ
  if(!m.empty) body.appendChild(payEl('div', 'struct-caption', m.caption));
}
function openPaymentsScreen(date){
  const screen = document.getElementById('payments-screen');
  if(!screen) return;
  if(!isPaymentsOpen){ lastFocusedBeforeDialog = document.activeElement; lockBackgroundScroll(); payLaterOpen = {}; } // Rev 2.32.418: місяці «Пізніше» за замовчуванням згорнуті при кожному відкритті екрана
  isPaymentsOpen = true;
  renderPaymentsScreen();
  screen.classList.remove('hidden'); screen.removeAttribute('inert'); screen.scrollTop = 0;
  if(date){
    const line = screen.querySelector('.pay-line[data-date="' + date + '"]');
    if(line){ try{ line.scrollIntoView({ block: 'center' }); }catch(e){} line.classList.add('flash'); setTimeout(function(){ line.classList.remove('flash'); }, 1600); }
  }
}
function closePaymentsScreen(){
  if(!isPaymentsOpen) return;
  closePayAction();
  isPaymentsOpen = false;
  const screen = document.getElementById('payments-screen');
  if(screen){ screen.classList.add('hidden'); screen.setAttribute('inert', ''); }
  unlockBackgroundScroll();
  restoreFocus();
}
function openPayAction(item){
  payActionItem = item;
  const m = payActionModel(item);
  document.getElementById('pay-action-title').textContent = m.title;
  document.getElementById('pay-action-sub').textContent = m.sub;
  document.getElementById('pay-action-note').textContent = m.note;
  const primary = document.getElementById('pay-action-primary');
  primary.textContent = m.primary;
  primary.onclick = function(){ if(item.kind === 'installment') payInstallmentPrefill(item); else markCardMinPaid(item); };
  document.getElementById('pay-action-open').onclick = function(){ openPaymentInAccounts(item); };
  const wasOpen = document.getElementById('pay-action-drawer').classList.contains('open');
  document.getElementById('pay-action-backdrop').removeAttribute('inert'); document.getElementById('pay-action-backdrop').classList.add('open');
  document.getElementById('pay-action-drawer').removeAttribute('inert'); document.getElementById('pay-action-drawer').classList.add('open');
  if(!wasOpen){ const d = document.getElementById('pay-action-drawer'); if(!d.hasAttribute('tabindex')) d.setAttribute('tabindex', '-1'); try{ d.focus({ preventScroll: true }); }catch(e){} lockBackgroundScroll(); }
}
function closePayAction(){
  const d = document.getElementById('pay-action-drawer');
  if(!d || !d.classList.contains('open')) return;
  document.getElementById('pay-action-backdrop').classList.remove('open'); document.getElementById('pay-action-backdrop').setAttribute('inert', '');
  d.classList.remove('open'); d.setAttribute('inert', '');
  payActionItem = null;
  unlockBackgroundScroll();
}
// «Внести платіж»: форма витрати з підставленими сумою (очікуваною), датою платежу, категорією ОЧ і назвою ОЧ (автозв'язок). Збереження — лише дотиком користувача (нічого не створюється автоматично).
function payInstallmentPrefill(item){
  const i = installmentAccounts.findIndex(function(a){ return a.name === item.name; });
  if(i < 0) return;
  closePaymentsScreen();
  switchTab('vytraty');
  document.getElementById('expfielda7').value = stripLeadingEmoji(item.name);
  if(item.amount != null) document.getElementById('f-amount').value = formatThousands(item.amount);
  if(item.date){ document.getElementById('f-date').value = item.date; rolloverState.dateManual = true; updateDateCaption(); }
  const ochCat = CATEGORIES.find(function(c){ return c.active && c.name === '🏦 Оплати Частинами'; });
  if(ochCat){ setCategorySelect(ochCat.name, true); }
  confirmedInstallmentLinkIdx = i;
  pendingInstallmentMatchIndices = [];
  renderInstallmentLinkHint();
  document.getElementById('auto-hint').classList.toggle('show', !!ochCat);
  if(ochCat) document.getElementById('auto-hint-text').textContent = ochCat.name;
  setTimeout(function(){ const el = document.getElementById('f-amount'); if(el){ el.focus(); el.select(); } }, 80);
}
// «Позначити сплаченим» для картки: min_payment_done = true у записі місяця (витрата не створюється).
async function markCardMinPaid(item){
  const idx = debts.findIndex(function(d){ return d.kind === 'card' && d.name === item.name && monthKey2(d.month) === item.month && !d.deletedAt; });
  if(idx < 0){ showTextToast('Запис місяця не знайдено', 'error'); return; }
  debts[idx].minPaymentDone = true;
  debts[idx].updatedAt = new Date().toISOString();
  reportSaveResult(await saveDebts());
  pushDebtRecordPilot(debts[idx]);
  closePayAction();
  renderAll();
  showToast({ kind: 'success', title: 'Позначено сплаченим', subtitle: item.name });
}
function openPaymentInAccounts(item){
  closePaymentsScreen();
  if(item.month && item.month !== selectedMonth && allMonths().includes(item.month)) performMonthChange(item.month);
  performSwitchTab('accounting');
  if(item.kind === 'installment'){
    switchAccountingTab('installments');
    const i = installmentAccounts.findIndex(function(a){ return a.name === item.name; });
    if(i >= 0) setTimeout(function(){ openInstallmentEditor(i); }, 250);
  }else{
    switchAccountingTab('debts');
    const i = bankAccounts.findIndex(function(a){ return a.name === item.name; });
    if(i >= 0) setTimeout(function(){ openCardDebtEditor(i); }, 250);
  }
}

function typicalMonthlyPayment(name, kind, beforeMonth){
  // Rev #30 (6D.44) — activeDebts(), той самий принцип, що lastKnownBalance().
  const records = activeDebts()
    .filter(d=> d.name===name && d.kind===kind && d.month<beforeMonth && d.monthlyPayment!=null && !isHiddenForMonth(d.name, d.kind, beforeMonth))
    .sort((a,b)=> a.month.localeCompare(b.month)); // хронологічно, щоб тай-брейк природно брав новіший запис
  if(!records.length) return null;
  const counts = {};
  records.forEach(r=>{ counts[r.monthlyPayment] = (counts[r.monthlyPayment]||0) + 1; });
  let best = records[records.length-1].monthlyPayment, bestCount = 0;
  records.forEach(r=>{
    const c = counts[r.monthlyPayment];
    if(c >= bestCount){ bestCount = c; best = r.monthlyPayment; } // >= разом з хронологічним порядком масиву = новіший виграє тай-брейк
  });
  return best;
}
// Rev 2.2.2 — Модель C (FINANCIAL_RULES §4): сума ВИТРАТ, явно прив'язаних
// (через автозв'язок, метод C) до конкретної ОЧ за конкретний місяць. Коли
// така сума є — вона точніша основа для "очікуваного залишку", ніж
// typicalMonthlyPayment() вище (той лише статистична здогадка за відсутності
// реальних прив'язаних даних цього місяця).
// Rev #30 (6D.44) — Самокорекція: activeExpenses() замість сирого expenses
// — знайдено ПІД ЧАС 6D.44, хоча зачіпає 6D.42/expenses (переніс сюди, а не
// назад у 6D.42, бо саме зараз наскрізна перевірка debts-carry-forward
// (estimateInstallment→linkedExpensesSum) це виявила). Видалена витрата не
// мала б і надалі "рахуватись оплатою" ОЧ цього місяця (paid-бейдж,
// estimateInstallment) — той самий grep-розрив, що й пропущені .findIndex(/
// .slice()/.length раніше: `expenses` і `.filter(` тут на РІЗНИХ рядках,
// рядковий grep їх не бачив разом.
function linkedExpensesSum(installmentName, month){
  return activeExpenses()
    .filter(e => e.linkedInstallment===installmentName && monthKey(e.date)===month)
    .reduce((s,e)=>s+e.amount, 0);
}

// Rev #30 (6D.39) — Sync Safety Patch P1.1: текст попередження уточнено —
// раніше формулювання "видалити... з цього браузера" вже натякало на
// локальність, але не пояснювало явно, що станеться з Cloud-копією. Хибне
// враження "це видалить усе назавжди, разом з Cloud" могло зупинити
// користувача від корисної дії (напр. очистити тестові дані локально) або,
// навпаки, налякати "а раптом і Family-дані на іншому пристрої зникнуть?".
// Сама функціональність clearAllData() — без жодної зміни, лише текст.
function clearAllData(){
  showConfirmModal('Очистити дані на цьому пристрої (витрати, доходи, борги, картки/ОЧ)? Це не зачіпає Cloud-копію — якщо синхронізація увімкнена, дані повернуться з Cloud при наступній синхронізації. Локальні незбережені зміни буде втрачено.', async function(){
    expenses = []; incomes = []; debts = [];
    // Rev 2.3.8 BugFix — раніше тут скидались лише expenses/incomes/debts, а
    // керовані списки bankAccounts/installmentAccounts і hiddenFrom лишались
    // висіти "привидами" з порожніми/застарілими значеннями (симптом:
    // "порожні" ОЧ далі показувались в Обліку після очищення). Це також
    // могло створювати дублікати при повторному імпорті Excel: якщо ОЧ була
    // раніше перейменована в застосунку, стара (перейменована) конфігурація
    // лишалась в installmentAccounts, а новий імпорт зі свіжого Excel-файлу
    // (де назва й досі оригінальна) створював ДРУГИЙ запис під оригінальною
    // назвою — дедуплікація імпорту звіряється з уже "забрудненим" списком.
    // Повне очищення тепер справді повне — банки/ОЧ теж скидаються до стану
    // "як після першого запуску" (bankAccounts — дефолтний набір, той самий,
    // що на чистій інсталяції; installmentAccounts — порожній, бо дефолтного
    // набору ОЧ немає).
    bankAccounts = []; // Rev 2.32.136: «як після першого запуску» = порожньо (стандартних карток нема)
    installmentAccounts = [];
    hiddenFrom = {};
    ignoredDivergences = {}; // Rev 2.16.2 — той самий принцип: без боргів ігноровані розбіжності теж втрачають сенс
    // Rev #30 (6D.63) — КРИТИЧНИЙ фікс: clearAllData() ніколи не скидала
    // lastSyncMarker (6D.38, інкрементальний pull) — після очищення
    // локальних масивів наступний pull все одно фільтрував за СТАРИМ
    // маркером (`updated_at >= маркер`), тихо ігноруючи ВСЮ історію,
    // старішу за нього. Локальні дані щойно стерті, а маркер "думає", що
    // вони й досі там — інкрементальний pull повертав лише кілька
    // найновіших рядків замість повної історії. Знайдено користувачем:
    // "видалив всі дані... з хмари тягнеться лише невелика частина".
    clearSyncMarkers();
    // Rev #28.D2 — 3 нижче тепер теж routing-aware (той самий принцип, що 4 D1 нижче).
    reportSaveResult(await saveExpenses());
    reportSaveResult(await saveIncomes());
    reportSaveResult(await saveDebts());
    // Rev #28.D1 — 4 нижче тепер routing-aware: для мігрованого домену
    // пишуть в IndexedDB, не в localStorage — clearAllData() коректно
    // очищує ОБИДВА можливі сховища через ту саму saveX(), не знаючи, де
    // саме дані фізично лежать (invariant, ROADMAP п.28).
    reportSaveResult(await saveBankAccounts());
    reportSaveResult(await saveInstallmentAccounts());
    reportSaveResult(await saveHiddenFrom());
    reportSaveResult(await saveIgnoredDivergences());
    populateMonths(); renderAll();
    document.getElementById('import-status').textContent = 'Усі дані очищено.';
  });
}
(window.__MT_FILES = window.__MT_FILES || []).push('payments.js');
