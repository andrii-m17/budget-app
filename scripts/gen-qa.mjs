// Rev 2.32.122 (QA-1): генерує qa.json («Чекліст перевірки» у «Тестування») зі звітів docs/reports/*.md.
// Правило для звітів: розділ (заголовок ## або ###) «Для iPhone»; кожен пункт списку (- або 1.) під ним = один пункт чекліста, формат «Що перевірити: очікується». Ревізія береться з найближчого попереднього заголовка з «Rev X.Y.Z» (інакше з першого «Rev» у файлі). Старі розділи «Перевірка на iPhone» не беруться (нова умова: розділ «Для iPhone»).
// Запуск: node scripts/gen-qa.mjs [--check]   (--check: лише перевірити, що qa.json актуальний; код 1, якщо ні). Без залежностей, лише синтетичні дані.
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'docs', 'reports');
const REV = /Rev\s+(\d+\.\d+\.\d+)/;
const cmp = (a, b) => { const x = a.split('.').map(Number), y = b.split('.').map(Number); for(let i = 0; i < 3; i++){ if(x[i] !== y[i]) return x[i] - y[i]; } return 0; };

export function itemHash(text){ let h = 2166136261; for(const ch of String(text)){ h ^= ch.codePointAt(0); h = Math.imul(h, 16777619) >>> 0; } return h.toString(16).padStart(8, '0').slice(0, 6); }
export function parseReport(text){
  const lines = String(text).replace(/\r/g, '').split('\n');
  const firstRev = (String(text).match(REV) || [])[1] || null;
  let rev = firstRev, inBlock = false, fence = false; const found = [];
  for(const line of lines){
    if(/^\s*```/.test(line)){ fence = !fence; continue; }
    if(fence) continue;
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if(h){
      const m = h[2].match(REV); if(m) rev = m[1];
      inBlock = /^Для iPhone\s*$/i.test(h[2].trim());
      continue;
    }
    if(!inBlock) continue;
    const b = line.match(/^(\s*)(?:[-*]|(\d+)\.)\s+(.*\S)\s*$/);
    if(b && rev && b[1].length < 2){ found.push({ rev, num: b[2] ? Number(b[2]) : null, text: b[3].replace(/\*\*/g, '').trim() }); continue; }
    if(found.length && rev && /^\s{2,}\S/.test(line)) found[found.length - 1].text += ' ' + line.trim().replace(/\*\*/g, ''); // продовження пункту (відступ) або вкладений рядок
  }
  return found;
}
export function buildItems(files){
  const items = [];
  for(const f of files){
    const perRev = {};
    for(const it of parseReport(f.text)){
      perRev[it.rev] = (perRev[it.rev] || 0) + 1;
      const n = it.num !== null ? it.num : perRev[it.rev]; // явний номер зі звіту (1., 2.) або порядковий у межах ревізії цього звіту
      const i = it.text.indexOf(':');
      let title = (i > 0 && i <= 90 ? it.text.slice(0, i) : it.text).trim();
      if(title.length > 90){ title = title.slice(0, 90); const sp = title.lastIndexOf(' '); if(sp > 40) title = title.slice(0, sp); title += '…'; }
      const expected = (i > 0 && i <= 90 ? it.text.slice(i + 1) : '').trim();
      items.push({ id: it.rev + '-' + n, rev: it.rev, title, steps: [], expected, h: itemHash(it.text) });
    }
  }
  // однакова ревізія в кількох звітах: id не повинні збігатися
  const seen = {}; items.forEach(x => { if(seen[x.id]){ let k = Number(x.id.split('-').pop()); while(seen[x.rev + '-' + k]) k++; x.id = x.rev + '-' + k; } seen[x.id] = true; });
  const num = x => Number(x.id.split('-').pop());
  return items.sort((a, b) => cmp(b.rev, a.rev) || num(a) - num(b));
}
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if(isMain){
  const files = readdirSync(dir).filter(f => f.endsWith('.md')).sort().map(f => ({ name: f, text: readFileSync(join(dir, f), 'utf8') }));
  const out = JSON.stringify(buildItems(files), null, 2) + '\n';
  const path = join(root, 'qa.json');
  if(process.argv.includes('--check')){
    const cur = existsSync(path) ? readFileSync(path, 'utf8') : '';
    if(cur !== out){ console.error('qa.json застарілий: запусти node scripts/gen-qa.mjs'); process.exit(1); }
    console.log('qa.json актуальний'); process.exit(0);
  }
  writeFileSync(path, out);
  console.log('qa.json: пунктів ' + JSON.parse(out).length);
}
