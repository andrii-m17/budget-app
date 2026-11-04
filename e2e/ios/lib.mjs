// SIM-2: допоміжні функції автотестів клавіатури й форм на симуляторі iOS у режимі PWA (веб-застосунок із головного екрана).
// Appium + XCUITest: сесія на SpringBoard, застосунок запускається дотиком по іконці «Money Tree Sim» (веб-кліп з адресою http://localhost:<порт>), далі вебвʼю PWA як звичайний контекст.
// Лише локальний сервер з імітацією хмари; іконки веб-кліпів із GitHub Pages не запускаються ніколи (перевіряється адреса в сторінці).
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

export const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const APPIUM_PORT = Number(process.env.SIM_APPIUM_PORT || 4723);
export const SERVER_PORT = Number(process.env.SIM_PORT || 8937);
export const ORIGIN = 'http://localhost:' + SERVER_PORT;
export const CLIP_TITLE = 'Money Tree Sim';

// Інваріанти дизайну (позиція, не час): низ листа на 8 пт (±2) над краєм видимої області. Часові метрики (кадри, паузи, тривалість) порівнюються з еталоном симулятора (baseline.json), а не з порогами телефону.
export const DESIGN = { sheetGapPt: 8, sheetTolPt: 2, tabbarMinPt: 21, kbMinShrinkPt: 100 };
// Допуски відносно еталона (симулятор шумить; ловимо погіршення, а не дрібні відхилення).
export const REL = { framesMinRatio: 0.75, gapRatio: 1.5, gapAbsMs: 12, durationRatio: 1.5, durationAbsMs: 60, posTolPt: 2 };

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

// Веб-кліпи симулятора: шукаємо кліп з адресою нашого локального сервера і даємо йому окрему назву, щоб іконку можна було відрізнити від кліпу GitHub Pages (обидва зазвичай називаються «Money Tree»).
// Повертає { clip, others: кількість кліпів з іншими адресами (наприклад GitHub Pages), renamed }. Бракує кліпа — помилка з інструкцією для власника.
export function ensureSimClip(dev){
  const dir = path.join(os.homedir(), 'Library', 'Developer', 'CoreSimulator', 'Devices', dev.udid, 'data', 'Library', 'WebClips');
  const clips = fs.existsSync(dir) ? fs.readdirSync(dir).filter(n => n.endsWith('.webclip')) : [];
  let mine = null, others = 0, renamed = false;
  clips.forEach(n => {
    const plist = path.join(dir, n, 'Info.plist');
    let info; try{ info = JSON.parse(execFileSync('plutil', ['-convert', 'json', '-o', '-', plist], { encoding: 'utf8' })); }catch(e){ return; }
    if(String(info.URL || '').indexOf(ORIGIN + '/') === 0){
      mine = n;
      if(info.Title !== CLIP_TITLE){ execFileSync('plutil', ['-replace', 'Title', '-string', CLIP_TITLE, plist]); renamed = true; }
    }else others++;
  });
  if(!mine) throw new Error('На симуляторі «' + dev.name + '» немає PWA з адресою ' + ORIGIN + '. Перевстановіть: відкрийте цю адресу в Safari симулятора і виберіть «Поділитися → На початковий екран».');
  if(renamed){ try{ execFileSync('xcrun', ['simctl', 'spawn', dev.udid, 'launchctl', 'kickstart', '-k', 'system/com.apple.SpringBoard'], { stdio: 'ignore' }); }catch(e){} }
  return { clip: mine, others: others, renamed: renamed };
}

const children = [];
export function killChildren(){ while(children.length){ try{ children.pop().kill('SIGTERM'); }catch(e){} } }
process.on('exit', killChildren);
process.on('SIGINT', () => { killChildren(); process.exit(130); });
function ping(url){ return new Promise(res => { http.get(url, r => { r.resume(); res(r.statusCode < 500); }).on('error', () => res(false)); }); }
async function waitFor(url, ms){ const t0 = Date.now(); while(Date.now() - t0 < ms){ if(await ping(url)) return true; await new Promise(r => setTimeout(r, 300)); } return false; }
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

