// DS-3b: зведений знімок кадрів анімацій таббару. node scripts/ds3b-summary.js docs/ui/ds-3b
'use strict';
const fs = require('fs'), path = require('path');
const dir = path.resolve(process.argv[2] || 'docs/ui/ds-3b');
const names = Array.from(new Set(fs.readdirSync(dir).filter(f => /^frame-.*-light-0\.png$/.test(f)).map(f => f.replace(/^frame-/, '').replace(/-light-0\.png$/, ''))));
let html = '<!doctype html><meta charset="utf-8"><style>body{margin:0;padding:12px;background:#777;font:12px -apple-system,sans-serif;color:#fff}table{border-collapse:separate;border-spacing:4px}th{text-align:right;padding-right:8px;white-space:nowrap}td{text-align:center}td img{display:block;height:84px;border-radius:6px}.h th,.h td{font-weight:600}</style><table>';
html += '<tr class="h"><th></th><td colspan="5">світла тема · 0 / 25 / 50 / 75 / 100 %</td><td colspan="5">темна тема · 0 / 25 / 50 / 75 / 100 %</td></tr>';
names.forEach(n => { html += '<tr><th>' + n + '</th>' + ['light', 'dark'].map(th => [0, 25, 50, 75, 100].map(p => '<td><img src="file://' + path.join(dir, 'frame-' + n + '-' + th + '-' + p + '.png') + '"></td>').join('')).join('') + '</tr>'; });
html += '</table>';
const tmp = path.join(dir, '.summary.html'); fs.writeFileSync(tmp, html);
(async () => {
  const { webkit } = require(path.join(process.cwd(), 'node_modules/playwright-core'));
  const b = await webkit.launch(); const pg = await b.newPage({ viewport: { width: 1500, height: 600 } });
  await pg.goto('file://' + tmp); await pg.waitForTimeout(800);
  await pg.screenshot({ path: path.join(dir, 'summary.png'), fullPage: true });
  await b.close(); fs.unlinkSync(tmp); console.log('зведений файл:', path.join(dir, 'summary.png'), names.length, 'анімацій');
})();
