// DS-N*: зведений знімок «до/після» з усіх пар <екран>-<тема>-before/after.png теки. node scripts/ds-summary.js docs/ui/ds-n1
'use strict';
const fs = require('fs'), path = require('path');
const dir = path.resolve(process.argv[2] || 'docs/ui/ds-n1');
const states = Array.from(new Set(fs.readdirSync(dir).filter(f => /-light-(before|after)\.png$/.test(f)).map(f => f.replace(/-light-(before|after)\.png$/, '')))).sort((a, b) => (a.startsWith('ov-') - b.startsWith('ov-')) || a.localeCompare(b));
const W = 195;
let html = '<!doctype html><meta charset="utf-8"><style>body{margin:0;padding:12px;background:#777;font:12px -apple-system,sans-serif;color:#fff}table{border-collapse:separate;border-spacing:8px}td{vertical-align:top;text-align:center}img{display:block;width:' + W + 'px;border-radius:8px}th{font-weight:600;padding:2px}</style><table><tr><th></th><th>світла · до</th><th>світла · після</th><th>темна · до</th><th>темна · після</th></tr>';
states.forEach(s => { html += '<tr><th>' + s + '</th>' + ['light-before', 'light-after', 'dark-before', 'dark-after'].map(k => (fs.existsSync(path.join(dir, s + '-' + k + '.png')) ? '<td><img src="file://' + path.join(dir, s + '-' + k + '.png') + '"></td>' : '<td style="opacity:.6">(нового стану до зміни не було)</td>')).join('') + '</tr>'; });
html += '</table>';
const tmp = path.join(dir, '.summary.html'); fs.writeFileSync(tmp, html);
(async () => {
  const { webkit } = require(path.join(process.cwd(), 'node_modules/playwright-core'));
  const b = await webkit.launch(); const pg = await b.newPage({ viewport: { width: 4 * (W + 8) + 140, height: 800 } });
  await pg.goto('file://' + tmp); await pg.waitForTimeout(800);
  await pg.screenshot({ path: path.join(dir, 'summary.png'), fullPage: true });
  await b.close(); fs.unlinkSync(tmp); console.log('зведений файл:', path.join(dir, 'summary.png'), states.length, 'станів');
})();
