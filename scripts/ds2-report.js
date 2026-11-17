// DS-2: перелік значень поза шкалою → docs/reports/DS-2.md (генерується за станом css/app.css). node scripts/ds2-report.js
'use strict';
const cp = require('child_process'), fs = require('fs'), path = require('path');
const out = cp.spawnSync('node', [path.join(__dirname, 'ds2-apply.js'), '--offscale'], { encoding: 'utf8', maxBuffer: 1e9 }).stdout;
const decls = JSON.parse(out).decls;
const area = (l) => l <= 989 ? 'a' : l <= 1350 ? 'b' : l <= 2411 ? 'c' : 'd';
const near = (v, scale) => scale.reduce((b, x) => Math.abs(x - v) < Math.abs(b - v) ? x : b, scale[0]);
const FONT = [11, 13, 16, 17, 20, 22, 30, 34], SPACE = [4, 8, 12, 16, 20, 24, 32], RAD = [12, 18, 22, 28, 999], DUR = [120, 200, 320, 480];
const rows = {}; // ключ: група|значення → { area: count }
const add = (group, value, a, nearest) => { const k = group + '|' + value + '|' + nearest; (rows[k] = rows[k] || { a: 0, b: 0, c: 0, d: 0 })[a]++; };
decls.forEach(d => {
  const a = area(d.line); const body = d.text.replace(/\/\*[^]*?\*\//g, ''); const m = body.match(/^\s*([a-zA-Z-]+)\s*:([^]*)$/); if(!m) return; const prop = m[1], val = m[2];
  const kb = /kb-/.test(d.sel) || /drawer|app-modal|backdrop|\.sheet/.test(d.sel);
  if(prop === 'font-size'){ (val.match(/(?<![\w.#-])\d*\.?\d+px/g) || []).forEach(x => { const n = parseFloat(x); add('font-size', x, a, FONT.includes(n) ? '(є в шкалі DS-PLAN, але токена кегля ще немає)' : String(near(n, FONT)) + 'px'); }); }
  else if(/^border(-(top|bottom)-(left|right))?-radius$/.test(prop)){ (val.match(/(?<![\w.#-])\d*\.?\d+px/g) || []).forEach(x => { const n = parseFloat(x); add('border-radius', x, a, RAD.includes(n) ? 'токен є; не замінено (kb-правило)' : 'var(--r-' + ({ 12: 's', 18: 'm', 22: 'l', 28: 'xl', 999: 'pill' })[near(n, RAD)] + ')'); }); }
  else if(/^(padding|margin|gap|row-gap|column-gap)(-(top|right|bottom|left))?$/.test(prop)){ (val.match(/(?<![\w.#-])-?\d*\.?\d+px/g) || []).forEach(x => { const n = Math.abs(parseFloat(x)); if(n === 0 || SPACE.includes(n)) return; add('відступ (padding/margin/gap)', x, a, String(near(n, SPACE)) + 'px'); }); }
  else if(/^(transition|transition-duration|transition-delay|animation|animation-duration|animation-delay)$/.test(prop)){ (val.match(/(?<![\w.-])\d*\.?\d+m?s(?![\w])/g) || []).forEach(x => { const ms = /ms$/.test(x) ? parseFloat(x) : parseFloat(x) * 1000; if(ms === 0) return; const nm = DUR.includes(ms) ? (kb ? 'токен є; не замінено (шторка/kb-правило)' : 'токен є') : '--t-' + ({ 120: 'micro', 200: 's', 320: 'm', 480: 'l' })[near(ms, DUR)]; add('тривалість', x, a, nm); }); }
  if(!/^--/.test(prop)){ (val.match(/#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)/g) || []).forEach(x => add('колір (сирий)', x.replace(/\s+/g, ''), a, /^#fff(fff)?$/i.test(x) ? 'токена немає (білий на кольоровому тлі)' : /rgba\(16,24,40,\.45\)/.test(x.replace(/\s+/g, '')) ? '--scrim (DS-PLAN; ще не оголошено)' : 'токена немає')); }
});
const groups = {}; Object.keys(rows).forEach(k => { const [g, v, n] = k.split('|'); (groups[g] = groups[g] || []).push({ v, n, c: rows[k] }); });
const tot = (r) => r.c.a + r.c.b + r.c.c + r.c.d;
let md = '# DS-2: значення поза шкалою (не змінювались)\n\nГенерується `node scripts/ds2-report.js` за станом `css/app.css`. Область: a 1–989, b 990–1350, c 1351–2411, d 2412–кінець. Жодне значення не округлялось: усе, чого немає в шкалі DS-PLAN §1, лишилось як було і чекає окремої видимої ревізії.\n';
Object.keys(groups).forEach(g => {
  const list = groups[g].sort((x, y) => tot(y) - tot(x));
  const sum = list.reduce((s, r) => s + tot(r), 0);
  md += '\n## ' + g + ' — ' + sum + ' входжень, ' + list.length + ' різних значень\n\n| значення | a | b | c | d | разом | найближчий токен / шкала |\n|---|---|---|---|---|---|---|\n';
  list.forEach(r => { md += '| `' + r.v + '` | ' + r.c.a + ' | ' + r.c.b + ' | ' + r.c.c + ' | ' + r.c.d + ' | ' + tot(r) + ' | ' + r.n + ' |\n'; });
});
fs.writeFileSync(path.join(__dirname, '..', 'docs', 'reports', 'DS-2.md'), md);
console.log(Object.keys(groups).map(g => g + ': ' + groups[g].reduce((s, r) => s + tot(r), 0)).join('; '), '| рядків файлу:', md.split('\n').length);
