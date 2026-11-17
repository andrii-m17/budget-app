// DS-2 (одноразово по ревізіях): тести, що пінять ТЕКСТ css (регулярні вирази з var\(--color-…\), border-radius:12px тощо), переписуються на нові форми, якщо переписаний вираз збігається з поточним CSS. Нічого не вгадує: якщо кандидат не збігається — лишає тест для ручного виправлення.
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process');
const { readIndexWithCss, readAppCss } = require('../tests/extract');
const NAME_MAP = { 'color-bg': 'bg', 'color-surface': 'surface', 'color-surface-hover': 'surface-2', 'color-border': 'line', 'color-border-strong': 'line-strong', 'color-text-primary': 'text', 'color-text-secondary': 'text-2', 'color-text-tertiary': 'text-3', 'color-primary': 'accent', 'ui-accent-text': 'accent-text', 'ui-accent-bg': 'accent-bg', 'ui-accent-border': 'accent-line', 'color-glass-bg': 'glass', 'color-glass-pressed-bg': 'glass-press', 'color-glass-border': 'glass-edge', 'color-glass-shimmer': 'glass-edge-2', 'shadow-glass': 'glass-shadow', 'ui-r-small': 'r-s', 'ui-r-control': 'r-m', 'ui-r-pill': 'r-pill', 'radius-md': 'r-s', 'motion-micro': 't-micro', 'motion-s': 't-s', 'motion-m': 't-m', 'motion-l': 't-l', 'motion-count': 't-count' };
const RAD = { 12: 'r-s', 18: 'r-m', 22: 'r-l', 28: 'r-xl', 999: 'r-pill' };
const DUR = { '120ms': 't-micro', '200ms': 't-s', '320ms': 't-m', '480ms': 't-l' };
function variants(src){
  const out = new Set();
  // 1) лише назви (\( — екранування дужок у регулярному виразі)
  const names = src.replace(/var\\\(--([a-z0-9-]+)(?=[,\\)])/g, (a, n) => NAME_MAP[n] ? 'var\\(--' + NAME_MAP[n] : a);
  out.add(names);
  // 2) + радіуси (усі разом) і кольори акценту, тривалості
  let all = names.replace(/(border(?:-(?:top|bottom)-(?:left|right))?-radius:)([^;}]*)/g, (a, p, v) => p + v.replace(/(?<![\w.#-])(12|18|22|28|999)px/g, (b, n) => 'var\\(--' + RAD[n] + '\\)'));
  all = all.replace(/rgba\\\(34,197,94,\\?\.16\\\)/g, 'var\\(--accent-bg\\)').replace(/rgba\\\(34,197,94,\\?\.32\\\)/g, 'var\\(--accent-line\\)');
  all = all.replace(/(?<![\w.-])(120ms|200ms|320ms|480ms)(?!\w)/g, (a, d) => 'var\\(--' + DUR[d] + '\\)');
  out.add(all);
  // 3) лише радіуси без назв (коли назви в тесті вже старі, а значення нові)
  out.add(src.replace(/(border(?:-(?:top|bottom)-(?:left|right))?-radius:)([^;}]*)/g, (a, p, v) => p + v.replace(/(?<![\w.#-])(12|18|22|28|999)px/g, (b, n) => 'var\\(--' + RAD[n] + '\\)')));
  return Array.from(out);
}
const FULL = readIndexWithCss();
let fixedTotal = 0;
for(let round = 0; round < 12; round++){
  const r = cp.spawnSync('node', ['--test'], { cwd: path.join(__dirname, '..'), encoding: 'utf8', maxBuffer: 1e9 });
  const txt = (r.stdout || '') + (r.stderr || '');
  const items = []; const re = /test at (tests\/[^:\n]+):\d+:\d+(?:(?!\ntest at )[^])*?did not match the regular expression \/((?:\\.|[^\/\\\n])+)\/([a-z]*)\./g; let m;
  while((m = re.exec(txt))) items.push({ file: m[1], src: m[2], flags: m[3] });
  if(!items.length) break;
  let fixed = 0;
  items.forEach(it => {
    const f = path.join(__dirname, '..', it.file); let s = fs.readFileSync(f, 'utf8');
    const lit = '/' + it.src + '/' + it.flags; if(s.indexOf(lit) < 0) return;
    for(const v of variants(it.src)){
      if(v === it.src) continue;
      let ok = false; try{ ok = new RegExp(v, it.flags).test(FULL) || new RegExp(v, it.flags).test(readAppCss()); }catch(e){}
      if(ok){ s = s.split(lit).join('/' + v + '/' + it.flags); fs.writeFileSync(f, s); fixed++; console.log('виправлено', it.file, v.slice(0, 90)); return; }
    }
    console.log('ВРУЧНУ', it.file, it.src.slice(0, 110));
  });
  fixedTotal += fixed; if(!fixed) break;
}
console.log('виправлено регулярних виразів:', fixedTotal);
