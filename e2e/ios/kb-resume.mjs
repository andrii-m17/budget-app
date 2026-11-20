// KB-RESUME (Крок 0): після повернення з іншого застосунку перший дотик по полю шторки не відкриває клавіатуру. Реальні дотики на симуляторі (Appium + XCUITest, мок хмари).
// Сценарій: шторка картки боргу, фокус у полі (клавіатура), «додому», повернення, дотик по полю; записуємо document.hasFocus() на touchstart/touchend, чи перехоплено (defaultPrevented), чи з'явилась клавіатура.
// Запуск: SIM_VARIANT=base|skip node e2e/ios/kb-resume.mjs --trials 10   (skip — лише у worktree з прапорцем window.__kbResumeSkip у touchstart-обробнику)
import fs from 'node:fs';
import path from 'node:path';
import * as L from './lib.mjs';
const argv = process.argv.slice(2);
const TRIALS = Number(argv.indexOf('--trials') !== -1 ? argv[argv.indexOf('--trials') + 1] : 10);
const VARIANT = process.env.SIM_VARIANT || 'base';
const OUT = path.join(process.env.SIM_OUT || '/tmp/kr', VARIANT);
fs.mkdirSync(OUT, { recursive: true });
const pause = ms => new Promise(r => setTimeout(r, ms));
const FIELD = '#cdd-balance';

async function resume(d, awayMs){
  const how = process.env.SIM_RETURN || 'activate';
  await L.toNative(d);
  await d.execute('mobile: pressButton', { name: 'home' });
  await pause(awayMs);
  if (how === 'icon') { // повернення дотиком по іконці веб-кліпа (без terminateApp)
    let ic = null;
    for (let i = 0; i < 8 && !ic; i++) {
      for (const e of await d.$$('-ios predicate string:name == "' + L.CLIP_TITLE + '" AND type == "XCUIElementTypeIcon"')) { if (await e.isDisplayed()) { ic = e; break; } }
      if (!ic) { await d.execute('mobile: swipe', { direction: i < 5 ? 'left' : 'right' }); await pause(700); }
    }
    if (ic) await ic.click();
  } else if (how === 'switcher') { // перемикач застосунків: свайп від нижнього краю з утриманням, дотик по картці
    const win = await d.getWindowSize();
    await d.execute('mobile: dragFromToForDuration', { duration: 1.0, fromX: Math.round(win.width / 2), fromY: win.height - 3, toX: Math.round(win.width / 2), toY: Math.round(win.height * 0.55) });
    await pause(1200);
    await d.execute('mobile: tap', { x: Math.round(win.width / 2), y: Math.round(win.height * 0.4) });
  } else await d.execute('mobile: activateApp', { bundleId: 'com.apple.webapp' });
  await pause(300);
  await L.toWeb(d);
}
const kbState = async d => { await L.toWeb(d); return d.execute(() => { const vv = window.visualViewport; return { vvH: Math.round(vv.height), innerH: window.innerHeight, kbOpen: document.body.classList.contains('kb-open') || document.documentElement.classList.contains('kb-sheet'), active: document.activeElement && document.activeElement.id, hasFocus: document.hasFocus(), vis: document.visibilityState }; }); };

