// Дати й місяці: ключі місяців, ISO-дати, зсуви, підписи, київська дата, дрібна математика дат (STRUCT-2).
// Перенесено з index.html дослівно, без змін (Rev 2.32.345, STRUCT-2). Звичайний скрипт: функції й константи лишаються глобальними; підключається в index.html перед основним <script>.

const UA_MONTHS = ['січень','лютий','березень','квітень','травень','червень','липень','серпень','вересень','жовтень','листопад','грудень'];

// Початок місяця 'YYYY-MM' у локальному часі (полудень першого числа: однаковий місяць у будь-якому поясі), у ISO.
function monthStartISO(month){
  const y = +String(month).slice(0, 4), m = +String(month).slice(5, 7);
  return new Date(y, m - 1, 1, 12, 0, 0).toISOString();
}

function utcMicros(v){
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?\s*(Z|[+-]\d{2}(?::?\d{2})?)$/.exec(String(v == null ? '' : v).trim());
  if(!m) return null;
  if(+m[2] < 1 || +m[2] > 12 || +m[3] < 1 || +m[3] > 31 || +m[4] > 23 || +m[5] > 59 || +m[6] > 59) return null;
  let off = 0;
  if(m[8] !== 'Z'){ const sign = m[8][0] === '-' ? -1 : 1; const d = m[8].slice(1).replace(':', ''); off = sign * (+d.slice(0, 2) * 60 + (d.length > 2 ? +d.slice(2, 4) : 0)); }
  const ms = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) - off * 60000;
  if(!isFinite(ms)) return null;
  return new Date(ms).toISOString().slice(0, 19) + '.' + ((m[7] || '') + '000000').slice(0, 6) + 'Z';
}

// Rev #30 (6D.32 BugFix, знайдений живою перевіркою) — Cloud-колонка
// `hidden_from_month` типу `date`, локальний формат — "YYYY-MM" (без дня),
// невалідний date-літерал напряму ("invalid input syntax for type date").
// monthToDate()/dateToMonth() — явна конверсія в обидва боки (день завжди
// "01", несуттєвий — колонка існує лише заради сортування/порівняння
// місяців, а не конкретної дати).
function monthToDate(month){ return month + '-01'; }

function dateToMonth(dateStr){ return (dateStr || '').slice(0, 7); }

function ppPad(n){ return (n < 10 ? '0' : '') + n; }

function ppDaysInMonth(y, m){ return new Date(Date.UTC(y, m, 0)).getUTCDate(); } // m: 1…12

function ppAddDays(iso, n){ const t = Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) + n * 86400000; const d = new Date(t); return d.getUTCFullYear() + '-' + ppPad(d.getUTCMonth() + 1) + '-' + ppPad(d.getUTCDate()); }

function ppDayDiff(a, b){ return Math.round((Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10)) - Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10))) / 86400000); }

function ppNextMonth(month){ const y = +month.slice(0, 4), m = +month.slice(5, 7); return m === 12 ? (y + 1) + '-01' : y + '-' + ppPad(m + 1); }

function ppClampDate(month, day){ const last = ppDaysInMonth(+month.slice(0, 4), +month.slice(5, 7)); return month + '-' + ppPad(Math.min(day, last)); }

function ppPrevMonth(month){ const y = +month.slice(0, 4), m = +month.slice(5, 7); return m === 1 ? (y - 1) + '-12' : y + '-' + ppPad(m - 1); }

// Сьогодні за київським часом («YYYY-MM-DD»); now передається ззовні (тести).
function kyivTodayISO(now){
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Kyiv', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now || new Date());
  const g = function(t){ return parts.filter(function(p){ return p.type === t; })[0].value; };
  return g('year') + '-' + g('month') + '-' + g('day');
}

function monthKey2(m){ return m || ''; }

function isoToUaDateText(iso){
  if(!iso) return '';
  const parts = String(iso).split('-');
  if(parts.length !== 3) return iso;
  const [y,m,d] = parts;
  return `${d}.${m}.${y}`;
}

function parseUaMonth(text){
  if(!text) return null;
  const parts = String(text).trim().toLowerCase().split(/\s+/);
  if(parts.length < 2) return null;
  const idx = UA_MONTHS.indexOf(parts[0]);
  if(idx === -1) return null;
  const year = parseInt(parts[1], 10);
  if(!year) return null;
  return `${year}-${String(idx+1).padStart(2,'0')}`;
}