// Сесія на SpringBoard: з неї доступні іконки головного екрана, знімки екрана й дотики; PWA після запуску з'являється як контекст WEBVIEW_*.
export async function openSession(dev, orientation){
  const { remote } = await import('webdriverio');
  return remote({ hostname: '127.0.0.1', port: APPIUM_PORT, logLevel: 'error', connectionRetryCount: 1, capabilities: {
    platformName: 'iOS', 'appium:automationName': 'XCUITest', 'appium:udid': dev.udid, 'appium:bundleId': 'com.apple.springboard',
    'appium:connectHardwareKeyboard': false, 'appium:noReset': true, 'appium:newCommandTimeout': 400, 'appium:orientation': orientation, 'appium:wdaLaunchTimeout': 180000 } });
}
const webCtx = async d => { for(let i = 0; i < 24; i++){ const w = (await d.getContexts()).find(c => String(c).startsWith('WEBVIEW')); if(w) return w; await d.pause(500); } throw new Error('Вебвʼю PWA не з\'явилось'); };
export async function toWeb(d){ await d.switchContext(await webCtx(d)); }
export async function toNative(d){ await d.switchContext('NATIVE_APP'); }

// Запуск PWA тапом по іконці (гортаємо домашні екрани), перевірка адреси: лише локальний сервер.
export async function launchPwa(d){
  await toNative(d);
  try{ await d.execute('mobile: terminateApp', { bundleId: 'com.apple.webapp' }); }catch(e){}
  await d.execute('mobile: pressButton', { name: 'home' }); await d.pause(1200);
  let ic = null;
  for(let i = 0; i < 8 && !ic; i++){ // на iPad іконка може бути й у док-панелі: беремо першу видиму
    for(const e of await d.$$('-ios predicate string:name == "' + CLIP_TITLE + '" AND type == "XCUIElementTypeIcon"')){ if(await e.isDisplayed()){ ic = e; break; } }
    if(!ic){ await d.execute('mobile: swipe', { direction: i < 5 ? 'left' : 'right' }); await d.pause(700); }
  }
  if(!ic) throw new Error('Іконки «' + CLIP_TITLE + '» не видно на домашніх екранах');
  await ic.click(); await d.pause(5000);
  await toWeb(d);
  const href = await d.execute(() => location.href);
  if(href.indexOf(ORIGIN + '/') !== 0) throw new Error('ЗУПИНКА: PWA відкрила не локальний сервер: ' + href);
  return href;
}
export async function loadApp(d){
  await toWeb(d);
  await d.execute(u => { location.replace(u); }, ORIGIN + '/index.html?fixture=typical');
  await d.pause(2500);
  await toWeb(d);
  await d.waitUntil(() => d.execute(() => !!(window.MockCloud && typeof cloudSession !== 'undefined' && cloudSession && document.querySelector('.tabbar-glass'))), { timeout: 40000, timeoutMsg: 'Застосунок не завантажився' });
  await d.pause(1200);
  const href = await d.execute(() => location.href);
  if(href.indexOf(ORIGIN + '/') !== 0) throw new Error('ЗУПИНКА: адреса не локальна: ' + href);
}

