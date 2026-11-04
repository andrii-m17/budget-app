// SIM-3: npm run e2e:ios:full — повна матриця (iPhone і iPad, портрет і ландшафт, iPad із трекпадом); дві групи йдуть паралельно (свої Appium і WDA-порти).
// Запускати лише перед пушем змін клавіатури, у фоні. Результат: docs/ui/sim/<версія>/summary.md (обидві групи).
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import * as L from './lib.mjs';

const OUT = path.join(L.ROOT, 'docs', 'ui', 'sim', L.appVersion());
const t0 = Date.now();
fs.mkdirSync(OUT, { recursive: true });
await L.startServers(OUT); // спільний статичний сервер запускається один раз
const run = (group, only, appium, wda) => new Promise(res => {
  const p = spawn('node', [path.join(L.ROOT, 'e2e', 'ios', 'run.mjs')], { stdio: 'inherit', env: { ...process.env, SIM_FULL: '1', SIM_GROUP: group, SIM_ONLY: only, SIM_APPIUM_PORT: String(appium), SIM_WDA_PORT: String(wda) } });
  p.on('exit', code => res(code));
});
const codes = await Promise.all([
  run('iphone', 'iphone-portrait,iphone-landscape', 4723, 8100),
  run('ipad', 'ipad-portrait,ipad-landscape,ipad-trackpad-portrait', 4724, 8101),
]);
const parts = ['iphone', 'ipad'].map(g => { const f = path.join(OUT, 'summary-' + g + '.md'); return fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : ''; });
fs.writeFileSync(path.join(OUT, 'summary.md'), parts.join('\n\n'));
console.log('\nПовний прогін: ' + Math.round((Date.now() - t0) / 1000) + ' с (iPhone і iPad паралельно). Результат: ' + path.join(OUT, 'summary.md'));
L.killChildren();
process.exit(codes.some(c => c) ? 1 : 0);
