// DS-2: заміна старих назв токенів і сирих значень, що ТОЧНО дорівнюють токену, у css/app.css (в межах діапазону рядків). Нічого не округлює й не змінює вигляд.
// node scripts/ds2-apply.js --from 1 --to 989 [--dry]      заміни в діапазоні (рядки початку оголошення)
// node scripts/ds2-apply.js --count                          лічильники для охоронного тесту
// node scripts/ds2-apply.js --offscale                       значення поза шкалою (для docs/reports/DS-2.md), JSON
'use strict';
const fs = require('fs'), path = require('path');
const FILE = path.join(__dirname, '..', 'css', 'app.css');
// нова назва ← стара (docs/DESIGN_SYSTEM.md, «Нові назви токенів → старі»); --income/--expense/--debt/--inst не підставляються (збіг лише за значенням, не за змістом: --color-error/-warning/-info/-success вживаються для станів, а не для доходу/витрати/боргу/ОЧ)
const NAME_MAP = {
  '--color-bg': '--bg', '--color-surface': '--surface', '--color-surface-hover': '--surface-2', '--color-border': '--line', '--color-border-strong': '--line-strong',
  '--color-text-primary': '--text', '--color-text-secondary': '--text-2', '--color-text-tertiary': '--text-3',
  '--color-primary': '--accent', '--ui-accent-text': '--accent-text', '--ui-accent-bg': '--accent-bg', '--ui-accent-border': '--accent-line',
  '--color-glass-bg': '--glass', '--color-glass-pressed-bg': '--glass-press', '--color-glass-border': '--glass-edge', '--color-glass-shimmer': '--glass-edge-2', '--shadow-glass': '--glass-shadow',
  '--ui-r-small': '--r-s', '--ui-r-control': '--r-m', '--ui-r-pill': '--r-pill', '--radius-md': '--r-s',
  '--motion-micro': '--t-micro', '--motion-s': '--t-s', '--motion-m': '--t-m', '--motion-l': '--t-l', '--motion-count': '--t-count'
};
const RADIUS = { '12px': 'var(--r-s)', '18px': 'var(--r-m)', '22px': 'var(--r-l)', '28px': 'var(--r-xl)', '999px': 'var(--r-pill)' };
const DUR = { '120ms': 'var(--t-micro)', '200ms': 'var(--t-s)', '320ms': 'var(--t-m)', '480ms': 'var(--t-l)', '.12s': 'var(--t-micro)', '.2s': 'var(--t-s)', '.32s': 'var(--t-m)', '.48s': 'var(--t-l)' };
// сирі кольори, що в обох темах дорівнюють токену (значення --ui-accent-bg / --ui-accent-border однакові у світлій і темній темі)
const COLORS = [[/rgba\(\s*34\s*,\s*197\s*,\s*94\s*,\s*0?\.16\s*\)/g, 'var(--accent-bg)'], [/rgba\(\s*34\s*,\s*197\s*,\s*94\s*,\s*0?\.32\s*\)/g, 'var(--accent-line)']];