async function main(){
  const dev = L.pickDevice(process.env.SIM_IPHONE || 'iPhone 16 Pro Max');
  L.bootSim(dev); L.ensureSimClip(dev);
  await L.startServers('/tmp/kr-logs');
  const d = await L.openSession(dev, 'PORTRAIT');
  const res = { variant: VARIANT, device: dev.name + ' ' + dev.runtime, trials: [] };
  try {
    try { await L.launchPwa(d); } catch (e) { await pause(2000); await L.launchPwa(d); }
    await L.loadApp(d);
    const map = await L.calibrate(d);
    await L.toWeb(d);
    if (VARIANT === 'skip') await d.execute(() => { window.__kbResumeSkip = true; });
    if (process.env.SIM_APPVARIANT) await d.execute(v => { setVariant('kb-resume', v); }, process.env.SIM_APPVARIANT); // справжній перемикач застосунку (Rev 2.32.434): control | proxy-tap | ro-tap; hasFocus після повернення на симуляторі true, тож усі мають бути ідентичні
    if (process.env.SIM_NATIVE) await d.execute(() => { window.__kbResumeNative = true; });
    if (process.env.SIM_EARLY) await d.execute(() => { window.__kbLiftEarly = true; });
    if (process.env.SIM_LAYOUT) await d.execute(() => { window.__kbLayoutLift = true; });
    if (process.env.SIM_LABEL) await d.execute(() => { window.__kbLabelMode = true; });
    if (process.env.SIM_PRELIFT) await d.execute(() => { window.__kbPreLift = true; });
    await d.execute(() => { document.addEventListener('focusin', e => { window.__focusinAt = performance.now(); }, true); });
    if (process.env.SIM_FAKEFOCUS) await d.execute(() => { window.__realHasFocus = document.hasFocus.bind(document); document.hasFocus = () => false; }); // імітація «вікно ще не активне»: лише змінює відповідь hasFocus() для коду застосунку, вікно iOS лишається активним
    await d.execute(() => { // хронологія фокуса вікна навколо повернення (власні слухачі: самописець у симуляторі може бути вимкнений)
      window.__wl = [];
      const log = (n) => window.__wl.push([n, Math.round(performance.now()), document.hasFocus(), document.visibilityState]);
      window.addEventListener('blur', () => log('win-blur')); window.addEventListener('focus', () => log('win-focus'));
      document.addEventListener('visibilitychange', () => log('vis-' + document.visibilityState)); window.addEventListener('pageshow', () => log('pageshow'));
    });
    await d.execute(() => {
      window.__tl = [];
      ['touchstart', 'touchend'].forEach(ev => {
        document.addEventListener(ev, e => { window.__tl.push({ ev, at: Math.round(performance.now()), hasFocus: document.hasFocus(), vis: document.visibilityState, target: (e.target && (e.target.id || e.target.tagName)) || '' }); }, { capture: true, passive: true }); // capture на document реєструємо ПІСЛЯ застосунку: бачимо hasFocus у момент події
        window.addEventListener(ev, e => { const last = window.__tl[window.__tl.length - 1]; if (last && last.ev === ev) last.prevented = e.defaultPrevented; }, { passive: true }); // бульбашкова фаза: після всіх capture-обробників застосунку
      });
    });
    for (let k = 0; k < TRIALS; k++) {
      const tr = { k };
      await L.toWeb(d);
      await d.execute(() => { try { closeCardDebtEditor(); } catch (e) {} });
      await d.execute(() => { const dr = document.getElementById('card-debt-drawer'); if (dr) dr.style.bottom = ''; window.__kbLayoutLiftEl = null; });
      await pause(900);
      await d.execute(() => { switchTab('accounting'); openCardDebtEditor(0); });
      await pause(1200);
      await L.tapSelector(d, map, FIELD);      // клавіатура відкрита, фокус у полі
      await pause(1500);
      tr.before = await kbState(d);
      await d.execute(() => { window.__recMark0 = (typeof recBuf !== 'undefined') ? recBuf.length : 0; });
      await d.execute(() => { window.__wl.length = 0; });
      await resume(d, Number(process.env.SIM_AWAY || 2500));                   // «додому» і назад
      await pause(Number(process.env.SIM_AFTER || 700));
      tr.afterResume = await kbState(d);
      tr.winTimeline = await d.execute(() => window.__wl.slice());
      tr.resumeEvents = await d.execute(() => (typeof recBuf !== 'undefined' ? recBuf.slice(window.__recMark0 || 0) : []).filter(e => /^(kb-win-blur|kb-win-focus|visibilitychange|kb-bg-reset|focusout|pageshow|pagehide)$/.test(e.type)).map(e => [e.type, e.hasFocus != null ? e.hasFocus : null, e.visibility || null]).slice(0, 14));
      await d.execute(() => { window.__tl.length = 0; if (typeof recBuf !== 'undefined') window.__recMark = recBuf.length; });
      await d.execute(() => { const dr = document.getElementById('card-debt-drawer'); if (dr) dr.style.bottom = ''; window.__kbLayoutLiftEl = null; }); // після повернення шторка знову в спокої (клавіатура закрита)
      await d.execute(() => { window.__fr = []; const t0 = performance.now(); let on = true; window.__frStop = () => { on = false; }; const dr = document.getElementById('card-debt-drawer'); (function f(){ if (!on) return; const vv = window.visualViewport, r = dr.getBoundingClientRect(); window.__fr.push([Math.round(performance.now() - t0), Math.round((r.top - vv.offsetTop) * 10) / 10, Math.round(vv.offsetTop), Math.round(vv.height)]); requestAnimationFrame(f); })(); });
      await L.tapSelector(d, map, FIELD);      // перший дотик після повернення
      await pause(1600);
      tr.frames = await d.execute(() => { window.__frStop(); const fr = window.__fr; const tops = fr.map(f => f[1]); let jump = 0; for (let i = 1; i < tops.length; i++) jump = Math.max(jump, Math.abs(tops[i] - tops[i - 1])); const t0f = window.__fr.length ? 0 : 0; const mv = fr.find(f => Math.abs(f[1] - tops[0]) >= 2); const fa = window.__focusinAt, base = window.__frT0; window.__jump = Math.round(jump); window.__moveAt = mv ? mv[0] : null; const ys = fr.filter(f => f[3] < 600); const settled = ys.length ? ys[ys.length - 1][1] : tops[tops.length - 1]; return { n: fr.length, topStart: tops[0], topEnd: tops[tops.length - 1], maxVvTop: Math.max(...fr.map(f => f[2])), range: Math.round((Math.max(...tops) - Math.min(...tops)) * 10) / 10, jump: Math.round(jump), series: fr.filter((_, i) => i % 3 === 0).slice(0, 60).map(f => f[0] + ':' + f[1] + ':' + f[2]), moveAtMs: mv ? mv[0] : null, early: window.__kbEarlyInfo || window.__kbPreInfo || null }; });
      tr.first = await kbState(d);
      tr.tl1 = await d.execute(() => window.__tl.slice());
      tr.kb1 = tr.first.vvH < tr.first.innerH - 100;
      tr.events = await d.execute(() => (typeof recBuf !== 'undefined' ? recBuf.slice(window.__recMark || 0) : []).filter(e => /^(kb-win-blur|kb-win-focus|focusin|focusout|kb-vv-resize|switch-miss|switch-intercept|intercept-miss|visibilitychange|kb-bg-reset|sheet-open)$/.test(e.type)).map(e => [e.type, e.hasFocus != null ? e.hasFocus : null, e.visibility || null]).slice(0, 14));
      if (k === 0) await L.shot(d, path.join(OUT, 't0-after-first-tap'));
      if (!tr.kb1) {                           // другий дотик (як у звіті)
        await d.execute(() => { window.__tl.length = 0; });
        await L.tapSelector(d, map, FIELD); await pause(1600);
        tr.second = await kbState(d); tr.kb2 = tr.second.vvH < tr.second.innerH - 100;
        tr.tl2 = await d.execute(() => window.__tl.slice());
      }
      res.trials.push(tr);
      console.log('TRIAL ' + JSON.stringify(tr));
    }
  } finally { try { await d.deleteSession(); } catch (e) {} L.killChildren(); }
  const n1 = res.trials.filter(t => t.kb1).length, n2 = res.trials.filter(t => t.kb2).length;
  console.log('RESULT ' + JSON.stringify({ variant: VARIANT, n: res.trials.length, keyboardOnFirstTap: n1, keyboardOnlyOnSecond: n2, neither: res.trials.length - n1 - n2 }));
}
main().catch(e => { console.error(e); L.killChildren(); process.exit(2); });
