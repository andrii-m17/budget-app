// NOTIF-1 Rev 3 (Rev 2.32.96–2.32.98): журнал сповіщень як історія: виміри й скріншоти на синтетичних даних.
// Запуск: preview «після» на http://localhost:8934 (npx http-server -p 8934 -c-1); за бажанням «до» (інша копія) на :8935.
//   node scripts/notif-history-shots.mjs after [ширини через кому]   → docs/ui/notif3-after-<тема>-<ширина>.png
//   node scripts/notif-history-shots.mjs before [ширини]              → docs/ui/notif3-before-<тема>-<ширина>.png (порт 8935)
// Дані лише синтетичні. Перевіряє: жоден рядок не виходить за межі й не переноситься поза очікуване, горизонтальної прокрутки немає, свайп уліво відкриває кнопку «Видалити» 84 pt.
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
const MODE = process.argv[2] === 'before' ? 'before' : 'after';
const BASE = MODE === 'before' ? 'http://localhost:8935' : 'http://localhost:8934';
const WIDTHS = (process.argv[3] || '290,320,360,390,440').split(',').map(Number);
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--remote-debugging-port=9336', '--user-data-dir=' + (process.env.TMPDIR || '/tmp') + '/notif-shots-profile', '--no-first-run', 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let ws;
for(let i = 0; i < 50; i++){ try{ const tabs = await (await fetch('http://127.0.0.1:9336/json')).json(); ws = new WebSocket(tabs.find(t => t.type === 'page').webSocketDebuggerUrl); await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; }); break; }catch(e){ await sleep(200); } }
let id = 0; const pend = new Map();
ws.onmessage = m => { const d = JSON.parse(m.data); if(d.id && pend.has(d.id)){ pend.get(d.id)(d); pend.delete(d.id); } };
const send = (method, params = {}) => new Promise(res => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async expr => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); return r.result && r.result.result ? r.result.result.value : undefined; };
await send('Page.enable'); await send('Network.enable'); await send('Network.setCacheDisabled', { cacheDisabled: true });
mkdirSync('docs/ui', { recursive: true });

// Синтетичні сповіщення: Нове (Monobank, пачка не оброблена), Оброблено (одна додана), Оброблено (кілька доданих), Прочитано (Monobank, пачка ще не оброблена), нове нагадування, прочитане нагадування.
const SEED = `(()=>{
  const now = new Date();
  const at = (dBack, h, m, extra) => { const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dBack, h, m, 5, 123); return d.toISOString().replace('Z', '456+00:00').replace(/\\.(\\d{3})456\\+00:00$/, '.$1456+00:00'); };
  const t1 = at(0, 10, 42), t2 = at(1, 18, 39), t3 = at(3, 9, 0), t4 = at(5, 14, 20);
  const R = (id, type, title, body, created, readAt, data) => ({ id, type, title, body, data: Object.assign({ type }, data || {}), created_at: created, read_at: readAt });
  notifArchive.rows = [
    R('n1', 'mono-inbox', 'Monobank: 3 нові операції', 'Остання: Синтетичний магазин А · −245 ₴', t1, null),
    R('n2', 'mono-inbox', 'Monobank', 'Синтетичний магазин Б · −120 ₴ · Продукти', t2, '2026-01-01T00:00:00Z'),
    R('n3', 'mono-inbox', 'Monobank: 2 нові операції', 'Остання: Дуже довга синтетична назва магазину для перевірки переносу тексту · −1 234 567 ₴', t3, null),
    R('n4', 'mono-inbox', 'Monobank', 'Синтетичний магазин В · −80 ₴', t4, '2026-01-01T00:00:00Z'),
    R('n5', 'installment-deadline', 'Розстрочка А: платіж завтра', 'Сума 3 200 ₴', t1, null),
    R('n6', 'backup-reminder', 'Резервна копія', 'Час зберегти резервну копію', t3, '2026-01-01T00:00:00Z'),
  ];
  const B = (t, rows) => rows.map(r => Object.assign({ notified_at: t }, r));
  notifArchive.batches = groupInboxBatches([].concat(
    B(t1, [{ status: 'added', expense_id: 'x1' }, { status: 'new' }, { status: 'new' }]),
    B(t2, [{ status: 'added', expense_id: 'x2' }]),
    B(t3, [{ status: 'added', expense_id: 'x3' }, { status: 'ignored' }]),
    B(t4, [{ status: 'new' }]) ));
  notifArchive.batchesOk = true; notifArchive.unread = 3; notifArchive.loaded = true; notifArchive.offline = false;
  renderNotifArchive(); return 1; })()`;
