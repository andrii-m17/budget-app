// DS-3b3: зведений знімок «макет | застосунок» по кадрах (0…100 % від найдовшої анімації макета). node scripts/ds3b3-compare.js docs/ui/ds-3b3 [frames|frames-before] [out.png]
'use strict';
const fs = require('fs'), path = require('path');
const dir = path.resolve(process.argv[2] || 'docs/ui/ds-3b3'), sub = process.argv[3] || 'frames', out = process.argv[4] || 'compare.png';
const T = JSON.parse(fs.readFileSync(path.join(dir, sub === "frames" ? "timings.json" : "timings-before.json"), 'utf8'));
const names = process.env.DS_NAMES ? process.env.DS_NAMES.split(',') : ['tbSlice-analytics', 'tbPress-accounting', 'tbNode-structure', 'tbSpin-service', 'vytraty-ring-plus', 'bubble-520', 'press-in-accounting', 'press-out-accounting'];
const label = { 'vytraty-enter': 'Витрати · вхід', 'vytraty-exit': 'Витрати · ВИХІД на Облік', 'tbSlice-analytics': 'Аналітика · tbSlice', 'tbPress-accounting': 'Облік · tbPress', 'tbNode-structure': 'Структура · tbNode', 'tbSpin-service': 'Сервіс · tbSpin+tbPie', 'vytraty-ring-plus': 'Витрати · кільце, «+»', 'bubble-520': 'Бульбашка 520 мс', 'press-in-accounting': 'Натиск .86', 'press-out-accounting': 'Відпускання' };
const S = 11, f = (n, th, k, i) => 'file://' + path.join(dir, sub, n + '-' + th + '-' + k + '-' + i + '.png');
let html = '<!doctype html><meta charset="utf-8"><style>body{margin:0;padding:12px;background:#777;font:11px -apple-system,sans-serif;color:#fff}.g{display:flex;flex-wrap:wrap;gap:18px}.b{background:#666;padding:6px;border-radius:8px}.b h4{margin:0 0 4px;font-size:12px}table{border-collapse:separate;border-spacing:2px}th{font-weight:600;padding:0 4px;text-align:right}td{padding:0;vertical-align:middle}td img{display:block;height:var(--h);width:auto}.sep{width:8px}</style><div class="g">';
names.forEach(n => {
  const wide = n.startsWith('bubble'), h = wide ? 34 : 56;
  html += '<div class="b" style="--h:' + h + 'px"><h4>' + (label[n] || n) + ' · шкала ' + T['T-' + n] + ' мс</h4><table><tr><th></th><th colspan="2">світла</th><th class="sep"></th><th colspan="2">темна</th></tr><tr><th></th><th>макет</th><th>застосунок</th><th class="sep"></th><th>макет</th><th>застосунок</th></tr>';
  for (let i = 0; i < S; i++) html += '<tr><th>' + (i * 10) + '%</th>' + ['light', 'dark'].map(th => '<td><img src="' + f(n, th, 'mock', i) + '"></td><td><img src="' + f(n, th, 'app', i) + '"></td>').join('<td class="sep"></td>') + '</tr>';
  html += '</table></div>';
});
html += '</div>';
const tmp = path.join(dir, '.compare.html'); fs.writeFileSync(tmp, html);
(async () => {
  const { webkit } = require(path.join(process.cwd(), 'node_modules/playwright-core'));
  const b = await webkit.launch(); const pg = await b.newPage({ viewport: { width: 1700, height: 900 } });
  await pg.goto('file://' + tmp); await pg.waitForTimeout(1500);
  await pg.screenshot({ path: path.join(dir, out), fullPage: true });
  await b.close(); fs.unlinkSync(tmp); console.log('зведений файл:', path.join(dir, out));
})();
