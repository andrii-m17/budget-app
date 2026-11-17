// Формати чисел і сум: гривні, знак, відсотки, розряди, множина (STRUCT-2).
// Перенесено з index.html дослівно, без змін (Rev 2.32.345, STRUCT-2). Звичайний скрипт: функції й константи лишаються глобальними; підключається в index.html перед основним <script>.

// Rev #30 (6D.86) — стандартне українське узгодження числівника з
// іменником: forms = [1, 2-4, 5+] (напр. ['витрату','витрати','витрат']).
function pluralUa(n, forms){
  const mod10 = n % 10, mod100 = n % 100;
  if(mod10 === 1 && mod100 !== 11) return forms[0];
  if(mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return forms[1];
  return forms[2];
}

/* ============ Форматування / рендер ============ */
function fmt(n){ return new Intl.NumberFormat('uk-UA',{maximumFractionDigits:0}).format(n) + ' ₴'; }

function fmtSigned(n){ return (n>=0?'+':'−') + new Intl.NumberFormat('uk-UA',{maximumFractionDigits:0}).format(Math.abs(n)) + ' ₴'; }

function formatThousands(n){
  if(n===''||n==null||isNaN(n)) return '';
  return new Intl.NumberFormat('uk-UA',{maximumFractionDigits:0}).format(Math.round(Number(n)));
}

// pluralizeRecords(n): "1 запис", "2-4 записи", "5-20 записів", "21 запис",
// "22-24 записи", "25-30 записів"; виняток 11-14 (і всі n%100 у 11..14) — "записів".
// pluralUa(n, forms) — ІСНУЮЧА функція (Rev #30, 6D.86, вище; forms=[1, 2-4, 5+]) — не дублюємо.
function pluralizeRecords(n){
  return n + ' ' + pluralUa(n, ['запис', 'записи', 'записів']);
}

function fmtSignedPercent(rawPercent){
  const abs = Math.round(Math.abs(rawPercent) * 10) / 10;
  const str = Number.isInteger(abs) ? String(abs) : abs.toFixed(1);
  return (rawPercent < 0 ? '-' : '') + str + '%';
}

