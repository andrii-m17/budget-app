// STRUCT-2: дослівне перенесення вибраних чистих допоміжних функцій з index.html у js/util-*.js (разом із коментарями, що стоять безпосередньо над ними).
// node scripts/struct2-move.js   (одноразово; повторний запуск нічого не знаходить)
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process');
const ROOT = path.join(__dirname, '..');
const GROUPS = {
  'util-format.js': ['Формати чисел і сум: гривні, знак, відсотки, розряди, множина (STRUCT-2).', ['fmt', 'fmtSigned', 'fmtSignedPercent', 'formatThousands', 'pluralUa', 'pluralizeRecords']],
  'util-date.js': ['Дати й місяці: ключі місяців, ISO-дати, зсуви, підписи, київська дата, дрібна математика дат (STRUCT-2).', ['UA_MONTHS', 'monthKey', 'monthKey2', 'monthToDate', 'dateToMonth', 'monthStartISO', 'localDateISO', 'kyivTodayISO', 'kyivDateKey', 'shiftMonth', 'shiftDate', 'allMonths', 'monthLabel', 'monthLabelShort', 'monthGenitive', 'weekdayShort', 'isoToUaDateText', 'parseUaMonth', 'dayHeaderLabel', 'ppPad', 'ppDaysInMonth', 'ppAddDays', 'ppDayDiff', 'ppNextMonth', 'ppPrevMonth', 'ppClampDate', 'utcMicros']],
  'util-safe.js': ['Екранування, безпечні ідентифікатори й рядкові утиліти (STRUCT-2). escapeHtml створює лише тимчасовий елемент, DOM застосунку не чіпає.', ['escapeHtml', 'escapeAttr', 'safeId', 'escapeLikeExact', 'stripLeadingEmoji', 'splitLeadingEmoji']],
  'util-misc.js': ['Дрібні утиліти без стану: безпечний виклик, кільцевий буфер, base64url, розбір кольору, яскравість (STRUCT-2).', ['safeCall', 'ringBufferPush', 'urlBase64ToUint8Array', 'parseCssColor', 'relativeLuminance']]
};
const VER = (fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').match(/const APP_VERSION = '([^']+)'/) || [])[1];
let html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const spans = JSON.parse(cp.spawnSync('node', [path.join(__dirname, 'struct2-analyze.js'), '--spans'], { encoding: 'utf8', maxBuffer: 1e9 }).stdout);
const byName = new Map(spans.map(s => [s.name, s]));
const removals = []; const report = {};
Object.keys(GROUPS).forEach(file => {
  const [desc, names] = GROUPS[file]; let body = ''; report[file] = [];
  const items = names.map(n => { const s = byName.get(n); if(!s) throw new Error('не знайдено ' + n); return s; }).sort((a, b) => a.start - b.start);
  items.forEach(s => {
    // початок рядка оголошення; коментар над ним переносимо лише власний: останній абзац суцільного блоку коментарів (з початком «Rev …» або весь короткий), якщо він називає функцію або має ≤ 2 рядки
    let a = html.lastIndexOf('\n', s.start - 1) + 1;
    { const lines = []; let q = a; // збираємо суцільні рядки коментарів вгору
      for(;;){ const prevEnd = q - 1; if(prevEnd < 0) break; const ps = html.lastIndexOf('\n', prevEnd - 1) + 1; const line = html.slice(ps, prevEnd); if(/^\s*(\/\/|\/\*|\*)/.test(line) || /\*\/\s*$/.test(line)){ lines.unshift({ ps, line }); q = ps; } else break; }
      let startIdx = 0; lines.forEach((l, i) => { if(/^\s*(\/\/|\/\*)\s*Rev\b/.test(l.line)) startIdx = i; });
      const own = lines.slice(startIdx); const txt = own.map(l => l.line).join('\n');
      if(own.length && (own.length <= 2 || txt.indexOf(s.name) !== -1) && (own.length === 0 || !/^\s*\*\//.test(own[0].line))) a = own[0].ps; }
    let e = html.indexOf('\n', s.end); if(e < 0) e = html.length; e += 1;
    body += html.slice(a, e) + (html.slice(e - 2, e) === '\n\n' ? '' : '\n');
    removals.push([a, e]); report[file].push(s.name + ' (' + (html.slice(a, e).split('\n').length - 1) + ' рядків)');
  });
  fs.mkdirSync(path.join(ROOT, 'js'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'js', file), '// ' + desc + '\n// Перенесено з index.html дослівно, без змін (Rev ' + VER + ', STRUCT-2). Звичайний скрипт: функції й константи лишаються глобальними; підключається в index.html перед основним <script>.\n\n' + body);
});
removals.sort((x, y) => y[0] - x[0]).forEach(([a, e]) => { html = html.slice(0, a) + html.slice(e); });
// теги підключення перед основним <script> (найбільший <script> без src)
let best = null; { const re = /<script>([^]*?)<\/script>/g; let m; while((m = re.exec(html))){ if(!best || m[1].length > best.len) best = { idx: m.index, len: m[1].length }; } }
const tags = Object.keys(GROUPS).map(f => '<script src="./js/' + f + '?v=' + VER + '"></script>').join('\n') + '\n';
html = html.slice(0, best.idx) + '<!-- Rev ' + VER + ' (STRUCT-2): допоміжні функції без стану винесено дослівно в js/util-*.js (звичайні скрипти, глобальні функції; мітка ?v= = APP_VERSION) -->\n' + tags + html.slice(best.idx);
fs.writeFileSync(path.join(ROOT, 'index.html'), html);
console.log(JSON.stringify(report, null, 1));
