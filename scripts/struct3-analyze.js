// STRUCT-3, крок 0 (лише аналіз): розбір основного <script> index.html на оголошення й оператори верхнього рівня, області, залежності. node scripts/struct3-analyze.js > out.json
'use strict';
const fs = require('fs'), path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
let best = null; { const re = /<script>([^]*?)<\/script>/g; let m; while((m = re.exec(html))){ if(!best || m[1].length > best.text.length) best = { text: m[1], start: m.index + 8 }; } }
const SRC = best.text; const baseLine = html.slice(0, best.start).split('\n').length - 1;
const lineAt = (i) => baseLine + SRC.slice(0, i).split('\n').length; // номер рядка index.html
const REGEX_PREV = /[(,=:\[!&|?{};+\-*%<>~^]$|\b(?:return|typeof|case|in|of|delete|void|throw|new|else|do)$/;
function skip(s, i, prev){
  const c = s[i], d = s[i + 1];
  if(c === '/' && d === '/'){ const e = s.indexOf('\n', i); return e < 0 ? s.length : e; }
  if(c === '/' && d === '*'){ const e = s.indexOf('*/', i + 2); return e < 0 ? s.length : e + 2; }
  if(c === '"' || c === "'"){ let j = i + 1; while(j < s.length && s[j] !== c){ if(s[j] === '\\') j++; j++; } return j + 1; }
  if(c === '`'){ let j = i + 1; while(j < s.length && s[j] !== '`'){ if(s[j] === '\\'){ j += 2; continue; } if(s[j] === '$' && s[j + 1] === '{'){ j = matchBrace(s, j + 1) + 1; continue; } j++; } return j + 1; }
  if(c === '/' && REGEX_PREV.test(prev)){ let j = i + 1, cls = false; while(j < s.length){ if(s[j] === '\\'){ j += 2; continue; } if(s[j] === '[') cls = true; else if(s[j] === ']') cls = false; else if(s[j] === '/' && !cls) break; else if(s[j] === '\n') return i; j++; } if(s[j] === '/'){ j++; while(/[a-z]/.test(s[j] || '')) j++; return j; } }
  return i;
}
function matchBrace(s, i){ const open = s[i], close = open === '{' ? '}' : open === '(' ? ')' : ']'; let depth = 0, prev = '('; for(let j = i; j < s.length; ){ const k = skip(s, j, prev); if(k !== j){ j = k; prev = 'x'; continue; } const c = s[j]; if(c === open) depth++; else if(c === close){ depth--; if(depth === 0) return j; } if(!/\s/.test(c)) prev = c; j++; } return s.length - 1; }
function stripped(s){ let out = '', prev = '('; for(let i = 0; i < s.length; ){ const k = skip(s, i, prev); if(k !== i){ const lit = s.slice(i, k); if(lit[0] === '`'){ const re = /\$\{/g; let m; while((m = re.exec(lit))){ const e = matchBrace(lit, m.index + 1); out += ' ' + stripped(lit.slice(m.index + 2, e)) + ' '; re.lastIndex = e; } } else out += ' '; i = k; prev = 'x'; continue; } out += s[i]; if(!/\s/.test(s[i])) prev = s[i]; i++; } return out; }
// --- розбір верхнього рівня на елементи
const items = []; // { kind: fn|const|let|var|class|stmt, names, start, end }
function skipWsComments(s, i){ for(;;){ while(/\s/.test(s[i] || '')) i++; if(s[i] === '/' && s[i + 1] === '/'){ const e = s.indexOf('\n', i); i = e < 0 ? s.length : e; continue; } if(s[i] === '/' && s[i + 1] === '*'){ const e = s.indexOf('*/', i + 2); i = e < 0 ? s.length : e + 2; continue; } return i; } }
function endOfStatement(s, i){ // кінець оператора, що починається в i (не оголошення функції)
  let depth = 0, prev = ';';
  for(let j = i; j < s.length; ){
    const k = skip(s, j, prev); if(k !== j){ j = k; prev = 'x'; continue; }
    const c = s[j];
    if('([{'.includes(c)) depth++; else if(')]}'.includes(c)){ depth--; if(depth === 0 && c === '}'){ // можливе завершення блокового оператора
        const rest = s.slice(j + 1, j + 80); const nxt = skipWsComments(s, j + 1); const w = s.slice(nxt, nxt + 8);
        const head = s.slice(i, i + 12);
        const blockStmt = /^(if|for|while|do|try|switch|with)\b/.test(head) || /^\s*\{/.test(head);
        if(blockStmt && !/^(else|catch|finally)\b/.test(w) && !(/^do\b/.test(head) && /^while\b/.test(w))) return j + 1; } }
    else if(c === ';' && depth === 0) return j + 1;
    if(!/\s/.test(c)) prev = c;
    j++;
  }
  return s.length;
}
for(let i = skipWsComments(SRC, 0); i < SRC.length; ){
  const rest = SRC.slice(i, i + 160); let m;
  if((m = /^(async\s+)?function\s*\*?\s*([\w$]+)\s*\(/.exec(rest))){ const pe = matchBrace(SRC, i + m[0].length - 1); const b = SRC.indexOf('{', pe); const e = matchBrace(SRC, b) + 1; items.push({ kind: 'fn', names: [m[2]], start: i, end: e }); i = e; }
  else if((m = /^class\s+([\w$]+)/.exec(rest))){ const b = SRC.indexOf('{', i); const e = matchBrace(SRC, b) + 1; items.push({ kind: 'class', names: [m[1]], start: i, end: e }); i = e; }
  else if((m = /^(const|let|var)\s/.exec(rest))){ const e = endOfStatement(SRC, i); const txt = SRC.slice(i, e); const names = []; const nm = /^(?:const|let|var)\s+([\w$]+)/.exec(txt); if(nm) names.push(nm[1]); // додаткові імена через кому верхнього рівня
    { let d = 0, prev = '='; for(let j = txt.indexOf(nm ? nm[1] : '') + (nm ? nm[1].length : 0); j < txt.length; ){ const k = skip(txt, j, prev); if(k !== j){ j = k; prev = 'x'; continue; } const c = txt[j]; if('([{'.includes(c)) d++; else if(')]}'.includes(c)) d--; else if(c === ',' && d === 0){ const mm = /^\s*([\w$]+)\s*=/.exec(txt.slice(j + 1)); if(mm) names.push(mm[1]); } if(!/\s/.test(c)) prev = c; j++; } }
    items.push({ kind: m[1], names, start: i, end: e }); i = e; }
  else { const e = endOfStatement(SRC, i); items.push({ kind: 'stmt', names: [], start: i, end: e }); i = e; }
  i = skipWsComments(SRC, i);
}
// --- області (за діапазонами рядків index.html; уточнення за назвою)
const RANGES = [ // [перший рядок, область]
  [1693, 'diag'], [1867, 'structure-data'], [2547, 'sync'], [3799, 'storage'], [4381, 'sync'], [6893, 'storage'], [7283, 'storage'], [7725, 'payments'], [8458, 'cloud-auth'], [8893, 'notif-push'], [9362, 'notif-push'], [9807, 'sync'], [11269, 'diag'], [12699, 'expenses'], [13431, 'accounting'], [14591, 'structure'], [14668, 'structure'], [14785, 'service'], [15495, 'shell'], [15825, 'expenses'], [17635, 'expenses'], [18190, 'analytics'], [19839, 'shell'], [21143, 'service'], [21438, 'service'], [21566, 'notif-push'], [21667, 'monobank'], [22782, 'notif-push'], [23154, 'notif-push'], [23594, 'service'], [23989, 'notif-push'], [24562, 'service'], [25090, 'service'], [25344, 'shell'], [25431, 'sheets-forms'], [25698, 'sheets-forms'], [25926, 'boot-initApp']
];
const areaByLine = (ln) => { let a = 'diag'; for(const [l, n] of RANGES){ if(ln >= l) a = n; else break; } return a; };
const NAME_OVERRIDE = [ [/^(mono|Mono|MONO|refund|Refund|inboxRow|groupInboxByDay|addAllCandidates|skipReason)/, 'monobank'], [/^(rec[A-Z]|REC_|debugRec|recorder)/, 'diag'], [/^(idb|IDB|migrate.*Idb|ensureDomainsMigrated|DOMAIN_MIGRATION|isDomainMigrated)/, 'storage'] ];
items.forEach(it => { it.line = lineAt(it.start); it.endLine = lineAt(it.end); it.lines = it.endLine - it.line + 1; it.area = areaByLine(it.line); const nm = it.names[0] || ''; for(const [re, a] of NAME_OVERRIDE){ if(re.test(nm) && it.kind !== 'stmt'){ it.area = a; break; } } it.text = SRC.slice(it.start, it.end); });
// --- залежності: ідентифікатори
const initApp = items.find(i => i.kind === 'stmt' && /^\(async function initApp/.test(i.text));
const byName = new Map(); items.forEach(it => it.names.forEach(n => { if(!byName.has(n)) byName.set(n, it); }));
items.forEach(it => { const s = stripped(it.text); const ids = new Set(); const re = /(?<![\w$.])([A-Za-z_$][\w$]*)/g; let m; while((m = re.exec(s))) ids.add(m[1]); it.ids = [...ids].filter(x => byName.has(x) && !it.names.includes(x)); });
// у initApp: статичні оператори, що виконуються при завантаженні: сама IIFE
const out = { baseLine, srcLines: SRC.split('\n').length, initAppLine: initApp ? initApp.line : null, initAppEnd: initApp ? initApp.endLine : null, items: items.map(it => ({ kind: it.kind, names: it.names, line: it.line, endLine: it.endLine, lines: it.lines, area: it.area, deps: it.ids, head: it.text.split('\n')[0].slice(0, 110) })) };
fs.writeSync(1, JSON.stringify(out));
// ===== друга частина: залежності під час завантаження (load-time) =====
// видаляє тіла вкладених функцій (відкладений код); IIFE верхнього рівня виконується одразу, тому її власне тіло лишається
function directText(text, iife){
  let s = stripped(text); let out = ''; let i = 0; let first = !!iife;
  while(i < s.length){
    const fm = /^\bfunction\b\s*[\w$]*\s*\(/.exec(s.slice(i, i + 80));
    if(fm && (i === 0 || !/[\w$.]/.test(s[i - 1]))){
      const pe = matchBrace(s, i + fm[0].length - 1); const b = s.indexOf('{', pe);
      if(b < 0){ out += s[i]; i++; continue; }
      const e = matchBrace(s, b);
      if(first){ first = false; out += s.slice(i, b + 1) + directText(s.slice(b + 1, e), false) + '}'; i = e + 1; continue; } // IIFE: тіло виконується
      out += ' '; i = e + 1; continue;
    }
    if(s[i] === '=' && s[i + 1] === '>'){ let j = i + 2; while(/\s/.test(s[j] || '')) j++; if(s[j] === '{'){ const e = matchBrace(s, j); out += ' '; i = e + 1; continue; } // стрілка з блоком
      let d = 0; while(j < s.length){ const c = s[j]; if('([{'.includes(c)) d++; else if(')]}'.includes(c)){ if(d === 0) break; d--; } else if(c === ',' && d === 0) break; j++; } out += ' '; i = j; continue; }
    out += s[i]; i++;
  }
  return out;
}
const idRe = /(?<![\w$.])([A-Za-z_$][\w$]*)/g;
const topNames = new Set(byName.keys());
function loadNeeds(it){
  const iife = it.kind === 'stmt' && /^\(\s*(async\s+)?function/.test(it.text);
  const base = it.kind === 'stmt' ? it.text : it.text.replace(/^(const|let|var)\s+[\w$]+\s*=/, '');
  const direct = directText(base, iife); const needs = new Map(); // ім'я → 'fn'|'val'
  const visited = new Set();
  const addFn = (n) => { if(visited.has(n)) return; visited.add(n); const t = byName.get(n); if(!t || t.kind !== 'fn') return; const body = stripped(t.text); let m; const r = new RegExp(idRe.source, 'g'); while((m = r.exec(body))){ const x = m[1]; if(topNames.has(x) && x !== n){ const tt = byName.get(x); if(tt.kind === 'fn'){ needs.set(x, 'fn'); addFn(x); } else needs.set(x, 'val'); } } };
  let m; const r = new RegExp(idRe.source, 'g');
  while((m = r.exec(direct))){ const x = m[1]; if(!topNames.has(x) || it.names.includes(x)) continue; const t = byName.get(x); const called = /^\s*\(/.test(direct.slice(m.index + x.length)); if(t.kind === 'fn'){ needs.set(x, called ? 'fn-call' : 'fn'); if(called) addFn(x); } else needs.set(x, 'val'); }
  return needs;
}
const loadItems = items.filter(it => it.kind === 'stmt' || ((it.kind === 'const' || it.kind === 'let' || it.kind === 'var') && /\(|new\s|\[|\{/.test(it.text.replace(/^(const|let|var)\s+[\w$]+\s*=/, '').replace(/^\s*(['"`][^]*?['"`]|\d[\d.]*|true|false|null)\s*[;,]/, ''))));
const load = loadItems.map(it => { const needs = loadNeeds(it); const byArea = {}; needs.forEach((kind, n) => { const t = byName.get(n); if(t.area !== it.area){ (byArea[t.area] = byArea[t.area] || []).push(n + (kind === 'val' ? '·val' : '')); } }); return { kind: it.kind, names: it.names, line: it.line, area: it.area, head: it.text.split('\n')[0].slice(0, 90), needsOther: byArea, needsCount: needs.size }; });
const loadOut = { loadItems: load.length, load };
fs.writeFileSync(path.join(process.env.TMPDIR || '/tmp', 's3load.json'), JSON.stringify(loadOut));
