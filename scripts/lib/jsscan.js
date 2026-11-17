// Спільний розбір JavaScript верхнього рівня для STRUCT-3 (без залежностей): оголошення, оператори, залежності часу завантаження.
'use strict';
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
function skipWsComments(s, i){ for(;;){ while(/\s/.test(s[i] || '')) i++; if(s[i] === '/' && s[i + 1] === '/'){ const e = s.indexOf('\n', i); i = e < 0 ? s.length : e; continue; } if(s[i] === '/' && s[i + 1] === '*'){ const e = s.indexOf('*/', i + 2); i = e < 0 ? s.length : e + 2; continue; } return i; } }
function endOfStatement(s, i){
  let depth = 0, prev = ';';
  for(let j = i; j < s.length; ){
    const k = skip(s, j, prev); if(k !== j){ j = k; prev = 'x'; continue; }
    const c = s[j];
    if('([{'.includes(c)) depth++; else if(')]}'.includes(c)){ depth--; if(depth === 0 && c === '}'){ const nxt = skipWsComments(s, j + 1); const w = s.slice(nxt, nxt + 8); const head = s.slice(i, i + 12); const blockStmt = /^(if|for|while|do|try|switch|with)\b/.test(head) || /^\s*\{/.test(head); if(blockStmt && !/^(else|catch|finally)\b/.test(w) && !(/^do\b/.test(head) && /^while\b/.test(w))) return j + 1; } }
    else if(c === ';' && depth === 0) return j + 1;
    if(!/\s/.test(c)) prev = c;
    j++;
  }
  return s.length;
}
// елементи верхнього рівня: { kind: fn|class|const|let|var|stmt, names, start, end, text }
function parseTop(SRC){
  const items = [];
  for(let i = skipWsComments(SRC, 0); i < SRC.length; ){
    const rest = SRC.slice(i, i + 160); let m;
    if((m = /^(async\s+)?function\s*\*?\s*([\w$]+)\s*\(/.exec(rest))){ const pe = matchBrace(SRC, i + m[0].length - 1); const b = SRC.indexOf('{', pe); const e = matchBrace(SRC, b) + 1; items.push({ kind: 'fn', names: [m[2]], start: i, end: e }); i = e; }
    else if((m = /^class\s+([\w$]+)/.exec(rest))){ const b = SRC.indexOf('{', i); const e = matchBrace(SRC, b) + 1; items.push({ kind: 'class', names: [m[1]], start: i, end: e }); i = e; }
    else if((m = /^(const|let|var)\s/.exec(rest))){ const e = endOfStatement(SRC, i); const txt = SRC.slice(i, e); const names = []; const nm = /^(?:const|let|var)\s+([\w$]+)/.exec(txt); if(nm) names.push(nm[1]);
      { let d = 0, prev = '='; for(let j = txt.indexOf(nm ? nm[1] : '') + (nm ? nm[1].length : 0); j < txt.length; ){ const k = skip(txt, j, prev); if(k !== j){ j = k; prev = 'x'; continue; } const c = txt[j]; if('([{'.includes(c)) d++; else if(')]}'.includes(c)) d--; else if(c === ',' && d === 0){ const mm = /^\s*([\w$]+)\s*=/.exec(txt.slice(j + 1)); if(mm) names.push(mm[1]); } if(!/\s/.test(c)) prev = c; j++; } }
      items.push({ kind: m[1], names, start: i, end: e }); i = e; }
    else { const e = endOfStatement(SRC, i); items.push({ kind: 'stmt', names: [], start: i, end: e }); i = e; }
    i = skipWsComments(SRC, i);
  }
  items.forEach(it => { it.text = SRC.slice(it.start, it.end); it.line = SRC.slice(0, it.start).split('\n').length; });
  return items;
}
// ключі об'єктних літералів (ім'я перед «:» після «{» або «,») не є зверненнями до змінних
function dropKeys(s){ return s.replace(/([{,]\s*)([A-Za-z_$][\w$]*)(\s*:)(?!:)/g, (a, p, n, c) => p + ' '.repeat(n.length) + c); }
function directText(text, iife){
  let s = stripped(text); let out = ''; let i = 0; let first = !!iife;
  while(i < s.length){
    const fm = /^\bfunction\b\s*[\w$]*\s*\(/.exec(s.slice(i, i + 80));
    if(fm && (i === 0 || !/[\w$.]/.test(s[i - 1]))){ const pe = matchBrace(s, i + fm[0].length - 1); const b = s.indexOf('{', pe); if(b < 0){ out += s[i]; i++; continue; } const e = matchBrace(s, b);
      if(first){ first = false; out += s.slice(i, b + 1) + directText(s.slice(b + 1, e), false) + '}'; i = e + 1; continue; } out += ' '; i = e + 1; continue; }
    if(s[i] === '=' && s[i + 1] === '>'){ let j = i + 2; while(/\s/.test(s[j] || '')) j++; if(s[j] === '{'){ const e = matchBrace(s, j); out += ' '; i = e + 1; continue; } let d = 0; while(j < s.length){ const c = s[j]; if('([{'.includes(c)) d++; else if(')]}'.includes(c)){ if(d === 0) break; d--; } else if(c === ',' && d === 0) break; j++; } out += ' '; i = j; continue; }
    out += s[i]; i++;
  }
  return dropKeys(out);
}
function localsOf(text){
  const s = stripped(text); const L = new Set(); let m;
  const head = s.slice(0, s.indexOf(')') + 1); (head.match(/[A-Za-z_$][\w$]*/g) || []).forEach(x => L.add(x));
  const re = /\b(?:var|let|const)\s+([^;=]*?)(?:=|;|\bof\b|\bin\b)/g; while((m = re.exec(s))){ (m[1].match(/[A-Za-z_$][\w$]*/g) || []).forEach(x => L.add(x)); }
  const re2 = /\b(?:var|let|const)\s*[\[{]([^\]}]*)[\]}]/g; while((m = re2.exec(s))){ (m[1].match(/[A-Za-z_$][\w$]*/g) || []).forEach(x => L.add(x)); }
  const re3 = /\(([^()]*)\)\s*=>/g; while((m = re3.exec(s))){ (m[1].match(/[A-Za-z_$][\w$]*/g) || []).forEach(x => L.add(x)); }
  const re4 = /([A-Za-z_$][\w$]*)\s*=>/g; while((m = re4.exec(s))){ L.add(m[1]); }
  const re5 = /function\s*([A-Za-z_$][\w$]*)?\s*\(([^()]*)\)/g; while((m = re5.exec(s))){ (m[2].match(/[A-Za-z_$][\w$]*/g) || []).forEach(x => L.add(x)); }
  const re6 = /catch\s*\(\s*([\w$]+)/g; while((m = re6.exec(s))){ L.add(m[1]); }
  return L;
}
const ID_RE = /(?<![\w$.])([A-Za-z_$][\w$]*)/g;
// імена верхнього рівня, потрібні під час виконання елемента (оператор або ініціалізатор const/let/var): безпосередньо й транзитивно через виклики функцій
// table: Map(ім'я → { kind, text }) — глобальна таблиця оголошень усіх файлів
function loadNeeds(item, table){
  const iife = item.kind === 'stmt' && /^\(\s*(async\s+)?function/.test(item.text);
  const base = item.kind === 'stmt' ? item.text : item.text.replace(/^(const|let|var)\s+[\w$]+\s*=/, '');
  const direct = directText(base, iife); const needs = new Map(); const visited = new Set();
  const addFn = (n) => { if(visited.has(n)) return; visited.add(n); const t = table.get(n); if(!t || t.kind !== 'fn') return; const body = dropKeys(stripped(t.text)); const loc = localsOf(t.text); let m; const r = new RegExp(ID_RE.source, 'g'); while((m = r.exec(body))){ const x = m[1]; if(!table.has(x) || x === n || loc.has(x)) continue; const tt = table.get(x); if(tt.kind === 'fn'){ if(!needs.has(x)) needs.set(x, 'fn'); addFn(x); } else needs.set(x, 'val'); } };
  let m; const r = new RegExp(ID_RE.source, 'g');
  while((m = r.exec(direct))){ const x = m[1]; if(!table.has(x) || (item.names || []).includes(x)) continue; const t = table.get(x); const called = /^\s*\(/.test(direct.slice(m.index + x.length)); if(t.kind === 'fn'){ needs.set(x, called ? 'fn-call' : 'fn'); if(called) addFn(x); } else needs.set(x, 'val'); }
  return needs;
}
// ініціалізатор «тривіальний», якщо після відкидання рядків і чисел у ньому немає жодного ідентифікатора (крім true/false/null/undefined/NaN/Infinity)
const isTrivialInit = (it) => { const init = it.text.replace(/^(const|let|var)\s+[\w$]+\s*=/, ''); const t = stripped(init).replace(/\d[\w.]*/g, ' ').replace(/\b(true|false|null|undefined|NaN|Infinity)\b/g, ' '); return !/[A-Za-z_$]/.test(t); };
module.exports = { skip, matchBrace, stripped, parseTop, directText, localsOf, loadNeeds, isTrivialInit, dropKeys };
