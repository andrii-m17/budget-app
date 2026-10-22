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

export function parseReport(text){
  const lines = text.split('\n');
  const firstRev = (text.match(REV) || [])[1] || null;
  let rev = firstRev, inBlock = false; const found = [];
  for(const line of lines){
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if(h){
      const m = h[2].match(REV); if(m) rev = m[1];
      inBlock = /^Для iPhone\s*$/i.test(h[2].trim());
      continue;
    }
    if(!inBlock) continue;
    const b = line.match(/^\s*(?:[-*]|\d+\.)\s+(.*\S)\s*$/);
    if(b && rev) found.push({ rev, text: b[1].replace(/\*\*/g, '').trim() });
  }
  return found;
}
export function buildItems(files){
  const counter = {}; const items = [];
  for(const f of files){
    for(const it of parseReport(f.text)){
      counter[it.rev] = (counter[it.rev] || 0) + 1;
      const i = it.text.indexOf(':');
      const title = (i > 0 && i <= 90 ? it.text.slice(0, i) : it.text.slice(0, 90)).trim();
      const expected = (i > 0 && i <= 90 ? it.text.slice(i + 1) : '').trim();
      items.push({ id: it.rev + '-' + counter[it.rev], rev: it.rev, title, steps: [], expected });
    }
  }
  return items.sort((a, b) => cmp(b.rev, a.rev) || (a.id < b.id ? -1 : 1));
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
