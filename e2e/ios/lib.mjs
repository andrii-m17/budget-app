// SIM-1: допоміжні функції автотестів клавіатури на симуляторі iOS (Appium + XCUITest + Safari). Лише інструменти, код застосунку не змінюється.
// Фокус ставиться справжнім дотиком (mobile: tap у NATIVE_APP), не програмно; екранна клавіатура ввімкнена (апаратна відключена).
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

export const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const APPIUM_PORT = Number(process.env.SIM_APPIUM_PORT || 4723);
export const SERVER_PORT = Number(process.env.SIM_PORT || 8937);

// Прийняті пороги (з документації рекордера; нових вимірювань не вигадуємо): анімація листа — ≥ 12 кадрів і пауза ≤ 34 мс; низ листа над клавіатурою — 8 пт (±2); таб-бар від низу ≥ 21 пт.
export const THRESHOLDS = { minFrames: 12, maxGapMs: 34, sheetGapPt: 8, sheetTolPt: 2, tabbarMinPt: 21 };

export function appVersion(){
  const m = /const APP_VERSION = '([\d.]+)'/.exec(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'));
  return m ? m[1] : 'unknown';
}

export function simDevices(){
  const j = JSON.parse(execFileSync('xcrun', ['simctl', 'list', 'devices', 'available', '-j'], { encoding: 'utf8' }));
  const out = [];
  Object.keys(j.devices).forEach(rt => j.devices[rt].forEach(d => out.push({ name: d.name, udid: d.udid, state: d.state, runtime: rt.replace(/.*SimRuntime\./, '') })));
  return out;
}
export function pickDevice(name){
  const d = simDevices().filter(x => x.name === name);
  if(!d.length) throw new Error('Симулятор «' + name + '» не знайдено (xcrun simctl list devices available).');
  return d.sort((a, b) => b.runtime.localeCompare(a.runtime))[0];
}
export function bootSim(dev){
  if(dev.state !== 'Booted') execFileSync('xcrun', ['simctl', 'boot', dev.udid], { stdio: 'ignore' });
  execFileSync('xcrun', ['simctl', 'bootstatus', dev.udid, '-b'], { stdio: 'ignore' });
}

const children = [];
export function killChildren(){ while(children.length){ try{ children.pop().kill('SIGTERM'); }catch(e){} } }
process.on('exit', killChildren);
process.on('SIGINT', () => { killChildren(); process.exit(130); });

function ping(url){
  return new Promise(res => { http.get(url, r => { r.resume(); res(r.statusCode < 500); }).on('error', () => res(false)); });
}
async function waitFor(url, ms){
  const t0 = Date.now();
  while(Date.now() - t0 < ms){ if(await ping(url)) return true; await new Promise(r => setTimeout(r, 300)); }
  return false;
}
export async function startServers(logDir){
  if(!(await ping('http://127.0.0.1:' + SERVER_PORT + '/index.html'))){
    const p = spawn('node', [path.join(ROOT, 'e2e', 'server.js')], { env: { ...process.env, E2E_PORT: String(SERVER_PORT) }, stdio: 'ignore' });
    children.push(p);
    if(!(await waitFor('http://127.0.0.1:' + SERVER_PORT + '/index.html', 10000))) throw new Error('Статичний сервер не запустився');
  }
  if(!(await ping('http://127.0.0.1:' + APPIUM_PORT + '/status'))){
    fs.mkdirSync(logDir, { recursive: true });
    const log = fs.openSync(path.join(logDir, 'appium.log'), 'w');
    const p = spawn(path.join(ROOT, 'node_modules', '.bin', 'appium'), ['--port', String(APPIUM_PORT)], { env: { ...process.env, APPIUM_HOME: path.join(ROOT, '.appium') }, stdio: ['ignore', log, log] });
    children.push(p);
    if(!(await waitFor('http://127.0.0.1:' + APPIUM_PORT + '/status', 30000))) throw new Error('Appium не запустився (див. appium.log)');
  }
}

export async function openSession(dev, orientation){
  const { remote } = await import('webdriverio');
  const d = await remote({ hostname: '127.0.0.1', port: APPIUM_PORT, logLevel: 'error', connectionRetryCount: 1, capabilities: {
    platformName: 'iOS', 'appium:automationName': 'XCUITest', 'appium:udid': dev.udid, browserName: 'Safari',
    'appium:connectHardwareKeyboard': false, 'appium:noReset': true, 'appium:newCommandTimeout': 300, 'appium:orientation': orientation, 'appium:wdaLaunchTimeout': 180000 } });
  return d;
}

export async function loadApp(d){
  await d.url('http://localhost:' + SERVER_PORT + '/index.html?fixture=typical');
  await d.waitUntil(() => d.execute(() => !!(window.MockCloud && typeof cloudSession !== 'undefined' && cloudSession && document.querySelector('.tabbar-glass'))), { timeout: 40000, timeoutMsg: 'Застосунок не завантажився' });
  await d.pause(1500);
}

// Відповідність CSS-пікселів і точок екрана: два прозорі зонди з доступними назвами (угорі й на 400 px нижче), їхні положення в NATIVE_APP дають масштаб k і зсув (ox, oy) саме зараз
// (зсув змінюється, коли Safari ховає/показує панелі або клавіатура зсуває вікно перегляду).
export async function mapNow(d){
  await d.execute(() => {
    [['simprobe1', 0], ['simprobe2', 400]].forEach(([id, top]) => {
      let p = document.getElementById(id);
      if(!p){ p = document.createElement('button'); p.id = id; p.setAttribute('aria-label', id); p.setAttribute('tabindex', '-1'); p.style.cssText = 'position:fixed;left:0;top:' + top + 'px;width:40px;height:40px;opacity:.02;z-index:2147483647;pointer-events:none;border:0;padding:0;background:#000'; document.documentElement.appendChild(p); }
    });
  });
  await d.pause(250);
  await d.switchContext('NATIVE_APP');
  let map = { ox: 0, oy: 0, k: 1, calibrated: false };
  try{
    const p1 = await d.$('-ios predicate string:label == "simprobe1"'), p2 = await d.$('-ios predicate string:label == "simprobe2"');
    if(await p1.isExisting() && await p2.isExisting()){
      const l1 = await p1.getLocation(), l2 = await p2.getLocation(), s1 = await p1.getSize();
      const k = (l2.y - l1.y) / 400;
      if(k > 0.3 && k < 3) map = { ox: l1.x, oy: l1.y, k: k, calibrated: true, kx: s1.width / 40 };
    }
  }catch(e){}
  const web = (await d.getContexts()).find(c => String(c).startsWith('WEBVIEW'));
  await d.switchContext(web);
  return map;
}

// Дотик по центру елемента (або у задану CSS-точку) справжнім дотиком у NATIVE_APP.
export async function tapSelector(d, selector, at){
  const r = await d.execute(sel => {
    const el = document.querySelector(sel); if(!el) return null;
    try{ el.scrollIntoView({ block: 'nearest' }); }catch(e){} // як у наявних E2E: поле має бути в межах листа
    const b = el.getBoundingClientRect();
    return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
  }, selector);
  if(!r) throw new Error('Елемента немає: ' + selector);
  if(at){ r.x = at.x != null ? at.x : r.x; r.y = at.y != null ? at.y : r.y; }
  const m = await mapNow(d);
  const x = Math.round(m.ox + r.x * m.k), y = Math.round(m.oy + r.y * m.k);
  await d.switchContext('NATIVE_APP');
  await d.execute('mobile: tap', { x, y });
  const web = (await d.getContexts()).find(c => String(c).startsWith('WEBVIEW'));
  await d.switchContext(web);
  return { x, y, k: m.k, ox: m.ox, oy: m.oy, calibrated: m.calibrated };
}
// Клавіатура з нативного дерева: чи показана і де її верх (точки екрана). Це те, що бачить користувач; visualViewport у вкладці Safari враховує й власну панель браузера.
export async function keyboardInfo(d){
  await d.switchContext('NATIVE_APP');
  let shown = false, top = null, height = null;
  try{ shown = !!(await d.execute('mobile: isKeyboardShown')); }catch(e){}
  if(shown){
    try{ const kb = await d.$('-ios class chain:**/XCUIElementTypeKeyboard'); if(await kb.isExisting()){ const l = await kb.getLocation(), s = await kb.getSize(); top = l.y; height = s.height; } }catch(e){}
  }
  const web = (await d.getContexts()).find(c => String(c).startsWith('WEBVIEW'));
  await d.switchContext(web);
  return { shown, top, height };
}
export async function keyboardShown(d){ return (await keyboardInfo(d)).shown; }

export async function recorderStart(d){ await d.execute(() => { if(!debugRecordingActive) startDebugRecording('sim-1'); window.__simIdx = debugEventBuffer.length; }); }
const EVT = ['kb-geometry', 'kb-env', 'sheet-open', 'sheet-close', 'sheet-anim', 'tabbar-restore', 'kb-frames', 'vv-resize', 'focus-mode', 'focus-transfer'];
export function eventsSince(d, mark){
  return d.execute((m, types) => debugEventBuffer.slice(m).filter(e => types.indexOf(e.type) !== -1), mark, EVT);
}
export function eventMark(d){ return d.execute(() => debugEventBuffer.length); }

export async function metrics(d, sheetSel){
  return d.execute(sel => {
    const vv = window.visualViewport, sh = document.querySelector(sel), tb = document.querySelector('nav.tabbar');
    const sr = sh ? sh.getBoundingClientRect() : null, tr = tb ? tb.getBoundingClientRect() : null;
    const a = document.activeElement;
    return { innerH: window.innerHeight, innerW: window.innerWidth, vvH: Math.round(vv.height), vvTop: Math.round(vv.offsetTop), vvBottom: Math.round(vv.offsetTop + vv.height),
      sheetBottom: sr ? Math.round(sr.bottom * 10) / 10 : null, sheetTop: sr ? Math.round(sr.top * 10) / 10 : null, tabbarGap: tr ? Math.round(window.innerHeight - tr.bottom) : null,
      tabbarVisible: tr ? (tr.bottom > 0 && tr.top < window.innerHeight && getComputedStyle(tb).visibility !== 'hidden') : null,
      kbOpenClass: document.body.classList.contains('kb-open'), active: a && a.id || (a && a.tagName) || null, drawerOpen: !!document.querySelector('.drawer.open') };
  }, sheetSel);
}

export async function shot(d, file){
  const png = file + '.png';
  fs.writeFileSync(png, Buffer.from(await d.takeScreenshot(), 'base64'));
  // зменшена копія JPEG для репозиторію (оригінал PNG не зберігаємо)
  const jpg = file + '.jpg';
  try{ execFileSync('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '45', '--resampleWidth', '390', png, '--out', jpg], { stdio: 'ignore' }); fs.unlinkSync(png); }catch(e){ return png; }
  return jpg;
}
