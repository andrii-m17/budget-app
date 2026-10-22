// Rev 2.32.107 (TAP-1): виміри цілей дотику й піксельне порівняння скріншотів «до/після» на ключових екранах.
// Запуск: preview на :8934 (npx http-server -p 8934 -c-1).
//   node scripts/tap-targets.mjs scan            → перелік інтерактивних елементів < 44 pt (з урахуванням ::before/::after не вимірюється: реальна зона перевіряється hit-тестом)
//   node scripts/tap-targets.mjs shots <тека>    → скріншоти Аналітика/Витрати/Облік/Структура/Сервіс, темна й світла, ширина 390, на зафіксованій даті
//   node scripts/tap-targets.mjs diff <тека1> <тека2> → кількість відмінних пікселів
// Дані лише синтетичні (мок typical).
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
const MODE = process.argv[2];
const BASE = process.env.BASE || 'http://localhost:8934'; // BASE=http://localhost:8935 для «до» (копія попередньої ревізії)
const TABS = ['analytics', 'vytraty', 'accounting', 'structure', 'service'];
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function open(){
  const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--remote-debugging-port=9339', '--user-data-dir=' + (process.env.TMPDIR || '/tmp') + '/tap-prof-' + process.pid, '--no-first-run', 'about:blank'], { stdio: 'ignore' });
  let ws;
  for(let i = 0; i < 50; i++){ try{ const t = await (await fetch('http://127.0.0.1:9339/json')).json(); ws = new WebSocket(t.find(x => x.type === 'page').webSocketDebuggerUrl); await new Promise((a, b) => { ws.onopen = a; ws.onerror = b; }); break; }catch(e){ await sleep(200); } }
  let id = 0; const pend = new Map();
  ws.onmessage = m => { const d = JSON.parse(m.data); if(d.id && pend.has(d.id)){ pend.get(d.id)(d); pend.delete(d.id); } };
  const send = (method, params = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async e => { const r = await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true }); return r.result && r.result.result ? r.result.result.value : undefined; };
  await send('Page.enable'); await send('Network.enable'); await send('Network.setCacheDisabled', { cacheDisabled: true });
  const FIXED = Date.UTC(2026, 9, 16, 9, 0, 0);
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `(()=>{const R=Date,off=${FIXED}-R.now();class D extends R{constructor(...a){if(a.length===0)super(R.now()+off);else super(...a);}static now(){return R.now()+off;}}window.Date=D;})();` });
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await send('Emulation.setTouchEmulationEnabled', { enabled: true });
  return { send, ev, close(){ try{ ws.close(); }catch(e){} chrome.kill(); } };
}
const SCAN = `(()=>{
  const out = [];
  const sel = 'button, a[href], [role=button], input:not([type=hidden]), select, textarea, [onclick], summary';
  document.querySelectorAll(sel).forEach(el => {
    const cs = getComputedStyle(el); if(cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) return;
    const r = el.getBoundingClientRect(); if(!r.width || !r.height) return;
    if(r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) return;
    if(el.closest('[inert], .hidden, [hidden]')) return;
    // реальна зона: hit-тест за точками на 22 pt від центру в кожному з 4 напрямків
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const hit = (x, y) => { const t = document.elementFromPoint(x, y); return t && (t === el || el.contains(t)); };
    let w = 0, h = 0;
    for(let dx = 0; dx <= 30; dx++){ if(hit(cx - dx, cy) || hit(cx + dx, cy)) w = dx; else break; }
    for(let dy = 0; dy <= 30; dy++){ if(hit(cx, cy - dy) || hit(cx, cy + dy)) h = dy; else break; }
    const ew = Math.max(r.width, 2 * (w + 1)), eh = Math.max(r.height, 2 * (h + 1));
    if(ew < 43.5 || eh < 43.5) out.push({ tag: el.tagName.toLowerCase(), id: el.id || '', cls: (el.className && el.className.baseVal === undefined ? el.className : '').toString().slice(0, 60), w: Math.round(r.width), h: Math.round(r.height), eff: [Math.round(ew), Math.round(eh)], x: Math.round(r.left), y: Math.round(r.top), txt: (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 20) });
  });
  return JSON.stringify(out);
})()`;
async function loadTab(c, tab, theme){
  await c.send('Page.navigate', { url: BASE + '/?fixture=typical' }); await sleep(4200);
  await c.ev(`document.documentElement.setAttribute('data-theme','${theme}'); performSwitchTab('${tab}'); (function(){ var s = document.createElement('style'); s.textContent = '#update-banner{display:none !important}'; document.head.appendChild(s); })(); 1`); await sleep(900); // плашка «Доступне оновлення» з'являється нестабільно (залежить від SW): ховаємо для порівняння
}
// Додаткові стани (оверлеї й шторки), які теж скануються у режимі scan: [вкладка, вираз]
const STATES = [['vytraty', 'openJournal(monthKey(localDateISO(new Date())))'], ['service', 'openSettings()'], ['service', 'openNotifArchive()'], ['service', 'openTestingDrawer()'], ['service', 'openPaymentsScreen()'], ['service', 'openTrashScreen()'], ['service', 'openProfileMenu()'], ['service', 'openDebugRecordDrawer()'], ['structure', 'openAddCategoryModal()'], ['structure', 'openAddDictionaryModal()'], ['accounting', 'openAddBankModal()'], ['accounting', 'openAddInstallmentModal()'], ['analytics', "document.querySelector('.data-status-dot') && document.querySelector('.data-status-dot').click()"], ['structure', "document.querySelector('.struct-row') && document.querySelector('.struct-row').click()"]];
if(MODE === 'scan'){
  const c = await open();
  const seen = new Map();
  const runs = TABS.map(t => [t, null]).concat(STATES);
  for(const [tab, expr] of runs){
    await loadTab(c, tab, 'dark');
    if(expr){ await c.ev(`try{ ${expr}; }catch(e){} 1`); await sleep(1100); }
    const list = JSON.parse(await c.ev(SCAN));
    for(const x of list){ const k = x.tag + '|' + x.id + '|' + x.cls + '|' + x.w + 'x' + x.h; if(!seen.has(k)) seen.set(k, Object.assign({ tabs: [] }, x)); seen.get(k).tabs.push(tab); }
  }
  for(const x of seen.values()) console.log(`${x.tabs.join(',')}\t${x.tag}${x.id ? '#' + x.id : ''}.${x.cls.split(' ').join('.')}\t${x.w}x${x.h}\teff ${x.eff.join('x')}\t«${x.txt}»`);
  console.log('Усього:', seen.size);
  c.close(); process.exit(0);
}
if(MODE === 'shots'){
  const dir = process.argv[3]; mkdirSync(dir, { recursive: true });
  const c = await open();
  for(const theme of ['dark', 'light']) for(const tab of TABS){
    if(process.env.ONLY && process.env.ONLY !== tab + ':' + theme) continue; // ONLY=analytics:dark
    await loadTab(c, tab, theme);
    await c.ev(`document.querySelectorAll('.toast, .success-toast').forEach(e => e.remove()); 1`); await sleep(300);
    const shot = await c.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(`${dir}/${tab}-${theme}.png`, Buffer.from(shot.result.data, 'base64'));
  }
  if(!process.env.ONLY) for(const theme of ['dark', 'light']){ // шторка «Сповіщення»
    await loadTab(c, 'service', theme); await c.ev(`openNotificationsDrawer(); 1`); await sleep(1500);
    const shot = await c.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(`${dir}/notifications-${theme}.png`, Buffer.from(shot.result.data, 'base64'));
  }
  c.close(); process.exit(0);
}
if(MODE === 'fields'){ // поля вводу з шрифтом < 16 px або висотою < 44 pt у видимих станах
  const c = await open(); const seen = new Map();
  const runs = TABS.map(t => [t, null]).concat(STATES).concat([['vytraty', "openJournal(monthKey(localDateISO(new Date()))); setTimeout(()=>{const b=document.querySelector('#journal-overlay [data-rec-id]'); if(b) b.click();},400)"]]);
  for(const [tab, expr] of runs){
    await loadTab(c, tab, 'dark');
    if(expr){ await c.ev(`try{ ${expr}; }catch(e){} 1`); await sleep(1500); }
    const list = JSON.parse(await c.ev(`(()=>{const out=[];document.querySelectorAll('input:not([type=hidden]):not([type=checkbox]):not([type=file]), select, textarea').forEach(el=>{const cs=getComputedStyle(el);if(cs.display==='none'||cs.visibility==='hidden')return;const r=el.getBoundingClientRect();if(!r.width||!r.height)return;if(el.closest('[inert], .hidden'))return;const fs=parseFloat(cs.fontSize);if(fs<16||r.height<43.5)out.push({tag:el.tagName.toLowerCase(),id:(el.id||'').replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/g,'…'),cls:String(el.className||'').slice(0,40),type:el.type||'',fs:fs,w:Math.round(r.width),h:Math.round(r.height*10)/10});});return JSON.stringify(out);})()`));
    for(const x of list){ const k = x.tag + '|' + x.id + '|' + x.cls + '|' + x.fs + '|' + x.h; if(!seen.has(k)) seen.set(k, Object.assign({ tabs: [] }, x)); seen.get(k).tabs.push(tab); }
  }
  for(const x of seen.values()) console.log(`${x.tag}[${x.type}]#${x.id}.${x.cls}\tfont ${x.fs}\t${x.w}x${x.h}\t${[...new Set(x.tabs)].join(',')}`);
  c.close(); process.exit(0);
}
if(MODE === 'fshots'){ // скріншоти полів (Журнал: пошук/фільтри, редагування запису) на 320/390/440, обидві теми + перевірка переповнення
  const dir = process.argv[3]; mkdirSync(dir, { recursive: true });
  const c = await open(); let bad = 0;
  for(const w of [320, 390, 440]) for(const theme of ['dark', 'light']) for(const st of ['journal', 'edit']){
    await c.send('Emulation.setDeviceMetricsOverride', { width: w, height: 844, deviceScaleFactor: 2, mobile: true });
    await loadTab(c, 'vytraty', theme);
    await c.ev(`openJournal(monthKey(localDateISO(new Date()))); 1`); await sleep(1200);
    if(st === 'edit'){ await c.ev(`(()=>{const b=document.querySelector('#journal-overlay .swipe-edit-btn'); if(b) b.click(); return 1;})()`); await sleep(1000); await c.ev(`(()=>{const p=document.querySelector('.record-edit-panel'); if(p) p.scrollIntoView({block:'center'}); return 1;})()`); await sleep(500); }
    const m = JSON.parse(await c.ev(`(()=>{const root=document.getElementById('journal-overlay')||document.body;const over=[...root.querySelectorAll('input,select,textarea,button,.field,.journal-search-row,.record-edit-panel')].filter(e=>e.getBoundingClientRect().width&&e.scrollWidth>e.clientWidth+1&&e.tagName!=='SELECT'&&e.tagName!=='INPUT').map(e=>e.className||e.tagName).slice(0,5);const f=[...root.querySelectorAll('input:not([type=hidden]),select')].filter(e=>e.getBoundingClientRect().width).map(e=>({id:(e.id||'').slice(0,18),fs:parseFloat(getComputedStyle(e).fontSize),h:Math.round(e.getBoundingClientRect().height),r:Math.round(e.getBoundingClientRect().right)}));return JSON.stringify({hscroll:document.documentElement.scrollWidth>document.documentElement.clientWidth+1,over,edit:!!document.querySelector('.record-edit-panel'),f,vw:innerWidth});})()`));
    console.log(w, theme, st, 'hscroll', m.hscroll, 'overflow', m.over.join('|') || '-', 'поля(font/h):', m.f.map(x => x.id + ':' + x.fs + '/' + x.h + (x.r > m.vw ? '!' : '')).join(' '));
    if(m.hscroll || m.over.length || m.f.some(x => x.r > m.vw)) bad++;
    const shot = await c.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(`${dir}/${st}-${theme}-${w}.png`, Buffer.from(shot.result.data, 'base64'));
  }
  console.log(bad ? 'ПРОБЛЕМ: ' + bad : 'ок'); c.close(); process.exit(bad ? 1 : 0);
}
if(MODE === 'dump'){ // computed-стилі пілюлі місяця (темна тема) → файл JSON: для пошуку причини піксельних відмінностей
  const c = await open(); await loadTab(c, 'analytics', 'dark');
  const out = await c.ev(`(()=>{const dump=e=>{const c=getComputedStyle(e);const o={};for(const k of c)o[k]=c.getPropertyValue(k);return o};const p=document.querySelector('.month-pill');const r=e=>{const b=e.getBoundingClientRect();return [b.left,b.top,b.width,b.height]};return JSON.stringify({pill:dump(p),svg:dump(p.querySelector('svg')),sel:dump(p.querySelector('select')),rects:{pill:r(p),svg:r(p.querySelector('svg')),sel:r(p.querySelector('select'))}});})()`);
  writeFileSync(process.argv[3], out); c.close(); process.exit(0);
}
if(MODE === 'diff'){
  const [a, b] = [process.argv[3], process.argv[4]];
  const c = await open(); await c.send('Page.navigate', { url: BASE + '/?fixture=empty' }); await sleep(1500);
  let bad = 0;
  for(const f of readdirSync(a).filter(x => x.endsWith('.png'))){
    const A = readFileSync(`${a}/${f}`).toString('base64'), B = readFileSync(`${b}/${f}`).toString('base64');
    const r = await c.ev(`(async()=>{const load=u=>new Promise(r=>{const i=new Image();i.onload=()=>r(i);i.src=u;});const x=await load('data:image/png;base64,${A}'),y=await load('data:image/png;base64,${B}');const w=Math.min(x.width,y.width),h=Math.min(x.height,y.height);const g=i=>{const c=document.createElement('canvas');c.width=w;c.height=h;const q=c.getContext('2d');q.drawImage(i,0,0);return q.getImageData(0,0,w,h).data;};const pa=g(x),pb=g(y);let d=0,x0=1e9,x1=-1,y0=1e9,y1=-1;for(let k=0;k<pa.length;k+=4){if(Math.abs(pa[k]-pb[k])+Math.abs(pa[k+1]-pb[k+1])+Math.abs(pa[k+2]-pb[k+2])>24){d++;const p=k/4,X=p%w,Y=Math.floor(p/w);if(X<x0)x0=X;if(X>x1)x1=X;if(Y<y0)y0=Y;if(Y>y1)y1=Y;}}return d?d+' у ділянці x '+x0+'–'+x1+', y '+y0+'–'+y1+' (px при ×2)':0;})()`);
    console.log(f, 'відмінних пікселів:', r); if(r) bad++;
  }
  console.log(bad ? 'ВІДМІННОСТІ: ' + bad : 'ок: 0 відмінних пікселів');
  c.close(); process.exit(bad ? 1 : 0);
}
console.log('режими: scan | shots <тека> | diff <тека1> <тека2>'); process.exit(1);