function localDateISO(d){
  d = d || new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,'0');
  const day = String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}

function monthKey(d){ return d ? d.slice(0,7) : ''; }

function monthLabel(key){ const [y,m]=key.split('-'); return `${UA_MONTHS[parseInt(m,10)-1]} ${y}`; }

function monthLabelShort(key){
  const short=['Січ','Лют','Бер','Кві','Тра','Чер','Лип','Сер','Вер','Жов','Лис','Гру'];
  const [y,m]=key.split('-'); return short[parseInt(m,10)-1];
}

function allMonths(){
  // Rev #30 (6D.42/6D.43/6D.44) — activeExpenses()/activeIncomes()/activeDebts().
  const set = new Set([...activeExpenses().map(e=>monthKey(e.date)), ...activeIncomes().map(e=>monthKey(e.date)), ...activeDebts().map(d=>d.month)].filter(Boolean));
  const todayKey = monthKey(localDateISO());
  // BugFix Rev 2.0.3: раніше в списку були лише місяці, де вже є хоч якийсь
  // запис — а оскільки дохід/борги тепер вносяться через таблицю, прив'язану
  // до обраного місяця, це буквально блокувало внесення даних за місяць, що
  // ще жодного разу не торкались (напр. минулий місяць заднім числом).
  // Додаємо ковзне вікно 12 місяців назад + 1 вперед від сьогодні завжди,
  // незалежно від того, чи є там уже дані.
  for(let i=-12; i<=1; i++) set.add(shiftMonth(todayKey, i));
  return Array.from(set).sort();
}

function shiftMonth(key, delta){
  let [y,m] = key.split('-').map(Number);
  m += delta;
  while(m<1){ m+=12; y--; } while(m>12){ m-=12; y++; }
  return `${y}-${String(m).padStart(2,'0')}`;
}

// Rev 2.1.4 — BugFix: shiftDate() рахував результат через
// `new Date(...).toISOString().slice(0,10)`, а toISOString() завжди повертає
// дату в UTC. Дата будувалась у ЛОКАЛЬНОМУ часі (new Date(dateStr+'T00:00:00')),
// тому в часовому поясі з позитивним зсувом (Київ, +2/+3) конвертація в UTC
// відкушувала добу: "-1 день" фактично ставав "-2", а "+1 день" — компенсувався
// назад до того самого числа. Той самий клас багу, що вже був знайдений і
// виправлений в excelDateToISO (BugFix 1.5.2-01) — і те саме рішення: читати
// рік/місяць/день напряму з локальних getFullYear/getMonth/getDate, а не
// проганяти дату через toISOString().
function shiftDate(dateStr, deltaDays){
  const d = new Date(dateStr+'T00:00:00');
  d.setDate(d.getDate()+deltaDays);
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,'0');
  const day = String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}

function dayHeaderLabel(dateStr){
  const todayKey = localDateISO();
  if(dateStr===todayKey) return 'Сьогодні';
  if(dateStr===shiftDate(todayKey,-1)) return 'Вчора';
  const d = new Date(dateStr+'T00:00:00');
  return `${d.getDate()} ${monthGenitive(monthKey(dateStr))}`;
}

function weekdayShort(dateStr){
  const WD = ['нд','пн','вт','ср','чт','пт','сб'];
  const d = new Date(dateStr+'T00:00:00');
  return WD[d.getDay()];
}

function monthGenitive(monthKey){
  const forms = ['січня','лютого','березня','квітня','травня','червня','липня','серпня','вересня','жовтня','листопада','грудня'];
  return forms[parseInt(monthKey.slice(5),10)-1];
}

function kyivDateKey(iso){
  const t = Date.parse(iso); if(isNaN(t)) return '';
  const fmt = function(zone){ return new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(t)); };
  try{ return fmt('Europe/Kyiv'); }catch(e){ try{ return fmt('Europe/Kiev'); }catch(e2){ return ''; } } // запасна назва зони для старих ICU
}
(window.__MT_FILES = window.__MT_FILES || []).push('util-date.js');