// Прив'язка CSS-координат до точок екрана: прозорий шар ловить два реальні дотики у відомих точках екрана; з їхніх clientX/clientY рахуємо масштаб і зсув. Робиться один раз на завантаження (клавіатура закрита).
export async function calibrate(d){
  await toWeb(d);
  await d.execute(() => { const o = document.createElement('div'); o.id = 'simcal'; o.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:transparent'; window.__cal = []; o.addEventListener('pointerdown', e => { window.__cal.push([e.clientX, e.clientY]); }); document.documentElement.appendChild(o); });
  await toNative(d);
  const win = await d.getWindowSize();
  const pts = [[Math.round(win.width * 0.2), Math.round(win.height * 0.2)], [Math.round(win.width * 0.75), Math.round(win.height * 0.6)]];
  for(const p of pts){ await d.execute('mobile: tap', { x: p[0], y: p[1] }); await d.pause(250); }
  await toWeb(d);
  const cal = await d.execute(() => { const c = window.__cal || []; const o = document.getElementById('simcal'); if(o) o.remove(); return c; });
  if(cal.length < 2 || cal[1][1] === cal[0][1] || cal[1][0] === cal[0][0]) return { ok: false, kx: 1, ky: 1, ox: 0, oy: 0, win: win, cal: cal };
  const kx = (pts[1][0] - pts[0][0]) / (cal[1][0] - cal[0][0]), ky = (pts[1][1] - pts[0][1]) / (cal[1][1] - cal[0][1]);
  return { ok: true, kx: kx, ky: ky, ox: pts[0][0] - cal[0][0] * kx, oy: pts[0][1] - cal[0][1] * ky, win: win };
}

// Дотик по центру елемента (або у задану CSS-точку) справжнім дотиком у NATIVE_APP.
export async function tapSelector(d, map, selector, at){
  await toWeb(d);
  const r = await d.execute(sel => {
    const el = document.querySelector(sel); if(!el) return null;
    try{ el.scrollIntoView({ block: 'nearest' }); }catch(e){}
    const b = el.getBoundingClientRect();
    return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
  }, selector);
  if(!r) throw new Error('Елемента немає: ' + selector);
  if(at){ r.x = at.x != null ? at.x : r.x; r.y = at.y != null ? at.y : r.y; }
  const x = Math.round(map.ox + r.x * map.kx), y = Math.round(map.oy + r.y * map.ky);
  await toNative(d);
  await d.execute('mobile: tap', { x, y });
  await toWeb(d);
  return { x, y };
}

export async function recorderStart(d){ await toWeb(d); await d.execute(() => { if(!debugRecordingActive) startDebugRecording('sim-2'); }); }
const EVT = ['kb-geometry', 'sheet-open', 'sheet-close', 'sheet-anim', 'tabbar-restore', 'kb-frames', 'vv-resize', 'focus-mode', 'focus-transfer'];
export const eventMark = async d => { await toWeb(d); return d.execute(() => debugEventBuffer.length); };
export const eventsSince = async (d, mark) => { await toWeb(d); return d.execute((m, types) => debugEventBuffer.slice(m).filter(e => types.indexOf(e.type) !== -1), mark, EVT); };

export async function metrics(d, sheetSel, fieldSel){
  await toWeb(d);
  return d.execute((sel, fsel) => {
    const vv = window.visualViewport, sh = document.querySelector(sel), tb = document.querySelector('nav.tabbar'), fl = fsel ? document.querySelector(fsel) : null, fr = fl ? fl.getBoundingClientRect() : null;
    const sr = sh ? sh.getBoundingClientRect() : null, tr = tb ? tb.getBoundingClientRect() : null;
    const a = document.activeElement;
    return { innerH: window.innerHeight, innerW: window.innerWidth, vvH: Math.round(vv.height), vvTop: Math.round(vv.offsetTop), vvBottom: Math.round(vv.offsetTop + vv.height),
      fieldBottom: fr ? Math.round(fr.bottom * 10) / 10 : null, fieldTop: fr ? Math.round(fr.top * 10) / 10 : null,
      sheetBottom: sr ? Math.round(sr.bottom * 10) / 10 : null, sheetTop: sr ? Math.round(sr.top * 10) / 10 : null, sheetH: sr ? Math.round(sr.height) : null,
      tabbarGap: tr ? Math.round(window.innerHeight - tr.bottom) : null, tabbarVisible: tr ? (tr.bottom > 0 && tr.top < window.innerHeight && getComputedStyle(tb).visibility !== 'hidden') : null,
      kbOpenClass: document.body.classList.contains('kb-open'), active: a && a.id || (a && a.tagName) || null, drawerOpen: !!document.querySelector('.drawer.open') };
  }, sheetSel, fieldSel);
}

// Верх екранної клавіатури (точки екрана) з нативного дерева SpringBoard; null, якщо клавіатури нема.
export async function keyboardTopNative(d){
  await toNative(d);
  let top = null;
  try{ const k = await d.$('-ios predicate string:name CONTAINS "UIKeyboardLayoutStar"'); if(await k.isExisting()){ top = (await k.getLocation()).y; } }catch(e){}
  await toWeb(d);
  return top;
}
// Дотик у точку екрана (для стрілок панелі над клавіатурою, яких нема в DOM).
export async function tapScreen(d, x, y){ await toNative(d); await d.execute('mobile: tap', { x: Math.round(x), y: Math.round(y) }); await toWeb(d); }

export async function shot(d, file){
  await toNative(d);
  const png = file + '.png';
  fs.writeFileSync(png, Buffer.from(await d.takeScreenshot(), 'base64'));
  await toWeb(d);
  const jpg = file + '.jpg';
  try{ execFileSync('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '45', '--resampleWidth', '390', png, '--out', jpg], { stdio: 'ignore' }); fs.unlinkSync(png); }catch(e){ return png; }
  return jpg;
}

export const median = a => { const s = a.filter(v => v != null && !isNaN(v)).sort((x, y) => x - y); if(!s.length) return null; const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : Math.round(((s[m - 1] + s[m]) / 2) * 10) / 10; };
