// BUG-SUGGEST (Rev 2.32.403+): підказка назви витрати має вибиратися з першого дотику, коли клавіатура відкрита.
// Реальні дотики на симуляторі (Appium + XCUITest, PWA з головного екрана; мок хмари, жодної робочої бази). Запуск: node e2e/ios/suggest.mjs [--trials 6]
// Для порівняння ревізій: скрипт і lib.mjs копіюються в git worktree потрібної ревізії (див. docs/reports/BUG-SUGGEST.md); результат — у stdout (JSON-рядок RESULT).
import * as L from './lib.mjs';

const argv = process.argv.slice(2);
const TRIALS = Number(argv.indexOf('--trials') !== -1 ? argv[argv.indexOf('--trials') + 1] : 6);
const pause = ms => new Promise(r => setTimeout(r, ms));

async function main(){
  const dev = L.pickDevice(process.env.SIM_IPHONE || 'iPhone 16 Pro Max');
  L.bootSim(dev);
  L.ensureSimClip(dev);
  await L.startServers('/tmp/sim-suggest');
  const d = await L.openSession(dev, 'PORTRAIT');
  const out = { version: L.appVersion(), trials: [] };
  try{
    await L.launchPwa(d);
    await L.loadApp(d);
    const map = await L.calibrate(d);
    await L.toWeb(d);
    if(process.env.SIM_FIXTURE){ await d.execute(u => { location.replace(u); }, L.ORIGIN + '/index.html?fixture=' + process.env.SIM_FIXTURE); await pause(4000); await L.toWeb(d); await d.waitUntil(() => d.execute(() => !!(window.MockCloud && typeof cloudSession !== 'undefined' && cloudSession && document.querySelector('.tabbar-glass'))), { timeout: 40000 }); await L.applyKbMode(d); }
    await d.execute(() => { switchTab('vytraty'); });
    await pause(800);
    if(process.env.SIM_SWIPE){ // справжні свайпи вгору/вниз по вмісту: таббар зменшується/повертається, як у користувача перед введенням
      await L.toNative(d);
      for(let i = 0; i < Number(process.env.SIM_SWIPE); i++){ await d.execute('mobile: swipe', { direction: 'up' }); await pause(500); }
      for(let i = 0; i < Number(process.env.SIM_SWIPE); i++){ await d.execute('mobile: swipe', { direction: 'down' }); await pause(500); }
      await L.toWeb(d); await d.execute(() => { document.getElementById('main-col').scrollTop = 0; }); await pause(500);
    }
    await L.recorderStart(d);
    await d.execute(() => { window.__ids = []; ['touchstart', 'touchend'].forEach(ev => document.addEventListener(ev, e => { const t = (e.changedTouches || [])[0]; window.__ids.push(ev[5] + ':' + (t ? t.identifier : '-')); }, true)); });
    for(let k = 0; k < TRIALS; k++){
      await L.toWeb(d);
      // чистий стан: поле порожнє, фокусу немає
      await d.execute(() => { const f = document.getElementById('expfielda7'); f.blur(); f.value = ''; try{ hideNameSuggestions(); }catch(e){} });
      await pause(600);
      await L.tapSelector(d, map, '#expfielda7'); // справжній дотик: клавіатура відкривається
      await pause(1200);
      await d.execute(() => { window.__pos = []; const t0 = performance.now(); (function f(){ const it = document.querySelector('#name-suggest-list.show .name-suggest-item'); window.__pos.push([Math.round(performance.now() - t0), it ? Math.round(it.getBoundingClientRect().top * 10) / 10 : null, Math.round(document.getElementById('main-col').scrollTop)]); if(performance.now() - t0 < 6000) requestAnimationFrame(f); })(); });
      let base = 'qwe';
      if(process.env.SIM_KEYS === '1'){ // справжні клавіші екранної клавіатури: кожен символ — окрема подія input, як у користувача (лише латиниця; запис «qwe …» додається в дані мока)
        await L.toWeb(d);
        await d.execute(() => { nameHistoryMap['qwerty simtest'] = { count: 3, lastDate: localDateISO() }; nameHistoryMap['qwe second'] = { count: 2, lastDate: localDateISO() }; });
        await L.toNative(d);
        if(process.env.SIM_DUMP){ const keys = await d.$$('-ios predicate string:type == "XCUIElementTypeKey"'); const names = []; for(const k of keys.slice(0, 40)) names.push(await k.getAttribute('name')); console.log('KEYS', names.length, names.join('|')); }
        for(const ch of base){ const key = await d.$('-ios predicate string:name ==[c] "' + ch + '" AND type == "XCUIElementTypeKey"'); await key.click(); await pause(220); }
        await L.toWeb(d);
      }else{
        base = await d.execute(() => { const names = (typeof expenses !== 'undefined' ? expenses : []).map(e => e.name).filter(Boolean); return (names[0] || '').slice(0, 3); });
        await d.execute(b => { const f = document.getElementById('expfielda7'); f.value = b; f.dispatchEvent(new Event('input', { bubbles: true })); }, base);
      }
      const prep = await d.execute(() => ({ typed: document.getElementById('expfielda7').value.length, active: document.activeElement && document.activeElement.id }));
      await pause(Number(process.env.SIM_DELAY || 700));
      const trial = { k: k, typed: prep.typed, active: prep.active, taps: 0, ok: false, ms: [] };
      for(let t = 1; t <= 5 && !trial.ok; t++){
        const has = await d.execute(() => { const it = document.querySelector('#name-suggest-list.show .name-suggest-item'); return !!it; });
        if(!has){ trial.noList = t; break; }
        const hit = await d.execute(() => { const it = document.querySelector('#name-suggest-list.show .name-suggest-item'); const r = it.getBoundingClientRect(); const x = r.left + r.width / 2, y = r.top + r.height / 2; const e = document.elementFromPoint(x, y); const vv = window.visualViewport; return { rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)], vv: [Math.round(vv.offsetTop), Math.round(vv.height)], hit: e ? (e.id || e.className || e.tagName) : null, ok: !!(e && e.closest('.name-suggest-item')) }; });
        if(t === 1) trial.hit = hit;
        const t0 = Date.now();
        await L.tapSelector(d, map, '#name-suggest-list.show .name-suggest-item', null, process.env.SIM_HOLD ? Number(process.env.SIM_HOLD) : 0);
        trial.taps = t;
        await pause(700);
        const st = await d.execute(() => { const f = document.getElementById('expfielda7'); const l = document.getElementById('name-suggest-list'); return { len: f.value.length, shown: !!(l && l.classList.contains('show')), active: document.activeElement && document.activeElement.id }; });
        trial.ms.push(Date.now() - t0);
        if(st.len > prep.typed || !st.shown){ trial.ok = true; trial.after = st; }
      }
      trial.pos = await d.execute(() => { const seen = []; let last = null; window.__pos.forEach(p => { const k = p[1] + '/' + p[2]; if(k !== last){ seen.push(p); last = k; } }); return seen.slice(0, 12); });
      out.trials.push(trial);
    }
    await L.toWeb(d);
    out.ids = await d.execute(() => window.__ids);
    out.events = await d.execute(() => debugEventBuffer.filter(e => /^suggest-/.test(e.type)).slice(-40).map(e => ({ type: e.type, ev: e.ev, ts: e.ts, now: e.now, lag: e.lag })));
  }finally{
    try{ await d.deleteSession(); }catch(e){}
    L.killChildren();
  }
  console.log('RESULT ' + JSON.stringify({ version: out.version, taps: out.trials.map(t => t.noList ? 'нема списку' : (t.ok ? t.taps : '>5')), ids: out.ids, trials: out.trials }));
}
main().catch(e => { console.error(e); L.killChildren(); process.exit(2); });
