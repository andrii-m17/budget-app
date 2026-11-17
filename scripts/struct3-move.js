// STRUCT-3: дослівне перенесення оголошень області з основного <script> index.html у js/<область>.js (функції, const, let, var, class; оператори верхнього рівня лишаються).
// node scripts/struct3-move.js --area structure --from 14591 --to 14784 --file structure.js --desc "Структура: вкладка, рендер" [--exclude a,b] [--dry]
'use strict';
const fs = require('fs'), path = require('path');
const { parseTop } = require('./lib/jsscan.js');
const ROOT = path.join(__dirname, '..');
const args = process.argv.slice(2); const arg = (a, d) => { const i = args.indexOf(a); return i < 0 ? d : args[i + 1]; };
const area = arg('--area'), from = +arg('--from', 0), to = +arg('--to', 0), file = arg('--file'), desc = arg('--desc', area); const exclude = (arg('--exclude', '') || '').split(',').filter(Boolean);
if(!area || !file){ console.error('потрібні --area --file (за замовчуванням оголошення вибираються за scripts/struct3-areas.json; --from/--to — лише діапазон рядків)'); process.exit(2); }
const AREAS = JSON.parse(fs.readFileSync(path.join(__dirname, 'struct3-areas.json'), 'utf8')); // ім'я → область (знімок аналізу Rev 2.32.345, docs/reports/STRUCT-3-step0.md)
// порядок підключення файлів (docs/reports/STRUCT-3-step0.md §5)
const ORDER = ['util-format.js', 'util-date.js', 'util-safe.js', 'util-misc.js', 'structure-data.js', 'storage.js', 'cloud-auth.js', 'sync.js', 'diag.js', 'shell.js', 'structure.js', 'analytics.js', 'payments.js', 'sheets-forms.js', 'monobank.js', 'notif-push.js', 'accounting.js', 'service.js', 'expenses.js'];
let html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const VER = (html.match(/const APP_VERSION = '([^']+)'/) || [])[1];
let best = null; { const re = /<script>([^]*?)<\/script>/g; let m; while((m = re.exec(html))){ if(!best || m[1].length > best.text.length) best = { text: m[1], start: m.index + 8 }; } }
const items = parseTop(best.text); const baseLine = html.slice(0, best.start).split('\n').length - 1;
const sel = items.filter(it => it.kind !== 'stmt' && !it.names.some(n => exclude.includes(n)) && (from ? ((baseLine + it.line) >= from && (baseLine + it.line) <= to) : AREAS[it.names[0]] === area));
const stmts = items.filter(it => it.kind === 'stmt');
// відсутність «чужих» оголошень у діапазоні перевіряє людина за звітом; тут лише збираємо
const rep = { area, file, fn: sel.filter(i => i.kind === 'fn').length, const: sel.filter(i => i.kind === 'const').length, let: sel.filter(i => i.kind === 'let' || i.kind === 'var').length, class: sel.filter(i => i.kind === 'class').length, statementsKept: stmts.length, names: sel.flatMap(i => i.names) };
if(args.includes('--dry')){ console.log(JSON.stringify(rep)); process.exit(0); }
// початок власного коментаря над оголошенням (останній абзац «Rev …» блоку коментарів над ним, якщо називає ім'я або має ≤ 2 рядки)
const abs = (it) => ({ s: best.start + it.start, e: best.start + it.end });
function startWithComment(it){
  // коментарі над оголошенням розбираємо цілими одиницями: рядок «//…» або повний блок «/* … */» (усі його рядки, навіть без «*» на початку)
  const { s } = abs(it); const a0 = html.lastIndexOf('\n', s - 1) + 1; const units = []; let q = a0;
  for(;;){
    const prevEnd = q - 1; if(prevEnd < 0) break;
    const ps = html.lastIndexOf('\n', prevEnd - 1) + 1; const line = html.slice(ps, prevEnd);
    if(/^\s*\/\//.test(line)){ units.unshift({ ps, text: line }); q = ps; continue; }
    if(/\*\/\s*$/.test(line)){ // кінець блочного коментаря: шукаємо рядок з «/*»
      let ps2 = ps, ok = false;
      for(;;){ const l2 = html.slice(ps2, html.indexOf('\n', ps2)); if(/\/\*/.test(l2)){ ok = true; break; } if(ps2 === 0) break; ps2 = html.lastIndexOf('\n', ps2 - 2) + 1; }
      if(!ok) break;
      units.unshift({ ps: ps2, text: html.slice(ps2, prevEnd) }); q = ps2; continue;
    }
    break;
  }
  let startIdx = 0; units.forEach((u, i) => { if(/^\s*(\/\/|\/\*)\s*(=+\s*)?Rev\b/.test(u.text) || /^\s*(\/\/|\/\*)\s*=+/.test(u.text)) startIdx = i; });
  const own = units.slice(startIdx); const txt = own.map(u => u.text).join('\n'); const nLines = txt ? txt.split('\n').length : 0;
  if(own.length && (nLines <= 2 || it.names.some(n => txt.indexOf(n) !== -1))) return own[0].ps;
  return a0;
}
let body = ''; const removals = []; let pointerAt = null;
{ const selSet = new Set(sel); const runs = []; let cur = null;
  items.forEach(it => { if(selSet.has(it)){ if(!cur){ cur = []; runs.push(cur); } cur.push(it); } else cur = null; });
  runs.forEach(run => { const first = run[0], lastIt = run[run.length - 1]; const a = startWithComment(first); let e = best.start + lastIt.end; e = html.indexOf('\n', e); if(e < 0) e = html.length; e += 1; if(pointerAt === null) pointerAt = a; const chunk = html.slice(a, e); body += chunk + (chunk.endsWith('\n\n') ? '' : '\n'); removals.push([a, e]); }); }
const header = '// ' + desc + '\n// Перенесено з index.html дослівно, без змін (Rev ' + VER + ', STRUCT-3). Звичайний скрипт: функції й const/let лишаються глобальними; підключається в index.html перед основним <script>; оператори верхнього рівня цієї області лишились в основному скрипті.\n\n';
fs.mkdirSync(path.join(ROOT, 'js'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'js', file), header + body.replace(/\n+$/, '\n') + "(window.__MT_FILES = window.__MT_FILES || []).push('" + file + "');\n"); // Rev 2.32.347 (STRUCT-3a2): позначка завантаження — останній рядок файлу
const pointer = '// Rev ' + VER + ' (STRUCT-3): область «' + area + '» — ' + rep.fn + ' функцій, ' + rep.const + ' const, ' + rep.let + ' let — перенесено дослівно в js/' + file + ' (підключено перед основним скриптом); тут лишились лише оператори верхнього рівня цієї області.\n';
removals.sort((x, y) => y[0] - x[0]).forEach(([a, e]) => { html = html.slice(0, a) + (a === pointerAt ? pointer : '') + html.slice(e); });
// тег підключення за порядком ORDER
const tagRe = /<script src="\.\/js\/([a-z0-9-]+\.js)\?v=[^"]*"><\/script>\n/g; let last = null, mm; const myIdx = ORDER.indexOf(file);
while((mm = tagRe.exec(html))){ if(ORDER.indexOf(mm[1]) !== -1 && ORDER.indexOf(mm[1]) < myIdx) last = mm; }
const newTag = '<script src="./js/' + file + '?v=' + VER + '"></script>\n';
if(last){ const at = last.index + last[0].length; html = html.slice(0, at) + newTag + html.slice(at); }
else { const first = html.search(/<script src="\.\/js\/[a-z0-9-]+\.js\?v=/); html = html.slice(0, first) + newTag + html.slice(first); }
fs.writeFileSync(path.join(ROOT, 'index.html'), html);
// sw.js: APP_SHELL
let sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8'); const prevLine = ORDER.slice(0, myIdx).reverse().map(f => "  './js/" + f + "',").find(l => sw.indexOf(l) !== -1);
if(prevLine && sw.indexOf("'./js/" + file + "'") === -1){ const at = sw.indexOf(prevLine) + prevLine.length; const eol = sw.indexOf('\n', at); sw = sw.slice(0, eol + 1) + "  './js/" + file + "', // Rev " + VER + " (STRUCT-3)\n" + sw.slice(eol + 1); fs.writeFileSync(path.join(ROOT, 'sw.js'), sw); }
console.log(JSON.stringify(rep));
