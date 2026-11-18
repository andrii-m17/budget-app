// DS-4d2: відступи шторок і форм → сітка 4 pt (токени --sp-*), по групах. node scripts/ds4d2-apply.js <група> [--dry]
// Правила: до найближчого кроку сітки, при рівній відстані — більше (щоб не стискати поля); 0, значення 1–2 px (волосини) і від'ємні не чіпаємо; значення, що вже на сітці, у тих самих оголошеннях → токени (вигляд не змінюється).
// Не чіпаємо: форма ОЧ (#installment-drawer, .och-*), правила kb-*/kb-sheet. Рядки — за станом app.css перед DS-4d2 (правки не зсувають рядки).
'use strict';
const fs = require('fs'), path = require('path');
const FILE = path.join(__dirname, '..', 'css', 'app.css');
const OUT = path.join(__dirname, '..', 'docs', 'ui', 'ds-4d2');
const G = {
  headers: [[1990, 'margin-bottom'], [1987, 'padding'], [1987, 'margin'], [373, 'gap'], [393, 'margin-bottom'], [413, 'padding'], [413, 'margin']],
  fields: [[475, 'margin-bottom'], [533, 'margin-bottom'], [534, 'padding'], [394, 'margin-bottom'], [395, 'padding'], [395, 'margin'], [396, 'padding-top'], [396, 'margin-top'], [552, 'margin-bottom'], [553, 'padding'], [547, 'margin-top'], [577, 'margin-top'], [578, 'padding'], [578, 'gap'], [584, 'gap']],
  struct: [[1263, 'margin'], [1264, 'padding'], [1265, 'margin-bottom'], [1266, 'padding'], [1266, 'gap'], [1285, 'padding'], [1287, 'padding'], [1289, 'margin-top'], [1289, 'gap'], [1293, 'margin-top'], [1547, 'gap']],
  appmodal: [[2040, 'padding'], [2066, 'padding'], [2071, 'padding'], [2077, 'padding'], [2070, 'margin-bottom'], [2076, 'margin-bottom'], [2079, 'gap']],
  notifications: [[1729, 'padding'], [1721, 'gap'], [1718, 'margin']],
  expense: [[2780, 'margin-bottom'], [2782, 'padding'], [2654, 'margin-bottom']]
};
const TOK = { 4: 'sp-1', 8: 'sp-2', 12: 'sp-3', 16: 'sp-4', 20: 'sp-5', 24: 'sp-6', 32: 'sp-8', 40: 'sp-10', 48: 'sp-12' };
function conv(val){
  return val.split(/\s+/).map(function(t){
    const m = t.match(/^(\d+)px$/); if(!m) return t;
    const n = Number(m[1]); if(n <= 2) return t;
    const r = Math.floor((n + 2) / 4) * 4;
    return TOK[r] ? 'var(--' + TOK[r] + ')' : r + 'px';
  }).join(' ');
}
const grp = process.argv[2], dry = process.argv.indexOf('--dry') !== -1;
if(!G[grp]){ console.error('групи:', Object.keys(G).join(', ')); process.exit(1); }
const lines = fs.readFileSync(FILE, 'utf8').split('\n'); const rows = [];
G[grp].forEach(function(p){
  const ln = lines[p[0] - 1]; const re = new RegExp('(?<![\\w-])' + p[1] + '\\s*:\\s*([^;}]+)');
  const m = ln.match(re); if(!m) throw new Error('рядок ' + p[0] + ': немає ' + p[1] + ' — ' + ln.slice(0, 80));
  const was = m[1].trim(), now = conv(was);
  const sel = ln.split('{')[0].trim().slice(0, 90);
  rows.push({ line: p[0], sel: sel, prop: p[1], was: was, now: now });
  lines[p[0] - 1] = ln.replace(re, function(all){ return all.replace(m[1], m[1].replace(was, now)); });
});
if(!dry){
  fs.writeFileSync(FILE, lines.join('\n'));
  fs.mkdirSync(OUT, { recursive: true });
  const changed = rows.filter(r => r.was !== r.now);
  let md = '# DS-4d2 · група «' + grp + '»: ' + rows.length + ' оголошень\n\n| рядок app.css | селектор | властивість | було | стало |\n|---|---|---|---|---|\n';
  rows.forEach(r => { md += '| ' + r.line + ' | `' + r.sel.replace(/\|/g, '\\|') + '` | ' + r.prop + ' | `' + r.was + '` | `' + r.now + '` |\n'; });
  fs.writeFileSync(path.join(OUT, grp + '.md'), md);
}
rows.forEach(r => console.log(r.line + '\t' + r.prop + '\t' + r.was + ' → ' + r.now));