// Розбір: повертає оголошення { start, end (зміщення тексту «prop:value»), sel, prop, line }
function parse(src){
  const decls = []; const stack = []; let i = 0, buf = '', bufStart = 0, paren = 0;
  const n = src.length; let declStart = -1;
  const lineOf = (pos) => src.slice(0, pos).split('\n').length;
  const flushDecl = (endPos) => {
    if(declStart < 0) return;
    // коментарі перед оголошенням (/* … */) пропускаємо: оголошення починається після них
    let ds = declStart; for(;;){ const w = src.slice(ds, endPos).match(/^\s*\/\*[^]*?\*\//); if(!w) break; ds += w[0].length; }
    const text = src.slice(ds, endPos); const m = text.match(/^\s*([a-zA-Z-]+|--[a-zA-Z0-9-]+)\s*:/);
    const top = stack[stack.length - 1];
    if(m && top && !top.at){ decls.push({ start: ds, end: endPos, prop: m[1], sel: stack.map(s => s.sel).join(' ⟶ '), keyframes: stack.some(s => /@keyframes|@font-face/.test(s.sel)) }); }
    declStart = -1;
  };
  while(i < n){
    const c = src[i], d = src[i + 1];
    if(c === '/' && d === '*'){ const e = src.indexOf('*/', i + 2); const end = e < 0 ? n : e + 2; if(declStart < 0) bufStart = bufStart; i = end; continue; }
    if(c === '"' || c === "'"){ let j = i + 1; while(j < n && src[j] !== c){ if(src[j] === '\\') j++; j++; } i = j + 1; if(declStart < 0) { /* рядок у селекторі */ } continue; }
    if(c === '(') paren++;
    if(c === ')') paren = Math.max(0, paren - 1);
    if(paren === 0 && c === '{'){
      const sel = src.slice(bufStart, i).replace(/\/\*[^]*?\*\//g, '').trim();
      const at = /^@(media|supports|layer|container)\b/.test(sel);
      stack.push({ sel, at }); i++; bufStart = i; declStart = at ? -1 : i; continue;
    }
    if(paren === 0 && c === '}'){ flushDecl(i); stack.pop(); i++; bufStart = i; declStart = stack.length && !stack[stack.length - 1].at ? i : -1; continue; }
    if(paren === 0 && c === ';'){ flushDecl(i); i++; bufStart = i; declStart = stack.length && !stack[stack.length - 1].at ? i : -1; continue; }
    i++;
  }
  decls.forEach(dc => { dc.line = lineOf(dc.start + (src.slice(dc.start, dc.end).match(/^\s*/)[0].length)); });
  return decls;
}
function transform(decl, text){
  const m = text.match(/^(\s*[a-zA-Z-]+|\s*--[a-zA-Z0-9-]+)(\s*:\s*)([^]*)$/);
  if(!m) return { text, stats: {} };
  const prop = m[1].trim(); let val = m[3]; const stats = { names: 0, radius: 0, colors: 0, durations: 0 };
  const kbRule = /kb-/.test(decl.sel) || /^--kb/.test(prop);
  const sheetAnim = kbRule || /drawer|app-modal|backdrop|\.sheet/.test(decl.sel);
  // а) назви змінних (скрізь, зокрема в kb-/шторках: змінюються лише назви)
  val = val.replace(/var\(\s*(--[a-zA-Z0-9-]+)(?=\s*[,)])/g, (all, name) => { if(NAME_MAP[name]){ stats.names++; return all.replace(name, NAME_MAP[name]); } return all; });
  if(!kbRule && !decl.keyframes){
    if(/^border(-(top|bottom)-(left|right))?-radius$/.test(prop)){
      val = val.replace(/(?<![\w.#-])(12|18|22|28|999)px(?![\w%])/g, (all, v) => { stats.radius++; return RADIUS[v + 'px']; });
    }
    if(!/^--/.test(prop)) COLORS.forEach(([re, to]) => { val = val.replace(re, () => { stats.colors++; return to; }); });
    if(!sheetAnim && /^(transition|transition-duration|transition-delay|animation|animation-duration|animation-delay)$/.test(prop)){
      val = val.replace(/(?<![\w.-])(120ms|200ms|320ms|480ms|0?\.12s|0?\.2s|0?\.32s|0?\.48s)(?![\w])/g, (all, v) => { stats.durations++; return DUR[v.replace(/^0/, '')]; });
    }
  }
  // DS-N3: радіуси поза шкалою на токени (2/3/5→--r-2xs, 7/8/9→--r-xs, 10/11/13/14→--r-s, 16→--r-m, 20/24→--r-l, 26→--r-xl); 50%, calc(), inherit і правила kb-* не чіпаємо
  if(has('--radius') && /^border(-(top|bottom)-(left|right))?-radius$/.test(prop) && !kbRule && !decl.keyframes && !/calc\(|inherit/.test(val)){
    const RM = { '2': 'r-2xs', '3': 'r-2xs', '5': 'r-2xs', '7': 'r-xs', '8': 'r-xs', '9': 'r-xs', '10': 'r-s', '11': 'r-s', '13': 'r-s', '14': 'r-s', '16': 'r-m', '20': 'r-l', '24': 'r-l', '26': 'r-xl' };
    val = val.replace(/(?<![\w.#-])(\d+)px(?![\w%])/g, (all, n) => { if(RM[n]){ stats.radiusN3 = (stats.radiusN3 || 0) + 1; (stats.byVal = stats.byVal || {})[n] = ((stats.byVal || {})[n] || 0) + 1; return 'var(--' + RM[n] + ')'; } return all; });
  }
  if(has('--fs') && prop === 'font-size' && !kbRule && !decl.keyframes){
    if(isFieldSel(decl.sel)){ globalThis.__fsExceptions.push({ line: decl.line, sel: decl.sel, val: val.trim() }); }
    else val = val.replace(/(?<![\w.#-])(\d+(?:\.5)?)px(?![\w%])/g, (all, n) => { if(FS_MAP[n]){ stats.fs = (stats.fs || 0) + 1; return 'var(--fs-' + FS_MAP[n] + ')'; } return all; });
  }
  return { text: m[1] + m[2] + val, stats };
}
function strip(s){ return s.replace(/\/\*[^]*?\*\//g, m => m.replace(/[^\n]/g, ' ')); }
function counts(src){
  const nc = strip(src);
  const hex = (nc.match(/#[0-9a-fA-F]{3,8}\b/g) || []).length, rgba = (nc.match(/rgba?\(/g) || []).length;
  let radiusPx = 0; (nc.match(/border(?:-(?:top|bottom)-(?:left|right))?-radius\s*:[^;}]*/g) || []).forEach(d => { radiusPx += (d.match(/(?<![\w.#-])\d*\.?\d+px/g) || []).length; });
  const refs = (re) => (nc.match(re) || []).length;
  return { hex, rgba, radiusPx, refColor: refs(/var\(\s*--color-/g), refUi: refs(/var\(\s*--ui-/g), refRadius: refs(/var\(\s*--radius-/g) };
}
// DS-N2: шкала кеглів (docs/specs/DS-PLAN.md §1). Винятки (не змінюються): font-size полів вводу (input, textarea, select і їхні класи), правила html.kb-*, keyframes.
const FS_MAP = { '9': 'caption2', '9.5': 'caption2', '10': 'caption2', '10.5': 'caption2', '11': 'caption2', '11.5': 'caption1', '12': 'caption1', '12.5': 'footnote', '13': 'footnote', '13.5': 'footnote', '14': 'subhead', '14.5': 'subhead', '15': 'subhead', '16': 'callout', '17': 'body', '18': 'body', '20': 'title3', '21': 'title2', '22': 'title2', '26': 'title1', '28': 'title1' };
function splitTop(str){ const out = []; let d = 0, cur = ''; for(const ch of str){ if(ch === '(' || ch === '[') d++; if(ch === ')' || ch === ']') d--; if(ch === ',' && d === 0){ out.push(cur); cur = ''; } else cur += ch; } out.push(cur); return out.map(x => x.trim()).filter(Boolean); }
function lastCompounds(part){
  const m = part.match(/:(?:is|where)\(([^]*)\)\s*$/);
  if(m) return splitTop(m[1]).flatMap(lastCompounds);
  const t = part.replace(/::?[a-z-]+(\([^)]*\))?\s*$/i, (a) => /^::/.test(a) ? '' : a);
  const mm = t.match(/([^\s>+~]+)\s*$/); return mm ? [mm[1]] : [];
}
const FIELD = /^(?:input|textarea|select)(?![\w-])|(?:^|\.)(?:sf-input|sf-select|mono-token-input|bdr-amount|chk-fld)(?![\w-])|^#journal-date-input$/;
function isFieldSel(sel){ const rule = sel.split(' ⟶ ').pop(); return splitTop(rule).every(part => lastCompounds(part).every(c => FIELD.test(c))); }
globalThis.__fsExceptions = [];
const args = process.argv.slice(2); const has = (a) => args.includes(a); const arg = (a, d) => { const i = args.indexOf(a); return i < 0 ? d : args[i + 1]; };
const src = fs.readFileSync(FILE, 'utf8');
if(has('--count')){ console.log(JSON.stringify(counts(src))); process.exit(0); }
if(has('--offscale')){ fs.writeSync(1, JSON.stringify({ decls: parse(src).map(d => ({ line: d.line, prop: d.prop, sel: d.sel, text: src.slice(d.start, d.end) })) })); process.exit(0); }
const from = Number(arg('--from', 1)), to = Number(arg('--to', 1e9));
const decls = parse(src).filter(d => d.line >= from && d.line <= to).sort((a, b) => b.start - a.start);
let out = src; const tot = { names: 0, radius: 0, colors: 0, durations: 0, fs: 0, radiusN3: 0, byVal: {} };
decls.forEach(d => { const orig = out.slice(d.start, d.end); const r = transform(d, orig); if(r.text !== orig){ out = out.slice(0, d.start) + r.text + out.slice(d.end); Object.keys(tot).forEach(k => { if(k === 'byVal'){ Object.keys(r.stats.byVal || {}).forEach(v => { tot.byVal[v] = (tot.byVal[v] || 0) + r.stats.byVal[v]; }); } else tot[k] += r.stats[k] || 0; }); } });
console.log(JSON.stringify({ from, to, replaced: tot, before: counts(src), after: counts(out), lines: src.split('\n').length === out.split('\n').length }));
if(has('--fs')) console.log(JSON.stringify({ fsExceptions: globalThis.__fsExceptions }));
if(!has('--dry')) fs.writeFileSync(FILE, out);
