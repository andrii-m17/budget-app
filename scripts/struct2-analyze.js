// STRUCT-2, крок 0: перелік «чистих» допоміжних функцій і констант основного <script> index.html (не читають/не змінюють DOM, стан, сховище, мережу).
// node scripts/struct2-analyze.js [--json]
'use strict';
const fs = require('fs'), path = require('path');
const file = process.argv.find(a => a.endsWith('.html')) || path.join(__dirname, '..', 'index.html');
const html = fs.readFileSync(file, 'utf8');
const sStart = html.indexOf('<script>', html.indexOf('<script>') + 10); // перший <script> у <head> пропускаємо
const mainOpen = html.indexOf('\n<script>\n', html.indexOf('</head>') - 1) >= 0 ? html.indexOf('<script>', html.indexOf('<body')) : sStart;
const open = html.indexOf('<script>', html.indexOf('<body') > 0 ? 0 : 0);
// основний скрипт — найбільший <script> без src
let best = null; { const re = /<script>([^]*?)<\/script>/g; let m; while((m = re.exec(html))){ if(!best || m[1].length > best.text.length) best = { text: m[1], start: m.index + 8 }; } }
const SRC = best.text; const baseLine = html.slice(0, best.start).split('\n').length - 1;
// --- скануємо: повертає індекс після літерала/коментаря, що починається в i (або i, якщо не літерал)
const REGEX_PREV = /[(,=:\[!&|?{};+\-*%<>~^]$|\b(?:return|typeof|case|in|of|delete|void|throw|new|else|do)$/;
function skip(s, i, prevSig){
  const c = s[i], d = s[i + 1];
  if(c === '/' && d === '/'){ const e = s.indexOf('\n', i); return e < 0 ? s.length : e; }
  if(c === '/' && d === '*'){ const e = s.indexOf('*/', i + 2); return e < 0 ? s.length : e + 2; }
  if(c === '"' || c === "'"){ let j = i + 1; while(j < s.length && s[j] !== c){ if(s[j] === '\\') j++; j++; } return j + 1; }
  if(c === '`'){ let j = i + 1; while(j < s.length && s[j] !== '`'){ if(s[j] === '\\'){ j += 2; continue; } if(s[j] === '$' && s[j + 1] === '{'){ j = matchBrace(s, j + 1) + 1; continue; } j++; } return j + 1; }
  if(c === '/' && REGEX_PREV.test(prevSig)){ let j = i + 1, cls = false; while(j < s.length){ if(s[j] === '\\'){ j += 2; continue; } if(s[j] === '[') cls = true; else if(s[j] === ']') cls = false; else if(s[j] === '/' && !cls) break; else if(s[j] === '\n') return i; j++; } if(s[j] === '/'){ j++; while(/[a-z]/.test(s[j] || '')) j++; return j; } }
  return i;
}
function matchBrace(s, i){ // s[i] — '{', '(' або '['; повертає індекс парної закриваючої
  const open = s[i], close = open === '{' ? '}' : open === '(' ? ')' : ']'; let depth = 0, prev = '(';
  for(let j = i; j < s.length; ){
    const k = skip(s, j, prev); if(k !== j){ j = k; prev = 'x'; continue; }
    const c = s[j]; if(c === open || c === '{' && open === '{') depth += (c === open ? 1 : 0); if(c === close){ depth--; if(depth === 0) return j; }
    if(c === '(' && open !== '(') { /* вкладене окремо не рахуємо */ }
    if(!/\s/.test(c)) prev = c.match(/[\w$)\]]/) ? (c + '') : c;
    j++;
  }
  return s.length - 1;
}
function stripped(s){ // рядки, коментарі, регулярні літерали → пробіли; вирази в ${} лишаються
  let out = '', prev = '(';
  for(let i = 0; i < s.length; ){
    const k = skip(s, i, prev);
    if(k !== i){ const lit = s.slice(i, k); if(lit[0] === '`'){ const re = /\$\{/g; let m; let last = 0; while((m = re.exec(lit))){ const e = matchBrace(lit, m.index + 1); out += ' ' + stripped(lit.slice(m.index + 2, e)) + ' '; re.lastIndex = e; } } else out += ' '; i = k; prev = 'x'; continue; }
    out += s[i]; if(!/\s/.test(s[i])) prev = s[i]; i++;
  }
  return out;
}
// --- top-level оголошення
const decls = []; // { kind, name, start, end, text }
{
  const re = /^(async\s+)?function\s+([\w$]+)\s*\(|^(const|let|var)\s+([\w$]+)\s*=/gm; let m;
  while((m = re.exec(SRC))){
    const start = m.index;
    if(m[2]){ const b = SRC.indexOf('{', matchBrace(SRC, SRC.indexOf('(', start))); const e = matchBrace(SRC, b); decls.push({ kind: 'fn', name: m[2], start, end: e + 1, text: SRC.slice(start, e + 1) }); re.lastIndex = e; }
    else {
      let j = start, depth = 0, prev = '=';
      for(; j < SRC.length; ){ const k = skip(SRC, j, prev); if(k !== j){ j = k; prev = 'x'; continue; } const c = SRC[j]; if('([{'.includes(c)) depth++; else if(')]}'.includes(c)) depth--; else if(c === ';' && depth <= 0) break; if(!/\s/.test(c)) prev = c; j++; }
      decls.push({ kind: m[3], name: m[4], start, end: j + 1, text: SRC.slice(start, j + 1) }); re.lastIndex = j;
    }
  }
}
const byName = new Map(); decls.forEach(d => byName.set(d.name, d));
const BANNED = new Set(['document', 'window', 'localStorage', 'sessionStorage', 'navigator', 'fetch', 'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval', 'requestAnimationFrame', 'cancelAnimationFrame', 'getComputedStyle', 'indexedDB', 'history', 'location', 'XMLHttpRequest', 'alert', 'confirm', 'prompt', 'Notification', 'caches', 'self', 'getSupabaseClient', 'XLSX', 'MutationObserver', 'IntersectionObserver', 'ResizeObserver', 'FileReader', 'Blob', 'URL', 'screen', 'visualViewport', 'matchMedia', 'dispatchEvent', 'CustomEvent', 'Event', 'Image', 'Audio', 'this']);
const KW = new Set(['function', 'return', 'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'break', 'continue', 'new', 'typeof', 'instanceof', 'in', 'of', 'var', 'let', 'const', 'try', 'catch', 'finally', 'throw', 'async', 'await', 'true', 'false', 'null', 'undefined', 'void', 'delete', 'default', 'yield', 'class', 'extends', 'super', 'static', 'get', 'set']);
function idents(text){ const s = stripped(text); const out = new Set(); const re = /(?<![\w$.])([A-Za-z_$][\w$]*)/g; let m; while((m = re.exec(s))){ const prev = s.slice(Math.max(0, m.index - 1), m.index).trim(); out.add(m[1]); } return out; }
// локальні імена (параметри, var/let/const, вкладені function) не вважаємо залежностями, якщо збігаються з глобальними: для безпеки консервативно ЛИШЕ параметри й оголошення відфільтровуємо
function locals(text){
  const s = stripped(text); const L = new Set();
  const head = s.slice(0, s.indexOf(')') + 1); (head.match(/[A-Za-z_$][\w$]*/g) || []).forEach(x => L.add(x));
  let m; const re = /\b(?:var|let|const)\s+([^;=]*?)(?:=|;|\bof\b|\bin\b)/g; while((m = re.exec(s))){ (m[1].match(/[A-Za-z_$][\w$]*/g) || []).forEach(x => L.add(x)); }
  const re2 = /\b(?:var|let|const)\s*[\[{]([^\]}]*)[\]}]/g; while((m = re2.exec(s))){ (m[1].match(/[A-Za-z_$][\w$]*/g) || []).forEach(x => L.add(x)); }
  const re3 = /\(([^()]*)\)\s*=>/g; while((m = re3.exec(s))){ (m[1].match(/[A-Za-z_$][\w$]*/g) || []).forEach(x => L.add(x)); }
  const re4 = /([A-Za-z_$][\w$]*)\s*=>/g; while((m = re4.exec(s))){ L.add(m[1]); }
  const re5 = /function\s*([A-Za-z_$][\w$]*)?\s*\(([^()]*)\)/g; while((m = re5.exec(s))){ (m[2].match(/[A-Za-z_$][\w$]*/g) || []).forEach(x => L.add(x)); }
  const re6 = /catch\s*\(\s*([\w$]+)/g; while((m = re6.exec(s))){ L.add(m[1]); }
  return L;
}
decls.forEach(d => { d.ids = idents(d.text); d.locals = locals(d.text); d.deps = [...d.ids].filter(x => byName.has(x) && x !== d.name && !d.locals.has(x)); d.banned = [...d.ids].filter(x => BANNED.has(x)); d.selfRef = d.ids.has(d.name); });
// фіксована точка: чисте = немає заборонених + кожна залежність чиста; залежність від let/var-стану (не const-даних і не функцій) = нечисте
const pure = new Set();
const isStateVar = (d) => d.kind === 'let' || d.kind === 'var';
let changed = true;
decls.forEach(d => { if(d.kind === 'fn' || d.kind === 'const') d.cand = d.banned.length === 0; });
while(changed){ changed = false; decls.forEach(d => { if(d.cand && !pure.has(d.name)){ if(d.deps.every(x => { const t = byName.get(x); return t && (pure.has(x) || (t.kind === 'const' && false)); })){ pure.add(d.name); changed = true; } } }); }
// const-дані, що посилаються лише на чисте або літерали, також у pure (цикл вище їх уже врахував)
const res = decls.filter(d => pure.has(d.name)).map(d => ({ kind: d.kind, name: d.name, line: baseLine + SRC.slice(0, d.start).split('\n').length, lines: d.text.split('\n').length, deps: d.deps }));
if(process.argv.includes('--spans')){ fs.writeSync(1, JSON.stringify(decls.map(d => ({ kind: d.kind, name: d.name, start: best.start + d.start, end: best.start + d.end })))); process.exit(0); }
if(process.argv.includes('--json')) console.log(JSON.stringify({ total: decls.length, fns: decls.filter(d => d.kind === 'fn').length, pure: res }));
else { console.log('оголошень верхнього рівня:', decls.length, '| функцій:', decls.filter(d => d.kind === 'fn').length, '| чистих (fn+const):', res.length); res.forEach(r => console.log(r.kind.padEnd(5), String(r.line).padStart(6), String(r.lines).padStart(4), r.name, r.deps.length ? '← ' + r.deps.join(',') : '')); }