const SEED_BEFORE = SEED.replace("notifArchive.batches = groupInboxBatches([].concat(", "void ([].concat(").replace("notifArchive.batchesOk = true;", "");
// < 360: дії другим рядком (рамки торкаються через margin-top:-6px, текст не перекривається), тому ov(title, дії) там не рахується
const MEASURE = `(()=>{
  const body = document.getElementById('notif-archive-body');
  const rows = [...body.querySelectorAll('.notif-row')];
  const over = rows.filter(r => r.scrollWidth > r.clientWidth + 1).length;
  const main = [...body.querySelectorAll('.notif-row-main')].filter(m => m.scrollWidth > m.clientWidth + 1).length;
  const hscroll = document.documentElement.scrollWidth > document.documentElement.clientWidth + 1;
  const r = el => el.getBoundingClientRect();
  const top = document.querySelector('.notif-top');
  let hdr = null;
  if(top){
    const rg = document.createRange(); rg.selectNodeContents(top.querySelector('.notif-title')); const ti = rg.getBoundingClientRect();
    const bk = r(top.querySelector('.notif-back svg')), ac = r(top.querySelector('.notif-archive-top-action'));
    const btns = [...top.querySelectorAll('.notif-archive-top-action button')].map(b => { const g = document.createRange(); g.selectNodeContents(b); return g.getBoundingClientRect(); });
    const ov = (a, b) => a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;
    hdr = { overlap: btns.some(b => ov(ti, b) || ov(bk, b)) || ov(bk, ti), actionsBelow: btns.every(b => b.top >= ti.bottom - 1), actionsRight: Math.round(r(top).right - ac.right), outside: ac.right > window.innerWidth + 0.5 || ac.left < -0.5, h: Math.round(r(top).height) };
  }
  const pills = [...body.querySelectorAll('.notif-pill')].map(p => p.textContent);
  return JSON.stringify({ hdr, pills, rows: rows.length, over, main, hscroll, heights: rows.map(r => Math.round(r.getBoundingClientRect().height)), states: rows.map(r => (r.className.match(/notif-state-(\\w+)/)||[])[1]||'-') });
})()`;
let bad = 0;
for(const w of WIDTHS) for(const theme of ['dark', 'light']){
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: 900, deviceScaleFactor: 2, mobile: true });
  await send('Emulation.setTouchEmulationEnabled', { enabled: true });
  await send('Page.navigate', { url: BASE + '/?fixture=typical' }); await sleep(4500);
  await ev(`document.documentElement.setAttribute('data-theme','${theme}')`);
  await ev(`performSwitchTab('service'); 1`);
  await ev(`openNotifArchive(); 1`); await sleep(1200);
  await ev(MODE === 'before' ? SEED_BEFORE : SEED); await sleep(300);
  const m = JSON.parse(await ev(MEASURE));
  console.log(MODE, w, theme, JSON.stringify(m));
  if(MODE === 'after' && (m.over || m.main || m.hscroll || (m.hdr && (m.hdr.overlap || m.hdr.outside || (w < 360 && !m.hdr.actionsBelow) || (w >= 360 && m.hdr.actionsBelow))))){ bad++; console.log('ПРОБЛЕМА', w, theme); }
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`docs/ui/notif3-${MODE}-${theme}-${w}.png`, Buffer.from(shot.result.data, 'base64'));
  if(MODE === 'after'){
    // реальний жест: свайп уліво по першому рядку
    const box = JSON.parse(await ev(`(()=>{const r=document.querySelector('.notif-swipe .notif-row').getBoundingClientRect();return JSON.stringify({x:r.left+r.width*0.8,y:r.top+r.height/2});})()`));
    const t = (type, x) => send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y: box.y }] });
    await t('touchStart', box.x); for(let k = 1; k <= 8; k++){ await t('touchMove', box.x - k * 14); await sleep(20); } await t('touchEnd', 0); await sleep(400);
    const sw = JSON.parse(await ev(`(()=>{const w=document.querySelector('.notif-swipe.swipe-open');const b=w&&w.querySelector('.swipe-delete-btn');return JSON.stringify({open:!!w,btnW:b?Math.round(b.getBoundingClientRect().width):0,btnH:b?Math.round(b.getBoundingClientRect().height):0});})()`));
    console.log('  свайп', JSON.stringify(sw));
    if(!sw.open || sw.btnW !== 84){ bad++; console.log('ПРОБЛЕМА свайп', w, theme); }
    const shot2 = await send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(`docs/ui/notif3-after-swipe-${theme}-${w}.png`, Buffer.from(shot2.result.data, 'base64'));
  }
}
console.log(bad ? 'ПРОБЛЕМ: ' + bad : 'ок');
ws.close(); chrome.kill(); process.exit(bad ? 1 : 0);
