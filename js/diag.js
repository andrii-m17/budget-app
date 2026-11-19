// Діагностика: журнал JS-помилок, діагностика даних, «чорна скринька», бортовий самописець (білі списки REC_ALLOWED_*)
// Перенесено з index.html дослівно, без змін (Rev 2.32.351, STRUCT-3). Звичайний скрипт: функції й const/let лишаються глобальними; підключається в index.html перед основним <script>; оператори верхнього рівня цієї області лишились в основному скрипті.

/* ============ Помилки JavaScript у рекордері (Rev 2.32.53, J) ============
   Причина: виняток kbMode/focusCardField на iPhone довго лишався непомітним — рекордер не записував винятки. Тепер window.onerror і unhandledrejection фіксуються: повідомлення (≤160 символів, без довгих чисел і email), джерело без параметрів запиту, назви 3 перших кадрів стека, вкладка, лічильник повторів. Значень користувача немає. Однакові помилки (повідомлення + джерело) зливаються в одну з count. До старту запису — буфер до 20 унікальних, при старті виводиться як js-error-backlog. */
const JS_ERROR_BUFFER_MAX = 20;
function scrubJsErrorText(text, max){
  return String(text == null ? '' : text).replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '<email>').replace(/\d[\d\s.,:-]{5,}\d/g, '<num>').replace(/\s+/g, ' ').trim().slice(0, max || 160);
}
// Rev 2.32.260 (REC-1): стан самописця оголошено рано (помилки JS можуть статись до решти скрипта); recOn() безпечна до ініціалізації debugRecordingActive.
let recBgOn = false;
function recOn(){ try{ return !!(debugRecordingActive || recBgOn); }catch(e){ return !!recBgOn; } }
// Джерело: останній сегмент шляху + рядок (без параметрів запиту й хешу); порожньо, якщо немає.
function jsErrorSource(filename, lineno){
  const f = String(filename || '').split('#')[0].split('?')[0].split('/').pop();
  return f ? (f + (lineno ? ':' + lineno : '')) : '';
}
// Назви перших 3 кадрів (V8: «at fn (file:l:c)», Safari: «fn@file:l:c»); лише імена функцій.
function jsErrorStackTop(stack){
  const out = [];
  String(stack || '').split('\n').forEach(function(line){
    if(out.length >= 3) return;
    const t = line.trim();
    let m = t.match(/^at\s+(?:async\s+)?([^\s(]+)\s*\(/) || t.match(/^([^@\s]+)@/);
    if(m && m[1]) out.push(scrubJsErrorText(m[1], 40));
  });
  return out;
}
function jsErrorKey(message, source){ return message + '|' + source; }
let jsErrorList = [];       // унікальні помилки сеансу: { key, message, source, stackTop, tab, count }
let jsErrorEvents = {};     // key → подія рекордера (щоб при повторі оновлювати count)
function recordJsError(info){
  try{
    const message = scrubJsErrorText(info && info.message, 160) || 'Помилка';
    const source = jsErrorSource(info && info.filename, info && info.lineno);
    const key = jsErrorKey(message, source);
    let tab = null; try{ tab = lastActiveTab || null; }catch(e){}
    let rec = jsErrorList.filter(function(r){ return r.key === key; })[0];
    if(rec){ rec.count++; }
    else{
      rec = { key: key, message: message, source: source, stackTop: jsErrorStackTop(info && info.stack), tab: tab, count: 1 };
      jsErrorList.push(rec);
      if(jsErrorList.length > JS_ERROR_BUFFER_MAX) jsErrorList.shift();
    }
    try{
      if(recOn() && !debugRecordingActive){ if(rec.count === 1 || (rec.count & (rec.count - 1)) === 0) pushDebugEvent({ t: Math.round(performance.now()), type: 'js-error', message: rec.message, source: rec.source, stackTop: rec.stackTop, tab: rec.tab, count: rec.count }); if(rec.count === 1) recTrigger('js-error'); }
      if(debugRecordingActive){
        const ev = jsErrorEvents[key];
        if(ev){ ev.count = rec.count; }
        else{
          pushDebugEvent({ t: Math.round(performance.now() - debugRecordingStartedAt), type: 'js-error', message: rec.message, source: rec.source, stackTop: rec.stackTop, tab: rec.tab, count: rec.count });
          jsErrorEvents[key] = debugEventBuffer[debugEventBuffer.length - 1];
        }
      }
    }catch(e){}
    try{ updateJsErrorsRow(); }catch(e){}
    try{ jsErrPersist(rec); }catch(e){} // Rev 2.32.123 (JSERR-1): лише режим розробника (див. нижче); основний облік вище не змінено
  }catch(e){}
}
function updateJsErrorsRow(){
  const b = document.getElementById('js-errors-count'); // Rev 2.32.189 (CHECKS-1): число в рядку «Журнал помилок JS»
  if(b) b.textContent = String(jsErrorList.reduce(function(n, r){ return n + r.count; }, 0));
}
function showJsErrors(){
  const last = jsErrorList.slice(-5).reverse();
  showAlertModal(last.length ? last.map(function(r){ return '• ' + r.message + (r.source ? ' (' + r.source + ')' : '') + (r.tab ? ' · ' + r.tab : '') + (r.count > 1 ? ' ×' + r.count : ''); }).join('\n') : 'Помилок за цей сеанс не було.');
}
// ===== Rev 2.32.123 (JSERR-1): кільцевий журнал помилок JavaScript в IndexedDB (лише режим розробника) =====
// Вмикається тим самим перемикачем розробника, що «Розширена діагностика сповіщень» (прапорець у IndexedDB 'budget-app-push-diag'); ВИМКНЕНО за замовчуванням: тоді нічого не пишеться. Окрема база 'budget-app-js-errors' (щоб не міняти схему бази діагностики push, яку читає sw.js). Записи ті самі, що вже обробляє recordJsError (повідомлення очищене scrubJsErrorText: до 160 символів, без email і довгих чисел; файл:рядок; імена 3 кадрів; вкладка): жодних значень користувача. Кільце ≤ 50 унікальних (дублікат = count й час останньої появи), ліміт частоти ≤ 10 записів за хвилину (шторм помилок не навантажує сховище), усе best-effort без винятків. Журнал переживає закриття PWA й потрапляє в «Надіслати лог сповіщень» разом з іншим.
const JSERR_DB_NAME = 'budget-app-js-errors';
const JSERR_STORE = 'errors';
const JSERR_RING_MAX = 50;
const JSERR_RATE_MAX = 10;
const JSERR_RATE_WINDOW_MS = 60000;
let jsErrPersistOn = false;
let jsErrRateLog = [];
function jsErrOpen(){
  return new Promise(function(resolve, reject){
    try{
      const req = indexedDB.open(JSERR_DB_NAME, 1);
      req.onupgradeneeded = function(){ if(!req.result.objectStoreNames.contains(JSERR_STORE)) req.result.createObjectStore(JSERR_STORE, { keyPath: 'id', autoIncrement: true }); };
      req.onsuccess = function(){ resolve(req.result); };
      req.onerror = function(){ reject(req.error); };
    }catch(e){ reject(e); }
  });
}
function jsErrRateAllow(now){
  jsErrRateLog = jsErrRateLog.filter(function(t){ return now - t < JSERR_RATE_WINDOW_MS; });
  if(jsErrRateLog.length >= JSERR_RATE_MAX) return false;
  jsErrRateLog.push(now);
  return true;
}
// rec — запис recordJsError { key, message, source, stackTop, tab, count }; повертає проміс (ніколи не відхиляється).
function jsErrPersist(rec){
  if(!jsErrPersistOn || !rec) return Promise.resolve(false);
  const now = Date.now();
  if(!jsErrRateAllow(now)) return Promise.resolve(false);
  const entry = { key: String(rec.key || '').slice(0, 220), ts: now, message: String(rec.message || '').slice(0, 80), source: String(rec.source || '').slice(0, 60), stackTop: (rec.stackTop || []).slice(0, 3).map(function(x){ return String(x).slice(0, 40); }), tab: rec.tab ? String(rec.tab).slice(0, 30) : null, count: rec.count || 1 };
  return jsErrOpen().then(function(db){
    return new Promise(function(resolve){
      const tx = db.transaction(JSERR_STORE, 'readwrite');
      const store = tx.objectStore(JSERR_STORE);
      const all = store.getAll();
      all.onsuccess = function(){
        const rows = all.result || [];
        const same = rows.filter(function(r){ return r.key === entry.key; })[0];
        if(same){ same.ts = now; same.count = Math.max(entry.count, (same.count || 1) + 1); store.put(same); }
        else{
          store.add(entry);
          const extra = rows.length + 1 - JSERR_RING_MAX;
          if(extra > 0) rows.sort(function(a, b){ return (a.ts || 0) - (b.ts || 0); }).slice(0, extra).forEach(function(r){ store.delete(r.id); });
        }
      };
      tx.oncomplete = function(){ db.close(); resolve(true); };
      tx.onerror = tx.onabort = function(){ try{ db.close(); }catch(e){} resolve(false); };
    });
  }).catch(function(){ return false; });
}
function jsErrReadAll(){
  return jsErrOpen().then(function(db){
    return new Promise(function(resolve){
      const all = db.transaction(JSERR_STORE, 'readonly').objectStore(JSERR_STORE).getAll();
      all.onsuccess = function(){ db.close(); resolve((all.result || []).sort(function(a, b){ return (a.ts || 0) - (b.ts || 0); })); };
      all.onerror = function(){ db.close(); resolve([]); };
    });
  }).catch(function(){ return []; });
}
// Rev 2.32.131: що показати за кнопкою «Показати журнал помилок JS»: вимкнена діагностика → підказка; увімкнена без записів → «Помилок немає»; інакше до 30 останніх (новіші вгорі).
function jsErrLogView(diagOn, rows){
  if(!diagOn) return { message: 'Увімкніть розширену діагностику, щоб вести журнал помилок JS', rows: [] };
  const list = (Array.isArray(rows) ? rows : []).slice(-30).reverse();
  return list.length ? { message: '', rows: list } : { message: 'Помилок немає', rows: [] };
}
// Rev 2.32.189 (CHECKS-1): рядок «Журнал помилок JS» з лічильником сам відкриває журнал (раніше окрема кнопка «Показати журнал помилок JS»): при увімкненій розширеній діагностиці — кільцевий журнал (до 30, новіші вгорі), інакше помилки цього сеансу (showJsErrors).
async function showJsErrorsLog(){
  const list = document.getElementById('js-errors-list'); const btn = document.getElementById('js-errors-btn');
  if(!list) return;
  if(list.childNodes.length){ list.textContent = ''; if(btn) btn.setAttribute('aria-expanded', 'false'); return; }
  if(!(await readPushDiagFlag())){ showJsErrors(); return; }
  const view = jsErrLogView(true, await jsErrReadAll());
  if(btn) btn.setAttribute('aria-expanded', 'true');
  if(view.message){ list.textContent = view.message; return; }
  view.rows.forEach(function(e){ const row = document.createElement('div'); row.className = 'n-diag-row'; const sp = document.createElement('span'); sp.textContent = jsErrEntryLine(e); row.appendChild(sp); list.appendChild(row); });
}
function jsErrClear(){
  return jsErrOpen().then(function(db){
    return new Promise(function(resolve){
      const tx = db.transaction(JSERR_STORE, 'readwrite');
      tx.objectStore(JSERR_STORE).clear();
      tx.oncomplete = function(){ db.close(); resolve(true); };
      tx.onerror = function(){ db.close(); resolve(false); };
    });
  }).catch(function(){ return false; });
}
function jsErrEntryLine(e){
  const d = new Date(e.ts || 0); const two = function(n){ return String(n).padStart(2, '0'); };
  return two(d.getDate()) + '.' + two(d.getMonth() + 1) + ' ' + two(d.getHours()) + ':' + two(d.getMinutes()) + ' · ' + (e.message || 'Помилка') + (e.source ? ' (' + e.source + ')' : '') + (e.tab ? ' · ' + e.tab : '') + (e.count > 1 ? ' ×' + e.count : '');
}
// Події для логу: ті самі поля, що й js-error у рекордері (без значень користувача).
function jsErrToLogEvents(rows){
  return (rows || []).map(function(e){ return { ev: 'js-error', ts: e.ts, message: e.message, source: e.source, stackTop: e.stackTop, tab: e.tab, count: e.count }; });
}
function jsErrorBacklogLines(list){ return (list || []).map(function(r){ return r.message + (r.source ? ' @ ' + r.source : '') + ' ×' + r.count; }); }

function findExpenseIdIssues(){
  const issues = [];
  const seen = new Map();
  // Rev #30 (6D.42) — activeExpenses(): видалений (tombstoned) запис
  // недосяжний із Журналу, тож "перейти до нього" (goToDiagnosticIssue)
  // однаково нікуди не веде — і, критичніше, idx тут має відповідати ТОМУ
  // САМОМУ __srcIdx, що будує Журнал (renderRecords/renderJournalView) —
  // обидва мають фільтруватись однаково, інакше idx розійдеться.
  activeExpenses().forEach(function(e, idx){
    if(!e.id || typeof e.id !== 'string'){
      issues.push({ label: e.name || '(без назви)', date: e.date || '—', reason: 'відсутній або невалідний UUID', target: { type:'expense', idx: idx } });
      return;
    }
    if(seen.has(e.id)){
      const other = seen.get(e.id);
      issues.push({ label: e.name || '(без назви)', date: e.date || '—', reason: `дубльований UUID (як у «${other.name||'—'}», ${other.date||'—'})`, target: { type:'expense', idx: idx } });
    }else{
      seen.set(e.id, e);
    }
  });
  return issues;
}
// Записи, де updatedAt раніше за createdAt — неможливо за нормального
// життєвого циклу (ensureExpenseIdentity/saveRecordEdit завжди рухають
// updatedAt вперед), ознака пошкодженого чи вручну відредагованого JSON.
function findTimestampIssues(){
  const issues = [];
  // Rev #30 (6D.42) — activeExpenses(), той самий принцип, що findExpenseIdIssues() вище.
  activeExpenses().forEach(function(e, idx){
    if(e.createdAt && e.updatedAt && Date.parse(e.updatedAt) < Date.parse(e.createdAt)){
      issues.push({ label: e.name || '(без назви)', date: e.date || '—', reason: 'updatedAt раніше за createdAt', target: { type:'expense', idx: idx } });
    }
  });
  return issues;
}
// ОЧ без обов'язкових полів — без initialAmount неможливо порахувати
// "Скорочення боргу" від початкової суми, без назви запис узагалі "невидимий".
function findInstallmentFieldIssues(){
  return installmentAccounts
    .filter(function(acc){ return acc.initialAmount == null || acc.initialAmount === '' || !acc.name; })
    .map(function(acc){
      return {
        label: acc.name || '(без назви)',
        date: acc.firstMonth || '—',
        reason: !acc.name ? 'відсутня назва' : 'відсутня початкова сума (initialAmount)',
        target: { type:'installment', name: acc.name || null }
      };
    });
}
// Rev 2.32.178 (ID-BIND-1): однакові назви живих карток/ОЧ — записи, пов'язані за назвою, неоднозначні (етапи 2–3 прив'язки за id — окремо).
function findDuplicateAccountNames(){
  const out = [];
  [['card', bankAccounts, 'Картка'], ['installment', installmentAccounts, 'ОЧ']].forEach(function(g){
    const seen = {};
    (g[1] || []).forEach(function(a){
      if(!a || a.deletedAt) return;
      const k = accountNameKey(a.name);
      if(!k) return;
      (seen[k] = seen[k] || []).push(a);
    });
    Object.keys(seen).forEach(function(k){
      const list = seen[k];
      if(list.length < 2) return;
      out.push({ label: list[0].name, date: g[2], reason: 'живих записів з такою назвою: ' + list.length + ' — пов\'язані за назвою записи (борги, платежі) неоднозначні', target: g[0] === 'card' ? { type:'debt', kind:'card', name: list[0].name } : { type:'installment', name: list[0].name } });
    });
  });
  return out;
}
// Rev #30 (6D.61) — термінове питання користувача після 6D.57-60: "що робити
// з даними, які не пройшли push?" — автоматичний retry вже є (запис без
// syncedUpdatedAt===updatedAt пробується знову при кожному "Синхронізувати
// все"), але без ЦІЄЇ перевірки не було способу побачити, ЯКІ САМЕ записи
// застрягли, якщо збій постійний (не тимчасова мережа). syncedUpdatedAt
// (6D.57/6D.50) — єдине надійне джерело "чи справді дійшло до Cloud", той
// самий принцип, що вже findExpenseIdIssues()/findTimestampIssues() вище.
// Лише коли Cloud-сесія взагалі активна — без неї "не синхронізовано" не
// проблема, а очікуваний стан (синхронізація вимкнена).
function findUnsyncedRecordsIssues(){
  if(!isCloudSessionReady()) return [];
  const issues = [];
  activeExpenses().forEach(function(e, idx){
    if(e.syncedUpdatedAt !== e.updatedAt){
      issues.push({ label: e.name || '(без назви)', date: e.date || '—', reason: 'не синхронізовано з Cloud', target: { type: 'expense', idx: idx } });
    }
  });
  activeIncomes().forEach(function(inc, idx){
    if(inc.syncedUpdatedAt !== inc.updatedAt){
      issues.push({ label: incomeSourceDisplay(inc.source) || '(без назви)', date: inc.date || '—', reason: 'не синхронізовано з Cloud', target: { type: 'income', idx: idx } });
    }
  });
  activeDebts().forEach(function(d){
    if(d.syncedUpdatedAt !== d.updatedAt){
      issues.push({ label: d.name || '(без назви)', date: d.month || '—', reason: 'не синхронізовано з Cloud', target: { type: 'debt', name: d.name, month: d.month, kind: d.kind } });
    }
  });
  return issues;
}
// Rev 2.16.2 — ключ ігнорування розбіжності: та сама пара "назва+місяць", що
// вже природно ідентифікує конкретний запис боргу (debts[].name+.month).
function divergenceKey(name, month){ return name + '|' + month; }
// Розбіжність факт/очікування по ОЧ понад поріг 5% (Модель C, FINANCIAL_RULES
// §4) — той самий розрахунок, що checkInstallmentDivergence() в Обліку
// (lastKnownBalance + typicalMonthlyPayment/linkedExpensesSum), але
// застосований до КОЖНОГО факту в історії боргів, а не лише до відкритого
// зараз місяця/рядка форми.
// Rev 2.16.2 — не кожна розбіжність понад 5% є помилкою (напр. свідома
// переплата: заплановано 2000, а фактично внесено 3000) — записи, позначені
// через "Ігнорувати" (ignoreDiagnosticDivergence нижче), сюди більше не
// потрапляють.
function findInstallmentDivergences(){
  const issues = [];
  // Rev #30 (6D.44) — activeDebts(): видалений (tombstoned) факт більше не "факт", нема що звіряти з очікуванням.
  const names = Array.from(new Set(activeDebts().filter(function(d){ return d.kind==='installment'; }).map(function(d){ return d.name; })));
  names.forEach(function(name){
    activeDebts().filter(function(d){ return d.kind==='installment' && d.name===name; }).forEach(function(rec){
      if(ignoredDivergences[divergenceKey(name, rec.month)]) return;
      // Rev 2.32.177 (OCH-ANCHOR): внесений залишок — опорна точка (до платежу місяця), порівнюємо з розрахунком БЕЗ цієї опори (calcBefore)
      const calc = installmentChainCalc(installmentChainSpec(name), rec.month);
      const expectedBalance = calc.calcBefore;
      if(expectedBalance == null || !(expectedBalance > 0)) return; // немає розрахунку (або 0) — нема з чим порівнювати (guard ділення на 0)
      const diffPct = Math.abs(rec.balance - expectedBalance) / expectedBalance * 100;
      if(diffPct > 5){
        issues.push({
          label: name,
          date: rec.month,
          reason: `внесений залишок ${fmt(rec.balance)} відрізняється від розрахунку (${fmt(expectedBalance)}) на ${diffPct.toFixed(0)}%`,
          target: { type:'installment-month', name: name, month: rec.month }
        });
      }
    });
  });
  return issues;
}
// Rev 2.16.1 — заповнюється заново при кожній побудові звіту: індекс у
// масиві = номер кнопки-проблеми в модалці, звідки onclick="goToDiagnosticIssue(N)"
// бере, куди саме переходити.
let diagnosticIssueTargets = [];
// Rev 2.16.2 — винесено з runDataDiagnostics() в окрему функцію: потрібно
// перебудовувати HTML звіту ПОВТОРНО, не закриваючи модалку (після кліку
// "Ігнорувати" — див. ignoreDiagnosticDivergence), а не лише один раз при
// першому відкритті.
function buildDiagnosticsReport(){
  const checks = [
    { title: 'Витрати: UUID (унікальність)', issues: findExpenseIdIssues() },
    { title: 'Витрати: updatedAt/createdAt', issues: findTimestampIssues() },
    { title: 'ОЧ: обов’язкові поля', issues: findInstallmentFieldIssues() },
    { title: 'ОЧ: розбіжність факт/очікування (>5%)', issues: findInstallmentDivergences() },
    { title: 'Картки й ОЧ: однакові назви', issues: findDuplicateAccountNames() },
  ];
  // Rev #30 (6D.61) — перевірка додається лише якщо Cloud-сесія активна —
  // без синхронізації "не запушено" не проблема, а очікуваний стан, не варто
  // показувати як псевдо-"OK" рядок серед реальних перевірок цілісності.
  if(isCloudSessionReady()) checks.push({ title: 'Синхронізація: незапушені записи', issues: findUnsyncedRecordsIssues() });
  diagnosticIssueTargets = [];
  const totalIssues = checks.reduce(function(s,c){ return s+c.issues.length; }, 0);
  if(totalIssues === 0){
    // Rev #30 (6D.44) — activeExpenses(): findExpenseIdIssues()/findTimestampIssues() вище тепер теж сканують лише активні — лічильник має відповідати.
    return `<div class="diag-summary-ok">✓ Усе гаразд — проблем не знайдено</div>`
      + `<div class="diag-summary-meta">Перевірено: ${activeExpenses().length} ${expenseCountWord(activeExpenses().length)}, ${installmentAccounts.length} ОЧ</div>`;
  }
  return checks.map(function(c){
    const statusHtml = c.issues.length
      ? `<span class="diag-status bad">${c.issues.length}</span>`
      : `<span class="diag-status ok">OK</span>`;
    const listHtml = c.issues.length
      ? `<div class="diag-issue-list">` + c.issues.map(function(i){
          const targetIdx = diagnosticIssueTargets.length;
          diagnosticIssueTargets.push(i.target);
          const issueBtn = `<button type="button" class="diag-issue" onclick="goToDiagnosticIssue(${targetIdx})"><b>${escapeHtml(i.label)}</b> (${escapeHtml(i.date)}) — ${escapeHtml(i.reason)}</button>`;
          // Rev 2.16.2 — кнопка "Ігнорувати" лише для розбіжностей (installment-month):
          // єдиний тип перевірки тут, де високий шанс хибного спрацювання
          // (свідома переплата), на відміну від UUID/timestamp/полів ОЧ, де
          // "проблема" завжди справжня.
          // Rev 2.16.2 BugFix — передаємо targetIdx (число), а не назву ОЧ
          // напряму в onclick: назва може містити апостроф (укр. назви
          // банків/карток), що зламало б лапки в onclick-рядку. Той самий
          // прийом, що вже в issueBtn вище — пошук через diagnosticIssueTargets.
          const ignoreBtn = i.target.type === 'installment-month'
            ? `<button type="button" class="diag-issue-ignore" onclick="ignoreDiagnosticDivergence(${targetIdx})">Ігнорувати</button>`
            : '';
          return `<div class="diag-issue-row">${issueBtn}${ignoreBtn}</div>`;
        }).join('') + `</div>`
      : '';
    return `<div class="diag-check"><span class="diag-check-label">${c.title}</span>${statusHtml}</div>${listHtml}`;
  }).join('');
}
/* ================= Rev 2.22.91 (6D.164) — "Чорна скринька" діагностики =================
   Мета: діагностувати viewport/клавіатуру/поворот/safe-area БЕЗ Web
   Inspector — користувач вмикає запис, відтворює баг на реальному iPhone,
   надсилає лог, Claude Code читає події SQL-ом. Вимкнений за замовчуванням,
   нічого не слухає, поки не ввімкнений, жодних даних користувача (allowlist
   полів, ніколи не в backup/localStorage). Крок 0 (підтверджено прямим
   читанням коду): isCloudSessionReady()/push_subscriptions-insert — готовий
   шаблон; nav.tabbar — уже є селектор у updateTabBubble(); --kb-inset
   записується, але ніде досі не читається назад через getComputedStyle —
   рекордер перший такий read-патерн, нешкідливо (дзеркалить write-бік).

   Чисті функції нижче (ringBufferPush/sanitizeDebugEvent/
   trimEventsForSizeLimit/detectIosVersionFromUserAgent/
   isStandaloneDisplayMode) — без DOM, окремо тестовані. Решта
   (attachDebugRecorderListeners/captureDebugGeometry/start-stop-send) —
   DOM-шар, перевірено живо в browser preview (той самий принцип
   виключення, що openJournal()/handlePushAction() тощо). */
const DEBUG_RECORDING_MAX_EVENTS = 2000;
const DEBUG_RECORDING_AUTO_STOP_MS = 30 * 60 * 1000;
const DEBUG_LOG_MAX_EVENTS_FOR_SEND = 3000; // той самий ліміт, що CHECK events_is_array у БД
const DEBUG_LOG_MAX_BYTES_FOR_SEND = 600000; // той самий ліміт, що CHECK events_size у БД
// Rev 2.22.91 (6D.164) — allowlist: лише ці поля потрапляють у подію, усе
// поза списком відкидається СТРУКТУРНО (не питання дисципліни слухачів) —
// жорстка вимога приватності ТЗ ("value"/"text" з полів форми сюди
// принципово не можуть пройти, навіть якщо якийсь слухач їх передасть).
const DEBUG_EVENT_ALLOWLIST = [
  'during', // Rev 2.32.288 (KB-33): pan-comp
  'need', 'lmin', 'lnorm', // Rev 2.32.295 (KB-39 B): kb-early-fallback
  'deadline', 'rel', 'earlyState', // Rev 2.32.296 (KB-40): sheet-open.earlyState; Rev 2.32.294 (KB-39): kb-early.deadline, autofocus-transfer.rel
  'by', 'expected', 'src', 'factor', 'target', // Rev 2.32.291 (KB-36): kb-early (target, expected, src, factor, from) і autofill (by)
  'scrollTop', 'panShift', // Rev 2.32.279 (KB-24): switch-trace, pan-comp
  'visible', 'shown', 'tapped', 'found', 'errorCode', // Rev 2.32.278 (PUSH-2): deeplink, app-visible-sync, inbox-new-toast
  'diffTable', 'diffCount', 'diffReason', // Rev 2.32.192 (SHADOW-REV): rev-diff
  'ev', 'ts', 'now', 'cancelable', // Rev 2.32.212: події по рядках підказок (час створення події проти часу обробки)
  'lag', 'dur', // Rev 2.32.211 (SUGGEST-LAG): затримка «дотик → вставка» і тривалість довгої задачі (longtask), лише мс
  't', 'type', 'innerW', 'innerH', 'outerH', 'vvW', 'vvH', 'vvOffsetTop', 'vvOffsetLeft', 'vvScale',
  'scrollY', 'docClientH', 'bodyClasses', 'kbInset',
  'activeElementTag', 'activeElementId', 'activeElementType',
  'orientation', 'tabbarTop', 'tabbarHeight',
  'kbgWhy', 'devClass', 'ptrCoarse', 'hoverHover', 'standaloneMode', 'vkPresent', 'vkOverlays', 'viewportMeta', 'tabbarGap', 'sheetTop', 'sheetBottom', 'sheetHeight', 'fieldTop', 'fieldBottom', 'kbHeightCalc', 'sheetLiftCss', 'sheetRestBottom', // Rev 2.32.238 (KB-GEOM): подія kb-geometry — лише числа, прапорці й статичний рядок мета-тега viewport
  'safeTop', 'safeRight', 'safeBottom', 'safeLeft',
  'touchX', 'touchY', 'targetTag', 'targetId', 'targetClasses',
  // Rev 2.32.169 (FIELD-GUARD): подія field-attrs — атрибути сфокусованого поля у «Структурі» (без значень)
  // Rev 2.32.217 (FIELDS-SNAP): події fields-snapshot / field-added / field-removed — атрибути полів без значень
  'fieldName', 'fieldAc', 'snapWhy', 'mergeDom',
  'censusTotal', 'censusCloud', 'censusNoBase', 'censusDirty', 'censusRisk', // Rev 2.32.229 (BASE-CENSUS): baseline-census — лише числа по домену
  'fieldId', 'fieldType', 'fieldAttrs', 'fieldParent', 'fieldProxy', 'fieldLinked', 'fieldScreen',
  // Rev 2.22.92 (6D.165) — геометрія відкритої шторки/підложки: живий лог
  // (kb-full-scenario) знайшов дотик, що влучив у .drawer-backdrop замість
  // самої картки після повороту в landscape — без прямокутників обох
  // елементів неможливо встановити, чи підложка виходить за межі картки,
  // чи сама картка не там, де очікується. drawerId — лише id самого
  // елемента (напр. "card-debt-drawer"), не дані форми.
  'drawerId', 'choice', 'drawerTop', 'drawerBottom', 'drawerLeft', 'drawerRight', 'drawerHeight',
  'backdropId', 'backdropTop', 'backdropBottom', 'backdropHeight',
  // Rev 2.22.96 (6D.167) — скарга "картку обрізає клавіатурою, хоча вона
  // влазить без скролу" (портрет, "Борги"): drawerHeight (rect) уже був у
  // логу, але не було видно, СКІЛЬКИ контенту насправді є (scrollHeight) і
  // скільки йому ДОЗВОЛЕНО (clientHeight/max-height) — без цього неможливо
  // відрізнити "max-height занадто малий" від "контент справді не влазить".
  'drawerScrollHeight', 'drawerClientHeight', 'drawerMaxHeightPx', 'baseVh',
  // Rev 2.23.5 (6D.174) — скарга "фон і далі скролиться, попри 6D.173" —
  // діагностика, чи inert ВЗАГАЛІ ставиться і чи ДІЙСНО блокує scrollTop.
  'mainColInert', 'mainColScrollTop',
  // Rev 2.23.9 (6D.178) — єдиний контролер клавіатури (Режим A/B).
  'activeRectTop', 'activeRectBottom', 'kbH',
  // Rev 2.23.11 (6D.180) — проксі-фокус (focus-proxy/focus-transfer/
  // focus-proxy-fallback): ms — тривалість проксі-вікна (focus-transfer),
  // proxyActive — чи проксі зараз сфокусовано замість справжнього поля.
  'ms', 'proxyActive',
  // Rev 2.23.12 (6D.181) — sheet-anim (плавність підйому шторки, критерій S4).
  'frames', 'maxGapMs', 'durationMs', 'samples',
  // Rev 2.23.13 (6D.182) — sheet-anim доповнено (open/close), tabbar-restore.
  'phase', 'jumpMaxPx', 'gapNoLayoutMs', 'drawerHeightRest', 'drawerHeightKb',
  // Rev 2.32.11 — sheet-anim карток «Структури»: firstOfKind (перша така фаза цієї картки за сесію), settledY (низ картки через 350 мс після завершення), settleDeltaPx (settledY мінус останній семпл).
  'firstOfKind', 'settledY', 'settleDeltaPx',
  // Rev 2.32.15 (Z) — backup-export: ok (експорт вдався), recorded (дату записано в Cloud); без значень.
  'recorded',
  // Rev 2.23.14 (6D.183) — kb-frames, таймінг таббара.
  'blips', 'firstKbFrameT', 'msAfterFocusout',
  // Rev 2.23.15 (6D.184) — перемикання між полями відкритої шторки.
  'switchKind', 'from', 'to',
  // Rev 2.23.16 (6D.185) — тап по підпису (intercept-via-label).
  'labelFor',
  // Rev 2.23.26 (6D.195, G1) — push-dirty (entries, skipped, censusReset, censusDropped): лише лічильники.
  // Rev 2.23.29 (6D.198) — focus-audit: тег/id активного елемента й чи є кнопка в :active; push-route: тип маршруту.
  'focusTag', 'focusId', 'anyButtonActive', 'auditPoint', 'route',
  // Rev 2.23.30 (6D.199) — kb-open-released: запобіжник "клавіатури немає, а таббару немає" (vvH, baseVh).
  'kbReleaseVvH', 'kbReleaseBaseVh',
  'entries', 'skipped', 'censusReset', 'censusDropped', 'children', // Rev 2.23.28 (6D.197, G3): children — скільки дітей (борги/витрати/приховані) інвалідовано каскадом
  // Rev 2.23.24 (6D.193, Ревізія E) — trash-reconcile (checked, removedLocally, restoredElsewhere, ms) і trash-purge (trashType, ok, dups): лише лічильники й тип, без назв і сум.
  'checked', 'removedLocally', 'restoredElsewhere', 'ms', 'dups',
  // Rev 2.23.23 (6D.192, Ревізія D) — "Видалені дані": trashType (НЕ `type` — воно вже тип самої події), ok, count; без назв і сум.
  'trashType', 'ok', 'count',
  // Rev 2.32.2 (E1) — edit-session: event (open/close/blocked), reason (тригер), dirty (були незбережені зміни); без значень полів.
  'event', 'reason', 'dirty',
  // Rev 2.32.4 (T2) — account-purge: kind (bank/installment/month-record), debts (скільки місячних записів), unlinkedExpenses (скільки витрат втратили прив’язку); без назв і сум.
  'debts', 'unlinkedExpenses',
  // Rev 2.32.5 (E1b) — edit-session event=restored: scrolled (чи довелось прокручувати картку редагування у видиму область).
  'scrolled',
  // Rev 2.32.7 (T3) — taxonomy-purge: kind (category/subcategory), subcategories, words, blocked, usedBy; account-purge: monthsRemoved (скільки різних місяців боргів видалено). Без назв.
  'subcategories', 'words', 'blocked', 'usedBy', 'monthsRemoved',
  // Rev 2.32.9 (B) — kb-env: usesKeyboard (чи застосовується підйом/перехоплення), pointer (coarse/fine), hover, maxTouchPoints; reason — спільне поле.
  'usesKeyboard', 'pointer', 'hover', 'maxTouchPoints',
  // Rev 2.23.18 (6D.187) — native-switch (K1-K3).
  // Rev 2.24.0 (M1) — motion-perf: kind (tab-switch/press), reduced, holdMs, pressLeak (скільки елементів лишилось у .is-pressed через 300 мс).
  'kind', 'reduced', 'holdMs', 'pressLeak',
  // Rev 2.27.0 (M2.1) — dashboard-enter: mode (full/replay/update/none), skipped (reduced/hidden/no-change/variant), chartsAnimated/chartsSkipped, pathLenZero (скільки <path> дали getTotalLength()=0), pathLengthAttr (чи підтримується pathLength). Rev 2.32.0 (F): поля intensity і cardVariant прибрано разом з варіантами.
  'mode', 'skipped', 'chartsAnimated', 'chartsSkipped', 'pathLenZero', 'pathLengthAttr',
  // Rev 2.28.0 (M2.2) — deferredCharts (скільки графіків чекали доскролу) і chart-reveal: chart (id графіка), fromEnterMs (мс від початку візиту до малювання).
  'deferredCharts', 'chart', 'fromEnterMs',
  // Rev 2.29.0 (A/B) — account-enter: rows, deferredRows, variant; press: leakSelector; press-leak-fixed: selector (+ms); tab-switch: firstFrameMs, gapAtFrame (номер кадру з найбільшою паузою).
  // Rev 2.31.0 (M4c) — account-enter: trigger ('tab'|'segment'), segment ('income'|'debts'|'installments').
  'trigger', 'segment', 'rows', 'deferredRows', 'leakSelector', 'selector', 'firstFrameMs', 'gapAtFrame',
  // Rev 2.29.1 — expense-focus-neighbors (стрілки клавіатури на формі «Витрати»): лише id/теги/стани керованих елементів, не дані.
  'fieldId', 'prevId', 'nextId', 'nextRawId', 'nextTag', 'nextType', 'nextDisabled', 'nextHidden', 'nextReason', 'nextPe', 'nextInert', 'viewPe', 'viewOpacity', 'transitioning', 'msSinceTab', 'orderIds',
  // Rev 2.25.0 (M2) — dashboard-enter: tab, elements (картки в черзі), counters, charts, repeat (повторний показ у сесії); frames/maxGapMs/durationMs — як вище.
  'tab', 'elements', 'counters', 'charts', 'repeat',
  // Rev 2.26.0 (M3) — ui-audit: кількості кнопок за варіантами, без варіанта, із зоною <44, з контрастом <AA, і перелік ПЕРШИХ КЛАСІВ (не даних).
  // Rev 2.28.1 (C) — input-attrs-audit: inputsTotal, inputsBad (порушників), badIds (їхні id — лише ідентифікатори полів, не дані).
  'inputsTotal', 'inputsBad', 'badIds',
  'matched', // Rev 2.32.35 (K): mono-keyword
  'message', 'source', 'stackTop', 'tab', 'errors', // Rev 2.32.53 (J): js-error, js-error-backlog (без значень користувача)
  'skipped', // Rev 2.32.52 (G): kb-guard
  'unread', 'opened', 'markedAll', 'cleared', // Rev 2.32.38 (B): notif-archive
  'fieldsCount', 'fields', 'formsCount', 'hasLoginFields', 'autofillGuard', // Rev 2.32.47 (AG)
   // Rev 2.32.31 (A): перепис полів екрана (атрибути й підписи, без значень)
  'btnTotal', 'byVariant', 'btnNoVariant', 'btnSmall', 'btnSmallExempt', 'btnLowContrast', 'btnLowContrastRow', 'lowContrastRowClasses', 'noVariantClasses', 'smallClasses', 'lowContrastClasses',
  // Rev 2.31.1 (C) — trash-swipe-close: ms (тривалість жесту), dx (зсув вправо, px).
  'dx',
  // Rev 2.31.2 (A) — autocat-edit: matched, applied (булеві), skipped (no-match/user-changed/same) — без назв і сум.
  'matched', 'applied',
  // Rev 2.31.5 (B2-lite) — status-dots: tab, dots (кількість видимих крапок-статусів), reasons ({status, missingCards}).
  'tab', 'dots', 'reasons',
  // Rev 2.31.4 (C) — input-focus-audit: атрибути поля, на якому з’явився фокус (без значення).
  'fieldName', 'fieldType', 'fieldAutocomplete', 'fieldInputmode', 'fieldAria', 'fieldPlaceholder', 'fieldLabel', 'fieldLabelFor', 'fieldHasForm', 'fieldForbidden',
  // Rev 2.31.3 (B) — incomplete-dots: cards, installments (кількості неповних), reasonCounts ({причина: кількість}); без назв і сум.
  'cards', 'installments', 'reasonCounts',
  'dir', 'keyboardTypeOk', 'panMax400',
  // Rev 2.23.19 (6D.188) — невидимий курсор проксі.
  'proxyCaretColor', 'proxyDistToField', 'proxyInputmode', 'targetInputmode', 'via', 'kbHs', 'kbHCount',
  // Rev 2.23.20 (6D.189) — курсор під час руху шторки.
  'sheetBottomAtTransfer', 'sheetFinalBottom',
  // Rev 2.32.129 (BUG-INPUT, лише запис діагностики): suggest-render/suggest-pick (ctx, count, lens, activeIdx, pickIdx, pickLen, pickHash, textLenBefore/After; без тексту назв, лише довжини й 6-символьні хеші),
  // add-button (phase, rect, pointerType, gotClick, result, reason) і прямокутник/ціль touchstart/touchend (targetRect; для touchend також targetTag/targetId/targetClasses). Раніше 'event'/'count' подій suggest-edit відкидались allowlist-ом — додано.
  'ctx', 'event', 'count', 'lens', 'activeIdx', 'pickIdx', 'pickLen', 'pickHash', 'textLenBefore', 'textLenAfter',
  'phase', 'rect', 'pointerType', 'gotClick', 'result', 'reason', 'targetRect',
  // Rev 2.32.133 (BUG-INPUT, лише запис): факти про натиск — defaultPrevented події, чи був .is-pressed на елементі в момент події, document.activeElement (id із замаскованим uuid і тег); без тексту й значень.
  'defaultPrevented', 'pressed', 'activeId', 'activeTag',
];
// Rev 2.32.129: чисті допоміжні функції діагностики — прямокутник, ціль дотику, короткий хеш тексту (текст у лог не потрапляє).
function debugRectOf(el){
  if(!el || !el.getBoundingClientRect) return null;
  const r = el.getBoundingClientRect();
  return { left: Math.round(r.left), top: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) };
}
function debugTextHash(text){
  let h = 2166136261;
  const str = String(text == null ? '' : text);
  for(let i = 0; i < str.length; i++){ h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h.toString(16).padStart(8, '0').slice(0, 6);
}
function debugTargetInfo(el){
  if(!el) return { targetTag: null, targetId: null, targetClasses: null, targetRect: null };
  const id = el.id ? String(el.id).replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<uuid>') : null;
  return { targetTag: el.tagName || null, targetId: id, targetClasses: el.className && typeof el.className === 'string' ? el.className.slice(0, 80) : null, targetRect: debugRectOf(el) };
}
// Подія suggest-render/suggest-pick: лише довжини й хеші. ctx: 'new' (форма «Нова витрата») | 'edit' (редагування запису).
function debugSuggestRender(ctx, matches, activeIdx){
  if(!debugRecordingActive) return;
  const list = Array.isArray(matches) ? matches : [];
  pushDebugEvent({ t: Math.round(performance.now() - debugRecordingStartedAt), type: 'suggest-render', ctx: ctx, count: list.length, lens: list.map(function(n){ return String(n).length; }), activeIdx: activeIdx == null ? -1 : activeIdx });
}
function debugSuggestPick(ctx, idx, picked, lenBefore, lenAfter){
  if(!debugRecordingActive) return;
  pushDebugEvent({ t: Math.round(performance.now() - debugRecordingStartedAt), lag: suggestTouchAt ? Math.round(performance.now() - suggestTouchAt) : null, type: 'suggest-pick', ctx: ctx, pickIdx: idx, pickLen: String(picked == null ? '' : picked).length, pickHash: debugTextHash(picked), textLenBefore: lenBefore, textLenAfter: lenAfter });
}
// Результат обробника addExpense: added | rejected (reason: gate | name-empty | amount-invalid) | deferred (reason: edit-guard). Пишеться лише під час запису.
function debugAddResult(result, reason){
  if(!debugRecordingActive) return;
  pushDebugEvent({ t: Math.round(performance.now() - debugRecordingStartedAt), type: 'add-button', phase: 'result', result: result, reason: reason || null });
}
// Rev 2.32.133: спільні факти натиску для add-button і touchend. pressedEl — елемент, на якому перевіряємо .is-pressed (для touchend — найближчий предок із класом).
function debugPressFacts(e, pressedEl){
  const a = typeof document !== 'undefined' ? document.activeElement : null;
  return {
    defaultPrevented: !!(e && e.defaultPrevented),
    pressed: !!(pressedEl && pressedEl.classList && pressedEl.classList.contains('is-pressed')),
    activeId: a && a.id ? String(a.id).replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<uuid>') : null,
    activeTag: a && a.tagName ? a.tagName : null,
  };
}
let debugAddBtnState = { down: false, gotClick: false, timer: null };
function onDebugAddButtonPointer(e){
  if(!debugRecordingActive) return;
  const btn = e.target && e.target.closest ? e.target.closest('button.submit-btn.expense') : null;
  if(!btn) return;
  const phase = e.type;
  if(phase === 'pointerdown'){ debugAddBtnState.down = true; debugAddBtnState.gotClick = false; clearTimeout(debugAddBtnState.timer); }
  if(phase === 'click') debugAddBtnState.gotClick = true;
  pushDebugEvent(Object.assign({ t: Math.round(performance.now() - debugRecordingStartedAt), type: 'add-button', phase: phase, rect: debugRectOf(btn), pointerType: e.pointerType || null, gotClick: phase === 'click' ? true : undefined }, debugPressFacts(e, btn)));
  if(phase === 'pointerup'){
    // click після pointerup приходить одразу; якщо за 400 мс його нема — фіксуємо «pointerup без click» і де тоді була кнопка (зсув розкладки).
    debugAddBtnState.timer = setTimeout(function(){
      if(!debugRecordingActive || debugAddBtnState.gotClick) return;
      pushDebugEvent(Object.assign({ t: Math.round(performance.now() - debugRecordingStartedAt), type: 'add-button', phase: 'no-click', rect: debugRectOf(btn), gotClick: false }, debugPressFacts(e, btn))); // Rev 2.32.133: факти на момент «без click» (e — pointerup)
    }, 400);
  }
}
function sanitizeDebugEvent(raw){
  const out = {};
  DEBUG_EVENT_ALLOWLIST.forEach(function(key){
    if(Object.prototype.hasOwnProperty.call(raw, key) && raw[key] !== undefined) out[key] = raw[key];
  });
  return out;
}
// trimEventsForSizeLimit(events, maxCount, maxBytes) — перед надсиланням:
// спершу обрізає за кількістю, потім відкидає найстаріші, доки JSON не
// влізе в maxBytes (той самий бюджет, що CHECK events_size у БД) — рекордер
// сам підрізає, а не падає на insert з помилкою ліміту.
function trimEventsForSizeLimit(events, maxCount, maxBytes){
  let list = events.length > maxCount ? events.slice(events.length - maxCount) : events.slice();
  while(list.length > 1 && JSON.stringify(list).length > maxBytes) list = list.slice(1);
  return list;
}
// detectIosVersionFromUserAgent(ua) — "OS 17_2 like Mac OS X" → "17.2".
function detectIosVersionFromUserAgent(ua){
  const m = /OS (\d+)_(\d+)(?:_(\d+))?/.exec(ua || '');
  if(!m) return null;
  return m[3] ? `${m[1]}.${m[2]}.${m[3]}` : `${m[1]}.${m[2]}`;
}
// isStandaloneDisplayMode(navigatorStandalone, matchMediaStandalone) —
// окремий аргумент для кожного джерела (iOS Safari: navigator.standalone;
// решта: matchMedia) — чиста функція, легко підставити обидва сценарії.
function isStandaloneDisplayMode(navigatorStandalone, matchMediaStandalone){
  return !!(navigatorStandalone || matchMediaStandalone);
}

let debugRecordingActive = false;
let debugRecordingStartedAt = 0;
let debugLongTaskObserver = null; // Rev 2.32.211
let debugEventTimingObserver = null; // Rev 2.32.214
let debugRecordingScenario = '';
let debugEventBuffer = [];
let debugRecordingAutoStopTimer = null;
let debugRecordingTimerInterval = null;
let debugListenerHandles = [];
let debugRecordingMutationObserver = null;
let debugScrollCoalesceTimer = null;
let debugSafeAreaProbeEl = null;

function debugSafeAreaInsets(){
  if(!debugSafeAreaProbeEl){
    debugSafeAreaProbeEl = document.createElement('div');
    debugSafeAreaProbeEl.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);';
    document.body.appendChild(debugSafeAreaProbeEl);
  }
  const cs = getComputedStyle(debugSafeAreaProbeEl);
  return {
    top: parseFloat(cs.paddingTop) || 0, right: parseFloat(cs.paddingRight) || 0,
    bottom: parseFloat(cs.paddingBottom) || 0, left: parseFloat(cs.paddingLeft) || 0,
  };
}

function recordKbGeometry(why){
  if(!recOn()) return; // Rev 2.32.262 (KB-9): тепер і для бортового самописця (vv-settled, rest-settled)
  try{
    const d = document.querySelector('.drawer.open');
    pushDebugEvent(Object.assign({ t: Math.round(performance.now() - debugRecordingStartedAt), type: 'kb-geometry' }, kbgSnapshot(kbgMeasure(why)), d ? (function(){ const bar = kbStickyBarOf(d), br = bar ? bar.getBoundingClientRect() : null; return { drawerId: d.id || null, drawerScrollHeight: d.scrollHeight, drawerClientHeight: d.clientHeight, drawerScrollTop: Math.round(d.scrollTop), actionsTop: br ? Math.round(br.top) : null, actionsBottom: br ? Math.round(br.bottom) : null }; })() : {}));
  }catch(e){}
}

function onKbgFocusIn(e){
  const t = e && e.target;
  if(!t || !/^(INPUT|TEXTAREA)$/.test(t.tagName)) return;
  recordKbGeometry('focus'); kbgSchedule('focus');
}
function onKbgVvChange(){ recordKbGeometry('vv'); kbgSchedule('vv'); }
function pushDebugEvent(raw){
  if(!debugRecordingActive){ if(recBgOn) recPush(raw); return; } // Rev 2.32.260 (REC-1): поза ручним записом події йдуть у бортовий буфер (білі списки)
  debugEventBuffer = ringBufferPush(debugEventBuffer, sanitizeDebugEvent(raw), DEBUG_RECORDING_MAX_EVENTS);
}
// captureDebugGeometry(type, extra) — єдина точка збору "знімку" геометрії,
// спільна для resize/scroll/orientationchange/visibilitychange/kb-open.
function captureDebugGeometry(type, extra){
  const vv = window.visualViewport;
  const bar = document.querySelector('nav.tabbar');
  const barRect = bar ? bar.getBoundingClientRect() : null;
  const active = document.activeElement;
  const safe = debugSafeAreaInsets();
  // Rev 2.22.92 (6D.165) — .drawer-backdrop окремо від .drawer: живий лог
  // (kb-full-scenario) показав дотик, що влучив у backdrop замість картки
  // в landscape — потрібні ОБИДВА прямокутники, щоб бачити, чи вони взагалі
  // не збігаються з тим, де користувач очікує побачити саму картку.
  const openDrawer = document.querySelector('.drawer.open');
  const openBackdrop = document.querySelector('.drawer-backdrop.open');
  const drawerRect = openDrawer ? openDrawer.getBoundingClientRect() : null;
  const backdropRect = openBackdrop ? openBackdrop.getBoundingClientRect() : null;
  pushDebugEvent(Object.assign({
    t: Math.round(performance.now() - debugRecordingStartedAt),
    type: type,
    innerW: window.innerWidth, innerH: window.innerHeight, outerH: window.outerHeight,
    vvW: vv ? Math.round(vv.width) : null, vvH: vv ? Math.round(vv.height) : null,
    vvOffsetTop: vv ? Math.round(vv.offsetTop) : null, vvOffsetLeft: vv ? Math.round(vv.offsetLeft) : null,
    vvScale: vv ? vv.scale : null,
    scrollY: window.scrollY, docClientH: document.documentElement.clientHeight,
    bodyClasses: document.body.className,
    // Rev 2.23.9 (6D.178) — --kb-inset видалено (замінено --kb-h, єдиний
    // контролер) — kbInset лишається тим самим ПОЛЕМ (не ламаємо старі SQL-
    // запити користувача по історичних логах), просто тепер читає нове
    // джерело з тим самим сенсом (висота клавіатури, px).
    kbInset: getComputedStyle(document.documentElement).getPropertyValue('--kb-h'),
    activeElementTag: active ? active.tagName : null,
    activeElementId: active ? (active.id || null) : null,
    activeElementType: active ? (active.type || null) : null,
    orientation: window.innerWidth > window.innerHeight ? 'landscape' : 'portrait',
    tabbarTop: barRect ? Math.round(barRect.top) : null, tabbarHeight: barRect ? Math.round(barRect.height) : null,
    safeTop: safe.top, safeRight: safe.right, safeBottom: safe.bottom, safeLeft: safe.left,
    drawerId: openDrawer ? (openDrawer.id || null) : null,
    drawerTop: drawerRect ? Math.round(drawerRect.top) : null, drawerBottom: drawerRect ? Math.round(drawerRect.bottom) : null,
    drawerLeft: drawerRect ? Math.round(drawerRect.left) : null, drawerRight: drawerRect ? Math.round(drawerRect.right) : null,
    drawerHeight: drawerRect ? Math.round(drawerRect.height) : null,
    backdropId: openBackdrop ? (openBackdrop.id || null) : null,
    backdropTop: backdropRect ? Math.round(backdropRect.top) : null, backdropBottom: backdropRect ? Math.round(backdropRect.bottom) : null,
    backdropHeight: backdropRect ? Math.round(backdropRect.height) : null,
    // Rev 2.22.96 (6D.167) — scrollHeight/clientHeight розрізняють "контенту
    // справді забагато" від "max-height занадто обережний"; maxHeight читаємо
    // з РЕЗОЛЬВЛЕНОЇ computed style самого елемента (реальна CSS-властивість,
    // завжди в px), а не з custom property --drawer-max-height напряму (та
    // лишається нерозв'язаним текстом calc(), той самий нюанс, що й
    // --drawer-bottom-base, 6D.166 докоментар).
    drawerScrollHeight: openDrawer ? openDrawer.scrollHeight : null,
    drawerClientHeight: openDrawer ? openDrawer.clientHeight : null,
    drawerMaxHeightPx: openDrawer ? parseFloat(getComputedStyle(openDrawer).maxHeight) : null,
    baseVh: getComputedStyle(document.documentElement).getPropertyValue('--base-vh'),
    // Rev 2.23.5 (6D.174) — скарга користувача: фон і далі скролиться на
    // iPhone, попри 6D.173 (inert на #main-col при фокусі поля в шторці).
    // mainColInert/mainColScrollTop — щоб бачити НАПРЯМУ: чи inert взагалі
    // СТАВИТЬСЯ (можливий збій у нашій логіці) і чи РЕАЛЬНО змінюється
    // scrollTop ПОКИ inert встановлено (можлива причина — inert на iOS
    // Safari/WKWebView не гарантовано блокує touch-scroll, лише клік/фокус
    // — потребує підтвердження живими даними перед новим фіксом, а не
    // повторного вгадування). drawerKeyboardLockActive (внутрішній JS-
    // прапорець, 6D.173) НЕ читаємо тут — він живе всередині окремої IIFE
    // (initApp), недоступний із цієї, глобальної функції; mainColInert —
    // те саме, але через зовнішньо спостережуваний DOM-стан, якого досить.
    mainColInert: (function(){ const mc = document.getElementById('main-col'); return mc ? mc.hasAttribute('inert') : null; })(),
    mainColScrollTop: (function(){ const mc = document.getElementById('main-col'); return mc ? mc.scrollTop : null; })(),
    // Rev 2.23.9 (6D.178) — єдиний контролер клавіатури: activeRectTop/
    // activeRectBottom (критерій C ревізії — чи видиме сфокусоване поле),
    // kbH (--kb-h, те саме число, що kbInset вище, але під НОВИМ ім'ям для
    // нових запитів).
    activeRectTop: active && typeof active.getBoundingClientRect === 'function' ? Math.round(active.getBoundingClientRect().top) : null,
    activeRectBottom: active && typeof active.getBoundingClientRect === 'function' ? Math.round(active.getBoundingClientRect().bottom) : null,
    kbH: parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--kb-h')) || 0,
  }, extra || {}));
}
function onDebugWindowResize(){ captureDebugGeometry('resize'); }
function onDebugVvResize(){ captureDebugGeometry('vv-resize'); }
function onDebugVvScroll(){ captureDebugGeometry('vv-scroll'); }
// Rev 2.22.91 — коалесценція ~30мс: trailing-debounce, той самий принцип,
// що scroll-throttling деінде в коді; лише ОСТАННЯ подія в межах вікна
// фіксується як знімок, не кожен проміжний кадр скролу.
function onDebugScroll(){
  if(debugScrollCoalesceTimer) clearTimeout(debugScrollCoalesceTimer);
  debugScrollCoalesceTimer = setTimeout(function(){
    debugScrollCoalesceTimer = null;
    captureDebugGeometry('scroll');
  }, 30);
}
function onDebugFocusIn(e){ captureDebugGeometry('focusin', { targetTag: e.target ? e.target.tagName : null, targetId: e.target ? (e.target.id || null) : null }); }
function onDebugFocusOut(e){ captureDebugGeometry('focusout', { targetTag: e.target ? e.target.tagName : null, targetId: e.target ? (e.target.id || null) : null }); }
function onDebugOrientationChange(){ captureDebugGeometry('orientationchange'); }
function onDebugVisibilityChange(){ captureDebugGeometry('visibilitychange'); }
function onDebugPageShow(){ captureDebugGeometry('pageshow'); }
function onDebugPageHide(){ captureDebugGeometry('pagehide'); }
function onDebugTouchStart(e){
  const t = e.touches && e.touches[0];
  const target = e.target;
  captureDebugGeometry('touchstart', {
    touchX: t ? Math.round(t.clientX) : null, touchY: t ? Math.round(t.clientY) : null,
    targetTag: target ? target.tagName : null, targetId: target ? (target.id || null) : null,
    targetClasses: target && target.className ? String(target.className).slice(0, 80) : null,
    targetRect: debugRectOf(target), // Rev 2.32.129: прямокутник цілі
  });
}
function onDebugTouchEnd(e){
  const t = e.changedTouches && e.changedTouches[0];
  const ti = debugTargetInfo(e.target); // Rev 2.32.129: ціль touchend (id, тег, клас, прямокутник)
  const pf = debugPressFacts(e, e.target && e.target.closest ? e.target.closest('.is-pressed') : null); // Rev 2.32.133
  captureDebugGeometry('touchend', Object.assign({ touchX: t ? Math.round(t.clientX) : null, touchY: t ? Math.round(t.clientY) : null,
    targetTag: ti.targetTag, targetId: ti.targetId, targetClasses: ti.targetClasses, targetRect: ti.targetRect }, pf));
}
function onDebugBodyClassChange(){ captureDebugGeometry('kb-open-class-changed'); }
// Rev 2.22.91 — attach/detach через спільний debugListenerHandles — одна
// петля прибирання гарантовано знімає РІВНО те, що було додано, без ризику
// забути якийсь слухач при stop() (symmetric by construction).
// ===== Rev 2.29.1 — діагностика стрілок клавіатури на формі «Витрати» (лише запис у рекордер; форма й поведінка не змінюються) =====
// Симптом: з «Назви» (expfielda7) на панелі над клавіатурою немає стрілки вниз, після тапу по «Сумі» (f-amount) стрілки є. iOS визначає «є наступне поле» за порядком і доступністю
// елементів у розмітці. Подія expense-focus-neighbors пише на кожному focusin у формі: хто попередній/наступний за РЕАЛЬНИМ порядком фокусу, їхній стан, і контекст переходу вкладки.
const EXP_FOCUSABLE_SELECTOR = 'input:not([type="hidden"]), select, textarea, button, a[href], [tabindex]:not([tabindex="-1"]), [contenteditable="true"]';

function expFocusEligibility(el){
  const reasons = [];
  if(el.disabled) reasons.push('disabled');
  if(el.hasAttribute('hidden')) reasons.push('hidden-attr');
  if(el.closest('[inert]')) reasons.push('inert');
  if(el.getAttribute('tabindex') === '-1') reasons.push('tabindex-1');
  let shown;
  if(typeof el.checkVisibility === 'function') shown = el.checkVisibility({ visibilityProperty: true }); else shown = el.offsetParent !== null;
  if(!shown) reasons.push('not-rendered');
  return { eligible: reasons.length === 0, reasons: reasons };
}
function expElId(el){ return el ? (el.id || (el.tagName.toLowerCase() + (el.classList && el.classList[0] ? '.' + el.classList[0] : ''))) : null; }
function expenseNeighborInfo(t){
  const all = Array.from(document.querySelectorAll(EXP_FOCUSABLE_SELECTOR));
  const idx = all.indexOf(t);
  if(idx < 0) return null;
  const info = all.map(function(el, i){ return (i >= idx - 4 && i <= idx + 8) ? expFocusEligibility(el) : { eligible: false, reasons: ['far'] }; }); // оцінюємо лише околицю (дешево)
  const nb = focusNeighborsOf(info, idx);
  const nextEl = nb.next >= 0 ? all[nb.next] : null, prevEl = nb.prev >= 0 ? all[nb.prev] : null;
  const rawNext = all[idx + 1] || null; // найближчий за DOM, навіть якщо непридатний (показує, що саме «блокує»)
  const rawInfo = rawNext ? info[idx + 1] : null;
  const view = document.getElementById('view-vytraty');
  const vcs = view ? getComputedStyle(view) : null;
  const order = [];
  for(let i = Math.max(0, idx - 2); i <= Math.min(all.length - 1, idx + 6); i++) order.push(expElId(all[i]) + (info[i].eligible ? '' : '(' + info[i].reasons.join('+') + ')'));
  return {
    fieldId: t.id || null, prevId: expElId(prevEl), nextId: expElId(nextEl), nextRawId: expElId(rawNext),
    nextTag: nextEl ? nextEl.tagName.toLowerCase() : null, nextType: nextEl ? (nextEl.type || null) : null,
    nextDisabled: nextEl ? !!nextEl.disabled : null, nextHidden: nextEl ? false : (rawInfo ? !rawInfo.eligible : null), nextReason: rawInfo && !rawInfo.eligible ? rawInfo.reasons.join('+') : null,
    nextPe: nextEl ? getComputedStyle(nextEl).pointerEvents : null, nextInert: nextEl ? !!nextEl.closest('[inert]') : null,
    viewPe: vcs ? vcs.pointerEvents : null, viewOpacity: vcs ? vcs.opacity : null,
    transitioning: !!(document.getElementById('main-col') && document.getElementById('main-col').classList.contains('tab-transitioning')),
    msSinceTab: Math.round(performance.now() - lastTabSwitchAt), orderIds: order.join(' > ')
  };
}
function onExpenseFocusNeighbors(e){
  const t = e.target;
  if(!t || !t.closest || !t.closest('#vytraty-default-view .expense-entry')) return;
  const info = expenseNeighborInfo(t);
  if(info) pushDebugEvent(Object.assign({ t: Math.round(performance.now() - debugRecordingStartedAt), type: 'expense-focus-neighbors' }, info));
}
// Rev 2.30.1 — стан стрілок через 450 мс після автофокусу (A2): prevId/nextId/nextDisabled/transitioning/viewOpacity/viewPe.
function recordExpenseArrowsState(t){
  const info = expenseNeighborInfo(t);
  if(info) pushDebugEvent({ t: Math.round(performance.now() - debugRecordingStartedAt), type: 'expense-arrows-state', fieldId: info.fieldId, prevId: info.prevId, nextId: info.nextId,
    nextDisabled: info.nextDisabled, transitioning: info.transitioning, viewOpacity: info.viewOpacity, viewPe: info.viewPe, msSinceTab: info.msSinceTab });
}
// Rev 2.31.4 (C) — діагностика для можливого повернення панелі: подія input-focus-audit на кожен focusin на ТЕКСТОВОМУ полі під час запису (поля, створені пізніше за старт запису — модалки, шторки, редагування — теж).
// Лише атрибути й статичні підписи (id/name/type/autocomplete/inputmode/aria-label/placeholder/текст <label>/чи є <form>), БЕЗ значення поля; uuid у id замінено на <uuid>.
const INPUT_FOCUS_AUDIT_TYPES = ['text', 'search', 'tel', 'email', 'number', 'url', 'password'];
function inputFieldLabelText(el){
  let t = '';
  if(el.id){ try{ const l = document.querySelector('label[for="' + el.id.replace(/"/g, '') + '"]'); if(l) t = l.textContent.trim(); }catch(e){} }
  if(!t){ const w = el.closest('label'); if(w) t = w.textContent.trim(); }
  if(!t){ const lb = el.getAttribute('aria-labelledby'); if(lb){ const n = document.getElementById(lb); if(n) t = n.textContent.trim(); } }
  return t.replace(/\s+/g, ' ').slice(0, 40);
}
function onInputFocusAudit(e){
  const t = e.target;
  if(!t || !t.tagName || (t.tagName !== 'INPUT' && t.tagName !== 'TEXTAREA')) return;
  const type = (t.getAttribute('type') || 'text').toLowerCase();
  if(t.tagName === 'INPUT' && INPUT_FOCUS_AUDIT_TYPES.indexOf(type) === -1) return;
  const mask = v => v == null ? null : String(v).replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<uuid>').slice(0, 60);
  pushDebugEvent({ t: Math.round(performance.now() - debugRecordingStartedAt), type: 'input-focus-audit',
    fieldId: mask(t.id) || null, fieldName: mask(t.getAttribute('name')), fieldType: t.tagName === 'TEXTAREA' ? 'textarea' : type,
    fieldAutocomplete: t.getAttribute('autocomplete'), fieldInputmode: t.getAttribute('inputmode'), fieldAria: mask(t.getAttribute('aria-label')),
    fieldPlaceholder: mask(t.getAttribute('placeholder')), fieldLabel: inputFieldLabelText(t) || null, fieldHasForm: !!t.closest('form'),
    fieldLabelFor: !!(t.id && document.querySelector('label[for="' + (window.CSS && CSS.escape ? CSS.escape(t.id) : t.id) + '"]')),
    fieldForbidden: forbiddenInputAttr(t.id) || forbiddenInputAttr(t.getAttribute('name')) || null });
}
// Rev 2.32.217 (FIELDS-SNAP, клас A, лише діагностика при записі): знімок атрибутів УСІХ input/textarea у DOM (fields-snapshot: при старті, «Мітка», «Стоп») і журнал додавання/видалення полів (field-added / field-removed, MutationObserver по body) з екраном і міткою часу — щоб побачити, що саме змінюється в DOM у «Структура → Словник» (гіпотеза: Safari перераховує поля сторінки при їх появі/зникненні). Без значень полів; uuid в id замінюється на <uuid>. Поведінку полів не змінює.
let debugFieldsObserver = null;
function debugFieldBrief(el){
  const cut = function(v){ return String(v == null ? '' : v).replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, '<uuid>').replace(/\s+/g, ' ').trim().slice(0, 40); };
  return { id: cut(el.id), type: cut((el.getAttribute('type') || (el.tagName === 'TEXTAREA' ? 'textarea' : 'text')).toLowerCase()), name: cut(el.getAttribute('name')), ac: cut(el.getAttribute('autocomplete')) };
}
function debugScreenName(){
  let v = null; try{ v = document.querySelector('.view:not(.hidden)'); }catch(e){}
  let name = v && v.id ? v.id : '—';
  try{
    const d = document.querySelector('.drawer.open, .app-modal.open'); if(d && d.id) name += '+' + d.id;
    const sp = document.querySelector('.struct-tab-panel:not(.hidden)'); if(sp && v && v.id === 'view-structure' && sp.id) name += '/' + sp.id.replace('struct-tab-panel-', '');
  }catch(e){}
  return name;
}
function debugFieldLine(el, visible){ const b = debugFieldBrief(el); return [b.id || '—', b.type, b.name, b.ac, visible ? 'vis' : 'hid'].join('|'); }
// Rev 2.32.229 (BASE-CENSUS, клас A, лише діагностика при записі): скільки записів кожного з дев'яти доменів не має зліпка (serverBase/serverUpdatedAt). Лише числа й ключ домену, без назв, сум та id. Дані для плану «прибрати годинникове порівняння» (потрібні, щоб знати, чи досяжний старий LWW-шлях на справжніх пристроях).
// total — усього записів (із надгробками); cloud — вже були на сервері (cloudId, а в прихованих — хоч раз надіслані); noBase — без зліпка або без serverUpdatedAt; dirty — localRev > syncedRev; risk — cloud && noBase && dirty (саме їх зачіпає старий шлях). Окремої стійкої ознаки row-gone немає: вона тимчасова всередині push, тож тут її не рахуємо.
function baselineCensusRows(domains){
  return Object.keys(domains).map(function(k){
    let list = []; try{ list = domains[k].list() || []; }catch(e){}
    const o = { dom: k, total: 0, cloud: 0, noBase: 0, dirty: 0, risk: 0 };
    list.forEach(function(r){
      if(!r || typeof r !== 'object') return;
      const cloud = !!(r.cloudId || r.syncedUpdatedAt || r.serverUpdatedAt), noBase = !r.serverBase || !r.serverUpdatedAt, dirty = (r.localRev || 0) > (r.syncedRev || 0);
      o.total++; if(cloud) o.cloud++; if(noBase) o.noBase++; if(dirty) o.dirty++; if(cloud && noBase && dirty) o.risk++;
    });
    return o;
  });
}
function recordBaselineCensus(why){
  if(!debugRecordingActive) return;
  baselineCensusRows(MERGE_DOMAINS).forEach(function(o){
    pushDebugEvent({ t: Math.round(performance.now() - debugRecordingStartedAt), type: 'baseline-census', snapWhy: why, mergeDom: o.dom, censusTotal: o.total, censusCloud: o.cloud, censusNoBase: o.noBase, censusDirty: o.dirty, censusRisk: o.risk });
  });
}
function recordFieldsSnapshot(why){
  if(!debugRecordingActive) return;
  const lines = []; let n = 0;
  document.querySelectorAll('input, textarea').forEach(function(el){
    n++;
    if(lines.length < 80){ let vis = false; try{ vis = el.offsetParent !== null || !!(el.closest && el.closest('.drawer.open, .app-modal.open')); }catch(e){} lines.push(debugFieldLine(el, vis)); }
  });
  const a = document.activeElement;
  pushDebugEvent({ t: Math.round(performance.now() - debugRecordingStartedAt), type: 'fields-snapshot', snapWhy: why, fieldsCount: n, fields: lines, fieldScreen: debugScreenName(), activeElementTag: a ? a.tagName : null, activeElementId: a ? debugFieldBrief(a).id : null, activeElementType: a && a.getAttribute ? a.getAttribute('type') : null });
}
function onDebugFieldsMutation(muts){
  if(!debugRecordingActive) return;
  const report = function(node, kind){
    if(!node || node.nodeType !== 1) return;
    const list = /^(INPUT|TEXTAREA)$/.test(node.tagName) ? [node] : Array.prototype.slice.call(node.querySelectorAll ? node.querySelectorAll('input, textarea') : []);
    list.forEach(function(el){ const b = debugFieldBrief(el); pushDebugEvent({ t: Math.round(performance.now() - debugRecordingStartedAt), type: kind, fieldId: b.id, fieldType: b.type, fieldName: b.name, fieldAc: b.ac, fieldScreen: debugScreenName() }); });
  };
  muts.forEach(function(m){ Array.prototype.forEach.call(m.addedNodes, function(nd){ report(nd, 'field-added'); }); Array.prototype.forEach.call(m.removedNodes, function(nd){ report(nd, 'field-removed'); }); });
}
function attachDebugRecorderListeners(){
  function on(target, type, handler, opts){
    if(!target) return;
    target.addEventListener(type, handler, opts);
    debugListenerHandles.push({ target: target, type: type, handler: handler, opts: opts });
  }
  on(window, 'resize', onDebugWindowResize);
  if(window.visualViewport){
    on(window.visualViewport, 'resize', onDebugVvResize);
    on(window.visualViewport, 'scroll', onDebugVvScroll);
    on(window.visualViewport, 'resize', onKbgVvChange); // Rev 2.32.238 (KB-GEOM)
    on(window.visualViewport, 'scroll', onKbgVvChange);
  }
  on(document, 'focusin', onKbgFocusIn, true); // Rev 2.32.238 (KB-GEOM): capture, лише читання
  on(window, 'scroll', onDebugScroll, true); // capture: ловимо скрол БУДЬ-ЯКого внутрішнього контейнера (#main-col, .drawer), не лише window
  on(document, 'focusin', onDebugFocusIn);
  on(document, 'focusin', onInputFocusAudit, true); // Rev 2.31.4 (C): input-focus-audit
  on(document, 'focusin', onExpenseFocusNeighbors, true); // Rev 2.29.1: діагностика стрілок (capture — до змін фокус-логіки)
  on(document, 'focusout', onDebugFocusOut);
  on(window, 'orientationchange', onDebugOrientationChange);
  on(document, 'visibilitychange', onDebugVisibilityChange);
  on(window, 'pageshow', onDebugPageShow);
  on(window, 'pagehide', onDebugPageHide);
  on(window, 'touchstart', onDebugTouchStart, { passive: true });
  on(window, 'touchend', onDebugTouchEnd, { passive: true });
  // Rev 2.32.212 (SUGGEST-TAP): touchstart/touchend/touchcancel/pointer*/click на рядках підказок: event.timeStamp (коли iOS створив подію) проти performance.now() у момент обробки + cancelable — розрізняє «головний потік завис» і «iOS віддав подію пізно»
  ['touchstart', 'touchend', 'touchcancel', 'pointerdown', 'pointerup', 'pointercancel', 'click'].forEach(function(ev){ on(document, ev, function(e){ const tg = e.target && e.target.closest ? e.target.closest('.name-suggest-item') : null; if(!tg || !debugRecordingActive) return; pushDebugEvent({ t: Math.round(performance.now() - debugRecordingStartedAt), type: 'suggest-evt', ev: ev, ts: Math.round(e.timeStamp), now: Math.round(performance.now()), cancelable: !!e.cancelable }); }, true); });
  ['pointerdown', 'pointerup', 'pointercancel', 'click'].forEach(function(ev){ on(document, ev, onDebugAddButtonPointer, true); }); // Rev 2.32.129: add-button (capture — до обробників кнопки)
  if(typeof MutationObserver !== 'undefined'){
    debugRecordingMutationObserver = new MutationObserver(onDebugBodyClassChange);
    debugRecordingMutationObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    if(typeof onDebugFieldsMutation === 'function' && typeof debugFieldsObserver !== 'undefined'){ debugFieldsObserver = new MutationObserver(onDebugFieldsMutation); debugFieldsObserver.observe(document.body, { childList: true, subtree: true }); }
  }
}
function detachDebugRecorderListeners(){
  debugListenerHandles.forEach(function(h){ h.target.removeEventListener(h.type, h.handler, h.opts); });
  debugListenerHandles = [];
  if(debugRecordingMutationObserver){ debugRecordingMutationObserver.disconnect(); debugRecordingMutationObserver = null; }
  if(typeof debugFieldsObserver !== 'undefined' && debugFieldsObserver){ debugFieldsObserver.disconnect(); debugFieldsObserver = null; }
  if(debugScrollCoalesceTimer){ clearTimeout(debugScrollCoalesceTimer); debugScrollCoalesceTimer = null; }
}
function updateDebugRecordButtonUI(){
  const sub = document.getElementById('debug-record-btn-sub');
  const indicator = document.getElementById('debug-record-indicator');
  if(!sub) return;
  if(debugRecordingActive){
    const elapsedS = Math.floor((performance.now() - debugRecordingStartedAt) / 1000);
    const mm = String(Math.floor(elapsedS / 60)).padStart(2, '0');
    const ss = String(elapsedS % 60).padStart(2, '0');
    sub.textContent = `● Іде запис · ${mm}:${ss}`;
    const timerEl = document.getElementById('debug-record-timer');
    if(timerEl) timerEl.textContent = `${mm}:${ss}`;
    if(indicator) indicator.classList.remove('hidden');
  }else{
    sub.textContent = ''; // Rev 2.32.189 (CHECKS-1): поза записом рядок без підпису
    if(indicator) indicator.classList.add('hidden');
  }
}
function startDebugRecording(scenario){
  if(debugRecordingActive) return;
  debugRecordingActive = true;
  debugRecordingStartedAt = performance.now();
  debugRecordingScenario = (scenario || '').slice(0, 120);
  debugEventBuffer = [];
  // Rev 2.32.211 (SUGGEST-LAG): довгі задачі головного потоку (>50 мс) у записі діагностики, лише тривалість; спостерігач живе, поки йде запис.
  // Rev 2.32.214 (TAP-1): повільні взаємодії (Event Timing, INP) понад 200 мс у записі діагностики: лише назва події й тривалість.
  try{
    if(typeof PerformanceObserver !== 'undefined' && !debugEventTimingObserver){
      debugEventTimingObserver = new PerformanceObserver(function(list){ list.getEntries().forEach(function(en){ if(debugRecordingActive && en.duration >= 200) pushDebugEvent({ t: Math.round(en.startTime - debugRecordingStartedAt), type: 'slow-interaction', ev: String(en.name || '').slice(0, 24), dur: Math.round(en.duration) }); }); });
      debugEventTimingObserver.observe({ type: 'event', durationThreshold: 200, buffered: false });
    }
  }catch(e){ debugEventTimingObserver = null; }
  try{
    if(typeof PerformanceObserver !== 'undefined' && !debugLongTaskObserver){
      debugLongTaskObserver = new PerformanceObserver(function(list){ list.getEntries().forEach(function(en){ if(debugRecordingActive) pushDebugEvent({ t: Math.round(en.startTime - debugRecordingStartedAt), type: 'longtask', dur: Math.round(en.duration) }); }); });
      debugLongTaskObserver.observe({ type: 'longtask', buffered: false });
    }
  }catch(e){ debugLongTaskObserver = null; }
  if(typeof jsErrorEvents !== 'undefined') jsErrorEvents = {}; // Rev 2.32.53 (J)
  if(typeof jsErrorList !== 'undefined' && jsErrorList.length) pushDebugEvent({ t: 0, type: 'js-error-backlog', count: jsErrorList.length, errors: jsErrorBacklogLines(jsErrorList) }); // помилки до старту запису
  attachDebugRecorderListeners();
  captureDebugGeometry('start');
  if(typeof recordUiAudit === 'function') recordUiAudit(); // Rev 2.26.0 (M3): ui-audit — лише кількості
  if(typeof recordInputAttrsAudit === 'function') recordInputAttrsAudit(); // Rev 2.28.1 (C): input-attrs-audit
  if(typeof recordFieldsCensus === 'function') recordFieldsCensus(); // Rev 2.32.31 (A): fields-census
  if(typeof recordFieldsSnapshot === 'function') recordFieldsSnapshot('start'); // Rev 2.32.217 (FIELDS-SNAP)
  if(typeof recordBaselineCensus === 'function') recordBaselineCensus('start'); // Rev 2.32.229 (BASE-CENSUS)
  if(typeof recordKbGeometry === 'function') recordKbGeometry('start'); // Rev 2.32.238 (KB-GEOM)
  if(typeof recordKbEnv === 'function') recordKbEnv(); // Rev 2.32.9 (B): kb-env
  if(typeof XSS_AUDITED_SITES === 'number') pushDebugEvent({ t: Math.round(performance.now() - debugRecordingStartedAt), type: 'xss-audit', sites: XSS_AUDITED_SITES }); // Rev 2.32.19 (X): лише кількість місць, значень немає
  debugRecordingTimerInterval = setInterval(updateDebugRecordButtonUI, 1000);
  debugRecordingAutoStopTimer = setTimeout(function(){ stopDebugRecording(); }, DEBUG_RECORDING_AUTO_STOP_MS);
  updateDebugRecordButtonUI();
}
function stopDebugRecording(){
  if(!debugRecordingActive) return;
  captureDebugGeometry('stop');
  if(typeof recordFieldsSnapshot === 'function') recordFieldsSnapshot('stop'); // Rev 2.32.217 (FIELDS-SNAP)
  if(typeof recordBaselineCensus === 'function') recordBaselineCensus('stop'); // Rev 2.32.229 (BASE-CENSUS)
  if(typeof recordKbGeometry === 'function') recordKbGeometry('stop'); // Rev 2.32.238 (KB-GEOM)
  debugRecordingActive = false;
  detachDebugRecorderListeners();
  if(debugRecordingTimerInterval){ clearInterval(debugRecordingTimerInterval); debugRecordingTimerInterval = null; }
  if(debugRecordingAutoStopTimer){ clearTimeout(debugRecordingAutoStopTimer); debugRecordingAutoStopTimer = null; }
  updateDebugRecordButtonUI();
  const form = document.getElementById('debug-record-form');
  const stopActions = document.getElementById('debug-record-stop-actions');
  const summary = document.getElementById('debug-record-summary');
  if(form) form.classList.add('hidden');
  if(stopActions) stopActions.classList.remove('hidden');
  if(summary) summary.textContent = `Зібрано подій: ${debugEventBuffer.length}. Сценарій: ${debugRecordingScenario || '(не вказано)'}.`;
  const backdrop = document.getElementById('debug-record-backdrop');
  const drawer = document.getElementById('debug-record-drawer');
  // Rev 2.23.7 (6D.176) — stopDebugRecording() може викликатись і коли
  // шторка вже відкрита (стоп-кнопка ВСЕРЕДИНІ неї), і коли закрита (стоп із
  // плаваючого індикатора) — лочимо фон лише в ДРУГОМУ випадку, інакше
  // лічильник openOverlayCount розбалансується.
  const wasOpen = drawer && drawer.classList.contains('open');
  if(backdrop){ backdrop.removeAttribute('inert'); backdrop.classList.add('open'); }
  if(drawer){ drawer.removeAttribute('inert'); drawer.classList.add('open'); }
  if(!wasOpen) lockBackgroundScroll();
}
// Rev 2.22.92 (6D.165) BugFix — живий тест: "не зрозуміло чи натиснулась
// Мітка, немає жодного сигналу та візуалу" — короткий, суто косметичний
// відгук на самій кнопці (текст+деактивація на 700мс), жодного впливу на
// геометрію/фокус/те, що вимірюється (явна вимога ТЗ рекордера).
function markDebugEvent(){
  captureDebugGeometry('mark');
  if(typeof recordFieldsSnapshot === 'function') recordFieldsSnapshot('mark'); // Rev 2.32.217 (FIELDS-SNAP)
  if(typeof recordBaselineCensus === 'function') recordBaselineCensus('mark'); // Rev 2.32.229 (BASE-CENSUS)
  if(typeof recordKbGeometry === 'function') recordKbGeometry('mark'); // Rev 2.32.238 (KB-GEOM)
  const btn = document.getElementById('debug-record-mark-btn');
  if(!btn || btn.disabled) return;
  const original = btn.textContent;
  btn.textContent = '✓ Додано';
  btn.disabled = true;
  setTimeout(function(){ btn.textContent = original; btn.disabled = false; }, 700);
}
let debugRecordSnap = ''; // Rev 2.32.376 (DS-4c): початкове значення поля сценарію
function openDebugRecordDrawer(prefillScenario){
  if(debugRecordingActive){ stopDebugRecording(); return; }
  const form = document.getElementById('debug-record-form');
  const stopActions = document.getElementById('debug-record-stop-actions');
  if(form) form.classList.remove('hidden');
  if(stopActions) stopActions.classList.add('hidden');
  const scenarioInput = document.getElementById('debug-record-scenario');
  // Rev 2.23.22 (6D.191): сценарій може прийти з картки тесту (<id>-<variant>);
  // onclick без аргументів лишає порожній (тоді підставиться поточний екран).
  if(scenarioInput) scenarioInput.value = typeof prefillScenario === 'string' ? prefillScenario : '';
  debugRecordSnap = scenarioInput ? scenarioInput.value.trim() : '';
  const backdrop = document.getElementById('debug-record-backdrop');
  const drawer = document.getElementById('debug-record-drawer');
  const wasOpen = drawer && drawer.classList.contains('open');
  lastFocusedBeforeDialog = document.activeElement;
  if(backdrop){ backdrop.removeAttribute('inert'); backdrop.classList.add('open'); }
  if(drawer){ drawer.removeAttribute('inert'); drawer.classList.add('open'); focusFirstIn(drawer); }
  if(!wasOpen) lockBackgroundScroll();
}
function closeDebugRecordDrawer(){
  const backdrop = document.getElementById('debug-record-backdrop');
  const drawer = document.getElementById('debug-record-drawer');
  const wasOpen = drawer && drawer.classList.contains('open');
  if(backdrop){ backdrop.classList.remove('open'); backdrop.setAttribute('inert', ''); }
  if(drawer){ drawer.classList.remove('open'); drawer.setAttribute('inert', ''); }
  restoreFocus();
  if(wasOpen) unlockBackgroundScroll();
}
// Rev 2.23.21 (6D.190) — resolveDebugScenario: порожній сценарій більше не
// надсилається — підставляється назва поточного контексту (відкрита шторка,
// крім самого запису діагностики, інакше активна вкладка, інакше 'manual').
function resolveDebugScenario(raw, fallbackName){
  const trimmed = (raw || '').trim();
  if(trimmed) return trimmed.slice(0, 120);
  return (fallbackName || 'manual').slice(0, 120);
}
function currentDebugContextName(){
  const open = document.querySelector('.drawer.open:not(#debug-record-drawer)');
  if(open && open.id) return open.id;
  const tab = document.querySelector('nav.tabbar button.active');
  if(tab){
    const cls = Array.prototype.find.call(tab.classList, function(c){ return c.indexOf('tab-') === 0; });
    if(cls) return cls;
  }
  return 'manual';
}
function startDebugRecordingFromDrawer(){
  const scenarioInput = document.getElementById('debug-record-scenario');
  startDebugRecording(resolveDebugScenario(scenarioInput ? scenarioInput.value : '', currentDebugContextName()));
  closeDebugRecordDrawer();
}
function buildDebugLogDevice(){
  const ua = navigator.userAgent || '';
  return {
    userAgent: ua,
    platform: navigator.platform || null,
    screenWidth: window.screen ? window.screen.width : null,
    screenHeight: window.screen ? window.screen.height : null,
    devicePixelRatio: window.devicePixelRatio || null,
    standalone: isStandaloneDisplayMode(
      navigator.standalone,
      !!(window.matchMedia && window.matchMedia('(display-mode: standalone)').matches)
    ),
    orientation: window.innerWidth > window.innerHeight ? 'landscape' : 'portrait',
    iosVersion: detectIosVersionFromUserAgent(ua),
    recorderUi: true,
    // Rev 2.23.22 (6D.191): усі активні тести → обраний варіант ({} коли тестів нема).
    variants: getVariantsSnapshot(),
  };
}
// ===== Rev 2.32.260 (REC-1): бортовий самописець =====
// Застосунок постійно тримає короткий запис останніх подій (2 хв, до REC_MAX_EVENTS) у пам'яті з дзеркалом в IndexedDB і сам надсилає його в client_debug_logs
// (scenario 'incident') при збої або за кнопкою «Повідомити про проблему». Пакет ділиться на частини (рядок таблиці ≤ 600 КБ і ≤ 3000 подій у БД), частини одного звіту
// мають однаковий device.report.code. Приватність: подія проходить через білі списки типів і ключів (REC_ALLOWED_TYPES / REC_ALLOWED_KEYS), рядки очищаються
// (uuid, email, довгі числа), суми, назви й описи записів, паролі й токени сюди не потрапляють. Верхня межа звіту — REC_MAX_REPORT_BYTES.
// Пошук для чату: select id, created_at, device->'report', jsonb_array_length(events) from client_debug_logs where scenario = 'incident' and device->'report'->>'code' = 'MT-1106-0193' order by (device->'report'->>'part')::int
const REC_WINDOW_MS = 120000;
const REC_MAX_EVENTS = 1200;
const REC_CHUNK_BYTES = 150000;
const REC_CHUNK_EVENTS = 600;
const REC_MAX_REPORT_BYTES = 450000;
const REC_RATE_TYPE_MS = 600000;
const REC_RATE_PER_DAY = 20;
const REC_QUEUE_MAX = 5;
const REC_MIRROR_KEY = 'budget-rec-buffer-v1';
const REC_QUEUE_KEY = 'budget-rec-queue-v1';
const REC_RATE_KEY = 'budget-rec-rate-v1';
const REC_SENT_KEY = 'budget-rec-sent-v1';
const REC_ALLOWED_TYPES = ['login-lock', 'login-fill', 'login-submit', 'kb-shot-close', 'touch-cancel', 'native-focus', 'switch-miss', 'kb-early-fallback', 'autofocus-transfer', 'kb-early-skip', 'kb-early', 'autofill', 'enter-next', 'arrow-direct', 'switch-trace', 'pan-comp', 'deeplink', 'app-visible-sync', 'inbox-new-toast', 'kb-heights', 'sheet-open', 'sheet-close', 'sheet-anim', 'caret-hidden', 'pan-corrected', 'switch-native', 'native-switch', 'proxy-switch', 'focus-transfer', 'focus-transfer-forced', 'focus-proxy', 'field-scroll', 'kb-vv-resize', 'kb-win-focus', 'kb-win-blur', 'kb-visibility', 'kb-bg-reset', 'kb-transient-hide', 'kb-open-class-changed', 'kb-open-released', 'kb-frames', 'kb-guard', 'kb-geometry', 'tabbar-restore', 'vv-resize', 'vv-scroll', 'focusin', 'focusout', 'visibilitychange', 'pageshow', 'pagehide', 'orientationchange', 'resize', 'touch', 'intercept-miss', 'intercept-via-label', 'switch-intercept', 'focus-no-preventscroll', 'sync-heads', 'sync-delta', 'sync-full', 'sync-full-recon', 'autosync', 'push-msg', 'push-apply', 'push-click', 'push-route', 'sw-update', 'signout', 'signout-fallback', 'signout-no-server', 'login', 'js-error', 'write-blocked', 'rec-trigger', 'push-receipt-fail', 'load-fail', 'tab-anim', 'tab-mini', 'sheet-swipe', 'tab-scroll', 'sheet-discard', 'echo-skip', 'pull-skip', 'suggest-tap', 'push-toast'];
const REC_ALLOWED_KEYS = ['sinceClose', 'idShort', 'via', 'started', 'ran', 'finished', 'mini', 'byUser', 'vel', 'closed', 'startEl', 'changed', 'why', 'cutAfterMs', 'cutBy', 'lagMs', 'anims', 'earlyState', 't', 'wall', 'type', 'innerW', 'innerH', 'vvW', 'vvH', 'vvOffsetTop', 'scrollY', 'kbInset', 'kbH', 'activeElementTag', 'activeElementId', 'activeElementType', 'orientation', 'tabbarTop', 'tabbarHeight', 'drawerId', 'choice', 'drawerTop', 'drawerBottom', 'drawerHeight', 'backdropId', 'sheetLiftCss', 'sheetRestBottom', 'sheetBottomAtTransfer', 'sheetFinalBottom', 'activeRectTop', 'activeRectBottom', 'ms', 'proxyActive', 'frames', 'maxGapMs', 'durationMs', 'samples', 'phase', 'jumpMaxPx', 'settledY', 'settleDeltaPx', 'from', 'to', 'switchKind', 'dir', 'keyboardTypeOk', 'panMax400', 'hasFocus', 'visibility', 'kbOpen', 'msAfterFocusout', 'blips', 'firstKbFrameT', 'kbReleaseVvH', 'kbReleaseBaseVh', 'skipped', 'field', 'delta', 'bodyClasses', 'targetTag', 'targetId', 'targetClasses', 'touchX', 'touchY', 'kbgWhy', 'devClass', 'sheetTop', 'sheetBottom', 'sheetHeight', 'fieldTop', 'fieldBottom', 'kbHeightCalc', 'tabbarGap', 'drawerScrollHeight', 'drawerClientHeight', 'drawerScrollTop', 'actionsTop', 'actionsBottom', 'scrollFrom', 'scrollTo', 'samplesExt', 'samplesH', 'caretColor', 'proxyTop', 'proxyBottom', 'table', 'rows', 'ok', 'changedTables', 'profiles', 'full', 'failed', 'server', 'fetched', 'removed', 'dirty', 'trigger', 'reason', 'pushType', 'clients', 'focus', 'source', 'found', 'applied', 'result', 'cleared', 'unsubscribed', 'message', 'stackTop', 'tab', 'count', 'kind', 'errorCode', 'route', 'online', 'why', 'gap', 'anims', 'proxyInputmode', 'targetInputmode', 'via', 'kbHs', 'kbHCount', 'visible', 'shown', 'tapped', 'scrollTop', 'panShift', 'fieldCenter', 'centerC', 'preemptD', 'iosR', 'cAfter', 'maxScroll', 'scrollAfter', 'padAdded', 'relayCenter', 'maxShift', 'relayCount', 'relayIds', 'relayCenters', 'during', 'fields', 'by', 'expected', 'src', 'factor', 'target', 'deadline', 'rel', 'need', 'lmin', 'lnorm', 'vvTopBefore', 'scrollYBefore', 'distPx', 'prevTabindex', 'targetTabindex', 'sinceTouchEnd', 'enterHop', 'activeStart', 'activeEnd', 'sinceIntercept', 'stPreMs', 'stEnterMs', 'stCapMs', 'stPipeMs', 'stRestMs', 'stTotalMs', 'firstFrameMs', 'firstAnimMs', 'samplesLift', 'pageTop', 'pageTopStart', 'pageTopEnd', 'latencyMs', 'platformField', 'ev', 'inputType', 'autofill', 'filled', 'kd', 'on', 'files', 'ageMin', 'loadVer', 'inList', 'fieldFocus', 'picked', 'iosV', 'standalone', 'dpr', 'coarse'];
// Значення: числа (округлені), булеві, короткі очищені рядки, масиви чисел/коротких рядків/пар, плоскі об'єкти з тих самих листків. Усе інше відкидається.
function recSanitizeValue(v, depth){
  if(v == null) return null;
  if(typeof v === 'number') return isFinite(v) ? Math.round(v * 10) / 10 : null;
  if(typeof v === 'boolean') return v;
  if(typeof v === 'string') return String(v).replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '<email>').replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<uuid>').replace(/\d[\d\s.,:-]{5,}\d/g, '<num>').replace(/\s+/g, ' ').trim().slice(0, 80);
  if(depth >= 2) return null;
  if(Array.isArray(v)) return v.slice(0, 80).map(function(x){ return recSanitizeValue(x, (depth || 0) + 1); }).filter(function(x){ return x !== null; });
  if(typeof v === 'object'){
    const o = {};
    Object.keys(v).slice(0, 12).forEach(function(k){
      const s = recSanitizeValue(v[k], (depth || 0) + 1);
      if(s !== null && typeof s !== 'object') o[String(k).replace(/[^A-Za-z0-9_]/g, '').slice(0, 24)] = s;
    });
    return o;
  }
  return null;
}
// Подія → очищена подія або null (тип поза списком). wall — мітка часу (мс від епохи).
function recSanitizeEvent(raw, wall){
  if(!raw || typeof raw !== 'object' || REC_ALLOWED_TYPES.indexOf(raw.type) === -1) return null;
  const out = {};
  REC_ALLOWED_KEYS.forEach(function(k){
    if(!Object.prototype.hasOwnProperty.call(raw, k) || raw[k] === undefined) return;
    const s = recSanitizeValue(raw[k], 0);
    if(s !== null) out[k] = s;
  });
  out.type = raw.type;
  // Текст помилки може містити дані користувача (назви, суми): у звіт іде лише клас помилки (TypeError тощо); джерело й імена функцій лишаються.
  if(raw.type === 'js-error') out.message = (String(raw.message == null ? '' : raw.message).match(/^(?:Uncaught\s+)?([A-Za-z]*Error|Unhandled rejection)/) || [])[1] || 'Error';
  out.wall = typeof wall === 'number' ? wall : Date.now();
  return out;
}
// Лише події за останні windowMs і не більше maxEvents (нові лишаються).
function recTrim(buf, nowWall, windowMs, maxEvents){
  const from = nowWall - windowMs;
  let list = buf.filter(function(e){ return typeof e.wall !== 'number' || e.wall >= from; });
  if(list.length > maxEvents) list = list.slice(list.length - maxEvents);
  return list;
}
// Відкидає найстаріші події, доки JSON не влізе в maxBytes (верхня межа звіту).
function recLimitReport(events, maxBytes){
  let list = events.slice();
  while(list.length > 1 && JSON.stringify(list).length > maxBytes) list = list.slice(Math.ceil(list.length * 0.1));
  return list;
}
// Частини для вставки: кожна ≤ maxBytes і ≤ maxCount подій; порядок збережено.
function recChunk(events, maxBytes, maxCount){
  const chunks = []; let cur = []; let size = 2;
  events.forEach(function(e){
    const n = JSON.stringify(e).length + 1;
    if(cur.length && (size + n > maxBytes || cur.length >= maxCount)){ chunks.push(cur); cur = []; size = 2; }
    cur.push(e); size += n;
  });
  if(cur.length) chunks.push(cur);
  return chunks;
}
function recReportCode(date, rand){
  const p = function(n, w){ return String(n).padStart(w, '0'); };
  return 'MT-' + p(date.getMonth() + 1, 2) + p(date.getDate(), 2) + '-' + p(Math.abs(Math.floor(rand)) % 10000, 4);
}
// Обмеження частоти: не частіше одного звіту кожного типу за perTypeMs і не більше perDay за добу. log — [{ type, at }].
function recRateCheck(log, type, now, perTypeMs, perDay){
  const fresh = (Array.isArray(log) ? log : []).filter(function(r){ return r && typeof r.at === 'number' && now - r.at < 86400000; });
  const lastSame = fresh.filter(function(r){ return r.type === type; }).reduce(function(m, r){ return Math.max(m, r.at); }, 0);
  if(lastSame && now - lastSame < perTypeMs) return { allow: false, log: fresh };
  if(fresh.length >= perDay) return { allow: false, log: fresh };
  return { allow: true, log: fresh.concat([{ type: type, at: now }]) };
}
// Черга непереданих звітів: найстаріші відкидаються понад max.
function recQueueAdd(queue, report, max){
  const q = (Array.isArray(queue) ? queue : []).filter(function(r){ return r && r.code !== report.code; }).concat([report]);
  return q.length > max ? q.slice(q.length - max) : q;
}
// Аномалія руху листа: різкий рух >20 пт і одразу назад >20 пт за 600 мс (відскок). Повертає 'sheet-jump' або null.
function recDetectSheetJump(events){
  const pts = events.filter(function(e){ return typeof e.drawerBottom === 'number' && typeof e.wall === 'number' && e.drawerId; }).slice(-14);
  for(let i = 0; i + 2 < pts.length; i++){
    const a = pts[i], b = pts[i + 1], c = pts[i + 2];
    if(a.drawerId !== b.drawerId || b.drawerId !== c.drawerId || c.wall - a.wall > 600) continue;
    const d1 = b.drawerBottom - a.drawerBottom, d2 = c.drawerBottom - b.drawerBottom;
    if(Math.abs(d1) > 20 && Math.abs(d2) > 20 && d1 * d2 < 0) return 'sheet-jump';
  }
  return null;
}
// Поле у фокусі нижче нижньої межі видимої області (під клавіатурою): rect.bottom > vv.offsetTop + vv.height + tolerance.
function recFieldHidden(rectBottom, vvH, vvTop, tolerance){
  if(typeof rectBottom !== 'number' || typeof vvH !== 'number') return false;
  return rectBottom > (vvTop || 0) + vvH + (tolerance == null ? 2 : tolerance);
}

// Rev 2.32.272 (KB-18): самоконтроль форми в спокої: низ листа на 8 ± 2 пт над клавіатурою (vv.offsetTop + vv.height), і не більше однієї transform-анімації на формі. Чиста функція: gap = нижня межа видимої області − низ листа; anims = кількість активних transform-анімацій.
function recSheetRestOff(gap, anims){
  if(typeof gap !== 'number' || !isFinite(gap)) return null;
  if(anims > 1) return 'double-anim';
  return Math.abs(gap - 8) > 2 ? 'rest-gap' : null;
}

// ----- Рантайм самописця (Rev 2.32.260, REC-1) -----
let recBuf = [];
let recMirrorTimer = null;
let recFlushing = false;
let recVvRaf = 0;
let recFieldTimer = null;
let recRateMem = []; // запас на випадок, коли localStorage недоступний (приватний режим, квота): ліміт частоти діє хоча б до перезапуску
function recStoreGet(key){ try{ return JSON.parse(localStorage.getItem(key) || 'null'); }catch(e){ return null; } }
function recStoreSet(key, val){ try{ localStorage.setItem(key, JSON.stringify(val)); }catch(e){} }
// Подія з будь-якого джерела (pushDebugEvent) → білий список → буфер у пам'яті. Без запису в IDB на кожну подію: дзеркало раз на кілька секунд.
function recPush(raw){
  const ev = recSanitizeEvent(raw, Date.now());
  if(!ev) return;
  recBuf.push(ev);
  const from = ev.wall - REC_WINDOW_MS;
  while(recBuf.length && (recBuf[0].wall < from || recBuf.length > REC_MAX_EVENTS)) recBuf.shift();
  recScheduleMirror();
  if(ev.type === 'vv-resize' || ev.type === 'sheet-anim' || ev.type === 'sheet-close'){
    const a = recDetectSheetJump(recBuf);
    if(a) recTrigger(a);
  }
}
function recScheduleMirror(){
  if(recMirrorTimer) return;
  recMirrorTimer = setTimeout(function(){ recMirrorTimer = null; recMirrorSave(); }, 3000);
}
function recMirrorSave(){
  try{ return Promise.resolve(idbAdapterSet(REC_MIRROR_KEY, JSON.stringify({ v: 1, ev: recBuf }))).catch(function(){}); }catch(e){ return Promise.resolve(); }
}
async function recMirrorLoad(){
  try{
    const raw = await idbAdapterGet(REC_MIRROR_KEY);
    const o = raw ? JSON.parse(raw) : null;
    if(o && Array.isArray(o.ev)){
      const restored = recTrim(o.ev.filter(function(e){ return e && typeof e.type === 'string'; }), Date.now(), REC_WINDOW_MS, REC_MAX_EVENTS);
      recBuf = restored.concat(recBuf);
    }
  }catch(e){}
}
function recBuildDevice(trigger){
  let dev = {};
  try{ dev = buildDebugLogDevice(); }catch(e){}
  let theme = null; try{ theme = document.documentElement.getAttribute('data-theme') || null; }catch(e){}
  return Object.assign({}, dev, { appVersion: APP_VERSION, theme: theme, online: navigator.onLine !== false, trigger: trigger, sdk: (typeof supabase !== 'undefined' && supabase && supabase.version) ? String(supabase.version) : null });
}
async function recSwVersion(){
  try{ const keys = await caches.keys(); const k = keys.filter(function(n){ return n.indexOf('budget-app-v') === 0; }).sort().pop(); return k || null; }catch(e){ return null; }
}
// Надсилання частинами: insertFn(row) → { error }. Повертає { status: 'sent' | 'partial', next }.
async function recSendParts(report, insertFn, startPart){
  const chunks = recChunk(report.events, REC_CHUNK_BYTES, REC_CHUNK_EVENTS);
  if(!chunks.length) chunks.push([]);
  for(let i = startPart || 0; i < chunks.length; i++){
    let res = null;
    try{ res = await insertFn({ scenario: 'incident', app_version: report.appVersion, device: Object.assign({}, report.device, { report: { code: report.code, trigger: report.trigger, part: i + 1, parts: chunks.length, wall: report.wall } }), events: chunks[i] }); }
    catch(e){ res = { error: e || new Error('network') }; }
    if(!res || res.error) return { status: 'partial', next: i, parts: chunks.length };
  }
  return { status: 'sent', next: chunks.length, parts: chunks.length };
}
function recCanSend(){
  try{ return isCloudWriteReady() && navigator.onLine !== false; }catch(e){ return false; }
}
function recInsertRow(row){
  return getSupabaseClient().from('client_debug_logs').insert(Object.assign({ family_id: cloudFamilyId, user_id: cloudSession.user.id }, row));
}
async function recQueueLoad(){
  try{ const raw = await idbAdapterGet(REC_QUEUE_KEY); const q = raw ? JSON.parse(raw) : []; return Array.isArray(q) ? q : []; }catch(e){ return []; }
}
async function recQueueSave(q){ try{ await idbAdapterSet(REC_QUEUE_KEY, JSON.stringify(q)); }catch(e){} }
function recSentList(){ const l = recStoreGet(REC_SENT_KEY); return Array.isArray(l) ? l : []; }
function recSentSet(code, trigger, status){
  const l = recSentList().filter(function(r){ return r.code !== code; });
  l.unshift({ code: code, trigger: trigger, at: Date.now(), status: status });
  recStoreSet(REC_SENT_KEY, l.slice(0, 20));
}
// Звіт → у базу (частинами) або в чергу. Повертає 'sent' | 'queued'.
async function recDeliver(report){
  if(recCanSend()){
    const r = await recSendParts(report, recInsertRow, report.next || 0);
    if(r.status === 'sent'){ recSentSet(report.code, report.trigger, 'sent'); return 'sent'; }
    report.next = r.next;
  }
  const q = recQueueAdd(await recQueueLoad(), report, REC_QUEUE_MAX);
  await recQueueSave(q);
  recSentSet(report.code, report.trigger, 'queued');
  return 'queued';
}
async function recFlushQueue(){
  if(recFlushing || !recCanSend()) return;
  recFlushing = true;
  try{
    let q = await recQueueLoad();
    if(!q.length) return;
    const rest = [];
    for(const rep of q){
      const r = await recSendParts(rep, recInsertRow, rep.next || 0);
      if(r.status === 'sent') recSentSet(rep.code, rep.trigger, 'sent'); else { rep.next = r.next; rest.push(rep); }
    }
    await recQueueSave(rest);
  }finally{ recFlushing = false; }
}
async function recBuildReport(trigger){
  recPush({ type: 'rec-trigger', trigger: trigger, online: navigator.onLine !== false });
  const rand = (window.crypto && crypto.getRandomValues) ? crypto.getRandomValues(new Uint32Array(1))[0] : Math.random() * 1e9;
  const device = recBuildDevice(trigger);
  device.sw = await recSwVersion();
  return { code: recReportCode(new Date(), rand), trigger: trigger, wall: Date.now(), appVersion: APP_VERSION, device: device, events: recLimitReport(recBuf.slice(), REC_MAX_REPORT_BYTES), next: 0 };
}
// Автоматичний звіт (з обмеженням частоти) за подією-тригером.
function recTrigger(kind){
  if(!recBgOn) return;
  const rl = recRateCheck((recStoreGet(REC_RATE_KEY) || []).concat(recRateMem), kind, Date.now(), REC_RATE_TYPE_MS, REC_RATE_PER_DAY);
  if(!rl.allow) return;
  recRateMem = rl.log;
  recStoreSet(REC_RATE_KEY, rl.log);
  recBuildReport(kind).then(recDeliver).catch(function(){});
}
// Кнопка «Повідомити про проблему»: без обмежень частоти. Повертає { code, status }.
async function recReportNow(onCode){
  const rl = recRateCheck((recStoreGet(REC_RATE_KEY) || []).concat(recRateMem).filter(function(r){ return r.type === 'manual'; }), 'manual', Date.now(), 15000, 30);
  if(!rl.allow){ const last = recSentList()[0]; if(last){ if(onCode) onCode(last.code); return { code: last.code, status: last.status === 'sent' ? 'sent' : 'queued' }; } }
  else { recRateMem = recRateMem.concat([{ type: 'manual', at: Date.now() }]).slice(-40); }
  const rep = await recBuildReport('manual');
  if(onCode) onCode(rep.code);
  const status = await Promise.race([recDeliver(rep), new Promise(function(res){ setTimeout(function(){ res('queued'); }, 15000); })]);
  return { code: rep.code, status: status };
}
// Вихід з акаунта: буфер, черга, лічильники й список надісланих очищаються, щоб старі дані не пішли під іншим користувачем.
function recClearOnSignOut(){
  recBuf = []; recRateMem = [];
  try{ [REC_RATE_KEY, REC_SENT_KEY].forEach(function(k){ localStorage.removeItem(k); }); }catch(e){}
  try{ idbAdapterSet(REC_MIRROR_KEY, JSON.stringify({ v: 1, ev: [] })).catch(function(){}); idbAdapterSet(REC_QUEUE_KEY, '[]').catch(function(){}); }catch(e){}
}
function recBufferJson(){ return JSON.stringify({ app_version: APP_VERSION, device: recBuildDevice('copy'), events: recBuf }); }
// Самоперевірка: поле у фокусі не нижче нижньої межі видимої області (через 450 мс після останньої зміни висоти клавіатури).
function recCheckSheetRest(){
  try{
    const vv = window.visualViewport, root = document.documentElement;
    if(!vv || !root.classList.contains('kb-sheet') || vv.height > window.innerHeight - 100) return;
    const d = document.querySelector('.drawer.open, .app-modal.open'); if(!d) return;
    if(d.classList.contains('kb-sheet-closing')) return;
    const run = d.getAnimations ? d.getAnimations().filter(function(a){ return a.playState === 'running'; }).length : 0;
    const gap = vv.offsetTop + vv.height - d.getBoundingClientRect().bottom;
    const why = recSheetRestOff(gap, run);
    if(!why) return;
    pushDebugEvent({ type: 'kb-guard', skipped: false, why: why, gap: Math.round(gap), anims: run, vvH: Math.round(vv.height) });
    recTrigger('sheet-rest');
  }catch(e){}
}
function recCheckFieldVisible(){
  recCheckSheetRest();
  try{
    const vv = window.visualViewport, a = document.activeElement;
    if(!vv || !a || !/^(INPUT|TEXTAREA)$/.test(a.tagName) || a.id === 'kb-focus-proxy' || !document.body.classList.contains('kb-open')) return;
    if(vv.height > window.innerHeight - 100) return;
    const r = a.getBoundingClientRect();
    if(recFieldHidden(r.bottom, vv.height, vv.offsetTop, 2)){ pushDebugEvent({ type: 'kb-guard', skipped: false, activeElementId: a.id || null, activeRectBottom: Math.round(r.bottom), vvH: Math.round(vv.height), vvOffsetTop: Math.round(vv.offsetTop) }); recTrigger('field-hidden'); }
  }catch(e){}
}
function recBgListeners(){
  function on(t, type, h, o){ if(t) t.addEventListener(type, h, o); }
  const vvEvent = function(name){ return function(){ if(recVvRaf) return; recVvRaf = requestAnimationFrame(function(){ recVvRaf = 0; try{ captureDebugGeometry(name); }catch(e){} }); if(name === 'vv-resize'){ if(recFieldTimer) clearTimeout(recFieldTimer); recFieldTimer = setTimeout(function(){ recordKbGeometry('vv-settled'); recCheckFieldVisible(); }, 450); } }; };
  if(window.visualViewport){ on(window.visualViewport, 'resize', vvEvent('vv-resize'), { passive: true }); on(window.visualViewport, 'scroll', vvEvent('vv-scroll'), { passive: true }); }
  on(document, 'focusin', function(e){ const t = e.target; pushDebugEvent({ t: Math.round(performance.now()), type: 'focusin', activeElementId: t && t.id || null, activeElementTag: t && t.tagName || null, activeElementType: t && t.type || null, vvH: window.visualViewport ? Math.round(window.visualViewport.height) : null }); }, true);
  on(document, 'focusout', function(e){ const t = e.target; pushDebugEvent({ t: Math.round(performance.now()), type: 'focusout', activeElementId: t && t.id || null, activeElementTag: t && t.tagName || null }); }, true);
  on(document, 'visibilitychange', function(){ pushDebugEvent({ type: 'visibilitychange', visibility: document.visibilityState }); if(document.visibilityState === 'hidden') recMirrorSave(); else recFlushQueue(); });
  on(window, 'pagehide', function(){ pushDebugEvent({ type: 'pagehide' }); recMirrorSave(); });
  on(window, 'pageshow', function(){ pushDebugEvent({ type: 'pageshow' }); });
  on(window, 'orientationchange', function(){ pushDebugEvent({ type: 'orientationchange', orientation: window.innerWidth > window.innerHeight ? 'landscape' : 'portrait' }); });
  on(window, 'online', function(){ recFlushQueue(); });
  on(document, 'touchstart', function(e){ const t = e.target, p = e.touches && e.touches[0]; pushDebugEvent({ type: 'touch', targetTag: t && t.tagName || null, targetId: t && t.id || null, targetClasses: t && typeof t.className === 'string' ? t.className.slice(0, 60) : null, touchX: p ? Math.round(p.clientX) : null, touchY: p ? Math.round(p.clientY) : null }); }, { passive: true, capture: true });
  if(typeof MutationObserver !== 'undefined' && document.body){
    new MutationObserver(function(){ const open = document.body.classList.contains('kb-open'); pushDebugEvent({ type: 'kb-open-class-changed', kbOpen: open }); if(!open) setTimeout(function(){ if(!document.body.classList.contains('kb-open')) recordKbGeometry('rest-settled'); }, 450); }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  }
}
async function recBgStart(){
  if(recBgOn) return;
  recBgOn = true;
  await recMirrorLoad();
  recBgListeners();
  loadFailReport(); // Rev 2.32.347 (STRUCT-3a2): збій завантаження файлу з попереднього запуску → подія load-fail
  pushDebugEvent({ type: 'pageshow' });
  setTimeout(recFlushQueue, 4000);
}

async function sendDebugLog(){
  if(!isCloudSessionReady()){
    reportSaveResult({ success: false, error: 'Немає Cloud-сесії — скористайтесь "Скопіювати як JSON".' });
    return;
  }
  if(blockedByReadOnly()) return; // Rev 2.32.78 (KIT-1)
  const events = trimEventsForSizeLimit(debugEventBuffer, DEBUG_LOG_MAX_EVENTS_FOR_SEND, DEBUG_LOG_MAX_BYTES_FOR_SEND);
  try{
    const { error } = await getSupabaseClient().from('client_debug_logs').insert({
      family_id: cloudFamilyId,
      user_id: cloudSession.user.id,
      app_version: APP_VERSION,
      scenario: debugRecordingScenario || null,
      device: buildDebugLogDevice(),
      events: events,
    });
    if(error){
      reportSaveResult({ success: false, error: 'Не вдалось надіслати — лишаю лог, спробуйте "Скопіювати як JSON".' });
      return;
    }
    debugEventBuffer = [];
    closeDebugRecordDrawer();
    reportSaveResult({ success: true, message: 'Лог надіслано' });
  }catch(e){
    reportSaveResult({ success: false, error: 'Мережа/офлайн — лишаю лог, спробуйте "Скопіювати як JSON".' });
  }
}
async function copyDebugLogAsJson(){
  const payload = JSON.stringify({
    app_version: APP_VERSION, scenario: debugRecordingScenario || null,
    device: buildDebugLogDevice(), events: debugEventBuffer,
  }, null, 2);
  try{
    await navigator.clipboard.writeText(payload);
    reportSaveResult({ success: true, message: 'Скопійовано як JSON' });
  }catch(e){
    reportSaveResult({ success: false, error: 'Не вдалось скопіювати — буфер обміну недоступний.' });
  }
}
function discardDebugLog(){
  showConfirmModal('Скасувати запис без надсилання? Зібрані дані буде втрачено.', function(){
    debugEventBuffer = [];
    closeDebugRecordDrawer();
  }, 'Так, скасувати');
}
function runDataDiagnostics(){
  showDiagnosticsModal(buildDiagnosticsReport());
}
// Rev 2.16.2 — позначає конкретну розбіжність (назва ОЧ + місяць) як свідомо
// прийнятну (напр. переплата) і одразу перебудовує вміст УЖЕ ВІДКРИТОЇ
// модалки на місці (без закриття/повторного відкриття — інакше користувач
// щоразу губив би позицію прокрутки серед інших проблем).
async function ignoreDiagnosticDivergence(targetIdx){
  const target = diagnosticIssueTargets[targetIdx];
  if(!target || target.type !== 'installment-month') return;
  ignoredDivergences[divergenceKey(target.name, target.month)] = true;
  reportSaveResult(await saveIgnoredDivergences());
  document.getElementById('app-modal-text').innerHTML = buildDiagnosticsReport();
}
// Rev 2.16.1 — звіт діагностики тепер у #app-modal (тимчасове повідомлення,
// а не постійний блок на сторінці): той самий модал, що й showConfirmModal,
// але з innerHTML (потрібні клікабельні кнопки-проблеми) і без кнопки "Так"
// — це інформаційний звіт, єдиний вихід — "Закрити" (перейменована "Скасувати").
function showDiagnosticsModal(html){
  document.getElementById('app-modal-text').innerHTML = html;
  document.getElementById('app-modal-confirm-btn').style.display = 'none';
  const cancelBtn = document.getElementById('app-modal-cancel-btn');
  if(cancelBtn) cancelBtn.textContent = 'Закрити';
  presentAppModal();
}
// Rev 2.16.1 — клік по конкретній проблемі в модалці діагностики: закриває
// звіт і веде до самого запису для виправлення (Журнал для витрат, Облік для
// ОЧ — за потреби перемикаючи місяць на той, де сталась розбіжність).
function goToDiagnosticIssue(i){
  const target = diagnosticIssueTargets[i];
  if(!target) return;
  closeAppModal();
  if(target.type === 'expense'){
    switchTab('vytraty');
    // Rev #30 (6D.42) — activeExpenses(), узгоджено з findExpenseIdIssues()/
    // findTimestampIssues() (той самий idx-простір) і Журналом (__srcIdx).
    const e = activeExpenses()[target.idx];
    if(e){ editingRecordKey = null; renderRecords(); } // Rev 2.32.44 (TP): виділення рядка (олівчик) прибрано — лише підсвічування flashDiagnosticTarget
    flashDiagnosticTarget('journal-row-expense-' + target.idx);
    return;
  }
  // Rev #30 (6D.61) — той самий принцип, що 'expense' вище, для findUnsyncedRecordsIssues().
  if(target.type === 'income'){
    // Rev 2.23.31 (6D.200): доходи живуть в "Обліку" → Доходи (Журнал їх не показує).
    performSwitchTab('accounting');
    switchAccountingTab('data');
    const inc = activeIncomes()[target.idx];
    if(inc && monthKey(inc.date) !== selectedMonth && allMonths().includes(monthKey(inc.date))) performMonthChange(monthKey(inc.date));
    return;
  }
  // Rev #30 (6D.61) — debts не мають запису в Журналі (показуються картками
  // в "Обліку" за місяцем) — kind визначає, яка саме таблиця (банк-картка чи ОЧ).
  if(target.type === 'debt'){
    if(!target.name){
      showAlertModal('У цього запису боргу немає назви — знайти його автоматично неможливо. Перевір «Облік» вручну.');
      return;
    }
    if(target.month && target.month !== selectedMonth) performMonthChange(target.month);
    switchTab('accounting');
    if(target.kind === 'card'){
      const idx = bankAccounts.findIndex(function(b){ return b.name === target.name; });
      if(idx !== -1) flashDiagnosticTarget('bank-debt-row-' + idx);
      else showAlertModal('Рахунок «' + target.name + '» не знайдено — перевір «Облік» вручну.');
    }else{
      const idx = installmentAccounts.findIndex(function(a){ return a.name === target.name; });
      if(idx !== -1) flashDiagnosticTarget('installment-row-' + idx);
      else showAlertModal('ОЧ «' + target.name + '» не знайдено — перевір «Облік» вручну.');
    }
    return;
  }
  // 'installment' або 'installment-month'
  if(!target.name){
    showAlertModal('У цього ОЧ немає назви — знайти його автоматично неможливо. Перевір список ОЧ в «Обліку» вручну.');
    return;
  }
  if(target.month && target.month !== selectedMonth){
    performMonthChange(target.month);
  }
  switchTab('accounting');
  const idx = installmentAccounts.findIndex(function(a){ return a.name === target.name; });
  if(idx !== -1) flashDiagnosticTarget('installment-row-' + idx);
}
function flashDiagnosticTarget(domId){
  const row = document.getElementById(domId);
  if(!row){
    showAlertModal('Цей запис не вдалось знайти на екрані (можливо, поза видимим діапазоном журналу). Знайди його вручну за назвою й датою, показаними в діагностиці.');
    return;
  }
  row.scrollIntoView({ behavior:'smooth', block:'center' });
  row.classList.add('diag-flash');
  setTimeout(function(){ row.classList.remove('diag-flash'); }, 1600);
}

// ----- Інтерфейс самописця (Rev 2.32.260, REC-1): «Повідомити про проблему», «Надіслані звіти», «Скопіювати запис» -----
// Вигляд шторки звіту за станом: sending → sent | offline.
function recReportView(state, code){
  if(state === 'sent') return { cls: 'is-ok', title: 'Звіт надіслано', code: code || '', hint: 'Напишіть цей код у чат', copy: true };
  if(state === 'offline') return { cls: 'is-off', title: 'Немає мережі', code: code || '', hint: 'Надішлю, щойно з’явиться зв’язок. Код уже можна писати в чат', copy: true };
  return { cls: 'is-sending', title: 'Надсилаю…', code: '', hint: 'Це займе кілька секунд', copy: false };
}
const REC_ICONS = {
  sending: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a9 9 0 1 0 9 9"/></svg>',
  sent: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5l10 -10"/></svg>',
  offline: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3l18 18"/><path d="M9.58 5.58a5 5 0 0 1 8.42 2.42h1a4.5 4.5 0 0 1 2.5 8.242m-2.5 1.758h-13a4.5 4.5 0 0 1 -.5 -8.973"/></svg>'
}; // статичні значки, без даних
let recLastCode = '';
let recReportBusy = false;
function recRenderReport(state, code){
  const v = recReportView(state, code);
  const box = document.getElementById('rec-report-state'), t = document.getElementById('rec-report-title'), c = document.getElementById('rec-report-code'), h = document.getElementById('rec-report-hint'), cp = document.getElementById('rec-report-copy');
  if(!box) return;
  box.className = 'rec-state ' + v.cls;
  t.textContent = v.title; h.textContent = v.hint;
  const ic = document.getElementById('rec-report-icon'); if(ic) ic.innerHTML = REC_ICONS[state] || REC_ICONS.sending;
  c.textContent = v.code; c.classList.toggle('hidden', !v.code);
  if(cp) cp.classList.toggle('hidden', !v.copy);
}

async function recCopyText(text, okMsg){
  try{ await navigator.clipboard.writeText(text); showTextToast(okMsg, 'success'); }
  catch(e){ showTextToast('Не вдалося скопіювати', 'error'); }
}

function recSentLine(r){
  const d = new Date(r.at), p = function(n){ return String(n).padStart(2, '0'); };
  return r.code + ' · ' + p(d.getDate()) + '.' + p(d.getMonth() + 1) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()) + (r.status === 'queued' ? ' · у черзі' : '');
}

function recFillSent(list){
  list.textContent = '';
  const items = recSentList();
  if(!items.length){ list.textContent = 'Звітів ще не було'; return; }
  items.forEach(function(r){ const row = document.createElement('div'); row.className = 'n-diag-row'; const sp = document.createElement('span'); sp.textContent = recSentLine(r); row.appendChild(sp); list.appendChild(row); });
}
(window.__MT_FILES = window.__MT_FILES || []).push('diag.js');
